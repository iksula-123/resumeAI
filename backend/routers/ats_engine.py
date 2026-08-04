"""
ATS Engine API — upload/parse a resume, paste a JD, get a full AI-driven
ATS dashboard (scores + explanations + suggestions), and generate a
JD-tailored resume. See services/ats_engine/ for the pipeline itself.
"""
import asyncio

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from models import User
from services.ats_engine import (
    ResumeParser, JobParser, ATSService, RecommendationEngine, ResumeImprover,
)
from services.deps import get_current_user
from services.usage import log_usage_event, tenant_of

router = APIRouter(prefix="/api/ats/v2", tags=["ATS Engine"])

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
    """Full pipeline: parse both sides, score every dimension, generate suggestions."""
    if not req.resume_text.strip() or not req.job_description.strip():
        raise HTTPException(status_code=400, detail="Both resume text and a job description are required.")

    resume, job = await asyncio.gather(
        ResumeParser.parse(req.resume_text),
        JobParser.parse(req.job_description),
    )
    ats_result = await ATSService.analyze(resume, job)

    missing_keywords = ats_result["scores"]["keyword_match"].get("missing", [])
    suggestions = await RecommendationEngine.suggest(resume, job, missing_keywords)

    await log_usage_event(str(user.id), "ats_v2_analyze", tenant_id=tenant_of(user),
                          metadata={"score": ats_result["overall_score"]})

    return {
        "resume": resume,
        "job": job,
        "ats": ats_result,
        "suggestions": suggestions,
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

    await log_usage_event(str(user.id), "ats_v2_tailor", tenant_id=tenant_of(user), metadata={})
    return {"original": resume, "tailored": tailored}
