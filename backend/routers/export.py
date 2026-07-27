import io
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

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
    resume_id: str | None = None  # accepted (frontend sends it) but not required


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
    "…": "...", " ": " ",
}


def _pdf_safe(text) -> str:
    text = str(text or "")
    for uni, rep in _UNICODE_MAP.items():
        text = text.replace(uni, rep)
    # drop anything still outside latin-1 so fpdf never raises
    return text.encode("latin-1", "replace").decode("latin-1")


@router.post("/pdf")
async def export_pdf(req: ExportRequest, user=Depends(_auth)):
    pdf_bytes = _build_pdf(req.content, req.title)
    safe_title = req.title.replace(" ", "_")
    upload_bytes(str(user.id), "generated", f"{safe_title}.pdf", pdf_bytes, "application/pdf")
    dispatch(user.id, "resume.exported", {"title": req.title, "format": "pdf"})
    await log_usage_event(str(user.id), "download_pdf", metadata={"title": req.title})
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.pdf"'},
    )


@router.post("/docx")
async def export_docx(req: ExportRequest, user=Depends(_auth)):
    docx_bytes = _build_docx(req.content, req.title)
    safe_title = req.title.replace(" ", "_")
    upload_bytes(
        str(user.id), "generated", f"{safe_title}.docx", docx_bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    dispatch(user.id, "resume.exported", {"title": req.title, "format": "docx"})
    await log_usage_event(str(user.id), "download_docx", metadata={"title": req.title})
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.docx"'},
    )


# ──────────────────────────────────────────────
# PDF generation via fpdf2
# ──────────────────────────────────────────────

def _pdf_font(pdf):
    """Set up Unicode fonts for the PDF and return (family, safe_fn).

    Uses bundled Noto Sans (Latin) as the primary font with Noto Sans Devanagari
    registered as a *fallback*, so English AND Devanagari/Indian scripts both
    render correctly (spec Section 6). Falls back to the latin-1 core font when
    the TTFs aren't bundled. Drop the OFL TTFs into backend/assets/fonts/.
    """
    import os
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


def _build_pdf(content: dict, title: str) -> bytes:
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

    # Summary
    if content.get("summary"):
        section("Summary")
        body_line(content["summary"])
        pdf.ln(4)

    # Experience
    if content.get("experience"):
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

    # Education
    if content.get("education"):
        section("Education")
        for edu in content["education"]:
            inst = edu.get("institution", "")
            deg = ", ".join(filter(None, [edu.get("degree"), edu.get("field")]))
            end_date = edu.get("endDate", "")
            body_line(inst + (f"  ({end_date})" if end_date else ""), bold=True)
            if deg:
                body_line(deg)
            pdf.ln(2)

    # Skills
    skill_names = _skill_names(content)
    if skill_names:
        section("Skills")
        body_line("  -  ".join(skill_names))

    return bytes(pdf.output())


# ──────────────────────────────────────────────
# DOCX generation via python-docx
# ──────────────────────────────────────────────

def _build_docx(content: dict, title: str) -> bytes:
    from docx import Document
    from docx.shared import Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    pi = content.get("personalInfo", {})
    doc = Document()

    # Remove default margins slightly
    for section in doc.sections:
        section.top_margin = section.bottom_margin = Pt(36)
        section.left_margin = section.right_margin = Pt(54)

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

    if content.get("summary"):
        add_section("Summary")
        doc.add_paragraph(content["summary"])

    if content.get("experience"):
        add_section("Experience")
        for exp in content["experience"]:
            p = doc.add_paragraph()
            r = p.add_run(f"{exp.get('position', '')} — {exp.get('company', '')}")
            r.font.bold = True
            for bullet in exp.get("bullets", []):
                if bullet.strip():
                    bp = doc.add_paragraph(bullet, style="List Bullet")
                    bp.paragraph_format.left_indent = Pt(18)

    if content.get("education"):
        add_section("Education")
        for edu in content["education"]:
            p = doc.add_paragraph()
            r = p.add_run(edu.get("institution", ""))
            r.font.bold = True
            deg = ", ".join(filter(None, [edu.get("degree"), edu.get("field")]))
            if deg:
                doc.add_paragraph(deg)

    skill_names = _skill_names(content)
    if skill_names:
        add_section("Skills")
        doc.add_paragraph("  •  ".join(skill_names))

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
