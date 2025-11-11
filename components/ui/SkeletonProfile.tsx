'use client'

export default function SkeletonProfile() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Avatar section */}
      <div className="flex items-center gap-6 mb-8">
        <div className="h-24 w-24 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
        <div className="flex-1 space-y-3">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-5 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200/80 dark:border-surface p-4 bg-white dark:bg-slate-900/50"
          >
            <div className="h-8 w-12 bg-gray-200 dark:bg-gray-800 rounded mb-2 animate-pulse" />
            <div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Form fields */}
      <div className="space-y-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i}>
            <div className="h-5 w-24 bg-gray-200 dark:bg-gray-800 rounded mb-2 animate-pulse" />
            <div className="h-12 w-full bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mt-8">
        <div className="h-12 flex-1 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
        <div className="h-12 w-24 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
      </div>
    </div>
  )
}
