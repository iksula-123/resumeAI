"""
Phase 3 — dynamic Match/Completeness/Confidence scoring.

This is the ONE place category scores get computed. ATSService.analyze()
(ats_service.py) calls into this module and merges its output alongside the
existing keyword/skills/semantic scores — it does not replace ats_service.py,
it's the new layer that makes every category explainable instead of a bare
percentage.

Core rule, everywhere in this file: a category with insufficient DATA is
"N/A" / excluded, never a silent zero. See CATEGORY_WEIGHTS and
_redistribute_weights().

Everything here is deterministic (no LLM calls) EXCEPT responsibility
matching, which reuses similarity_service.section_similarity() — and that
already degrades to a token-overlap heuristic with no AI key configured, so
this whole module works with zero AI availability, per the "AI failure must
not make ATS unusable" requirement.
"""
import re
from dataclasses import dataclass, field

from . import keyword_engine, similarity_service, text_metrics

# ── Default weights (spec Section 5) — redistributed when a category isn't
# applicable to the given JD, never silently zeroed. ────────────────────────
CATEGORY_WEIGHTS: dict[str, float] = {
    "keyword": 25.0,
    "skills": 20.0,
    "experience": 20.0,
    "responsibility": 15.0,
    "education": 10.0,
    "certifications": 5.0,
    "formatting": 5.0,
}

CATEGORY_LABELS = {
    "keyword": "Keyword Match", "skills": "Skills Match", "experience": "Experience Match",
    "responsibility": "Responsibility Match", "education": "Education Match",
    "certifications": "Certification Match", "formatting": "ATS Formatting",
}

_DEGREE_RANK = [
    (5, ("phd", "doctorate")),
    (4, ("master", "mba", "m.tech", "mtech", "msc", "m.sc", "m.com", "mcom", "postgraduate")),
    (3, ("bachelor", "b.tech", "btech", "bsc", "b.sc", "b.com", "bcom", "b.e", "be ", "bca", "graduate")),
    (2, ("diploma",)),
    (1, ("12th", "hsc", "intermediate", "senior secondary")),
    (0, ("10th", "ssc", "secondary")),
]

# A modest, curated "related but not equivalent" map (spec Section 9) — kept
# deliberately small and honest rather than pretending to be exhaustive.
# Symmetric: checked both directions.
_RELATED_NOT_EQUIVALENT = {
    "javascript": {"typescript"}, "typescript": {"javascript"},
    "react": {"react native", "vue", "angular"}, "vue": {"react", "angular"},
    "sql": {"postgresql", "mysql", "nosql"}, "postgresql": {"sql", "mysql"},
    "python": {"django", "flask"}, "java": {"javascript", "kotlin"},
    "css": {"sass", "tailwind"}, "docker": {"kubernetes"}, "kubernetes": {"docker"},
    "rest api": {"graphql"}, "graphql": {"rest api"},
}

_OVERUSE_THRESHOLD = 6  # a term appearing this many+ times reads as keyword-stuffing, not real depth


@dataclass
class CategoryAnalysis:
    key: str
    label: str
    applicable: bool                     # could this category be evaluated against the JD at all
    match: float | None                  # 0-100, or None ("N/A") when data is too sparse to judge
    completeness: float                  # 0-100 — how much the CANDIDATE provided, independent of match
    confidence: str                      # "high" | "medium" | "low"
    matched_evidence: list[str] = field(default_factory=list)
    missing_evidence: list[str] = field(default_factory=list)
    reason: str = ""
    weight: float = 0.0                  # filled in after redistribution

    def to_dict(self) -> dict:
        return {
            "key": self.key, "label": self.label, "applicable": self.applicable,
            "match": self.match, "completeness": round(self.completeness),
            "confidence": self.confidence, "matched_evidence": self.matched_evidence,
            "missing_evidence": self.missing_evidence, "reason": self.reason,
            "weight": round(self.weight, 1),
        }


def _confidence(completeness: float, has_signal: bool) -> str:
    if not has_signal:
        return "low"
    if completeness >= 70:
        return "high"
    if completeness >= 35:
        return "medium"
    return "low"


# ── Keyword ──────────────────────────────────────────────────────────────────

def _keyword_category(resume: dict, job: dict) -> CategoryAnalysis:
    job_keywords = list(job.get("keywords") or [])
    if not job_keywords:
        return CategoryAnalysis("keyword", CATEGORY_LABELS["keyword"], applicable=False,
                                  match=None, completeness=0, confidence="low",
                                  reason="The job description/role has no extractable keywords to match against.")

    resume_all = list(resume.get("skills") or []) + list(resume.get("hard_skills") or []) + \
                 list(resume.get("soft_skills") or []) + list(resume.get("keywords") or [])
    result = keyword_engine.match_lists(resume_all, job_keywords, resume.get("raw_text", ""))

    # Completeness here = how much searchable text the resume actually offers
    # (summary + bullets + skills) — sparse resumes can't be keyword-matched
    # with confidence even if the few keywords they DO have happen to match.
    text_len = len(resume.get("raw_text", "") or "")
    bullet_count = len(resume.get("bullets") or [])
    completeness = min(100, round((min(text_len, 1500) / 1500) * 60 + min(bullet_count, 8) / 8 * 40))

    return CategoryAnalysis(
        "keyword", CATEGORY_LABELS["keyword"], applicable=True,
        match=result["pct"], completeness=completeness,
        confidence=_confidence(completeness, True),
        matched_evidence=result["found"], missing_evidence=result["missing"],
        reason=f"{len(result['found'])}/{len(job_keywords)} JD keywords found in the resume text.",
    )


# ── Skills ───────────────────────────────────────────────────────────────────

def _skills_category(resume: dict, job: dict) -> CategoryAnalysis:
    job_skills = list(job.get("required_skills") or []) + list(job.get("preferred_skills") or [])
    if not job_skills:
        return CategoryAnalysis("skills", CATEGORY_LABELS["skills"], applicable=False,
                                  match=None, completeness=0, confidence="low",
                                  reason="The job description doesn't list specific required/preferred skills.")

    resume_skills = list(resume.get("skills") or []) + list(resume.get("hard_skills") or [])
    result = keyword_engine.match_lists(resume_skills, job_skills, resume.get("raw_text", ""))
    completeness = min(100, round(len(set(s.lower() for s in resume_skills)) / 8 * 100))

    return CategoryAnalysis(
        "skills", CATEGORY_LABELS["skills"], applicable=True,
        match=result["pct"], completeness=completeness,
        confidence=_confidence(completeness, len(resume_skills) > 0),
        matched_evidence=result["found"], missing_evidence=result["missing"],
        reason=f"{len(result['found'])}/{len(job_skills)} JD skills matched against {len(resume_skills)} listed resume skills.",
    )


def skills_breakdown(resume_skills: list[str], job_skills: list[str], resume_text: str = "") -> dict:
    """Matched / Partially Matched / Missing / Unclear — spec Section 9. Never
    claims a related-but-different skill (e.g. JavaScript) equals the JD's
    ask (e.g. TypeScript)."""
    resume_lc = {s.lower().strip() for s in resume_skills}
    matched, partial, missing = [], [], []
    for js in job_skills:
        js_lc = js.lower().strip()
        if keyword_engine._present(js, resume_skills, resume_text):
            matched.append(js)
            continue
        related = _RELATED_NOT_EQUIVALENT.get(js_lc, set())
        hit = next((r for r in resume_lc if r in related or js_lc in _RELATED_NOT_EQUIVALENT.get(r, set())), None)
        if hit:
            partial.append({"jd_skill": js, "resume_skill": hit, "note": f"{hit} is related to {js} but not equivalent — verify before claiming this skill."})
        else:
            missing.append(js)
    return {"matched": matched, "partial": partial, "missing": missing}


# ── Experience ───────────────────────────────────────────────────────────────

_EXP_CORE_FIELDS = ("title", "company", "duration")


def _experience_completeness(experience: list[dict]) -> float:
    if not experience:
        return 0.0
    ratios = []
    for e in experience:
        filled = sum(1 for f in _EXP_CORE_FIELDS if str(e.get(f) or "").strip())
        has_bullets = 1 if any(str(b).strip() for b in (e.get("bullets") or [])) else 0
        ratios.append((filled + has_bullets) / (len(_EXP_CORE_FIELDS) + 1))
    return round(sum(ratios) / len(ratios) * 100)


def _experience_category(resume: dict, job: dict) -> CategoryAnalysis:
    experience = resume.get("experience") or []
    if not experience:
        return CategoryAnalysis("experience", CATEGORY_LABELS["experience"], applicable=True,
                                  match=None, completeness=0, confidence="low",
                                  missing_evidence=["No work experience entries found on the resume."],
                                  reason="No experience data available — this does not mean the candidate lacks experience, only that none was provided.")

    completeness = _experience_completeness(experience)
    have_years = resume.get("total_experience_years")
    required_years = job.get("min_experience_years")

    matched_evidence = [e.get("title") or e.get("company") or "" for e in experience if (e.get("title") or e.get("company"))]
    missing_evidence = []
    for e in experience:
        gaps = [f for f in ("title", "company", "duration") if not str(e.get(f) or "").strip()]
        if not (e.get("bullets") or []):
            gaps.append("bullets/responsibilities")
        if gaps:
            label = e.get("title") or e.get("company") or "an experience entry"
            missing_evidence.append(f"{label}: missing {', '.join(gaps)}")

    if have_years is None or completeness < 40:
        return CategoryAnalysis(
            "experience", CATEGORY_LABELS["experience"], applicable=True,
            match=None, completeness=completeness, confidence="low",
            matched_evidence=matched_evidence, missing_evidence=missing_evidence,
            reason=("Employment dates aren't available, so total experience can't be calculated. "
                    "This is a data gap, not evidence the candidate lacks the experience.")
            if have_years is None else
            "Experience entries are too sparse (missing title/company/dates/bullets) to confidently score.",
        )

    if required_years is None:
        match = 100.0
        reason = f"Candidate has {have_years:g} years of experience; the JD doesn't state a minimum."
    elif have_years >= required_years:
        match = 100.0
        reason = f"Candidate has {have_years:g} years vs. the {required_years:g}+ required — meets the bar."
    else:
        match = round(max(0.0, have_years / required_years) * 100, 1)
        reason = f"Candidate has {have_years:g} years vs. the {required_years:g}+ required — {required_years - have_years:g} years short."

    confidence = "high" if completeness >= 70 else "medium"
    return CategoryAnalysis(
        "experience", CATEGORY_LABELS["experience"], applicable=True,
        match=match, completeness=completeness, confidence=confidence,
        matched_evidence=matched_evidence, missing_evidence=missing_evidence, reason=reason,
    )


# ── Responsibility (semantic — degrades to token overlap with no AI key) ────

async def _responsibility_category(resume: dict, job: dict) -> CategoryAnalysis:
    responsibilities = job.get("responsibilities") or []
    if not responsibilities:
        return CategoryAnalysis("responsibility", CATEGORY_LABELS["responsibility"], applicable=False,
                                  match=None, completeness=0, confidence="low",
                                  reason="The job description doesn't list specific responsibilities to compare against.")

    bullets = resume.get("bullets") or [b for e in (resume.get("experience") or []) for b in (e.get("bullets") or [])]
    if not bullets:
        return CategoryAnalysis("responsibility", CATEGORY_LABELS["responsibility"], applicable=True,
                                  match=None, completeness=0, confidence="low",
                                  missing_evidence=["No experience bullet points to compare against JD responsibilities."],
                                  reason="No bullet points available — can't assess responsibility overlap without them.")

    sim = await similarity_service.section_similarity(bullets, responsibilities)
    completeness = min(100, round(len(bullets) / 6 * 100))
    return CategoryAnalysis(
        "responsibility", CATEGORY_LABELS["responsibility"], applicable=True,
        match=sim["pct"], completeness=completeness,
        confidence=_confidence(completeness, True),
        reason=f"Semantic overlap between your bullet points and the JD's stated responsibilities ({sim['method']}).",
    )


# ── Education ────────────────────────────────────────────────────────────────

def _degree_rank(text: str) -> int:
    t = (text or "").lower()
    for rank, markers in _DEGREE_RANK:
        if any(m in t for m in markers):
            return rank
    return -1


def _education_completeness(education: list[dict]) -> float:
    if not education:
        return 0.0
    fields = ("degree", "institution", "year")
    ratios = []
    for e in education:
        filled = sum(1 for f in fields if str(e.get(f) or "").strip())
        ratios.append(filled / len(fields))
    return round(sum(ratios) / len(ratios) * 100)


def _education_category(resume: dict, job: dict) -> CategoryAnalysis:
    required_text = job.get("min_education")
    education = resume.get("education") or []
    completeness = _education_completeness(education)

    if not required_text:
        return CategoryAnalysis("education", CATEGORY_LABELS["education"], applicable=False,
                                  match=None, completeness=completeness, confidence="low",
                                  reason="The job description doesn't state a minimum education requirement.")

    if not education:
        return CategoryAnalysis("education", CATEGORY_LABELS["education"], applicable=True,
                                  match=None, completeness=0, confidence="low",
                                  missing_evidence=[f"JD requires \"{required_text}\" — no education entries on the resume."],
                                  reason="No education data provided — this does not mean the candidate lacks the qualification.")

    required_rank = _degree_rank(required_text)
    degrees = [e.get("degree", "") for e in education]
    best_rank = max((_degree_rank(d) for d in degrees), default=-1)

    if best_rank == -1:
        return CategoryAnalysis("education", CATEGORY_LABELS["education"], applicable=True,
                                  match=None, completeness=completeness, confidence="low",
                                  missing_evidence=[f"Couldn't identify a recognizable degree matching \"{required_text}\"."],
                                  reason="Degree text present but not confidently classifiable — not scored as a failure.")

    match = 100.0 if best_rank >= required_rank else round(max(20, 100 - (required_rank - best_rank) * 30), 1)
    reason = (f"\"{degrees[0] or required_text}\" satisfies the \"{required_text}\" requirement."
              if best_rank >= required_rank else
              f"Highest listed qualification is below the stated \"{required_text}\" requirement.")
    if completeness < 100:
        missing = [f for f in ("institution", "year") if not any(str(e.get(f, "")).strip() for e in education)]
        if missing:
            reason += f" ({', '.join(missing)} not provided — doesn't affect the match score, only completeness.)"

    return CategoryAnalysis(
        "education", CATEGORY_LABELS["education"], applicable=True,
        match=match, completeness=completeness,
        confidence="high" if best_rank != -1 else "medium",
        matched_evidence=[degrees[0]] if degrees else [], reason=reason,
    )


# ── Certifications ───────────────────────────────────────────────────────────

def _certifications_category(resume: dict, job: dict) -> CategoryAnalysis:
    job_certs = list(job.get("certifications") or [])
    resume_certs = list(resume.get("certifications") or [])
    if not job_certs:
        return CategoryAnalysis("certifications", CATEGORY_LABELS["certifications"], applicable=False,
                                  match=None, completeness=min(100, len(resume_certs) * 25), confidence="low",
                                  reason="The job description doesn't require specific certifications.")

    result = keyword_engine.match_lists(resume_certs, job_certs, resume.get("raw_text", ""))
    completeness = min(100, len(resume_certs) * 25)
    return CategoryAnalysis(
        "certifications", CATEGORY_LABELS["certifications"], applicable=True,
        match=result["pct"], completeness=completeness,
        confidence=_confidence(completeness, len(resume_certs) > 0),
        matched_evidence=result["found"], missing_evidence=result["missing"],
        reason=f"{len(result['found'])}/{len(job_certs)} JD-required certifications found.",
    )


# ── Formatting (always applicable — self-contained, no JD needed) ───────────

def _formatting_category(resume: dict) -> CategoryAnalysis:
    raw_text = resume.get("raw_text", "") or ""
    result = text_metrics.formatting_score(raw_text)
    return CategoryAnalysis(
        "formatting", CATEGORY_LABELS["formatting"], applicable=True,
        match=float(result["score"]), completeness=100.0, confidence="high" if raw_text.strip() else "low",
        reason=result["note"],
    )


# ── Weight redistribution — the core "never assign zero for missing data" rule ─

def _redistribute_weights(categories: list[CategoryAnalysis]) -> dict:
    """Categories that are applicable AND have a computable match share the
    full 100% of weight, proportional to their default weights. Anything not
    applicable (JD says nothing about it) or not computable (no resume data)
    is excluded from the score entirely — never scored as zero."""
    usable = [c for c in categories if c.applicable and c.match is not None]
    excluded = [c.key for c in categories if not (c.applicable and c.match is not None)]

    if not usable:
        # formatting is always applicable+computable when there's any text at all,
        # so this only happens for a truly empty resume — nothing to score.
        return {"weights": {}, "excluded": excluded}

    total_default = sum(CATEGORY_WEIGHTS[c.key] for c in usable)
    weights = {c.key: (CATEGORY_WEIGHTS[c.key] / total_default) * 100 for c in usable} if total_default > 0 else \
              {c.key: 100 / len(usable) for c in usable}
    for c in categories:
        c.weight = weights.get(c.key, 0.0)
    return {"weights": weights, "excluded": excluded}


# ── Overall score + confidence ───────────────────────────────────────────────

def _overall_confidence(categories: list[CategoryAnalysis], resume: dict, job: dict) -> str:
    scored = [c for c in categories if c.applicable and c.match is not None]
    if not scored:
        return "low"
    high_ratio = sum(1 for c in scored if c.confidence == "high") / len(scored)
    jd_has_content = bool(job.get("raw_text", "").strip()) and len((job.get("raw_text") or "")) > 40
    parser_ok = resume.get("parsed_by") in ("ai", "profile")
    if high_ratio >= 0.6 and jd_has_content and parser_ok:
        return "high"
    if high_ratio >= 0.3 or jd_has_content:
        return "medium"
    return "low"


async def analyze_categories(resume: dict, job: dict) -> dict:
    """The Phase 3 entry point. Returns every category's Match/Completeness/
    Confidence, the redistributed weights, the overall score, and overall
    confidence — all deterministic except responsibility matching (which
    itself degrades gracefully without an AI key)."""
    categories = [
        _keyword_category(resume, job),
        _skills_category(resume, job),
        _experience_category(resume, job),
        await _responsibility_category(resume, job),
        _education_category(resume, job),
        _certifications_category(resume, job),
        _formatting_category(resume),
    ]
    redistribution = _redistribute_weights(categories)

    overall = round(sum(
        (c.match or 0) * (c.weight / 100) for c in categories if c.applicable and c.match is not None
    )) if redistribution["weights"] else 0

    confidence = _overall_confidence(categories, resume, job)

    parts = [f"{c.label} {round(c.match)}%" for c in categories if c.applicable and c.match is not None]
    explanation = (
        f"Your ATS score is {overall} because: " + "; ".join(parts) + "."
        if parts else "Not enough resume or job description data was available to compute a reliable score."
    )
    if redistribution["excluded"]:
        excluded_labels = [CATEGORY_LABELS[k] for k in redistribution["excluded"]]
        explanation += f" ({', '.join(excluded_labels)} excluded — not enough information to evaluate, weight redistributed rather than scored as zero.)"

    return {
        "overall_score": overall,
        "score_confidence": confidence,
        "score_explanation": explanation,
        "categories": {c.key: c.to_dict() for c in categories},
        "weights_used": {k: round(v, 1) for k, v in redistribution["weights"].items()},
        "excluded_categories": redistribution["excluded"],
    }


# ── Keyword categorization (Critical / Important / Optional) ────────────────

def categorize_keywords(resume: dict, job: dict) -> dict:
    resume_all = list(resume.get("skills") or []) + list(resume.get("hard_skills") or []) + \
                 list(resume.get("soft_skills") or []) + list(resume.get("keywords") or [])
    resume_text = resume.get("raw_text", "")

    critical = list(job.get("required_skills") or [])
    important = list(job.get("preferred_skills") or [])
    all_known = {k.lower() for k in critical + important}
    optional = [k for k in (job.get("keywords") or []) if k.lower() not in all_known]

    def split(terms):
        m = keyword_engine.match_lists(resume_all, terms, resume_text)
        return {"matched": m["found"], "missing": m["missing"]}

    # overused: any resume keyword appearing far more than normal usage would suggest
    overused = []
    if resume_text:
        lower = resume_text.lower()
        for term in {t.lower() for t in resume_all if t}:
            count = len(re.findall(r"\b" + re.escape(term) + r"\b", lower))
            if count >= _OVERUSE_THRESHOLD:
                overused.append({"term": term, "count": count, "reason": "Appears unusually often — reads as keyword-stuffing rather than genuine depth."})

    return {
        "critical": split(critical), "important": split(important), "optional": split(optional),
        "overused": overused,
    }


# ── Profile completeness (separate from ATS score — spec Section 14) ───────

def profile_completeness(resume: dict) -> dict:
    education = resume.get("education") or []
    experience = resume.get("experience") or []
    skills = list(resume.get("skills") or []) + list(resume.get("hard_skills") or [])
    projects = resume.get("projects") or []
    certifications = resume.get("certifications") or []
    achievements = resume.get("achievements") or resume.get("bullets") or []

    edu_pct = _education_completeness(education)
    exp_pct = _experience_completeness(experience)
    skills_pct = min(100, round(len(set(s.lower() for s in skills)) / 8 * 100))
    proj_pct = 0
    if projects:
        ratios = [sum(1 for f in ("name", "description", "technologies") if str(p.get(f) or "").strip()) / 3 for p in projects]
        proj_pct = round(sum(ratios) / len(ratios) * 100)
    cert_pct = min(100, len(certifications) * 34)
    ach_pct = min(100, len(resume.get("achievements") or []) * 34)

    parts = {"education": edu_pct, "experience": exp_pct, "skills": skills_pct,
             "projects": proj_pct, "certifications": cert_pct, "achievements": ach_pct}
    overall = round(sum(parts.values()) / len(parts))

    suggestions = []
    if edu_pct < 100 and education:
        suggestions.append("Add institution name and graduation year to your education entries.")
    if exp_pct < 70 and experience:
        suggestions.append("Fill in job titles, companies, dates, and bullet points for your experience.")
    if skills_pct < 70:
        suggestions.append("List more of your genuine skills (aim for 8+) to improve keyword coverage.")
    if not projects:
        suggestions.append("Add a project — even a small one — to strengthen your profile.")
    if not certifications:
        suggestions.append("List any certifications you hold, if applicable.")

    return {"overall": overall, **parts, "suggestions": suggestions}


# ── Prioritized recommendations (deterministic — spec Section 16) ──────────

def build_recommendations(categories: dict, keyword_analysis: dict) -> dict:
    high, medium, low = [], [], []

    for kw in keyword_analysis["critical"]["missing"][:5]:
        high.append({
            "issue": f"Missing critical keyword: \"{kw}\"",
            "why": "The job description lists this as a required skill/keyword.",
            "action": f"Add \"{kw}\" ONLY if you genuinely have experience with it — never fabricate a skill to pass a keyword filter.",
            "impact": "High — required keywords are often used as an initial ATS filter.",
        })

    exp = categories.get("experience", {})
    if exp.get("missing_evidence"):
        high.append({
            "issue": "Experience entries are missing key details",
            "why": exp.get("reason", ""),
            "action": "Add job titles, employment dates, and bullet points to each role.",
            "impact": "High — incomplete experience entries can't be confidently matched against the JD.",
        })

    for kw in keyword_analysis["important"]["missing"][:5]:
        medium.append({
            "issue": f"Missing preferred keyword: \"{kw}\"",
            "why": "Listed as a nice-to-have in the job description.",
            "action": f"Consider adding \"{kw}\" if it genuinely applies to your background.",
            "impact": "Medium — improves match strength but isn't a hard requirement.",
        })

    edu = categories.get("education", {})
    if edu.get("completeness", 100) < 100 and edu.get("match") is not None:
        medium.append({
            "issue": "Education entry is incomplete",
            "why": "Institution name or graduation year is missing.",
            "action": "Add the missing details — this doesn't change your match score but strengthens recruiter trust.",
            "impact": "Medium — affects completeness and recruiter confidence, not the match score itself.",
        })

    fmt = categories.get("formatting", {})
    if fmt.get("match") is not None and fmt["match"] < 70:
        medium.append({
            "issue": "Formatting may reduce ATS parseability",
            "why": fmt.get("reason", ""),
            "action": "Use standard section headings, avoid tables/columns/text boxes, keep bullets consistent.",
            "impact": "Medium — poor formatting can cause an ATS parser to misread or drop content entirely.",
        })

    for item in keyword_analysis["optional"]["missing"][:3]:
        low.append({
            "issue": f"Optional keyword not present: \"{item}\"",
            "why": "Mentioned in the job posting but not marked as required or preferred.",
            "action": f"Only add \"{item}\" if it's genuinely true — optional keywords add little ATS value.",
            "impact": "Low.",
        })
    if keyword_analysis.get("overused"):
        for o in keyword_analysis["overused"][:3]:
            low.append({
                "issue": f"\"{o['term']}\" may be overused ({o['count']}x)",
                "why": o["reason"],
                "action": "Vary your language — repeating a keyword excessively doesn't improve ATS ranking and can look like stuffing to a recruiter.",
                "impact": "Low — cosmetic/credibility risk, not a scoring penalty.",
            })

    return {"high": high, "medium": medium, "low": low}


# ── Candidate questions (deterministic — spec Section 17) ──────────────────

def build_candidate_questions(resume: dict, categories: dict) -> list[str]:
    questions = []
    for e in resume.get("experience") or []:
        label = e.get("company") or e.get("title") or "a previous role"
        if not str(e.get("title") or "").strip():
            questions.append(f"You mentioned working at {label}. What was your job title?")
        if not (e.get("bullets") or []):
            questions.append(f"What did you actually do day-to-day at {label}, and what's one specific accomplishment you're proud of?")
        elif not any(re.search(r"\d", b) for b in e["bullets"]):
            questions.append(f"For your role at {label}, is there a number you can add — team size, users supported, time saved, or percentage improved?")
    if resume.get("total_experience_years") is None and resume.get("experience"):
        questions.append("What were the start and end dates for each role, so we can calculate your total years of experience?")
    edu = categories.get("education", {})
    if edu.get("missing_evidence"):
        questions.append("What institution did you attend and when did you graduate?")
    if not resume.get("skills") and not resume.get("hard_skills"):
        questions.append("What are the top 5-8 skills most relevant to the role you're targeting?")
    return questions[:8]
