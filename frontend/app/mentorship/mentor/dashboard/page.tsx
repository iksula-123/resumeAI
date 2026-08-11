'use client'

/**
 * Mentor Dashboard — welcome header, Upcoming Session (or "Update
 * availability" CTA), 6 stat cards, Next 7 Days strip, Action Items. Detail
 * tabs (Sessions/Availability/Learners/Reviews/Analytics/Profile) now live
 * on their own dedicated pages under /mentorship/mentor/*.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import WeekStrip from '@/components/mentorship/calendar/WeekStrip'
import { CalendarItem } from '@/components/mentorship/calendar/types'
import StatCard from '@/components/mentorship/StatCard'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

interface SessionRow {
  booking_id: string; session_id: string; learner_name: string | null
  session_type: string; duration_minutes: number; agenda: string | null
  status: string; scheduled_start: string | null; scheduled_end: string | null; meeting_link: string | null
}
interface MentorDashboard {
  mentor: { status: string }
  overview: {
    total_learners: number; sessions_this_month: number; avg_rating: number; rating_count: number
    upcoming_count: number; today_count: number; pending_requests_count: number
    hours_mentored: number; sessions_completed: number
  }
  upcoming_sessions: SessionRow[]
  next_7_days: Record<string, SessionRow[]>
  action_items: { profile_completeness: number; needs_availability: boolean }
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  one_on_one: '1:1 Mentorship', resume_review: 'Resume Review', mock_interview: 'Mock Interview',
  career_guidance: 'Career Guidance', group_session: 'Group Session',
}
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export default function MentorDashboardPage() {
  const { user } = useAuthStore()
  const [dash, setDash] = useState<MentorDashboard | null>(null)
  const [notMentor, setNotMentor] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<MentorDashboard>('/api/mentorship/mentor/dashboard')
      .then(setDash)
      .catch((e) => {
        if (e instanceof Error && e.message.toLowerCase().includes("don't have a mentor")) setNotMentor(true)
        else setError(e instanceof Error ? e.message : 'Could not load your dashboard')
      })
  }, [])

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Mentor Dashboard</h1>

  if (notMentor) {
    return (
      <MentorshipShell topBar={topBar}>
        <div className="p-6 max-w-xl mx-auto">
          <div className="panel-premium p-10 text-center">
            <div className="text-3xl mb-3">🧑‍🏫</div>
            <p className="font-semibold text-gray-800">You're not a mentor yet</p>
            <p className="text-sm text-gray-500 mt-1 mb-4">Submit an application and an admin will review it.</p>
            <Link href="/mentorship/apply" className="btn-primary inline-flex px-5 py-2.5">Apply to become a mentor</Link>
          </div>
        </div>
      </MentorshipShell>
    )
  }

  const nextSession = dash?.upcoming_sessions[0]
  const weekStart = new Date().toISOString().slice(0, 10)
  const weekItems: Record<string, CalendarItem[]> = {}
  if (dash) {
    for (const [date, sessions] of Object.entries(dash.next_7_days)) {
      weekItems[date] = sessions.map((s) => ({
        id: s.session_id, title: s.learner_name || 'Learner',
        subtitle: SESSION_TYPE_LABELS[s.session_type] || s.session_type,
        time: s.scheduled_start ? new Date(s.scheduled_start).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : undefined,
        status: s.status,
      }))
    }
  }

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold text-navy-600">Welcome back, {user?.full_name?.split(' ')[0] || 'there'} 👋</h2>
          {dash?.mentor.status === 'pending' && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2 inline-block">
              Your mentor application is still pending admin review.
            </p>
          )}
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}

        {!dash ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            {/* Upcoming Session */}
            <section className="panel-premium p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">Upcoming Session</h2>
              {nextSession ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-gray-800">{nextSession.learner_name || 'Learner'}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {SESSION_TYPE_LABELS[nextSession.session_type] || nextSession.session_type}
                      {nextSession.scheduled_start && <> · {fmtDateTime(nextSession.scheduled_start)}</>}
                    </p>
                  </div>
                  <Link href="/mentorship/mentor/bookings" className="btn-secondary text-xs !min-h-0 px-4 py-2">View bookings</Link>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-500 mb-3">No upcoming sessions.</p>
                  {dash.action_items.needs_availability && (
                    <Link href="/mentorship/mentor/availability" className="btn-primary inline-flex text-sm px-5 py-2.5">Update availability</Link>
                  )}
                </div>
              )}
            </section>

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard label="Upcoming Sessions" value={dash.overview.upcoming_count} icon="📅" />
              <StatCard label="Completed Sessions" value={dash.overview.sessions_completed} icon="✅" />
              <StatCard label="Hours Mentored" value={dash.overview.hours_mentored} icon="⏱️" />
              <StatCard label="Avg Rating" value={dash.overview.rating_count ? dash.overview.avg_rating.toFixed(1) : '—'} icon="⭐" />
              <StatCard label="Total Mentees" value={dash.overview.total_learners} icon="👥" />
              <StatCard label="Requests" value={dash.overview.pending_requests_count} icon="📥" />
            </div>

            <div className="grid lg:grid-cols-[1fr_320px] gap-6">
              <section className="panel-premium p-5">
                <h2 className="text-sm font-semibold text-gray-800 mb-3">Next 7 Days</h2>
                <WeekStrip weekStart={weekStart} itemsByDate={weekItems} />
              </section>

              <section className="panel-premium p-5">
                <h2 className="text-sm font-semibold text-gray-800 mb-3">Action Items</h2>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1.5">
                      <span>Profile completeness</span>
                      <span className="font-semibold">{dash.action_items.profile_completeness}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-navy-600" style={{ width: `${dash.action_items.profile_completeness}%` }} />
                    </div>
                    {dash.action_items.profile_completeness < 100 && (
                      <Link href="/mentorship/mentor/profile" className="text-xs text-royal-600 hover:underline mt-1.5 inline-block">Complete your profile →</Link>
                    )}
                  </div>
                  {dash.action_items.needs_availability && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2.5">
                      You haven't published any availability — learners can't book you yet.{' '}
                      <Link href="/mentorship/mentor/availability" className="font-semibold underline">Set it now</Link>
                    </div>
                  )}
                  {dash.overview.pending_requests_count > 0 && (
                    <div className="rounded-lg bg-royal-50 border border-royal-200 text-navy-700 text-xs px-3 py-2.5">
                      {dash.overview.pending_requests_count} booking request{dash.overview.pending_requests_count === 1 ? '' : 's'} awaiting confirmation.{' '}
                      <Link href="/mentorship/mentor/bookings" className="font-semibold underline">Review</Link>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </MentorshipShell>
  )
}
