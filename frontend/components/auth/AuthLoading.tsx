'use client'

// Suspense fallback for the auth pages that read useSearchParams() (needed
// for App Router static prerendering — see each page's <Suspense> wrapper).
// Wrapped in the same AuthLayout so there's no layout flash before the
// real content swaps in.

import AuthLayout from './AuthLayout'

export default function AuthLoading() {
  return (
    <AuthLayout>
      <div className="text-center py-6" aria-live="polite">
        <div className="w-8 h-8 border-2 border-navy-600 border-t-transparent rounded-full animate-spin mx-auto" aria-hidden="true" />
      </div>
    </AuthLayout>
  )
}
