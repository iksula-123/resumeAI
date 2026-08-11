'use client'

/** Leaderboard — mentor ranking by sessions/rating over a rolling period. */
import { useEffect, useState } from 'react'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import { api } from '@/lib/api'

interface Row { rank: number; mentor_id: string; full_name: string | null; avatar_url: string | null; sessions_in_window: number; rating_avg: number; rating_count: number }

const PERIODS = [{ label: '7 days', value: 7 }, { label: '30 days', value: 30 }, { label: '90 days', value: 90 }]

export default function MentorLeaderboardPage() {
  const [days, setDays] = useState(30)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [myMentorId, setMyMentorId] = useState<string | null>(null)

  useEffect(() => {
    api.get<{ mentor: { id: string } }>('/api/mentorship/mentor/dashboard').then((d) => setMyMentorId(d.mentor.id)).catch(() => {})
  }, [])

  useEffect(() => {
    api.get<{ leaderboard: Row[] }>(`/api/mentorship/leaderboard?days=${days}`).then((r) => setRows(r.leaderboard)).catch(() => setRows([]))
  }, [days])

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Leaderboard</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-navy-600">Mentor Leaderboard</h2>
          <div className="flex gap-1.5">
            {PERIODS.map((p) => (
              <button key={p.value} onClick={() => setDays(p.value)} className={`text-xs px-3 py-1.5 rounded-lg transition ${days === p.value ? 'bg-navy-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {rows === null ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="panel-premium h-14 shimmer" />)}</div>
        ) : rows.length === 0 ? (
          <div className="panel-premium p-10 text-center text-sm text-gray-500">No completed sessions in this period yet.</div>
        ) : (
          <div className="panel-premium overflow-hidden">
            {rows.map((r) => (
              <div key={r.mentor_id} className={`flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0 ${r.mentor_id === myMentorId ? 'bg-royal-50' : ''}`}>
                <span className={`w-7 text-center font-bold ${r.rank <= 3 ? 'text-amber-500' : 'text-gray-400'}`}>{r.rank}</span>
                <div className="w-9 h-9 rounded-full bg-brand-gradient text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {(r.full_name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.full_name || 'Mentor'}{r.mentor_id === myMentorId && <span className="text-royal-600"> (you)</span>}</p>
                  <p className="text-xs text-gray-400">{r.sessions_in_window} sessions this period</p>
                </div>
                {r.rating_count > 0 && <span className="text-xs text-amber-600 shrink-0">★ {r.rating_avg.toFixed(1)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </MentorshipShell>
  )
}
