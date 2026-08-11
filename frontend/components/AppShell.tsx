'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { setPostLoginRedirect } from '@/lib/authRedirect'
import Sidebar from './Sidebar'
import Logo from './Logo'

interface Props {
  children: React.ReactNode
  topBar?: React.ReactNode
}

export default function AppShell({ children, topBar }: Props) {
  const { user, hasHydrated } = useAuthStore()
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

  // close the mobile drawer on route change
  useEffect(() => { setNavOpen(false) }, [pathname])

  if (!hasHydrated || !user) return null

  return (
    <div className="flex min-h-screen">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      {/* mobile drawer backdrop */}
      {navOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setNavOpen(false)} aria-hidden />
      )}

      <div className="flex-1 ml-0 md:ml-56 flex flex-col min-h-screen">
        {/* mobile top bar with hamburger (sidebar is off-canvas on phones) */}
        <header className="md:hidden glass h-14 flex items-center gap-3 px-4 sticky top-0 z-30 border-b border-white/40 shadow-soft">
          <button onClick={() => setNavOpen(true)} aria-label="Open menu"
            className="w-10 h-10 -ml-1 flex items-center justify-center rounded-lg text-gray-700 hover:bg-white/60 text-xl">☰</button>
          <div className="flex items-center gap-2">
            <Logo size={28} />
            <span className="font-bold text-gray-900 text-sm">SahiCareer</span>
          </div>
        </header>

        {topBar && (
          <header className="hidden md:flex glass h-16 items-center px-6 gap-4 sticky top-0 z-30 border-b border-white/40 shadow-soft">
            {topBar}
          </header>
        )}
        <main className="flex-1 overflow-auto animate-fade-up">
          {children}
        </main>
      </div>
    </div>
  )
}
