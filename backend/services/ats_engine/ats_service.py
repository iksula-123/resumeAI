"""
ATSService — Stage 6 of the pipeline: the orchestrator.

Combines ResumeParser + JobParser output, KeywordEngine's categorized
matching, and SimilarityService's semantic scores into the full dashboard
payload: every score the spec asks for, each with a `found`/`missing`/`note`
explanation — never a bare number.

Phase 3 (ATS Intelligence): `overall_score` is now computed by
scoring.analyze_categories() — the dynamic Match/Completeness/Confidence
model with weight redistribution (never a flat/hardcoded weighted average,
never silently zeros a category just because data is missing). The original
9-dimension `scores` dict (industry_match, readability_score, etc.) is kept
as supplementary detail — still real, still computed, just no longer the
number that drives the headline score. interview_probability/
hiring_probability are unchanged, still explicitly-labeled heuristics.
"""
import re

from . import keyword_engine, similarity_service, scoring as ats_scoring, ats_intelligence_v2

_DEGREE_RANK = [
    (5, ("phd", "doctorate")),
    (4, ("master", "mba", "m.tech", "mtech", "msc", "m.sc", "postgraduate")),
    (3, ("bachelor", "b.tech", "btech", "bsc", "b.sc", "b.e", "be ", "bca", "graduate")),
    (2, ("diploma",)),
    (1, ("12th", "hsc", "intermediate", "senior secondary")),
    (0, ("10th", "ssc", "secondary")),
]


def _degree_rank(text: str) -> int:
    t = (text or "").lower()
    for rank, markers in _DEGREE_RANK:
        if any(m in t for m in markers):
            return rank
    return -1  # unknown / not stated


def _experience_match(resume: dict, job: dict) -> dict:
    required = job.get("min_experience_years")
    have = resume.get("total_experience_years")

    if required is None:
        return {"pct": 100, "note": "No specific experience requirement stated in the job description."}
    if have is None:
        return {"pct": 50, "note": f"Job asks for {required}+ years — couldn't determine your total experience from the resume (add explicit employment dates)."}
    if have >= required:
        return {"pct": 100, "note": f"You have {have:g} years vs. the {required:g}+ required — meets the requirement."}
    pct = round(max(0, have / required) * 100)
    return {"pct": pct, "note": f"You have {have:g} years vs. the {required:g}+ required — {required - have:g} years short."}


def _education_match(resume: dict, job: dict) -> dict:
    required_text = job.get("min_education")
    if not required_text:
        return {"pct": 100, "note": "No specific education requirement stated in the job description."}

    required_rank = _degree_rank(required_text)
    resume_degrees = [e.get("degree", "") for e in (resume.get("education") or [])]
    best_rank = max((_degree_rank(d) for d in resume_degrees), default=-1)

    if best_rank == -1:
        return {"pct": 40, "note": f"Job wants \"{required_text}\" — couldn't identify a degree on your resume."}
    if best_rank >= required_rank:
        return {"pct": 100, "note": f"Your highest listed qualification meets the \"{required_text}\" requirement."}
    gap = required_rank - best_rank
    pct = max(20, 100 - gap * 30)
    return {"pct": pct, "note": f"Job wants \"{required_text}\" — your highest listed qualification is below that."}


async def _industry_match(resume: dict, job: dict) -> dict:
    industry = job.get("industry")
    if not industry:
        return {"pct": 100, "note": "No specific industry stated in the job description."}
    sim = await similarity_service.overall_similarity(resume.get("raw_text", ""), industry + " " + " ".join(job.get("responsibilities") or []))
    note = f"Semantic match between your resume and the \"{industry}\" industry context ({sim['method']})."
    return {"pct": sim["pct"], "note": note}


_WEIGHTS = {
    "keyword_match": 0.20,
    "required_skills_match": 0.20,
    "experience_match": 0.15,
    "education_match": 0.10,
    "industry_match": 0.10,
    "semantic_similarity": 0.10,
    "formatting_score": 0.05,
    "readability_score": 0.05,
    "recruiter_readiness": 0.05,
}


async def analyze(resume: dict, job: dict) -> dict:
    from . import text_metrics

    kw = keyword_engine.compare(resume, job)
    experience = _experience_match(resume, job)
    education = _education_match(resume, job)
    industry = await _industry_match(resume, job)
    semantic = await similarity_service.overall_similarity(resume.get("raw_text", ""), job.get("raw_text", ""))

    formatting = text_metrics.formatting_score(resume.get("raw_text", ""))
    readability = text_metrics.readability_score(resume.get("raw_text", ""))
    recruiter_readiness = text_metrics.recruiter_readiness_score(resume)

    components = {
        "keyword_match": kw["keyword_match"]["pct"],
        "required_skills_match": kw["required_skills_match"]["pct"],
        "experience_match": experience["pct"],
        "education_match": education["pct"],
        "industry_match": industry["pct"],
        "semantic_similarity": semantic["pct"],
        "formatting_score": formatting["score"],
        "readability_score": readability["score"],
        "recruiter_readiness": recruiter_readiness["score"],
    }
    overall = round(sum(components[k] * w for k, w in _WEIGHTS.items()))

    # Interview/hiring probability are explicitly-labeled ESTIMATES from a
    # transparent formula — never presented as a guarantee or a real
    # statistical prediction, since no one can know that from a resume alone.
    interview_probability = round(
        components["keyword_match"] * 0.25
        + components["required_skills_match"] * 0.25
        + components["experience_match"] * 0.20
        + components["semantic_similarity"] * 0.15
        + components["recruiter_readiness"] * 0.15
    )
    missing_required = len(kw["required_skills_match"]["missing"])
    hiring_probability = max(0, round(interview_probability * 0.75) - missing_required * 3)

    # ── Phase 3: dynamic Match/Completeness/Confidence category analysis ──
    # This — not the fixed 9-dimension weighted average above — is now the
    # canonical `overall_score`. See scoring.py's module docstring.
    category_result = await ats_scoring.analyze_categories(resume, job)
    keyword_analysis = ats_scoring.categorize_keywords(resume, job)
    resume_skills_all = list(resume.get("skills") or []) + list(resume.get("hard_skills") or [])
    job_skills_all = list(job.get("required_skills") or []) + list(job.get("preferred_skills") or [])
    skills_breakdown = ats_scoring.skills_breakdown(resume_skills_all, job_skills_all, resume.get("raw_text", ""))
    profile_completeness = ats_scoring.profile_completeness(resume)
    recommendations = ats_scoring.build_recommendations(category_result["categories"], keyword_analysis)
    candidate_questions = ats_scoring.build_candidate_questions(resume, category_result["categories"])

    # ── Phase B (ATS Intelligence 2.0): dual-score output, computed IN
    # PARALLEL — does not touch overall_score above or anything it derives
    # from. Deterministic, no extra AI/embedding calls beyond what
    # category_result already made for the responsibility category. See
    # ats_intelligence_v2.py's module docstring for exactly what's reused
    # vs. rebuilt and why. ──
    ats_intelligence_v2_result = ats_intelligence_v2.analyze_v2(resume, job)

    return {
        # ── canonical Phase 3 score (dynamic, never hardcoded, never a
        # silent zero for missing data — see scoring.py) ──
        "overall_score": category_result["overall_score"],
        "score_confidence": category_result["score_confidence"],
        "score_explanation": category_result["score_explanation"],
        "category_analysis": category_result["categories"],
        "weights_used": category_result["weights_used"],
        "excluded_categories": category_result["excluded_categories"],
        "keyword_analysis": keyword_analysis,
        "skills_breakdown": skills_breakdown,
        "profile_completeness": profile_completeness,
        "recommendations_prioritized": recommendations,
        "candidate_questions": candidate_questions,
        "scoring_engine_version": ats_intelligence_v2_result["scoring_engine_version"],
        # ── ATS Intelligence 2.0 (Phase B) — dual-score output. Additive only:
        # does NOT change overall_score above or anything the UI currently
        # shows. See docs/ATS_CHANGELOG.md for what this is and isn't yet. ──
        "ats_intelligence_v2": ats_intelligence_v2_result,
        # ── legacy 9-dimension detail — kept as supplementary information,
        # no longer drives `overall_score` (see module docstring) ──
        "legacy_overall_score": overall,
        "scores": {
            "keyword_match": {"pct": components["keyword_match"], **{k: v for k, v in kw["keyword_match"].items() if k != "pct"}},
            "skills_match": {"pct": kw["skills_match"]["pct"], "found": kw["skills_match"]["found"], "missing": kw["skills_match"]["missing"]},
            "experience_match": experience,
            "education_match": education,
            "industry_match": industry,
            "formatting_score": {"pct": formatting["score"], "note": formatting["note"]},
            "readability_score": {"pct": readability["score"], "note": readability["note"]},
            "recruiter_readiness": {"pct": recruiter_readiness["score"], "note": recruiter_readiness["note"]},
            "technologies_match": kw["technologies_match"],
            "certifications_match": kw["certifications_match"],
        },
        "interview_probability": {
            "pct": interview_probability,
            "note": "Estimated from keyword/skills coverage, experience fit, and resume quality — a heuristic signal, not a guarantee.",
        },
        "hiring_probability": {
            "pct": hiring_probability,
            "note": f"A more conservative estimate than interview probability — discounted for {missing_required} missing required skill(s). Actual outcomes depend on factors no resume analysis can capture (competition, interview performance, etc.).",
        },
        "semantic_similarity": semantic,
    }
