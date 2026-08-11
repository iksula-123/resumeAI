'use client'

import { useEffect, useState } from 'react'
import AdminMentorshipShell from '@/components/mentorship/AdminMentorshipShell'
import { api } from '@/lib/api'

interface Listing {
  mentor_id: string; mentor_name: string | null; learner_id: string; learner_name: string | null
  sessions_total: number; sessions_completed: number; has_upcoming: boolean; last_session_at: string | null
}

export default function MentorshipListingsPage() {
  const [listings, setListings] = useState<Listing[] | null>(null)

  useEffect(() => { api.get<{ listings: Listing[] }>('/api/mentorship/admin/listings').then((r) => setListings(r.listings)).catch(() => setListings([])) }, [])

  const topBar = (
    <div>
      <h1 className="text-sm font-semibold text-gray-800">Mentorship Listings</h1>
      <p className="text-xs text-gray-500">Active mentor–mentee pairings</p>
    </div>
  )

  return (
    <AdminMentorshipShell topBar={topBar}>
      <div className="p-6 max-w-5xl mx-auto">
        {listings === null ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="panel-premium h-16 shimmer" />)}</div>
        ) : listings.length === 0 ? (
          <div className="panel-premium p-10 text-center text-sm text-gray-500">No pairings yet.</div>
        ) : (
          <div className="panel-premium overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Mentor</th>
                  <th className="px-5 py-3 font-medium">Mentee</th>
                  <th className="px-5 py-3 font-medium">Sessions</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Last session</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={`${l.mentor_id}-${l.learner_id}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 font-medium text-gray-800">{l.mentor_name || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{l.learner_name || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{l.sessions_completed}/{l.sessions_total} completed</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${l.has_upcoming ? 'bg-good-100 text-good-700' : 'bg-gray-100 text-gray-500'}`}>{l.has_upcoming ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{l.last_session_at ? new Date(l.last_session_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminMentorshipShell>
  )
}
