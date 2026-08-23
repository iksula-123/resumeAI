import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import AtsReport, Resume, User
from services.ats import score_resume, analyze_resume_prioritized
from services.deps import get_current_user
from services.usage import log_usage_event, tenant_of

router = APIRouter(prefix="/api/ats", tags=["ATS"])


class AtsRequest(BaseModel):
    resume_content: dict
    job_description: str
    resume_id: Optional[str] = None       # if provided & owned, the scan is saved
    job_title: Optional[str] = None


class AtsAnalyzeRequest(BaseModel):
    content: dict
    role_slug: Optional[str] = None       # target role → India-tuned keyword coverage
    resume_id: Optional[str] = None       # if provided & owned, headline score is synced


def _report_dict(r: AtsReport) -> dict:
    return {
        "id": str(r.id),
        "resume_id": str(r.resume_id),
        "job_title": r.job_title,
        "job_description": r.job_description,
        "score": r.score,
        "matched": r.matched_keywords or [],
        "missing": r.missing_keywords or [],
        "suggestions": r.suggestions or [],
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.post("/score")
async def ats_score(
    req: AtsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = score_resume(req.resume_content, req.job_description)

    # Persist a report only when tied to a resume the user owns
    saved_id = None
    if req.resume_id:
        try:
            rid = uuid.UUID(req.resume_id)
        except ValueError:
            rid = None
        if rid:
            owned = await db.execute(select(Resume).where(Resume.id == rid))
            resume = owned.scalar_one_or_none()
            if resume and resume.user_id == user.id:
                report = AtsReport(
                    resume_id=rid,
                    user_id=user.id,
                    job_title=req.job_title,
                    job_description=req.job_description,
                    score=result["score"],
                    matched_keywords=result["matched"],
                    missing_keywords=result["missing"],
                    suggestions=result["suggestions"],
                )
                db.add(report)
                # ATS consolidation Phase 4: Resume.ats_score = canonical
                # Resume ATS Health only (mode_orchestrator.resume_health_mode(),
                # written by /api/ats/v2/check and /analyze-editor). This
                # legacy endpoint's own score_resume() formula is unchanged
                # and still saved on its own AtsReport row — it just no
                # longer overwrites the resume's shared headline score with
                # a different, non-canonical number.
                await db.commit()
                await db.refresh(report)
                saved_id = str(report.id)

    from services.webhooks import dispatch
    dispatch(user.id, "ats.completed", {"score": result["score"], "resume_id": req.resume_id})
    return {**result, "report_id": saved_id, "saved": saved_id is not None}


@router.post("/analyze")
async def ats_analyze(
    req: AtsAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """India-tuned ATS analysis on the candidate's OWN content, with prioritised fixes."""
    role_keywords, role_title = None, ""
    if req.role_slug:
        row = (await db.execute(text(
            "select canonical_title, skills from public.role_profiles where slug = :s"
        ), {"s": req.role_slug})).mappings().first()
        if row:
            role_title = row["canonical_title"]
            role_keywords = list(row["skills"]) if row["skills"] else None

    result = analyze_resume_prioritized(req.content, role_keywords, role_title)

    # ATS consolidation Phase 4: this legacy endpoint no longer syncs the
    # resume's headline ats_score — that field is now written only from the
    # canonical Resume ATS Health (mode_orchestrator.resume_health_mode(),
    # via /api/ats/v2/check and /analyze-editor), never from this separate
    # India-tuned formula. The endpoint's own result/formula is unchanged.

    await log_usage_event(str(user.id), "ats_analyze", tenant_id=tenant_of(user),
                          metadata={"role": req.role_slug, "score": result["score"]})
    return result


@router.get("/reports")
async def list_reports(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """All ATS scans for the current user, newest first."""
    result = await db.execute(
        select(AtsReport).where(AtsReport.user_id == user.id).order_by(AtsReport.created_at.desc())
    )
    return [_report_dict(r) for r in result.scalars().all()]


@router.get("/reports/{resume_id}")
async def reports_for_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """ATS scan history for one resume, newest first."""
    try:
        rid = uuid.UUID(resume_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Resume not found")
    result = await db.execute(
        select(AtsReport)
        .where(AtsReport.resume_id == rid, AtsReport.user_id == user.id)
        .order_by(AtsReport.created_at.desc())
    )
    return [_report_dict(r) for r in result.scalars().all()]


@router.delete("/reports/{report_id}", status_code=204)
async def delete_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        rid = uuid.UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Report not found")
    result = await db.execute(select(AtsReport).where(AtsReport.id == rid))
    report = result.scalar_one_or_none()
    if not report or (report.user_id != user.id and not user.is_admin):
        raise HTTPException(status_code=404, detail="Report not found")
    await db.delete(report)
    await db.commit()
