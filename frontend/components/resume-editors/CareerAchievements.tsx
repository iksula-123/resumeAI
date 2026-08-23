'use client'

// Career Achievements — SahiCareer UI/UX + Gamification master phase,
// section 9. Purely presentational; the parent computes each `done` flag
// from real, already-loaded data (resume.ats_score, content, version
// history, change history) — this component never decides what counts as
// "done" and never persists anything (no schema change — see the edit
// page's achievements useMemo for the exact, honest conditions).

export interface Achievement { key: string; icon: string; label: string; done: boolean }

export default function CareerAchievements({ achievements }: { achievements: Achievement[] }) {
  const unlocked = achievements.filter(a => a.done).length
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-semibold text-gray-800">🏆 Career Achievements</span>
        <span className="text-[11px] text-gray-400">{unlocked}/{achievements.length}</span>
      </div>
      <ul className="space-y-1">
        {achievements.map(a => (
          <li key={a.key}
            className={`flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 transition-colors ${
              a.done ? 'bg-green-50 text-green-800' : 'text-gray-400'}`}>
            <span className={`w-4 text-center ${a.done ? 'text-green-600' : 'text-gray-300'}`}>{a.done ? '✓' : '○'}</span>
            <span className={a.done ? 'font-medium' : ''}>{a.icon} {a.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
