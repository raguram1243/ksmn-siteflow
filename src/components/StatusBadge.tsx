import type { ReactNode } from 'react'

export type BadgeTone = 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'gray'

// Dark-mode variants are handled globally in index.css (.dark .bg-*-100 /
// .dark .text-*-800), so these stay identical to the light-mode classes.
const TONE_CLASSES: Record<BadgeTone, string> = {
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  blue: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
  gray: 'bg-gray-100 text-gray-800',
}

interface StatusBadgeProps {
  children: ReactNode
  tone?: BadgeTone
}

/**
 * Single source of truth for status pills across the app.
 * Unifies size, padding, weight and color so every badge looks consistent.
 * Color carries the semantic meaning (no emoji), keeping rows clean.
 */
export default function StatusBadge({ children, tone = 'gray' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}