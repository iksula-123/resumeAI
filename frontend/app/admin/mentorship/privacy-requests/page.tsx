'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminMentorshipShell from '@/components/mentorship/AdminMentorshipShell'
import { api } from '@/lib/api'

interface Row { id: string; type: 'access' | 'delete'; status: string; notes: string | null; user_name: string | null; user_email: string | null; created_at: string | null }

const STATUS_BADGE: Record<string, string> = { pending: 'bg-amber-100 text-amber-700', completed: 'bg-good-100 text-good-700', rejected: 'bg-red-100 text-red-600' }

export default function AdminPrivacyRequestsPage() {
  const [status, setStatus] = useState('pending')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = status ? `?status=${status}` : ''
      setRows((await api.get<{ requests: Row[] }>(`/api/mentorship/admin/privacy-requests${params}`)).requests)
    } finally {
      setLoading(false)
    }
  }, [status])
  useEffect(() => { load() }, [load])

  const complete = async (r: Row) => {
    // Every pending request is a 'delete' request (access requests are
    // fulfilled instantly at submission and never sit pending) — this one
    // action actually deletes the account (Supabase login + local profile,
    // cascading to their data) and marks the request completed.
    if (!confirm(`Permanently delete ${r.user_name || r.user_email}'s account (${r.user_email})? This cannot be undone.`)) return
    setBusy(r.id); setError('')
    try {
      await api.post(`/api/mentorship/admin/privacy-requests/${r.id}/execute-delete`, {})
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete this account')
    } finally {
      setBusy(null)
    }
  }
  const reject = async (r: Row) => {
    setBusy(r.id)
    try { await api.patch(`/api/mentorship/admin/privacy-requests/${r.id}`, { status: 'rejected' }); load() }
    finally { setBusy(null) }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Privacy Requests</h1>

  return (
    <AdminMentorshipShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex gap-1.5 mb-4">
          {['pending', 'completed', 'rejected', ''].map((s) => (
            <button key={s || 'all'} onClick={() => setStatus(s)} className={`text-xs px-3 py-1.5 rounded-lg transition capitalize ${status === s ? 'bg-navy-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s || 'All'}</button>
          ))}
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-4">{error}</div>}

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="panel-premium h-16 shimmer" />)}</div>
        ) : rows.length === 0 ? (
          <div className="panel-premium p-10 text-center text-sm text-gray-500">No requests here.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="panel-premium p-4 flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 capitalize">{r.type} request</span>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{r.user_name || r.user_email}</p>
                  {r.notes && <p className="text-xs text-gray-400 mt-1 italic">&quot;{r.notes}&quot;</p>}
                  {r.created_at && <p className="text-[11px] text-gray-400 mt-1">{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                </div>
                {r.status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => complete(r)} disabled={busy === r.id} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition disabled:opacity-40">
                      {busy === r.id ? 'Deleting…' : 'Delete Account'}
                    </button>
                    <button onClick={() => reject(r)} disabled={busy === r.id} className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition disabled:opacity-40">Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminMentorshipShell>
  )
}
