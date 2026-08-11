'use client'

/**
 * Reschedule flow (Module 8). Fetches the mentor's real current availability
 * (same computed upcoming_slots used everywhere else) so the new time picked
 * is genuinely free — the server re-validates it again regardless.
 */
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'

interface UpcomingSlot { date: string; start_time: string; end_time: string }

interface RescheduleModalProps {
  mentorId: string
  bookingId: string
  currentDurationMinutes: number
  onClose: () => void
  onRescheduled: () => void
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

export default function RescheduleModal({ mentorId, bookingId, currentDurationMinutes, onClose, onRescheduled }: RescheduleModalProps) {
  const [slots, setSlots] = useState<UpcomingSlot[] | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    api.get<{ upcoming_slots: UpcomingSlot[] }>(`/api/mentorship/mentors/${mentorId}`)
      .then((r) => setSlots(r.upcoming_slots))
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load availability'))
  }, [mentorId])

  const dates = useMemo(() => Array.from(new Set((slots || []).map((s) => s.date))), [slots])
  const [selectedDate, setSelectedDate] = useState('')
  useEffect(() => { if (dates.length && !selectedDate) setSelectedDate(dates[0]) }, [dates, selectedDate])

  const windowsForDate = useMemo(() => (slots || []).filter((s) => s.date === selectedDate), [slots, selectedDate])
  const [windowIndex, setWindowIndex] = useState(0)
  const activeWindow = windowsForDate[windowIndex]

  const windowMinutes = activeWindow ? toMinutes(activeWindow.end_time) - toMinutes(activeWindow.start_time) : 0
  const validDurations = DURATIONS.filter((d) => d <= windowMinutes)
  const [duration, setDuration] = useState(currentDurationMinutes)
  useEffect(() => { if (validDurations.length && !validDurations.includes(duration)) setDuration(validDurations[0]) }, [validDurations, duration])

  const latestStart = activeWindow ? toMinutes(activeWindow.end_time) - duration : 0
  const [startTime, setStartTime] = useState('')
  const effectiveStart = startTime && activeWindow && toMinutes(startTime) <= latestStart && toMinutes(startTime) >= toMinutes(activeWindow.start_time)
    ? startTime
    : activeWindow?.start_time || ''

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ scheduled_start: string } | null>(null)

  const submit = async () => {
    if (!activeWindow) return
    setSubmitting(true); setError('')
    try {
      const result = await api.post<{ scheduled_start: string }>(`/api/mentorship/bookings/${bookingId}/reschedule`, {
        date: selectedDate, start_time: effectiveStart, duration_minutes: duration,
      })
      setDone(result)
      onRescheduled()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reschedule this session')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md panel-premium p-6 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="text-lg font-bold text-navy-600">Session rescheduled</h3>
            <p className="text-sm text-gray-600 mt-2">New time: {new Date(done.scheduled_start).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
            <button onClick={onClose} className="btn-primary w-full mt-6 py-2.5">Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-navy-600">Reschedule session</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            {loadError && <p className="text-sm text-red-600">{loadError}</p>}
            {!loadError && slots === null && <p className="text-sm text-gray-400">Loading availability…</p>}
            {!loadError && slots !== null && dates.length === 0 && (
              <p className="text-sm text-gray-500">No open slots published right now — try again later.</p>
            )}

            {dates.length > 0 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">New Date</label>
                  <select value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setWindowIndex(0) }} className="input-premium text-sm">
                    {dates.map((d) => <option key={d} value={d}>{fmtDateLabel(d)}</option>)}
                  </select>
                </div>
                {windowsForDate.length > 1 && (
                  <div>
                    <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Available window</label>
                    <select value={windowIndex} onChange={(e) => setWindowIndex(Number(e.target.value))} className="input-premium text-sm">
                      {windowsForDate.map((w, i) => <option key={i} value={i}>{fmtTime12(w.start_time)}–{fmtTime12(w.end_time)}</option>)}
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
                    <input type="time" value={effectiveStart} min={activeWindow?.start_time} max={activeWindow ? toHHMM(latestStart) : undefined}
                      step={900} onChange={(e) => setStartTime(e.target.value)} className="input-premium text-sm" />
                  </div>
                </div>

                {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">{error}</div>}

                <button onClick={submit} disabled={submitting || !activeWindow} className="btn-primary w-full py-2.5">
                  {submitting ? 'Rescheduling…' : 'Confirm New Time'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
