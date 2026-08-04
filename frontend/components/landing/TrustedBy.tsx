'use client'

import { motion } from 'framer-motion'
import { Building2, GraduationCap, Landmark, Briefcase, Factory, Store } from 'lucide-react'
import { Container, Reveal } from './shared'

/**
 * No real partner logos are wired up yet, so this shows category marks
 * (hiring partners / colleges / universities) instead of fabricated brand names.
 * Swap in real logo images here once partnerships are confirmed.
 */
const MARKS = [
  { icon: Briefcase, label: 'Hiring Partners' },
  { icon: GraduationCap, label: 'Colleges' },
  { icon: Landmark, label: 'Universities' },
  { icon: Building2, label: 'Enterprises' },
  { icon: Factory, label: 'Industry Bodies' },
  { icon: Store, label: 'Training Centers' },
]

export default function TrustedBy() {
  const loop = [...MARKS, ...MARKS]
  return (
    <section className="border-y border-slate-200/70 bg-white/60 py-12 dark:border-white/5 dark:bg-white/[0.02]">
      <Container>
        <Reveal>
          <p className="text-center text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Trusted across India's hiring ecosystem
          </p>
        </Reveal>
      </Container>

      <div className="mt-8 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <motion.div
          className="flex w-max gap-12"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
        >
          {loop.map((m, i) => {
            const Icon = m.icon
            return (
              <div
                key={`${m.label}-${i}`}
                className="flex shrink-0 items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white px-5 py-3 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
              >
                <Icon className="h-4.5 w-4.5" />
                <span className="text-sm font-semibold whitespace-nowrap">{m.label}</span>
              </div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
