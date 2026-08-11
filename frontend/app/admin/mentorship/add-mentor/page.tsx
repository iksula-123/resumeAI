'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminMentorshipShell from '@/components/mentorship/AdminMentorshipShell'
import { api } from '@/lib/api'

interface Category { id: string; name: string; slug: string; icon: string | null; sort_order: number; is_active: boolean; mentor_count: number }
interface EligibleProfile { id: string; full_name: string | null; email: string; avatar_url: string | null }

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC']

export default function AddMentorPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<EligibleProfile[]>([])
  const [selected, setSelected] = useState<EligibleProfile | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [searching, setSearching] = useState(false)

  const [headline, setHeadline] = useState('')
  const [bio, setBio] = useState('')
  const [designation, setDesignation] = useState('')
  const [company, setCompany] = useState('')
  const [years, setYears] = useState(0)
  const [country, setCountry] = useState('')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [price, setPrice] = useState(0)
  const [currency, setCurrency] = useState('INR')
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [languageInput, setLanguageInput] = useState('')
  const [languages, setLanguages] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.get<{ categories: Category[] }>('/api/mentorship/admin/categories').then((d) => setCategories(d.categories.filter((c) => c.is_active)))
  }, [])

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await api.get<{ profiles: EligibleProfile[] }>(`/api/mentorship/admin/eligible-profiles?search=${encodeURIComponent(search)}`)
        setResults(data.profiles)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const toggleCategory = (id: string) => setCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  const addSkill = () => { const v = skillInput.trim(); if (v && !skills.includes(v)) setSkills([...skills, v]); setSkillInput('') }
  const addLanguage = () => { const v = languageInput.trim(); if (v && !languages.includes(v)) setLanguages([...languages, v]); setLanguageInput('') }

  const reset = () => {
    setSelected(null); setSearch(''); setResults([])
    setHeadline(''); setBio(''); setDesignation(''); setCompany(''); setYears(0)
    setCountry(''); setTimezone('Asia/Kolkata'); setPrice(0); setCurrency('INR')
    setCategoryIds([]); setSkills([]); setLanguages([]); setDone(false)
  }

  const submit = async () => {
    if (!selected) return
    setSubmitting(true); setError('')
    try {
      await api.post('/api/mentorship/admin/mentors', {
        profile_id: selected.id, headline, bio, designation, company,
        years_experience: years, country: country || null, timezone,
        session_price_amount: price, session_price_currency: currency,
        category_ids: categoryIds, skills, languages,
      })
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create mentor')
    } finally {
      setSubmitting(false)
    }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Add Mentor</h1>

  return (
    <AdminMentorshipShell topBar={topBar}>
      <div className="p-6 max-w-2xl mx-auto">
        {done ? (
          <div className="panel-premium p-10 text-center">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="font-bold text-navy-600 mb-1">Mentor profile created</h3>
            <p className="text-sm text-gray-500 mb-5">It's in &quot;pending&quot; status — approve it from Applications to list it on the marketplace.</p>
            <div className="flex gap-2 justify-center">
              <button onClick={reset} className="btn-secondary px-5 py-2.5 text-sm">Add another</button>
              <button onClick={() => router.push('/admin/mentorship/applications')} className="btn-primary px-5 py-2.5 text-sm">Go to Applications</button>
            </div>
          </div>
        ) : !selected ? (
          <div className="panel-premium p-5">
            <h3 className="font-semibold text-gray-800 text-sm mb-3">Search for an existing user to promote to mentor</h3>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…" className="input-premium text-sm mb-3" />
            {searching && <p className="text-xs text-gray-400">Searching…</p>}
            {!searching && search.trim() && results.length === 0 && <p className="text-xs text-gray-400">No matching users without a mentor profile already.</p>}
            <div className="space-y-1.5">
              {results.map((p) => (
                <button key={p.id} onClick={() => setSelected(p)} className="w-full text-left px-4 py-2.5 rounded-lg hover:bg-royal-50 transition flex items-center gap-3">
                  <div className="w-8 h-8 bg-royal-100 rounded-full flex items-center justify-center text-navy-700 text-xs font-bold flex-shrink-0">
                    {(p.full_name || p.email)[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{p.full_name || '—'}</div>
                    <div className="text-xs text-gray-500">{p.email}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="panel-premium p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-gray-800">Creating mentor profile for</h3>
                <p className="text-sm text-royal-600">{selected.full_name || selected.email} ({selected.email})</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-xs text-gray-500 hover:text-gray-700">Change</button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Headline</label>
                <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. Senior PM at Google, ex-Amazon" className="input-premium text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Bio</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="input-premium text-sm resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Designation</label>
                <input value={designation} onChange={(e) => setDesignation(e.target.value)} className="input-premium text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Company</label>
                <input value={company} onChange={(e) => setCompany(e.target.value)} className="input-premium text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Years of experience</label>
                <input type="number" min={0} value={years} onChange={(e) => setYears(Number(e.target.value))} className="input-premium text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Country</label>
                <input value={country} onChange={(e) => setCountry(e.target.value)} className="input-premium text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Timezone</label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="input-premium text-sm">
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Session price</label>
                  <input type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="input-premium text-sm" />
                </div>
                <div className="w-24">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Currency</label>
                  <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="input-premium text-sm" />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Categories</label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <button key={c.id} type="button" onClick={() => toggleCategory(c.id)} className={`chip-pill ${categoryIds.includes(c.id) ? 'on' : ''}`}>{c.icon} {c.name}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Skills</label>
                <div className="flex gap-2 mb-2">
                  <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())} placeholder="Add a skill" className="input-premium text-sm" />
                  <button type="button" onClick={addSkill} className="btn-ghost px-3 text-sm">+</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((s) => (
                    <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 flex items-center gap-1.5">{s}<button onClick={() => setSkills(skills.filter((x) => x !== s))} className="text-gray-400 hover:text-gray-700">×</button></span>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Languages</label>
                <div className="flex gap-2 mb-2">
                  <input value={languageInput} onChange={(e) => setLanguageInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLanguage())} placeholder="Add a language" className="input-premium text-sm" />
                  <button type="button" onClick={addLanguage} className="btn-ghost px-3 text-sm">+</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {languages.map((l) => (
                    <span key={l} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 flex items-center gap-1.5">{l}<button onClick={() => setLanguages(languages.filter((x) => x !== l))} className="text-gray-400 hover:text-gray-700">×</button></span>
                  ))}
                </div>
              </div>
            </div>

            {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 mt-4">{error}</div>}

            <button onClick={submit} disabled={submitting} className="btn-primary w-full py-2.5 mt-6 disabled:opacity-40">{submitting ? 'Creating…' : 'Create Mentor Profile (pending review)'}</button>
          </div>
        )}
      </div>
    </AdminMentorshipShell>
  )
}
