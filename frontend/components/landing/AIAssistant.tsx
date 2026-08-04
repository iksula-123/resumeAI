'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Sparkles, Send } from 'lucide-react'
import { Container, Reveal, GradientOrbs } from './shared'

const EXCHANGES = [
  {
    user: 'Improve my resume',
    reply: 'Your summary reads generic — I’ve tightened it and added 3 measurable results from your work experience. Want to see the diff?',
  },
  {
    user: 'Prepare me for React interview',
    reply: 'Let’s start with hooks and rendering behavior — I’ll ask 5 questions, then rate your answers like a real interviewer would.',
  },
  {
    user: 'What should I learn next?',
    reply: 'Based on your target role, TypeScript and system design have the highest impact on your shortlist rate. Want a 4-week plan?',
  },
]

const TYPE_SPEED = 45
const HOLD_AFTER_REPLY = 2600

export default function AIAssistant() {
  const [index, setIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [showReply, setShowReply] = useState(false)

  useEffect(() => {
    setTyped('')
    setShowReply(false)
    const full = EXCHANGES[index].user
    let i = 0
    const typeTimer = setInterval(() => {
      i += 1
      setTyped(full.slice(0, i))
      if (i >= full.length) {
        clearInterval(typeTimer)
        setTimeout(() => setShowReply(true), 500)
      }
    }, TYPE_SPEED)
    return () => clearInterval(typeTimer)
  }, [index])

  useEffect(() => {
    if (!showReply) return
    const next = setTimeout(() => setIndex((v) => (v + 1) % EXCHANGES.length), HOLD_AFTER_REPLY)
    return () => clearTimeout(next)
  }, [showReply])

  return (
    <section id="ai-assistant" className="relative overflow-hidden py-24 lg:py-32">
      <GradientOrbs className="opacity-60" />
      <Container className="grid items-center gap-16 lg:grid-cols-2">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-xs font-semibold text-teal-700 dark:border-teal-400/20 dark:bg-teal-400/10 dark:text-teal-300">
            Meet AI Buddy
          </span>
          <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-navy-600 sm:text-4xl lg:text-5xl dark:text-white">
            An AI career assistant that actually knows your goals
          </h2>
          <p className="mt-4 max-w-lg text-balance text-lg leading-relaxed text-mut dark:text-slate-400">
            Ask it to review your resume, grill you on interview questions, or plan your next
            skill — it remembers your target role and career history across every conversation.
          </p>
          <ul className="mt-8 space-y-4">
            {['Resume review with specific, actionable edits', 'Mock interviews scored like a real recruiter', 'A learning roadmap tuned to your target job'].map((f) => (
              <li key={f} className="flex items-start gap-3 text-[15px] text-slate-700 dark:text-slate-300">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-royal-500 to-navy-500 text-white">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="relative mx-auto w-full max-w-md rounded-[1.75rem] border border-slate-200/70 bg-white/90 p-5 shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 dark:border-white/5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-royal-600 to-navy-600 text-white">
                <Bot className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-sm font-bold text-navy-600 dark:text-white">AI Buddy</p>
                <p className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Online now
                </p>
              </div>
            </div>

            <div className="flex min-h-[220px] flex-col justify-end gap-3 py-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`user-${index}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-navy-600 to-royal-600 px-4 py-2.5 text-sm font-medium text-white shadow-md"
                >
                  {typed}
                  {typed.length < EXCHANGES[index].user.length && (
                    <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-white/80 align-middle" />
                  )}
                </motion.div>
              </AnimatePresence>

              <AnimatePresence>
                {showReply && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="mr-auto max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm leading-relaxed text-slate-700 shadow-sm dark:border-white/5 dark:bg-white/5 dark:text-slate-300"
                  >
                    {EXCHANGES[index].reply}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 dark:border-white/10 dark:bg-white/5">
              <span className="flex-1 text-sm text-slate-400 dark:text-slate-500">Ask AI Buddy anything…</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-navy-600 to-royal-600 text-white">
                <Send className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
