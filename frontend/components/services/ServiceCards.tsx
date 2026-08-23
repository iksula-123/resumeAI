'use client'

/**
 * The three SahiCareer services, as compact clickable cards — reused by the
 * logged-in dashboard (frontend/app/dashboard/page.tsx). Deliberately a
 * separate, lighter component from the public landing page's own service
 * cards (frontend/components/landing/Services.tsx, which is marketing-styled
 * with framer-motion and a full feature list) rather than refactoring that
 * already-working component. Destinations must stay in sync with Services.tsx:
 *   Resume Builder → /resumes/build
 *   AI Buddy        → /copilot
 *   Mentorly        → /mentorship
 */
import { useRouter } from 'next/navigation'

export const SERVICES = [
  {
    icon: '📄',
    title: 'Resume Builder',
    desc: 'Build an ATS-ready resume with AI',
    cta: 'Explore Resume Builder',
    href: '/resumes/build',
    color: 'from-navy-600 to-navy-500',
  },
  {
    icon: '🤖',
    title: 'AI Buddy',
    desc: 'Your personal AI career assistant',
    cta: 'Talk to AI Buddy',
    href: '/copilot',
    color: 'from-royal-600 to-royal-500',
  },
  {
    icon: '🧑‍🏫',
    title: 'Mentorly',
    desc: 'Connect with experienced industry mentors',
    cta: 'Find a Mentor',
    href: '/mentorship',
    color: 'from-teal-600 to-teal-500',
  },
] as const

export default function ServiceCards({ className = '' }: { className?: string }) {
  const router = useRouter()

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 ${className}`}>
      {SERVICES.map((s) => (
        <button
          key={s.href}
          onClick={() => router.push(s.href)}
          className="card-premium p-5 text-left group flex flex-col"
        >
          <div className={`w-11 h-11 bg-gradient-to-br ${s.color} rounded-xl flex items-center justify-center text-white text-xl mb-3 shadow-soft group-hover:scale-110 transition-transform duration-200`}>
            {s.icon}
          </div>
          <div className="font-semibold text-sm text-gray-800">{s.title}</div>
          <div className="text-xs text-gray-500 mt-0.5 flex-1">{s.desc}</div>
          <div className="text-xs font-medium text-navy-600 mt-2 group-hover:translate-x-0.5 transition-transform">{s.cta} →</div>
        </button>
      ))}
    </div>
  )
}
