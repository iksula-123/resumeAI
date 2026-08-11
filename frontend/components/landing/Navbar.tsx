'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { Container } from './shared'
import Logo from '../Logo'

const LINKS = [
  { href: '#top', label: 'Home' },
  { href: '#services', label: 'Services' },
  { href: '#features', label: 'Features' },
  { href: '/mentorship', label: 'Mentorship' },
  { href: '#why', label: 'About' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'Contact' },
]
/** Anchors (#...) scroll within this page; real routes (/...) navigate the app. */
const isRoute = (href: string) => href.startsWith('/')

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-slate-200/70 bg-white/75 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/75'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <Container className="flex h-16 items-center justify-between lg:h-20">
        <Link href="#top" className="flex items-center gap-2.5">
          <Logo size={36} />
          <span className="text-[1.05rem] font-bold tracking-tight text-navy-600 dark:text-white">
            SahiCareer
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => {
            const linkClass = "rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
            return isRoute(l.href) ? (
              <Link key={l.href} href={l.href} className={linkClass}>{l.label}</Link>
            ) : (
              <a key={l.href} href={l.href} className={linkClass}>{l.label}</a>
            )
          })}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/auth/login"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 transition hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"
          >
            Login
          </Link>
          <Link href="/auth/signup" className="btn-primary !min-h-0 !py-2.5 !px-5 text-sm">
            Get Started
          </Link>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden dark:text-slate-200 dark:hover:bg-white/5"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </Container>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-slate-200 bg-white/95 backdrop-blur-xl lg:hidden dark:border-white/10 dark:bg-slate-950/95"
          >
            <Container className="flex flex-col gap-1 py-4">
              {LINKS.map((l) => {
                const linkClass = "rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
                return isRoute(l.href) ? (
                  <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={linkClass}>{l.label}</Link>
                ) : (
                  <a key={l.href} href={l.href} onClick={() => setOpen(false)} className={linkClass}>{l.label}</a>
                )
              })}
              <div className="mt-2 flex items-center gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
                <Link
                  href="/auth/login"
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 dark:border-white/10 dark:text-slate-200"
                >
                  Login
                </Link>
                <Link href="/auth/signup" className="btn-primary flex-1 !min-h-0 !py-2.5 text-center">
                  Get Started
                </Link>
              </div>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
