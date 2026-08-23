"""
ATS Intelligence 2.0 — dual-score aggregation layer (Phase B).

Computes ats_intelligence_v2_score IN PARALLEL with the existing
legacy_overall_score / overall_score (the 7-category Match/Completeness/
Confidence model in scoring.py) — per Phase B decision 5/12, this does NOT
replace or modify either. Nothing in scoring.py is touched by this file;
CATEGORY_WEIGHTS, the 7 category functions, and _redistribute_weights() are
all untouched and still drive the score the UI currently shows.

Reuses the existing category functions unmodified wherever there's no
keyword-matching false-positive risk (experience, education, formatting —
pure date/degree-rank/text-heuristic logic, no fuzzy term matching
involved) — per decision 6, "keep exactly as implemented unless a
documented bug requires a change." Rebuilds keyword/skills/certifications
matching using the alias-aware, false-positive-safe v2 matcher
(keyword_aliases.match_lists_v2) instead of the old token_set_ratio-based
one, because that IS a documented bug (see keyword_aliases.py's docstring —
verified empirically: "React" == "React Native" under the old matcher).

Same "never silently score zero" philosophy as the 7-category model,
applied one level up: if an entire LAYER can't be computed (Resume Quality
— not implemented yet), its weight is redistributed across the layers that
can be computed, exactly like an individual category would be excluded and
redistributed within a layer.
"""
from . import ats_config, keyword_aliases, parsing_quality, section_recognizer, resume_quality as resume_quality_engine
from . import scoring as ats_scoring
from .scoring import CategoryAnalysis, _confidence, _experience_category, _education_category, _formatting_category


# ── Job Match v2 sub-categories ─────────────────────────────────────────────

def _keywords_category_v2(resume: dict, job: dict) -> CategoryAnalysis:
    job_keywords = list(job.get("keywords") or [])
    if not job_keywords:
        return CategoryAnalysis("keywords", "Keyword Match", applicable=False, match=None, completeness=0,
                                 confidence="low", reason="The job description has no extractable keywords to match against.")
    resume_all = list(resume.get("skills") or []) + list(resume.get("hard_skills") or []) + \
                 list(resume.get("soft_skills") or []) + list(resume.get("keywords") or [])
    result = keyword_aliases.match_lists_v2(resume_all, job_keywords, resume.get("raw_text", ""))
    text_len = len(resume.get("raw_text", "") or "")
    bullet_count = len(resume.get("bullets") or [])
    completeness = min(100, round((min(text_len, 1500) / 1500) * 60 + min(bullet_count, 8) / 8 * 40))
    return CategoryAnalysis(
        "keywords", "Keyword Match", applicable=True, match=result["pct"], completeness=completeness,
        confidence=_confidence(completeness, True), matched_evidence=result["found"], missing_evidence=result["missing"],
        reason=f"{len(result['found'])}/{len(job_keywords)} JD keywords found (alias-aware v2 matcher).",
    )


def _skills_category_v2(resume: dict, job: dict) -> CategoryAnalysis:
    job_skills = list(job.get("required_skills") or []) + list(job.get("preferred_skills") or [])
    if not job_skills:
        return CategoryAnalysis("skills", "Skills Match", applicable=False, match=None, completeness=0,
                                 confidence="low", reason="The job description doesn't list specific required/preferred skills.")
    resume_skills = list(resume.get("skills") or []) + list(resume.get("hard_skills") or [])
    result = keyword_aliases.match_lists_v2(resume_skills, job_skills, resume.get("raw_text", ""))
    completeness = min(100, round(len(set(s.lower() for s in resume_skills)) / 8 * 100))
    return CategoryAnalysis(
        "skills", "Skills Match", applicable=True, match=result["pct"], completeness=completeness,
        confidence=_confidence(completeness, len(resume_skills) > 0),
        matched_evidence=result["found"], missing_evidence=result["missing"],
        reason=f"{len(result['found'])}/{len(job_skills)} JD skills matched (alias-aware v2 matcher).",
    )


def _certifications_category_v2(resume: dict, job: dict) -> CategoryAnalysis:
    job_certs = list(job.get("certifications") or [])
    resume_certs = list(resume.get("certifications") or [])
    if not job_certs:
        return CategoryAnalysis("certifications", "Certification Match", applicable=False, match=None,
                                 completeness=min(100, len(resume_certs) * 25), confidence="low",
                                 reason="The job description doesn't require specific certifications.")
    result = keyword_aliases.match_lists_v2(resume_certs, job_certs, resume.get("raw_text", ""))
    completeness = min(100, len(resume_certs) * 25)
    return CategoryAnalysis(
        "certifications", "Certification Match", applicable=True, match=result["pct"], completeness=completeness,
        confidence=_confidence(completeness, len(resume_certs) > 0),
        matched_evidence=result["found"], missing_evidence=result["missing"],
        reason=f"{len(result['found'])}/{len(job_certs)} JD-required certifications found (alias-aware v2 matcher).",
    )


# ── Location — new category, no equivalent in the 7-category model (Part 13) ─

_LOCATION_SIGNAL_TERMS = ("remote", "hybrid", "on-site", "onsite", "in-office", "relocation",
                           "relocate", "work authorization", "visa sponsorship", "work permit")


def _location_category_v2(resume: dict, job: dict) -> CategoryAnalysis:
    """Deliberately modest: no geocoding/NER, no city gazetteer — this project
    doesn't have that capability and Part 27 forbids inventing sophistication
    that isn't real. Detects explicit location-signal language in the JD only;
    if none is present, the category is excluded and its weight redistributed,
    exactly as the spec requires ("Only score location if the JD contains
    meaningful location requirements")."""
    job_text = (job.get("raw_text") or "").lower()
    signals = [t for t in _LOCATION_SIGNAL_TERMS if t in job_text]
    if not signals:
        return CategoryAnalysis("location", "Location Match", applicable=False, match=None, completeness=0,
                                 confidence="low", reason="The job description states no meaningful location requirement (no remote/hybrid/onsite/relocation language detected).")

    resume_location = (resume.get("location") or "").strip()
    if "remote" in signals and not any(s in signals for s in ("on-site", "onsite", "in-office")):
        return CategoryAnalysis("location", "Location Match", applicable=True, match=100.0,
                                 completeness=100.0 if resume_location else 60.0,
                                 confidence="high", matched_evidence=["remote"],
                                 reason="The job is remote, so the candidate's location is not a constraint.")

    if not resume_location:
        return CategoryAnalysis("location", "Location Match", applicable=True, match=None, completeness=0,
                                 confidence="low",
                                 missing_evidence=["Resume does not state a location."],
                                 reason="The job description has location requirements, but the resume doesn't state a location — this does not mean the candidate is ineligible, only that it can't be assessed.")

    if resume_location.lower() in job_text:
        return CategoryAnalysis("location", "Location Match", applicable=True, match=100.0, completeness=100.0,
                                 confidence="high", matched_evidence=[resume_location],
                                 reason=f"The resume's stated location (\"{resume_location}\") appears in the job description.")

    if "relocation" in signals or "relocate" in signals:
        return CategoryAnalysis("location", "Location Match", applicable=True, match=70.0, completeness=80.0,
                                 confidence="medium", matched_evidence=["relocation mentioned in JD"],
                                 reason="The job description mentions relocation, which may offset a location mismatch — verify directly.")

    return CategoryAnalysis("location", "Location Match", applicable=True, match=40.0, completeness=80.0,
                             confidence="low",
                             missing_evidence=[f"Resume location (\"{resume_location}\") wasn't found in the job description's location language."],
                             reason="The job description specifies location requirements that don't obviously match the resume's stated location — this is an approximate text comparison, not verified geography.")


# ── ATS Compatibility v2 sub-categories ─────────────────────────────────────

def _parsing_category_v2(resume: dict) -> CategoryAnalysis:
    result = parsing_quality.analyze_parsing_quality(resume.get("raw_text", ""))
    return CategoryAnalysis("parsing", "Parsing Quality", applicable=True, match=float(result["score"]),
                             completeness=100.0, confidence="high" if result["score"] > 0 else "low",
                             reason=result["note"])


def _sections_category_v2(resume: dict) -> CategoryAnalysis:
    result = section_recognizer.recognize_sections(resume.get("raw_text", ""))
    score = round(result["section_extraction_ratio"] * 100)
    reason = f"{result['recognized_count']}/{result['expected_count']} core sections recognized ({', '.join(result['recognized_sections']) or 'none'})."
    if result["missing_core_sections"]:
        reason += f" Missing: {', '.join(result['missing_core_sections'])}."
    return CategoryAnalysis("sections", "Section Recognition", applicable=True, match=float(score),
                             completeness=100.0, confidence="high",
                             matched_evidence=result["recognized_sections"],
                             missing_evidence=result["missing_core_sections"], reason=reason)


# ── Generic weight redistribution (same rule as scoring.py, parameterized) ──

def _redistribute(items: list[CategoryAnalysis], weight_map: dict[str, float]) -> dict:
    usable = [c for c in items if c.applicable and c.match is not None]
    excluded = [c.key for c in items if not (c.applicable and c.match is not None)]
    if not usable:
        return {"weights": {}, "excluded": excluded, "score": None}
    total_default = sum(weight_map[c.key] for c in usable)
    weights = {c.key: (weight_map[c.key] / total_default) * 100 for c in usable} if total_default > 0 else \
              {c.key: 100 / len(usable) for c in usable}
    for c in items:
        c.weight = weights.get(c.key, 0.0)
    score = round(sum((c.match or 0) * (c.weight / 100) for c in usable))
    return {"weights": {k: round(v, 1) for k, v in weights.items()}, "excluded": excluded, "score": score}


# ── Layer aggregation ────────────────────────────────────────────────────────

def compute_job_match_v2(resume: dict, job: dict) -> dict:
    categories = [
        _keywords_category_v2(resume, job),
        _experience_category(resume, job),
        _education_category(resume, job),
        _skills_category_v2(resume, job),
        _certifications_category_v2(resume, job),
        _location_category_v2(resume, job),
    ]
    result = _redistribute(categories, ats_config.JOB_MATCH_WEIGHTS)
    return {
        "score": result["score"],
        "categories": {c.key: c.to_dict() for c in categories},
        "weights_used": result["weights"],
        "excluded_categories": result["excluded"],
    }


def compute_ats_compatibility_v2(resume: dict) -> dict:
    categories = [
        _parsing_category_v2(resume),
        _sections_category_v2(resume),
        _formatting_category(resume),
    ]
    result = _redistribute(categories, ats_config.ATS_COMPATIBILITY_WEIGHTS)
    return {
        "score": result["score"],
        "categories": {c.key: c.to_dict() for c in categories},
        "weights_used": result["weights"],
        "excluded_categories": result["excluded"],
    }


def compute_resume_health_v2(resume: dict) -> dict:
    """Mode A — no JD (product spec Part 2). A standalone score, not a
    sub-component of the 3-layer model — used when there's nothing to match
    against yet."""
    parsing = _parsing_category_v2(resume)
    sections = _sections_category_v2(resume)
    formatting = _formatting_category(resume)

    # "Keyword/Content Coverage" without a JD means: does the resume contain
    # substantive, ATS-relevant content at all (skills/keywords present,
    # meaningful text length) — not matched against anything external.
    resume_all = list(resume.get("skills") or []) + list(resume.get("hard_skills") or []) + \
                 list(resume.get("keywords") or [])
    text_len = len(resume.get("raw_text", "") or "")
    content_score = min(100, round(len(set(s.lower() for s in resume_all)) / 10 * 60 + min(text_len, 2000) / 2000 * 40))
    content = CategoryAnalysis("keyword_coverage", "Keyword/Content Coverage", applicable=True,
                                match=float(content_score), completeness=100.0,
                                confidence="high" if resume_all else "medium",
                                reason=f"{len(set(s.lower() for s in resume_all))} distinct skills/keywords listed; {text_len} characters of resume content.")

    categories = [parsing, sections, content, formatting]
    weight_map = {"parsing": ats_config.ATS_HEALTH_WEIGHTS["parsing"],
                  "sections": ats_config.ATS_HEALTH_WEIGHTS["sections"],
                  "keyword_coverage": ats_config.ATS_HEALTH_WEIGHTS["keyword_coverage"],
                  "formatting": ats_config.ATS_HEALTH_WEIGHTS["formatting"]}
    result = _redistribute(categories, weight_map)
    return {
        "score": result["score"],
        "categories": {c.key: c.to_dict() for c in categories},
        "weights_used": result["weights"],
        "excluded_categories": result["excluded"],
    }


def compute_resume_quality_v2(resume: dict) -> dict:
    """Phase C — thin wrapper so callers in this module go through one
    consistent import path; the real engine lives in resume_quality.py."""
    return resume_quality_engine.analyze_resume_quality(resume)


def compute_full_analysis(resume: dict, job: dict | None) -> dict:
    """Phase C — the general-purpose three-layer entry point (product spec
    Part 15/18), used by the Resume Editor (and, going forward, /ats-checker).

    Unlike analyze_v2() below — which is Phase B's frozen, tested contract
    (job=None → the separate, simpler "resume_health" Mode A score, and
    Resume Quality always hardcoded excluded since it didn't exist yet) —
    this function ALWAYS returns the three-layer shape (ats_compatibility,
    job_match, resume_quality), with Resume Quality now genuinely computed,
    and job_match excluded (never zero) when no JD is supplied. analyze_v2()
    is deliberately NOT modified: Phase B decided its exact behavior and it
    has its own passing tests asserting resume_quality is excluded there —
    this is a new, additive function for Phase C's requirement, not a
    rewrite of Phase B's.
    """
    ats_compat = compute_ats_compatibility_v2(resume)
    quality = compute_resume_quality_v2(resume)
    job_match = compute_job_match_v2(resume, job) if job else None

    layers = {
        "ats_compatibility": ats_compat["score"],
        "job_match": job_match["score"] if job_match else None,
        "resume_quality": quality["score"],
    }
    usable_layers = {k: v for k, v in layers.items() if v is not None}
    excluded_layers = [k for k in layers if k not in usable_layers]
    total_default = sum(ats_config.ATS_SCORE_CONFIG[k] for k in usable_layers)
    layer_weights = {k: (ats_config.ATS_SCORE_CONFIG[k] / total_default) * 100 for k in usable_layers} if total_default > 0 else {}
    overall = round(sum(usable_layers[k] * (layer_weights[k] / 100) for k in usable_layers)) if usable_layers else None

    return {
        "mode": "job_match" if job else "no_jd",
        "score": overall,
        "layers": layers,
        "layer_weights_used": {k: round(v, 1) for k, v in layer_weights.items()},
        "excluded_layers": excluded_layers,
        "ats_compatibility": ats_compat,
        "job_match": job_match,
        "resume_quality": quality,
        "scoring_engine_version": ats_config.SCORING_ENGINE_VERSION,
    }


def analyze_v2(resume: dict, job: dict | None) -> dict:
    """Top-level v2 entry point — Mode A (no job) or Mode B (job present).

    Mode B blends the three layers per ATS_SCORE_CONFIG. Resume Quality is
    ALWAYS excluded here, by design — this function's Phase B contract is
    frozen (its own tests assert this exact behavior) — see
    compute_full_analysis() above for the Phase C entry point that includes
    a real, computed Resume Quality score. Its weight is redistributed
    across ATS Compatibility and Job Match, same rule as every other "can't
    be computed" exclusion in this system, never a zero.
    """
    if not job:
        health = compute_resume_health_v2(resume)
        return {
            "mode": "resume_health",
            "score": health["score"],
            "resume_health": health,
            "scoring_engine_version": ats_config.SCORING_ENGINE_VERSION,
        }

    ats_compat = compute_ats_compatibility_v2(resume)
    job_match = compute_job_match_v2(resume, job)

    layers = {
        "ats_compatibility": ats_compat["score"],
        "job_match": job_match["score"],
        "resume_quality": None,  # not implemented yet — see ats_config.QUALITY_WEIGHTS docstring
    }
    usable_layers = {k: v for k, v in layers.items() if v is not None}
    excluded_layers = [k for k in layers if k not in usable_layers]
    total_default = sum(ats_config.ATS_SCORE_CONFIG[k] for k in usable_layers)
    layer_weights = {k: (ats_config.ATS_SCORE_CONFIG[k] / total_default) * 100 for k in usable_layers} if total_default > 0 else {}
    overall = round(sum(usable_layers[k] * (layer_weights[k] / 100) for k in usable_layers)) if usable_layers else None

    return {
        "mode": "job_match",
        "score": overall,
        "layers": layers,
        "layer_weights_used": {k: round(v, 1) for k, v in layer_weights.items()},
        "excluded_layers": excluded_layers,
        "ats_compatibility": ats_compat,
        "job_match": job_match,
        "scoring_engine_version": ats_config.SCORING_ENGINE_VERSION,
    }


# ── Editor integration helpers (Phase C, product spec Parts 19-20/23) ──────

_QUALITY_LABELS = {
    "bullet_quality": "bullet quality", "quantified_impact": "quantified impact",
    "action_verbs": "action verb strength", "skill_evidence": "skill evidence",
    "summary_quality": "summary quality", "readability": "readability",
    "seniority": "seniority signals", "career_progression": "career progression",
    "completeness": "content completeness", "repetition": "repetition",
    "credibility": "credibility", "recruiter_readiness": "recruiter readiness",
}


def build_editor_recommendations(resume: dict, job: dict | None, full_result: dict) -> dict:
    """HIGH/MEDIUM/LOW recommendations for the editor.

    Deliberately does NOT reuse scoring.categorize_keywords()/
    build_recommendations() for the job-gap section — those internally call
    the OLD, frozen keyword_engine.match_lists() (the one with the
    documented React/React-Native false-positive), which would silently
    hide exactly the kind of false negative this whole v2 engine exists to
    fix (e.g. it would say "React Native" is already found because the
    resume has "React"). Instead this reads missing_evidence directly off
    job_match's OWN categories, which already went through the alias-aware
    v2 matcher (keyword_aliases.match_lists_v2)."""
    high, medium, low = [], [], []

    # Every recommendation dict below carries source_layer/source_category
    # DIRECTLY — Phase D's ai_recommendations.classify_and_stage() needs to
    # know exactly which category produced each one to pick the right
    # action_type and locate the right target text. An earlier version of
    # this tried to reverse-engineer the source category by substring-
    # matching `why` text back against category reasons — that broke
    # silently for every item below, because none of their `why` text is
    # actually `cat["reason"]` verbatim (caught by the Phase D E2E test:
    # every job_match-sourced recommendation was mis-bucketed as a generic
    # bullet-quality fix). Attaching the source directly avoids the guess
    # entirely rather than making the guess smarter.
    if job:
        jm = full_result["job_match"]["categories"]
        kw = jm.get("keywords", {})
        for term in (kw.get("missing_evidence") or [])[:5]:
            high.append({
                "issue": f"\"{term}\" is required by the job description but wasn't found on your resume.",
                "why": "This is a JD keyword — missing it can filter you out of an ATS keyword search.",
                "action": f"Add \"{term}\" ONLY if you genuinely have experience with it — never fabricate a skill to pass a keyword filter.",
                "impact": "High — required keywords are often used as an initial ATS filter.",
                "source_layer": "job_match", "source_category": "keywords",
            })
        skl = jm.get("skills", {})
        seen_high = {r["issue"] for r in high}
        for term in (skl.get("missing_evidence") or [])[:3]:
            issue = f"\"{term}\" skill from the job description isn't reflected in your resume."
            if issue not in seen_high:
                medium.append({
                    "issue": issue, "why": "Listed as a required/preferred skill in the job description.",
                    "action": f"Consider adding \"{term}\" if it genuinely applies to your background.",
                    "impact": "Medium — improves match strength but isn't a hard requirement.",
                    "source_layer": "job_match", "source_category": "skills",
                })
        exp = jm.get("experience", {})
        if exp.get("missing_evidence"):
            high.append({
                "issue": "Experience entries are missing key details.", "why": exp.get("reason", ""),
                "action": "Add job titles, employment dates, and bullet points to each role.",
                "impact": "High — incomplete experience entries can't be confidently matched against the JD.",
                "source_layer": "job_match", "source_category": "experience",
            })
        edu = jm.get("education", {})
        if edu.get("applicable") and edu.get("completeness", 100) < 100 and edu.get("match") is not None:
            medium.append({
                "issue": "Education entry is incomplete.", "why": "Institution name or graduation year is missing.",
                "action": "Add the missing details.",
                "impact": "Medium — affects completeness and recruiter confidence, not the match score itself.",
                "source_layer": "job_match", "source_category": "education",
            })

    for key, cat in full_result["resume_quality"]["categories"].items():
        if not cat["applicable"] or cat["match"] is None:
            continue
        label = _QUALITY_LABELS.get(key, key)
        if cat["match"] < 40:
            tier = high
        elif cat["match"] < 65:
            tier = medium
        else:
            if not cat["missing_evidence"]:
                continue
            tier = low
        tier.append({
            "issue": f"{label.capitalize()} is weak ({round(cat['match'])}/100)" if cat["match"] < 65 else f"Minor {label} issue",
            "why": cat["reason"],
            "action": (cat["missing_evidence"][0] if cat["missing_evidence"] else f"Review and strengthen {label}.") ,
            "impact": f"Affects the Resume Quality score (weight {cat['weight']}%).",
            "source_layer": "resume_quality", "source_category": key,
        })

    return {"high": high[:8], "medium": medium[:8], "low": low[:8]}


def build_editor_questions(resume: dict, job: dict | None, full_result: dict) -> list[str]:
    """Deterministic, evidence-grounded questions — never invents an answer.
    Combines Resume Quality's own findings with the existing JD-aware
    question builder when a JD is present (same shape-compatibility as
    build_editor_recommendations above)."""
    questions = resume_quality_engine.build_resume_quality_questions(resume, full_result["resume_quality"]["categories"])
    if job:
        questions = questions + ats_scoring.build_candidate_questions(resume, full_result["job_match"]["categories"])
    # de-dupe while preserving order
    seen = set()
    out = []
    for q in questions:
        if q not in seen:
            seen.add(q)
            out.append(q)
    return out[:10]


def build_debug_breakdown(full_result: dict) -> dict:
    """Product spec Part 23 — raw_score / weight / weighted_contribution /
    completeness / confidence / evidence / excluded_reason per category,
    across all three layers. Opt-in only (see the router's `debug` flag) —
    never sent to normal users by default."""
    debug = {}
    for layer_key in ("ats_compatibility", "job_match", "resume_quality"):
        layer = full_result.get(layer_key)
        if not layer:
            debug[layer_key] = {"excluded_reason": "Not computed — no job description provided." if layer_key == "job_match" else None}
            continue
        rows = {}
        for cat_key, cat in layer["categories"].items():
            rows[cat_key] = {
                "raw_score": cat["match"],
                "weight": cat["weight"],
                "weighted_contribution": round((cat["match"] or 0) * (cat["weight"] / 100), 2),
                "completeness": cat["completeness"],
                "confidence": cat["confidence"],
                "evidence": {"matched": cat["matched_evidence"], "missing": cat["missing_evidence"]},
                "excluded_reason": cat["reason"] if not cat["applicable"] or cat["match"] is None else None,
            }
        debug[layer_key] = {"score": layer["score"], "weights_used": layer["weights_used"],
                             "excluded_categories": layer["excluded_categories"], "categories": rows}
    debug["layer_weights_used"] = full_result["layer_weights_used"]
    debug["excluded_layers"] = full_result["excluded_layers"]
    return debug
