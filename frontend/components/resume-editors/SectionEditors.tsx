'use client'

// Shared resume section editors — extracted verbatim from
// frontend/app/resumes/[id]/edit/page.tsx (SahiCareer UI/UX + Gamification
// phase) so the Resume Editor and the Create-from-Scratch wizard
// (frontend/app/resumes/create/page.tsx) use ONE implementation instead of
// two copies that would drift apart. Behavior is unchanged from the
// pre-extraction editor — no new fields, no new validation, no new API
// calls beyond what each editor already made.

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { CATEGORY_NAMES, detectCategory, suggestSkills, popularForCategory } from '@/lib/skillsData'
import {
  type Skill, type Experience, type Education, type Project, type Certification,
  type Language, type CustomSection, type ResumeContent, uid,
} from '@/lib/resumeContent'

export function PersonalInfoEditor({ data, onChange }: { data: ResumeContent['personalInfo'], onChange: (d: ResumeContent['personalInfo']) => void }) {
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
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300"
          />
        </div>
      ))}
    </div>
  )
}

export function ExperienceEditor({ data, onChange }: { data: Experience[], onChange: (d: Experience[]) => void }) {
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

  const enhanceOne = async (i: number, bi: number) => {
    const text = data[i].bullets[bi]?.trim()
    if (!text) return
    setBusy(`${i}-${bi}`)
    try {
      const r = await api.post<{ enhanced: string }>('/api/ai/enhance-bullet', { bullet: text })
      if (r.enhanced) updBullet(i, bi, r.enhanced)
    } catch {} finally { setBusy(null) }
  }

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
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
            ))}
            <input value={exp.startDate} onChange={e => upd(i, { startDate: e.target.value })}
              placeholder="Jan 2021" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
            {!exp.current && (
              <input value={exp.endDate} onChange={e => upd(i, { endDate: e.target.value })}
                placeholder="Present" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
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
                  className="text-xs font-medium text-navy-600 hover:text-royal-800 disabled:opacity-50"
                >
                  {busy === String(i) ? '✨ Improving…' : '✨ Improve all'}
                </button>
              )}
            </div>
            {exp.bullets.map((b, bi) => (
              <div key={bi} className="flex gap-1.5 mb-1 items-center">
                <input value={b} onChange={e => updBullet(i, bi, e.target.value)}
                  placeholder="Describe your achievement..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
                {b.trim() && (
                  <button onClick={() => enhanceOne(i, bi)} disabled={busy !== null}
                    title="Rewrite this bullet with AI"
                    className="text-royal-400 hover:text-navy-600 disabled:opacity-40 text-sm px-1">
                    {busy === `${i}-${bi}` ? '⟳' : '✨'}
                  </button>
                )}
                <button onClick={() => removeBullet(i, bi)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
              </div>
            ))}
            <button onClick={() => addBullet(i)} className="text-xs text-navy-600 hover:text-royal-800 mt-1">+ Add bullet</button>
          </div>
        </div>
      ))}
      <button onClick={add} className="w-full border-2 border-dashed border-royal-200 text-navy-600 hover:bg-royal-50 py-2 rounded-xl text-sm transition">
        + Add Experience
      </button>
    </div>
  )
}

export function EducationEditor({ data, onChange }: { data: Education[], onChange: (d: Education[]) => void }) {
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
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
            ))}
          </div>
        </div>
      ))}
      <button onClick={add} className="w-full border-2 border-dashed border-royal-200 text-navy-600 hover:bg-royal-50 py-2 rounded-xl text-sm transition">
        + Add Education
      </button>
    </div>
  )
}

export function SkillsEditor({ data, onChange, jobTitle }: { data: Skill[], onChange: (d: Skill[]) => void, jobTitle?: string }) {
  const [input, setInput] = useState('')
  const [category, setCategory] = useState(() => detectCategory(jobTitle))
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [aiSkills, setAiSkills] = useState<string[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout>>()

  const touched = useRef(false)
  useEffect(() => {
    if (!touched.current) setCategory(detectCategory(jobTitle))
  }, [jobTitle])

  const names = data.map(s => s.name)
  const suggestions = suggestSkills(input, category, names, 8)
  const staticPopular = popularForCategory(category, names).slice(0, 12)
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
      <div>
        <label className="block text-xs text-gray-500 mb-1">Suggest skills for</label>
        <select
          value={category}
          onChange={e => { touched.current = true; setCategory(e.target.value) }}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300 bg-white"
        >
          {CATEGORY_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="relative">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => { setInput(e.target.value); setOpen(true); setHighlight(0) }}
            onFocus={() => setOpen(true)}
            onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150) }}
            onKeyDown={onKeyDown}
            placeholder="Type to search skills…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300"
          />
          <button onClick={() => add(input)} className="bg-navy-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-navy-700">Add</button>
        </div>

        {open && suggestions.length > 0 && (
          <div
            className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-soft-lg max-h-56 overflow-y-auto"
            onMouseDown={e => e.preventDefault()}
          >
            {suggestions.map((s, i) => (
              <button
                key={s}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => { clearTimeout(blurTimer.current); add(s) }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                  i === highlight ? 'bg-royal-50 text-navy-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{s}</span>
                <span className="text-xs text-gray-300">+ add</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-xs text-gray-500">
            {aiSkills.length > 0 ? '✨ AI-suggested skills' : `Popular for ${category}`}
          </div>
          <button
            onClick={askAI}
            disabled={aiLoading}
            className="text-xs font-medium text-navy-600 hover:text-royal-800 disabled:opacity-50 flex items-center gap-1"
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
                className="text-xs px-2.5 py-1 rounded-full border border-royal-200 text-navy-700 bg-royal-50/60 hover:bg-royal-100 transition"
              >
                + {s}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500">All suggestions added — type to search for more.</p>
        )}
      </div>

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
                  className="flex-1 accent-navy-600" />
                <span className="text-xs text-gray-500 w-6">{s.level}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProjectsEditor({ data, onChange }: { data: Project[], onChange: (d: Project[]) => void }) {
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
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
          ))}
          <textarea value={p.description} onChange={e => upd(i, { description: e.target.value })}
            placeholder="Describe the project..."
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300 resize-none" />
        </div>
      ))}
      <button onClick={add} className="w-full border-2 border-dashed border-royal-200 text-navy-600 hover:bg-royal-50 py-2 rounded-xl text-sm transition">
        + Add Project
      </button>
    </div>
  )
}

// A single user-named freeform section (e.g. "Professional Development",
// "Publications") -- the Resume Builder's escape hatch for content that
// doesn't fit any fixed section. Both title and content are user-entered;
// remove deletes just this one section — there's no separate per-item API,
// PUT /api/resumes/{id} always saves the full content blob.
export function CustomSectionEditor({ data, onChange, onRemove }: { data: CustomSection, onChange: (d: CustomSection) => void, onRemove: () => void }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400">Custom section</span>
        <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-xs">Remove Section</button>
      </div>
      <input value={data.title} onChange={e => onChange({ ...data, title: e.target.value })}
        placeholder="Section Title (e.g. Professional Development)"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-royal-300" />
      <textarea value={data.content} onChange={e => onChange({ ...data, content: e.target.value })}
        placeholder="Add the content for this section..."
        rows={4}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300 resize-y" />
    </div>
  )
}

export function ListEditor({ data, onChange, placeholder }: { data: string[], onChange: (d: string[]) => void, placeholder: string }) {
  const [input, setInput] = useState('')
  const add = () => { if (!input.trim()) return; onChange([...data, input.trim()]); setInput('') }
  const remove = (i: number) => onChange(data.filter((_, j) => j !== i))
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder={placeholder}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
        <button onClick={add} className="bg-navy-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-navy-700">Add</button>
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

export function CertificationsEditor({ data, onChange }: { data: Certification[], onChange: (d: Certification[]) => void }) {
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
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
            <input value={c.issuer} onChange={e => upd(i, { issuer: e.target.value })} placeholder="Amazon"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
            <input value={c.date} onChange={e => upd(i, { date: e.target.value })} placeholder="2023"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
          </div>
        </div>
      ))}
      <button onClick={add} className="w-full border-2 border-dashed border-royal-200 text-navy-600 hover:bg-royal-50 py-2 rounded-xl text-sm transition">
        + Add Certification
      </button>
    </div>
  )
}

export function LanguagesEditor({ data, onChange }: { data: Language[], onChange: (d: Language[]) => void }) {
  const add = () => onChange([...data, { name: '', proficiency: 'Fluent' }])
  const upd = (i: number, patch: Partial<Language>) => { const n = [...data]; n[i] = { ...n[i], ...patch }; onChange(n) }
  const remove = (i: number) => onChange(data.filter((_, j) => j !== i))
  return (
    <div className="space-y-2">
      {data.map((l, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input value={l.name} onChange={e => upd(i, { name: e.target.value })} placeholder="English"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300" />
          <select value={l.proficiency} onChange={e => upd(i, { proficiency: e.target.value })}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300">
            {['Native', 'Fluent', 'Advanced', 'Intermediate', 'Basic'].map(p => <option key={p}>{p}</option>)}
          </select>
          <button onClick={() => remove(i)} className="text-gray-300 hover:text-red-400 text-xl leading-none">×</button>
        </div>
      ))}
      <button onClick={add} className="w-full border-2 border-dashed border-royal-200 text-navy-600 hover:bg-royal-50 py-2 rounded-xl text-sm transition">
        + Add Language
      </button>
    </div>
  )
}
