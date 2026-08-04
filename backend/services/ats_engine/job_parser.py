"""
JobParser — Stage 2 of the ATS pipeline.

Turns a pasted job description into structured data (required/preferred
skills, responsibilities, experience, industry, keywords, technologies,
certifications) via the LLM, falling back to a lightweight keyword heuristic
if no AI key is set or the call fails.
"""
import re

from .llm import chat_json

_REQUIRED_MARKERS = ("required", "must have", "you have", "requirements")
_PREFERRED_MARKERS = ("preferred", "nice to have", "bonus", "plus")


def _heuristic_parse(text: str) -> dict:
    lower = text.lower()
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    bullets = [l.lstrip("-•* ").strip() for l in lines if l.startswith(("-", "•", "*"))]

    required, preferred = [], []
    for b in bullets:
        bl = b.lower()
        if any(m in bl for m in _PREFERRED_MARKERS):
            preferred.append(b)
        else:
            required.append(b)

    years_match = re.search(r"(\d+)\+?\s*(?:to\s*\d+\s*)?years?", lower)
    min_exp = float(years_match.group(1)) if years_match else None

    return {
        "job_title": lines[0] if lines else None,
        "required_skills": [],
        "preferred_skills": [],
        "responsibilities": required[:10],
        "min_experience_years": min_exp,
        "min_education": None,
        "industry": None,
        "keywords": [],
        "technologies": [],
        "certifications": [],
        "raw_text": text,
        "parsed_by": "heuristic",
    }


_PARSE_PROMPT = """You are an expert technical recruiter and ATS analyst. Extract structured \
data from the job description below. Only include what's actually stated or clearly implied \
— never invent requirements.

Return a single JSON object with exactly these keys:
- "job_title": the job title, or null if not stated
- "required_skills": array of must-have skills/technologies
- "preferred_skills": array of nice-to-have / bonus skills
- "responsibilities": array of the core day-to-day responsibilities (5-10 items)
- "min_experience_years": minimum years of experience required as a number, or null if unclear
- "min_education": the minimum education level stated (e.g. "Bachelor's degree", "12th pass"), or null if unclear
- "industry": the industry/domain this role is in (e.g. "Fintech", "E-commerce"), or null
- "keywords": array of 15-25 ATS-relevant keywords/phrases from the posting
- "technologies": array of specific tools/technologies/platforms named
- "certifications": array of certifications mentioned as required or preferred

Job description:
\"\"\"
{text}
\"\"\"
"""


async def parse(text: str) -> dict:
    text = (text or "").strip()
    if not text:
        return _heuristic_parse("")

    result = await chat_json(_PARSE_PROMPT.format(text=text[:12000]), max_tokens=1800)
    if result is None:
        return _heuristic_parse(text)

    result.setdefault("job_title", None)
    result.setdefault("required_skills", [])
    result.setdefault("preferred_skills", [])
    result.setdefault("responsibilities", [])
    result.setdefault("min_experience_years", None)
    result.setdefault("min_education", None)
    result.setdefault("industry", None)
    result.setdefault("keywords", [])
    result.setdefault("technologies", [])
    result.setdefault("certifications", [])
    result["raw_text"] = text
    result["parsed_by"] = "ai"
    return result
