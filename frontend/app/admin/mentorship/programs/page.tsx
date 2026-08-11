'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminMentorshipShell from '@/components/mentorship/AdminMentorshipShell'
import { api } from '@/lib/api'

interface ProgramRow { id: string; title: string; description: string | null; duration: string | null; status: string; mentor_count: number; mentee_count: number }

export default function AdminProgramsPage() {
  const [programs, setPrograms] = useState<ProgramRow[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setPrograms((await api.get<{ programs: ProgramRow[] }>('/api/mentorship/admin/programs')).programs) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!title.trim()) return
    setCreating(true); setError('')
    try {
      await api.post('/api/mentorship/admin/programs', { title, description, duration })
      setTitle(''); setDescription(''); setDuration(''); load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create program')
    } finally {
      setCreating(false)
    }
  }

  const toggleStatus = async (p: ProgramRow) => {
    setBusy(p.id)
    try { await api.patch(`/api/mentorship/admin/programs/${p.id}`, { status: p.status === 'active' ? 'archived' : 'active' }); load() }
    finally { setBusy(null) }
  }
  const remove = async (id: string) => {
    if (!confirm('Delete this program?')) return
    setBusy(id)
    try { await api.delete(`/api/mentorship/admin/programs/${id}`); load() }
    finally { setBusy(null) }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Programs</h1>

  return (
    <AdminMentorshipShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="panel-premium p-5 mb-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Create program</h3>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input-premium text-sm" />
            <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Duration, e.g. 8 weeks" className="input-premium text-sm" />
          </div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description" className="input-premium text-sm resize-none mb-3 w-full" />
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <button onClick={create} disabled={creating || !title.trim()} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-40">{creating ? 'Creating…' : 'Create Program'}</button>
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="panel-premium h-20 shimmer" />)}</div>
        ) : programs.length === 0 ? (
          <div className="panel-premium p-10 text-center text-sm text-gray-500">No programs yet.</div>
        ) : (
          <div className="space-y-3">
            {programs.map((p) => (
              <div key={p.id} className="panel-premium p-5 flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{p.title}</h3>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${p.status === 'active' ? 'bg-good-100 text-good-700' : 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
                  </div>
                  {p.description && <p className="text-sm text-gray-500 mt-1">{p.description}</p>}
                  <p className="text-xs text-gray-400 mt-1.5">{p.duration && <>⏱ {p.duration} · </>}👥 {p.mentee_count} mentees · 🎓 {p.mentor_count} mentors</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => toggleStatus(p)} disabled={busy === p.id} className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition disabled:opacity-40">
                    {p.status === 'active' ? 'Archive' : 'Reactivate'}
                  </button>
                  <button onClick={() => remove(p.id)} disabled={busy === p.id} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition disabled:opacity-40">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminMentorshipShell>
  )
}
