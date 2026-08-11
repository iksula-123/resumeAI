'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { useBrandStore } from '@/lib/brandStore'

/** Bottom-right floating feedback button on every mentee/mentor mentorship
 * page — feedback about the platform itself, separate from per-session
 * reviews. Posts to platform_feedback (Admin → Platform Feedback). */
export default function FloatingFeedbackButton() {
  const brandName = useBrandStore((s) => s.brand_name)
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const close = () => {
    setOpen(false)
    setTimeout(() => { setRating(0); setComment(''); setDone(false); setError('') }, 200)
  }

  const submit = async () => {
    if (rating === 0) { setError('Pick a rating first'); return }
    setSubmitting(true); setError('')
    try {
      await api.post('/api/mentorship/platform-feedback', { rating, comment })
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit feedback')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-brand-gradient text-white shadow-glow flex items-center justify-center text-xl hover:scale-105 transition"
        aria-label="Give feedback"
        title="Give feedback"
      >
        💬
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={close}>
          <div className="glass-card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            {done ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-2">✅</div>
                <p className="font-semibold text-gray-800">Thanks for the feedback!</p>
                <button onClick={close} className="btn-secondary mt-4 px-5 py-2 text-sm">Close</button>
              </div>
            ) : (
              <>
                <h3 className="font-semibold text-gray-800 mb-1">How's {brandName} working for you?</h3>
                <p className="text-xs text-gray-500 mb-4">Platform feedback — goes straight to the team.</p>
                <div className="flex items-center gap-1.5 mb-4">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setRating(n)} className={`text-2xl transition ${n <= rating ? 'text-amber-500' : 'text-gray-200 hover:text-amber-300'}`} aria-label={`${n} star`}>
                      ★
                    </button>
                  ))}
                </div>
                <textarea
                  value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
                  placeholder="Anything you'd like us to know? (optional)"
                  className="input-premium text-sm resize-none w-full"
                />
                {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
                <div className="flex gap-2 mt-4">
                  <button onClick={close} className="btn-secondary flex-1 py-2 text-sm">Cancel</button>
                  <button onClick={submit} disabled={submitting} className="btn-primary flex-1 py-2 text-sm disabled:opacity-50">
                    {submitting ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
