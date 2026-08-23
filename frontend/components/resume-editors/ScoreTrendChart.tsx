'use client'

// Score Improvement Graph — SahiCareer UI/UX + Gamification master phase,
// section 11. Plots ONLY real Resume ATS Health values (ResumeVersion.
// ats_score, which is always mode_orchestrator.resume_health_mode()'s score
// — see routers/resumes.py::_canonical_ats_score — never Job Match, Role
// Readiness, or a legacy-engine score). Never fabricates a trend: with
// fewer than 2 real points it shows the spec-mandated empty state instead
// of drawing anything.
//
// Reuses the app's existing score-tier colors (green/amber/red — the same
// values CircularScore and the score-tier text already use throughout
// resumes/[id]/edit/page.tsx) rather than introducing a new palette.

import { useState } from 'react'

export interface ScorePoint { label: string; score: number; date: string | null }

const tierColor = (s: number) => (s >= 80 ? '#1E7A46' : s >= 60 ? '#F5A623' : '#c0392b')

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ScoreTrendChart({ points }: { points: ScorePoint[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const real = points.filter(p => p.score != null)
  if (real.length < 2) {
    return (
      <p className="text-xs text-gray-400 text-center py-6">
        Your progress will appear here as you improve your resume.
      </p>
    )
  }

  const first = real[0].score
  const last = real[real.length - 1].score
  const delta = last - first
  const color = tierColor(last)

  const xAt = (i: number) => (real.length === 1 ? 50 : (i / (real.length - 1)) * 100)
  const yAt = (score: number) => 100 - Math.max(0, Math.min(100, score))

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-gray-800">Resume Health</span>
        {delta !== 0 && (
          <span className={`text-[11px] font-medium ${delta > 0 ? 'text-green-600' : 'text-red-500'}`}>
            {delta > 0 ? '+' : ''}{delta} since {fmtDate(real[0].date)}
          </span>
        )}
      </div>
      <div className="relative h-28">
        {/* recessive gridlines at 0/50/100 */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          {[100, 50, 0].map(g => (
            <div key={g} className="flex items-center gap-1">
              <span className="text-[9px] text-gray-300 w-5 text-right">{g}</span>
              <div className="flex-1 border-t border-gray-100" />
            </div>
          ))}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pl-6">
          <polyline
            fill="none"
            stroke={color}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={real.map((p, i) => `${xAt(i)},${yAt(p.score)}`).join(' ')}
          />
          {real.map((p, i) => (
            <circle
              key={i}
              cx={xAt(i)} cy={yAt(p.score)} r={hover === i ? 4 : 3}
              fill={color} stroke="white" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
              className="cursor-pointer transition-[r]"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(h => (h === i ? null : h))}
            />
          ))}
        </svg>
        {hover != null && (
          <div
            className="absolute -translate-x-1/2 -translate-y-full bg-gray-900 text-white text-[10px] rounded-md px-2 py-1 pointer-events-none whitespace-nowrap z-10"
            style={{ left: `calc(1.5rem + ${xAt(hover) * 0.94}%)`, top: `${yAt(real[hover].score) - 4}%` }}
          >
            <div className="font-semibold">{real[hover].score}/100</div>
            <div className="text-gray-300">{real[hover].label}{real[hover].date ? ` · ${fmtDate(real[hover].date)}` : ''}</div>
          </div>
        )}
      </div>
    </div>
  )
}
