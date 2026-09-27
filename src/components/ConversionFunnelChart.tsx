import { FUNNEL_COLORS } from '../lib/chartColors'

interface FunnelData {
  total_contacts: number
  total_leads: number
  quotations_sent: number
  confirmed: number
}

interface ConversionFunnelChartProps {
  funnel: FunnelData
}

/**
 * Horizontal funnel built from CSS bars (not Recharts) so each stage can show
 * its raw count, share of total, and conversion from the previous stage
 * without label collisions.
 */
export default function ConversionFunnelChart({ funnel }: ConversionFunnelChartProps) {
  // Single-hue progression (dark→light blue) so the funnel reads as one
  // narrowing journey, with only the final confirmed stage in green.
  const stages = [
    { label: 'Contacts Met', value: Number(funnel.total_contacts) || 0, color: FUNNEL_COLORS.total_contacts },
    { label: 'Leads', value: Number(funnel.total_leads) || 0, color: FUNNEL_COLORS.total_leads },
    { label: 'Quotations Sent', value: Number(funnel.quotations_sent) || 0, color: FUNNEL_COLORS.quotations_sent },
    { label: 'Confirmed', value: Number(funnel.confirmed) || 0, color: FUNNEL_COLORS.confirmed },
  ]

  const max = Math.max(...stages.map(s => s.value), 1)
  const total = stages[0].value

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Conversion Funnel</h3>
        {total > 0 && (
          <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 px-2 py-1 rounded-full">
            {stages[0].value > 0 ? Math.round((stages[3].value / stages[0].value) * 100) : 0}% overall
          </span>
        )}
      </div>

      <div className="space-y-4">
        {stages.map((s, i) => {
          const prev = i > 0 ? stages[i - 1].value : 0
          const conv = i > 0 && prev > 0 ? Math.round((s.value / prev) * 100) : null
          return (
            <div key={s.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600 dark:text-gray-300">{s.label}</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {s.value}
                  {total > 0 && (
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {Math.round((s.value / total) * 100)}%
                    </span>
                  )}
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(s.value / max) * 100}%`, backgroundColor: s.color }}
                />
              </div>
              {i > 0 && (
                <div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  {conv === null ? '— no previous stage' : `${conv}% from ${stages[i - 1].label.toLowerCase()}`}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}