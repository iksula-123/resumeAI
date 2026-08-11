'use client'

/** My Tasks — action items a mentor assigned (tied to a session/program),
 * plus the mentee's own Career Goals. */
import { useEffect, useState } from 'react'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import { api } from '@/lib/api'

interface TaskRow {
  id: string; title: string; description: string | null; due_date: string | null
  status: 'pending' | 'completed'; assigned_by_name: string | null; created_at: string | null
}
interface CareerGoal { id: string; title: string; description: string | null; target_date: string | null; status: string; created_at: string | null }

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<TaskRow[] | null>(null)
  const [goals, setGoals] = useState<CareerGoal[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalDate, setNewGoalDate] = useState('')
  const [savingGoal, setSavingGoal] = useState(false)

  const loadTasks = () => api.get<{ tasks: TaskRow[] }>('/api/mentorship/tasks').then((r) => setTasks(r.tasks)).catch(() => setTasks([]))
  const loadGoals = () => api.get<{ goals: CareerGoal[] }>('/api/mentorship/career-goals').then((r) => setGoals(r.goals)).catch(() => setGoals([]))
  useEffect(() => { loadTasks(); loadGoals() }, [])

  const toggleTask = async (t: TaskRow) => {
    setBusy(t.id)
    try {
      await api.patch(`/api/mentorship/tasks/${t.id}`, { status: t.status === 'completed' ? 'pending' : 'completed' })
      await loadTasks()
    } finally {
      setBusy(null)
    }
  }

  const addGoal = async () => {
    if (!newGoalTitle.trim()) return
    setSavingGoal(true)
    try {
      await api.post('/api/mentorship/career-goals', { title: newGoalTitle, target_date: newGoalDate || null })
      setNewGoalTitle(''); setNewGoalDate('')
      loadGoals()
    } finally {
      setSavingGoal(false)
    }
  }

  const markGoalStatus = async (id: string, status: string) => {
    await api.patch(`/api/mentorship/career-goals/${id}`, { status })
    loadGoals()
  }

  const pending = (tasks || []).filter((t) => t.status === 'pending')
  const done = (tasks || []).filter((t) => t.status === 'completed')

  const topBar = <h1 className="text-sm font-semibold text-gray-800">My Tasks</h1>

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
        <section className="panel-premium p-5">
          <h2 className="font-semibold text-gray-800 mb-1">Assigned Tasks</h2>
          <p className="text-xs text-gray-500 mb-4">Action items your mentors have set for you.</p>
          {tasks === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-gray-400">No tasks assigned yet.</p>
          ) : (
            <div className="space-y-4">
              {pending.length > 0 && (
                <div className="space-y-2">
                  {pending.map((t) => (
                    <label key={t.id} className="flex items-start gap-3 border border-gray-100 rounded-xl p-3 cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={false} onChange={() => toggleTask(t)} disabled={busy === t.id} className="mt-1 accent-navy-600" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{t.title}</p>
                        {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                        <p className="text-[11px] text-gray-400 mt-1">
                          {t.assigned_by_name && <>from {t.assigned_by_name}</>}
                          {t.due_date && <> · due {new Date(t.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {done.length > 0 && (
                <div className="space-y-2 border-t border-gray-100 pt-3">
                  {done.map((t) => (
                    <label key={t.id} className="flex items-start gap-3 opacity-60 cursor-pointer">
                      <input type="checkbox" checked onChange={() => toggleTask(t)} disabled={busy === t.id} className="mt-1 accent-navy-600" />
                      <p className="text-sm text-gray-500 line-through">{t.title}</p>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="panel-premium p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Career Goals</h2>
          {goals === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : goals.length === 0 ? (
            <p className="text-sm text-gray-400 mb-3">No goals set yet.</p>
          ) : (
            <div className="space-y-2 mb-3">
              {goals.map((g) => (
                <div key={g.id} className="flex items-start justify-between gap-2 text-sm border border-gray-100 rounded-lg p-2.5">
                  <div className={g.status !== 'active' ? 'line-through text-gray-400' : 'text-gray-700'}>
                    <p className="font-medium">{g.title}</p>
                    {g.target_date && <p className="text-[11px] text-gray-400">by {new Date(g.target_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                  </div>
                  {g.status === 'active' && <button onClick={() => markGoalStatus(g.id, 'completed')} className="text-good-600 hover:underline shrink-0 text-xs">Done</button>}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
            <input value={newGoalTitle} onChange={(e) => setNewGoalTitle(e.target.value)} placeholder="New goal…" className="input-premium text-sm" />
            <div className="flex gap-2">
              <input type="date" value={newGoalDate} onChange={(e) => setNewGoalDate(e.target.value)} className="input-premium text-sm flex-1" />
              <button onClick={addGoal} disabled={savingGoal || !newGoalTitle.trim()} className="btn-secondary text-sm !min-h-0 px-4">{savingGoal ? '…' : 'Add'}</button>
            </div>
          </div>
        </section>
      </div>
    </MentorshipShell>
  )
}
