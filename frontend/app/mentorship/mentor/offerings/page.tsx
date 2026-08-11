'use client'

/** Offerings — the types/topics of mentorship this mentor offers. */
import { useEffect, useState } from 'react'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import { api } from '@/lib/api'

interface Offering {
  id: string; title: string; description: string | null; session_type: string
  duration_minutes: number; is_active: boolean
}

const SESSION_TYPES = ['one_on_one', 'resume_review', 'mock_interview', 'career_guidance', 'group_session']
const SESSION_TYPE_LABELS: Record<string, string> = {
  one_on_one: '1:1 Mentorship', resume_review: 'Resume Review', mock_interview: 'Mock Interview',
  career_guidance: 'Career Guidance', group_session: 'Group Session',
}

export default function OfferingsPage() {
  const [offerings, setOfferings] = useState<Offering[] | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sessionType, setSessionType] = useState('one_on_one')
  const [duration, setDuration] = useState(30)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<{ offerings: Offering[] }>('/api/mentorship/mentor/offerings').then((r) => setOfferings(r.offerings)).catch(() => setOfferings([]))
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!title.trim()) return
    setSaving(true); setError('')
    try {
      await api.post('/api/mentorship/mentor/offerings', { title, description, session_type: sessionType, duration_minutes: duration })
      setTitle(''); setDescription(''); load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add this offering')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (o: Offering) => { await api.patch(`/api/mentorship/mentor/offerings/${o.id}`, { is_active: !o.is_active }); load() }
  const remove = async (id: string) => { await api.delete(`/api/mentorship/mentor/offerings/${id}`); load() }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Offerings</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <section className="panel-premium p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Your Offerings</h2>
          {offerings === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : offerings.length === 0 ? (
            <p className="text-sm text-gray-400 mb-4">No offerings yet — add one below so mentees know what you help with.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {offerings.map((o) => (
                <div key={o.id} className={`flex items-center justify-between gap-3 border rounded-xl px-4 py-3 ${o.is_active ? 'border-gray-100' : 'border-gray-100 opacity-50'}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{o.title}</p>
                    <p className="text-xs text-gray-500">{SESSION_TYPE_LABELS[o.session_type] || o.session_type} · {o.duration_minutes} min</p>
                    {o.description && <p className="text-xs text-gray-400 mt-1">{o.description}</p>}
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <button onClick={() => toggleActive(o)} className="text-xs text-royal-600 hover:underline">{o.is_active ? 'Deactivate' : 'Activate'}</button>
                    <button onClick={() => remove(o.id)} className="text-xs text-red-600 hover:underline">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Offering title, e.g. Resume Deep-Dive" className="input-premium text-sm" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What does this cover? (optional)" className="input-premium text-sm resize-none" />
            <div className="flex gap-3">
              <select value={sessionType} onChange={(e) => setSessionType(e.target.value)} className="input-premium text-sm flex-1">
                {SESSION_TYPES.map((t) => <option key={t} value={t}>{SESSION_TYPE_LABELS[t]}</option>)}
              </select>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="input-premium text-sm w-32">
                {[15, 30, 45, 60].map((d) => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
            <button onClick={add} disabled={saving || !title.trim()} className="btn-primary w-full py-2.5 disabled:opacity-40">{saving ? 'Adding…' : 'Add Offering'}</button>
          </div>
        </section>
      </div>
    </MentorshipShell>
  )
}
