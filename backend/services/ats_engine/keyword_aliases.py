"""
ATS Intelligence 2.0 — alias-aware, false-positive-safe keyword matching.

This is a NEW, separate matcher for the v2 Job Match layer. It does NOT
modify or replace `keyword_engine.py`'s existing `match_lists()`/`_present()`
— those stay byte-for-byte frozen, since they still drive the existing
Match/Completeness/Confidence 7-category model (services/ats_engine/scoring.py),
which per the Phase B decision must keep behaving exactly as it does today.

Why a new matcher was needed (documented bug, verified empirically before
writing any code — see docs/ATS_PHASE_3_BACKUP.md):

  fuzz.token_set_ratio("react", "react native") == 100.0

`token_set_ratio` scores by SHARED TOKENS, so any short term that's a
substring-of-tokens of a longer, DIFFERENT technology reads as a perfect
match — "React" vs "React Native", "SQL" vs "NoSQL" territory. That's
exactly the kind of "unrelated words matching" the product spec forbids.

The fix, verified empirically against ~20 real term pairs (see
docs/ATS_PHASE_3_BACKUP.md for the raw numbers): switch the fuzzy fallback
to plain Levenshtein `fuzz.ratio` (length-sensitive, no token-subset
inflation) at the same 85 threshold. That alone fixes React/React Native
(58.8, below threshold) while still catching genuine near-typos and
plural/version variants (framework/frameworks=94.7, html/html5=88.9).

`ratio` alone can't catch legitimate ABBREVIATIONS where the strings are
short and simply different-length (JS/JavaScript=33.3, AWS/"Amazon Web
Services"=27.3) — that's what the curated alias table below is for.
"""
import re

from rapidfuzz import fuzz

MATCH_THRESHOLD_V2 = 85

# ── Curated alias table — deliberately small and honest, same philosophy as
# scoring.py's _RELATED_NOT_EQUIVALENT: these are pairs a human recruiter
# would treat as the SAME thing, not just "related." Not exhaustive — add to
# this list as real false negatives are found, don't try to enumerate every
# possible tech term up front. Keys/values are normalized (lowercase).
ALIASES: dict[str, set[str]] = {
    "javascript": {"js"}, "js": {"javascript"},
    "typescript": {"ts"}, "ts": {"typescript"},
    "aws": {"amazon web services"}, "amazon web services": {"aws"},
    "node": {"node.js", "nodejs"}, "node.js": {"node", "nodejs"}, "nodejs": {"node", "node.js"},
    "vue": {"vue.js", "vuejs"}, "vue.js": {"vue", "vuejs"}, "vuejs": {"vue", "vue.js"},
    "react": {"reactjs", "react.js"}, "reactjs": {"react", "react.js"}, "react.js": {"react", "reactjs"},
    "postgresql": {"postgres"}, "postgres": {"postgresql"},
    "kubernetes": {"k8s"}, "k8s": {"kubernetes"},
    "machine learning": {"ml"}, "ml": {"machine learning"},
    "artificial intelligence": {"ai"}, "ai": {"artificial intelligence"},
    "continuous integration": {"ci"}, "ci": {"continuous integration"},
    "continuous deployment": {"cd"}, "cd": {"continuous deployment"},
    "ci/cd": {"ci cd", "cicd"}, "cicd": {"ci/cd", "ci cd"},
    "application programming interface": {"api"}, "api": {"application programming interface"},
    "user interface": {"ui"}, "ui": {"user interface"},
    "user experience": {"ux"}, "ux": {"user experience"},
    ".net": {"dotnet", "dot net"}, "dotnet": {".net", "dot net"},
    "search engine optimization": {"seo"}, "seo": {"search engine optimization"},
    "structured query language": {"sql"}, "sql": {"structured query language"},
    "user acceptance testing": {"uat"}, "uat": {"user acceptance testing"},
}

# Explicitly NOT aliased, on purpose — kept here as a record of things that
# LOOK like they should alias but are genuinely different technologies/
# concepts, so nobody "fixes" this file into re-introducing the bug it exists
# to prevent. React Native is a distinct framework from React (web); NoSQL is
# not SQL; Java is not JavaScript.
_DELIBERATELY_NOT_ALIASED = ("react/react native", "sql/nosql", "java/javascript")


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _is_alias(a: str, b: str) -> bool:
    return b in ALIASES.get(a, ()) or a in ALIASES.get(b, ())


# Characters that "attach" to an adjacent letter/digit for boundary purposes
# — lets "C++"/"C#" be searched for (and found) as themselves, while stopping
# a bare "C" from matching INSIDE "C++"/"C#". Deliberately excludes "." —
# unlike "+"/"#", a period is far more often plain sentence punctuation than
# part of a term (".NET"), and treating it as attaching broke the much more
# common case of a term sitting right before a full stop (verified empirically
# before writing this — see docs/ATS_PHASE_3_BACKUP.md for the raw cases).
_ATTACH_CHARS = frozenset("+#")


def _word_boundary_present(term: str, text: str) -> bool:
    """Manual boundary scan (not regex lookaround — simpler to get right for
    mixed alnum/symbol terms like 'C++', '.NET'). A match only counts if the
    characters immediately before/after it aren't themselves alphanumeric or
    an "attaching" symbol — so 'c' doesn't match inside 'c++' or 'c#', but
    'react' correctly matches inside 'react native for mobile' (that's fine —
    the false-positive bug this module exists to fix was in the FUZZY scorer
    treating "React"=="React Native" as equivalent skills, not in plain
    substring containment, which is a different, legitimate operation)."""
    if not term:
        return False
    start = 0
    while True:
        idx = text.find(term, start)
        if idx == -1:
            return False
        before_ok = idx == 0 or not (text[idx - 1].isalnum() or text[idx - 1] in _ATTACH_CHARS)
        after_idx = idx + len(term)
        after_ok = after_idx >= len(text) or not (text[after_idx].isalnum() or text[after_idx] in _ATTACH_CHARS)
        if before_ok and after_ok:
            return True
        start = idx + 1


def present_v2(term: str, resume_items: list[str], resume_text: str) -> tuple[bool, str]:
    """Returns (found, match_type) — match_type in "exact" | "alias" | "fuzzy" | "none".

    Kept as a separate return value (not just a bool) so callers can show
    real evidence of HOW a term matched, per the "don't hide the formula"
    principle — e.g. flagging an alias match distinctly from an exact one.
    """
    t = _normalize(term)
    if not t:
        return False, "none"

    text = _normalize(resume_text)
    if _word_boundary_present(t, text):
        return True, "exact"

    items = [_normalize(h) for h in resume_items]
    for h in items:
        if h == t:
            return True, "exact"
        if _is_alias(t, h):
            return True, "alias"

    # Alias terms can also appear inline in the free-text resume, not just as
    # a discrete resume_items entry (e.g. "AWS" mentioned in a bullet).
    for alias in ALIASES.get(t, ()):
        if _word_boundary_present(alias, text):
            return True, "alias"

    for h in items:
        if fuzz.ratio(t, h) >= MATCH_THRESHOLD_V2:
            return True, "fuzzy"

    return False, "none"


def match_lists_v2(resume_items: list[str], job_items: list[str], resume_text: str = "") -> dict:
    """Same {pct, found, missing} shape as keyword_engine.match_lists(), so
    it's a drop-in for the v2 aggregation layer — plus per-term match_type
    evidence for debug/admin views (Part 46)."""
    job_items = [j for j in dict.fromkeys(job_items) if j and j.strip()]
    if not job_items:
        return {"pct": 100, "found": [], "missing": [], "evidence": []}

    found, missing, evidence = [], [], []
    for term in job_items:
        ok, match_type = present_v2(term, resume_items, resume_text)
        evidence.append({"keyword": term, "status": "matched" if ok else "missing", "match_type": match_type})
        (found if ok else missing).append(term)

    pct = round(len(found) / len(job_items) * 100)
    return {"pct": pct, "found": found, "missing": missing, "evidence": evidence}
