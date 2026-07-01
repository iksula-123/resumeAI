# Deploying ResumeAI Pro

Architecture: **Next.js frontend → Vercel**, **FastAPI backend → Render**, **DB → Supabase** (already hosted).

Vercel runs the frontend only. The FastAPI backend is a long-running server (DB pool,
startup lifecycle), which belongs on Render/Railway/Fly — not Vercel serverless.

---

## 0. Push the code to GitHub (one time)

Vercel and Render both deploy from a Git repo.

```bash
cd c:/Users/EduBridge/resumeai-pro
git init                       # if not already a repo
git add .
git commit -m "Deploy: ResumeAI Pro"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/resumeai-pro.git
git branch -M main
git push -u origin main
```

`.env.local` is gitignored, so your secrets are **not** pushed — you'll set them in each
dashboard instead.

---

## 1. Backend → Render (do this first; the frontend needs its URL)

1. Go to **render.com** → New + → **Blueprint** → connect your GitHub repo.
   It auto-reads `render.yaml` (root dir `backend`, start `uvicorn main:app`).
2. When prompted, fill the secret env vars (copy values from your local `.env.local`):
   - `DATABASE_URL` — the Supabase **session pooler** URI (port **5432**), e.g.
     `postgresql+asyncpg://postgres.avvminoaouvtgburgvrx:PASSWORD@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ADMIN_EMAILS`
   - `CORS_ORIGINS` — leave blank for now; set it after you have the Vercel URL (step 3).
3. Deploy. When live you'll get a URL like `https://resumeai-pro-api.onrender.com`.
   Verify: open `https://resumeai-pro-api.onrender.com/health` → `{"status":"ok"}`.

> Note: Render's free tier sleeps after inactivity (first request after idle is slow ~30s).
> That's fine for demos; upgrade the plan for always-on.

---

## 2. Frontend → Vercel

1. Go to **vercel.com** → Add New → **Project** → import the same GitHub repo.
2. **Root Directory:** set to `frontend` (Vercel then auto-detects Next.js).
3. **Environment Variables** (Settings → Environment Variables):
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | your Render URL, e.g. `https://resumeai-pro-api.onrender.com` |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://avvminoaouvtgburgvrx.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (from `.env.local`) |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | (optional) |
4. Deploy. You'll get a URL like `https://resumeai-pro.vercel.app`.

---

## 3. Connect the two (CORS)

1. In **Render** → your service → Environment → set
   `CORS_ORIGINS = https://resumeai-pro.vercel.app` (your real Vercel URL) → save (it redeploys).
   - The backend also auto-allows any `*.vercel.app` domain, so preview deploys work too.

Done — open the Vercel URL and sign up.

---

## 4. Supabase auth redirect URLs (for OAuth / email confirmation)

Supabase Dashboard → Authentication → **URL Configuration**:
- **Site URL:** `https://resumeai-pro.vercel.app`
- **Redirect URLs:** add `https://resumeai-pro.vercel.app/auth/callback`

And in each OAuth provider console (Google/GitHub) keep the callback as
`https://avvminoaouvtgburgvrx.supabase.co/auth/v1/callback`.

---

## Alternative: everything on Vercel (not recommended)

You *can* wrap FastAPI as Vercel Python functions, but you'd need to: switch the DB to the
**transaction pooler** (port 6543) with `NullPool`, drop the startup `lifespan`/`create_all`
(run schema via the Supabase SQL migrations instead), and accept cold starts. The Render
split above avoids all of that.
