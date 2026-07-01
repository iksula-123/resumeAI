'use client'

import AppShell from '@/components/AppShell'

export default function JobTrackerPage() {
  const topBar = (
    <>
      <div className="flex-1">
        <h1 className="text-sm font-semibold text-gray-800">Job Tracker</h1>
        <p className="text-xs text-gray-400">Track your job applications</p>
      </div>
    </>
  )

  return (
    <AppShell topBar={topBar}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="panel-premium p-16 flex flex-col items-center text-center">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Job Tracker</h2>
          <p className="text-gray-500 text-sm max-w-md">
            Track all your job applications in one place. See which companies you have applied to,
            interview stages, and follow-up reminders.
          </p>
          <div className="mt-6 bg-indigo-50 text-indigo-700 text-xs px-4 py-2 rounded-full">Coming Soon</div>
        </div>
      </div>
    </AppShell>
  )
}
