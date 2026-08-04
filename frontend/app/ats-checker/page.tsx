'use client'

/**
 * AI ATS Engine dashboard.
 *
 * Upload/paste a resume + paste a JD → full pipeline runs (ResumeParser →
 * JobParser → KeywordEngine → SimilarityService → ATSService →
 * RecommendationEngine), and every card below renders from that ONE
 * response. Nothing here is hardcoded or a static fallback — a failed
 * request shows a real error, never demo numbers.
 */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import CircularScore from '@/components/CircularScore'
import ScoreBar from '@/components/ats/ScoreBar'
import PillList from '@/components/ats/PillList'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/* ── types (mirror backend/routers/ats_engine.py) ─────────────────────── */
interface ScorePct { pct: number; note?: string; found?: string[]; missing?: string[] }
interface ParsedResume {
  full_name?: string | null; job_title?: string | null; summary?: string | null
  skills: string[]; hard_skills: string[]; soft_skills: string[]
  experience: { title: string; company: string; duration: string; bullets: string[] }[]
  projects: { name: string; description: string; technologies: string[] }[]
  education: { degree: string; institution: string; year: string }[]
  certifications: string[]; action_verbs: string[]; keywords: string[]
  total_experience_years: number | null; parsed_by: 'ai' | 'heuristic'
}
interface ParsedJob {
  job_title: string | null; required_skills: string[]; preferred_skills: string[]
  responsibilities: string[]; min_experience_years: number | null; min_education: string | null
  industry: string | null; keywords: string[]; technologies: string[]; certifications: string[]
  parsed_by: 'ai' | 'heuristic'
}
interface AtsResult {
  overall_score: number
  scores: Record<
    'keyword_match' | 'skills_match' | 'experience_match' | 'education_match' | 'industry_match' |
    'formatting_score' | 'readability_score' | 'recruiter_readiness' | 'technologies_match' | 'certifications_match',
    ScorePct
  >
  interview_probability: ScorePct
  hiring_probability: ScorePct
  semantic_similarity: { pct: number; method: string }
}
interface Suggestions {
  bullet_rewrites: { original: string; improved: string; reason: string }[]
  weak_words_found: string[]
  summary_suggestion: string | null
  missing_keyword_tips: string[]
  general_tips: string[]
  generated_by: 'ai' | 'rules' | 'none'
}
interface AnalyzeResponse { resume: ParsedResume; job: ParsedJob; ats: AtsResult; suggestions: Suggestions }
interface TailoredContent {
  personalInfo: { fullName: string; jobTitle: string; email: string; phone: string; location: string }
  summary: string
  experience: { position: string; company: string; startDate: string; endDate: string; current: boolean; bullets: string[] }[]
  skills: { name: string; level: number }[]
  education: { degree: string; field: string; institution: string; endDate: string }[]
  projects: { name: string; technologies: string; description: string }[]
  certifications: { name: string; issuer: string }[]
  tailored_by: 'ai' | 'none'
}

type ScoreKey = keyof AtsResult['scores']

const SCORE_LABELS: Record<string, string> = {
  keyword_match: 'Keyword Match', skills_match: 'Skills Match', experience_match: 'Experience Match',
  education_match: 'Education Match', industry_match: 'Industry Match', formatting_score: 'Formatting',
  readability_score: 'Readability', recruiter_readiness: 'Recruiter Readiness',
}
const HEATMAP_KEYS = Object.keys(SCORE_LABELS)
const heatColor = (pct: number) => (pct >= 75 ? '#1E7A46' : pct >= 50 ? '#F5A623' : '#c0392b')
const gaugeColor = (pct: number) => (pct >= 75 ? '#1E7A46' : pct >= 50 ? '#F5A623' : '#c0392b')

const PIPELINE_STAGES = [
  { key: 'resume_parsed', label: 'Resume Parsed' },
  { key: 'job_parsed', label: 'Job Parsed' },
  { key: 'keywords', label: 'Keywords Compared' },
  { key: 'similarity', label: 'Similarity Computed' },
  { key: 'score', label: 'Score Calculated' },
  { key: 'suggestions', label: 'Suggestions Generated' },
]

export default function AtsCheckerPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [resumeMode, setResumeMode] = useState<'upload' | 'paste'>('upload')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeText, setResumeText] = useState('')
  const [jobDescription, setJobDescription] = useState('')

  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AnalyzeResponse | null>(null)

  const [tailoring, setTailoring] = useState(false)
  const [tailored, setTailored] = useState<TailoredContent | null>(null)
  const [saving, setSaving] = useState(false)

  const canAnalyze = (resumeMode === 'upload' ? !!resumeFile : !!resumeText.trim()) && !!jobDescription.trim() && !analyzing

  const uploadAndExtract = async (file: File): Promise<string> => {
    const token = useAuthStore.getState().accessToken
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${API_BASE}/api/ats/v2/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.detail || 'Could not read the uploaded file')
    return data.text as string
  }

  const analyze = async () => {
    setError(''); setResult(null); setTailored(null); setAnalyzing(true)
    try {
      const text = resumeMode === 'upload' && resumeFile ? await uploadAndExtract(resumeFile) : resumeText
      if (!text.trim()) throw new Error('No resume text found')
      const r = await api.post<AnalyzeResponse>('/api/ats/v2/analyze', {
        resume_text: text, job_description: jobDescription,
      })
      setResult(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  const tailorResume = async () => {
    setTailoring(true); setError('')
    try {
      const text = resumeMode === 'upload' && resumeFile ? await uploadAndExtract(resumeFile) : resumeText
      const r = await api.post<{ original: ParsedResume; tailored: TailoredContent }>('/api/ats/v2/tailor', {
        resume_text: text, job_description: jobDescription,
      })
      setTailored(r.tailored)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate a tailored resume')
    } finally {
      setTailoring(false)
    }
  }

  const saveTailored = async () => {
    if (!tailored) return
    setSaving(true); setError('')
    try {
      const content = {
        personalInfo: tailored.personalInfo,
        summary: tailored.summary,
        experience: tailored.experience.map((e, i) => ({ id: `exp${i}`, position: e.position, company: e.company, location: '', startDate: e.startDate, endDate: e.endDate, current: e.current, bullets: e.bullets })),
        education: tailored.education.map((e, i) => ({ id: `edu${i}`, degree: e.degree, field: e.field, institution: e.institution, location: '', startDate: '', endDate: e.endDate, gpa: '' })),
        skills: tailored.skills,
        projects: tailored.projects.map((p, i) => ({ id: `proj${i}`, name: p.name, technologies: p.technologies, description: p.description })),
        certifications: tailored.certifications.map((c, i) => ({ id: `cert${i}`, name: c.name, issuer: c.issuer, date: '' })),
        languages: [], achievements: [], interests: [],
      }
      const r = await api.post<{ id: string }>('/api/resumes/', {
        title: `${tailored.personalInfo.fullName || 'Tailored'} — ${tailored.personalInfo.jobTitle || 'Resume'}`,
        template_id: 'modern', content, source: 'ats_tailor',
      })
      router.push(`/resumes/${r.id}/edit`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save resume')
    } finally {
      setSaving(false)
    }
  }

  const scores = result?.ats.scores
  const strongSections = scores ? HEATMAP_KEYS.filter((k) => scores[k as ScoreKey].pct >= 75) : []
  const weakSections = scores ? HEATMAP_KEYS.filter((k) => scores[k as ScoreKey].pct < 60) : []

  const topBar = (
    <>
      <div className="flex-1">
        <h1 className="text-sm font-semibold text-gray-800">AI ATS Engine</h1>
        <p className="text-xs text-gray-500">Upload your resume, paste a job description, get a dynamic AI-driven analysis</p>
      </div>
    </>
  )

  return (
    <AppShell topBar={topBar}>
      <div className="p-6 max-w-6xl mx-auto">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>
        )}

        {/* ── Step 1: inputs ─────────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="panel-premium p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Your Resume</h3>
              <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden">
                <button onClick={() => setResumeMode('upload')}
                  className={`px-3 py-1.5 ${resumeMode === 'upload' ? 'bg-navy-600 text-white' : 'bg-white text-gray-600'}`}>Upload</button>
                <button onClick={() => setResumeMode('paste')}
                  className={`px-3 py-1.5 ${resumeMode === 'paste' ? 'bg-navy-600 text-white' : 'bg-white text-gray-600'}`}>Paste text</button>
              </div>
            </div>

            {resumeMode === 'upload' ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setResumeFile(f) }}
                className="border-2 border-dashed border-gray-200 rounded-xl h-48 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-royal-300 hover:bg-royal-50/30 transition"
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden"
                  onChange={(e) => setResumeFile(e.target.files?.[0] || null)} />
                <span className="text-2xl">📄</span>
                {resumeFile ? (
                  <p className="text-sm font-medium text-gray-800">{resumeFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">Drag & drop your resume, or click to browse</p>
                    <p className="text-xs text-gray-400">PDF, DOCX, or TXT — up to 5MB</p>
                  </>
                )}
              </div>
            ) : (
              <textarea value={resumeText} onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your resume text here..." rows={9}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300 resize-none" />
            )}
          </div>

          <div className="panel-premium p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Job Description</h3>
            <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the job description here..." rows={9}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300 resize-none" />
          </div>
        </div>

        <button onClick={analyze} disabled={!canAnalyze}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2 mb-8">
          {analyzing ? <><span className="animate-spin">⟳</span> Running AI analysis…</> : <><span>🎯</span> Analyze with AI</>}
        </button>

        {/* ── Dashboard (fully dynamic — nothing below renders without `result`) ── */}
        {result && (
          <div className="space-y-6">
            {/* pipeline timeline */}
            <div className="panel-premium p-4 flex flex-wrap items-center gap-x-2 gap-y-2">
              {PIPELINE_STAGES.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                    <span>✓</span> {s.label}
                  </span>
                  {i < PIPELINE_STAGES.length - 1 && <span className="text-gray-300">→</span>}
                </div>
              ))}
              <span className="ml-auto flex gap-2 text-[11px] text-gray-500">
                <span className={`px-2 py-0.5 rounded-full border ${result.resume.parsed_by === 'ai' ? 'bg-royal-50 text-navy-700 border-royal-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  Resume parsed by: {result.resume.parsed_by === 'ai' ? 'AI' : 'heuristic (no AI key / call failed)'}
                </span>
                <span className={`px-2 py-0.5 rounded-full border ${result.job.parsed_by === 'ai' ? 'bg-royal-50 text-navy-700 border-royal-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  JD parsed by: {result.job.parsed_by === 'ai' ? 'AI' : 'heuristic'}
                </span>
              </span>
            </div>

            {/* gauges */}
            <div className="grid sm:grid-cols-3 gap-5">
              <div className="panel-premium p-6 flex flex-col items-center">
                <CircularScore score={result.ats.overall_score} size={130} color={gaugeColor(result.ats.overall_score)} />
                <p className="font-bold mt-3" style={{ color: gaugeColor(result.ats.overall_score) }}>Overall ATS Score</p>
                <p className="text-xs text-gray-500 text-center mt-1">Weighted across every dimension below</p>
              </div>
              <div className="panel-premium p-6 flex flex-col items-center">
                <CircularScore score={result.ats.interview_probability.pct} size={110} color={gaugeColor(result.ats.interview_probability.pct)} />
                <p className="font-bold mt-3 text-sm" style={{ color: gaugeColor(result.ats.interview_probability.pct) }}>Interview Probability</p>
                <p className="text-[11px] text-gray-500 text-center mt-1">{result.ats.interview_probability.note}</p>
              </div>
              <div className="panel-premium p-6 flex flex-col items-center">
                <CircularScore score={result.ats.hiring_probability.pct} size={110} color={gaugeColor(result.ats.hiring_probability.pct)} />
                <p className="font-bold mt-3 text-sm" style={{ color: gaugeColor(result.ats.hiring_probability.pct) }}>Hiring Probability</p>
                <p className="text-[11px] text-gray-500 text-center mt-1">{result.ats.hiring_probability.note}</p>
              </div>
            </div>

            {/* score breakdown + heatmap */}
            <div className="grid lg:grid-cols-2 gap-5">
              <div className="panel-premium p-5">
                <h3 className="font-semibold text-gray-800 mb-4">Score Breakdown</h3>
                <div className="space-y-4">
                  {HEATMAP_KEYS.map((k) => (
                    <ScoreBar key={k} label={SCORE_LABELS[k]} pct={scores![k as ScoreKey].pct} note={scores![k as ScoreKey].note} />
                  ))}
                </div>
              </div>

              <div className="panel-premium p-5">
                <h3 className="font-semibold text-gray-800 mb-4">Score Heatmap</h3>
                <div className="grid grid-cols-2 gap-2">
                  {HEATMAP_KEYS.map((k) => {
                    const pct = scores![k as ScoreKey].pct
                    return (
                      <div key={k} className="rounded-lg p-3 text-white text-xs font-medium"
                        style={{ background: heatColor(pct) }}>
                        <div className="opacity-90">{SCORE_LABELS[k]}</div>
                        <div className="text-lg font-bold">{pct}%</div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-green-700 mb-1.5">💪 Strong sections</p>
                    <div className="flex flex-wrap gap-1.5">
                      {strongSections.length
                        ? strongSections.map((k) => <span key={k} className="text-[11px] bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">{SCORE_LABELS[k]}</span>)
                        : <span className="text-xs text-gray-400 italic">None yet</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-red-600 mb-1.5">⚠️ Weak sections</p>
                    <div className="flex flex-wrap gap-1.5">
                      {weakSections.length
                        ? weakSections.map((k) => <span key={k} className="text-[11px] bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5">{SCORE_LABELS[k]}</span>)
                        : <span className="text-xs text-gray-400 italic">None</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* keyword match detail */}
            <div className="panel-premium p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Keyword Match Detail</h3>
              <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
                {(['keyword_match', 'skills_match', 'technologies_match', 'certifications_match'] as const).map((k) => (
                  <div key={k}>
                    <p className="text-xs font-semibold text-gray-700 mb-2">
                      {k === 'keyword_match' ? 'Keywords' : k === 'skills_match' ? 'Skills' : k === 'technologies_match' ? 'Technologies' : 'Certifications'}
                      <span className="text-gray-400 font-normal"> — {scores![k].pct}% match</span>
                    </p>
                    <p className="text-[11px] text-green-700 mb-1">✓ Found ({scores![k].found?.length || 0})</p>
                    <PillList items={scores![k].found || []} tone="found" />
                    <p className="text-[11px] text-red-600 mt-2.5 mb-1">✗ Missing ({scores![k].missing?.length || 0})</p>
                    <PillList items={scores![k].missing || []} tone="missing" />
                  </div>
                ))}
              </div>
            </div>

            {/* AI suggestions */}
            <div className="panel-premium p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">AI Suggestions</h3>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border ${result.suggestions.generated_by === 'ai' ? 'bg-royal-50 text-navy-700 border-royal-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  {result.suggestions.generated_by === 'ai' ? 'AI-generated' : result.suggestions.generated_by === 'rules' ? 'Rule-based fallback (AI call unavailable)' : 'No suggestions available'}
                </span>
              </div>

              {result.suggestions.summary_suggestion && (
                <div className="mb-4 bg-royal-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-navy-700 mb-1">Suggested summary rewrite</p>
                  <p className="text-sm text-gray-700">{result.suggestions.summary_suggestion}</p>
                </div>
              )}

              {result.suggestions.bullet_rewrites.length > 0 && (
                <div className="mb-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-700">Bullet rewrites</p>
                  {result.suggestions.bullet_rewrites.map((r, i) => (
                    <div key={i} className="rounded-xl border border-gray-100 p-3">
                      <p className="text-xs text-red-500 line-through mb-1">{r.original}</p>
                      <p className="text-sm text-green-700 font-medium mb-1">→ {r.improved}</p>
                      <p className="text-[11px] text-gray-500">{r.reason}</p>
                    </div>
                  ))}
                </div>
              )}

              {result.suggestions.weak_words_found.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">Weak words to reduce</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.suggestions.weak_words_found.map((w) => (
                      <span key={w} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">{w}</span>
                    ))}
                  </div>
                </div>
              )}

              {result.suggestions.missing_keyword_tips.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">Where missing keywords could fit</p>
                  <ul className="space-y-1">
                    {result.suggestions.missing_keyword_tips.map((t, i) => (
                      <li key={i} className="text-xs text-gray-600 flex gap-2"><span className="text-royal-400">•</span>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.suggestions.general_tips.length > 0 && (
                <div className="space-y-2">
                  {result.suggestions.general_tips.map((t, i) => (
                    <div key={i} className="flex gap-3 bg-gray-50 rounded-xl p-3">
                      <span className="text-royal-500">💡</span>
                      <p className="text-xs text-gray-700 leading-relaxed">{t}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* resume tailoring */}
            <div className="panel-premium p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">Tailor My Resume For This Job</h3>
                <button onClick={tailorResume} disabled={tailoring}
                  className="btn-secondary text-xs !min-h-0 px-4 py-2">
                  {tailoring ? 'Generating…' : '✨ Generate Tailored Resume'}
                </button>
              </div>

              {tailored && (
                <div>
                  <div className="grid md:grid-cols-2 gap-5 mb-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2">BEFORE (original)</p>
                      <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600 space-y-2 max-h-80 overflow-auto">
                        <p className="italic">{result.resume.summary || 'No summary in original resume'}</p>
                        {result.resume.experience.map((e, i) => (
                          <div key={i}>
                            <p className="font-medium text-gray-800">{e.title} — {e.company}</p>
                            <ul className="list-disc ml-4">{e.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-green-700 mb-2">AFTER (tailored)</p>
                      <div className="rounded-xl border border-green-200 bg-green-50/30 p-4 text-sm text-gray-700 space-y-2 max-h-80 overflow-auto">
                        <p className="italic">{tailored.summary}</p>
                        {tailored.experience.map((e, i) => (
                          <div key={i}>
                            <p className="font-medium text-gray-800">{e.position} — {e.company}</p>
                            <ul className="list-disc ml-4">{e.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {tailored.tailored_by !== 'ai' && (
                    <p className="text-[11px] text-gray-500 mb-3">AI tailoring wasn't available for this run — showing your original content, untailored.</p>
                  )}
                  <button onClick={saveTailored} disabled={saving}
                    className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save as New Resume →'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
