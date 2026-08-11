'use client'

/**
 * Mentee Dashboard — welcome header, Upcoming Session, Progress Snapshot,
 * Quick Actions, Your Calendar, Highlights, Recommended Mentors. Sourced
 * from one aggregate call to /api/mentorship/mentee/dashboard.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import MonthCalendar from '@/components/mentorship/calendar/MonthCalendar'
import { CalendarItem } from '@/components/mentorship/calendar/types'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

interface MentorCard {
  id: string; full_name: string | null; avatar_url: string | null; headline: string | null
  designation: string | null; company: string | null; rating_avg: number; rating_count: number
  skills: string[]
}
interface MenteeDashboard {
  upcoming_session: {
    booking_id: string; session_id: string; mentor_id: string; mentor_name: string | null
    session_type: string; scheduled_start: string; scheduled_end: string | null
  } | null
  progress: { sessions_completed: number; sessions_total: number; events_attended: number; events_total: number; programs_enrolled: number }
  highlights: { top_mentor: { mentor_id: string; name: string | null; session_count: number } | null; programs_enrolled: number; nudge_no_upcoming_session: boolean }
  recommended_mentors: MentorCard[]
  calendar: { month: string; sessions_by_date: Record<string, { booking_id: string; session_id: string; mentor_name: string | null; session_type: string; status: string; scheduled_start: string }[]> }
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  one_on_one: '1:1 Mentorship', resume_review: 'Resume Review', mock_interview: 'Mock Interview',
  career_guidance: 'Career Guidance', group_session: 'Group Session',
}
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function ProgressBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function MenteeDashboardPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [dash, setDash] = useState<MenteeDashboard | null>(null)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<MenteeDashboard>(`/api/mentorship/mentee/dashboard?month=${month}`)
      .then(setDash)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your dashboard'))
  }, [month])

  const calendarItems: Record<string, CalendarItem[]> = {}
  if (dash) {
    for (const [date, sessions] of Object.entries(dash.calendar.sessions_by_date)) {
      calendarItems[date] = sessions.map((s) => ({
        id: s.session_id, title: s.mentor_name || 'Mentor',
        subtitle: SESSION_TYPE_LABELS[s.session_type] || s.session_type,
        time: new Date(s.scheduled_start).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
        status: s.status,
      }))
    }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">My Mentorship Dashboard</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold text-navy-600">Welcome back, {user?.full_name?.split(' ')[0] || 'there'} 👋</h2>
          <p className="text-sm text-gray-500 mt-1">Here's where your mentorship journey stands today.</p>
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}

        {!dash ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            <div className="space-y-6">
              {/* Upcoming Session */}
              <section className="panel-premium p-5">
                <h2 className="text-sm font-semibold text-gray-800 mb-3">Upcoming Session</h2>
                {dash.upcoming_session ? (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <Link href={`/mentorship/${dash.upcoming_session.mentor_id}`} className="font-semibold text-navy-600 hover:underline">
                        {dash.upcoming_session.mentor_name || 'Mentor'}
                      </Link>
                      <p className="text-xs text-gray-500 mt-1">
                        {SESSION_TYPE_LABELS[dash.upcoming_session.session_type] || dash.upcoming_session.session_type}
                        {' · '}{fmtDateTime(dash.upcoming_session.scheduled_start)}
                      </p>
                    </div>
                    <Link href="/mentorship/sessions" className="btn-secondary text-xs !min-h-0 px-4 py-2">View details</Link>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500 mb-3">You don't have a session booked yet.</p>
                    <Link href="/mentorship" className="btn-primary inline-flex text-sm px-5 py-2.5">Find a Mentor</Link>
                  </div>
                )}
              </section>

              {/* Progress Snapshot */}
              <section className="panel-premium p-5">
                <h2 className="text-sm font-semibold text-gray-800 mb-4">Progress Snapshot</h2>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1.5">
                      <span>Sessions completed</span>
                      <span className="font-semibold">{dash.progress.sessions_completed}/{dash.progress.sessions_total || dash.progress.sessions_completed}</span>
                    </div>
                    <ProgressBar value={dash.progress.sessions_completed} total={dash.progress.sessions_total} color="bg-navy-600" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1.5">
                      <span>Events attended</span>
                      <span className="font-semibold">{dash.progress.events_attended}/{dash.progress.events_total || dash.progress.events_attended}</span>
                    </div>
                    <ProgressBar value={dash.progress.events_attended} total={dash.progress.events_total} color="bg-teal-500" />
                  </div>
                </div>
              </section>

              {/* Quick Actions */}
              <section className="panel-premium p-5">
                <h2 className="text-sm font-semibold text-gray-800 mb-3">Quick Actions</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { href: '/mentorship', icon: '🧑‍🏫', label: 'Find Mentor' },
                    { href: '/mentorship/book', icon: '📅', label: 'Book Session' },
                    { href: '/mentorship/events', icon: '🎪', label: 'Browse Events' },
                    { href: '/dashboard', icon: '📄', label: 'Continue Course' },
                    { href: '/mentorship/profile', icon: '✏️', label: 'Edit Profile' },
                  ].map((a) => (
                    <button key={a.href} onClick={() => router.push(a.href)}
                      className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 hover:border-royal-200 hover:bg-royal-50 transition p-3 text-center">
                      <span className="text-xl">{a.icon}</span>
                      <span className="text-xs font-medium text-gray-700">{a.label}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Recommended Mentors */}
              <section className="panel-premium p-5">
                <h2 className="text-sm font-semibold text-gray-800 mb-3">Recommended Mentors for you</h2>
                {dash.recommended_mentors.length === 0 ? (
                  <p className="text-xs text-gray-400">No recommendations yet — book a session to help us learn your interests.</p>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {dash.recommended_mentors.map((m) => (
                      <Link key={m.id} href={`/mentorship/${m.id}`} className="shrink-0 w-44 border border-gray-100 rounded-xl p-3 hover:border-royal-200 hover:bg-royal-50/50 transition">
                        <div className="w-10 h-10 rounded-full bg-brand-gradient text-white flex items-center justify-center font-bold mb-2">
                          {(m.full_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <p className="text-xs font-semibold text-gray-800 truncate">{m.full_name || 'Mentor'}</p>
                        <p className="text-[11px] text-gray-500 truncate">{[m.designation, m.company].filter(Boolean).join(' at ') || m.headline || '—'}</p>
                        {m.rating_count > 0 && <p className="text-[11px] text-amber-600 mt-1">★ {m.rating_avg.toFixed(1)}</p>}
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Sidebar column */}
            <div className="space-y-6">
              <section className="panel-premium p-5">
                <h2 className="text-sm font-semibold text-gray-800 mb-1">Your Calendar</h2>
                <MonthCalendar month={month} onMonthChange={setMonth} itemsByDate={calendarItems} />
              </section>

              <section className="panel-premium p-5">
                <h2 className="text-sm font-semibold text-gray-800 mb-3">Highlights</h2>
                <div className="space-y-3 text-sm">
                  {dash.highlights.top_mentor ? (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Top mentor</span>
                      <span className="font-medium text-gray-800">{dash.highlights.top_mentor.name} ({dash.highlights.top_mentor.session_count})</span>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Complete a session to see your top mentor here.</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Programs enrolled</span>
                    <span className="font-medium text-gray-800">{dash.highlights.programs_enrolled}</span>
                  </div>
                  {dash.highlights.nudge_no_upcoming_session && (
                    <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2.5">
                      Nothing booked in the next two weeks — <Link href="/mentorship" className="font-semibold underline">find a mentor</Link> to keep your momentum going.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </MentorshipShell>
  )
}
