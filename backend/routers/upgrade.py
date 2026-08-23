"""
AI Resume Upgrade module.

  POST /api/upgrade/parse         (multipart file)  → structured content from a PDF/DOCX
  POST /api/upgrade/analyze       (content)         → general ATS score + recommendations
  POST /api/upgrade/enhance       (content)         → AI-improved content + before/after + diffs
  POST /api/upgrade/apply-docx    (multipart file)  → improved content merged into the ORIGINAL
                                                        .docx in place — fonts/colors/layout untouched
  POST /api/upgrade/save          (JSON)            → persists as a new resume, preserving the
                                                        original design + a 2-version history

Design preservation (Mode 1, the default for uploads) vs re-templating (Mode 2,
"Change Template") are kept strictly separate — see services/docx_editor.py.
For PDFs specifically: true in-place text editing needs a PDF SDK (e.g. PyMuPDF)
that's AGPL/commercially licensed, which is a licensing decision, not an
engineering one — by product decision we do NOT rewrite PDFs. A PDF's "Preserve
Layout" download is always the untouched original bytes; the AI-improved
content is offered via a new DOCX or the explicit SahiCareer template instead.
"""
import base64
from typing import Any, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User
from services.deps import get_current_user
from services.parsing import extract_text, quick_contact, heuristic_structured_parse, validate_upload, InvalidUpload
from services.ai import parse_resume_to_content, enhance_resume, _normalize_content
from services.ats_engine import mode_orchestrator, resume_parser as ats_resume_parser
from services.usage import set_usage_context

# ATS consolidation Phase 3: AI Resume Upgrade's before/after ATS scoring
# used to be services.ats.analyze_resume() — a separate, simpler legacy
# formula, completely disconnected from the canonical Resume ATS Health the
# ATS Checker/Editor show (see docs/ATS scoring audit). Both "before" and
# "after" now go through the SAME canonical engine those surfaces use — the
# AI never invents or estimates a score, it only rewrites content; every
# score below is a fresh, real call into mode_orchestrator.resume_health_mode()
# via this same shape-preserving adapter (analyze_resume() used to return
# {"score", "breakdown", "recommendations"} — the shape the frontend already
# renders — so this migration doesn't require a frontend rewrite to land).


def analyze_resume(content: dict) -> dict:
    resume = ats_resume_parser.from_content(content or {})
    return mode_orchestrator.resume_health_as_legacy_score_shape(resume)

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

    # Verify the bytes really match the claimed type before extracting / calling AI / storing.
    try:
        ext = validate_upload(file.filename, data)
    except InvalidUpload as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    text = extract_text(file.filename, data)
    if len(text.strip()) < 30:
        raise HTTPException(status_code=422, detail="Couldn't read text from this file. If it's a scanned image, try a text-based PDF or DOCX.")

    set_usage_context(str(user.id), "parse")
    content = await parse_resume_to_content(text)
    parsed_by = "ai"
    if content is None:
        # AI unavailable (rate limit / no credits / network) → section-header
        # heuristic parse so experience/education/skills survive instead of
        # collapsing into one giant "summary" blob (see services/parsing.py).
        content = _normalize_content(heuristic_structured_parse(text))
        parsed_by = "heuristic"

    file_type = ext.lstrip(".")  # "pdf" | "docx" | "txt" — tells the frontend which
                                  # preservation mode applies (docx: in-place edit is
                                  # possible; pdf: original-only per product decision)

    # Privacy non-negotiable (spec Section 6): the uploaded CV is processed in
    # memory and NEVER retained at this step. The browser keeps the original file
    # in memory and only re-sends it to /apply-docx or /save if the user chooses
    # to preserve the design — that's the only point the file is stored.
    del data

    return {
        "content": content, "chars": len(text), "retained": False,
        "file_type": file_type,
        "can_preserve_design": file_type == "docx",
        "parsed_by": parsed_by,  # "ai" | "heuristic" — surfaced so the UI can be honest when AI wasn't available
    }


@router.post("/analyze")
async def analyze(body: ContentBody, user: User = Depends(get_current_user)):
    return analyze_resume(body.content)


@router.post("/enhance")
async def enhance(body: ContentBody, user: User = Depends(get_current_user)):
    set_usage_context(str(user.id), "upgrade")
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


@router.post("/apply-docx")
async def apply_docx(
    file: UploadFile = File(...),
    original_content: str = Form(...),   # JSON-encoded (as parsed, before AI touched it)
    enhanced_content: str = Form(...),   # JSON-encoded (after AI Improve)
    user: User = Depends(get_current_user),
):
    """Mode 1 — merge AI Improve's content changes into the ORIGINAL .docx in
    place. Fonts, colors, sizes, spacing, margins, tables, headers/footers and
    section order are never touched — only the text of paragraphs that
    actually changed (summary, bullets). Stateless: nothing is persisted here;
    see /save for the explicit, consented storage point."""
    import json

    name = (file.filename or "").lower()
    if not name.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Design preservation is only available for .docx uploads — see /save for PDF handling.")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB).")
    try:
        validate_upload(file.filename, data)
    except InvalidUpload as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        orig = json.loads(original_content)
        enh = json.loads(enhanced_content)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid content payload.")
    if not isinstance(orig, dict) or not isinstance(enh, dict):
        raise HTTPException(status_code=400, detail="Invalid content payload.")

    from services.docx_editor import apply_content_edits
    new_bytes, report = apply_content_edits(data, orig, enh)

    return {
        "docx_base64": base64.b64encode(new_bytes).decode("ascii"),
        "report": report,
    }


class SavePreservedRequest(BaseModel):
    title: str = "Untitled Resume"
    template_id: str = "modern"
    original_content: dict
    enhanced_content: dict
    preserve_original: bool = False
    original_file_base64: Optional[str] = None   # sent only when preserve_original is true
    original_file_type: Optional[str] = None      # "pdf" | "docx"
    original_filename: Optional[str] = None


@router.post("/save")
async def save_preserved(
    body: SavePreservedRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Persist an AI-Improved upload as a new resume with a 2-version history:
    Version 1 = the original upload's content, Version 2 = the AI-improved
    content. This is the ONLY point the original file is stored — matching the
    app's existing "processed in memory until you save" privacy stance. When
    preserve_original is set, the untouched file is kept permanently
    (original_file_path, never deleted/overwritten) and template_type is
    marked 'uploaded_original' so future downloads reuse its design instead of
    the SahiCareer generator (see routers/resumes.py's download path)."""
    from models import Resume
    from services.storage import upload_bytes
    from services.usage import tenant_of, log_usage_event
    from services.docx_editor import extract_font_color_metadata
    # Reused verbatim from routers/resumes.py so a preserved-design resume
    # decomposes into the same normalized tables/version history as any other.
    from routers.resumes import _apply_content, _load_full, _snapshot, _to_dict

    original_path = None
    font_meta = None
    if body.preserve_original and body.original_file_base64:
        try:
            raw = base64.b64decode(body.original_file_base64)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid file data.")
        if len(raw) > MAX_BYTES:
            raise HTTPException(status_code=400, detail="File too large (max 5 MB).")
        original_path = upload_bytes(
            str(user.id), "original", body.original_filename or f"resume.{body.original_file_type or 'bin'}",
            raw, "application/octet-stream",
        )
        if body.original_file_type == "docx":
            try:
                font_meta = extract_font_color_metadata(raw)
            except Exception:
                font_meta = None

    # ATS consolidation Phase 4: Resume.ats_score = canonical Resume ATS
    # Health only, computed server-side from the content actually being
    # saved (the AI-improved version, which becomes this resume's live
    # content below) — never a client-supplied number. Without this, a
    # freshly-saved AI Upgrade resume would show no score anywhere until the
    # editor's own /analyze-editor next ran, even though /enhance already
    # computed and showed the user this exact number as "ats_after".
    r = Resume(
        user_id=user.id,
        title=body.title or "Untitled Resume",
        template_id=body.template_id or "modern",
        template_type="uploaded_original" if body.preserve_original else "sahicareer",
        preserve_original=body.preserve_original,
        original_file_path=original_path,
        original_file_type=body.original_file_type,
        original_filename=body.original_filename,
        font_metadata=font_meta,
        ats_score=analyze_resume(body.enhanced_content or {})["score"],
        personal_info={}, achievements=[], interests=[],
    )

    # Version 1 — the original upload's content, exactly as parsed (pre-AI)
    await _apply_content(db, r, body.original_content or {})
    db.add(r)
    await db.commit()
    full = await _load_full(db, r.id)
    await _snapshot(db, full, user.id, "original_upload")
    await db.commit()

    # Version 2 — AI-improved content becomes the resume's live content
    await _apply_content(db, full, body.enhanced_content or {})
    await db.commit()
    full = await _load_full(db, r.id)
    await _snapshot(db, full, user.id, "ai_improved")
    await db.commit()

    await log_usage_event(str(user.id), "upgrade_saved", tenant_id=tenant_of(user),
                          metadata={"preserve_original": body.preserve_original})
    return _to_dict(full)
