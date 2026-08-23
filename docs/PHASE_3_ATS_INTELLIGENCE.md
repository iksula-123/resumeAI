# Phase 3 — ATS Intelligence

**STATUS: ✅ IMPLEMENTED** (core scope). A small number of sub-items are explicitly marked **PLANNED** below — read §8 before assuming full parity with the original spec.

**Source of record:** [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md) Entry 11 (commit `fd39489`). Depends on the pre-existing `services/ats_engine/` package first introduced in Entry 10 (commit `92050d6`, 2026-08-04).

---

## 1. Objective

Replace the ATS engine's single, fixed, blended score with a transparent, dynamic **Match / Completeness / Confidence** model that:
- never hardcodes a score,
- never treats missing candidate data as automatic zero,
- explains itself ("Your ATS score is X because…"),
- persists a full history of scans per resume,
- and degrades gracefully (never breaks) when the AI provider is unavailable.

**Explicit constraint carried through this phase:** consolidate into the existing `services/ats_engine/` package as the sole canonical ATS engine — do **not** build a second engine, parser, LLM client, ATS dashboard, or ATS report table.

## 2. Pre-existing ATS architecture (before this phase, commit `92050d6`)

`backend/services/ats_engine/` — the canonical pipeline, present since 2026-08-04:

| Module | Role |
|---|---|
| `resume_parser.py` | `parse(text)` — LLM-based resume parsing with a regex-heuristic fallback if no AI key/call fails. `from_content(content)` — builds the same structured shape directly from an already-saved Resume Builder record (no re-parsing needed for saved resumes). |
| `job_parser.py` | Parses a pasted job description into structured requirements (skills, experience, education, industry, keywords). |
| `keyword_engine.py` | Exact/normalized keyword matching between resume and job. |
| `similarity_service.py` | `overall_similarity()` / `section_similarity()` — embedding-based semantic similarity, degrades to token overlap when no embeddings are available. |
| `ats_service.py` | Orchestrator — calls the above, computes the (pre-Phase-3) fixed 9-dimension weighted score. |
| `recommendation_engine.py` | AI-generated bullet rewrites, weak-word detection, summary suggestions, general tips. |
| `resume_improver.py` | Generates a JD-tailored resume. |
| `text_metrics.py` | Formatting/readability/recruiter-readiness scoring. |
| `llm.py` | **OpenAI-only** wrapper (`OPENAI_API_KEY`) — `chat_json()`, `embed_text()`, `cosine_similarity()`. |

**Important distinction confirmed in code:** `services/ats_engine/llm.py` is OpenAI-only. This is a *different* module from `backend/services/ai.py`, which is Gemini-first/OpenAI-second/static-fallback-third and powers the rest of the app's AI features (resume upgrade, AI writer, etc.). The ATS engine's AI layer and the general resume-AI layer are two separate integrations — see [ARCHITECTURE.md](ARCHITECTURE.md).

**Existing (pre-Phase-3) ATS surface:**
- `POST /api/ats/v2/analyze` — paste resume text + JD, ephemeral (not persisted)
- `POST /api/ats/v2/analyze-resume` — resume_id-based (existed before Phase 3, but without detailed persistence/history — see §4)
- `POST /api/ats/v2/tailor`
- `/ats-checker` frontend dashboard
- `role_profiles` library (115 roles, per commit `92050d6`'s own message) used for "target role, no JD" analysis
- **A separate, older, legacy engine**, `backend/services/ats.py` — India-tuned, keyword-overlap based, predating `services/ats_engine/` — still backs three live pages that this phase deliberately did **not** touch (see §3).

**What was missing before this phase, confirmed by the absence of dedicated tests:** `backend/tests/test_ats_engine.py` did not exist before this phase — the engine had **zero dedicated test coverage** prior to Phase 3.

## 3. Legacy engine consolidation

- `services/ats.py` (legacy) was **frozen**, not deleted and not extended: a large "LEGACY — FROZEN" docstring was added; zero logic was changed.
- Confirmed via grep that exactly two backend files import from `services.ats`: `routers/ats.py` and `routers/upgrade.py`.
- Confirmed via grep that exactly three frontend pages call the legacy endpoints those routers expose: `frontend/app/ai-upgrade/page.tsx` (→ `/api/upgrade/analyze`, `/api/upgrade/enhance`), `frontend/app/resumes/[id]/edit/page.tsx` (→ `/api/ats/analyze`), `frontend/app/job-match/page.tsx` (→ `/api/ats/score`).
- **Decision:** these three pages' exact response-shape expectations were not to be broken, so the legacy engine stays live and untouched rather than being migrated mid-phase. This is a deliberate scope boundary, not an oversight.

## 4. The Match / Completeness / Confidence model (`services/ats_engine/scoring.py`, new)

This is the core new module. Confirmed directly from the file.

### 4.1 Categories and default weights

```python
CATEGORY_WEIGHTS = {
    "keyword": 25.0, "skills": 20.0, "experience": 20.0, "responsibility": 15.0,
    "education": 10.0, "certifications": 5.0, "formatting": 5.0,
}   # sums to 100
```

Seven categories: Keyword, Skills, Experience, Responsibility, Education, Certifications, Formatting.

### 4.2 Per-category output shape

Every category returns (`CategoryAnalysis.to_dict()`):

```
key, label, applicable (bool),
match (0-100 or null = "N/A"),
completeness (0-100),
confidence ("high" | "medium" | "low"),
matched_evidence (list[str]), missing_evidence (list[str]),
reason (str), weight (float, filled in after redistribution)
```

**Match** measures fit against the job description. **Completeness** measures how much data the candidate actually supplied — independent of whether it's a good fit. **Confidence** reflects how much the analysis should be trusted given the available evidence. These three axes are never conflated into one number.

### 4.3 Dynamic weight redistribution — never a silent zero

`_redistribute_weights()`: categories that are `applicable=False` or have `match=None` are **excluded from the weighted overall score**, and their weight is redistributed proportionally across the remaining applicable categories — the overall score is a weighted average over only the categories that could actually be evaluated, never zero-padded for the ones that couldn't.

### 4.4 Verified example behaviors (from the project's own test suite)

- **Education = "M.Com" only, JD says "Bachelor's degree required":** `Match = 100.0`, `Completeness ≈ 33–100` depending on what other education fields are present, `Confidence = high`. The reasoning text explains that M.Com satisfies the Bachelor's requirement; missing university/graduation-year metadata does **not** reduce the match score — only completeness.
- **Experience = only a company name ("ABC Technologies"), no title/dates/bullets:** `Match = None` ("N/A" — the system does not guess), `Completeness ≈ 20–25`, `Confidence = low`. The reasoning text explains that only the employer is known and that missing data is not evidence the candidate lacks the experience.

Both were re-verified live during this session (both by direct script execution and by the dedicated pytest tests `test_mcom_only_education_is_not_penalized_for_missing_fields` and `test_abc_technologies_only_experience_is_na_not_zero`).

### 4.5 Other `scoring.py` capabilities (confirmed present)

- `categorize_keywords()` — splits job keywords into **Critical** (`required_skills`), **Important** (`preferred_skills`), **Optional** (other JD keywords not already required/preferred), plus an **overused** list (a resume keyword appearing ≥6 times, flagged as reading like keyword-stuffing rather than genuine depth).
- `skills_breakdown()` — **Matched / Partially Matched / Missing**. Explicitly does not claim a related-but-different skill is equivalent — e.g. if the JD asks for "TypeScript" and the resume only has "JavaScript," this is surfaced as a partial match with an explanatory note ("JavaScript is related to TypeScript but not equivalent — verify before claiming this skill"), never silently counted as a match. Implemented via a small heuristic map, `_RELATED_NOT_EQUIVALENT`.
- `profile_completeness()` — a metric **separate from the ATS score** (never blended into `overall_score`): per-section 0–100 scores for education, experience, skills, projects, certifications, achievements, plus an `overall` average and a list of concrete `suggestions` ("Add institution name and graduation year…", etc.).
- `build_recommendations()` — returns `{high, medium, low}`, each item `{issue, why, action, impact}`. Confirmed it never recommends a keyword the candidate has no evidence for — the action text for a missing keyword explicitly says to add it "ONLY if you genuinely have experience with it — never fabricate a skill to pass a keyword filter."
- `build_candidate_questions()` — deterministic (no AI call), grounded in actual resume data (e.g. "You mentioned working at ABC Technologies. What was your job title?"), capped at 8 questions, and confirmed by test (`test_candidate_questions_do_not_invent_answers`) to never invent or assume an answer on the candidate's behalf.

### 4.6 Overall score, explanation, and confidence

`analyze_categories()` returns `overall_score` (0–100, computed only from applicable/scoreable categories and their redistributed weights), `score_confidence` (`high`/`medium`/`low`), and `score_explanation` — a generated sentence of the form *"Your ATS score is X because: Keyword 82%; Skills 74%; …"* (excluded categories are named explicitly, with the reason weight was redistributed rather than zeroed). This calculation is never hidden from the user.

Verified live that `overall_score` is genuinely dynamic — a project sanity test (`grep`-based) confirms there is no literal hardcoded score constant (e.g. no stray `"82"`) anywhere in the scoring module, and functional tests confirm the score changes when either the resume content or the job-description content changes.

## 5. Persistence — extending, not replacing, `AtsReport`

- `backend/models.py::AtsReport` was **extended** (16 new nullable columns), not replaced, and no new table was created. New columns: `tenant_id` (a pre-existing DB column that had never been added to the ORM model — an additive catch-up fix, not a new decision), `target_role`, `analysis_mode`, `score_confidence`, `score_breakdown`, `category_scores`, `category_completeness`, `category_confidence`, `overall_confidence`, `critical_keywords`, `important_keywords`, `partial_matches`, `formatting_analysis`, `profile_completeness`, `recommendations`, `candidate_questions`, `analysis_version`.
- Migration: `supabase/migrations/0010_ats_intelligence.sql` — every new column is `add column if not exists` and nullable; an index `idx_ats_reports_resume_created (resume_id, created_at desc)` was added for the history query. Confirmed applied to the live Supabase project.

## 6. API surface (`backend/routers/ats_engine.py`, prefix `/api/ats/v2`)

| Route | Status | Notes |
|---|---|---|
| `POST /upload` | pre-existing | extract text from an uploaded file |
| `POST /analyze` | modified | paste-text path; ephemeral, not persisted; now includes `analysis_mode` in the response |
| `POST /analyze-resume` | **rewritten** | the canonical resume_id-based path — now persists a full `AtsReport`, computes `score_delta`/`previous_score` against the immediately preceding report for the same resume |
| `GET /history/{resume_id}` | **new** | every report for a resume, newest first, plus a `{first_score, latest_score, improvement}` trend when ≥2 reports exist |
| `GET /report/{report_id}` | **new** | full detail of one persisted report |
| `POST /tailor` | pre-existing | unchanged |

**Ownership/security (confirmed in code):** every one of these endpoints uses `services/deps.py::get_current_user` (not the legacy `services/auth.py::verify_token`), does an explicit ownership check (`resume_row.user_id != user.id`, with an `is_admin` bypass), and returns `404` — not `403` — on a mismatch, so a request cannot even confirm that a given resume/report ID exists for another user. Verified live: a second test user attempting to analyze, view history for, or view a report belonging to the first user received `404` in all three cases.

**Role-based (no-JD) analysis:** when `job_description` is omitted and only `target_role` is supplied, `analysis_mode = "role_based"` and the JD side is synthesized from the `role_profiles` library (`_job_from_role()`). If the target role isn't found in the library, the analysis still proceeds using the title alone, honestly labeled `parsed_by: "role_library_unmatched"` rather than silently pretending a full role match occurred.

## 7. Frontend (`frontend/app/ats-checker/page.tsx` — extended, not a new page)

Confirmed present: score confidence badge on the main score gauge; a "Why this score?" panel showing the generated explanation and any weight-redistribution note; a Profile Completeness panel (visually and semantically separate from the ATS score); per-category Match/Completeness/Confidence cards for all seven categories, each showing matched/missing evidence pills; a Keyword Analysis panel (Critical/Important/Optional, plus overused-keyword pills); a Skills Breakdown panel (matched/partial/missing, with the partial-match note visible on hover); Prioritized Recommendations (High/Medium/Low, each with issue/why/action/impact); an AI/candidate-questions panel; and an ATS History panel with a trend badge and, when a previous report exists for the same resume, a category-level "what changed since your last scan" diff (fetches the previous report's `category_scores` and computes per-category deltas).

## 8. What is PLANNED / not fully implemented

- **Deep frontend polish beyond functional completeness** — the UI sections above are functionally wired to real API data (no fake numbers), but visual/UX refinement beyond that was not a tracked deliverable of this phase and should not be assumed "final design."
- **Retry/backoff tuning for the AI-unavailable case** — confirmed live during this session's E2E test that a real OpenAI `429` outage (quota exhausted) caused `/analyze-resume` to take 40–90 seconds (the OpenAI SDK's own retry/backoff running across ~8 chained calls per request — two separate `overall_similarity()` calls each making 2 embedding calls, plus JD parsing and recommendation generation each making one chat completion call) rather than failing fast. The analysis still completed correctly with real deterministic scores — it degraded, it did not break — but the retry timing itself was not tuned in this phase. **PLANNED**, not done.
- **Deduplication of the two separate `overall_similarity()` calls** (one for the legacy industry-match score, one for the top-level semantic-similarity score) into a single reused embedding pair — noted as a cost-efficiency opportunity, not implemented. **PLANNED**.
- **Subscription/usage blocking** — usage events (`ats_analysis`, `ats_deep_analysis`, `ats_tailoring`) are tracked via the pre-existing `services/usage.py` (`log_usage_event`), with `ats_deep_analysis` firing only when AI-generated suggestions actually ran (cost-aware). No credit limit or paywall enforcement exists — this was explicitly out of scope for this phase, not an oversight.

## 9. Tests

`backend/tests/test_ats_engine.py` — **26 tests, all passing.** Covers (per the file's own section grouping): resume parsing, JD parsing, keyword matching (including "empty JD keyword list → 100%, not zero"), skill matching (including the JavaScript≠TypeScript guard), experience matching, education matching, certification matching (including "not applicable when the JD is silent on certifications → excluded from scoring, not zeroed"), responsibility matching (including two separate N/A-not-zero cases), formatting, overall-score dynamism (three tests, including a source-grep guard against a hardcoded score constant), the two named spec examples (§4.4), no-JD/role-based graceful handling, an empty-resume no-crash case, a long-resume/long-JD no-crash case (15 experience entries / 30 skills / 15 certifications), and an AI-unavailable case (`embed_text` monkey-patched to return `None`, confirming deterministic categories still score correctly without embeddings).

Full backend regression suite at the time of this phase: **139 passed**, 2 pre-existing failures unrelated to this work (both fail against a live Supabase network call: `test_signup_and_create_resume`, `test_ats_score`), 1 known pytest-asyncio teardown-ordering flake (passes in isolation, confirmed by re-running it alone).

## 10. Rollback

See [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md) Entry 11 — shares one commit (`fd39489`) with Phase 1 and Phase 2. The database migration (`0010`) is additive/nullable and does not need reverting even if the application code is rolled back.
