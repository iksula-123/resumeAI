'use client'

/** Self-serve "Become a Mentor" application — lands in the admin's
 * Applications queue (same one admin-created mentors go through). */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

interface Category { id: string; name: string; slug: string; icon: string | null }

export default function ApplyAsMentorPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [headline, setHeadline] = useState('')
  const [bio, setBio] = useState('')
  const [designation, setDesignation] = useState('')
  const [company, setCompany] = useState('')
  const [years, setYears] = useState(0)
  const [country, setCountry] = useState('')
  const [skillInput, setSkillInput] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.get<{ categories: Category[] }>('/api/mentorship/categories').then((d) => setCategories(d.categories)).catch(() => {})
  }, [])

  useEffect(() => {
    if (user?.mentor_status) router.replace('/mentorship/mentor/dashboard')
  }, [user, router])

  const toggleCategory = (id: string) => setCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  const addSkill = () => { const v = skillInput.trim(); if (v && !skills.includes(v)) setSkills([...skills, v]); setSkillInput('') }

  const submit = async () => {
    setSubmitting(true); setError('')
    try {
      await api.post('/api/mentorship/apply', {
        headline, bio, designation, company, years_experience: years, country: country || null,
        category_ids: categoryIds, skills,
      })
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your application')
    } finally {
      setSubmitting(false)
    }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Become a Mentor</h1>

  if (done) {
    return (
      <MentorshipShell topBar={topBar}>
        <div className="p-6 max-w-xl mx-auto">
          <div className="panel-premium p-10 text-center">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="font-bold text-navy-600 mb-1">Application submitted</h3>
            <p className="text-sm text-gray-500">An admin will review it soon — you'll see it reflected here once approved.</p>
          </div>
        </div>
      </MentorshipShell>
    )
  }

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-navy-600">Become a Mentor</h2>
          <p className="text-sm text-gray-500 mt-1">Tell us about yourself — an admin reviews every application.</p>
        </div>

        <div className="panel-premium p-6 grid md:grid-cols-2 gap-4">
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

          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">Categories</label>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button key={c.id} type="button" onClick={() => toggleCategory(c.id)} className={`chip-pill ${categoryIds.includes(c.id) ? 'on' : ''}`}>
                  {c.icon} {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Skills</label>
            <div className="flex gap-2 mb-2">
              <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())} placeholder="Add a skill" className="input-premium text-sm" />
              <button type="button" onClick={addSkill} className="btn-ghost px-3 text-sm">+</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 flex items-center gap-1.5">
                  {s}
                  <button onClick={() => setSkills(skills.filter((x) => x !== s))} className="text-gray-400 hover:text-gray-700">×</button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mt-4">{error}</div>}

        <button onClick={submit} disabled={submitting} className="btn-primary w-full py-2.5 mt-6 disabled:opacity-40">
          {submitting ? 'Submitting…' : 'Submit Application'}
        </button>
      </div>
    </MentorshipShell>
  )
}
