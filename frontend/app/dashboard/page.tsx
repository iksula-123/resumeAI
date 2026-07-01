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
  ats_score?: number
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [resumes, setResumes] = useState<Resume[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return }
    api.get<Resume[]>('/api/resumes/')
      .then(setResumes)
      .catch(() => {})
      .finally(() => setLoading(false))
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

  const scoreColor = (s?: number) => !s ? '#9ca3af' : s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444'

  const topBar = (
    <>
      <div className="flex-1">
        <div className="relative w-64">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input placeholder="Search resumes..." className="w-full pl-9 pr-4 py-2 bg-white/70 border border-white/60 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300/60 backdrop-blur" />
        </div>
      </div>
      <button onClick={() => router.push('/pricing')} className="btn-primary text-xs !py-2 !px-4">
        ⭐ Upgrade to Pro
      </button>
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

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Resumes', value: resumes.length, icon: '📄', color: 'bg-blue-50 text-blue-700' },
            { label: 'Avg ATS Score', value: resumes.length ? Math.round(resumes.reduce((a, r) => a + (r.ats_score || 0), 0) / resumes.length) || '—' : '—', icon: '🎯', color: 'bg-green-50 text-green-700' },
            { label: 'AI Credits', value: '50', icon: '✨', color: 'bg-purple-50 text-purple-700' },
            { label: 'Cover Letters', value: '0', icon: '✉️', color: 'bg-orange-50 text-orange-700' },
          ].map(stat => (
            <div key={stat.label} className="card-premium p-5">
              <div className={`w-11 h-11 ${stat.color} rounded-xl flex items-center justify-center text-xl mb-3 shadow-soft`}>
                {stat.icon}
              </div>
              <div className="text-2xl font-bold text-gray-800 font-display">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Resumes section */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 font-display">My Resumes</h2>
          <button onClick={() => router.push('/resumes/new')} className="btn-primary text-sm">
            <span>+</span> Create New Resume
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="card-premium h-48 shimmer" />)}
          </div>
        ) : resumes.length === 0 ? (
          <div className="card-premium p-16 text-center">
            <div className="text-5xl mb-4">📄</div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2 font-display">No resumes yet</h3>
            <p className="text-gray-500 text-sm mb-6">Create your first AI-powered resume in minutes</p>
            <button onClick={() => router.push('/resumes/new')} className="btn-primary">
              Create Your First Resume
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {resumes.map(resume => (
              <div key={resume.id} className="card-premium group overflow-hidden">
                {/* Preview area */}
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
                  <p className="text-xs text-gray-400 mb-4">Updated {new Date(resume.updated_at).toLocaleDateString()}</p>
                  <div className="flex gap-2">
                    <button onClick={() => router.push(`/resumes/${resume.id}/edit`)}
                      className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium py-2 rounded-lg transition">
                      Edit
                    </button>
                    <button onClick={() => router.push(`/resumes/${resume.id}/preview`)}
                      className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium py-2 rounded-lg transition">
                      Preview
                    </button>
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

        {/* Quick actions */}
        <div className="grid grid-cols-4 gap-4 mt-8">
          {[
            { icon: '✨', title: 'AI Resume Writer', desc: 'Let AI write your resume', href: '/ai-writer', color: 'from-indigo-500 to-purple-500' },
            { icon: '🎯', title: 'ATS Checker', desc: 'Score your resume', href: '/ats-checker', color: 'from-green-500 to-teal-500' },
            { icon: '✉️', title: 'Cover Letter', desc: 'Generate instantly', href: '/cover-letters', color: 'from-purple-500 to-pink-500' },
            { icon: '💬', title: 'Interview Prep', desc: 'Practice questions', href: '/interview-questions', color: 'from-orange-400 to-red-500' },
          ].map(item => (
            <button key={item.href} onClick={() => router.push(item.href)}
              className="card-premium p-5 text-left group">
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
