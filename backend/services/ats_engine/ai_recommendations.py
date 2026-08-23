"""
ATS Intelligence 2.0 — AI ATS Recommendation Engine (Phase D).

Two-stage design, per the product spec's performance rule (Part 32 — "do
not run full AI analysis after every keystroke... AI generation should only
occur when requested"):

  STAGE 1 (cheap, deterministic, no AI): classify_and_stage() turns Phase
  C's already-computed, purely-deterministic recommendations
  (ats_intelligence_v2.build_editor_recommendations()) into addressable
  AtsRecommendation-shaped dicts — action_type, priority, affected section/
  item, and whether real evidence is missing. No AI call happens here.

  STAGE 2 (AI, called lazily, only for one recommendation at a time — never
  in bulk): generate_proposal() calls the AI ONLY when a specific
  recommendation is being previewed/applied, using services/ai.py's
  actual provider abstraction (_chat — Gemini first, OpenAI fallback), with
  a prompt that is stricter than anything else in this codebase about never
  inventing a fact. If the resume genuinely lacks the evidence needed
  (e.g. no metric anywhere near this bullet), no AI call is made at all —
  a candidate question is generated instead, deterministically.

Every proposal is tagged with an evidence tier (verified / inferred /
suggested / unknown) — see docs/SAHICAREER_ATS_INTELLIGENCE_2.md. AI failure
never blocks the deterministic recommendation list — see generate_proposal()'s
own fallback.
"""
import re

from services import ai as ai_service
from .anti_gaming import is_term_overused

# ── Action type classification (product spec Part 13 — controlled list only) ─

_ACTION_TYPE_MAP = {
    ("resume_quality", "quantified_impact"): "quantify_bullet",
    ("resume_quality", "bullet_quality"): "improve_bullet",
    ("resume_quality", "action_verbs"): "improve_bullet",
    ("resume_quality", "summary_quality"): "improve_summary",
    ("resume_quality", "skill_evidence"): "add_skill_evidence",
    ("resume_quality", "readability"): "improve_readability",
    ("resume_quality", "repetition"): "remove_repetition",
    ("resume_quality", "recruiter_readiness"): "improve_bullet",
    ("resume_quality", "career_progression"): "improve_experience_alignment",
    ("resume_quality", "seniority"): "improve_experience_alignment",
    ("resume_quality", "credibility"): "improve_experience_alignment",
    ("resume_quality", "completeness"): "fix_section",
    ("job_match", "keywords"): "add_keyword",
    ("job_match", "skills"): "improve_skills",
    ("job_match", "experience"): "improve_experience_alignment",
    ("job_match", "education"): "fix_section",
    ("ats_compatibility", "sections"): "fix_section",
    ("ats_compatibility", "formatting"): "fix_formatting",
    ("ats_compatibility", "parsing"): "fix_formatting",
}

# Action types where the fix is purely a REWORDING of facts already on the
# resume — safe to AI-generate directly, no new evidence needed from the user.
_REWORD_ONLY_TYPES = {"improve_bullet", "improve_readability", "remove_repetition"}
# Action types that genuinely need a new fact from the user before any
# content can be proposed — never AI-generated speculatively.
_NEEDS_EVIDENCE_TYPES = {"quantify_bullet", "add_keyword", "add_skill_evidence", "improve_skills"}
# Structural findings — no text rewrite is proposed at all; the frontend
# shows these as informational, not "Apply Fix"-able (Part 24: formatting
# changes are never auto-applied, only offered as an explicit opt-in preview).
_STRUCTURAL_TYPES = {"fix_section", "fix_formatting"}


def _classify(layer: str, category_key: str) -> str:
    return _ACTION_TYPE_MAP.get((layer, category_key), "improve_bullet")


def _priority_from_match(match: float | None) -> str:
    if match is None:
        return "high"
    if match < 40:
        return "high"
    if match < 65:
        return "medium"
    return "low"


# ── Stage 1 — deterministic classification, no AI ───────────────────────────

def classify_and_stage(resume: dict, job: dict | None, full_result: dict, deterministic_recs: dict) -> list[dict]:
    """Turns Phase C's {high, medium, low} issue/why/action/impact dicts into
    addressable, typed recommendation dicts ready to persist as
    AtsRecommendation rows. No AI call in this function — purely
    deterministic, safe to run on every analysis."""
    staged = []

    for tier_name, tier_items in deterministic_recs.items():
        for item in tier_items:
            # source_layer/source_category are attached directly by
            # build_editor_recommendations() — not guessed back from text.
            # An earlier version tried substring-matching `why` against
            # category reasons, which silently mis-classified every
            # job_match-sourced item (their `why` text is hand-written, not
            # a copy of cat["reason"]) — caught by the Phase D E2E test.
            layer = item.get("source_layer", "resume_quality")
            category_key = item.get("source_category", "bullet_quality")
            action_type = _classify(layer, category_key)
            requires_input = action_type in _NEEDS_EVIDENCE_TYPES
            question = _build_question(action_type, item, resume) if requires_input else None
            target_text = _extract_target_text(action_type, item, resume)
            staged.append({
                "action_type": action_type,
                "priority": tier_name,
                "title": item["issue"],
                "reason": item["why"],
                "affected_section": layer,
                "affected_item_id": category_key,
                "target_text": target_text,
                "score_impact_estimate": tier_name,
                "requires_user_input": requires_input,
                "question": question,
                "evidence_tier": "unknown" if requires_input else "suggested",
            })

    return staged


def _extract_target_text(action_type: str, item: dict, resume: dict) -> str | None:
    """The exact, verbatim text apply_fix.py will search for and replace —
    captured ONCE here, deterministically, rather than re-derived from
    title/reason strings at apply time (which don't reliably contain the
    right quoted substring for every action type — a real bug caught by
    the Phase D E2E test: title/reason text for a bullet-quality
    recommendation never actually contains the target bullet, it's only in
    the `action` field)."""
    if action_type == "improve_summary":
        return resume.get("summary") or ""
    if action_type in ("add_keyword", "improve_skills"):
        m = re.findall(r'"([^"]+)"', item.get("issue") or "")
        return m[0] if m else None
    if action_type in ("quantify_bullet", "improve_bullet", "remove_repetition", "add_skill_evidence"):
        # These come from Resume Quality's missing_evidence, surfaced in
        # build_editor_recommendations() as `action`, e.g.
        # 'Weak phrasing: "Responsible for backend development."'
        m = re.findall(r'"([^"]+)"', item.get("action") or "")
        return m[0] if m else None
    return None


def _build_question(action_type: str, item: dict, resume: dict) -> str:
    """Deterministic, evidence-grounded — never invents an answer."""
    if action_type == "quantify_bullet":
        return "Is there a real number you can add here — a count, %, time saved, or team size? " + item["action"]
    if action_type == "add_keyword":
        return item["issue"] + " Do you genuinely have this skill? If so, where did you use it — Experience, a Project, or a Certification?"
    if action_type == "add_skill_evidence":
        return item["issue"] + " Can you point to where you used it?"
    if action_type == "improve_skills":
        return item["issue"] + " Do you genuinely have this skill, and if so, where does it show up in your experience?"
    return item["action"]


# ── Stage 2 — AI proposal generation, called lazily, one at a time ─────────

_REWRITE_PROMPT = """You are helping a candidate improve ONE resume bullet point. You may ONLY use facts that are explicitly given below — you must NEVER invent a number, percentage, employer, date, job title, technology, team size, or any other fact that isn't already present.

Original bullet:
"{original}"

{evidence_line}

Rules:
- Start with a strong action verb.
- Keep every fact from the original bullet — do not add anything not explicitly given.
- If no metric is provided above, do NOT invent one — just tighten the language and use a stronger verb.
- Maximum 25 words.
- Return ONLY the rewritten bullet text, nothing else — no quotes, no explanation.
"""

_SUMMARY_PROMPT = """Rewrite this resume summary to be more specific and less generic. You may ONLY use facts explicitly given below — never invent years of experience, an employer, a skill, or any achievement not already stated.

Original summary:
"{original}"

Known facts about this candidate (from their resume, use ONLY these): {facts}

Rules:
- Remove generic filler phrases ("hardworking professional", "team player", etc.)
- 2-3 sentences, specific to the facts given.
- Return ONLY the rewritten summary, nothing else.
"""


async def generate_proposal(action_type: str, original_text: str, resume: dict, user_answer: str | None = None,
                             raw_text: str = "", overused_term: str | None = None) -> dict:
    """Called lazily for ONE recommendation at a time (never in bulk). Never
    fabricates: for evidence-needing types, only proceeds if user_answer is
    provided; for reword-only types, the AI prompt explicitly forbids
    inventing anything not already in the text. AI failure returns
    proposed_content=None (never a fabricated fallback) — the caller must
    treat that as "AI unavailable," not silently apply nothing."""
    if overused_term and is_term_overused(raw_text, overused_term):
        return {"proposed_content": None, "evidence_tier": "unknown",
                "source_note": f"\"{overused_term}\" already appears unusually often in this resume — adding more would look like keyword stuffing, not genuine depth. Declined to propose this."}

    if action_type in _NEEDS_EVIDENCE_TYPES:
        if not user_answer or not user_answer.strip():
            return {"proposed_content": None, "evidence_tier": "unknown",
                    "source_note": "No user-provided evidence yet — a proposal can't be generated until the candidate answers the question."}
        if action_type == "quantify_bullet":
            evidence_line = f"The candidate has confirmed this specific detail: \"{user_answer.strip()}\" — you MAY use this exact fact, nothing more."
            raw = await ai_service._chat(_REWRITE_PROMPT.format(original=original_text, evidence_line=evidence_line), max_tokens=200)
            if raw is None:
                return {"proposed_content": None, "evidence_tier": "verified",
                        "source_note": "AI improvement is temporarily unavailable — your confirmed detail is saved and can be applied manually."}
            return {"proposed_content": raw.strip().strip('"'), "evidence_tier": "verified",
                    "source_note": f"Candidate-confirmed metric: \"{user_answer.strip()}\""}
        # add_keyword / add_skill_evidence / improve_skills — the "proposal"
        # here is recording where the user says the evidence lives; no bullet
        # rewrite is auto-generated (that would risk overstating the skill).
        return {"proposed_content": user_answer.strip(), "evidence_tier": "verified",
                "source_note": f"Candidate-confirmed: \"{user_answer.strip()}\" — add this yourself where it genuinely applies."}

    if action_type in _REWORD_ONLY_TYPES:
        evidence_line = "No new facts are available — only reword what's already there; do not add a metric that isn't present."
        raw = await ai_service._chat(_REWRITE_PROMPT.format(original=original_text, evidence_line=evidence_line), max_tokens=200)
        if raw is None:
            return {"proposed_content": None, "evidence_tier": "inferred",
                    "source_note": "AI improvement is temporarily unavailable — try again shortly."}
        return {"proposed_content": raw.strip().strip('"'), "evidence_tier": "inferred",
                "source_note": "Reworded from your existing bullet — no new facts added."}

    if action_type == "improve_summary":
        skills = ", ".join(resume.get("skills") or resume.get("hard_skills") or [])
        years = resume.get("total_experience_years")
        facts = f"{years or 'unspecified'} years of experience; skills: {skills or 'none listed'}"
        raw = await ai_service._chat(_SUMMARY_PROMPT.format(original=original_text, facts=facts), max_tokens=300)
        if raw is None:
            return {"proposed_content": None, "evidence_tier": "inferred", "source_note": "AI improvement is temporarily unavailable."}
        return {"proposed_content": raw.strip().strip('"'), "evidence_tier": "inferred",
                "source_note": "Reworded using only facts already on your resume."}

    # fix_section / fix_formatting — structural, never an auto-generated
    # text rewrite (Part 24: formatting changes are opt-in preview only).
    return {"proposed_content": None, "evidence_tier": "suggested",
            "source_note": "This is a structural recommendation, not a text rewrite — no automatic proposal is generated."}
