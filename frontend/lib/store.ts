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
  syncSession: (token: string) => Promise<void>
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isLoading: false,
      hasHydrated: false,

      setUser: (user) => set({ user }),
      setHasHydrated: (v) => set({ hasHydrated: v }),

      setAccessToken: (token) => {
        setAuthToken(token)
        set({ accessToken: token })
      },

      logout: () => {
        setAuthToken(null)
        set({ user: null, accessToken: null })
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
      syncSession: async (token) => {
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
          set({ user, accessToken: token })
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
          set({ user: data.user, accessToken: data.access_token })
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
          set({ user: data.user, accessToken: data.access_token })
        } finally {
          set({ isLoading: false })
        }
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
        state?.setHasHydrated(true)
      },
    }
  )
)
