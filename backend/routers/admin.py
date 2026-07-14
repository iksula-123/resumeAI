import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Resume, CoverLetter, JobApplication, AtsReport, AIUsage, AuditLog, VALID_ROLES, ROLE_ADMIN
from services.deps import require_admin
from services.audit import record as audit

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def _user_dict(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "full_name": u.full_name or "",
        "role": u.role,
        "subscription_tier": u.subscription_tier,
        "is_active": u.is_active,
        "last_login": u.last_login.isoformat() if u.last_login else None,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


class RoleUpdate(BaseModel):
    role: str


class ActiveUpdate(BaseModel):
    is_active: bool


@router.get("/stats")
async def stats(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    total_admins = (await db.execute(
        select(func.count()).select_from(User).where(User.role == ROLE_ADMIN)
    )).scalar() or 0
    total_resumes = (await db.execute(select(func.count()).select_from(Resume))).scalar() or 0
    total_cover_letters = (await db.execute(select(func.count()).select_from(CoverLetter))).scalar() or 0
    pro_users = (await db.execute(
        select(func.count()).select_from(User).where(User.subscription_tier != "free")
    )).scalar() or 0

    return {
        "total_users": total_users,
        "total_admins": total_admins,
        "total_resumes": total_resumes,
        "total_cover_letters": total_cover_letters,
        "pro_users": pro_users,
    }


@router.get("/analytics")
async def analytics(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    """Platform + AI-usage analytics for the admin dashboard."""
    async def _count(model, *where):
        q = select(func.count()).select_from(model)
        for w in where:
            q = q.where(w)
        return (await db.execute(q)).scalar() or 0

    total_users = await _count(User)
    total_resumes = await _count(Resume)
    total_apps = await _count(JobApplication)
    total_cover_letters = await _count(CoverLetter)
    total_ats = await _count(AtsReport)

    avg_ats = (await db.execute(select(func.avg(Resume.ats_score)).where(Resume.ats_score.isnot(None)))).scalar()
    avg_ats = round(float(avg_ats), 1) if avg_ats is not None else 0

    # AI usage aggregates
    agg = (await db.execute(select(
        func.coalesce(func.sum(AIUsage.input_tokens), 0),
        func.coalesce(func.sum(AIUsage.output_tokens), 0),
        func.coalesce(func.sum(AIUsage.total_tokens), 0),
        func.coalesce(func.sum(AIUsage.est_cost), 0.0),
        func.count(),
    ))).one()
    input_tokens, output_tokens, total_tokens, est_cost, ai_requests = agg

    # per-feature breakdown
    per_feature_rows = (await db.execute(
        select(AIUsage.feature, func.sum(AIUsage.total_tokens), func.count())
        .group_by(AIUsage.feature).order_by(func.sum(AIUsage.total_tokens).desc())
    )).all()
    per_feature = [{"feature": f, "tokens": int(t or 0), "requests": int(c or 0)} for f, t, c in per_feature_rows]

    # top users by tokens (join email)
    top_rows = (await db.execute(
        select(User.email, func.sum(AIUsage.total_tokens), func.coalesce(func.sum(AIUsage.est_cost), 0.0))
        .join(User, User.id == AIUsage.user_id)
        .group_by(User.email).order_by(func.sum(AIUsage.total_tokens).desc()).limit(5)
    )).all()
    top_users = [{"email": e, "tokens": int(t or 0), "cost": round(float(c or 0), 4)} for e, t, c in top_rows]

    return {
        "totals": {
            "users": total_users, "resumes": total_resumes, "applications": total_apps,
            "cover_letters": total_cover_letters, "ats_reports": total_ats, "avg_ats": avg_ats,
        },
        "ai": {
            "requests": int(ai_requests or 0),
            "input_tokens": int(input_tokens or 0),
            "output_tokens": int(output_tokens or 0),
            "total_tokens": int(total_tokens or 0),
            "est_cost": round(float(est_cost or 0), 4),
            "per_feature": per_feature,
            "top_users": top_users,
        },
    }


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return [_user_dict(u) for u in result.scalars().all()]


@router.get("/audit-logs")
async def audit_logs(
    limit: int = 100,
    action: str | None = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    q = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(min(max(limit, 1), 500))
    if action:
        q = q.where(AuditLog.action == action)
    rows = (await db.execute(q)).scalars().all()
    return [{
        "id": str(r.id),
        "actor_email": r.actor_email,
        "action": r.action,
        "entity_type": r.entity_type,
        "entity_id": r.entity_id,
        "meta": r.meta or {},
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows]


@router.patch("/users/{user_id}/role")
async def update_role(
    user_id: str,
    body: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of {sorted(VALID_ROLES)}")
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found")
    if uid == admin.id and body.role != ROLE_ADMIN:
        raise HTTPException(status_code=400, detail="You cannot demote yourself")

    result = await db.execute(select(User).where(User.id == uid))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.role = body.role
    await db.commit()
    await db.refresh(u)
    audit(actor_id=str(admin.id), actor_email=admin.email, action="admin.role_change",
          entity_type="user", entity_id=str(u.id), meta={"email": u.email, "role": body.role})
    return _user_dict(u)


@router.patch("/users/{user_id}/active")
async def update_active(
    user_id: str,
    body: ActiveUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found")
    if uid == admin.id and not body.is_active:
        raise HTTPException(status_code=400, detail="You cannot disable your own account")

    result = await db.execute(select(User).where(User.id == uid))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.is_active = body.is_active
    await db.commit()
    await db.refresh(u)
    audit(actor_id=str(admin.id), actor_email=admin.email,
          action="admin.enable_user" if body.is_active else "admin.disable_user",
          entity_type="user", entity_id=str(u.id), meta={"email": u.email})
    return _user_dict(u)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found")
    if uid == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    result = await db.execute(select(User).where(User.id == uid))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    email = u.email
    await db.delete(u)
    await db.commit()
    audit(actor_id=str(admin.id), actor_email=admin.email, action="admin.delete_user",
          entity_type="user", entity_id=user_id, meta={"email": email})
