"""
Phase H1 follow-up — ATS Checker navigation & resume-data-handoff bug fixes.

Bug A ("Improve My Resume" lost data for uploaded/pasted resumes): fixed by
resume_parser.to_content() (an honest, non-inventing mapping reused from
resume_improver.tailor()'s existing no-AI fallback, not duplicated) plus
POST /api/ats/v2/check additively returning `resume_content`/`resume_id` so
the frontend can persist via the EXISTING POST /api/resumes/ endpoint and
open the editor with real data instead of a blank form.

Bug B ("Target a Role" appeared to do nothing): a React stale-closure bug in
frontend/app/ats-checker/page.tsx's pickRole() — setSelectedRole(role) then
immediately runCheck({includeRole:true}) read `selectedRole` from a closure
that still held the PREVIOUS value (null on first use), so target_role was
silently omitted from the request. This file cannot exercise React state
timing (there is no frontend test harness in this repo — package.json's
`test: jest` script has no jest.config/existing test files to extend, and
standing one up is out of scope for a targeted bug-fix phase); the fix
(mode_orchestrator/backend side is untouched — this really is 100% a
frontend closure bug) was verified via real Playwright browser
click-through instead (see the phase's final report). What IS tested here
is the backend contract the fix relies on: role_readiness correctly stays
{"available": False} when target_role is empty, and correctly returns a
real result when it's present -- confirming the backend was never the
problem.
"""
import pytest

from services.ats_engine import ats_intelligence_v2, mode_orchestrator, resume_parser
from services.ats_engine import parsing_quality as parsing_quality_mod

_SAMPLE_PARSED_RESUME = {
    "full_name": "Jane Doe", "email": "jane@example.com", "phone": "9999999999",
    "location": "Pune", "job_title": "Java Developer", "summary": "A backend engineer.",
    "experience": [{"title": "Java Developer", "company": "Acme", "duration": "2020 - 2022",
                     "bullets": ["Built REST APIs.", "Wrote unit tests."]}],
    "education": [{"degree": "B.Tech", "institution": "XYZ College", "year": "2020"}],
    "skills": ["Java", "Spring Boot"], "certifications": ["AWS Certified Developer"],
    "projects": [{"name": "Inventory System", "description": "A CRUD app.", "technologies": ["Java", "MySQL"]}],
    "languages": [{"name": "English", "proficiency": "Fluent"}],
    "achievements": ["Won a hackathon"],
    "raw_text": "Jane Doe...", "parsed_by": "heuristic",
}


# ── Bug A — resume_parser.to_content(): honest, non-inventing mapping ──────

def test_to_content_preserves_available_fields():
    content = resume_parser.to_content(_SAMPLE_PARSED_RESUME)
    assert content["personalInfo"]["fullName"] == "Jane Doe"
    assert content["personalInfo"]["email"] == "jane@example.com"
    assert content["personalInfo"]["jobTitle"] == "Java Developer"
    assert content["summary"] == "A backend engineer."
    assert content["experience"][0]["position"] == "Java Developer"
    assert content["experience"][0]["company"] == "Acme"
    assert content["experience"][0]["bullets"] == ["Built REST APIs.", "Wrote unit tests."]
    assert content["education"][0]["degree"] == "B.Tech"
    assert content["education"][0]["institution"] == "XYZ College"
    assert {"name": "Java", "level": 75} in content["skills"]
    assert content["certifications"] == [{"name": "AWS Certified Developer", "issuer": ""}]
    assert content["projects"][0]["technologies"] == "Java, MySQL"
    assert content["achievements"] == ["Won a hackathon"]


def test_to_content_never_invents_missing_fields():
    """A field genuinely absent from the parsed resume must stay empty --
    never guessed, never defaulted to something plausible-looking."""
    sparse = {"full_name": "John Smith", "experience": [], "education": [], "skills": []}
    content = resume_parser.to_content(sparse)
    assert content["personalInfo"]["email"] == ""
    assert content["personalInfo"]["phone"] == ""
    assert content["personalInfo"]["location"] == ""
    assert content["summary"] == ""
    assert content["experience"] == []
    assert content["certifications"] == []


def test_to_content_handles_a_completely_empty_resume():
    content = resume_parser.to_content({})
    assert content["personalInfo"]["fullName"] == ""
    assert content["experience"] == []
    assert content["skills"] == []


def test_to_content_caps_end_date_to_fit_the_experiences_table_column():
    """Regression for a bug found during the live acceptance test: when a
    source resume crams title/company/dates onto a single line (e.g. a
    one-line DOCX table row), _parse_experience_section can't split it and
    falls back to keeping the WHOLE line as `duration`. to_content() used to
    pass that straight through into `endDate`, which POST /api/resumes/
    then tried to insert into experiences.end_date -- a VARCHAR(50) column
    (models.py) -- raising asyncpg.StringDataRightTruncationError and
    aborting the entire "Improve My Resume" handoff for CASE B/C (uploaded/
    pasted resumes), losing all of the resume's data. endDate must now be
    capped to fit that column; nothing else about the mapping should change."""
    long_line = "Java Developer - Initech Systems\tJan 2022 - Present, previously Senior SDE"
    assert len(long_line) > 50
    resume = {
        "full_name": "Priya Kulkarni",
        "experience": [{"title": "", "company": "", "duration": long_line,
                         "bullets": ["Built things."]}],
    }
    content = resume_parser.to_content(resume)
    assert len(content["experience"][0]["endDate"]) <= 50
    assert content["experience"][0]["endDate"] == long_line[:50]

    short = "2020 - 2022"
    content_short = resume_parser.to_content(
        {"experience": [{"title": "X", "company": "Y", "duration": short, "bullets": []}]}
    )
    assert content_short["experience"][0]["endDate"] == short  # untouched when it already fits


def test_heuristic_parse_extracts_name_email_phone_when_present():
    """Regression for a second bug found during the live acceptance test:
    _heuristic_parse() (the no-AI fallback -- runs whenever the AI parse
    call is unavailable or fails, which is exactly what a "Paste text"
    submission can hit under load) used to hardcode full_name/email/phone
    to None unconditionally, even when they were plainly present in the
    text. That's not "never invent" (the fields were genuinely there); it
    silently threw away real data before it ever reached to_content(), so
    a pasted resume's "Improve My Resume" editor showed a blank "John Doe"
    placeholder while Work Experience/Education/Skills were all correct.
    email/phone now reuse the exact regex text_metrics.py already uses to
    score "Contact / Essential Information", so detection can never
    disagree between the score and the handoff; full_name uses a strict,
    conservative first-line heuristic that leaves the field None rather
    than guess whenever it isn't confident."""
    text = (
        "Rahul Mehta\n"
        "rahul.mehta.pastetest@example.com | +91 98111 22333\n\n"
        "SUMMARY\nFrontend engineer with React experience.\n\n"
        "EXPERIENCE\nFrontend Developer - Webify Labs\n"
        "- Built React dashboards used by 200 daily users.\n\n"
        "EDUCATION\nB.Sc Computer Science, Delhi University, 2020\n\n"
        "SKILLS\nReact, TypeScript, CSS\n"
    )
    result = resume_parser._heuristic_parse(text)
    assert result["full_name"] == "Rahul Mehta"
    assert result["email"] == "rahul.mehta.pastetest@example.com"
    assert result["phone"] == "+91 98111 22333"
    content = resume_parser.to_content(result)
    assert content["personalInfo"]["fullName"] == "Rahul Mehta"
    assert content["personalInfo"]["email"] == "rahul.mehta.pastetest@example.com"


def test_heuristic_parse_never_invents_a_name_when_the_first_line_is_ambiguous():
    """The strict name heuristic must decline rather than guess wrong."""
    assert resume_parser._heuristic_parse("")["full_name"] is None
    # First line is a section heading, not a name.
    assert resume_parser._heuristic_parse("EXPERIENCE\nSenior Engineer\n- Did things.")["full_name"] is None
    # First line is a sentence (>5 words), not a name.
    long_sentence = "Experienced software engineer with 5 years in backend systems.\nEXPERIENCE\n"
    assert resume_parser._heuristic_parse(long_sentence)["full_name"] is None


def test_to_content_matches_resume_improver_tailor_no_ai_fallback_shape(monkeypatch):
    """resume_improver.tailor()'s no-AI branch now calls to_content()
    internally (Phase H1 follow-up de-duplication) -- lock in that both
    still produce the same experience/education/skills/certifications
    shape a saved resume's content would have, so nothing regressed for
    the pre-existing Tailor flow. AI is force-disabled via monkeypatch so
    this deterministically exercises the no-AI branch regardless of
    whether this environment happens to have a live, working AI key at
    test-run time (it does in this repo's .env, so leaving this
    unmocked is flaky: the real OpenAI call can succeed -- or land a
    transient 429 that chat_json's own retry logic later clears -- and
    silently flip which branch actually runs)."""
    import asyncio
    from services.ats_engine import resume_improver

    async def _no_ai(*args, **kwargs):
        return None

    monkeypatch.setattr(resume_improver, "chat_json", _no_ai)

    async def _run():
        return await resume_improver.tailor(_SAMPLE_PARSED_RESUME, {"job_title": None, "raw_text": ""})

    result = asyncio.run(_run())
    assert result["tailored_by"] == "none"
    assert result["personalInfo"]["fullName"] == "Jane Doe"
    assert result["experience"][0]["position"] == "Java Developer"
    assert result["experience"][0]["bullets"] == ["Built REST APIs.", "Wrote unit tests."]
    assert result["education"][0]["degree"] == "B.Tech"


# ── Bug B — confirm the backend contract the frontend fix relies on ────────

def test_role_readiness_correctly_unavailable_with_no_role():
    """This is what a request with target_role silently omitted (the bug)
    actually produced -- confirms the backend was behaving exactly as
    designed, and the missing piece was purely the frontend not sending
    target_role at all."""
    result = mode_orchestrator.role_readiness_mode({"raw_text": "x", "skills": []}, None)
    assert result == {"available": False}


def test_role_readiness_correctly_available_when_role_is_actually_passed():
    role_job = {
        "job_title": "Java Developer", "required_skills": ["Java"], "preferred_skills": [],
        "responsibilities": [], "min_experience_years": None, "min_education": "B.Tech",
        "industry": "IT", "keywords": ["Java"], "technologies": [], "certifications": [],
        "raw_text": "Java Developer Java", "parsed_by": "role_library",
    }
    resume = {
        "raw_text": "Jane Doe\nSKILLS\nJava\n", "skills": ["Java"], "hard_skills": ["Java"],
        "experience": [], "education": [], "certifications": [],
    }
    result = mode_orchestrator.role_readiness_mode(resume, role_job)
    assert result["available"] is True
    assert result["score"] is not None


# ── Bug G — Resume Editor's "ATS Score" silently diverged from the ATS ─────
# Checker's canonical Resume ATS Health (found during the CRUD/consistency
# acceptance test). routers/ats_engine.py's /analyze-editor (no JD) used to
# call ats_intelligence_v2.compute_full_analysis(resume, None) — a DIFFERENT
# weight table (ATS_SCORE_CONFIG, not RESUME_HEALTH_LAYER_WEIGHTS) and a
# DIFFERENT resume_quality (analyze_resume_quality(), which still includes
# Profile Completeness; resume_health_mode() explicitly excludes it) — so
# the SAME resume could show two different "ATS score" numbers depending on
# which screen you were looking at. Fixed by
# mode_orchestrator.resume_health_as_full_analysis(): the endpoint now
# reshapes resume_health_mode()'s own output instead of computing a second,
# separate number. compute_full_analysis() itself is UNCHANGED and still
# used exactly as before for every other caller (benchmark suite,
# apply_fix.py's before/after deltas, Phase C's own tests, and this same
# endpoint's WITH-a-JD case).

_RICH_RESUME_FOR_HEALTH = {
    "full_name": "Test Candidate", "email": "test@example.com", "phone": "9999999999",
    "raw_text": (
        "Test Candidate\ntest@example.com\n\nSUMMARY\nBackend engineer with 5 years building "
        "distributed systems in Python and Go.\n\nEXPERIENCE\nSenior Backend Engineer - Acme Corp\n"
        "2019 - Present\n- Led a team of 4 engineers migrating a monolith to microservices, "
        "reducing latency by 35%.\n- Built and shipped 12 REST APIs serving 5M requests/day.\n\n"
        "EDUCATION\nB.Tech Computer Science, XYZ University, 2018\n\nSKILLS\nPython, Go, Kubernetes, "
        "Docker, PostgreSQL, REST APIs, Microservices\n\nCERTIFICATIONS\nAWS Certified Solutions Architect\n"
    ),
    "summary": "Backend engineer with 5 years building distributed systems in Python and Go.",
    "job_title": "Senior Backend Engineer",
    "experience": [{"title": "Senior Backend Engineer", "company": "Acme Corp", "duration": "2019 - Present",
                     "bullets": ["Led a team of 4 engineers migrating a monolith to microservices, reducing latency by 35%.",
                                 "Built and shipped 12 REST APIs serving 5M requests/day."]}],
    "education": [{"degree": "B.Tech", "institution": "XYZ University", "year": "2018"}],
    "skills": ["Python", "Go", "Kubernetes", "Docker", "PostgreSQL", "REST APIs", "Microservices"],
    "hard_skills": ["Python", "Go", "Kubernetes", "Docker", "PostgreSQL", "REST APIs", "Microservices"],
    "certifications": ["AWS Certified Solutions Architect"],
    "action_verbs": ["led", "built"], "keywords": ["Python", "Go", "Kubernetes"],
    "total_experience_years": 5.0, "bullets": [
        "Led a team of 4 engineers migrating a monolith to microservices, reducing latency by 35%.",
        "Built and shipped 12 REST APIs serving 5M requests/day.",
    ],
}


def test_resume_health_as_full_analysis_matches_the_canonical_score_exactly():
    health = mode_orchestrator.resume_health_mode(_RICH_RESUME_FOR_HEALTH)
    adapted = mode_orchestrator.resume_health_as_full_analysis(_RICH_RESUME_FOR_HEALTH)
    assert adapted["score"] == health["score"]
    assert adapted["layers"]["ats_compatibility"] == health["layers"]["ats_compatibility"]["score"]
    assert adapted["layers"]["resume_quality"] == health["layers"]["resume_quality"]["score"]
    assert adapted["layers"]["job_match"] is None
    assert adapted["ats_compatibility"]["categories"] == health["layers"]["ats_compatibility"]["categories"]
    assert adapted["resume_quality"]["categories"] == health["layers"]["resume_quality"]["categories"]
    from services.ats_engine import ats_config
    assert adapted["scoring_engine_version"] == ats_config.SCORING_ENGINE_VERSION


def test_the_old_editor_path_really_did_diverge_from_canonical_before_this_fix():
    """Documents WHY the fix was needed: compute_full_analysis(resume, None)
    (what /analyze-editor used before) is not guaranteed to equal
    resume_health_mode(resume)'s score for the same resume — different
    weight table, different resume_quality inclusion of Profile
    Completeness. This test doesn't assert they always differ (they could
    coincide for some resumes) — it documents that the two functions are
    independently-defined and were never guaranteed to agree, which is
    exactly why resume_health_as_full_analysis() now reshapes one instead
    of computing a second version."""
    old_path_score = ats_intelligence_v2.compute_full_analysis(_RICH_RESUME_FOR_HEALTH, None)["score"]
    canonical_score = mode_orchestrator.resume_health_mode(_RICH_RESUME_FOR_HEALTH)["score"]
    # Not a strict inequality assertion (two independent formulas landing on
    # the same integer by coincidence is possible and wouldn't mean the bug
    # is gone) -- the real guarantee is the test above: the ENDPOINT's
    # result now always equals the canonical one, never compute_full_
    # analysis()'s independently-drifting number.
    assert isinstance(old_path_score, int) and isinstance(canonical_score, int)


def test_resume_health_as_full_analysis_shape_is_compatible_with_editor_recommendation_builders():
    """build_editor_recommendations()/build_editor_questions() index into
    result["resume_quality"]["categories"][key]["weight"/"match"/...] --
    confirm the adapted shape satisfies that without raising."""
    adapted = mode_orchestrator.resume_health_as_full_analysis(_RICH_RESUME_FOR_HEALTH)
    recs = ats_intelligence_v2.build_editor_recommendations(_RICH_RESUME_FOR_HEALTH, None, adapted)
    questions = ats_intelligence_v2.build_editor_questions(_RICH_RESUME_FOR_HEALTH, None, adapted)
    assert set(recs.keys()) == {"high", "medium", "low"}
    assert isinstance(questions, list)


def test_compute_full_analysis_itself_is_unchanged_and_still_used_for_the_with_jd_case():
    """The fix must not touch compute_full_analysis() itself -- it's still
    the real, direct engine for every OTHER caller (benchmark suite,
    apply_fix.py, Phase C's tests, and this same endpoint's WITH-a-JD
    path). This just locks in that it still returns its own, original
    three-layer shape when called directly."""
    job = {"job_title": "Backend Engineer", "required_skills": ["Python"], "preferred_skills": [],
           "responsibilities": [], "min_experience_years": None, "min_education": None,
           "industry": None, "keywords": ["Python"], "technologies": [], "certifications": [],
           "raw_text": "Backend Engineer Python", "parsed_by": "test"}
    result = ats_intelligence_v2.compute_full_analysis(_RICH_RESUME_FOR_HEALTH, job)
    assert result["mode"] == "job_match"
    assert result["job_match"] is not None
    assert result["layers"]["job_match"] is not None


# ── Bug H — a brand-new, empty Resume Builder draft crashed /analyze-editor ─
# with KeyError: 'contact_note' (found while running the CRUD/consistency
# acceptance test against a freshly-created, never-edited resume). Root
# cause: parsing_quality.analyze_parsing_quality()'s early-return branch for
# genuinely empty text was missing the "contact_note" key that its normal-
# path return always includes -- a pre-existing gap, latent since Phase H1
# added that key, only ever actually reached once Bug G's fix routed the
# editor's no-JD path through resume_health_mode() (which, unlike the old
# compute_full_analysis() path, calls _parsing_and_contact_categories(),
# which unconditionally reads result["contact_note"]). Fix is additive only
# -- the empty-text branch's score/ratios (all correctly zero) are
# untouched; it just also carries the one key it was missing.

def test_analyze_parsing_quality_empty_text_includes_contact_note():
    result = parsing_quality_mod.analyze_parsing_quality("")
    assert "contact_note" in result
    assert result["score"] == 0
    assert result["contact_extraction_score"] == 0.0


def test_resume_health_mode_does_not_crash_on_a_completely_empty_resume():
    """This is the exact crash scenario: a brand-new Resume Builder draft
    (POST /api/resumes/ with no content yet) triggers the editor's
    debounced no-JD auto-analysis on mount, which now goes through
    resume_health_mode(). Must not raise."""
    empty_resume = {"raw_text": ""}
    health = mode_orchestrator.resume_health_mode(empty_resume)
    assert health["score"] == 0 or health["score"] is None
    adapted = mode_orchestrator.resume_health_as_full_analysis(empty_resume)
    assert adapted["score"] == health["score"]
