'use client'

/**
 * Booking flow (Module 5). Every option offered here is derived from the
 * mentor's real computed `upcoming_slots` (server-side, from actual
 * availability rules minus real bookings) — there's no synthetic time grid.
 * The server re-validates the exact requested slot independently before
 * creating the booking, so this UI narrowing options down is a UX courtesy,
 * not the source of truth.
 */
import { useMemo, useState } from 'react'
import { api } from '@/lib/api'

interface UpcomingSlot { date: string; start_time: string; end_time: string }

interface BookingModalProps {
  mentorId: string
  mentorName: string | null
  sessionTypes: string[]
  upcomingSlots: UpcomingSlot[]
  onClose: () => void
  onBooked: () => void
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  one_on_one: '1:1 Mentorship', resume_review: 'Resume Review', mock_interview: 'Mock Interview',
  career_guidance: 'Career Guidance', group_session: 'Group Session',
}
const DURATIONS = [15, 30, 45, 60]

const fmtDateLabel = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const toHHMM = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
const fmtTime12 = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export default function BookingModal({ mentorId, mentorName, sessionTypes, upcomingSlots, onClose, onBooked }: BookingModalProps) {
  const dates = useMemo(() => Array.from(new Set(upcomingSlots.map((s) => s.date))), [upcomingSlots])

  const [sessionType, setSessionType] = useState(sessionTypes[0] || 'one_on_one')
  const [selectedDate, setSelectedDate] = useState(dates[0] || '')
  const windowsForDate = useMemo(() => upcomingSlots.filter((s) => s.date === selectedDate), [upcomingSlots, selectedDate])
  const [windowIndex, setWindowIndex] = useState(0)
  const activeWindow = windowsForDate[windowIndex]

  const windowMinutes = activeWindow ? toMinutes(activeWindow.end_time) - toMinutes(activeWindow.start_time) : 0
  const validDurations = DURATIONS.filter((d) => d <= windowMinutes)
  const [duration, setDuration] = useState(validDurations[0] || 30)

  const latestStart = activeWindow ? toMinutes(activeWindow.end_time) - duration : 0
  const [startTime, setStartTime] = useState(activeWindow?.start_time || '')
  const effectiveStart = startTime && activeWindow && toMinutes(startTime) <= latestStart && toMinutes(startTime) >= toMinutes(activeWindow.start_time)
    ? startTime
    : activeWindow?.start_time || ''

  const [agenda, setAgenda] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState<{ date: string; start_time: string; end_time: string } | null>(null)

  const onDateChange = (d: string) => { setSelectedDate(d); setWindowIndex(0) }

  const submit = async () => {
    if (!activeWindow) return
    setSubmitting(true); setError('')
    try {
      const result = await api.post<{ date: string; start_time: string; end_time: string }>('/api/mentorship/bookings', {
        mentor_id: mentorId,
        date: selectedDate,
        start_time: effectiveStart,
        duration_minutes: duration,
        session_type: sessionType,
        agenda,
      })
      setConfirmed(result)
      onBooked()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create this booking')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md panel-premium p-6 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        {confirmed ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="text-lg font-bold text-navy-600">Session booked!</h3>
            <p className="text-sm text-gray-600 mt-2">
              {fmtDateLabel(confirmed.date)} · {fmtTime12(confirmed.start_time)}–{fmtTime12(confirmed.end_time)}
              {mentorName && <> with {mentorName}</>}
            </p>
            <button onClick={onClose} className="btn-primary w-full mt-6 py-2.5">Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-navy-600">Book a session</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            {dates.length === 0 ? (
              <p className="text-sm text-gray-500">This mentor hasn't published any availability yet — check back soon.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Session Type</label>
                  <select value={sessionType} onChange={(e) => setSessionType(e.target.value)} className="input-premium text-sm">
                    {sessionTypes.map((t) => <option key={t} value={t}>{SESSION_TYPE_LABELS[t] || t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Date</label>
                  <select value={selectedDate} onChange={(e) => onDateChange(e.target.value)} className="input-premium text-sm">
                    {dates.map((d) => <option key={d} value={d}>{fmtDateLabel(d)}</option>)}
                  </select>
                </div>

                {windowsForDate.length > 1 && (
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Available window</label>
                    <select value={windowIndex} onChange={(e) => setWindowIndex(Number(e.target.value))} className="input-premium text-sm">
                      {windowsForDate.map((w, i) => (
                        <option key={i} value={i}>{fmtTime12(w.start_time)}–{fmtTime12(w.end_time)}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Duration</label>
                    <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="input-premium text-sm">
                      {validDurations.map((d) => <option key={d} value={d}>{d} min</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Start time</label>
                    <input
                      type="time"
                      value={effectiveStart}
                      min={activeWindow?.start_time}
                      max={activeWindow ? toHHMM(latestStart) : undefined}
                      step={900}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="input-premium text-sm"
                    />
                  </div>
                </div>
                {activeWindow && (
                  <p className="text-[11px] text-gray-400 -mt-2">Within {fmtTime12(activeWindow.start_time)}–{fmtTime12(activeWindow.end_time)}</p>
                )}

                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Agenda (optional)</label>
                  <textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={3}
                    placeholder="What do you want to cover in this session?"
                    className="input-premium text-sm resize-none" />
                </div>

                {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">{error}</div>}

                <button onClick={submit} disabled={submitting || !activeWindow} className="btn-primary w-full py-2.5">
                  {submitting ? 'Booking…' : 'Confirm Booking'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
