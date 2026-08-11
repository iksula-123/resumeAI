interface Props {
  label: string
  value: string | number
  icon?: string
  color?: string
}

/** The small stat tile used across every dashboard's top row — one shape,
 * reused by mentee/mentor/admin so the numbers always read the same way. */
export default function StatCard({ label, value, icon, color = 'bg-royal-50 text-navy-700' }: Props) {
  return (
    <div className="panel-premium p-4">
      {icon && <div className={`w-9 h-9 ${color} rounded-lg flex items-center justify-center text-base mb-2`}>{icon}</div>}
      <p className="text-xl font-bold text-gray-800 font-display">{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
