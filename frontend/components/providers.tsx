'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/store'
import { setAuthToken } from '@/lib/api'

export function Providers({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken)

  // Re-hydrate the api module token after SSR/page reload
  useEffect(() => {
    if (accessToken) {
      setAuthToken(accessToken)
    }
  }, [accessToken])

  return <>{children}</>
}
