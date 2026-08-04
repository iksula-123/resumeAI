'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { FileText, MessageCircle, Users2, ArrowRight, Check } from 'lucide-react'
import { Container, Reveal, SectionHeading } from './shared'

const SERVICES = [
  {
    icon: FileText,
    title: 'Resume Builder',
    description: 'Create professional, ATS-friendly resumes in minutes using AI.',
    features: ['AI Resume Generation', 'ATS Score', 'Resume Templates', 'Cover Letters', 'Resume Tailoring'],
    cta: 'Explore Resume Builder',
    href: '/resumes/build',
    gradient: 'from-navy-600 to-navy-500',
    ring: 'group-hover:shadow-navy-500/20',
  },
  {
    icon: MessageCircle,
    title: 'AI Buddy',
    description: 'Your personal AI career assistant, available 24/7.',
    features: [
      'Career Advice', 'Interview Questions', 'Skill Suggestions', 'Learning Roadmap',
      'Resume Review', 'Grammar Check', 'Career Planning',
    ],
    cta: 'Talk to AI Buddy',
    href: '/copilot',
    gradient: 'from-royal-600 to-royal-500',
    ring: 'group-hover:shadow-royal-500/20',
    featured: true,
  },
  {
    icon: Users2,
    title: 'Mentorly',
    description: 'Connect with experienced industry mentors.',
    features: ['Book Mentors', 'Career Sessions', 'Mock Interviews', 'Portfolio Reviews', 'Roadmaps', 'Industry Guidance'],
    cta: 'Find a Mentor',
    href: '/auth/signup',
    gradient: 'from-teal-600 to-teal-500',
    ring: 'group-hover:shadow-teal-500/20',
  },
]

export default function Services() {
  return (
    <section id="services" className="relative py-24 lg:py-32">
      <Container>
        <SectionHeading
          eyebrow="Services"
          title="Three services. One career platform."
          description="Everything works together — your resume feeds your AI guidance, which feeds your mentor sessions."
        />

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {SERVICES.map((s, i) => {
            const Icon = s.icon
            return (
              <Reveal key={s.title} delay={i * 0.1}>
                <div
                  className={`group relative h-full rounded-[1.75rem] p-[1.5px] transition-all duration-500 ${
                    s.featured ? 'bg-gradient-to-b from-royal-400/70 via-navy-300/40 to-transparent' : 'bg-gradient-to-b from-slate-200 to-transparent dark:from-white/15'
                  } hover:from-navy-500/70 hover:via-royal-500/50 hover:to-teal-500/30`}
                >
                  <div className={`relative flex h-full flex-col rounded-[1.7rem] bg-white p-8 shadow-lg shadow-slate-900/[0.03] transition-all duration-500 group-hover:-translate-y-2 group-hover:shadow-2xl dark:bg-slate-900 ${s.ring}`}>
                    {s.featured && (
                      <span className="absolute -top-3 right-6 rounded-full bg-amber-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-md">
                        Most Popular
                      </span>
                    )}

                    <motion.div
                      whileHover={{ rotate: [0, -8, 8, -4, 0] }}
                      transition={{ duration: 0.5 }}
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${s.gradient}`}
                    >
                      <Icon className="h-7 w-7" strokeWidth={2} />
                    </motion.div>

                    <h3 className="mt-6 text-2xl font-bold text-navy-600 dark:text-white">{s.title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-mut dark:text-slate-400">{s.description}</p>

                    <ul className="mt-6 flex-1 space-y-3">
                      {s.features.map((f) => (
                        <li key={f} className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white ${s.gradient}`}>
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                          {f}
                        </li>
                      ))}
                    </ul>

                    <Link
                      href={s.href}
                      className={`group/btn mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg ${s.gradient}`}
                    >
                      {s.cta}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                    </Link>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
