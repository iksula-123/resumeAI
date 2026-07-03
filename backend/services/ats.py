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


def analyze_resume(content: dict) -> dict:
    """General ATS-readiness analysis (no job description needed).

    Scores structure, quantified impact, skills, and completeness, and returns
    actionable recommendations. Returns {score, breakdown, recommendations}.
    """
    content = content or {}
    pi = content.get("personalInfo", {}) or {}
    experience = content.get("experience", []) or []
    education = content.get("education", []) or []
    skills = content.get("skills", []) or []
    summary = content.get("summary", "") or ""

    recs: list[str] = []

    # Contact completeness (10)
    contact_fields = [pi.get("fullName"), pi.get("email"), pi.get("phone"), pi.get("location")]
    contact = round(sum(1 for f in contact_fields if f) / len(contact_fields) * 10)
    if contact < 10:
        recs.append("Complete your contact details (name, email, phone, location).")

    # Summary (15)
    if len(summary) >= 120:
        summary_score = 15
    elif summary:
        summary_score = 8
        recs.append("Expand your professional summary to 2-3 impactful sentences.")
    else:
        summary_score = 0
        recs.append("Add a professional summary — it's the first thing recruiters read.")

    # Experience + quantified bullets (30)
    all_bullets = [b for e in experience for b in (e.get("bullets") or []) if b.strip()]
    exp_score = 0
    if experience:
        exp_score += 10
        quantified = sum(1 for b in all_bullets if re.search(r"\d", b))
        ratio = quantified / len(all_bullets) if all_bullets else 0
        exp_score += round(ratio * 20)
        if ratio < 0.5:
            recs.append("Add numbers/metrics to more bullet points (%, $, time saved, scale).")
        if all_bullets and len(all_bullets) < 2 * len(experience):
            recs.append("Add more bullet points to each role (aim for 3-5 per position).")
    else:
        recs.append("Add your work experience with achievement-focused bullet points.")

    # Skills (20)
    n_skills = len(skills)
    skills_score = min(20, n_skills * 2)
    if n_skills < 6:
        recs.append("List at least 6-10 relevant skills to pass keyword filters.")

    # Education (10)
    edu_score = 10 if education else 0
    if not education:
        recs.append("Add your education section.")

    # Action verbs (15)
    action_verbs = ("led", "built", "developed", "designed", "improved", "increased",
                    "reduced", "launched", "managed", "created", "delivered", "optimized",
                    "implemented", "drove", "achieved", "spearheaded")
    strong = sum(1 for b in all_bullets if b.strip().split() and b.strip().split()[0].lower() in action_verbs)
    verb_ratio = strong / len(all_bullets) if all_bullets else 0
    verb_score = round(verb_ratio * 15)
    if all_bullets and verb_ratio < 0.6:
        recs.append("Start more bullets with strong action verbs (Led, Built, Increased…).")

    total = contact + summary_score + exp_score + skills_score + edu_score + verb_score
    total = max(0, min(total, 99))

    if not recs:
        recs.append("Great job — your resume is well-structured and ATS-ready!")

    return {
        "score": total,
        "breakdown": {
            "Contact": round(contact / 10 * 100),
            "Summary": round(summary_score / 15 * 100),
            "Experience": round(exp_score / 30 * 100),
            "Skills": round(skills_score / 20 * 100),
            "Education": edu_score * 10,
            "Action Verbs": round(verb_score / 15 * 100),
        },
        "recommendations": recs[:6],
    }


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
