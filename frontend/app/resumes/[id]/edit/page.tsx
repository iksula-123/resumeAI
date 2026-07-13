'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'
import CircularScore from '@/components/CircularScore'
import ResumeTemplates, { TEMPLATE_LIST } from '@/components/ResumeTemplates'
import VersionHistory from '@/components/VersionHistory'
import { CATEGORY_NAMES, detectCategory, suggestSkills, popularForCategory } from '@/lib/skillsData'

/* ─── Types ───────────────────────────────────────────────────── */
interface Skill { name: string; level: number }
interface Experience {
  id: string; position: string; company: string; location: string
  startDate: string; endDate: string; current: boolean; bullets: string[]
}
interface Education {
  id: string; degree: string; field: string; institution: string
  location: string; startDate: string; endDate: string; gpa: string
}
interface Project { id: string; name: string; technologies: string; description: string }
interface Certification { id: string; name: string; issuer: string; date: string }
interface Language { name: string; proficiency: string }

interface ResumeContent {
  personalInfo: { fullName: string; jobTitle: string; email: string; phone: string; location: string; linkedin: string; website: string; github: string }
  summary: string
  experience: Experience[]
  education: Education[]
  skills: Skill[]
  projects: Project[]
  certifications: Certification[]
  achievements: string[]
  languages: Language[]
  interests: string[]
}

interface Resume { id: string; title: string; template_id: string; content: ResumeContent; ats_score?: number }

/* ─── Section config ──────────────────────────────────────────── */
const SECTIONS = [
  { key: 'personalInfo', icon: '👤', label: 'Personal Information' },
  { key: 'summary', icon: '📝', label: 'Professional Summary' },
  { key: 'experience', icon: '💼', label: 'Work Experience' },
  { key: 'education', icon: '🎓', label: 'Education' },
  { key: 'skills', icon: '⚡', label: 'Skills' },
  { key: 'projects', icon: '🚀', label: 'Projects' },
  { key: 'certifications', icon: '🏆', label: 'Certifications' },
  { key: 'achievements', icon: '🌟', label: 'Achievements' },
  { key: 'languages', icon: '🌐', label: 'Languages' },
  { key: 'interests', icon: '❤️', label: 'Interests' },
]

const SCORE_BREAKDOWN = [
  { label: 'Formatting', key: 'formatting' },
  { label: 'Keywords', key: 'keywords' },
  { label: 'Skills', key: 'skills' },
  { label: 'Readability', key: 'readability' },
  { label: 'Experience', key: 'experience' },
  { label: 'Grammar', key: 'grammar' },
]

function uid() { return Math.random().toString(36).slice(2) }

function emptyContent(): ResumeContent {
  return {
    personalInfo: { fullName: '', jobTitle: '', email: '', phone: '', location: '', linkedin: '', website: '', github: '' },
    summary: '',
    experience: [], education: [], skills: [], projects: [],
    certifications: [], achievements: [], languages: [], interests: [],
  }
}

/* ─── Sub-editors ─────────────────────────────────────────────── */
function PersonalInfoEditor({ data, onChange }: { data: ResumeContent['personalInfo'], onChange: (d: ResumeContent['personalInfo']) => void }) {
  const fields: { key: keyof ResumeContent['personalInfo'], label: string, placeholder: string }[] = [
    { key: 'fullName', label: 'Full Name', placeholder: 'John Doe' },
    { key: 'jobTitle', label: 'Job Title', placeholder: 'Senior React Developer' },
    { key: 'email', label: 'Email', placeholder: 'john@example.com' },
    { key: 'phone', label: 'Phone', placeholder: '+1 (555) 123-4567' },
    { key: 'location', label: 'Location', placeholder: 'San Francisco, CA' },
    { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/johndoe' },
    { key: 'github', label: 'GitHub', placeholder: 'github.com/johndoe' },
    { key: 'website', label: 'Website', placeholder: 'johndoe.com' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map(f => (
        <div key={f.key}>
          <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
          <input
            value={data[f.key] || ''}
            onChange={e => onChange({ ...data, [f.key]: e.target.value })}
            placeholder={f.placeholder}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      ))}
    </div>
  )
}

function ExperienceEditor({ data, onChange }: { data: Experience[], onChange: (d: Experience[]) => void }) {
  const [busy, setBusy] = useState<string | null>(null)  // "i" (all) or "i-bi" (single)
  const add = () => onChange([...data, { id: uid(), position: '', company: '', location: '', startDate: '', endDate: '', current: false, bullets: [''] }])
  const upd = (i: number, patch: Partial<Experience>) => {
    const next = [...data]; next[i] = { ...next[i], ...patch }; onChange(next)
  }
  const remove = (i: number) => onChange(data.filter((_, j) => j !== i))
  const addBullet = (i: number) => upd(i, { bullets: [...data[i].bullets, ''] })
  const updBullet = (i: number, bi: number, v: string) => {
    const bullets = [...data[i].bullets]; bullets[bi] = v; upd(i, { bullets })
  }
  const removeBullet = (i: number, bi: number) => {
    const bullets = data[i].bullets.filter((_, j) => j !== bi); upd(i, { bullets })
  }

  // Rewrite a single bullet in place via AI
  const enhanceOne = async (i: number, bi: number) => {
    const text = data[i].bullets[bi]?.trim()
    if (!text) return
    setBusy(`${i}-${bi}`)
    try {
      const r = await api.post<{ enhanced: string }>('/api/ai/enhance-bullet', { bullet: text })
      if (r.enhanced) updBullet(i, bi, r.enhanced)
    } catch {} finally { setBusy(null) }
  }

  // Rewrite every non-empty bullet of an experience
  const enhanceAll = async (i: number) => {
    const bullets = data[i].bullets
    setBusy(String(i))
    try {
      const next = [...bullets]
      for (let bi = 0; bi < next.length; bi++) {
        const text = next[bi]?.trim()
        if (!text) continue
        try {
          const r = await api.post<{ enhanced: string }>('/api/ai/enhance-bullet', { bullet: text })
          if (r.enhanced) next[bi] = r.enhanced
        } catch {}
      }
      upd(i, { bullets: next })
    } finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      {data.map((exp, i) => (
        <div key={exp.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">{exp.position || `Experience ${i + 1}`}</span>
            <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['position', 'company', 'location'] as const).map(f => (
              <input key={f} value={exp[f]} onChange={e => upd(i, { [f]: e.target.value })}
                placeholder={f.charAt(0).toUpperCase() + f.slice(1)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            ))}
            <input value={exp.startDate} onChange={e => upd(i, { startDate: e.target.value })}
              placeholder="Jan 2021" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            {!exp.current && (
              <input value={exp.endDate} onChange={e => upd(i, { endDate: e.target.value })}
                placeholder="Present" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            )}
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={exp.current} onChange={e => upd(i, { current: e.target.checked })} />
              Currently working here
            </label>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-gray-500">Bullet Points</div>
              {exp.bullets.some(b => b.trim()) && (
                <button
                  onClick={() => enhanceAll(i)}
                  disabled={busy !== null}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                >
                  {busy === String(i) ? '✨ Improving…' : '✨ Improve all'}
                </button>
              )}
            </div>
            {exp.bullets.map((b, bi) => (
              <div key={bi} className="flex gap-1.5 mb-1 items-center">
                <input value={b} onChange={e => updBullet(i, bi, e.target.value)}
                  placeholder="Describe your achievement..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                {b.trim() && (
                  <button onClick={() => enhanceOne(i, bi)} disabled={busy !== null}
                    title="Rewrite this bullet with AI"
                    className="text-indigo-400 hover:text-indigo-600 disabled:opacity-40 text-sm px-1">
                    {busy === `${i}-${bi}` ? '⟳' : '✨'}
                  </button>
                )}
                <button onClick={() => removeBullet(i, bi)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
              </div>
            ))}
            <button onClick={() => addBullet(i)} className="text-xs text-indigo-600 hover:text-indigo-800 mt-1">+ Add bullet</button>
          </div>
        </div>
      ))}
      <button onClick={add} className="w-full border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 py-2 rounded-xl text-sm transition">
        + Add Experience
      </button>
    </div>
  )
}

function EducationEditor({ data, onChange }: { data: Education[], onChange: (d: Education[]) => void }) {
  const add = () => onChange([...data, { id: uid(), degree: '', field: '', institution: '', location: '', startDate: '', endDate: '', gpa: '' }])
  const upd = (i: number, patch: Partial<Education>) => { const n = [...data]; n[i] = { ...n[i], ...patch }; onChange(n) }
  const remove = (i: number) => onChange(data.filter((_, j) => j !== i))
  return (
    <div className="space-y-4">
      {data.map((edu, i) => (
        <div key={edu.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-gray-700">{edu.institution || `Education ${i + 1}`}</span>
            <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'degree', placeholder: 'Bachelor of Science' },
              { key: 'field', placeholder: 'Computer Science' },
              { key: 'institution', placeholder: 'MIT' },
              { key: 'location', placeholder: 'Cambridge, MA' },
              { key: 'startDate', placeholder: '2016' },
              { key: 'endDate', placeholder: '2020' },
              { key: 'gpa', placeholder: '3.8 (optional)' },
            ].map(f => (
              <input key={f.key} value={(edu as any)[f.key]} onChange={e => upd(i, { [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            ))}
          </div>
        </div>
      ))}
      <button onClick={add} className="w-full border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 py-2 rounded-xl text-sm transition">
        + Add Education
      </button>
    </div>
  )
}

function SkillsEditor({ data, onChange, jobTitle }: { data: Skill[], onChange: (d: Skill[]) => void, jobTitle?: string }) {
  const [input, setInput] = useState('')
  const [category, setCategory] = useState(() => detectCategory(jobTitle))
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [aiSkills, setAiSkills] = useState<string[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout>>()

  // Re-detect the category when the job title changes (unless user picked one)
  const touched = useRef(false)
  useEffect(() => {
    if (!touched.current) setCategory(detectCategory(jobTitle))
  }, [jobTitle])

  const names = data.map(s => s.name)
  const suggestions = suggestSkills(input, category, names, 8)
  const staticPopular = popularForCategory(category, names).slice(0, 12)
  // AI skills first (deduped against existing), then static popular
  const popular = [
    ...aiSkills.filter(s => !names.some(n => n.toLowerCase() === s.toLowerCase())),
    ...staticPopular.filter(s => !aiSkills.some(a => a.toLowerCase() === s.toLowerCase())),
  ].slice(0, 16)

  const askAI = async () => {
    setAiLoading(true)
    try {
      const r = await api.post<{ skills: string[] }>('/api/ai/suggest-skills', {
        job_title: jobTitle || category,
        existing: names,
      })
      if (r.skills?.length) setAiSkills(r.skills)
    } catch { /* keep static suggestions */ }
    finally { setAiLoading(false) }
  }

  const add = (name: string) => {
    const n = name.trim()
    if (!n || names.some(x => x.toLowerCase() === n.toLowerCase())) { setInput(''); return }
    onChange([...data, { name: n, level: 80 }])
    setInput('')
    setHighlight(0)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlight(h => Math.min(h + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      add(open && suggestions[highlight] ? suggestions[highlight] : input)
    } else if (e.key === 'Escape') { setOpen(false) }
  }

  const remove = (i: number) => onChange(data.filter((_, j) => j !== i))
  const updLevel = (i: number, level: number) => { const n = [...data]; n[i] = { ...n[i], level }; onChange(n) }

  return (
    <div className="space-y-3">
      {/* Job category selector — biases the suggestions */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Suggest skills for</label>
        <select
          value={category}
          onChange={e => { touched.current = true; setCategory(e.target.value) }}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
        >
          {CATEGORY_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Autocomplete input */}
      <div className="relative">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => { setInput(e.target.value); setOpen(true); setHighlight(0) }}
            onFocus={() => setOpen(true)}
            onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150) }}
            onKeyDown={onKeyDown}
            placeholder="Type to search skills…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button onClick={() => add(input)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">Add</button>
        </div>

        {open && suggestions.length > 0 && (
          <div
            className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-soft-lg max-h-56 overflow-y-auto"
            onMouseDown={e => e.preventDefault() /* keep input focus */}
          >
            {suggestions.map((s, i) => (
              <button
                key={s}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => { clearTimeout(blurTimer.current); add(s) }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                  i === highlight ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{s}</span>
                <span className="text-xs text-gray-300">+ add</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Suggested skills — one-click add chips, with AI top-up */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-xs text-gray-500">
            {aiSkills.length > 0 ? '✨ AI-suggested skills' : `Popular for ${category}`}
          </div>
          <button
            onClick={askAI}
            disabled={aiLoading}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 flex items-center gap-1"
          >
            {aiLoading ? '✨ Thinking…' : '✨ Suggest with AI'}
          </button>
        </div>
        {popular.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {popular.map(s => (
              <button
                key={s}
                onClick={() => add(s)}
                className="text-xs px-2.5 py-1 rounded-full border border-indigo-200 text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100 transition"
              >
                + {s}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">All suggestions added — type to search for more.</p>
        )}
      </div>

      {/* Selected skills with proficiency */}
      <div className="space-y-2 pt-1">
        {data.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-gray-700">{s.name}</span>
                <button onClick={() => remove(i)} className="text-gray-300 hover:text-red-400 text-base leading-none">×</button>
              </div>
              <div className="flex items-center gap-2">
                <input type="range" min="20" max="100" step="10" value={s.level}
                  onChange={e => updLevel(i, +e.target.value)}
                  className="flex-1 accent-indigo-600" />
                <span className="text-xs text-gray-400 w-6">{s.level}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProjectsEditor({ data, onChange }: { data: Project[], onChange: (d: Project[]) => void }) {
  const add = () => onChange([...data, { id: uid(), name: '', technologies: '', description: '' }])
  const upd = (i: number, patch: Partial<Project>) => { const n = [...data]; n[i] = { ...n[i], ...patch }; onChange(n) }
  const remove = (i: number) => onChange(data.filter((_, j) => j !== i))
  return (
    <div className="space-y-4">
      {data.map((p, i) => (
        <div key={p.id} className="border border-gray-200 rounded-xl p-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-gray-700">{p.name || `Project ${i + 1}`}</span>
            <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
          </div>
          {[
            { key: 'name', placeholder: 'Project Name' },
            { key: 'technologies', placeholder: 'React, Node.js, MongoDB' },
          ].map(f => (
            <input key={f.key} value={(p as any)[f.key]} onChange={e => upd(i, { [f.key]: e.target.value })}
              placeholder={f.placeholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          ))}
          <textarea value={p.description} onChange={e => upd(i, { description: e.target.value })}
            placeholder="Describe the project..."
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
        </div>
      ))}
      <button onClick={add} className="w-full border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 py-2 rounded-xl text-sm transition">
        + Add Project
      </button>
    </div>
  )
}

function ListEditor({ data, onChange, placeholder }: { data: string[], onChange: (d: string[]) => void, placeholder: string }) {
  const [input, setInput] = useState('')
  const add = () => { if (!input.trim()) return; onChange([...data, input.trim()]); setInput('') }
  const remove = (i: number) => onChange(data.filter((_, j) => j !== i))
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder={placeholder}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        <button onClick={add} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">Add</button>
      </div>
      <div className="space-y-1">
        {data.map((item, i) => (
          <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-sm text-gray-700">{item}</span>
            <button onClick={() => remove(i)} className="text-gray-300 hover:text-red-400 text-base leading-none">×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function CertificationsEditor({ data, onChange }: { data: Certification[], onChange: (d: Certification[]) => void }) {
  const add = () => onChange([...data, { id: uid(), name: '', issuer: '', date: '' }])
  const upd = (i: number, patch: Partial<Certification>) => { const n = [...data]; n[i] = { ...n[i], ...patch }; onChange(n) }
  const remove = (i: number) => onChange(data.filter((_, j) => j !== i))
  return (
    <div className="space-y-3">
      {data.map((c, i) => (
        <div key={c.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
          <div className="flex justify-between">
            <span className="text-sm font-medium text-gray-700">{c.name || `Certification ${i + 1}`}</span>
            <button onClick={() => remove(i)} className="text-red-400 text-xs">Remove</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={c.name} onChange={e => upd(i, { name: e.target.value })} placeholder="AWS Solutions Architect"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <input value={c.issuer} onChange={e => upd(i, { issuer: e.target.value })} placeholder="Amazon"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <input value={c.date} onChange={e => upd(i, { date: e.target.value })} placeholder="2023"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
        </div>
      ))}
      <button onClick={add} className="w-full border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 py-2 rounded-xl text-sm transition">
        + Add Certification
      </button>
    </div>
  )
}

function LanguagesEditor({ data, onChange }: { data: Language[], onChange: (d: Language[]) => void }) {
  const add = () => onChange([...data, { name: '', proficiency: 'Fluent' }])
  const upd = (i: number, patch: Partial<Language>) => { const n = [...data]; n[i] = { ...n[i], ...patch }; onChange(n) }
  const remove = (i: number) => onChange(data.filter((_, j) => j !== i))
  return (
    <div className="space-y-2">
      {data.map((l, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input value={l.name} onChange={e => upd(i, { name: e.target.value })} placeholder="English"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          <select value={l.proficiency} onChange={e => upd(i, { proficiency: e.target.value })}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
            {['Native', 'Fluent', 'Advanced', 'Intermediate', 'Basic'].map(p => <option key={p}>{p}</option>)}
          </select>
          <button onClick={() => remove(i)} className="text-gray-300 hover:text-red-400 text-xl leading-none">×</button>
        </div>
      ))}
      <button onClick={add} className="w-full border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 py-2 rounded-xl text-sm transition">
        + Add Language
      </button>
    </div>
  )
}

/* ─── Main page ───────────────────────────────────────────────── */
export default function EditResumePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()

  const [resume, setResume] = useState<Resume | null>(null)
  const [content, setContent] = useState<ResumeContent>(emptyContent())
  const [title, setTitle] = useState('Untitled Resume')
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [atsScore, setAtsScore] = useState(72)
  const [jd, setJd] = useState('')
  const [scoring, setScoring] = useState(false)
  const [atsHistory, setAtsHistory] = useState<{ id: string; score: number; job_title: string | null; created_at: string | null }[]>([])
  const [atsMissing, setAtsMissing] = useState<string[]>([])
  const [aiGenerating, setAiGenerating] = useState<string | null>(null)
  const [aiMsg, setAiMsg] = useState('')
  const [centerTab, setCenterTab] = useState<'preview' | 'edit'>('preview')
  const [rightTab, setRightTab] = useState<'assistant' | 'insights' | 'skillgap'>('insights')
  const [gapTarget, setGapTarget] = useState('')
  const [gapLoading, setGapLoading] = useState(false)
  const [gap, setGap] = useState<{ required: string[]; matched: string[]; missing: string[]; match_score: number } | null>(null)
  const [templateId, setTemplateId] = useState('modern')
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [sectionsWidth, setSectionsWidth] = useState(240)
  const [showHistory, setShowHistory] = useState(false)
  const resizing = useRef(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>()

  // Reload the resume from the server (used after a version rollback)
  const reloadResume = useCallback(async () => {
    if (!id || id === 'new') return
    try {
      const r = await api.get<Resume>(`/api/resumes/${id}`)
      setResume(r); setTitle(r.title); setContent(r.content || emptyContent())
      setTemplateId(r.template_id || 'modern')
      if (r.ats_score != null) setAtsScore(r.ats_score)
    } catch { /* ignore */ }
  }, [id])

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

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return }
    if (id === 'new') {
      api.post<Resume>('/api/resumes/', { title: 'Untitled Resume', template_id: 'modern' })
        .then(r => { setResume(r); setTitle(r.title); setContent(r.content || emptyContent()); setTemplateId(r.template_id || 'modern'); router.replace(`/resumes/${r.id}/edit`) })
        .catch(() => router.push('/dashboard'))
    } else {
      api.get<Resume>(`/api/resumes/${id}`)
        .then(r => {
          setResume(r); setTitle(r.title); setContent(r.content || emptyContent()); setTemplateId(r.template_id || 'modern')
          if (r.ats_score != null) setAtsScore(r.ats_score)
          loadAtsHistory(r.id)
        })
        .catch(() => router.push('/dashboard'))
    }
  }, [id, user, router, loadAtsHistory])

  const patch = useCallback(<K extends keyof ResumeContent>(key: K, val: ResumeContent[K]) => {
    setContent(c => ({ ...c, [key]: val }))
    setSaved(false)
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => doSave(), 2000)
  }, [])

  const doSave = async () => {
    if (!resume) return
    setSaving(true)
    try {
      await api.put(`/api/resumes/${resume.id}`, { title, content, template_id: templateId })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const scoreAts = async () => {
    if (!jd.trim()) return
    setScoring(true)
    try {
      const r = await api.post<{ score: number; missing?: string[] }>('/api/ats/score', {
        resume_content: content,
        job_description: jd,
        resume_id: resume?.id,
        job_title: content.personalInfo?.jobTitle || title,
      })
      setAtsScore(r.score)
      setAtsMissing(r.missing || [])
      if (resume?.id) loadAtsHistory(resume.id)
    } catch {
      setAtsScore(Math.floor(Math.random() * 30) + 60)
    } finally {
      setScoring(false)
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

  const scoreBreakdown = {
    formatting: Math.min(100, atsScore + 20),
    keywords: Math.max(50, atsScore - 10),
    skills: Math.min(100, atsScore + 15),
    readability: Math.min(100, atsScore + 18),
    experience: Math.max(60, atsScore - 5),
    grammar: 100,
  }

  const sectionComplete = (key: string) => {
    const c = content as any
    const v = c[key]
    if (!v) return false
    if (typeof v === 'string') return v.trim().length > 10
    if (Array.isArray(v)) return v.length > 0
    if (typeof v === 'object') return Object.values(v).some(x => x)
    return false
  }

  const topBar = (
    <>
      <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-700 text-sm flex items-center gap-1">
        ← Dashboard
      </button>
      <div className="flex-1 flex items-center gap-2 ml-4">
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-400 focus:outline-none px-1 py-0.5 text-sm w-64"
        />
        <span className="text-xs text-gray-400">
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Unsaved'}
        </span>
      </div>
      <div className="flex items-center gap-2 ml-auto relative">
        <div className="relative">
          <button onClick={() => setShowTemplatePicker(p => !p)}
            className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded hover:bg-indigo-50 transition flex items-center gap-1">
            🎨 Template
          </button>
          {showTemplatePicker && (
            <div className="absolute top-8 left-0 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-2 flex gap-2 w-64 flex-wrap">
              {TEMPLATE_LIST.map(t => (
                <button key={t.id}
                  onClick={() => { setTemplateId(t.id); setShowTemplatePicker(false) }}
                  className={`flex-1 min-w-[70px] py-1.5 px-2 rounded-lg text-xs transition text-center ${templateId === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}>
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {['Color', 'Font', 'Spacing', 'Tips'].map(t => (
          <button key={t} className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded hover:bg-indigo-50 transition">{t}</button>
        ))}
        <button onClick={() => setShowHistory(true)}
          className="text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition flex items-center gap-1"
          title="Version history & rollback">
          🕘 History
        </button>
        <button onClick={() => router.push(`/resumes/${id}/preview`)}
          className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition">
          Preview
        </button>
        <button onClick={doSave} disabled={saving}
          className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
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
      <div className="flex h-[calc(100vh-56px)] overflow-hidden">

        {/* ── LEFT: Sections panel ─────────────────────────────── */}
        <div
          style={{ width: sectionsWidth }}
          className="bg-white border-r border-gray-100 flex flex-col overflow-y-auto flex-shrink-0">
          <div className="px-3 py-3 border-b border-gray-100">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Resume Sections</div>
          </div>
          <div className="flex-1 py-2">
            {SECTIONS.map(sec => (
              <div key={sec.key}>
                <button
                  onClick={() => setActiveSection(activeSection === sec.key ? null : sec.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                    activeSection === sec.key ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base w-5 text-center">{sec.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{sec.label}</div>
                    {!sectionComplete(sec.key) && (
                      <div className="text-xs text-gray-400">Add your {sec.label.toLowerCase()}</div>
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
                          rows={4}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                        <button onClick={generateSummary} disabled={aiGenerating === 'summary'}
                          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white py-2 rounded-lg text-xs hover:opacity-90 transition">
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
          </div>
          <div className="px-3 py-3 border-t border-gray-100">
            <button className="w-full text-xs text-indigo-600 hover:text-indigo-800 py-2 border border-dashed border-indigo-200 rounded-lg hover:bg-indigo-50 transition">
              + Add Custom Section
            </button>
          </div>
        </div>

        {/* ── Drag handle to resize sections panel ──────────────── */}
        <div
          onMouseDown={startResize}
          onDoubleClick={() => setSectionsWidth(240)}
          title="Drag to resize · double-click to reset"
          className="w-1 flex-shrink-0 cursor-col-resize bg-gray-100 hover:bg-indigo-400 active:bg-indigo-500 transition-colors relative group">
          <div className="absolute inset-y-0 -left-1 -right-1" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-gray-300 group-hover:bg-indigo-500 transition-colors" />
        </div>

        {/* ── CENTER: Preview ───────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#F0F2F8]">
          <div className="flex items-center justify-center gap-1 py-2 bg-white border-b border-gray-100">
            {(['preview', 'edit'] as const).map(t => (
              <button key={t} onClick={() => setCenterTab(t)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${
                  centerTab === t ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-6 flex justify-center">
            <div className="w-full max-w-[600px]">
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
              ['assistant', 'AI Assistant'],
              ['skillgap', 'Skill Gap'],
            ] as const).map(([t, label]) => (
              <button key={t} onClick={() => setRightTab(t)}
                className={`flex-1 py-3 text-xs font-medium transition ${
                  rightTab === t ? 'text-indigo-700 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {rightTab === 'insights' ? (
            <div className="flex-1 overflow-y-auto">
              {/* ATS Score */}
              <div className="px-4 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-800">ATS Score</span>
                  <button className="text-xs text-gray-400">▲</button>
                </div>
                <div className="flex flex-col items-center py-2">
                  <CircularScore score={atsScore} max={100} size={100} color={atsScore >= 80 ? '#22c55e' : atsScore >= 60 ? '#f59e0b' : '#ef4444'} />
                  <div className={`text-xs font-medium mt-2 ${atsScore >= 80 ? 'text-green-600' : atsScore >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {atsScore >= 80 ? 'Excellent' : atsScore >= 60 ? 'Good' : 'Needs Work'}
                  </div>
                  <p className="text-xs text-gray-400 text-center mt-1">
                    {atsScore >= 80 ? 'This resume is highly likely to pass ATS.' : 'Add more keywords to improve your score.'}
                  </p>
                </div>
              </div>

              {/* Score Breakdown */}
              <div className="px-4 py-4 border-b border-gray-100">
                <div className="text-xs font-semibold text-gray-800 mb-3">Score Breakdown</div>
                <div className="space-y-2">
                  {SCORE_BREAKDOWN.map(item => {
                    const score = (scoreBreakdown as any)[item.key]
                    return (
                      <div key={item.key} className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{item.label}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" style={{ width: `${score}%` }} />
                          </div>
                          <span className="text-xs font-medium text-gray-700 w-8 text-right">{score}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Keyword Match */}
              <div className="px-4 py-4 border-b border-gray-100">
                <div className="text-xs font-semibold text-gray-800 mb-3">Keyword Match</div>
                <textarea value={jd} onChange={e => setJd(e.target.value)}
                  placeholder="Paste job description to analyze keyword match..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none mb-2" />
                <button onClick={scoreAts} disabled={scoring || !jd.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-medium transition disabled:opacity-50">
                  {scoring ? 'Analyzing…' : 'Analyze Match'}
                </button>
                {jd && (
                  <div className="mt-3 flex flex-col items-center">
                    <CircularScore score={Math.round(atsScore * 0.9)} size={70} color="#6366f1" />
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
                          <div className="text-gray-400" style={{ fontSize: 10 }}>
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

              {/* AI Suggestions */}
              <div className="px-4 py-4">
                <div className="text-xs font-semibold text-gray-800 mb-3">AI Suggestions</div>
                <div className="space-y-2">
                  {[
                    'Add more quantified achievements to your experience section',
                    'Include metrics and numbers to improve impact',
                    'Add missing keywords to increase ATS score',
                  ].map((s, i) => (
                    <div key={i} className="flex gap-2 text-xs text-gray-600 bg-indigo-50 rounded-lg px-3 py-2">
                      <span className="text-indigo-500 flex-shrink-0">•</span>
                      {s}
                    </div>
                  ))}
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
                  className="w-full bg-white/95 hover:bg-white text-indigo-700 text-xs font-semibold py-2 rounded-lg transition disabled:opacity-70"
                >
                  {aiGenerating === 'draft' ? '✨ Drafting…' : '✨ Generate Starter Draft'}
                </button>
                {aiMsg && <div className="mt-2 text-[11px] text-white/90">{aiMsg}</div>}
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-700 mb-2">Professional Summary</div>
                <button onClick={generateSummary} disabled={aiGenerating === 'summary'}
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white py-2 rounded-lg text-xs hover:opacity-90 transition">
                  {aiGenerating === 'summary' ? '✨ Generating…' : '✨ Generate Summary'}
                </button>
                {content.summary && (
                  <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3">{content.summary}</div>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-700 mb-2">Work Experience Bullets</div>
                {content.experience.length === 0 ? (
                  <p className="text-xs text-gray-400">Add work experience first</p>
                ) : (
                  content.experience.map((exp, i) => (
                    <button key={exp.id} onClick={() => generateBullets(i)} disabled={aiGenerating === 'bullets'}
                      className="w-full mb-2 border border-indigo-200 text-indigo-600 hover:bg-indigo-50 py-2 rounded-lg text-xs transition">
                      {aiGenerating === 'bullets' ? '✨ Generating…' : `Generate for ${exp.position || `Experience ${i + 1}`}`}
                    </button>
                  ))
                )}
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-700 mb-2">Cover Letter</div>
                <button onClick={() => router.push('/cover-letters')}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-2 rounded-lg text-xs hover:opacity-90 transition">
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
                <p className="text-[11px] text-gray-400 mb-2">See which required skills you have vs. are missing.</p>
                <textarea
                  value={gapTarget}
                  onChange={e => setGapTarget(e.target.value)}
                  placeholder={content.personalInfo?.jobTitle ? `e.g. ${content.personalInfo.jobTitle}` : 'e.g. Senior React Developer, or paste a job description'}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none mb-2"
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
                      color={gap.match_score >= 80 ? '#22c55e' : gap.match_score >= 50 ? '#f59e0b' : '#ef4444'} />
                    <div className="text-xs text-gray-400 mt-2 text-center">
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
