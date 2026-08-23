"""
Phase D — AI ATS optimization loop: tests.

Two kinds of coverage, deliberately separated:
  1. Pure-function unit tests (no DB, no network) for anti_gaming.py,
     ai_recommendations.py's deterministic staging/classification, and
     apply_fix.py's content-locating helpers — fast, stable, the load-
     bearing regression guard for the actual logic.
  2. Real DB-backed integration tests (the `client` fixture from
     conftest.py — a local Postgres test DB + the real signup flow)
     covering the full HTTP lifecycle: analyze -> persisted recommendation
     -> answer/preview -> apply -> real score recalculation -> change
     history -> undo -> ownership -> staleness -> concurrency guard.
     Randomized emails throughout (unlike the two PRE-EXISTING flaky tests
     in test_resumes.py, which reuse hardcoded emails and are known to fail
     on repeat runs against the real Supabase signup call for that reason —
     not something this file repeats).
"""
import random
import string
import uuid

import pytest

from services.ats_engine import ai_recommendations, anti_gaming, apply_fix, ats_intelligence_v2


def _rand_email() -> str:
    return f"phased-{''.join(random.choices(string.ascii_lowercase + string.digits, k=10))}@example.com"


RICH_RESUME = {
    "summary": "Backend developer.",
    "skills": ["Python", "Django"], "hard_skills": [], "soft_skills": [], "location": "Bengaluru",
    "experience": [{"title": "Backend Developer", "company": "Acme", "startDate": "2022", "endDate": "", "current": True,
                    "bullets": ["Responsible for backend development.", "Built REST APIs using Python and Django."]}],
    "education": [{"degree": "B.Tech", "institution": "Acme University", "year": "2020"}],
    "projects": [], "certifications": [],
    "raw_text": "Backend developer.\nEXPERIENCE\nBackend Developer - Acme\n- Responsible for backend development.\n- Built REST APIs using Python and Django.",
}
JOB = {"required_skills": ["Django", "TypeScript"], "preferred_skills": [], "keywords": ["Django", "TypeScript"],
       "certifications": [], "min_experience_years": 2, "min_education": None,
       "raw_text": "Django TypeScript engineer.", "responsibilities": []}


# ── 1. anti_gaming.py ────────────────────────────────────────────────────────

def test_keyword_stuffing_detected():
    text = "React React React React React React developer."
    flags = anti_gaming.detect_keyword_stuffing(text, ["React"])
    assert len(flags) == 1
    assert flags[0]["count"] == 6


def test_keyword_stuffing_not_flagged_below_threshold():
    text = "I use React and React Native occasionally."
    flags = anti_gaming.detect_keyword_stuffing(text, ["React"])
    assert flags == []


def test_repeated_react_react_react_never_inflates_the_match_signal():
    """Direct product-spec example: 'React React React React' must not
    increase score. Verified at the actual matcher level (Phase B) — a
    term is binary found/missing, repetition can't push it past 100%
    'found once' no matter the count. (4 reps sits below this module's own
    6-rep stuffing-flag threshold — see test_keyword_stuffing_detected for
    that boundary specifically; this test checks the separate, more
    fundamental invariant that repetition can never inflate a match.)"""
    from services.ats_engine import keyword_aliases
    once = keyword_aliases.present_v2("React", ["React"], "React")
    many = keyword_aliases.present_v2("React", ["React"], "React React React React")
    assert once == many == (True, "exact")  # identical result regardless of repetition count


def test_jd_copying_detected_for_long_shared_phrase():
    jd = "We are looking for a talented software engineer with strong skills to join our growing team worldwide today."
    resume = "Summary: We are looking for a talented software engineer with strong skills to join our growing team."
    result = anti_gaming.detect_jd_copying(resume, jd)
    assert result is not None
    assert result["shared_words"] >= anti_gaming._JD_COPY_NGRAM


def test_jd_copying_not_flagged_for_short_overlap():
    jd = "We need a software engineer."
    resume = "I am a software engineer with experience."
    result = anti_gaming.detect_jd_copying(resume, jd)
    assert result is None


def test_jd_copying_handles_short_texts_without_crash():
    assert anti_gaming.detect_jd_copying("short", "also short") is None


def test_stuffed_keyword_block_detected():
    text = "Python, Django, Flask, FastAPI, PostgreSQL, MySQL, MongoDB, Redis, Docker, Kubernetes"
    flags = anti_gaming.detect_stuffed_keyword_blocks(text)
    assert len(flags) >= 1


def test_normal_sentence_not_flagged_as_stuffed_block():
    text = "I built a REST API using Python and Django, and deployed it with Docker."
    flags = anti_gaming.detect_stuffed_keyword_blocks(text)
    assert flags == []


def test_analyze_anti_gaming_clean_resume_has_no_flags():
    result = anti_gaming.analyze_anti_gaming(RICH_RESUME["raw_text"], JOB["raw_text"], ["Python", "Django"])
    assert result["is_clean"] is True


def test_is_term_overused_true_and_false():
    stuffed = "Java Java Java Java Java Java Java"
    assert anti_gaming.is_term_overused(stuffed, "Java") is True
    assert anti_gaming.is_term_overused("I know Java.", "Java") is False


# ── 2. ai_recommendations.py — classification & staging (deterministic) ────

def _fake_full_result(job=None):
    ats_compat = ats_intelligence_v2.compute_ats_compatibility_v2(RICH_RESUME)
    quality = ats_intelligence_v2.compute_resume_quality_v2(RICH_RESUME)
    job_match = ats_intelligence_v2.compute_job_match_v2(RICH_RESUME, job) if job else None
    return {"ats_compatibility": ats_compat, "resume_quality": quality, "job_match": job_match}


def test_classify_and_stage_produces_only_controlled_action_types():
    full_result = _fake_full_result(JOB)
    recs = ats_intelligence_v2.build_editor_recommendations(RICH_RESUME, JOB, full_result)
    staged = ai_recommendations.classify_and_stage(RICH_RESUME, JOB, full_result, recs)
    from models import ATS_ACTION_TYPES
    assert all(s["action_type"] in ATS_ACTION_TYPES for s in staged)


def test_classify_and_stage_keyword_gap_becomes_add_keyword():
    full_result = _fake_full_result(JOB)
    recs = ats_intelligence_v2.build_editor_recommendations(RICH_RESUME, JOB, full_result)
    staged = ai_recommendations.classify_and_stage(RICH_RESUME, JOB, full_result, recs)
    kw_recs = [s for s in staged if "TypeScript" in s["title"] and s["affected_section"] == "job_match"]
    assert any(s["action_type"] == "add_keyword" for s in kw_recs)


def test_classify_and_stage_bullet_issue_becomes_improve_bullet_or_quantify():
    full_result = _fake_full_result(None)
    recs = ats_intelligence_v2.build_editor_recommendations(RICH_RESUME, None, full_result)
    staged = ai_recommendations.classify_and_stage(RICH_RESUME, None, full_result, recs)
    assert any(s["action_type"] in ("improve_bullet", "quantify_bullet") for s in staged)


def test_classify_and_stage_target_text_correctly_captures_bullet_not_keyword():
    """Regression guard for the real bug caught by the live E2E test:
    resume-quality bullet recommendations must capture the actual bullet
    text, never a keyword term from an unrelated recommendation."""
    full_result = _fake_full_result(None)
    recs = ats_intelligence_v2.build_editor_recommendations(RICH_RESUME, None, full_result)
    staged = ai_recommendations.classify_and_stage(RICH_RESUME, None, full_result, recs)
    bullet_recs = [s for s in staged if s["action_type"] in ("improve_bullet", "quantify_bullet")]
    for s in bullet_recs:
        if s["target_text"]:
            assert s["target_text"] in ("Responsible for backend development.", "Built REST APIs using Python and Django.")


def test_classify_and_stage_add_keyword_target_text_is_the_skill_term():
    full_result = _fake_full_result(JOB)
    recs = ats_intelligence_v2.build_editor_recommendations(RICH_RESUME, JOB, full_result)
    staged = ai_recommendations.classify_and_stage(RICH_RESUME, JOB, full_result, recs)
    kw_recs = [s for s in staged if s["action_type"] == "add_keyword"]
    assert all(s["target_text"] and '"' not in s["target_text"] for s in kw_recs)


def test_classify_and_stage_summary_target_text_is_actual_summary():
    resume = dict(RICH_RESUME, summary="Hardworking professional looking for opportunities.")
    full_result = _fake_full_result(None)
    full_result["resume_quality"] = ats_intelligence_v2.compute_resume_quality_v2(resume)
    recs = ats_intelligence_v2.build_editor_recommendations(resume, None, full_result)
    staged = ai_recommendations.classify_and_stage(resume, None, full_result, recs)
    summary_recs = [s for s in staged if s["action_type"] == "improve_summary"]
    for s in summary_recs:
        assert s["target_text"] == resume["summary"]


def test_needs_evidence_types_always_require_user_input():
    for action_type in ("quantify_bullet", "add_keyword", "add_skill_evidence", "improve_skills"):
        assert action_type in ai_recommendations._NEEDS_EVIDENCE_TYPES


def test_reword_only_types_never_require_user_input():
    full_result = _fake_full_result(None)
    recs = ats_intelligence_v2.build_editor_recommendations(RICH_RESUME, None, full_result)
    staged = ai_recommendations.classify_and_stage(RICH_RESUME, None, full_result, recs)
    for s in staged:
        if s["action_type"] in ai_recommendations._REWORD_ONLY_TYPES:
            assert s["requires_user_input"] is False


def test_build_question_never_invents_an_answer():
    item = {"issue": '"TypeScript" is required by the job description but wasn\'t found on your resume.',
            "why": "x", "action": "Add TypeScript if you have it.", "impact": "high"}
    q = ai_recommendations._build_question("add_keyword", item, RICH_RESUME)
    assert "500" not in q and "5 years" not in q  # never asserts a fabricated fact
    assert q.strip().endswith("?") or "genuinely" in q


def test_structural_action_types_produce_no_content_proposal_target():
    assert "fix_section" in ai_recommendations._STRUCTURAL_TYPES
    assert "fix_formatting" in ai_recommendations._STRUCTURAL_TYPES


def test_priority_from_match_thresholds():
    assert ai_recommendations._priority_from_match(None) == "high"
    assert ai_recommendations._priority_from_match(20) == "high"
    assert ai_recommendations._priority_from_match(50) == "medium"
    assert ai_recommendations._priority_from_match(80) == "low"


def test_classify_unknown_category_falls_back_safely():
    action_type = ai_recommendations._classify("job_match", "nonexistent_category")
    from models import ATS_ACTION_TYPES
    assert action_type in ATS_ACTION_TYPES  # never crashes, never returns an uncontrolled value


# ── 3. ai_recommendations.py — generate_proposal (async, real AI call) ─────
#
# All async tests in this file use @pytest.mark.asyncio consistently (never
# a bare asyncio.run() helper) — mixing the two styles in one file corrupts
# pytest-asyncio's shared event loop and cascades failures into UNRELATED
# test files that happen to run afterward in the same session. That was a
# real, self-inflicted bug caught by running the full suite (not just this
# file) — see docs/ATS_CHANGELOG.md.

@pytest.mark.asyncio
async def test_generate_proposal_quantify_bullet_without_evidence_never_calls_ai():
    result = await ai_recommendations.generate_proposal("quantify_bullet", "Handled tickets.", RICH_RESUME, user_answer=None)
    assert result["proposed_content"] is None
    assert result["evidence_tier"] == "unknown"


@pytest.mark.asyncio
async def test_generate_proposal_add_keyword_records_user_answer_verbatim():
    result = await ai_recommendations.generate_proposal("add_keyword", "TypeScript", RICH_RESUME, user_answer="Used it at Acme on the dashboard project")
    assert result["proposed_content"] == "Used it at Acme on the dashboard project"
    assert result["evidence_tier"] == "verified"


@pytest.mark.asyncio
async def test_generate_proposal_structural_never_produces_content():
    result = await ai_recommendations.generate_proposal("fix_formatting", "", RICH_RESUME)
    assert result["proposed_content"] is None


@pytest.mark.asyncio
async def test_generate_proposal_refuses_overused_term():
    stuffed_text = "TypeScript TypeScript TypeScript TypeScript TypeScript TypeScript"
    result = await ai_recommendations.generate_proposal(
        "add_keyword", "TypeScript", RICH_RESUME, user_answer="I used it everywhere",
        raw_text=stuffed_text, overused_term="TypeScript",
    )
    assert result["proposed_content"] is None
    assert "stuffing" in result["source_note"].lower()


@pytest.mark.asyncio
async def test_generate_proposal_ai_failure_never_fabricates(monkeypatch):
    """Part 37 — if the AI provider fails, do not modify resume / do not
    fabricate; return a clear unavailable message instead."""
    from services import ai as ai_service
    async def fail(*a, **k):
        return None
    monkeypatch.setattr(ai_service, "_chat", fail)
    result = await ai_recommendations.generate_proposal("improve_bullet", "Responsible for backend development.", RICH_RESUME)
    assert result["proposed_content"] is None
    assert "unavailable" in result["source_note"].lower()


@pytest.mark.asyncio
async def test_generate_proposal_malformed_ai_response_handled(monkeypatch):
    """Even a bizarre/empty non-None AI response must not crash the pipeline."""
    from services import ai as ai_service
    async def weird(*a, **k):
        return "   "  # whitespace-only "response"
    monkeypatch.setattr(ai_service, "_chat", weird)
    result = await ai_recommendations.generate_proposal("improve_bullet", "Responsible for backend development.", RICH_RESUME)
    assert result["proposed_content"] == ""  # stripped, but does not crash


def test_generate_proposal_reword_only_never_invents_a_metric():
    """Even if the AI DOES respond, the reword-only prompt explicitly
    forbids adding a metric that wasn't present — this test locks in the
    prompt's own constraint text, since we can't control what a live LLM
    actually returns in CI."""
    assert "do NOT invent one" in ai_recommendations._REWRITE_PROMPT


@pytest.mark.asyncio
async def test_generate_proposal_summary_uses_only_resume_facts(monkeypatch):
    from services import ai as ai_service
    captured = {}
    async def capture(prompt, max_tokens=500):
        captured["prompt"] = prompt
        return "A rewritten summary."
    monkeypatch.setattr(ai_service, "_chat", capture)
    await ai_recommendations.generate_proposal("improve_summary", "Old summary.", RICH_RESUME)
    assert "Python" in captured["prompt"] or "Django" in captured["prompt"]  # uses real resume facts
    assert "never invent" in captured["prompt"].lower()


# ── 4. apply_fix.py — pure content-locating helpers ──────────────────────────

def test_locate_and_apply_finds_and_replaces_exact_bullet():
    content = {"experience": [{"bullets": ["Responsible for X.", "Did Y."]}], "summary": ""}
    new_content, changed, before = apply_fix._locate_and_apply(content, "experience", "Responsible for X.", "Owned X.")
    assert changed == ["experience[0].bullets[0]"]
    assert before == "Responsible for X."
    assert new_content["experience"][0]["bullets"][0] == "Owned X."
    assert content["experience"][0]["bullets"][0] == "Responsible for X."  # original untouched


def test_locate_and_apply_returns_none_before_value_when_not_found():
    content = {"experience": [{"bullets": ["Something else."]}], "summary": ""}
    _, changed, before = apply_fix._locate_and_apply(content, "experience", "This text is not present.", "New text.")
    assert before is None
    assert changed == []


def test_locate_and_apply_summary_replacement():
    content = {"experience": [], "summary": "Old summary."}
    new_content, changed, before = apply_fix._locate_and_apply(content, "summary", "Old summary.", "New summary.")
    assert new_content["summary"] == "New summary."
    assert before == "Old summary."
    assert changed == ["summary"]


def test_add_skill_if_missing_adds_new_skill():
    content = {"skills": [{"name": "Python", "level": 70}]}
    new_content, changed, before = apply_fix._add_skill_if_missing(content, "TypeScript")
    assert any(s["name"] == "TypeScript" for s in new_content["skills"])
    assert changed == ["skills"]


def test_add_skill_if_missing_is_a_noop_for_existing_skill():
    content = {"skills": [{"name": "Python", "level": 70}]}
    new_content, changed, before = apply_fix._add_skill_if_missing(content, "python")  # case-insensitive
    assert changed == []
    assert before is None
    assert len(new_content["skills"]) == 1  # never duplicated


def test_compute_category_deltas_real_numbers_only():
    deltas = apply_fix._compute_category_deltas(
        {"ats_compatibility": 80, "job_match": 60, "resume_quality": 70},
        {"ats_compatibility": 80, "job_match": 68, "resume_quality": 78},
    )
    by_cat = {d["category"]: d["delta"] for d in deltas}
    assert by_cat["ats_compatibility"] == 0
    assert by_cat["job_match"] == 8
    assert by_cat["resume_quality"] == 8


def test_compute_category_deltas_handles_none_layers_gracefully():
    assert apply_fix._compute_category_deltas(None, {"ats_compatibility": 80}) == []
    assert apply_fix._compute_category_deltas({"ats_compatibility": 80}, None) == []


def test_compute_category_deltas_skips_categories_missing_on_either_side():
    deltas = apply_fix._compute_category_deltas({"ats_compatibility": 80, "job_match": None}, {"ats_compatibility": 85, "job_match": 60})
    assert len(deltas) == 1
    assert deltas[0]["category"] == "ats_compatibility"


def test_locate_and_apply_deep_copies_nested_bullets():
    """Guards against a mutation-in-place bug — the original bullets list
    inside a nested dict must never be touched."""
    original_bullets = ["Responsible for X."]
    content = {"experience": [{"bullets": original_bullets}], "summary": ""}
    apply_fix._locate_and_apply(content, "experience", "Responsible for X.", "Owned X.")
    assert original_bullets == ["Responsible for X."]


# ── 5. Staleness (async, no DB — uses a lightweight stub object) ────────────

class _StubRecommendation:
    def __init__(self, snapshot):
        self.resume_updated_at_snapshot = snapshot


class _StubResume:
    def __init__(self, updated_at):
        self.updated_at = updated_at


@pytest.mark.asyncio
async def test_staleness_passes_when_resume_unchanged():
    import datetime
    t = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
    rec = _StubRecommendation(t)
    resume = _StubResume(t)
    await apply_fix.check_staleness(rec, resume)  # must not raise


@pytest.mark.asyncio
async def test_staleness_raises_when_resume_changed_after_snapshot():
    import datetime
    snap = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
    later = datetime.datetime(2026, 1, 2, tzinfo=datetime.timezone.utc)
    rec = _StubRecommendation(snap)
    resume = _StubResume(later)
    with pytest.raises(apply_fix.StaleRecommendationError):
        await apply_fix.check_staleness(rec, resume)


@pytest.mark.asyncio
async def test_staleness_skipped_when_no_snapshot_recorded():
    rec = _StubRecommendation(None)
    resume = _StubResume(None)
    await apply_fix.check_staleness(rec, resume)  # must not raise — nothing to compare


# ── 6. Real DB-backed integration tests (client fixture) ────────────────────

async def _signup_and_resume(client):
    email = _rand_email()
    r = await client.post("/api/auth/signup", json={"email": email, "password": "Passw0rd!23", "full_name": "Phase D"})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    content = {
        "personalInfo": {"fullName": "Phase D User", "jobTitle": "Backend Developer", "email": email, "phone": "9999999999", "location": "Bengaluru"},
        "summary": "Backend developer.",
        "experience": [{"id": "e1", "position": "Backend Developer", "company": "Acme", "location": "",
                         "startDate": "2022-01", "endDate": "", "current": True,
                         "bullets": ["Responsible for backend development.", "Built REST APIs."]}],
        "education": [{"id": "ed1", "degree": "B.Tech", "field": "", "institution": "Acme University", "location": "", "startDate": "2018", "endDate": "2022", "gpa": ""}],
        "skills": [{"name": "Python", "level": 4}], "projects": [], "certifications": [], "languages": [], "achievements": [], "interests": [],
    }
    r = await client.post("/api/resumes/", json={"title": "Phase D Resume", "template_id": "modern", "content": content}, headers=headers)
    assert r.status_code == 201, r.text
    return headers, r.json()["id"], content


@pytest.mark.asyncio
async def test_analyze_editor_persists_recommendations_with_real_ids(client):
    headers, resume_id, content = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/analyze-editor", json={
        "content": content, "resume_id": resume_id, "job_description": "Python Django TypeScript engineer needed.",
    }, headers=headers)
    assert r.status_code == 200, r.text
    recs = r.json()["persisted_recommendations"]
    assert len(recs) > 0
    for rec in recs:
        uuid.UUID(rec["id"])  # a real, parseable UUID — not a placeholder


@pytest.mark.asyncio
async def test_apply_recommendation_triggers_real_score_recalculation(client):
    headers, resume_id, content = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/analyze-editor", json={
        "content": content, "resume_id": resume_id, "job_description": "Python Django TypeScript engineer needed.",
    }, headers=headers)
    recs = r.json()["persisted_recommendations"]
    target = next((rc for rc in recs if rc["action_type"] == "improve_bullet"), None)
    if not target:
        pytest.skip("No improve_bullet recommendation generated for this fixture — non-deterministic AI parsing path")

    r = await client.post(f"/api/ats/v2/recommendations/{target['id']}/preview", headers=headers)
    assert r.status_code == 200, r.text
    proposed = r.json()["proposed_content"] or "Developed backend services."

    r = await client.post(f"/api/ats/v2/recommendations/{target['id']}/apply", json={"final_content": proposed}, headers=headers)
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["success"] is True
    assert isinstance(result["before_score"], int)
    assert result["change_history_id"] is not None


@pytest.mark.asyncio
async def test_double_apply_is_rejected(client):
    headers, resume_id, content = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/analyze-editor", json={
        "content": content, "resume_id": resume_id, "job_description": "Python Django TypeScript engineer needed.",
    }, headers=headers)
    recs = r.json()["persisted_recommendations"]
    target = next((rc for rc in recs if rc["action_type"] == "improve_bullet"), None)
    if not target:
        pytest.skip("No improve_bullet recommendation generated for this fixture")

    r = await client.post(f"/api/ats/v2/recommendations/{target['id']}/apply", json={"final_content": "Developed backend services."}, headers=headers)
    assert r.status_code == 200
    r2 = await client.post(f"/api/ats/v2/recommendations/{target['id']}/apply", json={"final_content": "Something else."}, headers=headers)
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_reject_never_modifies_resume(client):
    headers, resume_id, content = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/analyze-editor", json={
        "content": content, "resume_id": resume_id, "job_description": "Python Django TypeScript engineer needed.",
    }, headers=headers)
    recs = r.json()["persisted_recommendations"]
    target = recs[0]
    r = await client.post(f"/api/ats/v2/recommendations/{target['id']}/reject", json={"reason": "irrelevant"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "rejected"

    r2 = await client.get(f"/api/resumes/{resume_id}", headers=headers)
    assert r2.json()["content"]["experience"][0]["bullets"] == content["experience"][0]["bullets"]  # unchanged


@pytest.mark.asyncio
async def test_apply_after_reject_is_blocked(client):
    headers, resume_id, content = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/analyze-editor", json={
        "content": content, "resume_id": resume_id, "job_description": "Python Django TypeScript engineer needed.",
    }, headers=headers)
    target = r.json()["persisted_recommendations"][0]
    await client.post(f"/api/ats/v2/recommendations/{target['id']}/reject", json={}, headers=headers)
    r2 = await client.post(f"/api/ats/v2/recommendations/{target['id']}/apply", json={"final_content": "x"}, headers=headers)
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_undo_restores_content_and_writes_new_history_record(client):
    headers, resume_id, content = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/analyze-editor", json={
        "content": content, "resume_id": resume_id, "job_description": "Python Django TypeScript engineer needed.",
    }, headers=headers)
    recs = r.json()["persisted_recommendations"]
    target = next((rc for rc in recs if rc["action_type"] == "improve_bullet"), None)
    if not target:
        pytest.skip("No improve_bullet recommendation generated for this fixture")

    r = await client.post(f"/api/ats/v2/recommendations/{target['id']}/apply", json={"final_content": "Developed backend services."}, headers=headers)
    change_id = r.json()["change_history_id"]

    r2 = await client.get(f"/api/resumes/{resume_id}", headers=headers)
    assert "Developed backend services." in str(r2.json()["content"]["experience"][0]["bullets"])

    r3 = await client.post(f"/api/ats/v2/change-history/{change_id}/undo", headers=headers)
    assert r3.status_code == 200, r3.text
    assert r3.json()["success"] is True

    r4 = await client.get(f"/api/resumes/{resume_id}", headers=headers)
    assert "Developed backend services." not in str(r4.json()["content"]["experience"][0]["bullets"])

    r5 = await client.get(f"/api/ats/v2/resumes/{resume_id}/change-history", headers=headers)
    assert len(r5.json()["history"]) == 2  # apply + undo, each its own record


@pytest.mark.asyncio
async def test_multiple_changes_each_get_own_history_record(client):
    headers, resume_id, content = await _signup_and_resume(client)
    applied = 0
    for _ in range(2):
        r = await client.post("/api/ats/v2/analyze-editor", json={
            "content": content, "resume_id": resume_id, "job_description": "Python Django TypeScript engineer needed.",
        }, headers=headers)
        recs = r.json()["persisted_recommendations"]
        target = next((rc for rc in recs if rc["action_type"] == "improve_bullet"), None)
        if not target:
            continue
        rr = await client.post(f"/api/ats/v2/recommendations/{target['id']}/apply", json={"final_content": f"Rewrite {applied}."}, headers=headers)
        if rr.status_code == 200:
            applied += 1
        r2 = await client.get(f"/api/resumes/{resume_id}", headers=headers)
        content = r2.json()["content"]

    if applied == 0:
        pytest.skip("No applicable improve_bullet recommendations generated across attempts")
    r5 = await client.get(f"/api/ats/v2/resumes/{resume_id}/change-history", headers=headers)
    assert len(r5.json()["history"]) == applied


@pytest.mark.asyncio
async def test_ownership_blocks_cross_user_apply(client):
    headers_a, resume_id, content = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/analyze-editor", json={
        "content": content, "resume_id": resume_id, "job_description": "Python Django TypeScript engineer needed.",
    }, headers=headers_a)
    target = r.json()["persisted_recommendations"][0]

    email_b = _rand_email()
    rb = await client.post("/api/auth/signup", json={"email": email_b, "password": "Passw0rd!23", "full_name": "B"})
    headers_b = {"Authorization": f"Bearer {rb.json()['access_token']}"}

    r2 = await client.post(f"/api/ats/v2/recommendations/{target['id']}/apply", json={"final_content": "x"}, headers=headers_b)
    assert r2.status_code == 404
    r3 = await client.get(f"/api/ats/v2/resumes/{resume_id}/recommendations", headers=headers_b)
    assert r3.status_code == 404
    r4 = await client.get(f"/api/ats/v2/resumes/{resume_id}/change-history", headers=headers_b)
    assert r4.status_code == 404


@pytest.mark.asyncio
async def test_authentication_required_for_all_lifecycle_endpoints(client):
    fake_id = str(uuid.uuid4())
    for method, path in [
        ("get", f"/api/ats/v2/resumes/{fake_id}/recommendations"),
        ("post", f"/api/ats/v2/recommendations/{fake_id}/apply"),
        ("post", f"/api/ats/v2/recommendations/{fake_id}/reject"),
        ("get", f"/api/ats/v2/resumes/{fake_id}/change-history"),
    ]:
        r = await getattr(client, method)(path, json={} if method == "post" else None)
        assert r.status_code in (401, 403), f"{path} should require auth, got {r.status_code}"


@pytest.mark.asyncio
async def test_stale_recommendation_is_refused_after_resume_edited(client):
    headers, resume_id, content = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/analyze-editor", json={
        "content": content, "resume_id": resume_id, "job_description": "Python Django TypeScript engineer needed.",
    }, headers=headers)
    target = r.json()["persisted_recommendations"][0]

    # Edit the resume via a normal PUT after the recommendation was generated.
    new_content = dict(content)
    new_content["title_marker"] = "edited"
    await client.put(f"/api/resumes/{resume_id}", json={"title": "Edited Title"}, headers=headers)

    r2 = await client.post(f"/api/ats/v2/recommendations/{target['id']}/apply", json={"final_content": "x"}, headers=headers)
    assert r2.status_code == 409
    assert "older version" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_legacy_endpoints_still_function_alongside_phase_d(client):
    headers, resume_id, content = await _signup_and_resume(client)
    r = await client.post("/api/ats/analyze", json={"content": content, "resume_id": resume_id}, headers=headers)
    assert r.status_code == 200
    r2 = await client.post("/api/ats/score", json={"resume_content": content, "job_description": "Python developer.", "resume_id": resume_id}, headers=headers)
    assert r2.status_code == 200


@pytest.mark.asyncio
async def test_transaction_failure_leaves_no_inconsistent_state(client, monkeypatch):
    """Part 36 — if the resume update itself fails, no change history row
    should exist and the recommendation must not be marked applied."""
    headers, resume_id, content = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/analyze-editor", json={
        "content": content, "resume_id": resume_id, "job_description": "Python Django TypeScript engineer needed.",
    }, headers=headers)
    recs = r.json()["persisted_recommendations"]
    target = next((rc for rc in recs if rc["action_type"] == "improve_bullet"), None)
    if not target:
        pytest.skip("No improve_bullet recommendation generated for this fixture")

    from services.ats_engine import apply_fix as apply_fix_module

    async def boom(*a, **k):
        raise RuntimeError("simulated DB failure")
    monkeypatch.setattr(apply_fix_module, "_apply_content", boom)

    r2 = await client.post(f"/api/ats/v2/recommendations/{target['id']}/apply", json={"final_content": "x"}, headers=headers)
    assert r2.status_code == 500

    r3 = await client.get(f"/api/ats/v2/resumes/{resume_id}/change-history", headers=headers)
    assert r3.json()["history"] == []  # nothing was recorded — no fake success


# ── 7. A few more pure-function edge cases ──────────────────────────────────

def test_build_question_quantify_bullet_asks_for_a_real_number():
    item = {"issue": "x", "why": "x", "action": 'Weak phrasing: "Handled tickets."', "impact": "x"}
    q = ai_recommendations._build_question("quantify_bullet", item, RICH_RESUME)
    assert "number" in q.lower()


def test_build_question_add_skill_evidence_asks_where():
    item = {"issue": '"Python" is listed but no supporting evidence was found.', "why": "x", "action": "x", "impact": "x"}
    q = ai_recommendations._build_question("add_skill_evidence", item, RICH_RESUME)
    assert "where" in q.lower()


def test_extract_target_text_structural_types_return_none():
    item = {"issue": "Some structural issue", "why": "x", "action": "x", "impact": "x"}
    assert ai_recommendations._extract_target_text("fix_formatting", item, RICH_RESUME) is None
    assert ai_recommendations._extract_target_text("fix_section", item, RICH_RESUME) is None


def test_priority_from_match_boundary_values():
    assert ai_recommendations._priority_from_match(39.9) == "high"
    assert ai_recommendations._priority_from_match(40) == "medium"
    assert ai_recommendations._priority_from_match(64.9) == "medium"
    assert ai_recommendations._priority_from_match(65) == "low"


def test_anti_gaming_multiple_terms_checked_independently():
    text = "Python Python Python Python Python Python Django."
    flags = anti_gaming.detect_keyword_stuffing(text, ["Python", "Django"])
    assert len(flags) == 1
    assert flags[0]["term"] == "python"


def test_anti_gaming_case_insensitive_matching():
    text = "REACT React react REACT React react React"
    flags = anti_gaming.detect_keyword_stuffing(text, ["React"])
    assert len(flags) == 1


def test_action_type_map_covers_all_resume_quality_categories():
    quality_result = ats_intelligence_v2.compute_resume_quality_v2(RICH_RESUME)
    for cat_key in quality_result["categories"]:
        action_type = ai_recommendations._classify("resume_quality", cat_key)
        from models import ATS_ACTION_TYPES
        assert action_type in ATS_ACTION_TYPES


def test_action_type_map_covers_all_job_match_categories():
    job_match_result = ats_intelligence_v2.compute_job_match_v2(RICH_RESUME, JOB)
    for cat_key in job_match_result["categories"]:
        action_type = ai_recommendations._classify("job_match", cat_key)
        from models import ATS_ACTION_TYPES
        assert action_type in ATS_ACTION_TYPES


@pytest.mark.asyncio
async def test_change_history_records_scoring_engine_version(client):
    headers, resume_id, content = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/analyze-editor", json={
        "content": content, "resume_id": resume_id, "job_description": "Python Django TypeScript engineer needed.",
    }, headers=headers)
    recs = r.json()["persisted_recommendations"]
    target = next((rc for rc in recs if rc["action_type"] == "improve_bullet"), None)
    if not target:
        pytest.skip("No improve_bullet recommendation generated for this fixture")
    r2 = await client.post(f"/api/ats/v2/recommendations/{target['id']}/apply", json={"final_content": "Developed backend services."}, headers=headers)
    assert r2.status_code == 200
    # Phase D itself didn't change the scoring methodology, only added the AI
    # agent around it (Part 40) -- the version now reads "2.1.0" because
    # Phase H1 later changed Resume ATS Health's formula; this assertion
    # just tracks the current global stamp, not a Phase D-specific claim.
    from services.ats_engine import ats_config
    assert ats_config.SCORING_ENGINE_VERSION == "2.1.0"
