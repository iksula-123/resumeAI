import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { setAuthToken } from './api'
import { supabase } from './supabaseClient'

export interface User {
  id: string
  email: string
  full_name: string
  role: 'user' | 'admin'
  avatar_url?: string | null
  subscription_tier: 'free' | 'pro' | 'enterprise'
  /** null = not a mentor; else the mentor application's status. */
  mentor_status?: 'pending' | 'approved' | 'rejected' | 'suspended' | null
  headline?: string | null
  phone?: string | null
  location?: string | null
  linkedin_url?: string | null
  github_url?: string | null
  website_url?: string | null
}

export type OAuthProvider = 'google' | 'github'

interface AuthStore {
  user: User | null
  accessToken: string | null
  /** Phase 1B — optional: absent for any session established before this
   * change, and for demo-mode logins (no real Supabase project configured).
   * When present, enables a silent session refresh instead of the previous
   * hard-logout-on-expiry; when absent, behavior is exactly what it was
   * before Phase 1B — nothing regresses for an already-logged-in user. */
  refreshToken: string | null
  /** Phase 1B — unix seconds the CURRENT access token expires at, used only
   * to schedule a proactive silent refresh ahead of time. Never trusted for
   * any authorization decision — the backend independently re-validates
   * every request regardless of what this says (see services/auth.py's
   * verify_token, unchanged by Phase 1B). */
  expiresAt: number | null
  isLoading: boolean
  /** False until the persisted session has been read back from localStorage.
   * Route guards (AppShell/MentorshipShell/AdminMentorshipShell) must wait
   * for this before redirecting on `!user` — otherwise a hard refresh or a
   * direct URL visit sees the one-render `user: null` flash that happens
   * before rehydration completes and wrongly bounces a logged-in user to
   * /auth/login. */
  hasHydrated: boolean

  setUser: (user: User | null) => void
  setHasHydrated: (v: boolean) => void
  setAccessToken: (token: string | null) => void
  logout: () => void
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, fullName: string) => Promise<void>
  loginWithOAuth: (provider: OAuthProvider) => Promise<void>
  syncSession: (token: string, refreshToken?: string | null, expiresAt?: number | null) => Promise<void>
  /** Phase 1B — exchange the stored refresh token for a new access token.
   * Throws on failure (no refresh token, or the backend rejects it) so
   * callers (api.ts's 401 handler, the proactive timer below) can fall
   * back to the existing hard-logout behavior exactly as before. */
  refreshSession: () => Promise<void>
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ── Phase 1B — proactive silent refresh ──────────────────────────────────────
// Schedules a refresh a bit before the access token's own expiry, so an
// active user almost never actually hits api.ts's reactive 401-retry path
// (that stays as the safety net for a missed/late timer — laptop asleep,
// background tab throttling, a slow clock, etc.). Only used for password-
// login/signup sessions — see the module-scope onAuthStateChange listener
// below for why OAuth sessions are handled differently.
let _refreshTimer: ReturnType<typeof setTimeout> | null = null

function clearScheduledRefresh() {
  if (_refreshTimer) {
    clearTimeout(_refreshTimer)
    _refreshTimer = null
  }
}

function scheduleRefresh(expiresAt: number | null | undefined, run: () => void) {
  clearScheduledRefresh()
  if (!expiresAt) return
  const msUntilExpiry = expiresAt * 1000 - Date.now()
  if (msUntilExpiry <= 0) return // already expired — the reactive 401 path in api.ts handles this
  // Refresh at 90% of the remaining lifetime; floor 10s so a near-immediately-
  // expiring token can't refresh-loop, cap 24h so a long-lived token doesn't
  // schedule a multi-day setTimeout.
  const delay = Math.min(Math.max(msUntilExpiry * 0.9, 10_000), 24 * 60 * 60 * 1000)
  _refreshTimer = setTimeout(run, delay)
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      isLoading: false,
      hasHydrated: false,

      setUser: (user) => set({ user }),
      setHasHydrated: (v) => set({ hasHydrated: v }),

      setAccessToken: (token) => {
        setAuthToken(token)
        set({ accessToken: token })
      },

      logout: () => {
        clearScheduledRefresh()
        setAuthToken(null)
        set({ user: null, accessToken: null, refreshToken: null, expiresAt: null })
        // also clear any Supabase OAuth session
        supabase.auth.signOut().catch(() => {})
      },

      // Kick off an OAuth redirect to Google / GitHub. Supabase sends the user
      // to the provider, then back to /auth/callback with a one-time code.
      loginWithOAuth: async (provider) => {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        })
        if (error) throw new Error(error.message)
      },

      // After OAuth (or any Supabase session), exchange the Supabase JWT with our
      // backend. /api/auth/me verifies the token, auto-creates the profile row,
      // and returns the user with its role — which we store like a normal login.
      // Phase 1B: refreshToken/expiresAt are optional third/fourth params — the
      // OAuth callback page passes them from the Supabase session it already
      // has; deliberately NOT scheduling our own proactive timer for this path
      // (see the module-scope onAuthStateChange listener below for why).
      syncSession: async (token, refreshToken, expiresAt) => {
        set({ isLoading: true })
        try {
          const res = await fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.detail || 'Session sync failed')
          }
          const user = await res.json()
          setAuthToken(token)
          set({ user, accessToken: token, refreshToken: refreshToken ?? null, expiresAt: expiresAt ?? null })
        } finally {
          set({ isLoading: false })
        }
      },

      login: async (email, password) => {
        set({ isLoading: true })
        try {
          const res = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.detail || 'Login failed')
          }
          const data = await res.json()
          setAuthToken(data.access_token)
          set({
            user: data.user, accessToken: data.access_token,
            refreshToken: data.refresh_token ?? null, expiresAt: data.expires_at ?? null,
          })
          scheduleRefresh(data.expires_at, () => { get().refreshSession().catch(() => {}) })
        } finally {
          set({ isLoading: false })
        }
      },

      signup: async (email, password, fullName) => {
        set({ isLoading: true })
        try {
          const res = await fetch(`${API_URL}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, full_name: fullName }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.detail || 'Signup failed')
          }
          const data = await res.json()
          setAuthToken(data.access_token)
          set({
            user: data.user, accessToken: data.access_token,
            refreshToken: data.refresh_token ?? null, expiresAt: data.expires_at ?? null,
          })
          scheduleRefresh(data.expires_at, () => { get().refreshSession().catch(() => {}) })
        } finally {
          set({ isLoading: false })
        }
      },

      // Phase 1B — the password-login refresh path. Throws on failure so
      // api.ts's 401 handler can fall back to hard-logout exactly as before
      // Phase 1B; never called for an OAuth-originated session (those have
      // no refreshToken scheduled against this path — see syncSession above).
      refreshSession: async () => {
        const { refreshToken } = get()
        if (!refreshToken) throw new Error('No refresh token available')
        const res = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Session refresh failed')
        }
        const data = await res.json()
        setAuthToken(data.access_token)
        set({
          user: data.user, accessToken: data.access_token,
          // Supabase rotates the refresh token on every use — fall back to
          // the current one only if the response somehow omitted a new one.
          refreshToken: data.refresh_token ?? refreshToken,
          expiresAt: data.expires_at ?? null,
        })
        scheduleRefresh(data.expires_at, () => { get().refreshSession().catch(() => {}) })
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        // IMPORTANT: never reference the `useAuthStore` binding in here — the
        // persist middleware invokes this callback synchronously as part of
        // `create()`'s own evaluation, before the `const useAuthStore = ...`
        // assignment completes. Referencing it throws a TDZ ReferenceError
        // that zustand swallows silently, so `hasHydrated` would just never
        // get set — no crash, no error, the shells just render null forever.
        // Call the action off the callback's own `state` snapshot instead
        // (it carries the same live, bound action functions).
        if (state?.accessToken) {
          setAuthToken(state.accessToken)
        }
        // Phase 1B — reschedule the proactive refresh after a hard reload/
        // new tab. A session with no expiresAt/refreshToken (pre-Phase-1B,
        // demo mode, or an OAuth session — see below) simply has nothing to
        // schedule here, matching prior behavior exactly.
        if (state?.expiresAt && state?.refreshToken) {
          scheduleRefresh(state.expiresAt, () => {
            state.refreshSession().catch(() => {})
          })
        }
        state?.setHasHydrated(true)
      },
    }
  )
)

// ── Phase 1B — OAuth session refresh ─────────────────────────────────────────
// OAuth sessions are refreshed by the Supabase browser client's own
// autoRefreshToken timer (supabaseClient.ts's config is untouched by Phase
// 1B). We deliberately never run a second, competing refresh cycle against
// the SAME rotating refresh token for these sessions — Supabase invalidates
// a refresh token once it's used, so two independent refreshers racing each
// other would intermittently knock one another's session out. Instead,
// whenever the Supabase client refreshes in the background, mirror the new
// tokens into our own store so app API calls (which never talk to the
// Supabase client directly — see lib/api.ts) keep using a live access
// token. Registered once, at module scope: this listener lives for the
// browser tab's lifetime, not tied to the OAuth callback page specifically
// (that page only handles the ONE-TIME initial handoff — see
// app/auth/callback/page.tsx).
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED' && session) {
    // SECURITY: only apply this if it still matches the app's current
    // user. Two things make this necessary, not just defensive:
    //   1. This is a browser-wide singleton listener — a background
    //      refresh for a session left behind by a DIFFERENT person on a
    //      shared machine must never overwrite the current app user's
    //      tokens (mirrors the same check in api.ts's tryRefresh()).
    //   2. It's what makes an automatic session-expiry (handleSessionExpired
    //      in api.ts, which calls logout() and so sets `user: null`) stick
    //      immediately — without this check, a TOKEN_REFRESHED event that
    //      was already in flight at that exact moment could otherwise
    //      silently repopulate auth-storage right after it was cleared.
    const currentUserId = useAuthStore.getState().user?.id
    if (!currentUserId || session.user?.id !== currentUserId) return
    setAuthToken(session.access_token)
    useAuthStore.setState({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at ?? null,
    })
  }
})
