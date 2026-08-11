'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminMentorshipShell from '@/components/mentorship/AdminMentorshipShell'
import { api } from '@/lib/api'

interface EventRow { id: string; title: string; description: string | null; event_date: string; attendee_count: number }
const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setEvents((await api.get<{ events: EventRow[] }>('/api/mentorship/admin/events')).events) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!title.trim() || !eventDate) return
    setCreating(true); setError('')
    try {
      await api.post('/api/mentorship/admin/events', { title, description, event_date: new Date(eventDate).toISOString() })
      setTitle(''); setDescription(''); setEventDate(''); load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create event')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this event?')) return
    setBusy(id)
    try { await api.delete(`/api/mentorship/admin/events/${id}`); load() }
    finally { setBusy(null) }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Events</h1>

  return (
    <AdminMentorshipShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="panel-premium p-5 mb-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Create event</h3>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input-premium text-sm" />
            <input type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="input-premium text-sm" />
          </div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description" className="input-premium text-sm resize-none mb-3 w-full" />
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <button onClick={create} disabled={creating || !title.trim() || !eventDate} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-40">{creating ? 'Creating…' : 'Create Event'}</button>
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="panel-premium h-20 shimmer" />)}</div>
        ) : events.length === 0 ? (
          <div className="panel-premium p-10 text-center text-sm text-gray-500">No events yet.</div>
        ) : (
          <div className="space-y-3">
            {events.map((ev) => (
              <div key={ev.id} className="panel-premium p-5 flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-semibold text-gray-900">{ev.title}</h3>
                  {ev.description && <p className="text-sm text-gray-500 mt-1">{ev.description}</p>}
                  <p className="text-xs text-gray-400 mt-1.5">🗓 {fmt(ev.event_date)} · {ev.attendee_count} registered</p>
                </div>
                <button onClick={() => remove(ev.id)} disabled={busy === ev.id} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition disabled:opacity-40 shrink-0">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminMentorshipShell>
  )
}
