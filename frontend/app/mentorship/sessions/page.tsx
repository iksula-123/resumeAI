'use client'

/** My Sessions — full session list/history, extracted from the old
 * dashboard tabs. Book/reschedule/cancel/review/notes all live here now;
 * the dashboard only shows the single next upcoming session. */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import SessionNotes from '@/components/mentorship/SessionNotes'
import RescheduleModal from '@/components/mentorship/RescheduleModal'
import ReviewModal from '@/components/mentorship/ReviewModal'
import { api } from '@/lib/api'

interface BookingRow {
  booking_id: string; session_id: string; mentor_id: string; mentor_name: string | null
  session_type: string; duration_minutes: number; agenda: string | null
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled'
  scheduled_start: string | null; scheduled_end: string | null
  price_amount: number; price_currency: string; meeting_link: string | null
  review: { rating: number; review_text: string | null; is_anonymous: boolean } | null
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  one_on_one: '1:1 Mentorship', resume_review: 'Resume Review', mock_interview: 'Mock Interview',
  career_guidance: 'Career Guidance', group_session: 'Group Session',
}
const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-good-50 text-good-700 border-good-100',
  completed: 'bg-royal-50 text-royal-700 border-royal-100',
  cancelled: 'bg-red-50 text-red-600 border-red-100',
  no_show: 'bg-amber-50 text-amber-700 border-amber-100',
  rescheduled: 'bg-teal-50 text-teal-700 border-teal-100',
}
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

type Tab = 'upcoming' | 'completed' | 'cancelled' | 'all'

export default function MySessionsPage() {
  const [bookings, setBookings] = useState<BookingRow[] | null>(null)
  const [tab, setTab] = useState<Tab>('upcoming')
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [reschedulingBooking, setReschedulingBooking] = useState<{ id: string; mentorId: string; duration: number } | null>(null)
  const [reviewingBooking, setReviewingBooking] = useState<{ id: string; mentorName: string | null } | null>(null)
  const [error, setError] = useState('')

  const loadBookings = () => api.get<{ bookings: BookingRow[] }>('/api/mentorship/bookings').then((r) => setBookings(r.bookings)).catch((e) => setError(e instanceof Error ? e.message : 'Could not load sessions'))
  useEffect(() => { loadBookings() }, [])

  const upcoming = useMemo(() => (bookings || []).filter((b) => b.status === 'scheduled'), [bookings])
  const completed = useMemo(() => (bookings || []).filter((b) => b.status === 'completed'), [bookings])
  const cancelled = useMemo(() => (bookings || []).filter((b) => b.status === 'cancelled' || b.status === 'no_show'), [bookings])
  const visibleBookings = tab === 'upcoming' ? upcoming : tab === 'completed' ? completed : tab === 'cancelled' ? cancelled : (bookings || [])

  const cancelBooking = async (bookingId: string) => {
    setCancellingId(bookingId); setError('')
    try {
      await api.post(`/api/mentorship/bookings/${bookingId}/cancel`, { reason: '' })
      loadBookings()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel this booking')
    } finally {
      setCancellingId(null)
    }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">My Sessions</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: 'Upcoming', value: upcoming.length, color: 'text-good-700' },
            { label: 'Completed', value: completed.length, color: 'text-royal-700' },
            { label: 'Cancelled', value: cancelled.length, color: 'text-red-600' },
          ].map((s) => (
            <div key={s.label} className="panel-premium p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{bookings === null ? '—' : s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <section className="panel-premium p-5">
          <div className="flex items-center gap-1 mb-4 border-b border-gray-100 pb-3 overflow-x-auto">
            {([
              ['upcoming', `Upcoming (${upcoming.length})`],
              ['completed', `Completed (${completed.length})`],
              ['cancelled', `Cancelled (${cancelled.length})`],
              ['all', 'Session History'],
            ] as [Tab, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${tab === key ? 'bg-navy-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>

          {bookings === null ? (
            <p className="text-sm text-gray-400">Loading sessions…</p>
          ) : visibleBookings.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No sessions here yet.</p>
              <Link href="/mentorship/book" className="text-xs text-royal-600 hover:underline mt-1 inline-block">Book a session →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleBookings.map((b) => (
                <div key={b.booking_id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/mentorship/${b.mentor_id}`} className="text-sm font-semibold text-navy-600 hover:underline">
                          {b.mentor_name || 'Mentor'}
                        </Link>
                        <span className={`text-[10px] font-semibold uppercase tracking-wide border rounded-full px-2 py-0.5 ${STATUS_STYLES[b.status] || ''}`}>
                          {b.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {SESSION_TYPE_LABELS[b.session_type] || b.session_type} · {b.duration_minutes} min
                        {b.scheduled_start && <> · {fmtDateTime(b.scheduled_start)}</>}
                      </p>
                      {b.agenda && <p className="text-xs text-gray-600 mt-1.5 italic">&quot;{b.agenda}&quot;</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {b.status === 'scheduled' && b.meeting_link && (
                        <a href={b.meeting_link} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-good-700 hover:underline">🎥 Join Meeting</a>
                      )}
                      {b.status === 'scheduled' && (
                        <div className="flex gap-3">
                          <button onClick={() => setReschedulingBooking({ id: b.booking_id, mentorId: b.mentor_id, duration: b.duration_minutes })} className="text-xs text-royal-600 hover:underline">Reschedule</button>
                          <button onClick={() => cancelBooking(b.booking_id)} disabled={cancellingId === b.booking_id} className="text-xs text-red-600 hover:underline disabled:opacity-50">
                            {cancellingId === b.booking_id ? 'Cancelling…' : 'Cancel'}
                          </button>
                        </div>
                      )}
                      {b.status === 'completed' && (
                        b.review ? (
                          <span className="text-xs text-amber-500">{'★'.repeat(b.review.rating)}{'☆'.repeat(5 - b.review.rating)}</span>
                        ) : (
                          <button onClick={() => setReviewingBooking({ id: b.booking_id, mentorName: b.mentor_name })} className="text-xs font-semibold text-amber-700 hover:underline">⭐ Leave a Review</button>
                        )
                      )}
                      <button onClick={() => setExpandedSession(expandedSession === b.session_id ? null : b.session_id)} className="text-xs text-gray-400 hover:text-gray-700">
                        {expandedSession === b.session_id ? 'Hide notes' : 'Notes'}
                      </button>
                    </div>
                  </div>
                  {expandedSession === b.session_id && <SessionNotes sessionId={b.session_id} />}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {reschedulingBooking && (
        <RescheduleModal
          mentorId={reschedulingBooking.mentorId}
          bookingId={reschedulingBooking.id}
          currentDurationMinutes={reschedulingBooking.duration}
          onClose={() => setReschedulingBooking(null)}
          onRescheduled={loadBookings}
        />
      )}
      {reviewingBooking && (
        <ReviewModal
          bookingId={reviewingBooking.id}
          mentorName={reviewingBooking.mentorName}
          onClose={() => setReviewingBooking(null)}
          onSubmitted={loadBookings}
        />
      )}
    </MentorshipShell>
  )
}
