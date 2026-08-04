'use client'

export default function PillList({ items, tone }: { items: string[]; tone: 'found' | 'missing' }) {
  if (!items.length) {
    return <p className="text-xs text-gray-400 italic">{tone === 'found' ? 'None found' : 'None missing — full coverage'}</p>
  }
  const cls = tone === 'found'
    ? 'bg-green-50 text-green-700 border-green-200'
    : 'bg-red-50 text-red-600 border-red-200'
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((k) => (
        <span key={k} className={`text-xs px-2.5 py-1 rounded-full border ${cls}`}>{k}</span>
      ))}
    </div>
  )
}
