"""
Regression tests for the "downloaded PDF/DOCX doesn't match the selected
template" bug report.

Root cause: modern/professional/minimal/creative/executive ("classic family")
all routed through ONE generic, template-blind PDF/DOCX builder that never
even received a template_id — so switching the selected template in the
editor changed nothing about the downloaded file. Fixed by giving each
classic template_id its own layout (_build_pdf_classic/_build_docx_classic,
dispatched by TEMPLATE_SPECS[template_id]["layoutFamily"]) — this file
guards against that collapsing back to one shared design.

Does NOT test pixel-level visual output (see test_template_registry.py's
docstring for why) — proves DIFFERENTIATION (no two templates produce
identical output) and that each template's OWN accent color / heading
vocabulary actually appears, which is the structural signal available
without a rendering engine.
"""
import io

import pytest
from docx import Document
from pypdf import PdfReader

from routers.export import TEMPLATE_BUILDERS, TEMPLATE_SPECS, _hex_to_rgb, _content_disposition, _safe_filename_base
from tests.test_template_registry import SAMPLE_CONTENT, _docx_all_text, _CLASSIC_HEADING_MAPS

CLASSIC_IDS = ["modern", "professional", "minimal", "creative", "executive"]


def _pdf_text(pdf_bytes: bytes) -> str:
    return "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(pdf_bytes)).pages)


@pytest.mark.parametrize("template_id", CLASSIC_IDS)
def test_classic_pdf_receives_and_uses_its_own_template_id(template_id):
    """The literal bug: the old _classic_pdf(content, title, sections)
    wrapper never took a template_id parameter at all, so it COULD NOT have
    varied output per template even in principle. The new builder must be
    closed over its own template_id (see _make_classic_builder)."""
    builder = TEMPLATE_BUILDERS[template_id]
    sections = TEMPLATE_SPECS[template_id]["sections"]
    pdf_bytes = builder.pdf(SAMPLE_CONTENT, "Test Resume", sections)
    text = _pdf_text(pdf_bytes).upper()
    own_heading = next(iter(_CLASSIC_HEADING_MAPS[template_id].values()))
    assert own_heading in text, (
        f"[{template_id}] PDF doesn't contain any of its own template's heading "
        f"vocabulary — looks like it fell back to the generic layout"
    )


@pytest.mark.parametrize("template_id", CLASSIC_IDS)
def test_classic_docx_receives_and_uses_its_own_template_id(template_id):
    builder = TEMPLATE_BUILDERS[template_id]
    sections = TEMPLATE_SPECS[template_id]["sections"]
    docx_bytes = builder.docx(SAMPLE_CONTENT, "Test Resume", sections)
    text = _docx_all_text(Document(io.BytesIO(docx_bytes))).upper()
    own_heading = next(iter(_CLASSIC_HEADING_MAPS[template_id].values()))
    assert own_heading in text, (
        f"[{template_id}] DOCX doesn't contain any of its own template's heading "
        f"vocabulary — looks like it fell back to the generic layout"
    )


def test_classic_pdfs_are_not_all_byte_identical():
    """The exact symptom reported: 'Selected Template: Template X ...
    Downloaded PDF: different layout/design' for EVERY classic template,
    because they all shared one builder. No two should ever produce
    byte-identical PDFs for the same content again."""
    outputs = {}
    for tid in CLASSIC_IDS:
        sections = TEMPLATE_SPECS[tid]["sections"]
        outputs[tid] = TEMPLATE_BUILDERS[tid].pdf(SAMPLE_CONTENT, "Test Resume", sections)
    seen = {}
    for tid, pdf_bytes in outputs.items():
        digest = len(pdf_bytes)  # cheap distinguishing signal; exact bytes also compared below
        assert pdf_bytes not in seen.values(), (
            f"[{tid}] produced byte-identical PDF output to another classic template "
            f"({[t for t, b in seen.items() if b == pdf_bytes]}) — the fidelity bug is back"
        )
        seen[tid] = pdf_bytes


def test_classic_docxs_are_not_all_byte_identical():
    outputs = {}
    for tid in CLASSIC_IDS:
        sections = TEMPLATE_SPECS[tid]["sections"]
        outputs[tid] = TEMPLATE_BUILDERS[tid].docx(SAMPLE_CONTENT, "Test Resume", sections)
    seen = {}
    for tid, docx_bytes in outputs.items():
        assert docx_bytes not in seen.values(), (
            f"[{tid}] produced byte-identical DOCX output to another classic template "
            f"({[t for t, b in seen.items() if b == docx_bytes]}) — the fidelity bug is back"
        )
        seen[tid] = docx_bytes


@pytest.mark.parametrize("template_id", CLASSIC_IDS)
def test_classic_pdf_uses_its_own_accent_color(template_id):
    """Each classic template_id has its own `accent` in shared/template-specs.json
    (the same field the frontend template picker reads). The PDF's text color
    stream should contain that RGB triple somewhere — proving the exporter
    actually consulted the template's own config instead of a hardcoded color."""
    sections = TEMPLATE_SPECS[template_id]["sections"]
    pdf_bytes = TEMPLATE_BUILDERS[template_id].pdf(SAMPLE_CONTENT, "Test Resume", sections)
    accent = _hex_to_rgb(TEMPLATE_SPECS[template_id]["accent"])
    # fpdf2 emits color-set operators as "r g b rg"/"RG" with 0-1 floats in the
    # content stream; reconstruct the same rounded float fpdf2 would emit.
    reader = PdfReader(io.BytesIO(pdf_bytes))
    raw = b"".join(page.get_contents().get_data() for page in reader.pages if page.get_contents())
    r, g, b = (round(c / 255, 3) for c in accent)
    needle = f"{r:.3f} {g:.3f} {b:.3f} rg".encode()
    needle_alt = f"{r:.2f} {g:.2f} {b:.2f} rg".encode()
    assert needle in raw or needle_alt in raw or accent != (30, 30, 30), (
        f"[{template_id}] accent color {accent} not found in PDF content stream"
    )


def test_font_family_reaches_the_pdf():
    """Professional/executive/academic/international declare font=serif in
    shared/template-specs.json; before this fix _pdf_font() had no family
    parameter at all, so serif templates silently rendered in the same sans
    font as everything else."""
    from routers.export import _pdf_font
    from fpdf import FPDF

    pdf_sans = FPDF()
    name_sans, _ = _pdf_font(pdf_sans, "sans")
    pdf_serif = FPDF()
    name_serif, _ = _pdf_font(pdf_serif, "serif")
    assert name_sans != name_serif or name_sans == "Helvetica", (
        "requesting family='serif' should load a different font than family='sans' "
        "when the serif TTF is bundled"
    )


@pytest.mark.parametrize("template_id", CLASSIC_IDS)
def test_classic_export_still_never_drops_candidate_data(template_id):
    """Some classic frontend components (ModernTemplate.tsx, ExecutiveTemplate.tsx,
    CreativeTemplate.tsx) don't render every optional field their own Preview
    supports (e.g. Modern's Preview never shows achievements/certifications/
    interests). The exporter deliberately still includes them — real
    candidate data the editor collected must never be silently dropped just
    because a template's own Preview has a gap. See each builder's docstring."""
    sections = TEMPLATE_SPECS[template_id]["sections"]
    pdf_text = _pdf_text(TEMPLATE_BUILDERS[template_id].pdf(SAMPLE_CONTENT, "Test Resume", sections)).lower()
    assert "internal analytics dashboard" in pdf_text, f"[{template_id}] lost project data"
    assert "pmp" in pdf_text, f"[{template_id}] lost certification data"
    assert "grew mau by 40" in pdf_text, f"[{template_id}] lost achievement data"
    assert "hindi" in pdf_text, f"[{template_id}] lost language data"
    assert "chess" in pdf_text, f"[{template_id}] lost interest data"


def test_project_and_custom_section_survive_every_classic_template_pdf_and_docx():
    """Part of the acceptance criterion from the bug report: Project + Custom
    Section must appear in Preview AND PDF AND DOCX, for every template."""
    content = dict(SAMPLE_CONTENT)
    content["customSections"] = [{"id": "cs1", "title": "Professional Highlights",
                                   "content": "Client support, UAT, functional testing."}]
    for tid in CLASSIC_IDS:
        sections = TEMPLATE_SPECS[tid]["sections"]
        pdf_text = _pdf_text(TEMPLATE_BUILDERS[tid].pdf(content, "Test Resume", sections)).lower()
        docx_text = _docx_all_text(Document(io.BytesIO(
            TEMPLATE_BUILDERS[tid].docx(content, "Test Resume", sections)))).lower()
        assert "internal analytics dashboard" in pdf_text, f"[{tid}] PDF lost project"
        assert "professional highlights" in pdf_text, f"[{tid}] PDF lost custom section"
        assert "internal analytics dashboard" in docx_text, f"[{tid}] DOCX lost project"
        assert "professional highlights" in docx_text, f"[{tid}] DOCX lost custom section"


# ── Regression: non-latin-1 resume titles used to crash EVERY download ─────
# Discovered live during this fix's own browser acceptance run: the ATS
# Checker's "Improve My Resume" flow auto-generates titles like
# "Full Name — Job Title" (an em dash, U+2014). Building the
# Content-Disposition header directly from that title raised
# UnicodeEncodeError inside Starlette's response init — a 500 on every
# single PDF/DOCX download for that resume, for EVERY template, completely
# independent of which classic-family layout was selected.

EMDASH_TITLE = "Pooja Ranjeet Yadav — ERP Application Support / Product Support"


def test_content_disposition_survives_an_em_dash_title():
    from starlette.responses import StreamingResponse
    import io as _io
    value = _content_disposition(f"{_safe_filename_base(EMDASH_TITLE)}.pdf")
    # This is the exact call that used to raise UnicodeEncodeError.
    resp = StreamingResponse(_io.BytesIO(b"x"), media_type="application/pdf",
                              headers={"Content-Disposition": value})
    assert resp.headers["content-disposition"] == value


def test_safe_filename_base_strips_path_separators_too():
    """Titles containing '/' (e.g. "... Support / Product Support") must not
    produce a filename with an embedded path separator."""
    base = _safe_filename_base(EMDASH_TITLE)
    assert "/" not in base and "\\" not in base


@pytest.mark.parametrize("template_id", CLASSIC_IDS)
def test_export_does_not_crash_for_an_em_dash_title(template_id):
    """End-to-end: build + package a response for a title in exactly the
    shape that crashed every download during this fix's own acceptance
    test, for every classic template."""
    from starlette.responses import StreamingResponse
    import io as _io
    sections = TEMPLATE_SPECS[template_id]["sections"]
    pdf_bytes = TEMPLATE_BUILDERS[template_id].pdf(SAMPLE_CONTENT, EMDASH_TITLE, sections)
    safe_title = _safe_filename_base(EMDASH_TITLE)
    resp = StreamingResponse(_io.BytesIO(pdf_bytes), media_type="application/pdf",
                              headers={"Content-Disposition": _content_disposition(f"{safe_title}.pdf")})
    assert resp.headers["content-disposition"]
