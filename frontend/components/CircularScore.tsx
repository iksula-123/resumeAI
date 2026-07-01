interface Props {
  score: number
  max?: number
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
  sublabel?: string
}

export default function CircularScore({
  score,
  max = 100,
  size = 100,
  strokeWidth = 8,
  color = '#22c55e',
  label,
  sublabel,
}: Props) {
  const pct = Math.min(score / max, 1)
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const dash = pct * circ
  const cx = size / 2
  const cy = size / 2

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
        className="block"
      >
        <circle
          cx={cx} cy={cy} r={r}
          fill="none" stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={cx} cy={cy} r={r}
          fill="none" stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold text-gray-800 leading-none" style={{ fontSize: size * 0.22 }}>
          {score}
        </span>
        {max !== 1 && (
          <span className="text-gray-400 leading-none" style={{ fontSize: size * 0.11 }}>
            /{max}
          </span>
        )}
        {label && (
          <span className="text-xs font-medium mt-0.5" style={{ color, fontSize: size * 0.1 }}>
            {label}
          </span>
        )}
      </div>
    </div>
  )
}
