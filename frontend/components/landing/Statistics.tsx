'use client'

import { Users, GraduationCap, FileCheck2, Target } from 'lucide-react'
import { Container, Reveal, AnimatedCounter } from './shared'

const STATS = [
  { icon: GraduationCap, value: 10000, suffix: '+', label: 'Learners' },
  { icon: Users, value: 500, suffix: '+', label: 'Mentors' },
  { icon: FileCheck2, value: 1000, suffix: '+', label: 'Resumes Built' },
  { icon: Target, value: 95, suffix: '%', label: 'ATS Success Rate' },
]

export default function Statistics() {
  return (
    <section className="relative overflow-hidden bg-slate-900 py-20 lg:py-24">
      <div className="pointer-events-none absolute inset-0 -z-0 bg-gradient-to-br from-navy-600/25 via-royal-600/10 to-transparent" />
      <Container className="relative grid grid-cols-2 gap-8 lg:grid-cols-4">
        {STATS.map((s, i) => {
          const Icon = s.icon
          return (
            <Reveal key={s.label} delay={i * 0.1} className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-royal-300">
                <Icon className="h-6 w-6" />
              </div>
              <p className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
                <AnimatedCounter value={s.value} suffix={s.suffix} />
              </p>
              <p className="mt-2 text-sm font-medium text-slate-400">{s.label}</p>
            </Reveal>
          )
        })}
      </Container>
    </section>
  )
}
