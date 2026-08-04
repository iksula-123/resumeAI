'use client'

import { motion } from 'framer-motion'
import { UserCircle2, FileText, MessageCircle, Users2, Mic, Briefcase, Rocket } from 'lucide-react'
import { Container, Reveal, SectionHeading } from './shared'

const STEPS = [
  { icon: UserCircle2, label: 'Profile' },
  { icon: FileText, label: 'Resume' },
  { icon: MessageCircle, label: 'AI Buddy' },
  { icon: Users2, label: 'Mentor' },
  { icon: Mic, label: 'Interview' },
  { icon: Briefcase, label: 'Job' },
  { icon: Rocket, label: 'Career Growth' },
]

export default function Workflow() {
  return (
    <section className="bg-slate-50 py-24 lg:py-32 dark:bg-white/[0.02]">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title="Your path from profile to career growth"
          description="Every step feeds the next — nothing you build here goes to waste."
        />

        {/* Desktop: horizontal timeline */}
        <div className="relative mt-20 hidden lg:block">
          <div className="absolute left-0 right-0 top-7 h-0.5 bg-slate-200 dark:bg-white/10" />
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: 'left' }}
            className="absolute left-0 right-0 top-7 h-0.5 bg-gradient-to-r from-navy-600 via-royal-600 to-teal-500"
          />
          <div className="relative grid grid-cols-7 gap-4">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              return (
                <Reveal key={s.label} delay={i * 0.09} className="flex flex-col items-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-royal-100 bg-white text-royal-600 shadow-md shadow-royal-500/10 dark:border-royal-400/20 dark:bg-slate-900 dark:text-royal-400">
                    <Icon className="h-6 w-6" strokeWidth={2} />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-200">{s.label}</p>
                </Reveal>
              )
            })}
          </div>
        </div>

        {/* Mobile: vertical timeline */}
        <div className="relative mt-14 space-y-8 lg:hidden">
          <div className="absolute left-7 top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-white/10" />
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <Reveal key={s.label} delay={i * 0.08} className="relative flex items-center gap-4 pl-0">
                <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-royal-100 bg-white text-royal-600 shadow-md dark:border-royal-400/20 dark:bg-slate-900 dark:text-royal-400">
                  <Icon className="h-6 w-6" strokeWidth={2} />
                </div>
                <p className="text-base font-semibold text-slate-800 dark:text-slate-200">{s.label}</p>
              </Reveal>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
