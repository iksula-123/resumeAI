"""
KeywordEngine — Stage 3 of the ATS pipeline.

Deterministic (non-LLM) fuzzy matching between resume-side and JD-side term
lists. Runs locally (rapidfuzz, already a project dependency) — no API cost,
and the "found"/"missing" lists are exact and reproducible for the same input.
"""
from rapidfuzz import fuzz

MATCH_THRESHOLD = 85


def _normalize(s: str) -> str:
    return (s or "").strip().lower()


def _present(term: str, haystack: list[str], haystack_text: str) -> bool:
    """A JD term counts as 'found' if it fuzzy-matches a resume term, or appears
    as a substring in the resume's full text (catches terms the parser didn't
    lift into a discrete list, e.g. inside a bullet point)."""
    t = _normalize(term)
    if not t:
        return False
    if t in haystack_text:
        return True
    for h in haystack:
        if fuzz.token_set_ratio(t, _normalize(h)) >= MATCH_THRESHOLD:
            return True
    return False


def match_lists(resume_items: list[str], job_items: list[str], resume_text: str = "") -> dict:
    """Compare one category (e.g. skills, technologies) between resume and JD."""
    job_items = [j for j in dict.fromkeys(job_items) if j and j.strip()]  # dedupe, keep order
    if not job_items:
        return {"pct": 100, "found": [], "missing": []}  # JD stated nothing in this category — nothing to be missing

    haystack_text = _normalize(resume_text)
    found, missing = [], []
    for term in job_items:
        if _present(term, resume_items, haystack_text):
            found.append(term)
        else:
            missing.append(term)

    pct = round(len(found) / len(job_items) * 100)
    return {"pct": pct, "found": found, "missing": missing}


def compare(resume: dict, job: dict) -> dict:
    """Full categorized comparison used by ATSService."""
    resume_text = resume.get("raw_text", "")

    resume_all_skills = list(resume.get("skills") or []) + list(resume.get("hard_skills") or []) + list(resume.get("soft_skills") or [])
    job_all_skills = list(job.get("required_skills") or []) + list(job.get("preferred_skills") or [])

    skills_match = match_lists(resume_all_skills, job_all_skills, resume_text)
    # required-only view for a stricter "must-have" signal used in the composite score
    required_match = match_lists(resume_all_skills, list(job.get("required_skills") or []), resume_text)

    technologies_match = match_lists(resume_all_skills, list(job.get("technologies") or []), resume_text)
    certifications_match = match_lists(list(resume.get("certifications") or []), list(job.get("certifications") or []), resume_text)

    keyword_match = match_lists(
        resume_all_skills + list(resume.get("keywords") or []),
        list(job.get("keywords") or []),
        resume_text,
    )

    return {
        "keyword_match": keyword_match,
        "skills_match": skills_match,
        "required_skills_match": required_match,
        "technologies_match": technologies_match,
        "certifications_match": certifications_match,
    }
