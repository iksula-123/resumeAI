"""
ResumeParser — Stage 1 of the ATS pipeline.

extract_text(): pulls raw text out of an uploaded PDF/DOCX/TXT file.
parse(): turns raw resume text into structured data via the LLM (skills,
experience, projects, education, certifications, soft/hard skills, action
verbs, ATS keywords) — falls back to a regex heuristic if no AI key is set
or the call fails, so the endpoint never hard-fails.
"""
import io
import re
import unicodedata

from .llm import chat_json
from .text_metrics import _EMAIL_RE, _PHONE_RE

_ACTION_VERBS = {
    "led", "built", "developed", "designed", "improved", "increased", "reduced",
    "launched", "managed", "created", "delivered", "optimized", "implemented",
    "drove", "achieved", "spearheaded", "architected", "engineered", "streamlined",
    "automated", "negotiated", "mentored", "coordinated", "analyzed", "resolved",
    "handled", "executed", "established", "generated", "collaborated", "authored",
}
_WEAK_WORDS = {
    "responsible for", "helped with", "worked on", "assisted with", "duties included",
    "involved in", "tasked with", "familiar with", "exposure to", "participated in",
}


# ── Extraction-time text normalization (Phase F2 fix) ───────────────────────
# Root cause (see docs/ATS_POOJA_RAW_EXTRACTION.md and
# docs/ATS_CASE_STUDY_POOJA_FORMATTING_FIX.md): a real uploaded PDF's section
# headings ("EXPERIENCE", "SUMMARY", etc.) were styled with wide letter-
# spacing/tracking — a common resume-heading design choice. pypdf's
# extract_text() reconstructs words from glyph positions, and inserts a
# space wherever the gap between two glyphs is wide enough to look like a
# word boundary — so "EXPERIENCE" extracts as "E X P E R I E N C E". This
# broke EVERY downstream consumer of raw_text that does exact/substring
# heading matching (section_recognizer.py's alias lookup, and the legacy
# text_metrics.formatting_score()'s header substring check), producing
# "0 standard section headers detected" and a floored formatting score —
# NOT because the resume lacks real sections, but because the extracted
# text of a real heading no longer contains the heading word as a
# contiguous substring at all.
#
# Classification A (PDF extraction), per the investigation's own framework
# — the fix belongs here, once, benefiting every downstream consumer of
# raw_text (section_recognizer.py, text_metrics.py, parsing_quality.py, and
# the AI/heuristic parsers below) uniformly, rather than teaching each of
# them to separately tolerate this. section_recognizer.py is NOT modified.
#
# Deliberately conservative — collapses ONLY runs of 3+ consecutive
# single-letter "words" separated by exactly one space (an extremely
# strong, almost unambiguous signal of this specific artifact — a real
# resume essentially never has three consecutive one-letter words in a
# row) back into the single word they actually are. Never invents
# content, never guesses at a heading, never touches text that isn't
# already exactly this pattern. A narrower, related artifact — isolated
# single-letter/word splits inside otherwise-normal words (e.g. "V igo"
# for "Vigo", caused by specific font kerning pairs rather than
# deliberate heading letter-spacing) is NOT addressed here — it's a
# fundamentally harder, ambiguous problem (a lone "A" can't be reliably
# distinguished from the real word "A" without a dictionary) and is
# explicitly out of scope for this fix; see the fix report's "Remaining
# issues" section.
_LETTER_SPACED_RUN_RE = re.compile(r"\b[A-Za-z]\b(?: [A-Za-z]\b){2,}")


def _normalize_extracted_text(text: str) -> str:
    """Conservative, meaning-preserving cleanup applied once at extraction
    time. Every transformation here is reversible-in-spirit (undoes a
    known mechanical extraction artifact) — never removes, invents, or
    relocates real content."""
    if not text:
        return text
    # Unicode normalization (NFKC) — canonicalizes compatibility characters
    # (e.g. full-width forms, certain ligatures) to their standard form.
    # Does not change which letters/words are present.
    text = unicodedata.normalize("NFKC", text)
    # Zero-width characters — invisible, never carry real content; safe to
    # strip outright (zero-width space/non-joiner/joiner, BOM).
    text = re.sub(r"[​‌‍﻿]", "", text)
    # Non-breaking space -> regular space (so downstream whitespace-based
    # heading/word matching isn't broken by an invisible NBSP vs space
    # distinction that carries no meaning here).
    text = text.replace("\xa0", " ")
    # The actual fix: collapse letter-spaced-heading runs back into words.
    text = _LETTER_SPACED_RUN_RE.sub(lambda m: m.group(0).replace(" ", ""), text)
    # Collapse runs of 2+ horizontal whitespace down to one space (safe,
    # standard whitespace normalization — e.g. the double space pypdf
    # often leaves between two collapsed-heading words, or around short
    # all-caps tokens like "ERP  Application"). Newlines are preserved.
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text


def _is_docx_list_paragraph(paragraph) -> bool:
    """Phase F3 fix (Bug 2) — True if this paragraph is a Word-NATIVE
    bulleted/numbered list item. python-docx's `paragraph.text` never
    includes the bullet/number glyph for these — Word represents list
    membership in the paragraph's numbering properties (`<w:numPr>`,
    `numId`/`ilvl`), not as literal text — so a resume built with Word's
    actual "Bullets"/"Numbering" toolbar buttons extracts as plain,
    unmarked paragraphs with today's plain-text extraction.

    Authoritative signal: the paragraph's own XML has a `<w:numPr>` element
    — checked directly via python-docx's oxml layer (`paragraph._p.pPr.numPr`),
    which is the reliable, python-docx-compatible way to read this (there is
    no public high-level python-docx API for "is this paragraph a list
    item"). Deliberately does NOT rely on style name alone — Word's generic
    "List Paragraph" style is also applied to some non-list paragraphs in
    various templates, so style name is checked only as a narrower,
    additional signal (specifically "list bullet" / "list number" style
    names), never as the sole basis, to avoid marking a normal paragraph as
    a bullet just because it lives in a list-adjacent style."""
    try:
        pPr = paragraph._p.pPr
        if pPr is not None and pPr.numPr is not None:
            return True
    except AttributeError:
        pass
    style_name = ((paragraph.style.name if paragraph.style else "") or "").lower()
    return style_name in ("list bullet", "list number", "list bullet 2", "list number 2")


_LITERAL_BULLET_PREFIXES = ("-", "•", "*", "●", "▪", "–")


def _extract_docx_text(data: bytes) -> str:
    """Builds raw text from a .docx the same way extract_text() always has
    (one paragraph per line), EXCEPT a paragraph identified as a Word-native
    list item (see _is_docx_list_paragraph) gets a literal "• " marker
    prepended — so every existing bullet-detection consumer downstream
    (_is_bullet_line, text_metrics.formatting_score, section-content
    grouping) sees exactly what it already knows how to read, without any
    of them needing their own copy of this DOCX-specific logic. A paragraph
    that already starts with a literal bullet character is left alone (no
    double-marking). Never marks a paragraph that isn't actually a list
    item — normal paragraphs are extracted completely unchanged."""
    import docx
    doc = docx.Document(io.BytesIO(data))
    lines = []
    for p in doc.paragraphs:
        t = p.text
        if t.strip() and _is_docx_list_paragraph(p) and not t.lstrip().startswith(_LITERAL_BULLET_PREFIXES):
            t = "• " + t.lstrip()
        lines.append(t)
    return "\n".join(lines)


def extract_text(filename: str, data: bytes) -> str:
    """Extract raw text from an uploaded resume file (.pdf, .docx, .doc, .txt)."""
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    elif name.endswith(".docx"):
        text = _extract_docx_text(data)
    else:
        # .txt or unknown — best-effort decode
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = data.decode("latin-1", errors="ignore")
    return _normalize_extracted_text(text)


_SECTION_RE = re.compile(
    r"^(experience|work experience|employment|education|skills|projects|certifications?|summary|objective)\s*:?$",
    re.IGNORECASE,
)


# ── Heuristic (no-AI) structured extraction ─────────────────────────────────
# Phase F1 fix: the fallback used to return experience/education/skills/
# certifications/keywords hardcoded empty regardless of input — a resume
# with clearly-labeled sections and real content still came out as an
# empty shell whenever the AI call was unavailable/failed (see
# docs/ATS_SCORE_DISCREPANCY_20_VS_78_80.md and
# docs/ATS_CASE_STUDY_POOJA_SCORE_20.md for the investigations that found
# this). This section actually splits `text` on recognized headings and
# extracts real structure from each — never inventing content that isn't
# literally present in `text`. Deliberately a SEPARATE, small heading-alias
# table from section_recognizer.py's (not imported from it) — this fix is
# scoped to the parser only, per the explicit "do not modify
# section_recognizer.py this phase" instruction; the two tables happen to
# overlap heavily by nature (there's only one reasonable set of common
# resume heading variants) but are intentionally decoupled.

_SECTION_HEADING_ALIASES: dict[str, list[str]] = {
    "summary": ["summary", "professional summary", "profile", "career summary", "objective", "career objective"],
    "experience": ["experience", "work experience", "professional experience", "employment history",
                   "career history", "work history",
                   # Phase F3 fix (Bug 1) — a genuinely common, legitimate
                   # heading variant that was missing entirely, not a broadening
                   # of the matching rule: still an EXACT match against one of
                   # these specific strings, never a substring/contains check
                   # against arbitrary text (e.g. a bullet that happens to
                   # mention "experience" is never treated as a heading).
                   "internship experience", "internships", "internship", "internship history"],
    "education": ["education", "academic background", "academic qualifications", "educational qualifications"],
    "skills": ["skills", "technical skills", "core skills", "key skills", "technical competencies",
               "core competencies"],
    "certifications": ["certifications", "certificates", "professional certifications",
                        "licenses & certifications", "licenses and certifications"],
    "languages": ["languages", "language proficiency"],
    "projects": ["projects", "key projects", "selected projects", "academic projects"],
    "achievements": ["achievements", "accomplishments", "awards",
                      # Phase F3 fix (Bug 3) — specific, enumerated heading
                      # variants (still exact-matched, same as every other
                      # entry in this table), NOT a generic "line contains &"
                      # rule. A real content line like "Client Support &
                      # Communication" or "Testing & QA" will never match one
                      # of these specific strings, so it's unaffected.
                      "achievements & extracurricular", "achievements and extracurricular",
                      "extracurricular", "achievements & activities", "awards & achievements"],
}
_ALL_HEADING_ALIASES: dict[str, str] = {
    v: canon for canon, variants in _SECTION_HEADING_ALIASES.items() for v in variants
}
_MAX_HEADING_LEN = 45


def _looks_like_heading_line(line: str) -> bool:
    """A short, title-shaped line on its own — same general heuristic as
    section_recognizer._looks_like_heading(), reimplemented locally (not
    imported — see module note above) so this fix stays self-contained."""
    l = line.strip()
    if not l or len(l) > _MAX_HEADING_LEN:
        return False
    if l.endswith((".", ",", ";", ":")) and not l.isupper():
        return False
    if len(l.split()) > 6:
        return False
    letters = sum(1 for c in l if c.isalpha())
    return letters >= max(2, len(l) * 0.5)


def _is_bullet_line(line: str) -> bool:
    return line.startswith(("-", "•", "*", "●", "▪", "–")) or bool(re.match(r"^\d+[.)]\s", line))


def _looks_like_unrecognized_section_boundary(line: str) -> bool:
    """A conservative, separate signal from _looks_like_heading_line above:
    an ALL-CAPS, short, punctuation-free line (e.g. "TECHNICAL EXPOSURE",
    "TARGET ROLES") that we don't have an alias for. Used ONLY to stop
    attributing further content to the PREVIOUS recognized section — never
    to start a new one (we don't know what it is). Deliberately much
    stricter than _looks_like_heading_line: a normal skill/cert/language
    list line (e.g. "UAT & Functional Testing", "Client Support &
    Communication") is mixed-case or contains list punctuation (":", ",",
    "&", "/") and must NOT trip this, or genuine section content would be
    silently cut short."""
    l = line.strip()
    if not l or len(l) > _MAX_HEADING_LEN:
        return False
    if not l.isupper():
        return False
    if any(ch in l for ch in (":", ",", "&", "/")):
        return False
    words = l.split()
    return 1 <= len(words) <= 4


def _looks_like_a_name_line(line: str) -> bool:
    """Conservative check for whether a resume's very first non-empty line
    is plausibly the candidate's name -- used only by _heuristic_parse()'s
    contact-block extraction (see below). Deliberately strict: any line
    with a digit, an email/phone match, list punctuation, more than 5
    words, or a recognized section heading is rejected rather than guessed
    -- if this returns False the caller leaves full_name as None instead
    of fabricating one, matching the "never invent" rule everywhere else
    in this file."""
    l = line.strip()
    if not l or len(l) > 60:
        return False
    if any(ch.isdigit() for ch in l):
        return False
    if _EMAIL_RE.search(l) or _PHONE_RE.search(l):
        return False
    if any(ch in l for ch in (":", ",", "@", "|", "/")):
        return False
    words = l.split()
    if not (1 <= len(words) <= 5):
        return False
    canon = _ALL_HEADING_ALIASES.get(l.lower().strip(" :•-"))
    if canon:
        return False
    return all(w[0].isalpha() for w in words)


def _split_into_sections(lines: list[str]) -> dict[str, list[str]]:
    """Groups lines under their nearest preceding recognized heading. Lines
    before the first recognized heading (name/contact block) aren't
    assigned anywhere here — they're not lost (raw_text keeps everything),
    just not attributed to a structured section. Bullet lines are always
    attributed to whatever section is currently open (a bullet can never
    itself be mistaken for a heading). A short ALL-CAPS line we don't
    recognize (e.g. "TECHNICAL EXPOSURE") closes the current section
    rather than letting its unrelated content bleed into it — see
    _looks_like_unrecognized_section_boundary()."""
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for line in lines:
        if _is_bullet_line(line):
            if current:
                sections[current].append(line)
            continue
        low = line.lower().strip(" :•-")
        canon = _ALL_HEADING_ALIASES.get(low)
        if canon and _looks_like_heading_line(line):
            current = canon
            sections.setdefault(current, [])
            continue
        if _looks_like_unrecognized_section_boundary(line):
            current = None
            continue
        if current:
            sections[current].append(line)
    return sections


def _strip_bullet_marker(line: str) -> str:
    return re.sub(r"^[-•*●▪–]\s*|^\d+[.)]\s*", "", line).strip()


# Matches a date/duration signal on an experience line — explicit years,
# month-year, MM/YYYY, "N years", or "Present"/"Current" — used to identify
# which non-bullet line in an experience block is the date range, so it's
# never confused with a job title or company name.
_DATE_SIGNAL_RE = re.compile(
    r"(present|current|\b\d{1,2}\+?\s*years?\b|\b(19|20)\d{2}\b|\b\d{1,2}/\d{4}\b|"
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(19|20)\d{2}\b)",
    re.IGNORECASE,
)


def _parse_experience_section(lines: list[str]) -> list[dict]:
    """Groups an EXPERIENCE section's lines into entries. A new entry starts
    once a non-bullet line appears AFTER the current entry has already
    collected at least one bullet (the standard resume shape is
    title/company/dates[/extra] then bullets, then the next role) — this
    correctly separates back-to-back roles without requiring blank lines
    between them, which real PDF text extraction often collapses anyway.
    Never fabricates a title/company/date that isn't a real line; missing
    fields are left as empty strings, never guessed."""
    entries: list[dict] = []
    current: dict | None = None
    seen_bullet_in_current = False

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        if _is_bullet_line(line):
            if current is None:
                current = {"title": "", "company": "", "duration": "", "bullets": []}
                entries.append(current)
            current["bullets"].append(_strip_bullet_marker(line))
            seen_bullet_in_current = True
            continue

        if current is not None and seen_bullet_in_current:
            current = None  # force a fresh entry below — bullets already ended this one

        if current is None:
            current = {"title": "", "company": "", "duration": "", "bullets": []}
            entries.append(current)
            seen_bullet_in_current = False

        if _DATE_SIGNAL_RE.search(line) and not current["duration"]:
            current["duration"] = line
        elif not current["title"]:
            current["title"] = line
        elif not current["company"]:
            current["company"] = line
        else:
            # A further descriptive line before any bullets started (e.g.
            # "Product: SmartERP") — real evidence, never dropped, kept as
            # a bullet-shaped fact rather than silently discarded.
            current["bullets"].append(line)

    return [e for e in entries if e["title"] or e["company"] or e["bullets"]]


# Word-boundary matched (NOT plain substring — "mba" as a bare substring
# would false-positive-match inside "Mumbai", "graduate" inside
# "Undergraduate", etc.; a real regression caught while testing this fix).
_DEGREE_MARKERS_RE = re.compile(
    r"\b(b\.?\s?tech|b\.?\s?e|b\.?\s?sc|b\.?\s?com|bca|bachelor|"
    r"m\.?\s?tech|m\.?\s?sc|m\.?\s?com|mba|mca|master|"
    r"phd|doctorate|diploma|12th|hsc|10th|ssc|intermediate|graduate|postgraduate)\b",
    re.IGNORECASE,
)
_YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")


def _looks_like_degree(line: str) -> bool:
    return bool(_DEGREE_MARKERS_RE.search(line))


def _parse_education_section(lines: list[str]) -> list[dict]:
    """Groups an EDUCATION section's lines into entries, keyed off
    recognizable degree markers (B.Tech, M.Com, MBA, 12th, etc.) — a degree
    entry with ONLY a degree line (e.g. just "M.Com") is preserved exactly
    as-is, institution/year left empty rather than guessed."""
    entries: list[dict] = []
    current: dict | None = None

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        if _looks_like_degree(line):
            current = {"degree": line, "institution": "", "year": ""}
            entries.append(current)
            continue

        if current is None:
            current = {"degree": "", "institution": "", "year": ""}
            entries.append(current)

        year_match = _YEAR_RE.search(line)
        if year_match and not current["year"]:
            current["year"] = year_match.group(0)
            remainder = (line[:year_match.start()] + line[year_match.end():]).strip(" ,-")
            if remainder and not current["institution"]:
                current["institution"] = remainder
        elif not current["institution"]:
            current["institution"] = line.strip(" ,")

    return [e for e in entries if e["degree"] or e["institution"]]


def _split_list_section(lines: list[str]) -> list[str]:
    """Skills/certifications/languages sections come in two common shapes —
    one item per line, or comma-separated on one/few lines — this handles
    both without inventing anything not literally in the text."""
    items: list[str] = []
    for raw_line in lines:
        line = _strip_bullet_marker(raw_line) if _is_bullet_line(raw_line) else raw_line.strip()
        if not line:
            continue
        if "," in line:
            items.extend(p.strip() for p in line.split(",") if p.strip())
        else:
            items.append(line)
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        key = it.lower()
        if key not in seen:
            seen.add(key)
            out.append(it)
    return out


def _parse_projects_section(lines: list[str]) -> list[dict]:
    """Simple project grouping: a non-bullet line starts a new project
    (name); bullet lines under it accumulate into its description. Lower
    precision than experience parsing (projects rarely have this
    project's dates/company structure), acceptable since Projects is
    explicitly an optional/best-effort section."""
    entries: list[dict] = []
    current: dict | None = None
    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue
        if _is_bullet_line(line):
            text = _strip_bullet_marker(line)
            if current is None:
                current = {"name": "", "description": "", "technologies": []}
                entries.append(current)
            current["description"] = (current["description"] + " " + text).strip()
            continue
        if current is None or current["name"]:
            current = {"name": "", "description": "", "technologies": []}
            entries.append(current)
        current["name"] = line
    return [e for e in entries if e["name"] or e["description"]]


def _parse_achievements_section(lines: list[str]) -> list[str]:
    out = []
    for raw_line in lines:
        text = _strip_bullet_marker(raw_line) if _is_bullet_line(raw_line) else raw_line.strip()
        if text:
            out.append(text)
    return out


def _estimate_years_from_heuristic_experience(experience: list[dict]) -> float | None:
    """Conservative career-span estimate from the `duration` strings the
    heuristic experience parser captured — only computed when at least one
    explicit 4-digit year was found (e.g. "15 April 2023 - Present"); a
    vague duration like "4 Years" with no anchor year contributes nothing,
    rather than being summed in (summing stated durations across entries
    risks double-counting overlapping/adjacent roles — same
    span-not-sum philosophy as _estimate_total_experience() above, just
    adapted to this parser's single combined `duration` string instead of
    separate startDate/endDate fields)."""
    import datetime as _dt

    years: list[int] = []
    has_present = False
    for e in experience or []:
        duration = e.get("duration") or ""
        years.extend(int(y) for y in re.findall(r"\b(?:19|20)\d{2}\b", duration))
        if re.search(r"present|current", duration, re.IGNORECASE):
            has_present = True
    if not years:
        return None
    start = min(years)
    end = _dt.date.today().year if has_present else max(years)
    span = end - start
    return float(span) if span > 0 else 0.5


def _heuristic_parse(text: str) -> dict:
    """No-AI fallback: splits `text` on recognized section headings and
    extracts real structure from each section (see the helpers above) —
    runs whenever the AI parser is unavailable or its call fails
    (ResumeParser.parse() below), so this is what every anonymous/free-tier
    request, or any request during an AI provider outage/rate-limit,
    actually runs through. Only extracts what's literally present in
    `text` — never invents a skill, employer, date, or section that isn't
    there; a section this function can't confidently identify is simply
    left empty (visible via `heuristic_sections_found`) rather than guessed."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    words = re.findall(r"\b[a-zA-Z][a-zA-Z+#.]*\b", text)
    lower_words = {w.lower() for w in words}
    action_verbs_found = sorted({w for w in lower_words if w in _ACTION_VERBS})

    sections = _split_into_sections(lines)

    summary = " ".join(sections.get("summary", [])).strip() or None

    experience = _parse_experience_section(sections.get("experience", []))
    # Canonical source for experience bullets is experience[].bullets (Phase
    # F1 fix 1) — the top-level `bullets` field below is always DERIVED from
    # it, never a second, independently-collected list, so the two can
    # never diverge (this is also what from_content() already does for the
    # Resume Builder path — kept consistent here).
    bullets = [b for e in experience for b in (e.get("bullets") or [])]

    education = _parse_education_section(sections.get("education", []))

    skill_names = _split_list_section(sections.get("skills", []))
    soft_skills = [s for s in skill_names if s.lower() in _SOFT_SKILL_TERMS]
    hard_skills = [s for s in skill_names if s.lower() not in _SOFT_SKILL_TERMS]

    certifications = _split_list_section(sections.get("certifications", []))
    languages = [{"name": lang, "proficiency": ""} for lang in _split_list_section(sections.get("languages", []))]
    projects = _parse_projects_section(sections.get("projects", []))
    achievements = _parse_achievements_section(sections.get("achievements", []))

    keywords = list(dict.fromkeys([
        *skill_names, *certifications, *[e["title"] for e in experience if e.get("title")],
    ]))[:25]

    total_experience_years = _estimate_years_from_heuristic_experience(experience)
    job_title = experience[0]["title"] if experience and experience[0].get("title") else None

    # Contact block (name/email/phone) — deliberately conservative and kept
    # separate from the section-based extraction above. email/phone reuse
    # the exact regexes text_metrics.py already uses to score "Contact /
    # Essential Information" (Phase H1 follow-up fix: this heuristic path
    # used to hardcode all three to None, so a resume whose AI parse call
    # failed/was unavailable would score contact info as present while
    # still losing the name/email/phone for "Improve My Resume" — same
    # regex, so "detected for scoring" and "extracted for the editor" can
    # never disagree). full_name only uses the very first line of the
    # resume and only when it passes _looks_like_a_name_line's strict
    # checks; never invents a name when that line doesn't clearly read as
    # one, or when the resume is empty.
    email_match = _EMAIL_RE.search(text)
    phone_match = _PHONE_RE.search(text)
    full_name = lines[0] if lines and _looks_like_a_name_line(lines[0]) else None

    return {
        "full_name": full_name,
        "email": email_match.group(0) if email_match else None,
        "phone": phone_match.group(0).strip() if phone_match else None,
        "location": None,
        "job_title": job_title,
        "summary": summary,
        "skills": skill_names,
        "hard_skills": hard_skills,
        "soft_skills": soft_skills,
        "experience": experience,
        "projects": projects,
        "education": education,
        "certifications": certifications,
        "action_verbs": action_verbs_found,
        "keywords": keywords,
        "total_experience_years": total_experience_years,
        "bullets": bullets,
        "raw_text": text,
        "languages": languages,
        "achievements": achievements,
        # Diagnostic only (Phase F1 fix 5 — "report the parsing limitation"
        # rather than silently guessing): which headings this fallback
        # actually recognized, so a section it genuinely couldn't identify
        # is visible rather than indistinguishable from "not present at all."
        "heuristic_sections_found": sorted(sections.keys()),
        "parsed_by": "heuristic",
    }


# ── Build parsed-resume shape directly from the Resume Builder's own content ──
# (Career Vault path — the candidate already entered this via the builder, so
# there's nothing to extract or guess: no AI call, no re-parsing, no risk of
# the LLM mangling data the candidate already confirmed.)

_SOFT_SKILL_TERMS = {
    "communication", "leadership", "teamwork", "collaboration", "problem solving",
    "problem-solving", "critical thinking", "time management", "adaptability",
    "creativity", "work ethic", "attention to detail", "public speaking",
    "negotiation", "conflict resolution", "mentoring", "coaching", "empathy",
    "decision making", "decision-making", "stakeholder management", "presentation",
}


def _years_from_date(s: str) -> int | None:
    m = re.search(r"(19|20)\d{2}", s or "")
    return int(m.group(0)) if m else None


def _estimate_total_experience(experience: list[dict]) -> float | None:
    """Career span (earliest start → latest end/'now') in years — robust to
    overlapping roles, unlike summing each job's duration."""
    import datetime as _dt

    starts, ends = [], []
    for e in experience or []:
        sy = _years_from_date(e.get("startDate") or "")
        if sy:
            starts.append(sy)
        if e.get("current"):
            ends.append(_dt.date.today().year)
        else:
            ey = _years_from_date(e.get("endDate") or "")
            if ey:
                ends.append(ey)
    if not starts or not ends:
        return None
    span = max(ends) - min(starts)
    return float(span) if span > 0 else 0.5  # same-year roles: at least a few months


def from_content(content: dict) -> dict:
    """Turn the Resume Builder's structured `content` blob into the same shape
    `parse()` returns from raw text — used for a candidate's saved resume, so
    the ATS engine can run without re-extracting anything via AI."""
    content = content or {}
    personal = content.get("personalInfo") or {}
    skills_raw = content.get("skills") or []
    skill_names = [s.get("name") if isinstance(s, dict) else str(s) for s in skills_raw]
    skill_names = [s.strip() for s in skill_names if s and str(s).strip()]

    soft_skills = [s for s in skill_names if s.lower() in _SOFT_SKILL_TERMS]
    hard_skills = [s for s in skill_names if s.lower() not in _SOFT_SKILL_TERMS]

    experience = []
    all_bullets: list[str] = []
    for e in content.get("experience") or []:
        bullets = [b for b in (e.get("bullets") or []) if str(b).strip()]
        all_bullets.extend(bullets)
        end = "Present" if e.get("current") else (e.get("endDate") or "")
        experience.append({
            "title": e.get("position") or "",
            "company": e.get("company") or "",
            "duration": f"{e.get('startDate') or ''} – {end}".strip(" –"),
            "bullets": bullets,
        })

    projects = []
    for p in content.get("projects") or []:
        techs = p.get("technologies") or ""
        tech_list = [t.strip() for t in techs.split(",") if t.strip()] if isinstance(techs, str) else list(techs)
        projects.append({
            "name": p.get("name") or "",
            "description": p.get("description") or "",
            "technologies": tech_list,
        })

    education = [
        {
            "degree": e.get("degree") or "",
            "institution": e.get("institution") or "",
            "year": e.get("endDate") or e.get("startDate") or "",
        }
        for e in content.get("education") or []
    ]

    certifications = [c.get("name") or "" for c in (content.get("certifications") or []) if c.get("name")]

    words = re.findall(r"\b[a-zA-Z][a-zA-Z+#.]*\b", " ".join(all_bullets))
    action_verbs = sorted({w for w in {w.lower() for w in words} if w in _ACTION_VERBS})

    tech_keywords = [t for p in projects for t in p["technologies"]]
    keywords = list(dict.fromkeys([*skill_names, *tech_keywords, *certifications]))[:25]

    # Section header LINES ("Summary", "Experience", ...) are inserted before
    # each populated section below — not invented content, just an honest
    # statement of structure that already exists (a non-empty content.summary
    # genuinely IS a summary section). Without these, section_recognizer.py's
    # recognize_sections() (used by _sections_category_v2()) and
    # parsing_quality.analyze_parsing_quality() (used by _parsing_category_v2()
    # /_parsing_and_contact_categories()/_formatting_category()) — all of
    # which read resume["raw_text"] as plain text and look for section
    # heading keywords — had nothing to recognize, since this synthesized
    # text never contained a single heading word. That's a text-reconstruction
    # gap, not a real absence of structure: the same content, scored fresh
    # from raw pasted/uploaded text (ResumeParser.parse(), which keeps the
    # user's own "SUMMARY"/"EXPERIENCE"/... headings), was scoring these
    # exact categories much higher for identical underlying information —
    # a real "same resume, different score" bug (see docs/AI_DEVELOPMENT_LOG.md,
    # ATS consolidation audit). Fixing what raw_text is built FROM, not any
    # scoring function itself — recognize_sections()/analyze_parsing_quality()/
    # formatting_score() are all untouched, same thresholds, same weights.
    # Contact info goes right after the name/title, matching where it
    # actually lives on a real resume (and where _contact_extraction_score()
    # looks for it — "near the top" of the document, not buried at the end).
    raw_text_parts = [
        personal.get("fullName", ""), personal.get("jobTitle", ""),
        personal.get("email", ""), personal.get("phone", ""), personal.get("location", ""),
    ]
    if content.get("summary"):
        raw_text_parts += ["Summary", content.get("summary", "")]
    if experience:
        raw_text_parts.append("Experience")
        for e in experience:
            raw_text_parts.append(f"{e['title']} {e['company']}".strip())
            # each bullet on its own "- "-prefixed line — not a formatting
            # invention, this is genuinely how every bullet already exists in
            # the structured content; joining them into one run-on line (the
            # old behavior) was what hid real bullet structure from
            # text_metrics.formatting_score()'s bullet-line detection.
            raw_text_parts += [f"- {b}" for b in e["bullets"]]
    if projects:
        raw_text_parts.append("Projects")
        raw_text_parts += [f"{p['name']} {p['description']} {' '.join(p['technologies'])}" for p in projects]
    if education:
        raw_text_parts.append("Education")
        raw_text_parts += [f"{e['degree']} {e['institution']}" for e in education]
    if skill_names:
        raw_text_parts += ["Skills", ", ".join(skill_names)]
    if certifications:
        raw_text_parts += ["Certifications", ", ".join(certifications)]
    raw_text = "\n".join(p for p in raw_text_parts if p)

    return {
        "full_name": personal.get("fullName") or None,
        "email": personal.get("email") or None,
        "phone": personal.get("phone") or None,
        "location": personal.get("location") or None,
        "job_title": personal.get("jobTitle") or None,
        "summary": content.get("summary") or None,
        "skills": skill_names,
        "hard_skills": hard_skills,
        "soft_skills": soft_skills,
        "experience": experience,
        "projects": projects,
        "education": education,
        "certifications": certifications,
        "action_verbs": action_verbs,
        "keywords": keywords,
        "total_experience_years": _estimate_total_experience(content.get("experience") or []),
        "bullets": all_bullets,
        "raw_text": raw_text,
        "languages": [
            {"name": lang.get("name", ""), "proficiency": lang.get("proficiency", "")}
            for lang in (content.get("languages") or [])
            if lang.get("name")
        ],
        "achievements": [a for a in (content.get("achievements") or []) if a],
        "interests": [i for i in (content.get("interests") or []) if i],
        "parsed_by": "profile",  # from the candidate's saved Career Vault resume, not AI-extracted
    }


def to_content(resume: dict) -> dict:
    """The inverse of from_content() above: turns a parse()/_heuristic_parse()-
    shaped resume dict into the Resume Builder's `content` shape, so a
    pasted/uploaded resume that was never a saved Resume can still be
    persisted via the existing POST /api/resumes/ endpoint and opened in
    the editor with its real data prefilled (Phase H1 follow-up — the ATS
    Checker's "Improve My Resume" handoff, CASE B/C).

    Deliberately the SAME honest, non-inventing mapping
    resume_improver.tailor()'s no-AI fallback already used (that logic is
    now shared from here instead of duplicated — see tailor()'s own
    docstring) — every field is either copied verbatim from what was
    actually parsed, or left as an empty string/list. A raw `duration`
    string (the parser's one combined field — see _parse_experience_section)
    is placed in `endDate` rather than guessed apart into start/end, exactly
    matching the prior behavior; nothing here invents a start date, a
    degree field, or a certification issuer that wasn't in the source.

    `endDate` is capped to fit the Resume Builder's `end_date VARCHAR(50)`
    column (see models.py Experience) before this dict is ever persisted via
    POST /api/resumes/. `_parse_experience_section` occasionally can't split
    a single source line that crams title/company/dates together (e.g. a
    one-line DOCX table row) and falls back to keeping that whole line as
    `duration` — without this cap, that oversized value reaches the DB as-is
    and the insert raises StringDataRightTruncationError, aborting the
    entire "Improve My Resume" handoff and losing all of the resume's data.
    Truncating (never fabricating) is strictly better than a 500 here; nothing
    is invented, some already-real text is just shortened to fit the column."""
    def _fit(value: str, limit: int = 50) -> str:
        return value[:limit] if value and len(value) > limit else (value or "")

    personal_info = {
        "fullName": resume.get("full_name") or "",
        "jobTitle": resume.get("job_title") or "",
        "email": resume.get("email") or "",
        "phone": resume.get("phone") or "",
        "location": resume.get("location") or "",
    }
    return {
        "personalInfo": personal_info,
        "summary": resume.get("summary") or "",
        "experience": [
            {"position": e.get("title", ""), "company": e.get("company", ""),
             "startDate": "", "endDate": _fit(e.get("duration", "")), "current": False,
             "bullets": e.get("bullets", [])}
            for e in (resume.get("experience") or [])
        ],
        "skills": [{"name": s, "level": 75} for s in (resume.get("skills") or [])],
        "education": [
            {"degree": e.get("degree", ""), "field": "", "institution": e.get("institution", ""), "endDate": e.get("year", "")}
            for e in (resume.get("education") or [])
        ],
        "projects": [
            {"name": p.get("name", ""), "technologies": ", ".join(p.get("technologies", []) or []), "description": p.get("description", "")}
            for p in (resume.get("projects") or [])
        ],
        "certifications": [{"name": c, "issuer": ""} for c in (resume.get("certifications") or [])],
        "languages": [
            {"name": lang.get("name", ""), "proficiency": lang.get("proficiency", "")}
            for lang in (resume.get("languages") or []) if lang.get("name")
        ],
        "achievements": [a for a in (resume.get("achievements") or []) if a],
        "interests": [],
    }


_PARSE_PROMPT = """You are an expert resume parser for an ATS system. Extract structured \
data from the resume text below. Be exhaustive but only include what's actually present \
— never invent skills, employers, or dates that aren't in the text.

Return a single JSON object with exactly these keys:
- "full_name": the candidate's name as it appears on the resume, or null
- "email": the candidate's email, or null
- "phone": the candidate's phone number, or null
- "location": the candidate's city/location, or null
- "job_title": the candidate's current or most recent job title, or null
- "summary": the resume's existing professional summary/objective text, or null if none
- "skills": array of every skill mentioned (technical + soft), deduplicated
- "hard_skills": array of technical/tools/software skills only
- "soft_skills": array of soft skills only (communication, leadership, etc.)
- "experience": array of {{"title": str, "company": str, "duration": str, "bullets": [str]}}
- "projects": array of {{"name": str, "description": str, "technologies": [str]}}
- "education": array of {{"degree": str, "institution": str, "year": str}}
- "certifications": array of certification names mentioned
- "action_verbs": array of the action verbs actually used to start bullet points (e.g. "Led", "Built")
- "keywords": array of 15-25 ATS-relevant keywords/phrases from the resume (skills, tools, domains)
- "total_experience_years": estimated total years of professional experience as a number, or null if unclear

Resume text:
\"\"\"
{text}
\"\"\"
"""


async def parse(text: str) -> dict:
    text = (text or "").strip()
    if not text:
        return _heuristic_parse("")

    result = await chat_json(_PARSE_PROMPT.format(text=text[:12000]), max_tokens=2000)
    if result is None:
        return _heuristic_parse(text)

    result.setdefault("full_name", None)
    result.setdefault("email", None)
    result.setdefault("phone", None)
    result.setdefault("location", None)
    result.setdefault("job_title", None)
    result.setdefault("summary", None)
    result.setdefault("skills", [])
    result.setdefault("hard_skills", [])
    result.setdefault("soft_skills", [])
    result.setdefault("experience", [])
    result.setdefault("projects", [])
    result.setdefault("education", [])
    result.setdefault("certifications", [])
    result.setdefault("action_verbs", [])
    result.setdefault("keywords", [])
    result.setdefault("total_experience_years", None)
    # Phase F1 hygiene: keep the resume-dict shape consistent across all
    # three parse paths (ai / heuristic / profile) now that the heuristic
    # path also populates these — the AI prompt above doesn't ask for them
    # (out of scope to change the prompt this phase), so default to empty
    # rather than leaving the key entirely absent for this path only.
    result.setdefault("languages", [])
    result.setdefault("achievements", [])
    result["raw_text"] = text
    result["parsed_by"] = "ai"
    return result
