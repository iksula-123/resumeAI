"""
TAF DATA PIPELINE  (PHASE1_BUILD_SPEC.md Section 3)

Repeatable script that turns the raw recruiter TAF exports into the Phase-1
pre-fill library (`role_profiles`).

Stages:
  1. load & merge both TAFs-*.csv, dedupe on TAF ID
  2. strip ALL recruiter PII  (must happen before anything else)
  3. clean text (encoding scrubbing)
  4. normalize job titles -> canonical roles
  5. junk detection (drop placeholder/garbage titles)
  6. aggregate role profiles (skills, education, selection, salary, industry, demand)
  7. rank by requisition volume and cut to the top ~100 roles
  8. emit outputs: role_profiles.json / .csv / _insert.sql / pipeline_report.txt
     (optional --load writes straight to Postgres/Supabase via the service role)

Run (from backend/):
    venv/Scripts/python.exe -m pipelines.taf_pipeline --top 100
    venv/Scripts/python.exe -m pipelines.taf_pipeline --top 100 --load   # writes DB (after schema applied)

No PII is ever written to any output artifact or database row.
"""
from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field

try:
    from rapidfuzz import fuzz
    _HAVE_RAPIDFUZZ = True
except ImportError:  # pragma: no cover - fuzzy consolidation degrades gracefully
    _HAVE_RAPIDFUZZ = False

from pipelines.taf_constants import (
    ABBREV_WHOLE,
    JUNK_SKILL_EXACT,
    JUNK_TITLE_EXACT,
    MIN_TITLE_LEN,
    PHRASE_NORMALIZE,
    PHRASE_PRETTY,
    PII_COLUMNS,
    SENIORITY_TOKENS,
    SKILLS_LEXICON,
    TITLE_STOPWORDS,
)

csv.field_size_limit(min(sys.maxsize, 2_147_483_647))

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")

FUZZY_THRESHOLD = 92          # token_set_ratio above which two roles are merged
FUZZY_CANDIDATE_POOL = 400    # only fuzzy-consolidate the strongest N groups (perf)
TOP_SKILLS = 12
MAX_SANE_CTC = 10_000_000     # ₹1 cr/yr — anything above is a data-entry error
MIN_SANE_CTC = 12_000         # ₹1k/mo — anything below is junk


# ===========================================================================
# Stage 1 — load & merge & dedupe
# ===========================================================================
def load_and_merge(csv_paths: list[str]) -> tuple[list[dict], dict]:
    """Read every CSV, merge, and dedupe on `TAF ID` (last write wins)."""
    by_id: dict[str, dict] = {}
    stats = {"files": {}, "rows_read": 0, "rows_no_id": 0}
    for path in csv_paths:
        n = 0
        with open(path, encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                n += 1
                taf_id = (row.get("TAF ID") or "").strip()
                if not taf_id:
                    stats["rows_no_id"] += 1
                    continue
                by_id[taf_id] = row
        stats["files"][os.path.basename(path)] = n
        stats["rows_read"] += n
    stats["unique_taf_ids"] = len(by_id)
    return list(by_id.values()), stats


# ===========================================================================
# Stage 2 — strip ALL recruiter PII (before ANY further processing)
# ===========================================================================
def strip_pii(rows: list[dict]) -> tuple[list[dict], list[str]]:
    """Delete every PII column in place. PII must never reach an AI call,
    an aggregation, or an output artifact."""
    header_keys = set(rows[0].keys()) if rows else set()
    present = [c for c in PII_COLUMNS if c in header_keys]
    for r in rows:
        for col in present:
            r.pop(col, None)
    return rows, present


# ===========================================================================
# Stage 3 — text cleaning
# ===========================================================================
_WS = re.compile(r"\s+")
_PARENS = re.compile(r"[\(\[\{].*?[\)\]\}]")
_NONALNUM = re.compile(r"[^a-z0-9 ]+")


def clean_text(value: str | None) -> str:
    """Scrub encoding artifacts (mojibake bullets, nbsp) and collapse whitespace."""
    if not value:
        return ""
    v = value.replace("�", " ").replace("\xa0", " ").replace("•", " ")
    v = v.replace("\r", " ").replace("\n", " ").replace("\t", " ")
    return _WS.sub(" ", v).strip()


# ===========================================================================
# Stage 4 — title normalization
# ===========================================================================
def normalize_title(raw: str | None) -> tuple[str, tuple[str, ...]]:
    """Return (display_title, grouping_key).

    display_title: cleaned, de-noised, human-readable canonical phrasing.
    grouping_key:  order-independent token tuple used to group variants.
    Returns ("", ()) when the title is junk/empty.
    """
    cleaned = clean_text(raw).lower()
    if not cleaned:
        return "", ()
    cleaned = _PARENS.sub(" ", cleaned)                 # drop "(bfsi)", "[urgent]"
    # collapse known multi-word phrases so they survive tokenization/sorting
    for phrase, token in PHRASE_NORMALIZE.items():
        cleaned = cleaned.replace(phrase, token)
    cleaned = _NONALNUM.sub(" ", cleaned)               # punctuation -> space
    cleaned = _WS.sub(" ", cleaned).strip()
    if not cleaned:
        return "", ()

    # whole-string abbreviation expansion (e.g. "cse" -> customer service executive)
    if cleaned in ABBREV_WHOLE:
        expanded = ABBREV_WHOLE[cleaned]
        for phrase, token in PHRASE_NORMALIZE.items():
            expanded = expanded.replace(phrase, token)
        cleaned = expanded

    tokens = [
        t for t in cleaned.split()
        if t not in TITLE_STOPWORDS and t not in SENIORITY_TOKENS
    ]
    # after removing seniority/stopwords a bare abbreviation may remain
    if len(tokens) == 1 and tokens[0] in ABBREV_WHOLE:
        expanded = ABBREV_WHOLE[tokens[0]]
        for phrase, token in PHRASE_NORMALIZE.items():
            expanded = expanded.replace(phrase, token)
        tokens = expanded.split()

    if not tokens:
        return "", ()

    display = " ".join(_pretty_token(t) for t in tokens)
    key = tuple(sorted(tokens))
    return display, key


def _pretty_token(token: str) -> str:
    """Expand a collapsed phrase token back to spaced words for display."""
    if token in PHRASE_PRETTY:
        return PHRASE_PRETTY[token]
    return token


def _title_case(text: str) -> str:
    return " ".join(w.capitalize() for w in text.split())


# ===========================================================================
# Stage 5 — junk detection
# ===========================================================================
def is_junk_title(raw: str | None, cleaned_key: tuple[str, ...]) -> bool:
    cleaned = clean_text(raw).lower().strip()
    if cleaned in JUNK_TITLE_EXACT:
        return True
    if not cleaned_key:
        return True
    joined = " ".join(cleaned_key)
    if len(joined.replace(" ", "")) < MIN_TITLE_LEN:
        return True
    if not any(ch.isalpha() for ch in joined):
        return True
    return False


# ===========================================================================
# Skill extraction (reusable lexicon matcher; stands in for SahiCareer model)
# ===========================================================================
_SKILL_MATCHERS = [
    (canon, [re.compile(r"\b" + re.escape(s) + r"\b") for s in surfaces])
    for canon, surfaces in SKILLS_LEXICON.items()
]


def extract_skills(skill_text: str | None) -> list[str]:
    """Return the set of canonical skills mentioned in one row's Skill Requirements."""
    cleaned = clean_text(skill_text).lower()
    if not cleaned or cleaned in JUNK_SKILL_EXACT:
        return []
    found = []
    for canon, matchers in _SKILL_MATCHERS:
        if any(m.search(cleaned) for m in matchers):
            found.append(canon)
    return found


# ===========================================================================
# Stage 6 — aggregation
# ===========================================================================
@dataclass
class RoleAgg:
    key: tuple[str, ...]
    display_variants: Counter = field(default_factory=Counter)
    raw_titles: set = field(default_factory=set)
    demand: int = 0
    skills: Counter = field(default_factory=Counter)
    education: Counter = field(default_factory=Counter)
    selection: Counter = field(default_factory=Counter)
    industry: Counter = field(default_factory=Counter)
    sub_sector: Counter = field(default_factory=Counter)
    category: Counter = field(default_factory=Counter)
    ctc_min: list = field(default_factory=list)
    ctc_max: list = field(default_factory=list)

    def merge(self, other: "RoleAgg") -> None:
        self.display_variants.update(other.display_variants)
        self.raw_titles |= other.raw_titles
        self.demand += other.demand
        self.skills.update(other.skills)
        self.education.update(other.education)
        self.selection.update(other.selection)
        self.industry.update(other.industry)
        self.sub_sector.update(other.sub_sector)
        self.category.update(other.category)
        self.ctc_min.extend(other.ctc_min)
        self.ctc_max.extend(other.ctc_max)


def _parse_ctc(value: str | None) -> int | None:
    if not value:
        return None
    digits = re.sub(r"[^0-9]", "", value)
    if not digits:
        return None
    n = int(digits)
    if n < MIN_SANE_CTC or n > MAX_SANE_CTC:
        return None
    return n


def _clean_short_field(value: str | None) -> str:
    v = clean_text(value)
    if not v or v.lower() in JUNK_SKILL_EXACT or v.lower() == "n":
        return ""
    return v


def aggregate(rows: list[dict]) -> tuple[dict[tuple, RoleAgg], dict]:
    groups: dict[tuple, RoleAgg] = {}
    stats = {"rows_in": len(rows), "junk_titles": 0, "aggregated": 0}
    for r in rows:
        raw_title = r.get("Job Title")
        display, key = normalize_title(raw_title)
        if is_junk_title(raw_title, key):
            stats["junk_titles"] += 1
            continue
        stats["aggregated"] += 1
        agg = groups.get(key)
        if agg is None:
            agg = groups[key] = RoleAgg(key=key)
        agg.demand += 1
        agg.display_variants[display] += 1
        agg.raw_titles.add(clean_text(raw_title))
        for sk in extract_skills(r.get("Skill Requirements")):
            agg.skills[sk] += 1
        edu = _clean_short_field(r.get("Educational Background"))
        if edu:
            agg.education[edu] += 1
        sel = _clean_short_field(r.get("Selection Process"))
        if sel:
            agg.selection[sel] += 1
        for col, ctr in (("Industry", agg.industry), ("Sub Sector", agg.sub_sector),
                         ("Job Category", agg.category)):
            val = _clean_short_field(r.get(col))
            if val:
                ctr[val] += 1
        lo = _parse_ctc(r.get("Minimum CTC (INR)"))
        hi = _parse_ctc(r.get("Maximum CTC (INR)"))
        if lo:
            agg.ctc_min.append(lo)
        if hi:
            agg.ctc_max.append(hi)
    return groups, stats


# ---------------------------------------------------------------------------
# fuzzy consolidation of the strongest groups (typos / residual variants)
# ---------------------------------------------------------------------------
def consolidate_fuzzy(groups: dict[tuple, RoleAgg]) -> list[RoleAgg]:
    ordered = sorted(groups.values(), key=lambda g: g.demand, reverse=True)
    if not _HAVE_RAPIDFUZZ:
        return ordered
    pool = ordered[:FUZZY_CANDIDATE_POOL]
    tail = ordered[FUZZY_CANDIDATE_POOL:]
    canonical: list[RoleAgg] = []
    canonical_titles: list[str] = []
    for g in pool:
        title = g.display_variants.most_common(1)[0][0]
        best_i, best_score = -1, 0
        for i, ct in enumerate(canonical_titles):
            score = fuzz.token_set_ratio(title, ct)
            if score > best_score:
                best_i, best_score = i, score
        if best_score >= FUZZY_THRESHOLD:
            canonical[best_i].merge(g)
        else:
            canonical.append(g)
            canonical_titles.append(title)
    canonical.extend(tail)
    canonical.sort(key=lambda g: g.demand, reverse=True)
    return canonical


# ---------------------------------------------------------------------------
# helpers for finalizing a role profile
# ---------------------------------------------------------------------------
def _median(vals: list[int]) -> int | None:
    if not vals:
        return None
    s = sorted(vals)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) // 2


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def finalize(agg: RoleAgg) -> dict:
    title = _title_case(agg.display_variants.most_common(1)[0][0])
    skills = [s for s, _ in agg.skills.most_common(TOP_SKILLS)]
    skills_detail = [{"skill": s, "count": c} for s, c in agg.skills.most_common(TOP_SKILLS)]
    education = agg.education.most_common(1)[0][0] if agg.education else None
    selection = agg.selection.most_common(1)[0][0] if agg.selection else None
    industry = agg.industry.most_common(1)[0][0] if agg.industry else None
    sub_sector = agg.sub_sector.most_common(1)[0][0] if agg.sub_sector else None
    category = agg.category.most_common(1)[0][0] if agg.category else None
    return {
        "slug": _slugify(title),
        "canonical_title": title,
        "skills": skills,
        "skills_detail": skills_detail,
        "education": education,
        "selection_process": selection,
        "salary_min": _median(agg.ctc_min),
        "salary_max": _median(agg.ctc_max),
        "industry": industry,
        "sub_sector": sub_sector,
        "category": category,
        "demand_count": agg.demand,
        "raw_title_count": len(agg.raw_titles),
        "source": "taf",
    }


# ===========================================================================
# Stage 8 — outputs
# ===========================================================================
def _sql_str(value) -> str:
    if value is None:
        return "null"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def _sql_text_array(items: list[str]) -> str:
    if not items:
        return "'{}'"
    inner = ",".join('"' + i.replace('"', '\\"') + '"' for i in items)
    return "'{" + inner.replace("'", "''") + "}'"


def write_outputs(profiles: list[dict], out_dir: str, report: dict) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    paths = {}

    # JSON
    p = os.path.join(out_dir, "role_profiles.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(profiles, f, ensure_ascii=False, indent=2)
    paths["json"] = p

    # CSV (skills flattened)
    p = os.path.join(out_dir, "role_profiles.csv")
    cols = ["slug", "canonical_title", "skills", "education", "selection_process",
            "salary_min", "salary_max", "industry", "sub_sector", "category",
            "demand_count", "raw_title_count", "source"]
    with open(p, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for pr in profiles:
            w.writerow([
                pr["slug"], pr["canonical_title"], "; ".join(pr["skills"]),
                pr["education"] or "", pr["selection_process"] or "",
                pr["salary_min"] or "", pr["salary_max"] or "", pr["industry"] or "",
                pr["sub_sector"] or "", pr["category"] or "", pr["demand_count"],
                pr["raw_title_count"], pr["source"],
            ])
    paths["csv"] = p

    # INSERT SQL (idempotent upsert on slug)
    p = os.path.join(out_dir, "role_profiles_insert.sql")
    with open(p, "w", encoding="utf-8") as f:
        f.write("-- Generated by pipelines/taf_pipeline.py — do not edit by hand.\n")
        f.write("-- Apply AFTER 0003_phase1_tenants_and_pipeline.sql.\n\n")
        for pr in profiles:
            f.write(
                "insert into public.role_profiles "
                "(slug, canonical_title, skills, skills_detail, education, selection_process, "
                "salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (\n"
                f"  {_sql_str(pr['slug'])}, {_sql_str(pr['canonical_title'])}, "
                f"{_sql_text_array(pr['skills'])}, {_sql_str(json.dumps(pr['skills_detail']))}::jsonb, "
                f"{_sql_str(pr['education'])}, {_sql_str(pr['selection_process'])}, "
                f"{_sql_str(pr['salary_min'])}, {_sql_str(pr['salary_max'])}, "
                f"{_sql_str(pr['industry'])}, {_sql_str(pr['sub_sector'])}, {_sql_str(pr['category'])}, "
                f"{pr['demand_count']}, {pr['raw_title_count']}, {_sql_str(pr['source'])}\n"
                ") on conflict (slug) do update set\n"
                "  canonical_title = excluded.canonical_title, skills = excluded.skills, "
                "skills_detail = excluded.skills_detail, education = excluded.education, "
                "selection_process = excluded.selection_process, salary_min = excluded.salary_min, "
                "salary_max = excluded.salary_max, industry = excluded.industry, "
                "sub_sector = excluded.sub_sector, category = excluded.category, "
                "demand_count = excluded.demand_count, raw_title_count = excluded.raw_title_count, "
                "updated_at = now();\n\n"
            )
    paths["sql"] = p

    # Human-readable report
    p = os.path.join(out_dir, "pipeline_report.txt")
    with open(p, "w", encoding="utf-8") as f:
        f.write("TAF PIPELINE REPORT\n===================\n\n")
        for k, v in report.items():
            f.write(f"{k}: {v}\n")
        f.write(f"\nTop {min(30, len(profiles))} roles by demand:\n")
        for pr in profiles[:30]:
            sal = f"₹{pr['salary_min']:,}-{pr['salary_max']:,}" if pr["salary_min"] and pr["salary_max"] else "n/a"
            f.write(f"  {pr['demand_count']:5d}  {pr['canonical_title']:<38} "
                    f"[{pr['industry'] or '-'}] {sal}  skills: {', '.join(pr['skills'][:5])}\n")
    paths["report"] = p
    return paths


# ===========================================================================
# Optional DB load (service role bypasses RLS; run only after schema applied)
# ===========================================================================
def load_into_db(profiles: list[dict]) -> int:
    """Upsert role profiles into Postgres/Supabase using the backend DB engine."""
    from sqlalchemy import create_engine, text  # local import: only needed for --load

    db_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL / SUPABASE_DB_URL not set — cannot --load.")
    # SQLAlchemy sync driver
    db_url = db_url.replace("postgresql+asyncpg", "postgresql+psycopg2").replace(
        "postgres://", "postgresql+psycopg2://")
    engine = create_engine(db_url)
    stmt = text(
        "insert into public.role_profiles "
        "(slug, canonical_title, skills, skills_detail, education, selection_process, "
        " salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) "
        "values (:slug, :canonical_title, :skills, cast(:skills_detail as jsonb), :education, :selection_process, "
        " :salary_min, :salary_max, :industry, :sub_sector, :category, :demand_count, :raw_title_count, :source) "
        "on conflict (slug) do update set "
        " canonical_title=excluded.canonical_title, skills=excluded.skills, skills_detail=excluded.skills_detail, "
        " education=excluded.education, selection_process=excluded.selection_process, "
        " salary_min=excluded.salary_min, salary_max=excluded.salary_max, industry=excluded.industry, "
        " sub_sector=excluded.sub_sector, category=excluded.category, demand_count=excluded.demand_count, "
        " raw_title_count=excluded.raw_title_count, updated_at=now()"
    )
    n = 0
    with engine.begin() as conn:
        for pr in profiles:
            conn.execute(stmt, {
                **pr,
                "skills": pr["skills"],
                "skills_detail": json.dumps(pr["skills_detail"]),
            })
            n += 1
    return n


# ===========================================================================
# CLI
# ===========================================================================
def run(csv_paths: list[str], top: int, out_dir: str, do_load: bool) -> None:
    print(f"[1/8] loading & merging {len(csv_paths)} file(s)…")
    rows, load_stats = load_and_merge(csv_paths)
    print(f"      read {load_stats['rows_read']} rows -> {load_stats['unique_taf_ids']} unique TAF IDs")

    print("[2/8] stripping recruiter PII…")
    rows, stripped = strip_pii(rows)
    print(f"      removed PII columns: {', '.join(stripped)}")

    print("[3-6/8] cleaning, normalizing titles, junk detection, aggregating…")
    groups, agg_stats = aggregate(rows)
    print(f"      dropped {agg_stats['junk_titles']} junk-title rows; "
          f"{len(groups)} distinct canonical role keys")

    print("[7/8] fuzzy consolidation + ranking…")
    consolidated = consolidate_fuzzy(groups)
    profiles = [finalize(g) for g in consolidated[:top]]
    print(f"      consolidated to {len(consolidated)} roles; cut to top {len(profiles)}")

    report = {
        **load_stats,
        "pii_columns_removed": stripped,
        "rows_after_pii": len(rows),
        "junk_title_rows_dropped": agg_stats["junk_titles"],
        "rows_aggregated": agg_stats["aggregated"],
        "distinct_role_keys_pre_fuzzy": len(groups),
        "roles_post_fuzzy": len(consolidated),
        "roles_written": len(profiles),
        "fuzzy_enabled": _HAVE_RAPIDFUZZ,
    }
    # collapse files dict for readability in the flat report
    report["files"] = load_stats.get("files")

    print("[8/8] writing outputs…")
    paths = write_outputs(profiles, out_dir, report)
    for k, v in paths.items():
        print(f"      {k}: {os.path.relpath(v, REPO_ROOT)}")

    if do_load:
        print("[load] upserting into role_profiles…")
        n = load_into_db(profiles)
        print(f"       upserted {n} role_profiles rows")
    else:
        print("[load] skipped (no --load). Apply migrations, then re-run with --load "
              "or run output/role_profiles_insert.sql.")


def main(argv=None):
    ap = argparse.ArgumentParser(description="TAF -> role_profiles pipeline (Phase 1, Section 3)")
    ap.add_argument("--csv", nargs="*", help="explicit CSV paths (default: repo-root TAFs-*.csv)")
    ap.add_argument("--top", type=int, default=100, help="number of top roles to keep (default 100)")
    ap.add_argument("--out", default=DEFAULT_OUTPUT_DIR, help="output directory")
    ap.add_argument("--load", action="store_true", help="also upsert into the DB (requires schema + DATABASE_URL)")
    args = ap.parse_args(argv)

    csv_paths = args.csv or sorted(glob.glob(os.path.join(REPO_ROOT, "TAFs-*.csv")))
    if not csv_paths:
        raise SystemExit("No TAFs-*.csv files found in repo root.")
    run(csv_paths, args.top, args.out, args.load)


if __name__ == "__main__":
    main()
