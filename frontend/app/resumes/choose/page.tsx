'use client'

/**
 * Resume creation chooser (SahiCareer UI/UX + Gamification, Phase B).
 *
 * Four distinct starting points. Each card routes to an EXISTING or
 * newly-added flow — nothing here duplicates resume-creation logic:
 *   - Create from Scratch → /resumes/create   (new guided wizard)
 *   - Upload Resume       → /ai-upgrade       (existing upload+AI-improve flow)
 *   - Build with AI       → /resumes/create?mode=ai (same wizard, AI-first framing)
 *   - Build for a Role    → /resumes/build    (existing role-prefill flow)
 */
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { setPostLoginRedirect } from '@/lib/authRedirect'
import AppShell from '@/components/AppShell'

const OPTIONS = [
  {
    key: 'scratch', icon: '📝', title: 'Create from Scratch',
    subtitle: 'Build a professional resume step by step',
    href: '/resumes/create', tone: 'from-royal-500 to-teal-500',
  },
  {
    key: 'upload', icon: '📤', title: 'Upload Resume',
    subtitle: 'Import your existing resume and improve it',
    href: '/ai-upgrade', tone: 'from-blue-500 to-royal-500',
  },
  {
    key: 'ai', icon: '✨', title: 'Build with AI',
    subtitle: 'Answer a few questions and let AI help you build',
    href: '/resumes/create?mode=ai', tone: 'from-purple-500 to-pink-500',
  },
  {
    key: 'role', icon: '🎯', title: 'Build for a Role',
    subtitle: 'Start with a target career role',
    href: '/resumes/build', tone: 'from-amber-500 to-orange-500',
  },
] as const

export default function ChooseResumeCreationPage() {
  const router = useRouter()
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  useEffect(() => {
    if (!hasHydrated) return
    if (!user) {
      setPostLoginRedirect(pathname)
      router.replace('/auth/login')
    }
  }, [user, hasHydrated, pathname, router])

  if (!user) return null

  const topBar = (
    <div className="flex-1">
      <h1 className="text-sm font-semibold text-gray-800">Create a Resume</h1>
      <p className="text-xs text-gray-500">Pick how you'd like to start</p>
    </div>
  )

  return (
    <AppShell topBar={topBar}>
      <div className="p-6 md:p-10 max-w-5xl mx-auto">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 font-display">How would you like to start?</h2>
          <p className="text-sm text-gray-500 mt-1">You can always switch approaches later — nothing here is final.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {OPTIONS.map((o, i) => (
            <button key={o.key} onClick={() => router.push(o.href)}
              className="card-premium p-6 text-left group animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div className={`w-12 h-12 bg-gradient-to-br ${o.tone} rounded-xl flex items-center justify-center text-white text-2xl shadow-soft group-hover:scale-110 transition-transform`}>
                {o.icon}
              </div>
              <div className="font-semibold text-gray-900 mt-4 font-display">{o.title}</div>
              <div className="text-sm text-gray-500 mt-1">{o.subtitle}</div>
              <div className="text-xs font-medium text-navy-600 mt-3 group-hover:translate-x-0.5 transition-transform">Get started →</div>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
