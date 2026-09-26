import type { ReactNode } from 'react'

type Accent = 'blue' | 'purple' | 'green' | 'amber' | 'red' | 'slate'

const ACCENTS: Record<Accent, { blob: string; icon: string }> = {
  blue: { blob: 'from-blue-500 to-blue-700', icon: 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300' },
  purple: { blob: 'from-purple-500 to-purple-700', icon: 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-300' },
  green: { blob: 'from-green-500 to-green-700', icon: 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-300' },
  amber: { blob: 'from-amber-500 to-amber-700', icon: 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300' },
  red: { blob: 'from-red-500 to-red-700', icon: 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300' },
  slate: { blob: 'from-slate-500 to-slate-700', icon: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
}

interface StatCardProps {
  label: string
  value: string
  sub?: string
  accent: Accent
  icon: ReactNode
  /** Extra classes applied to the big value (e.g. color overrides). */
  valueClassName?: string
}

/**
 * Gradient accent stat card used on the Admin Dashboard header row.
 * A soft radial blob in the corner gives it depth while staying readable in
 * both light and dark mode.
 */
export default function StatCard({ label, value, sub, accent, icon, valueClassName = '' }: StatCardProps) {
  const a = ACCENTS[accent]
  return (
    <div className="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-5">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-gradient-to-br ${a.blob} opacity-10`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{label}</p>
          <p className={`mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100 truncate ${valueClassName}`}>{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">{sub}</p>}
        </div>
        <div className={`shrink-0 h-10 w-10 rounded-lg flex items-center justify-center ${a.icon}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}