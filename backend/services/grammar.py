"""
Local grammar & spell check (Milestone G).

Runs entirely on-device — pure-Python spell correction (pyspellchecker) plus
rule-based grammar fixes. NO paid API, so the free tier stays near-zero cost
(spec Section 5.G / 7). Resume-aware: it leaves proper nouns, ALL-CAPS, tech
terms and numbers alone so it never mangles names, companies or acronyms.
"""
import re

try:
    from spellchecker import SpellChecker
    _SPELL = SpellChecker(distance=2)
except Exception:  # pragma: no cover - degrade to grammar-only if unavailable
    _SPELL = None

# Words the dictionary flags but are valid in Indian entry-job resumes / tech.
_ALLOW = {
    "edubridge", "sahicareer", "telecalling", "telecaller", "fresher", "freshers",
    "bpo", "ites", "kyc", "casa", "crm", "fintech", "ecommerce", "upskilling",
    "cse", "csa", "cce", "sql", "api", "apis", "html", "css", "javascript",
    "excel", "tally", "erp", "gst", "ms", "os", "hdfc", "icici", "wipro", "infosys",
}

_CONTRACTIONS = {
    r"\bi\b": "I", r"\bi'm\b": "I'm", r"\bi've\b": "I've",
    r"\bi'll\b": "I'll", r"\bi'd\b": "I'd",
}


def _spell_word(word: str) -> str | None:
    """Return a corrected lowercase-ish word, or None if no change is warranted."""
    if _SPELL is None:
        return None
    core = word.strip()
    if len(core) < 4:                     # too short to safely correct
        return None
    if not core.isalpha():                # has digits/punctuation → skip
        return None
    if core[0].isupper():                 # likely a proper noun → don't touch
        return None
    if core.lower() in _ALLOW:
        return None
    if core.lower() in _SPELL:            # already a valid word
        return None
    corrected = _SPELL.correction(core.lower())
    if corrected and corrected != core.lower():
        return corrected
    return None


def check_text(text: str) -> dict:
    """Return {corrected, fixes:[{type,before,after}], num_fixes} for one text block."""
    if not text or not text.strip():
        return {"corrected": text or "", "fixes": [], "num_fixes": 0}

    fixes: list[dict] = []
    out = text

    # ── grammar / punctuation rules ─────────────────────────────────────────
    def sub(pattern, repl, kind, flags=0):
        nonlocal out
        new = re.sub(pattern, repl, out, flags=flags)
        if new != out:
            fixes.append({"type": kind})
            out = new

    sub(r"[ \t]{2,}", " ", "extra spaces")
    sub(r"\s+([,.;:!?])", r"\1", "space before punctuation")
    sub(r"([,.;:!?])([A-Za-z])", r"\1 \2", "missing space after punctuation")
    sub(r"\b(\w+)\s+\1\b", r"\1", "repeated word", flags=re.IGNORECASE)
    for pat, rep in _CONTRACTIONS.items():
        sub(pat, rep, "capitalize “I”")

    # capitalize the first letter of each sentence
    before_cap = out
    out = re.sub(r"([.!?]\s+)([a-z])", lambda m: m.group(1) + m.group(2).upper(), out)
    if out != before_cap:
        fixes.append({"type": "sentence capitalization"})

    # ── spell correction (word by word, capitalization-preserving) ──────────
    spell_fixes = 0
    def fix_token(m: re.Match) -> str:
        nonlocal spell_fixes
        w = m.group(0)
        corrected = _spell_word(w)
        if corrected is None:
            return w
        spell_fixes += 1
        return corrected.capitalize() if w[0].isupper() else corrected

    out = re.sub(r"[A-Za-z']+", fix_token, out)
    if spell_fixes:
        fixes.append({"type": "spelling", "count": spell_fixes})

    # ── capitalize the first letter of the block ────────────────────────────
    stripped = out.lstrip()
    if stripped and stripped[0].islower():
        idx = len(out) - len(stripped)
        out = out[:idx] + stripped[0].upper() + stripped[1:]
        fixes.append({"type": "capitalize first letter"})

    return {"corrected": out, "fixes": fixes, "num_fixes": len(fixes)}


def check_many(texts: list[str]) -> list[dict]:
    return [check_text(t) for t in (texts or [])]
