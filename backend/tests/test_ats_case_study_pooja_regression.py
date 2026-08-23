"""
Regression tests for docs/ATS_CASE_STUDY_POOJA_SCORE_20.md.

**Context:** a user reported a real uploaded resume ("Pooja Ranjeet Yadav" —
ERP Application Support / Product Support at Vigo Infotech, SmartERP
product, 12 experience bullets, 16 technical skills, 1 certification, a
second "Teacher / Private School / 4 Years" experience entry) scoring
20/100 on SahiCareer's ATS Checker, with the UI showing "0 standard section
headers detected", "Experience entries = 0", and every Job Match category
excluded, against a Target Job field containing only the words "ERP
Application Support" (a job title, not a JD).

**The exact PDF file was never available to this investigation** — see the
case study doc §2 for what was reconstructed from the user's description
and why. These tests originally split into three groups:

- **KNOWN_GAP** (now FIXED, Phase F1) — confirmed, deterministic defects in
  `ResumeParser._heuristic_parse()` and its downstream effects. See
  docs/ATS_CASE_STUDY_POOJA_SCORE_20_FIX.md — these tests were flipped from
  asserting the old broken behavior to asserting the corrected behavior,
  and are now regression guards against that fix regressing.
- **HYPOTHESIS** (unchanged, still open) — reproduces the specific
  *observed symptom* ("0 standard section headers detected", formatting
  collapsing toward ~20) under a constructed input simulating a plausible
  PDF-extraction artifact. Per the explicit Phase F1 instruction,
  `section_recognizer.py` was NOT touched this phase — this remains a
  separate, still-open investigation.
- One test group confirms a *correct, non-bug* behavior (title-only JD
  correctly excludes Job Match categories rather than scoring them zero) —
  included so this doesn't get "fixed" later under the mistaken belief it
  was ever broken.

`JobParser` (the JD side) and `section_recognizer.py` were explicitly OUT
of scope for Phase F1 and are unchanged — the HYPOTHESIS test and the
title-only-JD test still reflect that.
"""
import asyncio

from services.ats_engine import (
    resume_parser, job_parser, ats_service, section_recognizer, text_metrics,
    ats_intelligence_v2, resume_quality as resume_quality_engine, similarity_service, scoring,
)

# Reconstructed as literally as possible from the user's description.
# ASSUMPTIONS (flagged in the case study doc §2): exact EDUCATION and
# LANGUAGES content wasn't supplied — placeholders used, called out below.
POOJA_RESUME_TEXT_CLEAN = """Pooja Ranjeet Yadav

SUMMARY
ERP Application Support professional with hands-on experience in SmartERP product support, client communication, and functional testing.

EDUCATION
B.Com, Institution not specified, Year not specified

EXPERIENCE
ERP Application Support / Product Support
Vigo Infotech
15 April 2023 - Present
Product: SmartERP
- Application support
- Client support
- Support tickets
- ERP troubleshooting
- Requirement gathering
- Developer coordination
- UAT
- Functional testing
- Bug verification
- Regression testing
- Client communication
- User support

Teacher
Private School
4 Years

TECHNICAL SKILLS
ERP Application Support
SmartERP Product Support
Client Support & Communication
Ticket Management
Issue Troubleshooting
Requirement Gathering & Analysis
Functional Analysis
UAT & Functional Testing
Bug Identification & Verification
Regression Testing
Test Case Execution
Functionality Enhancement
Developer Coordination
User Training & Assistance
Problem Solving
Stakeholder Communication

CERTIFICATIONS
Software Testing Course - Certified

TECHNICAL EXPOSURE
ERP: SmartERP
Frontend: React.js
Backend: Node.js
Testing: Functional Testing, UAT, Bug Verification, Regression Testing
Support: Client Support, Ticket Resolution, Issue Analysis
Requirements: Requirement Gathering, Functional Analysis, Enhancement Requests

LANGUAGES
English, Hindi

TARGET ROLES
ERP Application Support
"""

# HYPOTHESIS input — same content, but every section heading is merged onto
# the same line as its first content line (no newline between them), and
# bullet markers are dropped — simulating a plausible pypdf extraction
# artifact for certain PDF templates/generators.
POOJA_RESUME_TEXT_HEADING_MERGED = """Pooja Ranjeet Yadav
SUMMARY ERP Application Support professional with hands-on experience in SmartERP product support, client communication, and functional testing.
EDUCATION B.Com, Institution not specified, Year not specified
EXPERIENCE ERP Application Support / Product Support
Vigo Infotech
15 April 2023 - Present
Product: SmartERP
Application support
Client support
Support tickets
ERP troubleshooting
Requirement gathering
Developer coordination
UAT
Functional testing
Bug verification
Regression testing
Client communication
User support
Teacher
Private School
4 Years
TECHNICAL SKILLS ERP Application Support, SmartERP Product Support, Client Support & Communication, Ticket Management
CERTIFICATIONS Software Testing Course - Certified
"""

TARGET_JOB_TITLE_ONLY = "ERP Application Support"  # exactly what the user's Target Job field contained


def _sync(coro):
    return asyncio.run(coro)


def _force_ai_unavailable(monkeypatch):
    """Deterministic stand-in for the user's own observed state
    ("Resume: heuristic (no AI key / call failed)", "JD: heuristic") — no
    network call is made by any test using this, and results can't flake
    on a live provider's rate limits (observed directly during this
    investigation — see the note on the title-only-JD test below)."""
    async def _none(*args, **kwargs):
        return None
    monkeypatch.setattr(resume_parser, "chat_json", _none)
    monkeypatch.setattr(job_parser, "chat_json", _none)
    monkeypatch.setattr(similarity_service, "embed_text", _none)


# ── FIXED (Phase F1) — resume heuristic parse now extracts structured
# content instead of discarding it ──────────────────────────────────────

def test_pooja_resume_heuristic_parse_extracts_structured_data():
    """FIXED — was `..._loses_structured_data_but_keeps_raw_evidence_KNOWN_GAP`.
    `_heuristic_parse()` now extracts real structure from this resume:
    2 experience entries (ERP Application Support / Product Support @
    Vigo Infotech; Teacher @ Private School), the education entry, all 16
    skills, and the certification — see
    docs/ATS_CASE_STUDY_POOJA_SCORE_20_FIX.md for the fix itself."""
    result = resume_parser._heuristic_parse(POOJA_RESUME_TEXT_CLEAN)
    assert result["parsed_by"] == "heuristic"

    raw_lower = result["raw_text"].lower()
    for evidence in ("vigo infotech", "smarterp", "erp application support", "software testing course"):
        assert evidence in raw_lower, f"{evidence!r} should still be present in raw_text"

    assert len(result["experience"]) == 2
    entry1, entry2 = result["experience"]
    assert entry1["title"] == "ERP Application Support / Product Support"
    assert entry1["company"] == "Vigo Infotech"
    assert entry1["duration"] == "15 April 2023 - Present"
    assert any("smarterp" in b.lower() for b in entry1["bullets"])
    assert entry2["title"] == "Teacher"
    assert entry2["company"] == "Private School"
    assert entry2["duration"] == "4 Years"

    assert len(result["education"]) == 1
    assert "b.com" in result["education"][0]["degree"].lower()

    assert len(result["skills"]) == 16
    assert result["certifications"] == ["Software Testing Course - Certified"]
    assert result["keywords"], "keywords should now be built from real extracted evidence"
    assert result["total_experience_years"] == 3.0

    # Bullets are still fully preserved — canonical source is now
    # experience[].bullets (12 real bullets + "Product: SmartERP" kept as
    # an extra evidence line rather than dropped).
    assert len(result["bullets"]) == 13


def test_pooja_end_to_end_experience_entries_and_profile_completeness_are_no_longer_falsely_zero(monkeypatch):
    """FIXED — was `..._are_falsely_zero_KNOWN_GAP`. End-to-end via
    ATSService.analyze(): the previously-reported UI symptoms ("No work
    experience entries found on the resume", Profile Completeness 0%
    across every dimension) no longer occur — the resume's real experience/
    education/skills/certifications are now visible to both the category
    analysis and Profile Completeness."""
    _force_ai_unavailable(monkeypatch)
    resume = _sync(resume_parser.parse(POOJA_RESUME_TEXT_CLEAN))
    job = _sync(job_parser.parse(TARGET_JOB_TITLE_ONLY))
    result = _sync(ats_service.analyze(resume, job))

    exp_cat = result["category_analysis"]["experience"]
    assert exp_cat["applicable"] is True
    assert exp_cat["match"] == 100.0  # title-only JD states no requirement — full match, not excluded
    assert "No work experience entries found on the resume." not in exp_cat["missing_evidence"]

    pc = result["profile_completeness"]
    assert pc["experience"] > 0 and pc["education"] > 0 and pc["skills"] > 0 and pc["certifications"] > 0
    # Profile Completeness is genuinely computed FROM the parsed resume
    # object (scoring.profile_completeness(resume), not a separate DB
    # field) — confirmed here: it now correctly reflects the real,
    # extracted data instead of inheriting zeros from the upstream gap.


# ── Baseline (NOT a gap) — section recognition works fine on clean text ────

def test_pooja_section_recognition_baseline_on_clean_text_is_not_the_bug():
    """Sanity baseline: SUMMARY/EDUCATION/EXPERIENCE/TECHNICAL SKILLS/
    CERTIFICATIONS are all real, already-supported heading variants (see
    section_recognizer.SECTION_VARIANTS) — on cleanly-formatted text (each
    heading alone on its own line), all 4 core sections ARE recognized.
    This proves the heading VOCABULARY isn't the problem — whatever caused
    the user's real "0 standard section headers detected" must be an
    extraction-shape issue (see the HYPOTHESIS test below), not a missing
    heading alias."""
    result = section_recognizer.recognize_sections(POOJA_RESUME_TEXT_CLEAN)
    assert result["recognized_count"] == 4
    assert result["missing_core_sections"] == []

    formatting = text_metrics.formatting_score(POOJA_RESUME_TEXT_CLEAN)
    assert formatting["score"] >= 80  # nowhere near the reported 20


# ── HYPOTHESIS — heading merged onto its content line reproduces the exact
# symptom string the user saw ────────────────────────────────────────────

def test_pooja_formatting_collapses_when_headings_merge_with_content_line_HYPOTHESIS():
    """HYPOTHESIS, not confirmed cause (real PDF unavailable — see case
    study doc §6): if this specific PDF's text extraction merges each
    section heading onto the same line as its first content (a real,
    documented pypdf behavior for some PDF generators/templates) AND drops
    bullet markers, `text_metrics.formatting_score()` reproduces the user's
    EXACT reported message — "0 standard section headers detected" — and
    the score collapses far below the clean-text baseline above. This
    doesn't prove what the user's PDF actually did; it proves this
    mechanism is real, available in the current code, and produces the
    identical symptom wording."""
    result = text_metrics.formatting_score(POOJA_RESUME_TEXT_HEADING_MERGED)
    assert "0 standard section headers detected" in result["note"]
    assert result["score"] < 70  # well below the >=80 clean-text baseline

    sections = section_recognizer.recognize_sections(POOJA_RESUME_TEXT_HEADING_MERGED)
    assert sections["recognized_count"] == 0


# ── FIXED (Phase F1, Fix 2) — Resume Quality now sees real bullets ─────────
# `resume_quality._all_bullets()` already read exclusively from
# `resume["experience"][*]["bullets"]` (confirmed while investigating —
# see docs/ATS_CASE_STUDY_POOJA_SCORE_20.md §5a) — it was never reading the
# WRONG field, the field it correctly reads from was simply always empty
# (Fix 1's bug). No change was needed in resume_quality.py itself; this
# test now confirms Fix 1 alone was sufficient to resolve it end to end.

def test_resume_quality_now_sees_real_bullets_via_experience_field():
    """FIXED — was `..._ignores_top_level_bullets_when_experience_is_empty_
    KNOWN_GAP`. Resume Quality's bullet-dependent categories now see the
    13 real bullets (12 original + "Product: SmartERP") attached to the
    first experience entry, and score them as genuine (non-fabricated)
    evidence — including correctly flagging that none of them are
    quantified, which is real, honest signal now that it's derived from
    real bullets instead of an artifact of empty data."""
    heuristic = resume_parser._heuristic_parse(POOJA_RESUME_TEXT_CLEAN)
    assert len(heuristic["experience"][0]["bullets"]) == 13
    assert len(heuristic["bullets"]) == 13  # top-level field mirrors experience[].bullets exactly

    quality = resume_quality_engine.analyze_resume_quality(heuristic)
    bullet_quality = quality["categories"]["bullet_quality"]
    quantified = quality["categories"]["quantified_impact"]

    assert bullet_quality["applicable"] is True
    assert bullet_quality["match"] is not None
    assert "Application support" in " ".join(bullet_quality["matched_evidence"])

    assert quantified["applicable"] is True
    # Honest, not fabricated: this resume's bullets genuinely have no
    # numbers in them, so 0 is the CORRECT reading now, not a data-loss
    # artifact — distinguishing "we can now see 0/13 are quantified" from
    # the old bug's "we can't see any bullets at all."
    assert quantified["match"] == 0.0
    assert len(quantified["missing_evidence"]) > 0


# ── Correct behavior (NOT a bug) — title-only JD is handled honestly ───────

def test_titleonly_job_description_excludes_job_match_categories_not_penalizes_them(monkeypatch):
    """Confirms Phase 8/12's expected behavior: a Target Job field
    containing only "ERP Application Support" (3 words, no requirements)
    correctly produces a job dict with no extractable
    skills/keywords/education/certifications — and the scoring engine
    EXCLUDES those categories (never scores them as a failing 0). This is
    the "never treat missing JD data as resume failure" rule working
    exactly as designed — must not be "fixed" by inventing JD content.

    AI forced unavailable here to match the user's own observed state
    ("JD: heuristic") deterministically. NOTE — ancillary observation made
    while writing this test: when the AI provider IS reachable, a bare
    3-word title sent to JobParser's LLM prompt can still come back with a
    populated `required_skills` list (observed directly against the real
    OpenAI endpoint during this investigation) — arguably in tension with
    the prompt's own "never invent requirements... only include what's
    clearly implied" instruction. That's a separate, not-yet-triaged
    observation; it did not occur in the user's reported case (their JD
    parse fell back to heuristic), so it isn't investigated further here.
    """
    _force_ai_unavailable(monkeypatch)

    job = _sync(job_parser.parse(TARGET_JOB_TITLE_ONLY))
    assert job["parsed_by"] == "heuristic"
    assert job["required_skills"] == [] and job["preferred_skills"] == []
    assert job["keywords"] == [] and job["certifications"] == [] and job["min_education"] is None

    # Even with a resume that DOES have real, matchable content (simulating
    # the parsing gap already fixed), a title-only JD must exclude — not
    # zero-score — every requirement-dependent category.
    resume_with_real_experience = {
        "skills": ["ERP Application Support", "SmartERP"], "hard_skills": ["SmartERP"], "soft_skills": [],
        "experience": [{"title": "ERP Application Support / Product Support", "company": "Vigo Infotech",
                         "duration": "15 April 2023 - Present", "bullets": ["Application support", "Client support"]}],
        "education": [{"degree": "B.Com", "institution": "X", "year": "2019"}],
        "certifications": ["Software Testing Course - Certified"], "keywords": ["ERP", "SmartERP"],
        "bullets": ["Application support", "Client support"], "total_experience_years": 3.0,
        "raw_text": "ERP Application Support Vigo Infotech SmartERP", "parsed_by": "ai",
    }
    result = _sync(ats_service.analyze(resume_with_real_experience, job))
    for key in ("keyword", "skills", "education", "certifications"):
        assert result["category_analysis"][key]["applicable"] is False
        assert result["category_analysis"][key]["match"] is None
    # Experience DOES have data on the resume side, so it's still scored —
    # a title-only JD sets no requirement, so it should read as a full match.
    assert result["category_analysis"]["experience"]["match"] == 100.0


def test_no_jd_ats_compatibility_is_computed_independently_of_missing_job_description(monkeypatch):
    """Phase 12: Resume ATS Health (v2 ATS Compatibility layer) must be
    computable with NO job description at all — confirms job=None doesn't
    drag ats_compatibility down or exclude it; only job_match (correctly)
    comes back None/excluded."""
    _force_ai_unavailable(monkeypatch)
    resume = _sync(resume_parser.parse(POOJA_RESUME_TEXT_CLEAN))
    result = ats_intelligence_v2.compute_full_analysis(resume, None)
    assert result["layers"]["job_match"] is None
    assert "job_match" in result["excluded_layers"]
    assert result["layers"]["ats_compatibility"] is not None
    assert result["ats_compatibility"]["score"] >= 80  # clean text — should score well independent of any JD


# ═══════════════════════════════════════════════════════════════════════════
# PHASE F1 — explicit regression checklist (docs/ATS_CASE_STUDY_POOJA_
# SCORE_20_FIX.md §"Regression tests"). One small, focused test per
# requested point, even where a broader test above already exercises the
# same code path — kept separate for direct traceability back to the
# fix request. Point 18 ("existing ATS tests continue to pass") is not a
# unit test here; it's validated by running the full suite — see the fix
# report for those results.
# ═══════════════════════════════════════════════════════════════════════════

def _pooja_heuristic():
    return resume_parser._heuristic_parse(POOJA_RESUME_TEXT_CLEAN)


def test_checklist_1_heuristic_parser_extracts_experience():
    assert len(_pooja_heuristic()["experience"]) == 2


def test_checklist_2_vigo_infotech_is_detected():
    entry = _pooja_heuristic()["experience"][0]
    assert entry["company"] == "Vigo Infotech"


def test_checklist_3_erp_application_support_is_detected():
    entry = _pooja_heuristic()["experience"][0]
    assert "ERP Application Support" in entry["title"]
    assert any("erp application support" == s.lower() for s in _pooja_heuristic()["skills"])


def test_checklist_4_smarterp_is_detected():
    entry = _pooja_heuristic()["experience"][0]
    assert any("smarterp" in b.lower() for b in entry["bullets"])


def test_checklist_5_experience_bullets_greater_than_zero():
    entry = _pooja_heuristic()["experience"][0]
    assert len(entry["bullets"]) > 0


def test_checklist_6_education_is_detected():
    assert len(_pooja_heuristic()["education"]) > 0


def test_checklist_7_mcom_is_detected():
    """Standalone case explicitly named in the fix request — a resume
    section containing ONLY the word "M.Com" must preserve it as the
    degree, exactly as-is, with no institution/year fabricated."""
    result = resume_parser._heuristic_parse("EDUCATION\nM.Com\n\nSKILLS\nExcel\n")
    assert result["education"] == [{"degree": "M.Com", "institution": "", "year": ""}]


def test_checklist_8_skills_greater_than_zero():
    assert len(_pooja_heuristic()["skills"]) > 0


def test_checklist_9_certifications_greater_than_zero():
    assert len(_pooja_heuristic()["certifications"]) > 0


def test_checklist_10_languages_greater_than_zero():
    assert len(_pooja_heuristic()["languages"]) > 0


def test_checklist_11_keywords_greater_than_zero():
    assert len(_pooja_heuristic()["keywords"]) > 0


def test_checklist_12_experience_bullets_field_contains_real_bullets():
    entry = _pooja_heuristic()["experience"][0]
    assert "Application support" in entry["bullets"]
    assert "Regression testing" in entry["bullets"]


def test_checklist_13_resume_quality_sees_those_bullets():
    heuristic = _pooja_heuristic()
    quality = resume_quality_engine.analyze_resume_quality(heuristic)
    assert quality["categories"]["bullet_quality"]["applicable"] is True
    assert quality["categories"]["bullet_quality"]["match"] is not None


def test_checklist_14_profile_completeness_no_longer_falsely_zero(monkeypatch):
    _force_ai_unavailable(monkeypatch)
    resume = _sync(resume_parser.parse(POOJA_RESUME_TEXT_CLEAN))
    pc = scoring.profile_completeness(resume)
    assert pc["overall"] > 0
    assert pc["experience"] > 0
    assert pc["education"] > 0
    assert pc["skills"] > 0
    assert pc["certifications"] > 0


def test_checklist_15_ai_parser_failure_does_not_produce_an_empty_resume(monkeypatch):
    _force_ai_unavailable(monkeypatch)
    resume = _sync(resume_parser.parse(POOJA_RESUME_TEXT_CLEAN))
    assert resume["parsed_by"] == "heuristic"
    assert resume["experience"] and resume["education"] and resume["skills"] and resume["certifications"]


def test_checklist_16_no_fabricated_information_is_introduced():
    """Every extracted string must trace back to the raw input text — the
    fix must never invent a skill, company, or date that isn't literally
    present in raw_text."""
    result = _pooja_heuristic()
    raw_lower = result["raw_text"].lower()
    for skill in result["skills"]:
        assert skill.lower() in raw_lower
    for entry in result["experience"]:
        if entry["company"]:
            assert entry["company"].lower() in raw_lower
        if entry["title"]:
            assert entry["title"].lower() in raw_lower
    for cert in result["certifications"]:
        assert cert.lower() in raw_lower


def test_checklist_17_no_jd_analysis_still_works(monkeypatch):
    _force_ai_unavailable(monkeypatch)
    resume = _sync(resume_parser.parse(POOJA_RESUME_TEXT_CLEAN))
    result = ats_intelligence_v2.compute_full_analysis(resume, None)
    assert result["score"] is not None
    assert result["mode"] == "no_jd"
    assert result["layers"]["job_match"] is None  # correctly absent, not zero
