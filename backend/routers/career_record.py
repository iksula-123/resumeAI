"""
EduBridge career record (spec Section 4) — the source of the GREEN, verified data
used to auto-fill a resume. Assessment fields (jree_score/personality/behavioural)
are nullable placeholders for Phase 2/3.

  GET /api/career-record   → the current user's record (or null)
  PUT /api/career-record   → create/update the current user's record
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User
from services.deps import get_current_user, require_admin
from services.roles import get_career_record
from services.career import upsert_career_record, ingest_by_email

router = APIRouter(prefix="/api/career-record", tags=["Career Record"])


class CareerRecordBody(BaseModel):
    education: list = []
    edubridge_training: list = []
    certificates: list = []
    college: str | None = None
    course: str | None = None


class IngestRecord(CareerRecordBody):
    email: str            # learner identity from the LMS / college DB


class BulkIngest(BaseModel):
    records: list[IngestRecord]


@router.get("")
@router.get("/")
async def get_record(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rec = await get_career_record(db, user.id)
    # normalize jsonb columns to plain lists for the client
    if rec:
        for k in ("education", "edubridge_training", "certificates"):
            rec[k] = list(rec.get(k) or [])
    return {"career_record": rec}


@router.put("")
@router.put("/")
async def upsert_record(
    body: CareerRecordBody,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await upsert_career_record(db, user.id, body.model_dump())
    await db.commit()
    rec = await get_career_record(db, user.id)
    if rec:
        for k in ("education", "edubridge_training", "certificates"):
            rec[k] = list(rec.get(k) or [])
    return {"career_record": rec}


# ── ingestion for EduBridge LMS / college DB (admin/service only) ─────────────
@router.post("/ingest")
async def ingest_one(
    record: IngestRecord,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Push one learner's verified record, keyed by email. Admin/service only."""
    result = await ingest_by_email(db, record.model_dump())
    await db.commit()
    return result


@router.post("/ingest/bulk")
async def ingest_bulk(
    body: BulkIngest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Bulk push (e.g. a college DB batch). Reports matched vs unmatched emails."""
    ingested, unmatched = 0, []
    for rec in body.records:
        res = await ingest_by_email(db, rec.model_dump())
        if res["matched"]:
            ingested += 1
        else:
            unmatched.append(res["email"])
    await db.commit()
    return {"ingested": ingested, "unmatched_count": len(unmatched), "unmatched_emails": unmatched}
