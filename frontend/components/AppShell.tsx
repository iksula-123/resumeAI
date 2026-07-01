'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import Sidebar from './Sidebar'

interface Props {
  children: React.ReactNode
  topBar?: React.ReactNode
}

export default function AppShell({ children, topBar }: Props) {
  const { user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!user) router.push('/auth/login')
  }, [user, router])

  if (!user) return null

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-56 flex flex-col min-h-screen">
        {topBar && (
          <header className="glass h-16 flex items-center px-6 gap-4 sticky top-0 z-30 border-b border-white/40 shadow-soft">
            {topBar}
          </header>
        )}
        <main className="flex-1 overflow-auto animate-fade-up">
          {children}
        </main>
      </div>
    </div>
  )
}
