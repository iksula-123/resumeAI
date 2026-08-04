'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Quote, ChevronLeft, ChevronRight } from 'lucide-react'
import { Container, Reveal, SectionHeading } from './shared'

const TESTIMONIALS = [
  {
    quote: 'I had no idea my resume was getting filtered out by ATS software until SahiCareer showed me exactly what to fix. Got two interview calls the same week.',
    name: 'Priya S.',
    role: 'Learner · B.Com Graduate',
    tag: 'Student Story',
  },
  {
    quote: 'The role pre-fill is the smartest part — it pulls from real hiring data instead of asking candidates to guess what recruiters want to see.',
    name: 'Rohit V.',
    role: 'Mentor · Engineering Lead',
    tag: 'Mentor Story',
  },
  {
    quote: 'We started seeing noticeably stronger, more consistent resumes from candidates using this platform — screening got faster on our end too.',
    name: 'Neha K.',
    role: 'Talent Acquisition Partner',
    tag: 'Hiring Partner',
  },
  {
    quote: 'AI Buddy talked me through a mock interview the night before my actual one. The questions it asked were almost identical to the real thing.',
    name: 'Arjun D.',
    role: 'Learner · Diploma Holder',
    tag: 'Student Story',
  },
]

export default function Testimonials() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setIndex((v) => (v + 1) % TESTIMONIALS.length), 5500)
    return () => clearInterval(t)
  }, [paused])

  const go = (dir: 1 | -1) => setIndex((v) => (v + dir + TESTIMONIALS.length) % TESTIMONIALS.length)

  return (
    <section className="bg-slate-50 py-24 lg:py-32 dark:bg-white/[0.02]">
      <Container>
        <SectionHeading eyebrow="Testimonials" title="Real outcomes, from real users" />

        <div
          className="relative mx-auto mt-16 max-w-3xl"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <Reveal>
            <div className="relative min-h-[280px] rounded-[1.75rem] border border-slate-200/70 bg-white p-10 shadow-xl shadow-slate-900/5 sm:p-12 dark:border-white/10 dark:bg-slate-900">
              <Quote className="h-10 w-10 text-royal-100 dark:text-royal-400/20" strokeWidth={1.5} />
              <AnimatePresence mode="wait">
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
                    {TESTIMONIALS[index].tag}
                  </span>
                  <p className="mt-3 text-balance text-xl font-medium leading-relaxed text-slate-800 sm:text-2xl dark:text-slate-100">
                    “{TESTIMONIALS[index].quote}”
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-navy-600 to-royal-600 text-sm font-bold text-white">
                      {TESTIMONIALS[index].name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-navy-600 dark:text-white">{TESTIMONIALS[index].name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{TESTIMONIALS[index].role}</p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </Reveal>

          <button
            onClick={() => go(-1)}
            aria-label="Previous testimonial"
            className="absolute left-0 top-1/2 hidden -translate-x-14 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white p-2.5 text-slate-500 shadow-md transition hover:text-royal-600 sm:flex dark:border-white/10 dark:bg-slate-900 dark:text-slate-400"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => go(1)}
            aria-label="Next testimonial"
            className="absolute right-0 top-1/2 hidden translate-x-14 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white p-2.5 text-slate-500 shadow-md transition hover:text-royal-600 sm:flex dark:border-white/10 dark:bg-slate-900 dark:text-slate-400"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="mt-7 flex justify-center gap-2">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Go to testimonial ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === index ? 'w-7 bg-navy-600' : 'w-2 bg-slate-300 dark:bg-white/15'
                }`}
              />
            ))}
          </div>
        </div>
      </Container>
    </section>
  )
}
