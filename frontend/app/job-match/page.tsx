'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'
import CircularScore from '@/components/CircularScore'

interface Resume { id: string; title: string; content: any; ats_score?: number | null }
interface MatchResult { score: number; matched: string[]; missing: string[]; suggestions: string[] }

const scoreColor = (s: number) => (s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444')

export default function JobMatchPage() {
  const { user } = useAuthStore()
  const router = useRouter()

  const [resumes, setResumes] = useState<Resume[]>([])
  const [resumeId, setResumeId] = useState('')
  const [jd, setJd] = useState('')
  const [loadingResumes, setLoadingResumes] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [pickedMissing, setPickedMissing] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'save' | 'ai' | null>(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoadingResumes(true)
    try {
      const list = await api.get<Resume[]>('/api/resumes/')
      setResumes(list)
      if (list.length) setResumeId(list[0].id)
    } catch { /* handled */ }
    finally { setLoadingResumes(false) }
  }, [])

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return }
    load()
  }, [user, router, load])

  const selected = resumes.find(r => r.id === resumeId)

  const analyze = async () => {
    if (!selected || !jd.trim()) { setError('Pick a resume and paste a job description.'); return }
    setError(''); setMsg(''); setAnalyzing(true); setResult(null); setPickedMissing(new Set())
    try {
      const r = await api.post<MatchResult>('/api/ats/score', {
        resume_content: selected.content,
        job_description: jd,
      })
      setResult(r)
      setPickedMissing(new Set(r.missing.slice(0, 8))) // pre-select top missing
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.')
    } finally {
      setAnalyzing(false)
    }
  }

  const togglePick = (kw: string) => {
    setPickedMissing(prev => {
      const n = new Set(prev)
      n.has(kw) ? n.delete(kw) : n.add(kw)
      return n
    })
  }

  const saveTailored = async () => {
    if (!selected) return
    setBusy('save'); setMsg('')
    try {
      const content = JSON.parse(JSON.stringify(selected.content))
      const existing = new Set((content.skills || []).map((s: any) => (typeof s === 'string' ? s : s.name).toLowerCase()))
      const additions = Array.from(pickedMissing).filter(k => !existing.has(k.toLowerCase())).map(name => ({ name, level: 70 }))
      content.skills = [...(content.skills || []), ...additions]
      const r = await api.post<{ id: string }>('/api/resumes/', {
        title: `${selected.title} — tailored`,
        template_id: 'modern',
        content,
        ats_score: result?.score ?? null,
        source: 'ai_upgrade',
      })
      setMsg('✓ Saved a tailored copy to your resumes.')
      setTimeout(() => router.push(`/resumes/${r.id}/edit`), 900)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally { setBusy(null) }
  }

  const tailorWithAI = async () => {
    if (!selected) return
    setBusy('ai'); setMsg('')
    try {
      const enh = await api.post<{ enhanced: any; ats_after: { score: number } }>('/api/upgrade/enhance', { content: selected.content })
      // also fold in the picked missing keywords
      const content = enh.enhanced
      const existing = new Set((content.skills || []).map((s: any) => (typeof s === 'string' ? s : s.name).toLowerCase()))
      const additions = Array.from(pickedMissing).filter(k => !existing.has(k.toLowerCase())).map(name => ({ name, level: 75 }))
      content.skills = [...(content.skills || []), ...additions]
      const r = await api.post<{ id: string }>('/api/resumes/', {
        title: `${selected.title} — AI tailored`,
        template_id: 'modern',
        content,
        ats_score: enh.ats_after?.score ?? result?.score ?? null,
        source: 'ai_upgrade',
      })
      setMsg('✓ AI-tailored resume saved.')
      setTimeout(() => router.push(`/resumes/${r.id}/edit`), 900)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI tailoring failed (try again — AI may be busy).')
    } finally { setBusy(null) }
  }

  const topBar = (
    <div className="flex-1">
      <h1 className="text-sm font-semibold text-gray-800 flex items-center gap-2">🧲 Job Match</h1>
      <p className="text-xs text-gray-400">Match a saved resume against a job description</p>
    </div>
  )

  return (
    <AppShell topBar={topBar}>
      <div className="p-6 max-w-5xl mx-auto">
        {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
        {msg && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">{msg}</div>}

        <div className="grid md:grid-cols-2 gap-5">
          {/* Input */}
          <div className="panel-premium p-5 space-y-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Your resume</label>
              {loadingResumes ? (
                <div className="h-10 rounded-xl bg-gray-100 shimmer" />
              ) : resumes.length === 0 ? (
                <div className="text-sm text-gray-500">
                  No resumes yet. <button onClick={() => router.push('/resumes/new')} className="text-indigo-600 hover:underline">Create one</button>.
                </div>
              ) : (
                <select value={resumeId} onChange={e => { setResumeId(e.target.value); setResult(null) }} className="input-premium">
                  {resumes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Job description</label>
              <textarea value={jd} onChange={e => setJd(e.target.value)} rows={12}
                placeholder="Paste the full job description here…"
                className="input-premium resize-none" />
            </div>
            <button onClick={analyze} disabled={analyzing || !selected || !jd.trim()} className="btn-primary w-full">
              {analyzing ? '🧲 Analyzing…' : '🧲 Analyze Match'}
            </button>
          </div>

          {/* Result */}
          <div className="panel-premium p-5">
            {!result && !analyzing && (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-16">
                <div className="text-4xl mb-2">🧲</div>
                <p className="text-sm">Your match report appears here.</p>
              </div>
            )}
            {analyzing && (
              <div className="space-y-3">
                <div className="h-28 rounded-2xl bg-gray-100 shimmer" />
                <div className="h-24 rounded-2xl bg-gray-100 shimmer" />
              </div>
            )}
            {result && (
              <div className="space-y-4 animate-fade-up">
                <div className="flex flex-col items-center">
                  <CircularScore score={result.score} size={116} color={scoreColor(result.score)} />
                  <div className="text-sm font-medium mt-2" style={{ color: scoreColor(result.score) }}>
                    {result.score >= 80 ? 'Strong match' : result.score >= 60 ? 'Decent match' : 'Needs tailoring'}
                  </div>
                </div>

                {result.matched.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-800 mb-1.5">✓ Matched keywords ({result.matched.length})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.matched.slice(0, 20).map(k => (
                        <span key={k} className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">{k}</span>
                      ))}
                    </div>
                  </div>
                )}

                {result.missing.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-800 mb-1.5">
                      ❌ Missing keywords — tap to include in a tailored copy
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.missing.slice(0, 24).map(k => (
                        <button key={k} onClick={() => togglePick(k)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition ${
                            pickedMissing.has(k)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-red-50/60 text-red-600 border-red-200 hover:bg-red-100'
                          }`}>
                          {pickedMissing.has(k) ? '✓ ' : '+ '}{k}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {result.suggestions?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-800 mb-1.5">💡 Recommendations</div>
                    <div className="space-y-1.5">
                      {result.suggestions.map((s, i) => (
                        <div key={i} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{s}</div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-1">
                  <button onClick={saveTailored} disabled={busy !== null} className="btn-primary text-sm">
                    {busy === 'save' ? 'Saving…' : `Save tailored copy (${pickedMissing.size} keyword${pickedMissing.size === 1 ? '' : 's'})`}
                  </button>
                  <button onClick={tailorWithAI} disabled={busy !== null} className="btn-ghost text-sm">
                    {busy === 'ai' ? '✨ Tailoring with AI…' : '✨ Tailor with AI (rewrite + optimize)'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
