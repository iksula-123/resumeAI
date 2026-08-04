"""
RecommendationEngine — Stage 7 of the pipeline.

Turns the resume + JD + ATS gap analysis into concrete, rewritable advice:
bullet rewrites, weak-word call-outs, and where to naturally work in missing
keywords. LLM-driven (grounded in the candidate's OWN bullets — never
invents experience); falls back to a rule-based pass if no AI key is set.
"""
import re

from .llm import chat_json
from .resume_parser import _WEAK_WORDS


def _rule_based_weak_words(bullets: list[str]) -> list[dict]:
    hits = []
    for b in bullets:
        bl = b.lower()
        for w in _WEAK_WORDS:
            if w in bl:
                hits.append({"bullet": b, "weak_phrase": w})
    return hits


def _rule_based_fallback(resume: dict, job: dict, missing_keywords: list[str]) -> dict:
    all_bullets = [b for exp in (resume.get("experience") or []) for b in (exp.get("bullets") or [])]
    weak_hits = _rule_based_weak_words(all_bullets)

    rewrites = []
    for hit in weak_hits[:8]:
        rewrites.append({
            "original": hit["bullet"],
            "improved": re.sub(re.escape(hit["weak_phrase"]), "Owned", hit["bullet"], flags=re.IGNORECASE),
            "reason": f"Replace the passive phrase \"{hit['weak_phrase']}\" with a direct action verb.",
        })

    return {
        "bullet_rewrites": rewrites,
        "weak_words_found": sorted({h["weak_phrase"] for h in weak_hits}),
        "summary_suggestion": None,
        "missing_keyword_tips": [f"Work \"{k}\" into a relevant bullet if it genuinely applies to your experience." for k in missing_keywords[:8]],
        "general_tips": [
            "Start every bullet with a strong action verb (Led, Built, Reduced, Increased…).",
            "Quantify results wherever possible — %, ₹, time saved, team size.",
            "Mirror the exact terminology the job description uses for your real skills.",
        ],
        "generated_by": "rules",
    }


_PROMPT = """You are an expert resume writer and ATS optimization consultant. Below is a \
candidate's parsed resume and the job description they're targeting, plus the keywords \
their resume is currently MISSING for this job.

Give concrete, honest improvement advice. NEVER invent experience, skills, or achievements \
the candidate doesn't have — only rewrite what's already there to be clearer, stronger, and \
more keyword-aligned, and suggest where a missing keyword could honestly fit IF it applies.

Return a single JSON object with exactly these keys:
- "bullet_rewrites": array of up to 6 {{"original": str, "improved": str, "reason": str}} — \
pick the candidate's weakest existing bullets (passive language, no metrics, weak verbs) and \
rewrite them to be stronger, keeping the same underlying facts/claims
- "weak_words_found": array of specific weak phrases actually found in the resume text \
(e.g. "responsible for", "helped with")
- "summary_suggestion": a rewritten 2-3 sentence professional summary tailored to this job, \
using only real facts from the resume, or null if the resume has no summary section to improve
- "missing_keyword_tips": array of up to 8 short, specific suggestions for how to honestly work \
a missing JD keyword into the resume IF the candidate's real experience supports it
- "general_tips": array of 3-5 general improvement tips specific to this resume/JD pair

Candidate's experience bullets:
{bullets}

Missing keywords for this job: {missing}

Job title: {job_title}
Job responsibilities: {responsibilities}
"""


async def suggest(resume: dict, job: dict, missing_keywords: list[str]) -> dict:
    all_bullets = [b for exp in (resume.get("experience") or []) for b in (exp.get("bullets") or [])]
    if not all_bullets and not missing_keywords:
        return {
            "bullet_rewrites": [], "weak_words_found": [], "summary_suggestion": None,
            "missing_keyword_tips": [], "general_tips": ["Add work experience with achievement-focused bullet points to get tailored suggestions."],
            "generated_by": "none",
        }

    prompt = _PROMPT.format(
        bullets="\n".join(f"- {b}" for b in all_bullets[:20]) or "(none listed)",
        missing=", ".join(missing_keywords[:15]) or "(none — good keyword coverage)",
        job_title=job.get("job_title") or "(not specified)",
        responsibilities="; ".join((job.get("responsibilities") or [])[:8]),
    )
    result = await chat_json(prompt, max_tokens=2000)
    if result is None:
        return _rule_based_fallback(resume, job, missing_keywords)

    result.setdefault("bullet_rewrites", [])
    result.setdefault("weak_words_found", [])
    result.setdefault("summary_suggestion", None)
    result.setdefault("missing_keyword_tips", [])
    result.setdefault("general_tips", [])
    result["generated_by"] = "ai"
    return result
