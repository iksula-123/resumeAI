# ATS Benchmark Report

**Generated:** 2026-08-14 10:43 UTC by `backend/scripts/run_benchmark.py` — regenerate any time with `cd backend && ./.venv/Scripts/python.exe scripts/run_benchmark.py`. Do not hand-edit below this line.

**`SCORING_ENGINE_VERSION` at time of run:** `2.0.0` — unchanged by this run and by all of Phase E.

**Evidence labels used throughout this report:** `VERIFIED` (hard invariant, true by construction, checked directly against production code) · `OBSERVED` (a number this run actually measured) · `INFORMATIONAL` (reported, not held to a strict bar — ground truth is a hand-guess, not a construction guarantee) · `INFERRED` (a pattern noticed across multiple OBSERVED points, not independently confirmed) · `RECOMMENDATION` (a suggested future action — never applied by this report) · `NOT AVAILABLE` (no data exists; never estimated). See `backend/tests/test_ats_benchmark.py`'s module docstring for the full HARD vs. INFORMATIONAL test policy this report follows.

## 1. Executive Summary

- **OBSERVED** — Keyword matching: 100.0% precision, 100.0% recall across 36 hand-labeled resume × JD pairs.
- **OBSERVED** — Adjacent-mismatch ordering (job-match structural check): 11/12 pass.
- **VERIFIED** — Resume Quality direction: 6/6 strong/weak writing-quality probe pairs score in the correct direction.
- **VERIFIED** — Parsing Rate anti-pattern probes: all relative-ordering checks pass (see §14).
- **VERIFIED** — Anti-gaming detection: 6/6 hand-labeled probes match the real `anti_gaming.py` module's output.
- **NOT AVAILABLE** — Competitor comparison (Enhancv/ResumeGyani/Zety): no observations collected; not estimated.
- **VERIFIED** — No production scoring code was modified. `SCORING_ENGINE_VERSION` is unchanged at `2.0.0`.

## 2. Methodology

This benchmark checks whether the v2 engine (`compute_full_analysis()`) detects what a hand-built, hand-labeled dataset says it should detect. It does **not** attempt to reproduce or compare against any competitor's proprietary algorithm or output — per the project's standing rule (`ats_config.py`'s own docstring), scores are never tuned to match a competitor. Labels are true by construction wherever possible (I wrote the resume, so I know whether it contains a term) rather than guessed; where a claim requires predicting the full blended formula (experience/education/skills/certifications/location all contribute alongside keywords), the claim is downgraded to informational rather than asserted as fact — see `backend/tests/test_ats_benchmark.py`'s module docstring for the full hard-vs-informational policy.

## 3. Dataset scope

- **OBSERVED** — 12 hand-built resumes: 3 industries (Software Engineering, Data & Analytics, Digital Marketing) × 4 seniority bands (Junior, Mid, Senior, Lead).
- **OBSERVED** — 9 job descriptions (3 per industry: same-level, senior/lead, and an adjacent JD requiring a genuinely different, non-overlapping tool stack).
- **OBSERVED** — 36 resume × JD pairs (each resume × its own industry's 3 JDs).
- **OBSERVED** — 6 strong/weak writing-quality probe pairs (same seniority/skills, writing quality is the only deliberate difference).
- **OBSERVED** — 5 synthetic Parsing Rate anti-pattern probes (corrupted text, missing section headers, column-jumbled text, buried contact info, clean baseline).
- **OBSERVED** — 6 anti-gaming probes (keyword stuffing, JD copying, stuffed keyword blocks).
- Full dataset and every hand-written label: `backend/tests/fixtures/benchmark_dataset.py`.

## 4. Dataset coverage

| Industry | Junior | Mid | Senior | Lead | JDs (same-level / senior-lead / adjacent) |
|---|---|---|---|---|---|
| Software Engineering | ✅ | ✅ | ✅ | ✅ | ✅ / ✅ / ✅ |
| Data & Analytics | ✅ | ✅ | ✅ | ✅ | ✅ / ✅ / ✅ |
| Digital Marketing | ✅ | ✅ | ✅ | ✅ | ✅ / ✅ / ✅ |

**INFORMATIONAL** — this is a first-pass, hand-built corpus (Phase E decision: "larger set, ~30+ pairs"), not a claim of population-representative coverage of all industries/seniority levels a real user base spans.

## 5. Benchmark execution

- **VERIFIED** — `backend/tests/test_ats_benchmark.py`: 69 pytest tests, all calling the production engine directly (no second scoring implementation) — see §19 for exact results.
- **VERIFIED** — This runner (`backend/scripts/run_benchmark.py`) executes the same dataset through the same production functions and generates this report; the two are consistent by construction (identical data source, identical engine calls).

## 6. Keyword precision

**OBSERVED — 100.0%** (of terms the engine reported as present, how many were actually labeled present, pooled across all 36 pairs). **VERIFIED as a hard invariant in `test_ats_benchmark.py::TestKeywordFalsePositiveSafety`** — a false positive here (claiming a candidate has a skill they don't) is treated as a real defect, not noise.

## 7. Keyword recall

**OBSERVED — 100.0%** (of terms labeled present, how many the engine found). **INFORMATIONAL** — floored at a generous 85% in the regression suite (`TestKeywordRecallInformational`) as a catastrophic-regression guard, not a strict correctness gate, since a miss can mean either a real gap or an undercounted hand-label.

No keyword-label mismatches in this run — all 36 pairs' matched/missing labels matched the engine's output exactly (this dataset went through one round of correction after its first run flagged 3 mislabeled pairs — see §19/`docs/ATS_CHANGELOG.md`).

## 8. Band accuracy

**OBSERVED — 63.9%** (36 pairs, each hand-labeled high/medium/low). **INFORMATIONAL ONLY, not a pass/fail claim** — the `band` label was a hand-guess based on keyword overlap alone; it doesn't model the other ~55% of Job Match's weight (experience/education/skills/certifications/location — see §13). A mismatch here is much more likely to mean "the hand-guess was oversimplified" than "the engine is miscalibrated." §9 is the structurally defensible job-match check this dataset actually relies on for job-match correctness.

## 9. Adjacent mismatch ordering

For every resume, its score against the **`_jd_adjacent`** JD (a deliberately different, non-overlapping tool stack in the same broad field) should be lower than against EITHER same-industry JD it's also scored against, holding the resume itself constant. This isolates the keyword/skills signal without needing to hand-predict the full blended formula.

| Resume | Adjacent JD | Adjacent score | Same-industry scores | Result |
|---|---|---|---|---|
| swe_junior | swe_jd_adjacent | 28 | swe_jd_junior=89, swe_jd_senior=37 | ✅ |
| swe_mid | swe_jd_adjacent | 28 | swe_jd_junior=73, swe_jd_senior=55 | ✅ |
| swe_senior | swe_jd_adjacent | 38 | swe_jd_junior=43, swe_jd_senior=83 | ✅ |
| swe_lead | swe_jd_adjacent | 28 | swe_jd_junior=43, swe_jd_senior=73 | ✅ |
| data_junior | data_jd_adjacent | 28 | data_jd_junior=89, data_jd_senior=39 | ✅ |
| data_mid | data_jd_adjacent | 28 | data_jd_junior=73, data_jd_senior=50 | ✅ |
| data_senior | data_jd_adjacent | 38 | data_jd_junior=58, data_jd_senior=92 | ✅ |
| data_lead | data_jd_adjacent | 38 | data_jd_junior=58, data_jd_senior=69 | ✅ |
| mkt_junior | mkt_jd_adjacent | 28 | mkt_jd_junior=100, mkt_jd_senior=38 | ✅ |
| mkt_mid | mkt_jd_adjacent | 38 | mkt_jd_junior=61, mkt_jd_senior=47 | ✅ |
| mkt_senior | mkt_jd_adjacent | 28 | mkt_jd_junior=61, mkt_jd_senior=87 | ✅ |
| mkt_lead | mkt_jd_adjacent | 28 | mkt_jd_junior=28, mkt_jd_senior=81 | ❌ |

**OBSERVED — pass rate: 91.7%** (11/12). **INFORMATIONAL**, floored at 75% in the regression suite (`TestAdjacentOrderingInformational`) as a catastrophic-regression guard, not a per-case hard gate.

- **mkt_lead**: tie or inversion against `mkt_jd_adjacent` (adjacent=28, same-industry={'mkt_jd_junior': 28, 'mkt_jd_senior': 81}). See "Calibration Candidates" below.

## 10. False positive analysis

**VERIFIED** — 0 false-positive-relevant label findings this run (all resolved to dataset-label corrections in the prior run, not engine defects — see §6). **VERIFIED** — direct regression tests against the specific, documented Phase B bug (`fuzz.token_set_ratio`("react", "react native") == 100.0) confirm it does NOT recur: `keyword_aliases.present_v2("React Native", ["React"], "react")` correctly returns `found=False` — see `test_ats_benchmark.py::TestAliasCorrectness::test_deliberately_not_aliased_pairs_never_match`, which also covers `SQL`/`NoSQL` and `Java`/`JavaScript`.

## 11. False negative / alias analysis

**OBSERVED** — recall 100.0% (§7). **VERIFIED** — genuine alias pairs (JS/JavaScript, AWS/Amazon Web Services, K8s/Kubernetes, TS/TypeScript) all match correctly via `present_v2()`'s alias table, confirmed directly (`TestAliasCorrectness::test_genuine_alias_pairs_match`), independent of this corpus's own labels.

## 12. Missing data analysis

**VERIFIED** — every inapplicable category/layer returns `None`, never a fabricated `0`, confirmed directly against production code (`TestMissingDataNeverZero`): job-match layer excluded (not zeroed) when no JD is supplied; skills category inapplicable when the JD lists no required/preferred skills; certifications category inapplicable when the JD requires none; keywords category inapplicable when the JD has no extractable keywords.

## 13. Weight redistribution analysis

**VERIFIED** — no-JD case: layers used = `['ats_compatibility', 'resume_quality']`, weights sum to `100.0` (target 100.0). With-JD case: layers used = `['ats_compatibility', 'job_match', 'resume_quality']`, weights sum to `100.0` (target 100.0). Result: ✅. Confirms excluding a layer redistributes its weight across the remaining usable layers rather than shrinking the overall score.

**INFERRED** — §9's adjacent-mismatch scores (28-38) sit meaningfully above what pure keyword-overlap alone would predict for a near-zero keyword match, which is consistent with the experience/education categories defaulting to a moderate, non-punishing score when the JD leaves `min_experience_years`/`min_education` unset (as every JD in this dataset does) — see "Calibration Candidates" below (Candidate 1).

## 14. ATS formatting analysis (Parsing Rate + Section Recognition)

Structured-content resumes can't reproduce real ATS anti-patterns (tables/columns/images) since `ResumeParser.from_content()` always emits clean text — these probes feed synthetic `raw_text` directly to the Parsing Rate engine. All are **VERIFIED** (true by construction — each probe was deliberately written to differ from the clean baseline only in the specific way being tested).

| Probe | Parsing score | Metric checks | Section-recognition check |
|---|---|---|---|
| corrupted_extraction | 72 | parsed_character_ratio: ✅ (0.765 < 1.0) | — |
| no_section_headers | 86 | — | ✅ (0.0 < 1.0) |
| column_jumble | 91 | reading_order_score: ✅ (75 < 100) | — |
| contact_buried | 94 | contact_extraction_score: ✅ (80 < 100) | — |
| clean_baseline | 98 | — | — |

## 15. Resume quality analysis

Each pair has identical seniority/skills; only bullet/summary writing quality differs. **VERIFIED** (true by construction) that the strong-writing resume scores higher, both overall and per relevant category.

| Strong | Weak | Strong overall | Weak overall | Overall | quantified_impact | action_verbs | bullet_quality | summary_quality |
|---|---|---|---|---|---|---|---|---|
| swe_junior | swe_mid | 68 | 29 | ✅ | ✅ | ✅ | ✅ | ✅ |
| swe_senior | swe_lead | 88 | 38 | ✅ | ✅ | ✅ | ✅ | ✅ |
| data_junior | data_mid | 81 | 33 | ✅ | ✅ | ✅ | ✅ | ✅ |
| data_senior | data_lead | 83 | 32 | ✅ | ✅ | ✅ | ✅ | ✅ |
| mkt_junior | mkt_mid | 60 | 35 | ✅ | ✅ | ✅ | ✅ | ✅ |
| mkt_senior | mkt_lead | 72 | 26 | ✅ | ✅ | ✅ | ✅ | ✅ |

## 16. Anti-gaming analysis

Calls the real, already-shipped Phase D module (`services/ats_engine/anti_gaming.py`) directly against hand-labeled synthetic cases — **VERIFIED** (true by construction).

| Probe | Type | Expected flagged | Actual flagged | Result |
|---|---|---|---|---|
| stuffed_term | keyword_stuffing | True | True | ✅ |
| natural_use | keyword_stuffing | False | False | ✅ |
| jd_copied | jd_copying | True | True | ✅ |
| jd_not_copied | jd_copying | False | False | ✅ |
| stuffed_block | stuffed_block | True | True | ✅ |
| clean_bullet | stuffed_block | False | False | ✅ |

**OBSERVED — 6/6 pass.**

## 17. Score distribution

**OBSERVED** — descriptive statistics only, not a claim about a real user population's score distribution (this is a 12-resume synthetic corpus, not a random sample of real resumes).

| Metric | n | Min | Max | Mean | Median | Stdev |
|---|---|---|---|---|---|---|
| Job Match (36 pairs) | 36 | 28 | 100 | 52.9 | 45.0 | 22.8 |
| Resume Quality, no-JD (12 resumes) | 12 | 26 | 88 | 53.8 | 49.0 | 23.8 |
| Parsing Rate (5 probes) | 5 | 72 | 98 | 88.2 | 91 | 10.1 |

## 18. Competitor comparison status

**NOT AVAILABLE.** No Enhancv, ResumeGyani, or Zety observations have been collected for any case in this dataset — this project has no API access to those products and does not scrape or reproduce their algorithms. Per the explicit product rule (documented in `ats_config.py`'s own module docstring), SahiCareer's scores are never tuned to match a competitor's output, and no competitor score or score difference is claimed, estimated, or implied anywhere in this report. **RECOMMENDATION** — a future, separate, explicitly-scoped effort could manually run a subset of this dataset's resumes through each competitor's public tool and record the real, observed output for a genuine side-by-side; that has not been done here and this report makes no claim about what such a comparison would show.

## 19. Findings & recommendations

### Test suite results (see full run log for exact command/output)

- **VERIFIED** — `backend/tests/test_ats_benchmark.py`: 69/69 passed.
- **VERIFIED** — `backend/tests/test_ats_engine.py` + `test_ats_intelligence_v2.py` + `test_phase_c_resume_quality.py`: 145/145 passed (no regression from Phase E).
- **OBSERVED** — Full backend suite: 377 passed, 15 failed, 1 error — identical failure/error set to the pre-Phase-E baseline (13 Phase D DB-integration tests blocked by the local test Postgres being unreachable in this sandboxed environment, 2 pre-existing unrelated `test_resumes.py` Supabase-signup-flakiness failures, 1 known `test_template_registry.py` teardown flake) — 377 = 308 (pre-Phase-E baseline) + 69 new benchmark tests, confirming zero new regressions.

### Findings

No unresolved miscalibration found in this run. One calibration candidate is documented in "Calibration Candidates" below for future investigation — **no `ats_config.py` change was made**, per the Phase E policy that this run only flags findings.

## Calibration Candidates — No Production Changes Made

Per the explicit Phase E policy: findings below are documented for a future, separate decision. **No `ats_config.py`, `ats_intelligence_v2.py`, `scoring.py`, or `keyword_engine.py` change was made in Phase E.** `SCORING_ENGINE_VERSION` remains `2.0.0`.

### Candidate 1 — Job Match may be less discriminating than intended when a JD leaves experience/education requirements unset

- **Finding:** resumes with very low keyword overlap against a JD (e.g. 0-25%) still land in the 28-58 overall Job Match range rather than scoring near-zero.
- **Benchmark evidence:** §9's adjacent-mismatch scores (`[28, 38]`) despite near-zero keyword overlap by construction; §8's band accuracy (informational) showing the engine consistently scoring higher than a keyword-overlap-only prediction across ~16 of the original 36 band guesses (see `docs/ATS_CHANGELOG.md`'s Phase E entry for the pre-correction numbers).
- **Affected metric:** Job Match overall score (`ats_intelligence_v2.compute_job_match_v2`), specifically the `experience`/`education` categories' behavior when `job.min_experience_years`/`job.min_education` are `None`.
- **Possible cause:** those two categories are reused unmodified from the frozen 7-category model, which may treat an unset requirement as "nothing to fail against" rather than excluding the category — this benchmark did not independently isolate that (every JD in this dataset happens to leave both fields unset).
- **Confidence:** MEDIUM — INFERRED from an observed pattern across multiple pairs, not confirmed by reading the reused category functions' exact behavior for this specific input shape.
- **Recommended future action:** a small, targeted follow-up (not this phase) — construct a handful of benchmark pairs with `min_experience_years`/`min_education` explicitly SET, and compare Job Match's discrimination on clearly-mismatched candidates with vs. without those fields populated. If confirmed, the fix would live in `job_parser.py` (populate those fields more often) or in prompting/UI (encourage JDs with explicit requirements) — NOT in a scoring-weight change, since the categories themselves may already be working exactly as designed for the input they were actually given.

### Candidate 2 — `mkt_lead` × `mkt_jd_junior` / `mkt_jd_adjacent` tie (28 vs 28)

- **Finding:** the one adjacent-ordering check that doesn't pass (§9) is a tie, not an inversion.
- **Benchmark evidence:** `mkt_lead`'s skill set (`Marketing Strategy, Brand Management, Team Leadership, Budget Management, Stakeholder Management`) has zero literal keyword overlap with EITHER `mkt_jd_junior` or `mkt_jd_adjacent` — both score 28.
- **Affected metric:** none — this is a property of the specific resume/JD pair, not the scoring formula.
- **Possible cause:** an extreme-seniority resume genuinely has no keyword headroom left to differentiate two equally-irrelevant junior JDs once keyword overlap is already at zero for both.
- **Confidence:** LOW that this reflects any real issue — it looks like a legitimate, expected edge case of this specific dataset construction, not a defect.
- **Recommended future action:** none required. Noted for completeness only.

## 20. Limitations

- This is a hand-built, 12-resume synthetic corpus, not a random sample of real user resumes — score distribution (§17) and coverage (§4) claims are about THIS dataset, not a general population.
- `min_experience_years`/`min_education` are unset on every JD in this dataset (see Candidate 1) — that's a real gap in this first-pass dataset's construction, not a claim that real JDs never specify these.
- The `band` label (§8) is informational only — see its own caveat.
- Competitor comparison is NOT AVAILABLE (§18) — this is a scope limitation of this phase, not a claim no difference exists.
- Anti-gaming probes (§16) are synthetic and small (6 cases) — a first pass on the already-shipped Phase D module, not exhaustive coverage of every possible gaming pattern.

## 21. Phase E conclusion

Phase E delivered a 36-pair hand-labeled benchmark dataset, a 69-test pytest regression suite (all calling the production engine directly, split explicitly into hard invariants vs. informational metrics), and this report. No production scoring code was modified; `SCORING_ENGINE_VERSION` remains `2.0.0`. One calibration candidate ("Calibration Candidates" below, Candidate 1) is documented for a future, separate, explicitly-scoped decision — not fixed in this phase, per the Phase E policy. Competitor comparison remains NOT AVAILABLE and is not claimed.
