/**
 * Shared chart palette + theme-aware chrome.
 *
 * Every value mirrors a token from the @theme block in index.css, so charts
 * stay aligned with the app's brand colors and a future rebrand only needs
 * this one file changed. The CHART_* chrome colors are CSS variables so grid
 * lines and axes automatically adapt to light/dark mode.
 */

export const CHART = {
  /** Booked / revenue — the primary brand series. */
  booked: '#2563eb',
  /** Expenses / cost — the accent series (cyan reads as "money out" beside blue). */
  expenses: '#0891b2',
  /** Payment modes. */
  cash: '#10b981',
  upi: '#2563eb',
  bank: '#8b5cf6',
  /** Expense categories. */
  material: '#f59e0b',
  labor: '#2563eb',
  other: '#8b5cf6',
  /** Margin status semantics (matches StatusBadge tones). */
  aboveTarget: '#16a34a',
  onTarget: '#2563eb',
  belowTarget: '#f59e0b',
  loss: '#dc2626',
  /** Target reference line. */
  target: '#64748b',
} as const

/** Ordered palette for donut / breakdown slices. */
export const SLICE_COLORS = [
  '#2563eb', // brand-600
  '#0891b2', // accent-600
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#64748b', // slate
  '#dc2626', // red
] as const

/**
 * Single-hue progression for the conversion funnel: it should read as one
 * journey narrowing, with only the final "Confirmed" stage in green.
 */
export const FUNNEL_COLORS = {
  total_contacts: '#1e40af', // brand-800
  total_leads: '#2563eb', // brand-600
  quotations_sent: '#60a5fa', // brand-400
  confirmed: '#16a34a', // green-600
} as const

/** Margin status -> line color, for the margin trend chart. */
export function marginColor(margin: number, target: number): string {
  if (margin < 0) return CHART.loss
  if (margin < target) return CHART.belowTarget
  if (margin < target + 2) return CHART.onTarget
  return CHART.aboveTarget
}

/**
 * Theme-aware chart chrome. These resolve from the CSS variables defined in
 * index.css, so Recharts (which needs real color values, not classes) still
 * follows the active theme.
 */
export const CHART_CHROME = {
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
} as const