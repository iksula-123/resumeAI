'use client'

/** My Feedback — session reviews I've given, plus platform feedback I've
 * submitted (with a form to submit more). Session reviews themselves are
 * submitted from My Sessions right after a session completes. */
import { useEffect, useState } from 'react'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import { api } from '@/lib/api'
import { useBrandStore } from '@/lib/brandStore'

interface BookingRow {
  booking_id: string; mentor_name: string | null; status: string
  review: { rating: number; review_text: string | null; is_anonymous: boolean } | null
}
interface PlatformFeedbackRow { id: string; rating: number; comment: string | null; created_at: string | null }

export default function MyFeedbackPage() {
  const brandName = useBrandStore((s) => s.brand_name)
  const [bookings, setBookings] = useState<BookingRow[] | null>(null)
  const [feedback, setFeedback] = useState<PlatformFeedbackRow[] | null>(null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const loadBookings = () => api.get<{ bookings: BookingRow[] }>('/api/mentorship/bookings').then((r) => setBookings(r.bookings)).catch(() => setBookings([]))
  const loadFeedback = () => api.get<{ feedback: PlatformFeedbackRow[] }>('/api/mentorship/platform-feedback/mine').then((r) => setFeedback(r.feedback)).catch(() => setFeedback([]))
  useEffect(() => { loadBookings(); loadFeedback() }, [])

  const reviewed = (bookings || []).filter((b) => b.review)

  const submitPlatformFeedback = async () => {
    if (rating === 0) { setError('Pick a rating first'); return }
    setSubmitting(true); setError('')
    try {
      await api.post('/api/mentorship/platform-feedback', { rating, comment })
      setRating(0); setComment('')
      loadFeedback()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit feedback')
    } finally {
      setSubmitting(false)
    }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">My Feedback</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <section className="panel-premium p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Session Reviews You've Given</h2>
          {bookings === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : reviewed.length === 0 ? (
            <p className="text-sm text-gray-400">You haven't left a review yet — you can after a session completes, from My Sessions.</p>
          ) : (
            <div className="space-y-3">
              {reviewed.map((b) => (
                <div key={b.booking_id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{b.mentor_name || 'Mentor'}</span>
                    <span className="text-amber-500 text-xs">{'★'.repeat(b.review!.rating)}{'☆'.repeat(5 - b.review!.rating)}</span>
                  </div>
                  {b.review!.review_text && <p className="text-sm text-gray-600 mt-1">{b.review!.review_text}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel-premium p-5">
          <h2 className="font-semibold text-gray-800 mb-1">Platform Feedback</h2>
          <p className="text-xs text-gray-500 mb-4">Feedback about {brandName} itself — not a specific session.</p>

          <div className="flex items-center gap-1.5 mb-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} className={`text-2xl transition ${n <= rating ? 'text-amber-500' : 'text-gray-200 hover:text-amber-300'}`}>★</button>
            ))}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="What's working, what's not?" className="input-premium text-sm resize-none w-full mb-3" />
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <button onClick={submitPlatformFeedback} disabled={submitting} className="btn-primary text-sm px-5 py-2.5 disabled:opacity-50">
            {submitting ? 'Sending…' : 'Submit Feedback'}
          </button>

          {feedback && feedback.length > 0 && (
            <div className="mt-5 border-t border-gray-100 pt-4 space-y-2">
              {feedback.map((f) => (
                <div key={f.id} className="flex items-start justify-between gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-gray-600">{f.comment || <em className="text-gray-400">No comment</em>}</span>
                  <span className="text-amber-500 shrink-0">{'★'.repeat(f.rating)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </MentorshipShell>
  )
}
