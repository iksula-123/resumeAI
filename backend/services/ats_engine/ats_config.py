"""
ATS Intelligence 2.0 — centralized scoring configuration.

Every weight used anywhere in the v2 scoring layers lives HERE and only here
— nothing is hardcoded inline in scoring/aggregation code, so the whole model
can be tuned (e.g. during benchmarking) by editing one file.

IMPORTANT — what this file is and isn't:
  - The percentages below are SahiCareer design decisions, informed by the
    PUBLICLY DOCUMENTED dimensions of competitor products the product spec
    asked to benchmark against (see docs/ATS_BENCHMARK_REPORT.md — not yet
    created as of Phase B). They are NOT claims about any competitor's
    actual proprietary algorithm, and they are NOT tuned to match any
    competitor's output — per the explicit "do not manipulate scores to
    match competitors" rule.
  - This file does NOT touch services/ats_engine/scoring.py's existing
    CATEGORY_WEIGHTS (the 7-category Match/Completeness/Confidence model).
    That model stays exactly as implemented — see its own module docstring.
    This file's weights are used ONLY by the new, parallel v2 aggregation
    layer (ats_intelligence_v2.py).

SCORING_ENGINE_VERSION is stamped onto every persisted AtsReport (both the
legacy path and the new v2 path) so historical reports stay attributable to
the model that produced them, and a future weight change can be identified
in stored data without guessing.
"""

SCORING_ENGINE_VERSION = "2.1.0"
# ── Version history ──────────────────────────────────────────────────────
#   2.0.0 — Phase B baseline. Resume ATS Health used ATS_HEALTH_WEIGHTS'
#           4-category model (parsing/sections/keyword_coverage/formatting)
#           only; resume_quality.py's content-quality signals did not feed
#           it. Job Match / Role Readiness weights unchanged since.
#   2.1.0 — Phase H1. Resume ATS Health became the two-layer model below
#           (RESUME_HEALTH_LAYER_WEIGHTS: 45% ATS Compatibility / 55%
#           Resume Quality) — a genuine scoring-model change, per the
#           explicit approval to bump the version so 2.0.0-era persisted
#           reports stay distinguishable from 2.1.0 ones. Job Match, Role
#           Readiness, JD sufficiency, and every other weight in this file
#           are UNCHANGED in 2.1.0 — only Resume ATS Health's formula moved.


# ── MODE A — Resume Health Score (no JD). Part 2 of the product spec.
# Directly matches the four dimensions the spec asked to benchmark against
# (documented as the general ResumeGyani-style model) — this is SahiCareer's
# own implementation of those four dimensions, not their algorithm.
ATS_HEALTH_WEIGHTS: dict[str, float] = {
    "parsing": 0.40,
    "sections": 0.20,
    "keyword_coverage": 0.25,
    "formatting": 0.15,
}

# ── Layer 1 (JD present) — ATS Compatibility. Same three structural
# dimensions as ATS_HEALTH_WEIGHTS minus keyword_coverage (keyword fit is
# JD-specific, so it lives in JOB_MATCH_WEIGHTS instead when a JD exists),
# renormalized to sum to 1.0. SahiCareer design decision, not a competitor
# claim — kept as its own named config (rather than re-deriving inline)
# so it's independently tunable during benchmarking.
ATS_COMPATIBILITY_WEIGHTS: dict[str, float] = {
    "parsing": 0.40 / 0.75,      # ≈ 0.5333
    "sections": 0.20 / 0.75,     # ≈ 0.2667
    "formatting": 0.15 / 0.75,   # = 0.2
}

# ── Layer 2 — Job Match (JD present). Part 2 Mode B of the product spec.
JOB_MATCH_WEIGHTS: dict[str, float] = {
    "keywords": 0.45,
    "experience": 0.22,
    "education": 0.12,
    "skills": 0.12,
    "certifications": 0.06,
    "location": 0.03,
}

# ── Layer 3 — Resume Quality (Phase C, services/ats_engine/resume_quality.py).
# 12 categories, per the Phase C product spec's own starting weights —
# EXCEPT: those given weights summed to 1.08, not 1.0 ({0.18+0.15+0.15+0.10+
# 0.08+0.08+0.08+0.06+0.05+0.03+0.02+0.10}). Per the spec's own instruction
# ("validate that weights sum correctly"), they're renormalized here,
# preserving their relative proportions exactly (each divided by 1.08) —
# not re-guessed. See weights_sum_to_one() below, and the Phase C tests that
# assert this dict specifically sums to 1.0.
_QUALITY_WEIGHTS_RAW: dict[str, float] = {
    "bullet_quality": 0.18,
    "quantified_impact": 0.15,
    "skill_evidence": 0.15,
    "summary_quality": 0.10,
    "action_verbs": 0.08,
    "readability": 0.08,
    "seniority": 0.08,
    "career_progression": 0.06,
    "completeness": 0.05,
    "repetition": 0.03,
    "credibility": 0.02,
    "recruiter_readiness": 0.10,
}
_QUALITY_WEIGHTS_RAW_TOTAL = sum(_QUALITY_WEIGHTS_RAW.values())  # 1.08
QUALITY_WEIGHTS: dict[str, float] = {
    k: v / _QUALITY_WEIGHTS_RAW_TOTAL for k, v in _QUALITY_WEIGHTS_RAW.items()
}

# ── Top-level blend of the three layers into one overall v2 score (JD
# present case only — Mode A/no-JD uses ATS_HEALTH_WEIGHTS directly instead,
# there's no "job match" or "resume quality" to blend without a JD).
# Same "never silently zero, redistribute" rule as the existing 7-category
# model applies here too: resume_quality is currently always excluded (not
# implemented yet) and its weight is redistributed across ats_compatibility
# and job_match — see ats_intelligence_v2.py.
ATS_SCORE_CONFIG: dict[str, float] = {
    "ats_compatibility": 0.20,
    "job_match": 0.55,
    "resume_quality": 0.25,
}


def weights_sum_to_one(weights: dict[str, float], tolerance: float = 1e-6) -> bool:
    """Sanity guard used by tests — every weight dict above must sum to 1.0."""
    return abs(sum(weights.values()) - 1.0) <= tolerance


# ── Phase G — JD sufficiency gate. ──────────────────────────────────────────
# A job title ("java developer") is not a job description. Before a Job
# Match score is computed and shown, the pasted JD must clear BOTH of these
# — never one or the other — per the explicit Phase G decision. Thresholds
# are a SahiCareer product decision (see docs/ATS_ANALYSIS_MODES.md), not
# tuned against any competitor's gate.
#
#   1. JD_SUFFICIENCY_MIN_CHARS — a bare title runs a handful of characters;
#      real JDs, even short ones, run into the hundreds. 150 was chosen as a
#      floor comfortably above any plausible title/role-name input while
#      still well below a genuinely thin (but real) JD paragraph.
#   2. JD_SUFFICIENCY_MIN_SIGNALS — at least 2 of JobParser's 7 structured
#      output fields must be non-empty. Requiring 2 (not 1) means a single
#      stray signal — e.g. a "5 years" substring match producing
#      min_experience_years from an otherwise-empty string, or the LLM
#      stretching a couple of keywords out of a title — can't alone pass
#      the gate; two independent signal types is a materially stronger
#      floor without inventing any NLP sophistication this codebase doesn't
#      have.
JD_SUFFICIENCY_MIN_CHARS = 150
JD_SUFFICIENCY_MIN_SIGNALS = 2
JD_SUFFICIENCY_SIGNAL_FIELDS = (
    "required_skills", "preferred_skills", "responsibilities",
    "keywords", "min_experience_years", "min_education", "certifications",
)


# ── Phase H1 — Resume ATS Health calibration. ───────────────────────────────
#
# The Phase H inspection found that Resume ATS Health (mode_orchestrator.py's
# resume_health_mode(), the score behind /api/ats/v2/check's "resume_health")
# used ONLY compute_resume_health_v2()'s 4 structural categories (parsing/
# sections/keyword_coverage/formatting) — meaning a resume could score high
# purely on being well-labeled and text-clean, regardless of whether its
# bullets had any real evidence, quantified impact, or a competent summary.
# resume_quality.py already computes all of that — it just was never wired
# into this score. This section fixes the WIRING, not the underlying
# heuristics: every weight below governs an already-existing, already-tested
# category function; nothing here changes what any individual category
# computes.
#
# Two-layer model:
#   Layer A — ATS Compatibility (parsing / sections / formatting / contact)
#   Layer B — Resume Quality    (resume_quality.py's existing category
#                                 FUNCTIONS, reused directly — see
#                                 RESUME_HEALTH_QUALITY_WEIGHTS below for why
#                                 the WEIGHT MAP isn't simply QUALITY_WEIGHTS)
# blended at the ratio in RESUME_HEALTH_LAYER_WEIGHTS.

# Layer A. Derived from the EXISTING ATS_COMPATIBILITY_WEIGHTS ratios above
# (parsing/sections/formatting, already used elsewhere in this file) with a
# new "contact" category carved out of the same 100% budget — not appended
# on top of it. Contact's underlying signal (parsing_quality.py's
# contact_extraction_score) already exists inside `parsing`'s own internal
# blend at a 5% sub-weight; that internal blend is INTENTIONALLY left
# untouched (Phase H1 explicitly preserves the existing parsing score rather
# than trying to strip contact back out of it), so there is a small,
# documented, accepted residual overlap — contact's real influence on Layer A
# goes from ~2% (buried, invisible) to its own visible ~10% here, not a
# clean 0-to-10% addition. See mode_orchestrator.py's
# _parsing_and_contact_categories() for exactly how both categories are
# built from ONE shared parsing_quality.analyze_parsing_quality() call (no
# duplicate heuristic pass).
_RESUME_HEALTH_CONTACT_WEIGHT = 0.10
RESUME_HEALTH_COMPATIBILITY_WEIGHTS: dict[str, float] = {
    "parsing": round(ATS_COMPATIBILITY_WEIGHTS["parsing"] * (1 - _RESUME_HEALTH_CONTACT_WEIGHT), 6),
    "sections": round(ATS_COMPATIBILITY_WEIGHTS["sections"] * (1 - _RESUME_HEALTH_CONTACT_WEIGHT), 6),
    "formatting": round(ATS_COMPATIBILITY_WEIGHTS["formatting"] * (1 - _RESUME_HEALTH_CONTACT_WEIGHT), 6),
    "contact": _RESUME_HEALTH_CONTACT_WEIGHT,
}

# Layer B weight map. NOT simply QUALITY_WEIGHTS as-is: resume_quality.py's
# OWN "completeness" category ("Content Completeness") is itself just
# scoring.profile_completeness()'s value wrapped as a CategoryAnalysis
# (see resume_quality._completeness_category()) — i.e. Profile Completeness
# already lives INSIDE resume_quality.analyze_resume_quality()'s blended
# score at QUALITY_WEIGHTS["completeness"] (~4.9%). Calling that function
# wholesale for Layer B would smuggle Profile Completeness back into Resume
# ATS Health through the back door, directly violating the explicit "Profile
# Completeness must NOT directly reduce Resume ATS Health, keep it a
# separate signal" requirement. So Layer B is built from resume_quality.py's
# 11 OTHER category functions, called directly (not through
# analyze_resume_quality()), with QUALITY_WEIGHTS' "completeness" entry
# removed and the remaining 11 renormalized to sum to 1.0 — preserving their
# existing RELATIVE proportions exactly, not re-guessed weights. This does
# not affect resume_quality.py itself or its OTHER consumer
# (compute_full_analysis(), used by the Resume Editor), which still
# legitimately wants Content Completeness folded into its own "Resume
# Quality" layer — only Resume ATS Health's Layer B excludes it.
_QUALITY_WEIGHTS_MINUS_COMPLETENESS_TOTAL = sum(v for k, v in QUALITY_WEIGHTS.items() if k != "completeness")
RESUME_HEALTH_QUALITY_WEIGHTS: dict[str, float] = {
    k: round(v / _QUALITY_WEIGHTS_MINUS_COMPLETENESS_TOTAL, 6)
    for k, v in QUALITY_WEIGHTS.items() if k != "completeness"
}

# Top-level blend: 45% ATS Compatibility / 55% Resume Quality. This exact
# split is an explicit, approved PRODUCT decision (not derived from a
# formula, not tuned against any competitor's output) — Resume Quality gets
# the larger share because the inspection's core finding was that content
# quality had ZERO influence before this phase, not that it should merely
# tie with structure. This ratio is EXPECTED to be recalibrated later once
# SahiCareer has its own benchmark dataset (docs/ATS_BENCHMARK_REPORT.md) to
# validate against — it is a reasonable starting point, not a final answer,
# and must never be adjusted to make any particular resume land on any
# particular competitor's number.
RESUME_HEALTH_LAYER_WEIGHTS: dict[str, float] = {
    "ats_compatibility": 0.45,
    "resume_quality": 0.55,
}
