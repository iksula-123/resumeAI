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
type FileType = 'pdf' | 'docx' | 'txt'

interface EnhanceResult {
  original: Content
  enhanced: Content
  ats_before: { score: number; breakdown: Record<string, number>; recommendations: string[] }
  ats_after: { score: number; breakdown: Record<string, number>; recommendations: string[] }
  improvements: string[]
}

interface DesignReport {
  replaced: { label: string; confidence: number }[]
  unmatched: { label: string; text: string }[]
  design_preserved: boolean
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

const STEPS = ['Upload', 'AI Processing', 'ATS Analysis', 'Compare', 'Save & Export']

const STAGES = [
  { icon: '📄', label: 'Extracting your resume' },
  { icon: '🎯', label: 'Analyzing ATS compatibility' },
  { icon: '✨', label: 'Rewriting content with AI' },
  { icon: '🔑', label: 'Optimizing keywords & metrics' },
  { icon: '🎁', label: 'Finalizing your upgrade' },
]

const scoreColor = (s: number) => (s >= 80 ? '#1E7A46' : s >= 60 ? '#F5A623' : '#c0392b')

export default function AiUpgradePage() {
  const router = useRouter()
  const { user } = useAuthStore()

  const [step, setStep] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  const [original, setOriginal] = useState<Content | null>(null)
  const [result, setResult] = useState<EnhanceResult | null>(null)

  // Design preservation (Mode 1, default for uploads) — see services/docx_editor.py.
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [fileType, setFileType] = useState<FileType | null>(null)
  const [preserveOriginal, setPreserveOriginal] = useState(true)
  const [designReport, setDesignReport] = useState<DesignReport | null>(null)
  const [preservedDocxB64, setPreservedDocxB64] = useState<string | null>(null)
  const [showTemplatePreview, setShowTemplatePreview] = useState(false)
  const [templateConfirmOpen, setTemplateConfirmOpen] = useState(false)
  // True unless the backend had to fall back to a no-AI heuristic parse
  // (AI provider rate-limited / out of credits / unreachable) — surfaced so
  // we never silently show a degraded parse as if it were the full result.
  const [parsedByAi, setParsedByAi] = useState(true)

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
    setUploadedFile(file)
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
      setParsedByAi(data.parsed_by !== 'heuristic')
      const ft: FileType = data.file_type
      setFileType(ft)
      // Uploaded resumes default to preserving the original design (product
      // requirement) — a .txt upload has no design to preserve, so it's the
      // one case that behaves like "building from scratch".
      const willPreserve = ft !== 'txt'
      setPreserveOriginal(willPreserve)
      if (!title) setTitle(`${(data.content?.personalInfo?.fullName || 'My')} Resume (AI Upgraded)`)

      // kick off enhancement (runs during the animation) — content layer only
      const enh = await api.post<EnhanceResult>('/api/upgrade/enhance', { content: data.content })
      setResult(enh)

      // DOCX: merge the improved content into the ORIGINAL file's runs right
      // away, so the design-preserved check + instant download are ready by
      // the time the user reaches Compare/Save. PDF needs no such step — the
      // original bytes are the download, untouched (see docx_editor.py docstring).
      if (ft === 'docx' && willPreserve) {
        try {
          const form2 = new FormData()
          form2.append('file', file)
          form2.append('original_content', JSON.stringify(data.content))
          form2.append('enhanced_content', JSON.stringify(enh.enhanced))
          const r2 = await fetch(`${API}/api/upgrade/apply-docx`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form2,
          })
          if (r2.ok) {
            const d2 = await r2.json()
            setPreservedDocxB64(d2.docx_base64)
            setDesignReport(d2.report)
          }
        } catch { /* non-fatal — Save & Export step falls back to re-trying */ }
      }
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
      if (preserveOriginal && uploadedFile && fileType && fileType !== 'txt') {
        // Mode 1 — persists the untouched original + a 2-version history
        // (Version 1 = original upload, Version 2 = AI-improved). This is the
        // one point the original file is stored (see routers/upgrade.py).
        const b64 = await fileToBase64(uploadedFile)
        const r = await api.post<{ id: string }>('/api/upgrade/save', {
          title: title || 'AI Upgraded Resume',
          template_id: 'modern',
          original_content: original,
          enhanced_content: result.enhanced,
          preserve_original: true,
          original_file_base64: b64,
          original_file_type: fileType,
          original_filename: uploadedFile.name,
        })
        setSavedId(r.id)
      } else {
        // Mode 2 (Change Template was chosen, or a .txt upload with no design
        // to preserve) — the normal SahiCareer-templated resume.
        const r = await api.post<{ id: string }>('/api/resumes/', {
          title: title || 'AI Upgraded Resume',
          template_id: 'modern',
          content: result.enhanced,
          ats_score: result.ats_after.score,
          source: 'ai_upgrade',
        })
        setSavedId(r.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const exportFile = async (fmt: 'pdf' | 'docx') => {
    if (!result) return
    setExporting(fmt)
    try {
      const baseName = title || 'resume'

      // PDF, design preserved: the original file IS the download — no
      // backend round-trip, zero risk of any visual change (product decision:
      // PDFs are never rewritten — see services/docx_editor.py docstring).
      if (fmt === 'pdf' && preserveOriginal && fileType === 'pdf' && uploadedFile) {
        triggerBlobDownload(uploadedFile, `${baseName}.pdf`)
        return
      }
      // DOCX, design preserved: the improved content already merged into the
      // original's runs (computed right after upload — see handleFile).
      if (fmt === 'docx' && preserveOriginal && fileType === 'docx' && preservedDocxB64) {
        const bin = atob(preservedDocxB64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        triggerBlobDownload(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `${baseName}.docx`)
        return
      }

      const token = useAuthStore.getState().accessToken
      // Already saved → the resume-scoped endpoint applies the same
      // preserve_original logic server-side (covers e.g. a stale preservedDocxB64).
      const url = savedId
        ? `${API}/api/resumes/${savedId}/download/${fmt}`
        : `${API}/api/export/${fmt}`
      const res = await fetch(url, savedId
        ? { headers: { Authorization: `Bearer ${token}` } }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ content: result.enhanced, title: baseName }),
          })
      if (res.status === 401) { handleSessionExpired(); throw new Error('Session expired') }
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      triggerBlobDownload(blob, `${baseName}.${fmt}`)
    } catch {
      setError('Export failed. Please try again.')
    } finally {
      setExporting(null)
    }
  }

  /* Mode 2 — the ONLY user action that switches away from the preserved
   * original design. Never triggered automatically. */
  const confirmChangeTemplate = async () => {
    setTemplateConfirmOpen(false)
    setPreserveOriginal(false)
    setPreservedDocxB64(null)
    setDesignReport(null)
    if (savedId) {
      try { await api.post(`/api/resumes/${savedId}/change-template`, {}) } catch { /* best-effort */ }
    }
  }

  const reset = () => {
    setStep(1); setOriginal(null); setResult(null); setFileName(''); setError(''); setSavedId(null); setStageIdx(0)
    setUploadedFile(null); setFileType(null); setPreserveOriginal(true)
    setDesignReport(null); setPreservedDocxB64(null); setShowTemplatePreview(false)
    setParsedByAi(true)
  }

  const topBar = (
    <>
      <div className="flex-1">
        <h1 className="text-sm font-semibold text-gray-800 flex items-center gap-2">🚀 AI Resume Upgrade</h1>
        <p className="text-xs text-gray-500">Upload, analyze, and supercharge your resume with AI</p>
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
                    done ? 'bg-green-500 text-white' : active ? 'bg-brand-gradient text-white shadow-glow' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {done ? '✓' : n}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${active ? 'text-navy-700' : done ? 'text-gray-600' : 'text-gray-500'}`}>{label}</span>
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
                dragging ? 'border-royal-500 bg-royal-50/60 scale-[1.01]' : 'border-royal-200 hover:border-royal-400'
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
                  <div className="text-xs text-gray-500 mt-0.5">{x.d}</div>
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
                <p className="text-xs text-gray-500 truncate">{fileName}</p>
              </div>
              <div className="space-y-3">
                {STAGES.map((s, i) => {
                  const done = i < stageIdx || (result && i <= stageIdx)
                  const active = i === stageIdx && !done
                  return (
                    <div key={s.label} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                      active ? 'bg-royal-50' : done ? '' : 'opacity-40'
                    }`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                        done ? 'bg-green-100' : active ? 'bg-royal-100' : 'bg-gray-100'
                      }`}>
                        {done ? '✓' : active ? <span className="animate-spin">⟳</span> : s.icon}
                      </div>
                      <span className={`text-sm ${done ? 'text-gray-700' : active ? 'text-navy-700 font-medium' : 'text-gray-500'}`}>{s.label}</span>
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
          <div className="animate-fade-up">
            {!parsedByAi && (
              <div className="mb-5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
                <span className="text-lg">⚠️</span>
                <div>
                  <span className="font-semibold">AI parsing was temporarily unavailable</span> — this is a basic,
                  section-based read of your resume (not the full AI parse), so some details may be missing or
                  miscategorized. Your original file is unaffected; try again shortly for the full AI-powered result.
                </div>
              </div>
            )}

            {fileType && fileType !== 'txt' && (
              <div className="card-premium p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-800">
                    {preserveOriginal ? '📄 Keeping your original design' : '🎨 Using the SahiCareer template'}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {preserveOriginal
                      ? `Downloads will match your uploaded ${fileType.toUpperCase()} — fonts, colors, and layout unchanged.`
                      : 'Downloads will use SahiCareer\'s design instead of your original.'}
                  </p>
                </div>
                <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden shrink-0">
                  <button onClick={() => setPreserveOriginal(true)}
                    className={`px-3 py-1.5 ${preserveOriginal ? 'bg-navy-600 text-white' : 'bg-white text-gray-600'}`}>
                    Keep Original
                  </button>
                  <button onClick={() => preserveOriginal ? setTemplateConfirmOpen(true) : undefined}
                    className={`px-3 py-1.5 ${!preserveOriginal ? 'bg-navy-600 text-white' : 'bg-white text-gray-600'}`}>
                    SahiCareer Template
                  </button>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-5">
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
                <span className="text-xs bg-royal-50 text-navy-700 px-3 py-1 rounded-full">
                  AI will fix these ✨
                </span>
              </div>
              <div className="space-y-2.5">
                {result.ats_before.recommendations.map((r, i) => (
                  <div key={i} className="flex gap-3 bg-gray-50 rounded-xl px-4 py-3">
                    <span className="text-royal-500 flex-shrink-0">💡</span>
                    <p className="text-sm text-gray-700">{r}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between bg-gradient-to-r from-royal-50 to-teal-50 rounded-xl p-4">
                <div>
                  <div className="text-sm font-semibold text-gray-800">AI has already enhanced your resume</div>
                  <div className="text-xs text-gray-500">Projected new score: <span className="font-bold text-green-600">{result.ats_after.score}</span> (+{result.ats_after.score - result.ats_before.score})</div>
                </div>
                <button onClick={() => setStep(4)} className="btn-primary text-sm">See Improvements →</button>
              </div>
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
              <div className="text-2xl text-royal-400">→</div>
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

            {/* ── design preservation status ─────────────────────────── */}
            {preserveOriginal && fileType && fileType !== 'txt' ? (
              designReport && !designReport.design_preserved ? (
                <div className="card-premium p-5 mb-5 border-2 border-amber-300 bg-amber-50/40">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div className="flex-1">
                      <div className="font-semibold text-amber-800">Some formatting differences were detected</div>
                      <p className="text-sm text-amber-700 mt-1">
                        {designReport.unmatched.length} change{designReport.unmatched.length === 1 ? '' : 's'} couldn't be
                        matched back to your original document with full confidence, so we didn't apply {designReport.unmatched.length === 1 ? 'it' : 'them'} automatically.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <span className="text-xs px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 font-medium">Preserve Original Format (current)</span>
                        <button onClick={() => setTemplateConfirmOpen(true)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-navy-600 text-white font-medium hover:bg-navy-700 transition">
                          Apply SahiCareer Template instead
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card-premium p-4 mb-5 border-2 border-green-300 bg-green-50/40 flex items-center gap-3">
                  <span className="text-2xl">✓</span>
                  <div>
                    <div className="font-semibold text-green-800">Design preserved</div>
                    <p className="text-xs text-green-700">
                      {fileType === 'pdf'
                        ? 'Your original PDF is kept exactly as uploaded — fonts, colors, layout, and structure are byte-for-byte unchanged.'
                        : `Fonts, colors, layout, tables, and structure from your original .docx are unchanged. ${designReport?.replaced.length ?? 0} content update${(designReport?.replaced.length ?? 0) === 1 ? '' : 's'} applied in place.`}
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="card-premium p-4 mb-5 border-2 border-royal-200 bg-royal-50/40 flex items-center gap-3">
                <span className="text-2xl">🎨</span>
                <div>
                  <div className="font-semibold text-navy-700">SahiCareer Template</div>
                  <p className="text-xs text-gray-600">You're building with SahiCareer's design instead of preserving an original — this only happens when you explicitly choose it.</p>
                </div>
              </div>
            )}

            {/* content-only diff — what actually changed, in your own words */}
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Original text</span>
                <div className="panel-premium p-4 mt-2 max-h-[420px] overflow-y-auto text-sm text-gray-600 space-y-3">
                  {result.original?.summary && <p className="italic">{result.original.summary}</p>}
                  {(result.original?.experience || []).map((e: any, i: number) => (
                    <div key={i}>
                      <p className="font-medium text-gray-800">{e.position} — {e.company}</p>
                      <ul className="list-disc ml-4">{(e.bullets || []).map((b: string, j: number) => <li key={j}>{b}</li>)}</ul>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold gradient-text uppercase tracking-wide">AI-improved text ✨</span>
                <div className="panel-premium p-4 mt-2 max-h-[420px] overflow-y-auto text-sm text-gray-700 space-y-3 ring-2 ring-royal-200">
                  {result.enhanced?.summary && <p className="italic">{result.enhanced.summary}</p>}
                  {(result.enhanced?.experience || []).map((e: any, i: number) => (
                    <div key={i}>
                      <p className="font-medium text-gray-800">{e.position} — {e.company}</p>
                      <ul className="list-disc ml-4">{(e.bullets || []).map((b: string, j: number) => <li key={j}>{b}</li>)}</ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* optional: what SahiCareer's own template would look like — opt-in only */}
            <div className="text-center mt-5">
              <button onClick={() => setShowTemplatePreview(v => !v)} className="text-xs text-gray-500 hover:text-navy-600 underline">
                {showTemplatePreview ? 'Hide' : 'Preview'} what the SahiCareer template would look like (not your download)
              </button>
            </div>
            {showTemplatePreview && (
              <div className="grid md:grid-cols-2 gap-5 mt-3 animate-fade-up">
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Original (SahiCareer preview)</span>
                  <div className="panel-premium overflow-hidden opacity-90 mt-2"><div className="max-h-[420px] overflow-y-auto"><ResumeTemplates content={result.original} template="modern" /></div></div>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">AI Enhanced (SahiCareer preview)</span>
                  <div className="panel-premium overflow-hidden mt-2"><div className="max-h-[420px] overflow-y-auto"><ResumeTemplates content={result.enhanced} template="modern" /></div></div>
                </div>
              </div>
            )}

            <div className="flex justify-center gap-3 mt-6">
              <button onClick={() => setStep(3)} className="btn-ghost text-sm">← Back</button>
              <button onClick={() => setStep(5)} className="btn-primary text-sm">Save & Export →</button>
            </div>
          </div>
        )}

        {/* ── "Change Template" confirmation (Mode 2 — always explicit) ── */}
        {templateConfirmOpen && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setTemplateConfirmOpen(false)}>
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <div className="text-2xl mb-2">🎨</div>
              <h3 className="font-bold text-gray-900 mb-1">Apply SahiCareer Template?</h3>
              <p className="text-sm text-gray-600 mb-4">
                This replaces your original design — fonts, colors, and layout — with SahiCareer's template.
                Your original file stays safe; you can always come back and choose "Preserve Original Format" again by re-uploading.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setTemplateConfirmOpen(false)} className="flex-1 btn-ghost text-sm">Cancel</button>
                <button onClick={confirmChangeTemplate} className="flex-1 btn-primary text-sm">Apply Template</button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 5: Save + Export ──────────────────────────────── */}
        {step === 5 && result && (
          <div className="max-w-lg mx-auto animate-fade-up">
            <div className="panel-premium p-8 text-center">
              <div className="w-14 h-14 mx-auto bg-brand-gradient rounded-2xl flex items-center justify-center text-white text-2xl mb-3 shadow-glow">💾</div>
              <h2 className="text-lg font-bold text-gray-900 font-display mb-1">
                {savedId ? 'Saved! 🎉' : 'Save your upgraded resume'}
              </h2>
              <p className="text-sm text-gray-500 mb-1">
                {preserveOriginal && fileType !== 'txt'
                  ? '✓ Downloads below keep your original design — content only.'
                  : 'Using the SahiCareer template.'}
              </p>
              {!savedId && (
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Resume title" className="input-premium text-center mb-4 mt-3" />
              )}

              {/* [Download PDF] [Download DOCX] — the default keeps the original design */}
              <div className="grid grid-cols-2 gap-3 mb-3 mt-4">
                <button onClick={() => exportFile('pdf')} disabled={exporting !== null} className="btn-primary text-sm">
                  {exporting === 'pdf' ? '⟳' : '↓'} Download PDF
                </button>
                <button onClick={() => exportFile('docx')} disabled={exporting !== null} className="btn-ghost text-sm">
                  {exporting === 'docx' ? '⟳' : '↓'} Download DOCX
                </button>
              </div>

              {/* [Save as New Resume] [Change Template] */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                {!savedId ? (
                  <button onClick={saveResume} disabled={saving} className="text-sm bg-royal-50 hover:bg-royal-100 text-navy-700 font-medium py-2.5 rounded-xl transition">
                    {saving ? 'Saving…' : '💾 Save as New Resume'}
                  </button>
                ) : (
                  <button onClick={() => router.push(`/resumes/${savedId}/edit`)} className="text-sm bg-royal-50 hover:bg-royal-100 text-navy-700 font-medium py-2.5 rounded-xl transition">Edit Resume</button>
                )}
                {preserveOriginal && fileType !== 'txt' ? (
                  <button onClick={() => setTemplateConfirmOpen(true)} className="text-sm bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium py-2.5 rounded-xl transition">🎨 Change Template</button>
                ) : (
                  <button onClick={() => router.push('/dashboard')} className="text-sm bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium py-2.5 rounded-xl transition">Dashboard</button>
                )}
              </div>

              {savedId && (
                <div className="flex gap-3">
                  <button onClick={() => router.push(`/resumes/${savedId}/preview`)} className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-medium py-2.5 rounded-xl transition">Preview</button>
                  <button onClick={() => router.push('/dashboard')} className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-medium py-2.5 rounded-xl transition">Dashboard</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
