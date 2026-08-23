# SahiCareer — AI Development Log

**Purpose:** the single master, chronological record of every significant development change made to this codebase — what changed, why, how it was verified, and how to roll it back if needed.

**How this document was produced:** by inspecting `git log` on the `main` branch, the diff/stat of every commit, and (for the two most recent entries) the actual Claude Code session transcript. Nothing below is invented. Where a fact could not be verified from the repository or from an available conversation transcript, it is explicitly marked **`Needs verification`** rather than guessed.

**Important note on commit granularity:** this repository's git history does **not** have one commit per "phase" as defined in `docs/PHASE_*.md`. In particular, commit `fd39489` bundles branding, Phase 1 (Template Foundation), Phase 2 (Five New Templates), and Phase 3 (ATS Intelligence) into a single commit, because all of that work was done in one continuous session and committed together at the end of it. This log cross-references each entry to the phase document(s) it relates to; it does not pretend the commits are more granular than they are.

**Related documents:** [PHASE_1_TEMPLATE_FOUNDATION.md](PHASE_1_TEMPLATE_FOUNDATION.md) · [PHASE_2_RESUME_TEMPLATES.md](PHASE_2_RESUME_TEMPLATES.md) · [PHASE_3_ATS_INTELLIGENCE.md](PHASE_3_ATS_INTELLIGENCE.md) · [PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md](PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md) · [PHASE_5_AI_BUDDY.md](PHASE_5_AI_BUDDY.md) · [PHASE_6_MENTORLY.md](PHASE_6_MENTORLY.md) · [PHASE_7_CAREER_PROFILE.md](PHASE_7_CAREER_PROFILE.md) · [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Log index

| # | Date | Commit | Summary | Status |
|---|---|---|---|---|
| 0 | 2026-07-01 | `09ff849` | Initial commit: ResumeAI Pro | Needs verification (prompt) |
| 1 | 2026-07-02 | `52defab` → `80104cb` | Temporary prod-debug error handler, added then removed | Needs verification (prompt) |
| 2 | 2026-07-03 | `a461c92` | "updated ai resume update" | Needs verification (prompt) |
| 3 | 2026-07-13 | `69d514d` | Version history + rollback, skill-gap analysis, graceful auth expiry | Needs verification (prompt) |
| 4 | 2026-07-14 | `5cbe28e` | Job Tracker, Job Match, Storage, API keys/v1, Webhooks, Analytics, Audit logs | Needs verification (prompt) |
| 5 | 2026-07-27 | `96fb61f` | SahiCareer "My Resume" — Phase 1 (milestones A–I) *(pre-existing git "Phase 1", unrelated to this doc set's Phase 1)* | Needs verification (prompt) |
| 6 | 2026-07-28 | `3153987` | Rebrand to SahiCareer, EduBridge data ingestion, success metrics | Needs verification (prompt) |
| 7 | 2026-07-28 | `5c5f1aa` | Mobile-first app shell + WCAG AA contrast fixes | Needs verification (prompt) |
| 8 | 2026-07-28 | `e23b59d` | Fix: Build-from-Role page was gitignored + keep-alive | Needs verification (prompt) |
| 9 | 2026-07-28 | `7ab56cc` | Forgiving role search + popular-roles fallback | Needs verification (prompt) |
| 10 | 2026-08-04 | `92050d6` | Marketing landing page, AI ATS engine (v1, `services/ats_engine`), expanded role library, brand refresh | Needs verification (prompt) |
| 11 | 2026-08-10 → 2026-08-11 | `fd39489` | SahiCareer logo/branding; **Phase 1** Template-Aware Export Foundation; **Phase 2** Five New Resume Templates; **Phase 3** ATS Intelligence (Match/Completeness/Confidence) | ✅ Verified (full session transcript) |
| 12 | 2026-08-11 | *(no new commit — deploy of `fd39489`)* | Production deployment to Render (backend) + Vercel (frontend, unconfirmed) | ✅ Backend verified live; frontend not independently confirmed |
| 13 | 2026-08-12 | *(no commit — investigation only)* | Phase 4 (SahiCareer Auth & Services) — root-caused the "always redirects to Mentorly after login" defect | ✅ Verified — superseded by Entry 14 (fix implemented same day) |
| 14 | 2026-08-12 | *(no commit yet — uncommitted at time of writing)* | Phase 4 implementation — fixed the login-redirect defect, plus a related bug found during verification (`/resumes/build`'s own guard dropped deep links) | ✅ Implemented and verified by code trace + build |
| 15 | 2026-08-13 | *(uncommitted)* | Phase B — ATS Intelligence 2.0 scoring foundation (config, alias-aware v2 keyword matcher, parsing/section engines, dual-score `ats_intelligence_v2`) | ✅ Verified — 56 new tests + full-suite regression, see [ATS_CHANGELOG.md](ATS_CHANGELOG.md) |
| 16 | 2026-08-14 | *(uncommitted)* | Phase C — Resume Quality engine (12 categories) + Resume Editor migration to the v2 engine + AI-apply groundwork | ✅ Verified — 59 new tests + full-suite regression, 3 real bugs caught pre-ship, see [ATS_CHANGELOG.md](ATS_CHANGELOG.md) |
| 17 | 2026-08-14 | *(uncommitted)* | Phase D — AI ATS Agent: recommendation → approval → apply → reparse → rescore → delta → change-history → undo loop, plus a minimal editor UI for it | ✅ Verified — 63 new tests (50 passing locally, 13 DB-integration blocked by an unreachable local Postgres, separately proven via live E2E), see [ATS_CHANGELOG.md](ATS_CHANGELOG.md) |
| 18 | 2026-08-14 | *(uncommitted)* | Phase E — Benchmark dataset + hard/informational calibration validation suite; zero production scoring changes | ✅ Verified — 69 new tests passing, 377/392 full suite (zero new regressions), see [ATS_CHANGELOG.md](ATS_CHANGELOG.md) and [ATS_BENCHMARK_REPORT.md](ATS_BENCHMARK_REPORT.md) |

Everything from entry 0–10 predates the conversation this log was written from; those entries are reconstructed from `git log`/`git show` only. Entries 11–18 are drawn from the actual session transcript and are held to a higher confidence standard.

---

## Entry 0 — Initial commit

- **Phase:** Pre-phase / project scaffold
- **Date:** 2026-07-01
- **Status:** ✅ Committed (historical)
- **Objective:** Needs verification
- **Business requirement:** Needs verification
- **User requirement:** Needs verification
- **Claude prompt used:** Needs verification
- **Architecture decisions:** Established the base stack: Next.js frontend, FastAPI backend, Supabase (Postgres + Auth). Needs verification for any decisions beyond what the stack choice implies.
- **Files created:** 89 files (full initial scaffold — `.env.example`, backend app skeleton, frontend app skeleton)
- **Files modified:** n/a (initial commit)
- **Files deleted:** n/a
- **Database changes:** Needs verification (no migration files exist yet at this commit — schema likely defined ad hoc)
- **API changes:** Needs verification
- **Frontend changes:** Needs verification
- **Backend changes:** Needs verification
- **AI/LLM changes:** Needs verification
- **Authentication/security changes:** Needs verification
- **Tests:** Needs verification
- **Build results:** Needs verification
- **Known issues:** Needs verification
- **Remaining work:** Needs verification
- **Rollback instructions:** `git revert` is not meaningful for an initial commit; a rollback would mean discarding the whole project.
- **Git commit/hash:** `09ff849cb06173bf44f350a3804e5098c9538b0d`

---

## Entry 1 — Temporary prod-debug handler (added, then removed)

- **Phase:** Pre-phase / operations
- **Date:** 2026-07-02
- **Status:** ✅ Committed, then reverted same day
- **Objective:** Needs verification — inferred from commit message: surface unhandled error detail in HTTP responses to debug a production signup failure, then remove it once fixed.
- **Business requirement / User requirement / Claude prompt used:** Needs verification
- **Architecture decisions:** None of lasting effect (temporary diagnostic code, self-reverted).
- **Files created:** none
- **Files modified:** `backend/main.py` (+13/-1, then -13/+1 — net no-op)
- **Files deleted:** none
- **Database / API / Frontend / Backend / AI / Auth changes:** none of lasting effect
- **Tests / Build results:** Needs verification
- **Known issues:** none carried forward
- **Remaining work:** none
- **Rollback instructions:** n/a — already self-reverted
- **Git commit/hash:** `52defab` (add) → `80104cb` (remove)

---

## Entry 2 — "updated ai resume update"

- **Phase:** Pre-phase
- **Date:** 2026-07-03
- **Status:** ✅ Committed (historical)
- **Objective:** Needs verification — commit message is non-descriptive
- **Business requirement / User requirement / Claude prompt used:** Needs verification
- **Architecture decisions:** Needs verification
- **Files created/modified:** 9 files, `backend/main.py` + 8 others (834 insertions) — Needs verification for exact file list beyond `main.py`
- **Files deleted:** Needs verification
- **Database / API / Frontend / Backend / AI / Auth changes:** Needs verification
- **Tests / Build results:** Needs verification
- **Known issues / Remaining work:** Needs verification
- **Rollback instructions:** `git revert a461c92` (not tested; may conflict with later commits touching the same files)
- **Git commit/hash:** `a461c92`

---

## Entry 3 — Version history + rollback, skill-gap analysis, graceful auth expiry

- **Phase:** Pre-phase
- **Date:** 2026-07-13
- **Status:** ✅ Committed (historical)
- **Objective:** Per commit message: add resume version history with rollback, add skill-gap analysis, make auth-token expiry fail gracefully, remove a pricing feature.
- **Business requirement / User requirement / Claude prompt used:** Needs verification
- **Architecture decisions:** `backend/models.py` gained 18 lines — likely a new table/columns for version history. Needs verification for exact schema.
- **Files created/modified:** 14 files, 541 insertions / 209 deletions
- **Files deleted:** Needs verification (a "remove pricing" change suggests at least one file/section removed)
- **Database changes:** Needs verification — no explicit migration file confirmed for this commit
- **API / Frontend / Backend changes:** Needs verification beyond the commit message
- **AI/LLM changes:** "skill-gap analysis" implies an AI-assisted feature — Needs verification of which provider/module
- **Authentication/security changes:** "graceful auth expiry" — Needs verification of implementation
- **Tests / Build results:** Needs verification
- **Known issues / Remaining work:** Needs verification
- **Rollback instructions:** `git revert 69d514d` (not tested)
- **Git commit/hash:** `69d514d`

---

## Entry 4 — Job Tracker, Job Match, Storage, API keys/v1, Webhooks, Analytics, Audit logs

- **Phase:** Pre-phase
- **Date:** 2026-07-14
- **Status:** ✅ Committed (historical)
- **Objective:** Per commit message: add Job Tracker, Job Match, file Storage, public API (`/api/v1`) with API-key auth, Webhooks, Analytics, Audit logs, and a dashboard.
- **Business requirement / User requirement / Claude prompt used:** Needs verification
- **Architecture decisions:** Introduced a public-facing API surface (`/api/v1`, API keys) alongside the browser-session API — Needs verification of exact isolation/auth model between the two.
- **Files created/modified:** 35 files, 2769 insertions / 93 deletions. `backend/main.py` +11 lines (new router registrations).
- **Files deleted:** Needs verification
- **Database changes:** Needs verification — likely new tables for job applications, webhooks, audit logs, API keys
- **API changes:** New routers implied: `job-tracker`, `job-match`, `storage`, `keys`, `v1`, `webhooks` (these routers are confirmed to exist in the current `backend/routers/` directory, consistent with this commit's description)
- **Frontend changes:** Needs verification of exact pages beyond "dashboard"
- **Backend changes:** As above
- **AI/LLM changes:** "Job Match" plausibly uses AI matching — Needs verification
- **Authentication/security changes:** New API-key auth path for `/api/v1` — Needs verification of implementation detail
- **Tests / Build results:** Needs verification
- **Known issues / Remaining work:** Needs verification
- **Rollback instructions:** `git revert 5cbe28e` (not tested; high risk of conflicts given later commits touch overlapping files)
- **Git commit/hash:** `5cbe28e`

---

## Entry 5 — SahiCareer "My Resume" — Phase 1 (milestones A–I)

> ⚠️ **Naming collision warning:** this commit's own message calls itself "Phase 1." It is **not** the same thing as this documentation set's `PHASE_1_TEMPLATE_FOUNDATION.md`. This git-history "Phase 1" refers to an earlier, unrelated body of work (rebrand milestones A–I). To avoid confusion, this log refers to it only as **"Entry 5 / commit 96fb61f"**, never as "Phase 1."

- **Phase:** Pre-phase (predates this doc set's phase numbering)
- **Date:** 2026-07-27
- **Status:** ✅ Committed (historical)
- **Objective:** Needs verification — commit message references "milestones A–I" without listing them
- **Business requirement / User requirement / Claude prompt used:** Needs verification
- **Architecture decisions:** Needs verification
- **Files created/modified:** 54 files, 9581 insertions / 35 deletions — the largest pre-session commit by far
- **Files deleted:** Needs verification
- **Database / API / Frontend / Backend / AI / Auth changes:** Needs verification — too large a diff to safely characterize without a prompt/spec record
- **Tests / Build results:** Needs verification
- **Known issues / Remaining work:** Needs verification
- **Rollback instructions:** `git revert 96fb61f` (not tested; very high conflict risk — this is a large, foundational commit that later work builds directly on top of)
- **Git commit/hash:** `96fb61f`

---

## Entry 6 — Rebrand to SahiCareer, EduBridge data ingestion, success metrics

- **Phase:** Pre-phase
- **Date:** 2026-07-28
- **Status:** ✅ Committed (historical)
- **Objective:** Per commit message: rebrand the product to "SahiCareer," add EduBridge data ingestion, add success metrics.
- **Business requirement / User requirement / Claude prompt used:** Needs verification
- **Architecture decisions:** Added `backend/routers/career_record.py` / `backend/services/career.py` (confirmed present in current tree) — the "EduBridge career record" ingestion pipeline (`GET/PUT /api/career-record`, `POST /api/career-record/ingest[/bulk]`) that pulls verified education/training/certificate data from EduBridge's own LMS/college systems into a resume-fillable record. **This is a narrower, existing precursor to the "Career Profile / Career Vault" concept in [PHASE_7_CAREER_PROFILE.md](PHASE_7_CAREER_PROFILE.md) — it is not the same thing** (it only carries education/training/certificate fields sourced from EduBridge, not the full personal-info/experience/skills/projects/goals/learning-progress model Phase 7 describes).
- **Files created/modified:** 13 files, 404 insertions / 39 deletions
- **Files deleted:** Needs verification
- **Database changes:** Needs verification — likely a `career_records` table
- **API changes:** `/api/career-record` and its `/ingest`, `/ingest/bulk` sub-routes (confirmed present in current codebase)
- **Frontend changes:** Needs verification
- **Backend changes:** As above
- **AI/LLM changes:** none apparent from the router's own code (pure data ingestion/CRUD)
- **Authentication/security changes:** Needs verification — `/ingest/bulk` uses `require_admin` per current code (confirmed), consistent with a trusted LMS-side bulk import
- **Tests / Build results:** Needs verification
- **Known issues:** Needs verification
- **Remaining work:** Full Career Profile vision (Phase 7) not built — see that document
- **Rollback instructions:** `git revert 3153987` (not tested)
- **Git commit/hash:** `3153987`

---

## Entry 7 — Mobile-first app shell + WCAG AA contrast fixes

- **Phase:** Pre-phase
- **Date:** 2026-07-28
- **Status:** ✅ Committed (historical)
- **Objective:** Per commit message: make the app shell mobile-first, fix WCAG AA color-contrast issues.
- **Business requirement / User requirement / Claude prompt used:** Needs verification
- **Architecture decisions:** None structural — styling/responsive-layout pass across 27 files
- **Files created/modified:** 27 files, 133 insertions / 108 deletions (small, targeted diffs consistent with a styling pass)
- **Database / API / AI / Auth changes:** none apparent
- **Tests / Build results:** Needs verification
- **Known issues / Remaining work:** Needs verification
- **Rollback instructions:** `git revert 5c5f1aa` (not tested)
- **Git commit/hash:** `5c5f1aa`

---

## Entry 8 — Fix: Build-from-Role page was gitignored + keep-alive

- **Phase:** Pre-phase / bugfix + ops
- **Date:** 2026-07-28
- **Status:** ✅ Committed (historical)
- **Objective:** Per commit message: a page (`/resumes/build`) was accidentally excluded from git via `.gitignore` and was therefore missing in production; also added a keep-alive mechanism.
- **Business requirement / User requirement / Claude prompt used:** Needs verification
- **Architecture decisions:** Added `.github/workflows/keepalive.yml` (confirmed present) — pings the Render backend's `/health` every 10 minutes to counteract Render free-tier cold starts.
- **Files created:** `.github/workflows/keepalive.yml` (+26 lines, confirmed)
- **Files modified:** 3 others, total 622 insertions / 1 deletion (large insertion count consistent with un-ignoring and re-adding a previously-excluded page's files)
- **Database / API / AI / Auth changes:** none apparent
- **Tests / Build results:** Needs verification
- **Known issues:** This class of bug (a real page silently missing from production due to `.gitignore`) is worth remembering — see Known Issues in [ARCHITECTURE.md](ARCHITECTURE.md).
- **Remaining work:** none apparent
- **Rollback instructions:** `git revert e23b59d` (not tested; would reintroduce the gitignore bug)
- **Git commit/hash:** `e23b59d`

---

## Entry 9 — Forgiving role search + popular-roles fallback

- **Phase:** Pre-phase
- **Date:** 2026-07-28
- **Status:** ✅ Committed (historical)
- **Objective:** Per commit message and diff: make `backend/services/roles.py` role search more forgiving (fuzzy/partial match), add a popular-roles fallback when search finds nothing.
- **Business requirement / User requirement / Claude prompt used:** Needs verification
- **Architecture decisions:** None structural
- **Files created/modified:** 3 files, 63 insertions / 26 deletions; `backend/services/roles.py` (+25/-? lines, confirmed)
- **Database / API / AI / Auth changes:** none apparent
- **Tests / Build results:** Needs verification
- **Known issues / Remaining work:** Needs verification
- **Rollback instructions:** `git revert 7ab56cc` (not tested)
- **Git commit/hash:** `7ab56cc`

---

## Entry 10 — Marketing landing page, AI ATS engine (v1), expanded role library, brand refresh

- **Phase:** Pre-phase (this is the commit that first introduced `services/ats_engine`, which Phase 3 later extended — see [PHASE_3_ATS_INTELLIGENCE.md](PHASE_3_ATS_INTELLIGENCE.md))
- **Date:** 2026-08-04
- **Status:** ✅ Committed (historical)
- **Objective:** Per commit message: replace the placeholder homepage with a full multi-section marketing landing page; build an AI-driven ATS engine; expand `role_profiles` from 100 to 115 roles; apply the SahiCareer brand palette/fonts app-wide.
- **Business requirement / User requirement / Claude prompt used:** Needs verification (no transcript available for this commit)
- **Architecture decisions (confirmed from the diff):**
  - Created `backend/services/ats_engine/` as a new package: `__init__.py`, `ats_service.py`, `job_parser.py`, `keyword_engine.py`, `llm.py`, `recommendation_engine.py`, `resume_improver.py`, `resume_parser.py`, `similarity_service.py`, `text_metrics.py`. This became the canonical engine that Phase 3 (this session) later extended with `scoring.py` — see Entry 11.
  - `backend/services/ats_engine/llm.py` wraps **OpenAI only** (`OPENAI_API_KEY`, `chat_json`, `embed_text`) — confirmed by reading the current file. This is separate from `backend/services/ai.py`, which wraps **Gemini first, OpenAI second, static fallback third** for the rest of the app's AI features (resume upgrade, writer, etc.). See [PHASE_3_ATS_INTELLIGENCE.md](PHASE_3_ATS_INTELLIGENCE.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for the distinction.
  - New router `backend/routers/ats_engine.py` (this session's Phase 3 work modified, not created, this file).
  - `role_profiles` expanded 100 → 115 roles via `job_role_skills_database.csv` (migration 0005), with curated `recommended_certifications` per role — per commit message; row-count not independently re-verified against the live DB in this session (Needs verification if precision matters).
- **Files created:** `backend/services/ats_engine/*` (10 files), `backend/routers/ats_engine.py`, a landing-page component tree (`frontend/components/landing/*` — confirmed present today), `frontend/components/ats/PillList.tsx`, `frontend/components/ats/ScoreBar.tsx`
- **Files modified:** ~40 files across both frontend and backend (brand palette applied app-wide) — see `git show --stat 92050d6` for the full list
- **Files deleted:** none apparent
- **Database changes:** migration `0005_role_certifications.sql` (confirmed present, dated 2026-07-30 on disk — one day after this commit's date, so the migration file's filesystem timestamp and this commit's authorship date are slightly inconsistent; Needs verification of exact sequencing)
- **API changes:** New `/api/ats/v2/*` endpoints (`analyze`, `tailor`, etc. — the v1 shape, before Phase 3's persistence/history additions)
- **Frontend changes:** New public landing page at `/` (Hero, Services, Pricing, FAQ, Testimonials, etc.); rewritten `/ats-checker` dashboard (513 diff lines)
- **Backend changes:** As above
- **AI/LLM changes:** First introduction of OpenAI-backed semantic similarity (embeddings) and LLM-based resume/JD parsing for ATS, alongside the pre-existing Gemini-first `services/ai.py` used elsewhere
- **Authentication/security changes:** none apparent
- **Tests:** Needs verification — no `test_ats_engine.py` existed until this session (Entry 11); Phase 3's test suite specifically calls out that ATS engine coverage was zero before this session, corroborating that this commit shipped without dedicated tests
- **Build results:** Needs verification
- **Known issues:** This is the version of the ATS engine that computed one fixed 9-dimension weighted score with no Match/Completeness/Confidence separation and no persistence of detailed category breakdowns — see [PHASE_3_ATS_INTELLIGENCE.md](PHASE_3_ATS_INTELLIGENCE.md) for exactly what Phase 3 added on top of it.
- **Remaining work:** Became Phase 3's starting point (this session)
- **Rollback instructions:** `git revert 92050d6` (not tested; high conflict risk since Phase 3 builds directly on top of this commit's `ats_engine` package)
- **Git commit/hash:** `92050d6`

---

## Entry 11 — Branding + Phase 1 (Template Foundation) + Phase 2 (Five New Templates) + Phase 3 (ATS Intelligence)

- **Phase:** [PHASE_1_TEMPLATE_FOUNDATION.md](PHASE_1_TEMPLATE_FOUNDATION.md), [PHASE_2_RESUME_TEMPLATES.md](PHASE_2_RESUME_TEMPLATES.md), [PHASE_3_ATS_INTELLIGENCE.md](PHASE_3_ATS_INTELLIGENCE.md) (all three, one commit)
- **Date:** 2026-08-10 → 2026-08-11
- **Status:** ✅ Verified — committed, pushed to `main`, deployed to production (Render confirmed live; see Entry 12)
- **Objective:** (a) integrate the real SahiCareer logo across the UI; (b) make PDF/DOCX export honor the resume's actual `template_id` instead of always rendering one hardcoded design; (c) ship five new visually distinct resume templates; (d) replace the ATS engine's single fixed score with a transparent, dynamic Match/Completeness/Confidence model that never auto-zeroes missing data.
- **Business requirement:** Users need resumes that look different per template when downloaded (not just previewed), a wider template selection for different resume "types" (fresher, healthcare, academic, etc.), and an ATS score they can trust and understand — not a black-box number.
- **User requirement (paraphrased from the session's own prompts):**
  1. "use this sahicareer logo" (provided via a local file path)
  2. "Before making any changes, inspect my existing Resume Builder architecture… Do not modify anything yet" (10-point inspection request)
  3. "I want to resolve the critical export architecture issue… the selected template MUST be reflected in both PDF and DOCX downloads" (approved "Option B": per-template server-side builders grouped into reusable layout families — explicitly **not** headless-browser rendering, for AGPL/licensing and infra-cost reasons)
  4. "Now proceed to Phase 2: implement the FIVE new production-ready visual templates" (Tech Stack, Career Starter, Academic, Healthcare Pro, Global Professional — with detailed per-template section/ATS-safety briefs)
  5. "PHASE 3 — ATS INTELLIGENCE FINAL IMPLEMENTATION SCOPE… DO NOT build a new ATS system… Start with Step 1 and proceed through the complete Phase 3 implementation" (35-section spec: Match/Completeness/Confidence scoring, dynamic weight redistribution, never auto-zero missing data, persist detailed reports, ATS history, re-scan flow, extend the existing `/ats-checker` page, 13 explicit implementation steps)
- **Claude prompt used:** the five prompts above, verbatim intent preserved; full text is in the session transcript, not reproduced here in full to keep this log readable. **This is the one entry in this log backed by a complete, directly-observed conversation record rather than git-history inference.**
- **Architecture decisions:**
  - **Export architecture ("Option B"):** `shared/template-specs.json` as the single source of truth for template metadata, read by both `frontend/components/ResumeTemplates.tsx` and `backend/routers/export.py`. `template_id` resolution rule: if `resume_id` is present, the DB's `Resume.template_id` always wins (client-supplied `template_id` in the request body is ignored); if `resume_id` is absent (ephemeral/preview content), the client-supplied `template_id` is used but strictly validated (400 on unknown id) — see `backend/routers/export.py:1-30` docstring.
  - **`TEMPLATE_BUILDERS` registry, not 10 independent implementations:** the five original templates (Modern, Professional, Minimal, Creative, Executive) stay on the pre-existing "classic" builder (their design was explicitly left untouched); the five new templates share one parameterized "single-column" builder family, differentiated by a per-template config (`SINGLE_COLUMN_CONFIGS`: accent color, section labels, section order, skill grouping, certification emphasis) — confirmed directly in `backend/routers/export.py`.
  - **`preserve_original` (uploaded-resume "keep the original design") kept completely separate** from `template_id`-based rendering — the two concepts are never read together, per the router's own docstring.
  - **ATS engine consolidation:** `services/ats_engine/` confirmed as the sole canonical ATS implementation; the older `services/ats.py` was **frozen** (a large "LEGACY — FROZEN" docstring added, zero logic changes) rather than deleted, because three live frontend pages (`ai-upgrade`, the resume editor, `job-match`) still depend on its exact response shape.
  - **Match/Completeness/Confidence model:** three independent scores per category (not one blended number), with automatic weight redistribution across the other categories when one category can't be evaluated from the job description — explicitly never a silent zero for missing candidate data.
- **Files created:**
  - `shared/template-specs.json`
  - `frontend/components/templates/TechStackTemplate.tsx`, `FresherTemplate.tsx`, `AcademicTemplate.tsx`, `HealthcareTemplate.tsx`, `InternationalTemplate.tsx`
  - `backend/services/ats_engine/scoring.py`
  - `backend/tests/test_ats_engine.py`, `backend/tests/test_template_registry.py`, `backend/tests/test_new_templates.py`, `backend/tests/test_export_ats_safe.py` *(the last one's creation session is Needs verification — it may predate this session; its content is ATS-safety-focused and consistent with Phase 1/2 work)*
  - `frontend/components/Logo.tsx`, `frontend/public/logo-full.png`, `frontend/public/logo-icon.png`, `frontend/app/icon.png`
  - `supabase/migrations/0009_resume_design_preservation.sql`, `supabase/migrations/0010_ats_intelligence.sql`
  - `frontend/lib/authRedirect.ts` *(created this session for the mentee/mentor/admin post-login landing logic — this is the same file identified in Entry 13 as containing the Mentorly-redirect defect)*
- **Files modified (representative, not exhaustive — see `git show --stat fd39489`):** `backend/routers/export.py`, `backend/routers/ats_engine.py`, `backend/models.py` (`AtsReport` extended with 16 new columns), `backend/services/ats_engine/ats_service.py`, `backend/services/ats_engine/resume_parser.py`, `backend/services/ats.py` (docstring only), `frontend/app/ats-checker/page.tsx`, `frontend/components/AppShell.tsx`, `frontend/components/ResumeTemplates.tsx`, `frontend/app/templates/page.tsx`
- **Files deleted:** none
- **Database changes:**
  - Migration `0009_resume_design_preservation.sql` — Phase 1 (uploaded-resume design preservation)
  - Migration `0010_ats_intelligence.sql` — Phase 3; extends the existing `ats_reports` table additively (`target_role`, `analysis_mode`, `score_confidence`, `score_breakdown`, `category_scores`, `category_completeness`, `category_confidence`, `overall_confidence`, `critical_keywords`, `important_keywords`, `partial_matches`, `formatting_analysis`, `profile_completeness`, `recommendations`, `candidate_questions`, `analysis_version`), all nullable, plus an index on `(resume_id, created_at desc)`. Confirmed applied to the live Supabase project used by both local dev and production.
- **API changes:**
  - PDF/DOCX export (`/api/export/pdf`, `/api/export/docx`) now template-aware (previously always rendered one hardcoded design)
  - `POST /api/ats/v2/analyze-resume` — rewritten to persist a full detailed `AtsReport`, compute `score_delta`/`previous_score` against the prior report
  - `GET /api/ats/v2/history/{resume_id}` — new
  - `GET /api/ats/v2/report/{report_id}` — new
  - `POST /api/ats/v2/analyze` (paste-text path) — added `analysis_mode` field, usage-event renaming
- **Frontend changes:** template picker updated for 10 templates; `/ats-checker` extended (not replaced) with score confidence, "why this score" explanation, Profile Completeness panel, per-category Match/Completeness/Confidence cards, Keyword Analysis (Critical/Important/Optional), Skills Breakdown (matched/partial/missing — explicitly never claims JavaScript = TypeScript), Prioritized Recommendations, candidate questions, ATS History, and a re-scan "what changed since last scan" category-level diff.
- **Backend changes:** as above
- **AI/LLM changes:** no new provider integration — reused the existing `services/ats_engine/llm.py` (OpenAI `chat_json`/`embed_text`). Verified live that when OpenAI returned `429 Too Many Requests` repeatedly (a real, observed quota exhaustion during this session's E2E test), the ATS pipeline still completed with correct deterministic scores — it degraded, it did not fail.
- **Authentication/security changes:** none — reused `services/deps.py::get_current_user` throughout; explicit ownership checks added to the new `/history` and `/report` endpoints (404, not 403, on cross-user access, to avoid confirming a resume/report ID exists for another user).
- **Tests:**
  - `backend/tests/test_ats_engine.py` — 26 tests, all passing, including two spec-mandated named scenarios (an "M.Com only" education entry scored Match=100/Completeness≈100/Confidence=high against a "Bachelor's degree required" JD line; an experience entry with only a company name scored Match=None ("N/A")/Completeness≈25/Confidence=low) proving missing data is never auto-scored as zero.
  - `backend/tests/test_template_registry.py` — 12 tests
  - `backend/tests/test_new_templates.py` — 9 tests
  - `backend/tests/test_export_ats_safe.py` — 5 tests
  - Full regression suite: 139 passed, 2 pre-existing failures unrelated to this work (`test_signup_and_create_resume`, `test_ats_score` — both fail against a live Supabase network call, not against this session's changes), 1 known pytest-asyncio teardown-ordering flake (passes in isolation).
- **Build results:** `npx tsc --noEmit` clean; `npm run build` succeeded (58 routes).
- **Known issues:**
  - `frontend/lib/authRedirect.ts` (created in this entry) contains the defect documented in Entry 13 — its `roleLandingPath()` fallback sends every normal user to `/mentorship/dashboard` instead of `/dashboard`. This was not part of Phase 1/2/3's scope and was only discovered afterward.
  - Under sustained OpenAI rate-limiting, a single `/analyze-resume` call can take 40–90 seconds (SDK retry/backoff on ~8 chained API calls) rather than failing fast — functionally correct, not fast.
- **Remaining work:** see [PHASE_3_ATS_INTELLIGENCE.md](PHASE_3_ATS_INTELLIGENCE.md) "Known Limitations."
- **Rollback instructions:** `git revert fd39489` from `main` (not tested — would also revert Phase 1/2/3 and branding together, since they share this one commit; a partial rollback would require manually reverting individual files/hunks). Database migrations `0009`/`0010` are additive/nullable and do not need to be rolled back for the application to keep working even if the commit is reverted — they'd simply become unused columns.
- **Git commit/hash:** `fd39489` on `main` (merged fast-forward from branch `feature/ats-phase3-intelligence`, which was also pushed to `origin` and still exists)

---

## Entry 12 — Production deployment

- **Phase:** Operations (spans Phase 1/2/3)
- **Date:** 2026-08-11
- **Status:** ✅ Backend verified live. Frontend deploy **not independently confirmed** (no Vercel URL or CLI access available in-session).
- **Objective:** Ship commit `fd39489` to production.
- **Business requirement / User requirement:** "make all live"
- **Claude prompt used:** "make all live"
- **Architecture decisions:** None new — reused the existing deploy topology documented in `DEPLOYMENT.md` (Next.js → Vercel, FastAPI → Render, DB → Supabase, both auto-deploying from `main`).
- **Files created/modified/deleted:** none (deployment, not a code change)
- **Database changes:** none new — migration `0010` had already been applied to the shared Supabase project earlier in the same session
- **API changes:** none new beyond Entry 11
- **Frontend/Backend changes:** none new beyond Entry 11
- **AI/LLM changes:** none
- **Authentication/security changes:** none
- **Tests:** Live E2E probe against `https://resumeai-pro-api.onrender.com`:
  - `GET /api/ats/v2/history/<uuid>` returned `404 Not Found` before the push (route did not exist), and `403 Not authenticated` after (route now exists, and requires auth as expected) — confirmed within ~30–45 seconds of pushing.
  - `GET /openapi.json` on production confirmed listing `/api/ats/v2/analyze-resume`, `/api/ats/v2/history/{resume_id}`, `/api/ats/v2/report/{report_id}`.
- **Build results:** n/a (build already verified locally in Entry 11)
- **Known issues:** Frontend (Vercel) deploy success was **not verified** — the session had no Vercel URL or CLI credentials to check it directly. It should have auto-deployed per `DEPLOYMENT.md`, but this is an assumption, not a confirmed fact.
- **Remaining work:** Confirm the Vercel deploy manually (see `DEPLOYMENT.md` for how to find the project in the Vercel dashboard).
- **Rollback instructions:** Render/Vercel: redeploy the previous commit (`92050d6`) from their respective dashboards, or `git revert fd39489` and push (see Entry 11's rollback caveats).
- **Git commit/hash:** `fd39489` (no new commit for the deploy itself)

---

## Entry 13 — Phase 4 investigation: post-login redirect defect

- **Phase:** [PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md](PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md)
- **Date:** 2026-08-12
- **Status:** ✅ Root cause identified and verified by direct code inspection. Fix implemented same day — see Entry 14.
- **Objective:** Explain why every user is redirected to Mentorly (`/mentorship/dashboard`) immediately after login, instead of to the SahiCareer dashboard.
- **Business requirement:** "I want SahiCareer to be the main platform, not Mentorly."
- **User requirement:** Full desired login/redirect matrix supplied by the user (default login → `/dashboard`; deep-linked protected routes → return to the originally requested route after login; already-authenticated visit to `/auth/login` → `/dashboard`).
- **Claude prompt used:** "Act as a Senior Software Architect… Please inspect my existing project before making any changes… DO NOT MODIFY ANY FILES YET." (13-point inspection request)
- **Architecture decisions:** None made yet — inspection only, per explicit instruction.
- **Files created/modified/deleted:** none
- **Database / API / Frontend / Backend / AI / Auth changes:** none made
- **Root cause (confirmed by reading `frontend/lib/authRedirect.ts`):**
  ```ts
  export function roleLandingPath(user): string {
    if (user.role === 'admin') return '/admin/mentorship'
    if (user.mentor_status === 'approved') return '/mentorship/mentor/dashboard'
    return '/mentorship/dashboard'   // ← every plain user's fallback
  }
  ```
  This function is called identically from `/auth/login`, `/auth/signup`, and `/auth/callback` after a successful sign-in, wrapped in `takePostLoginRedirect(...)`. The deep-link mechanism itself (`setPostLoginRedirect`/`takePostLoginRedirect`, backed by `sessionStorage`, invoked from both `AppShell` and `MentorshipShell`'s route guards) already works correctly — a logged-out visit to a protected route already round-trips back to that same route after login. The only defect is the **fallback** value used when there is no pending deep link.
- **Tests:** none run (no code changed)
- **Build results:** n/a
- **Known issues:** As above — every plain user's default post-login destination is currently `/mentorship/dashboard`, not `/dashboard`. Additionally, an already-authenticated user visiting `/auth/login` directly is not redirected away (only `/` has that check today).
- **Remaining work:** Implemented same day — see Entry 14.
- **Rollback instructions:** n/a — nothing was changed
- **Git commit/hash:** none (no commit — investigation only)

---

## Entry 14 — Phase 4 implementation: SahiCareer landing page service navigation

- **Phase:** [PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md](PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md)
- **Date:** 2026-08-12
- **Status:** ✅ Implemented and verified by code trace + `tsc`/build. **Uncommitted** at time of writing (explicitly instructed not to commit).
- **Objective:** Implement the fix identified in Entry 13, plus make the public landing page's three service cards work correctly for logged-in and logged-out visitors, without rebuilding authentication or routing.
- **Business requirement:** Same as Entry 13 — SahiCareer, not Mentorly, must be the default post-login destination.
- **User requirement:** A detailed 18-section implementation spec (exact route matrix per service × auth state, explicit priority order — pending deep link > role-based path > `/dashboard` fallback — explicit "do not rebuild auth/routing," 15 named test flows, and an explicit instruction not to commit). Followed by a manual-testing correction: the landing page's "Explore Resume Builder" card should go to `/dashboard`, not `/resumes/build`.
- **Claude prompt used:** "PHASE 4 — FIX SAHICAREER LANDING PAGE SERVICE NAVIGATION… Implement this now." Then, after manual testing: "when i click explore resume builder it goes to here http://localhost:3000/resumes/build but i need to dashboard" (clarified via two follow-up questions, both answered "Recommended": card → `/dashboard`; logged-out deep link also lands on `/dashboard`).
- **Architecture decisions:** None new — reused the existing `setPostLoginRedirect`/`takePostLoginRedirect` (`sessionStorage`) mechanism and the existing `AppShell`/`MentorshipShell` guard pattern throughout; no new auth system, no new routing system, no middleware introduced.
- **Files created:** `frontend/components/services/ServiceCards.tsx` — a compact, reusable three-card grid for `/dashboard`, deliberately kept separate from the heavier, marketing-styled `frontend/components/landing/Services.tsx` rather than refactoring an already-working component.
- **Files modified:**
  - `frontend/lib/authRedirect.ts` — `roleLandingPath()`'s plain-user fallback: `/mentorship/dashboard` → `/dashboard`. Admin/approved-mentor branches unchanged.
  - `frontend/app/auth/login/page.tsx` — added an already-authenticated-visitor redirect (`router.replace(takePostLoginRedirect(roleLandingPath(user)))`, gated on `hasHydrated`, with a `return null` guard to avoid a form flash); changed the post-submit redirect from `router.push` to `router.replace`.
  - `frontend/app/page.tsx` — **removed** the `useEffect` that auto-redirected a logged-in visitor away from `/` to `/dashboard`. This was a direct blocker for the required test flows: a logged-in user must be able to open `/` and click a service card, which was impossible while `/` immediately navigated them away.
  - `frontend/app/dashboard/page.tsx` — auth guard rewritten to match the `AppShell`/`MentorshipShell` pattern (`hasHydrated` check, `setPostLoginRedirect(pathname)`, `router.replace`); added the new "Your services" `ServiceCards` section.
  - `frontend/app/resumes/build/page.tsx` — **a real bug found during verification, not anticipated in the plan.** This page had its own third, independent auth guard (`if (!user) router.push('/auth/login')`) that neither waited for `hasHydrated` nor called `setPostLoginRedirect` — a logged-out deep link to Resume Builder would have silently lost its destination. Fixed to match the same pattern used everywhere else.
  - `frontend/components/landing/Services.tsx` — "Explore Resume Builder" card's `href`: `/resumes/build` → `/dashboard` (the later, manually-tested correction described above). "Talk to AI Buddy" (`/copilot`) and "Find a Mentor" (`/mentorship`) were already correct and untouched throughout.
- **Files deleted:** none
- **Database / API / Backend / AI changes:** none — this phase is entirely frontend client-side routing logic.
- **Authentication/security changes:** none new — `isSafePath()` (rejects any path not starting with `/`, and rejects `//`) was already sufficient to block open-redirect payloads and was left unmodified; confirmed still correct, not re-implemented.
- **Frontend changes:** as listed above.
- **Tests:** all 15 required flows traced against the final code (each guard read directly, not assumed) rather than exercised in a live browser — **no browser-automation tool was available in this session** (confirmed absent via tool search), so this is explicitly not a claimed live E2E pass. An HTTP sanity check confirmed all six touched routes (`/`, `/auth/login`, `/dashboard`, `/resumes/build`, `/copilot`, `/mentorship`) render without a server error on a freshly rebuilt dev server. `npx tsc --noEmit` and `npm run build` both passed cleanly, run three times across the implementation (initial pass, after the `/resumes/build` fix, and after the `Services.tsx` href correction).
- **Build results:** `✓ Compiled successfully`, 58 routes, each time.
- **Known issues:**
  - A pre-existing, unmodified quirk in `setPostLoginRedirect`: it no-ops for `path === '/dashboard'` specifically (since `/dashboard` was already the eventual normal-user fallback when that guard was originally written). Net effect: an admin or approved mentor who deep-links to `/dashboard` itself while logged out lands on their own role page after login, not `/dashboard` — considered acceptable, not changed.
  - `npm run lint` on its own attempted an interactive first-run ESLint setup wizard in this shell environment and had to be aborted; `next build`'s own built-in lint/type-check pass (which did run to completion, cleanly, each time) was relied on instead.
- **Remaining work:** none identified. This entry documents the state after two rounds of user-driven correction (the initial 18-section spec, then the `/resumes/build` → `/dashboard` card-destination change) — both are reflected here and in [PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md](PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md), which was rewritten (not just appended to) to describe the final, implemented state rather than the original recommendation.
- **Rollback instructions:** revert the six modified files and delete `frontend/components/services/ServiceCards.tsx`. No commit exists to `git revert` — the working tree is uncommitted, per explicit instruction not to commit this work.
- **Git commit/hash:** none — uncommitted at time of writing, per explicit user instruction ("Do not create a Git commit").

---

## Entry 15 — Phase B: ATS Intelligence 2.0 scoring foundation

- **Phase:** [SAHICAREER_ATS_INTELLIGENCE_2.md](SAHICAREER_ATS_INTELLIGENCE_2.md) §§1–7 · [ATS_CHANGELOG.md](ATS_CHANGELOG.md) `2.0.0` (2026-08-13 entry)
- **Date:** 2026-08-13
- **Status:** ✅ Implemented and verified (56 new tests, full-suite regression clean). Uncommitted.
- **Objective:** Upgrade ATS scoring toward a production-grade, competitor-benchmarked (Enhancv/ResumeGyani/Zety-class) engine, starting with the scoring foundation only — a corrected keyword matcher, centralized weight config, parsing-quality and section-recognition engines, and a new dual-score (`ats_compatibility` + `job_match`) layer computed **in parallel** with the existing, untouched 7-category model. Explicit instruction: do not modify or risk the existing frozen scoring model.
- **Claude prompt used:** a 2-part spec — first an inspection-only pass with a report back, then "Proceed with Phase B, but use the following decisions: [21 numbered decisions]… STOP after Phase B. Do not proceed automatically to Phase C."
- **Key finding from inspection:** the existing keyword matcher (`keyword_engine.match_lists()`, `rapidfuzz.fuzz.token_set_ratio`) scores `"react"` vs `"react native"` as a **false 100.0% match** — verified empirically, not assumed. Fixing this in place would change the frozen model's tested behavior, so a new, parallel matcher (`keyword_aliases.py`) was built instead, using plain `fuzz.ratio` plus a curated ~20-entry alias table.
- **Files created:** `services/ats_engine/{ats_config.py, keyword_aliases.py, parsing_quality.py, section_recognizer.py, ats_intelligence_v2.py}`, `supabase/migrations/0011_ats_intelligence_2.sql`, `tests/test_ats_intelligence_v2.py` (56 tests), `docs/{ATS_PHASE_3_BACKUP.md, ATS_CHANGELOG.md}`.
- **Files modified:** `services/ats_engine/ats_service.py` (additive — new `ats_intelligence_v2`/`scoring_engine_version` keys on the existing response), `models.py` (`AtsReport.scoring_engine_version`, new `AtsChangeHistory` table — schema only, no writer yet this phase).
- **Database changes:** `ats_reports.scoring_engine_version` column; new `ats_change_history` table (unused until Phase D).
- **Tests:** 56 new (`test_ats_intelligence_v2.py`), all passing; full suite 199 passed, same 2 pre-existing unrelated failures + 1 known teardown flake as every prior session — no regression.
- **Known issues / remaining gaps at end of phase:** Resume Quality layer not implemented (always excluded); resume editor still on the legacy engine; no frontend surfacing of the new score; no anti-gaming detection yet; no benchmark dataset. All addressed or explicitly carried forward in Phase C/D.
- **Git commit/hash:** none — uncommitted.

---

## Entry 16 — Phase C: Resume Quality engine + Editor migration + AI optimization groundwork

- **Phase:** [SAHICAREER_ATS_INTELLIGENCE_2.md](SAHICAREER_ATS_INTELLIGENCE_2.md) §§2.4, 8 · [ATS_CHANGELOG.md](ATS_CHANGELOG.md) `2.0.0` (Phase C entry)
- **Date:** 2026-08-14
- **Status:** ✅ Implemented and verified (59 new tests, 3 real bugs caught and fixed pre-ship, full-suite regression clean). Uncommitted.
- **Objective:** Build the third scoring layer (Resume Quality — 12 JD-independent categories), migrate the Resume Editor's live ATS panel to the canonical v2 engine, and prepare (not build) the data groundwork for an AI apply loop. Explicit instruction: do not restart or rewrite Phase B; stop after Phase C.
- **Claude prompt used:** "PHASE C — SAHICAREER ATS INTELLIGENCE 2.0 RESUME QUALITY + EDITOR MIGRATION + AI OPTIMIZATION FOUNDATION… STOP after Phase C… Do not proceed to Phase D automatically."
- **Files created:** `services/ats_engine/resume_quality.py` (12 categories + question builder), `tests/test_phase_c_resume_quality.py` (59 tests), `docs/SAHICAREER_ATS_INTELLIGENCE_2.md`.
- **Files modified:** `services/ats_engine/ats_intelligence_v2.py` (added `compute_resume_quality_v2()`, `compute_full_analysis()` — a new entry point, `analyze_v2()` left byte-for-byte untouched — `build_editor_recommendations()`, `build_editor_questions()`, `build_debug_breakdown()`), `services/ats_engine/ats_config.py` (`QUALITY_WEIGHTS`, corrected from a spec that summed to 1.08 not 1.0), `routers/ats_engine.py` (new `POST /api/ats/v2/analyze-editor`), `frontend/app/resumes/[id]/edit/page.tsx` (migrated `analyzeContent()`/`scoreAts()` to the new endpoint; added a minimal 3-layer score display).
- **Bugs caught and fixed before shipping** (all via the test suite, before reaching a live response): (1) `build_editor_recommendations()` initially reused the OLD frozen keyword matcher for job-gap recommendations, which would have silently hidden the exact false-negative Phase B exists to fix — rewritten to read `job_match`'s own v2 category evidence directly; (2) quantified-impact detection required strict number/unit adjacency, missing natural phrasing like "500 monthly support tickets" — fixed with a two-part tight/loose detector; (3) credibility's date-overlap check flagged a job ending in year N and the next starting in year N as "overlapping" — fixed to require strict overlap, not a shared boundary year.
- **Tests:** 59 new (`test_phase_c_resume_quality.py`), all passing; full suite 258 passed, same 2 pre-existing unrelated failures + 1 known teardown flake — no regression. Live E2E confirmed the no-JD/JD-based response shapes and the recommendation-builder bug fix's real effect.
- **Known issues / remaining gaps at end of phase:** the apply/reparse/rescore loop (`ats_change_history` table still unused), anti-gaming detection, and the AI agent itself were all explicitly deferred to Phase D.
- **Git commit/hash:** none — uncommitted.

---

## Entry 17 — Phase D: AI ATS Agent — live optimization, apply/undo, score delta

- **Phase:** [SAHICAREER_ATS_INTELLIGENCE_2.md](SAHICAREER_ATS_INTELLIGENCE_2.md) §§10–11, 13 · [ATS_CHANGELOG.md](ATS_CHANGELOG.md) `2.0.0` (Phase D entry)
- **Date:** 2026-08-14
- **Status:** ✅ Implemented and verified — backend + a minimal editor UI, live-E2E-proven end to end. Uncommitted.
- **Objective:** Close the loop Phase C explicitly deferred: turn deterministic recommendations into addressable, user-approved actions that actually modify the resume, reparse it, recalculate the real score, record a delta, and support undo — with strict anti-fabrication, staleness/concurrency protection, and anti-gaming detection. Explicit instruction: do not rebuild the ATS architecture; stop after Phase D.
- **Claude prompt used:** "PHASE D — SAHICAREER ATS AI AGENT LIVE RESUME OPTIMIZATION + APPLY FIX + REPARSE + SCORE DELTA… STOP after Phase D. Do not automatically proceed to Phase E."
- **Files created:** `services/ats_engine/{anti_gaming.py, ai_recommendations.py, apply_fix.py}`, `supabase/migrations/0012_ats_intelligence_ai_agent.sql`, `tests/test_phase_d_ai_agent.py` (63 tests).
- **Files modified:** `models.py` (`AtsRecommendation` — new table; `AtsChangeHistory` — finalized column names/new columns), `services/ats_engine/ats_intelligence_v2.py` (`build_editor_recommendations()` now attaches `source_layer`/`source_category` directly), `routers/ats_engine.py` (7 new lifecycle endpoints + recommendation persistence wired into `analyze-editor`), `frontend/app/resumes/[id]/edit/page.tsx` (new "AI Fixes" tab — recommendation cards, answer/preview/apply/reject, Change History with Undo, inline score-delta banner).
- **Full detail (architecture, lifecycle, bugs caught and fixed, test results, live E2E, known limitations):** see [ATS_CHANGELOG.md](ATS_CHANGELOG.md)'s Phase D entry and [SAHICAREER_ATS_INTELLIGENCE_2.md](SAHICAREER_ATS_INTELLIGENCE_2.md) §11/§14 — not duplicated here to avoid drift between the two documents.
- **Tests:** 63 new; 50 pure-function tests pass locally; 13 DB-integration tests are correctly written (collected without error) but blocked by the local test Postgres being unreachable in this sandboxed session — the identical flows were proven correct via a live, manual E2E script against the real dev Supabase-backed backend (27/27 checks, re-run again after wiring the frontend UI). Full local suite: 308 passed / 15 failed / 1 error — the 15 failures are exactly the 13 environment-blocked DB tests plus the 2 pre-existing, unrelated `test_resumes.py` signup-flakiness failures (confirmed back to their original signatures); the 1 error is the already-known `test_template_registry.py` teardown flake. No new regression in any previously-passing test.
- **Self-inflicted bug found and fixed mid-phase:** an event-loop-corrupting test-authoring mistake (mixing `asyncio.run()` with `@pytest.mark.asyncio` in one file) was silently breaking unrelated, previously-passing test files run afterward in the same pytest session — caught, root-caused, and fixed by standardizing on `@pytest.mark.asyncio` throughout the file; confirmed resolved by the full-suite re-run.
- **Known issues / remaining gaps at end of phase:** no true row-level locking for the concurrency guard (documented, low real-world likelihood); apply/undo take ~2–13s (two full re-scores through the real engine, by design — estimated deltas were explicitly disallowed); no benchmark dataset yet (carried forward from Phase B); AI Fixes loop is Resume Editor-only, not surfaced on `/ats-checker`.
- **STOP instruction honored:** no Phase E work started; this entry and the final Phase D report conclude the phase, pending the user's explicit go-ahead.
- **Git commit/hash:** none — uncommitted.

---

## Entry 18 — Phase E: Benchmark dataset + calibration validation (no scoring changes)

- **Phase:** [SAHICAREER_ATS_INTELLIGENCE_2.md](SAHICAREER_ATS_INTELLIGENCE_2.md) §12 · [ATS_CHANGELOG.md](ATS_CHANGELOG.md) `2.0.0` (Phase E entry) · [ATS_BENCHMARK_REPORT.md](ATS_BENCHMARK_REPORT.md)
- **Date:** 2026-08-14
- **Status:** ✅ Implemented and verified — 69 new regression tests passing, zero production scoring changes. Uncommitted.
- **Objective:** Build a hand-labeled benchmark corpus and validate the v2 engine's detection against it (keyword matching, alias correctness, missing-data handling, weight redistribution, Resume Quality/Parsing Rate direction, anti-gaming) — explicitly NOT a competitor-score-matching exercise, and explicitly not permitted to change `ats_config.py`, scoring formulas, or `SCORING_ENGINE_VERSION` this phase.
- **Claude prompt used:** an initial "Phase E ← NEXT" roadmap heads-up (clarified via a question to "inspect first, propose a plan"), followed by three rounds of detailed specs: the corpus-scope/weight-policy/dataset-location decisions, a "REMAINING Phase E validation work only" continuation after a mid-stream interruption, and a final, extremely detailed 8-part spec (pytest suite with named hard-vs-informational categories, a 21-section report structure with mandatory evidence labels, explicit "competitor results NOT AVAILABLE, never estimated" instruction, and a "Calibration Candidates — No Production Changes Made" section format).
- **Key user decisions:** larger corpus (~30+ pairs, not a small starter set); any miscalibration found should be **flagged only**, not fixed this phase; dataset/runner live as Python fixtures + pytest (not JSON + a standalone script).
- **Files created:** `backend/tests/fixtures/benchmark_dataset.py` (12 resumes, 9 JDs, 36 pairs, 6 quality probes, 5 parsing probes, 6 anti-gaming probes, all hand-labeled), `backend/scripts/run_benchmark.py` (runs the dataset through the real engine, writes the 21-section report), `backend/tests/test_ats_benchmark.py` (69 tests).
- **Files modified:** `docs/SAHICAREER_ATS_INTELLIGENCE_2.md` (§12 PLANNED → IMPLEMENTED), `docs/ATS_CHANGELOG.md` (Phase E entry).
- **Bugs found and fixed — in the dataset, not the engine:** the first 36-pair run surfaced 3 keyword-label errors (three `swe_*` resumes hand-labeled as matching terms — "SQL," "Git," "REST APIs" — they never literally state; e.g. a resume listing "PostgreSQL" was wrongly assumed to also match generic "SQL," which the engine correctly does NOT treat as equivalent) and one parsing-baseline construction bug (the "clean" baseline text placed contact info at the very end, same as the anti-pattern probe it was supposed to contrast against, so the `contact_buried` differential test wasn't actually differential). All four were corrected in the dataset; none required an engine change.
- **Calibration candidate documented, not fixed:** Job Match may under-discriminate clearly keyword-mismatched candidates when a JD leaves `min_experience_years`/`min_education` unset (every JD in this dataset does) — MEDIUM confidence, INFERRED, not independently confirmed. Full writeup (finding/evidence/affected metric/possible cause/confidence/recommended action) in `docs/ATS_BENCHMARK_REPORT.md`. No `ats_config.py` change made.
- **Tests:** 69 new (`test_ats_benchmark.py`), all passing, explicitly split into hard invariants (true by construction — keyword false-positive safety, alias-correctness regressions, missing-data-never-zero, weight redistribution, score determinism, Resume Quality/Parsing Rate direction, anti-gaming) and informational metrics (keyword recall, band accuracy, adjacent-mismatch-ordering — floored generously against catastrophic regression only). Full suite: 377 passed (308 pre-Phase-E baseline + 69 new), 15 failed, 1 error — identical failure/error set to the pre-Phase-E baseline, zero new regressions.
- **Known issues / remaining gaps at end of phase:** competitor comparison remains explicitly NOT AVAILABLE (no Enhancv/ResumeGyani/Zety data exists or was collected); the one documented calibration candidate is unresolved by design (flagged for a future, separate, explicitly-scoped decision); the dataset's JDs uniformly lack explicit experience/education requirements, which is itself a limitation of this first-pass corpus, noted in the report.
- **STOP instruction honored:** no Phase F work started.
- **Git commit/hash:** none — uncommitted.

---

## How to keep this log accurate going forward

- Add one new entry per meaningful unit of work, in the same format, **before or immediately after** committing it — not reconstructed from memory weeks later.
- Always include the actual commit hash once it exists.
- If a fact isn't directly verifiable from the code, tests, or a saved conversation transcript, write `Needs verification` — do not infer or guess to fill in a template field.
- When a single commit spans multiple phase documents (as Entry 11 does), say so explicitly and cross-link both phase documents, rather than picking one arbitrarily.
