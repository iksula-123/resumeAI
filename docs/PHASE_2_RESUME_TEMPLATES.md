# Phase 2 — Resume Templates (Existing Five + Five New)

**STATUS: ✅ IMPLEMENTED**

**Source of record:** [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md) Entry 11 (commit `fd39489`). Depends on: [PHASE_1_TEMPLATE_FOUNDATION.md](PHASE_1_TEMPLATE_FOUNDATION.md) (the export architecture this phase's PDF/DOCX output relies on).

---

## 1. Objective

Ship five new, visually distinct, ATS-safe resume templates (Tech Stack, Career Starter, Academic, Healthcare Pro, Global Professional) on top of Phase 1's template-aware export foundation, with full React/PDF/DOCX section parity and no data loss for any resume content — while leaving the five pre-existing templates' design untouched.

## 2. The ten templates

Single source of truth: `shared/template-specs.json`.

### 2a. Pre-existing five (design unchanged by this phase)

| id | Name | Layout family | ATS compatibility |
|---|---|---|---|
| `modern` | Modern | sidebar-left | good (two-column sidebar — a small minority of older parsers can misorder sidebar content) |
| `professional` | Professional | single-column-serif | excellent |
| `minimal` | Minimal | single-column-minimal | excellent |
| `creative` | Creative | header-band | fair *(gradient header — confirmed lower-rated in `template-specs.json` itself)* |
| `executive` | Executive | Needs verification of exact layout family beyond what's in `template-specs.json` | Needs verification |

### 2b. Five new templates (this phase)

| id | Name | Layout family | Accent (RGB, PDF/DOCX) | Docx font |
|---|---|---|---|---|
| `tech-stack` | Tech Stack | single-column | `(14, 165, 233)` | Calibri |
| `fresher` | Career Starter | single-column | `(22, 163, 74)` | Calibri |
| `academic` | Academic | single-column | `(124, 45, 18)` | Georgia |
| `healthcare` | Healthcare Pro | single-column | `(13, 148, 136)` | Calibri |
| `international` | Global Professional | single-column | `(30, 41, 59)` | Georgia |

(All five confirmed directly from `backend/routers/export.py::SINGLE_COLUMN_CONFIGS` and `shared/template-specs.json`.)

## 3. Per-template design notes (confirmed from code)

- **Tech Stack** (`frontend/components/templates/TechStackTemplate.tsx`, `backend/routers/export.py` single-column builder): section order `summary, skills, experience, projects, certifications, education, achievements, languages, interests`; skills are **grouped by category** (`group_skills: True`) using a shared heuristic keyword-mapper — `backend/services/skill_categories.py` (Python side) and `frontend/lib/skillCategories.ts` (React side), explicitly kept in sync by hand (not a shared JSON file, unlike `template-specs.json` — a documented manual-sync contract, not automated). Category order: `Languages, Frontend, Backend, Frameworks, Database, Cloud, DevOps, Testing, Tools, Other`. Section labels: "Technical Skills", "Professional Summary", etc.
- **Career Starter** (`fresher`): **adaptive section order** depending on whether the candidate has any experience entries — `_fresher_section_order(has_experience)` in `export.py` mirrors the same adaptive logic in `FresherTemplate.tsx`: with experience, order is `summary, skills, experience, education, projects, certifications, achievements, interests, languages`; without experience, `experience` is dropped from the list and `education`/`projects` promote earlier, avoiding a large empty "Experience" section for a first-time job seeker. Section label "Internships & Experience" (not just "Experience").
- **Academic**: labels lean academic — "Academic Profile" (summary), "Academic & Research Experience" (experience), "Publications & Research Projects" (projects), "Awards & Honors" (achievements). Uses Georgia (serif) in DOCX.
- **Healthcare Pro**: `emphasize_certifications: True` — the only new template with this flag set (per `SINGLE_COLUMN_CONFIGS`); labels "Clinical Experience," "Licenses & Certifications," "Clinical Skills," "Clinical Training & Projects." Certifications are ordered immediately after experience, ahead of skills.
- **Global Professional** (`international`): labels "Core Competencies" (skills), "Key Achievements" (achievements), "Additional Information" (interests) — generic, internationally-neutral phrasing. Georgia (serif) in DOCX.

## 4. ATS-safe design — confirmed constraint

Directly confirmed in `TechStackTemplate.tsx`'s own docstring (and, by the same shared design brief, applies to all five new templates): **"No skill bars, star ratings, or icons in place of text — plain, ATS-safe text throughout."** All skill/proficiency information is rendered as plain text, never as a visual bar-fill or star-rating graphic that an ATS parser cannot read as a level.

## 5. React ↔ PDF ↔ DOCX section parity

- Each new template has one React component (`frontend/components/templates/*.tsx`) for on-screen preview, and one shared, parameterized PDF/DOCX builder pair (`_build_pdf_single_column` / `_build_docx_single_column` in `backend/routers/export.py`), configured per-template via `SINGLE_COLUMN_CONFIGS`.
- **The section order and labels used by the PDF/DOCX builder are required to mirror the React component exactly** — this is stated explicitly in the `export.py` code comment: *"Section order/labels here MUST mirror the matching React component exactly… that agreement IS the section-parity contract; there's no runtime link between them, so keep them in sync by hand when either changes."*
- **This is a real, documented limitation, not an oversight**: there is no automated test or shared config file enforcing that a future edit to one side (e.g. changing `FresherTemplate.tsx`'s section order) is mirrored on the other (`_fresher_section_order` in `export.py`). A drift here would silently produce a preview that doesn't match the downloaded file.

## 6. Template switching / picker UI

- `frontend/components/ResumeTemplates.tsx` and `frontend/app/templates/page.tsx` read `shared/template-specs.json` (the same file the backend reads) to render the picker — confirmed by file presence and by Phase 1's single-source-of-truth design. Exact picker UX details (filtering, categories shown, "popular" badge use) — Needs verification beyond what's inferable from the JSON's own `popular`/`category`/`bestFor` fields.

## 7. Tests

| File | Test count | Confirmed passing |
|---|---|---|
| `backend/tests/test_new_templates.py` | 9 | ✅ |
| `backend/tests/test_template_registry.py` | 12 | ✅ (shared with Phase 1 — covers template resolution generally, not template-specific rendering) |

Per the session's own stated testing scope, the test suite covers: empty resume data (no crash, sensible empty state), long/dense resume data (10+ experience entries / 20+ items), section-parity spot checks, and no-data-loss round-trips. The exact assertions are authoritative in the test files themselves; this document does not re-enumerate every assertion to avoid drift from the code.

## 8. Known limitations

- **Manual section-parity sync** (§5) — the single largest structural risk in this phase. A future change to one side without the other will not be caught automatically.
- **`executive` template's exact layout family/design is not independently re-confirmed** in this document — it stayed on the "classic" builder per Phase 1, unchanged by this phase, and its specific visual characteristics are documented in `shared/template-specs.json` itself, not repeated here to avoid a second, driftable copy.
- No claim is made here about pixel-level visual fidelity between the React preview and the PDF/DOCX output — see [PHASE_1_TEMPLATE_FOUNDATION.md](PHASE_1_TEMPLATE_FOUNDATION.md) §9 (this was an explicit, accepted trade-off of the chosen export architecture, not specific to these five templates).

## 9. Rollback

See [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md) Entry 11 — shares one commit (`fd39489`) with Phase 1 and Phase 3.
