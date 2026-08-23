# Phase 5 — AI Buddy

**STATUS: 🟡 PARTIALLY IMPLEMENTED** — a working chat assistant exists today (`/copilot`, labeled "Career Copilot" in the UI); the broader "AI Buddy" architecture as a distinct, unified product surface (career guidance + skill-gap + roadmap + interview prep + resume guidance all under one coherent experience) is **PLANNED**, not built as a single system. This document separates what exists from what doesn't — do not read the existing chat feature as the full scope described below.

**Source of record:** direct code inspection, 2026-08-12 (this document's own writing session). No dedicated "Phase 5" development session exists in git history — see [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md).

---

## 1. What exists today (✅ implemented, confirmed by code)

### 1.1 `/copilot` — "Career Copilot" chat

- Route: `frontend/app/copilot/page.tsx`, inside the Resume Builder's `AppShell` (same nav zone as Resume Builder, not Mentorly's).
- A single-turn chat interface: free-text input, last 6 turns of conversation history sent as context, plus a lightweight **profile context** auto-built from the user's most recent saved resume (target/current job title, up to 12 skills, first 300 characters of the summary) — confirmed in `copilot/page.tsx`.
- Backend: `POST /api/ai/copilot` → `services/ai.py::career_copilot()`. Confirmed to use the **Gemini-first / OpenAI-second / static-fallback-third** chain (`services/ai.py`, not the ATS engine's OpenAI-only `services/ats_engine/llm.py` — see [ARCHITECTURE.md](ARCHITECTURE.md) for why these are two separate AI integrations in this codebase).
- **Graceful AI-unavailable fallback confirmed in code:** if the AI call returns nothing, `career_copilot()` returns a static fallback reply and flags `ai: false` in the response; the frontend surfaces this distinction (`Msg.ai` field) rather than presenting a degraded reply as if it were a full AI answer.
- The system prompt instructs the model to point the user toward other in-app tools by name (Resume Editor, ATS Scan, Skill-Gap, Interview Prep, AI Upgrade) when relevant — i.e. Career Copilot **references** those tools conversationally but does not call them programmatically; it is not an orchestrator.
- Starter prompts are served from `GET /api/ai/copilot/prompts` (`COPILOT_PROMPTS`, with a hardcoded frontend fallback list if that call fails).

### 1.2 Adjacent AI endpoints that exist but are separate features, not part of `/copilot` itself

All confirmed present in `backend/routers/ai.py`, all backed by `services/ai.py`'s same Gemini/OpenAI/fallback chain, each with its own dedicated frontend surface elsewhere in the app (not the `/copilot` chat UI):

| Capability | Endpoint | Where it's actually surfaced |
|---|---|---|
| Bullet generation/enhancement | `/api/ai/generate-bullets`, `/api/ai/enhance-bullet` | Resume editor |
| Summary generation | `/api/ai/generate-summary` | Resume editor |
| Cover letter generation | `/api/ai/generate-cover-letter` | `/cover-letters` |
| Skill suggestions | `/api/ai/suggest-skills` | Resume editor |
| Interview questions | `/api/ai/interview-questions` | `/interview-questions` |
| Answer feedback / sample answers | `/api/ai/answer-feedback`, `/api/ai/sample-answer` | `/interview-questions` |
| Skill-gap analysis | `/api/ai/skill-gap` | Needs verification of exact page (referenced by name in the Copilot prompt; a dedicated skill-gap UI's existence was not independently re-confirmed in this pass) |
| Resume translation | `/api/ai/translate-resume` | Needs verification of exact page |

**These already provide real, working pieces of "career guidance," "interview preparation," and "skill-gap analysis"** — but as separate tools scattered across the app, not unified under one "AI Buddy" experience. Whether Phase 5 means building that unification, or simply renaming/re-skinning `/copilot` as the umbrella entry point, is a product decision not yet made.

## 2. What is PLANNED (not implemented as a unified system)

Per the original ask, potential areas for a fuller "AI Buddy":

- **Career guidance** — partially covered by the Copilot chat's general-purpose prompting; not a structured guidance flow.
- **Career questions** — the chat handles ad hoc questions; there is no structured Q&A/assessment flow.
- **Skill-gap analysis** — an endpoint exists (`/api/ai/skill-gap`); whether/where it has a dedicated, discoverable UI is unconfirmed in this pass.
- **Learning roadmap** — **not found** anywhere in the current codebase (no roadmap model, endpoint, or page located). PLANNED only.
- **Interview preparation** — a real, dedicated page exists (`/interview-questions`), separate from Copilot.
- **Resume guidance** — covered by the Resume Builder's own AI endpoints (bullets/summary/skills), not by Copilot directly.
- **Job preparation** — Needs verification / likely overlaps with `/job-match`, `/job-tracker` (separate existing features, not part of "AI Buddy" as scoped here).
- **Career planning** — **not found** as a distinct feature. PLANNED only.

**No claim is made that any of the above (beyond what's explicitly listed as existing in §1) is implemented.**

## 3. Authentication & access

`/copilot` is behind `AppShell`'s standard client-side auth guard — see [PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md](PHASE_4_SAHICAREER_AUTH_AND_SERVICES.md) for exactly how that guard works and its current default-redirect defect (which affects `/copilot` the same way it affects every other protected route: the *default* post-login landing page is wrong today, but a direct deep link to `/copilot` while logged out already round-trips correctly).

## 4. Known issues / open questions

- No single "AI Buddy" product surface exists yet — today's `/copilot` is a real, working chat feature, not the broader unified experience implied by the phase name.
- Whether a "Learning Roadmap" or "Career Planning" feature is wanted as new functionality, versus simply better-surfacing the existing skill-gap/interview-prep tools, is an open product question — this document does not decide it.

## 5. Rollback

N/A — this document only inspects existing, already-shipped functionality (from earlier, unverified commits — see [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md) entries 0–10) and records what remains planned. No new code was written for this phase document.
