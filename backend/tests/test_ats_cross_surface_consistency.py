"""
ATS consolidation — cross-surface consistency test suite (Phase 7, mandatory
per the approved migration plan).

Product requirement under test: SAME RESUME = SAME RESUME ATS HEALTH
EVERYWHERE. SAME RESUME + SAME JD = SAME JOB MATCH EVERYWHERE.

One deterministic fixture (Resume A / Role A / JD A) is run through every
first-party surface's OWN code path — ATS Checker (`check_modes`), Resume
Editor (`analyze_editor`), Dashboard/Preview/resume cards (`Resume.ats_score`
via `create_resume`/`get_resume`), Version History (`ResumeVersion.ats_score`
snapshots), AI Resume Upgrade before/after (`routers.upgrade.analyze_resume`),
and the AI Fix loop (`apply_fix._canonical_before_after`) — asserting they
all report the identical canonical number for the identical content.

This intentionally bypasses the httpx/ASGI/Supabase-Auth transport layer
that `tests/conftest.py`'s shared `client` fixture goes through — that layer
does real signups against Supabase Auth over the network, which this suite's
scoring assertions don't need. It calls the exact same router functions
FastAPI would dispatch to, against a real Postgres session, reusing the
app's OWN singleton session factory (database.py's AsyncSessionLocal —
created once at process/import time, exactly what get_db() uses in
production) rather than spinning up a second, separate engine. A per-test
`create_async_engine()` was tried first and worked fine in isolation, but
corrupted the shared session-scoped event loop for every other test file
once collected together in the same run (RuntimeError: "There is no
current event loop"; coroutines from unrelated files reported as "never
awaited") — repeated engine/pool creation+disposal churn across many test
functions is the suspected cause. Reusing the one already-existing engine
avoids that entirely; only the transport (httpx/ASGI/Supabase) is skipped,
not the application code or the DB session machinery.
"""
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select

from database import AsyncSessionLocal
from models import User, ResumeVersion
from routers.resumes import create_resume, update_resume, ResumeUpsert, _load_full, _canonical_ats_score
from routers.ats_engine import check_modes, CheckModesRequest, analyze_editor, AnalyzeEditorRequest
from routers.upgrade import analyze_resume as upgrade_analyze_resume
from services.ats_engine import ResumeParser, JobParser, mode_orchestrator
from services.ats_engine.apply_fix import _canonical_before_after


# ── deterministic fixture: Resume A (weak + strong variants) / JD A ────────

RESUME_A_WEAK = {
    "personalInfo": {"fullName": "Cross Surface Tester", "email": "cross-surface@example.com"},
    "summary": "",
    "experience": [{
        "id": "e1", "position": "Backend Developer", "company": "Acme", "startDate": "2022", "endDate": "",
        "current": True, "bullets": ["did stuff"],
    }],
    "education": [], "skills": [], "projects": [], "certifications": [],
    "languages": [], "achievements": [], "interests": [],
}

RESUME_A_STRONG = {
    "personalInfo": {"fullName": "Cross Surface Tester", "email": "cross-surface@example.com",
                      "phone": "9999999999", "location": "Bengaluru"},
    "summary": "Results-driven backend engineer with 5+ years building scalable REST APIs and "
               "distributed systems using Python, Django, and PostgreSQL.",
    "experience": [{
        "id": "e1", "position": "Senior Backend Developer", "company": "Acme Corp", "startDate": "2020-01",
        "endDate": "", "current": True,
        "bullets": [
            "Increased API throughput by 40% by redesigning the caching layer using Redis.",
            "Led migration of 12 microservices to Kubernetes, reducing deployment time by 60%.",
            "Mentored 4 junior engineers and introduced code review standards adopted org-wide.",
        ],
    }],
    "education": [{"id": "ed1", "degree": "B.Tech Computer Science", "institution": "IIT Bombay",
                    "startDate": "2016", "endDate": "2020"}],
    "skills": [{"name": "Python", "level": 5}, {"name": "Django", "level": 4},
               {"name": "PostgreSQL", "level": 4}, {"name": "Kubernetes", "level": 3}],
    "projects": [], "certifications": [], "languages": [], "achievements": [], "interests": [],
}

JD_A_SUFFICIENT = """Senior Backend Developer

Responsibilities:
- Design and build scalable REST APIs
- Work with Kubernetes and Redis to run distributed systems
- Mentor junior engineers and review code

Requirements:
- 5+ years of experience in Python and Django
- Strong knowledge of PostgreSQL
- Experience with AWS is a plus
- B.Tech or equivalent in Computer Science
"""

JD_B_SUFFICIENT_DIFFERENT = """Frontend Engineer

Responsibilities:
- Build accessible, responsive UIs in React and TypeScript
- Own design-system components used across multiple product teams

Requirements:
- 4+ years of experience with React, TypeScript, and modern CSS
- Experience with Figma-to-code workflows
- Familiarity with Next.js and GraphQL
"""

JD_INSUFFICIENT = "python developer needed"


# ── db session — reuses the app's OWN singleton engine (database.py's
#    AsyncSessionLocal, created once at process/import time) rather than
#    spinning up a fresh create_async_engine() per test. A per-test engine
#    was tried first and worked fine in isolation, but corrupted the shared
#    event loop once every other test file's async fixtures ran in the same
#    session (see module docstring) — repeated engine/pool creation+disposal
#    churn is the suspected cause. Only a SESSION is opened/closed per test
#    here, exactly like get_db() does in production. Tables already exist
#    (this is the same live Postgres every other test file uses) — nothing
#    to create. ───────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db():
    async with AsyncSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def user(db):
    u = User(id=uuid.uuid4(), email=f"cross-surface-{uuid.uuid4().hex[:10]}@example.com",
              full_name="Cross Surface Tester")
    db.add(u)
    await db.commit()
    return u


async def _create(db, user, content, source=None):
    body = ResumeUpsert(title="Cross Surface Fixture", content=content, source=source)
    return await create_resume(body, db, user)


# ── A. same resume -> same Resume ATS Health, every surface ────────────────

@pytest.mark.asyncio
async def test_same_resume_same_health_across_all_surfaces(db, user):
    created = await _create(db, user, RESUME_A_STRONG)
    resume_id = created["id"]

    # Dashboard / resume cards / Preview -- all just read Resume.ats_score
    dashboard_score = created["ats_score"]

    # ATS Checker
    checker = await check_modes(CheckModesRequest(resume_id=resume_id), db, user)
    checker_score = checker["resume_health"]["score"]

    # Resume Editor
    editor = await analyze_editor(AnalyzeEditorRequest(content=RESUME_A_STRONG, resume_id=resume_id), db, user)
    editor_score = editor["scores"]["overall"]

    # AI Resume Upgrade before/after (same canonical adapter for both)
    upgrade_score = upgrade_analyze_resume(RESUME_A_STRONG)["score"]

    # Version History -- a fresh snapshot's ats_score must match too
    full = await _load_full(db, uuid.UUID(resume_id))
    from routers.resumes import _snapshot
    await _snapshot(db, full, user.id, "edit")
    await db.commit()
    version = (await db.execute(
        select(ResumeVersion).where(ResumeVersion.resume_id == full.id)
        .order_by(ResumeVersion.created_at.desc()).limit(1)
    )).scalar_one()
    version_score = version.ats_score

    # AI Fix loop's "before" score for a no-op edit (same content in and out)
    fix_scores = await _canonical_before_after(RESUME_A_STRONG, RESUME_A_STRONG, None, None)
    fix_before, fix_after = fix_scores["before_score"], fix_scores["after_score"]

    # direct canonical call -- the ground truth every surface must match
    direct = mode_orchestrator.resume_health_mode(ResumeParser.from_content(RESUME_A_STRONG))["score"]

    all_scores = {
        "dashboard/resume-card/preview (Resume.ats_score)": dashboard_score,
        "ATS Checker (/check)": checker_score,
        "Resume Editor (/analyze-editor)": editor_score,
        "AI Resume Upgrade (/upgrade/analyze, /enhance before+after)": upgrade_score,
        "Version History snapshot": version_score,
        "AI Fix loop before": fix_before,
        "AI Fix loop after": fix_after,
        "direct mode_orchestrator.resume_health_mode()": direct,
    }
    assert len(set(all_scores.values())) == 1, f"Score mismatch across surfaces: {all_scores}"
    assert direct is not None


# ── B. CRITICAL TEST — changing resume content changes the score, but the
#    SAME new content still produces the SAME (new) score everywhere ───────

@pytest.mark.asyncio
async def test_changing_resume_content_changes_score_consistently_everywhere(db, user):
    weak_direct = mode_orchestrator.resume_health_mode(ResumeParser.from_content(RESUME_A_WEAK))["score"]
    strong_direct = mode_orchestrator.resume_health_mode(ResumeParser.from_content(RESUME_A_STRONG))["score"]
    assert weak_direct != strong_direct, "fixture content must actually differ in quality for this test to be meaningful"

    created = await _create(db, user, RESUME_A_WEAK)
    resume_id = created["id"]
    assert created["ats_score"] == weak_direct

    checker_weak = (await check_modes(CheckModesRequest(resume_id=resume_id), db, user))["resume_health"]["score"]
    editor_weak = (await analyze_editor(AnalyzeEditorRequest(content=RESUME_A_WEAK, resume_id=resume_id), db, user))["scores"]["overall"]
    upgrade_weak = upgrade_analyze_resume(RESUME_A_WEAK)["score"]
    assert checker_weak == editor_weak == upgrade_weak == weak_direct == created["ats_score"]

    # now edit the SAME resume to the strong content
    updated = await update_resume(resume_id, ResumeUpsert(content=RESUME_A_STRONG), db, user)
    checker_strong = (await check_modes(CheckModesRequest(resume_id=resume_id), db, user))["resume_health"]["score"]
    editor_strong = (await analyze_editor(AnalyzeEditorRequest(content=RESUME_A_STRONG, resume_id=resume_id), db, user))["scores"]["overall"]
    upgrade_strong = upgrade_analyze_resume(RESUME_A_STRONG)["score"]

    assert checker_strong == editor_strong == upgrade_strong == strong_direct
    assert checker_strong != weak_direct, "the score must actually have moved after the content changed"


# ── C. CRITICAL TEST — changing ONLY the JD never changes Resume ATS
#    Health; Job Match is independent and IS allowed to change ─────────────

@pytest.mark.asyncio
async def test_changing_only_jd_never_changes_resume_health(db, user):
    created = await _create(db, user, RESUME_A_STRONG)
    resume_id = created["id"]

    no_jd = await check_modes(CheckModesRequest(resume_id=resume_id), db, user)
    health_no_jd = no_jd["resume_health"]["score"]
    assert no_jd["job_match"] == {"available": False}

    with_jd_a = await check_modes(CheckModesRequest(resume_id=resume_id, job_description=JD_A_SUFFICIENT), db, user)
    health_with_jd_a = with_jd_a["resume_health"]["score"]
    job_match_a = with_jd_a["job_match"]["score"]

    with_jd_b = await check_modes(CheckModesRequest(resume_id=resume_id, job_description=JD_B_SUFFICIENT_DIFFERENT), db, user)
    health_with_jd_b = with_jd_b["resume_health"]["score"]
    job_match_b = with_jd_b["job_match"]["score"]

    assert health_no_jd == health_with_jd_a == health_with_jd_b, (
        f"Resume ATS Health must never move just because a JD was added/changed: "
        f"no_jd={health_no_jd} with_jd_a={health_with_jd_a} with_jd_b={health_with_jd_b}"
    )
    assert with_jd_a["job_match"]["sufficient"] is True
    assert with_jd_b["job_match"]["sufficient"] is True
    assert job_match_a is not None and job_match_b is not None

    # the SAME invariant must hold through the Editor's composed response too
    editor_no_jd = await analyze_editor(AnalyzeEditorRequest(content=RESUME_A_STRONG, resume_id=resume_id), db, user)
    editor_with_jd = await analyze_editor(
        AnalyzeEditorRequest(content=RESUME_A_STRONG, resume_id=resume_id, job_description=JD_A_SUFFICIENT), db, user)
    assert editor_no_jd["scores"]["overall"] == editor_with_jd["scores"]["overall"] == health_no_jd
    assert editor_with_jd["scores"]["job_match"] is not None


@pytest.mark.asyncio
async def test_insufficient_jd_never_produces_a_percentage(db, user):
    created = await _create(db, user, RESUME_A_STRONG)
    resume_id = created["id"]

    result = await check_modes(CheckModesRequest(resume_id=resume_id, job_description=JD_INSUFFICIENT), db, user)
    assert result["job_match"]["sufficient"] is False
    assert result["job_match"]["score"] is None
    # Resume ATS Health must still be a real number regardless
    assert result["resume_health"]["score"] is not None

    editor_result = await analyze_editor(
        AnalyzeEditorRequest(content=RESUME_A_STRONG, resume_id=resume_id, job_description=JD_INSUFFICIENT), db, user)
    assert editor_result["scores"]["job_match"] is None


# ── D. same resume + same JD -> same Job Match, every surface ──────────────

@pytest.mark.asyncio
async def test_same_resume_same_jd_same_job_match_across_surfaces(db, user):
    created = await _create(db, user, RESUME_A_STRONG)
    resume_id = created["id"]

    checker = await check_modes(CheckModesRequest(resume_id=resume_id, job_description=JD_A_SUFFICIENT), db, user)
    checker_job_match = checker["job_match"]["score"]

    editor = await analyze_editor(
        AnalyzeEditorRequest(content=RESUME_A_STRONG, resume_id=resume_id, job_description=JD_A_SUFFICIENT), db, user)
    editor_job_match = editor["scores"]["job_match"]

    job = await JobParser.parse(JD_A_SUFFICIENT)
    sufficiency = JobParser.assess_sufficiency(JD_A_SUFFICIENT, job)
    fix_scores = await _canonical_before_after(RESUME_A_STRONG, RESUME_A_STRONG, JD_A_SUFFICIENT, job)
    fix_job_match = fix_scores["before_layers"]["job_match"]

    direct = mode_orchestrator.job_match_mode(ResumeParser.from_content(RESUME_A_STRONG), job, sufficiency)["score"]

    all_matches = {
        "ATS Checker (/check)": checker_job_match,
        "Resume Editor (/analyze-editor)": editor_job_match,
        "AI Fix loop": fix_job_match,
        "direct mode_orchestrator.job_match_mode()": direct,
    }
    assert len(set(all_matches.values())) == 1, f"Job Match mismatch across surfaces: {all_matches}"
    assert direct is not None


# ── E. Resume-only / Resume+Role / Resume+JD are independent ───────────────

@pytest.mark.asyncio
async def test_resume_only_vs_role_vs_jd_are_independent(db, user):
    created = await _create(db, user, RESUME_A_STRONG)
    resume_id = created["id"]

    resume_only = await check_modes(CheckModesRequest(resume_id=resume_id), db, user)
    assert resume_only["role_readiness"] == {"available": False}
    assert resume_only["job_match"] == {"available": False}
    assert resume_only["resume_health"]["score"] is not None

    with_jd = await check_modes(CheckModesRequest(resume_id=resume_id, job_description=JD_A_SUFFICIENT), db, user)
    assert with_jd["role_readiness"] == {"available": False}, "adding a JD must not fabricate role readiness"
    assert with_jd["resume_health"]["score"] == resume_only["resume_health"]["score"]

    # best-effort: only assert role readiness behavior if this DB actually
    # has role_profiles seed data resolvable for a common title -- this test
    # suite does not own/seed that table, so a miss is not a failure here.
    with_role = await check_modes(CheckModesRequest(resume_id=resume_id, target_role="backend developer"), db, user)
    assert with_role["resume_health"]["score"] == resume_only["resume_health"]["score"], \
        "Resume ATS Health must never change just because a role was selected"
    if with_role["role_readiness"].get("available"):
        assert with_role["job_match"] == {"available": False}, "selecting a role must not fabricate a job match"


# ── F. Resume.ats_score is never trusted from the client ───────────────────

@pytest.mark.asyncio
async def test_client_supplied_ats_score_is_never_trusted(db, user):
    created = await _create(db, user, RESUME_A_WEAK)
    created_smuggled = await create_resume(
        ResumeUpsert(title="Smuggle", content=RESUME_A_WEAK, ats_score=9999), db, user)
    assert created_smuggled["ats_score"] != 9999
    assert created_smuggled["ats_score"] == created["ats_score"]

    updated = await update_resume(created["id"], ResumeUpsert(ats_score=8888), db, user)
    assert updated["ats_score"] != 8888
    assert updated["ats_score"] == created["ats_score"]  # untouched by the no-op update

    # version restore recomputes canonically, never trusts the snapshot's own value
    full = await _load_full(db, uuid.UUID(created["id"]))
    bogus_version = ResumeVersion(
        resume_id=full.id, user_id=user.id, title="Bogus", template_id="modern",
        content=RESUME_A_STRONG, ats_score=12345, source="manual_test_seed",
    )
    db.add(bogus_version)
    await db.commit()
    await db.refresh(bogus_version)
    from routers.resumes import restore_version
    restored = await restore_version(created["id"], str(bogus_version.id), db, user)
    assert restored["ats_score"] != 12345
    assert restored["ats_score"] == _canonical_ats_score(RESUME_A_STRONG)


# ── G. Final audit (this phase) — exact spec-format JD A/B invariant ───────

@pytest.mark.asyncio
async def test_final_audit_jd_a_jd_b_invariant_exact_spec_format(db, user):
    """Mirrors the exact example in the audit spec:
      Resume = X
      JD A: Resume ATS Health = X, Job Match = (some score)
      JD B: Resume ATS Health = X, Job Match = (a DIFFERENT score)
      No JD: Resume ATS Health = X, Job Match = unavailable
    """
    created = await _create(db, user, RESUME_A_STRONG)
    resume_id = created["id"]
    resume_health = created["ats_score"]
    assert resume_health is not None

    no_jd = await check_modes(CheckModesRequest(resume_id=resume_id), db, user)
    assert no_jd["resume_health"]["score"] == resume_health
    assert no_jd["job_match"] == {"available": False}  # "unavailable", never 0 or a guess

    jd_a = await check_modes(CheckModesRequest(resume_id=resume_id, job_description=JD_A_SUFFICIENT), db, user)
    jd_b = await check_modes(CheckModesRequest(resume_id=resume_id, job_description=JD_B_SUFFICIENT_DIFFERENT), db, user)

    assert jd_a["resume_health"]["score"] == resume_health
    assert jd_b["resume_health"]["score"] == resume_health
    assert jd_a["job_match"]["score"] is not None
    assert jd_b["job_match"]["score"] is not None
    print(f"\nResume = {resume_health}\n"
          f"JD A: Resume ATS Health = {jd_a['resume_health']['score']}, Job Match = {jd_a['job_match']['score']}\n"
          f"JD B: Resume ATS Health = {jd_b['resume_health']['score']}, Job Match = {jd_b['job_match']['score']}\n"
          f"No JD: Resume ATS Health = {no_jd['resume_health']['score']}, Job Match = unavailable")


# ── H. Adding a Project / Custom Section — score (whatever it becomes) is
#    never stale, and stays consistent across every surface ────────────────

@pytest.mark.asyncio
async def test_adding_project_and_custom_section_never_leaves_a_stale_score(db, user):
    base = {**RESUME_A_WEAK, "projects": [], "customSections": []}
    created = await _create(db, user, base)
    resume_id = created["id"]
    base_score = created["ats_score"]

    # Adding a Project: projects ARE a scored input (resume_parser.py parses
    # them into skill-evidence/content signals) — the score is free to move,
    # but every surface must agree on the NEW value, never a stale old one.
    with_project = {**base, "projects": [{
        "id": "p1", "name": "Open-source contribution tracker",
        "technologies": "Python, FastAPI, PostgreSQL",
        "description": "Built and shipped a tool used by 200+ contributors to track OSS contribution streaks.",
    }]}
    await update_resume(resume_id, ResumeUpsert(content=with_project), db, user)
    checker_after_project = (await check_modes(CheckModesRequest(resume_id=resume_id), db, user))["resume_health"]["score"]
    editor_after_project = (await analyze_editor(AnalyzeEditorRequest(content=with_project, resume_id=resume_id), db, user))["scores"]["overall"]
    direct_after_project = mode_orchestrator.resume_health_mode(ResumeParser.from_content(with_project))["score"]
    assert checker_after_project == editor_after_project == direct_after_project, (
        f"Stale/inconsistent score after adding a Project: checker={checker_after_project} "
        f"editor={editor_after_project} direct={direct_after_project}"
    )
    # confirm /check's write actually persisted the fresh value, not the old one
    refreshed = await _load_full(db, uuid.UUID(resume_id))
    assert refreshed.ats_score == checker_after_project

    # Adding a Custom Section: NOT currently a scored input anywhere in
    # resume_parser.py (freeform user content, not modeled by any category)
    # — by design, per the STOP CONDITION against changing the canonical
    # formula, this must NOT be made to influence the score in this audit.
    # The invariant that DOES apply: whatever the score is, every surface
    # must still agree on it (no staleness), even though it's expected to
    # be numerically unchanged here.
    with_custom_section = {**with_project, "customSections": [
        {"title": "Publications", "content": "Co-authored a paper on distributed caching strategies, published at a regional systems conference."},
    ]}
    updated2 = await update_resume(resume_id, ResumeUpsert(content=with_custom_section), db, user)
    checker_after_cs = (await check_modes(CheckModesRequest(resume_id=resume_id), db, user))["resume_health"]["score"]
    editor_after_cs = (await analyze_editor(AnalyzeEditorRequest(content=with_custom_section, resume_id=resume_id), db, user))["scores"]["overall"]
    direct_after_cs = mode_orchestrator.resume_health_mode(ResumeParser.from_content(with_custom_section))["score"]
    assert checker_after_cs == editor_after_cs == direct_after_cs, (
        f"Stale/inconsistent score after adding a Custom Section: checker={checker_after_cs} "
        f"editor={editor_after_cs} direct={direct_after_cs}"
    )

    print(f"\nbase={base_score} after_project={checker_after_project} after_custom_section={checker_after_cs}")


# ── I. Template independence — changing template_id never changes the score ─

@pytest.mark.asyncio
async def test_template_change_never_changes_resume_ats_health(db, user):
    created = await _create(db, user, RESUME_A_STRONG)
    resume_id = created["id"]
    score_a = created["ats_score"]

    for template in ("modern", "classic", "executive"):
        updated = await update_resume(resume_id, ResumeUpsert(template_id=template), db, user)
        assert updated["template_id"] == template
        # update_resume itself doesn't touch ats_score (by design -- see
        # routers/resumes.py); confirm the canonical engine independently
        # agrees the score is unchanged, since template_id never reaches
        # ResumeParser.from_content()/resume_health_mode() at all.
        checked = await check_modes(CheckModesRequest(resume_id=resume_id), db, user)
        assert checked["resume_health"]["score"] == score_a, (
            f"template={template} changed Resume ATS Health from {score_a} to {checked['resume_health']['score']}"
        )
    print(f"\nTemplate A -> score {score_a}\nTemplate B -> score {score_a}\nTemplate C -> score {score_a} (all identical, content unchanged)")
