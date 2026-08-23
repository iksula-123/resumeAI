# ATS Phase F2 — Full End-to-End Validation (Real PDF × Real JD)

**Scope:** validation only. **No production code was changed in this phase.** `SCORING_ENGINE_VERSION` unchanged at `2.0.0`; `ats_config.py` untouched; no weights, formulas, or redistribution rules modified. One genuine new bug was discovered while validating — it is documented (§17) and **not fixed here**, per the "stop after validation" instruction.

**Methodology note:** both `ResumeParser.parse()` and `JobParser.parse()` attempted a real AI call first, as the actual production code does — no mocking. In this environment, the AI call was unavailable for both resume and JD (no successful provider response), so both fell back to the heuristic parser. This is disclosed, not hidden: **this happens to be the exact same condition as the original bug report** ("Resume: heuristic (no AI key / call failed)", "JD: heuristic"), which makes this validation a direct, apples-to-apples comparison against the original 20 score.

---

## 1. Test resume

**File:** `C:\Users\Ranjeet\Downloads\Pooja Ranjeet Yadav (1).pdf` (the same real file identified and used in `docs/ATS_CASE_STUDY_POOJA_FORMATTING_FIX.md`).

## 2. Test JD

Exactly the controlled JD text supplied for this phase (reproduced in full in the accompanying regression-test-equivalent scripts; not repeated verbatim here to keep this report shorter — see the "ERP Application Support Analyst" JD in the phase instructions, used unmodified).

## 3. Parsing results

| | Resume | JD |
|---|---|---|
| `parsed_by` | `heuristic` | `heuristic` |
| Raw text length | 3,717 chars (post-Phase-F2 normalization) | 1,255 chars |

**Resume — structured extraction (real production output):**

| Field | Count / value |
|---|---|
| Experience entries | 2 |
| Experience bullets (total) | 20 (13 + 7) |
| Skills | 16 |
| Education entries | 1 |
| Certifications | 1 |
| Languages | 1 *(see §17 — the real line `"English Hindi Marathi"` has no comma separator, so it comes out as one combined entry rather than three)* |
| Keywords | 19 |
| `total_experience_years` | 3.0 |
| `heuristic_sections_found` | certifications, education, experience, languages, skills, summary |

**JD — structured extraction (real production output, heuristic fallback):**

| Field | Value |
|---|---|
| `job_title` | "ERP Application Support Analyst" |
| `required_skills` / `preferred_skills` | `[]` / `[]` — **known, documented, unchanged gap** (JobParser's heuristic fallback never populates these — Phase F1's explicit out-of-scope item) |
| `responsibilities` | 10 items — **only the first 10 bullets found anywhere in the whole JD text** (the heuristic fallback does `required[:10]` across ALL bullets in the document, not just the "Responsibilities:" section) — silently drops the JD's last 2 Responsibilities bullets and all 13 Requirements + 3 Technical-exposure bullets. A more specific, newly-observed manifestation of the already-documented JD-parser gap. |
| `min_experience_years` | **2.0** — correctly captured (regex-based, works independently of the bullet-parsing gap) |
| `min_education` | `null` — JD literally states "Bachelor's degree or equivalent" but the heuristic fallback never extracts education requirements at all |
| `keywords` / `technologies` / `certifications` | `[]` / `[]` / `[]` — same gap |

**This means:** with the real, currently-unfixed JD-side heuristic gap, Keyword Match, Skills Match, Education Match, and Certification Match are ALL excluded — not because the resume lacks matchable content, but because the JD parser (out of scope for every phase so far) didn't structure the JD's very real, very complete requirements. This is disclosed honestly in §9/§12/§13, and a clearly-labeled contrast run is used there to still answer what those categories WOULD show with the JD properly structured.

## 4. Section recognition

Confirmed via the real, unmodified `section_recognizer.recognize_sections()` call on the actual normalized extraction:

```
recognized_count: 4/4
recognized_sections: [summary, education, experience, skills, certifications]
missing_core_sections: []
section_extraction_ratio: 1.0
```

The Phase F2 formatting fix holds. (Full before/after already documented in `docs/ATS_CASE_STUDY_POOJA_FORMATTING_FIX.md`; reconfirmed here against the live pipeline, not a saved fixture.)

## 5. ATS Health / ATS Compatibility (v2 layer)

| Category | Raw score | Weight | Contribution |
|---|---|---|---|
| Parsing Quality | 96.0 | 53.3% | 51.17 |
| Section Recognition | 100.0 | 26.7% | 26.70 |
| ATS Formatting | 79.0 | 20.0% | 15.80 |
| **ATS Compatibility (layer)** | | | **94** |

`parsing_quality.analyze_parsing_quality()` detail: `parsed_character_ratio=1.0`, `parsed_word_ratio=0.946`, `garbled_text_ratio=0.054`, `reading_order_score=100`, `contact_extraction_score=60` (email found near the top; **no phone number detected** — genuinely absent from this resume, not a parsing failure).

## 6. Job Match

**With the real (heuristic-fallback) JD** — legacy 7-category model:

| Category | Applicable | Match | Weight (redistributed) | Contribution |
|---|---|---|---|---|
| Keyword | ❌ excluded | — | 0% | 0 |
| Skills | ❌ excluded | — | 0% | 0 |
| Experience | ✅ | 100.0 | 50.0% | 50.0 |
| Responsibility | ✅ | 19 | 37.5% | 7.13 |
| Education | ❌ excluded | — | 0% | 0 |
| Certifications | ❌ excluded | — | 0% | 0 |
| Formatting | ✅ | 79.0 | 12.5% | 9.88 |
| **Legacy `overall_score`** | | | | **67** *(50.0 + 7.13 + 9.88 = 67.0, rounded)* |

**With the real (heuristic-fallback) JD** — v2 3-layer model:

| Layer | Score |
|---|---|
| ATS Compatibility | 94 |
| Job Match | **100** *(only `experience` is applicable — `keywords`/`education`/`skills`/`certifications`/`location` all excluded for the same JD-parser-gap reason; with just one usable category at 100% redistributed weight, Job Match reads 100)* |
| Resume Quality | 30 |
| **v2 overall** | **81** *(94×20% + 100×55% + 30×25% = 18.8+55.0+7.5 = 81.3, rounded)* |

**Why legacy (67) and v2 (81) diverge so much here:** the legacy model has a `responsibility` category (crushed to 19% by the JD-parser gap's crude bullet-dumping — see §11) that drags its blended score down; v2's `job_match` has no `responsibility` category at all, so with only `experience` left applicable, it reads a clean 100. This is a genuine, structural methodology difference between the two engines (documented previously, reconfirmed here with a real example) — not a bug, not something this phase changes.

## 7. Resume Quality (v2 layer — JD-independent)

**Score: 30/100.**

| Category | Raw score | Weight | Contribution | Note |
|---|---|---|---|---|
| Bullet Quality | 55.0 | 17.6% | 9.68 | |
| Quantified Impact | 0.0 | 14.7% | 0.0 | 0/20 bullets have a measurable metric — real, honest signal |
| Action Verbs | 10.0 | 7.8% | 0.78 | Only "developed"/"managed" detected among 20 bullets |
| Skill Evidence | 0.0 | 14.7% | 0.0 | See §17 — skills like "ERP Application Support" aren't found verbatim inside the experience bullets, a phrase-matching limitation, not new to this phase |
| Summary Quality | 30.0 | 9.8% | 2.94 | |
| Readability | 40.0 | 7.8% | 3.12 | |
| Seniority | 35.0 | 7.8% | 2.73 | "stakeholder" signal found |
| Career Progression | — (excluded) | 0% | 0 | "Job titles aren't specific enough to determine a seniority sequence" — data gap, not penalized as a failure |
| Completeness | 42.0 | 4.9% | 2.06 | |
| Repetition | 100.0 | 2.9% | 2.9 | No near-duplicate bullets |
| Credibility | 100.0 | 2.0% | 2.0 | |
| Recruiter Readiness | 35.0 | 9.8% | 3.43 | |

**Anti-gaming check** (`anti_gaming.analyze_anti_gaming()`, real call against the resume's skills as `terms_to_check`): `{"flags": [], "is_clean": true}` — no keyword stuffing, no JD copying, no stuffed keyword blocks detected.

## 8. Complete score calculation

**Legacy** (shown fully in §6): `overall_score = round(100.0×0.50 + 19×0.375 + 79.0×0.125) = round(50.0 + 7.125 + 9.875) = 67`.

**v2**: `overall = round(94×0.20 + 100×0.55 + 30×0.25) = round(18.8 + 55.0 + 7.5) = round(81.3) = 81`.

Both computed by the real, unmodified `_redistribute_weights()` / `_redistribute()` functions — no manual adjustment.

## 9. Keyword evidence

**With the real (heuristic-fallback) JD: none exists to show.** `job.keywords == []`, so the `keyword` category is `applicable: false` for both engines — correctly excluded, not scored as zero, per the "never treat missing data as zero" rule. This is a direct, disclosed consequence of the JD-side parser gap (§3), not a resume-side issue.

**Contrast — with the JD hand-structured exactly as written** (labeled clearly: this is NOT live system output; it's a literal, non-inventive structuring of the JD text used ONLY to answer what keyword matching would show if the JD parser worked — same technique used in the Phase F1 fix report's "SIMULATED" contrast):

| | Matched | Missing |
|---|---|---|
| Legacy `keyword` (93% match) | ERP, ERP Application Support, SmartERP, Ticket Management, Issue Troubleshooting, Requirement Gathering, Functional Analysis, UAT, Functional Testing, Regression Testing, Bug Verification, User Support, Client Support | SQL |
| v2 `keywords` (86% match) | ERP, ERP Application Support, SmartERP, Ticket Management, Issue Troubleshooting, Requirement Gathering, Functional Analysis, Functional Testing, Regression Testing, Bug Verification, User Support, Client Support | **UAT**, SQL |

**No related-but-different skill was ever treated as an exact match** — confirmed directly: `SmartERP` matched only because it's literally present verbatim in the resume, not via any alias; no JavaScript/TypeScript- or React/React-Native-style cross-matching occurred anywhere in this run (the resume and this JD don't contain such a pair, so the "never conflate related skills" rule wasn't exercised here, but no violation was observed either).

**Why v2 misses "UAT" but legacy doesn't:** a direct, concrete, real-world instance of the residual kerning-artifact explicitly flagged as an open issue in `docs/ATS_CASE_STUDY_POOJA_FORMATTING_FIX.md` §8 — the resume's own text has `"UA T"` (with a stray space, not fixed by the Phase F2 normalization, which only targets 3+-consecutive-single-letter runs) rather than `"UAT"`. Legacy's substring check happens to still find "UAT" as a fuzzy/full-text hit elsewhere; v2's alias-aware matcher does not. This is exactly the kind of downstream effect that open issue predicted — not a new bug, but real, observed confirmation of it.

## 10. Experience evidence

**Candidate experience (as extracted):** 3.0 years (`total_experience_years`, computed from "15 April 2023 – Present" → 2026 − 2023 = 3).
**Required experience (JD):** 2+ years.
**Experience match score:** 100.0% — `"Candidate has 3 years vs. the 2+ required — meets the bar."`
**Evidence:** `matched_evidence: ["V igo Infotech", "T eacher 4 Y ears"]` (the two experience entries' extracted `title`/`company` strings — see the field-swap bug below), `missing_evidence: ["T eacher 4 Y ears: missing duration"]` (correctly flags that the second, older role has no bullets/duration detail — the FIRST entry's `duration` field is empty for a different, structural reason, see below).

**Nothing was invented** — 3.0 years is a real, literal calculation from the actual "15 April 2023 – Present" text.

**⚠️ New bug found during this validation (documented, NOT fixed this phase):** the first experience entry's structured fields are misassigned:
```
"title": "V igo Infotech",                                                       ← should be the job title
"company": "Product: SmartERP",                                                  ← should be "Vigo Infotech"
"duration": "ERP Application Support / Pr oduct Support 15 April 2023 – Present" ← should be "15 April 2023 – Present"
```
**Root cause:** this resume's EXPERIENCE section lists the job title AND its date range on the SAME line (`"ERP Application Support / Product Support 15 April 2023 – Present"`) — a common resume layout. `_parse_experience_section()`'s classifier checks for a date-signal match FIRST, before checking whether a line should be the title — so a line containing BOTH a title and a trailing date gets entirely classified as `duration`, pushing the true title/company lines (which follow) into the wrong slots. **This did not affect the Experience Match score** — `total_experience_years` is computed by scanning ALL `duration` strings for years/"Present" regardless of which field they landed in, so the 3.0-year, 100%-match result is still correct — but the `title`/`company` fields shown as evidence are wrong, and this would affect anything that specifically reads `experience[].title`/`.company` (e.g. a future "which companies has this candidate worked at" feature). Full detail in §17.

## 11. Responsibility evidence

**Cannot be shown per-responsibility — a real limitation, not glossed over.** The legacy `responsibility` category (`services/ats_engine/scoring.py::_responsibility_category`) calls `similarity_service.section_similarity()`, which returns a single AGGREGATE similarity percentage (token-overlap, since no AI embeddings were available in this run) between ALL of the candidate's bullets as one block and ALL of the JD's `responsibilities` as another block — it does not, and structurally cannot with today's implementation, break the result down responsibility-by-responsibility. `match: 19`, `matched_evidence: []`, `missing_evidence: []` is the complete real output — there is no hidden per-item breakdown being withheld.

What CAN be said: the JD's `responsibilities` field itself is only 10 of the JD's real 12 Responsibilities bullets (§3's finding), so even this aggregate 19% score is being computed against an incomplete slice of the JD's actual responsibilities.

## 12. Education evidence

**Resume:** `"Master of Commer ce (M.Com)"` (residual kerning artifact in "Commerce" — cosmetic, doesn't affect degree-rank classification since `_degree_rank()` matches on "m.com" as a substring, which is intact).
**JD:** "Bachelor's degree or equivalent" (only extractable via the simulated/hand-structured contrast — the live heuristic JD parser doesn't populate `min_education` at all, so this category is `applicable: false` / excluded in the real run — §3).

**With the JD's education requirement properly structured** (contrast run):
```
Education Match:        100.0%  — "Master of Commerce (M.Com)" satisfies the "Bachelor's degree or equivalent"
                                   requirement (M.Com ranks above Bachelor's in _DEGREE_RANK)
Education Completeness:  33%    — institution and year are not provided
```
**Confirmed exactly as required:** Match and Completeness are separate numbers, and the missing institution/year does **not** lower the Match score — the category's own `reason` text says so explicitly: *"(institution, year not provided — doesn't affect the match score, only completeness.)"* — this is existing, correct, already-verified behavior, not something this phase changed.

## 13. Certification evidence

**Resume:** `"Software T esting Course – Certified"` (residual kerning artifact in "Testing" — cosmetic).
**JD:** states no certification requirement anywhere.

**Result, both in the real run and the simulated contrast:** `certifications` category is `applicable: false`, `"reason": "The job description doesn't require specific certifications."` — **no match is forced.** The candidate's real certification is neither scored nor penalized; it simply isn't relevant to this specific JD, and the system says so honestly rather than inventing a match or a miss.

## 14. Formatting evidence

Reconfirmed against the live pipeline (not a cached result):

| Metric | Value |
|---|---|
| Section headers detected (legacy) | 5 (experience, education, skills, summary, certifications) |
| Bullet-point lines found | 20 |
| Formatting score | 79 |
| `section_extraction_ratio` (v2) | 1.0 (4/4 core + certifications) |
| `garbled_text_ratio` | 0.054 |
| `reading_order_score` | 100 — no reading-order issues |
| `contact_extraction_score` | 60 — email found near the top; no phone number detected (genuinely absent) |

The Phase F2 fix holds under a completely independent test run (different JD, full pipeline, not the isolated fixture from the fix report).

## 15. Explanation of the original 20 score

**Proven, not assumed** (isolation test: re-ran the CURRENT, Phase-F1-fixed heuristic resume parser against the PRE-Phase-F2, un-normalized raw PDF text):

```
UNNORMALIZED overall_score: 20
UNNORMALIZED excluded: [keyword, skills, experience, responsibility, education, certifications]
UNNORMALIZED formatting: match=20.0, weight=100.0
```

**This is identical, in every respect, to the ORIGINAL pre-Phase-F1 bug report.** The reason: `_split_into_sections()` (Phase F1's structured extraction) ALSO depends on exact heading-string matching against `_ALL_HEADING_ALIASES` — the exact same matching mechanism that fails on letter-spaced text. Without Phase F2's normalization, Phase F1's structured parser can't even find the EXPERIENCE/EDUCATION/SKILLS/CERTIFICATIONS section boundaries in the first place, so it produces the same empty `experience`/`education`/`skills`/`certifications` as the ORIGINAL, pre-Phase-F1 code — not because Phase F1's fix doesn't work, but because it never got a chance to run on correctly-delimited sections.

**Attribution, for this specific resume, based on direct measurement:**

| Cause | Contribution to the original 20 |
|---|---|
| **PDF extraction (letter-spaced headings)** | **The gating, dominant cause** — without fixing this, the score stays at exactly 20 regardless of whether the heuristic parser is fixed |
| Heuristic parser (Phase F1) | Necessary but **not sufficient alone** for this file — its fix only takes effect once section boundaries can be found, which required Phase F2 |
| Missing structured data (resulting from the above two) | The direct mechanism — `experience`/`education`/`skills`/`certifications` all read empty, so legacy weight collapses to `formatting` alone at 100% |
| Insufficient JD | **Not a factor in the original 20** — the JD in the original report ("ERP Application Support" — 3 words) had insufficient information too, but that only explains why the OTHER categories (education/certifications) were N/A even in a fully-fixed world; it doesn't explain the formatting collapse, which is 100% attributable to extraction |
| Actual resume quality | **Not a factor in the original 20** — this resume has 20 real bullets, 16 real skills, a real degree and certification; the "quality" of the content was never the problem, only whether the pipeline could see it |

## 16. Explanation of the current score

**Legacy: 67. v2: 81.** (Both from the real heuristic-fallback JD — §6/§8.) Driven by:
- **Resume side is now working correctly** (Phase F1 + F2): experience, education, skills, certifications are all extracted; section recognition is 4/4; formatting is 79.
- **JD side still has its own, separate, unaddressed gap** (§3, out of scope for every phase so far): `required_skills`/`keywords`/`min_education`/`certifications` all come back empty from the heuristic JD parser, even for this very complete, well-written JD — so Keyword/Skills/Education/Certification Match are excluded, and weight redistributes onto whatever remains (Experience + Responsibility + Formatting for legacy; Experience alone for v2).
- **With the JD properly structured** (§9/§12, simulated contrast, clearly labeled as illustrative only): legacy reaches **78**, v2 reaches **74** — using the SAME resume, SAME real extraction, just a correctly-parsed JD. This demonstrates the JD-parser gap is now the single largest remaining lever on this resume's score, larger than anything left on the resume-parsing side.

## 17. Remaining issues

1. **NEW — experience field misassignment when a title line also contains a trailing date** (§10). `_parse_experience_section()`'s date-detection runs before title/company assignment, so a combined "Title ... Date Range" line is entirely consumed as `duration`, shifting company/product-line text into `title`/`company`. Confirmed to not affect the numeric Experience Match score (which reads years from whichever field the date landed in) but does produce wrong `matched_evidence` text and wrong structured `title`/`company` values. **Not fixed this phase** — flagged for a future, separately-scoped fix (the minimal correction would be: strip a trailing date-range substring from a title/company candidate line instead of discarding the whole line once a date pattern is found anywhere in it).
2. **JD heuristic parser gap** (pre-existing, `job_parser.py`, unchanged across every phase so far) — now the largest remaining lever on real-world scores for resumes whose own extraction is otherwise healthy. Specifically re-confirmed here: (a) `required_skills`/`keywords`/`min_education`/`certifications` always empty; (b) `responsibilities` silently truncates to the first 10 bullets found ANYWHERE in the JD text, not just the Responsibilities section, dropping real content even from a well-structured JD.
3. **Residual intra-word kerning artifacts** (`"V igo"`, `"UA T"`, `"T esting"`, etc. — documented and deliberately not fixed in `docs/ATS_CASE_STUDY_POOJA_FORMATTING_FIX.md` §8) — now shown to have a concrete, measurable effect: v2's keyword matcher missed "UAT" specifically because of this (§9).
4. **NEW, minor — languages with no comma separator** (§3): `"English Hindi Marathi"` (space-separated, no commas) extracts as one combined language entry instead of three. `_split_list_section()` only splits on commas. Low impact — `languages` isn't consumed by any scoring formula today.
5. **`skill_evidence` (Resume Quality) scoring 0** despite genuinely relevant experience bullets (§7) — appears to require a near-verbatim phrase match between a listed skill and bullet text, which this resume's more naturally-worded bullets don't provide even though they clearly describe the same work. Not newly introduced by this phase's fixes; flagged for awareness, not investigated further here (out of scope).

## 18. Competitor calibration readiness

**Not performed.** Per explicit instruction, only SahiCareer's own values are populated; competitor columns are left blank because no actual, controlled observations exist — nothing is estimated or assumed about competitor algorithms.

| Metric | SahiCareer (legacy) | SahiCareer (v2) | Enhancv | ResumeGyani | Zety |
|---|---|---|---|---|---|
| Overall score (real heuristic-fallback JD) | 67 | 81 | — | — | — |
| Overall score (JD hand-structured, illustrative only) | 78 | 74 | — | — | — |
| ATS Compatibility / Formatting | 79 (formatting) | 94 (compatibility) | — | — | — |
| Job Match | n/a (blended into overall) | 100 (real JD) / 87 (structured JD) | — | — | — |
| Resume Quality | n/a | 30 | — | — | — |

**To populate the competitor columns**, per the standing project rule (`ats_config.py`'s docstring, `docs/ATS_BENCHMARK_REPORT.md` §18): this exact same resume file and this exact same JD text would need to be run through each competitor's actual tool, and the real observed output recorded — a separate, explicitly-scoped effort, not started here.

---

## STOP

Per the explicit instruction, this validation stops here. No production code was changed. Test suite results (unchanged from the last fix phase, since no code was modified this session): combined ATS suites unaffected; full backend suite **417 passed, 15 failed, 1 error** — the same pre-existing baseline (13 Phase D DB-connectivity failures, 2 Supabase-flakiness failures, 1 teardown flake), zero new regressions. `SCORING_ENGINE_VERSION` unchanged at `2.0.0`. Competitor calibration was not started.
