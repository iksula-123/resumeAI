'use client'

// SahiCareer UI/UX + Gamification master phase, Phase E, section 5.
//
// Data comes from the SAME category dicts ATSCompatibilityCard/
// ResumeQualityCard render (categories.ats_compatibility/resume_quality,
// from POST /api/ats/v2/analyze-editor — unmodified backend values). The
// parent (resumes/[id]/edit/page.tsx) selects "top opportunities" by
// filtering to applicable, scored categories and sorting ascending —
// display ordering only, mirroring (not recomputing) the same threshold/
// sort/cap rule mode_orchestrator.resume_health_priorities() already uses
// server-side, without a second network call. No score is computed and no
// advice text is invented — `reason` is each category's own backend text,
// shown verbatim.
//
// "Improve" reuses the existing AI Fixes tab (Phase D) — no new
// recommendation/apply logic here.

export interface Opportunity { key: string; label: string; score: number; reason: string }

export default function TopOpportunities({ opportunities, onImprove }: { opportunities: Opportunity[]; onImprove: () => void }) {
  return (
    <section aria-labelledby="top-opportunities-heading" className="card-premium p-4">
      <h3 id="top-opportunities-heading" className="text-sm font-semibold text-gray-900 mb-1">Top Opportunities</h3>
      <p className="text-[11px] text-gray-500 mb-3">The highest-impact areas to improve next.</p>
      {opportunities.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">
          Nothing to flag — every category is in good shape.
        </p>
      ) : (
        <ol className="space-y-2.5">
          {opportunities.map((o, i) => (
            <li key={o.key} className="flex items-start gap-3 rounded-xl bg-gray-50 p-3">
              <span aria-hidden="true" className="shrink-0 w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs font-semibold text-gray-500">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-gray-800">{o.label}</span>
                  <span className="text-xs font-semibold text-amber-700 shrink-0">{o.score}/100</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{o.reason}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <button
        onClick={onImprove}
        className="btn-primary w-full mt-3 text-xs py-2"
        aria-label="Open AI Fixes to improve these areas"
      >
        Improve →
      </button>
    </section>
  )
}
