# ResumeAI Pro — Documentation

AI-powered resume builder SaaS. This folder is the developer/architecture reference.

## Index
| Doc | What's inside |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System overview, tech stack, request flow, folder structure |
| [DATABASE.md](./DATABASE.md) | ER diagram + table-by-table schema reference |
| [API.md](./API.md) | Full REST endpoint reference (dashboard API + public `/api/v1`) |
| [WEBHOOKS.md](./WEBHOOKS.md) | Event catalog, payload format, HMAC signature verification |
| [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) | Local setup, running, testing, conventions |
| [../DEPLOYMENT.md](../DEPLOYMENT.md) | Deploying to Vercel (frontend) + Render (backend) |
| [../supabase/README.md](../supabase/README.md) | Supabase schema migrations + RLS |

## What the product does
- **AI Resume Upgrade** — upload PDF/DOCX → parse → ATS analysis → AI enhancement → side-by-side compare → save/export
- **Resume editor** — sections, live preview, templates, ATS scoring, skill-gap, version history + rollback
- **Job Match** — score a resume against a job description, save a tailored copy
- **Job Tracker** — Kanban pipeline (Applied → Interview → Offer → Joined/Rejected)
- **Interview Prep** — AI questions, feedback, sample answers
- **Cover Letters**, **Export** (PDF/DOCX), **Supabase Storage** of files
- **Admin** — user management, analytics (AI token usage/cost), audit log
- **Platform** — API keys + public `/api/v1`, outgoing webhooks, roles, graceful auth

## High-level stack
Next.js 14 (App Router) · React · TypeScript · Tailwind (custom design system) ·
FastAPI (Python 3.12) · SQLAlchemy async · Supabase (Auth + Postgres + Storage) ·
Google Gemini (AI, with fallbacks) · Vercel (frontend) · Render (backend).
