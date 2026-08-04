'use client'

import { Sparkles, ShieldCheck, TrendingUp, Users, Target, Wand2 } from 'lucide-react'
import { Container, Reveal, SectionHeading } from './shared'

const FEATURES = [
  {
    icon: Sparkles,
    title: 'AI Powered',
    description: 'Every tool is backed by AI trained on real hiring outcomes — not generic templates.',
    accent: 'text-navy-600 bg-navy-50 dark:text-navy-300 dark:bg-navy-400/10',
  },
  {
    icon: ShieldCheck,
    title: 'ATS Ready',
    description: 'Resumes and formatting that pass applicant tracking systems recruiters actually use.',
    accent: 'text-royal-600 bg-royal-50 dark:text-royal-400 dark:bg-royal-400/10',
  },
  {
    icon: TrendingUp,
    title: 'Career Growth',
    description: 'A roadmap that adapts as your skills and goals evolve — not a one-time resume fix.',
    accent: 'text-good-600 bg-good-50 dark:text-good-400 dark:bg-good-400/10',
  },
  {
    icon: Users,
    title: 'Expert Mentors',
    description: 'Real industry professionals for mock interviews, portfolio reviews, and guidance.',
    accent: 'text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-400/10',
  },
  {
    icon: Target,
    title: 'Job Preparation',
    description: 'Role-specific interview prep, skill checklists, and practice tailored to the job.',
    accent: 'text-royal-600 bg-royal-50 dark:text-royal-400 dark:bg-royal-400/10',
  },
  {
    icon: Wand2,
    title: 'Smart Recommendations',
    description: 'Personalized next steps — skills to learn, roles to target, mentors to book.',
    accent: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-400/10',
  },
]

export default function WhySahiCareer() {
  return (
    <section id="why" className="py-24 lg:py-32">
      <Container>
        <SectionHeading
          eyebrow="Why SahiCareer"
          title="Everything you need to build your career"
          description="One platform, three connected services — resume, guidance, and mentorship — built around real hiring data."
        />

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <Reveal key={f.title} delay={i * 0.07}>
                <div className="group h-full rounded-3xl border border-slate-200/70 bg-white p-7 transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 ${f.accent}`}>
                    <Icon className="h-6 w-6" strokeWidth={2} />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-navy-600 dark:text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mut dark:text-slate-400">{f.description}</p>
                </div>
              </Reveal>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
