"""
Job Application Tracker — CRUD over the user's application pipeline.

All endpoints are auth-scoped to the current user (ownership enforced), matching
the rest of the API. Statuses: applied | interview | offer | rejected | joined.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import JobApplication, User
from services.deps import get_current_user

router = APIRouter(prefix="/api/applications", tags=["Job Tracker"])

VALID_STATUS = {"applied", "interview", "offer", "rejected", "joined"}


class ApplicationCreate(BaseModel):
    company: str
    position: str
    status: str = "applied"
    location: Optional[str] = None
    job_url: Optional[str] = None
    salary: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    applied_date: Optional[str] = None
    next_action: Optional[str] = None
    next_action_note: Optional[str] = None


class ApplicationUpdate(BaseModel):
    company: Optional[str] = None
    position: Optional[str] = None
    status: Optional[str] = None
    location: Optional[str] = None
    job_url: Optional[str] = None
    salary: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    applied_date: Optional[str] = None
    next_action: Optional[str] = None
    next_action_note: Optional[str] = None


def _to_dict(a: JobApplication) -> dict:
    return {
        "id": str(a.id),
        "company": a.company,
        "position": a.position,
        "status": a.status,
        "location": a.location,
        "job_url": a.job_url,
        "salary": a.salary,
        "source": a.source,
        "notes": a.notes,
        "applied_date": a.applied_date,
        "next_action": a.next_action,
        "next_action_note": a.next_action_note,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


async def _get_owned(db: AsyncSession, app_id: str, user: User) -> JobApplication:
    try:
        aid = uuid.UUID(app_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Application not found")
    res = await db.execute(select(JobApplication).where(JobApplication.id == aid))
    app = res.scalar_one_or_none()
    if not app or (app.user_id != user.id and not user.is_admin):
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@router.get("/")
async def list_applications(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    res = await db.execute(
        select(JobApplication).where(JobApplication.user_id == user.id)
        .order_by(JobApplication.updated_at.desc())
    )
    return [_to_dict(a) for a in res.scalars().all()]


@router.post("/", status_code=201)
async def create_application(body: ApplicationCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    status = body.status if body.status in VALID_STATUS else "applied"
    app = JobApplication(
        user_id=user.id, company=body.company, position=body.position, status=status,
        location=body.location, job_url=body.job_url, salary=body.salary, source=body.source,
        notes=body.notes, applied_date=body.applied_date,
        next_action=body.next_action, next_action_note=body.next_action_note,
    )
    db.add(app)
    await db.commit()
    await db.refresh(app)
    return _to_dict(app)


@router.put("/{app_id}")
async def update_application(app_id: str, body: ApplicationUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    app = await _get_owned(db, app_id, user)
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in VALID_STATUS:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {sorted(VALID_STATUS)}")
    for k, v in data.items():
        setattr(app, k, v)
    app.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(app)
    return _to_dict(app)


@router.delete("/{app_id}", status_code=204)
async def delete_application(app_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    app = await _get_owned(db, app_id, user)
    await db.delete(app)
    await db.commit()
