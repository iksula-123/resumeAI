'use client'

import { useEffect, useState } from 'react'
import AdminMentorshipShell from '@/components/mentorship/AdminMentorshipShell'
import { api } from '@/lib/api'

interface Row { rank: number; mentor_id: string; full_name: string | null; sessions_in_window: number; sessions_completed_total: number; rating_avg: number; rating_count: number }
const PERIODS = [{ label: '7 days', value: 7 }, { label: '30 days', value: 30 }, { label: '90 days', value: 90 }]

export default function AdminLeaderboardPage() {
  const [days, setDays] = useState(30)
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    api.get<{ leaderboard: Row[] }>(`/api/mentorship/admin/leaderboard?days=${days}`).then((r) => setRows(r.leaderboard)).catch(() => setRows([]))
  }, [days])

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Leaderboard</h1>

  return (
    <AdminMentorshipShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-navy-600">Full Mentor Rankings</h2>
          <div className="flex gap-1.5">
            {PERIODS.map((p) => (
              <button key={p.value} onClick={() => setDays(p.value)} className={`text-xs px-3 py-1.5 rounded-lg transition ${days === p.value ? 'bg-navy-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{p.label}</button>
            ))}
          </div>
        </div>

        {rows === null ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="panel-premium h-14 shimmer" />)}</div>
        ) : rows.length === 0 ? (
          <div className="panel-premium p-10 text-center text-sm text-gray-500">No completed sessions in this period yet.</div>
        ) : (
          <div className="panel-premium overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Rank</th>
                  <th className="px-5 py-3 font-medium">Mentor</th>
                  <th className="px-5 py-3 font-medium">Sessions (period)</th>
                  <th className="px-5 py-3 font-medium">Total completed</th>
                  <th className="px-5 py-3 font-medium">Rating</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.mentor_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-bold text-gray-700">{r.rank}</td>
                    <td className="px-5 py-3 font-medium text-gray-800">{r.full_name || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{r.sessions_in_window}</td>
                    <td className="px-5 py-3 text-gray-600">{r.sessions_completed_total}</td>
                    <td className="px-5 py-3 text-amber-600">{r.rating_count > 0 ? `★ ${r.rating_avg.toFixed(1)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminMentorshipShell>
  )
}
