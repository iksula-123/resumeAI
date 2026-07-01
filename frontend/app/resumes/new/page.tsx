'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'

export default function NewResumePage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const create = async () => {
      // Wait briefly for the persisted store to rehydrate the token
      const token = useAuthStore.getState().accessToken
      if (!token) {
        router.push('/auth/login')
        return
      }
      try {
        const r = await api.post<{ id: string }>('/api/resumes/', {
          title: 'Untitled Resume',
          template_id: 'modern',
        })
        router.replace(`/resumes/${r.id}/edit`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create resume')
      }
    }
    create()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
      <div className="flex flex-col items-center gap-3">
        {error ? (
          <>
            <div className="text-red-500 text-4xl">⚠️</div>
            <p className="text-gray-700 text-sm font-medium">Could not create resume</p>
            <p className="text-gray-400 text-xs">{error}</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => { started.current = false; setError(''); location.reload() }}
                className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition">
                Try Again
              </button>
              <button onClick={() => router.push('/dashboard')}
                className="bg-gray-100 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-200 transition">
                Back to Dashboard
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Creating your resume…</p>
          </>
        )}
      </div>
    </div>
  )
}
