'use client'

export default function SkeletonPlaylist() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-slate-900/50 dark:border-surface p-5 shadow-card overflow-hidden relative">
      {/* Shimmer overlay */}
      <div className="absolute inset-0 -translate-x-full animate-shimmer">
        <div className="h-full w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* Thumbnail */}
      <div className="aspect-video w-full bg-gray-200 dark:bg-gray-800 rounded-xl mb-4 animate-pulse" />

      {/* Title */}
      <div className="space-y-2 mb-3">
        <div className="h-5 w-3/4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-5 w-1/2 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-4">
        <div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-4 w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <div className="h-10 flex-1 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
        <div className="h-10 w-10 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
      </div>
    </div>
  )
}
