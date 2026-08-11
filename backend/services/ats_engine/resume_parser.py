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


# ── Build parsed-resume shape directly from the Resume Builder's own content ──
# (Career Vault path — the candidate already entered this via the builder, so
# there's nothing to extract or guess: no AI call, no re-parsing, no risk of
# the LLM mangling data the candidate already confirmed.)

_SOFT_SKILL_TERMS = {
    "communication", "leadership", "teamwork", "collaboration", "problem solving",
    "problem-solving", "critical thinking", "time management", "adaptability",
    "creativity", "work ethic", "attention to detail", "public speaking",
    "negotiation", "conflict resolution", "mentoring", "coaching", "empathy",
    "decision making", "decision-making", "stakeholder management", "presentation",
}


def _years_from_date(s: str) -> int | None:
    m = re.search(r"(19|20)\d{2}", s or "")
    return int(m.group(0)) if m else None


def _estimate_total_experience(experience: list[dict]) -> float | None:
    """Career span (earliest start → latest end/'now') in years — robust to
    overlapping roles, unlike summing each job's duration."""
    import datetime as _dt

    starts, ends = [], []
    for e in experience or []:
        sy = _years_from_date(e.get("startDate") or "")
        if sy:
            starts.append(sy)
        if e.get("current"):
            ends.append(_dt.date.today().year)
        else:
            ey = _years_from_date(e.get("endDate") or "")
            if ey:
                ends.append(ey)
    if not starts or not ends:
        return None
    span = max(ends) - min(starts)
    return float(span) if span > 0 else 0.5  # same-year roles: at least a few months


def from_content(content: dict) -> dict:
    """Turn the Resume Builder's structured `content` blob into the same shape
    `parse()` returns from raw text — used for a candidate's saved resume, so
    the ATS engine can run without re-extracting anything via AI."""
    content = content or {}
    personal = content.get("personalInfo") or {}
    skills_raw = content.get("skills") or []
    skill_names = [s.get("name") if isinstance(s, dict) else str(s) for s in skills_raw]
    skill_names = [s.strip() for s in skill_names if s and str(s).strip()]

    soft_skills = [s for s in skill_names if s.lower() in _SOFT_SKILL_TERMS]
    hard_skills = [s for s in skill_names if s.lower() not in _SOFT_SKILL_TERMS]

    experience = []
    all_bullets: list[str] = []
    for e in content.get("experience") or []:
        bullets = [b for b in (e.get("bullets") or []) if str(b).strip()]
        all_bullets.extend(bullets)
        end = "Present" if e.get("current") else (e.get("endDate") or "")
        experience.append({
            "title": e.get("position") or "",
            "company": e.get("company") or "",
            "duration": f"{e.get('startDate') or ''} – {end}".strip(" –"),
            "bullets": bullets,
        })

    projects = []
    for p in content.get("projects") or []:
        techs = p.get("technologies") or ""
        tech_list = [t.strip() for t in techs.split(",") if t.strip()] if isinstance(techs, str) else list(techs)
        projects.append({
            "name": p.get("name") or "",
            "description": p.get("description") or "",
            "technologies": tech_list,
        })

    education = [
        {
            "degree": e.get("degree") or "",
            "institution": e.get("institution") or "",
            "year": e.get("endDate") or e.get("startDate") or "",
        }
        for e in content.get("education") or []
    ]

    certifications = [c.get("name") or "" for c in (content.get("certifications") or []) if c.get("name")]

    words = re.findall(r"\b[a-zA-Z][a-zA-Z+#.]*\b", " ".join(all_bullets))
    action_verbs = sorted({w for w in {w.lower() for w in words} if w in _ACTION_VERBS})

    tech_keywords = [t for p in projects for t in p["technologies"]]
    keywords = list(dict.fromkeys([*skill_names, *tech_keywords, *certifications]))[:25]

    raw_text_parts = [
        personal.get("fullName", ""), personal.get("jobTitle", ""), content.get("summary", ""),
        *[f"{e['title']} {e['company']} {' '.join(e['bullets'])}" for e in experience],
        *[f"{p['name']} {p['description']} {' '.join(p['technologies'])}" for p in projects],
        *[f"{e['degree']} {e['institution']}" for e in education],
        ", ".join(skill_names), ", ".join(certifications),
        personal.get("email", ""), personal.get("phone", ""),
    ]
    raw_text = "\n".join(p for p in raw_text_parts if p)

    return {
        "full_name": personal.get("fullName") or None,
        "email": personal.get("email") or None,
        "phone": personal.get("phone") or None,
        "location": personal.get("location") or None,
        "job_title": personal.get("jobTitle") or None,
        "summary": content.get("summary") or None,
        "skills": skill_names,
        "hard_skills": hard_skills,
        "soft_skills": soft_skills,
        "experience": experience,
        "projects": projects,
        "education": education,
        "certifications": certifications,
        "action_verbs": action_verbs,
        "keywords": keywords,
        "total_experience_years": _estimate_total_experience(content.get("experience") or []),
        "bullets": all_bullets,
        "raw_text": raw_text,
        "languages": [
            {"name": lang.get("name", ""), "proficiency": lang.get("proficiency", "")}
            for lang in (content.get("languages") or [])
            if lang.get("name")
        ],
        "achievements": [a for a in (content.get("achievements") or []) if a],
        "interests": [i for i in (content.get("interests") or []) if i],
        "parsed_by": "profile",  # from the candidate's saved Career Vault resume, not AI-extracted
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
