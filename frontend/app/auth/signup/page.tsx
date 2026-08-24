'use client'

import { Suspense, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store'
import { takePostLoginRedirect, roleLandingPath, isServiceSlug, serviceDestination, SERVICES } from '@/lib/authRedirect'
import OAuthButtons from '@/components/OAuthButtons'
import AuthLayout from '@/components/auth/AuthLayout'
import AuthLoading from '@/components/auth/AuthLoading'
import PasswordInput from '@/components/auth/PasswordInput'

// useSearchParams() (for ?service=) requires a Suspense boundary for App
// Router static prerendering — the actual page logic lives in SignupForm.
export default function SignupPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <SignupForm />
    </Suspense>
  )
}

function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signup, isLoading } = useAuthStore()
  const submitting = useRef(false)

  const serviceParam = searchParams.get('service')
  const service = isServiceSlug(serviceParam) ? serviceParam : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting.current || isLoading) return
    submitting.current = true
    setError('')
    try {
      await signup(email, password, fullName)
      const freshUser = useAuthStore.getState().user
      const fallback = service ? serviceDestination(service) : (freshUser ? roleLandingPath(freshUser) : '/dashboard')
      router.push(takePostLoginRedirect(fallback))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed. Please try again.')
      submitting.current = false
    }
  }

  return (
    <AuthLayout serviceBadge={service ? { label: SERVICES[service].label } : null}>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Create your SahiCareer account</h1>
      <p className="text-sm text-gray-500 mb-6">One account for your complete career journey.</p>

      <OAuthButtons />

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="signup-name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input
            id="signup-name"
            type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
            placeholder="John Doe" required
            autoComplete="name"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300 focus:border-royal-400 transition-[box-shadow,border-color]"
          />
        </div>

        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            id="signup-email"
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" required
            autoComplete="email"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300 focus:border-royal-400 transition-[box-shadow,border-color]"
          />
        </div>

        <PasswordInput
          id="signup-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="At least 6 characters"
          minLength={6}
          required
        />

        <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5">
          {isLoading ? 'Creating account…' : 'Sign Up'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href={service ? `/auth/login?service=${service}` : '/auth/login'} className="text-navy-600 hover:underline font-medium">
          Log in
        </Link>
      </p>
    </AuthLayout>
  )
}
