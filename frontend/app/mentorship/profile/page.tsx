'use client'

import { useEffect, useState } from 'react'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import { api } from '@/lib/api'
import { useAuthStore, User } from '@/lib/store'

export default function MenteeProfilePage() {
  const { user, setUser } = useAuthStore()
  const [form, setForm] = useState({
    full_name: user?.full_name || '', avatar_url: user?.avatar_url || '', headline: '',
    phone: '', location: '', linkedin_url: '', github_url: '', website_url: '',
  })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // The auth store's `user` only has what login/signup returned at the time —
  // fetch the current record so headline/phone/location/etc. (never part of
  // that payload) show their real saved values instead of coming up blank
  // and silently getting overwritten with empty strings on save.
  useEffect(() => {
    api.get<User>('/api/auth/me').then((fresh) => {
      setUser(fresh)
      setForm({
        full_name: fresh.full_name || '', avatar_url: fresh.avatar_url || '', headline: fresh.headline || '',
        phone: fresh.phone || '', location: fresh.location || '', linkedin_url: fresh.linkedin_url || '',
        github_url: fresh.github_url || '', website_url: fresh.website_url || '',
      })
      setLoaded(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    setSaving(true); setSaved(false)
    try {
      const updated = await api.patch<typeof user>('/api/auth/profile', form)
      if (updated) setUser(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">My Profile</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="panel-premium p-6 space-y-4">
          <div className="flex items-center gap-4 mb-2">
            {form.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover shadow-soft" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-brand-gradient text-white flex items-center justify-center text-2xl font-bold">
                {(form.full_name || user?.email || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Photo URL</label>
              <input value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://…" className="input-premium text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Full name</label>
            <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input-premium text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Headline / bio</label>
            <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="e.g. Final-year CS student aiming for SDE roles" className="input-premium text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input-premium text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Location</label>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input-premium text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">LinkedIn</label>
            <input value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} className="input-premium text-sm" />
          </div>

          <button onClick={save} disabled={saving || !loaded} className="btn-primary w-full py-2.5 disabled:opacity-50">
            {!loaded ? 'Loading…' : saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Profile'}
          </button>
        </div>
      </div>
    </MentorshipShell>
  )
}
