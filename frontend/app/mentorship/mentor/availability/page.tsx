'use client'

/** Availability — set recurring bookable time slots. */
import { useEffect, useState } from 'react'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import { api } from '@/lib/api'

interface Rule { id: string; rule_type: string; day_of_week: number | null; specific_date: string | null; start_time: string; end_time: string; is_active: boolean }

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function AvailabilityPage() {
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [day, setDay] = useState(1)
  const [start, setStart] = useState('18:00')
  const [end, setEnd] = useState('19:00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<{ availability_rules: Rule[] }>('/api/mentorship/mentor/dashboard').then((d) => setRules(d.availability_rules)).catch(() => setRules([]))
  useEffect(() => { load() }, [])

  const add = async () => {
    setSaving(true); setError('')
    try {
      await api.post('/api/mentorship/mentor/availability', { day_of_week: day, start_time: start, end_time: end })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add this slot')
    } finally {
      setSaving(false)
    }
  }
  const remove = async (id: string) => { await api.delete(`/api/mentorship/mentor/availability/${id}`); load() }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Availability</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-2xl mx-auto">
        <section className="panel-premium p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Weekly Availability</h2>
          {rules === null ? (
            <p className="text-sm text-gray-400 mb-4">Loading…</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-gray-400 mb-4">You haven't published any availability — learners can't book you yet.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                  <span>{r.day_of_week !== null ? DAY_LABELS[r.day_of_week] : r.specific_date} · {r.start_time}–{r.end_time}</span>
                  <button onClick={() => remove(r.id)} className="text-xs text-red-600 hover:underline">Remove</button>
                </div>
              ))}
            </div>
          )}
          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mb-3">{error}</div>}
          <div className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Day</label>
              <select value={day} onChange={(e) => setDay(Number(e.target.value))} className="input-premium text-sm">
                {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Start</label>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input-premium text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">End</label>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input-premium text-sm" />
            </div>
            <button onClick={add} disabled={saving} className="btn-primary text-sm !min-h-0 px-4 py-2.5">{saving ? 'Adding…' : 'Add Slot'}</button>
          </div>
        </section>
      </div>
    </MentorshipShell>
  )
}
