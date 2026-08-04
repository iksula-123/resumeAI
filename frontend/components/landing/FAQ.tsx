'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { Container, Reveal, SectionHeading } from './shared'

const FAQS = [
  {
    q: 'Is SahiCareer really free to start?',
    a: 'Yes — you can build a full ATS-friendly resume, check your ATS score, and use role-based pre-fill on the Free plan with no credit card required.',
  },
  {
    q: 'How does the resume pre-fill work?',
    a: 'You pick the job you\'re targeting and we pre-fill suggestions from real hiring data for that role. Nothing is written as fact automatically — you confirm every suggestion before it goes on your resume.',
  },
  {
    q: 'Can AI Buddy help with interview prep specifically?',
    a: 'Yes. AI Buddy runs mock interviews tailored to your target role, asks follow-up questions based on your answers, and scores you the way a real interviewer would.',
  },
  {
    q: 'How are mentors vetted?',
    a: 'Mentors on Mentorly are verified industry professionals with real hiring or role experience — you can see their experience, ratings, and specialties before booking a session.',
  },
  {
    q: 'Can colleges or training institutes onboard many learners at once?',
    a: 'Yes — the Enterprise plan supports bulk onboarding, placement analytics, and LMS integration for colleges and training partners.',
  },
]

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />

        <div className="mt-14 space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i
            return (
              <Reveal key={f.q} delay={i * 0.05}>
                <div
                  className={`overflow-hidden rounded-2xl border transition-colors ${
                    isOpen ? 'border-royal-300 bg-royal-50/50 dark:border-royal-400/30 dark:bg-royal-400/5' : 'border-slate-200/70 bg-white dark:border-white/10 dark:bg-white/[0.03]'
                  }`}
                >
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  >
                    <span className="font-semibold text-navy-600 dark:text-white">{f.q}</span>
                    <motion.span
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.3 }}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        isOpen ? 'bg-navy-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400'
                      }`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <p className="px-6 pb-5 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
                          {f.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
