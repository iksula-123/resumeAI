'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'

const NAV = [
  { href: '/dashboard', icon: '⊞', label: 'Dashboard' },
  { href: '/resumes', icon: '📄', label: 'Resumes' },
  { href: '/cover-letters', icon: '✉️', label: 'Cover Letters' },
  { href: '/templates', icon: '🎨', label: 'Templates' },
  { href: '/ai-writer', icon: '✨', label: 'AI Writer' },
  { href: '/ats-checker', icon: '🎯', label: 'ATS Checker' },
  { href: '/interview-questions', icon: '💬', label: 'Interview Questions' },
  { href: '/job-tracker', icon: '📊', label: 'Job Tracker' },
  { href: '/settings', icon: '⚙️', label: 'Settings' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { logout, user } = useAuthStore()

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const navItems = user?.role === 'admin'
    ? [...NAV, { href: '/admin', icon: '🛡️', label: 'Admin Panel' }]
    : NAV

  return (
    <aside className="glass fixed top-0 left-0 h-screen w-56 border-r border-white/40 flex flex-col z-40 shadow-glass">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/40">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-brand-gradient rounded-xl flex items-center justify-center text-white font-bold shadow-glow">
            R
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 leading-tight font-display">ResumeAI Pro</div>
            <div className="text-[11px] text-gray-500">AI Resume Builder</div>
          </div>
        </div>
      </div>

      {/* Create button */}
      <div className="px-3 py-3">
        <button
          onClick={() => router.push('/resumes/new')}
          className="btn-primary w-full text-sm py-2.5"
        >
          <span className="text-base leading-none">+</span>
          Create New Resume
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm transition-all duration-200 ${
                active
                  ? 'text-white font-semibold shadow-glow'
                  : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
              }`}
              style={active ? { backgroundImage: 'linear-gradient(135deg, #6366f1, #7c3aed)' } : undefined}
            >
              <span className={`text-base w-5 text-center transition-transform duration-200 ${active ? '' : 'group-hover:scale-110'}`}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Upgrade card */}
      <div className="mx-3 mb-3 p-3.5 rounded-2xl bg-brand-gradient text-white shadow-glow relative overflow-hidden">
        <div className="absolute -right-6 -top-6 w-20 h-20 rounded-full bg-white/15 blur-xl" />
        <div className="flex items-center gap-2 mb-1 relative">
          <span>⭐</span>
          <span className="text-xs font-semibold">Upgrade to Pro</span>
        </div>
        <p className="text-[11px] text-white/80 mb-2.5 relative">Unlock premium templates and unlimited AI credits.</p>
        <button
          onClick={() => router.push('/pricing')}
          className="relative w-full bg-white/95 hover:bg-white text-indigo-700 text-xs font-semibold py-1.5 rounded-lg transition"
        >
          Upgrade Now
        </button>
      </div>

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
              <div className="text-[11px] text-gray-500 truncate capitalize">{user?.subscription_tier || 'Free'} plan</div>
            </div>
          </div>
          <button
            onClick={() => { logout(); router.push('/auth/login') }}
            className="text-gray-400 hover:text-red-500 transition text-sm ml-1 flex-shrink-0"
            title="Logout"
          >
            ⏻
          </button>
        </div>
      </div>
    </aside>
  )
}
