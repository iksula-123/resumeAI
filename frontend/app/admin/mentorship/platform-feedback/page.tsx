'use client'

import { useEffect, useState } from 'react'
import AdminMentorshipShell from '@/components/mentorship/AdminMentorshipShell'
import { api } from '@/lib/api'

interface Row { id: string; rating: number; comment: string | null; author_name: string | null; created_at: string | null }

export default function AdminPlatformFeedbackPage() {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => { api.get<{ feedback: Row[] }>('/api/mentorship/admin/platform-feedback').then((r) => setRows(r.feedback)).catch(() => setRows([])) }, [])

  const avg = rows && rows.length > 0 ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0

  const topBar = (
    <div>
      <h1 className="text-sm font-semibold text-gray-800">Platform Feedback</h1>
      <p className="text-xs text-gray-500">Feedback about the platform itself, separate from session reviews</p>
    </div>
  )

  return (
    <AdminMentorshipShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto">
        {rows && rows.length > 0 && (
          <div className="panel-premium p-5 mb-5 flex items-center gap-4">
            <p className="text-3xl font-bold text-amber-500">{avg.toFixed(1)}</p>
            <p className="text-sm text-gray-500">average across {rows.length} submission{rows.length === 1 ? '' : 's'}</p>
          </div>
        )}
        {rows === null ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="panel-premium h-16 shimmer" />)}</div>
        ) : rows.length === 0 ? (
          <div className="panel-premium p-10 text-center text-sm text-gray-500">No platform feedback yet.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((f) => (
              <div key={f.id} className="panel-premium p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{f.author_name || 'User'}</span>
                  <span className="text-amber-500 text-xs">{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</span>
                </div>
                {f.comment && <p className="text-sm text-gray-600 mt-1">{f.comment}</p>}
                {f.created_at && <p className="text-[11px] text-gray-400 mt-1">{new Date(f.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminMentorshipShell>
  )
}
