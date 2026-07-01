'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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

export default function SettingsPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [name, setName] = useState(user?.full_name || '')
  const [saved, setSaved] = useState(false)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loadingPayments, setLoadingPayments] = useState(true)

  useEffect(() => {
    api.get<Payment[]>('/api/billing/payments')
      .then(setPayments)
      .catch(() => setPayments([]))
      .finally(() => setLoadingPayments(false))
  }, [])

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
              <div className="text-xs text-gray-500 mt-0.5">
                {user?.subscription_tier === 'free' ? 'Upgrade to unlock AI features, unlimited resumes, and more.' : 'You have access to all features.'}
              </div>
            </div>
            {user?.subscription_tier === 'free' && (
              <button onClick={() => router.push('/pricing')} className="btn-primary text-xs !py-2 !px-4">
                Upgrade to Pro
              </button>
            )}
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
