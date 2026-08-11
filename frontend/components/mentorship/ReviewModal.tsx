'use client'

/**
 * Review submission (Module 9). Only reachable from a completed session
 * (the server independently enforces this too — a review can't be created
 * for a session that hasn't happened). Mentor rating_avg/rating_count update
 * automatically via a DB trigger once this posts; no client-side math.
 */
import { useState } from 'react'
import { api } from '@/lib/api'

interface ReviewModalProps {
  bookingId: string
  mentorName: string | null
  onClose: () => void
  onSubmitted: () => void
}

export default function ReviewModal({ bookingId, mentorName, onClose, onSubmitted }: ReviewModalProps) {
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [text, setText] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (rating === 0) { setError('Please select a star rating'); return }
    setSubmitting(true); setError('')
    try {
      await api.post(`/api/mentorship/bookings/${bookingId}/review`, {
        rating, review_text: text, is_anonymous: anonymous,
      })
      setDone(true)
      onSubmitted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your review')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm panel-premium p-6" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">🙏</div>
            <h3 className="text-lg font-bold text-navy-600">Thanks for your review!</h3>
            <button onClick={onClose} className="btn-primary w-full mt-6 py-2.5">Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-navy-600">Rate your session{mentorName && <> with {mentorName}</>}</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            <div className="flex justify-center gap-1.5 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="text-3xl leading-none transition"
                  aria-label={`${star} star`}
                >
                  <span className={star <= (hoverRating || rating) ? 'text-amber-400' : 'text-gray-200'}>★</span>
                </button>
              ))}
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="What was helpful about this session? (optional)"
              className="input-premium text-sm resize-none mb-3"
            />

            <label className="flex items-center gap-2 text-xs text-gray-600 mb-4">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              Post this review anonymously
            </label>

            {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-3">{error}</div>}

            <button onClick={submit} disabled={submitting} className="btn-primary w-full py-2.5">
              {submitting ? 'Submitting…' : 'Submit Review'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
