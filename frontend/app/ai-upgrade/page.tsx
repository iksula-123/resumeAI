'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api, handleSessionExpired } from '@/lib/api'
import AppShell from '@/components/AppShell'
import CircularScore from '@/components/CircularScore'
import ResumeTemplates from '@/components/ResumeTemplates'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type Content = any

interface EnhanceResult {
  original: Content
  enhanced: Content
  ats_before: { score: number; breakdown: Record<string, number>; recommendations: string[] }
  ats_after: { score: number; breakdown: Record<string, number>; recommendations: string[] }
  improvements: string[]
}

const STEPS = ['Upload', 'AI Processing', 'ATS Analysis', 'Compare', 'Save & Export']

const STAGES = [
  { icon: '📄', label: 'Extracting your resume' },
  { icon: '🎯', label: 'Analyzing ATS compatibility' },
  { icon: '✨', label: 'Rewriting content with AI' },
  { icon: '🔑', label: 'Optimizing keywords & metrics' },
  { icon: '🎁', label: 'Finalizing your upgrade' },
]

const scoreColor = (s: number) => (s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444')

export default function AiUpgradePage() {
  const router = useRouter()
  const { user } = useAuthStore()

  const [step, setStep] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  const [original, setOriginal] = useState<Content | null>(null)
  const [result, setResult] = useState<EnhanceResult | null>(null)

  const [stageIdx, setStageIdx] = useState(0)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  /* ── Step 1: upload + parse ─────────────────────────────────── */
  const handleFile = async (file: File) => {
    setError('')
    const ok = /\.(pdf|docx|txt)$/i.test(file.name)
    if (!ok) { setError('Please upload a PDF, DOCX, or TXT file.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('File too large (max 5 MB).'); return }
    setFileName(file.name)
    setStep(2)
    setStageIdx(0)

    try {
      const form = new FormData()
      form.append('file', file)
      const token = useAuthStore.getState().accessToken  // freshest token at call time
      const res = await fetch(`${API}/api/upgrade/parse`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      if (res.status === 401) {
        handleSessionExpired()
        throw new Error('Your session expired — please log in again.')
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.detail || 'Could not read that file.')
      }
      const data = await res.json()
      setOriginal(data.content)
      // kick off enhancement (runs during the animation)
      const enh = await api.post<EnhanceResult>('/api/upgrade/enhance', { content: data.content })
      setResult(enh)
      if (!title) setTitle(`${(data.content?.personalInfo?.fullName || 'My')} Resume (AI Upgraded)`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setStep(1)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  /* ── Step 2: animate stages, advance when ready ─────────────── */
  useEffect(() => {
    if (step !== 2) return
    const t = setInterval(() => setStageIdx(i => Math.min(i + 1, STAGES.length - 1)), 1100)
    return () => clearInterval(t)
  }, [step])

  useEffect(() => {
    // move to analysis once enhancement is done AND the animation has played out
    if (step === 2 && result && stageIdx >= STAGES.length - 1) {
      const t = setTimeout(() => setStep(3), 900)
      return () => clearTimeout(t)
    }
  }, [step, result, stageIdx])

  useEffect(() => { if (!user) router.push('/auth/login') }, [user, router])

  /* ── Step 5: save + export ──────────────────────────────────── */
  const saveResume = async () => {
    if (!result) return
    setSaving(true)
    try {
      const r = await api.post<{ id: string }>('/api/resumes/', {
        title: title || 'AI Upgraded Resume',
        template_id: 'modern',
        content: result.enhanced,
        ats_score: result.ats_after.score,
        source: 'ai_upgrade',
      })
      setSavedId(r.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const exportFile = async (fmt: 'pdf' | 'docx') => {
    if (!result) return
    setExporting(fmt)
    try {
      const token = useAuthStore.getState().accessToken
      const res = await fetch(`${API}/api/export/${fmt}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: result.enhanced, title: title || 'AI Upgraded Resume' }),
      })
      if (res.status === 401) { handleSessionExpired(); throw new Error('Session expired') }
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${title || 'resume'}.${fmt}`; a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Export failed. Please try again.')
    } finally {
      setExporting(null)
    }
  }

  const reset = () => {
    setStep(1); setOriginal(null); setResult(null); setFileName(''); setError(''); setSavedId(null); setStageIdx(0)
  }

  const topBar = (
    <>
      <div className="flex-1">
        <h1 className="text-sm font-semibold text-gray-800 flex items-center gap-2">🚀 AI Resume Upgrade</h1>
        <p className="text-xs text-gray-400">Upload, analyze, and supercharge your resume with AI</p>
      </div>
      {step > 1 && (
        <button onClick={reset} className="btn-ghost text-xs !py-1.5 !px-3">↺ Start over</button>
      )}
    </>
  )

  return (
    <AppShell topBar={topBar}>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Stepper */}
        <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8 flex-wrap">
          {STEPS.map((label, i) => {
            const n = i + 1
            const done = step > n
            const active = step === n
            return (
              <div key={label} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    done ? 'bg-green-500 text-white' : active ? 'bg-brand-gradient text-white shadow-glow' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {done ? '✓' : n}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${active ? 'text-indigo-700' : done ? 'text-gray-600' : 'text-gray-400'}`}>{label}</span>
                </div>
                {n < STEPS.length && <div className={`w-6 sm:w-10 h-0.5 mx-1 sm:mx-2 rounded ${done ? 'bg-green-400' : 'bg-gray-200'}`} />}
              </div>
            )
          })}
        </div>

        {error && (
          <div className="max-w-xl mx-auto mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        {/* ── STEP 1: Upload ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="max-w-2xl mx-auto animate-fade-up">
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInput.current?.click()}
              className={`panel-premium cursor-pointer border-2 border-dashed transition-all p-12 text-center ${
                dragging ? 'border-indigo-500 bg-indigo-50/60 scale-[1.01]' : 'border-indigo-200 hover:border-indigo-400'
              }`}
            >
              <div className="w-16 h-16 mx-auto bg-brand-gradient rounded-2xl flex items-center justify-center text-white text-3xl mb-4 shadow-glow">
                ⬆️
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1 font-display">Drop your resume here</h2>
              <p className="text-sm text-gray-500 mb-4">or click to browse — PDF, DOCX or TXT (max 5 MB)</p>
              <span className="btn-primary text-sm inline-flex">Choose File</span>
              <input ref={fileInput} type="file" accept=".pdf,.docx,.txt" className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-6">
              {[
                { icon: '🎯', t: 'ATS Analysis', d: 'See how recruiters’ systems score your resume' },
                { icon: '✨', t: 'AI Rewrite', d: 'Stronger bullets, metrics & keywords' },
                { icon: '📊', t: 'Before / After', d: 'Compare and save the improved version' },
              ].map(x => (
                <div key={x.t} className="card-premium p-4 text-center">
                  <div className="text-2xl mb-1">{x.icon}</div>
                  <div className="text-sm font-semibold text-gray-800">{x.t}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{x.d}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 2: Processing timeline ────────────────────────── */}
        {step === 2 && (
          <div className="max-w-xl mx-auto animate-fade-up">
            <div className="panel-premium p-8">
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto bg-brand-gradient rounded-2xl flex items-center justify-center text-white text-2xl mb-3 shadow-glow animate-pulse-glow">✨</div>
                <h2 className="text-lg font-bold text-gray-900 font-display">Upgrading your resume</h2>
                <p className="text-xs text-gray-400 truncate">{fileName}</p>
              </div>
              <div className="space-y-3">
                {STAGES.map((s, i) => {
                  const done = i < stageIdx || (result && i <= stageIdx)
                  const active = i === stageIdx && !done
                  return (
                    <div key={s.label} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                      active ? 'bg-indigo-50' : done ? '' : 'opacity-40'
                    }`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                        done ? 'bg-green-100' : active ? 'bg-indigo-100' : 'bg-gray-100'
                      }`}>
                        {done ? '✓' : active ? <span className="animate-spin">⟳</span> : s.icon}
                      </div>
                      <span className={`text-sm ${done ? 'text-gray-700' : active ? 'text-indigo-700 font-medium' : 'text-gray-400'}`}>{s.label}</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-6 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-gradient rounded-full transition-all duration-700"
                  style={{ width: `${((stageIdx + 1) / STAGES.length) * 100}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: ATS Analysis dashboard ─────────────────────── */}
        {step === 3 && result && (
          <div className="animate-fade-up grid md:grid-cols-3 gap-5">
            <div className="card-premium p-6 flex flex-col items-center text-center">
              <div className="text-sm font-semibold text-gray-800 mb-3">Your Current ATS Score</div>
              <CircularScore score={result.ats_before.score} size={130} color={scoreColor(result.ats_before.score)} />
              <div className="mt-3 text-sm font-medium" style={{ color: scoreColor(result.ats_before.score) }}>
                {result.ats_before.score >= 80 ? 'Excellent' : result.ats_before.score >= 60 ? 'Good' : 'Needs Work'}
              </div>
              <div className="mt-4 w-full space-y-2">
                {Object.entries(result.ats_before.breakdown).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-24 text-left">{k}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${v}%`, background: scoreColor(v) }} />
                    </div>
                    <span className="text-xs font-medium text-gray-600 w-8 text-right">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-premium p-6 md:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900 font-display">Recommendations</h2>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full">
                  AI will fix these ✨
                </span>
              </div>
              <div className="space-y-2.5">
                {result.ats_before.recommendations.map((r, i) => (
                  <div key={i} className="flex gap-3 bg-gray-50 rounded-xl px-4 py-3">
                    <span className="text-indigo-500 flex-shrink-0">💡</span>
                    <p className="text-sm text-gray-700">{r}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4">
                <div>
                  <div className="text-sm font-semibold text-gray-800">AI has already enhanced your resume</div>
                  <div className="text-xs text-gray-500">Projected new score: <span className="font-bold text-green-600">{result.ats_after.score}</span> (+{result.ats_after.score - result.ats_before.score})</div>
                </div>
                <button onClick={() => setStep(4)} className="btn-primary text-sm">See Improvements →</button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: Side-by-side comparison ────────────────────── */}
        {step === 4 && result && (
          <div className="animate-fade-up">
            {/* score improvement banner */}
            <div className="card-premium p-5 mb-5 flex items-center justify-center gap-6 flex-wrap">
              <div className="flex items-center gap-3">
                <CircularScore score={result.ats_before.score} size={64} color={scoreColor(result.ats_before.score)} />
                <div className="text-xs text-gray-500">Before</div>
              </div>
              <div className="text-2xl text-indigo-400">→</div>
              <div className="flex items-center gap-3">
                <CircularScore score={result.ats_after.score} size={72} color={scoreColor(result.ats_after.score)} />
                <div className="text-xs font-semibold text-green-600">After (+{result.ats_after.score - result.ats_before.score})</div>
              </div>
              <div className="h-10 w-px bg-gray-200 hidden sm:block" />
              <div className="flex-1 min-w-[220px]">
                <div className="text-xs font-semibold text-gray-700 mb-1.5">What AI improved</div>
                <div className="flex flex-wrap gap-1.5">
                  {result.improvements.map((imp, i) => (
                    <span key={i} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full">✓ {imp}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* side-by-side previews */}
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Original</span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">ATS {result.ats_before.score}</span>
                </div>
                <div className="panel-premium overflow-hidden opacity-90">
                  <div className="max-h-[520px] overflow-y-auto">
                    <ResumeTemplates content={result.original} template="modern" />
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold gradient-text uppercase tracking-wide">AI Enhanced ✨</span>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ATS {result.ats_after.score}</span>
                </div>
                <div className="panel-premium overflow-hidden ring-2 ring-indigo-300">
                  <div className="max-h-[520px] overflow-y-auto">
                    <ResumeTemplates content={result.enhanced} template="modern" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-3 mt-6">
              <button onClick={() => setStep(3)} className="btn-ghost text-sm">← Back</button>
              <button onClick={() => setStep(5)} className="btn-primary text-sm">Save & Export →</button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Save + Export ──────────────────────────────── */}
        {step === 5 && result && (
          <div className="max-w-lg mx-auto animate-fade-up">
            <div className="panel-premium p-8 text-center">
              {!savedId ? (
                <>
                  <div className="w-14 h-14 mx-auto bg-brand-gradient rounded-2xl flex items-center justify-center text-white text-2xl mb-3 shadow-glow">💾</div>
                  <h2 className="text-lg font-bold text-gray-900 font-display mb-1">Save your upgraded resume</h2>
                  <p className="text-sm text-gray-500 mb-5">It'll be added to your dashboard, fully editable.</p>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="Resume title" className="input-premium text-center mb-4" />
                  <button onClick={saveResume} disabled={saving} className="btn-primary w-full">
                    {saving ? 'Saving…' : '💾 Save as New Resume'}
                  </button>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 mx-auto bg-green-500 rounded-2xl flex items-center justify-center text-white text-2xl mb-3 shadow-soft">✓</div>
                  <h2 className="text-lg font-bold text-gray-900 font-display mb-1">Saved! 🎉</h2>
                  <p className="text-sm text-gray-500 mb-5">Your AI-upgraded resume is ready.</p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <button onClick={() => exportFile('pdf')} disabled={exporting !== null} className="btn-primary text-sm">
                      {exporting === 'pdf' ? '⟳' : '↓'} PDF
                    </button>
                    <button onClick={() => exportFile('docx')} disabled={exporting !== null} className="btn-ghost text-sm">
                      {exporting === 'docx' ? '⟳' : '↓'} DOCX
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => router.push(`/resumes/${savedId}/edit`)} className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium py-2.5 rounded-xl transition">Edit</button>
                    <button onClick={() => router.push(`/resumes/${savedId}/preview`)} className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-medium py-2.5 rounded-xl transition">Preview</button>
                    <button onClick={() => router.push('/dashboard')} className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-medium py-2.5 rounded-xl transition">Dashboard</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
