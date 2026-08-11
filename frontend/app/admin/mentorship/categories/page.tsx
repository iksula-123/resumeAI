'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminMentorshipShell from '@/components/mentorship/AdminMentorshipShell'
import { api } from '@/lib/api'

interface Category { id: string; name: string; slug: string; icon: string | null; sort_order: number; is_active: boolean; mentor_count: number }

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<{ categories: Category[] }>('/api/mentorship/admin/categories')
      setCategories(data.categories)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const toggleActive = async (c: Category) => {
    setBusy(c.id)
    try { await api.patch(`/api/mentorship/admin/categories/${c.id}`, { is_active: !c.is_active }); await load() }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed') }
    finally { setBusy(null) }
  }

  const createCategory = async () => {
    if (!name.trim()) return
    setCreating(true); setError('')
    try {
      await api.post('/api/mentorship/admin/categories', { name: name.trim(), icon: icon.trim() || null, sort_order: categories.length })
      setName(''); setIcon(''); await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create category')
    } finally {
      setCreating(false)
    }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">Categories</h1>

  return (
    <AdminMentorshipShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="panel-premium p-5 mb-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Add category</h3>
          <div className="flex flex-wrap gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" className="input-premium text-sm flex-1 min-w-[200px]" />
            <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="Icon (emoji, optional)" className="input-premium text-sm max-w-[160px]" />
            <button onClick={createCategory} disabled={creating || !name.trim()} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-40">{creating ? 'Adding…' : 'Add'}</button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="panel-premium h-14 shimmer" />)}</div>
        ) : (
          <div className="panel-premium overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Mentors</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <span className="mr-1.5">{c.icon}</span>
                      <span className="font-medium text-gray-800">{c.name}</span>
                      <span className="text-xs text-gray-400 ml-2">/{c.slug}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{c.mentor_count}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${c.is_active ? 'bg-good-100 text-good-700' : 'bg-gray-100 text-gray-500'}`}>{c.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button disabled={busy === c.id} onClick={() => toggleActive(c)} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition disabled:opacity-40">
                        {c.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminMentorshipShell>
  )
}
