'use client'

/** My Mentees — currently matched/active mentees, with a quick way to
 * assign them a task (My Tasks, on their side). */
import { useEffect, useState } from 'react'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import { api } from '@/lib/api'

interface Learner { learner_id: string; name: string | null }

export default function MyMenteesPage() {
  const [learners, setLearners] = useState<Learner[] | null>(null)
  const [assigningTo, setAssigningTo] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    api.get<{ learners: Learner[] }>('/api/mentorship/mentor/dashboard').then((d) => setLearners(d.learners)).catch(() => setLearners([]))
  }, [])

  const assignTask = async (menteeId: string) => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await api.post('/api/mentorship/mentor/tasks', { mentee_id: menteeId, title, due_date: dueDate || null })
      setDone(menteeId)
      setTitle(''); setDueDate(''); setAssigningTo(null)
      setTimeout(() => setDone(null), 2000)
    } finally {
      setSaving(false)
    }
  }

  const topBar = <h1 className="text-sm font-semibold text-gray-800">My Mentees</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-3xl mx-auto">
        <section className="panel-premium p-5">
          {learners === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : learners.length === 0 ? (
            <p className="text-sm text-gray-400">No mentees have booked with you yet.</p>
          ) : (
            <div className="space-y-3">
              {learners.map((l) => (
                <div key={l.learner_id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="w-8 h-8 rounded-full bg-brand-gradient text-white text-xs font-bold flex items-center justify-center">
                        {(l.name || '?').charAt(0).toUpperCase()}
                      </span>
                      {l.name || 'Learner'}
                    </div>
                    <button onClick={() => setAssigningTo(assigningTo === l.learner_id ? null : l.learner_id)} className="text-xs text-royal-600 hover:underline">
                      {done === l.learner_id ? 'Assigned ✓' : 'Assign Task'}
                    </button>
                  </div>
                  {assigningTo === l.learner_id && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" className="input-premium text-xs flex-1 min-w-[160px]" />
                      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input-premium text-xs w-40" />
                      <button onClick={() => assignTask(l.learner_id)} disabled={saving || !title.trim()} className="btn-primary text-xs !min-h-0 px-4">{saving ? '…' : 'Assign'}</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </MentorshipShell>
  )
}
