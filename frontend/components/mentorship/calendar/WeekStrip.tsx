'use client'

import { CalendarItem, STATUS_DOT } from './types'

interface Props {
  /** "YYYY-MM-DD" — the first day of the strip. */
  weekStart: string
  itemsByDate: Record<string, CalendarItem[]>
  /** Present only for the admin's navigable weekly Schedule; omitted for the
   * mentor's fixed "Next 7 Days" strip. */
  onPrevWeek?: () => void
  onNextWeek?: () => void
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Mentor dashboard's "Next 7 Days" and the admin's weekly Schedule — one
 * column per day, with that day's items listed underneath. */
export default function WeekStrip({ weekStart, itemsByDate, onPrevWeek, onNextWeek }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const todayIso = new Date().toISOString().slice(0, 10)

  return (
    <div>
      {(onPrevWeek || onNextWeek) && (
        <div className="flex items-center justify-between mb-3">
          <button onClick={onPrevWeek} className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-50">← Prev week</button>
          <p className="text-xs font-semibold text-gray-700">
            {new Date(days[0] + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            {' – '}
            {new Date(days[6] + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </p>
          <button onClick={onNextWeek} className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-50">Next week →</button>
        </div>
      )}

      <div className="grid grid-cols-7 gap-2 mb-3">
        {days.map((iso) => {
          const items = itemsByDate[iso] || []
          const isToday = iso === todayIso
          return (
            <div key={iso} className={`text-center rounded-lg py-2 ${isToday ? 'bg-royal-50 ring-1 ring-royal-200' : 'bg-gray-50'}`}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}</p>
              <p className={`text-sm font-semibold ${isToday ? 'text-navy-700' : 'text-gray-700'}`}>{new Date(iso + 'T00:00:00').getDate()}</p>
              {items.length > 0 && <p className="text-[10px] text-royal-600 font-medium mt-0.5">{items.length}</p>}
            </div>
          )
        })}
      </div>

      <div className="space-y-3">
        {days.filter((iso) => (itemsByDate[iso] || []).length > 0).map((iso) => (
          <div key={iso}>
            <p className="text-xs font-semibold text-gray-600 mb-1.5">
              {new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
            </p>
            <div className="space-y-1.5">
              {(itemsByDate[iso] || []).map((it) => (
                <div key={it.id} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[it.status || ''] || 'bg-royal-400'}`} />
                  <span className="font-medium text-gray-800 truncate">{it.title}</span>
                  {it.subtitle && <span className="text-gray-400 truncate">· {it.subtitle}</span>}
                  {it.time && <span className="ml-auto text-gray-500 shrink-0">{it.time}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {days.every((iso) => (itemsByDate[iso] || []).length === 0) && (
          <p className="text-xs text-gray-400 text-center py-3">Nothing scheduled this week.</p>
        )}
      </div>
    </div>
  )
}
