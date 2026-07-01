'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import Link from 'next/link'

export default function HomePage() {
  const { user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (user) router.push('/dashboard')
  }, [user, router])

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold">R</div>
          <span className="font-bold text-gray-900">ResumeAI Pro</span>
        </div>
        <div className="flex gap-3">
          <Link href="/auth/login" className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg text-sm font-medium transition">Login</Link>
          <Link href="/auth/signup" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">Get Started Free</Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-medium px-4 py-2 rounded-full mb-6 border border-indigo-200">
          <span>✨</span> AI-Powered Resume Builder
        </div>
        <h1 className="text-6xl font-extrabold text-gray-900 mb-5 max-w-3xl leading-[1.05] text-balance">
          Build Resumes That{' '}
          <span className="gradient-text">Get You Hired</span>
        </h1>
        <p className="text-lg text-gray-600 mb-9 max-w-xl text-balance">
          AI-powered resume builder with ATS scoring, keyword optimization, and premium templates. Land your dream job faster.
        </p>
        <div className="flex gap-4">
          <Link href="/auth/signup" className="btn-primary text-base !px-8 !py-3.5 animate-pulse-glow">
            Create My Resume →
          </Link>
          <Link href="/templates"
            className="glass text-gray-700 px-8 py-3.5 rounded-[0.85rem] font-medium hover:bg-white/80 transition shadow-soft">
            View Templates
          </Link>
        </div>

        {/* Features row */}
        <div className="flex gap-8 mt-16 text-sm text-gray-600">
          {['AI Resume Writing', 'ATS Score 90+', 'PDF & DOCX Export', 'Multiple Templates'].map(f => (
            <div key={f} className="flex items-center gap-2">
              <span className="text-green-500">✓</span> {f}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
