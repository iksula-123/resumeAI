'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'

interface Resume {
  id: string
  title: string
  template_id: string
  updated_at: string
  ats_score?: number | null
}

interface Application {
  id: string
  company: string
  position: string
  status: string
  next_action?: string | null
  updated_at?: string | null
}

interface Action {
  icon: string
  title: string
  desc: string
  href: string
  cta: string
  tone: string
}

function relTime(iso?: string | null): string {
  if (!iso) return ''
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

const isOverdue = (iso?: string | null) => !!iso && new Date(iso + 'T23:59:59').getTime() < Date.now()

export default function DashboardPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [resumes, setResumes] = useState<Resume[]>([])
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return }
    Promise.allSettled([
      api.get<Resume[]>('/api/resumes/'),
      api.get<Application[]>('/api/applications/'),
    ]).then(([r, a]) => {
      if (r.status === 'fulfilled') setResumes(r.value)
      if (a.status === 'fulfilled') setApps(a.value)
    }).finally(() => setLoading(false))
  }, [user, router])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this resume?')) return
    setDeleting(id)
    try {
      await api.delete(`/api/resumes/${id}`)
      setResumes(p => p.filter(r => r.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  const scoreColor = (s?: number | null) => !s ? '#9ca3af' : s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444'

  const firstName = (user?.full_name || '').split(' ')[0] || 'there'
  const avgAts = resumes.length ? Math.round(resumes.reduce((a, r) => a + (r.ats_score || 0), 0) / resumes.length) : 0
  const interviews = apps.filter(a => a.status === 'interview').length
  const overdue = apps.filter(a => a.next_action && isOverdue(a.next_action) && !['joined', 'rejected'].includes(a.status))

  /* ── Next Best Action (personalized, non-AI) ─────────────────── */
  const nextActions: Action[] = (() => {
    const out: Action[] = []
    if (!loading && resumes.length === 0) {
      out.push({ icon: '🚀', title: 'Create your first resume', desc: 'Build an ATS-ready resume with AI in minutes', href: '/resumes/new', cta: 'Get started', tone: 'from-indigo-500 to-purple-500' })
    } else {
      const weakest = [...resumes].sort((a, b) => (a.ats_score || 0) - (b.ats_score || 0))[0]
      if (weakest && (weakest.ats_score == null || weakest.ats_score < 75)) {
        out.push({ icon: '📈', title: 'Boost your ATS score', desc: `“${weakest.title}” could score higher — run an AI upgrade`, href: '/ai-upgrade', cta: 'Upgrade', tone: 'from-green-500 to-emerald-500' })
      }
      if (overdue.length) {
        out.push({ icon: '⏰', title: `Follow up: ${overdue[0].company}`, desc: 'You have an overdue application reminder', href: '/job-tracker', cta: 'View tracker', tone: 'from-amber-500 to-orange-500' })
      }
      if (apps.length === 0) {
        out.push({ icon: '🧲', title: 'Match a resume to a job', desc: 'Paste a job description and see your match %', href: '/job-match', cta: 'Try Job Match', tone: 'from-blue-500 to-indigo-500' })
      }
    }
    out.push({ icon: '💬', title: 'Prepare for interviews', desc: 'Generate role-specific questions & practice answers', href: '/interview-questions', cta: 'Practice', tone: 'from-orange-400 to-red-500' })
    return out.slice(0, 3)
  })()

  /* ── Recent Activity timeline ────────────────────────────────── */
  const activity = [
    ...resumes.map(r => ({ kind: 'resume' as const, icon: '📄', label: `Updated “${r.title}”`, time: r.updated_at, href: `/resumes/${r.id}/edit` })),
    ...apps.map(a => ({ kind: 'app' as const, icon: '🧲', label: `${a.company} — ${a.position}`, sub: a.status, time: a.updated_at || null, href: '/job-tracker' })),
  ].filter(x => x.time).sort((a, b) => new Date(b.time!).getTime() - new Date(a.time!).getTime()).slice(0, 6)

  const topBar = (
    <>
      <div className="flex-1">
        <div className="relative w-64">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input placeholder="Search resumes..." className="w-full pl-9 pr-4 py-2 bg-white/70 border border-white/60 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300/60 backdrop-blur" />
        </div>
      </div>
      {user?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover cursor-pointer shadow-glow ring-2 ring-white" />
      ) : (
        <div className="w-9 h-9 bg-brand-gradient rounded-full flex items-center justify-center text-white text-sm font-bold cursor-pointer shadow-glow">
          {user?.full_name?.[0]?.toUpperCase() || 'U'}
        </div>
      )}
    </>
  )

  return (
    <AppShell topBar={topBar}>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Greeting */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 font-display">Welcome back, {firstName} 👋</h1>
          <p className="text-sm text-gray-500 mt-0.5">Here's your career snapshot and what to do next.</p>
        </div>

        {/* Next Best Action */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-gray-800 font-display">✨ Next best actions</span>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2].map(i => <div key={i} className="card-premium h-28 shimmer" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {nextActions.map((a, i) => (
                <button key={i} onClick={() => router.push(a.href)}
                  className="card-premium p-4 text-left group flex flex-col animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-10 h-10 bg-gradient-to-br ${a.tone} rounded-xl flex items-center justify-center text-white text-lg shadow-soft group-hover:scale-110 transition-transform`}>{a.icon}</div>
                    <div className="font-semibold text-sm text-gray-800 leading-tight">{a.title}</div>
                  </div>
                  <div className="text-xs text-gray-500 flex-1">{a.desc}</div>
                  <div className="text-xs font-medium text-indigo-600 mt-2 group-hover:translate-x-0.5 transition-transform">{a.cta} →</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Resumes', value: resumes.length, icon: '📄', color: 'bg-blue-50 text-blue-700' },
            { label: 'Avg ATS Score', value: resumes.length ? avgAts : '—', icon: '🎯', color: 'bg-green-50 text-green-700' },
            { label: 'Applications', value: apps.length, icon: '🧲', color: 'bg-purple-50 text-purple-700' },
            { label: 'Interviewing', value: interviews, icon: '🎤', color: 'bg-orange-50 text-orange-700' },
          ].map(stat => (
            <div key={stat.label} className="card-premium p-5">
              <div className={`w-11 h-11 ${stat.color} rounded-xl flex items-center justify-center text-xl mb-3 shadow-soft`}>{stat.icon}</div>
              <div className="text-2xl font-bold text-gray-800 font-display">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Main grid: resumes + activity */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Resumes */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 font-display">My Resumes</h2>
              <button onClick={() => router.push('/resumes/new')} className="btn-primary text-sm">
                <span>+</span> Create New Resume
              </button>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2].map(i => <div key={i} className="card-premium h-48 shimmer" />)}
              </div>
            ) : resumes.length === 0 ? (
              <div className="card-premium p-16 text-center">
                <div className="text-5xl mb-4">📄</div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2 font-display">No resumes yet</h3>
                <p className="text-gray-500 text-sm mb-6">Create your first AI-powered resume in minutes</p>
                <button onClick={() => router.push('/resumes/new')} className="btn-primary">Create Your First Resume</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {resumes.map(resume => (
                  <div key={resume.id} className="card-premium group overflow-hidden">
                    <div className="h-36 bg-gradient-to-br from-[#1e3a8a] to-[#3730a3] flex items-center justify-center text-white relative overflow-hidden">
                      <div className="text-4xl opacity-30">📄</div>
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[rgba(0,0,0,0.3)]" />
                      {resume.ats_score != null && (
                        <div className="absolute top-3 right-3 bg-white rounded-full w-10 h-10 flex flex-col items-center justify-center shadow-sm">
                          <div className="text-xs font-bold" style={{ color: scoreColor(resume.ats_score) }}>{resume.ats_score}</div>
                          <div className="text-gray-400" style={{ fontSize: 8 }}>ATS</div>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-800 mb-1 truncate">{resume.title}</h3>
                      <p className="text-xs text-gray-400 mb-4">Updated {relTime(resume.updated_at)}</p>
                      <div className="flex gap-2">
                        <button onClick={() => router.push(`/resumes/${resume.id}/edit`)}
                          className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium py-2 rounded-lg transition">Edit</button>
                        <button onClick={() => router.push(`/resumes/${resume.id}/preview`)}
                          className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium py-2 rounded-lg transition">Preview</button>
                        <button onClick={() => handleDelete(resume.id)} disabled={deleting === resume.id}
                          className="bg-red-50 hover:bg-red-100 text-red-500 text-xs font-medium px-3 py-2 rounded-lg transition disabled:opacity-50">
                          {deleting === resume.id ? '…' : '🗑'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 font-display mb-4">Recent Activity</h2>
            <div className="card-premium p-4">
              {loading ? (
                <div className="space-y-3">{[0, 1, 2, 3].map(i => <div key={i} className="h-10 rounded-lg bg-gray-100 shimmer" />)}</div>
              ) : activity.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  <div className="text-3xl mb-2">🗂️</div>
                  Nothing yet — your recent edits and applications will show here.
                </div>
              ) : (
                <div className="relative pl-4">
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-indigo-100" />
                  <div className="space-y-3">
                    {activity.map((a, i) => (
                      <button key={i} onClick={() => router.push(a.href)}
                        className="relative w-full text-left group animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                        <div className="absolute -left-4 top-1.5 w-3 h-3 rounded-full bg-indigo-400 border-2 border-white" />
                        <div className="flex items-center gap-2">
                          <span className="text-base">{a.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-gray-800 truncate group-hover:text-indigo-700 transition">{a.label}</div>
                            <div className="text-[11px] text-gray-400 capitalize">{('sub' in a && a.sub) ? `${a.sub} · ` : ''}{relTime(a.time)}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          {[
            { icon: '🚀', title: 'AI Resume Upgrade', desc: 'Upload & enhance', href: '/ai-upgrade', color: 'from-indigo-500 to-purple-500' },
            { icon: '🧲', title: 'Job Match', desc: 'Match to a JD', href: '/job-match', color: 'from-blue-500 to-indigo-500' },
            { icon: '✉️', title: 'Cover Letter', desc: 'Generate instantly', href: '/cover-letters', color: 'from-purple-500 to-pink-500' },
            { icon: '📊', title: 'Job Tracker', desc: 'Track applications', href: '/job-tracker', color: 'from-teal-500 to-cyan-500' },
          ].map(item => (
            <button key={item.href} onClick={() => router.push(item.href)} className="card-premium p-5 text-left group">
              <div className={`w-11 h-11 bg-gradient-to-br ${item.color} rounded-xl flex items-center justify-center text-white text-xl mb-3 shadow-soft group-hover:scale-110 transition-transform duration-200`}>
                {item.icon}
              </div>
              <div className="font-semibold text-sm text-gray-800">{item.title}</div>
              <div className="text-xs text-gray-400 mt-0.5">{item.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
