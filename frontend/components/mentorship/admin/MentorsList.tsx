'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { StatusBadge } from './shared'

interface AdminMentor {
  id: string; profile_id: string; full_name: string | null; email: string | null; avatar_url: string | null
  status: string; headline: string | null; bio: string | null; designation: string | null; company: string | null
  years_experience: number; country: string | null; timezone: string; session_price_amount: number
  session_price_currency: string; rating_avg: number; rating_count: number; sessions_completed: number
  skills: string[]; languages: string[]; categories: string[]; rejection_reason: string | null
  approved_at: string | null; created_at: string | null
}

/** Shared list used by both Applications (statusFilter="pending") and All
 * Mentors (statusFilter=""). */
export default function MentorsList({ statusFilter, onChanged }: { statusFilter: string; onChanged?: () => void }) {
  const [status, setStatus] = useState(statusFilter)
  const [search, setSearch] = useState('')
  const [mentors, setMentors] = useState<AdminMentor[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (search) params.set('search', search)
      const data = await api.get<{ mentors: AdminMentor[] }>(`/api/mentorship/admin/mentors?${params}`)
      setMentors(data.mentors)
    } finally {
      setLoading(false)
    }
  }, [status, search])
  useEffect(() => { load() }, [load])

  const setMentorStatus = async (id: string, newStatus: string, rejection_reason?: string) => {
    setBusy(id)
    try {
      await api.patch(`/api/mentorship/admin/mentors/${id}/status`, { status: newStatus, rejection_reason })
      setRejectingId(null); setRejectReason('')
      await load()
      onChanged?.()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email…" className="input-premium max-w-xs text-sm" />
        {!statusFilter && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-premium max-w-[160px] text-sm">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="panel-premium h-20 shimmer" />)}</div>
      ) : mentors.length === 0 ? (
        <div className="panel-premium p-10 text-center text-sm text-gray-500">No mentors found.</div>
      ) : (
        <div className="space-y-3">
          {mentors.map((m) => (
            <div key={m.id} className="panel-premium p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{m.full_name || '—'}</span>
                    <StatusBadge status={m.status} />
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{m.email}</div>
                  {m.headline && <div className="text-sm text-gray-700 mt-1.5">{m.headline}</div>}
                  <div className="text-xs text-gray-500 mt-1">
                    {m.designation}{m.designation && m.company ? ' at ' : ''}{m.company}
                    {m.years_experience ? ` · ${m.years_experience} yrs exp` : ''}
                    {m.country ? ` · ${m.country}` : ''}
                  </div>
                  {(m.categories.length > 0 || m.skills.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.categories.map((c) => <span key={c} className="text-[11px] px-2 py-0.5 rounded-full bg-royal-50 text-navy-700">{c}</span>)}
                      {m.skills.map((s) => <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{s}</span>)}
                    </div>
                  )}
                  {m.status === 'rejected' && m.rejection_reason && <div className="text-xs text-red-600 mt-1.5">Reason: {m.rejection_reason}</div>}
                  {m.status === 'approved' && (
                    <div className="text-xs text-gray-500 mt-1.5">★ {m.rating_avg.toFixed(1)} ({m.rating_count}) · {m.sessions_completed} sessions completed</div>
                  )}
                </div>

                <div className="flex gap-1.5 flex-shrink-0">
                  {m.status === 'pending' && (
                    <>
                      <button disabled={busy === m.id} onClick={() => setMentorStatus(m.id, 'approved')} className="text-xs px-3 py-1.5 rounded-lg bg-good-50 hover:bg-good-100 text-good-700 transition disabled:opacity-40">Approve</button>
                      <button disabled={busy === m.id} onClick={() => setRejectingId(rejectingId === m.id ? null : m.id)} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition disabled:opacity-40">Reject</button>
                    </>
                  )}
                  {m.status === 'approved' && (
                    <button disabled={busy === m.id} onClick={() => setMentorStatus(m.id, 'suspended')} className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition disabled:opacity-40">Suspend</button>
                  )}
                  {(m.status === 'suspended' || m.status === 'rejected') && (
                    <button disabled={busy === m.id} onClick={() => setMentorStatus(m.id, 'approved')} className="text-xs px-3 py-1.5 rounded-lg bg-good-50 hover:bg-good-100 text-good-700 transition disabled:opacity-40">Approve</button>
                  )}
                </div>
              </div>

              {rejectingId === m.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                  <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection (shown to the applicant)" className="input-premium text-sm flex-1" />
                  <button disabled={busy === m.id || !rejectReason.trim()} onClick={() => setMentorStatus(m.id, 'rejected', rejectReason)} className="btn-primary px-4 py-2 text-sm disabled:opacity-40">Confirm Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
