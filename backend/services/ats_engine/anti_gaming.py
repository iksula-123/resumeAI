"""
ATS Intelligence 2.0 — Anti-Gaming detection (Phase D, product spec Part 29).

Important context this module documents rather than hides: the v2 keyword
matcher (keyword_aliases.match_lists_v2) is already structurally immune to
simple frequency-based gaming — a term is either "found" (present at all,
once) or "missing"; repeating "React React React React" doesn't make it
"found" 4x, it's still just found once, so it can't inflate a keyword-match
percentage no matter how many times it's repeated. What THIS module adds is
what the matcher can't: flagging the repetition ITSELF as a credibility/
quality signal (worth surfacing to the candidate), and giving the AI
recommendation engine (ai_recommendations.py) a check it must run before
ever proposing to insert MORE of an already-overused term.
"""
import re
from difflib import SequenceMatcher

_OVERUSE_THRESHOLD = 6  # matches scoring.py's own threshold — same philosophy, applied against JD terms specifically here
_JD_COPY_NGRAM = 12     # a run of this many consecutive shared words is a strong "pasted the JD" signal
_STUFFED_LINE_MIN_TOKENS = 8


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def detect_keyword_stuffing(raw_text: str, terms: list[str]) -> list[dict]:
    """Flags any term (JD keyword, skill, etc.) that appears unusually often
    in the resume's own text — reads as keyword-stuffing, not genuine depth."""
    text = _normalize(raw_text)
    if not text:
        return []
    flags = []
    for term in {t.strip().lower() for t in terms if t and t.strip()}:
        count = len(re.findall(r"\b" + re.escape(term) + r"\b", text))
        if count >= _OVERUSE_THRESHOLD:
            flags.append({
                "type": "keyword_stuffing", "term": term, "count": count,
                "message": f"\"{term}\" appears {count} times — this reads as keyword-stuffing rather than genuine depth, and won't improve your match score (a term only needs to be found once).",
            })
    return flags


def detect_jd_copying(resume_text: str, job_text: str) -> dict | None:
    """A long run of consecutive words shared verbatim between the resume
    and the JD is a strong signal the JD was pasted directly into the
    resume rather than describing genuine experience."""
    r_words = _normalize(resume_text).split()
    j_words = _normalize(job_text).split()
    if len(r_words) < _JD_COPY_NGRAM or len(j_words) < _JD_COPY_NGRAM:
        return None

    matcher = SequenceMatcher(None, r_words, j_words, autojunk=False)
    match = matcher.find_longest_match(0, len(r_words), 0, len(j_words))
    if match.size >= _JD_COPY_NGRAM:
        phrase = " ".join(r_words[match.a: match.a + match.size])
        return {
            "type": "jd_copying", "shared_words": match.size,
            "evidence": phrase,
            "message": f"A {match.size}-word phrase from the job description appears verbatim in your resume — this reads as copied JD text rather than your own experience, and doesn't help your credibility with a recruiter.",
        }
    return None


def detect_stuffed_keyword_blocks(raw_text: str) -> list[dict]:
    """A line that's mostly a dense, comma/pipe-separated list of short
    tokens with no sentence structure — the classic 'hidden keyword list'
    pattern (sometimes literally hidden via tiny/white text in the original
    file, which this project has no way to detect from plain extracted
    text — flagged here as a text-shape heuristic instead, not a claim
    about the file's actual visual styling)."""
    flags = []
    for line in (raw_text or "").splitlines():
        line = line.strip()
        if not line:
            continue
        tokens = re.split(r"[,|/;]", line)
        tokens = [t.strip() for t in tokens if t.strip()]
        if len(tokens) < _STUFFED_LINE_MIN_TOKENS:
            continue
        avg_len = sum(len(t.split()) for t in tokens) / len(tokens)
        has_verb_like_structure = bool(re.search(r"\b(the|and|with|for|to|of|a|an)\b", line.lower()))
        if avg_len <= 2 and not has_verb_like_structure:
            flags.append({
                "type": "stuffed_keyword_block", "line": line[:200], "token_count": len(tokens),
                "message": "This line reads as a dense keyword list rather than natural sentence structure — fine for a Skills section, but if this is inside an experience bullet it may look like keyword stuffing to a recruiter.",
            })
    return flags[:5]


def analyze_anti_gaming(resume_text: str, job_text: str, terms_to_check: list[str]) -> dict:
    """The module's single entry point. Returns every flag found — never
    silently mutates a score; the caller decides how to use these (surface
    as warnings, or refuse to let the AI recommend inserting MORE of an
    already-flagged term — see ai_recommendations.py)."""
    flags = []
    flags.extend(detect_keyword_stuffing(resume_text, terms_to_check))
    jd_copy = detect_jd_copying(resume_text, job_text) if job_text else None
    if jd_copy:
        flags.append(jd_copy)
    flags.extend(detect_stuffed_keyword_blocks(resume_text))
    return {"flags": flags, "is_clean": len(flags) == 0}


def is_term_overused(raw_text: str, term: str) -> bool:
    """Used by ai_recommendations.py to refuse proposing more of a term
    that's already flagged as stuffed."""
    hits = detect_keyword_stuffing(raw_text, [term])
    return len(hits) > 0
