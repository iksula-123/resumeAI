"""
ATS Intelligence 2.0 — Resume Quality engine (Phase C, product spec Parts 3-13).

The third of the three layers (ATS Compatibility / Job Match / Resume
Quality). Deliberately JD-INDEPENDENT — every function here takes only
`resume`, never `job` — "quality" here means "how strong is this resume on
its own terms," not "how well does it match a specific posting" (that's
Job Match's job). This is why it can always be computed, JD or not, which
is exactly what lets the Resume Editor show a live score while a candidate
is writing with no job description pasted yet.

Reuses existing, working modules rather than re-implementing what's already
there: `text_metrics.readability_score()` / `recruiter_readiness_score()`,
`services/grammar.check_text()` (a real, working, on-device spell/grammar
checker — see its own docstring), and `scoring.profile_completeness()`.
None of those are modified — only imported.

Same Match/Completeness/Confidence contract as every other category in this
system, same "never silently zero for missing data" rule, same weight-
redistribution-when-uncomputable rule — this is a new layer, not a new
philosophy.
"""
import re
from datetime import datetime

from . import text_metrics
from .keyword_aliases import _word_boundary_present, _normalize
from .scoring import CategoryAnalysis, _confidence, profile_completeness
from . import ats_config

try:
    from services import grammar as grammar_service
except ImportError:  # pragma: no cover - defensive, matches the rest of this
    grammar_service = None  # pipeline's "AI/optional deps never hard-fail" pattern


# ── Shared helpers ───────────────────────────────────────────────────────────

_WEAK_BULLET_STARTS = ("responsible for", "worked on", "helped", "handled", "assisted with", "assisted", "did")
_STRONG_VERBS = {
    "developed", "implemented", "designed", "optimized", "resolved", "led", "managed",
    "automated", "delivered", "analyzed", "configured", "built", "created", "launched",
    "improved", "increased", "reduced", "drove", "achieved", "spearheaded", "architected",
    "engineered", "streamlined", "negotiated", "mentored", "coordinated", "established",
    "generated", "collaborated", "authored", "owned", "scaled", "deployed",
}
_GENERIC_SUMMARY_PHRASES = (
    "hardworking professional", "team player", "results-oriented", "self-motivated",
    "detail-oriented", "go-getter", "passionate about", "looking for opportunities",
    "seeking a position", "dynamic individual", "highly motivated", "proven track record",
    "think outside the box", "synergy", "excellent communication skills",
)
# Tight patterns — the number and its unit sit right next to each other, so
# adjacency is a reliable, low-false-positive signal (40%, $5000, 3x, 2:1).
_TIGHT_METRIC_RE = re.compile(
    r"\d+(\.\d+)?\s*%|[₹$€£]\s*\d|\b\d+[-\s]?person\b|\b\d+x\b|\b\d+\s*:\s*\d+\b",
    re.IGNORECASE,
)
# Loose pattern — a real number anywhere in the bullet (excluding bare 4-digit
# years, which are dates, not metrics) alongside a plausible metric-unit word
# ANYWHERE in the same bullet, not necessarily adjacent — natural phrasing
# like "500 monthly support tickets" or "team of 4 developers" puts other
# words between the number and its unit.
_ANY_NUMBER_RE = re.compile(r"\b\d+\+?\b")
_YEAR_RE = re.compile(r"^(19|20)\d{2}$")
_LOOSE_UNIT_WORDS = (
    "users?", "tickets?", "hours?", "minutes?", "people", "members?", "projects?",
    "clients?", "customers?", "leads?", "days?", "weeks?", "months?", "years?",
    "downloads?", "requests?", "records?", "stores?", "regions?", "countries?",
    "servers?", "releases?", "developers?", "engineers?", "employees?", "vendors?",
    "team", "teams", "revenue", "sales", "budget", "cost", "savings?", "sla",
)
_LOOSE_UNIT_RE = re.compile(r"\b(" + "|".join(_LOOSE_UNIT_WORDS) + r")\b", re.IGNORECASE)


def _has_quantified_metric(bullet: str) -> bool:
    if _TIGHT_METRIC_RE.search(bullet):
        return True
    numbers = [n for n in _ANY_NUMBER_RE.findall(bullet) if not _YEAR_RE.match(n.rstrip("+"))]
    return bool(numbers) and bool(_LOOSE_UNIT_RE.search(bullet))
_SENIORITY_TERMS = (
    "led a team", "led the team", "managed a team", "managed the team", "mentored",
    "owned", "architected", "stakeholder", "cross-functional", "strategic",
    "decision-making", "reporting to", "direct reports", "team of", "oversaw",
)
_TITLE_RANK = [
    (0, ("intern", "trainee")),
    (1, ("junior", "associate", "entry level", "entry-level")),
    (2, ("developer", "engineer", "analyst", "specialist", "executive", "consultant")),  # unqualified/mid
    (3, ("senior", "sr.", "sr ")),
    (4, ("lead", "principal", "staff")),
    (5, ("manager", "head of")),
    (6, ("director", "vp", "vice president", "chief", "cto", "ceo", "cfo")),
]


def _all_bullets(resume: dict) -> list[str]:
    return [b for e in (resume.get("experience") or []) for b in (e.get("bullets") or []) if str(b).strip()]


def _title_rank(title: str) -> int:
    t = (title or "").lower()
    for rank, markers in reversed(_TITLE_RANK):
        if any(m in t for m in markers):
            return rank
    return -1


# ── 1. Bullet Quality ────────────────────────────────────────────────────────

def _bullet_quality_category(resume: dict) -> CategoryAnalysis:
    bullets = _all_bullets(resume)
    if not bullets:
        return CategoryAnalysis("bullet_quality", "Bullet Quality", applicable=True, match=None, completeness=0,
                                 confidence="low", missing_evidence=["No experience bullet points to evaluate."],
                                 reason="No bullet points available — this is a data gap, not evidence of weak content.")

    weak, strong_start, ok_length = [], 0, 0
    for b in bullets:
        low = b.strip().lower()
        if any(low.startswith(w) for w in _WEAK_BULLET_STARTS):
            weak.append(b)
        first_word = re.sub(r"[^a-z]", "", low.split()[0]) if low.split() else ""
        if first_word in _STRONG_VERBS:
            strong_start += 1
        wc = len(b.split())
        if 4 <= wc <= 40:
            ok_length += 1

    ratio = (strong_start / len(bullets) * 0.5) + (ok_length / len(bullets) * 0.3) + \
            ((len(bullets) - len(weak)) / len(bullets) * 0.2)
    match = round(min(1.0, ratio) * 100)
    completeness = min(100, round(len(bullets) / 6 * 100))

    return CategoryAnalysis(
        "bullet_quality", "Bullet Quality", applicable=True, match=float(match), completeness=completeness,
        confidence=_confidence(completeness, True),
        matched_evidence=[b for b in bullets if b not in weak][:3],
        missing_evidence=[f"Weak phrasing: \"{b}\"" for b in weak[:5]],
        reason=f"{strong_start}/{len(bullets)} bullets open with a strong action verb; {len(weak)} use weak framing (e.g. \"responsible for\").",
    )


# ── 2. Quantified Impact ─────────────────────────────────────────────────────

def _quantified_impact_category(resume: dict) -> CategoryAnalysis:
    bullets = _all_bullets(resume)
    if not bullets:
        return CategoryAnalysis("quantified_impact", "Quantified Impact", applicable=True, match=None, completeness=0,
                                 confidence="low", missing_evidence=["No experience bullet points to evaluate."],
                                 reason="No bullet points available — this is a data gap, not evidence of missing impact.")

    quantified = [b for b in bullets if _has_quantified_metric(b)]
    unquantified = [b for b in bullets if b not in quantified]
    ratio = len(quantified) / len(bullets)
    match = round(ratio * 100)
    completeness = min(100, round(len(bullets) / 6 * 100))

    return CategoryAnalysis(
        "quantified_impact", "Quantified Impact", applicable=True, match=float(match), completeness=completeness,
        confidence=_confidence(completeness, True),
        matched_evidence=quantified[:3],
        missing_evidence=[f"No measurable outcome: \"{b}\"" for b in unquantified[:5]],
        reason=(f"{len(quantified)}/{len(bullets)} bullets include a measurable metric (%, ₹/$, counts, time). "
                "Not every bullet needs one — some responsibilities genuinely aren't quantifiable — but each "
                "unquantified one below is worth checking for a real number, never an invented one."),
    )


# ── 3. Action Verb Strength ──────────────────────────────────────────────────

def _action_verbs_category(resume: dict) -> CategoryAnalysis:
    bullets = _all_bullets(resume)
    if not bullets:
        return CategoryAnalysis("action_verbs", "Action Verb Strength", applicable=True, match=None, completeness=0,
                                 confidence="low", reason="No bullet points available to evaluate verb usage.")

    weak_bullets, strong_verbs_found = [], []
    for b in bullets:
        low = b.strip().lower()
        if any(low.startswith(w) for w in _WEAK_BULLET_STARTS):
            weak_bullets.append(b)
            continue
        first_word = re.sub(r"[^a-z]", "", low.split()[0]) if low.split() else ""
        if first_word in _STRONG_VERBS:
            strong_verbs_found.append(first_word)

    strong_ratio = len(strong_verbs_found) / len(bullets)
    match = round(strong_ratio * 100)
    completeness = min(100, round(len(bullets) / 6 * 100))
    return CategoryAnalysis(
        "action_verbs", "Action Verb Strength", applicable=True, match=float(match), completeness=completeness,
        confidence=_confidence(completeness, True),
        matched_evidence=sorted(set(strong_verbs_found))[:8],
        missing_evidence=[f"\"{b}\" — consider a stronger opener (Developed, Led, Resolved, Automated…)" for b in weak_bullets[:5]],
        reason=f"{len(strong_verbs_found)}/{len(bullets)} bullets open with a strong verb. Replacements must preserve the actual meaning — never applied automatically.",
    )


# ── 4. Skill Evidence ─────────────────────────────────────────────────────────

def _skill_evidence_category(resume: dict) -> CategoryAnalysis:
    skills = list(resume.get("skills") or []) + list(resume.get("hard_skills") or [])
    skills = [s for s in dict.fromkeys(skills) if s and s.strip()]
    if not skills:
        return CategoryAnalysis("skill_evidence", "Skill Evidence", applicable=False, match=None, completeness=0,
                                 confidence="low", reason="No skills listed on the resume to check for evidence.")

    evidence_text = _normalize(" ".join(
        [b for e in (resume.get("experience") or []) for b in (e.get("bullets") or [])] +
        [p.get("description", "") for p in (resume.get("projects") or [])] +
        [p.get("technologies", "") if isinstance(p.get("technologies"), str) else " ".join(p.get("technologies") or [])
         for p in (resume.get("projects") or [])] +
        [str(e.get("degree", "")) for e in (resume.get("education") or [])]
    ))

    with_evidence, without_evidence = [], []
    for s in skills:
        if _word_boundary_present(_normalize(s), evidence_text):
            with_evidence.append(s)
        else:
            without_evidence.append(s)

    match = round(len(with_evidence) / len(skills) * 100)
    completeness = min(100, round(len(skills) / 8 * 100))
    return CategoryAnalysis(
        "skill_evidence", "Skill Evidence", applicable=True, match=float(match), completeness=completeness,
        confidence=_confidence(completeness, True),
        matched_evidence=with_evidence[:8],
        missing_evidence=[f"\"{s}\" is listed but no supporting evidence was found in experience/projects/education." for s in without_evidence[:5]],
        reason=f"{len(with_evidence)}/{len(skills)} listed skills have supporting evidence elsewhere on the resume. Unsupported skills are flagged for the candidate to verify — never auto-removed.",
    )


# ── 5. Summary Quality ────────────────────────────────────────────────────────

def _summary_category(resume: dict) -> CategoryAnalysis:
    summary = (resume.get("summary") or "").strip()
    if not summary:
        return CategoryAnalysis("summary_quality", "Summary Quality", applicable=True, match=None, completeness=0,
                                 confidence="low", missing_evidence=["No professional summary found."],
                                 reason="No summary section — this is a data gap, not evidence of a weak profile.")

    words = summary.split()
    word_count = len(words)
    low = summary.lower()
    generic_hits = [p for p in _GENERIC_SUMMARY_PHRASES if p in low]

    length_score = 100 if 20 <= word_count <= 70 else max(30, 100 - abs(word_count - 45) * 2)
    generic_penalty = min(60, len(generic_hits) * 20)
    match = max(0, round(length_score - generic_penalty))
    completeness = 100.0

    return CategoryAnalysis(
        "summary_quality", "Summary Quality", applicable=True, match=float(match), completeness=completeness,
        confidence="high",
        missing_evidence=[f"Generic phrase: \"{p}\"" for p in generic_hits],
        reason=(f"{word_count} words. " +
                (f"Contains {len(generic_hits)} generic filler phrase(s) that say nothing specific about this candidate."
                 if generic_hits else "No generic filler phrases detected.")),
    )


# ── 6. Grammar / Readability ──────────────────────────────────────────────────

def _readability_category(resume: dict) -> CategoryAnalysis:
    raw_text = resume.get("raw_text", "") or ""
    if not raw_text.strip():
        return CategoryAnalysis("readability", "Grammar & Readability", applicable=True, match=None, completeness=0,
                                 confidence="low", reason="No text available to assess.")

    read_result = text_metrics.readability_score(raw_text)

    grammar_issue_count = 0
    if grammar_service is not None:
        sample_text = " ".join(_all_bullets(resume) + [resume.get("summary", "") or ""])
        try:
            grammar_result = grammar_service.check_text(sample_text)
            grammar_issue_count = grammar_result.get("num_fixes", 0)
        except Exception:
            grammar_issue_count = 0  # grammar check is a bonus signal — never break scoring if it fails

    word_count = len(raw_text.split()) or 1
    issue_density = grammar_issue_count / word_count
    grammar_score = max(0, round(100 - min(100, issue_density * 2000)))

    # readability carries more weight — it's the more reliable of the two signals
    # (grammar_service uses a curated allowlist but resumes are full of proper
    # nouns/acronyms it can still occasionally flag).
    match = round(read_result["score"] * 0.65 + grammar_score * 0.35)
    return CategoryAnalysis(
        "readability", "Grammar & Readability", applicable=True, match=float(match), completeness=100.0,
        confidence="medium",  # heuristic grammar signal, not a full language-model grammar check — never overstated as "high"
        reason=f"{read_result['note']} Approximately {grammar_issue_count} possible spelling/grammar issue(s) detected in bullets/summary.",
    )


# ── 7. Seniority Signals ──────────────────────────────────────────────────────

def _seniority_category(resume: dict) -> CategoryAnalysis:
    bullets = _all_bullets(resume)
    summary = resume.get("summary", "") or ""
    text = _normalize(" ".join(bullets) + " " + summary)
    if not text.strip():
        return CategoryAnalysis("seniority", "Seniority Signals", applicable=True, match=None, completeness=0,
                                 confidence="low", reason="No experience content available to assess seniority signals.")

    found = [t for t in _SENIORITY_TERMS if t in text]
    team_size_match = re.search(r"team of (\d+)", text)
    if team_size_match:
        found.append(f"team of {team_size_match.group(1)}")

    # Deliberately NOT inferring seniority from job title alone, per the spec —
    # only counts actual demonstrated ownership/leadership language.
    match = min(100, 20 + len(found) * 15)
    completeness = min(100, round(len(bullets) / 6 * 100))
    return CategoryAnalysis(
        "seniority", "Seniority Signals", applicable=True, match=float(match), completeness=completeness,
        confidence=_confidence(completeness, True),
        matched_evidence=found[:6],
        reason=(f"{len(found)} ownership/leadership signal(s) found in bullets (e.g. \"led a team\", \"mentored\", \"owned\")."
                if found else "No explicit ownership/leadership language detected — not inferred from job title alone."),
    )


# ── 8. Career Progression ─────────────────────────────────────────────────────

def _career_progression_category(resume: dict) -> CategoryAnalysis:
    experience = resume.get("experience") or []
    if len(experience) < 2:
        return CategoryAnalysis("career_progression", "Career Progression", applicable=True, match=None, completeness=0,
                                 confidence="low",
                                 reason="Fewer than two experience entries — not enough history to assess progression. This does not mean progression is lacking.")

    # Order by whatever the resume's own listed order is (most resumes list
    # most-recent-first) — reverse to chronological for a rank-over-time check.
    ordered = list(reversed(experience))
    ranks = [(_title_rank(e.get("title", "")), e.get("title", "")) for e in ordered]
    known_ranks = [r for r in ranks if r[0] != -1]

    if len(known_ranks) < 2:
        return CategoryAnalysis("career_progression", "Career Progression", applicable=True, match=None, completeness=30,
                                 confidence="low",
                                 reason="Job titles aren't specific enough to determine a seniority sequence — this is a data gap, not evidence against progression.")

    regressions = [(a, b) for a, b in zip(known_ranks, known_ranks[1:]) if b[0] < a[0]]
    increases = [(a, b) for a, b in zip(known_ranks, known_ranks[1:]) if b[0] > a[0]]
    match = max(0, 70 + len(increases) * 15 - len(regressions) * 10)
    match = min(100, match)

    missing = []
    if regressions:
        for a, b in regressions:
            missing.append(f"\"{a[1]}\" → \"{b[1]}\" reads as a step down — may be a legitimate career change; not penalized without more evidence.")

    return CategoryAnalysis(
        "career_progression", "Career Progression", applicable=True, match=float(match), completeness=80.0,
        confidence="medium",
        matched_evidence=[f"{a[1]} → {b[1]}" for a, b in increases],
        missing_evidence=missing,
        reason=f"{len(increases)} apparent step-up(s), {len(regressions)} apparent step-down(s) across listed roles, based on job title language only.",
    )


# ── 9. Content Completeness ──────────────────────────────────────────────────

def _completeness_category(resume: dict) -> CategoryAnalysis:
    result = profile_completeness(resume)  # reuses the existing Phase 3 function — not reimplemented
    return CategoryAnalysis(
        "completeness", "Content Completeness", applicable=True, match=float(result["overall"]), completeness=100.0,
        confidence="high",
        reason=f"Overall profile completeness {result['overall']}% across education/experience/skills/projects/certifications/achievements.",
    )


# ── 10. Repetition ─────────────────────────────────────────────────────────────

def _normalize_bullet(b: str) -> set:
    return set(re.findall(r"[a-z]+", b.lower()))


def _repetition_category(resume: dict) -> CategoryAnalysis:
    bullets = _all_bullets(resume)
    if len(bullets) < 2:
        return CategoryAnalysis("repetition", "Repetition", applicable=True, match=None, completeness=0,
                                 confidence="low", reason="Not enough bullet points to check for repetition.")

    dupes = []
    word_sets = [(b, _normalize_bullet(b)) for b in bullets]
    for i in range(len(word_sets)):
        for j in range(i + 1, len(word_sets)):
            b1, s1 = word_sets[i]
            b2, s2 = word_sets[j]
            if not s1 or not s2:
                continue
            jaccard = len(s1 & s2) / len(s1 | s2)
            if jaccard > 0.7:
                dupes.append((b1, b2))

    match = max(0, 100 - len(dupes) * 20)
    return CategoryAnalysis(
        "repetition", "Repetition", applicable=True, match=float(match), completeness=100.0, confidence="high",
        missing_evidence=[f"Near-duplicate bullets: \"{a}\" / \"{b}\"" for a, b in dupes[:3]],
        reason=(f"{len(dupes)} near-duplicate bullet pair(s) found across entries." if dupes else "No repeated bullets detected.") +
               " Repeated skill keywords across Summary/Skills/Experience are normal and not penalized here.",
    )


# ── 11. Credibility ────────────────────────────────────────────────────────────

def _parse_year(date_str: str) -> int | None:
    m = re.search(r"(19|20)\d{2}", date_str or "")
    return int(m.group(0)) if m else None


def _credibility_category(resume: dict) -> CategoryAnalysis:
    experience = resume.get("experience") or []
    issues = []

    ranges = []
    for e in experience:
        sy = _parse_year(e.get("startDate") or e.get("duration") or "")
        ey = _parse_year(e.get("endDate") or "") if not e.get("current") else datetime.now().year
        if sy and ey and ey >= sy:
            ranges.append((sy, ey, e.get("company") or e.get("title") or "an entry"))

    for i in range(len(ranges)):
        for j in range(i + 1, len(ranges)):
            a, b = ranges[i], ranges[j]
            # Strict inequality — one job ending the same year the next
            # begins is completely normal (a transition, not an overlap);
            # only genuine multi-year overlap is worth flagging.
            if a[0] < b[1] and b[0] < a[1]:
                issues.append(f"Overlapping dates between \"{a[2]}\" and \"{b[2]}\" — please verify this information.")

    bullets = _all_bullets(resume)
    for b in bullets:
        pct = re.search(r"(\d{3,})\s*%", b)
        if pct and int(pct.group(1)) > 500:
            issues.append(f"Unusually high percentage claim — please verify: \"{b}\"")

    match = max(0, 100 - len(issues) * 25)
    completeness = 100.0 if experience else 0.0
    return CategoryAnalysis(
        "credibility", "Credibility Signals", applicable=True, match=float(match) if experience else None,
        completeness=completeness, confidence="medium" if issues else "high",
        missing_evidence=issues[:5],
        reason=(f"{len(issues)} item(s) worth double-checking." if issues else "No date conflicts or suspicious metrics detected.")
               + " Nothing here accuses the candidate of anything — these are verification prompts, not findings of fact.",
    )


# ── 12. Recruiter Readiness ───────────────────────────────────────────────────

def _recruiter_readiness_category(resume: dict) -> CategoryAnalysis:
    result = text_metrics.recruiter_readiness_score(resume)  # reuses the existing function, not reimplemented
    has_summary = bool((resume.get("summary") or "").strip())
    bonus = 5 if has_summary else 0
    match = min(100, result["score"] + bonus)
    return CategoryAnalysis(
        "recruiter_readiness", "Recruiter Readiness", applicable=True, match=float(match), completeness=100.0,
        confidence="high",
        reason=result["note"] + (" Includes a professional summary." if has_summary else " No professional summary — recruiters often read this first."),
    )


# ── Aggregation ────────────────────────────────────────────────────────────────

_CATEGORY_FUNCS = [
    _bullet_quality_category, _quantified_impact_category, _action_verbs_category,
    _skill_evidence_category, _summary_category, _readability_category,
    _seniority_category, _career_progression_category, _completeness_category,
    _repetition_category, _credibility_category, _recruiter_readiness_category,
]


def _redistribute_quality(categories: list[CategoryAnalysis]) -> dict:
    usable = [c for c in categories if c.applicable and c.match is not None]
    excluded = [c.key for c in categories if not (c.applicable and c.match is not None)]
    if not usable:
        return {"weights": {}, "excluded": excluded, "score": None}
    total_default = sum(ats_config.QUALITY_WEIGHTS[c.key] for c in usable)
    weights = {c.key: (ats_config.QUALITY_WEIGHTS[c.key] / total_default) * 100 for c in usable} if total_default > 0 else \
              {c.key: 100 / len(usable) for c in usable}
    for c in categories:
        c.weight = weights.get(c.key, 0.0)
    score = round(sum((c.match or 0) * (c.weight / 100) for c in usable))
    return {"weights": {k: round(v, 1) for k, v in weights.items()}, "excluded": excluded, "score": score}


def analyze_resume_quality(resume: dict) -> dict:
    """The Resume Quality layer's single entry point — JD-independent, always
    computable (even an empty resume returns a low, honest score rather than
    an error). Same never-zero/redistribute rule as every other layer."""
    categories = [fn(resume) for fn in _CATEGORY_FUNCS]
    result = _redistribute_quality(categories)
    return {
        "score": result["score"],
        "categories": {c.key: c.to_dict() for c in categories},
        "weights_used": result["weights"],
        "excluded_categories": result["excluded"],
    }


def build_resume_quality_questions(resume: dict, categories: dict) -> list[str]:
    """Deterministic, evidence-grounded questions for missing data this
    engine found — never invents an answer, per Part 20."""
    questions = []

    qi = categories.get("quantified_impact", {})
    for item in (qi.get("missing_evidence") or [])[:2]:
        questions.append("Is there a number you can add to this — count, %, time saved, or team size? " + item.split(": ", 1)[-1])

    se = categories.get("skill_evidence", {})
    for item in (se.get("missing_evidence") or [])[:2]:
        skill = item.split('"')[1] if '"' in item else "this skill"
        questions.append(f"You listed \"{skill}\" as a skill — can you point to where you used it (a project, a role, a course)?")

    sen = categories.get("seniority", {})
    if sen.get("applicable") and not sen.get("matched_evidence"):
        questions.append("Did you lead, mentor, or take ownership of anything in your recent roles? If so, what?")

    cred = categories.get("credibility", {})
    for item in (cred.get("missing_evidence") or [])[:2]:
        questions.append(item if item.endswith("?") else item + " Can you confirm the exact dates?")

    return questions[:8]
