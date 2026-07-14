'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'

interface AdminUser {
  id: string
  email: string
  full_name: string
  role: 'user' | 'admin'
  subscription_tier: string
  is_active: boolean
  last_login: string | null
  created_at: string | null
}

interface Stats {
  total_users: number
  total_admins: number
  total_resumes: number
  total_cover_letters: number
  pro_users: number
}

interface Analytics {
  totals: { users: number; resumes: number; applications: number; cover_letters: number; ats_reports: number; avg_ats: number }
  ai: {
    requests: number; input_tokens: number; output_tokens: number; total_tokens: number; est_cost: number
    per_feature: { feature: string; tokens: number; requests: number }[]
    top_users: { email: string; tokens: number; cost: number }[]
  }
}

interface AuditEntry {
  id: string
  actor_email: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  meta: Record<string, unknown>
  created_at: string | null
}

export default function AdminPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, an, u, al] = await Promise.all([
        api.get<Stats>('/api/admin/stats'),
        api.get<Analytics>('/api/admin/analytics'),
        api.get<AdminUser[]>('/api/admin/users'),
        api.get<AuditEntry[]>('/api/admin/audit-logs?limit=50'),
      ])
      setStats(s)
      setAnalytics(an)
      setUsers(u)
      setAudit(al)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return }
    if (user.role !== 'admin') { router.push('/dashboard'); return }
    load()
  }, [user, router, load])

  const setRole = async (u: AdminUser, role: 'user' | 'admin') => {
    setBusy(u.id)
    try {
      const updated = await api.patch<AdminUser>(`/api/admin/users/${u.id}/role`, { role })
      setUsers(prev => prev.map(x => x.id === u.id ? updated : x))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  const setActive = async (u: AdminUser, is_active: boolean) => {
    setBusy(u.id)
    try {
      const updated = await api.patch<AdminUser>(`/api/admin/users/${u.id}/active`, { is_active })
      setUsers(prev => prev.map(x => x.id === u.id ? updated : x))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  const deleteUser = async (u: AdminUser) => {
    if (!confirm(`Delete ${u.email}? This removes all their resumes and cover letters.`)) return
    setBusy(u.id)
    try {
      await api.delete(`/api/admin/users/${u.id}`)
      setUsers(prev => prev.filter(x => x.id !== u.id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  const topBar = (
    <>
      <div className="flex-1">
        <h1 className="text-sm font-semibold text-gray-800 flex items-center gap-2">🛡️ Admin Panel</h1>
        <p className="text-xs text-gray-400">Manage users, roles, and platform data</p>
      </div>
      <button onClick={load} className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition">
        ↻ Refresh
      </button>
    </>
  )

  const statCards = stats ? [
    { label: 'Total Users', value: stats.total_users, icon: '👥', color: 'bg-blue-50 text-blue-700' },
    { label: 'Admins', value: stats.total_admins, icon: '🛡️', color: 'bg-purple-50 text-purple-700' },
    { label: 'Pro Users', value: stats.pro_users, icon: '⭐', color: 'bg-yellow-50 text-yellow-700' },
    { label: 'Resumes', value: stats.total_resumes, icon: '📄', color: 'bg-green-50 text-green-700' },
    { label: 'Cover Letters', value: stats.total_cover_letters, icon: '✉️', color: 'bg-orange-50 text-orange-700' },
  ] : []

  return (
    <AppShell topBar={topBar}>
      <div className="p-6 max-w-6xl mx-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm mb-4">{error}</div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {loading && !stats
            ? [1,2,3,4,5].map(i => <div key={i} className="panel-premium h-28 shimmer" />)
            : statCards.map(s => (
              <div key={s.label} className="card-premium p-5">
                <div className={`w-11 h-11 ${s.color} rounded-xl flex items-center justify-center text-xl mb-3 shadow-soft`}>{s.icon}</div>
                <div className="text-2xl font-bold text-gray-800 font-display">{s.value}</div>
                <div className="text-xs text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
        </div>

        {/* AI Usage & Cost Analytics */}
        {analytics && (
          <div className="mb-8">
            <h2 className="font-bold text-gray-900 font-display mb-3">AI Usage & Cost</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {[
                { label: 'AI Requests', value: analytics.ai.requests.toLocaleString(), icon: '⚡', color: 'bg-indigo-50 text-indigo-700' },
                { label: 'Total Tokens', value: analytics.ai.total_tokens.toLocaleString(), icon: '🔢', color: 'bg-blue-50 text-blue-700' },
                { label: 'Est. Cost', value: `$${analytics.ai.est_cost.toFixed(4)}`, icon: '💰', color: 'bg-green-50 text-green-700' },
                { label: 'Avg ATS Score', value: analytics.totals.avg_ats || '—', icon: '🎯', color: 'bg-orange-50 text-orange-700' },
              ].map(s => (
                <div key={s.label} className="card-premium p-5">
                  <div className={`w-11 h-11 ${s.color} rounded-xl flex items-center justify-center text-xl mb-3 shadow-soft`}>{s.icon}</div>
                  <div className="text-2xl font-bold text-gray-800 font-display">{s.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Per-feature token usage */}
              <div className="panel-premium p-5">
                <h3 className="font-semibold text-gray-800 mb-3 text-sm">Tokens by feature</h3>
                {analytics.ai.per_feature.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4">No AI usage recorded yet — it populates as AI features are used.</p>
                ) : (
                  <div className="space-y-2.5">
                    {(() => {
                      const max = Math.max(...analytics.ai.per_feature.map(f => f.tokens), 1)
                      return analytics.ai.per_feature.map(f => (
                        <div key={f.feature} className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 w-28 truncate capitalize">{f.feature.replace(/-/g, ' ')}</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" style={{ width: `${(f.tokens / max) * 100}%` }} />
                          </div>
                          <span className="text-xs font-medium text-gray-700 w-16 text-right">{f.tokens.toLocaleString()}</span>
                        </div>
                      ))
                    })()}
                  </div>
                )}
              </div>

              {/* Top users by tokens */}
              <div className="panel-premium p-5">
                <h3 className="font-semibold text-gray-800 mb-3 text-sm">Top users by AI usage</h3>
                {analytics.ai.top_users.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4">No per-user usage yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {analytics.ai.top_users.map((u, i) => (
                      <div key={u.email} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                          <span className="text-sm text-gray-700 truncate">{u.email}</span>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs font-semibold text-gray-800">{u.tokens.toLocaleString()} tok</div>
                          <div className="text-[11px] text-gray-400">${u.cost.toFixed(4)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Users table */}
        <div className="panel-premium overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Users ({users.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Last Login</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isSelf = u.id === user?.id
                  return (
                    <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 text-xs font-bold">
                            {(u.full_name || u.email)[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-gray-800">{u.full_name || '—'} {isSelf && <span className="text-xs text-indigo-500">(you)</span>}</div>
                            <div className="text-xs text-gray-400">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 capitalize text-gray-600">{u.subscription_tier}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {u.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-400">
                        {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1.5 justify-end">
                          {u.role === 'admin' ? (
                            <button disabled={isSelf || busy === u.id} onClick={() => setRole(u, 'user')}
                              className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition disabled:opacity-40">
                              Demote
                            </button>
                          ) : (
                            <button disabled={busy === u.id} onClick={() => setRole(u, 'admin')}
                              className="text-xs px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 transition disabled:opacity-40">
                              Make Admin
                            </button>
                          )}
                          <button disabled={isSelf || busy === u.id} onClick={() => setActive(u, !u.is_active)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition disabled:opacity-40">
                            {u.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button disabled={isSelf || busy === u.id} onClick={() => deleteUser(u)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition disabled:opacity-40">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Audit Log */}
        <div className="panel-premium overflow-hidden mt-8">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Audit Log</h2>
            <span className="text-xs text-gray-400">{audit.length} recent events</span>
          </div>
          {audit.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No audit events yet.</p>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
              {audit.map(a => (
                <div key={a.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50/50">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 flex-shrink-0">{a.action}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-700">{a.actor_email || 'system'}</span>
                    {a.entity_type && (
                      <span className="text-xs text-gray-400"> · {a.entity_type}{a.meta?.title ? ` “${String(a.meta.title)}”` : a.meta?.email ? ` (${String(a.meta.email)})` : ''}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                    {a.created_at ? new Date(a.created_at).toLocaleString() : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
