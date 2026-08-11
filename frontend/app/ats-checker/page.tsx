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
import { useEffect, useRef, useState } from 'react'
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
  total_experience_years: number | null; raw_text?: string
  parsed_by: 'ai' | 'heuristic' | 'profile'
}
interface ParsedJob {
  job_title: string | null; required_skills: string[]; preferred_skills: string[]
  responsibilities: string[]; min_experience_years: number | null; min_education: string | null
  industry: string | null; keywords: string[]; technologies: string[]; certifications: string[]
  parsed_by: 'ai' | 'heuristic' | 'role_library' | 'role_library_unmatched'
}
interface SavedResume {
  id: string; title: string; ats_score?: number | null; updated_at?: string
  content: { personalInfo?: { jobTitle?: string } }
}

/* ── Phase 3: Match/Completeness/Confidence per category (services/ats_engine/scoring.py) ── */
interface CategoryAnalysis {
  key: string; label: string; applicable: boolean
  match: number | null; completeness: number; confidence: 'high' | 'medium' | 'low'
  matched_evidence: string[]; missing_evidence: string[]; reason: string; weight: number
}
type CategoryKey = 'keyword' | 'skills' | 'experience' | 'responsibility' | 'education' | 'certifications' | 'formatting'
interface KeywordGroup { matched: string[]; missing: string[] }
interface KeywordAnalysis {
  critical: KeywordGroup; important: KeywordGroup; optional: KeywordGroup
  overused: { term: string; count: number; reason: string }[]
}
interface SkillsBreakdown {
  matched: string[]
  partial: { jd_skill: string; resume_skill: string; note: string }[]
  missing: string[]
}
interface ProfileCompleteness {
  overall: number; education: number; experience: number; skills: number
  projects: number; certifications: number; achievements: number
  suggestions: string[]
}
interface Recommendation { issue: string; why: string; action: string; impact: string }
interface Recommendations { high: Recommendation[]; medium: Recommendation[]; low: Recommendation[] }

interface AtsResult {
  overall_score: number
  score_confidence: 'high' | 'medium' | 'low'
  score_explanation: string
  category_analysis: Record<CategoryKey, CategoryAnalysis>
  weights_used: Record<string, number>
  excluded_categories: string[]
  keyword_analysis: KeywordAnalysis
  skills_breakdown: SkillsBreakdown
  profile_completeness: ProfileCompleteness
  recommendations_prioritized: Recommendations
  candidate_questions: string[]
  legacy_overall_score: number
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
interface AnalyzeResponse {
  resume: ParsedResume; job: ParsedJob; ats: AtsResult; suggestions: Suggestions
  resume_id?: string; report_id?: string
  analysis_mode?: 'job_description' | 'role_based'
  previous_score?: number | null
  score_delta?: number | null
}
interface ReportSummary {
  id: string; job_title: string | null; target_role: string | null
  analysis_mode: string | null; score: number; score_confidence: string | null; created_at: string | null
}
interface HistoryResponse {
  reports: ReportSummary[]
  trend: { first_score: number; latest_score: number; improvement: number } | null
}
interface ReportDetail {
  id: string; category_scores: Record<string, CategoryAnalysis> | null
}
interface CategoryDelta { key: string; label: string; before: number | null; after: number | null; delta: number | null }
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

const CATEGORY_ORDER: CategoryKey[] = ['keyword', 'skills', 'experience', 'responsibility', 'education', 'certifications', 'formatting']
const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-gray-100 text-gray-500 border-gray-200',
}
const PROFILE_SECTION_LABELS: Record<string, string> = {
  education: 'Education', experience: 'Experience', skills: 'Skills',
  projects: 'Projects', certifications: 'Certifications', achievements: 'Achievements',
}

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

  // "select" = pick a resume already saved in the Resume Builder (default —
  // the candidate should never have to re-paste a resume they already built).
  // "upload"/"paste" stay available for a quick one-off check.
  const [resumeMode, setResumeMode] = useState<'select' | 'upload' | 'paste'>('select')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeText, setResumeText] = useState('')

  const [savedResumes, setSavedResumes] = useState<SavedResume[]>([])
  const [loadingResumes, setLoadingResumes] = useState(true)
  const [selectedResumeId, setSelectedResumeId] = useState('')

  // Job side: paste a full JD, or (only available with a saved resume) just
  // pick a target role from the role library.
  const [jobTab, setJobTab] = useState<'jd' | 'role'>('jd')
  const [jobDescription, setJobDescription] = useState('')
  const [targetRole, setTargetRole] = useState('')

  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AnalyzeResponse | null>(null)

  const [tailoring, setTailoring] = useState(false)
  const [tailored, setTailored] = useState<TailoredContent | null>(null)
  const [saving, setSaving] = useState(false)

  const [history, setHistory] = useState<HistoryResponse | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [categoryDeltas, setCategoryDeltas] = useState<CategoryDelta[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingResumes(true)
    api.get<SavedResume[]>('/api/resumes/')
      .then((list) => {
        if (cancelled) return
        setSavedResumes(list)
        if (list.length && !selectedResumeId) setSelectedResumeId(list[0].id)
      })
      .catch(() => { /* not fatal — upload/paste still work */ })
      .finally(() => { if (!cancelled) setLoadingResumes(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setHistory(null)
    if (resumeMode === 'select' && selectedResumeId) loadHistory(selectedResumeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResumeId, resumeMode])

  const usingSavedResume = resumeMode === 'select'
  const jobReady = jobTab === 'jd' ? !!jobDescription.trim() : !!targetRole.trim()
  const canAnalyze = !analyzing && jobReady && (
    usingSavedResume ? !!selectedResumeId
      : resumeMode === 'upload' ? !!resumeFile : !!resumeText.trim()
  )

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

  const loadHistory = async (resumeId: string) => {
    setLoadingHistory(true)
    try {
      const h = await api.get<HistoryResponse>(`/api/ats/v2/history/${resumeId}`)
      setHistory(h)
    } catch {
      // not fatal — history is a supplementary panel
    } finally {
      setLoadingHistory(false)
    }
  }

  // Re-scan flow (spec Section 18): after a fresh analysis, if there's a
  // previous report for this resume, fetch its full category detail and
  // diff it against the new one so the candidate sees exactly which
  // categories moved, not just the headline number.
  const loadCategoryDeltas = async (resumeId: string, current: AnalyzeResponse) => {
    setCategoryDeltas(null)
    try {
      const h = await api.get<HistoryResponse>(`/api/ats/v2/history/${resumeId}`)
      setHistory(h)
      const prevSummary = h.reports.find((rep) => rep.id !== current.report_id)
      if (!prevSummary) return
      const prevDetail = await api.get<ReportDetail>(`/api/ats/v2/report/${prevSummary.id}`)
      if (!prevDetail.category_scores) return
      const deltas: CategoryDelta[] = CATEGORY_ORDER
        .filter((k) => current.ats.category_analysis[k] && prevDetail.category_scores![k])
        .map((k) => {
          const before = prevDetail.category_scores![k].match
          const after = current.ats.category_analysis[k].match
          return {
            key: k, label: current.ats.category_analysis[k].label,
            before, after,
            delta: before !== null && after !== null ? Math.round(after - before) : null,
          }
        })
        .filter((d) => d.delta !== null && d.delta !== 0)
        .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))
      setCategoryDeltas(deltas)
    } catch {
      // supplementary — a failed diff shouldn't block the rest of the dashboard
    }
  }

  const analyze = async () => {
    setError(''); setResult(null); setTailored(null); setAnalyzing(true); setCategoryDeltas(null)
    try {
      if (usingSavedResume) {
        if (!selectedResumeId) throw new Error('Select a resume first')
        const r = await api.post<AnalyzeResponse>('/api/ats/v2/analyze-resume', {
          resume_id: selectedResumeId,
          job_description: jobTab === 'jd' ? jobDescription : undefined,
          target_role: jobTab === 'role' ? targetRole : undefined,
        })
        setResult(r)
        if (typeof r.score_delta === 'number') loadCategoryDeltas(selectedResumeId, r)
        else loadHistory(selectedResumeId)
      } else {
        const text = resumeMode === 'upload' && resumeFile ? await uploadAndExtract(resumeFile) : resumeText
        if (!text.trim()) throw new Error('No resume text found')
        const r = await api.post<AnalyzeResponse>('/api/ats/v2/analyze', {
          resume_text: text, job_description: jobDescription,
        })
        setResult(r)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  // Tailoring needs actual resume + JD text. For a saved resume we already have
  // its raw_text from the analysis response; for target-role-only runs (no JD
  // pasted) there's no JD text to tailor against, so the button stays disabled.
  const canTailor = !!result && (jobTab === 'jd' ? !!jobDescription.trim() : !usingSavedResume) && !tailoring

  const tailorResume = async () => {
    if (!result) return
    setTailoring(true); setError('')
    try {
      const text = usingSavedResume
        ? (result.resume.raw_text || '')
        : (resumeMode === 'upload' && resumeFile ? await uploadAndExtract(resumeFile) : resumeText)
      if (!text.trim()) throw new Error('No resume text available to tailor')
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
        <p className="text-xs text-gray-500">Pick a saved resume (or upload/paste one), match it to a job, get a dynamic AI-driven analysis</p>
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
                <button onClick={() => setResumeMode('select')}
                  className={`px-3 py-1.5 ${resumeMode === 'select' ? 'bg-navy-600 text-white' : 'bg-white text-gray-600'}`}>My Resumes</button>
                <button onClick={() => setResumeMode('upload')}
                  className={`px-3 py-1.5 ${resumeMode === 'upload' ? 'bg-navy-600 text-white' : 'bg-white text-gray-600'}`}>Upload</button>
                <button onClick={() => setResumeMode('paste')}
                  className={`px-3 py-1.5 ${resumeMode === 'paste' ? 'bg-navy-600 text-white' : 'bg-white text-gray-600'}`}>Paste text</button>
              </div>
            </div>

            {resumeMode === 'select' && (
              loadingResumes ? (
                <div className="h-48 rounded-xl bg-gray-100 shimmer" />
              ) : savedResumes.length === 0 ? (
                <div className="h-48 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3 text-center px-6">
                  <span className="text-2xl">📄</span>
                  <p className="text-sm text-gray-600">Create or upload a resume first</p>
                  <div className="flex gap-2">
                    <button onClick={() => router.push('/resumes/new')} className="btn-primary text-xs !min-h-0 px-4 py-2">Create Resume</button>
                    <button onClick={() => router.push('/ai-upgrade')} className="btn-secondary text-xs !min-h-0 px-4 py-2">Upload Resume</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {savedResumes.map((r) => (
                    <button key={r.id} onClick={() => setSelectedResumeId(r.id)}
                      className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                        selectedResumeId === r.id ? 'border-navy-500 bg-royal-50/40 ring-1 ring-navy-300' : 'border-gray-200 hover:border-royal-300'
                      }`}>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{r.title}</p>
                          {r.content?.personalInfo?.jobTitle && (
                            <p className="text-xs text-gray-500">{r.content.personalInfo.jobTitle}</p>
                          )}
                        </div>
                        {typeof r.ats_score === 'number' && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0">
                            ATS {r.ats_score}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )
            )}

            {resumeMode === 'upload' && (
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
            )}

            {resumeMode === 'paste' && (
              <textarea value={resumeText} onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your resume text here..." rows={9}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300 resize-none" />
            )}
          </div>

          <div className="panel-premium p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Target Job</h3>
              {usingSavedResume && (
                <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden">
                  <button onClick={() => setJobTab('jd')}
                    className={`px-3 py-1.5 ${jobTab === 'jd' ? 'bg-navy-600 text-white' : 'bg-white text-gray-600'}`}>Job description</button>
                  <button onClick={() => setJobTab('role')}
                    className={`px-3 py-1.5 ${jobTab === 'role' ? 'bg-navy-600 text-white' : 'bg-white text-gray-600'}`}>Target role</button>
                </div>
              )}
            </div>

            {jobTab === 'jd' || !usingSavedResume ? (
              <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the job description here..." rows={9}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300 resize-none" />
            ) : (
              <div className="h-[152px] flex flex-col justify-center gap-2">
                <input value={targetRole} onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. React Developer"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
                <p className="text-xs text-gray-400">No job description yet? We'll score against typical requirements for this role.</p>
              </div>
            )}
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
                <span className={`px-2 py-0.5 rounded-full border ${result.resume.parsed_by === 'ai' || result.resume.parsed_by === 'profile' ? 'bg-royal-50 text-navy-700 border-royal-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  Resume: {
                    result.resume.parsed_by === 'profile' ? 'from your saved resume'
                    : result.resume.parsed_by === 'ai' ? 'AI-parsed'
                    : 'heuristic (no AI key / call failed)'
                  }
                </span>
                <span className={`px-2 py-0.5 rounded-full border ${result.job.parsed_by === 'ai' ? 'bg-royal-50 text-navy-700 border-royal-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  JD: {
                    result.job.parsed_by === 'ai' ? 'AI-parsed'
                    : result.job.parsed_by === 'role_library' ? 'from role library'
                    : result.job.parsed_by === 'role_library_unmatched' ? 'title only — not in role library'
                    : 'heuristic'
                  }
                </span>
              </span>
            </div>

            {/* mode + before/after banner */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${result.analysis_mode === 'role_based' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-royal-50 text-navy-700 border-royal-200'}`}>
                {result.analysis_mode === 'role_based' ? '🎯 Role-based analysis — no specific employer JD provided' : '📋 Analyzed against the pasted job description'}
              </span>
              {typeof result.score_delta === 'number' && (
                <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${result.score_delta > 0 ? 'bg-green-50 text-green-700 border-green-200' : result.score_delta < 0 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  {result.score_delta > 0 ? '▲' : result.score_delta < 0 ? '▼' : '＝'} {result.score_delta > 0 ? '+' : ''}{result.score_delta} vs. previous scan ({result.previous_score})
                </span>
              )}
            </div>

            {/* What changed since last scan — spec Section 18 re-scan flow */}
            {typeof result.score_delta === 'number' && categoryDeltas && categoryDeltas.length > 0 && (
              <div className="panel-premium p-5">
                <h3 className="font-semibold text-gray-800 mb-1">What changed since your last scan</h3>
                <p className="text-xs text-gray-400 mb-4">Category match scores compared against your previous report for this resume.</p>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {categoryDeltas.map((d) => (
                    <div key={d.key} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                      <span className="text-xs text-gray-700">{d.label}</span>
                      <span className={`text-xs font-semibold ${d.delta! > 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {d.delta! > 0 ? '▲' : '▼'} {d.delta! > 0 ? '+' : ''}{d.delta}% ({Math.round(d.before!)}→{Math.round(d.after!)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* gauges */}
            <div className="grid sm:grid-cols-3 gap-5">
              <div className="panel-premium p-6 flex flex-col items-center">
                <CircularScore score={result.ats.overall_score} size={130} color={gaugeColor(result.ats.overall_score)} />
                <p className="font-bold mt-3" style={{ color: gaugeColor(result.ats.overall_score) }}>Overall ATS Score</p>
                <span className={`mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${CONFIDENCE_STYLE[result.ats.score_confidence]}`}>
                  {result.ats.score_confidence} confidence
                </span>
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

            {/* "Your ATS score is X because..." — spec Section 13, never hide the calculation */}
            <div className="panel-premium p-5">
              <h3 className="font-semibold text-gray-800 mb-2">Why this score?</h3>
              <p className="text-sm text-gray-700 leading-relaxed">{result.ats.score_explanation}</p>
              {result.ats.excluded_categories.length > 0 && (
                <p className="text-[11px] text-gray-400 mt-2">
                  Weights redistributed across: {Object.entries(result.ats.weights_used).map(([k, v]) => `${SCORE_LABELS[k] || k} ${v}%`).join(', ')}
                </p>
              )}
            </div>

            {/* Profile Completeness — a SEPARATE metric from the ATS score (spec Section 14) */}
            <div className="panel-premium p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-gray-800">Profile Completeness</h3>
                <span className="text-xs text-gray-400">Not part of your ATS score — measures how much of your profile is filled in</span>
              </div>
              <div className="flex items-center gap-4 mt-3 mb-4">
                <span className="text-3xl font-bold" style={{ color: gaugeColor(result.ats.profile_completeness.overall) }}>
                  {result.ats.profile_completeness.overall}%
                </span>
                <span className="text-sm text-gray-500">of your profile is filled in</span>
              </div>
              <div className="grid sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                {Object.entries(PROFILE_SECTION_LABELS).map(([k, label]) => {
                  const pct = (result.ats.profile_completeness as unknown as Record<string, number>)[k]
                  return (
                    <div key={k} className="rounded-lg border border-gray-100 p-2.5 text-center">
                      <div className="text-lg font-bold" style={{ color: gaugeColor(pct) }}>{pct}%</div>
                      <div className="text-[11px] text-gray-500">{label}</div>
                    </div>
                  )
                })}
              </div>
              {result.ats.profile_completeness.suggestions.length > 0 && (
                <ul className="space-y-1">
                  {result.ats.profile_completeness.suggestions.map((s, i) => (
                    <li key={i} className="text-xs text-gray-600 flex gap-2"><span className="text-royal-400">•</span>{s}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Category Analysis — Match / Completeness / Confidence per category (spec Sections 6-7) */}
            <div className="panel-premium p-5">
              <h3 className="font-semibold text-gray-800 mb-1">Category Analysis</h3>
              <p className="text-xs text-gray-400 mb-4">Match = how well you fit the job. Completeness = how much data you provided. Missing data is never scored as zero.</p>
              <div className="grid md:grid-cols-2 gap-4">
                {CATEGORY_ORDER.filter((k) => result.ats.category_analysis[k]).map((k) => {
                  const c = result.ats.category_analysis[k]
                  return (
                    <div key={k} className={`rounded-xl border p-4 ${c.applicable ? 'border-gray-100' : 'border-dashed border-gray-200 bg-gray-50/50'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-gray-800 text-sm">{c.label}</p>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${CONFIDENCE_STYLE[c.confidence]}`}>{c.confidence}</span>
                      </div>
                      {!c.applicable ? (
                        <p className="text-xs text-gray-400 italic mb-2">Not evaluated — the job description didn't provide enough to judge this category. Its weight was redistributed, not scored as zero.</p>
                      ) : (
                        <div className="flex gap-4 mb-2 text-xs">
                          <span className="text-gray-500">Match: <b className="text-gray-800">{c.match === null ? 'N/A' : `${Math.round(c.match)}%`}</b></span>
                          <span className="text-gray-500">Completeness: <b className="text-gray-800">{Math.round(c.completeness)}%</b></span>
                          <span className="text-gray-500">Weight: <b className="text-gray-800">{c.weight}%</b></span>
                        </div>
                      )}
                      <p className="text-xs text-gray-600 leading-relaxed">{c.reason}</p>
                      {c.matched_evidence.length > 0 && (
                        <div className="mt-2"><PillList items={c.matched_evidence} tone="found" /></div>
                      )}
                      {c.missing_evidence.length > 0 && (
                        <div className="mt-1.5"><PillList items={c.missing_evidence} tone="missing" /></div>
                      )}
                    </div>
                  )
                })}
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

            {/* Keyword Analysis — Critical / Important / Optional (spec Section 8) */}
            <div className="panel-premium p-5">
              <h3 className="font-semibold text-gray-800 mb-1">Keyword Analysis</h3>
              <p className="text-xs text-gray-400 mb-4">Critical keywords are required by the job; important are preferred; optional are mentioned but not asked for. We never recommend a keyword you have no evidence for.</p>
              <div className="grid md:grid-cols-3 gap-5">
                {([
                  ['critical', 'Critical', 'text-red-600'],
                  ['important', 'Important', 'text-amber-600'],
                  ['optional', 'Optional', 'text-gray-500'],
                ] as const).map(([key, label, cls]) => {
                  const g = result.ats.keyword_analysis[key]
                  return (
                    <div key={key}>
                      <p className={`text-xs font-semibold mb-2 ${cls}`}>{label}</p>
                      <p className="text-[11px] text-green-700 mb-1">✓ Matched ({g.matched.length})</p>
                      <PillList items={g.matched} tone="found" />
                      <p className="text-[11px] text-red-600 mt-2.5 mb-1">✗ Missing ({g.missing.length})</p>
                      <PillList items={g.missing} tone="missing" />
                    </div>
                  )
                })}
              </div>
              {result.ats.keyword_analysis.overused.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-amber-700 mb-1.5">⚠️ Potentially overused</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.ats.keyword_analysis.overused.map((o) => (
                      <span key={o.term} title={o.reason} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">{o.term} ×{o.count}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Skills Breakdown — Matched / Partially Matched / Missing (spec Section 9) */}
            <div className="panel-premium p-5">
              <h3 className="font-semibold text-gray-800 mb-1">Skills Breakdown</h3>
              <p className="text-xs text-gray-400 mb-4">A related skill (e.g. JavaScript) is never claimed as equivalent to a different one the job asks for (e.g. TypeScript) — it's shown as a partial match instead.</p>
              <div className="grid md:grid-cols-3 gap-5">
                <div>
                  <p className="text-[11px] text-green-700 mb-1">✓ Matched ({result.ats.skills_breakdown.matched.length})</p>
                  <PillList items={result.ats.skills_breakdown.matched} tone="found" />
                </div>
                <div>
                  <p className="text-[11px] text-amber-600 mb-1">≈ Partially matched ({result.ats.skills_breakdown.partial.length})</p>
                  <div className="space-y-1.5">
                    {result.ats.skills_breakdown.partial.map((p, i) => (
                      <div key={i} title={p.note} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        <b>{p.jd_skill}</b> ← related to your <b>{p.resume_skill}</b>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-red-600 mb-1">✗ Missing ({result.ats.skills_breakdown.missing.length})</p>
                  <PillList items={result.ats.skills_breakdown.missing} tone="missing" />
                </div>
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

            {/* Prioritized Recommendations — HIGH / MEDIUM / LOW (spec Section 16) */}
            {(result.ats.recommendations_prioritized.high.length + result.ats.recommendations_prioritized.medium.length + result.ats.recommendations_prioritized.low.length) > 0 && (
              <div className="panel-premium p-5">
                <h3 className="font-semibold text-gray-800 mb-4">Prioritized Recommendations</h3>
                <div className="space-y-3">
                  {(['high', 'medium', 'low'] as const).flatMap((tier) =>
                    result.ats.recommendations_prioritized[tier].map((r, i) => (
                      <div key={`${tier}-${i}`} className="rounded-xl border border-gray-100 p-3.5">
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <p className="text-sm font-medium text-gray-800">{r.issue}</p>
                          <span className={`shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                            tier === 'high' ? 'bg-red-50 text-red-600' : tier === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                          }`}>{tier}</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-1"><b>Why it matters:</b> {r.why}</p>
                        <p className="text-xs text-gray-700 mb-1"><b>Suggested action:</b> {r.action}</p>
                        <p className="text-[11px] text-gray-400"><b>Expected impact:</b> {r.impact}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* AI Questions — evidence-grounded, never inventing answers (spec Section 17) */}
            {result.ats.candidate_questions.length > 0 && (
              <div className="panel-premium p-5">
                <h3 className="font-semibold text-gray-800 mb-1">Questions to Strengthen Your Profile</h3>
                <p className="text-xs text-gray-400 mb-4">Answering these adds real detail to your resume — nothing is assumed or invented on your behalf.</p>
                <ul className="space-y-2">
                  {result.ats.candidate_questions.map((q, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-gray-700 bg-royal-50/40 rounded-xl px-3.5 py-2.5">
                      <span className="text-royal-500">❓</span>{q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* resume tailoring */}
            <div className="panel-premium p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">Tailor My Resume For This Job</h3>
                <button onClick={tailorResume} disabled={!canTailor}
                  className="btn-secondary text-xs !min-h-0 px-4 py-2">
                  {tailoring ? 'Generating…' : '✨ Generate Tailored Resume'}
                </button>
              </div>
              {!canTailor && !tailoring && (
                <p className="text-[11px] text-gray-400 -mt-2 mb-3">Paste a full job description above to generate a tailored resume.</p>
              )}

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

            {/* ATS History — spec Section 20 */}
            {history && history.reports.length > 0 && (
              <div className="panel-premium p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-800">ATS History for this resume</h3>
                  {history.trend && (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${history.trend.improvement > 0 ? 'bg-green-50 text-green-700 border-green-200' : history.trend.improvement < 0 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {history.trend.improvement > 0 ? '▲' : history.trend.improvement < 0 ? '▼' : '＝'} {history.trend.improvement > 0 ? '+' : ''}{history.trend.improvement} since first scan ({history.trend.first_score} → {history.trend.latest_score})
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {history.reports.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-2.5">
                      <div>
                        <p className="text-sm text-gray-800">
                          {r.job_title || r.target_role || 'Analysis'}
                          {r.analysis_mode === 'role_based' && <span className="text-xs text-gray-400"> · role-based</span>}
                        </p>
                        <p className="text-[11px] text-gray-400">{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.score_confidence && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${CONFIDENCE_STYLE[r.score_confidence]}`}>{r.score_confidence}</span>
                        )}
                        <span className="text-sm font-bold" style={{ color: gaugeColor(r.score) }}>{r.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {loadingHistory && !history && (
              <div className="panel-premium p-5 text-xs text-gray-400">Loading history…</div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
