'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'

type QType = 'Technical' | 'HR' | 'Behavioral'

interface Question { question: string; answer?: string; type: QType }

const MOCK_QUESTIONS: Question[] = [
  { type: 'Technical', question: 'Explain the difference between `var`, `let`, and `const` in JavaScript.' },
  { type: 'Technical', question: 'How does React reconciliation work?' },
  { type: 'Technical', question: 'What are the SOLID principles?' },
  { type: 'HR', question: 'Tell me about yourself.' },
  { type: 'HR', question: 'Where do you see yourself in 5 years?' },
  { type: 'HR', question: 'Why do you want to leave your current job?' },
  { type: 'Behavioral', question: 'Describe a time you handled a difficult team conflict.' },
  { type: 'Behavioral', question: 'Give an example of a project where you showed leadership.' },
]

const TYPE_COLORS: Record<QType, string> = {
  Technical: 'bg-blue-100 text-blue-700',
  HR: 'bg-purple-100 text-purple-700',
  Behavioral: 'bg-green-100 text-green-700',
}

interface ResumeLite { content?: { personalInfo?: { jobTitle?: string } }; title?: string }

export default function InterviewQuestionsPage() {
  const [jobTitle, setJobTitle] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [questions, setQuestions] = useState<Question[]>(MOCK_QUESTIONS)
  const [isAiSet, setIsAiSet] = useState(false) // are the shown questions AI-generated?
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeFilter, setActiveFilter] = useState<QType | 'All'>('All')
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({})
  const [feedback, setFeedback] = useState<Record<number, string>>({})
  const [samples, setSamples] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<string | null>(null) // e.g. "fb-3" or "sa-3"

  const generate = async (titleArg?: string) => {
    const jt = (titleArg ?? jobTitle).trim()
    if (!jt) { setError('Enter or select a job role first.'); return }
    setJobTitle(jt)
    setLoading(true)
    setError('')
    try {
      const r = await api.post<{ questions: Question[] }>('/api/ai/interview-questions', { job_title: jt })
      if (r.questions?.length) {
        setQuestions(r.questions)
        setIsAiSet(true)
        setExpandedIdx(null); setFeedback({}); setSamples({}); setUserAnswers({})
      } else {
        setError('Could not generate questions for that role — try rephrasing it.')
      }
    } catch {
      setError('Generation failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // On load: pull job roles from the user's resumes and auto-generate for the latest one
  useEffect(() => {
    api.get<ResumeLite[]>('/api/resumes/')
      .then(list => {
        const titles = Array.from(new Set(
          (list || []).map(r => r.content?.personalInfo?.jobTitle?.trim()).filter((t): t is string => !!t)
        ))
        setRoles(titles)
        if (titles.length) {
          setJobTitle(titles[0])
          generate(titles[0])
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getFeedback = async (i: number) => {
    const answer = (userAnswers[i] || '').trim()
    if (!answer) { setFeedback(f => ({ ...f, [i]: 'Type your answer above first, then get feedback.' })); return }
    setBusy(`fb-${i}`)
    try {
      const r = await api.post<{ feedback: string }>('/api/ai/answer-feedback', { question: questions[i].question, answer })
      setFeedback(f => ({ ...f, [i]: r.feedback }))
    } catch {} finally { setBusy(null) }
  }

  const getSample = async (i: number) => {
    setBusy(`sa-${i}`)
    try {
      const r = await api.post<{ answer: string }>('/api/ai/sample-answer', { question: questions[i].question, job_title: jobTitle })
      setSamples(s => ({ ...s, [i]: r.answer }))
    } catch {} finally { setBusy(null) }
  }

  const filtered = activeFilter === 'All' ? questions : questions.filter(q => q.type === activeFilter)

  const counts = {
    Technical: questions.filter(q => q.type === 'Technical').length,
    HR: questions.filter(q => q.type === 'HR').length,
    Behavioral: questions.filter(q => q.type === 'Behavioral').length,
  }

  const topBar = (
    <>
      <div className="flex-1">
        <h1 className="text-sm font-semibold text-gray-800">Interview Questions</h1>
        <p className="text-xs text-gray-400">AI-generated questions to ace your interview</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 px-3 py-1.5 rounded-full">
        <span>💬</span> Interview Prep
      </div>
    </>
  )

  return (
    <AppShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Generator */}
        <div className="panel-premium p-5 mb-6">
          <h2 className="font-semibold text-gray-800 mb-1">Generate Interview Questions</h2>
          <p className="text-xs text-gray-400 mb-4">Pick a role from your resumes or type any job title — questions update automatically.</p>

          {roles.length > 0 && (
            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">Your resume roles</label>
              <select
                value={roles.includes(jobTitle) ? jobTitle : ''}
                onChange={e => { if (e.target.value) generate(e.target.value) }}
                disabled={loading}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">— Select a role —</option>
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          <div className="flex gap-3">
            <input value={jobTitle} onChange={e => setJobTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate()}
              placeholder="Or type a job title (e.g. Senior React Developer)"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <button onClick={() => generate()} disabled={loading || !jobTitle.trim()}
              className="btn-primary text-sm !px-6 !py-2.5">
              {loading ? <><span className="animate-spin">⟳</span> Generating…</> : '💬 Generate Questions'}
            </button>
          </div>

          {error && <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
          {isAiSet && !loading && !error && (
            <div className="mt-3 text-xs text-green-700">✓ Showing AI questions tailored for <span className="font-semibold">{jobTitle}</span></div>
          )}
          {!isAiSet && !loading && (
            <div className="mt-3 text-xs text-gray-400">Showing sample questions — select a role above to tailor them.</div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {(Object.keys(counts) as QType[]).map(type => (
            <div key={type} className="panel-premium p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${TYPE_COLORS[type].replace('text-', 'text-').split(' ')[0]}`}>
                {type === 'Technical' ? '⚙️' : type === 'HR' ? '🤝' : '💡'}
              </div>
              <div>
                <div className="text-xl font-bold text-gray-800">{counts[type]}</div>
                <div className="text-xs text-gray-400">{type} Questions</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {(['All', 'Technical', 'HR', 'Behavioral'] as const).map(f => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${
                activeFilter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 shadow-sm'
              }`}>
              {f} {f !== 'All' && `(${counts[f as QType]})`}
            </button>
          ))}
        </div>

        {/* Questions list */}
        <div className="space-y-3">
          {questions.map((q, i) => {
            if (activeFilter !== 'All' && q.type !== activeFilter) return null
            return (
            <div key={i} className="panel-premium overflow-hidden">
              <button
                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50 transition">
                <div className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${TYPE_COLORS[q.type]}`}>
                  {q.type}
                </div>
                <span className="flex-1 text-sm text-gray-800 font-medium">{q.question}</span>
                <span className="text-gray-300 text-sm">{expandedIdx === i ? '▲' : '▼'}</span>
              </button>

              {expandedIdx === i && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                  <div className="text-xs text-gray-500 mb-2">Your Answer (practice):</div>
                  <textarea
                    value={userAnswers[i] || ''}
                    onChange={e => setUserAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                    placeholder="Type your answer here to practice..."
                    rows={4}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => getFeedback(i)} disabled={busy !== null}
                      className="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                      {busy === `fb-${i}` ? '✨ Reviewing…' : '✨ Get AI Feedback'}
                    </button>
                    <button onClick={() => getSample(i)} disabled={busy !== null}
                      className="text-xs bg-green-50 text-green-600 hover:bg-green-100 px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                      {busy === `sa-${i}` ? '💡 Writing…' : '💡 See Sample Answer'}
                    </button>
                  </div>

                  {feedback[i] && (
                    <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                      <div className="text-xs font-semibold text-indigo-700 mb-1">✨ AI Feedback</div>
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{feedback[i]}</p>
                    </div>
                  )}
                  {samples[i] && (
                    <div className="mt-2 bg-green-50 border border-green-100 rounded-xl p-3">
                      <div className="text-xs font-semibold text-green-700 mb-1">💡 Sample Answer</div>
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{samples[i]}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
