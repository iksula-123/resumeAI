'use client'

/** My Profile (mentor) — bio, expertise tags, photo. */
import { useEffect, useState } from 'react'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

interface MentorInfo {
  headline: string | null; bio: string | null; designation: string | null; company: string | null
  years_experience: number; country: string | null; session_price_amount: number
  skills: string[]; languages: string[]
}

export default function MentorProfilePage() {
  const { user, setUser } = useAuthStore()
  const [mentor, setMentor] = useState<MentorInfo | null>(null)
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '')
  const [form, setForm] = useState({ headline: '', bio: '', designation: '', company: '', years_experience: 0, country: '', session_price_amount: 0 })
  const [newSkill, setNewSkill] = useState('')
  const [newLanguage, setNewLanguage] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = () => api.get<{ mentor: MentorInfo }>('/api/mentorship/mentor/dashboard').then((d) => {
    setMentor(d.mentor)
    setForm({
      headline: d.mentor.headline || '', bio: d.mentor.bio || '', designation: d.mentor.designation || '',
      company: d.mentor.company || '', years_experience: d.mentor.years_experience, country: d.mentor.country || '',
      session_price_amount: d.mentor.session_price_amount,
    })
  })
  useEffect(() => { load() }, [])

  const save = async () => {
    setSaving(true); setSaved(false)
    try {
      await api.patch('/api/mentorship/mentor/profile', form)
      if (avatarUrl !== user?.avatar_url) {
        const updated = await api.patch<typeof user>('/api/auth/profile', { avatar_url: avatarUrl })
        if (updated) setUser(updated)
      }
      setSaved(true)
      load()
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const addSkill = async () => { if (!newSkill.trim()) return; await api.post('/api/mentorship/mentor/skills', { value: newSkill }); setNewSkill(''); load() }
  const removeSkill = async (s: string) => { await api.delete(`/api/mentorship/mentor/skills/${encodeURIComponent(s)}`); load() }
  const addLanguage = async () => { if (!newLanguage.trim()) return; await api.post('/api/mentorship/mentor/languages', { value: newLanguage }); setNewLanguage(''); load() }
  const removeLanguage = async (l: string) => { await api.delete(`/api/mentorship/mentor/languages/${encodeURIComponent(l)}`); load() }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">My Profile</h1>

  if (!mentor) return <MentorshipShell topBar={topBar}><div className="p-6 text-sm text-gray-400">Loading…</div></MentorshipShell>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
        <section className="panel-premium p-5 space-y-3">
          <h2 className="font-semibold text-gray-800 mb-1">Profile Details</h2>
          <div className="flex items-center gap-3 mb-2">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover shadow-soft" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-brand-gradient text-white flex items-center justify-center text-xl font-bold">
                {(user?.full_name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="Photo URL" className="input-premium text-sm flex-1" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Headline</label>
            <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} className="input-premium text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Designation</label>
              <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className="input-premium text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Company</label>
              <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="input-premium text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Years Experience</label>
              <input type="number" min={0} value={form.years_experience} onChange={(e) => setForm({ ...form, years_experience: Number(e.target.value) })} className="input-premium text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Country</label>
              <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="input-premium text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Session Price (₹, 0 = free)</label>
            <input type="number" min={0} value={form.session_price_amount} onChange={(e) => setForm({ ...form, session_price_amount: Number(e.target.value) })} className="input-premium text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Bio</label>
            <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={4} className="input-premium text-sm resize-none" />
          </div>
          <button onClick={save} disabled={saving} className="btn-primary w-full py-2.5">{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Profile'}</button>
        </section>

        <div className="space-y-6">
          <section className="panel-premium p-5">
            <h2 className="font-semibold text-gray-800 mb-3">Skills</h2>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {mentor.skills.map((s) => (
                <span key={s} className="text-xs bg-royal-50 text-royal-700 border border-royal-100 rounded-full px-2.5 py-1 flex items-center gap-1.5">
                  {s}<button onClick={() => removeSkill(s)} className="text-royal-400 hover:text-royal-700">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newSkill} onChange={(e) => setNewSkill(e.target.value)} placeholder="Add a skill…" className="input-premium text-xs flex-1" onKeyDown={(e) => e.key === 'Enter' && addSkill()} />
              <button onClick={addSkill} className="btn-secondary text-xs !min-h-0 px-3">Add</button>
            </div>
          </section>

          <section className="panel-premium p-5">
            <h2 className="font-semibold text-gray-800 mb-3">Languages</h2>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {mentor.languages.map((l) => (
                <span key={l} className="text-xs bg-teal-50 text-teal-700 border border-teal-100 rounded-full px-2.5 py-1 flex items-center gap-1.5">
                  {l}<button onClick={() => removeLanguage(l)} className="text-teal-400 hover:text-teal-700">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newLanguage} onChange={(e) => setNewLanguage(e.target.value)} placeholder="Add a language…" className="input-premium text-xs flex-1" onKeyDown={(e) => e.key === 'Enter' && addLanguage()} />
              <button onClick={addLanguage} className="btn-secondary text-xs !min-h-0 px-3">Add</button>
            </div>
          </section>
        </div>
      </div>
    </MentorshipShell>
  )
}
