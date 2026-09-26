export function SkeletonCard() {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <div className="skeleton h-4 w-24 rounded mb-3"></div>
      <div className="skeleton h-8 w-16 rounded"></div>
    </div>
  )
}

export function SkeletonList() {
  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-3/4 rounded"></div>
              <div className="skeleton h-3 w-1/2 rounded"></div>
            </div>
            <div className="skeleton h-4 w-20 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonTable() {
  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="skeleton h-5 w-40 rounded"></div>
      </div>
      <div className="divide-y divide-gray-200">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-6 py-4 flex items-center gap-4">
            <div className="skeleton h-4 flex-1 rounded"></div>
            <div className="skeleton h-4 w-32 rounded"></div>
            <div className="skeleton h-4 w-24 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonDetail() {
  return (
    <div className="bg-white rounded-lg p-6 space-y-4">
      <div className="skeleton h-6 w-48 rounded mb-4"></div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="space-y-2">
          <div className="skeleton h-3 w-24 rounded"></div>
          <div className="skeleton h-4 w-full rounded"></div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonDashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {[1, 2, 3, 4].map((i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}