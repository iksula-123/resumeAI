# ATS Case Study — "Pooja Ranjeet Yadav" resume scoring 20/100

**Status:** Forensic investigation only, per explicit instruction. **No scoring weights, `SCORING_ENGINE_VERSION`, or production scoring/parsing/formatting code were changed.** Two new regression test files exist covering this and the related prior investigation — see §13. This case study builds directly on, and does not repeat the general architecture from, `docs/ATS_SCORE_DISCREPANCY_20_VS_78_80.md` (referred to below as "the prior investigation") — read that first for the full pipeline trace (Phase 1's request); this doc focuses on what's specific to this real case.

---

## 1. Executive summary

- **The exact PDF file was not available to this investigation** (never uploaded/attached to this conversation) — see §2 for what was reconstructed from the user's detailed description and exactly what's assumed vs. verbatim.
- **Confirmed, deterministic (not PDF-extraction-dependent):** the resume's heuristic parser fallback (`ResumeParser._heuristic_parse()`) discards `experience`, `education`, `skills`, and `certifications` entirely for this resume, even on a cleanly-formatted reconstruction — this is the **same defect already documented** in the prior investigation, now confirmed against real named entities (Vigo Infotech, SmartERP, ERP Application Support) instead of a synthetic stand-in. This alone fully explains "Experience entries = 0", "No work experience entries found on the resume," and Profile Completeness reading 0% across every field.
- **Confirmed, not a bug:** the Target Job field containing only "ERP Application Support" (a 3-word title, no requirements) correctly causes Job Match categories to be excluded (`N/A`), never scored as a failing zero. This is the "never treat missing data as zero" rule working exactly as designed and must not be changed.
- **Not confirmed — hypothesis only, requires the real PDF or its raw extracted text:** why the ATS Formatting category specifically read 20% with "0 standard section headers detected." A clean-text reconstruction of this exact resume content scores **90%** on formatting and recognizes all 4 core sections — meaning the heading *vocabulary* (SUMMARY/EDUCATION/EXPERIENCE/TECHNICAL SKILLS/CERTIFICATIONS) is not the problem; something about how *this specific PDF file* extracts its text is. A constructed test reproducing a known pypdf extraction artifact (a heading merged onto the same line as its first content) reproduces the user's **exact** reported message — "0 standard section headers detected" — and drops the score well below the clean-text baseline. This is evidence the mechanism is real and available in the current code, not proof it's what this particular PDF did.
- A smaller, related defect was found while investigating: `resume_quality.py`'s bullet-dependent categories read bullets only from `experience[].bullets`, never from the heuristic parser's top-level `resume["bullets"]` field — so even the 12 real bullets the heuristic parser DOES manage to preserve are invisible to Resume Quality.
- **Root cause classification:** primarily **A — INPUT/PARSING BUG** (same family as the prior investigation), for the resume side. The Job Match "N/A" pattern is **F — EXPECTED**, not a bug. The exact formatting-score mechanism is **A — HYPOTHESIZED**, unconfirmed pending the real PDF.

---

## 2. Exact test input

**What the user provided:** a detailed prose description of the resume's sections, one experience entry's title/company/dates/product, 12 experience bullets (verbatim), 16 technical skills (verbatim), 1 certification (verbatim), a "Technical Exposure" block (verbatim), and — only mentioned later, in Phase 5 — a second experience entry ("Teacher / Private School / 4 Years").

**What was reconstructed** (`backend/tests/test_ats_case_study_pooja_regression.py::POOJA_RESUME_TEXT_CLEAN`) — every section, heading, bullet, skill, and the certification reproduced verbatim from the user's message, laid out as clean, standard, single-column plain text (one heading per line, standard `-` bullets):

```
Pooja Ranjeet Yadav

SUMMARY
ERP Application Support professional with hands-on experience in SmartERP product support, client communication, and functional testing.

EDUCATION
B.Com, Institution not specified, Year not specified          ← ASSUMPTION, see below

EXPERIENCE
ERP Application Support / Product Support
Vigo Infotech
15 April 2023 - Present
Product: SmartERP
- Application support
- Client support
- Support tickets
- ERP troubleshooting
- Requirement gathering
- Developer coordination
- UAT
- Functional testing
- Bug verification
- Regression testing
- Client communication
- User support

Teacher
Private School
4 Years

TECHNICAL SKILLS
[all 16 skills, verbatim from the user's message]

CERTIFICATIONS
Software Testing Course - Certified

TECHNICAL EXPOSURE
[verbatim from the user's message]

LANGUAGES
English, Hindi                                                  ← ASSUMPTION, see below

TARGET ROLES
ERP Application Support
```

**Explicit assumptions (flagged, not guessed as fact):**
- **EDUCATION** content — the user listed "EDUCATION" as a section present in the PDF but never stated the degree/institution/year. A placeholder (`B.Com, Institution not specified, Year not specified`) was used so the section isn't empty in the reconstruction. This has no bearing on the findings below (the education *category* is excluded either way, because the Target Job states no education requirement — see §9).
- **LANGUAGES** content — same situation; `English, Hindi` used as a placeholder.
- **Exact line breaks, whitespace, and bullet glyphs in the real PDF are unknown** — this is the single most consequential unknown, because §6 shows formatting/section-recognition results are highly sensitive to exactly this.

**Target Job field (verbatim, confirmed exact):** `ERP Application Support`

**Reported endpoint / mode:** ATS Checker page (the UI text described — "Resume: heuristic (no AI key / call failed)", "JD: heuristic", per-category weight/redistribution table — matches `frontend/app/ats-checker/page.tsx` exactly, calling `POST /api/ats/v2/analyze` or `/analyze-resume` → `ATSService.analyze()` → the **legacy 7-category model**, same as the prior investigation's §5 finding). Confirmed again in §10 below.

**Scoring engine version:** `2.0.0` (unchanged; same traceability caveat as the prior investigation — this field doesn't indicate which formula produced the headline number).

---

## 3. Screenshot observations (as described by the user, not independently viewed)

| UI element | Reported value |
|---|---|
| Overall ATS Score | 20/100 |
| ATS Formatting | 20%, weight 100% |
| Keyword / Skills / Experience / Responsibility / Education / Certification Match | N/A (all excluded) |
| Experience completeness | 0% |
| Experience entries | 0 |
| Section headers detected | 0 standard section headers |
| Resume parse status | heuristic (no AI key / call failed) |
| JD parse status | heuristic |

Every one of these is reproduced exactly in shape by the reconstruction below **except** the specific "20%" / "0 headers" formatting number, which needed a further, separate constructed test to reproduce the exact wording (§6).

---

## 4. PDF extraction results

**Not directly testable — the real PDF file was not provided**, so `ResumeParser.extract_text()` (pypdf `PdfReader(...).extract_text()`, `services/ats_engine/resume_parser.py:28-34`) could not be run against it. This is the biggest open item — see §9's "what's needed" list.

What CAN be said: `extract_text()` does no cleanup, no layout analysis, no column detection — it is a thin wrapper around `page.extract_text()` for every page, joined with `\n`. Whatever pypdf's own text-extraction algorithm produces (including any line-merging, column-jumbling, or bullet-glyph loss specific to this PDF's generator/template) becomes `raw_text` verbatim, unseen and unfixed by anything downstream. This is consistent with, and is the most likely explanation for, why a clean-content reconstruction (§5) does NOT reproduce the "0 headers"/20% symptom while a constructed extraction-artifact variant (§6) does.

## 5. Structured parser results

Using `POOJA_RESUME_TEXT_CLEAN` (§2) through the real, unmodified `ResumeParser.parse()` (AI forced unavailable, matching the user's own observed "heuristic (no AI key / call failed)" state — deterministic, no network):

| Field | Expected (from the actual PDF content, per the user's description) | Actual (heuristic fallback) |
|---|---|---|
| Extracted text length | 1,547 characters (this reconstruction) | 1,547 (preserved verbatim as `raw_text`) |
| Experience entries | 2 (ERP Application Support role + Teacher role) | **0** |
| Experience bullets | 12 | **0** (structurally — the 12 lines DO survive, but only in a separate, disconnected top-level `bullets` list — see §5a) |
| Skills | 16 | **0** |
| Education entries | 1 | **0** |
| Certifications | 1 | **0** |
| Languages | 2 (assumed) | 0 (heuristic parser has no `languages` field at all — n/a to this bug, pre-existing shape) |
| Summary | present (1 sentence) | **not extracted** (`summary: null`) |
| Job titles / companies | "ERP Application Support / Product Support" / "Vigo Infotech"; "Teacher" / "Private School" | **not extracted** |

**Where exactly the data is lost:** `services/ats_engine/resume_parser.py::_heuristic_parse()`, lines 52-81. This function is called whenever `parse()`'s AI call fails (`chat_json()` returns `None`, silently, on any error — `services/ats_engine/llm.py:28-60`). It:
```python
return {
    ...
    "skills": [], "hard_skills": [], "soft_skills": [],
    "experience": [], "projects": [], "education": [], "certifications": [],
    "action_verbs": action_verbs_found,   # ← the ONLY structured field actually computed
    "keywords": [],
    ...
    "bullets": bullets,                    # ← lines starting with -/•/* or "N."
    "raw_text": text,
    "parsed_by": "heuristic",
}
```
`experience`/`education`/`skills`/`certifications`/`keywords` are hardcoded empty literals — there is no code path in this function that ever populates them, regardless of input quality. **This is identical to the root cause already documented in the prior investigation**, now confirmed against this resume's real content (Vigo Infotech / SmartERP / ERP Application Support all present in `raw_text`, none reaching the structured fields).

### 5a. A second, related gap found specifically while investigating this case

`resume_quality.py::_all_bullets()` reads bullets **only** from `resume["experience"][*]["bullets"]`:
```python
def _all_bullets(resume: dict) -> list[str]:
    return [b for e in (resume.get("experience") or []) for b in (e.get("bullets") or []) if str(b).strip()]
```
It never looks at the top-level `resume["bullets"]` field — the one field the heuristic parser DOES populate correctly (all 12 of this resume's bullets are captured there). Confirmed directly (`test_resume_quality_ignores_top_level_bullets_when_experience_is_empty_KNOWN_GAP`): Resume Quality's `bullet_quality` and `quantified_impact` categories see **zero** usable bullets for this resume, despite 12 real ones sitting one field away in the same object. This compounds the main bug rather than being independent of it — fixing `_heuristic_parse()` alone (§11's recommendation) would resolve this too, *if* the fix attaches bullets to experience entries rather than only to the top-level field.

## 6. Section recognition results

Ran `section_recognizer.recognize_sections()` and the legacy `text_metrics.formatting_score()` against two variants:

**Variant A — clean reconstruction (§2), each heading alone on its own line:**
| Metric | Result |
|---|---|
| `section_recognizer` core sections recognized | **4/4** (summary, experience, education, skills) + certifications (optional) |
| `section_extraction_ratio` | 1.0 |
| Legacy `formatting_score()` | **90** — `"5 standard section headers detected; 12 bullet-point lines found"` |

This proves the heading **vocabulary** is not the problem: `SUMMARY`, `EDUCATION`, `EXPERIENCE`, `TECHNICAL SKILLS` (→ `skills`), and `CERTIFICATIONS` are all already-recognized variants in `section_recognizer.SECTION_VARIANTS` and in the legacy `_SECTION_HEADERS` substring list. Aliases tested for completeness (all recognized): `PROFESSIONAL SUMMARY`, `PROFILE`, `WORK EXPERIENCE`, `EMPLOYMENT HISTORY`, `ACADEMIC BACKGROUND`, `LICENSES & CERTIFICATIONS`. **Not recognized by either engine (by design — not core/optional sections at all):** `TECHNICAL EXPOSURE`, `LANGUAGES`, `TARGET ROLES` — these three headings in Pooja's resume have no equivalent in `SECTION_VARIANTS`/`OPTIONAL_SECTIONS`/`_SECTION_HEADERS` at all. **This is not penalized** — `LANGUAGES`/`TARGET ROLES`/`TECHNICAL EXPOSURE` aren't in `CORE_SECTIONS`, so their absence from `recognized_sections` doesn't lower `section_extraction_ratio` — but it does mean genuinely present, relevant content in those sections contributes nothing to either score.

**Variant B — HYPOTHESIS, simulating a pypdf line-merge artifact** (each heading merged onto the same line as its first content, bullet markers dropped — a documented real-world pypdf behavior for certain PDF generators/templates, not invented for this doc):
```
SUMMARY ERP Application Support professional with hands-on experience...
EDUCATION B.Com, Institution not specified, Year not specified
EXPERIENCE ERP Application Support / Product Support
Vigo Infotech
...
```
| Metric | Result |
|---|---|
| `section_recognizer` core sections recognized | **0/4** |
| Legacy `formatting_score()` | **40**, note: `"0 standard section headers detected; 0 bullet-point lines found"` — **the exact phrase the user reported** |

**Why:** `section_recognizer._looks_like_heading()` requires the line to be short and title-shaped (≤6 words, ≤45 chars); `text_metrics.formatting_score()`'s header check requires `h in l and len(l) < 40`. Once a heading is merged with a full sentence of following content, both checks fail — the heading is still *textually present* in `raw_text` (a human, or a substring-anywhere search, would find "EXPERIENCE" in there) but neither engine's heading-shape heuristic recognizes it as a heading anymore.

**This is not proof of what happened in Pooja's real PDF** — it's proof that (a) the user's exact reported wording is reproducible by a specific, known class of PDF-extraction behavior, and (b) getting all the way down to a reported score of 20 (vs. this test's 40, or the prior investigation's garbled-2-column probe which hit exactly 0) plausibly needs one more layer of real-world extraction noise (further-garbled characters, a genuinely multi-column layout, etc.) that can't be constructed without the real file. **The real PDF or its raw extracted text is required to close this out precisely.**

## 7. Parsing fallback analysis

Directly answering Phase 3's four questions, using the real code (`services/ats_engine/resume_parser.py`, `services/ats_engine/llm.py`):

1. **Does it fall back to deterministic resume parsing?** Yes — `_heuristic_parse()` runs unconditionally whenever `chat_json()` returns `None` (`resume_parser.py::parse()`, line 253).
2. **Does it fall back to raw text?** Partially — `raw_text` is always preserved (the one thing every downstream module can still search via substring), but nothing is *extracted from* it into structured fields.
3. **Does it return an empty structured resume?** **Effectively yes**, for every field except `bullets`, `action_verbs`, and `raw_text` — confirmed in §5.
4. **Does it incorrectly treat the resume as having no experience?** **Yes — confirmed.** `resume["experience"] == []` regardless of the fact 12 bullets, a company name, a date range, and a job title are all present and extractable in `raw_text`.

Per the explicit instruction — **"If heuristic parsing produces an empty resume structure, this is a serious bug"** — this is exactly what was found, and is treated as such (Classification A, §11).

## 8. ATS Formatting

Already covered mechanically in §6. To directly answer the instruction **"do NOT lower formatting standards just to increase the score — instead fix the evidence pipeline if section recognition is wrong":** no evidence was found that the section-recognition/formatting *standards themselves* are wrong for this resume's actual heading vocabulary (§6 Variant A proves the standard heading names all work). The evidence instead points at the **evidence pipeline** — specifically, whatever raw-text shape this PDF's extraction actually produced, which is unverifiable without the file. No recommendation is made to loosen `_looks_like_heading()` or the header-detection substring check in general (that would risk false-positive "section detected" claims on resumes that genuinely lack structure) — the targeted fix, if Variant B's hypothesis is confirmed, would be extraction-time (e.g., detect and split heading+content that pypdf merged) or heading-detection-time (e.g., also check for a recognized heading word at the START of a longer line, not just a full-line exact/substring match) — see §11.

## 9. Profile Completeness

Directly answering Phase 7's question: **B — genuinely based on the uploaded resume, not a separate DB field, and not accidentally disconnected.**

`scoring.profile_completeness(resume)` (`services/ats_engine/scoring.py:474-508`) takes only the parsed `resume` dict as input — it reads `resume["education"]`, `resume["experience"]`, `resume["skills"]`, `resume["projects"]`, `resume["certifications"]`, `resume["achievements"]` and computes a percentage per dimension plus an overall average. It has no database access and is not connected to any stored user-profile table. Confirmed directly: with this resume's actual (buggy) parsed output, every one of those fields is empty, so `profile_completeness()` correctly computes `0` for each — **it is behaving correctly given its input; the input is what's wrong (§5)**. The UI already labels this "Profile Completeness" (a distinct field/section from the ATS score in the `AtsResult` response shape, `ats-checker/page.tsx`'s `ProfileCompleteness` type) — no relabeling is needed; the fix belongs upstream, in the parser (§11).

## 10. Job Match analysis

Directly answering Phase 8: `JobParser.parse("ERP Application Support")`, with the AI call forced unavailable (matching the user's reported "JD: heuristic"), returns:
```json
{
  "job_title": "ERP Application Support",
  "required_skills": [], "preferred_skills": [], "responsibilities": [],
  "min_experience_years": null, "min_education": null,
  "keywords": [], "technologies": [], "certifications": [],
  "parsed_by": "heuristic"
}
```
Every Job Match category correctly reads `applicable: False` and is excluded — **never scored as a zero**. This is the "never treat missing data as zero" rule working exactly as designed (confirmed by `test_titleonly_job_description_excludes_job_match_categories_not_penalizes_them`, which also confirms — using a resume WITH real experience data — that `experience` still scores a full 100% match against a title-only JD that states no requirement, rather than being penalized for the JD's sparseness). **No bug found here.** Per the instruction, this is correctly Classification F (expected difference, not a defect) — the "N/A" pattern on the Job Match side is honest, not broken.

**Ancillary observation (not part of the user's reported case, noted for completeness):** while building the deterministic version of this test, an *undeterministic* first attempt (AI left reachable) showed that when the AI provider IS available, sending a bare 3-word job title to `JobParser`'s LLM prompt can still return a populated `required_skills` list — the model appears to infer/invent plausible requirements from the title alone, in tension with the prompt's own "never invent requirements... only include what's clearly implied" instruction. This did **not** occur in the user's reported case (their JD parse fell back to heuristic), so it's flagged here only as a separate, not-yet-triaged observation for a future investigation — not analyzed further in this doc.

**Resume ATS Health (no-JD) is computed independently**, confirmed directly (`test_no_jd_ats_compatibility_is_computed_independently_of_missing_job_description`): `ats_intelligence_v2.compute_full_analysis(resume, None)` returns a real, non-excluded `ats_compatibility` score regardless of whether a JD was supplied at all — the missing JD only excludes `job_match`, nothing else.

## 11. Root cause

**Primary — Classification A, INPUT/PARSING BUG, confidence HIGH** (deterministic, reproduced against real named entities from this exact resume, independent of any PDF-extraction uncertainty): `ResumeParser._heuristic_parse()` hardcodes `experience`/`education`/`skills`/`certifications`/`keywords` to empty regardless of input. This is the same root cause documented in `docs/ATS_SCORE_DISCREPANCY_20_VS_78_80.md` §11, now confirmed on a second, real, independently-described case.

**Secondary, same family — Classification A, confidence HIGH:** `resume_quality._all_bullets()` reads only `experience[].bullets`, blind to the heuristic parser's top-level `bullets` field (§5a).

**Tertiary — Classification A, confidence MEDIUM (HYPOTHESIS, unconfirmed):** the specific "0 standard section headers detected" / 20% formatting result likely stems from a PDF-text-extraction-shape issue (heading merged with content, and/or further garbling) specific to this PDF file, not from the heading vocabulary or the general parsing bug above. **Requires the real PDF file or its raw extracted text to confirm.**

**Not a bug — Classification F, EXPECTED:** Job Match categories reading N/A for a title-only Target Job field (§10).

## 12. Competitor comparison limitations

Same standing project policy as the prior investigation (`docs/ATS_BENCHMARK_REPORT.md` §18, `ats_config.py`'s own docstring) — restated, not re-derived, for this case:
- No data exists on what Enhancv/ResumeGyani measure or how they parse; nothing is assumed about their formulas.
- **What SahiCareer measures for this specific request:** the legacy 7-category model, with 5 of 7 categories excluded due to the parsing bug (§5) and a JD too sparse to populate the other 6 (§10) — so effectively "ATS Formatting alone," a single structural-heuristic signal, not a holistic resume assessment.
- No claim is made about whether 20, 78, or 80 is "more correct" — only that this specific SahiCareer request produced its number from far less usable signal than the resume actually contains, for reasons now traced to specific code (§5, §11), independent of any competitor's behavior.

## 13. Recommended fix (NOT applied — flagged only)

Same primary recommendation as the prior investigation, now with two additions specific to this case:

1. **(Unchanged from prior investigation)** Make `ResumeParser._heuristic_parse()` actually extract `experience`/`education`/`skills`/`certifications` — e.g. split raw text on recognized section headings (reusing `section_recognizer.SECTION_VARIANTS`) and apply line-based heuristics within each section, instead of leaving these hardcoded empty.
2. **New, specific to §5a:** when fixing #1, attach extracted bullets to their owning experience entry (not only to a disconnected top-level `bullets` list) so `resume_quality._all_bullets()` can see them — or, as a smaller independent fix, make `resume_quality._all_bullets()` also fall back to `resume.get("bullets")` when no experience entries have bullets attached.
3. **New, specific to §6/§8 (HYPOTHESIS-DEPENDENT — do not implement until confirmed against the real PDF):** if the real PDF confirms a heading+content line-merge extraction pattern, consider loosening `_looks_like_heading()`/the legacy header substring check to also recognize a known section-heading WORD at the start of a longer line (not just a full short line) — scoped narrowly (e.g. only the first ~20 characters, only exact heading-variant words) to avoid false-positive "section detected" claims elsewhere. **Not recommended blindly** — needs the real extraction artifact confirmed first, per the explicit "do not lower formatting standards just to increase the score" instruction.
4. Same UI-transparency recommendation as the prior investigation: when ≥2 categories are excluded due to a parse fallback, surface it more prominently than the current small badge.

**None of the above were implemented in this investigation.**

## 14. Before/after evidence

| Scenario | overall_score | Excluded categories | Weights used |
|---|---|---|---|
| **Actual heuristic-parsed resume + title-only JD** (this case, clean-text reconstruction) | **90** *(see note)* | keyword, skills, experience, responsibility, education, certifications | `{"formatting": 100.0}` |
| **HYPOTHESIS: heuristic-parsed resume with heading-merge extraction artifact** (§6 Variant B) + title-only JD | not separately computed — formatting alone would drive it, at ~40 vs. this row's 90 | same 6 excluded | `{"formatting": 100.0}` |
| **SIMULATED — if the parsing bug (§5) were fixed** (hand-built, correctly-structured version of the identical resume content; JD still title-only) | **98** | keyword, skills, responsibility, education, certifications (Job Match categories still correctly excluded — §10, not a bug) | `{"experience": 80.0, "formatting": 20.0}` |

**Note on the first row's 90 vs. the user's reported 20:** this is exactly the gap this doc could not close (§4, §6, §9) — my clean-text reconstruction of the same *content* scores 90 on formatting (clean single-column text, no extraction artifacts), while the user's real PDF reportedly scored 20 with "0 standard section headers detected." The **shape** of the bug (which categories get excluded, why experience/skills/education/certifications read empty) is fully confirmed and identical in both the reconstruction and the user's report. The **magnitude** of the formatting collapse specifically (90 → 20, not 90 → 90) is not explained by resume *content* — only by resume *file/extraction* — which requires the real PDF to pin down.

---

## STOP

Per the explicit instruction, this investigation stops here. No production code was changed. Awaiting approval before any fix is implemented.

**What would let this be closed out precisely, ranked by value:**
1. The real PDF file (highest value — resolves §4/§6/§9's open item directly).
2. Failing that, the raw extracted text — obtainable today, without any code change, by calling `POST /api/ats/v2/upload` with the same file and reading the `text` field of the response (`backend/routers/ats_engine.py:102-124`) — this returns pypdf's exact extraction output before any parsing happens.
3. The `report_id` from that ATS Checker run, to look up the persisted `AtsReport` row (`resume`/`job` fields in the `/api/ats/v2/report/{report_id}` response) directly.
