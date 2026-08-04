'use client'

const color = (pct: number) => (pct >= 75 ? '#1E7A46' : pct >= 50 ? '#F5A623' : '#c0392b')

export default function ScoreBar({ label, pct, note }: { label: string; pct: number; note?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="font-semibold" style={{ color: color(pct) }}>{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color(pct) }}
        />
      </div>
      {note && <p className="text-[11px] text-gray-500 mt-1 leading-snug">{note}</p>}
    </div>
  )
}
