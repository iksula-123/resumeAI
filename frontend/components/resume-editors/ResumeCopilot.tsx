'use client'

// Resume Copilot — SahiCareer UI/UX + Gamification master phase, Phase F
// (section 13 of the original spec). Lives at the top of the editor's
// existing "Copilot" tab (renamed from "AI Assistant" — same tab, not a
// 6th one, to avoid crowding the 288px rail further).
//
// The opportunities list is NOT a new AI call or a new scoring pass — the
// parent (resumes/[id]/edit/page.tsx) builds it from data already
// computed for Resume Insights (Phase E's `topOpportunities`, itself read
// from POST /api/ats/v2/analyze-editor's real category data) plus a
// zero-AI structural check (`content.projects.length === 0`, etc.). Every
// action button routes to EXISTING functionality (the AI Fixes tab, or
// expanding a real section in the left rail) — nothing here changes resume
// content on its own.
//
// "Ask AI" reuses the existing POST /api/ai/copilot career-coach endpoint
// (services/ai.py::career_copilot) — a read-only chat reply, never
// auto-applied to the resume, so "AI suggestions require user approval
// before changing content" is satisfied by construction: a chat reply
// can't change content at all.

export interface CopilotOpportunity {
  key: string
  label: string
  detail: string
  actionLabel: string
  action: () => void
}

export interface CopilotChatTurn { role: 'user' | 'assistant'; content: string; ai?: boolean }

export interface ResumeCopilotProps {
  opportunities: CopilotOpportunity[]
  chat: CopilotChatTurn[]
  input: string
  onInputChange: (v: string) => void
  onSend: () => void
  loading: boolean
  error: string
}

export default function ResumeCopilot({ opportunities, chat, input, onInputChange, onSend, loading, error }: ResumeCopilotProps) {
  return (
    <section aria-labelledby="resume-copilot-heading" className="rounded-xl border border-royal-100 bg-gradient-to-br from-royal-50/60 to-teal-50/40 p-3.5">
      <h3 id="resume-copilot-heading" className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
        ✨ Resume Copilot
      </h3>

      {opportunities.length > 0 ? (
        <>
          <p className="text-[11px] text-gray-600 mt-1 mb-2">
            I found {opportunities.length} opportunit{opportunities.length === 1 ? 'y' : 'ies'}:
          </p>
          <ol className="space-y-2">
            {opportunities.map((o, i) => (
              <li key={o.key} className="bg-white/80 rounded-lg p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-800">{i + 1}. {o.label}</div>
                    <p className="text-[11px] text-gray-500 mt-0.5">{o.detail}</p>
                  </div>
                  <button
                    onClick={o.action}
                    className="shrink-0 text-[11px] font-medium text-navy-700 bg-royal-100 hover:bg-royal-200 rounded-lg px-2.5 py-1 transition"
                  >
                    {o.actionLabel}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-[11px] text-gray-500 mt-1.5">
          Nothing to flag right now — this resume is in good shape. Ask me anything below.
        </p>
      )}

      {/* Ask AI — read-only chat, never edits the resume itself */}
      <div className="mt-3 border-t border-royal-100/70 pt-2.5">
        {chat.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto mb-2 pr-0.5" aria-live="polite">
            {chat.map((turn, i) => (
              <div key={i} className={`text-[11px] rounded-lg px-2.5 py-1.5 ${
                turn.role === 'user' ? 'bg-navy-600 text-white ml-6' : 'bg-white text-gray-700 mr-6'}`}>
                {turn.content}
                {turn.role === 'assistant' && turn.ai === false && (
                  <div className="text-[9px] text-gray-400 mt-1">📎 guidance mode — AI temporarily unavailable</div>
                )}
              </div>
            ))}
            {loading && <div className="text-[11px] text-gray-400 mr-6">✨ Thinking…</div>}
          </div>
        )}
        {error && <p className="text-[11px] text-red-600 mb-1.5">{error}</p>}
        <form
          onSubmit={e => { e.preventDefault(); onSend() }}
          className="flex gap-1.5"
        >
          <label htmlFor="copilot-ask-input" className="sr-only">Ask Resume Copilot a question</label>
          <input
            id="copilot-ask-input"
            value={input}
            onChange={e => onInputChange(e.target.value)}
            placeholder="Ask AI — e.g. “How do I strengthen my summary?”"
            disabled={loading}
            className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-royal-300 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="text-[11px] font-medium bg-navy-600 hover:bg-navy-700 text-white rounded-lg px-3 py-1.5 transition disabled:opacity-50"
          >
            Ask AI
          </button>
        </form>
      </div>
    </section>
  )
}
