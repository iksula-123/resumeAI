'use client'

// SahiCareer UI/UX + Gamification master phase, Phase E, section 12.
// Deliberately NOT a second chart — components/resume-editors/
// ScoreTrendChart.tsx (Phase D, the Journey tab) already plots the full
// trend; duplicating that here would be a second implementation of the
// same score card. This is a compact "Previous -> Current" summary using
// the same canonical ResumeVersion.ats_score values (always mode_
// orchestrator.resume_health_mode()'s score — see routers/resumes.py::
// _canonical_ats_score — never Job Match or Role Readiness).

export default function ScoreHistory({ previous, current }: { previous: number | null; current: number | null }) {
  if (previous == null || current == null || previous === current) {
    return (
      <section aria-labelledby="score-history-heading" className="card-premium p-4">
        <h3 id="score-history-heading" className="text-sm font-semibold text-gray-900 mb-1">Resume Health Progress</h3>
        <p className="text-xs text-gray-400 py-2">
          {previous == null || current == null
            ? 'Your progress will appear here as you save edits and improve your resume.'
            : 'No change yet since your first save.'}
        </p>
      </section>
    )
  }

  const improvement = current - previous
  return (
    <section aria-labelledby="score-history-heading" className="card-premium p-4">
      <h3 id="score-history-heading" className="text-sm font-semibold text-gray-900 mb-2">Resume Health Progress</h3>
      <div className="flex items-center justify-between text-center">
        <div>
          <div className="text-lg font-bold text-gray-500">{previous}</div>
          <div className="text-[10px] text-gray-400">Previous</div>
        </div>
        <span aria-hidden="true" className="text-gray-300">→</span>
        <div>
          <div className="text-lg font-bold text-gray-800">{current}</div>
          <div className="text-[10px] text-gray-400">Current</div>
        </div>
        <span aria-hidden="true" className="text-gray-300">→</span>
        <div>
          <div className={`text-lg font-bold ${improvement > 0 ? 'text-green-600' : 'text-red-500'}`}>
            {improvement > 0 ? '+' : ''}{improvement}
          </div>
          <div className="text-[10px] text-gray-400">Improvement</div>
        </div>
      </div>
    </section>
  )
}
