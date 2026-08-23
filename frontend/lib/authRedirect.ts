/**
 * Remembers where an unauthenticated user was trying to go, so login/signup
 * (including the OAuth round-trip through /auth/callback) can send them back
 * there instead of always landing on /dashboard. sessionStorage survives the
 * full-page redirect OAuth requires, unlike React state or a query param that
 * Supabase's redirect flow doesn't echo back.
 */
import type { User } from './store'

const KEY = 'post-login-redirect'

/** Where a user lands right after login/signup when there's no pending deep
 * link: admins go to the mentorship admin console, approved mentors to their
 * mentor dashboard, everyone else to the SahiCareer dashboard — NOT Mentorly.
 * SahiCareer is the main platform; Mentorly is one of three services reached
 * from it (see frontend/components/landing/Services.tsx / /dashboard). */
export function roleLandingPath(user: Pick<User, 'role' | 'mentor_status'>): string {
  if (user.role === 'admin') return '/admin/mentorship'
  if (user.mentor_status === 'approved') return '/mentorship/mentor/dashboard'
  return '/dashboard'
}

/** Only accept same-origin relative paths — never an absolute/external URL. */
function isSafePath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//')
}

export function setPostLoginRedirect(path: string) {
  if (typeof window === 'undefined' || !isSafePath(path) || path === '/dashboard') return
  try { window.sessionStorage.setItem(KEY, path) } catch { /* ignore */ }
}

/** A pending deep link wins; otherwise falls back to the given role-based
 * landing path (pass `roleLandingPath(user)`). */
export function takePostLoginRedirect(fallback = '/dashboard'): string {
  if (typeof window === 'undefined') return fallback
  try {
    const path = window.sessionStorage.getItem(KEY)
    window.sessionStorage.removeItem(KEY)
    return path && isSafePath(path) ? path : fallback
  } catch {
    return fallback
  }
}
