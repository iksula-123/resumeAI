'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Note { id: string; note_text: string; visibility: string; author_name: string | null; is_mine: boolean; created_at: string | null }

export default function SessionNotes({ sessionId }: { sessionId: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    api.get<{ notes: Note[] }>(`/api/mentorship/sessions/${sessionId}/notes`)
      .then((r) => setNotes(r.notes))
      .finally(() => setLoading(false))
  }
  useEffect(load, [sessionId])

  const add = async () => {
    if (!text.trim()) return
    setSaving(true)
    try {
      await api.post(`/api/mentorship/sessions/${sessionId}/notes`, { note_text: text, visibility: 'shared' })
      setText('')
      load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      {loading ? (
        <p className="text-xs text-gray-400">Loading notes…</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-gray-400 mb-2">No notes yet.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {notes.map((n) => (
            <div key={n.id} className="text-xs bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-gray-700">{n.note_text}</p>
              <p className="text-[10px] text-gray-400 mt-1">{n.is_mine ? 'You' : n.author_name || 'Mentor'}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note (visible to your mentor too)…"
          className="input-premium text-xs flex-1"
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button onClick={add} disabled={saving || !text.trim()} className="btn-secondary text-xs !min-h-0 px-3">
          {saving ? '…' : 'Add'}
        </button>
      </div>
    </div>
  )
}
