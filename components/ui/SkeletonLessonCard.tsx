'use client'

import { motion } from 'framer-motion'

export default function SkeletonLessonCard() {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/30 to-white p-6 shadow-card dark:from-slate-900/50 dark:via-slate-800/20 dark:to-slate-900/50 dark:border-surface overflow-hidden relative">
      {/* Shimmer effect */}
      <div className="absolute inset-0 -translate-x-full">
        <div className="h-full w-full bg-gradient-to-r from-transparent via-white/10 to-transparent shimmer-light" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-5 w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        </div>
        <div className="h-8 w-8 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
      </div>

      {/* Title */}
      <div className="space-y-2 mb-4">
        <div className="h-6 w-3/4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-6 w-1/2 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
      </div>

      {/* Content lines */}
      <div className="space-y-2 mb-6">
        <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-4 w-4/5 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
      </div>

      {/* Quiz placeholder */}
      <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-gray-50 dark:bg-gray-900/30">
        <div className="h-5 w-2/3 bg-gray-200 dark:bg-gray-800 rounded mb-3 animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-10 w-full bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between mt-6">
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-9 w-9 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <div className="h-10 w-24 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
      </div>
    </div>
  )
}
