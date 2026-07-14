'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'

interface Application {
  id: string
  company: string
  position: string
  status: Status
  location?: string | null
  job_url?: string | null
  salary?: string | null
  source?: string | null
  notes?: string | null
  applied_date?: string | null
  next_action?: string | null
  next_action_note?: string | null
  updated_at?: string | null
}

type Status = 'applied' | 'interview' | 'offer' | 'rejected' | 'joined'

const COLUMNS: { key: Status; label: string; accent: string; dot: string }[] = [
  { key: 'applied', label: 'Applied', accent: 'from-blue-500 to-indigo-500', dot: 'bg-blue-500' },
  { key: 'interview', label: 'Interview', accent: 'from-amber-500 to-orange-500', dot: 'bg-amber-500' },
  { key: 'offer', label: 'Offer', accent: 'from-green-500 to-emerald-500', dot: 'bg-green-500' },
  { key: 'joined', label: 'Joined', accent: 'from-teal-500 to-cyan-500', dot: 'bg-teal-500' },
  { key: 'rejected', label: 'Rejected', accent: 'from-gray-400 to-gray-500', dot: 'bg-gray-400' },
]

const NEXT_STATUS: Record<Status, Status | null> = {
  applied: 'interview', interview: 'offer', offer: 'joined', joined: null, rejected: null,
}

const empty = { company: '', position: '', status: 'applied' as Status, location: '', job_url: '', salary: '', source: '', notes: '', applied_date: '', next_action: '', next_action_note: '' }

function isOverdue(iso?: string | null) {
  if (!iso) return false
  const d = new Date(iso + 'T23:59:59'); return d.getTime() < Date.now()
}
function isSoon(iso?: string | null) {
  if (!iso) return false
  const days = (new Date(iso + 'T23:59:59').getTime() - Date.now()) / 86400000
  return days >= 0 && days <= 3
}

export default function JobTrackerPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Application | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setApps(await api.get<Application[]>('/api/applications/')) }
    catch { /* handled globally */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return }
    load()
  }, [user, router, load])

  const openAdd = () => { setEditing(null); setForm({ ...empty, applied_date: new Date().toISOString().slice(0, 10) }); setModalOpen(true) }
  const openEdit = (a: Application) => {
    setEditing(a)
    setForm({
      company: a.company, position: a.position, status: a.status, location: a.location || '',
      job_url: a.job_url || '', salary: a.salary || '', source: a.source || '', notes: a.notes || '',
      applied_date: a.applied_date || '', next_action: a.next_action || '', next_action_note: a.next_action_note || '',
    })
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.company.trim() || !form.position.trim()) return
    setSaving(true)
    try {
      if (editing) {
        const updated = await api.put<Application>(`/api/applications/${editing.id}`, form)
        setApps(prev => prev.map(a => a.id === editing.id ? updated : a))
      } else {
        const created = await api.post<Application>('/api/applications/', form)
        setApps(prev => [created, ...prev])
      }
      setModalOpen(false)
    } finally { setSaving(false) }
  }

  const move = async (a: Application, status: Status) => {
    setBusy(a.id)
    try {
      const updated = await api.put<Application>(`/api/applications/${a.id}`, { status })
      setApps(prev => prev.map(x => x.id === a.id ? updated : x))
    } finally { setBusy(null) }
  }

  const remove = async (a: Application) => {
    if (!confirm(`Delete ${a.company} — ${a.position}?`)) return
    setBusy(a.id)
    try { await api.delete(`/api/applications/${a.id}`); setApps(prev => prev.filter(x => x.id !== a.id)) }
    finally { setBusy(null) }
  }

  const byStatus = (s: Status) => apps.filter(a => a.status === s)
  const total = apps.length
  const interviews = byStatus('interview').length
  const offers = byStatus('offer').length

  const topBar = (
    <>
      <div className="flex-1">
        <h1 className="text-sm font-semibold text-gray-800">Job Tracker</h1>
        <p className="text-xs text-gray-400">Track every application through your pipeline</p>
      </div>
      <button onClick={openAdd} className="btn-primary text-xs !py-2 !px-4">+ Add Application</button>
    </>
  )

  return (
    <AppShell topBar={topBar}>
      <div className="p-6">
        {/* stats */}
        <div className="grid grid-cols-3 md:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Total', value: total, icon: '📋', color: 'bg-indigo-50 text-indigo-700' },
            { label: 'Interviewing', value: interviews, icon: '🎤', color: 'bg-amber-50 text-amber-700' },
            { label: 'Offers', value: offers, icon: '🎉', color: 'bg-green-50 text-green-700' },
            { label: 'Joined', value: byStatus('joined').length, icon: '✅', color: 'bg-teal-50 text-teal-700' },
            { label: 'Rejected', value: byStatus('rejected').length, icon: '—', color: 'bg-gray-50 text-gray-600' },
          ].map(s => (
            <div key={s.label} className="card-premium p-4">
              <div className={`w-9 h-9 ${s.color} rounded-xl flex items-center justify-center text-lg mb-2`}>{s.icon}</div>
              <div className="text-xl font-bold text-gray-800 font-display">{s.value}</div>
              <div className="text-xs text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {COLUMNS.map(c => <div key={c.key} className="h-64 rounded-2xl bg-gray-100 shimmer" />)}
          </div>
        ) : total === 0 ? (
          <div className="card-premium p-16 text-center">
            <div className="text-5xl mb-3">📋</div>
            <h3 className="text-lg font-semibold text-gray-800 font-display mb-1">No applications yet</h3>
            <p className="text-sm text-gray-500 mb-5">Add the jobs you're applying to and track them here.</p>
            <button onClick={openAdd} className="btn-primary">+ Add your first application</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {COLUMNS.map(col => {
              const items = byStatus(col.key)
              return (
                <div key={col.key} className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className="text-xs font-semibold text-gray-700">{col.label}</span>
                    <span className="text-xs text-gray-400">{items.length}</span>
                  </div>
                  <div className="flex-1 space-y-2.5 rounded-2xl bg-gray-50/60 p-2 min-h-[120px]">
                    {items.map(a => {
                      const next = NEXT_STATUS[a.status]
                      return (
                        <div key={a.id} className="card-premium p-3 group animate-fade-up">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 cursor-pointer" onClick={() => openEdit(a)}>
                              <div className="text-sm font-semibold text-gray-800 truncate">{a.position}</div>
                              <div className="text-xs text-gray-500 truncate">{a.company}</div>
                            </div>
                            <button onClick={() => remove(a)} disabled={busy === a.id}
                              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-sm transition">×</button>
                          </div>
                          {a.location && <div className="text-[11px] text-gray-400 mt-1">📍 {a.location}</div>}
                          {a.salary && <div className="text-[11px] text-gray-400">💰 {a.salary}</div>}
                          {a.next_action && (
                            <div className={`text-[11px] mt-1.5 px-2 py-0.5 rounded-full inline-block ${
                              isOverdue(a.next_action) ? 'bg-red-100 text-red-600'
                                : isSoon(a.next_action) ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              ⏰ {a.next_action_note ? `${a.next_action_note} · ` : ''}{a.next_action}
                            </div>
                          )}
                          {next && (
                            <button onClick={() => move(a, next)} disabled={busy === a.id}
                              className="mt-2 w-full text-[11px] text-indigo-600 bg-indigo-50 hover:bg-indigo-100 py-1 rounded-lg transition disabled:opacity-50">
                              {busy === a.id ? '…' : `Move to ${COLUMNS.find(c => c.key === next)?.label} →`}
                            </button>
                          )}
                          {a.status !== 'rejected' && a.status !== 'joined' && (
                            <button onClick={() => move(a, 'rejected')} disabled={busy === a.id}
                              className="mt-1 w-full text-[11px] text-gray-400 hover:text-red-500 py-0.5 transition">
                              Mark rejected
                            </button>
                          )}
                        </div>
                      )
                    })}
                    {items.length === 0 && <div className="text-[11px] text-gray-300 text-center py-4">Nothing here</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="glass-card w-full max-w-lg p-6 animate-fade-up max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-gray-900 font-display mb-4">{editing ? 'Edit application' : 'Add application'}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Company *</label>
                <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="input-premium" placeholder="Acme Corp" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Position *</label>
                <input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="input-premium" placeholder="Senior Frontend Engineer" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Status })} className="input-premium">
                  {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Location</label>
                <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="input-premium" placeholder="Remote / NYC" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Salary</label>
                <input value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} className="input-premium" placeholder="$120k" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Source</label>
                <input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className="input-premium" placeholder="LinkedIn" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Applied date</label>
                <input type="date" value={form.applied_date} onChange={e => setForm({ ...form, applied_date: e.target.value })} className="input-premium" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Next action / reminder</label>
                <input type="date" value={form.next_action} onChange={e => setForm({ ...form, next_action: e.target.value })} className="input-premium" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Reminder note</label>
                <input value={form.next_action_note} onChange={e => setForm({ ...form, next_action_note: e.target.value })} className="input-premium" placeholder="Follow up with recruiter" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Job URL</label>
                <input value={form.job_url} onChange={e => setForm({ ...form, job_url: e.target.value })} className="input-premium" placeholder="https://…" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="input-premium resize-none" placeholder="Interview stages, contacts, prep…" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModalOpen(false)} className="btn-ghost text-sm">Cancel</button>
              <button onClick={save} disabled={saving || !form.company.trim() || !form.position.trim()} className="btn-primary text-sm">
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
