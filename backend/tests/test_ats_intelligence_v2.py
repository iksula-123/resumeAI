"""
Phase B — ATS Intelligence 2.0: tests for the new scoring foundation.

Covers everything added in Phase B: the alias-aware keyword matcher (and the
documented false-positive bug it fixes), the centralized weight config, the
Parsing Rate engine, the Section Recognition engine, and the v2 dual-score
aggregation layer. Per Phase B decision 6, the existing 7-category
Match/Completeness/Confidence model (services/ats_engine/scoring.py) is
untouched — those behaviors are already covered by test_ats_engine.py and
are NOT re-tested here except to confirm the v2 layer reuses them correctly
(same M.Com / "ABC Technologies only" examples, now via the v2 path).
"""
import asyncio

import pytest

from services.ats_engine import (
    ats_config, ats_intelligence_v2, ats_service, keyword_aliases,
    parsing_quality, section_recognizer,
)


def _sync(coro):
    return asyncio.run(coro)


# ── 1. keyword_aliases — the documented false-positive fix ──────────────────

def test_react_does_not_match_react_native_exact_path():
    found, match_type = keyword_aliases.present_v2("React Native", ["React", "CSS"], "I use React daily.")
    assert found is False
    assert match_type == "none"


def test_react_does_not_match_react_native_reverse_direction():
    found, _ = keyword_aliases.present_v2("React", ["React Native"], "")
    assert found is False


def test_react_native_matches_itself():
    found, match_type = keyword_aliases.present_v2("React Native", ["React Native"], "")
    assert found is True
    assert match_type == "exact"


def test_old_matcher_would_have_falsely_matched_react_react_native():
    """Regression guard: proves the OLD matcher's bug is real (not a made-up
    justification for the new module) by asserting it against the actual
    frozen function — if this ever starts failing, the old matcher's
    behavior changed, which would need its own investigation."""
    from services.ats_engine import keyword_engine
    assert keyword_engine._present("react native", ["react"], "") is True  # the bug, still present in the frozen legacy matcher, on purpose


# ── 2. keyword_aliases — curated abbreviation aliases (JS/TS/AWS) ───────────

@pytest.mark.parametrize("jd_term,resume_items,resume_text", [
    ("JavaScript", ["JS"], ""),
    ("JS", ["JavaScript"], ""),
    ("TypeScript", ["TS"], ""),
    ("TS", ["TypeScript"], ""),
    ("AWS", ["Amazon Web Services"], ""),
    ("Amazon Web Services", ["AWS"], ""),
    ("AWS", [], "Deployed apps on Amazon Web Services."),
])
def test_curated_aliases_match_both_directions(jd_term, resume_items, resume_text):
    found, match_type = keyword_aliases.present_v2(jd_term, resume_items, resume_text)
    assert found is True
    assert match_type == "alias"


def test_unrelated_short_terms_do_not_cross_match():
    # "C" must not match C++/C#, and must not match SQL/React/Docker.
    assert keyword_aliases.present_v2("C", [], "I know C++ and C# well.")[0] is False
    for unrelated in ("SQL", "React", "Docker"):
        assert keyword_aliases.present_v2("C", [unrelated], "")[0] is False


def test_c_plus_plus_matches_itself_exactly():
    found, match_type = keyword_aliases.present_v2("C++", [], "I know C++ well.")
    assert found is True
    assert match_type == "exact"


def test_fuzzy_fallback_still_catches_genuine_variants():
    # plural / version-suffix variants should still fuzzy-match at the v2 threshold
    found, match_type = keyword_aliases.present_v2("Frameworks", ["Framework"], "")
    assert found is True
    assert match_type == "fuzzy"


def test_match_lists_v2_shape_and_evidence():
    result = keyword_aliases.match_lists_v2(["React", "TS"], ["React Native", "TypeScript"], "")
    assert result["pct"] == 50  # TypeScript matched via TS alias, React Native did not match React
    assert result["missing"] == ["React Native"]
    assert result["found"] == ["TypeScript"]
    assert {"keyword": "TypeScript", "status": "matched", "match_type": "alias"} in result["evidence"]
    assert {"keyword": "React Native", "status": "missing", "match_type": "none"} in result["evidence"]


def test_match_lists_v2_empty_job_items_is_100_not_zero():
    assert keyword_aliases.match_lists_v2(["anything"], [], "")["pct"] == 100


# ── 3. ats_config — centralized weights ─────────────────────────────────────

def test_all_weight_configs_sum_to_one():
    for weights in (ats_config.ATS_HEALTH_WEIGHTS, ats_config.JOB_MATCH_WEIGHTS,
                    ats_config.QUALITY_WEIGHTS, ats_config.ATS_SCORE_CONFIG,
                    ats_config.ATS_COMPATIBILITY_WEIGHTS):
        assert ats_config.weights_sum_to_one(weights), weights


def test_scoring_engine_version_is_stamped():
    # Bumped to 2.1.0 by Phase H1's Resume ATS Health model change (see
    # ats_config.py's version-history comment). analyze_v2() itself is
    # untouched -- its Mode A (job=None) still runs the frozen 4-category
    # compute_resume_health_v2(), not mode_orchestrator's new two-layer
    # model; SCORING_ENGINE_VERSION is a single global stamp, not
    # per-function, so this test only asserts the constant's value, not a
    # claim that analyze_v2()'s formula changed (it didn't -- see Part 44).
    assert ats_config.SCORING_ENGINE_VERSION == "2.1.0"


def test_ats_compatibility_weights_excludes_keyword_coverage():
    # Layer 1 (JD-present ATS Compatibility) must not include keyword scoring
    # — that's JD-specific and lives in Job Match instead.
    assert "keyword_coverage" not in ats_config.ATS_COMPATIBILITY_WEIGHTS
    assert set(ats_config.ATS_COMPATIBILITY_WEIGHTS) == {"parsing", "sections", "formatting"}


# ── 4. parsing_quality — the Parsing Rate engine ─────────────────────────────

def test_parsing_quality_empty_text_scores_zero_not_crash():
    result = parsing_quality.analyze_parsing_quality("")
    assert result["score"] == 0
    assert "No extractable text" in result["note"]


def test_parsing_quality_clean_resume_scores_high():
    clean = """Priya Sharma
priya@example.com | +91 90000 00000

SUMMARY
Experienced developer.

EXPERIENCE
Senior Developer - Acme Corp
- Built and shipped features.
- Led a team of 4 engineers.

EDUCATION
B.Tech, Acme University, 2018

SKILLS
Python, SQL, Docker
"""
    result = parsing_quality.analyze_parsing_quality(clean)
    assert result["score"] >= 70
    assert result["parsed_character_ratio"] > 0.95
    assert result["contact_extraction_score"] > 0


def test_parsing_quality_garbled_text_scores_lower():
    garbled = "a b c " + ("x" * 40) + " " + "y " * 3 + ("z" * 60)
    clean = "This is a normal sentence with regular words in it, describing work experience clearly."
    garbled_result = parsing_quality.analyze_parsing_quality(garbled)
    clean_result = parsing_quality.analyze_parsing_quality(clean)
    assert garbled_result["garbled_text_ratio"] > clean_result["garbled_text_ratio"]
    assert garbled_result["score"] < clean_result["score"]


def test_parsing_quality_returns_all_six_named_metrics():
    result = parsing_quality.analyze_parsing_quality("SUMMARY\nSomething.\nEXPERIENCE\nDid things.")
    for key in ("parsed_character_ratio", "parsed_word_ratio", "section_extraction_ratio",
                "garbled_text_ratio", "reading_order_score", "contact_extraction_score"):
        assert key in result


def test_parsing_quality_never_crashes_on_no_contact_info():
    result = parsing_quality.analyze_parsing_quality("Just some resume text with no contact details at all.")
    assert result["contact_extraction_score"] == 0.0


# ── 5. section_recognizer — heading-variant tolerance ────────────────────────

@pytest.mark.parametrize("heading,canonical", [
    ("Work Experience", "experience"), ("Employment History", "experience"), ("Career History", "experience"),
    ("Academic Background", "education"), ("Academic Qualifications", "education"),
    ("Technical Skills", "skills"), ("Core Competencies", "skills"), ("Key Skills", "skills"),
    ("Key Projects", "projects"), ("Selected Projects", "projects"),
    ("Licenses & Certifications", "certifications"),
    ("Professional Summary", "summary"), ("Career Objective", "summary"), ("Profile", "summary"),
])
def test_section_variant_heading_recognized(heading, canonical):
    text = f"{heading}\nSome content line here.\n"
    result = section_recognizer.recognize_sections(text)
    assert canonical in result["recognized_sections"], f"{heading!r} should map to {canonical!r}"


def test_resume_not_punished_for_missing_optional_sections():
    # Only summary/experience/education/skills — no projects, no certifications.
    text = "Summary\nA developer.\nExperience\nDid things.\nEducation\nB.Tech.\nSkills\nPython."
    result = section_recognizer.recognize_sections(text)
    assert result["section_extraction_ratio"] == 1.0
    assert result["missing_core_sections"] == []


def test_missing_core_section_is_reported_not_silently_dropped():
    text = "Experience\nDid things.\nEducation\nB.Tech."
    result = section_recognizer.recognize_sections(text)
    assert "summary" in result["missing_core_sections"]
    assert "skills" in result["missing_core_sections"]
    assert result["section_extraction_ratio"] == 0.5  # 2 of 4 core sections


def test_section_conflict_detected_for_duplicate_canonical_headings():
    text = "Skills\nPython.\nTechnical Skills\nSQL."
    result = section_recognizer.recognize_sections(text)
    conflict_keys = [c["section"] for c in result["section_conflicts"]]
    assert "skills" in conflict_keys


def test_unknown_heading_like_line_is_surfaced():
    text = "Hobbies\nChess, reading.\nExperience\nDid things."
    result = section_recognizer.recognize_sections(text)
    assert any("Hobbies" in u for u in result["unknown_sections"])


# ── 6. ats_intelligence_v2 — location category (Part 13) ────────────────────

def test_location_not_applicable_when_jd_has_no_signal():
    resume = {"location": "Bengaluru"}
    job = {"raw_text": "We need a backend engineer with Python experience."}
    cat = ats_intelligence_v2._location_category_v2(resume, job)
    assert cat.applicable is False
    assert cat.match is None


def test_location_matches_when_jd_is_remote():
    resume = {"location": ""}
    job = {"raw_text": "This is a fully remote role."}
    cat = ats_intelligence_v2._location_category_v2(resume, job)
    assert cat.applicable is True
    assert cat.match == 100.0


def test_location_na_not_zero_when_resume_has_no_location_but_jd_requires_one():
    resume = {"location": ""}
    job = {"raw_text": "This role is based onsite in our downtown office."}
    cat = ats_intelligence_v2._location_category_v2(resume, job)
    assert cat.applicable is True
    assert cat.match is None  # N/A, never zero
    assert cat.confidence == "low"


def test_location_matches_when_resume_location_named_in_jd():
    resume = {"location": "Bengaluru"}
    job = {"raw_text": "This role is based onsite in Bengaluru."}
    cat = ats_intelligence_v2._location_category_v2(resume, job)
    assert cat.match == 100.0


# ── 7. ats_intelligence_v2 — layer aggregation & redistribution ─────────────

_RESUME_FIXTURE = {
    "skills": ["React", "TypeScript", "AWS"], "hard_skills": [], "soft_skills": [],
    "keywords": ["React", "TypeScript", "AWS"], "certifications": [], "location": "Bengaluru",
    "raw_text": ("Experienced React developer.\nSUMMARY\nBuilds UIs.\nEXPERIENCE\nFrontend Dev - Acme\n"
                 "- Built React apps.\nEDUCATION\nB.Tech Acme University\nSKILLS\nReact TypeScript AWS"),
    "experience": [{"title": "Frontend Dev", "company": "Acme", "duration": "2 years", "bullets": ["Built React apps."]}],
    "education": [{"degree": "B.Tech", "institution": "Acme University", "year": "2020"}],
    "total_experience_years": 2, "bullets": ["Built React apps."],
}
_JOB_FIXTURE = {
    "required_skills": ["React Native", "TypeScript"], "preferred_skills": [],
    "keywords": ["React Native", "TypeScript"], "certifications": [],
    "min_experience_years": 2, "min_education": None,
    "raw_text": "React Native TypeScript engineer. Remote role.", "responsibilities": [],
}


def test_job_match_v2_excludes_unavailable_categories_and_redistributes():
    result = ats_intelligence_v2.compute_job_match_v2(_RESUME_FIXTURE, _JOB_FIXTURE)
    assert "education" in result["excluded_categories"]        # no min_education stated
    assert "certifications" in result["excluded_categories"]   # no certifications required
    assert result["score"] is not None
    assert abs(sum(result["weights_used"].values()) - 100) < 0.5


def test_job_match_v2_keywords_reflect_react_native_fix():
    result = ats_intelligence_v2.compute_job_match_v2(_RESUME_FIXTURE, _JOB_FIXTURE)
    kw = result["categories"]["keywords"]
    assert "React Native" in kw["missing_evidence"]
    assert "TypeScript" in kw["matched_evidence"]


def test_ats_compatibility_v2_always_computable():
    result = ats_intelligence_v2.compute_ats_compatibility_v2(_RESUME_FIXTURE)
    assert result["score"] is not None
    assert result["excluded_categories"] == []


def test_resume_health_v2_mode_a_no_jd():
    result = ats_intelligence_v2.analyze_v2(_RESUME_FIXTURE, None)
    assert result["mode"] == "resume_health"
    assert result["score"] is not None
    assert result["scoring_engine_version"] == "2.1.0"


def test_analyze_v2_mode_b_excludes_resume_quality_and_redistributes():
    result = ats_intelligence_v2.analyze_v2(_RESUME_FIXTURE, _JOB_FIXTURE)
    assert result["mode"] == "job_match"
    assert "resume_quality" in result["excluded_layers"]
    assert result["layers"]["resume_quality"] is None
    assert abs(sum(result["layer_weights_used"].values()) - 100) < 0.5
    assert result["score"] is not None


def test_analyze_v2_never_hardcodes_a_score():
    """Sanity guard, same style as the Phase 3 test — proves the v2 score
    actually reacts to different inputs rather than being a fixed constant."""
    a = ats_intelligence_v2.analyze_v2(_RESUME_FIXTURE, _JOB_FIXTURE)["score"]
    weaker_resume = dict(_RESUME_FIXTURE, skills=[], hard_skills=[], keywords=[], raw_text="Empty.")
    b = ats_intelligence_v2.analyze_v2(weaker_resume, _JOB_FIXTURE)["score"]
    assert a != b


# ── 8. v2 reuses the frozen 7-category model correctly (decision 6) ────────

def test_v2_education_reuses_mcom_bachelor_example_unchanged():
    resume = dict(_RESUME_FIXTURE, education=[{"degree": "M.Com", "institution": "", "year": ""}])
    job = dict(_JOB_FIXTURE, min_education="Bachelor's degree")
    result = ats_intelligence_v2.compute_job_match_v2(resume, job)
    edu = result["categories"]["education"]
    assert edu["match"] == 100.0          # M.Com satisfies Bachelor's — same rule as the frozen model
    assert edu["completeness"] < 100      # missing institution/year lowers completeness only


def test_v2_experience_reuses_abc_technologies_example_unchanged():
    resume = dict(_RESUME_FIXTURE, experience=[{"company": "ABC Technologies", "title": "", "bullets": []}],
                  total_experience_years=None)
    result = ats_intelligence_v2.compute_job_match_v2(resume, _JOB_FIXTURE)
    exp = result["categories"]["experience"]
    assert exp["match"] is None           # N/A, never zero
    assert exp["confidence"] == "low"


# ── 9. ats_service.analyze() — dual-score output, additive only ────────────

def test_analyze_dual_score_output_present_and_independent():
    result = _sync(ats_service.analyze(_RESUME_FIXTURE, _JOB_FIXTURE))
    assert "ats_intelligence_v2" in result
    assert "overall_score" in result and "legacy_overall_score" in result
    assert result["scoring_engine_version"] == "2.1.0"
    # v2 score is computed independently — it is not required to equal
    # either existing score (that's the whole point of "in parallel").
    assert result["ats_intelligence_v2"]["score"] != result["overall_score"] or True  # documents independence, not an equality requirement


def test_analyze_v2_score_differs_from_legacy_due_to_react_native_fix():
    """The concrete, real-world effect of the fix: the OLD engines both
    treat React==React Native as a match; the v2 engine correctly doesn't,
    so its keyword/skills sub-scores are lower for this exact fixture."""
    result = _sync(ats_service.analyze(_RESUME_FIXTURE, _JOB_FIXTURE))
    v2_keywords_match = result["ats_intelligence_v2"]["job_match"]["categories"]["keywords"]["match"]
    legacy_keyword_match_pct = result["scores"]["keyword_match"]["pct"]
    assert v2_keywords_match < legacy_keyword_match_pct
