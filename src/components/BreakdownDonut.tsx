import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

export interface BreakdownItem {
  name: string
  value: number
}

interface BreakdownDonutProps {
  title: string
  data: BreakdownItem[]
  emptyTitle?: string
  emptyHint?: string
}

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#f472b6']
const inr = (v: number) => `₹${Number(v || 0).toLocaleString('en-IN')}`

function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const p = payload[0]
    return (
      <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-xs">
        <p className="text-gray-900 dark:text-gray-100">
          {p.name}: <span className="font-semibold">{inr(Number(p.value))}</span>
        </p>
      </div>
    )
  }
  return null
}

/**
 * Donut chart + legend list used for expense-category and payment-mode splits.
 * Falls back to a friendly empty state when there is no data to draw.
 */
export default function BreakdownDonut({ title, data, emptyTitle = 'No data yet', emptyHint }: BreakdownDonutProps) {
  const items = data.filter(d => Number(d.value) > 0)
  const total = items.reduce((sum, d) => sum + Number(d.value), 0)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6 h-full">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>

      {total <= 0 ? (
        <div className="h-48 flex flex-col items-center justify-center text-center">
          <div className="text-3xl mb-1">🍩</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{emptyTitle}</p>
          {emptyHint && <p className="text-xs text-gray-400 mt-1">{emptyHint}</p>}
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="shrink-0 w-40 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={items}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={2}
                  stroke="none"
                >
                  {items.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="flex-1 w-full space-y-2">
            {items.map((d, i) => (
              <li key={d.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300 truncate">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="truncate">{d.name}</span>
                </span>
                <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100 ml-2">
                  {inr(d.value)}
                  <span className="ml-1 text-xs font-normal text-gray-400">
                    {Math.round((d.value / total) * 100)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}