'use client'

/** Privacy & My Data — request an export of your data (fulfilled instantly)
 * or request account deletion (queued for an admin). */
import { useEffect, useState } from 'react'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import { api } from '@/lib/api'

interface PrivacyRequestRow { id: string; type: 'access' | 'delete'; status: string; notes: string | null; created_at: string | null; processed_at: string | null }

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700', completed: 'bg-good-100 text-good-700', rejected: 'bg-red-100 text-red-600',
}

export default function PrivacyPage() {
  const [requests, setRequests] = useState<PrivacyRequestRow[] | null>(null)
  const [busy, setBusy] = useState<'access' | 'delete' | null>(null)
  const [deleteNotes, setDeleteNotes] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<{ requests: PrivacyRequestRow[] }>('/api/mentorship/privacy-requests').then((r) => setRequests(r.requests)).catch(() => setRequests([]))
  useEffect(() => { load() }, [])

  const requestAccess = async () => {
    setBusy('access'); setError('')
    try {
      const result = await api.post<{ export?: unknown }>('/api/mentorship/privacy-requests', { type: 'access' })
      if (result.export) downloadJson(result.export, 'mentorle-my-data.json')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not process your request')
    } finally {
      setBusy(null)
    }
  }

  const requestDelete = async () => {
    setBusy('delete'); setError('')
    try {
      await api.post('/api/mentorship/privacy-requests', { type: 'delete', notes: deleteNotes })
      setConfirmDelete(false); setDeleteNotes('')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your request')
    } finally {
      setBusy(null)
    }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Privacy & My Data</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="panel-premium p-5">
            <h2 className="font-semibold text-gray-800 mb-1">📥 Access my data</h2>
            <p className="text-xs text-gray-500 mb-4">Download a copy of your sessions, reviews, goals, and tasks as JSON — instant, no waiting.</p>
            <button onClick={requestAccess} disabled={busy === 'access'} className="btn-primary w-full text-sm py-2.5 disabled:opacity-50">
              {busy === 'access' ? 'Preparing…' : 'Request & Download'}
            </button>
          </div>

          <div className="panel-premium p-5">
            <h2 className="font-semibold text-gray-800 mb-1">🗑️ Delete my account</h2>
            <p className="text-xs text-gray-500 mb-4">Permanently removes your account and data. An admin reviews and completes this.</p>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="w-full text-sm py-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition">
                Request Deletion
              </button>
            ) : (
              <div className="space-y-2">
                <textarea value={deleteNotes} onChange={(e) => setDeleteNotes(e.target.value)} rows={2} placeholder="Why are you leaving? (optional)" className="input-premium text-xs resize-none w-full" />
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="btn-secondary flex-1 text-xs py-2">Cancel</button>
                  <button onClick={requestDelete} disabled={busy === 'delete'} className="flex-1 text-xs py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50">
                    {busy === 'delete' ? 'Submitting…' : 'Confirm Request'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}

        <section className="panel-premium p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Request History</h2>
          {requests === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-gray-400">No requests yet.</p>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2.5">
                  <div>
                    <span className="font-medium text-gray-800 capitalize">{r.type} request</span>
                    {r.created_at && <span className="text-xs text-gray-400 ml-2">{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                  </div>
                  <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </MentorshipShell>
  )
}
