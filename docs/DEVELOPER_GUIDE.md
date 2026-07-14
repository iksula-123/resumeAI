# Developer Guide

## Prerequisites
- Python 3.12, Node 18+
- A Supabase project (Auth + Postgres + Storage) — optional for local dev (falls back to SQLite)
- A Google Gemini API key (optional — AI degrades to fallbacks without it)

## Environment
Secrets live in the repo-root `.env.local` (gitignored). The backend loads it; the
frontend reads `frontend/.env.local` for `NEXT_PUBLIC_*` values.

Backend keys: `DATABASE_URL` (leave placeholder for SQLite), `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`,
`ADMIN_EMAILS`, `CORS_ORIGINS`.

Frontend keys: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

> Admin access: any email in `ADMIN_EMAILS` is granted the `admin` role on login.

## Run locally
Backend:
```bash
cd backend
python -m venv .venv && .venv\Scripts\pip install -r requirements.txt   # Windows
.venv\Scripts\uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Frontend:
```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
```
Or use `start.bat` at the repo root to launch both.

Health check: `GET http://localhost:8000/health` → `{"status":"ok"}`.
Interactive API docs: `http://localhost:8000/docs`.

## Data layer
- With a real `DATABASE_URL` (Supabase **session pooler**, port 5432) the app uses
  Postgres. Otherwise it creates `backend/resumeai.db` (SQLite). Same code path.
- Tables are created on startup by `init_db()` (`Base.metadata.create_all`) — adding a
  model to `models.py` is enough; no manual migration needed for dev.
- For production Postgres, apply `supabase/migrations/*.sql` for RLS/triggers.

## Conventions
- **Auth**: protect endpoints with `Depends(get_current_user)` (any user) or
  `Depends(require_admin)`. Public API uses `Depends(require_api_key)`.
- **New AI feature**: add a function in `services/ai.py` that calls `_chat(...)`,
  parses with `_extract_json_list` / `_extract_json_object`, and **always returns a
  fallback** when the model is unavailable. Token usage is tracked automatically.
- **Emit an event**: `from services.webhooks import dispatch; dispatch(user.id, "x.y", {...})`.
- **Audit an action**: `from services.audit import record as audit; audit(actor_id=…, action="…")`.
- **Frontend styling**: reuse the design system — `panel-premium`, `card-premium`,
  `btn-primary`, `btn-ghost`, `glass-card`, `input-premium`, `gradient-text`,
  `shimmer`, `animate-fade-up`, and the brand gradient. Don't introduce a new UI kit.
- **API calls** from the frontend go through `lib/api.ts` (handles the token + 401 →
  login redirect). File uploads/exports use a raw `fetch` with the token from the store.

## Testing
- Backend integration tests live in `backend/tests/`. Note the current
  `conftest.py` targets a local Postgres (`resumeai_db`); point it at SQLite or a test
  Postgres to run. Manual/e2e verification is done via `curl`/PowerShell against the
  running server (see each feature's PR notes).
- Frontend: `npx tsc --noEmit` (type-check) and `npm run build` (production build) are
  the fast gates used throughout development.

## Deployment
Frontend → Vercel, backend → Render, data → Supabase. Full walkthrough in
[../DEPLOYMENT.md](../DEPLOYMENT.md). Every `git push` to `main` auto-deploys both.

## AI quota note
Gemini free tier has daily/'minute limits. When exhausted you'll see `429` and AI
features return their **fallback** output — this is by design, not a bug. Add billing
to the Gemini key or wait for the reset to restore full AI responses.
