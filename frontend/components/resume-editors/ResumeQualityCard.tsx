'use client'

// SahiCareer UI/UX + Gamification master phase, Phase E, section 3.
// Displays the EXISTING Resume Quality categories (Bullet Quality,
// Quantified Impact, Action Verb Strength, Skill Evidence, Summary Quality,
// Grammar & Readability, Seniority Signals, Career Progression, Repetition,
// Credibility Signals, Recruiter Readiness) — verbatim backend values from
// `categories.resume_quality` (mode_orchestrator._quality_layer()'s own
// categories, resume_quality.py, unmodified). No category is invented and
// none of these scores are recalculated here.

import { CategoryScoreRow, type InsightCategory } from './CategoryScoreRow'

export default function ResumeQualityCard({ score, categories }: { score: number | null; categories: InsightCategory[] }) {
  return (
    <section aria-labelledby="resume-quality-heading" className="card-premium p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 id="resume-quality-heading" className="text-sm font-semibold text-gray-900">Resume Quality</h3>
        <span className="text-sm font-bold text-gray-800">{score == null ? 'N/A' : `${score}/100`}</span>
      </div>
      <p className="text-[11px] text-gray-500 mb-2">Is the actual content — the writing itself — any good?</p>
      {categories.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">Run an ATS check to see this breakdown.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {categories.map(c => <CategoryScoreRow key={c.key} category={c} />)}
        </div>
      )}
    </section>
  )
}
