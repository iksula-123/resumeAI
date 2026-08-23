'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store'
import { takePostLoginRedirect, roleLandingPath } from '@/lib/authRedirect'
import OAuthButtons from '@/components/OAuthButtons'
import Logo from '@/components/Logo'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const { login, isLoading, user, hasHydrated } = useAuthStore()

  // Already signed in and landing on /auth/login directly (e.g. a stale
  // bookmark, browser back button, or clicking "Login" while logged in) —
  // send them straight to where they belong instead of showing the form
  // again. A pending deep link (someone was mid-redirect to a specific
  // service) still wins over the role-based default; replace() so the login
  // page doesn't linger in browser history.
  useEffect(() => {
    if (hasHydrated && user) {
      router.replace(takePostLoginRedirect(roleLandingPath(user)))
    }
  }, [hasHydrated, user, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      const freshUser = useAuthStore.getState().user
      router.replace(takePostLoginRedirect(freshUser ? roleLandingPath(freshUser) : '/dashboard'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Check your credentials.')
    }
  }

  // Avoid flashing the login form for one render while the redirect above
  // is in flight for an already-authenticated visitor.
  if (hasHydrated && user) return null

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-royal-50 via-white to-teal-50 p-4">
      <div className="w-full max-w-md glass-card p-8 animate-fade-up">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <Logo size={36} />
          <span className="font-bold text-gray-900">SahiCareer <span className="font-normal text-gray-500">· My Resume</span></span>
        </div>

        <h1 className="text-xl font-bold text-center text-gray-900 mb-1">Welcome back</h1>
        <p className="text-sm text-gray-500 text-center mb-6">Log in to continue building your resume</p>

        <OAuthButtons />

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300"
            />
          </div>

          <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5">
            {isLoading ? 'Logging in…' : 'Log In'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link href="/auth/signup" className="text-navy-600 hover:underline font-medium">Sign up</Link>
        </p>
      </div>
    </div>
  )
}
