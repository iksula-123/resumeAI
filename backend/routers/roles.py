"""
Role library + pre-fill USP (Milestone C, spec Section 5.C).

  GET  /api/roles                 → role picker feed (top roles by demand, searchable)
  GET  /api/roles/{slug}          → one role profile
  POST /api/roles/{slug}/prefill  → the candidate-confirmed build flow (green/blue/grey)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User
from services.deps import get_current_user
from services.roles import (
    list_roles, get_role, get_career_record, build_prefill,
)
from services.usage import log_usage_event, tenant_of

router = APIRouter(prefix="/api/roles", tags=["Roles"])


@router.get("")
@router.get("/")
async def api_list_roles(
    search: str = "",
    limit: int = 30,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"roles": await list_roles(db, search, limit)}


@router.get("/{slug}")
async def api_get_role(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role = await get_role(db, slug)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.post("/{slug}/prefill")
async def api_prefill(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    role = await get_role(db, slug)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    career = await get_career_record(db, user.id)
    result = await build_prefill(db, role, career)

    # Per-tenant usage attribution (spec Section 2/7)
    await log_usage_event(
        str(user.id), "role_prefill", ai_provider="gemini",
        tenant_id=tenant_of(user), metadata={"role": slug},
    )
    return result
