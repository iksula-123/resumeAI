'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Version {
  id: string
  title: string | null
  ats_score: number | null
  source: 'initial' | 'edit' | 'ai_upgrade' | 'rollback' | string
  created_at: string | null
}

const SOURCE_BADGE: Record<string, { label: string; cls: string; icon: string }> = {
  initial:    { label: 'Created',    cls: 'bg-blue-100 text-blue-700',     icon: '✦' },
  edit:       { label: 'Edit',       cls: 'bg-gray-100 text-gray-600',     icon: '✎' },
  ai_upgrade: { label: 'AI Upgrade', cls: 'bg-purple-100 text-purple-700', icon: '✨' },
  rollback:   { label: 'Rolled back',cls: 'bg-amber-100 text-amber-700',   icon: '↺' },
}

function relTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso).getTime()
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

const scoreColor = (s: number | null) =>
  s == null ? 'text-gray-400' : s >= 80 ? 'text-green-600' : s >= 60 ? 'text-amber-600' : 'text-red-500'

interface Props {
  resumeId: string
  open: boolean
  onClose: () => void
  onRestored: () => void
}

export default function VersionHistory({ resumeId, open, onClose, onRestored }: Props) {
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      setVersions(await api.get<Version[]>(`/api/resumes/${resumeId}/versions`))
    } catch {
      setError('Could not load version history.')
    } finally {
      setLoading(false)
    }
  }, [resumeId])

  useEffect(() => { if (open) load() }, [open, load])

  // close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const restore = async (vid: string) => {
    if (!confirm('Restore this version? Your current version is saved to history first, so you can undo.')) return
    setRestoring(vid)
    try {
      await api.post(`/api/resumes/${resumeId}/versions/${vid}/restore`, {})
      onRestored()
      onClose()
    } catch {
      setError('Restore failed. Please try again.')
    } finally {
      setRestoring(null)
    }
  }

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-50 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      {/* drawer */}
      <aside
        className={`fixed top-0 right-0 z-50 h-screen w-full max-w-md glass-card !rounded-none !rounded-l-2xl shadow-glass flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* header */}
        <div className="px-5 py-4 border-b border-white/50 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900 font-display flex items-center gap-2">🕘 Version History</h2>
            <p className="text-xs text-gray-500">Preview and restore any previous version</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</div>}

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-gray-100 shimmer" />)}
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              <div className="text-4xl mb-2">🕘</div>
              No versions yet — they appear as you edit.
            </div>
          ) : (
            <div className="relative pl-4">
              {/* timeline line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-indigo-100" />
              <div className="space-y-3">
                {versions.map((v, i) => {
                  const badge = SOURCE_BADGE[v.source] || SOURCE_BADGE.edit
                  const isLatest = i === 0
                  return (
                    <div key={v.id} className="relative animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                      {/* dot */}
                      <div className={`absolute -left-4 top-4 w-3 h-3 rounded-full border-2 border-white ${isLatest ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                      <div className={`card-premium p-3.5 ${isLatest ? 'ring-1 ring-indigo-200' : ''}`}>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.icon} {badge.label}</span>
                            {isLatest && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">Current</span>}
                          </div>
                          <span className="text-[11px] text-gray-400 whitespace-nowrap">{relTime(v.created_at)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{v.title || 'Untitled'}</div>
                            {v.ats_score != null && (
                              <div className="text-xs text-gray-400">ATS <span className={`font-semibold ${scoreColor(v.ats_score)}`}>{v.ats_score}</span></div>
                            )}
                          </div>
                          {!isLatest && (
                            <button
                              onClick={() => restore(v.id)}
                              disabled={restoring !== null}
                              className="btn-ghost text-xs !py-1.5 !px-3 whitespace-nowrap disabled:opacity-50"
                            >
                              {restoring === v.id ? 'Restoring…' : '↺ Restore'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/50 text-[11px] text-gray-400">
          Snapshots are kept automatically (up to 25 most recent).
        </div>
      </aside>
    </>
  )
}
