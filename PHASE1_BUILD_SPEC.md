# SahiCareer — My Resume · PHASE 1 BUILD SPEC
> Put this file in the repo root. Claude Code should read it at the start of every session.
> Target: **Phase 1 live 1 August 2026 (learner pilot).** Scope is fixed. Do not add Phase 2 work.

---

## 0. THE ONE RULE THAT GOVERNS EVERYTHING
**Never copy a job description onto a resume.** A JD is what the employer wants; a resume is what the
candidate has done. Role data is used only to *guide* the candidate in presenting their own reality.
Every AI suggestion is **candidate-confirmed**, never written as fact on their behalf.

Source-of-truth color coding is mandatory in the UI:
- **Green** = pulled from the candidate's EduBridge record (verified, real)
- **Blue** = AI-suggested for this role — must be confirmed by the candidate before it appears
- **Grey** = candidate's own manually entered content

---

## 1. TECH STACK (locked, from the SRS)
- **Frontend:** Next.js (App Router) + React, mobile-first
- **Backend/DB/Auth:** Supabase (Postgres + Row Level Security + Auth)
- **Premium AI:** OpenAI (summary suggestions, resume-upload improve, bullet scaffolds)
- **Free-tier cleanup:** local models (grammar/spell, junk detection, job-title extraction) — revived SahiCareer 2019–2022 IP
- **Voice (Indian languages):** Sarvam API (~₹1.5/min) — Hindi + English at launch
- **Hosting:** Vercel
- **Architecture:** API-first, multi-tenant. This is a **service, not a website**.

---

## 2. BUILD AS A MULTI-TENANT SERVICE (Phase 1 requirement, not optional)
- Every user, resume, and event row carries a `tenant_id`.
- Tenants: EduBridgeIndia, Campus Elevated, TalentDeploy, Bridge Beyond, JREE, CollegeOS.
  (Only the learner-pilot tenant is active for the Aug 1 pilot; the rest come in Phase 2 — but the field and API boundary ship now.)
- Clean API boundary: no domain hard-coded. Tenant resolved from SSO/session handoff or a tenant header.
- **Per-tenant usage tracking is a Phase-1 deliverable** — every AI call, resume created, and download is logged with `tenant_id` + cost estimate so platform cost can be attributed to each deal.

---

## 3. FIRST ENGINEERING TASK — TAF DATA PIPELINE (blocks the USP)
The pre-fill feature (our whole USP) cannot work until this is done. Do this before feature UI.

Input: `TAFs-*.csv` (12,476 rows, 56 cols, 4,281 raw job titles — messy: "Sales Executive" vs "sales executive").

Steps:
1. **Load & merge** both CSVs, dedupe on `TAF ID`.
2. **Strip ALL recruiter PII** before anything else — drop/hash: `Contact Person`, `Contact Mobile No`,
   `Recruiter Email Id`, `Approver Email Id`, `Verification Email`, `CreatedBy`, `TAF Manager`, `BD Manager`,
   `Recruiter Company`, `TAF Confirmation Doc Url`. **PII must never reach an AI call.**
3. **Title normalization** — collapse case/whitespace/near-duplicate titles into canonical roles
   (reuse the SahiCareer job-title-extraction model). Target: clean role list from the 4,281 raw titles.
4. **Junk detection** — drop rows where `Job Title`/`Skill Requirements` are placeholder/garbage
   (reuse the SahiCareer junk-detection model).
5. **Aggregate into role profiles.** For each canonical role, produce:
   - top skills (parsed & frequency-ranked from `Skill Requirements`)
   - typical education (`Educational Background`)
   - typical selection process (`Selection Process`)
   - salary range (`Minimum CTC` / `Maximum CTC` where present)
   - industry / sub-sector / category
   - demand signal (count of requisitions)
6. **Rank and cut to the top ~100 roles** by requisition volume (strongest in BFSI / IT / retail / sales).
   These 100 role profiles are the Phase-1 pre-fill library. Store in a `role_profiles` table.

Output of this task: a populated `role_profiles` table + a repeatable pipeline script.

---

## 4. DATA MODEL (Supabase / Postgres) — minimum tables
Design `career_record` to hold **assessment fields (JREE score, personality, behavioural profile) as nullable
columns now**, even though assessments aren't built. Allowing this costs nothing today and is a painful rebuild if skipped.

- `tenants` (id, name, theme, sso_config)
- `users` (id, tenant_id, auth linkage, locale)
- `career_record` (user_id, education, edubridge_training[], certificates[], college, course, **jree_score (nullable), personality (nullable), behavioural (nullable)**)
- `resumes` (id, user_id, tenant_id, title, template_id, content_json, ats_score, created_at, updated_at)
- `resume_versions` — *Phase 2, skip*
- `role_profiles` (id, canonical_title, skills[], education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count)
- `usage_events` (id, tenant_id, user_id, event_type, ai_provider, tokens, cost_estimate, created_at)
- `uploaded_resumes` (id, user_id, file_ref, parsed_json, expires_at) — **auto-delete, never permanently retained**

Enable Supabase **Row Level Security** so a user only sees their own rows, scoped by tenant.

---

## 5. PHASE-1 FEATURE LIST (build in this order)

### Milestone A — Trust basics (fix existing build first)
- [ ] Stable sessions (no drop-outs) with SSO/session handoff
- [ ] Real cover-letter generation (not placeholder)
- [ ] Upload validation (accept valid PDF/Word, reject/handle bad files gracefully)
- [ ] Admin access working

### Milestone B — Data pipeline (Section 3 above) → `role_profiles` populated

### Milestone C — Core builder + pre-fill USP
- [ ] Role picker → on select, run the build flow:
      1. auto-fill EduBridge record (green)
      2. suggest role-tailored professional summary (blue, editable)
      3. show role-demanded skills as a checklist the candidate ticks (blue → confirmed)
      4. bullet scaffolds (action-verb starters with blanks) the candidate personalises (grey)
      5. surface ATS/recruiter keywords for the role
- [ ] Resume sections: header, summary, education (prominent for freshers), skills, projects/training,
      internship/experience, certifications, achievements, languages
- [ ] Auto-save + live preview
- [ ] ATS-safe templates (parse-tested against screening software)

### Milestone D — India-tuned ATS scoring
- [ ] Score = section completeness + keyword coverage + skills + quantified bullets, on the candidate's OWN content
- [ ] **Score breakdown + prioritised fixes** ("what to fix first"), not just a number

### Milestone E — Language & voice
- [ ] Speak or type in **Hindi & English** (Sarvam voice), output clean professional English resume
- [ ] Render Devanagari / Indian scripts correctly everywhere

### Milestone F — Multiple resumes & upload
- [ ] Create/keep multiple resumes; duplicate & tailor per job (beats Naukri's 1-resume limit)
- [ ] Upload existing PDF/Word CV → extract → AI improves it (uploaded file auto-deleted after processing)

### Milestone G — AI writing + local models
- [ ] Role-based skill suggestions (OpenAI)
- [ ] Grammar & spell via **local models** (keep free tier near-zero cost) — not a paid API
      (Full rewrite/shorten/expand toolkit is **Phase 2 — do not build now**)

### Milestone H — Export & sharing
- [ ] Shareable web resume link (public view)
- [ ] **PDF download requires login** (retention hook)
- [ ] DOCX download
- [ ] **Free basic build AND download** — no pay-to-download, no auto-charge, no silent renewal. Ever.

### Milestone I — Multi-tenant guardrails + usage tracking (Section 2)
- [ ] `tenant_id` on all rows, clean API boundary
- [ ] Per-tenant usage/cost logging into `usage_events`

---

## 6. NON-FUNCTIONAL REQUIREMENTS (test against these)
| Area | Requirement |
|---|---|
| Mobile-first | Design & test every screen on a small, low-end phone *before* desktop |
| Speed | First resume in 2–3 min · editor load < 2s · live preview < 500ms · ATS score < 10s |
| Languages | Hindi + English; correct Devanagari/Indian-script rendering on inputs and outputs |
| Accessibility | WCAG AA contrast, large tap targets |
| Privacy | Recruiter PII stripped before any AI use; uploaded resumes auto-deleted, never retained |
| Trust | Never pay-to-download or silent auto-renew; basic build + download stay free |

---

## 7. SUCCESS METRICS — instrument from day one
- Resume completion rate (target 80%+ of starters finish)
- Time to first resume (target 2–3 min)
- Avg ATS improvement (target +25% vs first draft)
- Cost per resume (OpenAI + Sarvam + hosting; free tier near-zero via local models)
Log the events needed to compute these into `usage_events`.

---

## 8. EXPLICITLY OUT OF SCOPE FOR AUG 1 (do NOT build)
NSQF/ITI full role coverage · additional languages beyond Hindi/English · regional-language resume *output* ·
placement-engine recruiter linking · interview prep · drag-and-drop reorder · version history · extra sections ·
full AI rewrite toolkit · TXT/JSON/email export · job tracker · admin analytics dashboards · assessments.
These are Phase 2/3. If tempted, stop — Aug 1 scope is ruthlessly fixed.

---

## 9. DEFINITION OF DONE (per feature)
1. Works on a low-end phone screen first.
2. Meets its speed NFR.
3. No PII reaches any AI call.
4. Carries `tenant_id` and logs a `usage_event` where relevant.
5. Green/blue/grey source coding correct where content is shown.
6. No pay-gate on basic build or download.
