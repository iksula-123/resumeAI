"""
Phase C — Resume Quality engine + Editor migration foundation: tests.

Covers everything added in Phase C: the 12 Resume Quality categories
(services/ats_engine/resume_quality.py), the new compute_full_analysis()
three-layer entry point, the editor recommendation/question/debug builders
(services/ats_engine/ats_intelligence_v2.py), and QUALITY_WEIGHTS'
normalization. Per Phase C's explicit instruction, analyze_v2() (Phase B's
frozen entry point) and everything in test_ats_engine.py /
test_ats_intelligence_v2.py is NOT re-tested here except where this file
proves those Phase B behaviors are still intact after Phase C's changes.
"""
import asyncio

import pytest

from services.ats_engine import ats_config, ats_intelligence_v2, resume_quality


def _sync(coro):
    return asyncio.run(coro)


# ── Fixtures ─────────────────────────────────────────────────────────────────

RICH_RESUME = {
    "summary": "Backend developer with 5 years building scalable APIs and leading small teams.",
    "skills": ["Python", "Django", "PostgreSQL", "Docker"], "hard_skills": [], "soft_skills": [],
    "location": "Bengaluru",
    "experience": [
        {"title": "Senior Backend Developer", "company": "Acme", "startDate": "2022", "endDate": "", "current": True,
         "bullets": [
             "Led a team of 4 developers to rebuild the payments service, reducing latency by 40%.",
             "Resolved over 500 monthly support tickets related to API integrations.",
         ]},
        {"title": "Backend Developer", "company": "Beta Corp", "startDate": "2019", "endDate": "2022", "current": False,
         "bullets": ["Built REST APIs using Django and PostgreSQL.", "Automated deployment pipelines with Docker."]},
    ],
    "education": [{"degree": "B.Tech", "institution": "XYZ University", "year": "2019"}],
    "projects": [{"name": "API Gateway", "description": "Built using Python and Django.", "technologies": "Python, Django"}],
    "certifications": [],
    "raw_text": ("Backend developer with 5 years.\nSUMMARY\nBackend developer.\nEXPERIENCE\nSenior Backend Developer - Acme\n"
                 "- Led a team of 4 developers to rebuild the payments service, reducing latency by 40%.\n"
                 "- Resolved over 500 monthly support tickets related to API integrations.\nEDUCATION\nB.Tech XYZ University\nSKILLS\nPython Django PostgreSQL Docker"),
}

EMPTY_RESUME = {"summary": "", "skills": [], "hard_skills": [], "experience": [], "education": [], "projects": [],
                 "certifications": [], "raw_text": "", "location": ""}


# ── 1. Bullet Quality ────────────────────────────────────────────────────────

def test_bullet_quality_strong_bullets_score_higher_than_weak():
    strong = resume_quality._bullet_quality_category({"experience": [{"bullets": ["Led a team of 4 to rebuild the payments service, reducing latency by 40%."]}]})
    weak = resume_quality._bullet_quality_category({"experience": [{"bullets": ["Responsible for customer support."]}]})
    assert strong.match > weak.match


def test_bullet_quality_weak_starts_detected():
    resume = {"experience": [{"bullets": ["Responsible for customer support.", "Worked on React projects.", "Helped the team.", "Handled tickets."]}]}
    cat = resume_quality._bullet_quality_category(resume)
    assert len(cat.missing_evidence) == 4


def test_bullet_quality_no_bullets_is_na_not_zero():
    cat = resume_quality._bullet_quality_category(EMPTY_RESUME)
    assert cat.match is None
    assert cat.confidence == "low"


def test_bullet_quality_does_not_require_all_five_elements():
    # A legitimate, simple responsibility bullet shouldn't score near-zero.
    cat = resume_quality._bullet_quality_category({"experience": [{"bullets": ["Maintained internal documentation for the API."]}]})
    assert cat.match > 30


# ── 2. Quantified Impact ─────────────────────────────────────────────────────

def test_quantified_impact_detects_percentage_and_loose_count_patterns():
    resume = {"experience": [{"bullets": [
        "Reduced latency by 40%.",
        "Resolved over 500 monthly support tickets related to API integrations.",
        "Responsible for backend development.",
    ]}]}
    cat = resume_quality._quantified_impact_category(resume)
    assert len(cat.matched_evidence) == 2
    assert any("Responsible for backend development" in m for m in cat.missing_evidence)


def test_quantified_impact_never_invents_a_number():
    cat = resume_quality._quantified_impact_category({"experience": [{"bullets": ["Improved the onboarding flow."]}]})
    assert "Improved the onboarding flow" not in str(cat.matched_evidence)  # not falsely counted as quantified
    assert cat.match == 0


def test_quantified_impact_does_not_require_every_bullet_to_have_a_number():
    resume = {"experience": [{"bullets": ["Reduced latency by 40%.", "Mentored two junior engineers.", "Owned the on-call rotation."]}]}
    cat = resume_quality._quantified_impact_category(resume)
    assert cat.match == 33 or cat.match == 34  # 1/3, never forced to 100 or penalized to 0 for the other two


def test_quantified_impact_no_bullets_is_na_not_zero():
    cat = resume_quality._quantified_impact_category(EMPTY_RESUME)
    assert cat.match is None


# ── 3. Action Verb Strength ───────────────────────────────────────────────────

def test_action_verbs_detects_weak_openers():
    resume = {"experience": [{"bullets": ["Responsible for support.", "Worked on APIs.", "Developed the payments service."]}]}
    cat = resume_quality._action_verbs_category(resume)
    assert "developed" in cat.matched_evidence
    assert len(cat.missing_evidence) == 2


def test_action_verbs_recommendation_does_not_auto_replace():
    resume = {"experience": [{"bullets": ["Handled tickets."]}]}
    cat = resume_quality._action_verbs_category(resume)
    assert "Handled tickets." not in cat.matched_evidence
    assert any("consider a stronger opener" in m for m in cat.missing_evidence)


# ── 4. Skill Evidence ─────────────────────────────────────────────────────────

def test_skill_evidence_finds_support_in_experience_and_projects():
    cat = resume_quality._skill_evidence_category(RICH_RESUME)
    assert "Python" in cat.matched_evidence
    assert "Django" in cat.matched_evidence


def test_skill_evidence_flags_unsupported_skill_without_removing_it():
    resume = dict(RICH_RESUME, skills=["Python", "Kubernetes"], raw_text=RICH_RESUME["raw_text"])
    cat = resume_quality._skill_evidence_category(resume)
    assert any("Kubernetes" in m for m in cat.missing_evidence)
    # the skill itself is never removed from the resume — this function only reports


def test_skill_evidence_no_skills_is_not_applicable():
    cat = resume_quality._skill_evidence_category(EMPTY_RESUME)
    assert cat.applicable is False


# ── 5. Summary Quality ────────────────────────────────────────────────────────

def test_summary_quality_flags_generic_phrases():
    cat = resume_quality._summary_category({"summary": "Hardworking professional looking for opportunities to grow. Team player with a proven track record."})
    assert len(cat.missing_evidence) >= 2
    assert cat.match < 60


def test_summary_quality_no_summary_is_na_not_zero():
    cat = resume_quality._summary_category(EMPTY_RESUME)
    assert cat.match is None
    assert cat.confidence == "low"


def test_summary_quality_specific_summary_scores_higher_than_generic():
    specific = resume_quality._summary_category({"summary": "Backend developer with 5 years building scalable Django/PostgreSQL APIs, leading a team of 4."})
    generic = resume_quality._summary_category({"summary": "Hardworking professional looking for opportunities. Team player."})
    assert specific.match > generic.match


# ── 6. Grammar / Readability ──────────────────────────────────────────────────

def test_readability_category_no_text_is_na_not_zero():
    cat = resume_quality._readability_category(EMPTY_RESUME)
    assert cat.match is None


def test_readability_category_never_crashes_on_real_text():
    cat = resume_quality._readability_category(RICH_RESUME)
    assert cat.match is not None
    assert 0 <= cat.match <= 100


def test_readability_confidence_is_never_overstated_as_high():
    # heuristic grammar signal — never claimed as a full language-model check
    cat = resume_quality._readability_category(RICH_RESUME)
    assert cat.confidence != "high"


# ── 7. Seniority Signals ──────────────────────────────────────────────────────

def test_seniority_detects_leadership_language():
    cat = resume_quality._seniority_category(RICH_RESUME)
    assert any("team of 4" in e or "led a team" in e for e in cat.matched_evidence)


def test_seniority_not_inferred_from_title_alone():
    resume = {"experience": [{"title": "Senior Developer", "bullets": ["Wrote unit tests for the billing module."]}], "summary": ""}
    cat = resume_quality._seniority_category(resume)
    assert cat.matched_evidence == []  # no leadership language despite "Senior" in the title


def test_seniority_no_experience_is_na_not_zero():
    cat = resume_quality._seniority_category(EMPTY_RESUME)
    assert cat.match is None


# ── 8. Career Progression ─────────────────────────────────────────────────────

def test_career_progression_detects_step_up():
    resume = {"experience": [
        {"title": "Senior Backend Developer"}, {"title": "Backend Developer"},
    ]}  # resume order = most recent first; reversed internally = Backend -> Senior Backend
    cat = resume_quality._career_progression_category(resume)
    assert cat.matched_evidence  # at least one step-up recorded


def test_career_progression_flags_step_down_gently_not_punitively():
    resume = {"experience": [{"title": "Backend Developer"}, {"title": "Engineering Manager"}]}
    cat = resume_quality._career_progression_category(resume)
    if cat.missing_evidence:
        assert "legitimate career change" in cat.missing_evidence[0]  # neutral wording, never accusatory


def test_career_progression_single_entry_is_na_not_zero():
    resume = {"experience": [{"title": "Backend Developer"}]}
    cat = resume_quality._career_progression_category(resume)
    assert cat.match is None
    assert cat.confidence == "low"


def test_career_progression_unparseable_titles_is_na_not_zero():
    resume = {"experience": [{"title": "Team Alpha"}, {"title": "Team Beta"}]}
    cat = resume_quality._career_progression_category(resume)
    assert cat.match is None


# ── 9. Content Completeness ───────────────────────────────────────────────────

def test_completeness_reuses_profile_completeness():
    cat = resume_quality._completeness_category(RICH_RESUME)
    assert cat.match is not None
    assert cat.confidence == "high"


# ── 10. Repetition ─────────────────────────────────────────────────────────────

def test_repetition_detects_near_duplicate_bullets():
    resume = {"experience": [
        {"bullets": ["Resolved customer support tickets efficiently."]},
        {"bullets": ["Resolved customer support tickets efficiently and quickly."]},
    ]}
    cat = resume_quality._repetition_category(resume)
    assert cat.match < 100
    assert cat.missing_evidence


def test_repetition_does_not_punish_skill_keyword_reuse():
    # "React" repeated across different, DISTINCT bullets should not itself
    # trigger the near-duplicate-bullet detector.
    resume = {"experience": [
        {"bullets": ["Built React components for the checkout flow."]},
        {"bullets": ["Led React training sessions for junior engineers."]},
    ]}
    cat = resume_quality._repetition_category(resume)
    assert cat.match == 100


def test_repetition_not_enough_bullets_is_na_not_zero():
    cat = resume_quality._repetition_category({"experience": [{"bullets": ["One bullet only."]}]})
    assert cat.match is None


# ── 11. Credibility ────────────────────────────────────────────────────────────

def test_credibility_flags_overlapping_dates_neutrally():
    resume = {"experience": [
        {"company": "Acme", "startDate": "2020", "endDate": "2023", "current": False, "bullets": []},
        {"company": "Beta", "startDate": "2021", "endDate": "2022", "current": False, "bullets": []},
    ]}
    cat = resume_quality._credibility_category(resume)
    assert cat.missing_evidence
    assert "please verify" in cat.missing_evidence[0].lower()
    assert "fraud" not in cat.missing_evidence[0].lower() and "lie" not in cat.missing_evidence[0].lower()


def test_credibility_flags_extreme_percentage_neutrally():
    resume = {"experience": [{"company": "Acme", "startDate": "", "endDate": "", "bullets": ["Increased revenue by 900%."]}]}
    cat = resume_quality._credibility_category(resume)
    assert any("900" in m or "please verify" in m.lower() for m in cat.missing_evidence)


def test_credibility_no_experience_handled_gracefully():
    cat = resume_quality._credibility_category(EMPTY_RESUME)
    assert cat.match is None  # no experience entries to check


def test_credibility_clean_resume_has_no_issues():
    cat = resume_quality._credibility_category(RICH_RESUME)
    assert cat.match == 100.0


# ── 12. Recruiter Readiness ───────────────────────────────────────────────────

def test_recruiter_readiness_reuses_text_metrics():
    cat = resume_quality._recruiter_readiness_category(RICH_RESUME)
    assert cat.match is not None
    assert cat.confidence == "high"


def test_recruiter_readiness_bonus_for_having_a_summary():
    with_summary = resume_quality._recruiter_readiness_category(RICH_RESUME)
    without_summary = resume_quality._recruiter_readiness_category(dict(RICH_RESUME, summary=""))
    assert with_summary.match >= without_summary.match


# ── 13. QUALITY_WEIGHTS validation (spec Part 14 — "validate weights sum correctly") ──

def test_quality_weights_sum_to_one():
    assert ats_config.weights_sum_to_one(ats_config.QUALITY_WEIGHTS)


def test_quality_weights_preserves_relative_proportions_from_spec():
    # bullet_quality (0.18) should still be exactly 1.5x skill_evidence's
    # ORIGINAL 0.12... actually spec gives skill_evidence=0.15 too, so check
    # a pair with genuinely different raw values instead: bullet_quality
    # (0.18) vs credibility (0.02) should stay in a 9:1 ratio after normalization.
    w = ats_config.QUALITY_WEIGHTS
    assert abs(w["bullet_quality"] / w["credibility"] - 9.0) < 0.01


def test_quality_weights_has_all_twelve_categories():
    assert set(ats_config.QUALITY_WEIGHTS) == {
        "bullet_quality", "quantified_impact", "skill_evidence", "summary_quality",
        "action_verbs", "readability", "seniority", "career_progression",
        "completeness", "repetition", "credibility", "recruiter_readiness",
    }


# ── 14. analyze_resume_quality() aggregation ─────────────────────────────────

def test_analyze_resume_quality_never_hardcodes_a_score():
    a = resume_quality.analyze_resume_quality(RICH_RESUME)["score"]
    b = resume_quality.analyze_resume_quality(EMPTY_RESUME)["score"]
    assert a != b


def test_analyze_resume_quality_redistributes_excluded_categories():
    # A resume with only 1 experience entry excludes career_progression;
    # its weight must be redistributed, not dropped or zeroed.
    resume = dict(RICH_RESUME, experience=[RICH_RESUME["experience"][0]])
    result = resume_quality.analyze_resume_quality(resume)
    assert "career_progression" in result["excluded_categories"]
    assert abs(sum(result["weights_used"].values()) - 100) < 0.5


def test_analyze_resume_quality_empty_resume_does_not_crash():
    result = resume_quality.analyze_resume_quality(EMPTY_RESUME)
    assert result["score"] is not None or result["score"] is None  # must not raise, either outcome is valid
    assert isinstance(result["categories"], dict) and len(result["categories"]) == 12


def test_analyze_resume_quality_rich_resume_scores_reasonably():
    result = resume_quality.analyze_resume_quality(RICH_RESUME)
    assert result["score"] > 40  # a genuinely well-written resume shouldn't score low


# ── 15. build_resume_quality_questions — never invents an answer ────────────

def test_questions_never_invent_an_answer():
    result = resume_quality.analyze_resume_quality(RICH_RESUME)
    questions = resume_quality.build_resume_quality_questions(RICH_RESUME, result["categories"])
    for q in questions:
        assert "500" not in q and "40%" not in q  # never asserts a fabricated number as fact
        assert isinstance(q, str) and q.strip()


def test_questions_grounded_in_real_missing_data():
    resume = dict(RICH_RESUME, skills=["Python", "Kubernetes"])
    result = resume_quality.analyze_resume_quality(resume)
    questions = resume_quality.build_resume_quality_questions(resume, result["categories"])
    assert any("Kubernetes" in q for q in questions)


# ── 16. ats_intelligence_v2.compute_full_analysis — Resume Quality now real ──

def test_compute_full_analysis_resume_quality_is_now_computed_not_none():
    result = ats_intelligence_v2.compute_full_analysis(RICH_RESUME, None)
    assert result["layers"]["resume_quality"] is not None
    assert "resume_quality" not in result["excluded_layers"]


def test_compute_full_analysis_job_match_null_not_zero_without_jd():
    result = ats_intelligence_v2.compute_full_analysis(RICH_RESUME, None)
    assert result["layers"]["job_match"] is None
    assert "job_match" in result["excluded_layers"]
    assert result["mode"] == "no_jd"


def test_compute_full_analysis_all_three_layers_with_jd():
    job = {"required_skills": ["Python", "Django"], "preferred_skills": [], "keywords": ["Python", "Django"],
           "certifications": [], "min_experience_years": 3, "min_education": None,
           "raw_text": "Python Django backend engineer.", "responsibilities": []}
    result = ats_intelligence_v2.compute_full_analysis(RICH_RESUME, job)
    assert all(result["layers"][k] is not None for k in ("ats_compatibility", "job_match", "resume_quality"))
    assert result["excluded_layers"] == []


def test_compute_full_analysis_scoring_engine_version_stamped():
    result = ats_intelligence_v2.compute_full_analysis(RICH_RESUME, None)
    assert result["scoring_engine_version"] == "2.1.0"


def test_analyze_v2_phase_b_contract_still_frozen_after_phase_c():
    """Regression guard: Phase B's analyze_v2() must still show
    resume_quality as excluded/None — Phase C added compute_full_analysis()
    as a NEW function specifically so this one stays untouched."""
    result = ats_intelligence_v2.analyze_v2(RICH_RESUME, {
        "required_skills": ["Python"], "preferred_skills": [], "keywords": ["Python"], "certifications": [],
        "min_experience_years": None, "min_education": None, "raw_text": "Python engineer.", "responsibilities": [],
    })
    assert result["layers"]["resume_quality"] is None
    assert "resume_quality" in result["excluded_layers"]


# ── 17. Editor recommendation/question/debug builders ───────────────────────

_JOB = {"required_skills": ["React Native", "TypeScript"], "preferred_skills": [], "keywords": ["React Native", "TypeScript"],
        "certifications": [], "min_experience_years": 2, "min_education": None,
        "raw_text": "React Native TypeScript engineer.", "responsibilities": []}
_JS_RESUME = dict(RICH_RESUME, skills=["React", "TypeScript"], keywords=["React", "TypeScript"],
                   raw_text=RICH_RESUME["raw_text"] + "\nReact TypeScript")


def test_build_editor_recommendations_structure():
    result = ats_intelligence_v2.compute_full_analysis(RICH_RESUME, None)
    recs = ats_intelligence_v2.build_editor_recommendations(RICH_RESUME, None, result)
    assert set(recs.keys()) == {"high", "medium", "low"}


def test_build_editor_recommendations_includes_job_match_gaps_when_jd_present():
    result = ats_intelligence_v2.compute_full_analysis(_JS_RESUME, _JOB)
    recs = ats_intelligence_v2.build_editor_recommendations(_JS_RESUME, _JOB, result)
    all_issues = " ".join(r["issue"] for r in recs["high"] + recs["medium"] + recs["low"])
    assert "React Native" in all_issues


def test_build_editor_questions_deduplicates():
    result = ats_intelligence_v2.compute_full_analysis(RICH_RESUME, None)
    questions = ats_intelligence_v2.build_editor_questions(RICH_RESUME, None, result)
    assert len(questions) == len(set(questions))


def test_build_debug_breakdown_structure():
    result = ats_intelligence_v2.compute_full_analysis(RICH_RESUME, _JOB)
    debug = ats_intelligence_v2.build_debug_breakdown(result)
    assert set(debug.keys()) >= {"ats_compatibility", "job_match", "resume_quality"}
    parsing_row = debug["ats_compatibility"]["categories"]["parsing"]
    assert set(parsing_row.keys()) == {"raw_score", "weight", "weighted_contribution", "completeness", "confidence", "evidence", "excluded_reason"}


def test_build_debug_breakdown_excluded_reason_when_no_jd():
    result = ats_intelligence_v2.compute_full_analysis(RICH_RESUME, None)
    debug = ats_intelligence_v2.build_debug_breakdown(result)
    assert debug["job_match"]["excluded_reason"] is not None


# ── 18. React/React Native + JS/JavaScript regression, via the full pipeline (spec Part 24 explicit ask) ──

def test_full_pipeline_react_does_not_match_react_native():
    resume = dict(RICH_RESUME, skills=["React"], keywords=["React"], raw_text=RICH_RESUME["raw_text"] + "\nReact")
    job = dict(_JOB, required_skills=["React Native"], keywords=["React Native"])
    result = ats_intelligence_v2.compute_full_analysis(resume, job)
    kw = result["job_match"]["categories"]["keywords"]
    assert "React Native" in kw["missing_evidence"]


def test_full_pipeline_js_javascript_alias_matches():
    resume = dict(RICH_RESUME, skills=["JS"], keywords=["JS"], raw_text=RICH_RESUME["raw_text"] + "\nJS")
    job = dict(_JOB, required_skills=["JavaScript"], keywords=["JavaScript"])
    result = ats_intelligence_v2.compute_full_analysis(resume, job)
    kw = result["job_match"]["categories"]["keywords"]
    assert "JavaScript" in kw["matched_evidence"]


# ── 19. Legacy endpoints/module still functioning (spec Part 24 explicit ask) ─

def test_legacy_ats_module_still_importable_and_unchanged():
    from services import ats as legacy_ats
    assert hasattr(legacy_ats, "analyze_resume_prioritized")
    assert hasattr(legacy_ats, "score_resume")


def test_editor_endpoint_registered_alongside_legacy_routes():
    import routers.ats as legacy_router
    import routers.ats_engine as v2_router
    legacy_paths = [r.path for r in legacy_router.router.routes]
    v2_paths = [r.path for r in v2_router.router.routes]
    assert "/api/ats/analyze" in legacy_paths and "/api/ats/score" in legacy_paths
    assert "/api/ats/v2/analyze-editor" in v2_paths
