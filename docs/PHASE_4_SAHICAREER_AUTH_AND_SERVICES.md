# Phase 4 — SahiCareer Auth & Services (Resume Builder / AI Buddy / Mentorly)

**STATUS: ✅ IMPLEMENTED**

**Source of record:** [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md) Entries 13 (investigation) and 14 (implementation). Related: [PHASE_5_AI_BUDDY.md](PHASE_5_AI_BUDDY.md), [PHASE_6_MENTORLY.md](PHASE_6_MENTORLY.md).

---

## 1. Objective

Make SahiCareer's own dashboard — not Mentorly — the default landing destination after login, while (a) preserving deep-linking (a logged-out visit to a specific protected page returns the user to that same page after login) and (b) not breaking the admin/mentor-specific landing behavior that already existed. Also: make the public landing page's three service cards work correctly for both logged-in and logged-out visitors without being auto-bounced away first.

## 2. Final architecture (as implemented)

```
SahiCareer
│
├── Resume Builder   (/resumes/build — the role-guided creation flow;
│                      reached from /dashboard's own "Build from Role" /
│                      "Blank resume" buttons, and from the Sidebar nav)
├── AI Buddy         (/copilot)
└── Mentorly         (/mentorship)
```

**Default login destination** (no specific service requested):
```
Login → /dashboard
```

**Requested-service destination** (deep link, logged out) — confirmed working for all three services:
```
/copilot        → /auth/login → /copilot
/mentorship     → /auth/login → /mentorship
/resumes/build  → /auth/login → /resumes/build   (direct URL / sidebar link)
```

**Already-authenticated visit to `/auth/login`:**
```
/auth/login → /dashboard   (router.replace — does not stay in browser history)
```

**Public landing page's "Resume Builder" card** — per explicit product decision made after the first implementation pass (see §5): "Explore Resume Builder" on `/` now points to `/dashboard`, not directly to `/resumes/build`. A logged-in click goes straight to `/dashboard` (the resume hub — list, ATS scores, stats, and the actual "Build from Role"/"Blank resume" actions); a logged-out click goes through login and lands on `/dashboard` too, since that's already the default landing path for a normal user.

## 3. What changed

### 3.1 `frontend/lib/authRedirect.ts` — the root-cause fix

```ts
export function roleLandingPath(user: Pick<User, 'role' | 'mentor_status'>): string {
  if (user.role === 'admin') return '/admin/mentorship'
  if (user.mentor_status === 'approved') return '/mentorship/mentor/dashboard'
  return '/dashboard'   // was '/mentorship/dashboard'
}
```

Admin and approved-mentor landing paths are unchanged, per the original scope decision (only the plain-user default was in question). `setPostLoginRedirect`/`takePostLoginRedirect` (the `sessionStorage`-backed deep-link mechanism) were **not modified** — they already worked correctly; only the fallback they wrap was wrong.

### 3.2 `frontend/app/auth/login/page.tsx`

- Added a `useEffect` that redirects an already-authenticated visitor immediately: `router.replace(takePostLoginRedirect(roleLandingPath(user)))`, gated on `hasHydrated` to avoid a false pre-rehydration flash.
- Added `if (hasHydrated && user) return null` so the login form doesn't flash for one render before that redirect fires.
- Changed the post-submit redirect (a fresh login, not the already-authenticated case) from `router.push` to `router.replace`, so `/auth/login` never lingers in browser history after a successful login either way.

### 3.3 `frontend/app/page.tsx` (public landing page)

Removed the `useEffect(() => { if (user) router.push('/dashboard') }, ...)` that previously bounced a logged-in visitor away from `/` before they could ever see or click a service card. This was a direct blocker for the required test flows (a logged-in user must be able to open `/` and click "Explore Resume Builder" / "Talk to AI Buddy" / "Find a Mentor" directly). `/` is now always rendered, for both logged-in and logged-out visitors; the navbar/service cards remain the way to reach anywhere else.

### 3.4 `frontend/app/dashboard/page.tsx`

- Auth guard brought in line with the pattern used by `AppShell`/`MentorshipShell`: waits for `hasHydrated`, calls `setPostLoginRedirect(pathname)` before redirecting, and uses `router.replace` instead of a bare `router.push`. (In practice `setPostLoginRedirect` is a no-op for `/dashboard` specifically — see §3.6 — but the guard is now structurally consistent with every other protected page rather than a weaker one-off.)
- Added a "Your services" section (Resume Builder / AI Buddy / Mentorly cards, via the new `ServiceCards` component — §3.7) near the top of the page, making `/dashboard` a genuine hub for all three services, not just resumes. It does not auto-redirect to any of them.

### 3.5 `frontend/app/resumes/build/page.tsx` — a real bug found during verification

This page had its **own, third, independent** auth guard (`if (!user) router.push('/auth/login')`) that predated the `AppShell`/`MentorshipShell` pattern. It had two problems: it never waited for `hasHydrated` (a real risk of a false-flash logout on refresh), and it never called `setPostLoginRedirect` — meaning a logged-out deep link straight to `/resumes/build` would have been silently dropped, landing the user on the generic default after login instead of back on this page. Fixed to match the same pattern used everywhere else in the app. This was not part of the original plan — it surfaced only when each of the 15 required test flows was traced through the actual code rather than assumed correct.

### 3.6 A known, accepted quirk (not a bug introduced by this phase)

`setPostLoginRedirect(path)` has always deliberately no-op'd when `path === '/dashboard'` (added before this phase, on the reasoning that `/dashboard` was already the eventual fallback for a normal user, so there was nothing to "remember"). One side effect: if an **admin** or **approved mentor** were to deep-link to `/dashboard` specifically while logged out, they'd land on their own role-specific page after login (`/admin/mentorship` / `/mentorship/mentor/dashboard`) rather than `/dashboard` itself, because no deep link was recorded to override their role default. This is pre-existing behavior, not changed by this phase, and considered acceptable — those roles have their own intended landing pages regardless.

### 3.7 `frontend/components/services/ServiceCards.tsx` (new)

A small, reusable three-card grid (Resume Builder / AI Buddy / Mentorly), used by `/dashboard`. Deliberately kept separate from `frontend/components/landing/Services.tsx` (the public landing page's heavier, marketing-styled version with framer-motion and full feature lists) rather than refactoring a component that was already working correctly.

### 3.8 `frontend/components/landing/Services.tsx`

Initial implementation kept the pre-existing `/resumes/build` destination for the "Explore Resume Builder" card (per the original spec's explicit instruction). **After manual testing, the product decision changed**: the card now points to `/dashboard` instead — landing a user on the resume hub (list + stats + "Build from Role"/"Blank resume" actions) rather than dropping them straight into the role-picker creation flow. "Talk to AI Buddy" (`/copilot`) and "Find a Mentor" (`/mentorship`) were unaffected by this change.

## 4. Mentorly integration (unchanged — confirmed still accurate)

Same Next.js application, same deployment, same domain — not a separate app. Session sharing is automatic (`useAuthStore`, same `localStorage` key). The only separation is presentational: `MentorshipShell`/`MentorshipSidebar` plus `useBrandStore` for white-label branding. See [PHASE_6_MENTORLY.md](PHASE_6_MENTORLY.md).

## 5. Testing

The 15 required flows (logged-in/logged-out clicks on each of the three service cards, direct-URL deep links, normal/admin/mentor login destinations, already-authenticated `/auth/login` visits, refresh persistence, and the explicit "never `/mentorship/dashboard` on normal login" check) were verified by tracing each guard involved (`AppShell`, `MentorshipShell`, `authRedirect.ts`, and the page-local guards on `/dashboard` and `/resumes/build`) against the actual final code, plus an HTTP sanity check confirming all six touched routes render without a server error. **No browser-automation tool was available in this environment**, so this was not a literal click-through E2E run — flagged honestly rather than claimed as a full live test pass.

`npx tsc --noEmit` and `npm run build` both passed cleanly after every round of changes, including after the later `Services.tsx` href correction.

## 6. Security

The deep-link mechanism only ever accepts same-origin relative paths (`isSafePath()`: must start with `/`, must not start with `//`) — confirmed unchanged and already sufficient to reject external destinations (`https://...`) and protocol-relative open-redirect payloads (`//evil.com`). Not modified in this phase.

## 7. Known issues / open items

- The `/dashboard`-specific `setPostLoginRedirect` no-op quirk (§3.6) is accepted as-is.
- No automated regression test covers this routing logic end-to-end (it's pure client-side React state/routing) — verification was manual/code-trace only, per §5.

## 8. Rollback

All changes in this phase are frontend-only, client-side routing logic — no database, API, or backend changes. To roll back: revert `frontend/lib/authRedirect.ts`, `frontend/app/auth/login/page.tsx`, `frontend/app/page.tsx`, `frontend/app/dashboard/page.tsx`, `frontend/app/resumes/build/page.tsx`, `frontend/components/landing/Services.tsx`, and remove `frontend/components/services/ServiceCards.tsx`. No commit exists for this work as of this writing — see [AI_DEVELOPMENT_LOG.md](AI_DEVELOPMENT_LOG.md) Entry 14.
