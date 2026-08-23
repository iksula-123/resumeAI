'use client'

// Resume Insights — SahiCareer UI/UX + Gamification master phase, Phase E.
//
// A read-only, wider "career intelligence" view of the SAME canonical
// scoring data the editor's Insights tab (Phase C) and Resume Health Card
// already show — laid out with room to breathe instead of a 288px sidebar.
// Every number here is either:
//   (a) the exact score POST /api/ats/v2/analyze-editor returned
//       (mode_orchestrator.resume_health_mode(), via
//       resume_health_as_full_analysis() — see that function's docstring),
//   (b) Profile Completeness, computed client-side by the SAME
//       computeCompletion() the Resume Progress bar already uses, or
//   (c) ResumeVersion.ats_score history, always the same canonical score
//       at an earlier point in time.
// Nothing here computes, blends, or reinterprets a score. Job Match and
// Role Readiness are never shown as if they were Resume ATS Health.

import type { CompletionSection } from '@/lib/resumeContent'
import type { InsightCategory } from './CategoryScoreRow'
import ATSCompatibilityCard from './ATSCompatibilityCard'
import ResumeQualityCard from './ResumeQualityCard'
import ProfileCompletenessCard from './ProfileCompletenessCard'
import TopOpportunities, { type Opportunity } from './TopOpportunities'
import ScoreHistory from './ScoreHistory'

const tierLabel = (s: number) =>
  s >= 85 ? 'Excellent! 🌟' : s >= 70 ? 'Good Progress 🚀' : s >= 50 ? 'Making Progress 💪' : 'Just Getting Started 🌱'
const tierColor = (s: number) => (s >= 80 ? 'text-green-600' : s >= 60 ? 'text-amber-600' : 'text-red-600')

export interface ResumeInsightsProps {
  loading: boolean
  error: string
  onRetry: () => void
  score: number | null
  confidence: 'high' | 'medium' | 'low' | null
  compatScore: number | null
  qualityScore: number | null
  compatCategories: InsightCategory[]
  qualityCategories: InsightCategory[]
  completionPct: number
  completionSections: CompletionSection[]
  opportunities: Opportunity[]
  scoreHistoryPrevious: number | null
  scoreHistoryCurrent: number | null
  onImprove: () => void
}

function Skeleton() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4" aria-busy="true" aria-label="Loading Resume Insights">
      <div className="h-6 w-48 rounded bg-gray-100 shimmer" />
      <div className="h-4 w-96 max-w-full rounded bg-gray-100 shimmer" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-100 shimmer" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[0, 1].map(i => <div key={i} className="h-64 rounded-2xl bg-gray-100 shimmer" />)}
      </div>
    </div>
  )
}

export default function ResumeInsights(props: ResumeInsightsProps) {
  const {
    loading, error, onRetry, score, confidence, compatScore, qualityScore,
    compatCategories, qualityCategories, completionPct, completionSections,
    opportunities, scoreHistoryPrevious, scoreHistoryCurrent, onImprove,
  } = props

  if (loading) return <Skeleton />

  if (score == null && !error) {
    return (
      <div className="max-w-md mx-auto p-10 text-center">
        <div className="text-4xl mb-3" aria-hidden="true">📊</div>
        <h2 className="text-base font-semibold text-gray-800">Run an ATS check to see your Resume Insights.</h2>
        <p className="text-sm text-gray-500 mt-1">Fill in a few sections and we'll analyze your resume automatically.</p>
      </div>
    )
  }

  if (score == null && error) {
    return (
      <div className="max-w-md mx-auto p-10 text-center">
        <div className="text-4xl mb-3" aria-hidden="true">⚠️</div>
        <h2 className="text-base font-semibold text-gray-800">Resume Insights couldn't load</h2>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <button onClick={onRetry} className="btn-primary mt-4 px-5 py-2 text-sm">Try again</button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <header>
        <h2 className="text-xl font-bold text-gray-900 font-display">Resume Insights</h2>
        <p className="text-sm text-gray-500 mt-1">
          Understand your resume's ATS readiness, content quality, and the areas with the biggest opportunity.
        </p>
        {error && (
          <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-center gap-2">
            {error} — showing the last known result.
            <button onClick={onRetry} className="underline font-medium">Retry</button>
          </div>
        )}
      </header>

      {/* Canonical scores — Resume ATS Health, plus its two layers. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-premium p-4 flex flex-col items-center justify-center text-center sm:col-span-1">
          <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Resume ATS Health</div>
          <div className={`text-3xl font-bold mt-1 ${score != null ? tierColor(score) : 'text-gray-400'}`}>
            {score ?? '—'}<span className="text-sm text-gray-400">/100</span>
          </div>
          {score != null && <div className="text-xs font-medium text-gray-500 mt-0.5">{tierLabel(score)}</div>}
          {confidence && (
            <span className={`mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              confidence === 'high' ? 'bg-green-50 text-green-700 border-green-200'
              : confidence === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
              {confidence} confidence
            </span>
          )}
        </div>
        <div className="card-premium p-4 flex flex-col items-center justify-center text-center">
          <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">ATS Compatibility</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">{compatScore ?? 'N/A'}</div>
        </div>
        <div className="card-premium p-4 flex flex-col items-center justify-center text-center">
          <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Resume Quality</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">{qualityScore ?? 'N/A'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ATSCompatibilityCard score={compatScore} categories={compatCategories} />
        <ResumeQualityCard score={qualityScore} categories={qualityCategories} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProfileCompletenessCard pct={completionPct} sections={completionSections} />
        <ScoreHistory previous={scoreHistoryPrevious} current={scoreHistoryCurrent} />
      </div>

      <TopOpportunities opportunities={opportunities} onImprove={onImprove} />
    </div>
  )
}
