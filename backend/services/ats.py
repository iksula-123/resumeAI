import re
from collections import Counter

_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
    "with", "by", "from", "up", "about", "into", "is", "are", "was", "were",
    "be", "been", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "must", "can", "this", "that", "these",
    "those", "i", "you", "he", "she", "it", "we", "they", "what", "which",
    "who", "when", "where", "why", "how", "all", "each", "some", "such", "no",
    "not", "only", "so", "than", "too", "very", "just", "as", "if", "then",
    "your", "our", "their", "its", "also", "etc", "per", "via", "any", "job",
    "work", "role", "team", "company", "experience", "years", "year", "plus",
    "strong", "good", "great", "excellent", "ability", "knowledge", "skills",
    "skill", "working", "work", "new",
}


def _tokenize(text: str) -> list[str]:
    return [
        w
        for w in re.findall(r'\b[a-zA-Z][a-zA-Z+#.]*\b', text.lower())
        if len(w) >= 3 and w not in _STOPWORDS
    ]


def _skill_name(s) -> str:
    if isinstance(s, dict):
        return str(s.get("name", ""))
    return str(s or "")


def _resume_to_text(content: dict) -> str:
    parts: list[str] = []
    pi = content.get("personalInfo", {}) or {}
    parts.append(pi.get("fullName", ""))
    parts.append(pi.get("jobTitle", ""))
    parts.append(content.get("summary", ""))
    for exp in content.get("experience", []) or []:
        parts += [exp.get("position", ""), exp.get("company", "")]
        parts.extend(str(b) for b in (exp.get("bullets", []) or []))
    for edu in content.get("education", []) or []:
        parts += [edu.get("degree", ""), edu.get("field", ""), edu.get("institution", "")]
    for proj in content.get("projects", []) or []:
        parts += [proj.get("name", ""), proj.get("technologies", ""), proj.get("description", "")]
    parts.extend(_skill_name(s) for s in (content.get("skills", []) or []))
    return " ".join(p for p in parts if p)


def score_resume(resume_content: dict, job_description: str) -> dict:
    if not job_description.strip():
        return {"score": 0, "matched": [], "missing": [], "suggestions": ["Paste a job description to get your ATS score"]}

    resume_kw = set(_tokenize(_resume_to_text(resume_content)))
    job_kw_counts = Counter(_tokenize(job_description))

    # Top 30 most-frequent keywords from the job description
    top_jd_kw = [kw for kw, _ in job_kw_counts.most_common(30)]

    matched = [kw for kw in top_jd_kw if kw in resume_kw]
    missing = [kw for kw in top_jd_kw if kw not in resume_kw]

    # Keyword score: 70 points max
    keyword_score = round((len(matched) / len(top_jd_kw)) * 70) if top_jd_kw else 0

    # Section completeness: 30 points max
    completeness = 0
    if resume_content.get("summary"): completeness += 5
    if resume_content.get("experience"): completeness += 10
    if resume_content.get("education"): completeness += 5
    if resume_content.get("skills"): completeness += 10

    total = min(keyword_score + completeness, 99)

    suggestions: list[str] = []
    if not resume_content.get("summary"):
        suggestions.append("Add a professional summary to boost your score by up to 5 points")
    if not resume_content.get("skills"):
        suggestions.append("Add a skills section with keywords from the job description")
    if missing:
        suggestions.append(f"Add missing keywords: {', '.join(missing[:6])}")

    return {
        "score": total,
        "matched": matched[:20],
        "missing": missing[:20],
        "suggestions": suggestions,
    }
