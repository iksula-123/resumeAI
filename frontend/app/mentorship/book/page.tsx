'use client'

/** Book Session — pick a mentor, then an open slot from their real
 * availability (BookingModal re-fetches the mentor's full profile for the
 * up-to-date slot list before opening). */
import { useEffect, useState } from 'react'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import BookingModal from '@/components/mentorship/BookingModal'
import { api } from '@/lib/api'

interface MentorCard {
  id: string; full_name: string | null; avatar_url: string | null; headline: string | null
  designation: string | null; company: string | null; rating_avg: number; rating_count: number
  skills: string[]; has_availability: boolean
}
interface MentorDetail {
  id: string; full_name: string | null; session_types: string[]
  upcoming_slots: { date: string; start_time: string; end_time: string }[]
}

export default function BookSessionPage() {
  const [search, setSearch] = useState('')
  const [mentors, setMentors] = useState<MentorCard[]>([])
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState<MentorDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ sort: 'rating', page_size: '30' })
    if (search.trim()) params.set('search', search.trim())
    const t = setTimeout(() => {
      api.get<{ mentors: MentorCard[] }>(`/api/mentorship/mentors?${params}`)
        .then((r) => setMentors(r.mentors))
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load mentors'))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  const openBooking = async (mentorId: string) => {
    setLoadingDetail(mentorId); setError('')
    try {
      const detail = await api.get<MentorDetail>(`/api/mentorship/mentors/${mentorId}`)
      setBooking(detail)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this mentor')
    } finally {
      setLoadingDetail(null)
    }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Book a Session</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-navy-600">Book a Session</h2>
          <p className="text-sm text-gray-500 mt-1">Pick a mentor, then an open time slot.</p>
        </div>

        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search mentors by name, title, or company…"
          className="input-premium mb-5"
        />

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-4">{error}</div>}

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="panel-premium h-20 shimmer" />)}</div>
        ) : mentors.length === 0 ? (
          <div className="panel-premium p-10 text-center text-sm text-gray-500">No mentors match your search.</div>
        ) : (
          <div className="space-y-3">
            {mentors.map((m) => (
              <div key={m.id} className="panel-premium p-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-full bg-brand-gradient text-white flex items-center justify-center font-bold shrink-0">
                    {(m.full_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{m.full_name || 'Mentor'}</p>
                    <p className="text-xs text-gray-500 truncate">{[m.designation, m.company].filter(Boolean).join(' at ') || m.headline || '—'}</p>
                    <p className="text-xs mt-0.5">
                      {m.rating_count > 0 && <span className="text-amber-600 mr-2">★ {m.rating_avg.toFixed(1)}</span>}
                      <span className={m.has_availability ? 'text-good-700' : 'text-gray-400'}>{m.has_availability ? 'Available' : 'No open slots'}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => openBooking(m.id)}
                  disabled={!m.has_availability || loadingDetail === m.id}
                  className="btn-primary text-sm px-4 py-2 shrink-0 disabled:opacity-40"
                >
                  {loadingDetail === m.id ? '…' : 'Book'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {booking && (
        <BookingModal
          mentorId={booking.id}
          mentorName={booking.full_name}
          sessionTypes={booking.session_types}
          upcomingSlots={booking.upcoming_slots}
          onClose={() => setBooking(null)}
          onBooked={() => {}}
        />
      )}
    </MentorshipShell>
  )
}
