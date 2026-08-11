'use client'

import { useEffect, useState, useCallback } from 'react'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import { api } from '@/lib/api'

interface EventRow {
  id: string; title: string; description: string | null; event_date: string
  attendee_count: number; is_registered: boolean
}

const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export default function MenteeEventsPage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ events: EventRow[] }>('/api/mentorship/events')
      setEvents(r.events)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load events')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const toggle = async (ev: EventRow) => {
    setBusy(ev.id)
    try {
      if (ev.is_registered) await api.delete(`/api/mentorship/events/${ev.id}/register`)
      else await api.post(`/api/mentorship/events/${ev.id}/register`, {})
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update your registration')
    } finally {
      setBusy(null)
    }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Events</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-navy-600">Upcoming Events</h2>
          <p className="text-sm text-gray-500 mt-1">Webinars, AMAs, and workshops hosted on the platform.</p>
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-4">{error}</div>}

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="panel-premium h-20 shimmer" />)}</div>
        ) : events.length === 0 ? (
          <div className="panel-premium p-10 text-center text-sm text-gray-500">No upcoming events yet — check back soon.</div>
        ) : (
          <div className="space-y-3">
            {events.map((ev) => (
              <div key={ev.id} className="panel-premium p-5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="font-semibold text-gray-900">{ev.title}</h3>
                  {ev.description && <p className="text-sm text-gray-500 mt-1">{ev.description}</p>}
                  <p className="text-xs text-gray-400 mt-1.5">🗓 {fmt(ev.event_date)} · {ev.attendee_count} registered</p>
                </div>
                <button
                  onClick={() => toggle(ev)}
                  disabled={busy === ev.id}
                  className={`text-sm px-4 py-2 rounded-lg transition disabled:opacity-50 ${ev.is_registered ? 'btn-secondary' : 'btn-primary'}`}
                >
                  {busy === ev.id ? '…' : ev.is_registered ? 'Unregister' : 'Register'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </MentorshipShell>
  )
}
