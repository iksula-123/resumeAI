'use client'

// SahiCareer UI/UX + Gamification master phase, Phase E, section 4.
// Profile Completeness is explicitly NOT part of Resume ATS Health — see
// docs/ATS_ANALYSIS_MODES.md and mode_orchestrator.resume_health_mode()'s
// own `supplementary.completeness` ("contributes_to_score": false). This
// card reuses @/lib/resumeContent's computeCompletion() — the SAME
// function the Resume Progress bar (Phase C) and the editor's section
// checkmarks already use — rather than a second completion algorithm.

import type { CompletionSection } from '@/lib/resumeContent'

export default function ProfileCompletenessCard({ pct, sections }: { pct: number; sections: CompletionSection[] }) {
  return (
    <section aria-labelledby="profile-completeness-heading" className="card-premium p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 id="profile-completeness-heading" className="text-sm font-semibold text-gray-900">Profile Completeness</h3>
        <span className="text-sm font-bold text-gray-800">{pct}%</span>
      </div>
      <p className="text-[11px] text-gray-500 mb-2">
        How much of your profile is filled in — a separate signal from ATS readiness.
      </p>
      <div
        className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-3"
        role="progressbar" aria-label="Profile Completeness"
        aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-royal-500 to-teal-500 motion-safe:transition-all motion-safe:duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {sections.map(s => (
          <li key={s.key} className={`flex items-center gap-1.5 text-[11px] ${s.done ? 'text-gray-700' : 'text-gray-400'}`}>
            <span aria-hidden="true" className={s.done ? 'text-green-600' : 'text-gray-300'}>{s.done ? '✓' : '○'}</span>
            {s.label}
          </li>
        ))}
      </ul>
    </section>
  )
}
