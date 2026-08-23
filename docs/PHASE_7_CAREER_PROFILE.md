# Phase 7 — Career Profile (Career Vault)

**STATUS: 🔴 PLANNED — not implemented.** A narrower, related, already-existing feature (§2) must not be confused with this.

**Source of record:** direct code inspection, 2026-08-12. No development session for this phase has occurred.

---

## 1. Target concept (as specified — not yet built)

```
Career Profile
│
├── Personal Information
├── Experience
├── Skills
├── Projects
├── Education
├── Certifications
├── Achievements
├── Languages
├── Career Goals
└── Learning Progress
```

Intent: one reusable, canonical record of a user's career data that **feeds into**, rather than duplicating data across, Resume Builder, AI Buddy, ATS, and Mentorly — so a user doesn't have to re-enter the same experience/skills/education in four different places.

**This does not exist today as a unified concept.** The pieces below are real, but they are separate, per-feature data stores, not one shared profile.

## 2. What already exists that is related, but is NOT the Career Profile

### 2.1 `Resume.content` (the closest thing today)

Each saved `Resume` row already stores a rich, structured content blob — confirmed directly from `backend/routers/ats_engine.py::_resume_to_content()`: `personalInfo`, `summary`, `experience` (position, company, dates, current, bullets), `education` (degree, institution, dates), `skills` (name, level), `projects` (name, technologies, description), `certifications` (name), `languages` (name, proficiency), `achievements` (list), `interests` (list).

This is **almost the exact shape** of the target Career Profile — but it is scoped **per resume**, not per user. A user with 3 saved resumes has 3 separate copies of this data, potentially diverged, not one canonical source. There is no `career_profile`/`career_vault` table separate from `resumes`.

### 2.2 EduBridge "career record" (`/api/career-record`)

`backend/routers/career_record.py` (confirmed present, predates this session — see [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md) Entry 6) provides:
- `GET /api/career-record` — the current user's record
- `PUT /api/career-record` — create/update it
- `POST /api/career-record/ingest`, `/ingest/bulk` — bulk import from EduBridge's own LMS/college systems (admin-only bulk path)

Its own docstring calls it *"the source of the GREEN, verified data used to auto-fill a resume."* Its actual field set (confirmed in the router): `education`, `edubridge_training`, `certificates`, `college`, `course` — **plus nullable placeholder fields for a future `jree_score`/`personality`/`behavioural` assessment**, per the docstring ("Assessment fields… are nullable placeholders for Phase 2/3" — referring to *EduBridge's own internal phase numbering*, not this documentation set's Phase 2/3).

**This is meaningfully narrower than the target Career Profile**: it only carries verified education/training/certificate data sourced from EduBridge, not experience, projects, achievements, languages, career goals, or learning progress, and it is not currently wired to feed AI Buddy, ATS, or Mentorly directly (Needs verification of any indirect wiring not found in this pass).

## 3. Gap analysis — what Phase 7 would need to build

| Career Profile section | Nearest existing equivalent | Gap |
|---|---|---|
| Personal Information | `Resume.content.personalInfo` (per-resume) | Not user-scoped/canonical |
| Experience | `Resume.content.experience` (per-resume) | Not user-scoped/canonical |
| Skills | `Resume.content.skills` (per-resume) | Not user-scoped/canonical |
| Projects | `Resume.content.projects` (per-resume) | Not user-scoped/canonical |
| Education | `Resume.content.education` (per-resume) **and** `career_record.education` (EduBridge-verified) | Two different, unreconciled sources |
| Certifications | `Resume.content.certifications` (per-resume) **and** `career_record.certificates` | Two different, unreconciled sources |
| Achievements | `Resume.content.achievements` (per-resume) | Not user-scoped/canonical |
| Languages | `Resume.content.languages` (per-resume) | Not user-scoped/canonical |
| Career Goals | `mentorship` module's `career-goals` endpoints (§ [PHASE_6_MENTORLY.md](PHASE_6_MENTORLY.md)) | Scoped to Mentorly, not a general profile field |
| Learning Progress | **Not found anywhere** | Fully new |

## 4. Consumers this would need to feed (none currently wired to a shared profile)

- **Resume Builder** — would read from it to pre-fill a new resume instead of starting blank.
- **AI Buddy** — already does a lightweight, ad hoc version of this today (`/copilot`'s `profileContext`, built from the *first* resume in the list only — see [PHASE_5_AI_BUDDY.md](PHASE_5_AI_BUDDY.md) §1.1) — a real Career Profile would replace that improvised approach with a canonical source.
- **ATS** — Phase 3's `profile_completeness()` scoring is computed per-analysis from whichever resume was analyzed, not from a persistent profile.
- **Mentorly** — mentor/mentee profiles today are Mentorship-specific records (§ [PHASE_6_MENTORLY.md](PHASE_6_MENTORLY.md)), not derived from a shared Career Profile.

## 5. Recommendation (not a decision — for future scoping only)

Any real Phase 7 work should explicitly decide, before writing code:
1. Is the Career Profile a new table, or is `career_record` extended to carry the missing fields (experience, projects, achievements, languages, goals, learning progress)?
2. If a resume's content and the Career Profile can both hold (say) "experience," which one is the source of truth, and how do edits in one propagate (or not) to the other?
3. Does creating a new resume start from the Career Profile by default, or remain opt-in?

This document does not answer these questions — they are open decisions for whoever scopes actual Phase 7 work.

## 6. Rollback

N/A — nothing has been built for this phase.
