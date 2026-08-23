"""
Regression tests for docs/ATS_SCORE_DISCREPANCY_20_VS_78_80.md.

**Context:** a user reported SahiCareer scoring the same resume 20 vs.
Enhancv/ResumeGyani's ~78-80. The user's exact resume/JD text was never
available to this investigation (see the doc, section 1) — these tests do
NOT reproduce that exact case. What they DO capture is the most severe,
independently-verified mechanism found while tracing the pipeline: when the
AI resume/JD parser is unavailable (no provider key configured, or the
provider call fails/rate-limits — `chat_json()` returns `None` either way,
silently, with no exception), `ResumeParser._heuristic_parse()` and
`JobParser._heuristic_parse()` used to discard structured content almost
entirely — even from a cleanly-labeled, well-formatted resume/JD.

**PHASE F1 UPDATE:** `ResumeParser._heuristic_parse()` was fixed (see
docs/ATS_CASE_STUDY_POOJA_SCORE_20_FIX.md) to actually extract structured
sections instead of returning them hardcoded empty. The tests below that
were originally marked "KNOWN GAP" (asserting the old, defective behavior
on purpose) have been flipped to assert the CORRECTED behavior — they are
now true regression guards against that specific fix ever regressing. Their
original KNOWN-GAP framing is kept in the docstrings for history/context.
`JobParser._heuristic_parse()` (the JD side) was explicitly OUT of scope for
Phase F1 and is UNCHANGED — tests that depend on JD-side extraction still
reflect that gap, unchanged. No other production code is touched by this
file.
"""
import asyncio

import pytest

from services.ats_engine import resume_parser, job_parser, ats_service, scoring, similarity_service

# A clean, unambiguous, well-formatted resume — the kind that should be
# trivial to parse. Same section headings used across the rest of this
# project's tests (see test_ats_engine.py's RICH_RESUME_TEXT).
CLEAN_RESUME_TEXT = """Aarav Sharma
aarav.sharma@example.com | +91 90000 00000 | Bengaluru, India

SUMMARY
Backend developer with 3 years of experience building REST APIs in Python and Django.

EXPERIENCE
Software Engineer, Bitwise Labs
Jun 2022 - Present
- Built REST APIs in Python and Django used by a 12-person engineering team
- Reduced deployment time by 30% through CI/CD improvements
- Wrote unit tests, raising coverage from 40% to 70%

EDUCATION
B.Tech Computer Science, VIT Vellore, 2018 - 2022

SKILLS
Python, Django, PostgreSQL, Docker, Git, REST APIs, AWS

CERTIFICATIONS
AWS Certified Developer, AWS, 2023
"""

# A JD pasted as a plain paragraph, the way most people copy a JD straight
# off LinkedIn/Naukri — no leading "-•*" bullets, no regex-friendly "X
# years" phrase, but unambiguous, real requirements in prose.
CLEAN_JD_TEXT_PARAGRAPH = """Backend Engineer — Acme Fintech

We are looking for a backend engineer with strong Python and Django
experience to join our platform team. You should be comfortable with
PostgreSQL, Docker, and AWS, and hold a Bachelor's degree in Computer
Science or a related field. You will design and build REST APIs for our
payments platform, own services end to end, and collaborate closely with
product and design. Bengaluru based, hybrid."""

# The same role, pasted WITH bullets — the more common real-world shape for
# JDs on job boards. This is the shape that produces the lowest observed
# score (see docs/ATS_SCORE_DISCREPANCY_20_VS_78_80.md) because it gives
# the heuristic JD parser bullet lines to put into `responsibilities`
# (making the `responsibility` category *applicable*), but those lines are
# really REQUIREMENTS, not day-to-day responsibilities — scored against the
# resume's bullets via crude token-overlap, `responsibility` lands near
# zero and, because almost every other category is excluded, carries most
# of the redistributed weight.
CLEAN_JD_TEXT_BULLETED = """Backend Engineer — Acme Fintech

Requirements:
- 3+ years of experience with Python and Django
- Strong understanding of REST API design
- Experience with PostgreSQL and Docker
- Familiarity with AWS
- Bachelor's degree in Computer Science or related field

Responsibilities:
- Design and build REST APIs for our payments platform
- Own services end to end in production
- Collaborate with product and design on new features
- Write tests and participate in code review
"""


def _sync(coro):
    return asyncio.run(coro)


# ── Part 1 — the heuristic fallbacks themselves, in isolation ──────────────

def test_resume_heuristic_fallback_extracts_structured_sections():
    """FIXED (Phase F1) — was `..._discards_structured_sections_KNOWN_GAP`:
    `_heuristic_parse()` used to return every structured field empty for
    this input despite CLEAN_RESUME_TEXT having clearly labeled EXPERIENCE/
    EDUCATION/SKILLS/CERTIFICATIONS sections with real content. It now
    actually extracts them by splitting on recognized section headings.
    This was the single biggest contributor found in
    docs/ATS_SCORE_DISCREPANCY_20_VS_78_80.md — see
    docs/ATS_CASE_STUDY_POOJA_SCORE_20_FIX.md for the fix itself.
    """
    result = resume_parser._heuristic_parse(CLEAN_RESUME_TEXT)
    assert result["parsed_by"] == "heuristic"

    assert "aarav sharma" in result["raw_text"].lower()
    assert result["bullets"], "bullet lines should still be captured"
    assert "built" in result["action_verbs"]

    assert result["skills"] == ["Python", "Django", "PostgreSQL", "Docker", "Git", "REST APIs", "AWS"]
    assert result["hard_skills"] == result["skills"]  # none of these are soft-skill terms
    assert len(result["experience"]) == 1
    exp = result["experience"][0]
    assert "bitwise labs" in (exp["title"] + " " + exp["company"]).lower()
    assert exp["duration"] == "Jun 2022 - Present"
    assert len(exp["bullets"]) == 3
    assert len(result["education"]) == 1
    assert "b.tech" in result["education"][0]["degree"].lower()
    assert result["certifications"], "should have extracted the AWS Certified Developer line"
    assert result["keywords"], "keywords should be built from the real extracted skills/certs/titles"
    assert result["total_experience_years"] == 4.0  # Jun 2022 -> Present, career span


def test_jd_heuristic_fallback_discards_requirements_KNOWN_GAP():
    """KNOWN GAP — same failure mode as the resume side. A JD pasted as a
    plain paragraph (no bullets) yields ZERO extracted responsibilities too
    — `_heuristic_parse()` only pulls bullet-prefixed lines into
    `responsibilities`, so a paragraph-style JD (extremely common — most
    people paste JDs straight from LinkedIn/Naukri without reformatting)
    produces a job dict with nothing usable at all except possibly
    `min_experience_years` when a plain "N years" phrase happens to appear.
    """
    result = job_parser._heuristic_parse(CLEAN_JD_TEXT_PARAGRAPH)
    assert result["parsed_by"] == "heuristic"
    assert result["raw_text"]

    # KNOWN GAP — real requirements are present in the prose (Python,
    # Django, PostgreSQL, Docker, AWS, Bachelor's degree) but none are
    # extracted because this fallback only understands bullet-prefixed lines.
    assert result["required_skills"] == []
    assert result["preferred_skills"] == []
    assert result["keywords"] == []
    assert result["certifications"] == []
    assert result["min_education"] is None
    assert result["responsibilities"] == []  # no "-•*" lines in this JD at all


# ── Part 2 — end-to-end: this is what actually reaches the user's score ────

def _force_ai_unavailable(monkeypatch):
    """Deterministic stand-in for "no AI key configured / provider call
    failed" — exactly what services/ats_engine/llm.py's chat_json()/
    embed_text() already do on any failure (they never raise, only return
    None). No network call is made by this test either way — both the
    structured-parse path (chat_json) and the embedding-similarity path
    (embed_text, imported by reference into similarity_service) are forced
    down, matching the fully-AI-unavailable case end to end."""
    async def _none(*args, **kwargs):
        return None
    monkeypatch.setattr(resume_parser, "chat_json", _none)
    monkeypatch.setattr(job_parser, "chat_json", _none)
    monkeypatch.setattr(similarity_service, "embed_text", _none)


def test_legacy_score_no_longer_collapses_to_formatting_alone_when_ai_unavailable(monkeypatch):
    """FIXED (Phase F1) — was `..._collapses_to_one_category_..._KNOWN_GAP`:
    same paragraph-JD scenario as before (AI parsing forced unavailable —
    the same silent state a missing/rate-limited/down AI provider puts a
    real production request into). Previously `experience` was excluded
    too (resume-side data was empty), leaving `weights_used == {"formatting":
    100.0}`. Now that the resume heuristic parser extracts real experience
    data, `experience` becomes applicable and usable — `responsibility`
    stays excluded (the JD side has no bullets to build responsibilities
    from at all; JobParser's heuristic fallback is unchanged, out of scope
    for Phase F1), and `keyword`/`skills`/`education`/`certifications` stay
    excluded too (JD-side gap, also unchanged/out of scope — see
    docs/ATS_SCORE_DISCREPANCY_20_VS_78_80.md).
    """
    _force_ai_unavailable(monkeypatch)
    resume = _sync(resume_parser.parse(CLEAN_RESUME_TEXT))
    job = _sync(job_parser.parse(CLEAN_JD_TEXT_PARAGRAPH))
    assert resume["parsed_by"] == "heuristic"
    assert job["parsed_by"] == "heuristic"

    result = _sync(ats_service.analyze(resume, job))

    excluded = set(result["excluded_categories"])
    assert excluded == {"keyword", "skills", "responsibility", "education", "certifications"}
    assert "experience" not in excluded
    assert result["category_analysis"]["experience"]["match"] == 100.0
    assert result["weights_used"] == {"experience": 80.0, "formatting": 20.0}
    assert result["overall_score"] >= 90  # was previously driven by formatting alone


def test_legacy_score_substantially_improved_once_experience_category_is_usable(monkeypatch):
    """FIXED (Phase F1) — was `..._crushed_by_misclassified_responsibility_
    category_KNOWN_GAP`: same bulleted-JD scenario (the shape that produced
    the LOWEST score, ~26, in the original investigation). The JD-side
    issue this test originally documented is UNCHANGED and out of scope
    here — the heuristic JD parser still puts REQUIREMENT lines into
    `responsibilities` (it can't distinguish a requirements list from a
    responsibilities list), and `responsibility` is still scored low by a
    crude token-overlap heuristic. What changed: `experience` is no longer
    excluded — it's now a real, high-scoring, real-weight category
    (resume-side fix), which pulls the overall score up substantially even
    though the JD-side `responsibility` miscalculation is still present.
    """
    _force_ai_unavailable(monkeypatch)
    resume = _sync(resume_parser.parse(CLEAN_RESUME_TEXT))
    job = _sync(job_parser.parse(CLEAN_JD_TEXT_BULLETED))
    assert resume["parsed_by"] == "heuristic"
    assert job["parsed_by"] == "heuristic"

    result = _sync(ats_service.analyze(resume, job))

    excluded = set(result["excluded_categories"])
    assert {"keyword", "skills", "education", "certifications"} <= excluded
    assert "experience" not in excluded
    assert result["category_analysis"]["experience"]["match"] == 100.0
    # responsibility is STILL crushed low (JD-side gap, unchanged) — but no
    # longer dominates the weight now that experience is also usable.
    assert result["category_analysis"]["responsibility"]["applicable"] is True
    assert result["category_analysis"]["responsibility"]["weight"] < 50.0
    assert result["overall_score"] >= 50  # was <40 (observed 26) before the fix


def test_legacy_score_does_not_collapse_when_ai_parsing_succeeds(monkeypatch):
    """Contrast case — proves the collapse above is attributable to the
    parse-fallback mechanism, not to the scoring formula itself. With a
    (fake, deterministic) successful AI parse of the SAME inputs, the
    normally-excluded categories become usable and the score is no longer
    driven by a single category."""
    async def _fake_resume_parse(prompt, max_tokens=2000):
        return {
            "full_name": "Aarav Sharma", "email": "aarav.sharma@example.com", "phone": "+91 90000 00000",
            "location": "Bengaluru, India", "job_title": "Software Engineer",
            "summary": "Backend developer with 3 years of experience building REST APIs in Python and Django.",
            "skills": ["Python", "Django", "PostgreSQL", "Docker", "Git", "REST APIs", "AWS"],
            "hard_skills": ["Python", "Django", "PostgreSQL", "Docker", "Git", "REST APIs", "AWS"],
            "soft_skills": [],
            "experience": [{"title": "Software Engineer", "company": "Bitwise Labs", "duration": "Jun 2022 - Present",
                             "bullets": ["Built REST APIs in Python and Django used by a 12-person engineering team",
                                         "Reduced deployment time by 30% through CI/CD improvements"]}],
            "projects": [],
            "education": [{"degree": "B.Tech Computer Science", "institution": "VIT Vellore", "year": "2022"}],
            "certifications": ["AWS Certified Developer"],
            "action_verbs": ["built", "reduced"],
            "keywords": ["Python", "Django", "PostgreSQL", "Docker", "AWS", "REST APIs"],
            "total_experience_years": 3,
        }

    async def _fake_job_parse(prompt, max_tokens=1800):
        return {
            "job_title": "Backend Engineer", "required_skills": ["Python", "Django", "PostgreSQL", "Docker", "AWS"],
            "preferred_skills": [], "responsibilities": ["Design and build REST APIs", "Own services end to end"],
            "min_experience_years": None, "min_education": "Bachelor's degree", "industry": "Fintech",
            "keywords": ["Python", "Django", "PostgreSQL", "Docker", "AWS", "REST APIs"],
            "technologies": ["Python", "Django", "PostgreSQL", "Docker", "AWS"], "certifications": [],
        }

    async def _no_embeddings(*args, **kwargs):
        return None

    monkeypatch.setattr(resume_parser, "chat_json", _fake_resume_parse)
    monkeypatch.setattr(job_parser, "chat_json", _fake_job_parse)
    monkeypatch.setattr(similarity_service, "embed_text", _no_embeddings)  # keep this test deterministic/offline

    resume = _sync(resume_parser.parse(CLEAN_RESUME_TEXT))
    job = _sync(job_parser.parse(CLEAN_JD_TEXT_PARAGRAPH))
    assert resume["parsed_by"] == "ai"
    assert job["parsed_by"] == "ai"

    result = _sync(ats_service.analyze(resume, job))
    excluded = set(result["excluded_categories"])
    assert not ({"keyword", "skills", "experience", "education"} <= excluded)
    assert result["overall_score"] >= 50


# ── Part 3 — v2 section recognition: emoji/icon-prefixed headings ──────────

ICON_HEADING_RESUME = """Aarav Sharma
aarav.sharma@example.com | +91 90000 00000

\U0001F9D1‍\U0001F4BC SUMMARY
Backend developer with 3 years of experience building REST APIs in Python and Django.

\U0001F4BC EXPERIENCE
Software Engineer, Bitwise Labs, Jun 2022 - Present
- Built REST APIs in Python and Django used by a 12-person engineering team

\U0001F393 EDUCATION
B.Tech Computer Science, VIT Vellore, 2018 - 2022

\U0001F6E0️ SKILLS
Python, Django, PostgreSQL, Docker, Git, REST APIs, AWS
"""


def test_section_recognizer_misses_emoji_prefixed_headings_KNOWN_GAP():
    """KNOWN GAP: `section_recognizer.recognize_sections()` requires an exact
    (stripped) match against its heading-variant table. A leading emoji/icon
    glyph — a common pattern in modern template exports — means the line
    never matches "summary"/"experience"/"education"/"skills" even though a
    human (and the legacy `text_metrics.formatting_score()` substring check)
    would clearly recognize these as standard section headings. This drives
    the v2 ATS Compatibility layer's `sections` category to 0/100 for a
    resume that actually has all four core sections."""
    from services.ats_engine import section_recognizer

    result = section_recognizer.recognize_sections(ICON_HEADING_RESUME)
    assert result["recognized_count"] == 0
    assert set(result["missing_core_sections"]) == {"summary", "experience", "education", "skills"}
