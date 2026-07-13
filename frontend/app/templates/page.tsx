'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import ResumeTemplates, { TEMPLATE_LIST } from '@/components/ResumeTemplates'
import { DUMMY_RESUME } from '@/lib/dummyResume'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

const CATEGORIES = ['All Templates', 'Modern', 'Professional', 'Minimal', 'Creative', 'Executive']

export default function TemplatesPage() {
  const [activeCategory, setActiveCategory] = useState('All Templates')
  const [selected, setSelected] = useState('modern')
  const [preview, setPreview] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const router = useRouter()
  const { user } = useAuthStore()

  const filtered = activeCategory === 'All Templates'
    ? TEMPLATE_LIST
    : TEMPLATE_LIST.filter(t => t.category === activeCategory)

  const useTemplate = async (templateId: string) => {
    if (!user) { router.push('/auth/login'); return }
    setCreating(true)
    try {
      const r = await api.post<{ id: string }>('/api/resumes/', {
        title: 'Untitled Resume',
        template_id: templateId,
      })
      router.push(`/resumes/${r.id}/edit`)
    } catch {
      router.push('/resumes/new')
    } finally {
      setCreating(false)
    }
  }

  const selectedTemplate = TEMPLATE_LIST.find(t => t.id === selected)

  const topBar = (
    <>
      <div className="flex-1">
        <h1 className="text-sm font-semibold text-gray-800">Resume Templates</h1>
        <p className="text-xs text-gray-400">Choose a professional template to get started</p>
      </div>
    </>
  )

  return (
    <AppShell topBar={topBar}>
      <div className="flex h-[calc(100vh-56px)] overflow-hidden">

        {/* Left: Template list */}
        <div className="w-72 bg-white border-r border-gray-100 flex flex-col overflow-hidden flex-shrink-0">
          {/* Category filters */}
          <div className="p-3 border-b border-gray-100">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    activeCategory === cat
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {cat.replace(' Templates', '')}
                </button>
              ))}
            </div>
          </div>

          {/* Template cards */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {filtered.map(template => (
              <div key={template.id}
                onClick={() => setSelected(template.id)}
                className={`rounded-xl overflow-hidden cursor-pointer border-2 transition-all hover:shadow-md ${
                  selected === template.id ? 'border-indigo-500 shadow-md' : 'border-transparent hover:border-gray-200'
                }`}>
                {/* Mini preview */}
                <div className="relative h-36 bg-gray-50 overflow-hidden">
                  <div className="absolute inset-0" style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '286%', height: '286%' }}>
                    <ResumeTemplates content={DUMMY_RESUME} template={template.id} />
                  </div>
                  {template.popular && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">Popular</div>
                  )}
                  {template.pro && (
                    <div className="absolute top-2 right-2 bg-purple-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">Pro</div>
                  )}
                  {selected === template.id && (
                    <div className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center">
                      <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm">✓</div>
                    </div>
                  )}
                </div>
                <div className="p-2.5 bg-white">
                  <div className="font-semibold text-sm text-gray-800">{template.name}</div>
                  <div className="text-xs text-gray-400">{template.description}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Use button */}
          <div className="p-3 border-t border-gray-100">
            <button
              onClick={() => useTemplate(selected)}
              disabled={creating}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {creating ? (
                <><span className="animate-spin">⟳</span> Creating…</>
              ) : (
                <>Use {selectedTemplate?.name} Template →</>
              )}
            </button>
            <button onClick={() => setPreview(preview ? null : selected)}
              className="w-full mt-2 bg-gray-50 hover:bg-gray-100 text-gray-700 py-2 rounded-xl text-xs font-medium transition">
              {preview ? 'Exit Fullscreen' : '🔍 Fullscreen Preview'}
            </button>
          </div>
        </div>

        {/* Right: Live preview */}
        <div className="flex-1 bg-[#F0F2F8] overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            {/* Template info header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-gray-800">{selectedTemplate?.name} Template</h2>
                <p className="text-xs text-gray-500">{selectedTemplate?.description} · Showing with sample data</p>
              </div>
              <div className="flex gap-2">
                {TEMPLATE_LIST.map(t => (
                  <button key={t.id} onClick={() => setSelected(t.id)}
                    title={t.name}
                    className={`w-6 h-6 rounded-full border-2 transition ${selected === t.id ? 'border-indigo-500 scale-110' : 'border-gray-300 hover:border-gray-400'}`}
                    style={{ background: t.accent }} />
                ))}
              </div>
            </div>

            {/* Resume preview */}
            <div className="bg-white shadow-xl rounded-xl overflow-hidden">
              <ResumeTemplates content={DUMMY_RESUME} template={selected} />
            </div>

            {/* CTA */}
            <div className="mt-6 flex gap-3 justify-center">
              <button onClick={() => useTemplate(selected)} disabled={creating}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-3 rounded-xl font-medium hover:opacity-90 transition shadow-lg shadow-indigo-200 disabled:opacity-50">
                {creating ? 'Creating…' : `Start with ${selectedTemplate?.name} →`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
