# ATS Case Study — Java Fresher DOCX Parsing Fix (Phase F3)

**Scope:** fixes ONLY the three confirmed document-parsing/structured-extraction bugs found while investigating `Java_Developer_Fresher_Resume.docx`, plus a presentation-only frontend labeling fix for the separately-flagged N/A-vs-100% UI confusion. **No ATS scoring weights, formulas, redistribution rules, confidence calculation, or `SCORING_ENGINE_VERSION` were changed.** `ats_config.py`, `scoring.py`, and `section_recognizer.py` are all untouched — confirmed via `git diff` (zero diff on all three).

`SCORING_ENGINE_VERSION` remains `"2.0.0"`.

---

## 1. Actual DOCX structure

`Java_Developer_Fresher_Resume.docx` (found on disk at `C:\Users\Ranjeet\Downloads\`), inspected directly via `python-docx`. 46 paragraphs, plain-text extraction (`paragraph.text`) shows 9 ALL-CAPS headings (`CAREER OBJECTIVE`, `EDUCATION`, `TECHNICAL SKILLS`, `ACADEMIC PROJECTS`, `INTERNSHIP EXPERIENCE`, `CERTIFICATIONS`, `ACHIEVEMENTS & EXTRACURRICULAR`, `DECLARATION`) and 17 bullet-shaped content paragraphs. Direct XML inspection (`paragraph._p.pPr.numPr`) confirmed **all 17 of those bullet paragraphs use Word's native bulleted-list formatting** (`style="List Paragraph"`, `numId=2`, `ilvl=0`) — none contain a literal `-`/`•`/`*` character in their extracted text at all.

## 2. Bug 1 — Internship Experience

**Confirmed root cause:** `resume_parser.py`'s `_SECTION_HEADING_ALIASES["experience"]` listed `experience`, `work experience`, `professional experience`, `employment history`, `career history`, `work history` — not `internship experience`, a genuinely common, legitimate variant. The heading fell through unrecognized, so the entire Internship block (dates, bullets) was silently dropped from `resume["experience"]`.

**Fix:** added `"internship experience"`, `"internships"`, `"internship"`, `"internship history"` as additional exact-match entries under the `"experience"` canonical key in `_SECTION_HEADING_ALIASES`. This is **still an exact-string match** against the enumerated alias list, same mechanism as every other entry — not a broadened/substring rule. Verified directly: a bullet that happens to mention the word "experience" inside a sentence is never treated as a heading (the exact-match lookup only fires against a line that, after lowercasing/stripping, equals one of the enumerated strings verbatim).

## 3. Bug 2 — Native Word bullets

**Confirmed root cause:** `python-docx`'s `paragraph.text` never includes the bullet/number glyph for Word-native list-formatted paragraphs — that formatting lives in the paragraph's numbering properties (`<w:numPr>` XML), not as literal text. `extract_text()`'s `.docx` branch previously just joined `paragraph.text` for every paragraph, so `_is_bullet_line()` (which checks literal string prefixes) never matched a single line in this document. This broke bullet-dependent logic everywhere: experience-bullet extraction, project-entry grouping (each sentence became its own fake "project"), the legacy formatting score's bullet count, and every Resume Quality category that reads `experience[].bullets`.

**Fix — `_is_docx_list_paragraph()`:** checks the paragraph's own XML directly via `paragraph._p.pPr.numPr` (the authoritative, python-docx-compatible signal for "is this a Word-native list item") — not style name alone, since Word's generic `"List Paragraph"` style is sometimes applied to non-list paragraphs in various templates too. A narrow style-name check (`"list bullet"` / `"list number"` exactly) is used only as a secondary signal.

**Fix — `_extract_docx_text()`:** for every paragraph flagged by the detector, prepends a literal `"• "` marker before it's joined into `raw_text` (skipped if the paragraph already starts with a literal bullet character, to avoid double-marking). This means **every existing downstream bullet consumer needs zero changes** — `_is_bullet_line()`, `text_metrics.formatting_score()`, and the experience/project section parsers all see exactly the kind of text they already know how to read.

**Also added, per the explicit "support literal bullet characters" requirement:** `_is_bullet_line()` and `_strip_bullet_marker()` now also recognize `●`, `▪`, and `–` (en dash) as literal bullet-line prefixes, in addition to the existing `-`, `•`, `*`.

**Verified NOT over-triggering:** a direct unit test (`test_native_word_bullets_are_detected_via_numpr`) confirms a plain paragraph in the same document as a real list item is correctly NOT flagged — the detector never treats every paragraph in a section as a bullet, only ones with real `numPr`.

## 4. Bug 3 — Achievements & Extracurricular contamination

**Confirmed root cause:** `"ACHIEVEMENTS & EXTRACURRICULAR"` contains `&`, which the Phase F2 unrecognized-heading section-boundary detector explicitly excludes (deliberately, to avoid false-positives on mixed-case content lines like `"Client Support & Communication"`). Since it wasn't treated as a boundary and wasn't a recognized alias either, the section pointer stayed on `"certifications"` (the previous recognized heading), and all 3 achievement lines bled into `resume["certifications"]`.

**Fix — NOT a change to the generic `&` rule.** Per the explicit instruction, the generic ALL-CAPS boundary detector (`_looks_like_unrecognized_section_boundary()`) is **untouched**. Instead, specific, enumerated heading variants were added to `_SECTION_HEADING_ALIASES["achievements"]`: `"achievements & extracurricular"`, `"achievements and extracurricular"`, `"extracurricular"`, `"achievements & activities"`, `"awards & achievements"`. These are matched via the **exact-alias-lookup branch** (the same one used for every other recognized heading), which doesn't care whether the string contains `&` — it's comparing the whole line against a specific known string, not doing generic pattern matching. A genuine content line like `"Client Support & Communication"` or `"Testing & QA"` will never equal one of these specific enumerated strings, so it's completely unaffected.

## 5. Before / after parser output

Real extraction, real production code, before vs. after this phase's three fixes (Phase F1/F2 fixes already applied in both columns — this isolates ONLY Bug 1/2/3):

| Field | Before (Phase F1/F2 only) | After (Phase F3) |
|---|---|---|
| `experience` entries | **0** | **1** |
| Experience bullets | 0 | **3** |
| `certifications` | 10 *(3 real + 7 contaminated: the achievements heading text + all 3 achievement lines)* | **3** *(only real certification lines)* |
| `achievements` | **0** | **3** |
| Top-level `bullets` | 0 | **3** |
| `projects` | 3 fake "projects" (one per sentence — no bullets to group them) | **3 real projects**, each with a correctly-combined multi-sentence `description` |
| Legacy formatting score | 67 (0 bullet lines found) | **87** (17 bullet lines found) |
| Profile Completeness (overall) | 50% | **81%** |
| Profile Completeness (experience) | 0% | **50%** |
| Profile Completeness (projects) | 33% | **67%** |
| Profile Completeness (achievements) | 0% | **100%** |

**Known, pre-existing, un-fixed limitation carried into this result (not part of Bug 1/2/3, already documented in `docs/ATS_PHASE_F2_FULL_JD_VALIDATION.md` §17):** the internship entry's title/company fields come out empty — `"Java Development Intern - Company Name, City\tJun 2024 - Aug 2024"` contains both the title AND the date range on one line, and the parser's date-priority classification consumes the whole line as `duration` rather than splitting the title out. The dates themselves ARE preserved (verified: `"Jun 2024"` and `"Aug 2024"` are both present in the `duration` string) — only the clean title/company split is affected, and this is the same, already-known bug from Phase F2, not a new one introduced here.

## 6. ATS impact

Real Java resume + a reconstructed "frontend developer" JD (the exact 24-keyword list AI-parsed in the user's own screenshot — reused verbatim here, not re-invented, to isolate the resume-parsing delta with the JD side held constant). Legacy engine:

| | Before (Bug 1/2/3 unfixed) | After (Phase F3) |
|---|---|---|
| Overall ATS score | 25 | **57** |
| Keyword Match | 17% (weight 83.3% → 50.0%) | 17% (weight 50.0%) — **unchanged match%, only its weight share dropped** |
| Skills Match | excluded (N/A) | excluded (N/A) — JD has no `required_skills` either way, unrelated to this fix |
| **Experience Match** | **excluded (N/A)** — "No work experience entries found" | **100%, weight 40.0%** — "Candidate has ... experience; the JD doesn't state a minimum" |
| Responsibility Match | excluded (N/A) | excluded (N/A) — this reconstructed JD has no `responsibilities` list either way |
| Education Match | excluded (N/A) | excluded (N/A) — JD states no education requirement either way |
| Certification Match | excluded (N/A) | excluded (N/A) — JD requires no certification either way |
| ATS Formatting | 67% (weight 16.7%) | **87%** (weight 10.0%) |
| v2 overall score | 34 | **55** |
| v2 `job_match` layer | 12 | **41** |
| v2 `resume_quality` layer | 40 | **60** |

**Exactly which newly-extracted evidence caused the change, per the explicit instruction to show this:**
1. **`experience` now has a real entry** (Bug 1) → the `experience` category flips from excluded to `applicable=True, match=100.0` and claims 40% of the redistributed weight — this alone is the single largest contributor to the +32-point overall-score jump. (100% because this reconstructed JD, matching what the user's own screenshot showed, states no explicit minimum-years requirement — a genuine, not fabricated, "nothing to fail against" match — not because 3 bullets alone constitute strong evidence of years of experience.)
2. **17 more bullets now detected** (Bug 2) → legacy formatting rises 67→87, and v2 `resume_quality` rises 40→60 (bullet-dependent categories like bullet quality / quantified impact / action verbs now have real bullets to evaluate instead of zero).
3. **Keyword Match's own percentage is unchanged (17%)** — it was never affected by any of these three bugs for this specific resume/JD pair, since keyword matching for this pair happens to be driven by raw-text substring search, which was already unaffected by the pre-fix structured-extraction gaps. Its *weight share* dropped only because `experience` became competing weight, per normal redistribution — the underlying keyword evidence itself did not change.
4. Skills/Responsibility/Education/Certification stayed excluded in both states — **for this specific reconstructed JD**, not because of any resume-side bug; that reconstructed JD (like the user's real "frontend developer" one-word JD) genuinely doesn't specify required skills, responsibilities, education, or certifications, so those categories are honestly excluded regardless of how well the resume itself is parsed.

**No score was targeted.** 57 and 55 are exactly what the unmodified `_redistribute_weights()`/`_redistribute()` formulas produce from the newly-correct structured data.

## 7. N/A vs 100% UI issue

**Investigated and confirmed as a genuine, real presentation-layer confusion — not a scoring bug.** Two structurally separate systems are both rendered on the ATS Checker page:

- **"Category Analysis"** (canonical) — reads `result.ats.category_analysis`, the Match/Completeness/Confidence model. Already correctly renders `N/A` for an excluded category (confirmed in the page's existing code — `applicable: false` categories show their `reason` text, not a fabricated percentage).
- **"Score Breakdown" / "Score Heatmap"** — reads `result.ats.scores`, a completely separate, older 9-dimension model (`services/ats_engine/ats_service.py`'s local `_experience_match()`/`_education_match()`/`_industry_match()` helpers, predating the Phase 3 category system). This model's `experience_match.pct` returns **100 unconditionally whenever the JD states no minimum-years requirement** — regardless of whether the resume has ANY experience data at all. It is not the same question as Category Analysis's N/A (which is about whether there's enough *resume-side* data to judge), and was never intended to be — but nothing in the UI ever said so, which is exactly the confusion the user (correctly) flagged.

**Fix applied — presentation only, `frontend/app/ats-checker/page.tsx`:**
- A caption above the Score Breakdown/Heatmap panels now explicitly states these are "Supplementary / legacy metrics," explains that a 100% there means "the job description stated no requirement for it at all," and explicitly says this is **not** the same thing as Category Analysis's N/A.
- Both section headers now carry a small `(legacy, supplementary)` tag.
- The canonical "Overall ATS Score" gauge now carries a small "Canonical score" caption pointing at Category Analysis as its explanation.

**No scoring methodology was changed** — `result.ats.scores` and `result.ats.category_analysis` are computed exactly as before; only the labeling around them changed. Verified: `npx tsc --noEmit` passes with zero errors; `npm run build` completes successfully (`/ats-checker` route compiles at 9.09 kB, no new warnings).

**A separate, minor, related cosmetic bug was noticed but NOT fixed** (out of scope — not what was asked): the "Weights redistributed across: ..." line under "Why this score?" uses `SCORE_LABELS[k] || k`, where `SCORE_LABELS` is keyed by the LEGACY model's suffixed keys (`keyword_match`, `experience_match`, ...) but `k` here actually comes from `category_analysis`'s unsuffixed keys (`keyword`, `experience`, ...) — so it silently falls back to rendering the raw key name instead of a human label. Flagged for a future, separately-scoped fix; not touched here.

## 8. Local vs. live deployment status

**Investigated directly, not assumed.**

- **Local code state:** `git log` shows the most recent commit as `fd39489` ("Phase 3 ATS Intelligence..."). `git status` shows `backend/services/ats_engine/resume_parser.py` as **modified but uncommitted** (all of Phase F1, F2, and F3's fixes exist only as uncommitted local working-tree changes in this session). `frontend/app/ats-checker/page.tsx` is likewise uncommitted.
- **Therefore, definitively — not merely inferred from behavior:** none of these fixes have been committed, and a repo has a configured `origin` remote (`github.com/iksula-123/resumeAI.git`) that any real deployment would need to pull from. Code that has never been committed cannot be present in any deployment built from that repository, regardless of deployment cadence or caching.
- **Behavioral corroboration:** this investigation's local test of the real Java resume (Phase-F1/F2-only state, i.e., BEFORE this phase's fixes) produced `skills: 29`, `certifications: 10` (contaminated but non-zero), `education: 1`, Profile Completeness `education=67%, skills=100%, certifications=100%`. The user's screenshot showed Profile Completeness at **0% across every single field, including skills and certifications**. That specific combination (skills=0% AND certifications=0%) is not reproducible by ANY state of the current codebase after Phase F1 — it is uniquely consistent with the ORIGINAL, pre-Phase-F1 `_heuristic_parse()`, which is the only version that hardcoded `skills`/`certifications`/`education` all empty unconditionally.
- **Conclusion:** the live/deployed environment the user tested against is running code at or before commit `fd39489`, predating Phase F1 entirely. None of Phase F1, F2, or F3's fixes are live anywhere yet — they exist only in this local working tree.

## 9. Tests

```
backend/tests/test_java_fresher_docx_regression.py                    16 passed  (new — all 15 requested checks + 1 diagnostic summary)
```
Combined with every other Phase F file + core ATS suites:
```
test_java_fresher_docx_regression.py + test_ats_case_study_pooja_regression.py +
test_pooja_pdf_formatting_regression.py + test_ats_score_discrepancy_regression.py +
test_ats_engine.py + test_ats_intelligence_v2.py + test_phase_c_resume_quality.py +
test_ats_benchmark.py                                                  270 passed, 0 failed
```
Full backend suite:
```
433 passed, 15 failed, 1 error
```
Identical (by name) to the pre-existing documented baseline (13 Phase D DB-connectivity failures, 2 Supabase-signup-flakiness failures, 1 teardown flake) **plus exactly 16 more passing tests** (417 → 433, this phase's new file). **Zero new regressions** — confirmed on a clean, isolated re-run after fixing a real but separate issue caught along the way (see below).

**Test-infrastructure issue found and fixed during this phase (not a production bug):** the new test file's initial `_sync()` helper used bare `asyncio.run()`, which explicitly clears the process's "current event loop" on exit — when run ahead of `test_phase_d_ai_agent.py`/`test_resumes.py`/`test_template_registry.py` in the same full-suite session, this corrupted the session-scoped `event_loop` fixture those DB-backed async tests depend on, producing 14 extra, spurious "no current event loop" failures with no connection to this phase's actual logic (confirmed by reproducing and then eliminating them in isolation). Fixed by using a private `asyncio.new_event_loop()` + `run_until_complete()` instead, which never touches the process-global "current loop" state. Frontend: `npx tsc --noEmit` — 0 errors; `npm run build` — succeeds.

## 10. Remaining issues

1. **Title+embedded-date line still misclassified** (§5) — same pre-existing bug documented in `docs/ATS_PHASE_F2_FULL_JD_VALIDATION.md` §17, now also confirmed to affect this resume's internship entry. Not part of this phase's named scope (Bug 1/2/3 only); not fixed here.
2. **`section_recognizer.py`'s own alias table remains separately unaware of "Internship Experience" / "Achievements & Extracurricular"** — this phase's fixes are entirely inside `resume_parser.py`'s own, intentionally-decoupled alias table (used for structured data extraction). The v2 "Section Recognition" CATEGORY score (a different, separate signal feeding `ats_compatibility`) still shows `experience` as a missing core section for this resume, since `section_recognizer.py` was explicitly out of scope this phase too. Structured extraction (experience entries, achievements, certifications) is now correct; the v2 Section Recognition score for this specific resume is not yet — a continuation of the same alias-table-divergence pattern first noted in Phase F1/F2.
3. **`SCORE_LABELS` key-mismatch cosmetic bug** (§7) — noticed, not fixed, out of scope.
4. **DOCX list-item nesting (`ilvl` > 0) is not specially handled** — this resume's lists are all flat (`ilvl=0`); a nested sub-bullet would still be detected as *a* bullet (any `numPr` presence triggers the marker), just without reflecting its nesting level in any way. Not a regression (there was no nesting-awareness before either), noted for completeness only.
5. **DOC (legacy binary `.doc`) files are unaffected by this fix** — `extract_text()` has no dedicated `.doc` branch (falls through to best-effort `.txt` decode), unchanged and out of scope.

---

## STOP

Per the explicit instruction, this phase stops here. No production scoring code (`ats_config.py`, `scoring.py`, `section_recognizer.py`) was touched; `SCORING_ENGINE_VERSION` remains `2.0.0`. Competitor calibration was not started, and no score was targeted at any particular value.
