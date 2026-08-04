'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Container, Reveal } from './shared'

export default function CTABanner() {
  return (
    <section className="px-6 py-16 lg:py-20">
      <Container>
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-navy-600 via-navy-700 to-royal-700 px-8 py-16 text-center shadow-2xl shadow-navy-900/25 sm:px-16 sm:py-20">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.15]"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)',
                backgroundSize: '48px 48px',
              }}
            />
            <h2 className="relative text-balance text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
              Ready to build your career?
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-balance text-lg text-royal-100">
              Join thousands of learners already building smarter resumes and getting career guidance with SahiCareer.
            </p>
            <div className="relative mt-9 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/auth/signup"
                className="group inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-bold text-navy-700 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                Start Free Today
                <ArrowRight className="h-4.5 w-4.5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-8 py-3.5 text-base font-semibold text-white transition hover:bg-white/10"
              >
                Login
              </Link>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
