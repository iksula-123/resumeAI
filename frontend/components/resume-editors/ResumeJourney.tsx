'use client'

// Resume Journey — SahiCareer UI/UX + Gamification master phase, section 10.
// A read-only visual timeline built ONLY from real stored data: version
// snapshots (GET /api/resumes/{id}/versions — the same endpoint
// VersionHistory.tsx already uses for restore) and, where present, real
// applied-AI-Fix change-history entries. No historical event is invented;
// if there's nothing yet, it says so instead of drawing a fake timeline.

export interface JourneyEvent {
  icon: string
  label: string
  sub?: string
  date: string | null
  score?: number | null
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const scoreColor = (s?: number | null) =>
  s == null ? 'text-gray-400' : s >= 80 ? 'text-green-600' : s >= 60 ? 'text-amber-600' : 'text-red-500'

export default function ResumeJourney({ events, currentScore }: { events: JourneyEvent[]; currentScore: number | null }) {
  if (events.length === 0 && currentScore == null) {
    return (
      <p className="text-xs text-gray-400 text-center py-6">
        Your resume's journey will appear here as you save edits and run ATS checks.
      </p>
    )
  }

  const rows: JourneyEvent[] = [...events]
  if (currentScore != null) {
    rows.push({ icon: '📍', label: 'Resume Health — Today', date: null, score: currentScore })
  }

  return (
    <div className="relative pl-4">
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-royal-100" />
      <div className="space-y-3">
        {rows.map((e, i) => {
          const isLast = i === rows.length - 1
          return (
            <div key={i} className="relative">
              <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-white ${isLast ? 'bg-royal-500' : 'bg-gray-300'}`} />
              <div className="text-[11px] text-gray-400">{e.date ? fmtDate(e.date) : 'Today'}</div>
              <div className="text-xs text-gray-800 font-medium">{e.icon} {e.label}</div>
              {e.sub && <div className="text-[11px] text-gray-500">{e.sub}</div>}
              {e.score != null && !e.sub && (
                <div className={`text-[11px] font-semibold ${scoreColor(e.score)}`}>{e.score}/100</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
