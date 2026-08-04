'use client'

import { useEffect, useRef } from 'react'
import { motion, useInView, useMotionValue, animate, type Variants } from 'framer-motion'
import { cn } from '@/lib/utils'

/** Max-width content wrapper used by every landing section. */
export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-6 lg:px-8', className)}>{children}</div>
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] },
  }),
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: (i: number = 0) => ({ opacity: 1, transition: { duration: 0.8, delay: i * 0.08 } }),
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: (i: number = 0) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
}

/** Scroll-triggered reveal wrapper — fades/slides children in once, on entering the viewport. */
export function Reveal({
  children,
  className,
  delay = 0,
  variants = fadeUp,
  as: Tag = motion.div,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  variants?: Variants
  as?: any
}) {
  const Comp = Tag
  return (
    <Comp
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={variants}
      custom={delay}
      className={className}
    >
      {children}
    </Comp>
  )
}

/** Small pill badge used above section headings. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5',
        'text-xs font-semibold tracking-wide text-teal-700',
        'dark:border-teal-400/20 dark:bg-teal-400/10 dark:text-teal-300',
        className
      )}
    >
      {children}
    </span>
  )
}

/** Standard "eyebrow + heading + description" block, centered by default. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  center = true,
  className,
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  center?: boolean
  className?: string
}) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center', className)}>
      {eyebrow && (
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
        </Reveal>
      )}
      <Reveal delay={0.06}>
        <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-navy-600 sm:text-4xl lg:text-5xl dark:text-white">
          {title}
        </h2>
      </Reveal>
      {description && (
        <Reveal delay={0.12}>
          <p className="mt-4 text-balance text-lg leading-relaxed text-mut dark:text-slate-400">
            {description}
          </p>
        </Reveal>
      )}
    </div>
  )
}

/** Counts up from 0 to `value` once it scrolls into view. */
export function AnimatedCounter({
  value,
  suffix = '',
  prefix = '',
  duration = 1.8,
}: {
  value: number
  suffix?: string
  prefix?: string
  duration?: number
}) {
  const spanRef = useRef<HTMLSpanElement>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const isInView = useInView(wrapRef, { once: true, margin: '-100px' })
  const count = useMotionValue(0)

  useEffect(() => {
    if (!isInView) return
    const controls = animate(count, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        if (spanRef.current) spanRef.current.textContent = Math.floor(v).toLocaleString('en-IN')
      },
    })
    return () => controls.stop()
  }, [isInView, value, duration, count])

  return (
    <span ref={wrapRef} className="tabular-nums">
      {prefix}
      <span ref={spanRef}>0</span>
      {suffix}
    </span>
  )
}

/** Gradient blob used behind hero / CTA sections for ambient depth. */
export function GradientOrbs({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 -z-10 overflow-hidden', className)} aria-hidden>
      <div className="absolute left-1/2 top-[-10%] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-royal-400/15 blur-[110px] dark:bg-royal-500/10" />
      <div className="absolute right-[-10%] top-[20%] h-[28rem] w-[28rem] rounded-full bg-teal-400/12 blur-[110px] dark:bg-teal-500/10" />
      <div className="absolute left-[-10%] bottom-[-10%] h-[28rem] w-[28rem] rounded-full bg-navy-400/12 blur-[110px] dark:bg-navy-500/10" />
    </div>
  )
}
