'use client'

/** Public, read-only resume view (spec Milestone H — shareable web link). No auth. */
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import ResumePreview, { type ResumeContent } from '@/components/ResumePreview'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function PublicResumePage() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<{ title: string; template_id: string; content: ResumeContent } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API}/api/resumes/public/${slug}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Not found')
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [slug])

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F7FA] px-4 text-center">
      <div className="text-4xl mb-2">🔒</div>
      <p className="text-gray-700 font-medium">{error}</p>
    </div>
  )
  if (!data) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
      <div className="w-10 h-10 border-4 border-navy-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F5F7FA] py-6 px-3">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <ResumePreview content={data.content} template={data.template_id || 'modern'} />
        </div>
        <p className="text-center text-xs text-gray-500 mt-4">Made with SahiCareer · My Resume</p>
      </div>
    </div>
  )
}
