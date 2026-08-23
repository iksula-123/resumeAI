# Fonts for PDF export

These Open Font License (OFL) TTFs make PDF exports render **English + Devanagari /
Indian scripts** correctly (spec Section 6). They are bundled in the repo.

| File | Role |
|---|---|
| `NotoSans-Regular.ttf` / `NotoSans-Bold.ttf` | **Primary sans** (Latin) — required for Unicode PDF |
| `NotoSerif-Regular.ttf` / `NotoSerif-Bold.ttf` | **Primary serif** — used by templates whose design calls for a serif typeface (e.g. Professional), so the PDF actually looks like the selected template instead of always rendering sans |
| `NotoSansMono-Regular.ttf` / `NotoSansMono-Bold.ttf` | **Primary mono** — used when the candidate explicitly picks "Mono" in the Resume Editor's Font picker (the same three families it offers: sans/serif/mono) |
| `NotoSansDevanagari-Regular.ttf` / `-Bold.ttf` | **Fallback** for Devanagari runs (registered alongside whichever primary font is active) |

`routers/export.py:_pdf_font(pdf, family="sans")` loads Noto Sans, Noto Serif, or
Noto Sans Mono as the primary font (per the template's own `accent`/`font` in
shared/template-specs.json, overridden by the candidate's explicit
`font_metadata.family` when saved — see `_resolve_style`) and registers Noto Sans
Devanagari via `set_fallback_fonts` in all three cases, so mixed Hindi/English
text renders correctly regardless of which primary font is active. If a
requested family's TTF is absent, the exporter falls back to Noto Sans, then to
the matching latin-1 core font (Helvetica/Times/Courier — English only) for
every template. DOCX stores Unicode and renders Devanagari in Word regardless.

Source (OFL): the Noto fonts project —
`raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans*/hinted/ttf/`,
`.../NotoSerif/hinted/ttf/`, and `.../NotoSansMono/hinted/ttf/`.
