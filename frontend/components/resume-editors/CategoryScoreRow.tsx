'use client'

// Shared row renderer for ATSCompatibilityCard and ResumeQualityCard —
// SahiCareer UI/UX + Gamification master phase, Phase E. One implementation,
// not two, per the phase's own "no duplicate score cards" instruction.
//
// Renders a category's REAL backend `match` value as a horizontal bar, or
// "N/A" when the category isn't applicable / has no match value yet — an
// N/A category is NEVER rendered as a 0% bar (see mode_orchestrator.py's
// CategoryAnalysis: match is `float | None`, None means "too sparse to
// judge," not zero).

export interface InsightCategory {
  key: string
  label: string
  applicable: boolean
  match: number | null
  reason: string
  weight: number
}

const barColor = (s: number) => (s >= 80 ? 'bg-green-500' : s >= 60 ? 'bg-amber-400' : 'bg-red-400')
const textColor = (s: number) => (s >= 80 ? 'text-green-700' : s >= 60 ? 'text-amber-700' : 'text-red-600')

export function CategoryScoreRow({ category }: { category: InsightCategory }) {
  const isNA = !category.applicable || category.match == null
  return (
    <div className="py-1.5" title={category.reason || undefined}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-700">{category.label}</span>
        {isNA ? (
          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">N/A</span>
        ) : (
          <span className={`text-xs font-semibold ${textColor(category.match as number)}`}>{Math.round(category.match as number)}</span>
        )}
      </div>
      <div
        className="h-1.5 rounded-full bg-gray-100 overflow-hidden"
        role="progressbar"
        aria-label={category.label}
        aria-valuenow={isNA ? undefined : Math.round(category.match as number)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={isNA ? 'Not applicable' : undefined}
      >
        {!isNA && (
          <div
            className={`h-full rounded-full motion-safe:transition-all motion-safe:duration-500 ${barColor(category.match as number)}`}
            style={{ width: `${Math.round(category.match as number)}%` }}
          />
        )}
      </div>
    </div>
  )
}
