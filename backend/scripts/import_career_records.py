"""
Bulk-import EduBridge career records from a CSV (Milestone C USP enabler).

Populates the GREEN, verified record a resume auto-fills from, keyed by learner
email. Runs directly against the DB with the service role (bypasses RLS) — use it
to seed the learner pilot from a college-DB export.

CSV columns (header row required; only `email` is mandatory):
    email, college, course, training, certificates, education
  - training     : semicolon-separated programmes            e.g. "BFSI Sales;Excel Basics"
  - certificates : semicolon-separated names                 e.g. "Retail Banking;Tally"
  - education    : semicolon-separated "degree|institution|year"
                                                             e.g. "B.Com|Mumbai University|2024"

Run (from backend/):
    venv/Scripts/python.exe -m scripts.import_career_records path/to/records.csv

A learner must already have a profile (signed in via a portal) to be matched;
unmatched emails are reported so they can be retried later.
"""
import csv
import json
import os
import re
import sys


def _split(val: str) -> list[str]:
    return [p.strip() for p in (val or "").split(";") if p.strip()]


def _education(val: str) -> list[dict]:
    out = []
    for item in _split(val):
        parts = [p.strip() for p in item.split("|")]
        out.append({
            "degree": parts[0] if len(parts) > 0 else "",
            "institution": parts[1] if len(parts) > 1 else "",
            "year": parts[2] if len(parts) > 2 else "",
        })
    return out


def main(argv=None):
    argv = argv or sys.argv[1:]
    if not argv:
        raise SystemExit("usage: python -m scripts.import_career_records <records.csv>")
    csv_path = argv[0]

    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env.local"), override=True)
    import psycopg2

    db_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL not set.")
    sync = re.sub(r"\+asyncpg", "", db_url)

    upsert = (
        "insert into public.career_record "
        "(user_id, education, edubridge_training, certificates, college, course) "
        "values (%(uid)s, %(education)s::jsonb, %(training)s::jsonb, %(certs)s::jsonb, %(college)s, %(course)s) "
        "on conflict (user_id) do update set "
        " education=case when jsonb_array_length(excluded.education)>0 then excluded.education else public.career_record.education end, "
        " edubridge_training=case when jsonb_array_length(excluded.edubridge_training)>0 then excluded.edubridge_training else public.career_record.edubridge_training end, "
        " certificates=case when jsonb_array_length(excluded.certificates)>0 then excluded.certificates else public.career_record.certificates end, "
        " college=coalesce(excluded.college, public.career_record.college), "
        " course=coalesce(excluded.course, public.career_record.course), updated_at=now()"
    )

    conn = psycopg2.connect(sync)
    ingested, unmatched, rows = 0, [], 0
    with conn, conn.cursor() as cur:
        with open(csv_path, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                rows += 1
                email = (row.get("email") or "").strip()
                if not email:
                    continue
                cur.execute("select id from public.profiles where lower(email)=lower(%s)", (email,))
                r = cur.fetchone()
                if not r:
                    unmatched.append(email)
                    continue
                certs = [{"name": c} for c in _split(row.get("certificates", ""))]
                cur.execute(upsert, {
                    "uid": r[0],
                    "education": json.dumps(_education(row.get("education", ""))),
                    "training": json.dumps(_split(row.get("training", ""))),
                    "certs": json.dumps(certs),
                    "college": (row.get("college") or "").strip() or None,
                    "course": (row.get("course") or "").strip() or None,
                })
                ingested += 1
    conn.close()
    print(f"rows read: {rows} | ingested: {ingested} | unmatched: {len(unmatched)}")
    if unmatched:
        print("unmatched emails (no profile yet):", ", ".join(unmatched[:20]),
              "…" if len(unmatched) > 20 else "")


if __name__ == "__main__":
    main()
