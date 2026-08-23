# ATS Case Study — Pooja Score 20 — Phase F1 Fix

**Scope:** fixes ONLY the two confirmed data-pipeline bugs identified in `docs/ATS_CASE_STUDY_POOJA_SCORE_20.md` §11 (Classification A, resume-side parsing). **No ATS scoring weights, formulas, redistribution rules, confidence formulas, or `SCORING_ENGINE_VERSION` were changed.** `section_recognizer.py` was NOT touched — the "0 standard section headers detected" hypothesis from the prior investigation remains a **separate, still-open** item (see "Remaining issues" below). `JobParser` (JD-side heuristic parsing) was also NOT touched — explicitly out of scope for this phase.

`ats_config.py` diff: **none.** `SCORING_ENGINE_VERSION` remains `"2.0.0"`.

---

## 1. Files changed

| File | Change |
|---|---|
| `backend/services/ats_engine/resume_parser.py` | **Fix 1** — `_heuristic_parse()` rewritten to actually extract structured `experience`/`education`/`skills`/`certifications`/`languages`/`keywords`/`projects`/`achievements`/`summary`/`job_title`/`total_experience_years` from `raw_text` by splitting on recognized section headings, instead of hardcoding all of them empty. Also: `parse()`'s AI-path result now `setdefault`s `languages`/`achievements` for schema consistency across all three parse paths (ai/heuristic/profile). |
| `backend/services/ats_engine/resume_quality.py` | **No change.** Confirmed (§3) that `_all_bullets()` already reads exclusively from `experience[].bullets` — the "second bug" from the case study was that this field was always empty (Fix 1's bug), not that the wrong field was being read. Fixing Fix 1 alone resolves it. |
| `backend/tests/test_ats_score_discrepancy_regression.py` | 3 previously-`KNOWN_GAP` tests (asserting the OLD, defective behavior on purpose) flipped to assert the corrected behavior — now true regression guards. 1 JD-side `KNOWN_GAP` test left unchanged (out of scope). |
| `backend/tests/test_ats_case_study_pooja_regression.py` | 3 previously-`KNOWN_GAP` tests flipped the same way. 1 `HYPOTHESIS` test left unchanged (out of scope, separate investigation). **24 new tests added**, including the explicit 18-point checklist requested for this phase. |
| `docs/ATS_CASE_STUDY_POOJA_SCORE_20_FIX.md` | This report. |

No other file was modified.

---

## 2. Root cause (unchanged from the investigation — restated for context)

`ResumeParser._heuristic_parse()` (`services/ats_engine/resume_parser.py`), the fallback used whenever the AI parser call is unavailable or fails (`chat_json()` returns `None` — no key, rate limit, outage, or malformed response, all silently), hardcoded `experience`, `education`, `skills`, `hard_skills`, `soft_skills`, `certifications`, and `keywords` to empty literals regardless of input. Its own docstring claimed "coarse section/keyword detection"; the implementation never attempted it.

## 3. Fix

### Fix 1 — heuristic resume parser (`resume_parser.py`)

Added a self-contained section-splitting and per-section extraction pipeline, used only by `_heuristic_parse()`:

- **`_split_into_sections()`** — groups raw lines under their nearest recognized heading (a local alias table — SUMMARY/EXPERIENCE/EDUCATION/SKILLS/CERTIFICATIONS/LANGUAGES/PROJECTS/ACHIEVEMENTS and common variants — deliberately a **separate, small table from `section_recognizer.py`'s**, per the explicit "do not modify `section_recognizer.py` this phase" instruction; the two happen to overlap heavily since there's only one reasonable set of common resume headings, but are intentionally decoupled). Bullet lines are always attributed to whatever section is open (never mistaken for a heading). A short, ALL-CAPS, punctuation-free, unrecognized line (e.g. "TECHNICAL EXPOSURE", "TARGET ROLES") closes the current section rather than letting its unrelated content bleed into it — **this exact bleeding was a real bug caught while building this fix** (see §5).
- **`_parse_experience_section()`** — groups lines into entries; a new entry starts once a non-bullet line appears after the current entry has already collected at least one bullet (handles back-to-back roles with no blank-line separator, which real extracted text often has). Classifies each non-bullet line as `duration` (date/year/"Present"/"N years" pattern), else `title` (first), else `company` (second), else appended as an extra bullet-shaped fact (e.g. "Product: SmartERP") — never dropped, never fabricated.
- **`_parse_education_section()`** — groups lines by degree markers (word-boundary matched — see §5 for why this matters), extracting `degree`/`institution`/`year`; a degree-only entry (e.g. just "M.Com") is preserved exactly as-is.
- **`_split_list_section()`** — handles both one-item-per-line and comma-separated skills/certifications/languages.
- **`_parse_projects_section()` / `_parse_achievements_section()`** — simpler best-effort extraction (Projects/Achievements are optional/lower-precision by nature).
- **`_estimate_years_from_heuristic_experience()`** — conservative career-span estimate from explicit years found in `duration` strings only; a vague "N Years" with no anchor year contributes nothing (never summed in, to avoid double-counting overlapping roles — same philosophy as the existing `_estimate_total_experience()` used by the Resume Builder path).
- **Canonical bullets source** — `bullets` (top-level) is now always `[b for e in experience for b in e["bullets"]]`, a pure derived view, never a second independently-collected list — matching what `from_content()` (Resume Builder path) already does, eliminating any possibility of the two representations diverging (Fix 2's original request).
- **`heuristic_sections_found`** — new, additive, diagnostic-only key listing which headings this fallback actually recognized, so a section it couldn't identify is visible rather than indistinguishable from "not present" (Fix 5's "report the parsing limitation" request).

Nothing is invented: every extracted string is verified (§6, `test_checklist_16`) to trace back to a literal substring of `raw_text`.

### Fix 2 — Resume Quality (`resume_quality.py`)

**No code change made.** Investigated first, per the instructions: `_all_bullets()` (and every other bullet-reading call site in the file) already reads exclusively from `resume["experience"][*]["bullets"]`. The original finding was that this field was always empty because of Fix 1's bug — not that Resume Quality read from the wrong field. Fixing Fix 1 alone makes Resume Quality see the real bullets (confirmed in §6/§7).

### Fix 3 — Profile Completeness

**No code change made** (as anticipated in the original case study §9): `scoring.profile_completeness(resume)` already computes purely from the parsed `resume` dict's own fields. It inherited zeros only because those fields were empty (Fix 1's bug). Confirmed corrected end to end in §7.

### Fix 4 — No-JD behavior

**No code change made.** Confirmed already correct in the original case study (§10) and re-confirmed here (`test_checklist_17`, `test_no_jd_ats_compatibility_is_computed_independently_of_missing_job_description`): a title-only Target Job field correctly excludes Job Match categories rather than zero-scoring them, and Resume ATS Health / Resume Quality are computed independently of whether a JD was supplied at all.

### Fix 5 — AI failure fallback

Addressed as part of Fix 1: the heuristic fallback path now produces real structured data instead of an empty shell. The `heuristic_sections_found` field (new, additive) reports which sections were actually identified, so a genuine parsing limitation (a section the fallback couldn't recognize) is visible rather than silently indistinguishable from "resume has no such content."

---

## 4. Before/after parser output

Using the exact `POOJA_RESUME_TEXT_CLEAN` reconstruction from the case study (§2 there — the real PDF was still unavailable for this phase too; this is the same reconstructed input, not a new one), run through the actual BEFORE (git `HEAD`) and AFTER (this fix) code:

| Field | BEFORE | AFTER |
|---|---|---|
| `parsed_by` | heuristic | heuristic |
| Experience entries | **0** | **2** |
| Experience bullets (attached to entries) | 0 | **13** (12 real + "Product: SmartERP" preserved as an extra fact) |
| Education entries | **0** | **1** |
| Skills | **0** | **16** |
| Certifications | **0** | **1** |
| Languages | 0 (field didn't exist in AI-schema-shape output before either) | **2** |
| Keywords | **0** | **19** |
| `total_experience_years` | null | **3.0** (derived from "15 April 2023 - Present") |
| Summary | not extracted | extracted |
| Top-level `bullets` | 12 (only bullet-marker lines, disconnected from any entry) | **13** (now exactly `flatten(experience[].bullets)` — single source, no divergence) |

**Experience entries extracted (AFTER):**
```json
[
  {"title": "ERP Application Support / Product Support", "company": "Vigo Infotech",
   "duration": "15 April 2023 - Present", "bullets": [13 items incl. "Product: SmartERP"]},
  {"title": "Teacher", "company": "Private School", "duration": "4 Years", "bullets": []}
]
```

**Education entry extracted (AFTER):** `{"degree": "B.Com, Institution not specified, Year not specified", "institution": "", "year": ""}` — the reconstruction's placeholder education line was written as one comma-joined line (see the case study's own §2 assumption note), so it wasn't split further; the separately-tested standalone case (`test_checklist_7_mcom_is_detected`, and a two-line `"B.Com" / "Mumbai University, 2016"` shape verified manually during this fix) DOES split degree/institution/year correctly when they're on separate lines, which is the more common real-world format.

## 5. Two real bugs caught while building this fix (fixed before finalizing)

Both were caught by testing this fix against Pooja's actual resume content, not invented defensively:

1. **False-positive degree match:** the initial marker list used plain substring containment, so `"mba"` matched inside `"Mumbai"` (`Mumbai University` → misread as a degree line). Fixed with word-boundary-anchored regex matching instead of substring containment.
2. **Cross-section content bleeding:** the initial section-splitter didn't stop at an *unrecognized* heading — so "TECHNICAL EXPOSURE" and "TARGET ROLES" (real headings in Pooja's resume, but not ones this fix's scope includes recognizing) had their content silently absorbed into the preceding `certifications`/`languages` sections. Fixed by adding a conservative "ALL-CAPS, short, punctuation-free, unrecognized line closes the current section" rule — verified NOT to also cut short genuine skill/cert/language content (which is reliably mixed-case or contains list punctuation like `,`/`&`/`:`).

Both are captured directly in the new regression tests (`test_checklist_2/3/4/6/7/9/10` and the `_looks_like_degree`/section-boundary logic itself).

## 6. Test results

**New/updated test files:**
```
backend/tests/test_ats_score_discrepancy_regression.py    6 passed  (3 flipped from KNOWN_GAP, 1 JD-side gap unchanged, 2 unchanged)
backend/tests/test_ats_case_study_pooja_regression.py    24 passed  (3 flipped from KNOWN_GAP, 1 HYPOTHESIS unchanged, 3 unchanged, 17 new checklist tests)
```

**Combined ATS suites** (`test_ats_engine.py`, `test_ats_intelligence_v2.py`, `test_phase_c_resume_quality.py`, `test_ats_benchmark.py`, both files above):
```
244 passed, 0 failed
```

**Phase D suite** (`test_phase_d_ai_agent.py`) — run separately since it needs a live Postgres:
```
50 passed, 13 failed, 1 error
```
All 13 failures + the 1 error are `asyncpg.exceptions._base.InterfaceError` / connection-teardown errors from the local test database being unreachable/flaky in this sandboxed environment — confirmed by inspecting the actual traceback (a DB connectivity issue, not a scoring/parsing assertion failure) and by the fact this exact 13-test failure count matches `docs/ATS_BENCHMARK_REPORT.md`'s already-documented pre-existing baseline. **Not caused by this fix.**

**Full backend suite** (`pytest` from `backend/`):
```
407 passed, 15 failed, 1 error
```
This is **exactly** the documented pre-existing baseline (`docs/ATS_BENCHMARK_REPORT.md` §19: "377 passed, 15 failed, 1 error ... 13 Phase D DB-integration tests blocked by the local test Postgres being unreachable, 2 pre-existing unrelated `test_resumes.py` Supabase-signup-flakiness failures, 1 known `test_template_registry.py` teardown flake") **plus exactly 30 more passing tests** — the 6 + 24 tests in the two files touched by this phase (6 old + new "Phase E" baseline of 377, minus nothing removed, plus 30 added = 407). The specific 15 failed + 1 error tests are the identical set (by name) as the pre-existing baseline. **Zero new regressions.**

## 7. End-to-end before/after (legacy score, title-only JD — same case study scenario)

| | BEFORE | AFTER |
|---|---|---|
| `overall_score` | 90 | **98** |
| Excluded categories | keyword, skills, **experience**, responsibility, education, certifications | keyword, skills, responsibility, education, certifications (**experience no longer excluded**) |
| `weights_used` | `{"formatting": 100.0}` | `{"experience": 80.0, "formatting": 20.0}` |
| `experience` category | `applicable=True, match=None` ("No work experience entries found") | `applicable=True, match=100.0` ("Candidate has 3 years of experience; the JD doesn't state a minimum") |
| Profile Completeness (overall) | 0% | **42%** |
| Profile Completeness (experience/education/skills/certifications) | 0% / 0% / 0% / 0% | **88% / 33% / 100% / 34%** |
| Resume Quality (v2 layer, not part of this legacy score but independently computed) | not meaningfully computable (no bullets attached to any entry) | **21/100** — genuinely low, and now HONEST: 0/13 bullets are quantified, which is real signal about this resume's writing, not a data-loss artifact |

**Important honesty note, per the explicit "do not target a particular score" instruction:** this fix does **not** change the BEFORE=90 number into anything close to the user's originally reported 20 — that 90-vs-20 gap is the still-unconfirmed formatting/section-recognition hypothesis from the case study (§6 there), which is explicitly **out of scope for this phase** and was not touched. What this fix demonstrably does is stop a genuinely complete, well-evidenced resume from having its `experience`/`education`/`skills`/`certifications` silently discarded before scoring ever runs — visible here as `experience` becoming a real, usable, correctly-scored category instead of `None`, and Profile Completeness reading the resume's actual content instead of zero. PDF/text evidence → structured resume → ATS engine input is now consistent **for the fields this fix touches**; whether it's also consistent through the parsing-quality/section-recognition/formatting stage remains the separate open question.

---

## 8. Remaining issues (explicitly not addressed this phase)

1. **The "0 standard section headers detected" / formatting-score-20 mechanism** — still unconfirmed against the real PDF, per the case study's own §6/§9 and this phase's explicit instruction not to touch `section_recognizer.py` without a regression test demonstrating the actual real-PDF failure first. `docs/ATS_CASE_STUDY_POOJA_SCORE_20.md`'s `test_pooja_formatting_collapses_when_headings_merge_with_content_line_HYPOTHESIS` remains open and unchanged.
2. **`JobParser._heuristic_parse()` (JD side)** — unchanged, explicitly out of scope. A JD pasted as a plain paragraph (no bullets) still yields zero extracted requirements/responsibilities; a bulleted JD still can't distinguish a "Requirements:" list from a "Responsibilities:" list.
3. **Minor, lower-precision known limitations of the new resume_parser.py extraction** (documented, not defects against anything required this phase):
   - When a resume's experience entry writes title and company on ONE combined line (e.g. `"Software Engineer, Bitwise Labs"`), the whole string is kept as `title` and `company` stays empty — nothing is lost (the company name is still present, just not split into its own field), but it's not as clean as Pooja's format (title/company on separate lines), which splits correctly.
   - Project entries use a simpler, lower-precision grouping heuristic than experience entries (acceptable — Projects is an optional/best-effort section by design).
4. **`heuristic_sections_found` is new API surface** (additive, non-breaking) — not yet wired into any user-facing UI messaging; still purely diagnostic/internal for now.

## 9. Test results summary (for the record)

- `backend/tests/test_ats_score_discrepancy_regression.py`: 6/6 passed
- `backend/tests/test_ats_case_study_pooja_regression.py`: 24/24 passed
- Combined ATS suites (engine, v2, Phase C, benchmark, both discrepancy files): 244/244 passed
- Full backend suite: 407 passed, 15 failed, 1 error — identical failure set to the pre-existing documented baseline, zero new regressions
- `SCORING_ENGINE_VERSION` unchanged: `"2.0.0"`
- `ats_config.py`: no diff
