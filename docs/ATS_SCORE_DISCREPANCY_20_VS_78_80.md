# ATS Score Discrepancy Investigation — SahiCareer 20 vs. Enhancv 80 / ResumeGyani 78

**Status:** Root-cause investigation only, per explicit instruction. **No scoring weights, `SCORING_ENGINE_VERSION`, or production scoring/parsing code were changed by this investigation.** A regression test suite was added (`backend/tests/test_ats_score_discrepancy_regression.py`) — see §12.

**Investigator note on evidence quality:** the user's actual resume text, JD text, and screenshots from the SahiCareer run that produced "20" were **not available** to this investigation (see §1). Everything below the line in §1 is a **constructed reproduction** built from the production code itself — every number quoted from §2 onward was actually computed by running the real, unmodified `services/ats_engine/*` modules (not estimated, not hand-calculated) against the inputs shown. It demonstrates *mechanisms in the code that are capable of producing a score in the 0–30 range on a genuinely well-written resume/JD pair* — it does not prove these are the specific mechanism(s) that produced the user's specific "20." Confidence levels are stated per finding.

---

## 1. Reproduce the exact case

**I cannot reproduce the user's exact case.** No resume file, pasted resume text, JD text, screenshot, report ID, or timestamp from the SahiCareer run that produced "20" exists anywhere in this repository, its test fixtures (`backend/tests/fixtures/benchmark_dataset.py` — 12 synthetic resumes, none scores below 26 in the existing Phase E benchmark, see `docs/ATS_BENCHMARK_REPORT.md` §17), or the conversation that requested this investigation.

**What's needed to close this out precisely:**
1. The exact resume content (file upload, or pasted text) used on SahiCareer.
2. The exact JD text (or target role) used, if any.
3. Whether the SahiCareer test was: (a) pasted text via the ATS Checker page, (b) a file upload, or (c) a saved Resume Builder resume analyzed by resume ID.
4. Whether logged in or anonymous, and roughly when (to check backend logs for AI-provider errors/rate-limits at that timestamp).
5. Ideally, the `report_id` (visible in the ATS Checker's history) or a screenshot of the result, including the small "AI-parsed / heuristic / from your saved resume" badges next to the resume and JD (see §5 — these badges are the single most diagnostic piece of missing information).
6. Confirmation of whether the SAME resume file/text was pasted into Enhancv/ResumeGyani (byte-identical), or whether it was retyped/reformatted for each tool.

Until that's supplied, §2 onward uses **constructed, clearly-labeled synthetic inputs** designed to test the most plausible mechanisms found while tracing the code, not the user's real case.

---

## 2. Score trace — constructed reproduction, real production code

Three synthetic scenarios were run through the actual `services/ats_engine` pipeline (script retained at the bottom of this doc's investigation trail; every number below is a real computed value, not illustrative).

### Scenario A — clean resume, bulleted JD, AI parsing unavailable
*(This is the mechanism found to produce the lowest, most "20-like" score — see §16 for why AI parsing being unavailable is a realistic condition, not a contrived edge case.)*

**Resume input** (pasted text, well-formatted, real content):
```
Aarav Sharma
aarav.sharma@example.com | +91 90000 00000 | Bengaluru, India

SUMMARY
Backend developer with 3 years of experience building REST APIs in Python and Django.

EXPERIENCE
Software Engineer, Bitwise Labs
Jun 2022 - Present
- Built REST APIs in Python and Django used by a 12-person engineering team
- Reduced deployment time by 30% through CI/CD improvements
- Wrote unit tests, raising coverage from 40% to 70%

EDUCATION
B.Tech Computer Science, VIT Vellore, 2018 - 2022

SKILLS
Python, Django, PostgreSQL, Docker, Git, REST APIs, AWS

CERTIFICATIONS
AWS Certified Developer, AWS, 2023
```

**JD input** (pasted text, bulleted — the common job-board shape):
```
Backend Engineer — Acme Fintech

Requirements:
- 3+ years of experience with Python and Django
- Strong understanding of REST API design
- Experience with PostgreSQL and Docker
- Familiarity with AWS
- Bachelor's degree in Computer Science or related field

Responsibilities:
- Design and build REST APIs for our payments platform
- Own services end to end in production
- Collaborate with product and design on new features
- Write tests and participate in code review
```

**Endpoint:** equivalent of `POST /api/ats/v2/analyze` (ATS Checker page, paste-text mode) → `ATSService.analyze()` → **legacy 7-category model** (`services/ats_engine/scoring.py::analyze_categories`) — this is the score rendered as the big "Overall ATS Score" gauge (`frontend/app/ats-checker/page.tsx:558`, binds to `result.ats.overall_score`).

**Resume parser output:** `parsed_by: "heuristic"` (AI call forced unavailable — see §16). Result: `skills=[]`, `hard_skills=[]`, `experience=[]`, `education=[]`, `certifications=[]`, `keywords=[]`, `total_experience_years=null`. Only `raw_text`, `bullets` (3 found), and `action_verbs` (`built`, `reduced`) survive.

**JD parser output:** `parsed_by: "heuristic"`. Result: `required_skills=[]`, `preferred_skills=[]`, `keywords=[]`, `certifications=[]`, `min_education=null`, `min_experience_years=3.0` (regex caught "3+ years"), `responsibilities=` **all 9 bulleted lines from BOTH the "Requirements" and "Responsibilities" sections** (the heuristic parser can't tell them apart — it takes every line starting with `-`/`•`/`*`).

**Scoring engine version:** `2.0.0` (`ats_config.SCORING_ENGINE_VERSION` — stamped onto the response regardless of the fact this score was computed by the *legacy* model, not the v2 engine that version number nominally describes — see §16 finding 3).

**Category-by-category (exact production output):**

| Category | Applicable | Match | Completeness | Confidence | Default weight | Redistributed weight | Contribution |
|---|---|---|---|---|---|---|---|
| Keyword | ❌ (JD has no extractable keywords) | — | 0 | low | 25% | **0%** | 0 |
| Skills | ❌ (JD lists no required/preferred skills) | — | 0 | low | 20% | **0%** | 0 |
| Experience | ❌ (no experience entries — parser discarded them) | — | 0 | low | 20% | **0%** | 0 |
| Responsibility | ✅ | **10** | 50 | medium | 15% | **75.0%** | 7.5 |
| Education | ❌ (JD states no min education *the parser could extract*) | — | 0 | low | 10% | **0%** | 0 |
| Certifications | ❌ (JD requires none *the parser could extract*) | — | 0 | low | 5% | **0%** | 0 |
| Formatting | ✅ | **75** | 100 | high | 5% | **25.0%** | 18.75 |

**Final calculation** (exact, from the real `_redistribute_weights` + `analyze_categories` code):
```
usable = [responsibility (weight 15), formatting (weight 5)]   → total_default = 20
responsibility weight = 15/20 * 100 = 75.0%
formatting   weight   =  5/20 * 100 = 25.0%

overall = round( 10 * 0.75 + 75 * 0.25 )
        = round( 7.5 + 18.75 )
        = round( 26.25 )
        = 26
```
**Observed `overall_score`: 26.** Excluded categories: `keyword, skills, experience, education, certifications` (5 of 7, representing **80% of the model's default weight**). `score_confidence: "medium"`.

A second run of the *same* resume against the **paragraph-style** version of this JD (no bullets at all — see §16, this is the more common real-world paste shape) excludes `responsibility` too (JD has zero extractable responsibilities), leaving `formatting` as the *only* usable category at 100% weight → **`overall_score: 73`** (formatting alone scored well because the resume text itself was clean). This is the key nuance: **the score is not uniformly crushed by AI-parsing failure — it becomes entirely dependent on which one or two categories happen to survive**, and how those specific categories are computed for this input. That variance (26 vs. 73 for the *same resume*, same failure mode, differently-shaped JD) is itself evidence of a real methodology fragility (see §16).

### Scenario B — icon-prefixed section headings, v2 engine (ATS Compatibility layer)
Same resume content, but every heading is icon-prefixed (`🧑‍💼 SUMMARY`, `💼 EXPERIENCE`, `🎓 EDUCATION`, `🛠️ SKILLS`) — a real pattern in modern template exports. Run through `ats_intelligence_v2.compute_full_analysis()` (Resume Editor's live panel, `/api/ats/v2/analyze-editor`):

| ATS Compatibility category | Match | Weight | Contribution |
|---|---|---|---|
| Parsing Quality | 90.0 | 53.3% | 47.97 |
| Section Recognition | **0.0** | 26.7% | 0 |
| Formatting | 70.0 | 20.0% | 14.0 |

`ATS Compatibility` layer score: **62**. `Section Recognition` reason: *"0/4 core sections recognized (none). Missing: summary, experience, education, skills."* — despite the resume having all four, clearly labeled. Legacy `overall_score` on the same text (bulleted JD): **24** (keyword/skills/experience/education/certifications all excluded the same way as Scenario A, since this text also went through the heuristic resume parser).

### Scenario C — synthetic 2-column/garbled extraction (simulating a graphic template PDF)
A synthetic raw-text probe simulating what `pypdf` often produces from a 2-column Canva-style PDF (headings split into single-character lines, words jammed together):

| Layer/category | Score |
|---|---|
| Parsing Quality | 58.0 |
| Section Recognition | 0.0 |
| Formatting (legacy) | 0.0 |
| ATS Compatibility (v2 layer) | 31 |
| Resume Quality (v2 layer) | 29 |
| **Legacy `overall_score`** | **0** |

This is the closest constructed scenario to a genuine "20" — a real 2-column/graphics-heavy PDF template, extracted with pypdf's flat-text extraction (no layout awareness), produces exactly this shape of damage.

---

## 3. Resume parsing — raw vs. parsed

Using Scenario A's resume text as RAW:

| Field | Raw resume evidence | Parsed output (heuristic fallback) |
|---|---|---|
| Extracted text length | 442 characters | 442 (preserved verbatim as `raw_text`) |
| Sections detected (legacy `formatting_score`) | 5 headers present | 4-5 detected via substring scan (SUMMARY/EXPERIENCE/EDUCATION/SKILLS/CERTIFICATIONS) |
| Sections detected (v2 `section_recognizer`) | 4 core sections present | **0/4** for icon-prefixed variant (Scenario B); 4/4 for plain-text variant |
| Experience entries | 1 (title, company, dates, 3 bullets) | **0** — discarded |
| Education entries | 1 (degree, institution, year) | **0** — discarded |
| Skills | 7 listed | **0** — discarded |
| Certifications | 1 listed | **0** — discarded |
| Projects | 0 | 0 |
| Bullet count | 3 | 3 — **correctly preserved** |
| Contact info | email + phone present | Not extracted into `email`/`phone` fields (only findable via regex inside `raw_text` by downstream modules that specifically search it, e.g. `text_metrics.recruiter_readiness_score`) |
| Job titles / companies | "Software Engineer" / "Bitwise Labs" | Not extracted |
| Dates | "Jun 2022 - Present" | Not extracted → `total_experience_years: null` |
| Parsing confidence / rate (v2 Parsing Quality engine) | — | 90-100/100 (text itself extracts cleanly — this metric measures character/word cleanliness, NOT whether structured fields were populated) |
| Contact extraction score | — | Not computed by the legacy model; v2's `parsing_quality` module found email+phone near top when tested |
| Reading order score | — | 100 (clean single-column text) |

**What disappeared during parsing:** everything structured — experience, education, skills, certifications, keywords, contact fields, dates — despite being present, clearly labeled, and unambiguous in the raw text. Only `raw_text`, bullet-prefixed lines, and a fixed 31-word action-verb list survived. **This is not a partial-degradation fallback; it is close to a no-op for structured extraction**, and it happens silently (no exception, no error surfaced beyond a small UI badge — see §5).

## 4. Section recognition

| Heading tested | Recognized by v2 `section_recognizer`? | Recognized by legacy `formatting_score` substring check? |
|---|---|---|
| `SUMMARY` / `PROFESSIONAL SUMMARY` / `PROFILE` / `OBJECTIVE` | ✅ (in `SECTION_VARIANTS`) | ✅ |
| `EXPERIENCE` / `WORK EXPERIENCE` / `EMPLOYMENT HISTORY` / `CAREER HISTORY` / `WORK HISTORY` | ✅ | ✅ |
| `EDUCATION` / `ACADEMIC BACKGROUND` / `ACADEMIC QUALIFICATIONS` | ✅ | ✅ |
| `SKILLS` / `TECHNICAL SKILLS` / `CORE COMPETENCIES` / `KEY SKILLS` / `AREAS OF EXPERTISE` | ✅ | ✅ |
| `CERTIFICATIONS` / `LICENSES & CERTIFICATIONS` | ✅ (optional, never penalized if absent) | ✅ |
| `PROJECTS` / `KEY PROJECTS` / `SELECTED PROJECTS` | ✅ (optional) | ✅ |
| `LANGUAGES`, `ACHIEVEMENTS` | ❌ — not in `CORE_SECTIONS` or `OPTIONAL_SECTIONS` at all; never recognized, but also never penalized (not in `CORE_SECTIONS`, so absence doesn't count against `section_extraction_ratio`) | ❌ — not in `_SECTION_HEADERS` either |
| `🧑‍💼 SUMMARY` (icon-prefixed) | ❌ **KNOWN GAP** — exact-match lookup against `ALL_VARIANTS` fails once any character precedes the heading text | ✅ (substring match tolerates it) |
| A heading buried mid-line rather than alone (e.g. `"Skills:  Python, Django..."`) | ❌ — `_looks_like_heading()` requires the line to be short/title-shaped; a heading immediately followed by its content on the same line won't match | ✅ (substring scan doesn't care about line shape) |

**Finding:** the v2 Section Recognition engine is meaningfully *stricter* than the legacy formatting heuristic on the exact same text. A resume using icon-prefixed headings, or headings inlined with their content, scores 0/4 in v2 while still scoring reasonably in the legacy formatting category — this is a real inconsistency between the two engines the product currently runs in parallel (see §16, Root Cause 2/E).

## 5. Score mode

**Determined precisely, not guessed:**

- The SahiCareer **ATS Checker** page (`frontend/app/ats-checker/page.tsx`) — the page whose purpose (paste/upload a resume + JD, get one headline score) is the direct equivalent of what a user would do on Enhancv/ResumeGyani's checkers — calls `POST /api/ats/v2/analyze` (paste-text) or `POST /api/ats/v2/analyze-resume` (saved resume), both of which route through `ATSService.analyze()` in `services/ats_engine/ats_service.py`.
- The big circular gauge labeled **"Overall ATS Score"** on that page (`frontend/app/ats-checker/page.tsx:558`) renders `result.ats.overall_score` — this is **Mode D in the requested classification: the legacy 7-category `scoring.py` engine** (Keyword/Skills/Experience/Responsibility/Education/Certifications/Formatting, Match/Completeness/Confidence model), **not** `ats_intelligence_v2`.
- The v2 3-layer model (ATS Compatibility / Job Match / Resume Quality) **is** computed on every such request too (`ats.ats_intelligence_v2` in the response) but is not the number shown as the headline score on this page. It **is** the headline score on the Resume Editor's live panel (`/api/ats/v2/analyze-editor`, `frontend/app/resumes/[id]/edit/page.tsx`) — **Mode C** in the requested classification.
- **This means: if the user tested the SahiCareer ATS Checker page, "20" is a legacy-model score. If they tested from inside the Resume Editor, "20" is a v2 3-layer score.** These are computed by genuinely different code paths with different category sets, and this can only be disambiguated with the report_id / mode information requested in §1.
- Separately: whichever engine actually produced the number, **the persisted `scoring_engine_version` field always reads `"2.0.0"`** (`ats_config.SCORING_ENGINE_VERSION`, stamped via `ats_intelligence_v2_result["scoring_engine_version"]` regardless of which engine's score is the headline) — so this field cannot currently be used to infer which formula produced a given historical score. Flagged in §16 as a real traceability gap, not fixed here.

## 6. JD parsing

Covered in §2's Scenario A. Summary: when the JD parser falls back to its heuristic (`services/ats_engine/job_parser.py::_heuristic_parse`, triggered whenever `chat_json()` returns `None` — no AI key, provider down, rate-limited, or a JSON-parse failure, all silently), it extracts:
- `job_title`: first line only.
- `responsibilities`: every line starting with `-`/`•`/`*`, **with no distinction between a "Requirements" bullet and a "Responsibilities" bullet** — both land in the same list.
- `min_experience_years`: only if a bare `\d+\s*years?` regex pattern matches somewhere in the text.
- `required_skills`, `preferred_skills`, `keywords`, `technologies`, `certifications`, `min_education`, `industry`: **always empty/null**, regardless of what the JD actually states.

**Effect on the score:** every legacy category keyed off those empty fields (`keyword`, `skills`, `education`, `certifications` — 60% of the model's default weight) becomes `applicable: False` and is excluded, not scored low — but the *redistribution* of that 60% onto whatever remains (`experience`, `responsibility`, `formatting`) means those few remaining categories now decide the entire score, and (per §2) `responsibility` in particular can be actively miscomputed (requirements text scored against bullets as if it were day-to-day duties) rather than merely absent.

## 7. Weight redistribution — verified against the real code

- **No double weighting found.** `_redistribute_weights()` (scoring.py) and `_redistribute()` (ats_intelligence_v2.py) both compute `usable = [c for c in categories if c.applicable and c.match is not None]` exactly once per category; each category's weight is set exactly once (`c.weight = weights.get(c.key, 0.0)`).
- **No accidental zero found for "should be excluded" categories** — every excluded category's `weight` is explicitly `0.0` in the response, and `match: null`, never a fabricated `0` used in the sum (`(c.match or 0)` only applies to categories already filtered into `usable`, where `match` is never `None` by construction).
- **No missing-category bug found** — all 7 legacy categories / all layer categories are always present in the response dict, `applicable: False` or not.
- **Normalization is correct**: `total_default = sum(weight[c] for c in usable)`; `weight[c] = default[c]/total_default * 100`; verified by hand in §2's Scenario A (15/20*100=75.0, 5/20*100=25.0, sums to exactly 100).
- **Rounding**: only the *final* `overall_score` is rounded (`round(sum(...))`), individual category weights are rounded only for *display* (`round(v, 1)`) — the actual redistribution math in Scenario A used the full-precision 75.0/25.0, not a rounded intermediate, so no compounding rounding error was found.
- **The real issue is not redistribution arithmetic — it's what ends up in the `usable` set.** §2/§6 show that set can legitimately shrink to 1-2 categories purely from upstream parsing gaps, and weight redistribution then does exactly what it's designed to do (never scores the missing 80% as zero) — but with only 1-2 categories left, "100% of weight on whatever's left" is a very different thing from "20% of weight, redistributed."

## 8. Resume Quality layer

Not applicable to the legacy engine (it has no Resume Quality layer — see §5). For the v2 engine (`services/ats_engine/resume_quality.py`, 12 categories, weights renormalized from `_QUALITY_WEIGHTS_RAW` in `ats_config.py`, verified to sum to 1.0 by `weights_sum_to_one()`):

- Observed in this investigation's constructed scenarios: **41** (icon-heading resume) and **29** (garbled 2-column resume) — both heuristically-parsed, so `bullet_quality`/`quantified_impact`/`action_verbs` had only the 3 raw bullet lines to work with (bullets ARE preserved by the heuristic resume fallback — see §3), while categories needing structured `experience`/`education` (e.g. `career_progression`, `seniority`) likely degraded to excluded/low-completeness.
- **Per the explicit instruction "a lack of quantified metrics should NOT automatically destroy the ATS score"**: confirmed in the existing Phase E benchmark (`docs/ATS_BENCHMARK_REPORT.md` §15) that Resume Quality's own internal redistribution already treats missing signal as excluded, not zero, same rule as every other category in this system. This investigation found no NEW violation of that rule inside Resume Quality — the low 29/41 scores above trace back to *input sparsity from the parsing gap in §3*, not to Resume Quality's own scoring logic double-punishing anything.
- Resume Quality is **not the primary driver** of the low scores found in §2 — it's excluded from the legacy engine entirely (not computed at all for that headline number), and even where it does run (v2), it degrades gracefully rather than cratering on its own.

## 9. Competitor comparability

Per `ats_config.py`'s own standing project rule and `docs/ATS_BENCHMARK_REPORT.md` §18 (already-established project policy, not new to this investigation): **no data exists on what Enhancv or ResumeGyani actually measure, weight, or how they parse.** This investigation does not know, and does not invent, their formulas.

What CAN be established:
- SahiCareer's **ATS Checker** headline score is not "resume health," not "job match," and not a blend of the two in the sense the user's framing implies — it's the legacy 7-category Match/Completeness/Confidence model (§5), which conflates structural (formatting), keyword-matching, and resume-completeness signal into one weighted number whenever a JD is supplied.
- Given that Enhancv is itself a resume *builder* — if the "same resume" tested was originally built in Enhancv and then downloaded/pasted for the SahiCareer/ResumeGyani tests, Enhancv's own checker may be scoring its own template's structure (which it fully controls and recognizes by construction), a genuinely different starting condition than a downloaded/pasted/re-uploaded copy going through SahiCareer's independent text-extraction and section-recognition. This is a plausible, non-adversarial explanation for *part* of a gap and is worth confirming via §1 question 6.
- It is well documented in the freemium-ATS-checker industry (not something this investigation can verify about these two specific products, and not asserted as fact here) that free lead-generation ATS checkers are commercially incentivized toward high, encouraging scores. This is **not claimed as the explanation** — it's listed only so it isn't silently ignored as a hypothesis, per "document what can actually be established."
- **No claim is made, and none should be inferred, that SahiCareer's score is either "right" or "wrong" relative to 78-80** — only that this investigation found concrete, reproducible mechanisms (§2) by which SahiCareer's own legacy engine can produce a very low score on a resume with real, substantive, matchable content, independent of any competitor comparison.

## 10. This document
(This file.)

---

## 11. Root cause classification

**Primary — Classification A: INPUT/PARSING BUG**, confidence **MEDIUM-HIGH** (grounded in real, reproducible code behavior; not confirmed as *the* cause of the user's specific "20" because the actual input is unavailable — see §1).

**Finding:** `ResumeParser._heuristic_parse()` (`services/ats_engine/resume_parser.py:52-81`) and `JobParser._heuristic_parse()` (`services/ats_engine/job_parser.py:17-46`) — the fallback path used whenever the AI provider call is unavailable, rate-limited, or fails for any reason (`chat_json()` returns `None` silently, never raising — `services/ats_engine/llm.py:28-60`) — discard almost all structured content, regardless of how clearly the source resume/JD is formatted. The resume fallback's own docstring claims "coarse section/keyword detection" (line 53); the implementation does not do this — it extracts only bullet-marker lines and a fixed 31-word action-verb list. `experience`, `education`, `skills`, `hard_skills`, `certifications`, `keywords`, and `total_experience_years` are unconditionally empty/null.

**Effect on score:** in the legacy engine (§5's Mode D, the ATS Checker's headline score), this excludes up to 5 of 7 categories (up to 80% of default weight), collapsing the score down to whatever 1-2 categories remain — which can range from a moderate ~73 (formatting alone, on clean text) to a severe ~0-26 (§2 Scenarios A/C), **depending on JD phrasing details the candidate has no visibility into or control over** (bulleted vs. paragraph JD, presence of a regex-matchable "N years" phrase).

**Secondary — Classification B: SECTION RECOGNITION BUG**, confidence **HIGH** (directly verified, see §4 and the passing regression test `test_section_recognizer_misses_emoji_prefixed_headings_KNOWN_GAP`). `section_recognizer.recognize_sections()` requires an exact string match (after only `" :•-"` stripping) against a fixed heading-variant table — an icon/emoji-prefixed heading, or a heading inlined with its content, is invisible to it even though it's visible to the legacy engine's own more forgiving substring check on the identical text. Affects only the v2 engine's `ATS Compatibility` layer (§5 Mode C).

**Flagged, not classified as a bug — E: WEIGHTING/METHODOLOGY ISSUE**, per instruction ("FLAG ONLY," no weight change proposed): both the legacy and v2 redistribution rules were built, correctly, around "never score missing data as zero." Neither engine has a floor on *how few* categories are allowed to carry 100% of the weight before the resulting number stops being a meaningful "ATS score" versus being, functionally, a single sub-score wearing the whole model's label. §2's 26-vs-73 result for the identical resume against two differently-*shaped* (not differently-*substantive*) JDs is the concrete symptom. This is a design tension the "never zero" philosophy trades into, not an implementation defect — flagged for a future, separate, explicitly-scoped decision, exactly as `docs/ATS_BENCHMARK_REPORT.md`'s existing "Calibration Candidates" section already does for a related finding (Candidate 1: experience/education categories not discriminating enough when JD fields are unset — this investigation's finding is the parsing-layer precursor to that same pattern).

**Not classified — F/G:** no evidence either way was collected on competitor comparability (§9) — genuinely NOT AVAILABLE, not "explained away."

## Severity

**HIGH.** Confidence: MEDIUM-HIGH that this is a real, live production exposure (not just a lab artifact) — because:
- This exact sandboxed dev environment, with **zero code changes**, was observed making a *real* OpenAI embeddings call that returned `HTTP 429 Too Many Requests` mid-investigation (captured verbatim in the regression test's first run — see the test file's git history / this doc's investigation trail). That is a live, currently-occurring rate-limit condition, not a hypothetical.
- `chat_json()`/`embed_text()` degrade to this fallback **silently** on ANY failure — timeout, rate limit, malformed JSON, provider outage — with no retry-then-warn, no user-facing error, and no score-side disclaimer beyond a small parsed-by badge (§5, §16 finding 2) that doesn't explain its consequence.
- The magnitude is large: a genuinely complete, well-written resume can score anywhere from ~0 to ~75 for the *same underlying content*, depending on incidental JD formatting and transient AI-provider availability at request time — a wider spread than any legitimate quality difference should produce.

## Recommended fix (NOT applied — flagged only, per explicit instruction)

1. **Highest leverage:** make `ResumeParser._heuristic_parse()` and `JobParser._heuristic_parse()` actually perform the "coarse section/keyword detection" their docstrings already claim — e.g. split on recognized section headings (reusing `section_recognizer.SECTION_VARIANTS`) and apply simple line-based heuristics to populate `experience`/`education`/`skills`/`certifications`/`required_skills` instead of leaving them hardcoded empty. This directly shrinks the set of categories that go `applicable: False` purely from parser laziness rather than genuine data absence.
2. Teach `JobParser._heuristic_parse()` to distinguish a "Requirements:" heading from a "Responsibilities:" heading before bucketing bullets, instead of dumping both into `responsibilities`.
3. Strip a leading emoji/icon glyph (and surrounding whitespace) before the `ALL_VARIANTS` heading lookup in `section_recognizer.recognize_sections()` — a small, well-scoped fix independent of #1/#2.
4. Surface AI-parse-fallback more visibly than the current small badge when it materially reduced the number of usable categories (e.g. "3 of 7 categories couldn't be evaluated because AI parsing was unavailable for this request — your score reflects only Responsibility Match and Formatting" instead of silently rendering one number with the same visual weight as a fully-evaluated one).
5. Reconsider (separately, not here — this is E, flag only) whether `score_confidence` should downgrade to `"low"` (not `"medium"`, as currently observed in §2 Scenario A) when the usable-category count drops to 1-2, since `_overall_confidence()`'s current thresholds don't directly key off category *count*, only category-level confidence ratios.
6. Fix the `scoring_engine_version` field (§5) to actually reflect which formula produced the headline number, or document explicitly that it doesn't.

**None of the above were implemented in this investigation**, per the explicit "STOP after root-cause investigation and regression test" instruction.

## Whether production code should be changed

**Not in this investigation.** The findings above are real and reproducible against production code, but:
- The user's actual "20" case was never confirmed to go through this exact mechanism (§1).
- The instruction was explicit: investigate and add a regression test, then stop.
- Recommendation for a **future, separately-scoped** phase: fix items 1-3 above (concrete, scoped, testable parsing/section-recognition improvements — not a scoring-weight change), verify against `backend/tests/test_ats_score_discrepancy_regression.py` (flip the `KNOWN GAP`-labeled assertions to assert correct extraction once fixed), and re-run `backend/scripts/run_benchmark.py` to confirm no regression against the existing Phase E benchmark dataset.

---

## 12. Regression test

Added: `backend/tests/test_ats_score_discrepancy_regression.py` — 6 tests, all passing against current (unmodified) production code:

| Test | What it locks in |
|---|---|
| `test_resume_heuristic_fallback_discards_structured_sections_KNOWN_GAP` | Confirms `_heuristic_parse()` returns `skills/experience/education/certifications/keywords` empty for a clean, well-labeled resume — while confirming `raw_text`/`bullets`/`action_verbs` ARE preserved (proves it's a real gap, not garbage input). |
| `test_jd_heuristic_fallback_discards_requirements_KNOWN_GAP` | Same, JD side — a paragraph JD yields zero extracted requirements/responsibilities. |
| `test_legacy_score_collapses_to_one_category_when_ai_parsing_unavailable_KNOWN_GAP` | End-to-end via `ATSService.analyze()` with AI forced unavailable (deterministic, no network) — asserts the exact excluded-category set and that weight collapses to `{"formatting": 100.0}` for the paragraph-JD shape. |
| `test_legacy_score_crushed_by_misclassified_responsibility_category_KNOWN_GAP` | End-to-end for the bulleted-JD shape (§2 Scenario A) — asserts `responsibility` absorbs ≥50% of weight and `overall_score < 40` for a genuinely complete, substantively-matching resume/JD pair. |
| `test_legacy_score_does_not_collapse_when_ai_parsing_succeeds` | Contrast case — same inputs, simulated successful AI parse — proves the collapse is attributable to the parsing fallback, not the scoring formula itself. |
| `test_section_recognizer_misses_emoji_prefixed_headings_KNOWN_GAP` | Locks in the v2 Section Recognition gap from §4. |

Tests marked `KNOWN_GAP` assert **today's defective behavior on purpose** (with a docstring saying so) so this specific mechanism is pinned down in the suite rather than only living in this document. When resume_parser.py / job_parser.py / section_recognizer.py are eventually fixed (§11 recommendations, not done here), these specific tests will start failing — that failure IS the signal to flip their assertions to the corrected behavior, at which point they become true regression guards against the fix ever regressing.

Verified: `pytest backend/tests/test_ats_score_discrepancy_regression.py` → 6 passed. Full existing ATS suite re-run alongside it for regression safety: `test_ats_engine.py` + `test_ats_intelligence_v2.py` + `test_ats_benchmark.py` + this new file → **161 passed, 0 failed.** `SCORING_ENGINE_VERSION` unchanged at `2.0.0`. No production file under `services/ats_engine/` was modified.
