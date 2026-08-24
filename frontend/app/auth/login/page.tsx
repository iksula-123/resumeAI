'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store'
import { takePostLoginRedirect, roleLandingPath, isServiceSlug, serviceDestination, SERVICES } from '@/lib/authRedirect'
import OAuthButtons from '@/components/OAuthButtons'
import AuthLayout from '@/components/auth/AuthLayout'
import AuthLoading from '@/components/auth/AuthLoading'
import PasswordInput from '@/components/auth/PasswordInput'

// useSearchParams() (for ?service=) requires a Suspense boundary for App
// Router static prerendering — the actual page logic lives in LoginForm.
export default function LoginPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, isLoading, user, hasHydrated } = useAuthStore()
  // Belt-and-suspenders against a double-submit (Enter + click, or a fast
  // double-click) racing past the store's own isLoading flag in the same tick.
  const submitting = useRef(false)

  // Optional ?service= context (e.g. /auth/login?service=resume-builder) —
  // set when the landing page's service cards send a logged-out visitor
  // here directly. Purely additive: when absent, every existing redirect
  // behavior below is unchanged.
  const serviceParam = searchParams.get('service')
  const service = isServiceSlug(serviceParam) ? serviceParam : null

  const landingPath = (u: NonNullable<typeof user>) =>
    service ? serviceDestination(service) : roleLandingPath(u)

  // Already signed in and landing on /auth/login directly (e.g. a stale
  // bookmark, browser back button, or clicking "Login" while logged in) —
  // send them straight to where they belong instead of showing the form
  // again. A pending deep link (someone was mid-redirect to a specific
  // service) still wins over the role-based default; replace() so the login
  // page doesn't linger in browser history.
  useEffect(() => {
    if (hasHydrated && user) {
      router.replace(takePostLoginRedirect(landingPath(user)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, user, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting.current || isLoading) return
    submitting.current = true
    setError('')
    try {
      await login(email, password)
      const freshUser = useAuthStore.getState().user
      router.replace(takePostLoginRedirect(freshUser ? landingPath(freshUser) : '/dashboard'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Check your credentials.')
      submitting.current = false
    }
  }

  // Avoid flashing the login form for one render while the redirect above
  // is in flight for an already-authenticated visitor.
  if (hasHydrated && user) return null

  return (
    <AuthLayout serviceBadge={service ? { label: SERVICES[service].label } : null}>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Welcome back</h1>
      <p className="text-sm text-gray-500 mb-6">Continue your career journey</p>

      <OAuthButtons />

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            id="login-email"
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" required
            autoComplete="email"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300 focus:border-royal-400 transition-[box-shadow,border-color]"
          />
        </div>

        <div>
          <PasswordInput
            id="login-password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />
          <div className="mt-1.5 text-right">
            <Link
              href={service ? `/auth/forgot-password?service=${service}` : '/auth/forgot-password'}
              className="text-xs text-navy-600 hover:underline font-medium"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5">
          {isLoading ? 'Logging in…' : 'Log In'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Don&apos;t have an account?{' '}
        <Link href={service ? `/auth/signup?service=${service}` : '/auth/signup'} className="text-navy-600 hover:underline font-medium">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  )
}
