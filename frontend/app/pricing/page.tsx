'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Great for getting started',
    features: [
      '3 resumes',
      '1 cover letter',
      'Basic templates',
      'PDF export',
      'Community support',
    ],
    cta: 'Get Started',
    plan: null,
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$12',
    period: '/month',
    description: 'For serious job seekers',
    features: [
      'Unlimited resumes',
      'Unlimited cover letters',
      'All premium templates',
      'AI bullet generator',
      'AI cover letter generator',
      'ATS scoring',
      'PDF + DOCX export',
      'Priority support',
    ],
    cta: 'Upgrade to Pro',
    plan: 'pro',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: '$49',
    period: '/month',
    description: 'For teams and career coaches',
    features: [
      'Everything in Pro',
      'Team dashboard',
      'Bulk resume management',
      'White-label option',
      'API access',
      'Dedicated support',
    ],
    cta: 'Contact Sales',
    plan: 'enterprise',
    highlight: false,
  },
]

export default function PricingPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState<string | null>(null)

  const handleUpgrade = async (plan: string | null) => {
    if (!plan) {
      router.push('/auth/signup')
      return
    }
    if (!user) {
      router.push('/auth/login')
      return
    }
    setLoading(plan)
    try {
      const res = await api.post<{ url: string }>('/api/billing/create-checkout', { plan })
      window.location.href = res.url
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Billing not configured'
      alert(msg)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <header className="bg-white shadow px-6 py-4 flex items-center justify-between">
        <button onClick={() => router.push(user ? '/dashboard' : '/')} className="text-gray-500 hover:text-gray-700 text-sm">
          ← {user ? 'Dashboard' : 'Home'}
        </button>
        <h1 className="text-xl font-bold">Pricing</h1>
        <div />
      </header>

      <div className="max-w-5xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Simple, transparent pricing</h2>
          <p className="text-xl text-gray-500">Choose the plan that fits your job search.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 flex flex-col ${
                plan.highlight
                  ? 'bg-blue-600 text-white shadow-2xl scale-105'
                  : 'bg-white border border-gray-200 shadow'
              }`}
            >
              {plan.highlight && (
                <span className="text-xs font-bold uppercase tracking-widest bg-white/20 text-white px-3 py-1 rounded-full w-fit mb-4">
                  Most Popular
                </span>
              )}
              <h3 className={`text-2xl font-bold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                {plan.name}
              </h3>
              <div className="mt-2 mb-1">
                <span className={`text-4xl font-extrabold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                  {plan.price}
                </span>
                <span className={`text-sm ${plan.highlight ? 'text-blue-200' : 'text-gray-500'}`}>
                  {plan.period}
                </span>
              </div>
              <p className={`text-sm mb-6 ${plan.highlight ? 'text-blue-100' : 'text-gray-500'}`}>
                {plan.description}
              </p>

              <ul className="space-y-3 flex-1 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <span className={`text-lg ${plan.highlight ? 'text-blue-200' : 'text-blue-600'}`}>✓</span>
                    <span className={plan.highlight ? 'text-blue-50' : 'text-gray-700'}>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleUpgrade(plan.plan)}
                disabled={loading === plan.plan}
                className={
                  plan.highlight
                    ? 'bg-white text-blue-600 hover:bg-blue-50 font-bold'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }
              >
                {loading === plan.plan ? 'Redirecting…' : plan.cta}
              </Button>
            </div>
          ))}
        </div>

        <p className="text-center text-gray-400 text-sm mt-10">
          All plans include a 7-day free trial. Cancel anytime.
        </p>
      </div>
    </div>
  )
}
