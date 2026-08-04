'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, PlayCircle, FileText, MessageCircle, Users2, TrendingUp, CheckCircle2 } from 'lucide-react'
import { Container, GradientOrbs, fadeUp } from './shared'

const FLOAT_CARDS = [
  {
    icon: FileText,
    title: 'Resume Builder',
    detail: 'ATS Score: 94',
    accent: 'from-navy-500 to-navy-600',
    className: 'left-0 top-4 lg:-left-6',
    float: { y: [0, -14, 0], duration: 6 },
  },
  {
    icon: MessageCircle,
    title: 'AI Buddy',
    detail: '"Improve my summary…"',
    accent: 'from-royal-500 to-royal-600',
    className: 'right-0 top-24 lg:-right-8',
    float: { y: [0, 16, 0], duration: 7 },
  },
  {
    icon: Users2,
    title: 'Mentorly',
    detail: '3 mentors available',
    accent: 'from-teal-500 to-teal-600',
    className: 'left-6 bottom-0 lg:left-2',
    float: { y: [0, -12, 0], duration: 5.5 },
  },
]

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pb-24 pt-32 lg:pb-32 lg:pt-40">
      <GradientOrbs />
      <Container className="grid items-center gap-16 lg:grid-cols-2">
        <div>
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-xs font-semibold text-teal-700 dark:border-teal-400/20 dark:bg-teal-400/10 dark:text-teal-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal-600" />
              </span>
              Now live — AI Career Platform
            </span>
          </motion.div>

          <motion.h1
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={1}
            className="mt-6 text-balance text-5xl font-extrabold leading-[1.08] tracking-tight text-navy-600 sm:text-6xl lg:text-[3.4rem] xl:text-6xl dark:text-white"
          >
            Your AI Career Partner{' '}
            <span className="bg-gradient-to-r from-navy-600 to-royal-600 bg-clip-text text-transparent">
              for Every Step
            </span>
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={2}
            className="mt-6 max-w-xl text-balance text-lg leading-relaxed text-mut dark:text-slate-400"
          >
            SahiCareer helps learners build resumes, prepare for interviews, receive AI career
            guidance, and connect with mentors — all in one intelligent platform.
          </motion.p>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={3}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <Link
              href="/auth/signup"
              className="group inline-flex items-center gap-2 rounded-xl bg-accent px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-accent-600/30 transition hover:-translate-y-0.5 hover:bg-accent-700 hover:shadow-xl"
            >
              Start Your Career
              <ArrowRight className="h-4.5 w-4.5 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#ai-assistant"
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-white/70 px-7 py-3.5 text-base font-semibold text-navy-600 backdrop-blur transition hover:-translate-y-0.5 hover:border-royal-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <PlayCircle className="h-5 w-5 text-royal-600 dark:text-royal-400" />
              Watch Demo
            </a>
          </motion.div>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={4}
            className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3"
          >
            {['Free to start', 'ATS-friendly output', 'Built for Indian hiring'].map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm font-medium text-mut dark:text-slate-400">
                <CheckCircle2 className="h-4 w-4 text-good-600" />
                {f}
              </div>
            ))}
          </motion.div>
        </div>

        {/* Right side — mock dashboard illustration with floating service cards */}
        <div className="relative mx-auto h-[26rem] w-full max-w-md lg:h-[30rem] lg:max-w-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-4 top-10 bottom-10 rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70"
          >
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
            </div>
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-navy-600 dark:text-royal-400" />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Career Score</span>
                </div>
                <span className="text-sm font-bold text-good-600 dark:text-good-400">+18%</span>
              </div>
              {[72, 45, 90, 60].map((w, i) => (
                <div key={i} className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${w}%` }}
                    transition={{ duration: 1.1, delay: 0.5 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full bg-gradient-to-r from-navy-500 to-royal-500"
                  />
                </div>
              ))}
            </div>
          </motion.div>

          {FLOAT_CARDS.map((c, i) => {
            const Icon = c.icon
            return (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: c.float.y }}
                transition={{
                  opacity: { duration: 0.6, delay: 0.6 + i * 0.15 },
                  y: { duration: c.float.duration, repeat: Infinity, ease: 'easeInOut', delay: 0.6 + i * 0.15 },
                }}
                className={`absolute z-10 w-48 rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/90 ${c.className}`}
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${c.accent} text-white shadow-md`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <p className="mt-2.5 text-sm font-bold text-navy-600 dark:text-white">{c.title}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{c.detail}</p>
              </motion.div>
            )
          })}
        </div>
      </Container>
    </section>
  )
}
