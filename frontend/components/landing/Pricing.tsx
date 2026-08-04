'use client'

import Link from 'next/link'
import { Check, Sparkles } from 'lucide-react'
import { Container, Reveal, SectionHeading } from './shared'

const PLANS = [
  {
    name: 'Free',
    price: '₹0',
    period: 'forever',
    description: 'Everything you need to build your first great resume.',
    features: ['1 active resume', 'ATS score checker', 'Core resume templates', 'Role-based pre-fill'],
    cta: 'Get Started',
    href: '/auth/signup',
  },
  {
    name: 'Pro',
    price: '₹499',
    period: '/month',
    description: 'For active job seekers who want every advantage.',
    features: [
      'Unlimited resumes & cover letters', 'Full AI Buddy access', 'Advanced ATS intelligence',
      'Job matching & tracking', '2 mentor sessions / month',
    ],
    cta: 'Start Pro Trial',
    href: '/auth/signup?plan=pro',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'for institutions',
    description: 'For colleges and training partners placing many learners.',
    features: [
      'Bulk learner onboarding', 'Dedicated success manager', 'Placement analytics dashboard',
      'Priority mentor scheduling', 'API & LMS integration',
    ],
    cta: 'Contact Sales',
    href: '#faq',
  },
]

export default function Pricing() {
  return (
    <section id="pricing" className="py-24 lg:py-32">
      <Container>
        <SectionHeading
          eyebrow="Pricing"
          title="Simple pricing that grows with you"
          description="Start free. Upgrade only when you need deeper AI guidance or mentor time."
        />

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.08}>
              <div
                className={`relative flex h-full flex-col rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 ${
                  p.featured
                    ? 'border-2 border-accent-600 bg-white shadow-2xl shadow-accent-600/15 dark:bg-slate-900'
                    : 'border border-slate-200/70 bg-white shadow-sm hover:shadow-lg dark:border-white/10 dark:bg-white/[0.03]'
                }`}
              >
                {p.featured && (
                  <span className="absolute -top-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-accent-600 px-4 py-1.5 text-xs font-bold text-white shadow-md">
                    <Sparkles className="h-3.5 w-3.5" /> Recommended
                  </span>
                )}
                <h3 className="text-lg font-bold text-navy-600 dark:text-white">{p.name}</h3>
                <p className="mt-1 text-sm text-mut dark:text-slate-400">{p.description}</p>
                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold tracking-tight text-navy-600 dark:text-white">{p.price}</span>
                  <span className="text-sm font-medium text-mut dark:text-slate-400">{p.period}</span>
                </div>

                <ul className="mt-7 flex-1 space-y-3.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-good-600 dark:text-good-400" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={p.href}
                  className={`mt-8 inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition hover:-translate-y-0.5 ${
                    p.featured
                      ? 'bg-accent-600 text-white shadow-lg shadow-accent-600/25 hover:bg-accent-700 hover:shadow-xl'
                      : 'border border-slate-200 text-navy-600 hover:border-royal-300 hover:bg-slate-50 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {p.cta}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}
