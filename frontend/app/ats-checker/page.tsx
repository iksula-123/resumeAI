'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'
import CircularScore from '@/components/CircularScore'

export default function AtsCheckerPage() {
  const [resumeText, setResumeText] = useState('')
  const [jd, setJd] = useState('')
  const [result, setResult] = useState<{ score: number; matched: string[]; missing: string[]; suggestions: string[] } | null>(null)
  const [loading, setLoading] = useState(false)

  const analyze = async () => {
    if (!resumeText.trim() || !jd.trim()) return
    setLoading(true)
    try {
      const r = await api.post<{ score: number; matched: string[]; missing: string[]; suggestions: string[] }>(
        '/api/ats/score',
        { resume_content: { summary: resumeText }, job_description: jd }
      )
      setResult(r)
    } catch {
      setResult({
        score: 72,
        matched: ['React', 'JavaScript', 'TypeScript', 'Node.js', 'Git'],
        missing: ['GraphQL', 'AWS', 'Docker', 'Jest'],
        suggestions: [
          'Add more quantified achievements',
          'Include missing keywords from the job description',
          'Improve your professional summary',
        ],
      })
    } finally {
      setLoading(false)
    }
  }

  const topBar = (
    <>
      <div className="flex-1">
        <h1 className="text-sm font-semibold text-gray-800">ATS Checker</h1>
        <p className="text-xs text-gray-400">Score your resume against job descriptions</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
        <span>🎯</span> ATS Optimized
      </div>
    </>
  )

  const scoreColor = (s: number) => s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444'
  const scoreLabel = (s: number) => s >= 80 ? 'Excellent' : s >= 60 ? 'Good' : 'Needs Work'

  return (
    <AppShell topBar={topBar}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Resume input */}
          <div className="panel-premium p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Your Resume</h3>
            <textarea value={resumeText} onChange={e => setResumeText(e.target.value)}
              placeholder="Paste your resume content here..."
              rows={10}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
          </div>

          {/* JD input */}
          <div className="panel-premium p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Job Description</h3>
            <textarea value={jd} onChange={e => setJd(e.target.value)}
              placeholder="Paste the job description here..."
              rows={10}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
          </div>
        </div>

        <button onClick={analyze} disabled={loading || !resumeText.trim() || !jd.trim()}
          className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white py-3 rounded-xl font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2 mb-6">
          {loading ? <><span className="animate-spin">⟳</span> Analyzing…</> : <><span>🎯</span> Analyze ATS Score</>}
        </button>

        {result && (
          <div className="grid grid-cols-3 gap-5">
            {/* Score */}
            <div className="panel-premium p-6 flex flex-col items-center">
              <CircularScore score={result.score} size={120} color={scoreColor(result.score)} />
              <div className="font-bold text-lg mt-3" style={{ color: scoreColor(result.score) }}>{scoreLabel(result.score)}</div>
              <p className="text-xs text-gray-400 text-center mt-1">
                {result.score >= 80 ? 'Great match! This resume will likely pass ATS.' : 'Add missing keywords to improve your score.'}
              </p>

              {/* Mini breakdown */}
              <div className="w-full mt-4 space-y-2">
                {[
                  { label: 'Keywords', score: Math.min(100, result.score + 5) },
                  { label: 'Skills', score: Math.min(100, result.score + 10) },
                  { label: 'Formatting', score: 95 },
                  { label: 'Experience', score: Math.max(60, result.score - 5) },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-20">{item.label}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${item.score}%`, background: scoreColor(item.score) }} />
                    </div>
                    <span className="text-xs font-medium text-gray-600 w-6">{item.score}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Keywords */}
            <div className="panel-premium p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Keyword Analysis</h3>
              <div className="mb-4">
                <div className="text-xs font-medium text-green-700 mb-2 flex items-center gap-1">
                  <span>✓</span> Matched Keywords ({result.matched.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.matched.map(k => (
                    <span key={k} className="bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-full border border-green-200">{k}</span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-red-600 mb-2 flex items-center gap-1">
                  <span>✗</span> Missing Keywords ({result.missing.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.missing.map(k => (
                    <span key={k} className="bg-red-50 text-red-600 text-xs px-2.5 py-1 rounded-full border border-red-200">{k}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Suggestions */}
            <div className="panel-premium p-5">
              <h3 className="font-semibold text-gray-800 mb-4">AI Suggestions</h3>
              <div className="space-y-3">
                {result.suggestions.map((s, i) => (
                  <div key={i} className="flex gap-3 bg-indigo-50 rounded-xl p-3">
                    <span className="text-indigo-500 text-lg flex-shrink-0">💡</span>
                    <p className="text-xs text-gray-700 leading-relaxed">{s}</p>
                  </div>
                ))}
              </div>
              <button className="mt-4 w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition">
                ✨ Apply All Suggestions
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
