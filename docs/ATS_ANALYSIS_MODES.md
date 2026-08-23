# ATS Analysis Modes (Phase G)

This document explains the three independent ATS analysis modes introduced in Phase G, why they exist, and exactly what each one does and doesn't measure. Read this before touching `mode_orchestrator.py`, `job_parser.assess_sufficiency()`, or `/ats-checker/page.tsx`.

## The rule

**These are three different questions with three different answers. Never present them as one generic "ATS Score."**

| Mode | Question it answers | Requires |
|---|---|---|
| **Resume ATS Health** | "Is my resume itself well-formed, parseable, and complete?" | Resume only |
| **Role Readiness** | "How do I look against the *typical* requirements for this kind of role?" | Resume + a role from the role library (optional) |
| **Job Match** | "How do I match *this specific employer's* posting?" | Resume + a sufficiently detailed JD (optional) |

A resume can be checked with none, one, two, or all three of these present. None of them is a prerequisite for another.

## Why this exists — the 96/100 problem

Before Phase G, `/ats-checker` had one flow: paste a resume, paste something into a "Target Job" box, get one "Overall ATS Score." Typing only `"java developer"` into that box produced **96/100**.

That number was arithmetically correct under the existing (unchanged, still-used-elsewhere) weight-redistribution rule: `scoring.py`'s `analyze_categories()` excludes any category the JD doesn't give it enough to judge (Keyword, Skills, Responsibility, Education, Certification all excluded — a bare title has none of that), and redistributes 100% of the weight across whatever's left (Experience Match, Formatting). Experience Match then reads 100% not because the candidate's experience was verified against anything, but because *"the JD doesn't state a minimum"* — a vacuous pass, not a real signal. `100 × 0.80 + 79 × 0.20 = 95.8 → 96`.

The fix is **not** a scoring change — `scoring.py`, `keyword_engine.py`, and `ats_intelligence_v2.analyze_v2()`'s formulas are byte-for-byte unchanged. The fix is: **stop asking a JD-shaped question when there isn't a JD**, and label the JD-free answer for what it actually is (Resume ATS Health), not for what it isn't (a job match).

## Mode 1 — Resume ATS Health

Always available. Computed from the resume alone — no JD, no role.

**As of Phase H1, this is a two-layer score, not a single 4-category blend.** Phase G's original version used only `compute_resume_health_v2()` (parsing/sections/keyword coverage/formatting) — structurally clean and well-labeled, but blind to whether the resume's actual *content* was any good. A resume with zero evidence for any of its listed skills, weak action verbs, and a generic filler summary could still score 90+. Phase H1 fixes the wiring (not the underlying heuristics — every metric below already existed and was already tested) by blending TWO layers:

- **Layer A — ATS Compatibility** (45% weight): "can an ATS correctly read and interpret this resume?" — Parsing, Sections, Formatting (all pre-existing, unmodified), plus a newly-*visible* Contact/Essential Information category.
- **Layer B — Resume Quality** (55% weight): "is the actual content any good?" — the full, unmodified `resume_quality.analyze_resume_quality()` engine: Bullet Quality, Quantified Impact, Action Verb Strength, Skill Evidence, Summary Quality, Readability/Grammar, Seniority Signals, Repetition, Credibility, Recruiter Readiness (Career Progression too, when 2+ roles make it applicable).

```
resume_ats_health = 0.45 × ats_compatibility_score + 0.55 × resume_quality_score
```

See `ats_config.py`'s Phase H1 section (`RESUME_HEALTH_COMPATIBILITY_WEIGHTS`, `RESUME_HEALTH_LAYER_WEIGHTS`) for the exact weight derivation and rationale — nothing here is copied from or tuned against any competitor's output (see `docs/ATS_CHANGELOG.md`'s Phase H/H1 entries for the full investigation and the explicit "no competitor calibration" constraint that governed this change).

**Contact extraction — deliberate, documented overlap, not a double-count.** `parsing_quality.analyze_parsing_quality()`'s own internal blend already includes a 5%-of-40% contact sub-signal — that internal formula is untouched (Phase H1 explicitly preserves the existing `parsing` score rather than trying to strip contact back out of it). The new `contact` category exposes the SAME underlying `contact_extraction_score` value as its own visible, separately-weighted (10%) row, so a candidate with no email/phone anywhere sees exactly why, instead of that gap being buried at ~2% of the total and invisible in the UI.

**Profile Completeness stays completely separate**, shown as a supplementary row (`"contributes_to_score": false`) — it answers "how much of your profile is filled in," a different question from ATS readiness, and per explicit product decision must never be blended into this score. This required care: `resume_quality.py`'s own `analyze_resume_quality()` includes a "completeness" category internally (itself just `scoring.profile_completeness()` wrapped as a scored category). Layer B therefore does NOT call `analyze_resume_quality()` — it calls resume_quality.py's other 11 category functions directly, with `ats_config.RESUME_HEALTH_QUALITY_WEIGHTS` (= `QUALITY_WEIGHTS` minus `completeness`, renormalized) as the weight map, so Profile Completeness can never re-enter the score through the back door. `resume_quality.py` itself is unmodified — its other consumer (`compute_full_analysis()`, the Resume Editor) still legitimately includes Content Completeness in its own blend.

**"How to improve"** (`resume_health_priorities()`) surfaces the weakest applicable categories across both layers (below a 75/100 floor, capped at 5) — reuses each category's own already-computed `reason`/`missing_evidence` text, never invents new advice copy.

## Mode 2 — Role Readiness

Optional. A role title (e.g. "Java Developer") is **never** treated as if it were a real job description. `services/roles.py` reads the `public.role_profiles` table, which has real structured fields (`skills`, `education`, `recommended_certifications`, `industry`) but **no responsibility text and no free-form JD prose** — so Role Readiness can never legitimately claim a "Responsibility Match," and its score, when computed, comes from the same frozen `compute_job_match_v2()` used by Job Match, just fed the role's synthetic job dict instead of a parsed JD.

Three states, decided in `mode_orchestrator.role_readiness_mode()`:

1. **No role selected** → `available: false`. Not shown at all.
2. **Role selected but not found in the library** (`role_library_unmatched`, or found with no skills at all) → `data_sufficiency: "limited"`, **`score: null`** — no invented score, message: *"Role analysis is currently based on limited role information."*
3. **Role found with skills, but no education/certification data** → `data_sufficiency: "limited"`, a real score IS computed (skills alone are a legitimate signal), message: *"Role analysis is based primarily on available skill data."*
4. **Role found with skills + (education or certifications)** → `data_sufficiency: "sufficient"`, scored normally, no caveat message.

Never labeled "Job Match" anywhere in the API response or the UI — the response shape itself doesn't even carry a `sufficient` key (that's Job Match's vocabulary); it carries `data_sufficiency` instead, a deliberately different word for a deliberately different concept.

## Mode 3 — Job Match

Optional, gated by the **JD sufficiency check** before any score is computed.

### The sufficiency gate

`job_parser.assess_sufficiency(raw_text, parsed)` requires **both**:

1. **`len(raw_text.strip()) >= 150`** (`ats_config.JD_SUFFICIENCY_MIN_CHARS`) — a title runs a handful of characters; real JDs, even short ones, run into the hundreds.
2. **At least 2 of JobParser's 7 structured fields non-empty** (`ats_config.JD_SUFFICIENCY_MIN_SIGNALS`, `JD_SUFFICIENCY_SIGNAL_FIELDS` = `required_skills`, `preferred_skills`, `responsibilities`, `keywords`, `min_experience_years`, `min_education`, `certifications`) — requiring 2, not 1, means a single stray signal (e.g. a "5 years" regex hit on an otherwise-empty string) can't alone pass the gate.

Both conditions are required (AND). `"java developer"` fails both trivially. The gate only ever counts what `JobParser.parse()` actually extracted — it never re-reads the raw text itself or infers anything the parser didn't already produce, so it can't drift out of sync with parser changes and can't fabricate a signal.

### What happens on each side of the gate

- **Insufficient** → `job_match.available: true`, `job_match.sufficient: false`, **`job_match.score: null`**, message: *"Add the full job description to get a reliable Job Match score."* No number is ever shown.
- **Sufficient** → `compute_job_match_v2()` runs normally (Keyword, Skills, Experience, Education, Certification, Location — `JOB_MATCH_WEIGHTS`, unchanged), same "never silently zero, redistribute" rule as always.

## API

`POST /api/ats/v2/check` (new, additive — `/analyze` and `/analyze-resume` are unchanged and still work) takes a resume (`resume_id` or `resume_text`) plus optionally `target_role` and/or `job_description`, and returns all three modes independently:

```jsonc
{
  "resume_health": {
    "available": true, "score": 63,
    "layers": { "ats_compatibility": {"score": 83, "categories": {...}}, "resume_quality": {"score": 47, "categories": {...}} },
    "layer_weights_used": { "ats_compatibility": 45.0, "resume_quality": 55.0 },
    "supplementary": {...}, "priorities": [...]
  },
  "role_readiness": { "available": false },
  "job_match": { "available": false },
  "scoring_engine_version": "2.1.0",
  "report_id": "..."
}
```

(`resume_health`'s shape is Phase H1's two-layer model — see "Mode 1" above. `scoring_engine_version` moved from `"2.0.0"` to `"2.1.0"` when Phase H1 changed Resume ATS Health's formula; Job Match and Role Readiness are unaffected by that bump.)

Each mode's `available`/`score`/`sufficient` (or `data_sufficiency`) fields are independent — the frontend never derives one from another, and a `null` score is a first-class, deliberate state, not an error.

## Persistence

`AtsReport` gained two additive, nullable columns:

- **`score_type`** (`"resume_health" | "role_readiness" | "job_match"`) — records what the row's `score` column actually means. Existing pre-Phase-G rows are left `null` — never retroactively reinterpreted, since we genuinely don't know which of three (now-distinguished) things they meant.
- **`jd_sufficient`** (boolean) — the sufficiency verdict for the row's JD, when one was involved.

Rows written by the new `/check` endpoint always use `score_type = "resume_health"` for the persisted `score`, since that's the one number that's always defined and comparable run-to-run — Role Readiness and Job Match scores are situational (they depend on which role/JD was checked that time) and aren't stored as the row's headline `score`.

### `Resume.ats_score` — deliberately left alone this phase

`Resume.ats_score` was already written by **three different, pre-existing engines** before Phase G even started:

1. `backend/routers/ats.py` (`services/ats.py` — the oldest legacy engine)
2. `backend/routers/ats_engine.py`'s `/analyze-resume` (`scoring.py`'s legacy Match/Completeness/Confidence model)
3. `backend/routers/ats_engine.py`'s `/analyze-editor` (`ats_intelligence_v2`'s blended v2 score)

...plus is directly settable by the client through `PATCH /api/resumes/{id}` and gets copied on resume duplication and version-restore (`backend/routers/resumes.py`). It's read by: the saved-resume picker badge (`ats-checker`), the dashboard's average-ATS-score and "weakest resume" nudge (`dashboard/page.tsx`), the resume preview page's gauge (`resumes/[id]/preview/page.tsx`), the Resume Editor's `Resume` type, `VersionHistory.tsx`'s per-version badge, and the admin dashboard's fleet-wide average (`routers/admin.py`). `job-match/page.tsx` and `ai-upgrade/page.tsx` are two more writers, each using yet other scoring paths.

Phase G's new `/check` endpoint **does not write to `Resume.ats_score`** — adding a fourth silent writer with yet another meaning would make the existing ambiguity worse, not better, and resolving it (e.g. "only ever write it from Resume Health going forward") changes what every one of the consumers above displays. That's a real, product-visible decision explicitly deferred pending a separate go-ahead — not an oversight.

## What a future phase should NOT do

- Don't blend Resume Health, Role Readiness, and Job Match into one number. Ever. If a future request asks for "just show me one score," push back and ask which of the three questions it's actually trying to answer.
- Don't lower the sufficiency thresholds to make more JDs "pass" — they were chosen to correctly reject a bare title, not tuned against any dataset of desired outcomes.
- Don't invent role requirements (skills, tools, frameworks) not actually present in `role_profiles` just because a role "obviously" needs them. If the data isn't there, say so.
