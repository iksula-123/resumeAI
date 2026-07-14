'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'

interface Payment {
  id: string
  amount: number
  currency: string
  status: string
  plan: string | null
  description: string | null
  created_at: string | null
}

interface StoredFile {
  path: string
  name: string
  category: string
  size?: number | null
  url?: string | null
}

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  revoked: boolean
  last_used: string | null
  created_at: string | null
}

interface Webhook {
  id: string
  url: string
  events: string[]
  active: boolean
  secret?: string
  secret_hint?: string
  created_at: string | null
}

export default function SettingsPage() {
  const { user } = useAuthStore()
  const [name, setName] = useState(user?.full_name || '')
  const [saved, setSaved] = useState(false)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loadingPayments, setLoadingPayments] = useState(true)
  const [files, setFiles] = useState<StoredFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loadingKeys, setLoadingKeys] = useState(true)
  const [newKeyName, setNewKeyName] = useState('')
  const [creatingKey, setCreatingKey] = useState(false)
  const [revealedKey, setRevealedKey] = useState('')

  useEffect(() => {
    api.get<Payment[]>('/api/billing/payments')
      .then(setPayments)
      .catch(() => setPayments([]))
      .finally(() => setLoadingPayments(false))
    api.get<StoredFile[]>('/api/storage/files')
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoadingFiles(false))
    api.get<ApiKey[]>('/api/keys/')
      .then(setKeys)
      .catch(() => setKeys([]))
      .finally(() => setLoadingKeys(false))
  }, [])

  const createKey = async () => {
    setCreatingKey(true)
    try {
      const k = await api.post<ApiKey & { key: string }>('/api/keys/', { name: newKeyName.trim() || 'API Key' })
      setRevealedKey(k.key)
      setKeys(prev => [{ ...k }, ...prev])
      setNewKeyName('')
    } catch { /* ignore */ }
    finally { setCreatingKey(false) }
  }

  const revokeKey = async (id: string) => {
    if (!confirm('Revoke this key? Any integration using it will stop working.')) return
    try {
      await api.delete(`/api/keys/${id}`)
      setKeys(prev => prev.map(k => k.id === id ? { ...k, revoked: true } : k))
    } catch { /* ignore */ }
  }

  // ── Webhooks ──
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loadingHooks, setLoadingHooks] = useState(true)
  const [allEvents, setAllEvents] = useState<string[]>([])
  const [hookUrl, setHookUrl] = useState('')
  const [hookEvents, setHookEvents] = useState<Set<string>>(new Set())
  const [creatingHook, setCreatingHook] = useState(false)
  const [revealedSecret, setRevealedSecret] = useState('')
  const [testResult, setTestResult] = useState<Record<string, string>>({})

  useEffect(() => {
    api.get<Webhook[]>('/api/webhooks/').then(setWebhooks).catch(() => setWebhooks([])).finally(() => setLoadingHooks(false))
    api.get<{ events: string[] }>('/api/webhooks/events').then(r => setAllEvents(r.events)).catch(() => {})
  }, [])

  const toggleEvent = (e: string) => setHookEvents(prev => { const n = new Set(prev); n.has(e) ? n.delete(e) : n.add(e); return n })

  const createWebhook = async () => {
    if (!hookUrl.trim()) return
    setCreatingHook(true)
    try {
      const w = await api.post<Webhook>('/api/webhooks/', { url: hookUrl.trim(), events: Array.from(hookEvents) })
      setRevealedSecret(w.secret || '')
      setWebhooks(prev => [w, ...prev])
      setHookUrl(''); setHookEvents(new Set())
    } catch { /* ignore */ }
    finally { setCreatingHook(false) }
  }

  const toggleWebhook = async (w: Webhook) => {
    try {
      const u = await api.patch<Webhook>(`/api/webhooks/${w.id}`, { active: !w.active })
      setWebhooks(prev => prev.map(x => x.id === w.id ? { ...x, active: u.active } : x))
    } catch { /* ignore */ }
  }

  const deleteWebhook = async (id: string) => {
    if (!confirm('Delete this webhook?')) return
    try { await api.delete(`/api/webhooks/${id}`); setWebhooks(prev => prev.filter(w => w.id !== id)) } catch { /* ignore */ }
  }

  const testWebhook = async (id: string) => {
    setTestResult(prev => ({ ...prev, [id]: 'sending' }))
    try {
      const r = await api.post<{ success: boolean; status_code: number | null }>(`/api/webhooks/${id}/test`, {})
      setTestResult(prev => ({ ...prev, [id]: r.success ? `✓ delivered (${r.status_code})` : `✗ failed (${r.status_code ?? 'no response'})` }))
    } catch {
      setTestResult(prev => ({ ...prev, [id]: '✗ error' }))
    }
  }

  const deleteFile = async (path: string) => {
    if (!confirm('Delete this file permanently?')) return
    try {
      await api.delete(`/api/storage/files?path=${encodeURIComponent(path)}`)
      setFiles(prev => prev.filter(f => f.path !== path))
    } catch { /* ignore */ }
  }

  const fmtSize = (b?: number | null) => !b ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`
  const catBadge = (c: string) =>
    c === 'original' ? 'bg-blue-100 text-blue-700' : c === 'generated' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'

  const fmtAmount = (p: Payment) =>
    `${p.currency === 'usd' ? '$' : (p.currency?.toUpperCase() + ' ')}${(p.amount / 100).toFixed(2)}`

  const statusColor = (s: string) =>
    s === 'succeeded' ? 'bg-green-100 text-green-700'
    : s === 'pending' ? 'bg-yellow-100 text-yellow-700'
    : s === 'refunded' ? 'bg-gray-100 text-gray-600'
    : 'bg-red-100 text-red-600'

  const topBar = (
    <div className="flex-1">
      <h1 className="text-sm font-semibold text-gray-800">Settings</h1>
      <p className="text-xs text-gray-400">Manage your account preferences</p>
    </div>
  )

  return (
    <AppShell topBar={topBar}>
      <div className="p-6 max-w-2xl mx-auto space-y-5">
        {/* Profile */}
        <div className="panel-premium p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Profile Settings</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover ring-2 ring-white shadow-soft" />
              ) : (
                <div className="w-16 h-16 bg-brand-gradient rounded-full flex items-center justify-center text-white text-xl font-bold shadow-glow">
                  {user?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              <div>
                <div className="font-semibold text-gray-800">{user?.full_name || 'User'}</div>
                <div className="text-xs text-gray-400 capitalize">{user?.role} · {user?.subscription_tier} plan</div>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Full Name</label>
              <input value={name} onChange={e => setName(e.target.value)} className="input-premium" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Email</label>
              <input value={user?.email || ''} disabled
                className="w-full border border-gray-100 rounded-xl px-4 py-2.5 text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
            </div>
            <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 3000) }} className="btn-primary text-sm">
              {saved ? '✓ Saved' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Subscription */}
        <div className="panel-premium p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Subscription</h2>
          <div className="flex items-center justify-between bg-indigo-50 rounded-xl p-4">
            <div>
              <div className="font-medium text-gray-800 capitalize">{user?.subscription_tier || 'Free'} Plan</div>
              <div className="text-xs text-gray-500 mt-0.5">You have access to all features.</div>
            </div>
          </div>
        </div>

        {/* Billing history */}
        <div className="panel-premium p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Billing History</h2>
          {loadingPayments ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-12 rounded-xl bg-gray-100 shimmer" />)}
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-3xl mb-2">🧾</div>
              <p className="text-sm text-gray-500">No payments yet.</p>
              <p className="text-xs text-gray-400 mt-1">Your invoices will appear here after you upgrade.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium text-gray-800 capitalize">
                      {p.plan || 'Payment'} {p.plan ? 'plan' : ''}
                    </div>
                    <div className="text-xs text-gray-400">
                      {p.created_at ? new Date(p.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-800">{fmtAmount(p)}</span>
                    <span className={`text-xs px-2 py-1 rounded-full capitalize ${statusColor(p.status)}`}>{p.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Files (Supabase Storage) */}
        <div className="panel-premium p-6">
          <h2 className="font-semibold text-gray-800 mb-1">Your Files</h2>
          <p className="text-xs text-gray-400 mb-4">Uploaded resumes and generated exports, stored securely.</p>
          {loadingFiles ? (
            <div className="space-y-2">{[0, 1].map(i => <div key={i} className="h-12 rounded-xl bg-gray-100 shimmer" />)}</div>
          ) : files.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-3xl mb-2">🗂️</div>
              <p className="text-sm text-gray-500">No files yet.</p>
              <p className="text-xs text-gray-400 mt-1">Upload a resume in AI Upgrade or export one — it'll appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {files.map(f => (
                <div key={f.path} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg">{f.category === 'generated' ? '📤' : '📄'}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{f.name.replace(/^[a-f0-9]{8}_/, '')}</div>
                      <div className="text-[11px] text-gray-400">
                        <span className={`px-1.5 py-0.5 rounded-full ${catBadge(f.category)}`}>{f.category}</span>
                        {f.size ? ` · ${fmtSize(f.size)}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {f.url && (
                      // eslint-disable-next-line @next/next/no-html-link-for-pages
                      <a href={f.url} target="_blank" rel="noreferrer"
                        className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition">Download</a>
                    )}
                    <button onClick={() => deleteFile(f.path)}
                      className="text-xs text-red-500 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* API Keys */}
        <div className="panel-premium p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-800">API Keys</h2>
            <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">API docs ↗</a>
          </div>
          <p className="text-xs text-gray-400 mb-4">Programmatic access to the public <code className="bg-gray-100 px-1 rounded">/api/v1</code> endpoints (rate-limited to 60/min).</p>

          {revealedKey && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="text-xs font-semibold text-amber-800 mb-1">✓ Key created — copy it now, it won't be shown again</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white border border-amber-200 rounded-lg px-3 py-2 break-all">{revealedKey}</code>
                <button onClick={() => { navigator.clipboard.writeText(revealedKey) }}
                  className="text-xs bg-amber-600 text-white px-3 py-2 rounded-lg hover:bg-amber-700 transition">Copy</button>
                <button onClick={() => setRevealedKey('')} className="text-xs text-gray-400 hover:text-gray-600 px-2">Done</button>
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Key name (e.g. Zapier integration)" className="input-premium flex-1" />
            <button onClick={createKey} disabled={creatingKey} className="btn-primary text-sm whitespace-nowrap">
              {creatingKey ? 'Creating…' : '+ New Key'}
            </button>
          </div>

          {loadingKeys ? (
            <div className="space-y-2">{[0, 1].map(i => <div key={i} className="h-12 rounded-xl bg-gray-100 shimmer" />)}</div>
          ) : keys.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No API keys yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {keys.map(k => (
                <div key={k.id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {k.name} {k.revoked && <span className="text-[11px] text-red-500">(revoked)</span>}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      <code>{k.key_prefix}…</code> · created {k.created_at ? new Date(k.created_at).toLocaleDateString() : ''}
                      {k.last_used ? ` · last used ${new Date(k.last_used).toLocaleDateString()}` : ' · never used'}
                    </div>
                  </div>
                  {!k.revoked && (
                    <button onClick={() => revokeKey(k.id)}
                      className="text-xs text-red-500 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition flex-shrink-0">Revoke</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Webhooks */}
        <div className="panel-premium p-6">
          <h2 className="font-semibold text-gray-800 mb-1">Webhooks</h2>
          <p className="text-xs text-gray-400 mb-4">Get notified at your URL when events happen (HMAC-signed, retried 3×).</p>

          {revealedSecret && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="text-xs font-semibold text-amber-800 mb-1">✓ Signing secret — copy it now, it won't be shown again</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white border border-amber-200 rounded-lg px-3 py-2 break-all">{revealedSecret}</code>
                <button onClick={() => navigator.clipboard.writeText(revealedSecret)} className="text-xs bg-amber-600 text-white px-3 py-2 rounded-lg hover:bg-amber-700 transition">Copy</button>
                <button onClick={() => setRevealedSecret('')} className="text-xs text-gray-400 hover:text-gray-600 px-2">Done</button>
              </div>
            </div>
          )}

          {/* create */}
          <div className="mb-4 space-y-2">
            <input value={hookUrl} onChange={e => setHookUrl(e.target.value)} placeholder="https://your-app.com/webhooks/resumeai" className="input-premium" />
            {allEvents.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allEvents.map(e => (
                  <button key={e} onClick={() => toggleEvent(e)}
                    className={`text-[11px] px-2 py-1 rounded-full border transition ${
                      hookEvents.has(e) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}>
                    {hookEvents.has(e) ? '✓ ' : ''}{e}
                  </button>
                ))}
              </div>
            )}
            <button onClick={createWebhook} disabled={creatingHook || !hookUrl.trim()} className="btn-primary text-sm">
              {creatingHook ? 'Creating…' : '+ Add Webhook'} {hookEvents.size > 0 ? `(${hookEvents.size} events)` : '(all events)'}
            </button>
          </div>

          {loadingHooks ? (
            <div className="space-y-2">{[0, 1].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 shimmer" />)}</div>
          ) : webhooks.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No webhooks yet.</p>
          ) : (
            <div className="space-y-2">
              {webhooks.map(w => (
                <div key={w.id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{w.url}</div>
                      <div className="text-[11px] text-gray-400">{(w.events || []).length} event{(w.events || []).length === 1 ? '' : 's'} · <code>{w.secret_hint}</code></div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${w.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{w.active ? 'Active' : 'Paused'}</span>
                      <button onClick={() => toggleWebhook(w)} className="text-xs text-gray-500 hover:text-gray-800">{w.active ? 'Pause' : 'Resume'}</button>
                      <button onClick={() => testWebhook(w.id)} className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition">Test</button>
                      <button onClick={() => deleteWebhook(w.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                    </div>
                  </div>
                  {testResult[w.id] && (
                    <div className={`text-[11px] mt-2 ${testResult[w.id].startsWith('✓') ? 'text-green-600' : testResult[w.id] === 'sending' ? 'text-gray-400' : 'text-red-500'}`}>
                      {testResult[w.id] === 'sending' ? 'Sending test…' : testResult[w.id]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="panel-premium p-6">
          <h2 className="font-semibold text-red-600 mb-4">Danger Zone</h2>
          <button className="border border-red-200 text-red-500 hover:bg-red-50 px-4 py-2 rounded-xl text-sm transition">
            Delete Account
          </button>
        </div>
      </div>
    </AppShell>
  )
}
