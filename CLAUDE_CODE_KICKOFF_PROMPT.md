# Kickoff prompt for Claude Code (VS Code)

Paste the block below as your FIRST message. Keep `PHASE1_BUILD_SPEC.md` and the two
`TAFs-*.csv` files in the repo. Do NOT paste the whole PRD into the chat (that caused the
"prompt too long" error) — the spec file already has everything Claude Code needs.

---

```
Read PHASE1_BUILD_SPEC.md in the repo root — it is the authoritative build spec for the
SahiCareer "My Resume" resume builder, Phase 1 (live 1 Aug 2026). Follow it exactly. Do not
build anything marked Phase 2/3 or out of scope.

Before writing feature code, do this:

1. Read PHASE1_BUILD_SPEC.md fully and echo back a short numbered build plan grouped by the
   milestones (A–I) in the spec, so I can confirm scope before you start.

2. Confirm the tech stack you'll scaffold: Next.js (App Router) + React, Supabase
   (Postgres + RLS + Auth), OpenAI for premium AI, local models for grammar/spell, Sarvam
   for Hindi/English voice, deploy target Vercel. Multi-tenant, API-first.

3. Propose the Supabase schema from Section 4 of the spec (including the nullable JREE /
   personality / behavioural columns on career_record, and the tenant_id on every table).
   Wait for my OK before creating tables.

Then start with Milestone B, the TAF data pipeline (Section 3), because it blocks the USP:
- load and merge the two TAFs-*.csv files, dedupe on TAF ID
- strip ALL recruiter PII first (never let it reach an AI call)
- normalize the 4,281 messy job titles into canonical roles
- run junk detection
- aggregate role profiles (top skills, education, selection process, salary range, industry, demand count)
- rank and cut to the top ~100 roles by requisition volume
- write them into a role_profiles table, and make the pipeline a repeatable script

Work milestone by milestone (A → I from the spec). After each milestone, stop and show me
what you built and how it meets the Definition of Done (Section 9) and the NFRs (Section 6),
then wait for my go-ahead before the next one.

Non-negotiables to keep in mind at all times:
- Never copy a job description onto a resume; all AI suggestions are candidate-confirmed.
- Green = EduBridge record, Blue = AI-suggested (confirm), Grey = user's own content.
- Mobile-first: build for a low-end phone before desktop.
- No pay-to-download and no auto-renew — basic build and download stay free.
- Every row carries tenant_id; log usage_events for cost attribution.
```

---

## Tips to avoid the errors you hit
- **"Unsupported file type .docx"** → you already fixed this by uploading the PDF + CSVs. Keep source docs as PDF/CSV/MD.
- **"Prompt is too long / 55k tokens"** → don't paste the PRD text into chat. Let Claude Code read the spec
  file from disk instead. If a session still fills up, start a fresh session and re-point it at the spec file.
- Work one milestone per session if context gets heavy; the spec file re-anchors each new session.
