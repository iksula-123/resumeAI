'use client'

/**
 * Create from Scratch — guided resume onboarding (SahiCareer UI/UX +
 * Gamification, Phase B).
 *
 * Replaces the old "Blank Resume" behavior (instantly creating an empty
 * resume and dropping the user into a huge empty form) with a step-by-step
 * flow. Nothing here invents data: every AI-generated field still requires
 * explicit user action ("Generate with AI") and can be edited or skipped,
 * exactly like the existing Resume Editor's per-section AI buttons.
 *
 * Reused, not duplicated:
 *  - section editors + content shape: @/components/resume-editors/SectionEditors, @/lib/resumeContent
 *  - templates: @/components/ResumeTemplates (same TEMPLATE_LIST/spec as the editor and /templates)
 *  - AI endpoints: /api/ai/generate-summary, /api/ai/suggest-skills (same ones the editor calls)
 *  - resume creation: POST /api/resumes/ (same endpoint every other creation
 *    flow uses — /resumes/new, /resumes/build, /templates)
 *  - scoring: POST /api/ats/v2/check → mode_orchestrator.resume_health_mode()
 *    (the ONE canonical Resume ATS Health score — never computed here)
 *
 * `?mode=ai` (linked from the "Build with AI" chooser card) nudges the
 * summary step to default to AI generation instead of "write it myself" —
 * same flow, same steps, no separate code path to keep in sync.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { setPostLoginRedirect } from '@/lib/authRedirect'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'
import CircularScore from '@/components/CircularScore'
import ResumeTemplates, { TEMPLATE_LIST } from '@/components/ResumeTemplates'
import { DUMMY_RESUME } from '@/lib/dummyResume'
import {
  ExperienceEditor, EducationEditor, SkillsEditor, ProjectsEditor,
  CertificationsEditor, ListEditor,
} from '@/components/resume-editors/SectionEditors'
import { type ResumeContent, emptyContent } from '@/lib/resumeContent'

interface RoleListItem {
  slug: string; canonical_title: string; industry?: string; top_skills: string[]; demand_count: number
}

const CAREER_STAGES = [
  { key: 'first_job', icon: '🎓', label: 'First Job', desc: 'Starting your career, little or no work experience yet' },
  { key: 'internship', icon: '🧑‍💻', label: 'Internship', desc: 'Looking for internship or trainee opportunities' },
  { key: 'experienced', icon: '💼', label: 'Experienced Professional', desc: 'Already working, building on your career' },
  { key: 'career_change', icon: '🔄', label: 'Career Change', desc: 'Moving into a new field or role' },
  { key: 'freelance', icon: '🧾', label: 'Freelance / Contract', desc: 'Independent, project-based work' },
] as const

type CareerStage = typeof CAREER_STAGES[number]['key']

const STEPS = [
  { key: 'stage', label: 'Goal' },
  { key: 'role', label: 'Target Role' },
  { key: 'about', label: 'About You' },
  { key: 'summary', label: 'Summary' },
  { key: 'experience', label: 'Experience' },
  { key: 'education', label: 'Education' },
  { key: 'skills', label: 'Skills' },
  { key: 'projects', label: 'Projects' },
  { key: 'certifications', label: 'Certifications' },
  { key: 'achievements', label: 'Achievements' },
  { key: 'template', label: 'Template' },
  { key: 'finish', label: 'ATS Check' },
] as const

export default function CreateFromScratchPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const aiMode = searchParams.get('mode') === 'ai'
  const user = useAuthStore((s) => s.user)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)

  const [stepIdx, setStepIdx] = useState(0)
  const step = STEPS[stepIdx].key

  const [careerStage, setCareerStage] = useState<CareerStage | null>(null)

  // role search (mirrors /resumes/build's role picker, trimmed — no
  // EduBridge prefill/voice here, this is the manual/AI-assisted flow)
  const [roleSearch, setRoleSearch] = useState('')
  const [roleOptions, setRoleOptions] = useState<RoleListItem[]>([])
  const [topRoles, setTopRoles] = useState<RoleListItem[]>([])
  const [roleSearching, setRoleSearching] = useState(false)
  const [selectedRole, setSelectedRole] = useState<RoleListItem | null>(null)
  const latestRoleQueryRef = useRef('')

  const [content, setContent] = useState<ResumeContent>(emptyContent())
  const patch = <K extends keyof ResumeContent>(key: K, value: ResumeContent[K]) =>
    setContent((c) => ({ ...c, [key]: value }))

  const [summaryChoice, setSummaryChoice] = useState<'write' | 'ai' | 'skip' | null>(aiMode ? 'ai' : null)
  const [summaryGenerating, setSummaryGenerating] = useState(false)
  const [summaryError, setSummaryError] = useState('')

  const [templateId, setTemplateId] = useState('modern')

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [health, setHealth] = useState<{ score: number | null; ats_compatibility: number | null; resume_quality: number | null } | null>(null)
  const [healthError, setHealthError] = useState('')

  useEffect(() => {
    if (!hasHydrated) return
    if (!user) {
      setPostLoginRedirect(pathname + (searchParams.toString() ? `?${searchParams.toString()}` : ''))
      router.replace('/auth/login')
    }
  }, [user, hasHydrated, pathname, router, searchParams])

  /* ── role search ─────────────────────────────────────────── */
  useEffect(() => {
    if (step !== 'role') return
    const q = roleSearch
    latestRoleQueryRef.current = q
    setRoleSearching(true)
    const t = setTimeout(() => {
      api.get<{ roles: RoleListItem[] }>(`/api/roles?search=${encodeURIComponent(q)}&limit=24`)
        .then((r) => { if (latestRoleQueryRef.current === q) setRoleOptions(r.roles) })
        .catch(() => {})
        .finally(() => { if (latestRoleQueryRef.current === q) setRoleSearching(false) })
    }, 250)
    return () => clearTimeout(t)
  }, [roleSearch, step])

  useEffect(() => {
    api.get<{ roles: RoleListItem[] }>('/api/roles?limit=9').then((r) => setTopRoles(r.roles)).catch(() => {})
  }, [])

  const pickRole = (role: RoleListItem) => {
    setSelectedRole(role)
    patch('personalInfo', { ...content.personalInfo, jobTitle: role.canonical_title })
  }

  /* ── AI summary ──────────────────────────────────────────── */
  const generateSummary = async () => {
    setSummaryGenerating(true); setSummaryError('')
    try {
      const experienceHint = content.experience.length
        ? content.experience.map((e) => `${e.position} at ${e.company}`).join('; ')
        : content.personalInfo.jobTitle || selectedRole?.canonical_title || careerStage || ''
      const skillsHint = content.skills.map((s) => s.name).join(', ')
      const r = await api.post<{ summary: string }>('/api/ai/generate-summary', { experience: experienceHint, skills: skillsHint })
      if (r.summary) patch('summary', r.summary)
      setSummaryChoice('ai')
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : 'AI suggestions are temporarily unavailable. You can write your summary yourself, or skip for now.')
    } finally {
      setSummaryGenerating(false)
    }
  }

  // "Build with AI" (?mode=ai) pre-selects the AI option — actually trigger
  // the generation once on arrival instead of leaving the textarea empty,
  // so the "AI drafts, you approve" promise on the chooser card is real.
  const aiSummaryAutoTriggered = useRef(false)
  useEffect(() => {
    if (step !== 'summary' || !aiMode || aiSummaryAutoTriggered.current) return
    aiSummaryAutoTriggered.current = true
    generateSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, aiMode])

  /* ── finish: save + canonical Resume ATS Health check ───────── */
  const finish = async () => {
    setCreating(true); setCreateError('')
    try {
      const r = await api.post<{ id: string }>('/api/resumes/', {
        title: content.personalInfo.fullName
          ? `${content.personalInfo.fullName} — ${content.personalInfo.jobTitle || 'Resume'}`
          : (content.personalInfo.jobTitle || 'Untitled Resume'),
        template_id: templateId,
        content,
      })
      setCreatedId(r.id)
      try {
        const check = await api.post<{ resume_health: { available: boolean; score: number | null; layers?: { ats_compatibility?: { score: number | null }; resume_quality?: { score: number | null } } } }>(
          '/api/ats/v2/check', { resume_id: r.id })
        if (check.resume_health?.available) {
          setHealth({
            score: check.resume_health.score,
            ats_compatibility: check.resume_health.layers?.ats_compatibility?.score ?? null,
            resume_quality: check.resume_health.layers?.resume_quality?.score ?? null,
          })
        }
      } catch {
        setHealthError("Resume Health couldn't be calculated right now. Your resume is saved — you can check it anytime from the editor.")
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not save your resume. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const goNext = () => {
    if (step === 'finish') return
    if (stepIdx === STEPS.length - 2) { finish(); setStepIdx((i) => i + 1); return }
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1))
  }
  const goBack = () => setStepIdx((i) => Math.max(i - 1, 0))
  const goTo = (i: number) => { if (i <= stepIdx || createdId) setStepIdx(i) }

  // A step is "done" for the progress rail if it has real content — purely
  // a UI signal, never sent anywhere or used for scoring.
  const stepDone = useMemo(() => ({
    stage: !!careerStage,
    role: !!(content.personalInfo.jobTitle || selectedRole),
    about: !!(content.personalInfo.fullName && content.personalInfo.email),
    summary: !!content.summary.trim() || summaryChoice === 'skip',
    experience: content.experience.length > 0,
    education: content.education.length > 0,
    skills: content.skills.length > 0,
    projects: content.projects.length > 0,
    certifications: content.certifications.length > 0,
    achievements: content.achievements.length > 0,
    template: true,
    finish: !!createdId,
  }), [careerStage, content, selectedRole, summaryChoice, createdId])

  if (!user) return null

  const topBar = (
    <div className="flex-1">
      <h1 className="text-sm font-semibold text-gray-800">
        {aiMode ? '✨ Build with AI' : 'Create from Scratch'}
      </h1>
      <p className="text-xs text-gray-500">
        {aiMode ? 'Answer a few quick questions — AI drafts, you approve.' : 'Build your resume step by step'}
      </p>
    </div>
  )

  return (
    <AppShell topBar={topBar}>
      <div className="flex h-[calc(100vh-56px)] overflow-hidden">
        {/* Left: step rail */}
        <nav className="w-56 bg-white border-r border-gray-100 overflow-y-auto flex-shrink-0 hidden md:block">
          <ol className="p-3 space-y-0.5">
            {STEPS.map((s, i) => (
              <li key={s.key}>
                <button
                  onClick={() => goTo(i)}
                  disabled={i > stepIdx && !createdId}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition ${
                    i === stepIdx ? 'bg-royal-50 text-navy-700 font-medium' : 'text-gray-600 hover:bg-gray-50 disabled:hover:bg-transparent disabled:opacity-50'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${
                    (stepDone as Record<string, boolean>)[s.key] ? 'bg-green-500 text-white' : i === stepIdx ? 'bg-royal-500 text-white' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {(stepDone as Record<string, boolean>)[s.key] ? '✓' : i + 1}
                  </span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {/* Center: current step */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6 md:p-8">
            {/* mobile progress bar */}
            <div className="md:hidden mb-5">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Step {stepIdx + 1} of {STEPS.length}</span>
                <span>{STEPS[stepIdx].label}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-royal-500 transition-all" style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }} />
              </div>
            </div>

            {step === 'stage' && (
              <StepShell title="What are you looking for?" desc="This helps us tailor suggestions — it isn't shown on your resume.">
                <div className="grid gap-3 sm:grid-cols-2">
                  {CAREER_STAGES.map((s) => (
                    <button key={s.key} onClick={() => setCareerStage(s.key)}
                      className={`text-left rounded-xl border-2 p-4 transition ${careerStage === s.key ? 'border-royal-500 bg-royal-50/60' : 'border-gray-200 bg-white hover:border-royal-200'}`}>
                      <div className="text-xl mb-1">{s.icon}</div>
                      <div className="font-semibold text-sm text-gray-900">{s.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </StepShell>
            )}

            {step === 'role' && (
              <StepShell title="What role are you targeting?" desc="Search for a role to get relevant skill and keyword suggestions — or skip and type your own title.">
                <input autoFocus value={roleSearch} onChange={(e) => setRoleSearch(e.target.value)}
                  placeholder="e.g. Java Developer, Frontend Developer, Software Engineer…"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-royal-500 focus:ring-2 focus:ring-royal-100 outline-none" />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(roleSearch.trim() ? roleOptions : topRoles).map((r) => (
                    <button key={r.slug} onClick={() => pickRole(r)}
                      className={`text-left rounded-xl border p-3 transition ${selectedRole?.slug === r.slug ? 'border-royal-500 bg-royal-50/60' : 'border-gray-200 bg-white hover:border-royal-300'}`}>
                      <div className="font-medium text-sm text-gray-900">{r.canonical_title}</div>
                      {r.industry && <div className="text-[11px] text-gray-500 mt-0.5">{r.industry}</div>}
                    </button>
                  ))}
                  {roleSearching && <p className="text-xs text-gray-400 col-span-2">Searching…</p>}
                  {!roleSearching && roleSearch.trim() && roleOptions.length === 0 && (
                    <p className="text-xs text-gray-500 col-span-2">No exact match — that's fine, just type your title below.</p>
                  )}
                </div>
                <div className="mt-4">
                  <label className="block text-xs text-gray-500 mb-1">Or just type your target job title</label>
                  <input value={content.personalInfo.jobTitle}
                    onChange={(e) => { setSelectedRole(null); patch('personalInfo', { ...content.personalInfo, jobTitle: e.target.value }) }}
                    placeholder="Your target job title"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
                </div>
              </StepShell>
            )}

            {step === 'about' && (
              <StepShell title="Tell us about yourself" desc="Your contact details, as they'll appear on your resume.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    ['fullName', 'Full Name', 'John Doe'],
                    ['email', 'Email', 'john@example.com'],
                    ['phone', 'Phone', '+91 98765 43210'],
                    ['location', 'Location', 'Bengaluru, India'],
                  ] as const).map(([key, label, placeholder]) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input value={content.personalInfo[key]}
                        onChange={(e) => patch('personalInfo', { ...content.personalInfo, [key]: e.target.value })}
                        placeholder={placeholder}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
                    </div>
                  ))}
                </div>
              </StepShell>
            )}

            {step === 'summary' && (
              <StepShell title="Professional Summary" desc="A short pitch at the top of your resume. Optional — you can always add it later.">
                {summaryChoice === null && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <button onClick={() => setSummaryChoice('write')} className="rounded-xl border-2 border-gray-200 hover:border-royal-300 p-4 text-left transition">
                      <div className="text-lg mb-1">✍️</div>
                      <div className="font-semibold text-sm">Write myself</div>
                    </button>
                    <button onClick={generateSummary} disabled={summaryGenerating} className="rounded-xl border-2 border-gray-200 hover:border-royal-300 p-4 text-left transition disabled:opacity-50">
                      <div className="text-lg mb-1">✨</div>
                      <div className="font-semibold text-sm">{summaryGenerating ? 'Generating…' : 'Generate with AI'}</div>
                    </button>
                    <button onClick={() => setSummaryChoice('skip')} className="rounded-xl border-2 border-gray-200 hover:border-royal-300 p-4 text-left transition">
                      <div className="text-lg mb-1">⏭️</div>
                      <div className="font-semibold text-sm">Skip for now</div>
                    </button>
                  </div>
                )}
                {summaryError && <p className="mt-3 text-sm text-red-600">{summaryError}</p>}
                {(summaryChoice === 'write' || summaryChoice === 'ai') && (
                  <div className="mt-3">
                    <textarea value={content.summary} onChange={(e) => patch('summary', e.target.value)} rows={5}
                      placeholder="Results-driven professional with…"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
                    <div className="mt-2 flex items-center gap-3">
                      <button onClick={generateSummary} disabled={summaryGenerating} className="text-xs font-medium text-navy-600 hover:text-royal-800 disabled:opacity-50">
                        {summaryGenerating ? '✨ Generating…' : '✨ Regenerate with AI'}
                      </button>
                      <button onClick={() => { setSummaryChoice(null); patch('summary', '') }} className="text-xs text-gray-400 hover:text-gray-600">Start over</button>
                    </div>
                  </div>
                )}
                {summaryChoice === 'skip' && (
                  <p className="mt-3 text-sm text-gray-500">Skipped — you can add a summary anytime from the editor.
                    <button onClick={() => setSummaryChoice(null)} className="ml-2 text-navy-600 hover:underline">Undo</button>
                  </p>
                )}
              </StepShell>
            )}

            {step === 'experience' && (
              <StepShell title="Work Experience" desc="Add roles you've held. No experience yet? Skip this and add Projects instead.">
                <ExperienceEditor data={content.experience} onChange={(v) => patch('experience', v)} />
              </StepShell>
            )}
            {step === 'education' && (
              <StepShell title="Education" desc="Your degrees, diplomas, or relevant coursework.">
                <EducationEditor data={content.education} onChange={(v) => patch('education', v)} />
              </StepShell>
            )}
            {step === 'skills' && (
              <StepShell title="Skills" desc="Pick skills recruiters search for — tailored to your target role.">
                <SkillsEditor data={content.skills} jobTitle={content.personalInfo.jobTitle} onChange={(v) => patch('skills', v)} />
              </StepShell>
            )}
            {step === 'projects' && (
              <StepShell title="Projects" desc="Showcase practical work that demonstrates your skills — especially valuable with little formal experience.">
                <ProjectsEditor data={content.projects} onChange={(v) => patch('projects', v)} />
              </StepShell>
            )}
            {step === 'certifications' && (
              <StepShell title="Certifications" desc="Add relevant certifications, courses, or credentials.">
                <CertificationsEditor data={content.certifications} onChange={(v) => patch('certifications', v)} />
              </StepShell>
            )}
            {step === 'achievements' && (
              <StepShell title="Achievements" desc="Show what you achieved beyond daily responsibilities — awards, recognition, leadership, competitions, publications.">
                <ListEditor data={content.achievements} onChange={(v) => patch('achievements', v)} placeholder="e.g. Won regional coding competition, 2023" />
              </StepShell>
            )}

            {step === 'template' && (
              <StepShell title="Choose a Template" desc="Changing templates never changes your content — switch anytime from the editor too.">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {TEMPLATE_LIST.map((t) => (
                    <button key={t.id} onClick={() => setTemplateId(t.id)}
                      className={`rounded-xl overflow-hidden border-2 transition ${templateId === t.id ? 'border-royal-500 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="relative h-28 bg-gray-50 overflow-hidden">
                        <div className="absolute inset-0" style={{ transform: 'scale(0.28)', transformOrigin: 'top left', width: '357%', height: '357%' }}>
                          <ResumeTemplates content={DUMMY_RESUME} template={t.id} />
                        </div>
                        {templateId === t.id && (
                          <div className="absolute inset-0 bg-royal-500/10 flex items-center justify-center">
                            <div className="w-6 h-6 bg-navy-600 rounded-full flex items-center justify-center text-white text-xs">✓</div>
                          </div>
                        )}
                      </div>
                      <div className="p-2 bg-white text-left">
                        <div className="text-xs font-semibold text-gray-800">{t.name}</div>
                        <div className="text-[10px] text-gray-400 truncate">{t.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </StepShell>
            )}

            {step === 'finish' && (
              <StepShell title="Resume ATS Health" desc="Your resume is saved. Here's where it stands right now.">
                {creating && (
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span className="w-5 h-5 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" /> Saving your resume…
                  </div>
                )}
                {createError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{createError}
                    <button onClick={finish} className="ml-2 underline">Try again</button>
                  </div>
                )}
                {createdId && !creating && (
                  <div className="space-y-4">
                    {health?.score != null ? (
                      <div className="flex items-center gap-6">
                        <CircularScore score={health.score} label="Resume ATS Health" color={health.score >= 75 ? '#1E7A46' : health.score >= 50 ? '#F5A623' : '#c0392b'} />
                        <div className="text-sm text-gray-600 space-y-1">
                          {health.ats_compatibility != null && <div>ATS Compatibility: <b>{health.ats_compatibility}</b></div>}
                          {health.resume_quality != null && <div>Resume Quality: <b>{health.resume_quality}</b></div>}
                          <p className="text-xs text-gray-400 max-w-xs">You can improve this anytime from the editor's AI Fixes tab.</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">{healthError || 'Calculating…'}</p>
                    )}
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => router.push(`/resumes/${createdId}/edit`)} className="btn-primary px-6 py-2.5 text-sm">
                        Go to Editor →
                      </button>
                      <button onClick={() => router.push('/dashboard')} className="px-6 py-2.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition">
                        Back to Dashboard
                      </button>
                    </div>
                  </div>
                )}
              </StepShell>
            )}

            {/* Nav buttons */}
            {step !== 'finish' && (
              <div className="mt-8 flex items-center justify-between">
                <button onClick={goBack} disabled={stepIdx === 0}
                  className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-0">← Back</button>
                <div className="flex items-center gap-2">
                  {stepIdx > 0 && (
                    <button onClick={goNext} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Skip</button>
                  )}
                  <button onClick={goNext} disabled={creating}
                    className="btn-primary px-6 py-2.5 text-sm disabled:opacity-50">
                    {stepIdx === STEPS.length - 2 ? (creating ? 'Saving…' : 'Create my resume →') : 'Continue →'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: live preview */}
        <div className="w-[380px] border-l border-gray-100 bg-[#F0F2F8] overflow-y-auto p-4 hidden lg:block flex-shrink-0">
          <p className="text-xs font-medium text-gray-500 mb-2">Live preview</p>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="max-h-[75vh] overflow-auto">
              <div className="origin-top scale-[0.72]">
                <ResumeTemplates content={content} template={templateId} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function StepShell({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade-up">
      <h2 className="text-lg font-bold text-gray-900 font-display">{title}</h2>
      <p className="text-sm text-gray-500 mt-1 mb-5">{desc}</p>
      {children}
    </div>
  )
}
