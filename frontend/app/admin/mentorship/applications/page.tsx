'use client'

import AdminMentorshipShell from '@/components/mentorship/AdminMentorshipShell'
import MentorsList from '@/components/mentorship/admin/MentorsList'

export default function ApplicationsPage() {
  const topBar = (
    <div>
      <h1 className="text-sm font-semibold text-gray-800">Applications</h1>
      <p className="text-xs text-gray-500">Pending mentor applications awaiting review</p>
    </div>
  )
  return (
    <AdminMentorshipShell topBar={topBar}>
      <div className="p-6 max-w-5xl mx-auto">
        <MentorsList statusFilter="pending" />
      </div>
    </AdminMentorshipShell>
  )
}
