# TAF Data Pipeline — `role_profiles` (Phase 1, Spec Section 3)

Turns the raw recruiter TAF exports into the Phase-1 **pre-fill library**
(`role_profiles`) — the top ~100 canonical roles that power the "pick your role →
auto-fill" USP. **All recruiter PII is stripped before any other processing and
never reaches an AI call, an aggregate, an output file, or the database.**

## Run

From `backend/` (uses the backend venv):

```bash
# produce artifacts only (no DB writes) — safe to run anytime
venv/Scripts/python.exe -m pipelines.taf_pipeline --top 100

# also upsert into role_profiles (requires 0003 migration applied + DATABASE_URL set)
venv/Scripts/python.exe -m pipelines.taf_pipeline --top 100 --load
```

Inputs: `TAFs-*.csv` in the repo root (auto-discovered), or `--csv path1 path2`.

## Stages (`taf_pipeline.py`)

1. **Load & merge** both CSVs, dedupe on `TAF ID` (last write wins).
2. **Strip PII** — drops the columns in `PII_COLUMNS` (`taf_constants.py`) in place, first.
3. **Clean text** — scrub mojibake (`�`), non-breaking spaces, collapse whitespace.
4. **Normalize titles** — phrase collapsing, whole-string abbreviation expansion
   (`cse → customer service executive`), stopword/seniority removal, order-independent
   grouping key. Optional rapidfuzz consolidation of near-duplicate top roles.
5. **Junk detection** — drop placeholder/garbage titles (`n`, `test`, numeric-only, …).
6. **Aggregate** per role: top skills (lexicon-matched), typical education, typical
   selection process, median salary range, dominant industry/sub-sector/category, demand.
7. **Rank** by requisition volume, **cut to top ~100**.
8. **Emit** `output/`: `role_profiles.json`, `role_profiles.csv`,
   `role_profiles_insert.sql` (idempotent upsert on `slug`), `pipeline_report.txt`.

## Tuning knobs

All in `taf_pipeline.py` / `taf_constants.py`:

- `FUZZY_THRESHOLD`, `FUZZY_CANDIDATE_POOL` — title consolidation aggressiveness.
- `TOP_SKILLS` — skills kept per role.
- `MIN_SANE_CTC` / `MAX_SANE_CTC` — salary outlier bounds.
- `SKILLS_LEXICON` — curated skill surface forms (stand-in for the SahiCareer model;
  extend here to improve IT/developer skill coverage).

## Known data-quality notes

- **Salary is sparse at source**: ~92% of rows have a blank `Minimum CTC`, so
  `salary_min/max` is populated only for higher-volume roles (best-effort medians).
- **IT/developer skills are generic** until the lexicon is extended with programming
  languages/tools — the dataset is BFSI/retail/sales heavy, which is well covered.
- The pipeline is **idempotent**: re-running regenerates artifacts and upserts on `slug`.
