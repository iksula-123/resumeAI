const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-good-100 text-good-700',
  rejected: 'bg-red-100 text-red-600',
  suspended: 'bg-gray-200 text-gray-600',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${STATUS_BADGE[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}
