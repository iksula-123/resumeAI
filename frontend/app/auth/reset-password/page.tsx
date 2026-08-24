'use client'

// Reset Password — the second half of the Forgot Password flow. When the
// user clicks the emailed link, Supabase's browser client (lib/
// supabaseClient.ts, detectSessionInUrl: true, already configured for the
// OAuth flow) automatically parses the URL and establishes a temporary
// "password recovery" session — the same mechanism auth/callback/page.tsx
// already relies on for OAuth, just a different Supabase auth event. This
// page listens for that event, then calls supabase.auth.updateUser()
// directly — still no backend endpoint, still the same single Supabase
// client already used everywhere else for real auth.
//
// After a successful reset we deliberately sign the temporary recovery
// session back out and send the user to /auth/login to authenticate
// normally through the EXISTING, unmodified /api/auth/login flow — so our
// own backend-issued session/profile-sync path is the only way anyone
// actually gets logged into the app, matching how every other page here
// already works.

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AuthLayout from '@/components/auth/AuthLayout'
import AuthLoading from '@/components/auth/AuthLoading'
import PasswordInput from '@/components/auth/PasswordInput'
import { passwordStrength } from '@/lib/passwordStrength'
import { isServiceSlug, SERVICES } from '@/lib/authRedirect'

type LinkState = 'checking' | 'valid' | 'invalid'

// useSearchParams() (for ?service=) requires a Suspense boundary for App
// Router static prerendering — the actual page logic lives in ResetPasswordForm.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <ResetPasswordForm />
    </Suspense>
  )
}

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [linkState, setLinkState] = useState<LinkState>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const submitting = useRef(false)

  // Carried through from Forgot Password's redirectTo (see that page) —
  // preserves "Continue to X" context across the whole email round-trip.
  const serviceParam = searchParams.get('service')
  const service = isServiceSlug(serviceParam) ? serviceParam : null
  const loginHref = service ? `/auth/login?service=${service}` : '/auth/login'
  const badge = service ? { label: SERVICES[service].label } : null

  useEffect(() => {
    let cancelled = false

    // 1. The recovery session may already be established by the time this
    //    effect runs (detectSessionInUrl processes it before React mounts).
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setLinkState('valid')
    })

    // 2. Otherwise, catch the PASSWORD_RECOVERY event as the SDK finishes
    //    parsing the URL asynchronously.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event === 'PASSWORD_RECOVERY' && session) setLinkState('valid')
    })

    // 3. If neither fires quickly, the link is missing/invalid/expired —
    //    never leave the user staring at a spinner forever.
    const timeout = setTimeout(() => {
      if (!cancelled) setLinkState((s) => (s === 'checking' ? 'invalid' : s))
    }, 4000)

    return () => { cancelled = true; sub.subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  const strength = passwordStrength(password)
  const mismatch = confirm.length > 0 && password !== confirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting.current || loading) return
    setError('')

    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    submitting.current = true
    setLoading(true)
    try {
      const { error: sbError } = await supabase.auth.updateUser({ password })
      if (sbError) {
        const msg = sbError.message.toLowerCase()
        if (msg.includes('weak') || msg.includes('at least')) {
          setError(sbError.message)
        } else if (msg.includes('expired') || msg.includes('invalid') || msg.includes('session')) {
          setLinkState('invalid')
        } else {
          setError('Could not update your password right now. Please try again.')
        }
        return
      }
      // Never leave the temporary recovery session active — the user logs
      // back in through the normal, unmodified /api/auth/login flow.
      await supabase.auth.signOut().catch(() => {})
      setDone(true)
    } catch {
      setError('Network error — please check your connection and try again.')
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  if (linkState === 'checking') {
    return (
      <AuthLayout serviceBadge={badge}>
        <div className="text-center py-6" aria-live="polite">
          <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-gray-500">Verifying your reset link…</p>
        </div>
      </AuthLayout>
    )
  }

  if (linkState === 'invalid') {
    return (
      <AuthLayout serviceBadge={badge}>
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4 text-2xl" aria-hidden="true">⚠</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">This reset link is invalid or has expired</h1>
          <p className="text-sm text-gray-500 mb-6">Reset links are single-use and expire after a while. Request a new one to continue.</p>
          <Link href={service ? `/auth/forgot-password?service=${service}` : '/auth/forgot-password'} className="btn-primary inline-flex px-6 py-2.5">Request a new link</Link>
        </div>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout serviceBadge={badge}>
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-full bg-good-50 text-good-600 flex items-center justify-center mx-auto mb-4 text-2xl" aria-hidden="true">✓</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Password updated successfully</h1>
          <p className="text-sm text-gray-500 mb-6">You can now log in with your new password.</p>
          <button onClick={() => router.push(loginHref)} className="btn-primary px-6 py-2.5">Continue to Login</button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout serviceBadge={badge}>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Reset your SahiCareer password</h1>
      <p className="text-sm text-gray-500 mb-6">Choose a strong password you haven&apos;t used before.</p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        <PasswordInput
          id="reset-password"
          label="New Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
          hint={
            <div className="mt-1.5">
              {password.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${(strength.score / 4) * 100}%`, backgroundColor: strength.color }}
                    />
                  </div>
                  <span className="text-xs font-medium shrink-0" style={{ color: strength.color }}>{strength.label}</span>
                </div>
              )}
              <p className="mt-1 text-xs text-gray-400">At least 8 characters, mixing upper/lowercase, numbers and symbols is stronger.</p>
            </div>
          }
        />

        <PasswordInput
          id="reset-confirm-password"
          label="Confirm New Password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          required
          hint={mismatch ? <p role="alert" className="mt-1 text-xs text-red-600">Passwords do not match.</p> : undefined}
        />

        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
          {loading ? 'Updating…' : 'Reset Password'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        <Link href={loginHref} className="text-navy-600 hover:underline font-medium">← Back to Login</Link>
      </p>
    </AuthLayout>
  )
}
