"""
ATS-safe template parse-test (spec Milestone C — "parse-tested against screening
software").

We generate the export PDF, then re-extract its text with pypdf (a real PDF text
parser, the same class of tool ATS/screening software uses). If the name, the
standard section headings, skills, and bullet text all come back as extractable
text, the template is machine-parseable — i.e. text-based (not an image),
single-column, standard headings. This guards against regressions that would make
exports unreadable to an ATS.
"""
import io

from pypdf import PdfReader

from routers.export import _build_pdf, _build_docx

SAMPLE = {
    "personalInfo": {"fullName": "Ranjeet Yadav", "jobTitle": "Sales Executive",
                     "email": "ranjeet@example.com", "phone": "+91 90000 00000",
                     "location": "Mumbai"},
    "summary": "Motivated sales professional with strong communication skills.",
    "experience": [{
        "position": "Sales Executive", "company": "HDFC Bank",
        "startDate": "2023", "endDate": "2024", "current": False,
        "bullets": ["Sold retail banking products to 25 customers daily",
                    "Achieved 120 percent of quarterly target"],
    }],
    "education": [{"institution": "Mumbai University", "degree": "B.Com",
                   "field": "Accounting", "endDate": "2024"}],
    "skills": [{"name": "Sales"}, {"name": "Communication"}, {"name": "MS Excel"}],
    "projects": [], "certifications": [], "languages": [],
}


def _pdf_text(content) -> str:
    pdf_bytes = _build_pdf(content, "Resume")
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join((p.extract_text() or "") for p in reader.pages)


def test_pdf_is_text_based_and_parseable():
    text = _pdf_text(SAMPLE)
    # text-based (an image-only PDF would extract ~nothing)
    assert len(text.strip()) > 100, "PDF produced no extractable text (not ATS-parseable)"


def test_pdf_contains_name_and_contact():
    text = _pdf_text(SAMPLE).lower()
    assert "ranjeet yadav" in text
    assert "ranjeet@example.com" in text


def test_pdf_has_standard_section_headings():
    text = _pdf_text(SAMPLE).upper()
    for heading in ("SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS"):
        assert heading in text, f"missing ATS-standard heading: {heading}"


def test_pdf_contains_skills_and_bullets():
    text = _pdf_text(SAMPLE).lower()
    assert "communication" in text and "ms excel" in text
    assert "sold retail banking products" in text          # bullet survived
    assert "mumbai university" in text                       # education survived


def test_docx_is_generated():
    docx_bytes = _build_docx(SAMPLE, "Resume")
    assert docx_bytes[:2] == b"PK"                           # valid .docx (zip) container
    assert len(docx_bytes) > 1000
