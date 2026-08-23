"""
Phase G — ATS Checker mode redesign: JD sufficiency gate, and the three
independent analysis modes (Resume ATS Health / Role Readiness / Job Match).

Mirrors test_phase_d_ai_agent.py's split: fast, deterministic unit tests
against the pure functions (job_parser.assess_sufficiency, mode_orchestrator)
plus real DB-backed integration tests against the new POST /api/ats/v2/check
endpoint via the `client` fixture — including the exact "java developer"
title-only scenario that used to produce a misleading 96/100.

None of these tests touch scoring.py, keyword_engine.py, or analyze_v2()'s
frozen behavior — this file only exercises the new, additive Phase G layer.
"""
import random
import string

import pytest

from services.ats_engine import ats_config, job_parser, mode_orchestrator, resume_parser

RICH_RESUME_TEXT = """Priya Sharma
priya@example.com | +91 90000 00000 | Bengaluru

SUMMARY
Product-minded React developer with 5 years building consumer web apps.

EXPERIENCE
Senior React Developer - Zenith Corp
- Built and shipped a design system used across 12 products.
- Reduced page load time by 40 percent through code splitting.

EDUCATION
B.Tech Computer Science, IIT Bombay, 2018

SKILLS
React, TypeScript, Next.js, CSS, Redux, Jest

CERTIFICATIONS
AWS Certified Developer, AWS, 2022
"""

RICH_JD_TEXT = """React Developer

Required: React, TypeScript, Next.js, Redux
Preferred: CSS, GraphQL
3+ years of experience required. Bachelor's degree required.

Responsibilities:
- Build and maintain UI components
- Collaborate with design and backend teams

Certifications: AWS Certified Developer preferred.
"""

_SUFFICIENT_ROLE_JOB = {
    "job_title": "React Developer", "required_skills": ["React", "TypeScript"], "preferred_skills": [],
    "responsibilities": [], "min_experience_years": None, "min_education": "Bachelor's degree",
    "industry": "IT", "keywords": ["React", "TypeScript"], "technologies": [],
    "certifications": ["AWS Certified Developer"],
    "raw_text": "React Developer React TypeScript", "parsed_by": "role_library",
}
_SKILLS_ONLY_ROLE_JOB = {
    "job_title": "Java Developer", "required_skills": ["Java", "Spring"], "preferred_skills": [],
    "responsibilities": [], "min_experience_years": None, "min_education": None,
    "industry": None, "keywords": ["Java", "Spring"], "technologies": [], "certifications": [],
    "raw_text": "Java Developer Java Spring", "parsed_by": "role_library",
}
_UNMATCHED_ROLE_JOB = {
    "job_title": "Java Developer", "required_skills": [], "preferred_skills": [],
    "responsibilities": [], "min_experience_years": None, "min_education": None,
    "industry": None, "keywords": [], "technologies": [], "certifications": [],
    "raw_text": "Java Developer", "parsed_by": "role_library_unmatched",
}


def _resume():
    return resume_parser._heuristic_parse(RICH_RESUME_TEXT)


def _scoreable_resume():
    """A resume dict with the fields an AI-parsed resume would actually
    populate (unlike the heuristic parser's deliberately narrow extraction)
    -- used where a test needs a real, non-excluded category match rather
    than exercising the heuristic fallback itself."""
    return {
        "skills": ["React", "TypeScript", "Next.js", "Redux", "CSS", "Jest"],
        "hard_skills": ["React", "TypeScript"], "soft_skills": [], "keywords": ["React", "TypeScript"],
        "certifications": ["AWS Certified Developer"],
        "experience": [{"title": "Senior React Developer", "company": "Zenith Corp", "duration": "2019-2024",
                         "bullets": ["Built and shipped a design system used across 12 products.",
                                     "Reduced page load time by 40 percent through code splitting."]}],
        "education": [{"degree": "B.Tech Computer Science", "institution": "IIT Bombay", "year": "2018"}],
        "bullets": ["Built and shipped a design system used across 12 products.",
                    "Reduced page load time by 40 percent through code splitting."],
        "total_experience_years": 5, "raw_text": RICH_RESUME_TEXT, "location": "Bengaluru",
    }


_SUFFICIENT_JD_JOB = {
    "job_title": "React Developer", "required_skills": ["React", "TypeScript", "Next.js", "Redux"],
    "preferred_skills": ["CSS", "GraphQL"],
    "responsibilities": ["Build and maintain UI components", "Collaborate with design and backend teams"],
    "min_experience_years": 3, "min_education": "Bachelor's degree", "industry": "IT",
    "keywords": ["React", "TypeScript", "Next.js", "Redux", "CSS", "GraphQL"],
    "technologies": ["React", "TypeScript"], "certifications": ["AWS Certified Developer"],
    "raw_text": RICH_JD_TEXT, "parsed_by": "ai",
}


def _rand_email() -> str:
    return f"phaseg-{''.join(random.choices(string.ascii_lowercase + string.digits, k=10))}@example.com"


# ── JD sufficiency gate ──────────────────────────────────────────────────────

def test_config_thresholds_are_what_phase_g_approved():
    """Locks in the exact, explicitly-approved thresholds — a future
    accidental edit to ats_config.py should break this test loudly."""
    assert ats_config.JD_SUFFICIENCY_MIN_CHARS == 150
    assert ats_config.JD_SUFFICIENCY_MIN_SIGNALS == 2


def test_title_only_jd_is_insufficient():
    """The exact bug report: 'java developer' must never pass the gate."""
    parsed = job_parser._heuristic_parse("java developer")
    result = job_parser.assess_sufficiency("java developer", parsed)
    assert result["sufficient"] is False
    assert result["text_length"] < 150
    assert result["signal_count"] == 0


def test_149_char_jd_is_insufficient_on_length_alone():
    base = ("- Build and maintain backend services.\n- Write tests.\n"
            "Requires 3+ years of experience. Bachelor's degree required. ")
    text = (base * 3)[:149]
    assert len(text) == 149
    parsed = job_parser._heuristic_parse(text)
    result = job_parser.assess_sufficiency(text, parsed)
    assert result["text_length"] == 149
    assert result["sufficient"] is False


def test_long_enough_text_with_fewer_than_2_signals_is_insufficient():
    # No bullet lines -> no "responsibilities" signal; only the "N years"
    # heuristic can fire -> at most 1 structured signal, well past the
    # 150-char floor. Length alone must not be enough.
    text = ("We are looking for a motivated candidate with at least 5 years "
            "of hands-on professional experience in a fast-paced, collaborative "
            "environment for our growing engineering team across multiple offices.")
    assert len(text) >= 150
    parsed = job_parser._heuristic_parse(text)
    result = job_parser.assess_sufficiency(text, parsed)
    assert result["signal_count"] < 2
    assert result["sufficient"] is False


def test_real_jd_with_responsibilities_and_experience_signal_is_sufficient():
    parsed = job_parser._heuristic_parse(RICH_JD_TEXT)
    result = job_parser.assess_sufficiency(RICH_JD_TEXT, parsed)
    assert result["text_length"] >= 150
    assert result["signal_count"] >= 2
    assert result["sufficient"] is True


def test_sufficiency_never_fabricates_fields_not_actually_extracted():
    """The gate only ever counts what JobParser actually returned -- it must
    not invent or infer signals the parser didn't produce."""
    parsed = job_parser._heuristic_parse("java developer")
    assert parsed["required_skills"] == []
    assert parsed["keywords"] == []
    assert parsed["certifications"] == []
    assert parsed["min_education"] is None


# ── Mode 1 — Resume ATS Health (always available, JD-independent) ───────────

def test_resume_health_always_available_and_independent_of_job():
    """Phase H1 restructured resume_health_mode() into two layers (see
    test_ats_phase_h_resume_health.py for the full Phase H1 suite) -- this
    test now only asserts the Phase G-era behavior that still holds:
    always available, always a real score, independent of any job/role."""
    result = mode_orchestrator.resume_health_mode(_resume())
    assert result["available"] is True
    assert result["score"] is not None
    assert 0 <= result["score"] <= 100
    assert set(result["layers"]) == {"ats_compatibility", "resume_quality"}
    assert set(result["layers"]["ats_compatibility"]["categories"]) == {"parsing", "sections", "formatting", "contact"}


def test_resume_health_separates_profile_completeness_from_the_score():
    result = mode_orchestrator.resume_health_mode(_resume())
    for layer in result["layers"].values():
        assert "completeness" not in layer["categories"], "completeness must not feed either scored layer"
    completeness_row = result["supplementary"]["completeness"]
    assert completeness_row["contributes_to_score"] is False
    assert completeness_row["label"] == "Profile Completeness"
    # regression: this row was built by hand (not via CategoryAnalysis.to_dict())
    # and originally omitted "applicable", which made the frontend render "N/A"
    # for a value that was actually always present.
    assert completeness_row["applicable"] is True
    assert completeness_row["match"] is not None


# ── Mode 2 — Role Readiness ──────────────────────────────────────────────────

def test_role_readiness_unavailable_when_no_role_selected():
    result = mode_orchestrator.role_readiness_mode(_resume(), None)
    assert result["available"] is False


def test_role_readiness_limited_when_role_not_found_in_library():
    result = mode_orchestrator.role_readiness_mode(_resume(), _UNMATCHED_ROLE_JOB)
    assert result["available"] is True
    assert result["data_sufficiency"] == "limited"
    assert result["score"] is None, "an unmatched role must never invent a score"
    assert "limited role information" in result["message"].lower()


def test_role_readiness_limited_but_scored_when_skills_only():
    result = mode_orchestrator.role_readiness_mode(_resume(), _SKILLS_ONLY_ROLE_JOB)
    assert result["available"] is True
    assert result["data_sufficiency"] == "limited"
    assert result["score"] is not None
    assert "skill data" in result["message"].lower()


def test_role_readiness_sufficient_with_skills_and_education():
    result = mode_orchestrator.role_readiness_mode(_resume(), _SUFFICIENT_ROLE_JOB)
    assert result["available"] is True
    assert result["data_sufficiency"] == "sufficient"
    assert result["score"] is not None
    assert result["message"] is None


def test_role_readiness_never_labeled_job_match():
    """The response shape itself must not use Job Match's vocabulary."""
    result = mode_orchestrator.role_readiness_mode(_resume(), _SUFFICIENT_ROLE_JOB)
    assert "sufficient" not in result  # that key belongs to job_match_mode's contract, not role's
    assert "data_sufficiency" in result


# ── Mode 3 — Job Match ───────────────────────────────────────────────────────

def test_job_match_unavailable_when_no_jd():
    result = mode_orchestrator.job_match_mode(_resume(), None, None)
    assert result["available"] is False


def test_job_match_insufficient_never_returns_a_score():
    parsed = job_parser._heuristic_parse("java developer")
    sufficiency = job_parser.assess_sufficiency("java developer", parsed)
    result = mode_orchestrator.job_match_mode(_resume(), parsed, sufficiency)
    assert result["available"] is True
    assert result["sufficient"] is False
    assert result["score"] is None
    assert "full job description" in result["message"].lower()


def test_job_match_sufficient_jd_produces_a_real_score():
    sufficiency = job_parser.assess_sufficiency(RICH_JD_TEXT, _SUFFICIENT_JD_JOB)
    assert sufficiency["sufficient"] is True
    result = mode_orchestrator.job_match_mode(_scoreable_resume(), _SUFFICIENT_JD_JOB, sufficiency)
    assert result["sufficient"] is True
    assert result["score"] is not None
    assert 0 <= result["score"] <= 100


# ── Mode independence — TEST 1/2/7/8 from the Phase G spec ──────────────────

def test_1_resume_only():
    resume = _resume()
    assert mode_orchestrator.resume_health_mode(resume)["available"] is True
    assert mode_orchestrator.role_readiness_mode(resume, None)["available"] is False
    assert mode_orchestrator.job_match_mode(resume, None, None)["available"] is False


def test_2_resume_plus_role_job_match_stays_unavailable():
    resume = _resume()
    health = mode_orchestrator.resume_health_mode(resume)
    role = mode_orchestrator.role_readiness_mode(resume, _SUFFICIENT_ROLE_JOB)
    job = mode_orchestrator.job_match_mode(resume, None, None)
    assert health["available"] is True
    assert role["available"] is True
    assert job["available"] is False


def test_7_all_three_modes_coexist_independently():
    resume = _scoreable_resume()
    jd_sufficiency = job_parser.assess_sufficiency(RICH_JD_TEXT, _SUFFICIENT_JD_JOB)

    health = mode_orchestrator.resume_health_mode(resume)
    role = mode_orchestrator.role_readiness_mode(resume, _SUFFICIENT_ROLE_JOB)
    job = mode_orchestrator.job_match_mode(resume, _SUFFICIENT_JD_JOB, jd_sufficiency)

    assert health["available"] and health["score"] is not None
    assert role["available"] and role["score"] is not None
    assert job["available"] and job["sufficient"] and job["score"] is not None
    # never merged into one number
    assert isinstance(health["score"], (int, float))
    assert isinstance(role["score"], (int, float))
    assert isinstance(job["score"], (int, float))


def test_8_resume_role_and_insufficient_jd_only_blocks_job_match():
    resume = _resume()
    jd_parsed = job_parser._heuristic_parse("java developer")
    jd_sufficiency = job_parser.assess_sufficiency("java developer", jd_parsed)

    health = mode_orchestrator.resume_health_mode(resume)
    role = mode_orchestrator.role_readiness_mode(resume, _SUFFICIENT_ROLE_JOB)
    job = mode_orchestrator.job_match_mode(resume, jd_parsed, jd_sufficiency)

    assert health["available"] is True and health["score"] is not None
    assert role["available"] is True and role["score"] is not None
    assert job["available"] is True
    assert job["sufficient"] is False
    assert job["score"] is None


# ── Real DB-backed integration tests (client fixture) ────────────────────────

async def _signup_and_resume(client):
    email = _rand_email()
    r = await client.post("/api/auth/signup", json={"email": email, "password": "Passw0rd!23", "full_name": "Phase G"})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    content = {
        "personalInfo": {"fullName": "Phase G User", "jobTitle": "Java Developer", "email": email, "phone": "9999999999", "location": "Pune"},
        "summary": "Java developer.",
        "experience": [{"id": "e1", "position": "Java Developer", "company": "Acme", "location": "",
                         "startDate": "2022-01", "endDate": "", "current": True,
                         "bullets": ["Built REST APIs in Java and Spring Boot.", "Wrote unit tests with JUnit."]}],
        "education": [{"id": "ed1", "degree": "B.Tech", "field": "", "institution": "Acme University", "location": "", "startDate": "2018", "endDate": "2022", "gpa": ""}],
        "skills": [{"name": "Java", "level": 4}, {"name": "Spring Boot", "level": 3}], "projects": [],
        "certifications": [], "languages": [], "achievements": [], "interests": [],
    }
    r = await client.post("/api/resumes/", json={"title": "Phase G Resume", "template_id": "modern", "content": content}, headers=headers)
    assert r.status_code == 201, r.text
    return headers, r.json()["id"]


@pytest.mark.asyncio
async def test_check_endpoint_resume_only_needs_no_role_or_jd(client):
    headers, resume_id = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/check", json={"resume_id": resume_id}, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["resume_health"]["available"] is True
    assert body["resume_health"]["score"] is not None
    assert body["role_readiness"]["available"] is False
    assert body["job_match"]["available"] is False
    assert body["scoring_engine_version"] == "2.1.0"


@pytest.mark.asyncio
async def test_check_endpoint_title_only_jd_never_produces_a_misleading_score(client):
    """The exact regression: pasting only 'java developer' as the JD used to
    produce a 96/100 'Overall ATS Score'. It must now come back as an
    unscored, clearly-explained Job Match, with Resume ATS Health computed
    normally alongside it."""
    headers, resume_id = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/check", json={
        "resume_id": resume_id, "job_description": "java developer",
    }, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["resume_health"]["available"] is True
    assert body["resume_health"]["score"] is not None
    assert body["job_match"]["available"] is True
    assert body["job_match"]["sufficient"] is False
    assert body["job_match"]["score"] is None
    assert "full job description" in body["job_match"]["message"].lower()


@pytest.mark.asyncio
async def test_check_endpoint_sufficient_jd_produces_job_match_score(client):
    headers, resume_id = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/check", json={
        "resume_id": resume_id, "job_description": RICH_JD_TEXT,
    }, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["job_match"]["available"] is True
    assert body["job_match"]["sufficient"] is True
    assert body["job_match"]["score"] is not None


@pytest.mark.asyncio
async def test_check_endpoint_persists_a_typed_ats_report(client):
    headers, resume_id = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/check", json={"resume_id": resume_id}, headers=headers)
    assert r.status_code == 200, r.text
    report_id = r.json()["report_id"]
    assert report_id

    detail = await client.get(f"/api/ats/v2/report/{report_id}", headers=headers)
    assert detail.status_code == 200, detail.text
    # report_id resolves and belongs to this user -- the new score_type/
    # jd_sufficient columns are additive DB columns, not asserted via this
    # legacy-shaped read endpoint (it doesn't project them), so this test
    # only confirms the row was actually written and is ownership-scoped.


@pytest.mark.asyncio
async def test_check_endpoint_requires_a_resume(client):
    headers, _ = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/check", json={}, headers=headers)
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_check_endpoint_rejects_unowned_resume(client):
    headers_a, resume_id = await _signup_and_resume(client)
    email_b = _rand_email()
    rb = await client.post("/api/auth/signup", json={"email": email_b, "password": "Passw0rd!23", "full_name": "B"})
    headers_b = {"Authorization": f"Bearer {rb.json()['access_token']}"}
    r = await client.post("/api/ats/v2/check", json={"resume_id": resume_id}, headers=headers_b)
    assert r.status_code == 404


# ── TEST 9 — legacy endpoints untouched alongside the new mode ──────────────

@pytest.mark.asyncio
async def test_legacy_analyze_resume_endpoint_still_works_unchanged(client):
    headers, resume_id = await _signup_and_resume(client)
    r = await client.post("/api/ats/v2/analyze-resume", json={
        "resume_id": resume_id, "job_description": "java developer",
    }, headers=headers)
    assert r.status_code == 200, r.text
    # unchanged legacy contract -- overall_score is still a plain number,
    # still driven by scoring.py's redistribution (frozen, not touched here)
    assert isinstance(r.json()["ats"]["overall_score"], int)
