# Fonts for PDF export

These Open Font License (OFL) TTFs make PDF exports render **English + Devanagari /
Indian scripts** correctly (spec Section 6). They are bundled in the repo.

| File | Role |
|---|---|
| `NotoSans-Regular.ttf` / `NotoSans-Bold.ttf` | **Primary** (Latin) — required for Unicode PDF |
| `NotoSansDevanagari-Regular.ttf` / `-Bold.ttf` | **Fallback** for Devanagari runs |

`routers/export.py:_pdf_font` loads Noto Sans as the primary font and registers
Noto Sans Devanagari via `set_fallback_fonts`, so mixed Hindi/English text renders
in a single run. If `NotoSans-Regular.ttf` is absent, the exporter falls back to
the latin-1 core font (English only). DOCX stores Unicode and renders Devanagari
in Word regardless.

Source (OFL): the Noto fonts project —
`raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans*/hinted/ttf/`.
