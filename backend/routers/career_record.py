"""
EduBridge career record (spec Section 4) — the source of the GREEN, verified data
used to auto-fill a resume. Assessment fields (jree_score/personality/behavioural)
are nullable placeholders for Phase 2/3.

  GET /api/career-record   → the current user's record (or null)
  PUT /api/career-record   → create/update the current user's record
"""
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User
from services.deps import get_current_user
from services.roles import get_career_record

router = APIRouter(prefix="/api/career-record", tags=["Career Record"])


class CareerRecordBody(BaseModel):
    education: list = []
    edubridge_training: list = []
    certificates: list = []
    college: str | None = None
    course: str | None = None


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
    await db.execute(text(
        """insert into public.career_record
             (user_id, education, edubridge_training, certificates, college, course)
           values (:uid, cast(:education as jsonb), cast(:training as jsonb),
                   cast(:certs as jsonb), :college, :course)
           on conflict (user_id) do update set
             education = excluded.education,
             edubridge_training = excluded.edubridge_training,
             certificates = excluded.certificates,
             college = excluded.college,
             course = excluded.course,
             updated_at = now()"""
    ), {
        "uid": str(user.id),
        "education": json.dumps(body.education or []),
        "training": json.dumps(body.edubridge_training or []),
        "certs": json.dumps(body.certificates or []),
        "college": body.college,
        "course": body.course,
    })
    await db.commit()
    rec = await get_career_record(db, user.id)
    if rec:
        for k in ("education", "edubridge_training", "certificates"):
            rec[k] = list(rec.get(k) or [])
    return {"career_record": rec}
