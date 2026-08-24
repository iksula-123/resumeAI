'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/lib/store'
import { takePostLoginRedirect, roleLandingPath } from '@/lib/authRedirect'

/**
 * OAuth landing page.
 *
 * Google/GitHub redirect the browser here with a one-time `?code=...`. The
 * Supabase client (detectSessionInUrl: true) automatically exchanges that code
 * for a session. We listen for the resulting session, hand its JWT to the
 * backend via syncSession() — which creates the profile and returns the role —
 * then send the user to the dashboard.
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const { syncSession } = useAuthStore()
  const [error, setError] = useState('')
  const done = useRef(false)

  useEffect(() => {
    // Phase 1B: forwards refresh_token/expires_at (already present on the
    // Supabase session — nothing new fetched here) so this session can be
    // silently refreshed later too, same as a password login. The OAuth
    // sign-in/PKCE/redirect mechanics below are otherwise untouched.
    const finish = async (session: { access_token: string; refresh_token?: string; expires_at?: number }) => {
      if (done.current) return
      done.current = true
      try {
        await syncSession(session.access_token, session.refresh_token, session.expires_at)
        const freshUser = useAuthStore.getState().user
        router.replace(takePostLoginRedirect(freshUser ? roleLandingPath(freshUser) : '/dashboard'))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Sign-in failed')
      }
    }

    // 1. Session may already be ready by the time this effect runs.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) finish(data.session)
    })

    // 2. Otherwise wait for the code→session exchange to complete.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) finish(session)
    })

    // 3. Safety net: if nothing happens in 8s, surface an error.
    const timer = setTimeout(() => {
      if (!done.current) setError('Sign-in timed out. Please try again.')
    }, 8000)

    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [router, syncSession])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
      <div className="flex flex-col items-center gap-3">
        {error ? (
          <>
            <div className="text-red-500 text-4xl">⚠️</div>
            <p className="text-gray-700 text-sm font-medium">Could not sign you in</p>
            <p className="text-gray-500 text-xs">{error}</p>
            <button
              onClick={() => router.replace('/auth/login')}
              className="mt-2 bg-navy-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-navy-700 transition"
            >
              Back to Login
            </button>
          </>
        ) : (
          <>
            <div className="w-12 h-12 border-4 border-navy-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Completing sign-in…</p>
          </>
        )}
      </div>
    </div>
  )
}
