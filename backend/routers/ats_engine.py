"""
ATS Engine API — upload/parse a resume, paste a JD, get a full AI-driven
ATS dashboard (scores + explanations + suggestions), and generate a
JD-tailored resume. See services/ats_engine/ for the pipeline itself.

/analyze-resume runs the same pipeline against a resume the candidate
already saved in their Resume Builder (Career Vault) — no re-pasting text.
"""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import AtsReport, Resume, User
from services.ats_engine import (
    ResumeParser, JobParser, ATSService, RecommendationEngine, ResumeImprover,
)
from services.deps import get_current_user
from services import roles as roles_service
from services.usage import log_usage_event, tenant_of

router = APIRouter(prefix="/api/ats/v2", tags=["ATS Engine"])

_RESUME_LOADERS = (
    selectinload(Resume.experiences), selectinload(Resume.education),
    selectinload(Resume.skills), selectinload(Resume.projects),
    selectinload(Resume.certifications), selectinload(Resume.languages),
)


def _resume_to_content(r: Resume) -> dict:
    """Same shape routers/resumes.py._to_content builds — kept local to avoid
    a router-to-router import; both read the same ORM relationships. Phase 3:
    now includes achievements/languages/interests too — these were being
    silently dropped before (languages was even eagerly loaded and then
    never read), which meant profile-completeness and the languages ATS
    category always read empty for saved resumes regardless of actual data."""
    return {
        "personalInfo": r.personal_info or {},
        "summary": r.summary or "",
        "experience": [
            {"position": e.position or "", "company": e.company or "", "startDate": e.start_date or "",
             "endDate": e.end_date or "", "current": bool(e.is_current), "bullets": e.bullets or []}
            for e in r.experiences
        ],
        "education": [
            {"degree": e.degree or "", "institution": e.institution or "",
             "startDate": e.start_date or "", "endDate": e.end_date or ""}
            for e in r.education
        ],
        "skills": [{"name": s.name, "level": s.level} for s in r.skills],
        "projects": [{"name": p.name or "", "technologies": p.technologies or "", "description": p.description or ""} for p in r.projects],
        "certifications": [{"name": c.name or ""} for c in r.certifications],
        "languages": [{"name": lang.name, "proficiency": lang.proficiency or ""} for lang in r.languages],
        "achievements": list(r.achievements or []),
        "interests": list(r.interests or []),
    }


async def _job_from_role(db: AsyncSession, target_role: str) -> dict | None:
    """Resolve a target role (slug or free text) against the role_profiles
    library into a synthetic job dict the ATS pipeline can score against."""
    target_role = (target_role or "").strip()
    if not target_role:
        return None
    role = await roles_service.get_role(db, target_role)  # try as a slug first
    if not role:
        matches = await roles_service.list_roles(db, search=target_role, limit=1)
        if matches:
            role = await roles_service.get_role(db, matches[0]["slug"])
    if not role:
        # No match in the role library — still let the candidate proceed with
        # just a job title, honestly labeled as unscored on requirement fields.
        return {
            "job_title": target_role, "required_skills": [], "preferred_skills": [],
            "responsibilities": [], "min_experience_years": None, "min_education": None,
            "industry": None, "keywords": [], "technologies": [], "certifications": [],
            "raw_text": target_role, "parsed_by": "role_library_unmatched",
        }
    skills = role.get("skills") or []
    return {
        "job_title": role["canonical_title"], "required_skills": skills, "preferred_skills": [],
        "responsibilities": [], "min_experience_years": None, "min_education": role.get("education"),
        "industry": role.get("industry"), "keywords": skills, "technologies": [],
        "certifications": [c["name"] for c in (role.get("recommended_certifications") or [])],
        "raw_text": f"{role['canonical_title']} {' '.join(skills)}", "parsed_by": "role_library",
    }

MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
_ALLOWED_EXT = (".pdf", ".docx", ".doc", ".txt")


@router.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Extract raw text from an uploaded resume file (does not parse/score it yet)."""
    name = (file.filename or "").lower()
    if not name.endswith(_ALLOWED_EXT):
        raise HTTPException(status_code=400, detail="Please upload a PDF, DOCX, or TXT file.")

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large — please upload a resume under 5 MB.")

    try:
        text = ResumeParser.extract_text(file.filename, data)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read this file — try exporting it as a PDF or DOCX and re-uploading.")

    if not text.strip():
        raise HTTPException(status_code=400, detail="No text could be extracted — this may be a scanned/image-only PDF.")

    return {"text": text, "filename": file.filename}


class AnalyzeRequest(BaseModel):
    resume_text: str
    job_description: str


@router.post("/analyze")
async def analyze(
    req: AnalyzeRequest,
    user: User = Depends(get_current_user),
):
    """Full pipeline: parse both sides, score every dimension, generate suggestions.
    Ephemeral (paste-text) path — no resume_id, so nothing is persisted here;
    the canonical, persisted path is /analyze-resume (spec Section 21)."""
    if not req.resume_text.strip() or not req.job_description.strip():
        raise HTTPException(status_code=400, detail="Both resume text and a job description are required.")

    resume, job = await asyncio.gather(
        ResumeParser.parse(req.resume_text),
        JobParser.parse(req.job_description),
    )
    ats_result = await ATSService.analyze(resume, job)

    missing_keywords = ats_result["scores"]["keyword_match"].get("missing", [])
    suggestions = await RecommendationEngine.suggest(resume, job, missing_keywords)

    await log_usage_event(str(user.id), "ats_analysis", tenant_id=tenant_of(user),
                          metadata={"score": ats_result["overall_score"], "mode": "paste_text"})
    if suggestions.get("generated_by") == "ai":
        await log_usage_event(str(user.id), "ats_deep_analysis", tenant_id=tenant_of(user),
                              metadata={"mode": "paste_text"})

    return {
        "resume": resume,
        "job": job,
        "ats": ats_result,
        "suggestions": suggestions,
        "analysis_mode": "job_description",
    }


class AnalyzeResumeRequest(BaseModel):
    resume_id: str
    target_role: Optional[str] = None     # role_profiles slug or free-text title
    job_description: Optional[str] = None  # pasted JD text — takes priority over target_role


def _report_summary(r: AtsReport) -> dict:
    return {
        "id": str(r.id),
        "job_title": r.job_title,
        "target_role": r.target_role,
        "analysis_mode": r.analysis_mode,
        "score": r.score,
        "score_confidence": r.score_confidence,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.post("/analyze-resume")
async def analyze_saved_resume(
    req: AnalyzeResumeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The canonical Phase 3 ATS endpoint (spec Section 21) — full pipeline
    against a resume the candidate already saved in their Resume Builder.
    resume_id is the ONLY source of resume content: the backend retrieves it
    securely and never accepts arbitrary resume content from the client, so
    there's nothing to re-paste and nothing to spoof."""
    try:
        rid = uuid.UUID(req.resume_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Ownership check — explicit, never trusts a client-supplied user_id
    # (there isn't one in the request; user comes only from the verified
    # bearer token via get_current_user, per spec Section 27).
    owned = await db.execute(
        select(Resume).where(Resume.id == rid).options(*_RESUME_LOADERS)
    )
    resume_row = owned.scalar_one_or_none()
    if not resume_row or (resume_row.user_id != user.id and not getattr(user, "is_admin", False)):
        raise HTTPException(status_code=404, detail="Resume not found")

    job_description = (req.job_description or "").strip()
    analysis_mode = "job_description" if job_description else "role_based"
    if job_description:
        job = await JobParser.parse(job_description)
    else:
        job = await _job_from_role(db, req.target_role or "")
        if job is None:
            raise HTTPException(status_code=400, detail="Provide a target role or a job description to analyze against.")

    resume = ResumeParser.from_content(_resume_to_content(resume_row))
    ats_result = await ATSService.analyze(resume, job)

    missing_keywords = ats_result["scores"]["keyword_match"].get("missing", [])
    suggestions = await RecommendationEngine.suggest(resume, job, missing_keywords)

    tenant_id = tenant_of(user)
    report = AtsReport(
        resume_id=rid, user_id=user.id, tenant_id=tenant_id,
        job_title=job.get("job_title"),
        job_description=job_description or None,
        target_role=req.target_role if analysis_mode == "role_based" else None,
        analysis_mode=analysis_mode,
        score=ats_result["overall_score"],
        score_confidence=ats_result["score_confidence"],
        matched_keywords=ats_result["scores"]["keyword_match"].get("found", []),
        missing_keywords=missing_keywords,
        suggestions=suggestions.get("general_tips", []),
        score_breakdown={k: v["pct"] for k, v in ats_result["scores"].items()},
        category_scores=ats_result["category_analysis"],
        category_completeness={k: v["completeness"] for k, v in ats_result["category_analysis"].items()},
        category_confidence={k: v["confidence"] for k, v in ats_result["category_analysis"].items()},
        overall_confidence=ats_result["score_confidence"],
        critical_keywords=ats_result["keyword_analysis"]["critical"],
        important_keywords=ats_result["keyword_analysis"]["important"],
        partial_matches=ats_result["skills_breakdown"]["partial"],
        formatting_analysis=ats_result["category_analysis"].get("formatting"),
        profile_completeness=ats_result["profile_completeness"],
        recommendations=ats_result["recommendations_prioritized"],
        candidate_questions=ats_result["candidate_questions"],
        analysis_version="v2-phase3",
    )
    db.add(report)
    resume_row.ats_score = ats_result["overall_score"]
    resume_row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(report)

    # score trend vs. the immediately preceding report for this resume (same
    # job_title/target_role, so "before/after" comparisons are meaningful —
    # see spec Section 18/20)
    prev = (await db.execute(
        select(AtsReport)
        .where(AtsReport.resume_id == rid, AtsReport.id != report.id)
        .order_by(AtsReport.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    score_delta = (ats_result["overall_score"] - prev.score) if prev else None

    await log_usage_event(str(user.id), "ats_analysis", tenant_id=tenant_id,
                          metadata={"resume_id": req.resume_id, "score": ats_result["overall_score"], "mode": analysis_mode})
    if suggestions.get("generated_by") == "ai":
        await log_usage_event(str(user.id), "ats_deep_analysis", tenant_id=tenant_id,
                              metadata={"resume_id": req.resume_id})

    return {
        "resume": resume, "job": job, "ats": ats_result, "suggestions": suggestions,
        "resume_id": req.resume_id, "report_id": str(report.id),
        "analysis_mode": analysis_mode,
        "previous_score": prev.score if prev else None,
        "score_delta": score_delta,
    }


@router.get("/history/{resume_id}")
async def ats_history(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """ATS History (spec Section 20) — every report for this resume, newest
    first, plus a simple trend summary. Ownership-checked the same way as
    analyze-resume; never trusts a client-supplied user_id."""
    try:
        rid = uuid.UUID(resume_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Resume not found")

    owned = await db.execute(select(Resume.id, Resume.user_id).where(Resume.id == rid))
    row = owned.first()
    if not row or (row.user_id != user.id and not getattr(user, "is_admin", False)):
        raise HTTPException(status_code=404, detail="Resume not found")

    reports = (await db.execute(
        select(AtsReport).where(AtsReport.resume_id == rid).order_by(AtsReport.created_at.desc())
    )).scalars().all()

    summaries = [_report_summary(r) for r in reports]
    trend = None
    if len(summaries) >= 2:
        trend = {
            "first_score": summaries[-1]["score"], "latest_score": summaries[0]["score"],
            "improvement": summaries[0]["score"] - summaries[-1]["score"],
        }
    return {"reports": summaries, "trend": trend}


@router.get("/report/{report_id}")
async def get_ats_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Full detail for one persisted report (used by the re-scan / before-after view)."""
    try:
        pid = uuid.UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Report not found")
    report = (await db.execute(select(AtsReport).where(AtsReport.id == pid))).scalar_one_or_none()
    if not report or (report.user_id != user.id and not getattr(user, "is_admin", False)):
        raise HTTPException(status_code=404, detail="Report not found")
    return {
        "id": str(report.id), "resume_id": str(report.resume_id),
        "job_title": report.job_title, "job_description": report.job_description,
        "target_role": report.target_role, "analysis_mode": report.analysis_mode,
        "score": report.score, "score_confidence": report.score_confidence,
        "matched_keywords": report.matched_keywords, "missing_keywords": report.missing_keywords,
        "suggestions": report.suggestions, "score_breakdown": report.score_breakdown,
        "category_scores": report.category_scores, "category_completeness": report.category_completeness,
        "category_confidence": report.category_confidence, "overall_confidence": report.overall_confidence,
        "critical_keywords": report.critical_keywords, "important_keywords": report.important_keywords,
        "partial_matches": report.partial_matches, "formatting_analysis": report.formatting_analysis,
        "profile_completeness": report.profile_completeness, "recommendations": report.recommendations,
        "candidate_questions": report.candidate_questions, "analysis_version": report.analysis_version,
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }


class TailorRequest(BaseModel):
    resume_text: str
    job_description: str


@router.post("/tailor")
async def tailor_resume(
    req: TailorRequest,
    user: User = Depends(get_current_user),
):
    """Generate a JD-tailored resume (same facts, rewritten emphasis)."""
    if not req.resume_text.strip() or not req.job_description.strip():
        raise HTTPException(status_code=400, detail="Both resume text and a job description are required.")

    resume, job = await asyncio.gather(
        ResumeParser.parse(req.resume_text),
        JobParser.parse(req.job_description),
    )
    tailored = await ResumeImprover.tailor(resume, job)

    await log_usage_event(str(user.id), "ats_tailoring", tenant_id=tenant_of(user), metadata={})
    return {"original": resume, "tailored": tailored}
