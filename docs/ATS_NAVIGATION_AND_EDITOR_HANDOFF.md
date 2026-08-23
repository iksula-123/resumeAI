# ATS Checker → Resume Builder navigation & data handoff

This file documents the ATS Checker's "Improve My Resume" and "Target a
Role" flows — how a resume gets from `/ats-checker` into the Resume
Builder editor with real data, and how a role gets scored for Role
Readiness. It's the navigation/data-flow counterpart to
[ATS_CHANGELOG.md](ATS_CHANGELOG.md) (which is scoring-only): **nothing
in this file changed any ATS score, weight, formula, or
`SCORING_ENGINE_VERSION`** — every fix below is either a state/data-flow
bug in `frontend/app/ats-checker/page.tsx` / `frontend/app/resumes/[id]/edit/page.tsx`,
or an honest, non-inventing extraction fix in `resume_parser.py` that
feeds the SAME already-computed data into the editor instead of losing it.

---

## Bug A — "Improve My Resume" lost data for uploaded/pasted resumes

**Symptom:** clicking "Improve My Resume" after checking a saved resume
worked correctly, but after checking an *uploaded or pasted* resume it
opened a completely blank `/resumes/new` — the real parsed data (name,
experience, skills, everything) was gone.

**Root cause:** the button always navigated straight to either the saved
resume's own editor URL, or `/resumes/new`, with no persistence step in
between for the upload/paste case — there was nowhere for the already-parsed
resume to go.

**Fix:**
- `resume_parser.to_content(resume)` — an honest, non-inventing mapping
  from the parser's internal shape to the Resume Builder's `content`
  shape (every field is copied verbatim from what was actually parsed,
  or left empty; nothing is guessed). Shared with `resume_improver.tailor()`'s
  pre-existing no-AI fallback rather than duplicated.
- `POST /api/ats/v2/check` additively returns `resume_content` (only for
  the non-saved-resume case) and `resume_id`/`report_id`.
- `ats-checker/page.tsx`'s `improveMyResume()`:
  - **Saved resume** (`usingSavedResume && selectedResumeId`): navigates
    straight to that resume's own editor — unchanged, exactly as before.
  - **Uploaded/pasted resume**: persists `checkResult.resume_content` via
    the *existing* `POST /api/resumes/` endpoint (the same one Tailor /
    Save-As-New already use elsewhere on this page) to get a real
    `resume_id`, then navigates to that resume's editor. Light ATS
    context (`from=ats-checker`, `role`, `roleTitle`, `report_id`) is
    passed via URL query params only — **never the full resume JSON in
    the URL**, per the persistence-first requirement this was built to.
- `resumes/[id]/edit/page.tsx` shows a dismissible banner when
  `from=ats-checker` is present ("This resume came from ATS analysis. Target
  role: X.") and, if `report_id` is present, prefills the existing JD box
  from that report — reusing the pre-existing JD/`scoreAts()` flow, never
  auto-triggering a new scan.

## Bug B — "Target a Role" appeared to do nothing (stale closure)

**Symptom:** picking a role from the search dropdown showed no result —
indistinguishable from the button not working at all.

**Root cause:** `pickRole()` called `setSelectedRole(role)` and then
immediately `runCheck({ includeRole: true })` in the same tick. React
state updates aren't synchronous, so `runCheck`'s own closure still read
the *previous* `selectedRole` (`null` on first use), silently omitting
`target_role` from the request. The backend correctly returned
`role_readiness: { available: false }` for a request with no role — the
backend was never the problem.

**Fix:** `runCheck()` accepts an optional `roleOverride` argument;
`pickRole()` passes the just-picked role straight through
(`runCheck({ includeRole: true, roleOverride: role })`) instead of relying
on state that hasn't re-rendered yet.

---

## Bugs found during the live browser acceptance test (this phase)

Four additional, real bugs were found only by actually clicking through
the app end-to-end (not by code review or the unit suite) — each is
documented here because none of them were part of the original two-bug
brief, and each required its own root-cause fix.

### Bug C — `to_content()`'s `endDate` could overflow the DB column and crash the whole save

**Symptom:** for a real uploaded DOCX where the source resume crammed
title/company/dates onto one line (a one-line table row), "Improve My
Resume" failed outright with "Failed to fetch" — the entire persist step
aborted, losing all the resume's data, not just the one bad field.

**Root cause:** `_parse_experience_section()` (unmodified — this is the
resume parser's existing, pre-existing line-attribution heuristic used
for ATS scoring, out of scope to change) falls back to keeping an
un-splittable line as a whole in `duration` when it can't confidently
separate title/company/dates. `to_content()` passed that straight through
into `endDate`, and `POST /api/resumes/` inserts it into
`experiences.end_date` — a `VARCHAR(50)` column (`models.py`). A longer
line raised `asyncpg.exceptions.StringDataRightTruncationError`,
which FastAPI surfaced as an unhandled 500 (browsers sometimes report
this class of failure as a generic "Failed to fetch"/CORS-looking error
rather than exposing the real status).

**Fix:** `to_content()` now caps `endDate` to 50 characters before it's
ever used for persistence (`resume_parser.py`'s `_fit()` helper).
Truncating already-real text to fit a display column is not "inventing"
anything, and is strictly better than the previous behavior of crashing
the entire save and losing every other field too. Nothing about
`_parse_experience_section()` itself, or any score that depends on it,
was touched.

### Bug D — the no-AI heuristic parser always discarded name/email/phone, even when they were plainly present

**Symptom:** pasting a resume whose AI parse call happened to fail/be
rate-limited (a real, observed condition under load — falls back to the
heuristic parser by design) produced an editor with the correct
Experience/Education/Skills but a blank "John Doe" placeholder for name,
email, and phone — even though the ATS report's own "Contact / Essential
Information" sub-score correctly showed 100% (that score is computed by
a separate, already-existing regex check over the raw text, so "detected
for scoring" and "extracted for the editor" had silently diverged).

**Root cause:** `_heuristic_parse()` (the deterministic, non-AI fallback)
unconditionally hardcoded `full_name`/`email`/`phone`/`location` to `None`
— by original design it only ever extracted structured *sections*
(experience/education/skills/etc.), never the header/contact block above
them, even when that block was unambiguous.

**Fix (`resume_parser.py`):**
- `email`/`phone` are now extracted via `_EMAIL_RE`/`_PHONE_RE` — the
  *exact same* regexes `text_metrics.py` already uses to compute the
  Contact/Essential-Information score, imported rather than
  reimplemented, so detection can never disagree between the score and
  the handoff.
- `full_name` uses a new, strict `_looks_like_a_name_line()` check against
  only the resume's very first non-empty line (the near-universal
  convention): rejects anything with a digit, an email/phone match, list
  punctuation, more than 5 words, or a recognized section heading. If the
  first line doesn't clearly read as a name, `full_name` stays `None` —
  never guessed. `location` is intentionally still left unextracted here
  (no safe, unambiguous deterministic signal for it exists — guessing
  would risk misreading a company name as a city).
- Verified via `grep` that `full_name`/`email`/`phone` are consumed *only*
  by `to_content()`/`resume_improver.py`'s personal-info mapping —
  **never by any scoring function** — so this only improves what the
  editor handoff carries forward; it cannot move any score.

### Bug E — role search could show results for the wrong query (out-of-order response race)

**Symptom:** searching "Java Developer" in the Target-a-Role box
occasionally returned an unrelated role (e.g. "Sales Executive") as the
top/only result.

**Root cause:** the role-search `useEffect` (debounced, races an 8s
timeout) had no guard against out-of-order network responses. Opening the
role panel fires an initial empty-query search; typing a real query fires
a second one. Under real backend load, nothing guaranteed the two
resolved in the order they were sent — if the earlier (empty-query,
effectively "popular roles") response happened to land *after* the
correct one, it silently overwrote it via a bare `setRoleOptions(...)`
with no staleness check.

**Fix:** a `latestRoleQueryRef` tracks the query the most-recently-fired
request is for; each response is only applied to state
(`setRoleOptions`/`setRoleSearchError`/`setRoleSearching`) if it still
matches the latest fired query at resolution time. Debounce timing,
request shape, and the 8s timeout are all unchanged.

### Bug F (environment, not app code) — a stale `.env.local` value could silently override the intended backend

During this phase's acceptance test, `NEXT_PUBLIC_API_URL` was set via
an inline shell prefix (`NEXT_PUBLIC_API_URL="http://localhost:8030" npx next dev`)
rather than in `frontend/.env.local`, which still had the developer's own
default (`http://localhost:8000`) checked out. Next.js's dev server
re-reads `.env*` files on incremental rebuilds; once a source edit
triggered a recompile of the touched page's chunk, that specific chunk
was rebuilt using `.env.local`'s value, while other, not-yet-recompiled
chunks kept the shell-provided value — meaning **different parts of the
same page silently started calling two different backends**, and the ATS
Checker's `POST /api/ats/v2/check` call intermittently 404'd against the
old, pre-Phase-G backend port.

This is not a defect in the ATS Checker or Resume Builder code — it's a
local dev-environment setup pitfall worth recording: **always point
`NEXT_PUBLIC_API_URL` at the intended backend via `.env.local` itself
(not only a shell-level override) before a multi-step live test**, and
verify the actually-served bundle (`curl` the built JS chunk and grep for
the host) rather than trusting that a shell env var stays applied across
the whole dev session.

### Hardening — "Improve My Resume" now also waits out any in-flight check

Not a confirmed reproducible bug (two dedicated, isolated repro attempts
targeting the same interaction both completed correctly with full real
data), but a real gap found while chasing one: the button was only
disabled by `creatingResume`, not by `checking`/`roleChecking`/`jobChecking`.
It's now disabled while *any* check is still in flight, so a click can
never race a still-resolving `/api/ats/v2/check` response for the exact
state (`checkResult.resume_content`) it's about to read. Cheap,
unambiguously correct, and closes the class of concern regardless of how
rare the underlying race actually was.

---

## How to verify

- `pytest backend/tests/test_ats_navigation_handoff.py` — 9/9: `to_content()`
  field preservation/non-invention/DB-column capping, the heuristic
  parser's name/email/phone extraction and its refusal to guess an
  ambiguous first line, and the Role Readiness backend contract Bug B's
  fix relies on.
- `cd frontend && npx tsc --noEmit && npx next build` — clean.
- Live browser click-through (Playwright): saved/uploaded/pasted resume →
  "Improve My Resume" → editor opens with real personal info, experience,
  education, skills, certifications (field-verified via actual input
  values and the read-only preview pane, not just URL changes); "Target a
  Role" → role search → Role Readiness (own label, own score, no JD
  required); role + Job Match both computed in the same session → all
  three modes render simultaneously as genuinely separate `/100` scores
  under their own headings; insufficient JD ("java developer") → honest
  "Insufficient job description" message, no score, no fabricated
  percentage; refresh / navigate away and back → no crash, no stale data
  bleed between sessions.
