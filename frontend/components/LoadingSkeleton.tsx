// Lightweight route-transition skeleton reused by App Router loading.tsx files.
export default function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="p-6 md:p-8 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-56 bg-gray-200 rounded-lg mb-6" />
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 bg-gray-100 rounded-2xl" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
