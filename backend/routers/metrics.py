"""
Success metrics + per-tenant usage (PRD §11, spec Section 7). Admin only.

  GET /api/metrics/summary?days=30[&tenant=<slug>]  → the four Phase-1 targets
  GET /api/metrics/usage?days=30                     → per-tenant usage + AI cost
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User
from services.deps import require_admin
from services.metrics import summary, per_tenant_usage

router = APIRouter(prefix="/api/metrics", tags=["Metrics"])


async def _resolve_tenant(db: AsyncSession, tenant: str | None) -> str | None:
    if not tenant:
        return None
    row = (await db.execute(
        text("select id::text from public.tenants where slug = :s or id::text = :s"),
        {"s": tenant},
    )).first()
    return row[0] if row else tenant  # fall through (no match → empty result set)


@router.get("/summary")
async def metrics_summary(
    days: int = 30,
    tenant: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    tid = await _resolve_tenant(db, tenant)
    data = await summary(db, max(1, min(days, 365)), tid)
    data["targets"] = {
        "completion_rate_pct": 80,
        "time_to_first_resume_sec": "120-180",
        "avg_ats_improvement": 25,
    }
    return data


@router.get("/usage")
async def metrics_usage(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    return {"window_days": days, "tenants": await per_tenant_usage(db, max(1, min(days, 365)))}
