'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'
import dynamic from 'next/dynamic'
import CircularScore from '@/components/CircularScore'

// Templates carry all the print layouts — code-split them off the main bundle.
const ResumeTemplates = dynamic(() => import('@/components/ResumeTemplates'), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-100 rounded-2xl h-[600px] w-full" />,
})

interface Resume {
  id: string
  title: string
  template_id: string
  content: any
  ats_score?: number
}

export default function PreviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, accessToken, hasHydrated } = useAuthStore()
  const [resume, setResume] = useState<Resume | null>(null)
  const [downloading, setDownloading] = useState<'pdf' | 'docx' | null>(null)

  useEffect(() => {
    // Same guard as the editor/dashboard: on a fresh mount (e.g. clicking
    // "Preview" from a resume card, or a direct link) the persisted auth
    // session hasn't rehydrated from localStorage yet, so `user` reads as
    // a momentary `null`. Without this guard that null flash bounced the
    // page straight to /dashboard before the real GET ever fired -- the
    // page never rendered ResumeTemplates at all (not just missing
    // Projects/Custom Sections, ALL content, including Summary).
    if (!hasHydrated) return
    if (!user) { router.push('/auth/login'); return }
    let ignore = false
    api.get<Resume>(`/api/resumes/${id}`)
      .then(r => { if (!ignore) setResume(r) })
      .catch(() => { if (!ignore) router.push('/dashboard') })
    return () => { ignore = true }
  }, [id, user, hasHydrated, router])

  const download = async (format: 'pdf' | 'docx') => {
    if (!resume) return
    setDownloading(format)
    try {
      const token = accessToken
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resume_id: resume.id, content: resume.content, title: resume.title }),
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${resume.title}.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Export failed. Please try again.')
    } finally {
      setDownloading(null)
    }
  }

  const topBar = (
    <>
      <button onClick={() => router.push(`/resumes/${id}/edit`)} className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
        ← Edit
      </button>
      <span className="font-semibold text-gray-800 text-sm ml-4">{resume?.title}</span>
      <div className="flex items-center gap-2 ml-auto">
        {resume?.ats_score != null && (
          <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-full">
            <span className="text-xs font-medium text-green-700">Resume Health: {resume.ats_score}</span>
          </div>
        )}
        <button onClick={() => download('pdf')} disabled={downloading === 'pdf'}
          className="bg-navy-600 hover:bg-navy-700 text-white text-xs px-4 py-2 rounded-lg transition disabled:opacity-50 flex items-center gap-1">
          {downloading === 'pdf' ? '⟳' : '↓'} PDF
        </button>
        <button onClick={() => download('docx')} disabled={downloading === 'docx'}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-4 py-2 rounded-lg transition disabled:opacity-50 flex items-center gap-1">
          {downloading === 'docx' ? '⟳' : '↓'} DOCX
        </button>
      </div>
    </>
  )

  return (
    <AppShell topBar={topBar}>
      <div className="flex gap-6 p-6 max-w-6xl mx-auto">
        {/* Resume preview */}
        <div className="flex-1">
          {resume ? (
            <ResumeTemplates content={resume.content} template={resume.template_id} />
          ) : (
            <div className="bg-white rounded-2xl h-96 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-navy-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="w-64 space-y-4 flex-shrink-0">
          {/* Resume ATS Health — canonical mode_orchestrator.resume_health_mode() score, server-computed only */}
          {resume?.ats_score != null && (
            <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col items-center">
              <div className="text-sm font-semibold text-gray-800 mb-3">Resume ATS Health</div>
              <CircularScore score={resume.ats_score} size={90} color={resume.ats_score >= 80 ? '#1E7A46' : '#F5A623'} />
              <div className="text-xs text-gray-500 mt-2 text-center">
                {resume.ats_score >= 80 ? 'Excellent — ready to apply!' : 'Good — a few improvements can help'}
              </div>
            </div>
          )}

          {/* Export options */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="text-sm font-semibold text-gray-800 mb-3">Export Options</div>
            <div className="space-y-2">
              {[
                { fmt: 'pdf' as const, icon: '📄', label: 'Download as PDF', desc: 'Best for printing & sharing' },
                { fmt: 'docx' as const, icon: '📝', label: 'Download as DOCX', desc: 'Editable Word document' },
              ].map(opt => (
                <button key={opt.fmt} onClick={() => download(opt.fmt)} disabled={downloading === opt.fmt}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition text-left border border-gray-100 disabled:opacity-50">
                  <span className="text-xl">{opt.icon}</span>
                  <div>
                    <div className="text-xs font-medium text-gray-800">{opt.label}</div>
                    <div className="text-xs text-gray-500">{opt.desc}</div>
                  </div>
                  <span className="ml-auto text-gray-300">→</span>
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-2">
            <button onClick={() => router.push(`/resumes/${id}/edit`)}
              className="w-full bg-navy-600 hover:bg-navy-700 text-white py-2.5 rounded-xl text-sm font-medium transition">
              Edit Resume
            </button>
            <button onClick={() => router.push('/ats-checker')}
              className="w-full bg-green-50 hover:bg-green-100 text-green-700 py-2.5 rounded-xl text-sm font-medium transition">
              🎯 ATS Checker
            </button>
            <button onClick={() => router.push('/cover-letters')}
              className="w-full bg-teal-50 hover:bg-royal-100 text-royal-700 py-2.5 rounded-xl text-sm font-medium transition">
              ✉ Cover Letter
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
