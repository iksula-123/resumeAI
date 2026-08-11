'use client'

import { Star, Calendar } from 'lucide-react'
import { Container, Reveal, SectionHeading } from './shared'

/** Illustrative sample profiles — swap for real mentor data once Mentorly onboarding is live. */
const MENTORS = [
  {
    initials: 'AR',
    name: 'Yaqub.',
    role: 'Senior Product Manager',
    experience: '9 yrs experience',
    rating: 4.9,
    sessions: 210,
    skills: ['Product Strategy', 'Interview Prep', 'Career Switch'],
    gradient: 'from-navy-500 to-navy-600',
  },
  {
    initials: 'KM',
    name: 'Amresh P.',
    role: 'Engineering Lead',
    experience: '11 yrs experience',
    rating: 5.0,
    sessions: 340,
    skills: ['System Design', 'Mock Interviews', 'Resume Review'],
    gradient: 'from-royal-500 to-royal-600',
  },
  {
    initials: 'SN',
    name: 'Ajay M',
    role: 'HR Business Partner',
    experience: '7 yrs experience',
    rating: 4.8,
    sessions: 165,
    skills: ['Hiring Insights', 'Soft Skills', 'Salary Negotiation'],
    gradient: 'from-teal-500 to-teal-600',
  },
]

export default function MentorSpotlight() {
  return (
    <section className="py-24 lg:py-32">
      <Container>
        <SectionHeading
          eyebrow="Mentor Spotlight"
          title="Learn from people who've done the job"
          description="Book a session with a mentor who's hired, been hired, or built the career you're aiming for."
        />

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {MENTORS.map((m, i) => (
            <Reveal key={m.name} delay={i * 0.08}>
              <div className="group h-full rounded-3xl border border-slate-200/70 bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center gap-4">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold text-white shadow-md ${m.gradient}`}>
                    {m.initials}
                  </div>
                  <div>
                    <p className="font-bold text-navy-600 dark:text-white">{m.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{m.role}</p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">{m.experience}</span>
                  <span className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {m.rating} · {m.sessions} sessions
                  </span>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {m.skills.map((s) => (
                    <span key={s} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-white/5 dark:text-slate-300">
                      {s}
                    </span>
                  ))}
                </div>

                <button className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition group-hover:border-royal-300 group-hover:bg-royal-50 group-hover:text-royal-700 dark:border-white/10 dark:text-slate-200 dark:group-hover:border-royal-400/30 dark:group-hover:bg-royal-400/10 dark:group-hover:text-royal-300">
                  <Calendar className="h-4 w-4" />
                  Book Session
                </button>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}
