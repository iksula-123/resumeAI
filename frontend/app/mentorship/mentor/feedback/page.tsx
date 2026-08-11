'use client'

/** My Feedback — ratings and comments received from mentees. */
import { useEffect, useState } from 'react'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import { api } from '@/lib/api'

interface Review { id: string; rating: number; review_text: string | null; reviewer_name: string | null; created_at: string | null }
interface Dashboard { overview: { avg_rating: number; rating_count: number }; reviews: Review[] }

export default function MentorFeedbackPage() {
  const [dash, setDash] = useState<Dashboard | null>(null)

  useEffect(() => { api.get<Dashboard>('/api/mentorship/mentor/dashboard').then(setDash).catch(() => {}) }, [])

  const topBar = <h1 className="text-sm font-semibold text-gray-800">My Feedback</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {dash && (
          <div className="panel-premium p-5 flex items-center gap-6">
            <div>
              <p className="text-3xl font-bold text-amber-500">{dash.overview.rating_count ? dash.overview.avg_rating.toFixed(1) : '—'}</p>
              <p className="text-xs text-gray-500">Average rating</p>
            </div>
            <div className="text-2xl text-amber-400">{'★'.repeat(Math.round(dash.overview.avg_rating))}{'☆'.repeat(5 - Math.round(dash.overview.avg_rating))}</div>
            <p className="text-sm text-gray-500 ml-auto">{dash.overview.rating_count} review{dash.overview.rating_count === 1 ? '' : 's'}</p>
          </div>
        )}

        <section className="panel-premium p-5">
          {!dash ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : dash.reviews.length === 0 ? (
            <p className="text-sm text-gray-400">No reviews yet.</p>
          ) : (
            <div className="space-y-4">
              {dash.reviews.map((r) => (
                <div key={r.id} className="border-b border-gray-100 pb-3 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{r.reviewer_name || 'Learner'}</span>
                    <span className="text-amber-500 text-xs">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                  </div>
                  {r.review_text && <p className="text-sm text-gray-600 mt-1">{r.review_text}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </MentorshipShell>
  )
}
