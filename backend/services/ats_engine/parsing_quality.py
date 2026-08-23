"""
ATS Intelligence 2.0 — Parsing Rate engine (product spec Part 5).

Measures how cleanly a resume's CONTENT can be extracted — the same signal a
real ATS parser reads — not merely whether the file opens. Works entirely
from the plain text already extracted by ResumeParser.extract_text()
(pypdf/python-docx), the same raw_text every other module in this pipeline
uses. No new dependency, no OCR, no PDF-layout/bbox analysis.

Six named metrics, each documented as exactly what it measures — none of
these claim ground-truth comparison against the "true" original content
(that would require OCR/layout analysis this project doesn't do — see
Known Limitations in docs/SAHICAREER_ATS_INTELLIGENCE_2.md). They are
heuristic PROXIES for parsing quality, same honesty standard as the
existing text_metrics.formatting_score().
"""
import re

from .section_recognizer import recognize_sections

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE_RE = re.compile(r"(\+?\d[\d\s\-()]{8,}\d)")
_CONTROL_OR_REPLACEMENT_RE = re.compile(r"[�\x00-\x08\x0b\x0c\x0e-\x1f]")


def _parsed_character_ratio(text: str) -> float:
    """Fraction of extracted characters that are NOT corruption markers
    (Unicode replacement char, control bytes) — a proxy for "did the
    extraction produce clean text," not a comparison against the original
    file (no ground truth is available for that)."""
    if not text:
        return 0.0
    bad = len(_CONTROL_OR_REPLACEMENT_RE.findall(text))
    return max(0.0, 1.0 - bad / len(text))


def _parsed_word_ratio(text: str) -> float:
    """Fraction of whitespace-split tokens that look like plausible words —
    not absurdly long (words jammed together, a table-extraction artifact)
    and not a lone stray character (mid-word splits, another common
    multi-column extraction artifact)."""
    words = re.findall(r"\S+", text)
    if not words:
        return 0.0
    plausible = sum(1 for w in words if 1 < len(w) <= 25 or (len(w) == 1 and not w.isalpha()))
    return plausible / len(words)


def _garbled_text_ratio(text: str) -> float:
    """Same odd-token heuristic as text_metrics.formatting_score() — long
    jammed-together tokens or single stray letters — surfaced here as its
    own explicit, inspectable ratio rather than folded into one score."""
    words = re.findall(r"\S+", text)
    if not words:
        return 1.0
    odd = sum(1 for w in words if len(w) > 25 or (len(w) == 1 and w.isalpha()))
    return odd / len(words)


def _reading_order_score(text: str, lines: list[str]) -> tuple[float, str]:
    """Heuristic proxy only — this project extracts flat text, not PDF
    layout/bbox geometry, so true column/reading-order detection isn't
    possible here (documented limitation, not silently pretended away).
    Approximates disorder via: (a) whether recognized section headers
    appear in a conventional relative order, and (b) a spike in very-short
    consecutive lines, which is the flat-text signature of a two-column
    layout extracted row-by-row instead of column-by-column."""
    if not lines:
        return 0.0, "No text to assess reading order."

    conventional = ("summary", "experience", "education", "skills", "projects", "certifications")
    seen_order = [h for h in conventional if any(h in l.lower() for l in lines[: max(1, len(lines))])]
    # crude order check: education appearing before experience isn't wrong on
    # its own (fresher resumes do this deliberately), so this only penalizes
    # a genuinely scrambled pattern, not a legitimate section-order choice.
    header_positions = {}
    for i, l in enumerate(lines):
        low = l.lower()
        for h in conventional:
            if h in low and len(l) < 40 and h not in header_positions:
                header_positions[h] = i
    disorder_hits = 0
    ordered_present = [h for h in conventional if h in header_positions]
    for a, b in zip(ordered_present, ordered_present[1:]):
        # only "summary appearing after experience/education" is treated as
        # a real disorder signal — everything else has legitimate variants.
        if a == "summary" and header_positions[a] > header_positions[b]:
            disorder_hits += 1

    short_run = 0
    max_short_run = 0
    for l in lines:
        if len(l) <= 3:
            short_run += 1
            max_short_run = max(max_short_run, short_run)
        else:
            short_run = 0
    column_artifact = max_short_run >= 6

    score = 100
    if disorder_hits:
        score -= 25
    if column_artifact:
        score -= 30
    score = max(0, score)

    note = "No reading-order issues detected."
    if disorder_hits and column_artifact:
        note = "Summary appears out of conventional order AND a run of very short lines suggests possible multi-column extraction."
    elif disorder_hits:
        note = "Summary section appears after Experience/Education, which is unconventional (not necessarily wrong)."
    elif column_artifact:
        note = "A run of very short consecutive lines suggests the file may use a multi-column layout that extracted out of visual order."
    return float(score), note


def _contact_extraction_score(text: str, lines: list[str]) -> tuple[float, str]:
    """Whether contact info was found at all, and whether it's near the top
    of the document (where a human/recruiter and most ATS parsers expect
    it) rather than only in what LOOKS like a footer (last few lines)."""
    email_found = bool(_EMAIL_RE.search(text))
    phone_found = bool(_PHONE_RE.search(text))
    if not lines:
        return 0.0, "No text to search for contact information."

    top_slice = "\n".join(lines[: max(3, len(lines) // 10)])
    email_near_top = bool(_EMAIL_RE.search(top_slice))
    phone_near_top = bool(_PHONE_RE.search(top_slice))

    score = 0
    notes = []
    if email_found:
        score += 40
        notes.append("email found" + (" near the top" if email_near_top else " but not near the top of the document"))
    else:
        notes.append("no email address detected")
    if phone_found:
        score += 40
        notes.append("phone number found" + (" near the top" if phone_near_top else " but not near the top of the document"))
    else:
        notes.append("no phone number detected")
    if (email_found and email_near_top) or (phone_found and phone_near_top):
        score += 20
    return float(min(100, score)), "; ".join(notes)


def analyze_parsing_quality(raw_text: str) -> dict:
    """The Parsing Rate engine's single entry point. Returns the six named
    metrics plus one blended 0-100 score with a plain-English explanation,
    per the product spec's "96% of meaningful resume content can be
    extracted cleanly" example."""
    text = raw_text or ""
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    if not text.strip():
        # contact_note must exist here too (not just the normal-path return
        # below) -- mode_orchestrator._parsing_and_contact_categories()
        # unconditionally reads it to build the "Contact / Essential
        # Information" category for Resume ATS Health. This branch already
        # correctly zeroes every ratio/score for empty text (unchanged --
        # no formula touched); it was just missing this one key, which
        # raised a KeyError the first time a genuinely empty resume (a
        # brand-new, never-edited Resume Builder draft) reached this path
        # live, via the Editor's own auto-analysis on mount.
        return {
            "score": 0,
            "parsed_character_ratio": 0.0, "parsed_word_ratio": 0.0,
            "section_extraction_ratio": 0.0, "garbled_text_ratio": 1.0,
            "reading_order_score": 0.0, "contact_extraction_score": 0.0,
            "contact_note": "No contact information detected — no extractable text found.",
            "note": "No extractable text found — the file may be a scanned image, empty, or corrupted.",
        }

    char_ratio = _parsed_character_ratio(text)
    word_ratio = _parsed_word_ratio(text)
    garbled_ratio = _garbled_text_ratio(text)
    sections = recognize_sections(text)
    section_ratio = sections["section_extraction_ratio"]
    reading_order, reading_note = _reading_order_score(text, lines)
    contact_score, contact_note = _contact_extraction_score(text, lines)

    # Blended 0-100: character/word cleanliness carries the most weight
    # (it's the most direct "did extraction work" signal), the rest are
    # supporting signals — a SahiCareer design choice, tunable like every
    # other weight in this system (see ats_config.py for the ones meant to
    # be benchmark-tuned; this internal blend is a smaller implementation
    # detail, not a top-level product weight).
    score = round(
        char_ratio * 35 + word_ratio * 25 + (1 - garbled_ratio) * 20 +
        section_ratio * 10 + (reading_order / 100) * 5 + (contact_score / 100) * 5
    )
    score = max(0, min(100, score))

    return {
        "score": score,
        "parsed_character_ratio": round(char_ratio, 3),
        "parsed_word_ratio": round(word_ratio, 3),
        "section_extraction_ratio": round(section_ratio, 3),
        "garbled_text_ratio": round(garbled_ratio, 3),
        "reading_order_score": round(reading_order),
        "contact_extraction_score": round(contact_score),
        # Phase H1 — additive only: contact_score above already existed and
        # already fed `score` at its original 5% internal weight (untouched,
        # not recalculated here). contact_note is the same already-computed
        # explanation `note` below folds in, just also exposed under its own
        # key so a caller (mode_orchestrator.py's Resume ATS Health Layer A)
        # can build a standalone "Contact / Essential Information" category
        # without re-deriving the heuristic or string-parsing `note`.
        "contact_note": contact_note,
        "note": (
            f"{round(char_ratio * 100)}% of extracted characters are clean; "
            f"{round(word_ratio * 100)}% of tokens look like well-formed words; "
            f"{sections['recognized_count']}/{sections['expected_count']} standard sections recognized. "
            f"Reading order: {reading_note} Contact info: {contact_note}."
        ),
    }
