'use client'

/**
 * Notification bell (Module 10). Polls the real notifications endpoint —
 * no websocket/push infra exists in this project, so polling is the honest
 * choice rather than faking realtime.
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  related_entity_type: string | null
  related_entity_id: string | null
  is_read: boolean
  created_at: string | null
}

const POLL_INTERVAL_MS = 30000

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Where clicking a notification should take the user, based on what it's about. */
function targetFor(n: Notification): string | null {
  if (n.related_entity_type === 'booking' && n.related_entity_id) {
    return '/mentorship/dashboard'
  }
  return null
}

export default function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    try {
      const data = await api.get<{ notifications: Notification[]; unread_count: number }>(
        '/api/mentorship/notifications'
      )
      setNotifications(data.notifications)
      setUnreadCount(data.unread_count)
    } catch {
      // silent — a failed poll shouldn't disrupt the rest of the page
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const markRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
    try {
      await api.post(`/api/mentorship/notifications/${id}/read`, {})
    } catch {
      load() // resync on failure
    }
  }

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
    try {
      await api.post('/api/mentorship/notifications/read-all', {})
    } catch {
      load()
    }
  }

  const onNotificationClick = (n: Notification) => {
    if (!n.is_read) markRead(n.id)
    const target = targetFor(n)
    if (target) {
      setOpen(false)
      router.push(target)
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative w-10 h-10 flex items-center justify-center rounded-lg text-gray-600 hover:bg-white/60 hover:text-navy-600 transition"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] panel-premium p-0 overflow-hidden z-50 shadow-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-bold text-navy-600 text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-royal-600 hover:text-royal-700 font-medium">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onNotificationClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition ${
                    n.is_read ? '' : 'bg-royal-50/50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-600 shrink-0" />}
                    <div className={n.is_read ? 'ml-3.5' : ''}>
                      <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                      {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
