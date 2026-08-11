'use client'

/**
 * Admin Mentorship Dashboard — stat cards, Growth chart (Sessions/Signups
 * toggle), Action Queue, weekly Schedule, Platform Health, Top Mentors,
 * Recent Feedback. Detail pages (Applications, Programs, Sessions, …) live
 * under their own /admin/mentorship/* routes via AdminMentorshipSidebar.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminMentorshipShell from '@/components/mentorship/AdminMentorshipShell'
import WeekStrip from '@/components/mentorship/calendar/WeekStrip'
import { CalendarItem } from '@/components/mentorship/calendar/types'
import { api } from '@/lib/api'

interface Stats {
  total_users: number; total_mentors: number; total_mentees: number; total_sessions: number
  hours_total: number; avg_rating_platform: number; mentors_by_status: Record<string, number>
}
interface GrowthPoint { date: string; count: number }
interface ActionQueue { pending_applications: number; disabled_accounts: number; programs_missing_participants: number; branding_configured: boolean }
interface Health { auth_status: string; auth_detail: string; avg_rating_30d: number; cancellation_rate_30d: number }

const AUTH_STATUS_STYLE: Record<string, string> = {
  ok: 'text-good-700', demo_mode: 'text-amber-600', degraded: 'text-amber-600', down: 'text-red-600',
}
const AUTH_STATUS_LABEL: Record<string, string> = {
  ok: 'OK', demo_mode: 'Demo mode', degraded: 'Degraded', down: 'Down',
}
interface LeaderboardRow { rank: number; mentor_id: string; full_name: string | null; sessions_in_window: number; rating_avg: number; rating_count: number }
interface FeedbackRow { id: string; rating: number; review_text: string | null; learner_name: string | null; mentor_name: string | null; created_at: string | null }
interface ScheduleDay { session_id: string; mentor_name: string | null; learner_name: string | null; session_type: string; status: string; scheduled_start: string }
interface Schedule { week_start: string; week_end: string; days: Record<string, ScheduleDay[]> }

function mondayOf(d: Date): string {
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return monday.toISOString().slice(0, 10)
}
function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export default function AdminMentorshipDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [metric, setMetric] = useState<'sessions' | 'signups'>('sessions')
  const [growth, setGrowth] = useState<GrowthPoint[] | null>(null)
  const [actionQueue, setActionQueue] = useState<ActionQueue | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [topMentors, setTopMentors] = useState<LeaderboardRow[] | null>(null)
  const [recentFeedback, setRecentFeedback] = useState<FeedbackRow[] | null>(null)
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Stats>('/api/mentorship/admin/stats').then(setStats).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load stats'))
    api.get<ActionQueue>('/api/mentorship/admin/action-queue').then(setActionQueue).catch(() => {})
    api.get<Health>('/api/mentorship/admin/platform-health').then(setHealth).catch(() => {})
    api.get<{ leaderboard: LeaderboardRow[] }>('/api/mentorship/admin/leaderboard?days=30').then((r) => setTopMentors(r.leaderboard.slice(0, 5))).catch(() => {})
    api.get<{ feedback: FeedbackRow[] }>('/api/mentorship/admin/recent-feedback?limit=5').then((r) => setRecentFeedback(r.feedback)).catch(() => {})
  }, [])

  useEffect(() => {
    api.get<{ series: GrowthPoint[] }>(`/api/mentorship/admin/growth?metric=${metric}&days=30`).then((r) => setGrowth(r.series)).catch(() => {})
  }, [metric])

  useEffect(() => {
    api.get<Schedule>(`/api/mentorship/admin/schedule?week_start=${weekStart}`).then(setSchedule).catch(() => {})
  }, [weekStart])

  const scheduleItems: Record<string, CalendarItem[]> = {}
  if (schedule) {
    for (const [date, sessions] of Object.entries(schedule.days)) {
      scheduleItems[date] = sessions.map((s) => ({
        id: s.session_id, title: `${s.mentor_name || 'Mentor'} · ${s.learner_name || 'Learner'}`,
        subtitle: s.session_type.replace('_', ' '),
        time: new Date(s.scheduled_start).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
        status: s.status,
      }))
    }
  }

  const maxGrowth = Math.max(1, ...(growth || []).map((g) => g.count))

  const topBar = (
    <div>
      <h1 className="text-sm font-semibold text-gray-800">Mentorship Admin</h1>
      <p className="text-xs text-gray-500">Platform overview</p>
    </div>
  )

  return (
    <AdminMentorshipShell topBar={topBar}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total Users', value: stats?.total_users, icon: '👥', color: 'bg-blue-50 text-blue-700' },
            { label: 'Mentors', value: stats?.total_mentors, icon: '🎓', color: 'bg-royal-50 text-navy-700' },
            { label: 'Mentees', value: stats?.total_mentees, icon: '🙋', color: 'bg-teal-50 text-teal-700' },
            { label: 'Sessions', value: stats?.total_sessions, icon: '📅', color: 'bg-green-50 text-green-700' },
            { label: 'Hours', value: stats?.hours_total, icon: '⏱️', color: 'bg-orange-50 text-orange-700' },
            { label: 'Avg Rating', value: stats?.avg_rating_platform || '—', icon: '⭐', color: 'bg-amber-50 text-amber-700' },
          ].map((s) => (
            <div key={s.label} className="card-premium p-4">
              <div className={`w-9 h-9 ${s.color} rounded-lg flex items-center justify-center text-base mb-2`}>{s.icon}</div>
              <div className="text-xl font-bold text-gray-800 font-display">{stats ? s.value : '—'}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-6">
            {/* Growth chart */}
            <section className="panel-premium p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">Growth · last 30 days</h2>
                <div className="flex gap-1.5">
                  {(['sessions', 'signups'] as const).map((m) => (
                    <button key={m} onClick={() => setMetric(m)} className={`text-xs px-3 py-1.5 rounded-lg transition capitalize ${metric === m ? 'bg-navy-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{m}</button>
                  ))}
                </div>
              </div>
              {!growth ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : (
                <div className="flex items-end gap-[3px] h-28 overflow-x-auto">
                  {growth.map((g) => (
                    <div key={g.date} className="flex-1 min-w-[4px] flex flex-col items-center justify-end group relative" title={`${g.date}: ${g.count}`}>
                      <div className="w-full bg-navy-500 rounded-t hover:bg-royal-600 transition" style={{ height: `${(g.count / maxGrowth) * 100}%`, minHeight: g.count > 0 ? 3 : 0 }} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Schedule */}
            <section className="panel-premium p-5">
              <h2 className="font-semibold text-gray-800 mb-3">Schedule</h2>
              <WeekStrip weekStart={weekStart} itemsByDate={scheduleItems} onPrevWeek={() => setWeekStart(addDaysIso(weekStart, -7))} onNextWeek={() => setWeekStart(addDaysIso(weekStart, 7))} />
            </section>

            {/* Recent Feedback */}
            <section className="panel-premium p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-800">Recent Feedback</h2>
                <Link href="/admin/mentorship/feedback" className="text-xs text-royal-600 hover:underline">View all →</Link>
              </div>
              {!recentFeedback ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : recentFeedback.length === 0 ? (
                <p className="text-sm text-gray-400">No feedback yet.</p>
              ) : (
                <div className="space-y-3">
                  {recentFeedback.map((f) => (
                    <div key={f.id} className="border-b border-gray-50 pb-2 last:border-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{f.learner_name || 'Learner'} → {f.mentor_name || 'Mentor'}</span>
                        <span className="text-amber-500 text-xs">{'★'.repeat(f.rating)}</span>
                      </div>
                      {f.review_text && <p className="text-xs text-gray-500 mt-0.5">{f.review_text}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            {/* Action Queue */}
            <section className="panel-premium p-5">
              <h2 className="font-semibold text-gray-800 mb-3">Action Queue</h2>
              {!actionQueue ? <p className="text-sm text-gray-400">Loading…</p> : (
                <div className="space-y-2.5 text-sm">
                  <Link href="/admin/mentorship/applications" className="flex items-center justify-between hover:text-navy-600">
                    <span className="text-gray-600">Pending applications</span>
                    <span className={`font-semibold ${actionQueue.pending_applications > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{actionQueue.pending_applications}</span>
                  </Link>
                  <Link href="/admin" className="flex items-center justify-between hover:text-navy-600">
                    <span className="text-gray-600">Disabled accounts</span>
                    <span className="font-semibold text-gray-700">{actionQueue.disabled_accounts}</span>
                  </Link>
                  <Link href="/admin/mentorship/programs" className="flex items-center justify-between hover:text-navy-600">
                    <span className="text-gray-600">Programs missing mentors/mentees</span>
                    <span className="font-semibold text-gray-700">{actionQueue.programs_missing_participants}</span>
                  </Link>
                  <Link href="/admin/mentorship/settings" className="flex items-center justify-between hover:text-navy-600">
                    <span className="text-gray-600">Branding setup</span>
                    <span className={`font-semibold ${actionQueue.branding_configured ? 'text-good-700' : 'text-amber-600'}`}>{actionQueue.branding_configured ? 'Configured' : 'Not set'}</span>
                  </Link>
                  <Link href="/admin" className="text-xs text-royal-600 hover:underline block pt-1">View audit logs →</Link>
                </div>
              )}
            </section>

            {/* Platform Health */}
            <section className="panel-premium p-5">
              <h2 className="font-semibold text-gray-800 mb-3">Platform Health</h2>
              {!health ? <p className="text-sm text-gray-400">Loading…</p> : (
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Auth (Supabase)</span>
                    <span className={`font-semibold ${AUTH_STATUS_STYLE[health.auth_status] || 'text-gray-800'}`} title={health.auth_detail}>
                      {AUTH_STATUS_LABEL[health.auth_status] || health.auth_status}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 -mt-1.5">{health.auth_detail}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Avg rating (30d)</span>
                    <span className="font-semibold text-gray-800">{health.avg_rating_30d || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Cancellation rate (30d)</span>
                    <span className={`font-semibold ${health.cancellation_rate_30d > 20 ? 'text-red-600' : 'text-gray-800'}`}>{health.cancellation_rate_30d}%</span>
                  </div>
                </div>
              )}
            </section>

            {/* Top Mentors */}
            <section className="panel-premium p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-800">Top Mentors · 30 days</h2>
                <Link href="/admin/mentorship/leaderboard" className="text-xs text-royal-600 hover:underline">View all →</Link>
              </div>
              {!topMentors ? <p className="text-sm text-gray-400">Loading…</p> : topMentors.length === 0 ? (
                <p className="text-sm text-gray-400">No completed sessions yet.</p>
              ) : (
                <div className="space-y-2">
                  {topMentors.map((m) => (
                    <div key={m.mentor_id} className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-center font-bold text-gray-400">{m.rank}</span>
                      <span className="flex-1 truncate text-gray-700">{m.full_name || 'Mentor'}</span>
                      <span className="text-xs text-gray-400">{m.sessions_in_window} sessions</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </AdminMentorshipShell>
  )
}
