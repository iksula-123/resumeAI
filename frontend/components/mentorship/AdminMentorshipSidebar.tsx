'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useBrandStore } from '@/lib/brandStore'
import Logo from '../Logo'

/**
 * The admin's dedicated mentorship console nav — mirrors the spec's admin
 * sidebar list. "Users" and "Audit Logs" intentionally link out to the
 * existing general /admin page instead of duplicating that code (this repo
 * already has one real Users table + Audit Log viewer, scoped to the whole
 * app, not just mentorship).
 */
const NAV = [
  { href: '/admin/mentorship', icon: '⊞', label: 'Dashboard' },
  { href: '/admin', icon: '👥', label: 'Users', external: true },
  { href: '/admin/mentorship/applications', icon: '📝', label: 'Applications' },
  { href: '/admin/mentorship/programs', icon: '📚', label: 'Programs' },
  { href: '/admin/mentorship/listings', icon: '🤝', label: 'Mentorship Listings' },
  { href: '/admin/mentorship/sessions', icon: '🗓️', label: 'Sessions' },
  { href: '/admin/mentorship/events', icon: '🎪', label: 'Events' },
  { href: '/admin/mentorship/feedback', icon: '⭐', label: 'Feedback' },
  { href: '/admin/mentorship/platform-feedback', icon: '💬', label: 'Platform Feedback' },
  { href: '/admin/mentorship/leaderboard', icon: '🏆', label: 'Leaderboard' },
  { href: '/admin/mentorship/settings', icon: '⚙️', label: 'Settings' },
  { href: '/admin/mentorship/privacy-requests', icon: '🔒', label: 'Privacy Requests' },
  { href: '/admin', icon: '📜', label: 'Audit Logs', external: true },
]

export default function AdminMentorshipSidebar({ open = true, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname()
  const brandName = useBrandStore((s) => s.brand_name)

  // The two "external" entries both point at /admin, which this sidebar never
  // renders under — exclude them so they can't accidentally match as active.
  const activeHref = NAV
    .map((i) => i.href)
    .filter((h) => h !== '/admin')
    .filter((h) => pathname === h || pathname.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0]
  const isActive = (href: string) => href === activeHref

  return (
    <aside className={`glass fixed top-0 left-0 h-screen w-56 border-r border-white/40 flex flex-col z-50 shadow-glass
                       transform transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
      <div className="px-4 py-5 border-b border-white/40">
        <button onClick={onClose} aria-label="Close menu"
          className="md:hidden absolute top-4 right-3 text-gray-500 hover:text-gray-800 text-lg">✕</button>
        <div className="flex items-center gap-2.5">
          <Logo size={36} />
          <div>
            <div className="text-sm font-bold text-gray-900 leading-tight font-display">{brandName}</div>
            <div className="text-[11px] text-gray-500">Admin Console</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
        {NAV.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onClose}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm transition-all duration-200 ${
                active ? 'text-white font-semibold shadow-glow' : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
              }`}
              style={active ? { backgroundImage: 'linear-gradient(135deg, #17325C, #2E6FB7)' } : undefined}
            >
              <span className={`text-base w-5 text-center transition-transform duration-200 ${active ? '' : 'group-hover:scale-110'}`}>{item.icon}</span>
              {item.label}
              {item.external && <span className="ml-auto text-[10px] text-gray-400">↗</span>}
            </Link>
          )
        })}

        <div className="my-3 border-t border-white/40" />
        <Link href="/dashboard" onClick={onClose} className="group flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm text-gray-500 hover:bg-white/60 hover:text-gray-900 transition-all duration-200">
          <span className="text-base w-5 text-center">←</span>
          Back to SahiCareer
        </Link>
      </nav>
    </aside>
  )
}
