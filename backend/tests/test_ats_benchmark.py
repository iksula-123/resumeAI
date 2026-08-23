"""
ATS Intelligence 2.0 — Phase E benchmark regression suite.

Calls the REAL, PRODUCTION scoring engine (`compute_full_analysis`,
`keyword_aliases.present_v2`, `parsing_quality.analyze_parsing_quality`,
`section_recognizer.recognize_sections`, `anti_gaming.*`) against the
hand-labeled dataset in `tests/fixtures/benchmark_dataset.py`. Nothing in
this file reimplements scoring, matching, or detection logic — every
assertion is checking the production engine's own output, matching the
"benchmark tests must call the existing production ATS engine" requirement.

── HARD vs. INFORMATIONAL (read this before adding a new test) ────────────

Not every benchmark observation belongs in this file as a hard `assert`
that fails CI. Two different classes of test live here, deliberately kept
apart:

  A. HARD REGRESSION TESTS — a failure here means something is GENUINELY
     BROKEN and must be fixed. Reserved for invariants that are true by
     construction (not by hand-guessed prediction) or that protect a
     documented, previously-real bug from coming back:
       - Keyword false-positive safety (precision == 100% pooled across
         the labeled dataset — a false "found" is a real defect).
       - Alias correctness — the specific documented regression cases
         (React/React Native, SQL/NoSQL, Java/JavaScript must NOT alias;
         JS/JavaScript, AWS/Amazon Web Services etc. MUST alias).
       - Missing-data-never-zero (an inapplicable category is `None`, not
         `0`, at both the category and layer level).
       - Weight redistribution (excluding a layer/category doesn't lose
         weight or silently zero the overall score).
       - Score determinism (identical input -> byte-identical output; this
         engine has no randomness in this path, so any drift is a bug).
       - Resume Quality / Parsing Rate direction checks — true by
         construction (the probe pairs were deliberately WRITTEN to differ
         only on the thing being tested), so a direction flip is real.
       - Anti-gaming detection (calls the real, already-shipped
         `anti_gaming.py` against hand-labeled synthetic cases with a known
         ground truth by construction).

  B. INFORMATIONAL BENCHMARK METRICS — reported, and sanity-floored against
     a catastrophic regression, but NOT held to a strict pass/fail bar,
     because the ground truth itself is a hand-guess, not a construction
     guarantee:
       - Keyword recall (a missed match could be a real gap OR simply a
         label that undercounted what the resume actually says).
       - Match-band accuracy (a hand-guessed absolute score range that
         doesn't model the full weighted formula — see
         docs/ATS_BENCHMARK_REPORT.md §1).
       - Adjacent-mismatch ordering (see benchmark_dataset.
         iter_adjacent_comparisons's own docstring — 11/12 is the current,
         understood baseline; a floor here catches a catastrophic
         regression, not every individual case).
     Per the Phase E policy: competitor score differences are informational
     ONLY and are not computed here at all — no competitor data exists or
     is used anywhere in this codebase.
"""
import copy

import pytest

from services.ats_engine import ats_config, anti_gaming, keyword_aliases
from services.ats_engine.ats_intelligence_v2 import compute_full_analysis
from services.ats_engine.parsing_quality import analyze_parsing_quality
from services.ats_engine.resume_parser import from_content
from services.ats_engine.section_recognizer import recognize_sections

from tests.fixtures.benchmark_dataset import (
    ANTI_GAMING_PROBES, BENCHMARK_JOBS, BENCHMARK_RESUMES, PARSING_BASELINE_TEXT,
    PARSING_PROBES, RESUME_QUALITY_PROBES, iter_adjacent_comparisons, iter_pairs,
)

# ─────────────────────────────────────────────────────────────────────────
# Shared, computed-once fixtures — the dataset is static, so there's no
# reason to re-run compute_full_analysis() per assertion.
# ─────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def parsed_resumes():
    return {key: from_content(content) for key, content in BENCHMARK_RESUMES.items()}


@pytest.fixture(scope="module")
def all_pairs():
    return list(iter_pairs())


@pytest.fixture(scope="module")
def pair_results(parsed_resumes, all_pairs):
    results = {}
    for resume_key, job_key, labels in all_pairs:
        results[(resume_key, job_key)] = compute_full_analysis(parsed_resumes[resume_key], BENCHMARK_JOBS[job_key])
    return results


# ═══════════════════════════════════════════════════════════════════════
# A. Dataset integrity — HARD. If these fail, the dataset itself is
# internally inconsistent and every other test's ground truth is suspect.
# ═══════════════════════════════════════════════════════════════════════

class TestDatasetIntegrity:
    RESUME_REQUIRED_FIELDS = {"personalInfo", "summary", "experience", "education", "skills",
                               "projects", "certifications", "achievements", "languages", "interests"}
    JOB_REQUIRED_FIELDS = {"job_title", "keywords", "required_skills", "preferred_skills", "raw_text"}

    def test_dataset_size_matches_the_phase_e_decision(self, all_pairs):
        # Phase E decision: "larger set (~30+ pairs)".
        assert len(BENCHMARK_RESUMES) == 12
        assert len(BENCHMARK_JOBS) == 9
        assert len(all_pairs) == 36
        assert len(all_pairs) >= 30

    def test_role_and_seniority_coverage(self):
        industries = {"swe", "data", "mkt"}
        bands = {"junior", "mid", "senior", "lead"}
        seen_industries, seen_bands = set(), set()
        for key in BENCHMARK_RESUMES:
            industry, _, band = key.partition("_")
            seen_industries.add(industry)
            seen_bands.add(band)
        assert seen_industries == industries
        assert seen_bands == bands

    def test_every_resume_has_required_fields(self):
        for key, content in BENCHMARK_RESUMES.items():
            missing = self.RESUME_REQUIRED_FIELDS - content.keys()
            assert not missing, f"{key} is missing fields: {missing}"
            assert content["personalInfo"].get("fullName"), f"{key} has no fullName"
            assert content["experience"], f"{key} has no experience entries"

    def test_every_job_has_required_fields(self):
        for key, job in BENCHMARK_JOBS.items():
            missing = self.JOB_REQUIRED_FIELDS - job.keys()
            assert not missing, f"{key} is missing fields: {missing}"
            assert job["keywords"], f"{key} has no keywords"

    def test_every_pair_label_references_real_resumes_and_jobs(self, all_pairs):
        for resume_key, job_key, labels in all_pairs:
            assert resume_key in BENCHMARK_RESUMES
            assert job_key in BENCHMARK_JOBS
            assert "matched" in labels and "missing" in labels

    def test_quality_probe_pairs_reference_real_resumes(self):
        assert len(RESUME_QUALITY_PROBES) == 6
        for strong_key, weak_key in RESUME_QUALITY_PROBES:
            assert strong_key in BENCHMARK_RESUMES
            assert weak_key in BENCHMARK_RESUMES

    def test_parsing_probes_are_nonempty(self):
        assert len(PARSING_PROBES) == 5
        for name, probe in PARSING_PROBES.items():
            assert probe["raw_text"].strip(), f"{name} has empty raw_text"

    def test_anti_gaming_probes_are_present(self):
        assert len(ANTI_GAMING_PROBES) == 6


# ═══════════════════════════════════════════════════════════════════════
# B. Keyword matching — false-positive safety is HARD; recall is
# INFORMATIONAL (see module docstring).
# ═══════════════════════════════════════════════════════════════════════

class TestKeywordFalsePositiveSafety:
    """HARD. A false positive here means the engine is claiming a candidate
    has a skill they don't — the exact class of bug keyword_aliases.py's
    v2 matcher was built to eliminate (see its own module docstring)."""

    def test_precision_is_100_percent_across_the_labeled_dataset(self, pair_results, all_pairs):
        false_positives = []
        for resume_key, job_key, labels in all_pairs:
            kw = pair_results[(resume_key, job_key)]["job_match"]["categories"]["keywords"]
            found = set(kw["matched_evidence"])
            exp_missing = set(labels["missing"])
            fp = found & exp_missing
            if fp:
                false_positives.append((resume_key, job_key, fp))
        assert not false_positives, f"Found term(s) labeled as absent: {false_positives}"


class TestKeywordRecallInformational:
    """INFORMATIONAL. A generous floor only — catches a catastrophic
    regression (e.g. the matcher stops finding anything), not individual
    label drift. See module docstring for why this isn't a hard 100% gate."""

    def test_recall_does_not_catastrophically_regress(self, pair_results, all_pairs):
        tp = fn = 0
        for resume_key, job_key, labels in all_pairs:
            kw = pair_results[(resume_key, job_key)]["job_match"]["categories"]["keywords"]
            found = set(kw["matched_evidence"])
            exp_matched = set(labels["matched"])
            tp += len(found & exp_matched)
            fn += len(exp_matched - found)
        recall = tp / (tp + fn) if (tp + fn) else 1.0
        assert recall >= 0.85, f"Recall dropped to {recall:.1%} — investigate before treating as label drift"


# ═══════════════════════════════════════════════════════════════════════
# C. Alias correctness — HARD. Direct regression tests for the documented
# Phase B bug fix, calling keyword_aliases.present_v2() itself (not the
# benchmark corpus) so these can never depend on dataset label accuracy.
# ═══════════════════════════════════════════════════════════════════════

class TestAliasCorrectness:
    """HARD. present_v2() is called directly — these are the exact
    regression cases keyword_aliases.py's own docstring documents."""

    @pytest.mark.parametrize("term,resume_items,resume_text", [
        ("React Native", ["React"], "react"),   # the original, empirically-verified bug
        ("NoSQL", ["SQL"], "sql"),
        ("JavaScript", ["Java"], "java"),
    ])
    def test_deliberately_not_aliased_pairs_never_match(self, term, resume_items, resume_text):
        found, match_type = keyword_aliases.present_v2(term, resume_items, resume_text)
        assert not found, f"'{term}' incorrectly matched against {resume_items} (match_type={match_type})"

    @pytest.mark.parametrize("term,resume_items", [
        ("JavaScript", ["JS"]),
        ("Amazon Web Services", ["AWS"]),
        ("Kubernetes", ["K8s"]),
        ("TypeScript", ["TS"]),
    ])
    def test_genuine_alias_pairs_match(self, term, resume_items):
        found, match_type = keyword_aliases.present_v2(term, resume_items, "")
        assert found, f"'{term}' should have matched {resume_items} via alias"
        assert match_type == "alias"


# ═══════════════════════════════════════════════════════════════════════
# D. Missing-data-never-zero + weight redistribution — HARD.
# ═══════════════════════════════════════════════════════════════════════

class TestMissingDataNeverZero:
    """HARD. An inapplicable category/layer must be `None`, never a
    fabricated `0` — the "never silently score zero" rule that runs
    through every layer of this system (see
    docs/SAHICAREER_ATS_INTELLIGENCE_2.md §5)."""

    def test_job_match_layer_is_none_not_zero_when_no_jd(self, parsed_resumes):
        result = compute_full_analysis(parsed_resumes["swe_junior"], None)
        assert result["layers"]["job_match"] is None
        assert result["job_match"] is None
        assert "job_match" in result["excluded_layers"]

    def test_skills_category_inapplicable_when_jd_lists_no_skills(self, parsed_resumes):
        job = {**BENCHMARK_JOBS["swe_jd_junior"], "required_skills": [], "preferred_skills": []}
        result = compute_full_analysis(parsed_resumes["swe_junior"], job)
        skills_cat = result["job_match"]["categories"]["skills"]
        assert skills_cat["applicable"] is False
        assert skills_cat["match"] is None

    def test_certifications_category_inapplicable_when_jd_requires_none(self, parsed_resumes):
        result = compute_full_analysis(parsed_resumes["swe_senior"], BENCHMARK_JOBS["swe_jd_senior"])
        certs_cat = result["job_match"]["categories"]["certifications"]
        assert certs_cat["applicable"] is False
        assert certs_cat["match"] is None

    def test_keywords_category_inapplicable_when_jd_has_no_keywords(self, parsed_resumes):
        job = {**BENCHMARK_JOBS["mkt_jd_junior"], "keywords": []}
        result = compute_full_analysis(parsed_resumes["mkt_junior"], job)
        kw_cat = result["job_match"]["categories"]["keywords"]
        assert kw_cat["applicable"] is False
        assert kw_cat["match"] is None


class TestWeightRedistribution:
    """HARD. Excluding a layer/category must redistribute its weight, never
    silently shrink the overall score by simply dropping it."""

    def test_no_jd_redistributes_full_weight_across_remaining_layers(self, parsed_resumes):
        result = compute_full_analysis(parsed_resumes["data_senior"], None)
        weights_used = result["layer_weights_used"]
        assert set(weights_used) == {"ats_compatibility", "resume_quality"}
        assert sum(weights_used.values()) == pytest.approx(100.0, abs=0.5)

    def test_overall_score_still_computes_when_a_layer_is_excluded(self, parsed_resumes):
        result = compute_full_analysis(parsed_resumes["data_senior"], None)
        assert result["score"] is not None
        assert 0 <= result["score"] <= 100

    def test_with_jd_all_three_layers_contribute(self, parsed_resumes):
        result = compute_full_analysis(parsed_resumes["data_senior"], BENCHMARK_JOBS["data_jd_senior"])
        weights_used = result["layer_weights_used"]
        assert set(weights_used) == {"ats_compatibility", "job_match", "resume_quality"}
        assert sum(weights_used.values()) == pytest.approx(100.0, abs=0.5)


# ═══════════════════════════════════════════════════════════════════════
# E. Score determinism — HARD.
# ═══════════════════════════════════════════════════════════════════════

class TestScoreStability:
    """HARD. This pipeline has no AI call and no randomness — identical
    input must produce byte-identical output, every time."""

    def test_identical_input_produces_identical_output(self, parsed_resumes):
        resume = copy.deepcopy(parsed_resumes["swe_senior"])
        job = copy.deepcopy(BENCHMARK_JOBS["swe_jd_senior"])
        r1 = compute_full_analysis(resume, job)
        r2 = compute_full_analysis(resume, job)
        assert r1["score"] == r2["score"]
        assert r1["layers"] == r2["layers"]
        assert r1["job_match"]["categories"]["keywords"]["matched_evidence"] == \
               r2["job_match"]["categories"]["keywords"]["matched_evidence"]

    def test_scoring_engine_version_unchanged_by_a_benchmark_run(self, parsed_resumes):
        result = compute_full_analysis(parsed_resumes["swe_senior"], BENCHMARK_JOBS["swe_jd_senior"])
        assert result["scoring_engine_version"] == "2.1.0"
        assert ats_config.SCORING_ENGINE_VERSION == "2.1.0"


# ═══════════════════════════════════════════════════════════════════════
# F. Job Match — adjacent-mismatch ordering. INFORMATIONAL floor (see
# module docstring and benchmark_dataset.iter_adjacent_comparisons).
# ═══════════════════════════════════════════════════════════════════════

class TestAdjacentOrderingInformational:
    def test_adjacent_ordering_pass_rate_does_not_catastrophically_regress(self, parsed_resumes):
        results = []
        for resume_key, same_industry_jd_keys, adjacent_jd_key in iter_adjacent_comparisons():
            adjacent_score = compute_full_analysis(parsed_resumes[resume_key], BENCHMARK_JOBS[adjacent_jd_key])["layers"]["job_match"]
            same_scores = [compute_full_analysis(parsed_resumes[resume_key], BENCHMARK_JOBS[k])["layers"]["job_match"]
                           for k in same_industry_jd_keys]
            results.append(all(adjacent_score < s for s in same_scores))
        pass_rate = sum(results) / len(results)
        # Current understood baseline is 11/12 (91.7%) — the one failure
        # (mkt_lead) is a legitimate tie, documented in
        # docs/ATS_BENCHMARK_REPORT.md, not a defect. Floored generously
        # below that so this test catches a REAL regression, not dataset
        # noise.
        assert pass_rate >= 0.75, f"Adjacent-ordering pass rate dropped to {pass_rate:.1%}"


# ═══════════════════════════════════════════════════════════════════════
# G. Resume Quality — direction checks are HARD (true by construction —
# see benchmark_dataset.RESUME_QUALITY_PROBES's own docstring).
# ═══════════════════════════════════════════════════════════════════════

class TestResumeQualityDirection:
    @pytest.mark.parametrize("strong_key,weak_key", RESUME_QUALITY_PROBES)
    def test_strong_writing_scores_higher_than_weak_writing(self, parsed_resumes, strong_key, weak_key):
        strong = compute_full_analysis(parsed_resumes[strong_key], None)
        weak = compute_full_analysis(parsed_resumes[weak_key], None)
        assert strong["layers"]["resume_quality"] > weak["layers"]["resume_quality"], \
            f"{strong_key} ({strong['layers']['resume_quality']}) did not outscore {weak_key} ({weak['layers']['resume_quality']})"

    @pytest.mark.parametrize("strong_key,weak_key", RESUME_QUALITY_PROBES)
    @pytest.mark.parametrize("category", ["quantified_impact", "action_verbs", "bullet_quality", "summary_quality"])
    def test_strong_writing_scores_higher_per_category(self, parsed_resumes, strong_key, weak_key, category):
        strong = compute_full_analysis(parsed_resumes[strong_key], None)["resume_quality"]["categories"][category]
        weak = compute_full_analysis(parsed_resumes[weak_key], None)["resume_quality"]["categories"][category]
        assert strong["match"] is not None and weak["match"] is not None
        assert strong["match"] > weak["match"], \
            f"{strong_key}.{category} ({strong['match']}) did not outscore {weak_key}.{category} ({weak['match']})"


# ═══════════════════════════════════════════════════════════════════════
# H. Parsing Rate anti-pattern probes — HARD (true by construction).
# ═══════════════════════════════════════════════════════════════════════

class TestParsingRateAntiPatterns:
    @pytest.fixture(scope="class")
    def baseline(self):
        return analyze_parsing_quality(PARSING_BASELINE_TEXT)

    @pytest.fixture(scope="class")
    def baseline_sections(self):
        return recognize_sections(PARSING_BASELINE_TEXT)

    @pytest.mark.parametrize("probe_name", ["corrupted_extraction", "column_jumble", "contact_buried"])
    def test_anti_pattern_scores_lower_than_clean_baseline(self, baseline, probe_name):
        probe = PARSING_PROBES[probe_name]
        result = analyze_parsing_quality(probe["raw_text"])
        for metric in probe["expect_lower_than_baseline"]:
            assert result[metric] < baseline[metric], \
                f"{probe_name}.{metric} ({result[metric]}) is not lower than the clean baseline ({baseline[metric]})"

    def test_no_section_headers_scores_lower_section_extraction(self, baseline_sections):
        probe = PARSING_PROBES["no_section_headers"]
        result = recognize_sections(probe["raw_text"])
        assert result["section_extraction_ratio"] < baseline_sections["section_extraction_ratio"]

    def test_clean_baseline_has_no_regressions_against_itself(self, baseline):
        result = analyze_parsing_quality(PARSING_PROBES["clean_baseline"]["raw_text"])
        assert result["score"] == baseline["score"]


# ═══════════════════════════════════════════════════════════════════════
# I. Anti-gaming — HARD. Calls the real, already-shipped Phase D module.
# ═══════════════════════════════════════════════════════════════════════

class TestAntiGaming:
    def test_stuffed_term_is_flagged(self):
        probe = ANTI_GAMING_PROBES["stuffed_term"]
        flags = anti_gaming.detect_keyword_stuffing(probe["raw_text"], probe["terms"])
        assert bool(flags) == probe["expect_stuffing_flagged"]

    def test_natural_repetition_is_not_flagged(self):
        probe = ANTI_GAMING_PROBES["natural_use"]
        flags = anti_gaming.detect_keyword_stuffing(probe["raw_text"], probe["terms"])
        assert bool(flags) == probe["expect_stuffing_flagged"]

    def test_jd_copying_is_flagged(self):
        probe = ANTI_GAMING_PROBES["jd_copied"]
        result = anti_gaming.detect_jd_copying(probe["resume_text"], probe["job_text"])
        assert (result is not None) == probe["expect_jd_copying_flagged"]

    def test_normal_overlap_is_not_flagged_as_jd_copying(self):
        probe = ANTI_GAMING_PROBES["jd_not_copied"]
        result = anti_gaming.detect_jd_copying(probe["resume_text"], probe["job_text"])
        assert (result is not None) == probe["expect_jd_copying_flagged"]

    def test_stuffed_keyword_block_is_flagged(self):
        probe = ANTI_GAMING_PROBES["stuffed_block"]
        flags = anti_gaming.detect_stuffed_keyword_blocks(probe["raw_text"])
        assert bool(flags) == probe["expect_stuffed_block_flagged"]

    def test_clean_bullet_is_not_flagged_as_stuffed_block(self):
        probe = ANTI_GAMING_PROBES["clean_bullet"]
        flags = anti_gaming.detect_stuffed_keyword_blocks(probe["raw_text"])
        assert bool(flags) == probe["expect_stuffed_block_flagged"]

    def test_repetition_alone_never_inflates_the_underlying_match_signal(self):
        """Cross-checks anti_gaming's own philosophy (see its module
        docstring) against the real matcher: repeating a term doesn't
        change whether it's found."""
        probe = ANTI_GAMING_PROBES["stuffed_term"]
        found_once, _ = keyword_aliases.present_v2("kubernetes", [], probe["raw_text"])
        assert found_once is True  # found (it's genuinely present) — but only ever boolean, never "more found"
