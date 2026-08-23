'use client'

// SahiCareer UI/UX + Gamification master phase, Phase E, section 2.
// Displays the EXISTING ATS Compatibility categories (Parsing Quality,
// Section Recognition, ATS Formatting, Contact/Essential Information) —
// verbatim backend values from POST /api/ats/v2/analyze-editor's
// `categories.ats_compatibility` (mode_orchestrator._compatibility_layer()'s
// own categories). No score is computed or reinterpreted here.

import { CategoryScoreRow, type InsightCategory } from './CategoryScoreRow'

export default function ATSCompatibilityCard({ score, categories }: { score: number | null; categories: InsightCategory[] }) {
  return (
    <section aria-labelledby="ats-compat-heading" className="card-premium p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 id="ats-compat-heading" className="text-sm font-semibold text-gray-900">ATS Compatibility</h3>
        <span className="text-sm font-bold text-gray-800">{score == null ? 'N/A' : `${score}/100`}</span>
      </div>
      <p className="text-[11px] text-gray-500 mb-2">Can an ATS correctly read and parse this resume?</p>
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
