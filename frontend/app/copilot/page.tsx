'use client'

import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'
import { useAuthStore } from '@/lib/store'

interface Msg { role: 'user' | 'assistant'; content: string; ai?: boolean }

interface ResumeLite {
  title?: string
  content?: {
    personalInfo?: { jobTitle?: string; fullName?: string }
    skills?: { name?: string }[]
    summary?: string
  }
}

const FALLBACK_PROMPTS = [
  'How can I make my resume stand out for a senior role?',
  'What skills should I learn next for my career?',
  'Help me write a strong professional summary.',
  'How do I explain a career gap in interviews?',
  'What are common mistakes that hurt ATS scores?',
  'How should I negotiate a higher salary?',
]

export default function CopilotPage() {
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [prompts, setPrompts] = useState<string[]>(FALLBACK_PROMPTS)
  const [profileContext, setProfileContext] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get<{ prompts: string[] }>('/api/ai/copilot/prompts')
      .then(r => { if (r.prompts?.length) setPrompts(r.prompts) })
      .catch(() => {})
    // Build lightweight personalization context from the latest resume
    api.get<ResumeLite[]>('/api/resumes/')
      .then(list => {
        const r = list?.[0]
        if (!r) return
        const jt = r.content?.personalInfo?.jobTitle
        const skills = (r.content?.skills || []).map(s => s?.name).filter(Boolean).slice(0, 12)
        const parts: string[] = []
        if (jt) parts.push(`Target/current role: ${jt}`)
        if (skills.length) parts.push(`Skills: ${skills.join(', ')}`)
        if (r.content?.summary) parts.push(`Summary: ${r.content.summary.slice(0, 300)}`)
        setProfileContext(parts.join('\n'))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || sending) return
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setInput('')
    setSending(true)
    try {
      const r = await api.post<{ reply: string; ai: boolean }>('/api/ai/copilot', {
        message: msg, history, profile_context: profileContext,
      })
      setMessages(prev => [...prev, { role: 'assistant', content: r.reply, ai: r.ai }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: e instanceof Error ? `Sorry, something went wrong: ${e.message}` : 'Sorry, something went wrong.',
      }])
    } finally {
      setSending(false)
    }
  }

  const firstName = user?.full_name?.split(' ')[0] || 'there'

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-7rem)]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 bg-brand-gradient rounded-2xl flex items-center justify-center text-xl shadow-glow">🤖</div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 font-display">Career Copilot</h1>
            <p className="text-sm text-gray-500">Your personal AI career coach — resumes, interviews, skills & salary.</p>
          </div>
        </div>

        {/* Chat area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
          {messages.length === 0 && (
            <div className="card-premium p-6 animate-fade-up">
              <p className="text-gray-800 font-medium mb-1">Hi {firstName} 👋</p>
              <p className="text-sm text-gray-600 mb-4">
                I know your latest resume, so ask me anything. Not sure where to start? Try one of these:
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {prompts.map((p, i) => (
                  <button key={i} onClick={() => send(p)}
                    className="text-left text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2.5 hover:border-indigo-300 hover:bg-indigo-50/50 transition">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-8 h-8 bg-brand-gradient rounded-xl flex items-center justify-center text-sm shadow-soft mr-2 flex-shrink-0">🤖</div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === 'user'
                  ? 'bg-brand-gradient text-white shadow-glow'
                  : 'bg-white border border-gray-100 text-gray-800 shadow-soft'
              }`}>
                {m.content}
                {m.role === 'assistant' && m.ai === false && (
                  <span className="block mt-2 text-[11px] text-gray-500">Offline guidance — AI is at capacity right now.</span>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="w-8 h-8 bg-brand-gradient rounded-xl flex items-center justify-center text-sm shadow-soft mr-2 flex-shrink-0">🤖</div>
              <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-soft">
                <span className="inline-flex gap-1">
                  <span className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="mt-4">
          <form
            onSubmit={e => { e.preventDefault(); send(input) }}
            className="flex items-end gap-2 bg-white border border-gray-200 rounded-2xl p-2 shadow-soft focus-within:ring-2 focus-within:ring-indigo-300"
          >
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
              placeholder="Ask your career coach anything…"
              rows={1}
              className="flex-1 resize-none max-h-32 px-2 py-2 text-sm focus:outline-none bg-transparent"
            />
            <button type="submit" disabled={sending || !input.trim()}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
              Send
            </button>
          </form>
          <p className="text-[11px] text-gray-500 text-center mt-2">Copilot can make mistakes — verify important details.</p>
        </div>
      </div>
    </AppShell>
  )
}
