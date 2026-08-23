"""
ATS Intelligence 2.0 — Apply Fix orchestrator (Phase D, product spec Parts
8-14, 33, 36-38).

The full loop: locate the target text in the CURRENT resume content (never
the content as it was when the recommendation was generated — that's
exactly what the staleness check guards against) → apply the one field's
change via the exact same content-decomposition path a normal manual edit
uses (routers.resumes._apply_content — reused, not reimplemented, so this
can never drift from normal-edit correctness) → reparse → rescore with the
canonical v2 engine → real score/category deltas → write AtsChangeHistory
→ update the recommendation's status.

Deliberately reuses routers.resumes' "private" helpers (_get_owned,
_apply_content, _to_content, _snapshot) rather than duplicating ~100 lines
of content-decomposition logic — the alternative (hand-rolling ORM mutation
here) risks silently drifting from what a normal manual edit does. This is
a service importing from a router module, not a router-to-router import
(the pattern the codebase already avoids elsewhere).
"""
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from models import AtsChangeHistory, AtsRecommendation, AtsReport, Resume
from routers.resumes import _apply_content, _to_content, _snapshot, _load_full
from services.ats_engine import ResumeParser, JobParser, ats_intelligence_v2, mode_orchestrator
from services.usage import tenant_of


class StaleRecommendationError(Exception):
    """The resume changed since this recommendation was generated — never
    silently apply a stale proposal on top of newer edits (Part 33)."""


class TargetNotFoundError(Exception):
    """The exact text this recommendation targets is no longer present —
    same root cause as staleness (something else already changed it)."""


def _copy_content(content: dict) -> dict:
    import copy
    return copy.deepcopy(content)


def _locate_and_apply(content: dict, section: str, target_text: str, new_text: str) -> tuple[dict, list[str], str | None]:
    """Finds `target_text` verbatim in the given section of `content` and
    replaces it with `new_text`. Returns (new_content, changed_fields,
    before_value) — before_value is None if the target wasn't found (the
    caller treats this as staleness, per Part 33)."""
    new_content = _copy_content(content)
    changed_fields = []
    before_value = None

    if section == "summary":
        if (content.get("summary") or "").strip() == (target_text or "").strip():
            before_value = content.get("summary") or ""
            new_content["summary"] = new_text
            changed_fields.append("summary")
        return new_content, changed_fields, before_value

    if section in ("experience", "resume_quality", "job_match"):
        # bullets can live under any of these classification labels
        # depending on which category flagged them — search all experience
        # bullets regardless of the label, since the text itself is the
        # real locator, not the label.
        for i, exp in enumerate(new_content.get("experience") or []):
            bullets = exp.get("bullets") or []
            for j, b in enumerate(bullets):
                if b.strip() == (target_text or "").strip():
                    before_value = b
                    bullets[j] = new_text
                    exp["bullets"] = bullets
                    changed_fields.append(f"experience[{i}].bullets[{j}]")
                    return new_content, changed_fields, before_value

    return new_content, changed_fields, None


def _add_skill_if_missing(content: dict, skill_name: str) -> tuple[dict, list[str], str | None]:
    new_content = _copy_content(content)
    existing = [s.get("name", "") if isinstance(s, dict) else str(s) for s in (new_content.get("skills") or [])]
    if skill_name.lower() in [e.lower() for e in existing]:
        return new_content, [], None  # already present — nothing to change, not an error
    new_content.setdefault("skills", []).append({"name": skill_name, "level": 70})
    return new_content, ["skills"], "(not previously listed)"


async def check_staleness(recommendation: AtsRecommendation, resume: Resume) -> None:
    """Part 33 — a recommendation generated against an older resume state
    must be refused, not silently applied on top of newer edits."""
    if recommendation.resume_updated_at_snapshot is None:
        return  # older recommendations (shouldn't happen going forward) — don't block
    snap = recommendation.resume_updated_at_snapshot
    current = resume.updated_at
    if snap.tzinfo is None:
        snap = snap.replace(tzinfo=timezone.utc)
    if current and current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    if current and current > snap:
        raise StaleRecommendationError(
            "This recommendation is based on an older version of your resume. Re-analyze before applying."
        )


async def apply_recommendation(
    db: AsyncSession,
    recommendation: AtsRecommendation,
    resume: Resume,
    final_content_text: str,
) -> dict:
    """The full apply → reparse → rescore → delta → history loop.

    `final_content_text` is whatever the user actually approved — the AI's
    proposal, OR the user's own edit of it (Part 19: "never overwrite user
    edits with the original AI proposal"). Never re-derives this from the
    AI proposal internally — the caller is responsible for passing exactly
    what was shown to and approved by the user.
    """
    await check_staleness(recommendation, resume)

    old_content = _to_content(resume)

    # ── locate + apply the one targeted field ───────────────────────────
    # target_text was captured once, deterministically, at recommendation
    # staging time (ai_recommendations._extract_target_text) — not re-parsed
    # from title/reason here (that was a real bug: those strings don't
    # reliably contain the right quoted substring for every action type,
    # caught by the Phase D E2E test before ever reaching an apply call).
    if recommendation.action_type in ("add_keyword", "improve_skills"):
        skill_name = recommendation.target_text or final_content_text
        new_content, changed_fields, before_value = _add_skill_if_missing(old_content, skill_name)
    elif recommendation.action_type == "add_skill_evidence":
        # Evidence for an already-listed skill isn't a content field to
        # overwrite — the user's answer is recorded in change history as
        # supporting evidence, but the skill itself was already present.
        new_content, changed_fields, before_value = old_content, [], "(evidence recorded, no resume field changed)"
    else:
        target_text = recommendation.target_text or ""
        section = "summary" if recommendation.action_type == "improve_summary" else "experience"
        new_content, changed_fields, before_value = _locate_and_apply(old_content, section, target_text, final_content_text)

    if before_value is None and recommendation.action_type not in ("add_skill_evidence",):
        raise TargetNotFoundError(
            "Could not find the exact text this recommendation targets — your resume may have changed. Re-analyze before applying."
        )

    # ── apply via the SAME path a normal manual edit uses ───────────────
    try:
        await _apply_content(db, resume, new_content)
        resume.updated_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Could not save the resume update — no change was applied.")

    # Re-fetch with the same eager-loading _apply_content itself relies on —
    # a plain db.refresh() does not reload selectinload'd relationships, so
    # reading resume.experiences/etc. again without this could silently see
    # stale data.
    resume = await _load_full(db, resume.id)

    await _snapshot(db, resume, resume.user_id, "ats_ai_fix", throttle=False)
    await db.commit()

    # ── reparse + rescore — never `old_score + estimate` (Part 9/36).
    # Both "before" and "after" are scored fresh through the SAME canonical
    # engine ATS Checker/Editor use (mode_orchestrator.resume_health_mode,
    # + job_match_mode when a JD is part of this workflow) — NOT read back
    # from the stored AtsReport (which only persists the 7-category legacy
    # shape). The AtsReport is used only to recover the job/JD context this
    # recommendation was generated against. ──
    _, job_description, job = await _score_from_report(db, recommendation.ats_report_id)
    rescore_ok = True
    before_score, before_layers = None, None
    after_score, after_layers, category_deltas = None, None, []
    try:
        scores = await _canonical_before_after(old_content, _to_content(resume), job_description, job)
        before_score, before_layers = scores["before_score"], scores["before_layers"]
        after_score, after_layers = scores["after_score"], scores["after_layers"]
        category_deltas = scores["category_deltas"]
    except Exception:
        rescore_ok = False  # Part 38 — resume update succeeded; scoring did not. Never claim a fake improvement.

    score_delta = (after_score - before_score) if (rescore_ok and after_score is not None and before_score is not None) else None

    if rescore_ok and after_score is not None:
        # ATS consolidation Phase 4: Resume.ats_score = canonical Resume ATS
        # Health only — after_score here already is exactly that (the
        # resume-only layer of _canonical_before_after, never job_match),
        # so the resume's headline score doesn't go stale until the editor's
        # next debounced /analyze-editor call.
        resume.ats_score = after_score

    history = AtsChangeHistory(
        resume_id=resume.id, user_id=resume.user_id, ats_report_id=recommendation.ats_report_id,
        recommendation_id=recommendation.id, action_type=recommendation.action_type,
        before_content=before_value, after_content=final_content_text,
        user_approved=True, before_score=before_score, after_score=after_score, score_delta=score_delta,
        changed_fields=changed_fields, changed_metrics=category_deltas,
        scoring_engine_version=ats_intelligence_v2.ats_config.SCORING_ENGINE_VERSION,
    )
    db.add(history)
    recommendation.status = "applied"
    recommendation.final_content = final_content_text
    await db.commit()
    await db.refresh(history)

    return {
        "success": True,
        "rescore_pending": not rescore_ok,
        "before_score": before_score,
        "after_score": after_score,
        "score_delta": score_delta,
        "before_layers": before_layers,
        "after_layers": after_layers,
        "changed_metrics": category_deltas,
        "changed_fields": changed_fields,
        "change_history_id": str(history.id),
        "message": ("Resume updated. ATS score is being recalculated." if not rescore_ok else None),
    }


async def undo_change(db: AsyncSession, history_row: AtsChangeHistory, resume: Resume) -> dict:
    """Part 14 — restores the previous field value, saves, reparses,
    rescores, and creates ANOTHER history record (never just edits the
    displayed number)."""
    old_content = _to_content(resume)
    pre_undo_content = old_content  # captured before any mutation, for real "before" scoring below
    if not history_row.changed_fields:
        raise TargetNotFoundError("This change has no recorded field to restore.")

    field = history_row.changed_fields[0]
    new_content = _copy_content(old_content)
    restored = history_row.before_content or ""

    if field == "summary":
        new_content["summary"] = restored
    elif field.startswith("experience["):
        import re
        m = re.match(r"experience\[(\d+)\]\.bullets\[(\d+)\]", field)
        if not m:
            raise TargetNotFoundError("Could not parse the field to restore.")
        i, j = int(m.group(1)), int(m.group(2))
        exps = new_content.get("experience") or []
        if i >= len(exps) or j >= len(exps[i].get("bullets") or []):
            raise TargetNotFoundError("The original location no longer exists — it may have been edited since.")
        exps[i]["bullets"][j] = restored
    elif field == "skills":
        # undo an added skill — remove it if present
        added_name = (history_row.after_content or "").strip()
        new_content["skills"] = [s for s in (new_content.get("skills") or [])
                                  if (s.get("name", "") if isinstance(s, dict) else str(s)).lower() != added_name.lower()]
    else:
        raise TargetNotFoundError("Unrecognized field — cannot undo automatically.")

    try:
        await _apply_content(db, resume, new_content)
        resume.updated_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Could not restore the previous content.")

    resume = await _load_full(db, resume.id)
    await _snapshot(db, resume, resume.user_id, "ats_undo", throttle=False)
    await db.commit()

    _, job_description, job = await _score_from_report(db, history_row.ats_report_id)
    rescore_ok = True
    before_score, before_layers = None, None
    after_score, after_layers, category_deltas = None, None, []
    try:
        scores = await _canonical_before_after(pre_undo_content, _to_content(resume), job_description, job)
        before_score, before_layers = scores["before_score"], scores["before_layers"]
        after_score, after_layers = scores["after_score"], scores["after_layers"]
        category_deltas = scores["category_deltas"]
    except Exception:
        rescore_ok = False

    score_delta = (after_score - before_score) if (rescore_ok and after_score is not None and before_score is not None) else None

    if rescore_ok and after_score is not None:
        # ATS consolidation Phase 4: Resume.ats_score = canonical Resume ATS
        # Health only — see the matching note in apply_recommendation().
        resume.ats_score = after_score

    undo_history = AtsChangeHistory(
        resume_id=resume.id, user_id=resume.user_id, ats_report_id=history_row.ats_report_id,
        recommendation_id=history_row.recommendation_id, action_type="undo",
        before_content=history_row.after_content, after_content=history_row.before_content,
        user_approved=True, before_score=before_score, after_score=after_score, score_delta=score_delta,
        changed_fields=history_row.changed_fields, changed_metrics=category_deltas,
        scoring_engine_version=ats_intelligence_v2.ats_config.SCORING_ENGINE_VERSION,
    )
    db.add(undo_history)
    await db.commit()
    await db.refresh(undo_history)

    return {
        "success": True, "rescore_pending": not rescore_ok,
        "before_score": before_score, "after_score": after_score, "score_delta": score_delta,
        "changed_metrics": category_deltas, "change_history_id": str(undo_history.id),
    }


# ── helpers ──────────────────────────────────────────────────────────────────


async def _score_from_report(db: AsyncSession, ats_report_id) -> tuple[int | None, str | None, dict | None]:
    """Recovers the job/JD context this recommendation was generated
    against, from the linked AtsReport — so "before"/"after" job_match (when
    a JD is part of the workflow) always means the actual JD this
    recommendation was generated against, never a guess. `report.score` is
    returned too but is NOT used as a scoring input by callers — it's the
    persisted score of whichever engine produced that historical AtsReport
    row, kept only for any caller that wants the raw stored value; the
    canonical before/after scores below are always computed fresh via
    mode_orchestrator, never read back from here (Part 9/36)."""
    if not ats_report_id:
        return None, None, None
    report = await db.get(AtsReport, ats_report_id)
    if not report:
        return None, None, None
    job = None
    if report.job_description:
        job = await JobParser.parse(report.job_description)
    return report.score, report.job_description, job


def _compute_category_deltas(before_layers: dict | None, after_layers: dict | None) -> list[dict]:
    if not before_layers or not after_layers:
        return []
    deltas = []
    for key in ("ats_compatibility", "job_match", "resume_quality"):
        b, a = before_layers.get(key), after_layers.get(key)
        if b is not None and a is not None:
            deltas.append({"category": key, "before": b, "after": a, "delta": a - b})
    return deltas


async def _canonical_before_after(before_content: dict, after_content: dict,
                                   job_description: str | None, job: dict | None) -> dict:
    """THE canonical before/after scoring call for the AI Fix / Undo loop
    (Phase 1 of the ATS consolidation — product spec: 'before =
    resume_health_mode(before_resume); after = resume_health_mode
    (after_resume); if a JD is part of the workflow, also before/after
    job_match_mode'). Resume ATS Health is ALWAYS resume-only and is NEVER
    blended with Job Match here — Job Match, when a JD is present, is
    reported as its own separate layer, exactly like every other surface in
    this system (ATS Checker, Editor). Never `old_score + estimate`: every
    value below is a fresh call into the same canonical engine ATS Checker/
    Editor use, from the actual old/new resume content."""
    before_resume = ResumeParser.from_content(before_content)
    after_resume = ResumeParser.from_content(after_content)

    before_health = mode_orchestrator.resume_health_mode(before_resume)
    after_health = mode_orchestrator.resume_health_mode(after_resume)

    before_layers = {
        "ats_compatibility": before_health["layers"]["ats_compatibility"]["score"],
        "resume_quality": before_health["layers"]["resume_quality"]["score"],
        "job_match": None,
    }
    after_layers = {
        "ats_compatibility": after_health["layers"]["ats_compatibility"]["score"],
        "resume_quality": after_health["layers"]["resume_quality"]["score"],
        "job_match": None,
    }

    # A JD being part of THIS workflow (the AtsReport this recommendation/
    # change was generated against had one) also gets a before/after Job
    # Match — reported alongside, never merged into the Resume ATS Health
    # score itself.
    if job:
        sufficiency = JobParser.assess_sufficiency(job_description or "", job)
        before_jm = mode_orchestrator.job_match_mode(before_resume, job, sufficiency)
        after_jm = mode_orchestrator.job_match_mode(after_resume, job, sufficiency)
        before_layers["job_match"] = before_jm.get("score")
        after_layers["job_match"] = after_jm.get("score")

    return {
        "before_score": before_health["score"],
        "after_score": after_health["score"],
        "before_layers": before_layers,
        "after_layers": after_layers,
        "category_deltas": _compute_category_deltas(before_layers, after_layers),
    }
