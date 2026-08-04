"""
Pure-text heuristics used by ATSService for formatting/readability/recruiter
readiness — no AI calls, deterministic, and each returns a `note` explaining
exactly how the number was derived (never just a bare score).
"""
import re

_SECTION_HEADERS = ("experience", "education", "skills", "projects", "summary",
                    "certifications", "objective", "achievements")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE_RE = re.compile(r"(\+?\d[\d\s\-()]{8,}\d)")
_VOWEL_GROUPS = re.compile(r"[aeiouyAEIOUY]+")


def formatting_score(raw_text: str) -> dict:
    """Approximates ATS-parseability from the EXTRACTED text — a resume that
    extracts cleanly (clear sections, consistent bullets, little garbling)
    is exactly the resume a real ATS parser will read correctly too."""
    text = raw_text or ""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if not lines:
        return {"score": 0, "note": "No extractable text found — the file may be a scanned image or corrupted."}

    lower_lines = [l.lower() for l in lines]
    headers_found = sum(1 for h in _SECTION_HEADERS if any(h in l and len(l) < 40 for l in lower_lines))
    bullet_lines = sum(1 for l in lines if l.startswith(("-", "•", "*")) or re.match(r"^\d+[.)]\s", l))

    words = re.findall(r"\S+", text)
    # crude garbling signal: PDFs with tables/columns often extract with words
    # jammed together or split mid-word — very long or single-char "words" spike.
    odd_tokens = sum(1 for w in words if len(w) > 25 or (len(w) == 1 and w.isalpha()))
    garble_ratio = odd_tokens / len(words) if words else 1.0

    score = 40                                   # baseline: text extracted at all
    score += min(30, headers_found * 8)          # clear section headers
    score += min(20, (bullet_lines // 3) * 5)    # consistent bullet usage
    score -= min(40, round(garble_ratio * 200))  # penalize garbled extraction
    score = max(0, min(100, score))

    notes = [f"{headers_found} standard section headers detected", f"{bullet_lines} bullet-point lines found"]
    if garble_ratio > 0.05:
        notes.append("Some text extracted with irregular spacing — check for multi-column layouts, tables, or text boxes, which ATS parsers often misread.")
    return {"score": score, "note": "; ".join(notes)}


def _count_syllables(word: str) -> int:
    groups = _VOWEL_GROUPS.findall(word)
    n = len(groups)
    if word.endswith("e") and n > 1:
        n -= 1
    return max(1, n)


def readability_score(raw_text: str) -> dict:
    """Flesch Reading Ease on the resume's bullet/summary text. Resumes read
    best when concise — very low scores usually mean long, jargon-dense
    sentences that recruiters skim past."""
    text = raw_text or ""
    sentences = [s for s in re.split(r"[.!?\n]+", text) if s.strip()]
    words = re.findall(r"[a-zA-Z']+", text)
    if not sentences or not words:
        return {"score": 0, "note": "Not enough text to measure readability."}

    syllables = sum(_count_syllables(w) for w in words)
    asl = len(words) / len(sentences)     # avg sentence length
    asw = syllables / len(words)          # avg syllables per word
    flesch = 206.835 - 1.015 * asl - 84.6 * asw
    score = max(0, min(100, round(flesch)))

    if score >= 70:
        note = f"Easy to scan (avg {asl:.0f} words/line) — good for a fast recruiter read."
    elif score >= 50:
        note = f"Moderately dense (avg {asl:.0f} words/line) — consider shorter bullet points."
    else:
        note = f"Dense, long sentences (avg {asl:.0f} words/line) — break bullets into shorter, punchier statements."
    return {"score": score, "note": note}


def recruiter_readiness_score(resume: dict) -> dict:
    """Composite of contact completeness, quantified impact, and action-verb usage."""
    text = resume.get("raw_text", "") or ""
    has_email = bool(_EMAIL_RE.search(text))
    has_phone = bool(_PHONE_RE.search(text))

    all_bullets = [b for exp in (resume.get("experience") or []) for b in (exp.get("bullets") or [])]
    quantified = sum(1 for b in all_bullets if re.search(r"\d", b))
    quant_ratio = quantified / len(all_bullets) if all_bullets else 0

    action_verbs = resume.get("action_verbs") or []
    verb_ratio = len(action_verbs) / len(all_bullets) if all_bullets else 0

    score = 0
    notes = []
    score += 25 if has_email else 0
    score += 15 if has_phone else 0
    if not has_email:
        notes.append("No email address detected")
    if not has_phone:
        notes.append("No phone number detected")

    score += round(min(1, quant_ratio) * 35)
    notes.append(f"{quantified}/{len(all_bullets)} bullets include a number or metric" if all_bullets else "No experience bullets found to quantify")

    score += round(min(1, verb_ratio) * 25)
    notes.append(f"{len(action_verbs)} strong action verbs detected")

    return {"score": max(0, min(100, score)), "note": "; ".join(notes)}
