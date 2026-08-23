# ATS Phase 3 — Pre-Phase-B Backup Reference

**Purpose:** a snapshot of exactly what the ATS scoring system looked like immediately **before** Phase B (ATS Intelligence 2.0) began, so any Phase B change can be understood, compared against, or rolled back with a clear "what it used to be." This document does not get updated as Phase B progresses — it's a fixed point-in-time reference. See [ATS_CHANGELOG.md](ATS_CHANGELOG.md) for what actually changed and when.

**Nothing described in this document was deleted or modified by Phase B.** Per Phase B decision 3, the entire system below remains live, unchanged, and is still what `overall_score` (the UI headline) is computed from.

---

## 1. Scoring engine at this snapshot

**Canonical Match/Completeness/Confidence model** — `backend/services/ats_engine/scoring.py`, unchanged since Phase 3 (this session, 2026-08-11):

```python
CATEGORY_WEIGHTS = {
    "keyword": 25.0, "skills": 20.0, "experience": 20.0, "responsibility": 15.0,
    "education": 10.0, "certifications": 5.0, "formatting": 5.0,
}
```

7 categories, each returning `{match, completeness, confidence, applicable, matched_evidence, missing_evidence, reason, weight}`. Confidence thresholds:
```
no signal          → low
completeness ≥ 70   → high
completeness ≥ 35   → medium
completeness < 35   → low
```

Weight redistribution: categories that are `applicable=False` or have `match=None` are excluded and their weight is redistributed proportionally across the remaining usable categories — never scored as zero.

**Legacy 9-dimension blended score** — `backend/services/ats_engine/ats_service.py`, present since 2026-08-04, kept as `legacy_overall_score`:
```python
_WEIGHTS = {
    "keyword_match": 0.20, "required_skills_match": 0.20, "experience_match": 0.15,
    "education_match": 0.10, "industry_match": 0.10, "semantic_similarity": 0.10,
    "formatting_score": 0.05, "readability_score": 0.05, "recruiter_readiness": 0.05,
}
```

**Even-older legacy engine** — `backend/services/ats.py`, frozen since Phase 3, still backs `ai-upgrade`, the resume editor, and `job-match`. Untouched by both Phase 3 and Phase B.

## 2. Keyword matching at this snapshot

`backend/services/ats_engine/keyword_engine.py::match_lists()` — the ONLY keyword/skills/certifications matcher in the system at this snapshot. Match rule: exact substring in resume text, OR `rapidfuzz.fuzz.token_set_ratio(term, resume_item) ≥ 85`.

**Documented bug, verified empirically before any Phase B code was written:**
```
fuzz.token_set_ratio("react", "react native") == 100.0   →  falsely counted as a match
fuzz.token_set_ratio("js", "javascript")      == 33.3    →  falsely counted as NOT a match (below the 85 threshold)
fuzz.token_set_ratio("aws", "amazon web services") == 18.2  →  falsely counted as NOT a match
```
No alias/synonym table existed at all. This is the exact defect Phase B decisions 8/9 required fixing — see [ATS_CHANGELOG.md](ATS_CHANGELOG.md) for the fix, delivered as a **new, parallel** matcher (`keyword_aliases.py`) rather than a modification to this function — `keyword_engine.match_lists()` itself is byte-for-byte unchanged by Phase B and still drives the 7-category model above.

## 3. What did NOT exist at this snapshot

- No Parsing Rate engine — only one coarse composite (`text_metrics.formatting_score()`) conflating parsing quality with formatting risk.
- No Section Recognition engine with heading-variant tolerance — only an 8-word fixed substring check inside `formatting_score()`.
- No Location matching category.
- No Resume Quality engine (bullet quality, quantified impact, action verbs, skill evidence, career progression, recruiter signals) — none of Parts 15–22 of the product spec existed in any form.
- No centralized scoring-weight configuration file — every weight was a module-level constant scattered across `scoring.py` and `ats_service.py`.
- No scoring-engine version constant or field on `AtsReport`.
- No AI apply/reparse/score-delta loop, and no table to log one.
- No dual-score output — one score (`overall_score`) was the only headline number; `legacy_overall_score` existed but was not benchmarked against anything new.

## 4. Database at this snapshot

`ats_reports` table (27 columns, all from Phase 3 or earlier) — see [PHASE_3_ATS_INTELLIGENCE.md](PHASE_3_ATS_INTELLIGENCE.md) §5 for the full column list. No `scoring_engine_version` column. No `ats_change_history` table existed.

## 5. API surface at this snapshot

| Route | Returns |
|---|---|
| `POST /api/ats/v2/analyze` | ephemeral, paste-text |
| `POST /api/ats/v2/analyze-resume` | persisted, resume_id-based |
| `GET /api/ats/v2/history/{resume_id}` | report history + trend |
| `GET /api/ats/v2/report/{report_id}` | full report detail |
| `POST /api/ats/v2/tailor` | JD-tailored resume generation |

Every one of these routes' response shape at this snapshot is exactly what [PHASE_3_ATS_INTELLIGENCE.md](PHASE_3_ATS_INTELLIGENCE.md) §6 documents. Phase B added fields to some of these responses (additively) — see the changelog for exactly which.

## 6. Affected files (the exact set Phase B was about to touch)

`backend/services/ats_engine/ats_service.py`, `backend/routers/ats_engine.py`, `backend/models.py` — these three files were modified by Phase B (additively — see changelog for the diffs' nature, not full replacement). Every other file in `services/ats_engine/` existed exactly as described in [PHASE_3_ATS_INTELLIGENCE.md](PHASE_3_ATS_INTELLIGENCE.md) and was either left untouched (`scoring.py`, `keyword_engine.py`, `resume_parser.py`, `job_parser.py`, `similarity_service.py`, `recommendation_engine.py`, `resume_improver.py`, `text_metrics.py`, `llm.py`) or is new (see changelog).

## 7. How to roll back to this snapshot

1. Revert `backend/services/ats_engine/ats_service.py`, `backend/routers/ats_engine.py`, and `backend/models.py` to their Phase-3 state (the "add v2 dual score" hunks are additive and clearly marked with `# ── Phase B` comments — removing them fully restores this snapshot's behavior).
2. Delete (or simply stop importing) the new files: `ats_config.py`, `ats_intelligence_v2.py`, `keyword_aliases.py`, `parsing_quality.py`, `section_recognizer.py`.
3. The `scoring_engine_version` column on `ats_reports` and the new `ats_change_history` table are additive/nullable — they do **not** need to be dropped for the application to keep working if rolled back; they'd simply become unused.
4. No data migration is needed either direction — nothing in this snapshot's data shape was altered.
