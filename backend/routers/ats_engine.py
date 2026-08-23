"""
ATS Engine API — upload/parse a resume, paste a JD, get a full AI-driven
ATS dashboard (scores + explanations + suggestions), and generate a
JD-tailored resume. See services/ats_engine/ for the pipeline itself.

/analyze-resume runs the same pipeline against a resume the candidate
already saved in their Resume Builder (Career Vault) — no re-pasting text.
"""
import asyncio
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import AtsReport, AtsRecommendation, AtsChangeHistory, Resume, User
from services.ats_engine import (
    ResumeParser, JobParser, ATSService, RecommendationEngine, ResumeImprover,
    ats_intelligence_v2, scoring as ats_scoring, ai_recommendations, apply_fix,
    ats_config, mode_orchestrator,
)
from services.deps import get_current_user
from services import roles as roles_service
from services.usage import log_usage_event, tenant_of

router = APIRouter(prefix="/api/ats/v2", tags=["ATS Engine"])

_RESUME_LOADERS = (
    selectinload(Resume.experiences), selectinload(Resume.education),
    selectinload(Resume.skills), selectinload(Resume.projects),
    selectinload(Resume.certifications), selectinload(Resume.languages),
    selectinload(Resume.custom_sections),
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
        # ATS consolidation Phase 6 — additive: lets callers group reports by
        # which engine actually produced the score before treating any two
        # of them as a "before -> after" trend (score_type is null for the
        # legacy /analyze-resume engine, "resume_health" for /check and
        # /analyze-editor — see models.py::AtsReport.score_type).
        "score_type": r.score_type,
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
        # Phase B (ATS Intelligence 2.0) — records which scoring engine
        # produced this report, independent of analysis_version above (report
        # SHAPE) — see models.py::AtsReport.scoring_engine_version docstring.
        scoring_engine_version=ats_result["scoring_engine_version"],
    )
    db.add(report)
    # ATS consolidation Phase 4: Resume.ats_score = canonical Resume ATS
    # Health only (mode_orchestrator.resume_health_mode(), written by /check
    # and the editor's /analyze-editor). This legacy endpoint keeps working
    # exactly as before for any existing caller — its own formula, score and
    # AtsReport are all unchanged — it just no longer overwrites the
    # resume's shared headline score with a different, non-canonical number.
    await db.commit()
    await db.refresh(report)

    # score trend vs. the immediately preceding report for this resume (same
    # job_title/target_role, so "before/after" comparisons are meaningful —
    # see spec Section 18/20).
    # ATS consolidation Phase 6: restricted to score_type IS NULL — this
    # endpoint's own AtsReport rows are unlabeled (this legacy engine's
    # overall_score predates score_type and isn't one of the three canonical
    # modes — see models.py::AtsReport.score_type). Without this filter, a
    # canonical /check or /analyze-editor report (score_type="resume_health")
    # could be picked up as "previous", silently comparing two different
    # scoring engines' numbers as if one score trended into the other.
    prev = (await db.execute(
        select(AtsReport)
        .where(AtsReport.resume_id == rid, AtsReport.id != report.id, AtsReport.score_type.is_(None))
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


# ═══════════════════════════════════════════════════════════════════════════
# Phase G — mode-aware ATS Checker. A NEW, additive endpoint — /analyze and
# /analyze-resume above are UNCHANGED and keep working exactly as before for
# any existing caller. This is what the redesigned /ats-checker page calls.
#
# Resume ATS Health is ALWAYS computed (a resume can be checked with no role
# and no JD at all — that's the new default experience). Role Readiness and
# Job Match are each independently optional, gated, and clearly labeled —
# never merged into one "ATS Score" number. See services/ats_engine/
# mode_orchestrator.py and docs/ATS_ANALYSIS_MODES.md.
# ═══════════════════════════════════════════════════════════════════════════

class CheckModesRequest(BaseModel):
    resume_id: Optional[str] = None        # a saved resume — takes priority over resume_text
    resume_text: Optional[str] = None      # ephemeral paste/upload path — no resume_id needed
    target_role: Optional[str] = None      # optional — Mode 2 (Role Readiness)
    job_description: Optional[str] = None  # optional — Mode 3 (Job Match), gated by sufficiency


@router.post("/check")
async def check_modes(
    req: CheckModesRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The three-mode entry point (Phase G). Exactly one of resume_id /
    resume_text must be given; target_role and job_description are each
    fully optional and independent of each other."""
    resume_row = None
    if req.resume_id:
        try:
            rid = uuid.UUID(req.resume_id)
        except ValueError:
            raise HTTPException(status_code=404, detail="Resume not found")
        owned = await db.execute(select(Resume).where(Resume.id == rid).options(*_RESUME_LOADERS))
        resume_row = owned.scalar_one_or_none()
        if not resume_row or (resume_row.user_id != user.id and not getattr(user, "is_admin", False)):
            raise HTTPException(status_code=404, detail="Resume not found")
        resume = ResumeParser.from_content(_resume_to_content(resume_row))
    elif req.resume_text and req.resume_text.strip():
        resume = await ResumeParser.parse(req.resume_text)
    else:
        raise HTTPException(status_code=400, detail="Provide a saved resume_id or resume_text to check.")

    target_role = (req.target_role or "").strip()
    role_job = await _job_from_role(db, target_role) if target_role else None

    job_description = (req.job_description or "").strip()
    jd_job, jd_sufficiency = None, None
    if job_description:
        jd_job = await JobParser.parse(job_description)
        jd_sufficiency = JobParser.assess_sufficiency(job_description, jd_job)

    resume_health = mode_orchestrator.resume_health_mode(resume)
    role_readiness = mode_orchestrator.role_readiness_mode(resume, role_job)
    job_match = mode_orchestrator.job_match_mode(resume, jd_job, jd_sufficiency)

    if jd_job:
        analysis_mode = "job_description"
    elif role_job:
        analysis_mode = "role_based"
    else:
        analysis_mode = "resume_only"

    # ATS consolidation Phase 4: resume_row.ats_score = canonical Resume ATS
    # Health only (mode_orchestrator.resume_health_mode(), never Role
    # Readiness or Job Match — see docs/ATS_ANALYSIS_MODES.md). This used to
    # deliberately skip the write (Phase G decision 3, when three different
    # engines all raced to own this field with no discriminator); now that
    # this consolidation makes Resume ATS Health THE single source for it,
    # keeping the resume's headline score in sync here is correct, not risky.
    report_id = None
    if resume_row:
        resume_row.ats_score = resume_health["score"] or 0
        resume_row.updated_at = datetime.now(timezone.utc)
        report = AtsReport(
            resume_id=resume_row.id, user_id=user.id, tenant_id=tenant_of(user),
            job_title=(jd_job or role_job or {}).get("job_title") if (jd_job or role_job) else None,
            job_description=job_description or None,
            target_role=target_role if role_job else None,
            analysis_mode=analysis_mode,
            score=resume_health["score"] or 0,
            score_type="resume_health",
            score_confidence="high" if not resume_health["excluded_layers"] else "medium",
            jd_sufficient=jd_sufficiency["sufficient"] if jd_sufficiency else None,
            # Phase H1: resume_health has two layers now, not one flat
            # category dict -- merge both (keys never collide: Layer A is
            # parsing/sections/formatting/contact, Layer B is
            # resume_quality.py's 11 categories) for this JSON snapshot column.
            category_scores={
                **resume_health["layers"]["ats_compatibility"]["categories"],
                **resume_health["layers"]["resume_quality"]["categories"],
            },
            overall_confidence="high" if not resume_health["excluded_layers"] else "medium",
            analysis_version="v2-phase-g",
            scoring_engine_version=ats_config.SCORING_ENGINE_VERSION,
        )
        db.add(report)
        await db.commit()
        await db.refresh(report)
        report_id = str(report.id)

    await log_usage_event(str(user.id), "ats_analysis", tenant_id=tenant_of(user), metadata={
        "mode": "checker_v2", "resume_health_score": resume_health["score"],
        "role_selected": bool(role_job), "role_readiness_available": role_readiness.get("available", False),
        "jd_provided": bool(jd_job), "job_match_sufficient": job_match.get("sufficient"),
    })

    # Phase H1 follow-up — additive fields for the "Improve My Resume" editor
    # handoff (docs/ATS_NAVIGATION_AND_EDITOR_HANDOFF.md). Neither changes
    # any existing field or scoring behavior:
    #   resume_id        — echoes the saved resume actually used, when one
    #                       was. The frontend already tracks this in its own
    #                       state for that case, but returning it too keeps
    #                       the response self-describing and removes any
    #                       need to infer it client-side.
    #   resume_content    — ONLY populated for the resume_text (paste/upload)
    #                       path, where no resume_id exists yet. The same
    #                       resume dict this endpoint already parsed,
    #                       mapped into the Resume Builder's content shape
    #                       via resume_parser.to_content() (no re-parsing,
    #                       no second engine, nothing invented) — so
    #                       "Improve My Resume" can persist it via the
    #                       EXISTING POST /api/resumes/ endpoint and open
    #                       the editor with real data instead of a blank
    #                       form.
    return {
        "resume_health": resume_health,
        "role_readiness": role_readiness,
        "job_match": job_match,
        "scoring_engine_version": ats_config.SCORING_ENGINE_VERSION,
        "report_id": report_id,
        "resume_id": str(resume_row.id) if resume_row else None,
        "resume_content": ResumeParser.to_content(resume) if not resume_row else None,
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
    # ATS consolidation Phase 6: the trend only ever compares reports that
    # share the SAME score_type as the most recent one — never a legacy
    # engine's score against a canonical Resume ATS Health score, or vice
    # versa (see docs/ATS_ANALYSIS_MODES.md, "never compare different score
    # types in history/trend"). `same_type` intentionally includes null ==
    # null (two legacy /analyze-resume reports trending against each other).
    trend = None
    if summaries:
        latest_type = summaries[0]["score_type"]
        same_type = [s for s in summaries if s["score_type"] == latest_type]
        if len(same_type) >= 2:
            trend = {
                "first_score": same_type[-1]["score"], "latest_score": same_type[0]["score"],
                "improvement": same_type[0]["score"] - same_type[-1]["score"],
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
        "scoring_engine_version": report.scoring_engine_version,
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


class AnalyzeEditorRequest(BaseModel):
    """Phase C — the Resume Editor's canonical v2 analysis call. Mirrors both
    of the legacy editor call shapes it replaces (routers/ats.py's
    AtsAnalyzeRequest — content + resume_id, no JD — and AtsRequest —
    resume_content + job_description + resume_id) as one request, since the
    only real difference between them is whether job_description is set."""
    content: dict
    resume_id: Optional[str] = None
    job_description: Optional[str] = None
    job_title: Optional[str] = None
    debug: bool = False


@router.post("/analyze-editor")
async def analyze_editor(
    req: AnalyzeEditorRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Phase C — canonical v2 analysis for the Resume Editor's live ATS
    panel. Returns the three-layer score (ATS Compatibility / Job Match /
    Resume Quality); job_match is null (never zero) when no job_description
    is supplied, matching the debounced no-JD auto-analysis the editor
    already does. Legacy /api/ats/analyze and /api/ats/score are UNCHANGED
    and still work — this is an additive, parallel endpoint the editor is
    migrated onto, not a replacement of them.
    """
    resume = ResumeParser.from_content(req.content)

    job_description = (req.job_description or "").strip()
    job = await JobParser.parse(job_description) if job_description else None
    jd_sufficiency = JobParser.assess_sufficiency(job_description, job) if job else None

    # ATS consolidation Phase 2: the editor's headline "ATS Score" is ALWAYS
    # Resume ATS Health — the exact same canonical calculation the ATS
    # Checker shows — whether or not a JD is present. Pasting a JD no
    # longer swaps the underlying formula (it used to: compute_full_
    # analysis() blended Job Match into the headline score via
    # ATS_SCORE_CONFIG's 20/55/25 weights, a silent divergence from the
    # no-JD case's 45/55 resume_health_mode() weights — see
    # mode_orchestrator.resume_health_as_full_analysis()'s docstring).
    # Job Match, when a sufficiently-detailed JD is present, is composed in
    # as its own separate `job_match` slot, gated by the same JD-sufficiency
    # rule the ATS Checker's /check endpoint uses — never a percentage for
    # an insufficient JD.
    result = mode_orchestrator.resume_health_as_full_analysis(resume, job, jd_sufficiency)
    recommendations = ats_intelligence_v2.build_editor_recommendations(resume, job, result)
    questions = ats_intelligence_v2.build_editor_questions(resume, job, result)

    score_confidence = "high" if result["score"] is not None and not result["excluded_layers"] else \
                        "medium" if result["score"] is not None else "low"

    # Keep the resume's headline score in sync when tied to an owned resume —
    # same behavior as both legacy endpoints. Only PERSIST a full AtsReport
    # when a JD was actually provided (matching /api/ats/score's behavior,
    # not /api/ats/analyze's) — the debounced no-JD auto-analysis fires on
    # every keystroke pause and must not flood ats_reports with a row each time.
    report_id = None
    persisted_recs = []
    if req.resume_id:
        try:
            rid = uuid.UUID(req.resume_id)
        except ValueError:
            rid = None
        if rid:
            owned = (await db.execute(select(Resume).where(Resume.id == rid))).scalar_one_or_none()
            if owned and owned.user_id == user.id:
                # Resume.ats_score = canonical Resume ATS Health only (ATS
                # consolidation Part 14/Phase 4) — result["score"] is now
                # ALWAYS resume_health_mode()'s score (never blended with
                # Job Match), so this write is canonical-by-construction
                # regardless of whether a JD is present.
                owned.ats_score = result["score"]
                owned.updated_at = datetime.now(timezone.utc)
                if job:
                    jm_categories = (result["job_match"] or {}).get("categories") or {}
                    jm_keywords = jm_categories.get("keywords") or {}
                    report = AtsReport(
                        resume_id=rid, user_id=user.id, tenant_id=tenant_of(user),
                        job_title=req.job_title or job.get("job_title"),
                        job_description=job_description,
                        analysis_mode="job_description",
                        score=result["score"] or 0,
                        score_type="resume_health",
                        jd_sufficient=jd_sufficiency["sufficient"] if jd_sufficiency else None,
                        score_confidence=score_confidence,
                        matched_keywords=jm_keywords.get("matched_evidence") or [],
                        missing_keywords=jm_keywords.get("missing_evidence") or [],
                        suggestions=[r["action"] for r in recommendations["high"] + recommendations["medium"]],
                        category_scores={**result["ats_compatibility"]["categories"], **jm_categories, **result["resume_quality"]["categories"]},
                        overall_confidence=score_confidence,
                        recommendations=recommendations,
                        candidate_questions=questions,
                        analysis_version="v2-phase-c",
                        scoring_engine_version=result["scoring_engine_version"],
                    )
                    db.add(report)
                    await db.commit()
                    await db.refresh(report)
                    report_id = str(report.id)

                    # Phase D — persist recommendations as addressable rows
                    # (only in the JD-based, persisted-report case — same
                    # performance discipline as report persistence itself;
                    # the debounced no-JD auto-analysis never writes any of
                    # this). resume_updated_at_snapshot captures "as of when"
                    # for the staleness check in apply_fix.check_staleness().
                    staged = ai_recommendations.classify_and_stage(resume, job, result, recommendations)
                    persisted_recs = []
                    for s in staged:
                        rec = AtsRecommendation(
                            resume_id=rid, user_id=user.id, ats_report_id=report.id,
                            action_type=s["action_type"], priority=s["priority"], title=s["title"],
                            reason=s["reason"], affected_section=s["affected_section"],
                            affected_item_id=s["affected_item_id"], target_text=s["target_text"],
                            score_impact_estimate=s["score_impact_estimate"],
                            requires_user_input=s["requires_user_input"], question=s["question"],
                            evidence_tier=s["evidence_tier"], resume_updated_at_snapshot=owned.updated_at,
                        )
                        db.add(rec)
                        persisted_recs.append(rec)
                    await db.commit()
                    for rec in persisted_recs:
                        await db.refresh(rec)
                else:
                    await db.commit()

    await log_usage_event(str(user.id), "ats_analysis", tenant_id=tenant_of(user),
                          metadata={"resume_id": req.resume_id, "mode": "editor", "has_jd": bool(job)})

    response = {
        "scores": {
            "overall": result["score"],
            "ats_compatibility": result["layers"]["ats_compatibility"],
            "job_match": result["layers"]["job_match"],       # null, never 0, when no JD
            "resume_quality": result["layers"]["resume_quality"],
        },
        "categories": {
            "ats_compatibility": result["ats_compatibility"]["categories"],
            "job_match": result["job_match"]["categories"] if result["job_match"] else {},
            "resume_quality": result["resume_quality"]["categories"],
        },
        "recommendations": recommendations,
        "candidate_questions": questions,
        "keywords": result["job_match"]["categories"].get("keywords", {}) if result["job_match"] else {},
        # Additive (ATS consolidation Phase 2) — lets a caller distinguish
        # "no JD pasted" (jd_sufficiency is None) from "JD pasted but too
        # thin to score" (sufficient=False) from a real Job Match score,
        # so "Insufficient job description" can be shown instead of a
        # fabricated/zeroed percentage. Never removes/renames an existing key.
        "jd_sufficiency": jd_sufficiency,
        "score_confidence": score_confidence,
        "excluded_layers": result["excluded_layers"],
        "layer_weights_used": result["layer_weights_used"],
        "scoring_engine_version": result["scoring_engine_version"],
        "report_id": report_id,
        # Phase D — addressable recommendations, only present when a report
        # was persisted (JD-based analysis). Empty for the no-JD debounced
        # auto-analysis, by design (Part 32 performance discipline).
        "persisted_recommendations": [
            {
                "id": str(rec.id), "action_type": rec.action_type, "priority": rec.priority,
                "title": rec.title, "reason": rec.reason, "affected_section": rec.affected_section,
                "score_impact_estimate": rec.score_impact_estimate,
                "requires_user_input": rec.requires_user_input, "question": rec.question,
                "evidence_tier": rec.evidence_tier, "status": rec.status,
            }
            for rec in persisted_recs
        ],
    }
    if req.debug:
        response["debug"] = ats_intelligence_v2.build_debug_breakdown(result)
    return response


# ═══════════════════════════════════════════════════════════════════════════
# Phase D — AI ATS optimization loop: recommendation lifecycle, apply/reject/
# undo, change history. Every endpoint below re-validates ownership itself —
# never trusts a resume_id/recommendation_id/user_id from the client body.
# ═══════════════════════════════════════════════════════════════════════════

async def _owned_recommendation(db: AsyncSession, recommendation_id: str, user: User) -> AtsRecommendation:
    try:
        rid = uuid.UUID(recommendation_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    rec = await db.get(AtsRecommendation, rid)
    if not rec or (rec.user_id != user.id and not getattr(user, "is_admin", False)):
        raise HTTPException(status_code=404, detail="Recommendation not found")
    return rec


async def _owned_resume_for(db: AsyncSession, resume_id, user: User) -> Resume:
    from routers.resumes import _load_full
    r = await _load_full(db, resume_id)
    if not r or (r.user_id != user.id and not getattr(user, "is_admin", False)):
        raise HTTPException(status_code=404, detail="Resume not found")
    return r


@router.get("/resumes/{resume_id}/recommendations")
async def list_recommendations(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Current recommendations for a resume, newest first."""
    try:
        rid = uuid.UUID(resume_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Resume not found")
    owned = (await db.execute(select(Resume.id, Resume.user_id).where(Resume.id == rid))).first()
    if not owned or (owned.user_id != user.id and not getattr(user, "is_admin", False)):
        raise HTTPException(status_code=404, detail="Resume not found")

    recs = (await db.execute(
        select(AtsRecommendation).where(AtsRecommendation.resume_id == rid, AtsRecommendation.status != "applied")
        .order_by(AtsRecommendation.created_at.desc())
    )).scalars().all()
    return [
        {"id": str(r.id), "action_type": r.action_type, "priority": r.priority, "title": r.title,
         "reason": r.reason, "affected_section": r.affected_section, "score_impact_estimate": r.score_impact_estimate,
         "requires_user_input": r.requires_user_input, "question": r.question, "status": r.status,
         "evidence_tier": r.evidence_tier, "proposed_content": r.proposed_content}
        for r in recs
    ]


class AnswerRequest(BaseModel):
    answer: str


@router.post("/recommendations/{recommendation_id}/answer")
async def answer_recommendation(
    recommendation_id: str,
    req: AnswerRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Part 5/20 — the candidate supplies the missing evidence a question
    asked for. Generates the AI proposal immediately from ONLY this
    confirmed fact (never fabricates beyond it) — see ai_recommendations.py."""
    rec = await _owned_recommendation(db, recommendation_id, user)
    if rec.status == "applied":
        raise HTTPException(status_code=409, detail="This recommendation has already been applied.")
    if not req.answer.strip():
        raise HTTPException(status_code=400, detail="Please provide an answer.")

    resume_row = await _owned_resume_for(db, rec.resume_id, user)
    from routers.resumes import _to_content
    content = _to_content(resume_row)
    original = _find_original_text(rec, content)

    overused_term = _extract_skill_term(rec) if rec.action_type in ("add_keyword", "improve_skills") else None
    proposal = await ai_recommendations.generate_proposal(
        rec.action_type, original or "", content, user_answer=req.answer,
        raw_text=resume_row.summary or "", overused_term=overused_term,
    )

    rec.user_answer = req.answer
    rec.proposed_content = proposal["proposed_content"]
    rec.evidence_tier = proposal["evidence_tier"]
    rec.status = "answered"
    await db.commit()
    await db.refresh(rec)

    return {"id": str(rec.id), "proposed_content": rec.proposed_content, "evidence_tier": rec.evidence_tier,
            "source_note": proposal["source_note"], "status": rec.status}


@router.post("/recommendations/{recommendation_id}/preview")
async def preview_recommendation(
    recommendation_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Part 6 — for recommendations that don't need new evidence (reword-
    only types), generates the AI proposal on demand (lazy — Part 32)."""
    rec = await _owned_recommendation(db, recommendation_id, user)
    if rec.status == "applied":
        raise HTTPException(status_code=409, detail="This recommendation has already been applied.")
    if rec.requires_user_input and not rec.user_answer:
        raise HTTPException(status_code=400, detail="This recommendation needs an answer first — call /answer.")

    resume_row = await _owned_resume_for(db, rec.resume_id, user)
    from routers.resumes import _to_content
    content = _to_content(resume_row)
    original = _find_original_text(rec, content)

    proposal = await ai_recommendations.generate_proposal(
        rec.action_type, original or "", content, user_answer=rec.user_answer,
        raw_text=resume_row.summary or "",
    )
    rec.proposed_content = proposal["proposed_content"]
    rec.evidence_tier = proposal["evidence_tier"]
    if rec.status == "pending":
        rec.status = "approved"
    await db.commit()
    await db.refresh(rec)

    return {"id": str(rec.id), "current": original, "proposed_content": rec.proposed_content,
            "evidence_tier": rec.evidence_tier, "source_note": proposal["source_note"], "why": rec.reason}


class ApplyRequest(BaseModel):
    final_content: Optional[str] = None  # Part 19 — the user's own edit, if they changed the AI's proposal


@router.post("/recommendations/{recommendation_id}/apply")
async def apply_recommendation_endpoint(
    recommendation_id: str,
    req: ApplyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Part 17 — actually modifies the resume, reparses, rescores, and
    writes change history. Never auto-runs after analysis — always an
    explicit, user-approved action."""
    rec = await _owned_recommendation(db, recommendation_id, user)

    # Concurrency guard (Part 33/34) — the initial check here catches the
    # common "double click" case; the final status flip below uses a
    # conditional UPDATE so a genuine simultaneous request can't silently
    # double-apply. True row-level locking is a documented known limitation
    # (see docs/SAHICAREER_ATS_INTELLIGENCE_2.md) — not implemented this phase.
    if rec.status == "applied":
        raise HTTPException(status_code=409, detail="This recommendation has already been applied.")
    if rec.status == "rejected":
        raise HTTPException(status_code=409, detail="This recommendation was rejected — re-analyze to get a fresh one.")

    final_text = req.final_content if req.final_content is not None else rec.proposed_content
    if rec.action_type not in ("add_skill_evidence",) and not (final_text or "").strip():
        raise HTTPException(status_code=400, detail="No content to apply yet — preview or answer this recommendation first.")

    resume_row = await _owned_resume_for(db, rec.resume_id, user)

    # Optimistic concurrency: claim the row before doing any real work, so a
    # second concurrent request sees status != pending/answered/approved and
    # is refused above on its own read — this update is the actual guard.
    claim = await db.execute(
        update(AtsRecommendation).where(AtsRecommendation.id == rec.id, AtsRecommendation.status != "applied")
        .values(status="approved")
    )
    await db.commit()
    if claim.rowcount == 0:
        raise HTTPException(status_code=409, detail="This recommendation has already been applied.")

    try:
        result = await apply_fix.apply_recommendation(db, rec, resume_row, final_text or "")
    except apply_fix.StaleRecommendationError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except apply_fix.TargetNotFoundError as e:
        raise HTTPException(status_code=409, detail=str(e))

    await log_usage_event(str(user.id), "ats_analysis", tenant_id=tenant_of(user),
                          metadata={"resume_id": str(rec.resume_id), "mode": "apply_fix", "action_type": rec.action_type})

    return {
        "success": result["success"],
        "before_score": result["before_score"], "after_score": result["after_score"],
        "score_delta": result["score_delta"], "changed_metrics": result["changed_metrics"],
        "changed_fields": result["changed_fields"], "change_history_id": result["change_history_id"],
        "rescore_pending": result["rescore_pending"], "message": result["message"],
    }


class RejectRequest(BaseModel):
    reason: Optional[str] = None


@router.post("/recommendations/{recommendation_id}/reject")
async def reject_recommendation(
    recommendation_id: str,
    req: RejectRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Part 18 — never modifies the resume."""
    rec = await _owned_recommendation(db, recommendation_id, user)
    if rec.status == "applied":
        raise HTTPException(status_code=409, detail="This recommendation has already been applied and can't be rejected — use Undo instead.")
    rec.status = "rejected"
    rec.rejection_reason = req.reason
    await db.commit()
    return {"id": str(rec.id), "status": rec.status}


@router.get("/resumes/{resume_id}/change-history")
async def get_change_history(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Part 16."""
    try:
        rid = uuid.UUID(resume_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Resume not found")
    owned = (await db.execute(select(Resume.id, Resume.user_id, Resume.ats_score).where(Resume.id == rid))).first()
    if not owned or (owned.user_id != user.id and not getattr(user, "is_admin", False)):
        raise HTTPException(status_code=404, detail="Resume not found")

    rows = (await db.execute(
        select(AtsChangeHistory).where(AtsChangeHistory.resume_id == rid).order_by(AtsChangeHistory.created_at.desc())
    )).scalars().all()
    return {
        "current_score": owned.ats_score,
        "history": [
            {"id": str(h.id), "action_type": h.action_type, "before_score": h.before_score,
             "after_score": h.after_score, "score_delta": h.score_delta, "changed_metrics": h.changed_metrics,
             "changed_fields": h.changed_fields, "created_at": h.created_at.isoformat() if h.created_at else None,
             "recommendation_id": str(h.recommendation_id) if h.recommendation_id else None}
            for h in rows
        ],
    }


@router.post("/change-history/{history_id}/undo")
async def undo_change_endpoint(
    history_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Part 14 — restores the previous content, reparses, rescores, and
    writes ANOTHER history record (never just edits the displayed number)."""
    try:
        hid = uuid.UUID(history_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Change not found")
    history_row = await db.get(AtsChangeHistory, hid)
    if not history_row or (history_row.user_id != user.id and not getattr(user, "is_admin", False)):
        raise HTTPException(status_code=404, detail="Change not found")

    resume_row = await _owned_resume_for(db, history_row.resume_id, user)
    try:
        result = await apply_fix.undo_change(db, history_row, resume_row)
    except apply_fix.TargetNotFoundError as e:
        raise HTTPException(status_code=409, detail=str(e))

    return result


def _find_original_text(rec: AtsRecommendation, content: dict) -> str | None:
    """The exact target text was captured once at staging time
    (AtsRecommendation.target_text — see ai_recommendations._extract_target_text),
    not re-derived from title/reason strings here (that was a real bug:
    those don't reliably contain the right quoted substring for every
    action type — caught by the Phase D E2E test)."""
    return rec.target_text


def _extract_skill_term(rec: AtsRecommendation) -> str | None:
    return rec.target_text
