'use client'

import { useMemo, useState } from 'react'
import { CalendarItem, STATUS_DOT } from './types'

interface Props {
  /** "YYYY-MM" */
  month: string
  onMonthChange: (month: string) => void
  itemsByDate: Record<string, CalendarItem[]>
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Mentee dashboard's "Your Calendar" — month view, click a date to see that
 * day's sessions below the grid. */
export default function MonthCalendar({ month, onMonthChange, itemsByDate }: Props) {
  const [selected, setSelected] = useState<string | null>(null)

  const { cells, monthLabel } = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const first = new Date(y, m - 1, 1)
    const daysInMonth = new Date(y, m, 0).getDate()
    const startOffset = first.getDay()
    const todayIso = new Date().toISOString().slice(0, 10)

    const out: { iso: string | null; day: number | null; isToday: boolean }[] = []
    for (let i = 0; i < startOffset; i++) out.push({ iso: null, day: null, isToday: false })
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      out.push({ iso, day, isToday: iso === todayIso })
    }
    return { cells: out, monthLabel: first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) }
  }, [month])

  const selectedItems = selected ? itemsByDate[selected] || [] : []

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => onMonthChange(shiftMonth(month, -1))} className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-50" aria-label="Previous month">←</button>
        <p className="text-sm font-semibold text-gray-800">{monthLabel}</p>
        <button onClick={() => onMonthChange(shiftMonth(month, 1))} className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-50" aria-label="Next month">→</button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-gray-400 mb-1">
        {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c.iso) return <div key={i} />
          const items = itemsByDate[c.iso] || []
          const isSelected = selected === c.iso
          return (
            <button
              key={c.iso}
              onClick={() => setSelected(isSelected ? null : c.iso)}
              className={`aspect-square rounded-lg text-xs flex flex-col items-center justify-center gap-0.5 transition
                ${isSelected ? 'bg-navy-600 text-white font-semibold' : c.isToday ? 'bg-royal-50 text-navy-700 font-semibold ring-1 ring-royal-200' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              {c.day}
              {items.length > 0 && (
                <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : STATUS_DOT[items[0].status || ''] || 'bg-royal-400'}`} />
              )}
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            {new Date(selected + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {selectedItems.length === 0 ? (
            <p className="text-xs text-gray-400">Nothing scheduled this day.</p>
          ) : (
            <div className="space-y-1.5">
              {selectedItems.map((it) => (
                <div key={it.id} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-2.5 py-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[it.status || ''] || 'bg-royal-400'}`} />
                  <span className="font-medium text-gray-800 truncate">{it.title}</span>
                  {it.subtitle && <span className="text-gray-400 truncate">· {it.subtitle}</span>}
                  {it.time && <span className="ml-auto text-gray-500 shrink-0">{it.time}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
