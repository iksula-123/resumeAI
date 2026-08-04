"""
ResumeParser — Stage 1 of the ATS pipeline.

extract_text(): pulls raw text out of an uploaded PDF/DOCX/TXT file.
parse(): turns raw resume text into structured data via the LLM (skills,
experience, projects, education, certifications, soft/hard skills, action
verbs, ATS keywords) — falls back to a regex heuristic if no AI key is set
or the call fails, so the endpoint never hard-fails.
"""
import io
import re

from .llm import chat_json

_ACTION_VERBS = {
    "led", "built", "developed", "designed", "improved", "increased", "reduced",
    "launched", "managed", "created", "delivered", "optimized", "implemented",
    "drove", "achieved", "spearheaded", "architected", "engineered", "streamlined",
    "automated", "negotiated", "mentored", "coordinated", "analyzed", "resolved",
    "handled", "executed", "established", "generated", "collaborated", "authored",
}
_WEAK_WORDS = {
    "responsible for", "helped with", "worked on", "assisted with", "duties included",
    "involved in", "tasked with", "familiar with", "exposure to", "participated in",
}


def extract_text(filename: str, data: bytes) -> str:
    """Extract raw text from an uploaded resume file (.pdf, .docx, .doc, .txt)."""
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    if name.endswith(".docx"):
        import docx
        doc = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs)
    # .txt or unknown — best-effort decode
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("latin-1", errors="ignore")


_SECTION_RE = re.compile(
    r"^(experience|work experience|employment|education|skills|projects|certifications?|summary|objective)\s*:?$",
    re.IGNORECASE,
)


def _heuristic_parse(text: str) -> dict:
    """No-AI fallback: coarse section/keyword detection so the pipeline still returns data."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    words = re.findall(r"\b[a-zA-Z][a-zA-Z+#.]*\b", text)
    lower_words = {w.lower() for w in words}

    action_verbs_found = sorted({w for w in lower_words if w in _ACTION_VERBS})
    bullets = [l for l in lines if l.startswith(("-", "•", "*")) or re.match(r"^\d+[.)]", l)]

    return {
        "full_name": None,
        "email": None,
        "phone": None,
        "location": None,
        "job_title": None,
        "summary": None,
        "skills": [],
        "hard_skills": [],
        "soft_skills": [],
        "experience": [],
        "projects": [],
        "education": [],
        "certifications": [],
        "action_verbs": action_verbs_found,
        "keywords": [],
        "total_experience_years": None,
        "bullets": bullets,
        "raw_text": text,
        "parsed_by": "heuristic",
    }


_PARSE_PROMPT = """You are an expert resume parser for an ATS system. Extract structured \
data from the resume text below. Be exhaustive but only include what's actually present \
— never invent skills, employers, or dates that aren't in the text.

Return a single JSON object with exactly these keys:
- "full_name": the candidate's name as it appears on the resume, or null
- "email": the candidate's email, or null
- "phone": the candidate's phone number, or null
- "location": the candidate's city/location, or null
- "job_title": the candidate's current or most recent job title, or null
- "summary": the resume's existing professional summary/objective text, or null if none
- "skills": array of every skill mentioned (technical + soft), deduplicated
- "hard_skills": array of technical/tools/software skills only
- "soft_skills": array of soft skills only (communication, leadership, etc.)
- "experience": array of {{"title": str, "company": str, "duration": str, "bullets": [str]}}
- "projects": array of {{"name": str, "description": str, "technologies": [str]}}
- "education": array of {{"degree": str, "institution": str, "year": str}}
- "certifications": array of certification names mentioned
- "action_verbs": array of the action verbs actually used to start bullet points (e.g. "Led", "Built")
- "keywords": array of 15-25 ATS-relevant keywords/phrases from the resume (skills, tools, domains)
- "total_experience_years": estimated total years of professional experience as a number, or null if unclear

Resume text:
\"\"\"
{text}
\"\"\"
"""


async def parse(text: str) -> dict:
    text = (text or "").strip()
    if not text:
        return _heuristic_parse("")

    result = await chat_json(_PARSE_PROMPT.format(text=text[:12000]), max_tokens=2000)
    if result is None:
        return _heuristic_parse(text)

    result.setdefault("full_name", None)
    result.setdefault("email", None)
    result.setdefault("phone", None)
    result.setdefault("location", None)
    result.setdefault("job_title", None)
    result.setdefault("summary", None)
    result.setdefault("skills", [])
    result.setdefault("hard_skills", [])
    result.setdefault("soft_skills", [])
    result.setdefault("experience", [])
    result.setdefault("projects", [])
    result.setdefault("education", [])
    result.setdefault("certifications", [])
    result.setdefault("action_verbs", [])
    result.setdefault("keywords", [])
    result.setdefault("total_experience_years", None)
    result["raw_text"] = text
    result["parsed_by"] = "ai"
    return result
