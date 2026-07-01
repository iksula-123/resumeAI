# Supabase Database Schema — ResumeAI Pro

Normalized PostgreSQL schema for the AI Resume Builder.

## Tables

| Table | Purpose | Parent FK |
|---|---|---|
| `profiles` | User profile, 1:1 with `auth.users` | `auth.users(id)` |
| `subscriptions` | Plan / Stripe billing, 1:1 with profile | `profiles(id)` |
| `resumes` | A resume document | `profiles(id)` |
| `experiences` | Work experience entries | `resumes(id)` |
| `education` | Education entries | `resumes(id)` |
| `skills` | Skills with level/category | `resumes(id)` |
| `projects` | Project entries | `resumes(id)` |
| `certifications` | Certifications | `resumes(id)` |
| `languages` | Languages + proficiency | `resumes(id)` |
| `ats_reports` | History of ATS scans | `resumes(id)`, `profiles(id)` |

All foreign keys use `ON DELETE CASCADE`. Deleting a user removes their
profile, resumes, and every child row automatically.

## What's included (PostgreSQL best practices)

- **UUID PKs** via `gen_random_uuid()`
- **Row-Level Security (RLS)** on every table — users can only read/write their
  own data; admins (`profiles.role = 'admin'`) can read all; public resumes are
  readable by anyone
- **`updated_at` triggers** — maintained by the DB, not the app
- **Auto-profile creation** — a trigger on `auth.users` inserts a `profiles` row
  on signup (reads `full_name` from auth metadata)
- **Indexes** on every FK plus common sort/search columns (incl. trigram indexes
  on `resumes.title` and `skills.name` for fuzzy search)
- **CHECK constraints** on enums (`role`, `plan`, `status`, `proficiency`,
  score ranges 0–100)
- Idempotent — safe to re-run (uses `if not exists` / `drop policy if exists`)

## How to apply

**Option A — Supabase Studio (quickest)**
1. Open your project at app.supabase.com → SQL Editor
2. Paste the contents of `migrations/0001_initial_schema.sql`
3. Run

**Option B — Supabase CLI**
```bash
supabase link --project-ref avvminoaouvtgburgvrx
supabase db push
```

**Rollback:** run `migrations/0001_initial_schema.down.sql` (destructive).

## ✅ The backend now uses this normalized schema

The FastAPI backend has been migrated to this model:

- `backend/models.py` defines normalized ORM models for every table here
  (`profiles`, `resumes`, `experiences`, `education`, `skills`, `projects`,
  `certifications`, `languages`, `cover_letters`, `ats_reports`, `subscriptions`).
- `backend/routers/resumes.py` translates between the frontend's nested
  `content` object and the normalized child tables — assembling `content` on
  read, decomposing it into rows on write (with `sort_order` preserved).
- Auth/roles use `profiles` (the old `users` table is gone). The class is named
  `Profile`, with a `User = Profile` alias for compatibility.

### Running locally vs. on Supabase

It works on **both** with no code change:

| | DATABASE_URL | Tables created by | RLS |
|---|---|---|---|
| **Local (now)** | placeholder → falls back to SQLite (`backend/resumeai.db`) | SQLAlchemy `create_all` on startup | n/a (single app user) |
| **Supabase** | real Postgres password | this SQL migration | enforced |

### To switch to Supabase Postgres

1. Apply this migration (Studio SQL Editor or `supabase db push`).
2. Put the real DB password in `DATABASE_URL` in `.env.local`.
3. Restart the backend — it auto-detects Postgres and connects. `create_all`
   skips tables that already exist (created by the migration), so RLS,
   triggers, and the `auth.users` FK from the SQL are preserved.

> The backend connects with the **service role**, which bypasses RLS — RLS
> protects direct client/PostgREST access. App-level ownership checks
> (`user_id == auth user`) are also enforced in the routers.
