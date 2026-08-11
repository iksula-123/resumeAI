'use client'

/** Feedback — all session feedback (reviews), with moderation (remove). */
import { useCallback, useEffect, useState } from 'react'
import AdminMentorshipShell from '@/components/mentorship/AdminMentorshipShell'
import { api } from '@/lib/api'

interface Review { id: string; rating: number; review_text: string | null; learner_name: string | null; mentor_name: string | null; created_at: string | null }

export default function AdminFeedbackPage() {
  const [reviews, setReviews] = useState<Review[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setReviews((await api.get<{ feedback: Review[] }>('/api/mentorship/admin/recent-feedback?limit=100')).feedback)
  }, [])
  useEffect(() => { load() }, [load])

  const remove = async (id: string) => {
    if (!confirm('Remove this review? This affects the mentor\'s rating.')) return
    setBusy(id)
    try { await api.delete(`/api/mentorship/admin/reviews/${id}`); load() }
    finally { setBusy(null) }
  }

  const topBar = (
    <div>
      <h1 className="text-sm font-semibold text-gray-800">Feedback</h1>
      <p className="text-xs text-gray-500">All session feedback across the platform</p>
    </div>
  )

  return (
    <AdminMentorshipShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto">
        {reviews === null ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="panel-premium h-20 shimmer" />)}</div>
        ) : reviews.length === 0 ? (
          <div className="panel-premium p-10 text-center text-sm text-gray-500">No feedback yet.</div>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="panel-premium p-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{r.learner_name || 'Learner'} → {r.mentor_name || 'Mentor'}</span>
                    <span className="text-amber-500 text-xs">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                  </div>
                  {r.review_text && <p className="text-sm text-gray-600 mt-1">{r.review_text}</p>}
                  {r.created_at && <p className="text-[11px] text-gray-400 mt-1">{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                </div>
                <button onClick={() => remove(r.id)} disabled={busy === r.id} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition disabled:opacity-40 shrink-0">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminMentorshipShell>
  )
}
