'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { useBrandStore } from '@/lib/brandStore'
import Logo from '../Logo'

const MENTEE_NAV = [
  { href: '/mentorship/dashboard', icon: '⊞', label: 'Dashboard' },
  { href: '/mentorship/profile', icon: '👤', label: 'My Profile' },
  { href: '/mentorship/programs', icon: '📚', label: 'Programs' },
  { href: '/mentorship/events', icon: '🎪', label: 'Events' },
  { href: '/mentorship', icon: '🧑‍🏫', label: 'Find Mentors' },
  { href: '/mentorship/book', icon: '📅', label: 'Book Session' },
  { href: '/mentorship/sessions', icon: '🗓️', label: 'My Sessions' },
  { href: '/mentorship/tasks', icon: '✅', label: 'My Tasks' },
  { href: '/mentorship/feedback', icon: '⭐', label: 'My Feedback' },
  { href: '/mentorship/privacy', icon: '🔒', label: 'Privacy & My Data' },
]

const MENTOR_NAV = [
  { href: '/mentorship/mentor/dashboard', icon: '⊞', label: 'Dashboard' },
  { href: '/mentorship/mentor/profile', icon: '👤', label: 'My Profile' },
  { href: '/mentorship/mentor/offerings', icon: '🏷️', label: 'Offerings' },
  { href: '/mentorship/mentor/availability', icon: '🕒', label: 'Availability' },
  { href: '/mentorship/mentor/events', icon: '🎪', label: 'Events' },
  { href: '/mentorship/mentor/programs', icon: '📚', label: 'Programs' },
  { href: '/mentorship/mentor/mentees', icon: '👥', label: 'My Mentees' },
  { href: '/mentorship/mentor/bookings', icon: '📥', label: 'Bookings' },
  { href: '/mentorship/mentor/feedback', icon: '⭐', label: 'My Feedback' },
  { href: '/mentorship/mentor/leaderboard', icon: '🏆', label: 'Leaderboard' },
]

export default function MentorshipSidebar({ open = true, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { logout, user } = useAuthStore()
  const brandName = useBrandStore((s) => s.brand_name)

  const isMentorSection = pathname.startsWith('/mentorship/mentor')
  const NAV = isMentorSection ? MENTOR_NAV : MENTEE_NAV
  const isApprovedMentor = user?.mentor_status === 'approved'

  const activeHref = NAV
    .map((i) => i.href)
    .filter((h) => pathname === h || pathname.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0]
  const isActive = (href: string) => href === activeHref

  return (
    <aside className={`glass fixed top-0 left-0 h-screen w-56 border-r border-white/40 flex flex-col z-50 shadow-glass
                       transform transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
      {/* Logo + mobile close */}
      <div className="px-4 py-5 border-b border-white/40">
        <button onClick={onClose} aria-label="Close menu"
          className="md:hidden absolute top-4 right-3 text-gray-500 hover:text-gray-800 text-lg">✕</button>
        <div className="flex items-center gap-2.5">
          <Logo size={36} />
          <div>
            <div className="text-sm font-bold text-gray-900 leading-tight font-display">{brandName}</div>
            <div className="text-[11px] text-gray-500">{isMentorSection ? 'Mentor' : 'Mentee'}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
        {NAV.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm transition-all duration-200 ${
                active
                  ? 'text-white font-semibold shadow-glow'
                  : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
              }`}
              style={active ? { backgroundImage: 'linear-gradient(135deg, #17325C, #2E6FB7)' } : undefined}
            >
              <span className={`text-base w-5 text-center transition-transform duration-200 ${active ? '' : 'group-hover:scale-110'}`}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          )
        })}

        <div className="my-3 border-t border-white/40" />

        {isApprovedMentor && (
          <Link
            href={isMentorSection ? '/mentorship/dashboard' : '/mentorship/mentor/dashboard'}
            onClick={onClose}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm text-royal-700 bg-royal-50 hover:bg-royal-100 transition-all duration-200"
          >
            <span className="text-base w-5 text-center">🔁</span>
            {isMentorSection ? 'Switch to Mentee view' : 'Switch to Mentor view'}
          </Link>
        )}
        {!isApprovedMentor && !isMentorSection && (
          <Link
            href="/mentorship/apply"
            onClick={onClose}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm text-royal-700 bg-royal-50 hover:bg-royal-100 transition-all duration-200"
          >
            <span className="text-base w-5 text-center">🎓</span>
            Become a Mentor
          </Link>
        )}

        <Link
          href="/dashboard"
          onClick={onClose}
          className="group flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm text-gray-500 hover:bg-white/60 hover:text-gray-900 transition-all duration-200"
        >
          <span className="text-base w-5 text-center">←</span>
          Back to SahiCareer
        </Link>
      </nav>

      {/* User + logout */}
      <div className="px-3 py-3 border-t border-white/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full flex-shrink-0 object-cover shadow-soft ring-2 ring-white" />
            ) : (
              <div className="w-8 h-8 bg-brand-gradient rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-soft">
                {user?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-800 truncate">{user?.full_name || 'User'}</div>
              <div className="text-[11px] text-gray-500 truncate capitalize">{isMentorSection ? 'Mentor' : 'Mentee'}</div>
            </div>
          </div>
          <button
            onClick={() => { logout(); router.push('/auth/login') }}
            className="text-gray-500 hover:text-red-500 transition text-sm ml-1 flex-shrink-0"
            title="Logout"
          >
            ⏻
          </button>
        </div>
      </div>
    </aside>
  )
}
