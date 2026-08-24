const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

let _token: string | null = null

export function setAuthToken(token: string | null) {
  _token = token
}

/** Called on a 401 — the session expired or is invalid. Clear it and send to login. */
export function handleSessionExpired() {
  if (typeof window === 'undefined') return
  _token = null
  try {
    window.localStorage.removeItem('auth-storage')
  } catch { /* ignore */ }
  // Fire-and-forget: also clear the live in-memory Zustand state (not just
  // the persisted localStorage key) and sign out of the Supabase client.
  // Without this, a residual Supabase OAuth session could linger and let
  // the module-scope TOKEN_REFRESHED listener in store.ts silently
  // repopulate auth-storage right after we just cleared it — that listener
  // only accepts a refreshed session whose user id matches the CURRENT app
  // user (see store.ts), which is exactly why clearing `user` here first
  // (via logout()) is what makes that guard effective immediately, even if
  // a refresh happened to be in flight at the same moment.
  clearLiveSessionOnExpiry()
  if (!window.location.pathname.startsWith('/auth/')) {
    window.location.href = '/auth/login?expired=1'
  }
}

function clearLiveSessionOnExpiry(): void {
  // Dynamic import (not a top-level import) deliberately avoids a static
  // circular-import cycle with store.ts, same reasoning as tryRefresh()
  // below. logout() already does exactly what an automatic expiry needs:
  // clears user/accessToken/refreshToken/expiresAt, cancels the scheduled
  // proactive-refresh timer, and calls supabase.auth.signOut() (itself
  // already guarded with .catch(() => {}), so no unhandled rejection here
  // either).
  import('./store')
    .then(({ useAuthStore }) => useAuthStore.getState().logout())
    .catch(() => { /* best-effort — localStorage was already cleared above */ })
}

/** Resolve the auth token: prefer the in-memory token, fall back to persisted store. */
function resolveToken(): string | null {
  if (_token) return _token
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem('auth-storage')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const token = parsed?.state?.accessToken ?? null
    if (token) _token = token // cache it back
    return token
  } catch {
    return null
  }
}

// ── Phase 1B — one silent refresh-and-retry attempt on a 401 ────────────────
// Before Phase 1B, ANY 401 hard-logged the user out immediately, even if
// their session was perfectly recoverable (an expired-but-refreshable
// access token). Now: try exactly one refresh, retry the original request
// once if it succeeds, and only fall back to the original hard-logout
// behavior if the refresh itself fails (no refresh token available, or the
// backend rejects it) — which is exactly what happens today for a session
// with no refresh token at all (backward compatible by construction, not
// by a special case).
//
// _refreshPromise de-dupes concurrent 401s from several simultaneous
// requests into exactly one refresh call, not one per request — important
// because Supabase rotates refresh tokens on use, so a second concurrent
// refresh attempt with the now-stale token would itself fail.
let _refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = (async () => {
    // Dynamic imports here (not a top-level import) deliberately avoid a
    // static circular-import cycle with store.ts, which already imports
    // setAuthToken from this file.
    const { supabase } = await import('./supabaseClient')
    const { useAuthStore } = await import('./store')

    // Prefer the Supabase browser client's own session when one exists —
    // the OAuth case. getSession() transparently refreshes a stale cached
    // session itself; using its result here means we never independently
    // call our own /api/auth/refresh with an OAuth-originated refresh
    // token, which could otherwise race the Supabase client's own
    // autoRefreshToken cycle over the same rotating token (see store.ts's
    // module-scope onAuthStateChange listener for the other half of this).
    //
    // SECURITY: the Supabase client is a single browser-wide singleton —
    // its cached session has NO guaranteed relationship to whichever app
    // user is currently signed in via Zustand (e.g. a stale OAuth session
    // left behind by a previous person on a shared/public machine). Only
    // ever accept it here if its user id matches the app's OWN current
    // user id; otherwise fall through to the password-refresh-token path
    // below rather than silently swapping who this request authenticates
    // as. This identity is never taken from anything client-suppliable —
    // both sides of the comparison are already-trusted, previously
    // established session state.
    try {
      const { data } = await supabase.auth.getSession()
      const currentUserId = useAuthStore.getState().user?.id
      if (
        data.session?.access_token &&
        currentUserId &&
        data.session.user?.id === currentUserId
      ) {
        setAuthToken(data.session.access_token)
        useAuthStore.setState({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at ?? null,
        })
        return true
      }
    } catch {
      // fall through to the password-login refresh path below
    }

    // No live Supabase-client session — a password-login/signup session
    // (or one from before Phase 1B, which has no refreshToken and will
    // correctly fail here, preserving the exact prior behavior).
    const refreshToken = useAuthStore.getState().refreshToken
    if (!refreshToken) return false
    try {
      await useAuthStore.getState().refreshSession()
      return true
    } catch {
      return false
    }
  })()
  try {
    return await _refreshPromise
  } finally {
    _refreshPromise = null
  }
}

async function request<T>(path: string, options?: RequestInit, _isRetry = false): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  const token = resolveToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (response.status === 401) {
    if (!_isRetry) {
      const refreshed = await tryRefresh()
      if (refreshed) {
        return request<T>(path, options, true)
      }
    }
    handleSessionExpired()
    throw new Error('Your session expired — please log in again.')
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }))
    throw new Error(error.detail || `Request failed (${response.status})`)
  }

  if (response.status === 204) return undefined as T
  return response.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
