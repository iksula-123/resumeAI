'use client'

// Forgot Password — uses the EXISTING browser-side Supabase client
// (lib/supabaseClient.ts, the same one OAuth already uses) rather than a
// new backend endpoint. Supabase's resetPasswordForEmail() is designed to
// be called with just the anon key and, by GoTrue's own design, never
// reveals whether an account exists for the given email — so the "don't
// leak account existence" requirement is satisfied by the platform itself,
// not by anything invented here. No backend change, no second auth system.

import { Suspense, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthLayout from '@/components/auth/AuthLayout'
import AuthLoading from '@/components/auth/AuthLoading'
import { isServiceSlug, SERVICES } from '@/lib/authRedirect'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// useSearchParams() (for ?service=) requires a Suspense boundary for App
// Router static prerendering — the actual page logic lives in ForgotPasswordForm.
export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <ForgotPasswordForm />
    </Suspense>
  )
}

function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const submitting = useRef(false)
  const searchParams = useSearchParams()
  const serviceParam = searchParams.get('service')
  const service = isServiceSlug(serviceParam) ? serviceParam : null
  // Carried through the emailed link so Reset Password (and its own
  // "Continue to Login") can still show the same service context — the
  // ?service= the user arrived with isn't otherwise available once they
  // click the link in their email client.
  const loginHref = service ? `/auth/login?service=${service}` : '/auth/login'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting.current || loading) return

    const trimmed = email.trim()
    if (!trimmed) { setFieldError('Enter your email address.'); return }
    if (!EMAIL_RE.test(trimmed)) { setFieldError('Enter a valid email address.'); return }

    setFieldError('')
    setError('')
    submitting.current = true
    setLoading(true)
    try {
      const redirectTo = `${window.location.origin}/auth/reset-password${service ? `?service=${service}` : ''}`
      const { error: sbError } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo })
      if (sbError) {
        const msg = sbError.message.toLowerCase()
        if (msg.includes('rate limit') || msg.includes('too many')) {
          setError('Too many attempts. Please wait a few minutes and try again.')
        } else {
          // A genuine send failure (not an "account doesn't exist" signal —
          // GoTrue never reports that) — honest, not a fake success state.
          setError('Could not send the reset email right now. Please try again in a moment.')
        }
        return
      }
      // GoTrue never reveals whether the account exists — same message either way.
      setSent(true)
    } catch {
      setError('Network error — please check your connection and try again.')
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  if (sent) {
    return (
      <AuthLayout serviceBadge={service ? { label: SERVICES[service].label } : null}>
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-full bg-good-50 text-good-600 flex items-center justify-center mx-auto mb-4 text-2xl" aria-hidden="true">✓</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Check your email</h1>
          <p className="text-sm text-gray-500 mb-6">
            We&apos;ve sent password reset instructions if an account exists for this email.
          </p>
          <Link href={loginHref} className="btn-primary inline-flex px-6 py-2.5">Back to Login</Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout serviceBadge={service ? { label: SERVICES[service].label } : null}>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Forgot your password?</h1>
      <p className="text-sm text-gray-500 mb-6">
        Enter your email and we&apos;ll help you get back to your SahiCareer account.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            id="forgot-email"
            type="email" value={email}
            onChange={(e) => { setEmail(e.target.value); if (fieldError) setFieldError('') }}
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={!!fieldError}
            aria-describedby={fieldError ? 'forgot-email-error' : undefined}
            className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-[box-shadow,border-color] ${
              fieldError ? 'border-red-300 focus:ring-red-100 focus:border-red-400' : 'border-gray-200 focus:ring-royal-300 focus:border-royal-400'}`}
          />
          {fieldError && <p id="forgot-email-error" role="alert" className="mt-1 text-xs text-red-600">{fieldError}</p>}
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
          {loading ? 'Sending…' : 'Send Reset Link'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        <Link href={loginHref} className="text-navy-600 hover:underline font-medium">← Back to Login</Link>
      </p>
    </AuthLayout>
  )
}
