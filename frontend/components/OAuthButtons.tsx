'use client'

import { useState } from 'react'
import { useAuthStore, type OAuthProvider } from '@/lib/store'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.42.36.8 1.08.8 2.18v3.23c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/>
    </svg>
  )
}

export default function OAuthButtons() {
  const { loginWithOAuth } = useAuthStore()
  const [pending, setPending] = useState<OAuthProvider | null>(null)
  const [error, setError] = useState('')

  const go = async (provider: OAuthProvider) => {
    setError('')
    setPending(provider)
    try {
      // This triggers a full-page redirect to the provider; nothing runs after
      // it on success. We only land here again if the redirect fails to start.
      await loginWithOAuth(provider)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start sign-in')
      setPending(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-red-700 text-xs">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => go('google')}
          disabled={pending !== null}
          className="flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
        >
          <GoogleIcon />
          {pending === 'google' ? '…' : 'Google'}
        </button>
        <button
          type="button"
          onClick={() => go('github')}
          disabled={pending !== null}
          className="flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
        >
          <GitHubIcon />
          {pending === 'github' ? '…' : 'GitHub'}
        </button>
      </div>

      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">or continue with email</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
    </div>
  )
}
