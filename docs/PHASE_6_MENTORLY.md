# Phase 6 — Mentorly

**STATUS: ✅ IMPLEMENTED** (extensive — see caveat below on provenance)

> **Provenance caveat:** unlike Phases 1–3, Mentorly's development is **not** covered by any conversation transcript available to this documentation session, and it does not correspond to any single, isolated git commit — its files (`backend/routers/mentorship.py`, `backend/services/mentorship.py`, `supabase/migrations/0006_mentorship.sql` through `0008_mentorship_phase2.sql`, and ~40 frontend files under `frontend/app/mentorship/**` and `frontend/app/admin/mentorship/**`) arrived as **pre-existing, uncommitted work** at the start of the session that produced commit `fd39489` (see [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md) Entry 11) and were committed there only because everything pending in the working tree was committed together. **The actual requirements, prompts, and design decisions behind Mentorly are `Needs verification`** — this document describes only what the current code demonstrably does, not why it was built that way.

**Source of record:** direct code inspection, 2026-08-12.

---

## 1. What exists (confirmed by code inspection)

### 1.1 Scale

`backend/routers/mentorship.py` exposes **84 endpoints** under `/api/mentorship`, backed by `backend/services/mentorship.py` (~2100 lines) and `backend/services/events.py`, `backend/services/programs.py`, `backend/services/tasks.py`, `backend/services/platform_feedback.py`, `backend/services/privacy_requests.py`. This is one of the largest modules in the codebase.

### 1.2 Mentor discovery

- `GET /api/mentorship/mentors` — browse/search mentors
- `GET /api/mentorship/mentors/{mentor_id}` — a mentor's public profile
- `GET /api/mentorship/categories`, `GET /api/mentorship/filters` — discovery filtering
- Frontend: `frontend/app/mentorship/page.tsx` (confirmed dynamic — its own docstring states "every mentor, filter option, and count comes from `/api/mentorship/*`; there is no seed/demo data")

### 1.3 Mentor profiles & "offerings"

- `GET/POST/PATCH/DELETE /api/mentorship/mentor/offerings*` — mentors define their own bookable session offerings
- `SESSION_TYPES` (confirmed in `backend/models.py`): `one_on_one`, `resume_review`, `mock_interview`, `career_guidance`, `group_session` — **mock interviews and resume/portfolio review are first-class, built-in session types**, not something separately bolted on.
- `PATCH /api/mentorship/mentor/profile`, `POST/DELETE /api/mentorship/mentor/skills`, `POST/DELETE /api/mentorship/mentor/languages`, `POST/DELETE /api/mentorship/mentor/availability` — mentor self-service profile management.

### 1.4 Booking & sessions

- `POST /api/mentorship/bookings`, `GET /api/mentorship/bookings`, plus `/cancel`, `/reschedule`, `/review` — full booking lifecycle.
- `BOOKING_STATUSES`: `pending, confirmed, cancelled, completed, rescheduled`. `SESSION_STATUSES`: `scheduled, completed, cancelled, no_show, rescheduled` (both confirmed in `models.py`).
- `GET/POST /api/mentorship/sessions/{session_id}/notes` — session notes.
- `PATCH /api/mentorship/mentor/sessions/{session_id}/status` — mentor-side status updates.

### 1.5 Career guidance features

- `GET/POST/PATCH /api/mentorship/career-goals` — goal tracking.
- `GET/PATCH /api/mentorship/tasks`, `GET/POST /api/mentorship/mentor/tasks` — task assignment between mentor and mentee.
- `career_guidance` as a session type (§1.3).

### 1.6 Mentee & mentor dashboards

- `GET /api/mentorship/mentee/dashboard` — mentee-facing dashboard.
- `GET /api/mentorship/mentor/dashboard` — mentor-facing dashboard.
- Frontend shells: `frontend/components/mentorship/MentorshipShell.tsx` (mentee-facing nav) — see [PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md](PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md) for how this shell's auth guard works; `frontend/app/mentorship/mentor/dashboard/page.tsx` and sibling `mentor/*` routes (availability, bookings, events, feedback, leaderboard, mentees, offerings, profile, programs).

### 1.7 Admin dashboard

- `GET /api/mentorship/admin/stats`, `/admin/growth`, `/admin/schedule` — platform-wide analytics.
- `GET/PATCH /api/mentorship/admin/mentors`, `/admin/mentors/{id}/status`, `GET /admin/eligible-profiles`, `POST /admin/mentors` — mentor approval/management workflow (a user applies via `POST /api/mentorship/apply`, then an admin approves/rejects via `admin/mentors/{id}/status` — this is what drives the `mentor_status` field referenced in [PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md](PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md)'s `roleLandingPath()`).
- `GET/POST/PATCH /api/mentorship/admin/categories` — category management.
- Frontend: `frontend/app/admin/mentorship/**` — 13 sub-pages (add-mentor, applications, categories, events, feedback, leaderboard, listings, mentors, platform-feedback, privacy-requests, programs, sessions, settings), all confirmed present, rendered inside `frontend/components/mentorship/AdminMentorshipShell.tsx`.

### 1.8 Supporting features

- Programs & events: `GET /api/mentorship/programs[/{id}]`, `/join`, `/leave`, `GET /api/mentorship/events[/{id}]`, `/register`.
- Notifications: `GET /api/mentorship/notifications`, `/read`, `/read-all`; `frontend/components/mentorship/NotificationBell.tsx`.
- Platform feedback: `POST /api/mentorship/platform-feedback`, `GET /platform-feedback/mine`; `frontend/components/mentorship/FloatingFeedbackButton.tsx`.
- Privacy requests: `GET/POST /api/mentorship/privacy-requests` (data-subject-style requests — exact scope Needs verification).
- Leaderboard: `GET /api/mentorship/leaderboard`.

### 1.9 Database

Three migrations confirmed present: `supabase/migrations/0006_mentorship.sql` (initial schema — largest single migration file in the project by size), `0007_mentor_profile_details.sql`, `0008_mentorship_phase2.sql`. Exact table-by-table schema is authoritative in these files; not duplicated here to avoid drift.

## 2. Authentication — shared with the rest of SahiCareer

**This is the one architectural fact about Mentorly most load-bearing for Phase 4:** Mentorly has **no separate authentication system**. It is part of the same Next.js application, uses the same `useAuthStore` (same `localStorage` session), and its backend endpoints use the same `services/deps.py::get_current_user` dependency as the rest of the app (Needs verification on a route-by-route basis for 100% of the 84 endpoints, but this is the established pattern elsewhere in the codebase and `MentorshipShell`'s own docstring explicitly states it: *"a separate shell from the resume-builder's AppShell — its own sidebar, own nav, own branding — while still sharing the same login/session (single auth, same `useAuthStore`) as the rest of SahiCareer."*

**What Mentorly does have that's genuinely separate:**
- Its own navigation shell/sidebar (`MentorshipShell`/`MentorshipSidebar`, vs. Resume Builder's `AppShell`/`Sidebar`).
- Its own white-label branding layer, `useBrandStore` (`frontend/lib/brandStore.ts`) — loaded only when a Mentorly page mounts (`if (user) useBrandStore.getState().load()` inside `MentorshipShell`), letting the Mentorly UI show a different brand name than "SahiCareer" if configured, independent of the shared login.

**In short: one authentication system, two presentation layers.** See [ARCHITECTURE.md](ARCHITECTURE.md) for a diagram.

## 3. Known issues / open items

- **The post-login default-landing bug** (documented fully in [PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md](PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md)) currently sends every plain user to `/mentorship/dashboard` after login — this is a defect in the shared auth layer, not in Mentorly's own code, but it materially affects how Mentorly is experienced today (as the de facto homepage, which the product owner has said is not the intent).
- No test coverage for `services/mentorship.py`/`routers/mentorship.py` was found in `backend/tests/` (only `test_ats_engine.py`, `test_export_ats_safe.py`, `test_health.py`, `test_new_templates.py`, `test_resumes.py`, `test_template_registry.py` exist). **This is a real, current test-coverage gap**, not a documentation gap.
- Exact scope of "privacy requests" and whether "mock interview"/"resume review" bookings have any different handling beyond their `SESSION_TYPES` label — Needs verification.

## 4. Rollback

Mentorly's code was committed as part of `fd39489` alongside Phase 1/2/3/branding — see [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md) Entry 11 for the shared rollback caveat. There is no isolated commit to revert Mentorly independently of that work.
