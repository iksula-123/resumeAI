"""
AI Resume Upgrade module.

  POST /api/upgrade/parse    (multipart file)  → structured content from a PDF/DOCX
  POST /api/upgrade/analyze  (content)         → general ATS score + recommendations
  POST /api/upgrade/enhance  (content)         → AI-improved content + before/after + diffs
"""
from typing import Any
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel

from models import User
from services.deps import get_current_user
from services.parsing import extract_text, quick_contact
from services.ai import parse_resume_to_content, enhance_resume, _normalize_content
from services.ats import analyze_resume

router = APIRouter(prefix="/api/upgrade", tags=["AI Upgrade"])

MAX_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED = (".pdf", ".docx", ".txt")


class ContentBody(BaseModel):
    content: dict


@router.post("/parse")
async def parse(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    name = (file.filename or "").lower()
    if not name.endswith(ALLOWED):
        raise HTTPException(status_code=400, detail="Please upload a PDF, DOCX, or TXT file.")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB).")
    if not data:
        raise HTTPException(status_code=400, detail="The file appears to be empty.")

    text = extract_text(file.filename, data)
    if len(text.strip()) < 30:
        raise HTTPException(status_code=422, detail="Couldn't read text from this file. If it's a scanned image, try a text-based PDF or DOCX.")

    content = await parse_resume_to_content(text)
    if content is None:
        # AI unavailable → minimal heuristic parse so the flow still works
        content = _normalize_content({"personalInfo": quick_contact(text), "summary": text[:400]})

    return {"content": content, "chars": len(text)}


@router.post("/analyze")
async def analyze(body: ContentBody, user: User = Depends(get_current_user)):
    return analyze_resume(body.content)


@router.post("/enhance")
async def enhance(body: ContentBody, user: User = Depends(get_current_user)):
    original = body.content or {}
    enhanced = await enhance_resume(original)

    before = analyze_resume(original)
    after = analyze_resume(enhanced)

    # Build a human-readable list of what changed
    improvements: list[str] = []
    if (enhanced.get("summary") or "") != (original.get("summary") or ""):
        improvements.append("Professional summary rewritten for impact" if original.get("summary")
                            else "Added a compelling professional summary")

    orig_bullets = sum(len(e.get("bullets") or []) for e in original.get("experience") or [])
    new_bullets = sum(len(e.get("bullets") or []) for e in enhanced.get("experience") or [])
    changed_roles = 0
    for i, e in enumerate(enhanced.get("experience") or []):
        oe = (original.get("experience") or [])[i] if i < len(original.get("experience") or []) else {}
        if (e.get("bullets") or []) != (oe.get("bullets") or []):
            changed_roles += 1
    if changed_roles:
        improvements.append(f"Strengthened bullet points across {changed_roles} role{'s' if changed_roles > 1 else ''} with action verbs & metrics")

    n_orig_skills = len(original.get("skills") or [])
    n_new_skills = len(enhanced.get("skills") or [])
    if n_new_skills > n_orig_skills:
        improvements.append(f"Added {n_new_skills - n_orig_skills} relevant, in-demand skills")

    if after["score"] > before["score"]:
        improvements.append(f"ATS readiness improved from {before['score']} to {after['score']}")

    if not improvements:
        improvements.append("Refined wording and formatting for ATS compatibility")

    return {
        "original": original,
        "enhanced": enhanced,
        "ats_before": before,
        "ats_after": after,
        "improvements": improvements,
    }
