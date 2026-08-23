'use client'

/**
 * AI ATS Checker.
 *
 * Phase G redesign: three independently-optional analysis modes, never
 * merged into one generic "ATS Score" —
 *
 *   1. Resume ATS Health — resume only, no role or JD required. The DEFAULT
 *      experience: upload/select a resume, click "Check My ATS Score", done.
 *   2. Role Readiness — optional. A role title is never treated as a real
 *      JD; if the role library only has skill data, that's said plainly.
 *   3. Job Match — optional. Requires a JD that clears a sufficiency gate
 *      (length + structured signal count) — a bare title like "java
 *      developer" is explicitly NOT scored, never shown as a misleading
 *      high percentage.
 *
 * All three are computed by POST /api/ats/v2/check (services/ats_engine/
 * mode_orchestrator.py) — a NEW, additive endpoint. Once Job Match is
 * sufficient and scored, "View Full Job Match Analysis" opens the existing,
 * UNCHANGED detailed JD-matching dashboard (category analysis, keyword
 * breakdown, recommendations, AI suggestions, tailoring, history) via the
 * pre-existing /api/ats/v2/analyze-resume / /analyze endpoints — nothing
 * about that functionality was removed, only made secondary to the simpler
 * primary flow above.
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

/* ── shared category shape — mirrors services/ats_engine's CategoryAnalysis.to_dict() ── */
interface ModeCategory {
  key: string; label: string; applicable: boolean
  match: number | null; completeness: number; confidence: 'high' | 'medium' | 'low'
  matched_evidence: string[]; missing_evidence: string[]; reason: string; weight: number
}
interface SupplementaryRow extends ModeCategory { contributes_to_score: boolean }

/* ── Phase G — POST /api/ats/v2/check response (mirrors routers/ats_engine.py) ── */
/* Phase H1 — Resume ATS Health is now two layers (ATS Compatibility / Resume
   Quality) blended 45/55, not one flat category list. See
   mode_orchestrator.resume_health_mode() and docs/ATS_ANALYSIS_MODES.md. */
interface ResumeHealthLayer {
  score: number | null
  categories: Record<string, ModeCategory>
  weights_used: Record<string, number>; excluded_categories: string[]
}
interface ResumeHealthPriority {
  category: string; label: string; layer: 'ats_compatibility' | 'resume_quality'
  score: number; issue: string; why: string; action: string
}
interface ResumeHealthResult {
  available: boolean; score: number | null
  layers: { ats_compatibility: ResumeHealthLayer; resume_quality: ResumeHealthLayer }
  layer_weights_used: Record<string, number>; excluded_layers: string[]
  supplementary: Record<string, SupplementaryRow>
  priorities: ResumeHealthPriority[]
}
interface RoleReadinessResult {
  available: boolean; role?: string | null
  data_sufficiency?: 'sufficient' | 'limited'
  score?: number | null
  categories?: Record<string, ModeCategory>
  message?: string | null
}
interface JdSufficiency {
  sufficient: boolean; text_length: number; signal_count: number
  signals_present: string[]; min_chars: number; min_signals: number
}
interface JobMatchResult {
  available: boolean; sufficient?: boolean
  score?: number | null
  categories?: Record<string, ModeCategory>
  message?: string | null
  sufficiency?: JdSufficiency
}
/* Phase H1 follow-up — additive fields for the editor handoff. Neither
   changes scoring: resume_id echoes the saved resume actually used (when
   one was); resume_content is the parsed paste/upload resume mapped into
   the Resume Builder's content shape, present ONLY when there was no
   resume_id (see routers/ats_engine.py's check_modes()). */
interface BuilderExperience { position: string; company: string; startDate: string; endDate: string; current: boolean; bullets: string[] }
interface BuilderEducation { degree: string; field: string; institution: string; endDate: string }
interface BuilderSkill { name: string; level: number }
interface BuilderProject { name: string; technologies: string; description: string }
interface BuilderCertification { name: string; issuer: string }
interface BuilderContent {
  personalInfo: { fullName: string; jobTitle: string; email: string; phone: string; location: string }
  summary: string
  experience: BuilderExperience[]; education: BuilderEducation[]; skills: BuilderSkill[]
  projects: BuilderProject[]; certifications: BuilderCertification[]
  languages: { name: string; proficiency: string }[]; achievements: string[]; interests: string[]
}
interface CheckModesResponse {
  resume_health: ResumeHealthResult
  role_readiness: RoleReadinessResult
  job_match: JobMatchResult
  scoring_engine_version: string
  report_id: string | null
  resume_id: string | null
  resume_content: BuilderContent | null
}
interface RoleOption {
  slug: string; canonical_title: string; industry: string | null
  top_skills: string[]; demand_count?: number
}

interface SavedResume {
  id: string; title: string; ats_score?: number | null; updated_at?: string
  content: { personalInfo?: { jobTitle?: string } }
}

/* ── legacy detailed-analysis types (UNCHANGED — mirror backend/routers/ats_engine.py's
   /analyze and /analyze-resume, still the canonical JD-matching dashboard) ── */
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
  category_analysis: Record<CategoryKey, ModeCategory>
  weights_used: Record<string, number>
  excluded_categories: string[]
  keyword_analysis: KeywordAnalysis
  skills_breakdown: SkillsBreakdown
  profile_completeness: ProfileCompleteness
  recommendations_prioritized: Recommendations
  candidate_questions: string[]
  scores: Record<
    'keyword_match' | 'skills_match' | 'experience_match' | 'education_match' | 'industry_match' |
    'formatting_score' | 'readability_score' | 'recruiter_readiness' | 'technologies_match' | 'certifications_match',
    ScorePct
  >
  interview_probability: ScorePct
  hiring_probability: ScorePct
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
  // ATS consolidation Phase 6: null for the legacy /analyze-resume engine,
  // "resume_health" for /check and /analyze-editor — never treat a report
  // of one score_type as a "before"/"after" of a report with a different
  // one (or a different nullness) — see loadCategoryDeltas below.
  score_type: string | null
}
interface HistoryResponse {
  reports: ReportSummary[]
  trend: { first_score: number; latest_score: number; improvement: number } | null
}
interface ReportDetail {
  id: string; category_scores: Record<string, ModeCategory> | null
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
// Phase H1 — display order within each Resume ATS Health layer. "contact"
// and the 10 resume_quality.py categories are all real, scored categories
// now (not supplementary) — career_progression is intentionally omitted
// here since it's N/A for most fresher resumes (fewer than 2 roles) and,
// when inapplicable, simply won't be in the response's categories at all.
const ATS_COMPATIBILITY_ORDER = ['parsing', 'sections', 'formatting', 'contact']
const RESUME_QUALITY_ORDER = [
  'bullet_quality', 'quantified_impact', 'action_verbs', 'skill_evidence', 'summary_quality',
  'readability', 'seniority', 'repetition', 'credibility', 'recruiter_readiness', 'career_progression',
]

/** Small helper card for a mode's category rows — reused by all three modes. */
function ModeScoreRow({ cat }: { cat: ModeCategory | SupplementaryRow }) {
  return (
    <div className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-600">{cat.label}</span>
      {cat.applicable && cat.match !== null ? (
        <span className="font-semibold text-gray-800">{Math.round(cat.match)}%</span>
      ) : (
        <span className="text-gray-400 italic">N/A</span>
      )}
    </div>
  )
}

export default function AtsCheckerPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ── Step 1: resume input (unchanged three-way picker) ─────────────── */
  const [resumeMode, setResumeMode] = useState<'select' | 'upload' | 'paste'>('select')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeText, setResumeText] = useState('')
  const [savedResumes, setSavedResumes] = useState<SavedResume[]>([])
  const [loadingResumes, setLoadingResumes] = useState(true)
  const [selectedResumeId, setSelectedResumeId] = useState('')

  /* ── Mode 1 — Resume ATS Health (the default, JD-free experience) ──── */
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState('')
  const [checkResult, setCheckResult] = useState<CheckModesResponse | null>(null)

  /* ── Mode 2 — Role Readiness (optional) ─────────────────────────────── */
  const [showRolePanel, setShowRolePanel] = useState(false)
  const [roleQuery, setRoleQuery] = useState('')
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
  const [roleSearching, setRoleSearching] = useState(false)
  const [roleSearchError, setRoleSearchError] = useState('')
  const [selectedRole, setSelectedRole] = useState<RoleOption | null>(null)
  const [roleChecking, setRoleChecking] = useState(false)
  const [creatingResume, setCreatingResume] = useState(false)
  const latestRoleQueryRef = useRef('')

  /* ── Mode 3 — Job Match (optional) ──────────────────────────────────── */
  const [showJobPanel, setShowJobPanel] = useState(false)
  const [jobDescription, setJobDescription] = useState('')
  const [jobChecking, setJobChecking] = useState(false)

  /* ── secondary, opt-in: the existing detailed JD-matching dashboard ─── */
  const [showFullAnalysis, setShowFullAnalysis] = useState(false)
  const [fullAnalyzing, setFullAnalyzing] = useState(false)
  const [fullError, setFullError] = useState('')
  const [fullResult, setFullResult] = useState<AnalyzeResponse | null>(null)
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

  // Role search — debounced, forgiving (backend already token-matches).
  // Races against a client-side timeout so a slow/unresponsive backend
  // never leaves the UI stuck on "Searching…" forever with no feedback —
  // that silent-hang state is what made a real bug (Phase H1 follow-up)
  // look like "the button does nothing" during investigation.
  //
  // latestRoleQueryRef guards against a second, out-of-order-response race
  // (found during that same phase's live acceptance test): the panel's own
  // open-with-empty-query effect run and a just-typed "Java Developer" run
  // can both have in-flight requests at once, and under real backend load
  // nothing guaranteed they resolve in the order they were sent — if the
  // earlier (empty-query, "popular roles") response happened to land after
  // the later, correct one, it silently overwrote it and the dropdown
  // showed unrelated roles for the query actually on screen. Only the
  // response for the MOST RECENTLY fired query is now applied.
  useEffect(() => {
    if (!showRolePanel) return
    const handle = setTimeout(() => {
      const queryAtFire = roleQuery
      latestRoleQueryRef.current = queryAtFire
      setRoleSearching(true); setRoleSearchError('')
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Role search timed out — please try again.')), 8000))
      Promise.race([api.get<{ roles: RoleOption[] }>(`/api/roles?search=${encodeURIComponent(queryAtFire)}&limit=8`), timeout])
        .then((r) => { if (latestRoleQueryRef.current === queryAtFire) setRoleOptions(r.roles) })
        .catch((e) => {
          if (latestRoleQueryRef.current !== queryAtFire) return
          setRoleOptions([]); setRoleSearchError(e instanceof Error ? e.message : 'Could not search roles.')
        })
        .finally(() => { if (latestRoleQueryRef.current === queryAtFire) setRoleSearching(false) })
    }, 300)
    return () => clearTimeout(handle)
  }, [roleQuery, showRolePanel])

  const usingSavedResume = resumeMode === 'select'
  const resumeReady = usingSavedResume ? !!selectedResumeId : resumeMode === 'upload' ? !!resumeFile : !!resumeText.trim()
  const canCheck = !checking && resumeReady

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

  const resolveResumeText = async (): Promise<string> => {
    if (usingSavedResume) return ''
    if (resumeMode === 'upload' && resumeFile) return uploadAndExtract(resumeFile)
    return resumeText
  }

  /** The single call behind all three modes — POST /api/ats/v2/check.
   * Each mode's slice is only OVERWRITTEN when that mode was actually part
   * of this call, so checking a role doesn't clobber an already-fetched Job
   * Match result (and vice versa) — the three stay genuinely independent.
   *
   * `roleOverride` exists because of a real bug (Phase H1 follow-up):
   * pickRole() used to call setSelectedRole(role) and then immediately
   * runCheck({includeRole:true}) in the same tick — but React state
   * updates aren't synchronous, so runCheck's own closure still read the
   * PREVIOUS `selectedRole` (null on first use), silently omitting
   * target_role from the request. The backend correctly returned
   * role_readiness:{available:false} for a request with no role, so
   * nothing rendered — indistinguishable from "the button does nothing."
   * Passing the just-picked role straight through as an argument avoids
   * the stale-closure read entirely. */
  const runCheck = async (opts: { includeRole?: boolean; includeJob?: boolean; roleOverride?: RoleOption }) => {
    const payload: Record<string, unknown> = {}
    if (usingSavedResume) {
      payload.resume_id = selectedResumeId
    } else {
      const text = await resolveResumeText()
      if (!text.trim()) throw new Error('No resume text found')
      payload.resume_text = text
    }
    const role = opts.roleOverride ?? selectedRole
    if (opts.includeRole && role) payload.target_role = role.slug
    if (opts.includeJob && jobDescription.trim()) payload.job_description = jobDescription

    const r = await api.post<CheckModesResponse>('/api/ats/v2/check', payload)
    setCheckResult((prev) => ({
      ...r,
      role_readiness: opts.includeRole ? r.role_readiness : (prev?.role_readiness ?? r.role_readiness),
      job_match: opts.includeJob ? r.job_match : (prev?.job_match ?? r.job_match),
    }))
    return r
  }

  const checkResumeHealth = async () => {
    setCheckError(''); setChecking(true)
    setShowFullAnalysis(false); setFullResult(null)
    try {
      await runCheck({})
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Could not check your resume')
    } finally {
      setChecking(false)
    }
  }

  /** "Improve My Resume" — was routing anyone who checked a pasted/uploaded
   * resume to a BLANK /resumes/new (Phase H1 follow-up bug: CASE A, saved
   * resumes, already worked correctly; CASE B/C, upload/paste, had no
   * persistence step at all before navigating, so the parsed data was
   * simply lost).
   *
   * CASE A (saved resume): nothing to create — go straight to its own
   * editor, exactly as before.
   * CASE B/C (upload/paste): checkResult.resume_content is the SAME
   * already-parsed resume /check just scored, mapped into the Resume
   * Builder's content shape server-side (resume_parser.to_content() —
   * no re-parsing, no invented fields). Persisted via the EXISTING
   * POST /api/resumes/ endpoint (the same one Tailor/Save-As-New already
   * uses elsewhere on this page) to get a real resume_id, then the editor
   * opens with that data already there — never a blank form.
   *
   * Preserves light ATS context in the URL (source + role, never the full
   * resume JSON) so the editor can show "this came from ATS analysis" and,
   * where a role was selected, name it — see resumes/[id]/edit/page.tsx.
   *
   * The button calling this is also disabled while checking/roleChecking/
   * jobChecking are true (see JSX below), not just creatingResume: an
   * in-flight role/job check still resolves into the SAME checkResult
   * state this function reads, and letting a click land mid-flight
   * invited a real race between that resolution and this read — observed
   * once during heavy concurrent load in the phase's live acceptance
   * test (not reproduced in two dedicated, isolated repro attempts
   * afterward, but cheap and unambiguously correct to guard against
   * regardless of how rare it is). */
  const improveMyResume = async () => {
    const params = new URLSearchParams({ from: 'ats-checker' })
    if (selectedRole) { params.set('role', selectedRole.slug); params.set('roleTitle', selectedRole.canonical_title) }
    if (checkResult?.report_id) params.set('report_id', checkResult.report_id)

    if (usingSavedResume && selectedResumeId) {
      router.push(`/resumes/${selectedResumeId}/edit?${params.toString()}`)
      return
    }

    if (!checkResult?.resume_content) {
      setCheckError('Run "Check My ATS Score" first so there is resume data to save.')
      return
    }
    setCreatingResume(true); setCheckError('')
    try {
      const c = checkResult.resume_content
      const title = c.personalInfo.fullName
        ? `${c.personalInfo.fullName}${c.personalInfo.jobTitle ? ' — ' + c.personalInfo.jobTitle : ''}`
        : 'My Resume'
      const content = {
        personalInfo: c.personalInfo, summary: c.summary,
        experience: c.experience.map((e, i) => ({ id: `exp${i}`, position: e.position, company: e.company, location: '', startDate: e.startDate, endDate: e.endDate, current: e.current, bullets: e.bullets })),
        education: c.education.map((e, i) => ({ id: `edu${i}`, degree: e.degree, field: e.field, institution: e.institution, location: '', startDate: '', endDate: e.endDate, gpa: '' })),
        skills: c.skills,
        projects: c.projects.map((p, i) => ({ id: `proj${i}`, name: p.name, technologies: p.technologies, description: p.description })),
        certifications: c.certifications.map((cert, i) => ({ id: `cert${i}`, name: cert.name, issuer: cert.issuer, date: '' })),
        languages: c.languages, achievements: c.achievements, interests: c.interests,
      }
      const r = await api.post<{ id: string }>('/api/resumes/', {
        title, template_id: 'modern', content, source: 'ats_checker',
      })
      router.push(`/resumes/${r.id}/edit?${params.toString()}`)
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Could not save your resume')
    } finally {
      setCreatingResume(false)
    }
  }

  const pickRole = async (role: RoleOption) => {
    setSelectedRole(role); setRoleOptions([]); setRoleQuery(role.canonical_title)
    setRoleChecking(true); setCheckError('')
    try {
      await runCheck({ includeRole: true, roleOverride: role })
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Could not check role readiness')
    } finally {
      setRoleChecking(false)
    }
  }

  const analyzeJobMatch = async () => {
    if (!jobDescription.trim()) return
    setJobChecking(true); setCheckError('')
    setShowFullAnalysis(false); setFullResult(null)
    try {
      await runCheck({ includeJob: true })
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Could not check job match')
    } finally {
      setJobChecking(false)
    }
  }

  /* ── secondary: the existing, unchanged detailed JD-matching dashboard ── */

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

  const loadCategoryDeltas = async (resumeId: string, current: AnalyzeResponse) => {
    setCategoryDeltas(null)
    try {
      const h = await api.get<HistoryResponse>(`/api/ats/v2/history/${resumeId}`)
      setHistory(h)
      // ATS consolidation Phase 6: this report came from the legacy
      // /analyze-resume engine (score_type null) — only ever diff it
      // against ANOTHER null-score_type report, never a canonical /check or
      // /analyze-editor ("resume_health") one, so "what changed" never
      // silently compares two different scoring engines.
      const prevSummary = h.reports.find((rep) => rep.id !== current.report_id && rep.score_type === null)
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

  const runFullAnalysis = async () => {
    setFullError(''); setFullResult(null); setTailored(null); setFullAnalyzing(true); setCategoryDeltas(null)
    try {
      if (usingSavedResume) {
        const r = await api.post<AnalyzeResponse>('/api/ats/v2/analyze-resume', {
          resume_id: selectedResumeId, job_description: jobDescription,
        })
        setFullResult(r)
        if (typeof r.score_delta === 'number') loadCategoryDeltas(selectedResumeId, r)
        else loadHistory(selectedResumeId)
      } else {
        const text = await resolveResumeText()
        if (!text.trim()) throw new Error('No resume text found')
        const r = await api.post<AnalyzeResponse>('/api/ats/v2/analyze', {
          resume_text: text, job_description: jobDescription,
        })
        setFullResult(r)
      }
      setShowFullAnalysis(true)
    } catch (e) {
      setFullError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setFullAnalyzing(false)
    }
  }

  const canTailor = !!fullResult && !!jobDescription.trim() && !tailoring

  const tailorResume = async () => {
    if (!fullResult) return
    setTailoring(true); setFullError('')
    try {
      const text = usingSavedResume ? (fullResult.resume.raw_text || '') : await resolveResumeText()
      if (!text.trim()) throw new Error('No resume text available to tailor')
      const r = await api.post<{ original: ParsedResume; tailored: TailoredContent }>('/api/ats/v2/tailor', {
        resume_text: text, job_description: jobDescription,
      })
      setTailored(r.tailored)
    } catch (e) {
      setFullError(e instanceof Error ? e.message : 'Could not generate a tailored resume')
    } finally {
      setTailoring(false)
    }
  }

  const saveTailored = async () => {
    if (!tailored) return
    setSaving(true); setFullError('')
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
      setFullError(e instanceof Error ? e.message : 'Could not save resume')
    } finally {
      setSaving(false)
    }
  }

  const topBar = (
    <>
      <div className="flex-1">
        <h1 className="text-sm font-semibold text-gray-800">AI ATS Checker</h1>
        <p className="text-xs text-gray-500">Check your resume&apos;s ATS readiness — no job description required. Add a target role or a full JD any time for a deeper match.</p>
      </div>
    </>
  )

  const health = checkResult?.resume_health
  const role = checkResult?.role_readiness
  const jobMatch = checkResult?.job_match

  return (
    <AppShell topBar={topBar}>
      <div className="p-6 max-w-5xl mx-auto">
        {checkError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{checkError}</div>
        )}

        {/* ── Step 1: resume only — no role/JD required to proceed ────────── */}
        <div className="panel-premium p-5 mb-4">
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
              <div className="h-40 rounded-xl bg-gray-100 shimmer" />
            ) : savedResumes.length === 0 ? (
              <div className="h-40 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3 text-center px-6">
                <span className="text-2xl">📄</span>
                <p className="text-sm text-gray-600">Create or upload a resume first</p>
                <div className="flex gap-2">
                  <button onClick={() => router.push('/resumes/choose')} className="btn-primary text-xs !min-h-0 px-4 py-2">Create Resume</button>
                  <button onClick={() => router.push('/ai-upgrade')} className="btn-secondary text-xs !min-h-0 px-4 py-2">Upload Resume</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {savedResumes.map((r) => (
                  <button key={r.id} onClick={() => { setSelectedResumeId(r.id); setCheckResult(null) }}
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
              className="border-2 border-dashed border-gray-200 rounded-xl h-40 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-royal-300 hover:bg-royal-50/30 transition"
            >
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden"
                onChange={(e) => setResumeFile(e.target.files?.[0] || null)} />
              <span className="text-2xl">📄</span>
              {resumeFile ? (
                <p className="text-sm font-medium text-gray-800">Resume loaded: {resumeFile.name}</p>
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
              placeholder="Paste your resume text here..." rows={7}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300 resize-none" />
          )}
        </div>

        {/* ── Primary CTA — Mode 1, no role or JD needed ──────────────────── */}
        <button onClick={checkResumeHealth} disabled={!canCheck}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2 mb-6">
          {checking ? <><span className="animate-spin">⟳</span> Checking your resume…</> : <><span>✨</span> Check My ATS Score</>}
        </button>

        {health?.available && (
          <div className="space-y-5">
            {/* ── Resume ATS Health — Phase H1: two explainable layers, never
                just one bare number ─────────────────────────────────────── */}
            <div className="panel-premium p-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-5">
                <div className="flex flex-col items-center shrink-0">
                  <CircularScore score={health.score ?? 0} size={120} color={gaugeColor(health.score ?? 0)} />
                  <p className="font-bold mt-2 text-sm" style={{ color: gaugeColor(health.score ?? 0) }}>Resume ATS Health</p>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-600">
                    A blend of two independent layers — whether an ATS can correctly read this resume, and how strong its actual content is. Computed from your resume alone, no job or role needed.
                  </p>
                  {health.excluded_layers.length > 0 && (
                    <p className="text-[11px] text-amber-600 mt-1.5">
                      {health.excluded_layers.map((k) => k === 'ats_compatibility' ? 'ATS Compatibility' : 'Resume Quality').join(', ')} could not be computed for this resume — weight redistributed, not scored as zero.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-gray-800 text-sm">ATS Compatibility</p>
                    <span className="text-lg font-bold" style={{ color: gaugeColor(health.layers.ats_compatibility.score ?? 0) }}>
                      {health.layers.ats_compatibility.score ?? '—'}<span className="text-xs text-gray-400 font-normal">/100</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-2">Can an ATS correctly read and interpret this resume?</p>
                  {ATS_COMPATIBILITY_ORDER.filter((k) => health.layers.ats_compatibility.categories[k]).map((k) => (
                    <ModeScoreRow key={k} cat={health.layers.ats_compatibility.categories[k]} />
                  ))}
                </div>

                <div className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-gray-800 text-sm">Resume Quality</p>
                    <span className="text-lg font-bold" style={{ color: gaugeColor(health.layers.resume_quality.score ?? 0) }}>
                      {health.layers.resume_quality.score ?? '—'}<span className="text-xs text-gray-400 font-normal">/100</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mb-2">How strong is the actual content — evidence, impact, clarity?</p>
                  {RESUME_QUALITY_ORDER.filter((k) => health.layers.resume_quality.categories[k]).map((k) => (
                    <ModeScoreRow key={k} cat={health.layers.resume_quality.categories[k]} />
                  ))}
                </div>
              </div>

              {health.supplementary.completeness && (
                <p className="text-[11px] text-gray-400 mt-3">
                  Profile Completeness: {health.supplementary.completeness.match}% — a separate signal (how much of your profile is filled in), not part of this score.
                </p>
              )}

              <button onClick={improveMyResume} disabled={creatingResume || checking || roleChecking || jobChecking}
                title={roleChecking || jobChecking ? 'Wait for the current check to finish first' : undefined}
                className="btn-secondary text-xs !min-h-0 px-4 py-2 mt-4">
                {creatingResume ? 'Opening editor…' : 'Improve My Resume'}
              </button>
            </div>

            {/* ── How to improve — the weakest few, not every minor issue ──── */}
            {health.priorities.length > 0 && (
              <div className="panel-premium p-5">
                <h3 className="font-semibold text-gray-800 mb-1">How to Improve</h3>
                <p className="text-xs text-gray-400 mb-4">The highest-value fixes, worst first — not an exhaustive list.</p>
                <ol className="space-y-2">
                  {health.priorities.map((p, i) => (
                    <li key={p.category} className="flex gap-3 rounded-xl border border-gray-100 px-3.5 py-2.5">
                      <span className="text-sm font-bold text-royal-500 shrink-0">{i + 1}.</span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{p.issue}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{p.action}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* ── Want a more targeted analysis? ───────────────────────────── */}
            <div className="panel-premium p-5">
              <p className="text-sm font-semibold text-gray-800 mb-1">Want a more targeted analysis?</p>
              <p className="text-xs text-gray-400 mb-3">Both optional — pick either, both, or neither.</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setShowRolePanel((v) => !v)}
                  className={`text-xs font-medium px-4 py-2 rounded-lg border ${showRolePanel ? 'bg-navy-600 text-white border-navy-600' : 'bg-white text-gray-700 border-gray-200 hover:border-royal-300'}`}>
                  🎯 Target a Role
                </button>
                <button onClick={() => setShowJobPanel((v) => !v)}
                  className={`text-xs font-medium px-4 py-2 rounded-lg border ${showJobPanel ? 'bg-navy-600 text-white border-navy-600' : 'bg-white text-gray-700 border-gray-200 hover:border-royal-300'}`}>
                  💼 Match a Specific Job
                </button>
              </div>

              {/* Mode 2 — Role Readiness */}
              {showRolePanel && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Target Role</p>
                  <div className="relative max-w-sm">
                    <input value={roleQuery} onChange={(e) => { setRoleQuery(e.target.value); setSelectedRole(null) }}
                      placeholder="e.g. Java Developer"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
                    {roleQuery && !selectedRole && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                        {roleSearching ? (
                          <p className="text-xs text-gray-400 px-4 py-3">Searching…</p>
                        ) : roleSearchError ? (
                          <p className="text-xs text-red-600 px-4 py-3">{roleSearchError}</p>
                        ) : roleOptions.length === 0 ? (
                          <p className="text-xs text-gray-400 px-4 py-3">No matching roles found.</p>
                        ) : (
                          roleOptions.map((r) => (
                            <button key={r.slug} onClick={() => pickRole(r)}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-royal-50/50 border-b border-gray-50 last:border-0">
                              <span className="font-medium text-gray-800">{r.canonical_title}</span>
                              {r.industry && <span className="text-xs text-gray-400"> · {r.industry}</span>}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {roleChecking && <p className="text-xs text-gray-400 mt-3">Checking role readiness…</p>}

                  {role?.available && !roleChecking && (
                    <div className="mt-4 rounded-xl border border-gray-100 p-4">
                      {role.score !== null && role.score !== undefined ? (
                        <div className="flex items-center gap-4">
                          <CircularScore score={role.score} size={80} color={gaugeColor(role.score)} />
                          <div>
                            <p className="font-bold text-sm" style={{ color: gaugeColor(role.score) }}>Role Readiness</p>
                            <p className="text-xs text-gray-500">{role.role}</p>
                            {role.data_sufficiency === 'limited' && role.message && (
                              <p className="text-[11px] text-amber-600 mt-1">{role.message}</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="font-bold text-sm text-gray-700">Role Readiness</p>
                          <p className="text-xs text-gray-500 mb-1">{role.role}</p>
                          <p className="text-sm text-amber-600 font-medium">Limited role information</p>
                          <p className="text-xs text-gray-500 mt-1">{role.message}</p>
                        </div>
                      )}
                      {role.categories && Object.keys(role.categories).length > 0 && (
                        <div className="grid grid-cols-2 gap-x-6 mt-3 pt-3 border-t border-gray-50">
                          {Object.values(role.categories).map((c) => <ModeScoreRow key={c.key} cat={c} />)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Mode 3 — Job Match */}
              {showJobPanel && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Job Description</p>
                  <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste the full job description here — responsibilities, required skills, and qualifications." rows={7}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300 resize-none" />
                  <button onClick={analyzeJobMatch} disabled={jobChecking || !jobDescription.trim()}
                    className="btn-primary text-xs !min-h-0 px-4 py-2 mt-2">
                    {jobChecking ? 'Analyzing…' : 'Analyze Job Match'}
                  </button>

                  {jobMatch?.available && (
                    <div className="mt-4 rounded-xl border border-gray-100 p-4">
                      {jobMatch.sufficient && jobMatch.score !== null && jobMatch.score !== undefined ? (
                        <>
                          <div className="flex items-center gap-4 mb-3">
                            <CircularScore score={jobMatch.score} size={80} color={gaugeColor(jobMatch.score)} />
                            <div>
                              <p className="font-bold text-sm" style={{ color: gaugeColor(jobMatch.score) }}>Job Match</p>
                              <p className="text-xs text-gray-500">Matched against the specific job description.</p>
                            </div>
                          </div>
                          {jobMatch.categories && (
                            <div className="grid grid-cols-2 gap-x-6 mb-3">
                              {Object.values(jobMatch.categories).map((c) => <ModeScoreRow key={c.key} cat={c} />)}
                            </div>
                          )}
                          <button onClick={runFullAnalysis} disabled={fullAnalyzing}
                            className="btn-secondary text-xs !min-h-0 px-4 py-2">
                            {fullAnalyzing ? 'Loading…' : 'View Full Job Match Analysis'}
                          </button>
                        </>
                      ) : (
                        <div>
                          <p className="font-bold text-sm text-gray-700">Job Match</p>
                          <p className="text-sm text-amber-600 font-medium mt-1">Insufficient job description</p>
                          <p className="text-xs text-gray-500 mt-1">{jobMatch.message}</p>
                          {jobMatch.sufficiency && (
                            <p className="text-[11px] text-gray-400 mt-2">
                              Needs at least {jobMatch.sufficiency.min_chars} characters and {jobMatch.sufficiency.min_signals} distinct
                              details (e.g. skills, responsibilities, experience/education requirements) — currently {jobMatch.sufficiency.text_length} characters
                              and {jobMatch.sufficiency.signal_count} detected.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {fullError && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{fullError}</div>
        )}

        {/* ── Secondary: the existing, unchanged detailed JD-matching dashboard ── */}
        {showFullAnalysis && fullResult && (
          <div className="space-y-6 mt-6">
            <div className="panel-premium p-4">
              <p className="text-sm font-semibold text-gray-800">Full Job Match Analysis</p>
              <p className="text-xs text-gray-400">Detailed keyword, skills, and category breakdown for this specific job description — the same JD-matching engine as before, now shown as an optional deep-dive.</p>
            </div>

            {typeof fullResult.score_delta === 'number' && (
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${fullResult.score_delta > 0 ? 'bg-green-50 text-green-700 border-green-200' : fullResult.score_delta < 0 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  {fullResult.score_delta > 0 ? '▲' : fullResult.score_delta < 0 ? '▼' : '＝'} {fullResult.score_delta > 0 ? '+' : ''}{fullResult.score_delta} vs. previous scan ({fullResult.previous_score})
                </span>
              </div>
            )}

            {typeof fullResult.score_delta === 'number' && categoryDeltas && categoryDeltas.length > 0 && (
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

            {/* Category Analysis — Match / Completeness / Confidence per category */}
            <div className="panel-premium p-5">
              <h3 className="font-semibold text-gray-800 mb-1">Category Analysis</h3>
              <p className="text-xs text-gray-400 mb-4">Match = how well you fit the job. Completeness = how much data you provided. Missing data is never scored as zero.</p>
              <div className="grid md:grid-cols-2 gap-4">
                {CATEGORY_ORDER.filter((k) => fullResult.ats.category_analysis[k]).map((k) => {
                  const c = fullResult.ats.category_analysis[k]
                  return (
                    <div key={k} className={`rounded-xl border p-4 ${c.applicable ? 'border-gray-100' : 'border-dashed border-gray-200 bg-gray-50/50'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-gray-800 text-sm">{c.label}</p>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${CONFIDENCE_STYLE[c.confidence]}`}>{c.confidence}</span>
                      </div>
                      {!c.applicable ? (
                        <p className="text-xs text-gray-400 italic mb-2">Not evaluated — the job description didn&apos;t provide enough to judge this category. Its weight was redistributed, not scored as zero.</p>
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

            {/* Profile Completeness — a SEPARATE metric from any of the three scores */}
            <div className="panel-premium p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-gray-800">Profile Completeness</h3>
                <span className="text-xs text-gray-400">Not part of any ATS score — measures how much of your profile is filled in</span>
              </div>
              <div className="flex items-center gap-4 mt-3 mb-4">
                <span className="text-3xl font-bold" style={{ color: gaugeColor(fullResult.ats.profile_completeness.overall) }}>
                  {fullResult.ats.profile_completeness.overall}%
                </span>
                <span className="text-sm text-gray-500">of your profile is filled in</span>
              </div>
              <div className="grid sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                {Object.entries(PROFILE_SECTION_LABELS).map(([k, label]) => {
                  const pct = (fullResult.ats.profile_completeness as unknown as Record<string, number>)[k]
                  return (
                    <div key={k} className="rounded-lg border border-gray-100 p-2.5 text-center">
                      <div className="text-lg font-bold" style={{ color: gaugeColor(pct) }}>{pct}%</div>
                      <div className="text-[11px] text-gray-500">{label}</div>
                    </div>
                  )
                })}
              </div>
              {fullResult.ats.profile_completeness.suggestions.length > 0 && (
                <ul className="space-y-1">
                  {fullResult.ats.profile_completeness.suggestions.map((s, i) => (
                    <li key={i} className="text-xs text-gray-600 flex gap-2"><span className="text-royal-400">•</span>{s}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Keyword Analysis — Critical / Important / Optional */}
            <div className="panel-premium p-5">
              <h3 className="font-semibold text-gray-800 mb-1">Keyword Analysis</h3>
              <p className="text-xs text-gray-400 mb-4">Critical keywords are required by the job; important are preferred; optional are mentioned but not asked for. We never recommend a keyword you have no evidence for.</p>
              <div className="grid md:grid-cols-3 gap-5">
                {([
                  ['critical', 'Critical', 'text-red-600'],
                  ['important', 'Important', 'text-amber-600'],
                  ['optional', 'Optional', 'text-gray-500'],
                ] as const).map(([key, label, cls]) => {
                  const g = fullResult.ats.keyword_analysis[key]
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
              {fullResult.ats.keyword_analysis.overused.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-amber-700 mb-1.5">⚠️ Potentially overused</p>
                  <div className="flex flex-wrap gap-1.5">
                    {fullResult.ats.keyword_analysis.overused.map((o) => (
                      <span key={o.term} title={o.reason} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">{o.term} ×{o.count}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Skills Breakdown — Matched / Partially Matched / Missing */}
            <div className="panel-premium p-5">
              <h3 className="font-semibold text-gray-800 mb-1">Skills Breakdown</h3>
              <p className="text-xs text-gray-400 mb-4">A related skill (e.g. JavaScript) is never claimed as equivalent to a different one the job asks for (e.g. TypeScript) — it&apos;s shown as a partial match instead.</p>
              <div className="grid md:grid-cols-3 gap-5">
                <div>
                  <p className="text-[11px] text-green-700 mb-1">✓ Matched ({fullResult.ats.skills_breakdown.matched.length})</p>
                  <PillList items={fullResult.ats.skills_breakdown.matched} tone="found" />
                </div>
                <div>
                  <p className="text-[11px] text-amber-600 mb-1">≈ Partially matched ({fullResult.ats.skills_breakdown.partial.length})</p>
                  <div className="space-y-1.5">
                    {fullResult.ats.skills_breakdown.partial.map((p, i) => (
                      <div key={i} title={p.note} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        <b>{p.jd_skill}</b> ← related to your <b>{p.resume_skill}</b>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-red-600 mb-1">✗ Missing ({fullResult.ats.skills_breakdown.missing.length})</p>
                  <PillList items={fullResult.ats.skills_breakdown.missing} tone="missing" />
                </div>
              </div>
            </div>

            {/* AI suggestions */}
            <div className="panel-premium p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">AI Suggestions</h3>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border ${fullResult.suggestions.generated_by === 'ai' ? 'bg-royal-50 text-navy-700 border-royal-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  {fullResult.suggestions.generated_by === 'ai' ? 'AI-generated' : fullResult.suggestions.generated_by === 'rules' ? 'Rule-based fallback (AI call unavailable)' : 'No suggestions available'}
                </span>
              </div>

              {fullResult.suggestions.summary_suggestion && (
                <div className="mb-4 bg-royal-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-navy-700 mb-1">Suggested summary rewrite</p>
                  <p className="text-sm text-gray-700">{fullResult.suggestions.summary_suggestion}</p>
                </div>
              )}

              {fullResult.suggestions.bullet_rewrites.length > 0 && (
                <div className="mb-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-700">Bullet rewrites</p>
                  {fullResult.suggestions.bullet_rewrites.map((r, i) => (
                    <div key={i} className="rounded-xl border border-gray-100 p-3">
                      <p className="text-xs text-red-500 line-through mb-1">{r.original}</p>
                      <p className="text-sm text-green-700 font-medium mb-1">→ {r.improved}</p>
                      <p className="text-[11px] text-gray-500">{r.reason}</p>
                    </div>
                  ))}
                </div>
              )}

              {fullResult.suggestions.weak_words_found.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">Weak words to reduce</p>
                  <div className="flex flex-wrap gap-1.5">
                    {fullResult.suggestions.weak_words_found.map((w) => (
                      <span key={w} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">{w}</span>
                    ))}
                  </div>
                </div>
              )}

              {fullResult.suggestions.missing_keyword_tips.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">Where missing keywords could fit</p>
                  <ul className="space-y-1">
                    {fullResult.suggestions.missing_keyword_tips.map((t, i) => (
                      <li key={i} className="text-xs text-gray-600 flex gap-2"><span className="text-royal-400">•</span>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {fullResult.suggestions.general_tips.length > 0 && (
                <div className="space-y-2">
                  {fullResult.suggestions.general_tips.map((t, i) => (
                    <div key={i} className="flex gap-3 bg-gray-50 rounded-xl p-3">
                      <span className="text-royal-500">💡</span>
                      <p className="text-xs text-gray-700 leading-relaxed">{t}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Prioritized Recommendations — HIGH / MEDIUM / LOW */}
            {(fullResult.ats.recommendations_prioritized.high.length + fullResult.ats.recommendations_prioritized.medium.length + fullResult.ats.recommendations_prioritized.low.length) > 0 && (
              <div className="panel-premium p-5">
                <h3 className="font-semibold text-gray-800 mb-4">Prioritized Recommendations</h3>
                <div className="space-y-3">
                  {(['high', 'medium', 'low'] as const).flatMap((tier) =>
                    fullResult.ats.recommendations_prioritized[tier].map((r, i) => (
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

            {/* AI Questions — evidence-grounded, never inventing answers */}
            {fullResult.ats.candidate_questions.length > 0 && (
              <div className="panel-premium p-5">
                <h3 className="font-semibold text-gray-800 mb-1">Questions to Strengthen Your Profile</h3>
                <p className="text-xs text-gray-400 mb-4">Answering these adds real detail to your resume — nothing is assumed or invented on your behalf.</p>
                <ul className="space-y-2">
                  {fullResult.ats.candidate_questions.map((q, i) => (
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

              {tailored && (
                <div>
                  <div className="grid md:grid-cols-2 gap-5 mb-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2">BEFORE (original)</p>
                      <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600 space-y-2 max-h-80 overflow-auto">
                        <p className="italic">{fullResult.resume.summary || 'No summary in original resume'}</p>
                        {fullResult.resume.experience.map((e, i) => (
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
                    <p className="text-[11px] text-gray-500 mb-3">AI tailoring wasn&apos;t available for this run — showing your original content, untailored.</p>
                  )}
                  <button onClick={saveTailored} disabled={saving}
                    className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save as New Resume →'}
                  </button>
                </div>
              )}
            </div>

            {/* ATS History */}
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
