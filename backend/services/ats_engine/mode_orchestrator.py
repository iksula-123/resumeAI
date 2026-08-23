"""
Phase G — mode orchestration for the redesigned ATS Checker.

Composes THREE independently-optional analysis modes on top of the existing,
FROZEN scoring engines. This file computes NOTHING new mathematically — it
only decides which existing function to call for which mode, and how to
label/gate the result. No weight, no formula, no SCORING_ENGINE_VERSION is
touched here (Phase H1's Resume ATS Health reweighting lives in
ats_config.py, per the "one place for every weight" convention — see that
file's Phase H1 section). See docs/ATS_ANALYSIS_MODES.md for the product
rationale.

  - resume_health  -> Phase H1 two-layer model (see resume_health_mode()
                       below): Layer A (ATS Compatibility: parsing/sections/
                       formatting/contact) blended with Layer B (Resume
                       Quality: resume_quality.py's existing categories,
                       unmodified), at RESUME_HEALTH_LAYER_WEIGHTS (45/55).
                       Profile Completeness stays a separate, non-scored
                       signal, per the explicit "never blend Profile
                       Completeness into ATS Health" requirement.
  - role_readiness -> ats_intelligence_v2.compute_job_match_v2() reused
                       AS-IS against the role-library's synthetic job dict
                       (services/roles.py data, resolved by the router's
                       existing _job_from_role()) — same frozen
                       JOB_MATCH_WEIGHTS, just relabeled + annotated with a
                       data-sufficiency flag so a role title is never
                       presented as if it were a real JD.
  - job_match      -> compute_job_match_v2() against a real parsed JD, gated
                       by job_parser.assess_sufficiency() — never scored
                       when insufficient (job_match.score stays null).

Every function here takes plain dicts (resume / job) — no DB or router
imports — so it stays reusable and unit-testable in isolation.
"""
from . import ats_config, ats_intelligence_v2, parsing_quality, resume_quality as resume_quality_engine
from .scoring import CategoryAnalysis, profile_completeness as compute_profile_completeness

_ROLE_LIMITED_MESSAGE = "Role analysis is currently based on limited role information."
_ROLE_SKILLS_ONLY_MESSAGE = "Role analysis is based primarily on available skill data."
_JOB_INSUFFICIENT_MESSAGE = "Add the full job description to get a reliable Job Match score."

# Priorities ("How to improve") only surface a category that's genuinely
# worth fixing — same threshold this codebase already uses elsewhere for
# "weak" (frontend's old weakSections cutoff was <60; ScoreBar's gaugeColor
# treats <75 as amber/red, not green) — 75 keeps this consistent rather than
# inventing a new cutoff.
_PRIORITY_THRESHOLD = 75
_PRIORITY_MAX_ITEMS = 5


def _parsing_and_contact_categories(resume: dict) -> tuple[CategoryAnalysis, CategoryAnalysis]:
    """ONE shared call to parsing_quality.analyze_parsing_quality() produces
    BOTH categories below — no duplicate heuristic pass, and no change to
    what analyze_parsing_quality() computes internally (its `score` field,
    and thus this "parsing" category's match value, is byte-identical to
    what ats_intelligence_v2._parsing_category_v2() has always produced).
    "contact" is a NEW category exposing a value that already existed
    inside that same result (contact_extraction_score, previously only a
    5%-of-40% sub-weight buried inside parsing, invisible on its own) —
    see ats_config.py's Phase H1 section for why this is an intentional,
    documented, accepted overlap rather than a silent double-count."""
    result = parsing_quality.analyze_parsing_quality(resume.get("raw_text", "") or "")

    parsing = CategoryAnalysis(
        "parsing", "Parsing Quality", applicable=True, match=float(result["score"]),
        completeness=100.0, confidence="high" if result["score"] > 0 else "low",
        reason=result["note"],
    )
    contact_score = float(result["contact_extraction_score"])
    contact = CategoryAnalysis(
        "contact", "Contact / Essential Information", applicable=True, match=contact_score,
        completeness=100.0, confidence="high" if contact_score > 0 else "low",
        reason=result["contact_note"],
    )
    return parsing, contact


def _quality_layer(resume: dict) -> dict:
    """Layer B — Resume Quality. Calls resume_quality.py's category
    functions DIRECTLY rather than analyze_resume_quality() — that function
    also runs _completeness_category() (a wrapper around
    scoring.profile_completeness()), and Profile Completeness must NOT
    feed Resume ATS Health (explicit product requirement — it's shown as
    its own separate supplementary signal instead, see resume_health_mode()
    below). Every category function itself is unmodified; only which ones
    are included, and their relative weights, differ from
    analyze_resume_quality()'s own aggregation. See ats_config.py's
    RESUME_HEALTH_QUALITY_WEIGHTS for the exact renormalization."""
    categories = [
        resume_quality_engine._bullet_quality_category(resume),
        resume_quality_engine._quantified_impact_category(resume),
        resume_quality_engine._action_verbs_category(resume),
        resume_quality_engine._skill_evidence_category(resume),
        resume_quality_engine._summary_category(resume),
        resume_quality_engine._readability_category(resume),
        resume_quality_engine._seniority_category(resume),
        resume_quality_engine._career_progression_category(resume),
        resume_quality_engine._repetition_category(resume),
        resume_quality_engine._credibility_category(resume),
        resume_quality_engine._recruiter_readiness_category(resume),
    ]
    result = ats_intelligence_v2._redistribute(categories, ats_config.RESUME_HEALTH_QUALITY_WEIGHTS)
    return {
        "score": result["score"],
        "categories": {c.key: c.to_dict() for c in categories},
        "weights_used": result["weights"],
        "excluded_categories": result["excluded"],
    }


def _compatibility_layer(resume: dict) -> dict:
    """Layer A — ATS Compatibility. Every category here is an existing,
    unmodified function (parsing_quality.py, section_recognizer.py via
    ats_intelligence_v2._sections_category_v2, text_metrics.formatting_score
    via scoring._formatting_category) — the only new code is `contact` and
    the weight split, both in ats_config.py's RESUME_HEALTH_COMPATIBILITY_
    WEIGHTS. Uses the same generic, already-existing redistribution helper
    (never-zero-for-missing, exclude+renormalize) every other layer in this
    system uses — not reimplemented here."""
    parsing, contact = _parsing_and_contact_categories(resume)
    sections = ats_intelligence_v2._sections_category_v2(resume)
    formatting = ats_intelligence_v2._formatting_category(resume)
    categories = [parsing, sections, formatting, contact]
    result = ats_intelligence_v2._redistribute(categories, ats_config.RESUME_HEALTH_COMPATIBILITY_WEIGHTS)
    return {
        "score": result["score"],
        "categories": {c.key: c.to_dict() for c in categories},
        "weights_used": result["weights"],
        "excluded_categories": result["excluded"],
    }


def resume_health_priorities(compat: dict, quality: dict) -> list[dict]:
    """'How to improve' — the weakest APPLICABLE categories across BOTH
    layers, worst-first, capped at _PRIORITY_MAX_ITEMS and floored at
    _PRIORITY_THRESHOLD so a resume that's already strong everywhere isn't
    handed trivial nitpicks (Phase H1: "do not overwhelm the user with
    every minor issue"). Reuses each category's own `reason`/
    `missing_evidence` text verbatim — no new advice copy is invented here."""
    candidates = []
    for layer_key, layer in (("ats_compatibility", compat), ("resume_quality", quality)):
        for cat in layer.get("categories", {}).values():
            if not cat.get("applicable") or cat.get("match") is None:
                continue
            if cat["match"] >= _PRIORITY_THRESHOLD:
                continue
            candidates.append((cat["match"], layer_key, cat))
    candidates.sort(key=lambda t: t[0])  # weakest first

    items = []
    for match, layer_key, cat in candidates[:_PRIORITY_MAX_ITEMS]:
        action = cat["missing_evidence"][0] if cat.get("missing_evidence") else cat["reason"]
        items.append({
            "category": cat["key"], "label": cat["label"], "layer": layer_key,
            "score": round(match),
            "issue": f"{cat['label']} is weak ({round(match)}/100)",
            "why": cat["reason"], "action": action,
        })
    return items


def resume_health_mode(resume: dict) -> dict:
    """Mode 1 — always available, never depends on a role or JD.

    Phase H1: Resume ATS Health = 0.45 * Layer A (ATS Compatibility) +
    0.55 * Layer B (Resume Quality) — see ats_config.py's
    RESUME_HEALTH_LAYER_WEIGHTS for the exact ratio and why. If either
    layer is entirely uncomputable (score is None — e.g. a totally empty
    resume), its weight is redistributed to the other, same never-silently-
    zero rule as everywhere else in this system; only if BOTH are
    uncomputable does the overall score become None."""
    compat = _compatibility_layer(resume)
    quality = _quality_layer(resume)
    completeness = compute_profile_completeness(resume)

    layers = {"ats_compatibility": compat["score"], "resume_quality": quality["score"]}
    usable_layers = {k: v for k, v in layers.items() if v is not None}
    excluded_layers = [k for k in layers if k not in usable_layers]
    total_default = sum(ats_config.RESUME_HEALTH_LAYER_WEIGHTS[k] for k in usable_layers)
    layer_weights = {k: (ats_config.RESUME_HEALTH_LAYER_WEIGHTS[k] / total_default) * 100
                      for k in usable_layers} if total_default > 0 else {}
    overall = round(sum(usable_layers[k] * (layer_weights[k] / 100) for k in usable_layers)) \
        if usable_layers else None

    # Profile Completeness is deliberately kept OUT of both layers and
    # labeled as its own concept, per the explicit "clearly separate
    # Profile Completeness from Resume ATS Health" requirement — never
    # silently blended into the score.
    supplementary = {
        "completeness": {
            "key": "completeness", "label": "Profile Completeness", "applicable": True,
            "match": completeness["overall"], "contributes_to_score": False,
            "reason": "How much of your profile is filled in — a separate concept "
                      "from ATS readiness. Does not affect the Resume ATS Health score.",
        }
    }

    return {
        "available": True,
        "score": overall,
        "layers": {"ats_compatibility": compat, "resume_quality": quality},
        "layer_weights_used": {k: round(v, 1) for k, v in layer_weights.items()},
        "excluded_layers": excluded_layers,
        "supplementary": supplementary,
        "priorities": resume_health_priorities(compat, quality),
    }


def resume_health_as_full_analysis(resume: dict, job: dict | None = None, sufficiency: dict | None = None) -> dict:
    """Adapts resume_health_mode()'s shape into the exact shape
    ats_intelligence_v2.compute_full_analysis(resume, job) would have
    returned — so a caller that used to read compute_full_analysis()'s
    result (the Resume Editor's /analyze-editor, see routers/
    ats_engine.py) can switch to the SAME canonical Resume ATS Health the
    ATS Checker shows, without changing the shape every other line of that
    caller depends on (build_editor_recommendations/build_editor_questions
    both index into result["resume_quality"]["categories"] etc.).

    `job`/`sufficiency` are OPTIONAL (ATS consolidation, Phase 2): when
    given, job_match_mode(resume, job, sufficiency) is ALSO composed into
    the response's `job_match` slot — but `score` (the headline "ATS
    Score" a caller like the Editor shows) is ALWAYS Resume ATS Health,
    never blended with Job Match, exactly matching the ATS Checker's own
    "Resume ATS Health stays resume-only; Job Match is a separate,
    optional metric" rule. This keeps the no-JD call shape and behavior
    (every existing caller/test using the 1-arg form) byte-identical to
    before — only a caller that now passes job/sufficiency gets the
    job_match slot populated.

    Why this exists: compute_full_analysis(resume, job) and
    resume_health_mode(resume) used to be two DIFFERENT, silently
    diverging calculations for what a user sees as one concept — "my
    resume's ATS score" — compute_full_analysis() blends via
    ATS_SCORE_CONFIG's redistributed weights (not RESUME_HEALTH_LAYER_
    WEIGHTS), its resume_quality is analyze_resume_quality() (which still
    includes Profile Completeness; resume_health_mode() explicitly
    excludes it), AND (the JD-present case) it blends Job Match INTO the
    headline score instead of keeping it separate. Found via the CRUD/
    consistency acceptance test (no-JD case) and the ATS consolidation
    audit (JD-present case) — see docs/ATS_NAVIGATION_AND_EDITOR_HANDOFF.md
    and docs/ATS_ANALYSIS_MODES.md. This function invents no new formula:
    it only reshapes the existing, unmodified resume_health_mode()/
    job_match_mode() output. compute_full_analysis() itself is untouched
    and still used exactly as before by its remaining callers (the
    benchmark suite, Phase C's own tests)."""
    health = resume_health_mode(resume)
    job_match = job_match_mode(resume, job, sufficiency) if job else None
    job_match_score = job_match.get("score") if job_match else None
    job_match_categories = job_match.get("categories", {}) if job_match else {}
    return {
        "mode": "job_match" if job else "no_jd",
        "score": health["score"],
        "layers": {
            "ats_compatibility": health["layers"]["ats_compatibility"]["score"],
            "job_match": job_match_score,
            "resume_quality": health["layers"]["resume_quality"]["score"],
        },
        "layer_weights_used": health["layer_weights_used"],
        "excluded_layers": health["excluded_layers"],
        "ats_compatibility": health["layers"]["ats_compatibility"],
        "job_match": {"score": job_match_score, "categories": job_match_categories, **{
            k: v for k, v in (job_match or {}).items() if k not in ("score", "categories")
        }} if job_match else None,
        "resume_quality": health["layers"]["resume_quality"],
        "scoring_engine_version": ats_config.SCORING_ENGINE_VERSION,
    }


def resume_health_as_legacy_score_shape(resume: dict) -> dict:
    """Adapts resume_health_mode()'s shape into the legacy {"score",
    "breakdown", "recommendations"} shape services/ats.py::analyze_resume()
    used to return — for callers not yet migrated onto the full canonical
    response shape (ATS consolidation Phase 3: AI Resume Upgrade's
    /api/upgrade/analyze and /api/upgrade/enhance before/after scoring).
    Invents no new formula: reshapes resume_health_mode()'s own output
    only. `score` is coerced to 0 (never None) to match the legacy
    contract's non-nullable `number` — the ONLY case this can differ from
    a real 0-100 score is a completely empty resume, where 0 is an honest
    answer anyway."""
    health = resume_health_mode(resume)
    breakdown: dict[str, float] = {}
    for layer in (health["layers"]["ats_compatibility"], health["layers"]["resume_quality"]):
        for cat in layer["categories"].values():
            if cat.get("applicable") and cat.get("match") is not None:
                breakdown[cat["label"]] = round(cat["match"])
    recommendations = [p["action"] for p in health["priorities"]]
    return {
        "score": health["score"] if health["score"] is not None else 0,
        "breakdown": breakdown,
        "recommendations": recommendations,
    }


def role_readiness_mode(resume: dict, role_job: dict | None) -> dict:
    """Mode 2 — optional. `role_job` is the router's already-resolved
    synthetic job dict from services/roles.py (or None if no role selected).
    A role title is never treated as a real JD: responsibilities are always
    empty for role data (the role library has none), and a role that wasn't
    found in the library at all gets NO invented score."""
    if not role_job:
        return {"available": False}

    role_title = role_job.get("job_title")
    parsed_by = role_job.get("parsed_by")
    has_skills = bool(role_job.get("required_skills") or role_job.get("keywords"))
    has_education = bool(role_job.get("min_education"))
    has_certs = bool(role_job.get("certifications"))

    if parsed_by == "role_library_unmatched" or not has_skills:
        return {
            "available": True, "role": role_title,
            "data_sufficiency": "limited", "score": None, "categories": {},
            "message": _ROLE_LIMITED_MESSAGE,
        }

    result = ats_intelligence_v2.compute_job_match_v2(resume, role_job)
    sufficiency = "sufficient" if (has_education or has_certs) else "limited"
    return {
        "available": True, "role": role_title,
        "data_sufficiency": sufficiency, "score": result["score"],
        "categories": result["categories"], "weights_used": result["weights_used"],
        "excluded_categories": result["excluded_categories"],
        "message": None if sufficiency == "sufficient" else _ROLE_SKILLS_ONLY_MESSAGE,
    }


def job_match_mode(resume: dict, job: dict | None, sufficiency: dict | None) -> dict:
    """Mode 3 — optional. `job` is the router's already-parsed JD dict (or
    None if no JD pasted); `sufficiency` is job_parser.assess_sufficiency()'s
    result for it. Never computes/returns a score when insufficient."""
    if not job or sufficiency is None:
        return {"available": False}

    if not sufficiency["sufficient"]:
        return {
            "available": True, "sufficient": False, "score": None, "categories": {},
            "message": _JOB_INSUFFICIENT_MESSAGE, "sufficiency": sufficiency,
        }

    result = ats_intelligence_v2.compute_job_match_v2(resume, job)
    return {
        "available": True, "sufficient": True, "score": result["score"],
        "categories": result["categories"], "weights_used": result["weights_used"],
        "excluded_categories": result["excluded_categories"], "sufficiency": sufficiency,
    }
