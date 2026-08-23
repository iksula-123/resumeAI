'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'
import CircularScore from '@/components/CircularScore'
import ResumeTemplates, { TEMPLATE_LIST } from '@/components/ResumeTemplates'
import dynamic from 'next/dynamic'

// Version history is a rarely-opened drawer — load its code on demand.
const VersionHistory = dynamic(() => import('@/components/VersionHistory'), { ssr: false })
import type { Version } from '@/components/VersionHistory'
import { CATEGORY_NAMES, detectCategory, suggestSkills, popularForCategory } from '@/lib/skillsData'
import CareerAchievements, { type Achievement } from '@/components/resume-editors/CareerAchievements'
import ResumeJourney, { type JourneyEvent } from '@/components/resume-editors/ResumeJourney'
import ScoreTrendChart, { type ScorePoint } from '@/components/resume-editors/ScoreTrendChart'
// Skill/Experience/.../ResumeContent, uid(), emptyContent() and the section
// nav config now live in @/lib/resumeContent — shared with the
// Create-from-Scratch wizard (frontend/app/resumes/create/page.tsx) so both
// flows use one content shape, not two that could drift apart. The section
// editor components (PersonalInfoEditor, ExperienceEditor, ...) moved the
// same way, to components/resume-editors/SectionEditors.tsx.
import {
  type Skill, type Experience, type Education, type Project, type Certification,
  type Language, type CustomSection, type ResumeContent,
  RESUME_SECTIONS as SECTIONS, uid, emptyContent, computeCompletion,
} from '@/lib/resumeContent'
import {
  PersonalInfoEditor, ExperienceEditor, EducationEditor, SkillsEditor, ProjectsEditor,
  CertificationsEditor, LanguagesEditor, ListEditor, CustomSectionEditor,
} from '@/components/resume-editors/SectionEditors'
import ResumeProgress from '@/components/resume-editors/ResumeProgress'

/* ─── Types ───────────────────────────────────────────────────── */

interface FontMetadata { family: string; size: string }
interface LayoutMetadata { spacing: string }
interface Resume {
  id: string; title: string; template_id: string; content: ResumeContent; ats_score?: number
  font_metadata?: FontMetadata | null; layout_metadata?: LayoutMetadata | null
}

/* Phase C — mirrors backend/routers/ats_engine.py's POST /analyze-editor response */
interface AtsCategory { match: number | null; completeness: number; confidence: string; matched_evidence: string[]; missing_evidence: string[]; reason: string }
interface AtsRecommendation { issue: string; why: string; action: string; impact: string }
interface AtsEditorResponse {
  scores: { overall: number | null; ats_compatibility: number | null; job_match: number | null; resume_quality: number | null }
  categories: { ats_compatibility: Record<string, AtsCategory>; job_match: Record<string, AtsCategory>; resume_quality: Record<string, AtsCategory> }
  recommendations: { high: AtsRecommendation[]; medium: AtsRecommendation[]; low: AtsRecommendation[] }
  candidate_questions: string[]
  score_confidence: 'high' | 'medium' | 'low'
  report_id: string | null
  persisted_recommendations?: PersistedRec[]
}

/* Phase D — mirrors backend/routers/ats_engine.py's recommendation lifecycle
 * endpoints (POST /recommendations/{id}/answer|preview|apply|reject, GET
 * /resumes/{id}/recommendations, GET /resumes/{id}/change-history, POST
 * /change-history/{id}/undo). Minimal editor UI for the AI apply loop —
 * approve/reject/edit, before/after, score delta, undo (Phase D Part 22/25-28). */
interface PersistedRec {
  id: string; action_type: string; priority: 'high' | 'medium' | 'low'
  title: string; reason: string; affected_section: string
  score_impact_estimate: string
  requires_user_input: boolean; question: string | null
  evidence_tier: 'verified' | 'inferred' | 'suggested' | 'unknown'
  status: string
  proposed_content?: string | null
}
interface ChangeHistoryEntry {
  id: string; action_type: string; before_score: number | null; after_score: number | null
  score_delta: number | null; changed_metrics: any; changed_fields: any
  created_at: string | null; recommendation_id: string | null
}

/* Section nav config (SECTIONS) and section editor components (PersonalInfoEditor,
   ExperienceEditor, EducationEditor, SkillsEditor, ProjectsEditor, CertificationsEditor,
   LanguagesEditor, ListEditor, CustomSectionEditor) now live in @/lib/resumeContent and
   @/components/resume-editors/SectionEditors — imported above, shared with the
   Create-from-Scratch wizard. */

/* ─── Main page ───────────────────────────────────────────────── */
export default function EditResumePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, hasHydrated } = useAuthStore()

  // Phase H1 follow-up — ATS Checker → Editor handoff context (see
  // docs/ATS_NAVIGATION_AND_EDITOR_HANDOFF.md). Only ever short identifiers
  // in the URL (a source flag, a role slug/title, a report id) — never the
  // resume JSON itself. report_id, when present, is used ONCE below to
  // prefill the existing JD box from the already-persisted AtsReport
  // (GET /api/ats/v2/report/{id}, unchanged, pre-existing endpoint) — this
  // does not auto-run a new score, it just restores what was already typed,
  // so the candidate can pick up editing against the same target without
  // re-pasting the JD.
  const fromAtsChecker = searchParams.get('from') === 'ats-checker'
  const atsRoleTitle = searchParams.get('roleTitle')
  const atsReportId = searchParams.get('report_id')
  const [showAtsBanner, setShowAtsBanner] = useState(fromAtsChecker)

  const [resume, setResume] = useState<Resume | null>(null)
  const [content, setContent] = useState<ResumeContent>(emptyContent())
  const [title, setTitle] = useState('Untitled Resume')
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [atsScore, setAtsScore] = useState<number | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [breakdown, setBreakdown] = useState<{ label: string; value: number }[]>([])
  const [fixes, setFixes] = useState<{ title: string; detail: string }[]>([])
  const [jd, setJd] = useState('')
  const [scoring, setScoring] = useState(false)
  const [matchScore, setMatchScore] = useState<number | null>(null)
  const [scoreError, setScoreError] = useState('')
  const [atsHistory, setAtsHistory] = useState<{ id: string; score: number; job_title: string | null; created_at: string | null }[]>([])
  const [atsMissing, setAtsMissing] = useState<string[]>([])
  // Phase C — the three ATS Intelligence 2.0 layers (canonical v2 engine).
  // job_match stays null (never 0) until a JD has been analyzed.
  const [atsLayers, setAtsLayers] = useState<{ ats_compatibility: number | null; job_match: number | null; resume_quality: number | null } | null>(null)
  const [atsConfidence, setAtsConfidence] = useState<'high' | 'medium' | 'low' | null>(null)
  const [aiGenerating, setAiGenerating] = useState<string | null>(null)
  const [aiMsg, setAiMsg] = useState('')
  const [translateLang, setTranslateLang] = useState('es')
  const [centerTab, setCenterTab] = useState<'preview' | 'edit'>('preview')
  const [rightTab, setRightTab] = useState<'assistant' | 'insights' | 'skillgap' | 'fixes' | 'journey'>('insights')
  // Phase D (Gamification) — version history reused for the Journey tab
  // (same GET /api/resumes/{id}/versions endpoint VersionHistory.tsx's
  // drawer already calls), lazy-loaded only when that tab is opened.
  const [versions, setVersions] = useState<Version[]>([])
  const [versionsLoadedFor, setVersionsLoadedFor] = useState<string | null>(null)
  // Phase D — AI apply loop: recommendations, per-recommendation UI state,
  // change history + undo. See docs/SAHICAREER_ATS_INTELLIGENCE_2.md.
  const [recs, setRecs] = useState<PersistedRec[]>([])
  const [recBusy, setRecBusy] = useState<string | null>(null)
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const [previews, setPreviews] = useState<Record<string, { current: string | null; proposed: string | null; source_note: string }>>({})
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({})
  const [changeHistory, setChangeHistory] = useState<ChangeHistoryEntry[]>([])
  const [applyBanner, setApplyBanner] = useState('')
  const [gapTarget, setGapTarget] = useState('')
  const [gapLoading, setGapLoading] = useState(false)
  const [gap, setGap] = useState<{ required: string[]; matched: string[]; missing: string[]; match_score: number } | null>(null)
  const [templateId, setTemplateId] = useState('modern')
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  // Cosmetic-only (never read by any ATS scoring function) -- persisted via
  // the existing, previously-unwired font_metadata/layout_metadata columns
  // on Resume (models.py). fontFamily/fontSize apply to the Preview pane;
  // spacing scales its line-height/section gaps.
  const [fontFamily, setFontFamily] = useState('sans')
  const [fontSize, setFontSize] = useState('regular')
  const [spacing, setSpacing] = useState('comfortable')
  const [showFontPicker, setShowFontPicker] = useState(false)
  const [showSpacingPicker, setShowSpacingPicker] = useState(false)
  const [sectionsWidth, setSectionsWidth] = useState(240)
  const [showHistory, setShowHistory] = useState(false)
  const resizing = useRef(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>()

  // Phase H1 follow-up — restore the JD text from the ATS report this
  // resume was checked against, when the candidate arrived via "Improve My
  // Resume" with a job_description-mode report. Reuses the EXISTING
  // GET /api/ats/v2/report/{id} endpoint (unchanged) and the editor's own
  // pre-existing `jd` box/scoreAts() flow — does not call any scoring
  // engine itself, just fills in text the candidate already provided once.
  useEffect(() => {
    if (!atsReportId) return
    let cancelled = false
    api.get<{ job_description: string | null }>(`/api/ats/v2/report/${atsReportId}`)
      .then((r) => { if (!cancelled && r.job_description) setJd(r.job_description) })
      .catch(() => { /* best-effort — the banner already named the source; a failed fetch just means no JD prefill */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atsReportId])

  // Phase C — canonical ATS v2 analysis (services/ats_engine/ats_intelligence_v2.py),
  // no job description needed for this debounced, content-derived call. The
  // legacy /api/ats/analyze endpoint is UNCHANGED and still works — this is
  // an incremental migration of the CALLER, not a removal of the old path.
  const analyzeContent = useCallback(async (c: ResumeContent, resumeId?: string) => {
    setAnalyzing(true)
    try {
      const r = await api.post<AtsEditorResponse>('/api/ats/v2/analyze-editor', { content: c, resume_id: resumeId })
      setAtsScore(r.scores.overall)
      setAtsLayers(r.scores)
      setAtsConfidence(r.score_confidence)
      setBreakdown([
        { label: 'ATS Compatibility', value: r.scores.ats_compatibility ?? 0 },
        { label: 'Resume Quality', value: r.scores.resume_quality ?? 0 },
        ...(r.scores.job_match != null ? [{ label: 'Job Match', value: r.scores.job_match }] : []),
      ])
      setFixes([...r.recommendations.high, ...r.recommendations.medium].map(f => ({ title: f.issue, detail: `${f.why} ${f.action}` })))
    } catch {
      /* best-effort — leave the last known score/breakdown in place */
    } finally {
      setAnalyzing(false)
    }
  }, [])

  // Reload the resume from the server (used after a version rollback)
  const reloadResume = useCallback(async () => {
    if (!id || id === 'new') return
    try {
      const r = await api.get<Resume>(`/api/resumes/${id}`)
      setResume(r); setTitle(r.title); setContent(r.content || emptyContent())
      setTemplateId(r.template_id || 'modern')
      analyzeContent(r.content || emptyContent(), r.id)
    } catch { /* ignore */ }
  }, [id, analyzeContent])

  // Drag-to-resize the sections panel
  useEffect(() => {
    const SIDEBAR = 224 // AppShell fixed sidebar width (ml-56 = 14rem)
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return
      setSectionsWidth(Math.min(520, Math.max(200, e.clientX - SIDEBAR)))
    }
    const onUp = () => {
      if (!resizing.current) return
      resizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startResize = () => {
    resizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const loadAtsHistory = useCallback(async (rid: string) => {
    try {
      const h = await api.get<typeof atsHistory>(`/api/ats/reports/${rid}`)
      setAtsHistory(h)
    } catch { /* ignore */ }
  }, [])

  // Phase D — authoritative recommendation list (excludes already-applied
  // ones server-side). Re-fetched after apply/reject/undo so the panel
  // never shows stale state.
  const loadRecommendations = useCallback(async (rid: string) => {
    try {
      const r = await api.get<PersistedRec[]>(`/api/ats/v2/resumes/${rid}/recommendations`)
      setRecs(r)
    } catch { /* ignore */ }
  }, [])

  const loadChangeHistory = useCallback(async (rid: string) => {
    try {
      const r = await api.get<{ current_score: number | null; history: ChangeHistoryEntry[] }>(`/api/ats/v2/resumes/${rid}/change-history`)
      setChangeHistory(r.history)
    } catch { /* ignore */ }
  }, [])

  // Phase D (Gamification) — Journey tab data, same endpoint/shape as the
  // History drawer. Lazy: only fetched the first time the tab is opened for
  // this resume, not on every render (see spec section 23, "avoid
  // unnecessary API calls").
  const loadVersions = useCallback(async (rid: string) => {
    try {
      setVersions(await api.get<Version[]>(`/api/resumes/${rid}/versions`))
    } catch { /* ignore — Journey tab just shows the "not enough data yet" state */ }
    finally { setVersionsLoadedFor(rid) }
  }, [])

  useEffect(() => {
    if (rightTab !== 'journey' || !resume) return
    if (versionsLoadedFor !== resume.id) loadVersions(resume.id)
  }, [rightTab, resume, versionsLoadedFor, loadVersions])

  // After apply/undo, the resume content on the server has actually
  // changed — reload it (not just the score) so the editor/preview reflect
  // what was really written, never an optimistic guess.
  const reloadContentOnly = useCallback(async (rid: string) => {
    try {
      const r = await api.get<Resume>(`/api/resumes/${rid}`)
      setContent(r.content || emptyContent())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    // Wait for the persisted auth store to actually finish rehydrating
    // before deciding the user is logged out -- without this, a fresh
    // mount of this page (a full reload, but also, it turns out, a
    // client-side navigation landing here while React 18 Strict Mode's
    // dev-only mount→unmount→remount cycle is still settling) can read
    // `user` as momentarily null, bounce to /auth/login, and then bounce
    // AGAIN to /dashboard once hydration actually catches up a moment
    // later -- losing the "Improve My Resume" handoff entirely. Found via
    // the CRUD/consistency acceptance test's live click-through (see
    // docs/ATS_NAVIGATION_AND_EDITOR_HANDOFF.md). AppShell already guards
    // its own redirect this same way; this brings the edit page's load
    // effect in line with it instead of leaving it as the sole ungated
    // check that could race the same value.
    if (!hasHydrated) return
    if (!user) { router.push('/auth/login'); return }

    // `ignore` is React's own standard pattern for this exact problem
    // (see react.dev "Fetching data with Effects"): a LOCAL variable,
    // fresh for every single invocation of this effect, captured only by
    // that invocation's own .then() closures. React 18 Strict Mode
    // double-invokes effects once on mount in dev (mount → cleanup →
    // mount again) specifically to catch effects that don't handle this;
    // this one didn't. A first attempt at guarding this used a `useRef`
    // flag instead of a local variable -- REFS ARE NOT RESET BY THE
    // SYNTHETIC UNMOUNT, so if the FIRST (soon-to-be-discarded)
    // invocation's response happened to arrive before the SECOND
    // (surviving) one, the ref-based guard let the discarded instance
    // "claim" the id and then silently skipped the surviving instance's
    // own, legitimate first population -- `resume` never got set AT ALL,
    // so every click of "Save" silently no-opped forever (found via the
    // CRUD/consistency acceptance test: zero PUT requests ever fired
    // after adding a project). A plain local `ignore` variable doesn't
    // have that failure mode: the discarded invocation's own cleanup
    // (below) sets ITS `ignore` to true, so ITS .then() correctly no-ops,
    // while the surviving invocation's `ignore` was never touched and
    // its .then() applies normally -- regardless of which one's network
    // response happens to arrive first.
    let ignore = false
    if (id === 'new') {
      api.post<Resume>('/api/resumes/', { title: 'Untitled Resume', template_id: 'modern' })
        .then(r => {
          if (ignore) return
          setResume(r); setTitle(r.title); setContent(r.content || emptyContent()); setTemplateId(r.template_id || 'modern')
          router.replace(`/resumes/${r.id}/edit`)
        })
        .catch(() => { if (!ignore) router.push('/dashboard') })
    } else {
      api.get<Resume>(`/api/resumes/${id}`)
        .then(r => {
          if (ignore) return
          setResume(r); setTitle(r.title); setContent(r.content || emptyContent()); setTemplateId(r.template_id || 'modern')
          if (r.font_metadata?.family) setFontFamily(r.font_metadata.family)
          if (r.font_metadata?.size) setFontSize(r.font_metadata.size)
          if (r.layout_metadata?.spacing) setSpacing(r.layout_metadata.spacing)
          analyzeContent(r.content || emptyContent(), r.id)
          loadAtsHistory(r.id)
          loadRecommendations(r.id)
          loadChangeHistory(r.id)
        })
        .catch(() => { if (!ignore) router.push('/dashboard') })
    }
    return () => { ignore = true }
  }, [id, user, hasHydrated, router, loadAtsHistory, analyzeContent, loadRecommendations, loadChangeHistory])

  const patch = useCallback(<K extends keyof ResumeContent>(key: K, val: ResumeContent[K]) => {
    setContent(c => ({ ...c, [key]: val }))
    setSaved(false)
  }, [])

  // Single-flight save guard (found via the CRUD/consistency acceptance
  // test): the debounced autosave and an explicit "Save" click can both
  // call doSave() close together, each firing its own PUT with whatever
  // content was current AT THAT CALL. Two in-flight PUTs to the same
  // resume have no ordering guarantee on the network -- if the EARLIER
  // (now-stale) request's response happened to arrive AFTER the later,
  // correct one, its stale content silently overwrote the newer edit
  // (observed losing a just-added custom section this way, intermittently
  // -- consistent with a real race, not deterministic). Now at most one
  // PUT is ever in flight: a save requested while one is already running
  // is deferred and re-fires once the in-flight one finishes, always
  // using doSaveRef's up-to-date closure so the retry saves whatever is
  // ACTUALLY current, not a stale snapshot from when it was deferred.
  const saveInFlight = useRef(false)
  const saveAgainNeeded = useRef(false)
  const doSaveRef = useRef<() => Promise<void>>()

  const doSave = async () => {
    if (!resume) return
    if (saveInFlight.current) { saveAgainNeeded.current = true; return }
    saveInFlight.current = true
    setSaving(true)
    try {
      await api.put(`/api/resumes/${resume.id}`, {
        title, content, template_id: templateId,
        font_metadata: { family: fontFamily, size: fontSize },
        layout_metadata: { spacing },
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
      saveInFlight.current = false
      if (saveAgainNeeded.current) {
        saveAgainNeeded.current = false
        doSaveRef.current?.()
      }
    }
  }
  doSaveRef.current = doSave

  // Debounced auto-save: fires whenever the resume actually changes (spec Milestone C).
  // Skips the initial populate after load so we don't re-save unchanged content.
  const didLoad = useRef(false)
  useEffect(() => {
    if (!resume) return
    if (!didLoad.current) { didLoad.current = true; return }
    setSaved(false)
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => { doSave() }, 1500)
    return () => clearTimeout(autoSaveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title, templateId, fontFamily, fontSize, spacing, resume])

  // Re-run the real ATS analysis whenever the resume content actually changes,
  // so the score/breakdown in the Insights panel stay in sync with what's on the page.
  const analyzeTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (!resume) return
    if (!didLoad.current) return
    clearTimeout(analyzeTimer.current)
    analyzeTimer.current = setTimeout(() => analyzeContent(content, resume.id), 1200)
    return () => clearTimeout(analyzeTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  // Phase C — same canonical v2 endpoint as analyzeContent(), now with a JD.
  // Legacy /api/ats/score is UNCHANGED and still works for anything not yet
  // migrated (see routers/ats.py) — this call site alone is what's migrated.
  const scoreAts = async () => {
    if (!jd.trim()) return
    setScoring(true)
    setScoreError('')
    try {
      const r = await api.post<AtsEditorResponse>('/api/ats/v2/analyze-editor', {
        content,
        resume_id: resume?.id,
        job_description: jd,
        job_title: content.personalInfo?.jobTitle || title,
      })
      setMatchScore(r.scores.job_match)
      setAtsMissing(r.categories.job_match?.keywords?.missing_evidence || [])
      setAtsScore(r.scores.overall)
      setAtsLayers(r.scores)
      setAtsConfidence(r.score_confidence)
      setBreakdown([
        { label: 'ATS Compatibility', value: r.scores.ats_compatibility ?? 0 },
        { label: 'Resume Quality', value: r.scores.resume_quality ?? 0 },
        ...(r.scores.job_match != null ? [{ label: 'Job Match', value: r.scores.job_match }] : []),
      ])
      setFixes([...r.recommendations.high, ...r.recommendations.medium].map(f => ({ title: f.issue, detail: `${f.why} ${f.action}` })))
      if (resume?.id) {
        loadAtsHistory(resume.id)
        // Phase D — a JD-based analysis freshly (re-)stages recommendations
        // server-side; show that batch immediately rather than waiting on
        // a separate round trip.
        if (r.persisted_recommendations?.length) setRecs(r.persisted_recommendations)
        else loadRecommendations(resume.id)
      }
    } catch {
      setScoreError('Could not score against this job description — try again.')
    } finally {
      setScoring(false)
    }
  }

  /* ── Phase D — AI apply loop actions ──────────────────────────────
   * Answer → (lazy AI proposal) → Preview/edit → Apply (real reparse +
   * rescore + change-history row) or Reject. Undo restores from history.
   * Every action re-fetches the authoritative list afterward — never
   * mutated optimistically, since status/score are server-computed truths. */
  const submitAnswer = async (rec: PersistedRec) => {
    const answer = (answerDrafts[rec.id] || '').trim()
    if (!answer) return
    setRecBusy(rec.id)
    try {
      const r = await api.post<{ proposed_content: string | null; evidence_tier: PersistedRec['evidence_tier']; source_note: string; status: string }>(
        `/api/ats/v2/recommendations/${rec.id}/answer`, { answer })
      setPreviews(p => ({ ...p, [rec.id]: { current: null, proposed: r.proposed_content, source_note: r.source_note } }))
      setEditDrafts(d => ({ ...d, [rec.id]: r.proposed_content || '' }))
      setRecs(list => list.map(x => x.id === rec.id ? { ...x, status: r.status, evidence_tier: r.evidence_tier, proposed_content: r.proposed_content } : x))
    } catch (e) {
      setApplyBanner(e instanceof Error ? e.message : 'Could not submit your answer — try again.')
    } finally {
      setRecBusy(null)
    }
  }

  const doPreview = async (rec: PersistedRec) => {
    setRecBusy(rec.id)
    try {
      const r = await api.post<{ current: string | null; proposed_content: string | null; evidence_tier: PersistedRec['evidence_tier']; source_note: string }>(
        `/api/ats/v2/recommendations/${rec.id}/preview`, {})
      setPreviews(p => ({ ...p, [rec.id]: { current: r.current, proposed: r.proposed_content, source_note: r.source_note } }))
      setEditDrafts(d => ({ ...d, [rec.id]: r.proposed_content || '' }))
      setRecs(list => list.map(x => x.id === rec.id ? { ...x, evidence_tier: r.evidence_tier, proposed_content: r.proposed_content } : x))
    } catch (e) {
      setApplyBanner(e instanceof Error ? e.message : 'Preview unavailable — try again.')
    } finally {
      setRecBusy(null)
    }
  }

  const doApply = async (rec: PersistedRec) => {
    if (!resume) return
    const finalContent = editDrafts[rec.id]
    setRecBusy(rec.id)
    setApplyBanner('')
    try {
      const r = await api.post<{ success: boolean; before_score: number | null; after_score: number | null; score_delta: number | null; message: string }>(
        `/api/ats/v2/recommendations/${rec.id}/apply`, finalContent !== undefined ? { final_content: finalContent } : {})
      await reloadContentOnly(resume.id)
      if (r.after_score != null) setAtsScore(r.after_score)
      const delta = r.score_delta
      setApplyBanner(
        delta != null
          ? `✓ 1 fix applied — Resume ATS Health ${r.before_score ?? '—'} → ${r.after_score ?? '—'} (${delta >= 0 ? '+' : ''}${delta})`
          : `✓ ${r.message || 'Fix applied.'}`
      )
      loadRecommendations(resume.id)
      loadChangeHistory(resume.id)
    } catch (e) {
      setApplyBanner(e instanceof Error ? e.message : 'Could not apply this fix — try again.')
    } finally {
      setRecBusy(null)
      setTimeout(() => setApplyBanner(''), 8000)
    }
  }

  const doReject = async (rec: PersistedRec) => {
    if (!resume) return
    setRecBusy(rec.id)
    try {
      await api.post(`/api/ats/v2/recommendations/${rec.id}/reject`, {})
      setRecs(list => list.filter(x => x.id !== rec.id))
    } catch { /* ignore */ }
    finally { setRecBusy(null) }
  }

  const doUndo = async (h: ChangeHistoryEntry) => {
    if (!resume) return
    setRecBusy(h.id)
    setApplyBanner('')
    try {
      const r = await api.post<{ before_score: number | null; after_score: number | null; score_delta: number | null }>(
        `/api/ats/v2/change-history/${h.id}/undo`, {})
      await reloadContentOnly(resume.id)
      if (r.after_score != null) setAtsScore(r.after_score)
      setApplyBanner(`↩ Undone — Resume ATS Health ${r.before_score ?? '—'} → ${r.after_score ?? '—'}`)
      loadRecommendations(resume.id)
      loadChangeHistory(resume.id)
    } catch (e) {
      setApplyBanner(e instanceof Error ? e.message : 'Could not undo this change.')
    } finally {
      setRecBusy(null)
      setTimeout(() => setApplyBanner(''), 8000)
    }
  }

  // Add an ATS missing keyword straight into the skills list
  const addKeywordToSkills = (kw: string) => {
    const exists = content.skills.some(s => (typeof s === 'string' ? s : s.name).toLowerCase() === kw.toLowerCase())
    if (!exists) patch('skills', [...content.skills, { name: kw, level: 70 }])
    setAtsMissing(prev => prev.filter(k => k.toLowerCase() !== kw.toLowerCase()))
    setGap(prev => prev ? {
      ...prev,
      missing: prev.missing.filter(k => k.toLowerCase() !== kw.toLowerCase()),
      matched: prev.matched.some(m => m.toLowerCase() === kw.toLowerCase()) ? prev.matched : [...prev.matched, kw],
      match_score: prev.required.length
        ? Math.round((prev.matched.length + 1) / prev.required.length * 100)
        : prev.match_score,
    } : prev)
  }

  // Skill-gap: compare resume skills vs. what a target role/JD requires
  const runSkillGap = async () => {
    const target = (gapTarget.trim() || content.personalInfo?.jobTitle?.trim() || title).trim()
    if (!target) return
    setGapTarget(target)
    setGapLoading(true)
    const cur = content.skills.map(s => (typeof s === 'string' ? s : s.name))
    const curLc = new Set(cur.map(s => s.toLowerCase()))
    const staticFallback = () => {
      const req = popularForCategory(detectCategory(target), []).slice(0, 15)
      const matched = req.filter(s => curLc.has(s.toLowerCase()))
      const missing = req.filter(s => !curLc.has(s.toLowerCase()))
      return { required: req, matched, missing, match_score: req.length ? Math.round(matched.length / req.length * 100) : 0 }
    }
    try {
      const r = await api.post<typeof gap>('/api/ai/skill-gap', { target, current_skills: cur })
      setGap(r && r.required.length ? r : staticFallback())
    } catch {
      setGap(staticFallback())
    } finally {
      setGapLoading(false)
    }
  }

  const generateBullets = async (expIndex: number) => {
    const exp = content.experience[expIndex]
    if (!exp) return
    setAiGenerating('bullets')
    try {
      const r = await api.post<{ bullets: string[] }>('/api/ai/generate-bullets', {
        position: exp.position, company: exp.company, description: '',
      })
      const exps = [...content.experience]
      exps[expIndex] = { ...exps[expIndex], bullets: r.bullets }
      patch('experience', exps)
    } catch {
      // AI not available
    } finally {
      setAiGenerating(null)
    }
  }

  const generateSummary = async () => {
    setAiGenerating('summary')
    try {
      const r = await api.post<{ summary: string }>('/api/ai/generate-summary', {
        experience: content.experience.map(e => `${e.position} at ${e.company}`).join(', '),
        skills: content.skills.map(s => (typeof s === 'string' ? s : s.name)).join(', '),
      })
      patch('summary', r.summary)
    } catch {}
    finally { setAiGenerating(null) }
  }

  const skillsStr = () => content.skills.map(s => (typeof s === 'string' ? s : s.name)).join(', ')
  const jobTitleOrDefault = () => content.personalInfo?.jobTitle?.trim() || title

  // One-click: fill summary (if weak), write bullets for empty experiences, top up skills
  const improveWithAI = async () => {
    setAiGenerating('improve')
    setAiMsg('')
    const changes: string[] = []
    try {
      const expStr = content.experience.map(e => `${e.position} at ${e.company}`).join(', ')

      // 1) Summary
      let newSummary = content.summary
      if (!content.summary || content.summary.trim().length < 40) {
        try {
          const r = await api.post<{ summary: string }>('/api/ai/generate-summary', { experience: expStr, skills: skillsStr() })
          if (r.summary) { newSummary = r.summary; changes.push('summary') }
        } catch {}
      }

      // 2) Bullets for experiences that have none
      const exps = [...content.experience]
      let bulletsAdded = 0
      for (let i = 0; i < exps.length; i++) {
        const hasBullets = (exps[i].bullets || []).some(b => b.trim())
        if (!hasBullets && exps[i].position) {
          try {
            const r = await api.post<{ bullets: string[] }>('/api/ai/generate-bullets', {
              position: exps[i].position, company: exps[i].company, description: '',
            })
            if (r.bullets?.length) { exps[i] = { ...exps[i], bullets: r.bullets }; bulletsAdded++ }
          } catch {}
        }
      }
      if (bulletsAdded) changes.push(`bullets for ${bulletsAdded} role${bulletsAdded > 1 ? 's' : ''}`)

      // 3) Top up skills if sparse
      let newSkills = content.skills
      if (content.skills.length < 5) {
        try {
          const r = await api.post<{ skills: string[] }>('/api/ai/suggest-skills', {
            job_title: jobTitleOrDefault(),
            existing: content.skills.map(s => (typeof s === 'string' ? s : s.name)),
          })
          const add = (r.skills || []).slice(0, 8).map(name => ({ name, level: 75 }))
          if (add.length) { newSkills = [...content.skills, ...add]; changes.push(`${add.length} skills`) }
        } catch {}
      }

      setContent(c => ({ ...c, summary: newSummary, experience: exps, skills: newSkills }))
      setSaved(false)
      clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(() => doSave(), 1200)
      setAiMsg(changes.length ? `✓ Improved: ${changes.join(', ')}` : 'Already looks great — nothing to add!')
    } finally {
      setAiGenerating(null)
      setTimeout(() => setAiMsg(''), 6000)
    }
  }

  // Translate the resume and save a localized copy
  const LANGS: [string, string][] = [
    ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'],
    ['nl', 'Dutch'], ['pt', 'Portuguese'], ['ar', 'Arabic'], ['ja', 'Japanese'],
    ['zh', 'Chinese'], ['hi', 'Hindi'], ['mr', 'Marathi'], ['en', 'English'],
  ]
  const translateAndSave = async () => {
    setAiGenerating('translate'); setAiMsg('')
    try {
      const r = await api.post<{ translated: boolean; content: ResumeContent; detail?: string }>(
        '/api/ai/translate-resume', { content, target_language: translateLang })
      if (!r.translated) { setAiMsg(r.detail || 'Translation unavailable right now.'); return }
      const langName = LANGS.find(l => l[0] === translateLang)?.[1] || translateLang
      const saved = await api.post<{ id: string }>('/api/resumes/', {
        title: `${title} (${langName})`, template_id: templateId, content: r.content,
      })
      setAiMsg(`✓ Saved a ${langName} copy`)
      setTimeout(() => router.push(`/resumes/${saved.id}/edit`), 800)
    } catch (e) {
      setAiMsg(e instanceof Error ? e.message : 'Translation failed.')
    } finally {
      setAiGenerating(null)
      setTimeout(() => setAiMsg(''), 6000)
    }
  }

  // Generate a starter draft from just the job title (summary + skills)
  const generateDraft = async () => {
    const jt = jobTitleOrDefault()
    setAiGenerating('draft')
    setAiMsg('')
    try {
      const [sum, sk] = await Promise.allSettled([
        api.post<{ summary: string }>('/api/ai/generate-summary', { experience: jt, skills: skillsStr() }),
        api.post<{ skills: string[] }>('/api/ai/suggest-skills', {
          job_title: jt, existing: content.skills.map(s => (typeof s === 'string' ? s : s.name)),
        }),
      ])
      const newSummary = sum.status === 'fulfilled' && sum.value.summary ? sum.value.summary : content.summary
      const addSkills = sk.status === 'fulfilled' ? (sk.value.skills || []).slice(0, 10).map(name => ({ name, level: 75 })) : []
      setContent(c => ({ ...c, summary: newSummary, skills: [...c.skills, ...addSkills] }))
      setSaved(false)
      clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(() => doSave(), 1200)
      setAiMsg('✓ Starter draft ready — add your experience next')
    } finally {
      setAiGenerating(null)
      setTimeout(() => setAiMsg(''), 6000)
    }
  }


  // Profile Completeness — ONE definition, shared with the Create-from-Scratch
  // wizard's completion helper (@/lib/resumeContent's computeCompletion),
  // instead of a second, differently-thresholded heuristic living here.
  // Deliberately NOT Resume ATS Health (see docs/ATS_ANALYSIS_MODES.md) —
  // never sent to or derived from any ATS endpoint.
  const completion = useMemo(() => computeCompletion(content), [content])
  const doneMap = useMemo(
    () => Object.fromEntries(completion.sections.map(s => [s.key, s.done])) as Record<string, boolean>,
    [completion])
  const sectionComplete = (key: string) => doneMap[key] ?? false

  // Next Best Action — pick the single highest-priority item from data that's
  // already computed for the "AI Suggestions" list / "AI Fixes" tab. Prefers
  // a persisted, addressable recommendation (Phase D `recs`) over the lighter
  // analyze-editor `fixes`; invents nothing new.
  const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const nextBestAction = useMemo(() => {
    const pending = recs.filter(r => r.status === 'pending')
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    if (pending[0]) return { title: pending[0].title, detail: pending[0].reason }
    if (fixes[0]) return { title: fixes[0].title, detail: fixes[0].detail }
    return null
  }, [recs, fixes])

  // Phase D (Gamification) — Career Achievements. Every condition below
  // reads data that's already loaded for other reasons (resume.ats_score,
  // content, versions, changeHistory, templateId) — nothing new is computed
  // or persisted, no DB migration. The master spec's illustrative "Created
  // Europass CV" doesn't map to a real template this product has —
  // substituted with the actual International template (shared/
  // template-specs.json) rather than faking a condition that could never
  // truthfully be met.
  const achievements: Achievement[] = useMemo(() => {
    const savedScore = resume?.ats_score ?? null
    return [
      { key: 'created', icon: '📄', label: 'Resume Created', done: !!resume },
      { key: 'first_check', icon: '🎯', label: 'First ATS Check', done: savedScore != null },
      { key: 'first_project', icon: '🚀', label: 'Added First Project', done: content.projects.length > 0 },
      { key: 'health_70', icon: '📈', label: 'Reached 70+ Resume Health', done: (savedScore ?? 0) >= 70 },
      { key: 'health_80', icon: '🏅', label: 'Reached 80+ Resume Health', done: (savedScore ?? 0) >= 80 },
      { key: 'role_specific', icon: '🎯', label: 'Created a Role-Specific Resume', done: versions.some(v => v.source === 'role_builder') },
      { key: 'ai_optimized', icon: '🤖', label: 'Completed AI Optimization', done: changeHistory.length > 0 || versions.some(v => v.source === 'ai_upgrade') },
      { key: 'international', icon: '🌍', label: 'Used the International Template', done: templateId === 'international' },
    ]
  }, [resume, content.projects.length, versions, changeHistory, templateId])

  // Phase D (Gamification) — Resume Journey + Score Improvement Graph. Built
  // ONLY from real, already-persisted data: version snapshots (real
  // created_at + the canonical ats_score at that point — see
  // routers/resumes.py::_canonical_ats_score) and real applied-AI-Fix change
  // history. No event or score is invented; an empty list renders each
  // component's own honest "not enough data yet" state.
  const journeyEvents: JourneyEvent[] = useMemo(() => {
    const events: JourneyEvent[] = []
    const chronoVersions = [...versions].reverse() // API returns newest-first
    chronoVersions.forEach((v, i) => {
      const isFirst = i === 0
      const label = isFirst ? 'Resume Created'
        : v.source === 'ai_upgrade' ? 'AI Upgrade Applied'
        : v.source === 'rollback' ? 'Restored a Previous Version'
        : v.source === 'role_builder' ? 'Built for a Target Role'
        : 'Resume Updated'
      events.push({
        icon: isFirst ? '🌱' : v.source === 'ai_upgrade' ? '✨' : v.source === 'rollback' ? '↺' : '✎',
        label, date: v.created_at, score: v.ats_score,
      })
    })
    changeHistory.forEach(h => {
      events.push({
        icon: '🤖', label: 'AI Optimization',
        sub: h.score_delta != null ? `Resume Health ${h.before_score ?? '—'} → ${h.after_score ?? '—'}` : undefined,
        date: h.created_at, score: h.after_score,
      })
    })
    return events.filter(e => e.date).sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())
  }, [versions, changeHistory])

  const scoreTrendPoints: ScorePoint[] = useMemo(() => {
    const chronoVersions = [...versions].reverse()
    return chronoVersions
      .filter(v => v.ats_score != null)
      .map((v, i) => ({
        label: i === 0 ? 'Created' : v.source === 'ai_upgrade' ? 'AI Upgrade' : v.source === 'rollback' ? 'Rollback' : 'Edit',
        score: v.ats_score as number,
        date: v.created_at,
      }))
  }, [versions])

  const topBar = (
    <>
      <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
        ← Dashboard
      </button>
      <div className="flex-1 flex items-center gap-2 ml-4">
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-royal-400 focus:outline-none px-1 py-0.5 text-sm w-64"
        />
        <span className="text-xs text-gray-500">
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Unsaved'}
        </span>
      </div>
      <div className="flex items-center gap-2 ml-auto relative">
        <div className="relative">
          <button onClick={() => setShowTemplatePicker(p => !p)}
            className="text-xs text-gray-500 hover:text-navy-600 px-2 py-1 rounded hover:bg-royal-50 transition flex items-center gap-1">
            🎨 Template
          </button>
          {showTemplatePicker && (
            <div className="absolute top-8 left-0 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-2 flex gap-2 w-64 flex-wrap">
              {TEMPLATE_LIST.map(t => (
                <button key={t.id}
                  onClick={() => { setTemplateId(t.id); setShowTemplatePicker(false) }}
                  className={`flex-1 min-w-[70px] py-1.5 px-2 rounded-lg text-xs transition text-center ${templateId === t.id ? 'bg-navy-600 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}>
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {['Color', 'Tips'].map(t => (
          <button key={t} className="text-xs text-gray-500 hover:text-navy-600 px-2 py-1 rounded hover:bg-royal-50 transition">{t}</button>
        ))}
        <div className="relative">
          <button onClick={() => { setShowFontPicker(p => !p); setShowSpacingPicker(false) }}
            className="text-xs text-gray-500 hover:text-navy-600 px-2 py-1 rounded hover:bg-royal-50 transition">Font</button>
          {showFontPicker && (
            <div className="absolute top-8 left-0 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-3 w-56 space-y-3">
              <div>
                <div className="text-[10px] uppercase text-gray-400 font-semibold mb-1">Family</div>
                <div className="flex gap-1">
                  {[{ id: 'sans', label: 'Sans' }, { id: 'serif', label: 'Serif' }, { id: 'mono', label: 'Mono' }].map(f => (
                    <button key={f.id} onClick={() => setFontFamily(f.id)}
                      className={`flex-1 py-1 px-2 rounded-lg text-xs transition ${fontFamily === f.id ? 'bg-navy-600 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-400 font-semibold mb-1">Size</div>
                <div className="flex gap-1">
                  {[{ id: 'small', label: 'Small' }, { id: 'regular', label: 'Regular' }, { id: 'large', label: 'Large' }].map(s => (
                    <button key={s.id} onClick={() => setFontSize(s.id)}
                      className={`flex-1 py-1 px-2 rounded-lg text-xs transition ${fontSize === s.id ? 'bg-navy-600 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <button onClick={() => { setShowSpacingPicker(p => !p); setShowFontPicker(false) }}
            className="text-xs text-gray-500 hover:text-navy-600 px-2 py-1 rounded hover:bg-royal-50 transition">Spacing</button>
          {showSpacingPicker && (
            <div className="absolute top-8 left-0 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-2 flex gap-2 w-56">
              {[{ id: 'compact', label: 'Compact' }, { id: 'comfortable', label: 'Comfortable' }, { id: 'spacious', label: 'Spacious' }].map(s => (
                <button key={s.id} onClick={() => { setSpacing(s.id); setShowSpacingPicker(false) }}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs transition text-center ${spacing === s.id ? 'bg-navy-600 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setShowHistory(true)}
          className="text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition flex items-center gap-1"
          title="Version history & rollback">
          🕘 History
        </button>
        <button onClick={() => router.push(`/resumes/${id}/preview`)}
          className="text-xs text-navy-600 bg-royal-50 hover:bg-royal-100 px-3 py-1.5 rounded-lg transition">
          Preview
        </button>
        <button onClick={doSave} disabled={saving || !resume}
          title={!resume ? 'Loading your resume…' : undefined}
          className="text-xs bg-navy-600 hover:bg-navy-700 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50">
          {saving ? 'Saving…' : !resume ? 'Loading…' : 'Save'}
        </button>
      </div>
    </>
  )

  return (
    <AppShell topBar={topBar}>
      {resume && (
        <VersionHistory
          resumeId={resume.id}
          open={showHistory}
          onClose={() => setShowHistory(false)}
          onRestored={reloadResume}
        />
      )}
      {showAtsBanner && (
        <div className="flex items-center justify-between gap-3 bg-royal-50 border-b border-royal-200 px-4 py-2 text-xs text-navy-700">
          <span>
            🎯 This resume came from ATS analysis.
            {atsRoleTitle && <> Target role: <b>{atsRoleTitle}</b>.</>}
            {atsReportId && <> Continue editing against the same job description below.</>}
          </span>
          <button onClick={() => setShowAtsBanner(false)} className="text-navy-500 hover:text-navy-700 shrink-0">✕</button>
        </div>
      )}
      <div className="flex h-[calc(100vh-56px)] overflow-hidden">

        {/* ── LEFT: Sections panel ─────────────────────────────── */}
        <div
          style={{ width: sectionsWidth }}
          className="bg-white border-r border-gray-100 flex flex-col overflow-y-auto flex-shrink-0">
          <ResumeProgress content={content} />
          <div className="px-3 py-3 border-b border-gray-100">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Resume Sections</div>
          </div>
          <div className="flex-1 py-2">
            {SECTIONS.map(sec => (
              <div key={sec.key}>
                <button
                  onClick={() => setActiveSection(activeSection === sec.key ? null : sec.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                    activeSection === sec.key ? 'bg-royal-50 text-navy-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base w-5 text-center">{sec.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{sec.label}</div>
                    {!sectionComplete(sec.key) && (
                      <div className="text-xs text-gray-500">Add your {sec.label.toLowerCase()}</div>
                    )}
                  </div>
                  {sectionComplete(sec.key) && (
                    <span className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-xs flex-shrink-0">✓</span>
                  )}
                  <span className="text-gray-300 text-xs">{activeSection === sec.key ? '▲' : '▼'}</span>
                </button>

                {/* Inline editor */}
                {activeSection === sec.key && (
                  <div className="bg-gray-50 border-y border-gray-100 px-3 py-3 overflow-y-auto max-h-80">
                    {sec.key === 'personalInfo' && (
                      <PersonalInfoEditor data={content.personalInfo} onChange={v => patch('personalInfo', v)} />
                    )}
                    {sec.key === 'summary' && (
                      <div className="space-y-2">
                        <textarea value={content.summary}
                          onChange={e => patch('summary', e.target.value)}
                          placeholder="Write a brief professional summary..."
                          rows={6}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300 resize-y" />
                        <button onClick={generateSummary} disabled={aiGenerating === 'summary'}
                          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-royal-500 to-teal-500 text-white py-2 rounded-lg text-xs hover:opacity-90 transition">
                          {aiGenerating === 'summary' ? '✨ Generating…' : '✨ Generate with AI'}
                        </button>
                      </div>
                    )}
                    {sec.key === 'experience' && (
                      <ExperienceEditor data={content.experience} onChange={v => patch('experience', v)} />
                    )}
                    {sec.key === 'education' && (
                      <EducationEditor data={content.education} onChange={v => patch('education', v)} />
                    )}
                    {sec.key === 'skills' && (
                      <SkillsEditor data={content.skills} jobTitle={content.personalInfo?.jobTitle} onChange={v => patch('skills', v)} />
                    )}
                    {sec.key === 'projects' && (
                      <ProjectsEditor data={content.projects} onChange={v => patch('projects', v)} />
                    )}
                    {sec.key === 'certifications' && (
                      <CertificationsEditor data={content.certifications} onChange={v => patch('certifications', v)} />
                    )}
                    {sec.key === 'achievements' && (
                      <ListEditor data={content.achievements} onChange={v => patch('achievements', v)} placeholder="Enter an achievement..." />
                    )}
                    {sec.key === 'languages' && (
                      <LanguagesEditor data={content.languages} onChange={v => patch('languages', v)} />
                    )}
                    {sec.key === 'interests' && (
                      <ListEditor data={content.interests} onChange={v => patch('interests', v)} placeholder="Enter an interest..." />
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Custom, user-named sections (content.customSections) --
                same active/inactive toggle pattern as the fixed SECTIONS
                above, keyed by `custom-${id}` instead of a fixed key. */}
            {content.customSections.map((cs, i) => {
              const sectionKey = `custom-${cs.id}`
              return (
                <div key={cs.id}>
                  <button
                    onClick={() => setActiveSection(activeSection === sectionKey ? null : sectionKey)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                      activeSection === sectionKey ? 'bg-royal-50 text-navy-700' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-base w-5 text-center">📄</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{cs.title || 'New Section'}</div>
                      {!cs.title.trim() && <div className="text-xs text-gray-500">Add a section title</div>}
                    </div>
                    {cs.title.trim() && cs.content.trim() && (
                      <span className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-xs flex-shrink-0">✓</span>
                    )}
                    <span className="text-gray-300 text-xs">{activeSection === sectionKey ? '▲' : '▼'}</span>
                  </button>
                  {activeSection === sectionKey && (
                    <div className="bg-gray-50 border-y border-gray-100 px-3 py-3 overflow-y-auto max-h-80">
                      <CustomSectionEditor
                        data={cs}
                        onChange={v => patch('customSections', content.customSections.map((s, j) => j === i ? v : s))}
                        onRemove={() => { patch('customSections', content.customSections.filter((_, j) => j !== i)); setActiveSection(null) }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="px-3 py-3 border-t border-gray-100">
            <button
              onClick={() => {
                const next: CustomSection = { id: uid(), title: '', content: '' }
                patch('customSections', [...content.customSections, next])
                setActiveSection(`custom-${next.id}`)
              }}
              className="w-full text-xs text-navy-600 hover:text-royal-800 py-2 border border-dashed border-royal-200 rounded-lg hover:bg-royal-50 transition">
              + Add Custom Section
            </button>
          </div>
        </div>

        {/* ── Drag handle to resize sections panel ──────────────── */}
        <div
          onMouseDown={startResize}
          onDoubleClick={() => setSectionsWidth(240)}
          title="Drag to resize · double-click to reset"
          className="w-1 flex-shrink-0 cursor-col-resize bg-gray-100 hover:bg-royal-400 active:bg-royal-500 transition-colors relative group">
          <div className="absolute inset-y-0 -left-1 -right-1" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-gray-300 group-hover:bg-royal-500 transition-colors" />
        </div>

        {/* ── CENTER: Preview ───────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#F0F2F8]">
          <div className="flex items-center justify-center gap-1 py-2 bg-white border-b border-gray-100">
            {(['preview', 'edit'] as const).map(t => (
              <button key={t} onClick={() => setCenterTab(t)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${
                  centerTab === t ? 'bg-navy-600 text-white' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-6 flex justify-center">
            <div className="w-full max-w-[600px] resume-preview-styled">
              {/* Font family/size + spacing are cosmetic-only (never read by
                  any ATS scoring function) -- applied via a scoped override
                  so the choice actually shows up regardless of which
                  template's own Tailwind classes are active, without
                  editing all 10 template files individually. */}
              <style>{`
                .resume-preview-styled { zoom: ${fontSize === 'small' ? 0.85 : fontSize === 'large' ? 1.15 : 1}; }
                .resume-preview-styled, .resume-preview-styled * {
                  font-family: ${fontFamily === 'serif' ? 'Georgia, "Times New Roman", serif'
                    : fontFamily === 'mono' ? '"Roboto Mono", Consolas, monospace'
                    : 'Inter, ui-sans-serif, system-ui, sans-serif'} !important;
                }
                .resume-preview-styled p, .resume-preview-styled li, .resume-preview-styled div {
                  line-height: ${spacing === 'compact' ? 1.15 : spacing === 'spacious' ? 1.9 : 1.5} !important;
                }
              `}</style>
              <ResumeTemplates content={content} template={templateId} />
            </div>
          </div>
        </div>

        {/* ── RIGHT: ATS + AI panel ─────────────────────────────── */}
        <div className="w-72 bg-white border-l border-gray-100 flex flex-col overflow-y-auto flex-shrink-0">
          {/* Tab selector */}
          <div className="flex border-b border-gray-100">
            {([
              ['insights', 'Insights'],
              ['fixes', `Fixes${recs.length ? ` (${recs.length})` : ''}`],
              ['journey', 'Journey'],
              ['assistant', 'Assistant'],
              ['skillgap', 'Skill Gap'],
            ] as const).map(([t, label]) => (
              <button key={t} onClick={() => setRightTab(t)}
                className={`flex-1 py-3 text-[11px] font-medium transition ${
                  rightTab === t ? 'text-navy-700 border-b-2 border-navy-600' : 'text-gray-500 hover:text-gray-600'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {rightTab === 'fixes' ? (
            /* ── Phase D: AI ATS Agent — recommendation lifecycle ────── */
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {applyBanner && (() => {
                // Presentation only — applyBanner's TEXT is set entirely by
                // doApply()/doUndo() from the backend's real before/after
                // score (never invented here); this just picks a tone.
                const isImprovement = applyBanner.startsWith('✓') && /\(\+\d/.test(applyBanner)
                const isError = !applyBanner.startsWith('✓') && !applyBanner.startsWith('↩')
                return (
                  <div className={`text-xs rounded-lg px-3 py-2 border ${
                    isImprovement ? 'text-green-800 bg-green-50 border-green-200'
                    : isError ? 'text-red-700 bg-red-50 border-red-200'
                    : 'text-navy-700 bg-royal-50 border-royal-200'}`}>
                    {isImprovement && <span className="font-semibold">🎉 Nice improvement! </span>}
                    {applyBanner}
                  </div>
                )
              })()}

              <div>
                <div className="text-xs font-semibold text-gray-800 mb-1">AI-Recommended Fixes</div>
                <p className="text-[11px] text-gray-500 mb-2">
                  Every fix needs your approval before it touches your resume. Nothing here is invented —
                  fixes only use facts already on your resume, or facts you confirm below.
                </p>
                {recs.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    Paste a job description in Insights → Keyword Match and click Analyze Match to generate fixes.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {recs.map(rec => {
                      const busy = recBusy === rec.id
                      const preview = previews[rec.id]
                      const canAnswer = rec.requires_user_input && rec.status !== 'answered' && !preview
                      const canPreview = !rec.requires_user_input && !preview
                      const canApply = !!preview?.proposed || (rec.requires_user_input && rec.status === 'answered')
                      return (
                        <div key={rec.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-800">{rec.title}</div>
                              <div className="text-[11px] text-gray-500 mt-0.5">{rec.reason}</div>
                            </div>
                            <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                              rec.priority === 'high' ? 'bg-red-50 text-red-600' : rec.priority === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                            }`}>{rec.priority}</span>
                          </div>

                          {rec.requires_user_input && canAnswer && (
                            <div className="space-y-1.5">
                              <div className="text-[11px] text-gray-600">{rec.question}</div>
                              <textarea
                                value={answerDrafts[rec.id] || ''}
                                onChange={e => setAnswerDrafts(d => ({ ...d, [rec.id]: e.target.value }))}
                                rows={2}
                                placeholder="Your answer…"
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-royal-300 resize-none"
                              />
                              <button onClick={() => submitAnswer(rec)} disabled={busy || !(answerDrafts[rec.id] || '').trim()}
                                className="text-xs bg-navy-600 hover:bg-navy-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                                {busy ? 'Submitting…' : 'Submit answer'}
                              </button>
                            </div>
                          )}

                          {canPreview && (
                            <button onClick={() => doPreview(rec)} disabled={busy}
                              className="text-xs border border-royal-200 text-navy-600 hover:bg-royal-50 px-3 py-1.5 rounded-lg disabled:opacity-50">
                              {busy ? 'Generating…' : '👁 Preview fix'}
                            </button>
                          )}

                          {preview && (
                            <div className="space-y-1.5">
                              {preview.current && (
                                <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5">
                                  <span className="font-medium">Before:</span> {preview.current}
                                </div>
                              )}
                              {preview.proposed ? (
                                <>
                                  <div className="text-[11px] text-green-700 bg-green-50 rounded-lg px-2 py-1.5">
                                    <span className="font-medium">After:</span>
                                  </div>
                                  <textarea
                                    value={editDrafts[rec.id] ?? preview.proposed}
                                    onChange={e => setEditDrafts(d => ({ ...d, [rec.id]: e.target.value }))}
                                    rows={2}
                                    className="w-full border border-green-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-300 resize-none"
                                  />
                                  <p className="text-[10px] text-gray-400">{preview.source_note} — you can edit this before applying.</p>
                                </>
                              ) : (
                                <p className="text-[11px] text-gray-400">{preview.source_note}</p>
                              )}
                            </div>
                          )}

                          <div className="flex gap-2 pt-1">
                            {canApply && (
                              <button onClick={() => doApply(rec)} disabled={busy}
                                className="flex-1 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                                {busy ? 'Applying…' : '✓ Apply fix'}
                              </button>
                            )}
                            <button onClick={() => doReject(rec)} disabled={busy}
                              className="text-xs text-gray-500 hover:text-red-500 px-3 py-1.5 rounded-lg disabled:opacity-50">
                              Dismiss
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {changeHistory.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-800 mb-2">Change History</div>
                  <div className="space-y-1.5">
                    {changeHistory.slice(0, 10).map(h => (
                      <div key={h.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-gray-700 truncate capitalize">{h.action_type.replace(/_/g, ' ')}</div>
                          <div className="text-gray-500" style={{ fontSize: 10 }}>
                            {h.before_score ?? '—'} → {h.after_score ?? '—'}
                            {h.score_delta != null && ` (${h.score_delta >= 0 ? '+' : ''}${h.score_delta})`}
                          </div>
                        </div>
                        {h.action_type !== 'undo' && (
                          <button onClick={() => doUndo(h)} disabled={recBusy === h.id}
                            className="text-xs text-navy-600 hover:text-royal-800 disabled:opacity-50 flex-shrink-0 ml-2">
                            {recBusy === h.id ? '…' : 'Undo'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : rightTab === 'insights' ? (
            <div className="flex-1 overflow-y-auto">
              {/* Resume Health Card — canonical mode_orchestrator.resume_health_mode()
                  score (via /api/ats/v2/analyze-editor, unchanged this phase);
                  resume-only, never blended with Job Match even when a JD is
                  loaded (Job Match shown as its own row below, from the same
                  already-computed `breakdown`, never merged into the headline
                  score). Phase C (UI/UX) — visual redesign only, folds the old
                  separate "three layers" grid + "Score Breakdown" block into one
                  card, per the master-phase spec's Resume Health Card. */}
              <div className="px-4 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-800">Resume ATS Health</span>
                </div>
                {atsScore == null ? (
                  <div className="flex flex-col items-center py-6 text-xs text-gray-400">
                    {analyzing ? 'Analyzing your resume…' : 'Fill in your resume to see your Resume ATS Health.'}
                  </div>
                ) : (
                  <div className={`flex flex-col items-center py-2 transition-opacity ${analyzing ? 'opacity-60' : ''}`}>
                    <CircularScore score={atsScore} max={100} size={104} color={atsScore >= 80 ? '#1E7A46' : atsScore >= 60 ? '#F5A623' : '#c0392b'} />
                    <div className={`text-sm font-semibold mt-2 ${atsScore >= 80 ? 'text-green-600' : atsScore >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {atsScore >= 85 ? 'Excellent! 🌟' : atsScore >= 70 ? 'Good Progress 🚀' : atsScore >= 50 ? 'Making Progress 💪' : 'Just Getting Started 🌱'}
                    </div>
                    {atsConfidence && (
                      <span className={`mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        atsConfidence === 'high' ? 'bg-green-50 text-green-700 border-green-200'
                        : atsConfidence === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {atsConfidence} confidence
                      </span>
                    )}

                    {breakdown.length > 0 && (
                      <div className="w-full mt-4 space-y-2">
                        {breakdown.map(item => (
                          <div key={item.label} className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">{item.label}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-royal-500 to-teal-500 rounded-full" style={{ width: `${item.value}%` }} />
                              </div>
                              <span className="text-xs font-medium text-gray-700 w-8 text-right">{item.value}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <button onClick={() => setRightTab('fixes')} className="btn-primary w-full mt-4 text-xs py-2">
                      Improve My Resume
                    </button>
                  </div>
                )}
              </div>

              {/* Next Best Action — the single highest-priority item from the
                  SAME already-computed data the "AI Suggestions" list below and
                  the "AI Fixes" tab use (persisted recommendations first, the
                  lighter analyze-editor fix as a fallback). Invents no advice;
                  "Improve This" only switches to the AI Fixes tab where the
                  real apply/reparse/rescore loop lives — no score change is
                  ever claimed here, only after a real apply (see applyBanner). */}
              {nextBestAction && (
                <div className="px-4 py-4 border-b border-gray-100">
                  <div className="text-xs font-semibold text-gray-800 mb-2">🎯 Next Best Action</div>
                  <div className="rounded-xl bg-gradient-to-br from-royal-50 to-teal-50 border border-royal-100 p-3">
                    <div className="text-sm font-medium text-gray-800">{nextBestAction.title}</div>
                    {nextBestAction.detail && (
                      <p className="text-xs text-gray-600 mt-1">{nextBestAction.detail}</p>
                    )}
                    <button onClick={() => setRightTab('fixes')}
                      className="mt-2.5 text-xs font-medium text-navy-700 bg-white border border-royal-200 rounded-lg px-3 py-1.5 hover:bg-royal-50 transition">
                      Improve This →
                    </button>
                  </div>
                </div>
              )}

              {/* Keyword Match */}
              <div className="px-4 py-4 border-b border-gray-100">
                <div className="text-xs font-semibold text-gray-800 mb-3">Keyword Match</div>
                <textarea value={jd} onChange={e => setJd(e.target.value)}
                  placeholder="Paste job description to analyze keyword match..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-royal-300 resize-none mb-2" />
                <button onClick={scoreAts} disabled={scoring || !jd.trim()}
                  className="w-full bg-navy-600 hover:bg-navy-700 text-white py-2 rounded-lg text-xs font-medium transition disabled:opacity-50">
                  {scoring ? 'Analyzing…' : 'Analyze Match'}
                </button>
                {scoreError && <p className="text-xs text-red-500 mt-2">{scoreError}</p>}
                {matchScore != null && (
                  <div className="mt-3 flex flex-col items-center">
                    <CircularScore score={matchScore} size={70} color="#6366f1" />
                    <div className="text-xs text-gray-500 mt-1">Match Score</div>
                  </div>
                )}

                {atsMissing.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1.5">
                      Missing keywords — tap to add to Skills:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {atsMissing.slice(0, 12).map(kw => (
                        <button
                          key={kw}
                          onClick={() => addKeywordToSkills(kw)}
                          className="text-xs px-2.5 py-1 rounded-full border border-red-200 text-red-600 bg-red-50/60 hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition"
                          title="Add to Skills"
                        >
                          + {kw}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Scan History */}
              {atsHistory.length > 0 && (
                <div className="px-4 py-4 border-b border-gray-100">
                  <div className="text-xs font-semibold text-gray-800 mb-3">Scan History</div>
                  <div className="space-y-1.5">
                    {atsHistory.slice(0, 8).map(h => (
                      <div key={h.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-gray-700 truncate">{h.job_title || 'Untitled scan'}</div>
                          <div className="text-gray-500" style={{ fontSize: 10 }}>
                            {h.created_at ? new Date(h.created_at).toLocaleString() : ''}
                          </div>
                        </div>
                        <span className={`font-bold ml-2 flex-shrink-0 ${h.score >= 80 ? 'text-green-600' : h.score >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {h.score}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Suggestions — real, ranked by how many ATS points each would add */}
              <div className="px-4 py-4">
                <div className="text-xs font-semibold text-gray-800 mb-3">AI Suggestions</div>
                <div className="space-y-2">
                  {fixes.length > 0 ? fixes.map((f, i) => (
                    <div key={i} className="flex gap-2 text-xs text-gray-600 bg-royal-50 rounded-lg px-3 py-2">
                      <span className="text-royal-500 flex-shrink-0">•</span>
                      <span><span className="font-medium text-gray-700">{f.title}.</span> {f.detail}</span>
                    </div>
                  )) : (
                    <div className="text-xs text-gray-400">
                      {analyzing ? 'Analyzing…' : "Nothing to flag — this resume is in great shape."}
                    </div>
                  )}
                </div>
                <button
                  onClick={improveWithAI}
                  disabled={aiGenerating !== null}
                  className="btn-primary mt-3 w-full text-xs py-2 disabled:opacity-60"
                >
                  {aiGenerating === 'improve' ? '✨ Improving your resume…' : '✨ Improve with AI'}
                </button>
                {aiMsg && (
                  <div className="mt-2 text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                    {aiMsg}
                  </div>
                )}
              </div>
            </div>
          ) : rightTab === 'journey' ? (
            /* ── Phase D (Gamification): Career Achievements, Resume Journey,
                 Score Improvement Graph — all built from real, already-loaded
                 or lazily-fetched data (versions, changeHistory, content,
                 resume.ats_score). See the achievements/journeyEvents/
                 scoreTrendPoints useMemo blocks above. ──────────────────── */
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <CareerAchievements achievements={achievements} />

              <div className="border-t border-gray-100 pt-4">
                <ScoreTrendChart points={scoreTrendPoints} />
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="text-xs font-semibold text-gray-800 mb-3">🧭 Resume Journey</div>
                {versionsLoadedFor !== (resume?.id ?? null) ? (
                  <p className="text-xs text-gray-400 text-center py-6">Loading your journey…</p>
                ) : (
                  <ResumeJourney events={journeyEvents} currentScore={atsScore} />
                )}
              </div>
            </div>
          ) : rightTab === 'assistant' ? (
            /* AI Assistant panel */
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* One-click starter draft */}
              <div className="rounded-xl bg-brand-gradient p-3.5 text-white shadow-glow">
                <div className="text-xs font-semibold mb-1">🚀 Quick Start</div>
                <p className="text-[11px] text-white/80 mb-2.5">
                  Generate a professional summary and role-relevant skills from your job title
                  {content.personalInfo?.jobTitle ? ` (“${content.personalInfo.jobTitle}”)` : ''}.
                </p>
                <button
                  onClick={generateDraft}
                  disabled={aiGenerating !== null}
                  className="w-full bg-white/95 hover:bg-white text-navy-700 text-xs font-semibold py-2 rounded-lg transition disabled:opacity-70"
                >
                  {aiGenerating === 'draft' ? '✨ Drafting…' : '✨ Generate Starter Draft'}
                </button>
                {aiMsg && <div className="mt-2 text-[11px] text-white/90">{aiMsg}</div>}
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-700 mb-2">Professional Summary</div>
                <button onClick={generateSummary} disabled={aiGenerating === 'summary'}
                  className="w-full bg-gradient-to-r from-royal-500 to-teal-500 text-white py-2 rounded-lg text-xs hover:opacity-90 transition">
                  {aiGenerating === 'summary' ? '✨ Generating…' : '✨ Generate Summary'}
                </button>
                {content.summary && (
                  <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3">{content.summary}</div>
                )}
              </div>

              {/* Multilingual (Phase 3) */}
              <div className="rounded-xl border border-gray-100 p-3">
                <div className="text-xs font-semibold text-gray-700 mb-2">🌐 Translate resume</div>
                <div className="flex gap-2">
                  <select value={translateLang} onChange={e => setTranslateLang(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-royal-300">
                    {LANGS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                  <button onClick={translateAndSave} disabled={aiGenerating !== null}
                    className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white px-3 py-2 rounded-lg text-xs hover:opacity-90 transition disabled:opacity-50 whitespace-nowrap">
                    {aiGenerating === 'translate' ? '🌐 Translating…' : 'Translate & Save'}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5">Saves a translated copy as a new resume.</p>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-700 mb-2">Work Experience Bullets</div>
                {content.experience.length === 0 ? (
                  <p className="text-xs text-gray-500">Add work experience first</p>
                ) : (
                  content.experience.map((exp, i) => (
                    <button key={exp.id} onClick={() => generateBullets(i)} disabled={aiGenerating === 'bullets'}
                      className="w-full mb-2 border border-royal-200 text-navy-600 hover:bg-royal-50 py-2 rounded-lg text-xs transition">
                      {aiGenerating === 'bullets' ? '✨ Generating…' : `Generate for ${exp.position || `Experience ${i + 1}`}`}
                    </button>
                  ))
                )}
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-700 mb-2">Cover Letter</div>
                <button onClick={() => router.push('/cover-letters')}
                  className="w-full bg-gradient-to-r from-teal-500 to-amber-500 text-white py-2 rounded-lg text-xs hover:opacity-90 transition">
                  ✉ Generate Cover Letter
                </button>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-700 mb-2">Interview Prep</div>
                <button onClick={() => router.push('/interview-questions')}
                  className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white py-2 rounded-lg text-xs hover:opacity-90 transition">
                  💬 Generate Questions
                </button>
              </div>
            </div>
          ) : (
            /* ── Skill Gap panel ─────────────────────────────────── */
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <div className="text-xs font-semibold text-gray-800 mb-1">Target role or job description</div>
                <p className="text-[11px] text-gray-500 mb-2">See which required skills you have vs. are missing.</p>
                <textarea
                  value={gapTarget}
                  onChange={e => setGapTarget(e.target.value)}
                  placeholder={content.personalInfo?.jobTitle ? `e.g. ${content.personalInfo.jobTitle}` : 'e.g. Senior React Developer, or paste a job description'}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-royal-300 resize-none mb-2"
                />
                <button onClick={runSkillGap} disabled={gapLoading}
                  className="btn-primary w-full text-xs py-2 disabled:opacity-60">
                  {gapLoading ? '✨ Analyzing…' : '🎯 Analyze Skill Gap'}
                </button>
              </div>

              {gapLoading && !gap && (
                <div className="space-y-3">
                  <div className="h-24 rounded-2xl bg-gray-100 shimmer" />
                  <div className="h-20 rounded-2xl bg-gray-100 shimmer" />
                </div>
              )}

              {gap && (
                <>
                  <div className="card-premium p-4 flex flex-col items-center">
                    <div className="text-xs font-semibold text-gray-800 mb-2">Skill Match</div>
                    <CircularScore score={gap.match_score} size={96}
                      color={gap.match_score >= 80 ? '#1E7A46' : gap.match_score >= 50 ? '#F5A623' : '#c0392b'} />
                    <div className="text-xs text-gray-500 mt-2 text-center">
                      {gap.matched.length} of {gap.required.length} key skills present
                    </div>
                  </div>

                  {gap.missing.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-800 mb-1.5">
                        ❌ Missing skills — tap to add
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {gap.missing.map(s => (
                          <button key={s} onClick={() => addKeywordToSkills(s)}
                            className="text-xs px-2.5 py-1 rounded-full border border-red-200 text-red-600 bg-red-50/60 hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition"
                            title="Add to Skills">
                            + {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {gap.matched.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-800 mb-1.5">✓ You already have</div>
                      <div className="flex flex-wrap gap-1.5">
                        {gap.matched.map(s => (
                          <span key={s} className="text-xs px-2.5 py-1 rounded-full border border-green-200 text-green-700 bg-green-50">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {gap.missing.length === 0 && (
                    <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                      🎉 You have all the key skills for this role!
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
