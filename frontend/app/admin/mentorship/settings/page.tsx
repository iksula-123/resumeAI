'use client'

import { useEffect, useState } from 'react'
import AdminMentorshipShell from '@/components/mentorship/AdminMentorshipShell'
import { api } from '@/lib/api'

interface Settings { brand_name: string; support_email: string | null; maintenance_mode: boolean; announcement: string | null }

export default function AdminSettingsPage() {
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { api.get<Settings>('/api/mentorship/admin/settings').then(setForm) }, [])

  const save = async () => {
    if (!form) return
    setSaving(true); setSaved(false)
    try {
      await api.patch('/api/mentorship/admin/settings', form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Settings</h1>

  if (!form) return <AdminMentorshipShell topBar={topBar}><div className="p-6 text-sm text-gray-400">Loading…</div></AdminMentorshipShell>

  return (
    <AdminMentorshipShell topBar={topBar}>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-navy-600">Platform Settings</h2>
          <p className="text-sm text-gray-500 mt-1">Branding and platform-wide configuration.</p>
        </div>

        <div className="panel-premium p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Brand name</label>
            <input value={form.brand_name} onChange={(e) => setForm({ ...form, brand_name: e.target.value })} className="input-premium text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Support email</label>
            <input value={form.support_email || ''} onChange={(e) => setForm({ ...form, support_email: e.target.value })} className="input-premium text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-1 block">Platform announcement</label>
            <textarea value={form.announcement || ''} onChange={(e) => setForm({ ...form, announcement: e.target.value })} rows={3} placeholder="Shown to all users, if set (optional)" className="input-premium text-sm resize-none" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.maintenance_mode} onChange={(e) => setForm({ ...form, maintenance_mode: e.target.checked })} className="accent-navy-600" />
            Maintenance mode
          </label>

          <button onClick={save} disabled={saving} className="btn-primary w-full py-2.5">{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}</button>
        </div>
      </div>
    </AdminMentorshipShell>
  )
}
