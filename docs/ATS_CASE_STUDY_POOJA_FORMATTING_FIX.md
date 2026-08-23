# ATS Case Study — Pooja Formatting Fix (Phase F2)

**Scope:** investigates and fixes ONLY the remaining "ATS Formatting = 20% / 0 standard section headers detected" issue, against the **actual real uploaded PDF** (found on disk, not reconstructed). **No ATS scoring weights, formulas, redistribution rules, or `SCORING_ENGINE_VERSION` were changed.** `section_recognizer.py` was **not modified** — the root cause and fix both live in extraction-time text normalization (`resume_parser.py`), per the evidence gathered below.

`ats_config.py` diff: **none.** `SCORING_ENGINE_VERSION` remains `"2.0.0"`.

---

## 1. Actual PDF extraction

The real PDF was located on disk: **`C:\Users\Ranjeet\Downloads\Pooja Ranjeet Yadav (1).pdf`** (57,010 bytes). Identified as the file used for the original report by direct content comparison — it's the only one of five "Pooja"-named files in that folder whose 8 section headings (SUMMARY/EDUCATION/EXPERIENCE/TECHNICAL SKILLS/CERTIFICATIONS/TECHNICAL EXPOSURE/LANGUAGES/TARGET ROLES) and verbatim bullet/skill/certification content match `docs/ATS_CASE_STUDY_POOJA_SCORE_20.md`'s description exactly (the other four "AI Upgraded" files only have 4 sections with AI-rewritten wording).

Full raw-extraction diagnostic (character/line counts, every heading found, whitespace/control-character/zero-width/repeated-character/page-break checks, all performed on the unmodified extraction): **`docs/ATS_POOJA_RAW_EXTRACTION.md`**.

**Headline finding:** every section heading — and the candidate's own name — extracts with a space inserted between every individual letter:

```
S U M M A R Y
E D U C A T I O N
E X P E R I E N C E
T E C H N I C A L  S K I L L S
C E R T I F I C A T I O N S
T E C H N I C A L  E X P O S U R E
L A N G U A G E S
T A R G E T  R O L E S
```

## 2. Root cause

`pypdf.PdfReader.extract_text()` reconstructs words from glyph positions and inserts a space wherever the gap between two adjacent glyphs is wide enough to look like a word boundary. This resume's headings (and name) are styled with wide letter-spacing/tracking — a common resume-heading typographic choice — so the actual on-page gap between adjacent letters is close to or exceeds the same gap pypdf expects between separate words. The result: `"EXPERIENCE"` extracts as `"E X P E R I E N C E"`.

This breaks BOTH downstream heading detectors, independently, for the same underlying reason:
- `section_recognizer.py`'s alias lookup requires an exact string match (`"e x p e r i e n c e"` is not `"experience"`) — and separately, `_looks_like_heading()`'s `≤6 words` check also rejects it (10 single-letter "words").
- The legacy `text_metrics.formatting_score()`'s header check does a substring test (`"experience" in line`) — `"experience"` (no spaces) is not a substring of `"e x p e r i e n c e"` (with spaces).

**Classification: A — PDF EXTRACTION.** The extraction call itself isn't misconfigured (pypdf is accurately reporting real glyph positions); the fix belongs in a normalization step applied to the extracted text, once, benefiting every downstream consumer (`section_recognizer.py`, `text_metrics.py`, `parsing_quality.py`, and the AI/heuristic parsers) uniformly — which is exactly why `section_recognizer.py` did not need to change.

## 3. Evidence (Step 2 — heading-by-heading debug)

| Heading text | Normalized | In alias table? | `_looks_like_heading()`? | Recognized? | Reason |
|---|---|---|---|---|---|
| `S U M M A R Y` | `s u m m a r y` | No | No (7 "words") | ❌ | normalized text not in `ALL_VARIANTS`; also fails the ≤6-word heading-shape check |
| `E D U C A T I O N` | `e d u c a t i o n` | No | No (9 "words") | ❌ | same |
| `E X P E R I E N C E` | `e x p e r i e n c e` | No | No (10 "words") | ❌ | same |
| `T E C H N I C A L  S K I L L S` | `t e c h n i c a l  s k i l l s` | No | No (15 "words") | ❌ | same |
| `C E R T I F I C A T I O N S` | `c e r t i f i c a t i o n s` | No | No (14 "words") | ❌ | same |
| `T E C H N I C A L  E X P O S U R E` | (spaced) | No | No | ❌ | same (also: "technical exposure" isn't in `SECTION_VARIANTS` at all — separate, pre-existing, out-of-scope gap) |
| `L A N G U A G E S` | (spaced) | No | No (9 "words") | ❌ | same (also: "languages" isn't a recognized section at all — pre-existing, out-of-scope) |
| `T A R G E T  R O L E S` | (spaced) | No | No (11 "words") | ❌ | same (also: "target roles" isn't a recognized section — pre-existing, out-of-scope) |

`section_recognizer.recognize_sections()` on the raw text: `recognized_count: 0`, `section_extraction_ratio: 0.0`, `missing_core_sections: [summary, experience, education, skills]` — reproducing the report exactly.

## 4. Compare three inputs (Step 4)

| Section | A. Clean reconstruction (earlier investigation, synthetic) | B. Actual PDF extracted text (real, raw) | C. Normalized actual PDF text (this fix) |
|---|---|---|---|
| SUMMARY | ✅ | ❌ | ✅ |
| EDUCATION | ✅ | ❌ | ✅ |
| EXPERIENCE | ✅ | ❌ | ✅ |
| SKILLS | ✅ | ❌ | ✅ |
| CERTIFICATIONS | ✅ (optional) | ❌ | ✅ (optional) |
| LANGUAGES | n/a (not a recognized section in either version) | ❌ | ❌ (unchanged — see §7) |
| **`recognized_count` / 4** | 4/4 | **0/4** | **4/4** |
| **Legacy formatting score** | 90 (from the earlier, synthetic investigation) | **20** | **79** |

This makes the earlier investigation's uncertainty explicit: input A (a hand-typed reconstruction) never reproduced the bug because it never had the artifact in the first place. Input B (the real file) reproduces the report exactly. Input C (this fix) resolves it — using the SAME real file, not a different, easier one.

## 5. Minimal fix determined (Step 5)

**A — PDF extraction/normalization.** A new `_normalize_extracted_text()` step was added to `services/ats_engine/resume_parser.py`, applied once inside `extract_text()` (covering `.pdf`, `.docx`, and `.txt` uniformly — `.docx`/`.txt` are extremely unlikely to ever hit this pattern, but applying it uniformly is simpler and provably safe, see §6). `section_recognizer.py` and `text_metrics.py` are **unmodified**.

The normalization:
1. **Unicode NFKC normalization** — canonicalizes compatibility characters; doesn't change which letters/words are present. *(Allowed per Step 6.)*
2. **Zero-width character removal** (`\u200b`/`\u200c`/`\u200d`/`\ufeff`) — invisible, never carry content. *(Allowed.)*
3. **Non-breaking space → regular space.** *(Allowed — "common PDF spacing cleanup".)*
4. **The actual fix:** collapse runs of **3 or more consecutive single-letter "words" separated by exactly one space** back into the single word they represent (`"E X P E R I E N C E"` → `"EXPERIENCE"`). This is the narrowest, strongest possible signal of this specific artifact — a real resume essentially never has 3+ consecutive genuine one-letter words. *(Allowed — "safe heading normalization".)*
5. **Collapse runs of 2+ horizontal whitespace to one space** (e.g. the double space pypdf leaves between two collapsed heading words, or around short all-caps tokens like `"ERP  Application"`). *(Allowed — "whitespace normalization".)*

**Not done, and explicitly not allowed:** no content is invented, no heading is generated from nothing, no text is moved between sections, no resume meaning is changed. Every collapsed word is built ONLY from letters that were already literally present in the extracted text.

## 6. Normalization safety verification (Step 5's "must continue detecting genuinely problematic..." requirement)

Verified directly, not assumed:

- **A genuinely malformed 2-column extraction** (one character per LINE — the real signature of a column-jumbled PDF, mechanically distinct from same-line letter-spacing) is **completely untouched** by the normalization (`normalized == original`) and **still scores 0** (`section_recognizer` recognizes 0 sections, `formatting_score` returns 0). Confirmed both by calling `_normalize_extracted_text()` directly and through the full `extract_text()` pipeline.
- **A clean, normally-formatted resume** that never had this artifact comes back byte-for-byte identical after normalization — confirming no over-correction on text that was already fine.
- **The trigger threshold is deliberately narrow**: 2 consecutive single-letter tokens (e.g. `"V igo"`, a real body-text kerning artifact — see §7) are left untouched; only 3+ in a row (`"E X P"` minimum) trigger the collapse.

## 7. Before/after formatting score (Step 7 — exact formula breakdown, real numbers)

Computed directly from `text_metrics.formatting_score()`'s actual internals (`score = 40 baseline + min(30, headers*8) + min(20, (bullets//3)*5) - min(40, round(garble_ratio*200))`), on the real extracted text:

| Component | Before | After |
|---|---|---|
| Section headers detected | **0** | **5** *(experience, education, skills, summary, certifications — matches `text_metrics._SECTION_HEADERS`; "technical exposure"/"languages"/"target roles" aren't in that list at all — pre-existing, unrelated to this fix)* |
| Header bonus | `min(30, 0×8)` = **0** | `min(30, 5×8)` = **30** |
| Bullet-point lines found | 20 | **20** (unchanged — the `•` bullet glyph was already extracting correctly before this fix; only headings were affected) |
| Bullet bonus | `min(20, (20÷3)×5)` = **20** | `min(20, (20÷3)×5)` = **20** |
| Garble ratio | 0.2282 | **0.0539** |
| Extraction penalty | `min(40, round(0.2282×200))` = **40** (capped) | `min(40, round(0.0539×200))` = **11** |
| **Formatting score** | `40 + 0 + 20 − 40` = **20** | `40 + 30 + 20 − 11` = **79** |

`section_recognizer.recognize_sections()`: `0/4` → **`4/4`** (`section_extraction_ratio`: `0.0` → **`1.0`**).
`parsing_quality.analyze_parsing_quality()` (v2 layer, not part of the legacy score but independently affected by the same raw_text): `78` → **`96`**.

**Not targeted at 80/90/100** — 79 is what the real formula produces from the real (normalized) text; it is not a round number and was not adjusted toward one. The residual 11-point extraction penalty is itself honest signal — the resume still has real, unaddressed body-text spacing artifacts (see below), and the formula continues to reflect that rather than being zeroed out.

## 8. Remaining issues (explicitly not addressed this phase)

1. **Isolated intra-word letter splits in body text** (`"V igo"` → should be "Vigo", `"T icket"`, `"T eacher"`, `"T roubleshoot"`, `"W ork"`, `"V erify"`, `"Commer ce"`, `"ef fectively"`, `"af fect"`, `"UA T"`, etc.) — a narrower, mechanically different artifact (specific font kerning pairs, not deliberate heading letter-spacing) accounting for the residual 11-point garble penalty and the `contact_extraction_score: 60` (no phone number detected — not present in this resume at all, unrelated) . **Deliberately not fixed here** — reliably distinguishing a genuine lone letter (e.g. the word "A") from an artifact-split first-letter-of-a-word is a fundamentally harder, ambiguous problem without a dictionary, and risks false positives that the 3+-consecutive-letter signal avoids entirely. Flagged for a future, separately-scoped, more careful pass if warranted.
2. **"TECHNICAL EXPOSURE", "LANGUAGES", "TARGET ROLES" are still not recognized sections** — not because of extraction (they normalize correctly now, confirmed in §4/§6), but because `section_recognizer.SECTION_VARIANTS` genuinely has no entry for them. Pre-existing, out of scope for both this phase and the prior one (`section_recognizer.py` untouched, per explicit instruction).
3. **The ancillary space-separated-filename finding** (`docs/ATS_POOJA_RAW_EXTRACTION.md`) is noted but not investigated further.

## 9. Regression tests

`backend/tests/test_pooja_pdf_formatting_regression.py` — 10 tests, using the **actual raw extracted text from the real PDF** as a fixture (not a reconstruction):

| Test | Proves |
|---|---|
| `test_raw_unnormalized_text_confirms_the_original_bug_shape` / `..._reported_20pct_and_message` | The real raw text reproduces the exact reported bug (0 sections, score 20, exact message) — confirms the fixture is faithful evidence |
| `test_normalized_real_pdf_text_detects_all_core_sections` | Fix requirement 1: headings now detected |
| `test_normalized_real_pdf_text_formatting_no_longer_collapses_to_20pct` | Fix requirement 2: no longer floors at 20% |
| `test_clean_resume_normalization_is_a_no_op` | Fix requirement 3: a valid single-column resume is untouched and stays ATS-friendly |
| `test_genuinely_garbled_2col_extraction_is_not_touched_by_normalization` / `..._via_full_extract_text_pipeline` | Fix requirement 4: genuinely malformed (column-jumbled) extraction still scores 0 — both via the normalization function directly and via the full `extract_text()` pipeline |
| `test_three_consecutive_single_letters_is_the_minimum_trigger_not_two` | The narrow trigger threshold is exactly as designed (2 in a row untouched, 3 is the minimum) |
| `test_normalized_real_pdf_text_parsing_quality_improves` | The v2 `parsing_quality` layer benefits from the same fix |
| `test_end_to_end_real_pdf_formatting_score_before_and_after` | The exact 20 → 79 transition, from the real formula, on the real text |

Fix requirement 5 ("existing formatting tests remain unchanged") is verified by running the full existing suite (below), not a new unit test — `section_recognizer.py`, `text_metrics.py`, and `parsing_quality.py` have zero code changes, so their existing tests are running against byte-identical logic.

## 10. Full test results

```
backend/tests/test_pooja_pdf_formatting_regression.py                          10 passed
```
Combined with the Phase F1 files + ATS engine/v2/Phase C/benchmark suites:
```
test_ats_case_study_pooja_regression.py + test_ats_score_discrepancy_regression.py +
test_pooja_pdf_formatting_regression.py + test_ats_engine.py + test_ats_intelligence_v2.py +
test_phase_c_resume_quality.py + test_ats_benchmark.py                        254 passed, 0 failed
```
Full backend suite (`pytest` from `backend/`):
```
417 passed, 15 failed, 1 error
```
This is the exact same pre-existing failure set (by name) documented in `docs/ATS_BENCHMARK_REPORT.md` and reconfirmed in `docs/ATS_CASE_STUDY_POOJA_SCORE_20_FIX.md` — 13 Phase D DB-connectivity failures (`asyncpg.exceptions._base.InterfaceError`, local test Postgres unreachable/flaky), 2 pre-existing `test_resumes.py` Supabase-signup-flakiness failures, 1 `test_template_registry.py` teardown flake — **plus exactly 10 more passing tests** (407 → 417, this phase's new file). **Zero new regressions.**

`SCORING_ENGINE_VERSION`: unchanged, `"2.0.0"`. `ats_config.py`: no diff.

---

## STOP

Per the explicit instruction, this investigation and fix stop here.

**Summary for the record:**
- Root cause: **A — PDF extraction** (pypdf represents letter-spaced/tracked heading typography as individually space-separated characters).
- Fix: a conservative, narrowly-scoped, evidence-tested text normalization step in `resume_parser.py::extract_text()`. `section_recognizer.py` untouched.
- Real PDF formatting score: **20 → 79**, section recognition: **0/4 → 4/4** — from the actual, unmodified scoring formula, on the actual uploaded file.
- Two issues explicitly remain open and undone: intra-word kerning-artifact splits (body text), and three unrecognized section headings (TECHNICAL EXPOSURE/LANGUAGES/TARGET ROLES) that were never about extraction in the first place.
