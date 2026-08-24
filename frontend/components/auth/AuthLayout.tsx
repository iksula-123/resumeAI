'use client'

// Shared shell for the four SahiCareer auth pages (Login, Signup, Forgot
// Password, Reset Password) — SahiCareer auth UI/UX.
//
// IMPORTANT product-architecture note: this is the SHARED SahiCareer
// authentication surface, not a Resume Builder login screen. SahiCareer is
// the parent career platform; Resume Builder, AI Buddy, and Mentorly are
// three services reached from one shared account. The marketing panel
// below deliberately represents all three services, not resumes alone —
// see docs on components/landing/Services.tsx, the source of truth for
// what the three services are and where they lead.
//
// Reuses existing design tokens only (tailwind.config.ts's navy/royal/teal/
// accent palette, .card-premium/.input-premium/.btn-primary, the existing
// `float`/`fade-up` keyframes) and the same lucide-react icons Services.tsx
// already uses for these three services, so the icon language matches the
// rest of the site rather than inventing a second one.
//
// All decorative content is explicitly illustrative — no real user data,
// generic labels only, never presented as if it were a real account/resume.

import { useReducedMotion, motion } from 'framer-motion'
import Link from 'next/link'
import { FileText, MessageCircle, Users2 } from 'lucide-react'
import Logo from '@/components/Logo'

const SERVICES = [
  { icon: FileText, title: 'Resume Builder', desc: 'Build an ATS-ready resume', gradient: 'from-navy-600 to-navy-500' },
  { icon: MessageCircle, title: 'AI Buddy', desc: 'Get personalized career guidance', gradient: 'from-royal-600 to-royal-500' },
  { icon: Users2, title: 'Mentorly', desc: 'Learn from experienced mentors', gradient: 'from-teal-600 to-teal-500' },
] as const

function ServiceNode({ s, index, compact }: { s: (typeof SERVICES)[number]; index: number; compact?: boolean }) {
  const reduceMotion = useReducedMotion()
  const Icon = s.icon
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-white/90 text-xs">
        <span className={`w-6 h-6 rounded-lg bg-gradient-to-br ${s.gradient} flex items-center justify-center shrink-0`}>
          <Icon className="w-3.5 h-3.5 text-white" strokeWidth={2} aria-hidden="true" />
        </span>
        {s.title}
      </div>
    )
  }
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.5 + index * 0.15, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      className="relative flex-1 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 p-4 transition-shadow hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.35)]"
    >
      <span className={`inline-flex w-9 h-9 rounded-xl bg-gradient-to-br ${s.gradient} items-center justify-center shadow-md`}>
        <Icon className="w-4.5 h-4.5 text-white" strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="mt-2.5 text-sm font-semibold text-white">{s.title}</div>
      <p className="mt-0.5 text-[11px] leading-snug text-white/70">{s.desc}</p>
    </motion.div>
  )
}

function MarketingPanel({ compact = false }: { compact?: boolean }) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="relative h-full flex flex-col justify-center px-8 py-10 md:px-10 lg:px-14 overflow-hidden text-white">
      {/* slow-moving background gradient — subtle, respects reduced motion */}
      <div aria-hidden="true" className="absolute inset-0 bg-brand-gradient motion-safe:animate-bg-drift" style={{ backgroundSize: '160% 160%' }} />
      {/* soft AI-sparkle gradient blobs */}
      <div aria-hidden="true" className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-teal-400/30 blur-3xl motion-safe:animate-float" />
      <div aria-hidden="true" className="absolute bottom-0 -left-10 w-56 h-56 rounded-full bg-royal-300/25 blur-3xl motion-safe:animate-float" style={{ animationDelay: '2.5s' }} />

      <div className="relative z-10">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight text-white">
            Your Career Journey Starts Here
          </h1>
          <p className="mt-3 text-sm md:text-base text-white/80 max-w-sm">
            One account for your complete career journey — build your resume, get AI-powered career guidance, and connect with mentors.
          </p>
        </motion.div>

        {compact ? (
          <div className="mt-5 flex items-center justify-between gap-3">
            {SERVICES.map((s) => <ServiceNode key={s.title} s={s} index={0} compact />)}
          </div>
        ) : (
          <div className="mt-9">
            {/* SahiCareer node branching into the three services — a tasteful
                journey/path visual, not a resume-specific illustration. */}
            <motion.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: reduceMotion ? 0 : 0.3 }}
              className="flex flex-col items-center mb-3"
              aria-hidden="true"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80 bg-white/10 border border-white/20 rounded-full px-3 py-1">
                <Logo size={16} /> SahiCareer
              </div>
              <div className="w-px h-5 bg-white/25" />
            </motion.div>
            <div className="flex gap-3">
              {SERVICES.map((s, i) => <ServiceNode key={s.title} s={s} index={i} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export interface AuthServiceBadge { label: string }

export default function AuthLayout({
  children,
  mobileMarketing = true,
  serviceBadge,
}: {
  children: React.ReactNode
  mobileMarketing?: boolean
  serviceBadge?: AuthServiceBadge | null
}) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="min-h-screen bg-surface md:grid md:grid-cols-[0.85fr_1fr] lg:grid-cols-[1fr_1fr]">
      {/* Left: marketing panel — hidden on mobile (form comes first there),
          shown as a compact strip below the form instead (see mobileMarketing). */}
      <div className="hidden md:block">
        <MarketingPanel />
      </div>

      {/* Right: form card */}
      <div className="flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md"
          >
            <div className="flex items-center justify-center gap-2 mb-6 md:hidden">
              <Logo size={32} />
              <span className="font-bold text-gray-900 text-sm">SahiCareer</span>
            </div>
            <div className="card-premium p-6 sm:p-8">
              <div className="hidden md:flex items-center gap-2 mb-6">
                <Logo size={32} />
                <span className="font-bold text-gray-900 text-sm">SahiCareer</span>
              </div>
              {serviceBadge && (
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-700 bg-royal-50 border border-royal-100 rounded-full px-3 py-1 mb-4">
                  Continue to {serviceBadge.label}
                </div>
              )}
              {children}
            </div>
            <p className="mt-5 text-center text-xs text-gray-400">
              <Link href="/" className="hover:text-navy-600 hover:underline">← Back to SahiCareer</Link>
            </p>
          </motion.div>
        </div>

        {/* Mobile-only compact marketing strip, below the form, never above it. */}
        {mobileMarketing && (
          <div className="md:hidden bg-brand-gradient">
            <MarketingPanel compact />
          </div>
        )}
      </div>
    </div>
  )
}
