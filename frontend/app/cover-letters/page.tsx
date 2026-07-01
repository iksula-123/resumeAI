'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface CoverLetter {
  id: string
  title: string
  content: string
  updated_at: string
}

interface GenerateForm {
  jobTitle: string
  company: string
  jobDescription: string
}

export default function CoverLettersPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [letters, setLetters] = useState<CoverLetter[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<CoverLetter | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)
  const [form, setForm] = useState<GenerateForm>({ jobTitle: '', company: '', jobDescription: '' })

  useEffect(() => {
    if (!user) { router.push('/auth/login'); return }
    api.get<CoverLetter[]>('/api/cover-letters/')
      .then(setLetters)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user, router])

  const handleGenerate = async () => {
    if (!form.jobTitle || !form.company) return
    setGenerating(true)
    try {
      const res = await api.post<{ cover_letter: string }>('/api/ai/generate-cover-letter', {
        job_title: form.jobTitle,
        company: form.company,
        job_description: form.jobDescription,
        applicant_name: user?.full_name || user?.email || '',
        resume_summary: '',
      })
      const title = `Cover Letter — ${form.jobTitle} at ${form.company}`
      const cl = await api.post<CoverLetter>('/api/cover-letters/', {
        title,
        content: res.cover_letter,
      })
      setLetters((prev) => [cl, ...prev])
      setSelected(cl)
      setShowGenerate(false)
      setForm({ jobTitle: '', company: '', jobDescription: '' })
    } catch (e) {
      console.error(e)
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await api.put<CoverLetter>(`/api/cover-letters/${selected.id}`, {
        title: selected.title,
        content: selected.content,
      })
      setLetters((prev) => prev.map((l) => l.id === updated.id ? updated : l))
      setSelected(updated)
      setEditing(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this cover letter?')) return
    await api.delete(`/api/cover-letters/${id}`)
    setLetters((prev) => prev.filter((l) => l.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow px-6 py-4 flex items-center justify-between">
        <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-700 text-sm">
          ← Dashboard
        </button>
        <h1 className="text-xl font-bold">Cover Letters</h1>
        <Button onClick={() => setShowGenerate(true)} className="bg-blue-600 text-white">
          + Generate with AI
        </Button>
      </header>

      {/* AI Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-lg">
            <h2 className="text-lg font-bold mb-4">Generate Cover Letter</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Job Title *</label>
                <Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder="Software Engineer" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Company *</label>
                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Corp" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Job Description (optional)</label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.jobDescription}
                  onChange={(e) => setForm({ ...form, jobDescription: e.target.value })}
                  placeholder="Paste the job description here for a better result…"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setShowGenerate(false)}>Cancel</Button>
              <Button
                onClick={handleGenerate}
                disabled={generating || !form.jobTitle || !form.company}
                className="bg-blue-600 text-white flex-1"
              >
                {generating ? 'Generating…' : 'Generate'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8 flex gap-6">
        {/* List */}
        <div className="w-72 shrink-0">
          <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">Your Letters</h2>
          {loading ? (
            <p className="text-gray-400 text-sm">Loading…</p>
          ) : letters.length === 0 ? (
            <p className="text-gray-400 text-sm">No cover letters yet. Generate your first one!</p>
          ) : (
            <div className="space-y-2">
              {letters.map((l) => (
                <button
                  key={l.id}
                  onClick={() => { setSelected(l); setEditing(false) }}
                  className={`w-full text-left p-3 rounded-lg border transition ${selected?.id === l.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                >
                  <div className="font-medium text-sm truncate">{l.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{new Date(l.updated_at).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Editor / Viewer */}
        {selected ? (
          <div className="flex-1 bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              {editing ? (
                <Input
                  value={selected.title}
                  onChange={(e) => setSelected({ ...selected, title: e.target.value })}
                  className="font-semibold text-lg w-80"
                />
              ) : (
                <h2 className="text-lg font-semibold">{selected.title}</h2>
              )}
              <div className="flex gap-2">
                {editing ? (
                  <>
                    <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="bg-blue-600 text-white">
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setEditing(true)}>Edit</Button>
                    <Button
                      variant="outline"
                      className="text-red-500 border-red-200 hover:bg-red-50"
                      onClick={() => handleDelete(selected.id)}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
            {editing ? (
              <textarea
                className="w-full border rounded-md px-3 py-3 text-sm leading-relaxed min-h-[400px] focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                value={selected.content}
                onChange={(e) => setSelected({ ...selected, content: e.target.value })}
              />
            ) : (
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
                {selected.content || <span className="text-gray-400 italic">No content yet.</span>}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Select a cover letter to view or edit
          </div>
        )}
      </div>
    </div>
  )
}
