'use client'

import {
  Vault, FileEdit, Mic, Compass, ScanSearch, BarChart3, Map, HeartHandshake,
} from 'lucide-react'
import { Container, Reveal, SectionHeading } from './shared'

const ITEMS = [
  { icon: Vault, title: 'Career Vault', description: 'One secure place for every version of your resume, certificates, and records.' },
  { icon: FileEdit, title: 'AI Resume Builder', description: 'Pre-filled from real hiring data — you confirm, we never invent facts.' },
  { icon: Mic, title: 'AI Interview', description: 'Practice real interview questions with instant, actionable feedback.' },
  { icon: Compass, title: 'Job Matching', description: 'See roles ranked by fit against your actual skills and experience.' },
  { icon: ScanSearch, title: 'ATS Intelligence', description: 'Know exactly how applicant tracking systems will read your resume.' },
  { icon: BarChart3, title: 'Career Analytics', description: 'Track applications, response rates, and where to improve next.' },
  { icon: Map, title: 'Learning Roadmap', description: 'A personalized path of skills to learn for the role you want.' },
  { icon: HeartHandshake, title: 'Mentorship', description: 'Direct access to mentors who’ve worked the job you’re targeting.' },
]

export default function PlatformFeatures() {
  return (
    <section id="features" className="py-24 lg:py-32">
      <Container>
        <SectionHeading
          eyebrow="Platform"
          title="Every stage of your career, covered"
          description="A connected toolkit — not eight separate apps you have to stitch together yourself."
        />

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((it, i) => {
            const Icon = it.icon
            return (
              <Reveal key={it.title} delay={(i % 4) * 0.06}>
                <div className="group h-full rounded-2xl border border-slate-200/70 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-royal-300 hover:shadow-lg hover:shadow-royal-500/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-royal-400/30">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-colors duration-300 group-hover:bg-gradient-to-br group-hover:from-navy-600 group-hover:to-royal-600 group-hover:text-white dark:bg-white/5 dark:text-slate-300">
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-navy-600 dark:text-white">{it.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-mut dark:text-slate-400">{it.description}</p>
                </div>
              </Reveal>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
