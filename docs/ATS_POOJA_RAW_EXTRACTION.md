# ATS Pooja — Raw PDF Extraction Diagnostic

**Purpose:** Phase F2 Step 1 — capture the ACTUAL raw text extracted from the real uploaded PDF, unmodified, before any analysis. This supersedes the earlier investigations' constructed/hypothesized inputs (`docs/ATS_CASE_STUDY_POOJA_SCORE_20.md`, `docs/ATS_SCORE_DISCREPANCY_20_VS_78_80.md`) — this document is built from a real file found on disk, not a reconstruction.

## File identification

Five real files matching "Pooja" were found in `C:\Users\Ranjeet\Downloads\`. The file used for this investigation is:

**`Pooja Ranjeet Yadav (1).pdf`** (57,010 bytes, created 2026-08-10 10:10:29)

**Why this specific file, not one of the others:** four other files exist (`Pooja Ranjeet Yadav Resume (AI Upgraded).pdf` and its `(1)`/`(2)`/`(3)` variants, created later the same day, 10:24–12:24), plus four more with an unusual space-separated filename pattern (`P o o j a R a n j e e t Y a d a v Resume (AI Upgraded)...pdf`, created even later, 13:07–16:18 — see "Ancillary finding" below). The "AI Upgraded" files were extracted and inspected too: they contain only 4 sections (SUMMARY/EXPERIENCE/EDUCATION/SKILLS, AI-rewritten wording, no CERTIFICATIONS/TECHNICAL EXPOSURE/LANGUAGES/TARGET ROLES sections) — they do not match the resume content described in `docs/ATS_CASE_STUDY_POOJA_SCORE_20.md` (which explicitly listed 8 sections including TECHNICAL EXPOSURE, LANGUAGES, and TARGET ROLES). `Pooja Ranjeet Yadav (1).pdf` is the only file whose content matches that description exactly (same 8 section headings, same bullet content verbatim, same skills list verbatim, same certification text verbatim) — confirmed by direct comparison, not assumed.

## Extraction method

Exactly the production code path, unmodified: `services/ats_engine/resume_parser.py::extract_text()` → `pypdf.PdfReader(io.BytesIO(data))`, text pulled via `page.extract_text()` for each page, joined with `"\n"`. No cleaning, no normalization applied for this diagnostic capture.

## Basic stats

- **Pages:** 2 (page 0: 2,802 chars; page 1: 1,032 chars)
- **Character count:** 3,835
- **Line count:** 66 (all 66 non-empty — no blank lines in the extracted output)
- **Page break location:** falls mid-way through the SKILLS list (`"Client Support & Communication"` end of page 0 → `"T icket Management"` start of page 1) — NOT at a heading boundary, no content lost or duplicated at the join.

## Full raw extraction (all 66 lines — this resume is short enough that "first 100 lines" is the entire document)

```text
Line 1:  P o o j a  R a n j e e t  Y a d a v
Line 2:  poojaryadav9500@gmail.com   |  Mumbai, Maharashtra, India
Line 3:  S U M M A R Y
Line 4:  ERP  Application Support professional with 3+ years of experience at V igo Infotech, supporting the SmartERP  product. 
Line 5:  Experienced in client support, ticket resolution, ERP  issue troubleshooting, requirement gathering, functionality 
Line 6:  enhancements, UA T , functional testing, and bug verification. Skilled at understanding client requirements, coordinating 
Line 7:  with development teams, validating fixes, and providing user support.
Line 8:  Additionally , brings 4 years of private-school teaching experience, demonstrating strong communication, user training, 
Line 9:  problem-solving, documentation, and stakeholder -handling skills. M.Com graduate with a certified Software T esting 
Line 10: course.
Line 11: E D U C A T I O N
Line 12: Master of Commer ce (M.Com)
Line 13: E X P E R I E N C E
Line 14: ERP  Application Support / Pr oduct Support 15 April 2023 – Present
Line 15: V igo Infotech
Line 16: Product: SmartERP
Line 17: • Provide day-to-day application support to clients using the SmartERP  ERP  platform.
Line 18: • Handle client-reported issues, support tickets, and functionality-related queries.
Line 19: • T roubleshoot ERP  application issues and analyse problems based on client requirements and business scenarios.
Line 20: • Gather and understand client requirements for new functionality and modifications to existing ERP  features.
Line 21: • Coordinate with developers to communicate functional requirements and required product changes.
Line 22: • Follow up with the development team throughout implementation and issue resolution.
Line 23: • Perform UA T  and functional testing for new features, enhancements, and bug fixes.
Line 24: • V erify reported defects after development fixes and confirm successful resolution.
Line 25: • Perform regression checks to ensure functionality changes do not af fect existing features.
Line 26: • Communicate with clients to understand requirements and explain solutions.
Line 27: • Support users after functionality changes and assist with updated features.
Line 28: • W ork as a bridge between clients, support, testing, and development teams.
Line 29: • Follow up on open issues, enhancements, and client requests to ensure timely resolution.
Line 30: T eacher 4 Y ears
Line 31: Private School
Line 32: • Planned and delivered lessons according to students' learning requirements.
Line 33: • Communicated complex topics clearly and ef fectively to students.
Line 34: • Managed day-to-day classroom activities and addressed individual queries.
Line 35: • Developed strong communication, problem-solving, coordination, and interpersonal skills.
Line 36: • Maintained records and coordinated with students, parents, and school staf f.
Line 37: • Adapted teaching methods based on individual learning needs.
Line 38: • Supported students in understanding new concepts and resolving dif ficulties.
Line 39: T E C H N I C A L  S K I L L S
Line 40: ERP  Application Support
Line 41: SmartERP  Product Support
Line 42: Client Support & Communication
Line 43: T icket Management
Line 44: Issue T roubleshooting
Line 45: Requirement Gathering & Analysis
Line 46: Functional Analysis
Line 47: UA T  & Functional T esting
Line 48: Bug Identification & V erification
Line 49: Regression T esting
Line 50: T est Case Execution
Line 51: Functionality Enhancement
Line 52: Developer Coordination
Line 53: User T raining & Assistance
Line 54: Problem Solving
Line 55: Stakeholder Communication
Line 56: C E R T I F I C A T I O N S
Line 57: Software T esting Course – Certified
Line 58: T E C H N I C A L  E X P O S U R E
Line 59: ERP: SmartERP  Frontend: React.js – Product/T echnical Exposure Backend: Node.js – Product/T echnical Exposure 
Line 60: T esting: Functional T esting, UA T , Bug V erification, Regression T esting Support: Client Support, T icket Resolution, 
Line 61: Issue Analysis Requirements: Requirement Gathering, Functional Analysis, Enhancement Requests
Line 62: L A N G U A G E S
Line 63: English Hindi Marathi
Line 64: T A R G E T  R O L E S
Line 65: ERP  Application Support Analyst | Application Support Analyst | Application Support Engineer | ERP  Functional 
Line 66: Consultant | Product Support Engineer | Software Support Analyst | Junior Business Analyst | QA/T est Analyst
```

## Section-like headings found (verbatim, as extracted)

| Line | Extracted text | Intended heading |
|---|---|---|
| 1 | `P o o j a  R a n j e e t  Y a d a v` | (candidate name, not a section heading) |
| 3 | `S U M M A R Y` | SUMMARY |
| 11 | `E D U C A T I O N` | EDUCATION |
| 13 | `E X P E R I E N C E` | EXPERIENCE |
| 39 | `T E C H N I C A L  S K I L L S` | TECHNICAL SKILLS |
| 56 | `C E R T I F I C A T I O N S` | CERTIFICATIONS |
| 58 | `T E C H N I C A L  E X P O S U R E` | TECHNICAL EXPOSURE |
| 62 | `L A N G U A G E S` | LANGUAGES |
| 64 | `T A R G E T  R O L E S` | TARGET ROLES |

**Every single heading — and the candidate's own name — is extracted with a space inserted between every individual letter.** Multi-word headings show a DOUBLE space at the word boundary (e.g. `T E C H N I C A L  S K I L L S` — single spaces within each word, double space between "TECHNICAL" and "SKILLS").

## Suspicious lines / merged lines

None of the classic "merged heading + content on one line" pattern (e.g. `EXPERIENCEERP Application Support`) was found anywhere — every heading IS on its own line. The anomaly is entirely intra-line letter-spacing, not line-merging.

One heading-adjacent merge exists: line 14, `"ERP  Application Support / Pr oduct Support 15 April 2023 – Present"` — the job title and the date range are on the same extracted line (no line break between them in the source PDF), which is a normal, common resume layout (title and dates side-by-side), not a defect.

## Whitespace anomalies

- **Double spaces are pervasive**, appearing after nearly every "ERP" (`"ERP  Application"`, `"ERP  issue"`, `"ERP  platform"`, `"ERP  features"`), after "SmartERP" (`"SmartERP  product"`, `"SmartERP  Product Support"`, `"SmartERP  ERP"`), between the two words of every multi-word heading, and around several other short tokens.
- **Single extra spaces mid-word**, at specific letter-pair boundaries: `V igo` (V+igo), `Pr oduct` (Pr+oduct), `T eaching`/`T eacher`/`T icket`/`T roubleshoot`/`T esting`/`T raining`/`T echnical`/`T est` (T+rest-of-word, repeatedly), `V erify`/`V erification` (V+erify), `W ork` (W+ork), `Commer ce` (Commer+ce), `ef fectively`/`af fect`/`staf f`/`dif ficulties` (ff digraph split), `UA T` (UA+T, appearing standalone e.g. "UA T ," and inside "UA T & Functional T esting"). This is a **narrower, separate artifact** from the full letter-by-letter heading spacing — see "Root cause" below for why these are mechanically different phenomena, and "Remaining issues" for why this one is NOT fixed in this phase.
- No leading/trailing whitespace anomalies, no tab characters found.

## Repeated characters

**None found.** A regex scan for any character repeated 5+ times consecutively (`(.)\1{4,}`) returned zero matches anywhere in the extraction.

## Page-break artifacts

**None of concern.** The page boundary falls mid-list (inside the SKILLS section, between `"Client Support & Communication"` and `"T icket Management"`) — no heading, no bullet, no sentence is split or duplicated across the page join.

## Other checks (Step 3 requirements)

| Check | Result |
|---|---|
| Control characters (`\x00`-`\x08`, `\x0b`, `\x0c`, `\x0e`-`\x1f`) | **0 found** |
| Unicode replacement character (`\ufffd`) | **0 found** — a bullet glyph appeared as `�` in this investigation's own terminal output, but the actual extracted Python string contains a real Unicode `•` (U+2022 BULLET); confirmed directly via `ord()`/`unicodedata.name()`. This was a terminal-display artifact of this investigation, not a defect in the extracted data. |
| Zero-width characters (`\u200b`, `\u200c`, `\u200d`, `\ufeff`) | **0 found** |
| Non-breaking spaces (`\xa0`) | **0 found** |
| Non-printable characters (any) | **0 found** |
| Multi-column extraction / reading-order disorder | **Not detected** — `parsing_quality.py`'s `reading_order_score` on this raw text is 100 (no short-line-run column artifact, no summary-out-of-order signal) |
| Font encoding corruption | **Not detected** — `parsed_character_ratio` is 1.0 (no control/replacement-character corruption); the letter-spacing artifact is a POSITIONING issue (gaps between correctly-decoded glyphs), not a character-decoding issue |

## Ancillary finding (not part of Step 1's scope, noted for completeness)

Four files with a bizarre space-separated FILENAME (`P o o j a R a n j e e t Y a d a v Resume (AI Upgraded) (1).pdf`, etc.) also exist in the same Downloads folder, created later the same day. This is consistent with — and independent corroborating evidence for — the same letter-spacing phenomenon: if a browser or export flow derives a downloaded file's name from extracted/rendered text that itself carries this artifact, the same per-letter-spacing would show up in the filename too. Not investigated further — out of scope for Phase F2, noted only so it isn't mistaken for a coincidence if it comes up again.

## Root cause (mechanical explanation)

This is a well-documented, real category of PDF-text-extraction behavior, not specific to `pypdf`: `pypdf.PdfReader.extract_text()` reconstructs words by inserting a space whenever the horizontal gap between two consecutive glyphs on the same line exceeds an internal threshold relative to expected character width. Most PDF authoring tools space normal body text tightly enough that this never triggers. This resume's section headings (and the candidate's name) were evidently styled with wide letter-spacing/tracking — a very common typographic design choice for resume section headings (visually distinct, "spread out" caps) — which means the ACTUAL on-page distance between adjacent letters in "EXPERIENCE" is close to or exceeds the same distance pypdf expects between separate WORDS, so it inserts a space after every letter. The narrower single-mid-word-split artifact (`V igo`, `T icket`, etc.) is mechanically the same phenomenon at a much smaller scale — specific letter-pair kerning in the resume's chosen font/weight (likely a bold or semi-bold body-text style applied inconsistently, or particular kerning-pair advance widths) occasionally crosses the same gap threshold for isolated letter pairs, without full-word spacing.

This is **Classification A — PDF EXTRACTION**, per the investigation's own framework: the extraction call itself is not misconfigured or buggy (pypdf is accurately reporting the glyph positions the PDF actually contains) — the fix, if any, belongs in a normalization step applied to the extracted text, not in `section_recognizer.py`'s heading vocabulary or matching logic (which is exactly why `section_recognizer.py` was NOT modified — see the accompanying fix report).

See `docs/ATS_CASE_STUDY_POOJA_FORMATTING_FIX.md` for the section-recognition debug trace, before/after scores, the fix, and regression tests.
