import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, Resume, CoverLetter, VALID_ROLES, ROLE_ADMIN
from services.deps import require_admin

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


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return [_user_dict(u) for u in result.scalars().all()]


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
    await db.delete(u)
    await db.commit()
