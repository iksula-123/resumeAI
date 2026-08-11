'use client'

import Link from 'next/link'
import AdminMentorshipShell from '@/components/mentorship/AdminMentorshipShell'
import MentorsList from '@/components/mentorship/admin/MentorsList'

export default function AllMentorsPage() {
  const topBar = (
    <div className="flex-1 flex items-center justify-between">
      <div>
        <h1 className="text-sm font-semibold text-gray-800">All Mentors</h1>
        <p className="text-xs text-gray-500">Every mentor profile, any status</p>
      </div>
      <Link href="/admin/mentorship/add-mentor" className="text-xs text-navy-600 bg-royal-50 hover:bg-royal-100 px-3 py-1.5 rounded-lg transition">+ Add Mentor</Link>
    </div>
  )
  return (
    <AdminMentorshipShell topBar={topBar}>
      <div className="p-6 max-w-5xl mx-auto">
        <MentorsList statusFilter="" />
      </div>
    </AdminMentorshipShell>
  )
}
