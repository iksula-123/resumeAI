'use client'

/** Bookings — manage incoming/upcoming session requests. */
import { useEffect, useState } from 'react'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import SessionNotes from '@/components/mentorship/SessionNotes'
import RescheduleModal from '@/components/mentorship/RescheduleModal'
import { api } from '@/lib/api'

interface SessionRow {
  booking_id: string; session_id: string; learner_name: string | null
  session_type: string; duration_minutes: number; agenda: string | null
  status: string; scheduled_start: string | null; scheduled_end: string | null; meeting_link: string | null
}
interface Dashboard { mentor: { id: string }; today_sessions: SessionRow[]; upcoming_sessions: SessionRow[]; requests: SessionRow[] }

const SESSION_TYPE_LABELS: Record<string, string> = {
  one_on_one: '1:1 Mentorship', resume_review: 'Resume Review', mock_interview: 'Mock Interview',
  career_guidance: 'Career Guidance', group_session: 'Group Session',
}
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function SessionList({ rows, onMark, onReschedule, busySession, expandedSession, setExpandedSession }: {
  rows: SessionRow[]; onMark: (id: string, status: 'completed' | 'no_show') => void
  onReschedule: (b: { id: string; duration: number }) => void
  busySession: string | null; expandedSession: string | null; setExpandedSession: (id: string | null) => void
}) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.session_id} className="border border-gray-100 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">{r.learner_name || 'Learner'}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {SESSION_TYPE_LABELS[r.session_type] || r.session_type} · {r.duration_minutes} min
                {r.scheduled_start && <> · {fmtDateTime(r.scheduled_start)}</>}
              </p>
              {r.agenda && <p className="text-xs text-gray-600 mt-1.5 italic">&quot;{r.agenda}&quot;</p>}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {r.status === 'scheduled' && r.meeting_link && (
                <a href={r.meeting_link} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-good-700 hover:underline">🎥 Join Meeting</a>
              )}
              {r.status === 'scheduled' && (
                <div className="flex gap-2">
                  <button onClick={() => onMark(r.session_id, 'completed')} disabled={busySession === r.session_id} className="text-xs text-good-700 hover:underline disabled:opacity-50">Mark Completed</button>
                  <button onClick={() => onMark(r.session_id, 'no_show')} disabled={busySession === r.session_id} className="text-xs text-amber-700 hover:underline disabled:opacity-50">No-Show</button>
                  <button onClick={() => onReschedule({ id: r.booking_id, duration: r.duration_minutes })} className="text-xs text-royal-600 hover:underline">Reschedule</button>
                </div>
              )}
              <button onClick={() => setExpandedSession(expandedSession === r.session_id ? null : r.session_id)} className="text-xs text-gray-400 hover:text-gray-700">
                {expandedSession === r.session_id ? 'Hide notes' : 'Notes'}
              </button>
            </div>
          </div>
          {expandedSession === r.session_id && <SessionNotes sessionId={r.session_id} />}
        </div>
      ))}
    </div>
  )
}

export default function BookingsPage() {
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [busySession, setBusySession] = useState<string | null>(null)
  const [reschedulingBooking, setReschedulingBooking] = useState<{ id: string; duration: number } | null>(null)

  const load = () => api.get<Dashboard>('/api/mentorship/mentor/dashboard').then(setDash).catch((e) => setError(e instanceof Error ? e.message : 'Could not load bookings'))
  useEffect(() => { load() }, [])

  const markStatus = async (sessionId: string, status: 'completed' | 'no_show') => {
    setBusySession(sessionId)
    try { await api.patch(`/api/mentorship/mentor/sessions/${sessionId}/status`, { status }); load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update this session') }
    finally { setBusySession(null) }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Bookings</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}
        {!dash ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            {dash.requests.length > 0 && (
              <section className="panel-premium p-5 border-l-4 border-amber-400">
                <h2 className="font-semibold text-gray-800 mb-3">Requests awaiting confirmation</h2>
                <SessionList rows={dash.requests} onMark={markStatus} onReschedule={setReschedulingBooking} busySession={busySession} expandedSession={expandedSession} setExpandedSession={setExpandedSession} />
              </section>
            )}
            <section className="panel-premium p-5">
              <h2 className="font-semibold text-gray-800 mb-3">Today's Sessions</h2>
              {dash.today_sessions.length === 0 ? <p className="text-sm text-gray-400">Nothing scheduled today.</p> : (
                <SessionList rows={dash.today_sessions} onMark={markStatus} onReschedule={setReschedulingBooking} busySession={busySession} expandedSession={expandedSession} setExpandedSession={setExpandedSession} />
              )}
            </section>
            <section className="panel-premium p-5">
              <h2 className="font-semibold text-gray-800 mb-3">Upcoming Sessions</h2>
              {dash.upcoming_sessions.length === 0 ? <p className="text-sm text-gray-400">No upcoming sessions.</p> : (
                <SessionList rows={dash.upcoming_sessions} onMark={markStatus} onReschedule={setReschedulingBooking} busySession={busySession} expandedSession={expandedSession} setExpandedSession={setExpandedSession} />
              )}
            </section>
          </>
        )}
      </div>

      {reschedulingBooking && dash && (
        <RescheduleModal
          mentorId={dash.mentor.id}
          bookingId={reschedulingBooking.id}
          currentDurationMinutes={reschedulingBooking.duration}
          onClose={() => setReschedulingBooking(null)}
          onRescheduled={load}
        />
      )}
    </MentorshipShell>
  )
}
