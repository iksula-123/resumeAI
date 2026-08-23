"""
ATS Intelligence 2.0 — Section Recognition engine (product spec Part 6).

Recognizes standard resume sections under their common heading VARIANTS —
"Employment History" and "Work History" both mean Experience; a resume must
never be penalized just for not using one exact heading string. This is a
new, more thorough replacement for the fixed 8-word substring check that
was previously buried inside text_metrics.formatting_score() — that
function is untouched (frozen, per Phase B decision 6); this module is used
by the NEW v2 layers only (parsing_quality.py, ats_intelligence_v2.py).

CORE vs OPTIONAL: Summary, Experience, Education, and Skills are the
"expected" baseline every resume should have — Projects and Certifications
are genuinely optional for many roles (a non-technical resume may have
neither) and are recognized when present but never counted against a
resume for being absent, per the explicit "do not punish a resume for
lacking a legitimately optional section" rule.
"""
import re

CORE_SECTIONS = ("summary", "experience", "education", "skills")
OPTIONAL_SECTIONS = ("projects", "certifications")

SECTION_VARIANTS: dict[str, list[str]] = {
    "summary": ["summary", "professional summary", "profile", "career summary", "objective", "career objective"],
    "experience": ["experience", "work experience", "professional experience", "employment history",
                   "career history", "work history", "internship experience"],
    "education": ["education", "academic background", "academic qualifications", "educational qualifications"],
    "skills": ["skills", "technical skills", "core competencies", "key skills", "technical expertise",
               "areas of expertise"],
    "projects": ["projects", "key projects", "selected projects", "academic projects"],
    "certifications": ["certifications", "certifications & licenses", "licenses & certifications",
                        "licenses and certifications", "certificates"],
}

ALL_VARIANTS: dict[str, str] = {v: canon for canon, variants in SECTION_VARIANTS.items() for v in variants}

_MAX_HEADING_LEN = 45


def _looks_like_heading(line: str) -> bool:
    """A short, title-ish line on its own — the general shape of a resume
    section heading, regardless of whether we recognize its text."""
    l = line.strip()
    if not l or len(l) > _MAX_HEADING_LEN:
        return False
    if l.endswith((".", ",", ";", ":")) and not l.isupper():
        return False
    words = l.split()
    if len(words) > 6:
        return False
    letters = sum(1 for c in l if c.isalpha())
    return letters >= max(2, len(l) * 0.5)


def recognize_sections(text: str) -> dict:
    lines = [l.strip() for l in (text or "").splitlines() if l.strip()]

    recognized_order: list[str] = []       # canonical keys, in the order first seen
    positions: dict[str, list[int]] = {}   # canonical key -> line indices it was matched at
    unknown: list[str] = []

    for i, line in enumerate(lines):
        low = line.lower().strip(" :•-")
        if low in ALL_VARIANTS and _looks_like_heading(line):
            canon = ALL_VARIANTS[low]
            positions.setdefault(canon, []).append(i)
            if canon not in recognized_order:
                recognized_order.append(canon)
        elif _looks_like_heading(line) and len(low) > 2:
            # Not a recognized variant, but heading-shaped — worth surfacing
            # rather than silently ignoring, so a genuinely mis-titled
            # section is visible instead of just quietly not counted.
            unknown.append(line)

    recognized_core = [s for s in CORE_SECTIONS if s in recognized_order]
    recognized_optional = [s for s in OPTIONAL_SECTIONS if s in recognized_order]

    conflicts = [
        {"section": canon, "headings_found": len(idxs)}
        for canon, idxs in positions.items() if len(idxs) > 1
    ]

    ratio = len(recognized_core) / len(CORE_SECTIONS) if CORE_SECTIONS else 1.0

    return {
        "recognized_sections": recognized_order,
        "recognized_count": len(recognized_core),
        "expected_sections": list(CORE_SECTIONS),
        "expected_count": len(CORE_SECTIONS),
        "section_extraction_ratio": round(ratio, 3),
        "section_order": recognized_order,
        "section_conflicts": conflicts,
        "unknown_sections": unknown[:10],  # cap — this is a signal, not a full dump
        "optional_sections_found": recognized_optional,
        "missing_core_sections": [s for s in CORE_SECTIONS if s not in recognized_order],
    }
