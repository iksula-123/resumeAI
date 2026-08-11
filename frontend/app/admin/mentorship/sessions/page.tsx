'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminMentorshipShell from '@/components/mentorship/AdminMentorshipShell'
import { api } from '@/lib/api'

interface SessionRow { session_id: string; booking_id: string; mentor_name: string | null; learner_name: string | null; session_type: string; status: string; scheduled_start: string | null; duration_minutes: number }
interface SessionsResponse { sessions: SessionRow[]; total: number; page: number; total_pages: number }

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-good-50 text-good-700', completed: 'bg-royal-50 text-royal-700',
  cancelled: 'bg-red-50 text-red-600', no_show: 'bg-amber-50 text-amber-700', rescheduled: 'bg-teal-50 text-teal-700',
}

export default function AdminSessionsPage() {
  const [status, setStatus] = useState('')
  const [mentorSearch, setMentorSearch] = useState('')
  const [learnerSearch, setLearnerSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<SessionsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '25' })
      if (status) params.set('status', status)
      if (mentorSearch) params.set('mentor_search', mentorSearch)
      if (learnerSearch) params.set('learner_search', learnerSearch)
      setData(await api.get<SessionsResponse>(`/api/mentorship/admin/sessions?${params}`))
    } finally {
      setLoading(false)
    }
  }, [status, mentorSearch, learnerSearch, page])
  useEffect(() => { load() }, [load])

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Sessions</h1>

  return (
    <AdminMentorshipShell topBar={topBar}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex flex-wrap gap-3 mb-4">
          <input value={mentorSearch} onChange={(e) => { setMentorSearch(e.target.value); setPage(1) }} placeholder="Mentor name…" className="input-premium text-sm max-w-[200px]" />
          <input value={learnerSearch} onChange={(e) => { setLearnerSearch(e.target.value); setPage(1) }} placeholder="Learner name…" className="input-premium text-sm max-w-[200px]" />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="input-premium text-sm max-w-[160px]">
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No-show</option>
            <option value="rescheduled">Rescheduled</option>
          </select>
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="panel-premium h-14 shimmer" />)}</div>
        ) : !data || data.sessions.length === 0 ? (
          <div className="panel-premium p-10 text-center text-sm text-gray-500">No sessions found.</div>
        ) : (
          <>
            <div className="panel-premium overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-5 py-3 font-medium">Mentor</th>
                    <th className="px-5 py-3 font-medium">Learner</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">When</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map((s) => (
                    <tr key={s.session_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-medium text-gray-800">{s.mentor_name || '—'}</td>
                      <td className="px-5 py-3 text-gray-700">{s.learner_name || '—'}</td>
                      <td className="px-5 py-3 text-gray-600">{s.session_type.replace('_', ' ')} · {s.duration_minutes}min</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{s.scheduled_start ? new Date(s.scheduled_start).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                      <td className="px-5 py-3"><span className={`text-xs px-2 py-1 rounded-full capitalize ${STATUS_STYLES[s.status] || 'bg-gray-100 text-gray-600'}`}>{s.status.replace('_', ' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.total_pages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40">← Prev</button>
                <span className="text-sm text-gray-500">Page {data.page} of {data.total_pages}</span>
                <button disabled={page >= data.total_pages} onClick={() => setPage((p) => p + 1)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40">Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminMentorshipShell>
  )
}
