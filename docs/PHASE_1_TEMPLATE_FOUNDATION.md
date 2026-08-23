# Phase 1 — Template-Aware Export Foundation

**STATUS: ✅ IMPLEMENTED**

> Note: this is unrelated to the pre-existing git commit `96fb61f`, whose own message calls itself "SahiCareer 'My Resume' — Phase 1 (milestones A–I)." That commit predates this documentation set and covers different, unverified work. See [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md) Entry 5. This document is about the template/export architecture only.

**Source of record:** [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md) Entry 11 (commit `fd39489`). Related: [PHASE_2_RESUME_TEMPLATES.md](PHASE_2_RESUME_TEMPLATES.md) (the five new templates that were built on top of this foundation), [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. Objective

Before this phase, resume PDF/DOCX downloads **always rendered one hardcoded design**, regardless of which template the user had selected in the Resume Builder UI. The template picker changed the on-screen preview only. This phase made `template_id` the actual, enforced source of truth for both PDF and DOCX export.

## 2. Problem statement (as found)

- The React preview (`frontend/components/ResumeTemplates.tsx`) rendered per-template styling.
- `backend/routers/export.py` (PDF) and the DOCX equivalent ignored `template_id` entirely and called one fixed builder function.
- Result: a user could select "Creative," see it correctly on screen, and download a PDF that looked like "Modern."

## 3. Architecture decision: Option B (server-side layout families)

Two options were considered; **Option B was chosen and approved**:

| Option | Description | Why not / why chosen |
|---|---|---|
| A — Headless-browser rendering (e.g. Puppeteer/Playwright rendering the actual React component to PDF) | Pixel-perfect parity with the web preview | **Rejected** — infra cost (headless Chromium on the server) and licensing concerns (some HTML→PDF toolchains are AGPL, which is incompatible with the project's needs) |
| **B — Per-template server-side builders grouped into reusable layout families** (chosen) | Native `fpdf2` (PDF) / `python-docx` (DOCX) generation, parameterized per template | No headless browser, no AGPL dependency, predictable server cost. Trade-off: PDF/DOCX output is not pixel-identical to the React preview, but is visually distinct per template family and ATS-safe by construction. |

## 4. `shared/template-specs.json` — single source of truth

- **File:** `shared/template-specs.json`
- **Read by:** `frontend/components/ResumeTemplates.tsx` (picker UI) **and** `backend/routers/export.py` (export). There is deliberately no second, hand-maintained copy of the template list on either side.
- **Shape per template:** `id`, `name`, `category`, `description`, `layoutFamily`, `accent`, `font`, `sections` (ordered list), `atsCompatibility` (`excellent` / `good` / `fair`), `atsNotes`, `bestFor`, `status` (`available`), and optionally `popular: true`.
- **Confirmed contents today — 10 templates**, `layoutFamily` values in parentheses:
  - `modern` (sidebar-left), `professional` (single-column-serif), `minimal` (single-column-minimal), `creative` (header-band), `executive` — the five pre-existing templates
  - `tech-stack`, `fresher`, `academic`, `healthcare`, `international` — the five new templates (see [PHASE_2_RESUME_TEMPLATES.md](PHASE_2_RESUME_TEMPLATES.md))
- `sectionTypes` (the canonical list of all possible resume sections) is also defined once here: `summary, experience, education, skills, projects, certifications, achievements, languages, interests`.

## 5. `template_id` resolution rule

Implemented in `backend/routers/export.py::_resolve_template_id()`. Exactly one of two paths is taken, and they are never mixed:

1. **`resume_id` present (a saved resume)** — the resume's own `Resume.template_id` column in the database **always wins**. Any `template_id` the client sends in the same request is ignored outright. Rationale: a saved resume's download must always match what's actually saved in the Resume Builder, never a client-side value that could be stale.
   - **Backward compatibility:** if a saved resume's `template_id` doesn't match any entry currently in `TEMPLATE_SPECS` (e.g. it predates the registry, or referenced a since-removed id), export silently falls back to the default template (`modern`) rather than failing the user's download.
2. **`resume_id` absent (ephemeral content — template-picker preview, or exporting before saving)** — the client-supplied `template_id` is the only available signal, so it's used, but **strictly validated**: an unrecognized id returns `HTTP 400` with the list of valid ids, rather than silently rendering the wrong template.

There is also a documented ownership check on the `resume_id` path — see the code comment about `_auth`/`verify_token` returning a raw Supabase user (`id: str`) versus `services/deps.py::get_current_user` returning the ORM `Profile` (`id: uuid.UUID`); this router normalizes both sides to `str` before comparing, specifically to avoid a type-mismatch bug that would make every resume look unowned.

## 6. `TEMPLATE_BUILDERS` — a registry, not ten independent implementations

```python
TEMPLATE_BUILDERS: dict[str, TemplateBuilder] = {
    template_id: (
        _make_single_column_builder(template_id) if template_id in SINGLE_COLUMN_CONFIGS
        else TemplateBuilder(pdf=_classic_pdf, docx=_classic_docx, layout_family=spec["layoutFamily"])
    )
    for template_id, spec in TEMPLATE_SPECS.items()
}
```

- The five **original** templates (`modern`, `professional`, `minimal`, `creative`, `executive`) all resolve to the pre-existing "classic" builder — **their visual design was deliberately left unchanged** by this phase.
- The five **new** templates (Phase 2) all resolve to one shared, parameterized "single-column" builder family — see [PHASE_2_RESUME_TEMPLATES.md](PHASE_2_RESUME_TEMPLATES.md) for how `SINGLE_COLUMN_CONFIGS` differentiates them.
- Adding a genuinely new layout shape in the future means adding one new builder function and repointing specific ids at it in this dict — callers (`export_pdf`, `export_docx`, `routers/resumes.py::download_resume`) never need to change.

## 7. `preserve_original` — kept fully separate

- Uploaded resumes have their own, unrelated "keep the original design" workflow: `Resume.preserve_original` (boolean) and `Resume.template_type == "uploaded_original"`, handled by `routers/resumes.py::download_resume` and `services/docx_editor.py`.
- `template_id`/`TEMPLATE_BUILDERS` **only apply when `preserve_original` is false**. The router's own docstring states the two concepts are "never read together" — this phase did not touch or merge them, per explicit requirement.
- Migration `0009_resume_design_preservation.sql` belongs to this workflow.

## 8. Tests

| File | Test count | Confirmed passing |
|---|---|---|
| `backend/tests/test_template_registry.py` | 12 | ✅ (see Entry 11 regression run) |
| `backend/tests/test_export_ats_safe.py` | 5 | ✅ |

Test coverage includes: resolving `template_id` from a saved resume vs. from an ephemeral request, rejecting an unknown ephemeral `template_id` with 400, falling back to `modern` for a legacy/unknown DB-sourced `template_id`, and that `preserve_original` resumes are unaffected by any of the above (`test_resolve_defaults_to_modern_when_ephemeral_id_omitted` and related — exact full list not re-enumerated here; see the test file itself for the authoritative list).

## 9. Known limitations

- PDF/DOCX output is **not pixel-identical** to the on-screen React preview (an explicit, accepted trade-off of Option B, not a bug).
- The five original templates' PDF/DOCX design was not modernized in this phase — only made *selectable* correctly. Any visual limitations they already had are unchanged.
- `SINGLE_COLUMN_CONFIGS`/React component section order must be kept in sync **by hand** — there is no runtime link enforcing that the PDF/DOCX section order matches the React component's section order for a given template; this is a documented manual-sync contract, not automated. See [PHASE_2_RESUME_TEMPLATES.md](PHASE_2_RESUME_TEMPLATES.md) §"Section parity."

## 10. Rollback

See [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md) Entry 11 — this phase shares one commit (`fd39489`) with Phase 2 and Phase 3; there is no isolated single-phase rollback point in git history.
