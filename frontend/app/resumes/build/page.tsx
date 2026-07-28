'use client'

/**
 * Build-from-role flow (Milestone C — the pre-fill USP).
 *
 * Role picker → candidate-confirmed build flow with the mandatory source colours:
 *   GREEN = EduBridge record (verified)   BLUE = AI suggestion (confirm)   GREY = your own content
 * Nothing AI-suggested is written as fact: skills start unticked, the summary must
 * be confirmed, and bullet scaffolds are blank templates the candidate fills in.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
import ResumePreview, { type ResumeContent } from '@/components/ResumePreview'

interface RoleListItem {
  slug: string; canonical_title: string; industry?: string
  salary_min?: number | null; salary_max?: number | null
  demand_count: number; top_skills: string[]
}
interface Prefill {
  role: {
    slug: string; canonical_title: string; industry?: string
    salary_min?: number | null; salary_max?: number | null
    typical_education?: string | null; typical_selection_process?: string | null
    demand_count?: number
  }
  green: {
    education: any[]; edubridge_training: string[]; certificates: any[]
    college?: string | null; course?: string | null; has_record: boolean
  }
  blue: { summary: string; skills_checklist: { skill: string; checked: boolean }[] }
  grey: { bullet_scaffolds: string[] }
  ats_keywords: string[]
  is_fresher: boolean
}

const money = (n?: number | null) => (n ? `₹${n.toLocaleString('en-IN')}` : null)
const hasBlank = (s: string) => /_{3,}/.test(s)

/** Merge Float32 chunks, downsample to 16 kHz, and encode a mono PCM16 WAV. */
function encodeWav(chunks: Float32Array[], inRate: number, outRate = 16000): ArrayBuffer {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const merged = new Float32Array(total)
  let off = 0
  for (const c of chunks) { merged.set(c, off); off += c.length }

  // downsample
  const ratio = inRate / outRate
  const outLen = Math.floor(merged.length / ratio)
  const samples = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) samples[i] = merged[Math.floor(i * ratio)]

  // WAV (44-byte header + PCM16)
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buf)
  const wr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
  wr(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); wr(8, 'WAVE')
  wr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, outRate, true); view.setUint32(28, outRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  wr(36, 'data'); view.setUint32(40, samples.length * 2, true)
  let o = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2
  }
  return buf
}

export default function BuildFromRolePage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  const [step, setStep] = useState<'pick' | 'build'>('pick')
  const [search, setSearch] = useState('')
  const [roles, setRoles] = useState<RoleListItem[]>([])
  const [topRoles, setTopRoles] = useState<RoleListItem[]>([])
  const [loadingRoles, setLoadingRoles] = useState(false)
  const [error, setError] = useState('')

  const [prefill, setPrefill] = useState<Prefill | null>(null)
  const [loadingPrefill, setLoadingPrefill] = useState(false)
  const [saving, setSaving] = useState(false)

  interface Ats { score: number; breakdown: Record<string, number>; prioritized_fixes: { title: string; detail: string; category: string; impact_points: number }[]; keyword_coverage: { coverage_pct: number } }
  const [ats, setAts] = useState<Ats | null>(null)
  const [atsLoading, setAtsLoading] = useState(false)

  const [polishing, setPolishing] = useState(false)
  const [polishMsg, setPolishMsg] = useState('')

  // language & voice (Milestone E)
  const [langOpen, setLangOpen] = useState(false)
  const [langText, setLangText] = useState('')
  const [langBusy, setLangBusy] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [recording, setRecording] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Float32Array[]>([])

  // editable build state
  const [header, setHeader] = useState({ fullName: '', jobTitle: '', email: '', phone: '', location: '' })
  const [summary, setSummary] = useState('')
  const [summaryConfirmed, setSummaryConfirmed] = useState(false)
  const [skillChecks, setSkillChecks] = useState<{ skill: string; checked: boolean }[]>([])
  const [bullets, setBullets] = useState<string[]>([])

  useEffect(() => { if (!user) router.push('/auth/login') }, [user, router])

  /* ── role picker ─────────────────────────────────────────── */
  const loadRoles = useCallback(async (q: string) => {
    setLoadingRoles(true); setError('')
    try {
      const r = await api.get<{ roles: RoleListItem[] }>(`/api/roles?search=${encodeURIComponent(q)}&limit=40`)
      setRoles(r.roles)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load roles')
    } finally { setLoadingRoles(false) }
  }, [])

  useEffect(() => {
    if (step !== 'pick') return
    const t = setTimeout(() => loadRoles(search), 250)
    return () => clearTimeout(t)
  }, [search, step, loadRoles])

  // popular-roles fallback (shown when a search has no exact match)
  useEffect(() => {
    api.get<{ roles: RoleListItem[] }>('/api/roles?limit=12')
      .then((r) => setTopRoles(r.roles)).catch(() => {})
  }, [])

  /* ── select role → prefill ───────────────────────────────── */
  const pickRole = async (slug: string) => {
    setLoadingPrefill(true); setError('')
    try {
      const p = await api.post<Prefill>(`/api/roles/${slug}/prefill`, {})
      setPrefill(p)
      setHeader({
        fullName: user?.full_name || '',
        jobTitle: p.role.canonical_title,
        email: user?.email || '',
        phone: '', location: '',
      })
      setSummary(p.blue.summary)
      setSummaryConfirmed(false)
      setSkillChecks(p.blue.skills_checklist)
      setBullets(p.grey.bullet_scaffolds)
      setStep('build')
      window.scrollTo(0, 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build from this role')
    } finally { setLoadingPrefill(false) }
  }

  /* ── assemble content (live preview + save) ──────────────── */
  const content: ResumeContent = useMemo(() => {
    const confirmedSkills = skillChecks.filter((s) => s.checked).map((s) => ({ name: s.skill, level: 75 }))
    const filledBullets = bullets.map((b) => b.trim()).filter((b) => b && !hasBlank(b))
    const green = prefill?.green
    const education = (green?.education || []).map((e: any, i: number) => ({
      id: `edu${i}`,
      degree: e.qualification || e.degree || green?.course || '',
      field: e.field || '',
      institution: e.board || e.institution || e.university || green?.college || '',
      location: '', startDate: '', endDate: e.year || e.endDate || '', gpa: e.marks || e.gpa || '',
    }))
    if (!education.length && (green?.college || green?.course)) {
      education.push({ id: 'edu0', degree: green?.course || '', field: '', institution: green?.college || '',
        location: '', startDate: '', endDate: '', gpa: '' })
    }
    const certifications = (green?.certificates || []).map((c: any, i: number) => ({
      id: `cert${i}`, name: c.name || String(c), issuer: c.issuer || 'EduBridge', date: c.date || '',
    }))
    const training = (green?.edubridge_training || []).map((t: string, i: number) => ({
      id: `proj${i}`, name: t, technologies: 'EduBridge Training', description: '',
    }))
    const experience = filledBullets.length
      ? [{ id: 'exp0', position: prefill?.role.canonical_title || '', company: '', location: '',
           startDate: '', endDate: '', current: false, bullets: filledBullets }]
      : []
    return {
      personalInfo: { ...header },
      summary: summaryConfirmed ? summary.trim() : '',
      experience,
      education,
      skills: confirmedSkills,
      projects: training,
      certifications,
      languages: [],
      achievements: [],
      interests: [],
    }
  }, [header, summary, summaryConfirmed, skillChecks, bullets, prefill])

  // check whether Sarvam voice is configured (mic shown only if so)
  useEffect(() => {
    if (step !== 'build') return
    api.get<{ voice_enabled: boolean }>('/api/voice/status')
      .then((r) => setVoiceEnabled(r.voice_enabled)).catch(() => setVoiceEnabled(false))
  }, [step])

  const convertLang = async () => {
    if (!langText.trim()) return
    setLangBusy(true); setError('')
    try {
      const r = await api.post<{ english: string }>('/api/voice/to-english', { text: langText })
      if (r.english) { setSummary(r.english); setSummaryConfirmed(false); setLangOpen(false) }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not convert')
    } finally { setLangBusy(false) }
  }

  // Record 16 kHz mono WAV (Sarvam-friendly) via the Web Audio API — MediaRecorder
  // only produces webm/opus which the STT API rejects.
  const stopRecording = async () => {
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    const ctx = audioCtxRef.current
    const sampleRate = ctx?.sampleRate || 48000
    if (ctx) await ctx.close().catch(() => {})
    setRecording(false)

    const wav = encodeWav(chunksRef.current, sampleRate)
    chunksRef.current = []
    if (wav.byteLength < 2000) { setError('Recording too short — please try again.'); return }

    setLangBusy(true)
    try {
      const form = new FormData()
      form.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav')
      form.append('language', 'hi-IN')
      const token = useAuthStore.getState().accessToken
      const res = await fetch(`${API}/api/voice/transcribe`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Transcription failed')
      if (!data.text) setError('Didn’t catch that — please speak clearly and try again.')
      else setLangText((prev) => (prev ? prev + ' ' : '') + data.text)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Voice failed — please type instead.')
    } finally { setLangBusy(false) }
  }

  const toggleRecording = async () => {
    if (recording) { stopRecording(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      chunksRef.current = []
      processor.onaudioprocess = (e) => {
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      }
      source.connect(processor); processor.connect(ctx.destination)
      audioCtxRef.current = ctx; sourceRef.current = source
      processorRef.current = processor; streamRef.current = stream
      setError(''); setRecording(true)
    } catch {
      setError('Microphone unavailable — please type instead.')
    }
  }

  const polish = async () => {
    setPolishing(true); setPolishMsg(''); setError('')
    try {
      const texts = [summary, ...bullets]
      const r = await api.post<{ results: { corrected: string; num_fixes: number }[]; num_fixes: number }>(
        '/api/writing/grammar', { texts })
      setSummary(r.results[0].corrected)
      setBullets(r.results.slice(1).map((x) => x.corrected))
      setPolishMsg(r.num_fixes ? `${r.num_fixes} grammar/spelling fix${r.num_fixes > 1 ? 'es' : ''} applied` : 'Looks clean — no fixes needed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Grammar check failed')
    } finally { setPolishing(false) }
  }

  const runAts = async () => {
    if (!prefill) return
    setAtsLoading(true)
    try {
      const r = await api.post<Ats>('/api/ats/analyze', { content, role_slug: prefill.role.slug })
      setAts(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check ATS')
    } finally { setAtsLoading(false) }
  }

  const save = async () => {
    setSaving(true); setError('')
    try {
      const r = await api.post<{ id: string }>('/api/resumes/', {
        title: `${header.fullName || 'My'} — ${prefill?.role.canonical_title || 'Resume'}`,
        template_id: 'modern',
        content,
        source: 'role_builder',
      })
      router.push(`/resumes/${r.id}/edit`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save resume')
      setSaving(false)
    }
  }

  /* ─────────────────────────── UI ─────────────────────────── */
  if (!user) return null

  return (
    <div className="min-h-screen bg-[#F5F7FA] px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Build a resume from your role</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pick the job you’re targeting — we pre-fill from real hiring data. You confirm everything.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>
        )}

        {/* ── STEP 1: role picker ─────────────────────────────── */}
        {step === 'pick' && (
          <div>
            <input
              autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search roles… e.g. Sales Executive, Data Entry Operator"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm
                         focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
            />
            {loadingPrefill && <p className="mt-3 text-sm text-indigo-600">Building from your role… <span className="text-gray-500">(the server may take up to ~30s to wake on the first visit)</span></p>}
            {(() => {
              const noMatch = !loadingRoles && roles.length === 0 && search.trim() !== ''
              const showPopular = noMatch && topRoles.length > 0
              const list = roles.length ? roles : (showPopular ? topRoles : [])
              return (
                <>
                  {showPopular && (
                    <p className="mt-4 text-sm text-gray-600">
                      No exact match for “{search}”. Here are the most in-demand roles — pick the closest, or try a broader word (e.g. “developer”, “sales”, “operator”).
                    </p>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {loadingRoles && !roles.length && <p className="text-sm text-gray-500">Loading roles… <span className="text-gray-400">(the server may take up to ~30s to wake on the first visit)</span></p>}
                    {list.map((r) => (
                      <button key={r.slug} onClick={() => pickRole(r.slug)} disabled={loadingPrefill}
                        className="text-left rounded-xl border border-gray-200 bg-white p-4 shadow-sm
                                   hover:border-indigo-400 hover:shadow transition disabled:opacity-50">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-gray-900">{r.canonical_title}</span>
                          {r.industry && <span className="text-[11px] rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5">{r.industry}</span>}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {r.demand_count.toLocaleString('en-IN')} hiring records
                          {money(r.salary_min) && money(r.salary_max) && ` · ${money(r.salary_min)}–${money(r.salary_max)}/yr`}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {r.top_skills.slice(0, 3).map((s) => (
                            <span key={s} className="text-[11px] rounded bg-gray-100 text-gray-600 px-1.5 py-0.5">{s}</span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {/* ── STEP 2: build flow ──────────────────────────────── */}
        {step === 'build' && prefill && (
          <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
            {/* left: the form */}
            <div className="space-y-5">
              <button onClick={() => setStep('pick')} className="text-sm text-indigo-600 hover:underline">← Change role</button>

              {/* legend */}
              <div className="flex flex-wrap gap-3 text-xs">
                <Legend color="green" label="EduBridge record (verified)" />
                <Legend color="blue" label="AI suggestion — confirm" />
                <Legend color="grey" label="Your own content" />
              </div>

              {/* header (grey) */}
              <Section tone="grey" title="Your details">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Full name" value={header.fullName} onChange={(v) => setHeader({ ...header, fullName: v })} />
                  <Field label="Job title" value={header.jobTitle} onChange={(v) => setHeader({ ...header, jobTitle: v })} />
                  <Field label="Email" value={header.email} onChange={(v) => setHeader({ ...header, email: v })} />
                  <Field label="Phone" value={header.phone} onChange={(v) => setHeader({ ...header, phone: v })} />
                  <Field label="Location" value={header.location} onChange={(v) => setHeader({ ...header, location: v })} />
                </div>
              </Section>

              {/* green: EduBridge record */}
              <Section tone="green" title="From your EduBridge record">
                {prefill.green.has_record ? (
                  <ul className="text-sm text-gray-700 space-y-1">
                    {prefill.green.college && <li>🎓 {prefill.green.course ? `${prefill.green.course}, ` : ''}{prefill.green.college}</li>}
                    {prefill.green.edubridge_training.map((t, i) => <li key={i}>📘 {t}</li>)}
                    {prefill.green.certificates.map((c: any, i) => <li key={i}>✅ {c.name || String(c)}</li>)}
                    {!prefill.green.college && !prefill.green.edubridge_training.length && !prefill.green.certificates.length &&
                      <li className="text-gray-500">Your record is empty — add details from Settings later.</li>}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No EduBridge record yet. You can add education & training from the editor after this step.</p>
                )}
              </Section>

              {/* blue: summary */}
              <Section tone="blue" title="Suggested professional summary">
                {/* Hindi / English → professional English (Milestone E) */}
                <div className="mb-2">
                  <button onClick={() => setLangOpen((v) => !v)} className="text-xs text-indigo-600 hover:underline">
                    🗣️ {langOpen ? 'Hide' : 'Prefer Hindi? Speak or type in Hindi/English →'}
                  </button>
                  {langOpen && (
                    <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-2">
                      <textarea value={langText} onChange={(e) => setLangText(e.target.value)} rows={3}
                        lang="hi"
                        placeholder="हिंदी या English में लिखें… जैसे: मैंने बैंक में सेल्स का काम किया, रोज़ 25 ग्राहकों से बात की।"
                        className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100" />
                      <div className="mt-2 flex items-center gap-2">
                        <button onClick={convertLang} disabled={langBusy || !langText.trim()}
                          className="text-xs rounded-lg bg-indigo-600 text-white px-3 py-1.5 disabled:opacity-50">
                          {langBusy ? 'Converting…' : 'Convert to professional English'}
                        </button>
                        {voiceEnabled ? (
                          <button onClick={toggleRecording} disabled={langBusy}
                            className={`text-xs rounded-lg px-3 py-1.5 border ${recording ? 'bg-red-500 text-white border-red-500' : 'border-indigo-200 text-indigo-700'}`}>
                            {recording ? '■ Stop' : '🎤 Speak'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-gray-500">🎤 Voice coming soon — type for now</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <textarea value={summary} onChange={(e) => { setSummary(e.target.value); }}
                  rows={4}
                  className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100" />
                <label className="mt-2 flex items-center gap-2 text-sm text-blue-800">
                  <input type="checkbox" checked={summaryConfirmed} onChange={(e) => setSummaryConfirmed(e.target.checked)} />
                  I’ve reviewed this and want to use it
                </label>
              </Section>

              {/* blue: skills checklist */}
              <Section tone="blue" title="Skills recruiters want for this role">
                <p className="text-xs text-blue-700/70 mb-2">Tick the ones that genuinely apply to you.</p>
                <div className="flex flex-wrap gap-2">
                  {skillChecks.map((s, i) => (
                    <label key={s.skill}
                      className={`cursor-pointer text-sm rounded-full px-3 py-1 border transition ${
                        s.checked ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-800 border-blue-200'}`}>
                      <input type="checkbox" className="hidden" checked={s.checked}
                        onChange={() => setSkillChecks(skillChecks.map((x, j) => j === i ? { ...x, checked: !x.checked } : x))} />
                      {s.skill}
                    </label>
                  ))}
                </div>
              </Section>

              {/* grey: bullet scaffolds */}
              <Section tone="grey" title="Describe what you did (fill in the blanks)">
                <p className="text-xs text-gray-500 mb-2">Replace the ______ with your own real experience. Empty or unfilled lines are skipped.</p>
                <div className="space-y-2">
                  {bullets.map((b, i) => (
                    <input key={i} value={b} onChange={(e) => setBullets(bullets.map((x, j) => j === i ? e.target.value : x))}
                      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-100 ${
                        hasBlank(b) ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`} />
                  ))}
                </div>
              </Section>

              {/* ats keywords */}
              <Section tone="grey" title="ATS / recruiter keywords for this role">
                <p className="text-xs text-gray-500 mb-2">Recruiters and screening software look for these. Work the true ones into your resume.</p>
                <div className="flex flex-wrap gap-1.5">
                  {prefill.ats_keywords.map((k) => (
                    <span key={k} className="text-[11px] rounded bg-gray-100 text-gray-600 px-2 py-0.5">{k}</span>
                  ))}
                </div>
              </Section>

              <div className="flex items-center justify-between gap-2">
                <button onClick={polish} disabled={polishing}
                  className="text-sm rounded-lg border border-gray-200 text-gray-700 px-3 py-2 hover:bg-gray-50 transition disabled:opacity-50">
                  {polishing ? 'Checking…' : '✓ Check grammar & spelling'}
                </button>
                {polishMsg && <span className="text-xs text-green-700">{polishMsg}</span>}
              </div>

              <button onClick={save} disabled={saving}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold py-3
                           shadow hover:opacity-95 transition disabled:opacity-50">
                {saving ? 'Creating your resume…' : 'Create my resume →'}
              </button>
            </div>

            {/* right: live preview */}
            <div className="lg:sticky lg:top-6 h-fit">
              <p className="text-xs font-medium text-gray-500 mb-2">Live preview</p>
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div className="max-h-[70vh] overflow-auto">
                  <div className="origin-top scale-[0.85] md:scale-100">
                    <ResumePreview content={content} template="modern" />
                  </div>
                </div>
              </div>

              {/* ATS readiness (Milestone D) */}
              <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">ATS readiness</p>
                  <button onClick={runAts} disabled={atsLoading}
                    className="text-xs rounded-lg border border-indigo-200 text-indigo-700 px-3 py-1.5 hover:bg-indigo-50 transition disabled:opacity-50">
                    {atsLoading ? 'Checking…' : ats ? 'Re-check' : 'Check my score'}
                  </button>
                </div>

                {ats && (
                  <div className="mt-3">
                    <div className="flex items-center gap-3">
                      <div className={`text-2xl font-bold ${ats.score >= 75 ? 'text-green-600' : ats.score >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                        {ats.score}<span className="text-sm text-gray-500">/100</span>
                      </div>
                      <span className="text-xs text-gray-500">Keyword coverage {ats.keyword_coverage.coverage_pct}%</span>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      {Object.entries(ats.breakdown).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2">
                          <span className="w-40 shrink-0 text-[11px] text-gray-500 truncate">{k}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className={`h-full ${v >= 75 ? 'bg-green-500' : v >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${v}%` }} />
                          </div>
                          <span className="w-8 text-right text-[11px] text-gray-500">{v}%</span>
                        </div>
                      ))}
                    </div>

                    {ats.prioritized_fixes.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-gray-700 mb-1">What to fix first</p>
                        <ol className="space-y-1.5">
                          {ats.prioritized_fixes.slice(0, 4).map((f, i) => (
                            <li key={i} className="text-xs text-gray-600 flex gap-2">
                              <span className="shrink-0 font-semibold text-indigo-600">+{f.impact_points}</span>
                              <span><b>{f.title}.</b> {f.detail}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
                {!ats && !atsLoading && (
                  <p className="mt-2 text-xs text-gray-500">See your score, a section-by-section breakdown, and the highest-impact fixes for this role.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── small presentational helpers ──────────────────────────── */
const TONE: Record<string, string> = {
  green: 'border-l-4 border-green-500 bg-green-50/50',
  blue: 'border-l-4 border-blue-400 bg-blue-50/50',
  grey: 'border-l-4 border-gray-300 bg-white',
}
function Section({ tone, title, children }: { tone: 'green' | 'blue' | 'grey'; title: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-gray-100 ${TONE[tone]} p-4 shadow-sm`}>
      <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
      {children}
    </div>
  )
}
const DOT: Record<string, string> = { green: 'bg-green-500', blue: 'bg-blue-400', grey: 'bg-gray-300' }
function Legend({ color, label }: { color: 'green' | 'blue' | 'grey'; label: string }) {
  return <span className="inline-flex items-center gap-1.5 text-gray-600"><span className={`w-2.5 h-2.5 rounded-full ${DOT[color]}`} />{label}</span>
}
function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] text-gray-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100" />
    </label>
  )
}
