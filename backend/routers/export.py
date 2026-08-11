"""
Resume export — PDF and DOCX, template-aware.

template_id resolution (ONE source of truth, never mixed):
  - resume_id given  → the resume's OWN Resume.template_id (DB) wins. Any
                        client-supplied template_id in the request body is
                        ignored outright — a saved resume's download must
                        always match what's actually saved, never a client
                        guess that could've gone stale.
  - resume_id absent → this is ephemeral/unsaved content (e.g. the template
                        picker's "preview with my data" or AI-Upgrade before
                        the user has saved anything yet). The client-supplied
                        template_id is the only signal available, so it's
                        used — but strictly validated against
                        shared/template-specs.json; an unknown id is a 400,
                        not a silent fallback (see TEMPLATE-VALIDATION below).

This is completely separate from the uploaded-resume "preserve original
design" workflow (Resume.preserve_original / template_type == "uploaded_original"
— see routers/resumes.py::download_resume and services/docx_editor.py).
template_id only matters when preserve_original is false; the two concepts
are never read together.

TEMPLATE_BUILDERS is a registry, not 10 independent implementations — every
template_id currently maps to the same "classic" layout-family builder
(today's fpdf2/python-docx design, now parameterized by which sections to
render). As real per-template visual designs get built, new layout-family
builder functions get added and specific ids get repointed to them — the
registry shape doesn't change.
"""
import io
import json
import os
import uuid
from dataclasses import dataclass
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Resume
from services.auth import verify_token
from services.storage import upload_bytes
from services.webhooks import dispatch
from services.usage import log_usage_event

router = APIRouter(prefix="/api/export", tags=["Export"])
security = HTTPBearer()


async def _auth(c: HTTPAuthorizationCredentials = Depends(security)):
    return await verify_token(c.credentials)


class ExportRequest(BaseModel):
    content: dict
    title: str = "Resume"
    resume_id: str | None = None
    template_id: str = "modern"  # only consulted when resume_id is absent — see module docstring


# ── shared/template-specs.json: the single source of truth ────────────────────
# Same file frontend/components/ResumeTemplates.tsx reads. Loaded once at
# import time; do not hand-maintain a second copy of this data here.

def _load_template_specs() -> dict[str, dict]:
    path = os.path.join(os.path.dirname(__file__), "..", "..", "shared", "template-specs.json")
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return {t["id"]: t for t in raw["templates"]}


TEMPLATE_SPECS: dict[str, dict] = _load_template_specs()
DEFAULT_TEMPLATE_ID = "modern"


def _skill_names(content: dict) -> list[str]:
    """Skills may be objects {name, level} or plain strings."""
    out = []
    for s in content.get("skills", []) or []:
        if isinstance(s, dict):
            name = s.get("name")
        else:
            name = s
        if name:
            out.append(str(name))
    return out


# fpdf2 core fonts only support latin-1; map common unicode to safe equivalents
_UNICODE_MAP = {
    "–": "-", "—": "-", "•": "-",   # en/em dash, bullet
    "‘": "'", "’": "'", "“": '"', "”": '"',  # smart quotes
    "…": "...", " ": " ",
}


def _pdf_safe(text) -> str:
    text = str(text or "")
    for uni, rep in _UNICODE_MAP.items():
        text = text.replace(uni, rep)
    # drop anything still outside latin-1 so fpdf never raises
    return text.encode("latin-1", "replace").decode("latin-1")


# ── template_id resolution (the one source-of-truth chokepoint) ────────────────

async def _resolve_template_id(req: ExportRequest, db: AsyncSession, user) -> str:
    if req.resume_id:
        try:
            rid = uuid.UUID(req.resume_id)
        except ValueError:
            raise HTTPException(status_code=404, detail="Resume not found")
        row = (await db.execute(
            select(Resume.template_id, Resume.user_id).where(Resume.id == rid)
        )).first()
        # NOTE: this router's _auth/verify_token returns the raw Supabase auth
        # user (id is a str), unlike services/deps.py::get_current_user (used
        # elsewhere) which returns our Profile row (id is a uuid.UUID) — so
        # this comparison must be string-normalized on both sides, or a UUID
        # vs str mismatch makes every resume look "not owned" by its own owner.
        if not row or (str(row.user_id) != str(user.id) and not getattr(user, "is_admin", False)):
            raise HTTPException(status_code=404, detail="Resume not found")
        tid = row.template_id or DEFAULT_TEMPLATE_ID
        if tid not in TEMPLATE_SPECS:
            # Backward compatibility ONLY: a resume already saved with a
            # legacy/removed template_id must still download, never 400 —
            # the user did nothing wrong, the id just predates this registry.
            tid = DEFAULT_TEMPLATE_ID
        return tid

    # No resume_id — ephemeral content (template picker preview, AI-Upgrade
    # pre-save export). The client-supplied id is the only signal, and unlike
    # the DB-sourced path above, an unknown id here is NOT quietly patched to
    # "modern" — that would let a typo'd/invalid id silently render the wrong
    # template with no signal to the caller.
    tid = req.template_id or DEFAULT_TEMPLATE_ID
    if tid not in TEMPLATE_SPECS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown template_id '{tid}'. Valid ids: {sorted(TEMPLATE_SPECS)}",
        )
    return tid


@router.post("/pdf")
async def export_pdf(req: ExportRequest, db: AsyncSession = Depends(get_db), user=Depends(_auth)):
    template_id = await _resolve_template_id(req, db, user)
    builder = TEMPLATE_BUILDERS.get(template_id, TEMPLATE_BUILDERS[DEFAULT_TEMPLATE_ID])
    sections = TEMPLATE_SPECS[template_id]["sections"]

    pdf_bytes = builder.pdf(req.content, req.title, sections)
    safe_title = req.title.replace(" ", "_")
    upload_bytes(str(user.id), "generated", f"{safe_title}.pdf", pdf_bytes, "application/pdf")
    dispatch(user.id, "resume.exported", {"title": req.title, "format": "pdf", "template_id": template_id})
    await log_usage_event(str(user.id), "download_pdf", metadata={"title": req.title, "template_id": template_id})
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.pdf"'},
    )


@router.post("/docx")
async def export_docx(req: ExportRequest, db: AsyncSession = Depends(get_db), user=Depends(_auth)):
    template_id = await _resolve_template_id(req, db, user)
    builder = TEMPLATE_BUILDERS.get(template_id, TEMPLATE_BUILDERS[DEFAULT_TEMPLATE_ID])
    sections = TEMPLATE_SPECS[template_id]["sections"]

    docx_bytes = builder.docx(req.content, req.title, sections)
    safe_title = req.title.replace(" ", "_")
    upload_bytes(
        str(user.id), "generated", f"{safe_title}.docx", docx_bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    dispatch(user.id, "resume.exported", {"title": req.title, "format": "docx", "template_id": template_id})
    await log_usage_event(str(user.id), "download_docx", metadata={"title": req.title, "template_id": template_id})
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.docx"'},
    )


# ──────────────────────────────────────────────
# PDF generation via fpdf2 — the "classic" layout family
# (today's Modern design, now parameterized by `sections`)
# ──────────────────────────────────────────────

def _pdf_font(pdf):
    """Set up Unicode fonts for the PDF and return (family, safe_fn).

    Uses bundled Noto Sans (Latin) as the primary font with Noto Sans Devanagari
    registered as a *fallback*, so English AND Devanagari/Indian scripts both
    render correctly (spec Section 6). Falls back to the latin-1 core font when
    the TTFs aren't bundled. Drop the OFL TTFs into backend/assets/fonts/.
    """
    base = os.path.join(os.path.dirname(__file__), "..", "assets", "fonts")
    latin_reg = os.path.join(base, "NotoSans-Regular.ttf")
    if not os.path.exists(latin_reg):
        return "Helvetica", _pdf_safe   # no Unicode font bundled → core font

    latin_bold = os.path.join(base, "NotoSans-Bold.ttf")
    pdf.add_font("NotoSans", "", latin_reg)
    pdf.add_font("NotoSans", "B", latin_bold if os.path.exists(latin_bold) else latin_reg)

    # Devanagari as a fallback so mixed English/Hindi text renders in one run.
    dev_reg = os.path.join(base, "NotoSansDevanagari-Regular.ttf")
    if os.path.exists(dev_reg):
        dev_bold = os.path.join(base, "NotoSansDevanagari-Bold.ttf")
        pdf.add_font("NotoDev", "", dev_reg)
        pdf.add_font("NotoDev", "B", dev_bold if os.path.exists(dev_bold) else dev_reg)
        try:
            pdf.set_fallback_fonts(["NotoDev"])
        except Exception:
            pass
    return "NotoSans", (lambda t: str(t or ""))   # pass Unicode straight through


# Historical default — exactly what _build_pdf/_build_docx rendered before
# they became sections-aware. Only used as a safety net for a caller that
# doesn't go through TEMPLATE_BUILDERS/TEMPLATE_SPECS (e.g. a direct unit
# test); every real request path always passes an explicit `sections` list
# resolved from the selected template's spec.
_LEGACY_DEFAULT_SECTIONS = ["summary", "experience", "education", "skills"]


def _build_pdf(content: dict, title: str, sections: list[str] | None = None) -> bytes:
    """The 'classic' PDF layout family. `sections` (from the resolved
    template's spec — see TEMPLATE_SPECS) is the ONLY thing that decides which
    optional blocks render; this function never makes that call independently
    (spec Section 7 — section-parity single source of truth). A section with
    no data is always skipped regardless of `sections`, so nothing empty ever
    renders — and nothing with data is dropped just because a different
    template got selected."""
    sections = sections if sections is not None else _LEGACY_DEFAULT_SECTIONS
    from fpdf import FPDF

    pi = content.get("personalInfo", {})

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_margins(20, 20, 20)
    font, safe = _pdf_font(pdf)   # Unicode-capable when the font is bundled

    # Name
    pdf.set_font(font, "B", 20)
    pdf.set_text_color(30, 64, 175)
    pdf.cell(0, 10, safe(pi.get("fullName", title)), ln=True)

    # Contact line
    contact_parts = [s for s in [pi.get("email"), pi.get("phone"), pi.get("location")] if s]
    if contact_parts:
        pdf.set_font(font, "", 9)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 6, safe("  |  ".join(contact_parts)), ln=True)

    pdf.ln(3)

    def section(heading: str):
        pdf.set_font(font, "B", 10)
        pdf.set_text_color(30, 64, 175)
        pdf.set_fill_color(239, 246, 255)
        pdf.cell(0, 7, safe(heading.upper()), ln=True, fill=True)
        pdf.set_text_color(30, 30, 30)
        pdf.set_font(font, "", 10)

    def body_line(text: str, size: int = 10, bold: bool = False, grey: bool = False):
        pdf.set_x(pdf.l_margin)  # always start at left margin so width is never 0
        pdf.set_font(font, "B" if bold else "", size)
        pdf.set_text_color(120, 120, 120) if grey else pdf.set_text_color(30, 30, 30)
        pdf.multi_cell(0, 5 if not bold else 6, safe(text))
        pdf.set_text_color(30, 30, 30)

    if "summary" in sections and content.get("summary"):
        section("Summary")
        body_line(content["summary"])
        pdf.ln(4)

    if "experience" in sections and content.get("experience"):
        section("Experience")
        for exp in content["experience"]:
            position = exp.get("position", "")
            company = exp.get("company", "")
            start = exp.get("startDate", "")
            end = "Present" if exp.get("current") else exp.get("endDate", "")
            date_str = f"  ({start} - {end})" if start else ""
            label = position + (f" - {company}" if company else "") + date_str
            body_line(label, bold=True)
            for bullet in exp.get("bullets", []):
                if str(bullet).strip():
                    body_line(f"  -  {bullet}")
            pdf.ln(2)

    if "education" in sections and content.get("education"):
        section("Education")
        for edu in content["education"]:
            inst = edu.get("institution", "")
            deg = ", ".join(filter(None, [edu.get("degree"), edu.get("field")]))
            end_date = edu.get("endDate", "")
            body_line(inst + (f"  ({end_date})" if end_date else ""), bold=True)
            if deg:
                body_line(deg)
            pdf.ln(2)

    if "skills" in sections:
        skill_names = _skill_names(content)
        if skill_names:
            section("Skills")
            body_line("  -  ".join(skill_names))
            pdf.ln(2)

    if "projects" in sections and content.get("projects"):
        section("Projects")
        for proj in content["projects"]:
            name = proj.get("name", "")
            tech = proj.get("technologies", "")
            label = name + (f"  ({tech})" if tech else "")
            if label.strip():
                body_line(label, bold=True)
            if proj.get("description"):
                body_line(proj["description"])
            pdf.ln(1)
        pdf.ln(1)

    if "certifications" in sections and content.get("certifications"):
        section("Certifications")
        for cert in content["certifications"]:
            name = cert.get("name", "")
            issuer = cert.get("issuer", "")
            date = cert.get("date", "")
            line = name + (f" — {issuer}" if issuer else "") + (f" ({date})" if date else "")
            if line.strip():
                body_line(line)
        pdf.ln(2)

    if "achievements" in sections and content.get("achievements"):
        section("Achievements")
        for a in content["achievements"]:
            if str(a).strip():
                body_line(f"  -  {a}")
        pdf.ln(2)

    if "languages" in sections and content.get("languages"):
        lang_strs = []
        for l in content["languages"]:
            if isinstance(l, dict):
                nm, prof = l.get("name", ""), l.get("proficiency", "")
                if nm:
                    lang_strs.append(f"{nm} ({prof})" if prof else nm)
            elif str(l).strip():
                lang_strs.append(str(l))
        if lang_strs:
            section("Languages")
            body_line("  -  ".join(lang_strs))
            pdf.ln(2)

    if "interests" in sections and content.get("interests"):
        interests = [str(i) for i in content["interests"] if str(i).strip()]
        if interests:
            section("Interests")
            body_line("  -  ".join(interests))

    return bytes(pdf.output())


# ──────────────────────────────────────────────
# DOCX generation via python-docx — the "classic" layout family
# ──────────────────────────────────────────────

def _build_docx(content: dict, title: str, sections: list[str] | None = None) -> bytes:
    """DOCX counterpart of _build_pdf — same `sections`-driven contract."""
    sections = sections if sections is not None else _LEGACY_DEFAULT_SECTIONS
    from docx import Document
    from docx.shared import Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    pi = content.get("personalInfo", {})
    doc = Document()

    # Remove default margins slightly
    for sec in doc.sections:
        sec.top_margin = sec.bottom_margin = Pt(36)
        sec.left_margin = sec.right_margin = Pt(54)

    # Name heading
    name_para = doc.add_paragraph()
    name_para.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = name_para.add_run(pi.get("fullName", title))
    run.font.size = Pt(22)
    run.font.bold = True
    run.font.color.rgb = RGBColor(0x1E, 0x40, 0xAF)

    # Contact
    contact_parts = [s for s in [pi.get("email"), pi.get("phone"), pi.get("location")] if s]
    if contact_parts:
        cp = doc.add_paragraph("  |  ".join(contact_parts))
        cp.runs[0].font.size = Pt(9)
        cp.runs[0].font.color.rgb = RGBColor(0x60, 0x60, 0x60)

    def add_section(heading: str):
        h = doc.add_paragraph(heading.upper())
        run = h.runs[0]
        run.font.bold = True
        run.font.size = Pt(10)
        run.font.color.rgb = RGBColor(0x1E, 0x40, 0xAF)
        h.paragraph_format.space_before = Pt(10)

    if "summary" in sections and content.get("summary"):
        add_section("Summary")
        doc.add_paragraph(content["summary"])

    if "experience" in sections and content.get("experience"):
        add_section("Experience")
        for exp in content["experience"]:
            p = doc.add_paragraph()
            r = p.add_run(f"{exp.get('position', '')} — {exp.get('company', '')}")
            r.font.bold = True
            for bullet in exp.get("bullets", []):
                if bullet.strip():
                    bp = doc.add_paragraph(bullet, style="List Bullet")
                    bp.paragraph_format.left_indent = Pt(18)

    if "education" in sections and content.get("education"):
        add_section("Education")
        for edu in content["education"]:
            p = doc.add_paragraph()
            r = p.add_run(edu.get("institution", ""))
            r.font.bold = True
            deg = ", ".join(filter(None, [edu.get("degree"), edu.get("field")]))
            if deg:
                doc.add_paragraph(deg)

    if "skills" in sections:
        skill_names = _skill_names(content)
        if skill_names:
            add_section("Skills")
            doc.add_paragraph("  •  ".join(skill_names))

    if "projects" in sections and content.get("projects"):
        add_section("Projects")
        for proj in content["projects"]:
            name = proj.get("name", "")
            tech = proj.get("technologies", "")
            if name or tech:
                p = doc.add_paragraph()
                r = p.add_run(name + (f"  ({tech})" if tech else ""))
                r.font.bold = True
            if proj.get("description"):
                doc.add_paragraph(proj["description"])

    if "certifications" in sections and content.get("certifications"):
        add_section("Certifications")
        for cert in content["certifications"]:
            name = cert.get("name", "")
            issuer = cert.get("issuer", "")
            date = cert.get("date", "")
            line = name + (f" — {issuer}" if issuer else "") + (f" ({date})" if date else "")
            if line.strip():
                doc.add_paragraph(line)

    if "achievements" in sections and content.get("achievements"):
        add_section("Achievements")
        for a in content["achievements"]:
            if str(a).strip():
                doc.add_paragraph(str(a), style="List Bullet")

    if "languages" in sections and content.get("languages"):
        lang_strs = []
        for l in content["languages"]:
            if isinstance(l, dict):
                nm, prof = l.get("name", ""), l.get("proficiency", "")
                if nm:
                    lang_strs.append(f"{nm} ({prof})" if prof else nm)
            elif str(l).strip():
                lang_strs.append(str(l))
        if lang_strs:
            add_section("Languages")
            doc.add_paragraph("  •  ".join(lang_strs))

    if "interests" in sections and content.get("interests"):
        interests = [str(i) for i in content["interests"] if str(i).strip()]
        if interests:
            add_section("Interests")
            doc.add_paragraph("  •  ".join(interests))

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ──────────────────────────────────────────────
# "single-column" layout family — Phase 2's five new templates
# (tech-stack, fresher, academic, healthcare, international)
#
# One parameterized PDF function + one parameterized DOCX function shared by
# all five — genuinely distinct output per template via SINGLE_COLUMN_CONFIGS
# (accent color, section heading labels, section order, skill grouping,
# certification emphasis), not five independent implementations. Section
# order/labels here MUST mirror the matching React component exactly (see
# frontend/components/templates/*.tsx docstrings) — that agreement IS the
# section-parity contract; there's no runtime link between them, so keep
# them in sync by hand when either changes.
# ──────────────────────────────────────────────

def _fresher_section_order(has_experience: bool) -> list[str]:
    """Adaptive order (mirrors FresherTemplate.tsx): no large empty
    Experience block — Education and Projects promote when there's none."""
    if has_experience:
        return ["summary", "skills", "experience", "education", "projects",
                 "certifications", "achievements", "interests", "languages"]
    return ["summary", "education", "projects", "skills",
             "certifications", "achievements", "interests", "languages"]


SINGLE_COLUMN_CONFIGS: dict[str, dict] = {
    "tech-stack": {
        "accent": (14, 165, 233), "docx_font": "Calibri",
        "labels": {"summary": "Professional Summary", "skills": "Technical Skills", "experience": "Experience",
                   "projects": "Projects", "certifications": "Certifications", "education": "Education",
                   "achievements": "Achievements", "languages": "Languages", "interests": "Interests"},
        "order": ["summary", "skills", "experience", "projects", "certifications",
                   "education", "achievements", "languages", "interests"],
        "group_skills": True,
    },
    "fresher": {
        "accent": (22, 163, 74), "docx_font": "Calibri",
        "labels": {"summary": "Career Objective", "skills": "Technical Skills", "experience": "Internships & Experience",
                   "education": "Education", "projects": "Projects", "certifications": "Certifications",
                   "achievements": "Achievements", "interests": "Extracurricular Activities", "languages": "Languages"},
        "order": _fresher_section_order,
        "group_skills": False,
    },
    "academic": {
        "accent": (124, 45, 18), "docx_font": "Georgia",
        "labels": {"summary": "Academic Profile", "education": "Education", "skills": "Areas of Expertise",
                   "experience": "Academic & Research Experience", "projects": "Publications & Research Projects",
                   "achievements": "Awards & Honors", "certifications": "Certifications & Professional Development",
                   "languages": "Languages", "interests": "Interests"},
        "order": ["summary", "education", "skills", "experience", "projects",
                   "achievements", "certifications", "languages", "interests"],
        "group_skills": False,
    },
    "healthcare": {
        "accent": (13, 148, 136), "docx_font": "Calibri",
        "labels": {"summary": "Professional Profile", "experience": "Clinical Experience",
                   "certifications": "Licenses & Certifications", "skills": "Clinical Skills", "education": "Education",
                   "projects": "Clinical Training & Projects", "achievements": "Achievements",
                   "languages": "Languages", "interests": "Interests"},
        "order": ["summary", "experience", "certifications", "skills", "education",
                   "projects", "achievements", "languages", "interests"],
        "group_skills": False, "emphasize_certifications": True,
    },
    "international": {
        "accent": (30, 41, 59), "docx_font": "Georgia",
        "labels": {"summary": "Professional Summary", "skills": "Core Competencies", "experience": "Professional Experience",
                   "achievements": "Key Achievements", "education": "Education", "certifications": "Certifications",
                   "projects": "Projects", "languages": "Languages", "interests": "Additional Information"},
        "order": ["summary", "skills", "experience", "achievements", "education",
                   "certifications", "projects", "languages", "interests"],
        "group_skills": False,
    },
}


def _language_strings(content: dict) -> list[str]:
    out = []
    for l in content.get("languages") or []:
        if isinstance(l, dict):
            nm, prof = l.get("name", ""), l.get("proficiency", "")
            if nm:
                out.append(f"{nm} ({prof})" if prof else nm)
        elif str(l).strip():
            out.append(str(l))
    return out


def _build_pdf_single_column(content: dict, title: str, sections: list[str], *, template_id: str) -> bytes:
    from fpdf import FPDF
    from services.skill_categories import group_skills_by_category

    config = SINGLE_COLUMN_CONFIGS[template_id]
    accent = config["accent"]
    labels = config["labels"]
    order_spec = config["order"]
    order = order_spec(bool(content.get("experience"))) if callable(order_spec) else order_spec

    pi = content.get("personalInfo", {})
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_margins(20, 20, 20)
    font, safe = _pdf_font(pdf)

    pdf.set_font(font, "B", 20)
    pdf.set_text_color(*accent)
    pdf.cell(0, 10, safe(pi.get("fullName", title)), ln=True)

    if pi.get("jobTitle"):
        pdf.set_font(font, "", 10)
        pdf.set_text_color(90, 90, 90)
        pdf.cell(0, 6, safe(pi["jobTitle"]), ln=True)

    contact_parts = [s for s in [pi.get("location"), pi.get("phone"), pi.get("email"),
                                    pi.get("linkedin"), pi.get("github"), pi.get("website")] if s]
    if contact_parts:
        pdf.set_font(font, "", 9)
        pdf.set_text_color(120, 120, 120)
        pdf.cell(0, 6, safe("  |  ".join(contact_parts)), ln=True)
    pdf.ln(3)
    pdf.set_text_color(30, 30, 30)

    def section(heading: str):
        pdf.set_font(font, "B", 10)
        pdf.set_text_color(*accent)
        pdf.cell(0, 7, safe(heading.upper()), ln=True)
        pdf.set_draw_color(*accent)
        pdf.set_line_width(0.4)
        y = pdf.get_y()
        pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
        pdf.ln(2)
        pdf.set_text_color(30, 30, 30)
        pdf.set_font(font, "", 10)

    def body_line(text: str, size: int = 10, bold: bool = False, fill: bool = False):
        pdf.set_x(pdf.l_margin)
        pdf.set_font(font, "B" if bold else "", size)
        pdf.set_text_color(30, 30, 30)
        if fill:
            light = tuple(min(255, c + 190) for c in accent)
            pdf.set_fill_color(*light)
        pdf.multi_cell(0, 5 if not bold else 6, safe(text), fill=fill)

    def render_summary():
        if content.get("summary"):
            section(labels["summary"]); body_line(content["summary"]); pdf.ln(3)

    def render_skills():
        names = _skill_names(content)
        if not names:
            return
        section(labels["skills"])
        if config.get("group_skills"):
            for cat, cat_skills in group_skills_by_category(names):
                body_line(f"{cat}: {', '.join(cat_skills)}")
        else:
            body_line("  ·  ".join(names))
        pdf.ln(3)

    def render_experience():
        if not content.get("experience"):
            return
        section(labels["experience"])
        for exp in content["experience"]:
            position, company = exp.get("position", ""), exp.get("company", "")
            start = exp.get("startDate", "")
            end = "Present" if exp.get("current") else exp.get("endDate", "")
            date_str = f"  ({start} - {end})" if start else ""
            body_line(position + (f" - {company}" if company else "") + date_str, bold=True)
            for bullet in exp.get("bullets", []):
                if str(bullet).strip():
                    body_line(f"  -  {bullet}")
            pdf.ln(2)

    def render_education():
        if not content.get("education"):
            return
        section(labels["education"])
        for edu in content["education"]:
            inst, deg = edu.get("institution", ""), ", ".join(filter(None, [edu.get("degree"), edu.get("field")]))
            end_date = edu.get("endDate", "")
            body_line((deg or inst) + (f"  ({end_date})" if end_date else ""), bold=True)
            if deg and inst:
                body_line(inst)
            pdf.ln(2)

    def render_projects():
        if not content.get("projects"):
            return
        section(labels["projects"])
        for proj in content["projects"]:
            name, tech = proj.get("name", ""), proj.get("technologies", "")
            label = name + (f" — {tech}" if tech else "")
            if label.strip():
                body_line(label, bold=True)
            if proj.get("description"):
                body_line(proj["description"])
            pdf.ln(1)
        pdf.ln(1)

    def render_certifications():
        certs = content.get("certifications") or []
        if not certs:
            return
        section(labels["certifications"])
        emphasize = config.get("emphasize_certifications", False)
        for cert in certs:
            name, issuer, date = cert.get("name", ""), cert.get("issuer", ""), cert.get("date", "")
            line = name + (f" — {issuer}" if issuer else "") + (f" ({date})" if date else "")
            if line.strip():
                body_line(line, bold=emphasize, fill=emphasize)
        pdf.ln(2)

    def render_achievements():
        if not content.get("achievements"):
            return
        section(labels["achievements"])
        for a in content["achievements"]:
            if str(a).strip():
                body_line(f"  -  {a}")
        pdf.ln(2)

    def render_languages():
        strs = _language_strings(content)
        if not strs:
            return
        section(labels["languages"])
        body_line("  ·  ".join(strs))
        pdf.ln(2)

    def render_interests():
        items = [str(i) for i in (content.get("interests") or []) if str(i).strip()]
        if not items:
            return
        section(labels["interests"])
        body_line("  ·  ".join(items))

    renderers = {
        "summary": render_summary, "skills": render_skills, "experience": render_experience,
        "education": render_education, "projects": render_projects, "certifications": render_certifications,
        "achievements": render_achievements, "languages": render_languages, "interests": render_interests,
    }
    for key in order:
        if key in sections:
            renderers[key]()

    return bytes(pdf.output())


def _build_docx_single_column(content: dict, title: str, sections: list[str], *, template_id: str) -> bytes:
    from docx import Document
    from docx.shared import Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from services.skill_categories import group_skills_by_category

    config = SINGLE_COLUMN_CONFIGS[template_id]
    accent_rgb = RGBColor(*config["accent"])
    docx_font = config["docx_font"]
    labels = config["labels"]
    order_spec = config["order"]
    order = order_spec(bool(content.get("experience"))) if callable(order_spec) else order_spec

    pi = content.get("personalInfo", {})
    doc = Document()
    for sec in doc.sections:
        sec.top_margin = sec.bottom_margin = Pt(36)
        sec.left_margin = sec.right_margin = Pt(54)

    name_para = doc.add_paragraph()
    name_para.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = name_para.add_run(pi.get("fullName", title))
    run.font.name = docx_font
    run.font.size = Pt(22)
    run.font.bold = True
    run.font.color.rgb = accent_rgb

    if pi.get("jobTitle"):
        jt = doc.add_paragraph()
        r = jt.add_run(pi["jobTitle"])
        r.font.name = docx_font
        r.font.size = Pt(11)
        r.font.color.rgb = RGBColor(0x60, 0x60, 0x60)

    contact_parts = [s for s in [pi.get("location"), pi.get("phone"), pi.get("email"),
                                    pi.get("linkedin"), pi.get("github"), pi.get("website")] if s]
    if contact_parts:
        cp = doc.add_paragraph("  |  ".join(contact_parts))
        cp.runs[0].font.name = docx_font
        cp.runs[0].font.size = Pt(9)
        cp.runs[0].font.color.rgb = RGBColor(0x60, 0x60, 0x60)

    def add_section(heading: str):
        h = doc.add_paragraph(heading.upper())
        run = h.runs[0]
        run.font.name = docx_font
        run.font.bold = True
        run.font.size = Pt(10)
        run.font.color.rgb = accent_rgb
        h.paragraph_format.space_before = Pt(10)
        # (python-docx has no simple paragraph-border API; the accent color +
        # bold + spacing is the heading treatment here, same as the classic builder)

    def add_paragraph(text: str, *, bold: bool = False, style: str | None = None):
        p = doc.add_paragraph(text, style=style) if style else doc.add_paragraph(text)
        for r in p.runs:
            r.font.name = docx_font
            if bold:
                r.font.bold = True
        return p

    def render_summary():
        if content.get("summary"):
            add_section(labels["summary"]); add_paragraph(content["summary"])

    def render_skills():
        names = _skill_names(content)
        if not names:
            return
        add_section(labels["skills"])
        if config.get("group_skills"):
            for cat, cat_skills in group_skills_by_category(names):
                add_paragraph(f"{cat}: {', '.join(cat_skills)}")
        else:
            add_paragraph("  •  ".join(names))

    def render_experience():
        if not content.get("experience"):
            return
        add_section(labels["experience"])
        for exp in content["experience"]:
            p = doc.add_paragraph()
            end = "Present" if exp.get("current") else exp.get("endDate", "")
            dates = f"  ({exp.get('startDate', '')} - {end})" if exp.get("startDate") else ""
            r = p.add_run(f"{exp.get('position', '')} — {exp.get('company', '')}{dates}")
            r.font.name = docx_font
            r.font.bold = True
            for bullet in exp.get("bullets", []):
                if bullet.strip():
                    bp = doc.add_paragraph(bullet, style="List Bullet")
                    bp.paragraph_format.left_indent = Pt(18)
                    for r2 in bp.runs:
                        r2.font.name = docx_font

    def render_education():
        if not content.get("education"):
            return
        add_section(labels["education"])
        for edu in content["education"]:
            p = doc.add_paragraph()
            deg = ", ".join(filter(None, [edu.get("degree"), edu.get("field")]))
            end_date = edu.get("endDate", "")
            r = p.add_run((deg or edu.get("institution", "")) + (f"  ({end_date})" if end_date else ""))
            r.font.name = docx_font
            r.font.bold = True
            if deg and edu.get("institution"):
                add_paragraph(edu["institution"])

    def render_projects():
        if not content.get("projects"):
            return
        add_section(labels["projects"])
        for proj in content["projects"]:
            name, tech = proj.get("name", ""), proj.get("technologies", "")
            if name or tech:
                add_paragraph(name + (f"  ({tech})" if tech else ""), bold=True)
            if proj.get("description"):
                add_paragraph(proj["description"])

    def render_certifications():
        certs = content.get("certifications") or []
        if not certs:
            return
        add_section(labels["certifications"])
        emphasize = config.get("emphasize_certifications", False)
        for cert in certs:
            name, issuer, date = cert.get("name", ""), cert.get("issuer", ""), cert.get("date", "")
            line = name + (f" — {issuer}" if issuer else "") + (f" ({date})" if date else "")
            if line.strip():
                add_paragraph(line, bold=emphasize)

    def render_achievements():
        if not content.get("achievements"):
            return
        add_section(labels["achievements"])
        for a in content["achievements"]:
            if str(a).strip():
                add_paragraph(str(a), style="List Bullet")

    def render_languages():
        strs = _language_strings(content)
        if not strs:
            return
        add_section(labels["languages"])
        add_paragraph("  •  ".join(strs))

    def render_interests():
        items = [str(i) for i in (content.get("interests") or []) if str(i).strip()]
        if not items:
            return
        add_section(labels["interests"])
        add_paragraph("  •  ".join(items))

    renderers = {
        "summary": render_summary, "skills": render_skills, "experience": render_experience,
        "education": render_education, "projects": render_projects, "certifications": render_certifications,
        "achievements": render_achievements, "languages": render_languages, "interests": render_interests,
    }
    for key in order:
        if key in sections:
            renderers[key]()

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _make_single_column_builder(template_id: str) -> "TemplateBuilder":
    def pdf(content: dict, title: str, sections: list[str]) -> bytes:
        return _build_pdf_single_column(content, title, sections, template_id=template_id)

    def docx(content: dict, title: str, sections: list[str]) -> bytes:
        return _build_docx_single_column(content, title, sections, template_id=template_id)

    return TemplateBuilder(pdf=pdf, docx=docx, layout_family="single-column")


# ── Template registry ───────────────────────────────────────────────────────
# modern/professional/minimal/creative/executive stay on the "classic" family
# (unchanged design — see requirement to not touch the existing five). The
# five Phase 2 templates each get a real, visually distinct "single-column"
# builder — see SINGLE_COLUMN_CONFIGS above. Adding a genuinely new layout
# shape later means adding a new family function and repointing that id's
# entry here; callers (export_pdf/export_docx, routers/resumes.py::download_resume)
# never change.

@dataclass
class TemplateBuilder:
    pdf: Callable[[dict, str, list[str]], bytes]
    docx: Callable[[dict, str, list[str]], bytes]
    layout_family: str


def _classic_pdf(content: dict, title: str, sections: list[str]) -> bytes:
    return _build_pdf(content, title, sections)


def _classic_docx(content: dict, title: str, sections: list[str]) -> bytes:
    return _build_docx(content, title, sections)


TEMPLATE_BUILDERS: dict[str, TemplateBuilder] = {
    template_id: (
        _make_single_column_builder(template_id) if template_id in SINGLE_COLUMN_CONFIGS
        else TemplateBuilder(pdf=_classic_pdf, docx=_classic_docx, layout_family=spec["layoutFamily"])
    )
    for template_id, spec in TEMPLATE_SPECS.items()
}
