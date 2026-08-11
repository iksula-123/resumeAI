'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Twitter, Linkedin, Instagram, Youtube, ArrowRight } from 'lucide-react'
import { Container } from './shared'
import Logo from '../Logo'

const COLUMNS = [
  {
    title: 'Company',
    links: [
      { label: 'About', href: '#why' },
      { label: 'Careers', href: '#faq' },
      { label: 'Press', href: '#faq' },
    ],
  },
  {
    title: 'Services',
    links: [
      { label: 'Resume Builder', href: '/resumes/build' },
      { label: 'AI Buddy', href: '/copilot' },
      { label: 'Mentorly', href: '/mentorship' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'How It Works', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '#' },
      { label: 'Terms of Service', href: '#' },
      { label: 'Cookie Policy', href: '#' },
    ],
  },
]

const SOCIALS = [
  { icon: Twitter, href: '#', label: 'Twitter' },
  { icon: Linkedin, href: '#', label: 'LinkedIn' },
  { icon: Instagram, href: '#', label: 'Instagram' },
  { icon: Youtube, href: '#', label: 'YouTube' },
]

export default function Footer() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  return (
    <footer className="border-t border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-950">
      <Container className="py-16">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div>
            <Link href="#top" className="flex items-center gap-2.5">
              <Logo size={36} />
              <span className="text-[1.05rem] font-bold tracking-tight text-navy-600 dark:text-white">SahiCareer</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Your AI career partner — resumes, guidance, and mentorship, built around real hiring data.
            </p>

            <form
              onSubmit={(e) => { e.preventDefault(); if (email) setSubmitted(true) }}
              className="mt-6 flex max-w-xs items-center gap-2"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-royal-400 focus:ring-2 focus:ring-royal-100 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
              <button
                type="submit"
                aria-label="Subscribe to newsletter"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-navy-600 to-royal-600 text-white transition hover:-translate-y-0.5"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              {submitted ? 'Thanks — you\'re on the list!' : 'Product updates, no spam.'}
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-bold text-navy-600 dark:text-white">{col.title}</p>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-sm text-slate-500 transition hover:text-royal-600 dark:text-slate-400 dark:hover:text-royal-400">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-6 border-t border-slate-200 pt-8 sm:flex-row dark:border-white/10">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            © {new Date().getFullYear()} SahiCareer. All rights reserved.
          </p>
          <div className="flex items-center gap-3">
            {SOCIALS.map((s) => {
              const Icon = s.icon
              return (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-royal-300 hover:text-royal-600 dark:border-white/10 dark:text-slate-400"
                >
                  <Icon className="h-4 w-4" />
                </a>
              )
            })}
          </div>
        </div>
      </Container>
    </footer>
  )
}
