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
}

export type OAuthProvider = 'google' | 'github'

interface AuthStore {
  user: User | null
  accessToken: string | null
  isLoading: boolean

  setUser: (user: User | null) => void
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

      setUser: (user) => set({ user }),

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
        if (state?.accessToken) {
          setAuthToken(state.accessToken)
        }
      },
    }
  )
)
