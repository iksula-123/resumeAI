'use client'

// Resume Progress — Profile Completeness, NOT Resume ATS Health.
//
// A pure UI signal ("how much of your resume is filled in") computed
// client-side from @/lib/resumeContent's computeCompletion(). This is
// deliberately never sent to, or derived from, any ATS endpoint — mixing
// it into Resume ATS Health is exactly what docs/ATS_ANALYSIS_MODES.md
// forbids. See SahiCareer UI/UX + Gamification master phase, section 6.

import type { ResumeContent } from '@/lib/resumeContent'
import { computeCompletion } from '@/lib/resumeContent'

function progressMessage(pct: number): string {
  if (pct >= 90) return "Your resume is in great shape! 🎉"
  if (pct >= 70) return "You're almost ready!"
  if (pct >= 40) return 'Good start — keep going'
  return "Let's build your resume"
}

export default function ResumeProgress({ content }: { content: ResumeContent }) {
  const { pct } = computeCompletion(content)
  return (
    <div className="px-3 py-3 border-b border-gray-100">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-700">Resume Progress</span>
        <span className="text-xs font-bold text-navy-700">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-royal-500 to-teal-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-gray-500 mt-1.5">{progressMessage(pct)}</p>
    </div>
  )
}
