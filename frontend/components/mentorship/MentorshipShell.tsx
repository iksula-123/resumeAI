'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { useBrandStore } from '@/lib/brandStore'
import { setPostLoginRedirect } from '@/lib/authRedirect'
import MentorshipSidebar from './MentorshipSidebar'
import NotificationBell from './NotificationBell'
import FloatingFeedbackButton from './FloatingFeedbackButton'
import Logo from '../Logo'

interface Props {
  children: React.ReactNode
  topBar?: React.ReactNode
}

/**
 * A separate shell from the resume-builder's AppShell — its own sidebar, own
 * nav, own branding — while still sharing the same login/session (single
 * auth, same useAuthStore) as the rest of SahiCareer.
 */
export default function MentorshipShell({ children, topBar }: Props) {
  const { user, hasHydrated } = useAuthStore()
  const brandName = useBrandStore((s) => s.brand_name)
  const router = useRouter()
  const pathname = usePathname()
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    // Wait for the persisted session to load before deciding there's no
    // user — otherwise a hard refresh sees the pre-rehydration `null` flash
    // and wrongly bounces a logged-in user to /auth/login.
    if (hasHydrated && !user) {
      setPostLoginRedirect(pathname)
      router.push('/auth/login')
    }
  }, [user, hasHydrated, router, pathname])

  useEffect(() => { setNavOpen(false) }, [pathname])

  useEffect(() => {
    if (user) useBrandStore.getState().load()
  }, [user])

  if (!hasHydrated || !user) return null

  return (
    <div className="flex min-h-screen">
      <MentorshipSidebar open={navOpen} onClose={() => setNavOpen(false)} />

      {navOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setNavOpen(false)} aria-hidden />
      )}

      <div className="flex-1 ml-0 md:ml-56 flex flex-col min-h-screen">
        <header className="md:hidden glass h-14 flex items-center gap-3 px-4 sticky top-0 z-30 border-b border-white/40 shadow-soft">
          <button onClick={() => setNavOpen(true)} aria-label="Open menu"
            className="w-10 h-10 -ml-1 flex items-center justify-center rounded-lg text-gray-700 hover:bg-white/60 text-xl">☰</button>
          <div className="flex items-center gap-2">
            <Logo size={28} />
            <span className="font-bold text-gray-900 text-sm">{brandName}</span>
          </div>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>

        <header className="hidden md:flex glass h-16 items-center px-6 gap-4 sticky top-0 z-30 border-b border-white/40 shadow-soft">
          {topBar && <div className="flex-1">{topBar}</div>}
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-auto animate-fade-up">
          {children}
        </main>
      </div>
      <FloatingFeedbackButton />
    </div>
  )
}
