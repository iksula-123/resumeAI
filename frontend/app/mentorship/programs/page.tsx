'use client'

import { useEffect, useState, useCallback } from 'react'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import { api } from '@/lib/api'

interface ProgramRow {
  id: string; title: string; description: string | null; duration: string | null
  status: string; mentor_count: number; mentee_count: number; my_role: 'mentor' | 'mentee' | null
}

export default function MenteeProgramsPage() {
  const [programs, setPrograms] = useState<ProgramRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ programs: ProgramRow[] }>('/api/mentorship/programs')
      setPrograms(r.programs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load programs')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const join = async (id: string) => {
    setBusy(id)
    try {
      await api.post(`/api/mentorship/programs/${id}/join`, { role: 'mentee' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join this program')
    } finally {
      setBusy(null)
    }
  }

  const leave = async (id: string) => {
    setBusy(id)
    try {
      await api.delete(`/api/mentorship/programs/${id}/leave`)
      await load()
    } finally {
      setBusy(null)
    }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Programs</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-navy-600">Structured Programs</h2>
          <p className="text-sm text-gray-500 mt-1">Join a multi-session program guided by our mentors.</p>
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-4">{error}</div>}

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="panel-premium h-24 shimmer" />)}</div>
        ) : programs.length === 0 ? (
          <div className="panel-premium p-10 text-center text-sm text-gray-500">No programs are open right now — check back soon.</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {programs.map((p) => (
              <div key={p.id} className="panel-premium p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">{p.title}</h3>
                  {p.my_role && <span className="text-[10px] font-semibold uppercase bg-good-50 text-good-700 rounded-full px-2 py-0.5">Joined</span>}
                </div>
                {p.description && <p className="text-sm text-gray-500 mt-1.5">{p.description}</p>}
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-3">
                  {p.duration && <span>⏱ {p.duration}</span>}
                  <span>👥 {p.mentee_count} mentees</span>
                  <span>🎓 {p.mentor_count} mentors</span>
                </div>
                {p.my_role === 'mentee' ? (
                  <button onClick={() => leave(p.id)} disabled={busy === p.id} className="btn-secondary mt-4 w-full text-sm py-2 disabled:opacity-50">
                    {busy === p.id ? '…' : 'Leave Program'}
                  </button>
                ) : (
                  <button onClick={() => join(p.id)} disabled={busy === p.id} className="btn-primary mt-4 w-full text-sm py-2 disabled:opacity-50">
                    {busy === p.id ? '…' : 'Join Program'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </MentorshipShell>
  )
}
