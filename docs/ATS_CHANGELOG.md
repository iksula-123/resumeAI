# ATS Changelog

Every change to ATS scoring behavior — a new metric, a weight change, a matching-algorithm change — gets an entry here, going forward. This is separate from [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md) (the whole-project development log): this file is scoring-specific and is what to check before assuming why a resume's score is what it is.

Format per entry: version, date, what changed, why, what it does/doesn't affect, and how to verify.

**Not in this file:** the ATS Checker → Resume Builder navigation/data-handoff
fixes ("Improve My Resume" losing data, "Target a Role" stale closure, and
several more found during that phase's live browser acceptance test) — see
[ATS_NAVIGATION_AND_EDITOR_HANDOFF.md](ATS_NAVIGATION_AND_EDITOR_HANDOFF.md).
None of those changed any score, weight, formula, or `SCORING_ENGINE_VERSION`,
so per this file's own stated scope they don't belong here.

---

## `2.1.0` (Phase H1) — 2026-08-18 — Resume ATS Health calibration: two-layer model (ATS Compatibility + Resume Quality)

**Status: FINAL.** Resume ATS Health now genuinely reflects content quality, not just structural cleanliness. `SCORING_ENGINE_VERSION` is bumped to **`"2.1.0"`** — approved explicitly, per `ats_config.py`'s own stated purpose for the constant ("a future weight change can be identified in stored data without guessing"): this phase IS a weight/formula change to Resume ATS Health, so it must be distinguishable from `2.0.0`-era results. **No weight or formula outside Resume ATS Health was touched.** Job Match, Role Readiness, JD sufficiency, `analyze_v2()`, `scoring.py`, `keyword_engine.py`, and every existing weight dict other than the new ones below are byte-for-byte unchanged.

**Version summary** (see `ats_config.py`'s version-history comment for the canonical record):
- **`2.0.0`** — Resume ATS Health used `ATS_HEALTH_WEIGHTS`'s 4-category model only (parsing/sections/keyword_coverage/formatting). Content quality (bullet quality, skill evidence, quantified impact, etc.) was computed elsewhere in the codebase but never contributed to this score.
- **`2.1.0`** — Resume ATS Health is the two-layer model this entry documents: 45% ATS Compatibility + 55% Resume Quality. Every other weight (Job Match, Role Readiness, JD sufficiency) is identical to `2.0.0`.

### The problem (Phase H investigation)

A Java Developer Fresher resume scored 82-92/100 on Resume ATS Health while an independent checker (Enhancv) scored the same resume 70/100 with real, specific weaknesses called out (Content 66%, 3 grammar issues, weak quantification). Tracing the code showed why: `resume_health_mode()` computed the score from ONLY `compute_resume_health_v2()`'s 4 structural categories (parsing/sections/keyword coverage/formatting) — `resume_quality.py`'s 12 already-existing, already-tested content-quality categories (bullet quality, quantified impact, skill evidence, summary quality, etc.) were computed but never wired into the score at all. On the exact regression fixture: `resume_quality.analyze_resume_quality()` independently scored the same resume **48/100** (skill_evidence 0/7, action_verbs 33, summary_quality 34) while Resume ATS Health said 82-92 — same resume, same run, 34-44 points apart, because the score literally never asked "is this content any good." Full writeup: the Phase H inspection report (see git history / the phase's own conversation record — not duplicated here).

### What changed

- **Two-layer model**, both built entirely from pre-existing, unmodified engines:
  - **Layer A — ATS Compatibility** (45% weight): `parsing` (unmodified), `sections` (unmodified, using `ats_intelligence_v2._sections_category_v2()`), `formatting` (unmodified, `scoring._formatting_category()`), plus a **new visible `contact` category** exposing `parsing_quality.py`'s already-computed `contact_extraction_score` (previously buried at 5%-of-40% ≈ 2% of the total, invisible in the UI).
  - **Layer B — Resume Quality** (55% weight): `resume_quality.py`'s 11 category functions (all unmodified), called directly rather than through `analyze_resume_quality()` — see the "completeness" exclusion note below — using `RESUME_HEALTH_QUALITY_WEIGHTS` (derived from the existing `QUALITY_WEIGHTS`), same never-zero/redistribute rule.
  - `resume_ats_health = 0.45 × layer_a_score + 0.55 × layer_b_score`, redistributed to whichever layer is computable if the other is entirely N/A (same pattern used everywhere else in this system).
- **New config** (`ats_config.py`): `RESUME_HEALTH_COMPATIBILITY_WEIGHTS` (parsing/sections/formatting reweighted from the existing `ATS_COMPATIBILITY_WEIGHTS` ratios to make room for `contact` at a flat 10%, not appended on top of 100%) and `RESUME_HEALTH_LAYER_WEIGHTS` (`{"ats_compatibility": 0.45, "resume_quality": 0.55}`) — an explicit **product decision**, not derived from a formula or any competitor's output, and documented as a starting point to be recalibrated against SahiCareer's own benchmark dataset later, never against a competitor's number.
- **`contact_note` added to `parsing_quality.analyze_parsing_quality()`'s return dict** — purely additive (one new key), the `score` field's formula is byte-identical to before. Lets the new `contact` category show a real explanation without re-deriving the heuristic or string-parsing the combined `note`.
- **Layer B calls resume_quality.py's 11 category functions directly, not `analyze_resume_quality()` wholesale** — caught during testing: that function's own "completeness" category (`_completeness_category()`) is itself just `scoring.profile_completeness()` wrapped as a scored category at ~4.9% weight. Calling it as-is would have smuggled Profile Completeness back into the score through Layer B, directly contradicting the explicit "must not directly reduce Resume ATS Health" requirement. `RESUME_HEALTH_QUALITY_WEIGHTS` (`ats_config.py`) is `QUALITY_WEIGHTS` with `completeness` removed and the other 11 renormalized — `resume_quality.py` itself and its other consumer (`compute_full_analysis()`, the Resume Editor's layer, which legitimately wants Content Completeness included) are untouched.
- **Section-alias gap fixed**: `section_recognizer.py`'s `SECTION_VARIANTS["experience"]` now includes the exact heading `"internship experience"` (already a recognized alias in `resume_parser.py`'s own separate heading detector since the Phase F3 Java-DOCX fix, but never added to this newer, parallel list) — exact-match only, no substring matching, no change to any other heading.
- **"How to improve"** (`mode_orchestrator.resume_health_priorities()`): the weakest applicable categories across both layers (floor 75/100, capped at 5), reusing each category's own already-computed `reason`/`missing_evidence` — no new advice text invented.
- **Frontend** (`ats-checker/page.tsx`): Resume ATS Health card now shows both layers side-by-side with their own sub-scores and category rows, plus the "How to Improve" list.

### What did NOT change

- `scoring.py`, `keyword_engine.py`, `ats_intelligence_v2.analyze_v2()`/`compute_job_match_v2()`/`compute_ats_compatibility_v2()`, `JOB_MATCH_WEIGHTS`, `QUALITY_WEIGHTS`, `ATS_HEALTH_WEIGHTS`, `ATS_COMPATIBILITY_WEIGHTS`, `ATS_SCORE_CONFIG` — all untouched.
- `job_parser.py`, JD sufficiency gating, Role Readiness, Job Match — untouched; Phase G's three-mode independence is preserved.
- `Resume.ats_score`'s write semantics and the `AtsReport` schema — untouched, no new writer added.
- No Enhancv/ResumeGyani/Zety score, percentage, or bucket was written into any weight, threshold, or test assertion anywhere in this change.

### Regression case (Java Developer Fresher fixture — same one `test_java_fresher_docx_regression.py` uses)

| | Old (`compute_resume_health_v2()` alone) | New (two-layer) |
|---|---|---|
| Score | 89 (82 before the section-alias fix; the fix alone added +3-7 by correctly recognizing "Internship Experience") | **63** |
| Layer A (ATS Compatibility) | — | 83 |
| Layer B (Resume Quality) | — | 47 |

The new score is **not** 70 (Enhancv's number) and was never adjusted toward it — 63 is simply what `0.45×83 + 0.55×47` computes for this resume's actual, already-existing category values.

### SCORING_ENGINE_VERSION — resolved

Bumped `"2.0.0"` → `"2.1.0"` (approved explicitly, see status line above). Every hardcoded `"2.0.0"` assertion across the test suite that stamps/reads this constant was updated to `"2.1.0"` to match — these are value-alignment updates only, no test's underlying logic or behavior assertion changed. One nuance worth recording: `analyze_v2()` (frozen, untouched) still runs the old 4-category `compute_resume_health_v2()` for its own Mode A (`job=None`) path — `SCORING_ENGINE_VERSION` is a single global stamp, not per-function, so that path now reports `"2.1.0"` too even though its own formula didn't change. This is a pre-existing property of how the constant works (not introduced by this phase) and is inconsequential in practice: `analyze_v2(resume, None)` isn't reachable from any live endpoint (`/analyze`/`/analyze-resume` always pass a parsed job dict).

### How to verify

- `pytest backend/tests/test_ats_phase_h_resume_health.py` — 22/22 passing: the four ATS×Quality cross-combinations, the explicit "Resume Quality has non-zero influence" controlled-experiment test, individual weak-signal tests (contact/skill-evidence/quantified-impact/summary/recruiter-readiness), the section-alias fix + no-regression check on existing heading variants, the Java Fresher regression, confirmation that Phase G's Role Readiness / insufficient-JD / full-Job-Match behavior is bit-for-bit unaffected, and `SCORING_ENGINE_VERSION == "2.1.0"`.
- `pytest backend/tests/test_ats_engine.py backend/tests/test_ats_intelligence_v2.py backend/tests/test_ats_benchmark.py backend/tests/test_ats_case_study_pooja_regression.py backend/tests/test_pooja_pdf_formatting_regression.py backend/tests/test_java_fresher_docx_regression.py backend/tests/test_ats_phase_g_modes.py backend/tests/test_ats_score_discrepancy_regression.py backend/tests/test_phase_c_resume_quality.py` — unaffected (the benchmark dataset never uses the string "internship experience", so the alias fix cannot move any benchmark number; verified by grep before relying on it).
- `cd frontend && npx tsc --noEmit && npm run build` — clean.

---

## `2.0.0` (Phase G additions) — 2026-08-18 — ATS Checker mode redesign: Resume ATS Health / Role Readiness / Job Match

**Status:** `/ats-checker` no longer requires a job description or role to produce a score, and a JD that's really just a job title (e.g. `"java developer"`) can no longer produce a misleading high "Job Match" percentage. `SCORING_ENGINE_VERSION` stays `"2.0.0"` — **this phase changed zero weights and zero scoring formulas**. It is a product/UX and orchestration change: which existing, already-computed numbers get shown, under what label, and when.

### The problem this fixes

Pasting only `"java developer"` as the job description used to produce a 96/100 "Overall ATS Score." That number was mathematically correct under the existing weight-redistribution rule (Experience Match 100% @ 80%, ATS Formatting 79% @ 20%, after every JD-dependent category — Keyword/Skills/Responsibility/Education/Certification — was excluded for lack of JD data) but **product-misleading**: a job title is not a job description, and "the JD doesn't state a minimum" (which is what made Experience Match read 100%) is a vacuous pass, not a real signal. See `docs/ATS_ANALYSIS_MODES.md` for the full root-cause writeup.

### What changed

- **Three independent, separately-labeled scores**, never merged into one "ATS Score":
  1. **Resume ATS Health** — JD-independent, always computable, the new default `/ats-checker` experience. Reuses `ats_intelligence_v2.compute_resume_health_v2()` (Mode A, already existed) unmodified, plus read-only supplementary rows (readability, recruiter readiness, profile completeness) pulled from `resume_quality.py` / `scoring.profile_completeness()` for display — these do **not** feed the score.
  2. **Role Readiness** — optional. Reuses `compute_job_match_v2()` against the role library's synthetic job dict (`services/roles.py` data), unmodified, just relabeled and annotated with a `data_sufficiency` flag (`"sufficient"` | `"limited"`) so a role title is never presented as if it were a real JD. A role not found in the library gets **no score at all** (`null`), never an invented one.
  3. **Job Match** — optional, gated by a new **JD sufficiency check**: a JD must be ≥150 characters AND have ≥2 non-empty structured signals (of `required_skills`, `preferred_skills`, `responsibilities`, `keywords`, `min_experience_years`, `min_education`, `certifications`) before a score is computed at all. `"java developer"` fails both. When insufficient: `job_match.score = null`, `job_match.sufficient = false`, with an explicit message — never a number.
- **New file:** `backend/services/ats_engine/mode_orchestrator.py` — composes the three modes. Computes nothing new mathematically; only decides which existing function to call and how to label/gate the result.
- **New function:** `job_parser.assess_sufficiency()` — the sufficiency gate, reading only what `JobParser.parse()` actually extracted (never re-invents signals).
- **New config:** `ats_config.JD_SUFFICIENCY_MIN_CHARS = 150`, `JD_SUFFICIENCY_MIN_SIGNALS = 2`, `JD_SUFFICIENCY_SIGNAL_FIELDS`.
- **New endpoint:** `POST /api/ats/v2/check` — the mode-aware entry point. Additive; `/api/ats/v2/analyze` and `/api/ats/v2/analyze-resume` are unchanged and still work exactly as before (the redesigned `/ats-checker` page now uses `/check` as its primary flow, and falls back to the unchanged `/analyze-resume`/`/analyze` for the opt-in "View Full Job Match Analysis" deep-dive — none of that dashboard's functionality, including tailoring and recommendations, was removed).
- **New, additive, nullable `AtsReport` columns:** `score_type` (`"resume_health" | "role_readiness" | "job_match"`) and `jd_sufficient` (boolean) — record what a persisted report's `score` actually means, and whether its JD passed the gate. Existing rows are left `null`, not retroactively reinterpreted. `analysis_mode`'s allowed values gained `"resume_only"` (additive, migration `0013_ats_phase_g_modes.sql`).
- **Frontend:** `frontend/app/ats-checker/page.tsx` rewritten around the 3-mode flow — resume upload/select → "Check My ATS Score" (no role/JD required) → optional "Target a Role" / "Match a Specific Job" → optional "View Full Job Match Analysis" (the pre-existing detailed dashboard, unchanged, now opt-in).

### What did NOT change

- `scoring.py`, `keyword_engine.py`, `ats_intelligence_v2.py`'s `analyze_v2()` — byte-for-byte unchanged (its Phase B contract is frozen; the new modes are built by composing its existing `compute_resume_health_v2()`/`compute_job_match_v2()`, not by editing it).
- `ATS_HEALTH_WEIGHTS`, `JOB_MATCH_WEIGHTS`, `ATS_COMPATIBILITY_WEIGHTS`, `QUALITY_WEIGHTS`, `ATS_SCORE_CONFIG` — no weight changed.
- `SCORING_ENGINE_VERSION` — stays `"2.0.0"`.
- `/api/ats/v2/analyze`, `/api/ats/v2/analyze-resume`, `/api/ats/v2/analyze-editor`, `/api/ats/v2/tailor`, the recommendation lifecycle endpoints — all unchanged.
- `Resume.ats_score`'s write semantics — the new `/check` endpoint deliberately does **not** write to it (see `docs/ATS_ANALYSIS_MODES.md`'s persistence section for the full inventory of its existing, already-ambiguous writers/readers and why resolving that is explicitly deferred, not done silently, this phase).
- No competitor score (Enhancv/ResumeGyani/Zety) was measured, referenced, or targeted anywhere in this phase.

### How to verify

- `pytest backend/tests/test_ats_phase_g_modes.py` — sufficiency-gate boundary tests, mode-independence tests (TEST 1/2/7/8 from the Phase G spec), and DB-backed `/api/ats/v2/check` integration tests including the exact `"java developer"` regression case.
- `pytest backend/tests/test_ats_engine.py backend/tests/test_ats_intelligence_v2.py backend/tests/test_ats_benchmark.py backend/tests/test_ats_case_study_pooja_regression.py backend/tests/test_java_fresher_docx_regression.py backend/tests/test_ats_score_discrepancy_regression.py backend/tests/test_pooja_pdf_formatting_regression.py` — all unchanged, all passing.
- `cd frontend && npx tsc --noEmit && npm run build` — clean.

---

## `2.0.0` (Phase E additions) — 2026-08-14 — Benchmark dataset + calibration validation (no scoring changes)

**Status:** a hand-labeled benchmark corpus and a hard/informational regression suite now exist and pass. `SCORING_ENGINE_VERSION` stays `"2.0.0"` — **Phase E made zero changes to `ats_config.py`, `ats_intelligence_v2.py`'s formulas, `scoring.py`, or `keyword_engine.py`**, per its own explicit policy: findings are documented, never auto-applied.

### What changed

- **New benchmark dataset** (`backend/tests/fixtures/benchmark_dataset.py`): 12 hand-built resumes (3 industries — Software Engineering, Data & Analytics, Digital Marketing — × 4 seniority bands), 9 JDs (3 per industry: same-level, senior/lead, and an "adjacent" JD requiring a genuinely different, non-overlapping tool stack), 36 resume × JD pairs with hand-labeled matched/missing keywords; 6 Resume Quality strong/weak writing-quality probe pairs; 5 Parsing Rate anti-pattern probes (synthetic `raw_text`, since structured-content resumes can't reproduce real ATS anti-patterns); 6 anti-gaming probes against the real, already-shipped Phase D `anti_gaming.py` module.
- **New benchmark runner** (`backend/scripts/run_benchmark.py`): runs the dataset through the real production engine (`compute_full_analysis()`, `analyze_parsing_quality()`, `recognize_sections()`, `anti_gaming.*`) and generates the 21-section `docs/ATS_BENCHMARK_REPORT.md`, with every finding labeled `VERIFIED`/`OBSERVED`/`INFORMATIONAL`/`INFERRED`/`RECOMMENDATION`/`NOT AVAILABLE`.
- **New regression suite** (`backend/tests/test_ats_benchmark.py`, 69 tests): explicitly split into **hard** invariants (keyword false-positive safety, alias correctness — direct regression tests for the documented React/React Native-class bug, missing-data-never-zero, weight redistribution, score determinism, Resume Quality/Parsing Rate direction, anti-gaming detection) and **informational** metrics (keyword recall, match-band accuracy, adjacent-mismatch-ordering pass rate — floored generously against a catastrophic regression, not held to a strict per-case bar, since their ground truth is a hand-guess about the full blended formula, not a construction guarantee). Every test calls the production engine directly — no second scoring implementation.
- **Bugs found and fixed in the dataset itself, not the engine:** the first benchmark run (36 pairs) surfaced 3 keyword-label errors (`swe_mid`/`swe_senior`/`swe_lead` were hand-labeled as matching "SQL"/"Git"/"REST APIs" against a JD, but those resumes never literally state those terms — e.g. `swe_mid` lists "PostgreSQL," not "SQL," and the engine correctly does NOT treat those as equivalent) and one parsing-baseline construction bug (the "clean" baseline text didn't actually have contact info near the top, so the `contact_buried` anti-pattern probe wasn't a valid differential test). All four were dataset-label/construction corrections, verified against the engine's actual (correct) behavior — not engine defects.
- **One calibration candidate documented, not fixed:** Job Match may under-discriminate clearly keyword-mismatched candidates when a JD leaves `min_experience_years`/`min_education` unset (every JD in this first-pass dataset does) — MEDIUM confidence, INFERRED from the adjacent-mismatch-ordering data, not independently confirmed. Full writeup with recommended future action (not a fix) in `docs/ATS_BENCHMARK_REPORT.md`'s "Calibration Candidates" section.
- **Competitor comparison: explicitly NOT AVAILABLE.** No Enhancv/ResumeGyani/Zety observations were collected or estimated anywhere in this phase — consistent with the "never tune to match a competitor" rule documented in `ats_config.py` since Phase B.

### What did NOT change

- `ats_config.py`, `ats_intelligence_v2.py`'s scoring formulas, `scoring.py`, `keyword_engine.py` — byte-for-byte unchanged.
- `SCORING_ENGINE_VERSION` — stays `"2.0.0"`.
- The database schema and production API behavior — untouched; this phase added test fixtures, a script, and a test file only.

### How to verify

- `pytest backend/tests/test_ats_benchmark.py` — 69/69 passing.
- `pytest backend/tests/test_ats_engine.py backend/tests/test_ats_intelligence_v2.py backend/tests/test_phase_c_resume_quality.py` — 145/145 passing, unchanged.
- Full backend suite: 377 passed (308 pre-Phase-E baseline + 69 new), 15 failed, 1 error — identical failure/error set to the pre-Phase-E baseline (13 Phase D DB-integration tests blocked by the unreachable local test Postgres, 2 pre-existing unrelated `test_resumes.py` signup-flakiness failures, 1 known `test_template_registry.py` teardown flake). Zero new regressions.
- `cd backend && ./.venv/Scripts/python.exe scripts/run_benchmark.py` — regenerates `docs/ATS_BENCHMARK_REPORT.md`; console summary: keyword precision 100.0%, recall 100.0%, band accuracy (informational) 63.9%, adjacent-ordering pass rate 91.7% (11/12 — the one non-passing case is a documented, understood tie, not a defect), anti-gaming pass rate 100.0%, weight-redistribution check passes.

---

## `2.0.0` (Phase D additions) — 2026-08-14 — AI ATS Agent: live optimization, apply/undo, score delta

**Status:** the recommendation → approval → apply → reparse → rescore → delta → history → undo loop is now live, end to end, wired into the Resume Editor. `SCORING_ENGINE_VERSION` stays `"2.0.0"` — no scoring methodology changed, only a new action layer on top of the existing v2 engine (`compute_full_analysis()`, untouched from Phase C).

### What changed

- **New table `ats_recommendations`** (migration `0012_ats_intelligence_ai_agent.sql`) — addressable, persisted recommendation rows (`action_type`, `priority`, `title`, `reason`, `target_text`, `evidence_tier`, `status`, `resume_updated_at_snapshot`, etc.), check-constrained on the 13-value `ATS_ACTION_TYPES`/status/evidence-tier/priority enums, RLS policies mirroring `ats_reports`.
- **`ats_change_history` finalized** — the Phase B schema-only table now has real writers. Renamed `change_type`→`action_type`, `delta`→`score_delta`; added `before_content`/`after_content`/`user_approved`; `recommendation_id` converted from text to a real UUID FK. All migration steps are idempotency-guarded (`do $ ... $` blocks, `add column if not exists`) — applied twice to the live dev DB during this phase, confirmed idempotent both times.
- **New `anti_gaming.py`** — `detect_keyword_stuffing()`, `detect_jd_copying()` (`difflib.SequenceMatcher`, 12-word longest-match against the JD), `detect_stuffed_keyword_blocks()`, `is_term_overused()`. Detection/flagging only — the v2 matcher's binary found/missing signal is already structurally immune to repetition-based score inflation, so this isn't a second scoring penalty.
- **New `ai_recommendations.py`** — two-stage design (deterministic `classify_and_stage()`, then lazy AI `generate_proposal()`, called one recommendation at a time, never in bulk — Part 32 performance discipline). Reuses `services/ai.py::_chat()` (the shared Gemini→OpenAI provider abstraction), **not** `enhance_bullet()`/`generate_summary()` (their prompts allow "if possible" fabrication — unsafe for Phase D's absolute no-invention rule). Every AI prompt explicitly forbids inventing a number, employer, date, or skill not already present.
- **New `apply_fix.py`** — `apply_recommendation()` (staleness check → locate exact verbatim `target_text` → apply → **fresh** before/after score computed from real old/new content via `compute_full_analysis()` → write one `AtsChangeHistory` row → flip recommendation to `applied`) and `undo_change()` (mirrors apply, restores prior content, writes a **new** history row rather than editing the old one). Reuses `routers.resumes._apply_content`/`_to_content`/`_snapshot`/`_load_full` — explicit, documented reuse to avoid a second content-decomposition implementation.
- **New endpoints** (`routers/ats_engine.py`, `/api/ats/v2` prefix): `GET /resumes/{id}/recommendations`, `POST /recommendations/{id}/answer`, `POST /recommendations/{id}/preview`, `POST /recommendations/{id}/apply`, `POST /recommendations/{id}/reject`, `GET /resumes/{id}/change-history`, `POST /change-history/{id}/undo`. `POST /analyze-editor` (JD-based path) now also stages recommendations and returns them as `persisted_recommendations`.
- **Staleness protection**: `AtsRecommendation.resume_updated_at_snapshot` (captured at staging) vs. `resume.updated_at` (checked at apply) — mismatch → HTTP 409, "This recommendation is based on an older version of your resume. Re-analyze before applying."
- **Optimistic concurrency**: a conditional `UPDATE ... WHERE status != 'applied'` claims the recommendation before real work starts, checked via `rowcount` — closes the common double-click/double-apply case (true row-level locking is a documented, not-yet-closed residual gap for genuinely simultaneous requests).
- **Minimal editor UI** (`frontend/app/resumes/[id]/edit/page.tsx`) — new fourth right-panel tab "AI Fixes": recommendation cards (question/answer flow for evidence-needing types, preview with an editable before/after textarea for reword types), Apply/Dismiss, plus a Change History list with per-entry Undo and an inline "score X → Y" banner. Additive — the existing Insights/AI Assistant/Skill Gap tabs are unchanged.
- **63 new tests** (`test_phase_d_ai_agent.py`): 50 pure-function (anti-gaming, classification/staging, AI-proposal anti-fabrication, apply/undo pure helpers, staleness) + 13 DB-integration tests covering the full lifecycle, concurrency, ownership, transaction safety, and scoring-version stability.

### Bugs caught and fixed during Phase D's own build (before/while testing)

- **Misclassification bug (critical, caught via live E2E):** the original design tried to reverse-engineer a recommendation's source category by substring-matching its `why` text against category `reason` strings — but job-match-sourced recommendations (`keywords`/`skills`/`experience`/`education`) use hand-written `why` text, so the match always silently failed and every one of them was misclassified as a generic bullet-quality issue. Fixed by attaching `source_layer`/`source_category` directly onto every recommendation dict at the point `build_editor_recommendations()` creates it — no guessing, ever. Re-verified: 27/27 live E2E checks passed after the fix.
- **Missing target text (related):** `target_text` was originally reconstructed from quoted substrings in `title`/`reason` at apply time, which don't reliably contain the right text for every action type. Fixed by adding a real `AtsRecommendation.target_text` column, captured once at staging time (`_extract_target_text()`).
- **Self-inflicted pytest event-loop contamination:** mixing a bare `asyncio.run()`-based test helper with `@pytest.mark.asyncio` DB-integration tests in the same file corrupted pytest-asyncio's shared event loop, cascading failures into unrelated, previously-passing test files run afterward in the same session (`test_resumes.py`, `test_template_registry.py`). Root-caused and fixed by converting every async test in the file to consistent `@pytest.mark.asyncio` style. Confirmed resolved: those files' failures returned to their original, pre-existing, unrelated signatures.
- Test-design bug: an anti-gaming test asserted 4 repetitions of "React" would be flagged as stuffing, but the module's own threshold is 6 — rewritten to assert the correct, more fundamental invariant (repetition can't inflate the binary match signal at all), not a specific threshold number.

### What did NOT change

- `compute_full_analysis()`, `analyze_v2()`, all Phase B/C scoring logic, weights, and category functions — untouched. `SCORING_ENGINE_VERSION` stays `"2.0.0"`.
- The Resume Quality, ATS Compatibility, and Job Match category calculations themselves — Phase D only adds an *action* layer (apply/undo) on top of Phase C's *read-only* recommendation list; it doesn't change how any score is computed.
- Legacy `/api/ats/analyze`, `/api/ats/score`, and `services/ats.py` — confirmed still functioning via a dedicated regression test (`test_legacy_endpoints_still_function_alongside_phase_d`).

### How to verify

- `pytest backend/tests/test_phase_d_ai_agent.py -m "not asyncio"` — 40 pure-function tests, all passing locally.
- Full backend suite (local): 308 passed, 15 failed, 1 error. Of the 15 failures: 2 are the pre-existing, session-long-known, unrelated Supabase-signup-flakiness failures in `test_resumes.py` (confirmed back to their original `assert 400 == 200`/`KeyError: 'access_token'` signatures, not new); 13 are `test_phase_d_ai_agent.py`'s DB-integration tests, blocked by the local test Postgres (`localhost:5432`) being unreachable in this sandboxed session (`[WinError 1225]`) — a pre-existing environment limitation, not a Phase D code defect. The 1 error is the already-known `test_template_registry.py` teardown flake.
- **Live E2E** (since the 13 DB-integration tests couldn't run locally): a manual script against the real dev Supabase-backed backend exercised the full loop — stage recommendations from a real JD, answer an evidence-needing recommendation, apply it, confirm a real score change (68→69, with per-layer deltas and `changed_fields=["skills"]`), undo it, confirm a second history row was written (not an edit of the first) — 27/27 checks passed after the misclassification-bug fix, and re-confirmed again after wiring the frontend UI to the same endpoints.
- AI-unavailable path confirmed live (not just unit-tested): when both Gemini and OpenAI were rate-limited during testing, `generate_proposal()` correctly returned `proposed_content: None` with an "AI improvement is temporarily unavailable" note instead of fabricating a rewrite, and `/apply` correctly refused with `400 "No content to apply yet"` rather than applying nothing silently.

### Remaining gaps after this release

Benchmark dataset/report still not started (Phase B gap, unchanged). No frontend surfacing of the AI Fixes loop outside the Resume Editor (e.g. `/ats-checker` itself). True row-level locking for the concurrency guard not implemented (documented limitation, low real-world likelihood). See [SAHICAREER_ATS_INTELLIGENCE_2.md](SAHICAREER_ATS_INTELLIGENCE_2.md) §14 for the full, current limitations list.

---

## `2.0.0` (Phase C additions) — 2026-08-14 — Resume Quality + Editor migration foundation

**Status:** the Resume Editor's live ATS panel is now migrated to the canonical v2 engine (`POST /api/ats/v2/analyze-editor`). Legacy `/api/ats/analyze` and `/api/ats/score` are **unchanged and still work** — nothing was removed. `SCORING_ENGINE_VERSION` stays `"2.0.0"` (no scoring-algorithm-breaking change, an additive layer was completed).

### What changed

- **New Resume Quality engine** (`resume_quality.py`) — the third of the three layers, previously always excluded/`None`. 12 categories: bullet quality, quantified impact, action verb strength, skill evidence, summary quality, grammar/readability, seniority signals, career progression, content completeness, repetition, credibility, recruiter readiness. JD-independent by design (works with or without a job description) — reuses `text_metrics.readability_score()`/`recruiter_readiness_score()` and `services/grammar.check_text()` rather than reimplementing them, and `scoring.profile_completeness()` for the completeness category.
- **`QUALITY_WEIGHTS` corrected**: the spec's given starting weights summed to 1.08, not 1.0 — caught by validation (per the spec's own "validate weights sum correctly" instruction) and renormalized, preserving relative proportions exactly.
- **New `compute_full_analysis(resume, job)`** in `ats_intelligence_v2.py` — the general-purpose three-layer entry point used by the editor (and, going forward, `/ats-checker`). Unlike Phase B's `analyze_v2()` (left completely untouched — still has `resume_quality` hardcoded excluded, its own tests still pass unmodified), this function computes a **real** Resume Quality score, and correctly returns `job_match: null` (never `0`) when no JD is supplied.
- **New endpoint**: `POST /api/ats/v2/analyze-editor` — accepts the editor's live, unsaved `content` state directly (mirroring both legacy call shapes it replaces), returns `{scores: {overall, ats_compatibility, job_match, resume_quality}, categories, recommendations, candidate_questions, score_confidence, report_id}`, plus an opt-in `debug` block (raw score / weight / weighted contribution / completeness / confidence / evidence / excluded reason per category). Persists an `AtsReport` only when a JD is supplied (matching `/api/ats/score`'s behavior) — the no-JD, debounced-on-every-keystroke call does **not** write a report row, matching `/api/ats/analyze`'s existing behavior (no new write-amplification introduced).
- **Resume Editor frontend** (`/resumes/[id]/edit`) — both `analyzeContent()` (debounced, no JD) and `scoreAts()` (manual, JD pasted) now call the new endpoint. Minimal UI addition: a 3-number ATS Compatibility / Job Match / Resume Quality row plus a confidence badge, next to the existing score gauge — no redesign.
- **Bug caught during Phase C's own testing, fixed before shipping:** `build_editor_recommendations()` initially reused `scoring.categorize_keywords()`/`build_recommendations()` for JD-gap recommendations — those internally call the OLD, frozen `keyword_engine.match_lists()` (the one with the documented React/React-Native false positive), which would have silently hidden exactly the false negative this whole engine exists to fix. Rewritten to read `missing_evidence` directly off `job_match`'s own v2 categories instead. Caught by `test_build_editor_recommendations_includes_job_match_gaps_when_jd_present` before this ever reached a live response.
- **Bug caught and fixed:** the quantified-impact metric detector required the number and its unit word to be immediately adjacent (`"500 tickets"`), so natural phrasing like `"500 monthly support tickets"` was missed entirely. Fixed with a two-part detector: tight adjacency for `%`/currency/ratio patterns, a looser same-bullet check for count-based metrics.
- **Bug caught and fixed:** the credibility engine's overlapping-employment-dates check flagged a job ending in year N and the next starting in year N as "overlapping" — an extremely common, completely normal transition. Fixed to require strict overlap, not a shared boundary year.

### What did NOT change

- `analyze_v2()` (Phase B's frozen entry point) — byte-for-byte behavior preserved, its own Phase B tests (56) still pass unmodified.
- The 7-category Match/Completeness/Confidence model, `keyword_engine.py`, `ats_config.py`'s `ATS_HEALTH_WEIGHTS`/`ATS_COMPATIBILITY_WEIGHTS`/`JOB_MATCH_WEIGHTS`/`ATS_SCORE_CONFIG`.
- Legacy `/api/ats/analyze`, `/api/ats/score`, `/api/ats/reports/*`, and `services/ats.py` — all unchanged, all still in active use by pages not yet migrated (`/ai-upgrade`, `/job-match`).
- `ats_change_history` table — still schema-only, nothing writes to it yet (the apply/reparse loop is explicitly out of scope for Phase C).

### How to verify

- `pytest backend/tests/test_ats_engine.py` (30) + `test_ats_intelligence_v2.py` (56) + `test_phase_c_resume_quality.py` (59) — all passing.
- Full backend suite: 258 passed (same 2 pre-existing unrelated failures + 1 known teardown flake as every prior session).
- Live E2E against the running backend: no-JD editor call returns `job_match: null` (not `0`) and a real `resume_quality` score; JD-based call persists a report and correctly surfaces `"React Native"` as a missing keyword in both the category evidence AND the recommendations (confirming the recommendation-builder bug above is actually fixed, not just unit-tested); both legacy endpoints still return `200`.

---

## `2.0.0` — 2026-08-13 — Phase B: ATS Intelligence 2.0 scoring foundation

**Status:** dual-score output only. The UI headline score (`overall_score`) is **unchanged** — this release adds a new, parallel `ats_intelligence_v2` score alongside it, does not replace it. See [SAHICAREER_ATS_INTELLIGENCE_2.md] *(not yet created — Phase B did not reach the documentation-of-the-new-model deliverable; see Remaining Gaps in the Phase B report)*.

### What changed

- **New keyword matcher** (`keyword_aliases.py`) used only by the new v2 layers. Fixes a documented false-positive bug in the *old* matcher (`"React"` == `"React Native"` under `fuzz.token_set_ratio`, verified empirically — see [ATS_PHASE_3_BACKUP.md](ATS_PHASE_3_BACKUP.md) §2) by switching the fuzzy fallback to plain `fuzz.ratio` and adding a curated alias table (JS↔JavaScript, TS↔TypeScript, AWS↔Amazon Web Services, and ~15 others). The **old** matcher (`keyword_engine.match_lists()`) is untouched and still has this behavior — it still drives the 7-category model, per Phase B decision 6 ("keep exactly as implemented unless a documented bug requires a change" — the bug was documented, but the fix was scoped to a new module rather than risking the frozen model's stability).
- **New centralized weight config** (`ats_config.py`): `ATS_HEALTH_WEIGHTS`, `ATS_COMPATIBILITY_WEIGHTS`, `JOB_MATCH_WEIGHTS`, `QUALITY_WEIGHTS`, `ATS_SCORE_CONFIG`, `SCORING_ENGINE_VERSION = "2.0.0"`.
- **New Parsing Rate engine** (`parsing_quality.py`) — 6 named metrics (`parsed_character_ratio`, `parsed_word_ratio`, `section_extraction_ratio`, `garbled_text_ratio`, `reading_order_score`, `contact_extraction_score`), all computed from the same extracted `raw_text` every other module uses — no new dependency, no OCR/layout analysis.
- **New Section Recognition engine** (`section_recognizer.py`) — heading-variant tolerant (e.g. "Employment History" → Experience), distinguishes core sections (Summary/Experience/Education/Skills — expected, penalized if missing) from optional ones (Projects/Certifications — recognized, never penalized if absent).
- **New Location Match category** — no equivalent existed before. Only applicable when the JD contains explicit location-signal language (remote/hybrid/onsite/relocation/work authorization); otherwise excluded and its weight redistributed, never scored as zero.
- **New dual-score aggregation layer** (`ats_intelligence_v2.py`) — computes `ats_compatibility` (parsing + sections + formatting) and `job_match` (keywords + experience + education + skills + certifications + location) as two of the three product-spec layers; `resume_quality` (the third layer) is **not implemented yet** and is always excluded/redistributed, same "never zero" rule applied one level up from categories to layers.
- **`ats_service.analyze()`** now additionally returns `ats_intelligence_v2` (the full v2 breakdown) and `scoring_engine_version` alongside every existing key — nothing existing was removed or renamed.
- **`AtsReport`** gained one new nullable column, `scoring_engine_version`, now stamped on every newly persisted report via `/api/ats/v2/analyze-resume`. Distinct from the pre-existing `analysis_version` (report schema version, not scoring formula version).
- **New table, `ats_change_history`** (migration `0011_ats_intelligence_2.sql`) — schema only, per Phase B decision 4. **Not written to by any code path yet** — the AI apply/reparse loop that would populate it is explicitly deferred (Phase B decision 11).

### What did NOT change

- `overall_score`, `score_confidence`, `score_explanation`, `category_analysis`, `weights_used`, `excluded_categories` — the entire 7-category Match/Completeness/Confidence model's output is byte-for-byte identical to before Phase B for the same input, confirmed by the full existing 30-test suite passing unmodified.
- `legacy_overall_score` and the underlying 9-dimension `scores` dict.
- The legacy `services/ats.py` engine, and the 3 frontend pages that depend on it.
- The resume editor's ATS panel (still calls the legacy `/api/ats/analyze`/`/api/ats/score` endpoints — migrating it is planned, not done, in Phase B — see Remaining Gaps).
- `/ats-checker`'s UI — no frontend changes were made in Phase B; the new `ats_intelligence_v2` data is present in the API response but not yet surfaced anywhere in the UI.

### Why

Product requirement: benchmark SahiCareer's ATS against the observable capabilities of Enhancv/ResumeGyani/Zety, starting from a corrected, alias-aware, false-positive-free keyword engine and a real Parsing Rate + Section Recognition foundation — without touching the existing, working, tested scoring model while that foundation is built and verified.

### How to verify

- `pytest backend/tests/test_ats_engine.py` — 30/30 passing, unchanged from before Phase B.
- `pytest backend/tests/test_ats_intelligence_v2.py` — 56 new tests, all passing.
- Full backend suite: 199 passed (same 2 pre-existing unrelated failures + 1 known teardown flake as every prior session).
- Concrete example (see the Phase B report for the full breakdown): a resume with "React" (not "React Native") scored against a JD requiring "React Native" shows the old engine's `keyword_match.pct` counting it as matched, while `ats_intelligence_v2.job_match.categories.keywords.match` correctly does not — the exact, real effect of the fix, not just a unit-test assertion.

### Remaining gaps after this release

See the Phase B report for the full list; the headline ones: Resume Quality layer not implemented, resume editor still on the legacy engine, no frontend surfacing of `ats_intelligence_v2` yet, no anti-gaming/keyword-stuffing detection yet, no benchmark dataset/report yet, AI apply/reparse loop not started.
