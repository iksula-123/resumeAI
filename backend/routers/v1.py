"""
Public REST API — v1.

Authenticated with an API key (X-API-Key header), rate-limited per key.
Reuses the resume serializers so responses match the dashboard exactly.
Documented automatically at /docs and /redoc.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Resume, User
from services.apikeys import require_api_key
from routers.resumes import _to_dict, _load_full, _RESUME_LOADERS

router = APIRouter(prefix="/api/v1", tags=["Public API v1"])


@router.get("/me")
async def v1_me(user: User = Depends(require_api_key)):
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "subscription_tier": user.subscription_tier,
    }


@router.get("/resumes")
async def v1_list_resumes(db: AsyncSession = Depends(get_db), user: User = Depends(require_api_key)):
    res = await db.execute(
        select(Resume).where(Resume.user_id == user.id)
        .options(*_RESUME_LOADERS).order_by(Resume.updated_at.desc())
    )
    return {"data": [_to_dict(r) for r in res.scalars().unique().all()]}


@router.get("/resumes/{resume_id}")
async def v1_get_resume(resume_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_api_key)):
    try:
        rid = uuid.UUID(resume_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Resume not found")
    r = await _load_full(db, rid)
    if not r or r.user_id != user.id:
        raise HTTPException(status_code=404, detail="Resume not found")
    return {"data": _to_dict(r)}
