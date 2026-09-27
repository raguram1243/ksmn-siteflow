import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { CHART, CHART_CHROME } from '../lib/chartColors'

interface MonthlyComparisonChartProps {
  monthly: { this_month_value: number; last_month_value: number }
  expenses: { this_month_total: number; last_month_total: number }
}

const inr = (v: number) => `₹${Number(v || 0).toLocaleString('en-IN')}`

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-xs">
        <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="text-gray-600 dark:text-gray-300">
            {p.name}: <span className="font-semibold">{inr(Number(p.value))}</span>
          </p>
        ))}
      </div>
    )
  }
  return null
}

/**
 * Grouped bar chart comparing booked value vs expenses for this month and
 * last month. Data comes from get_monthly_comparison + get_expense_monthly_comparison.
 */
export default function MonthlyComparisonChart({ monthly, expenses }: MonthlyComparisonChartProps) {
  const data = [
    { name: 'This Month', Booked: Number(monthly.this_month_value) || 0, Expenses: Number(expenses.this_month_total) || 0 },
    { name: 'Last Month', Booked: Number(monthly.last_month_value) || 0, Expenses: Number(expenses.last_month_total) || 0 },
  ]

  const hasData = data.some(d => d.Booked > 0 || d.Expenses > 0)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Booked vs Expenses</h3>
        <span className="text-xs text-gray-400">This month vs last month</span>
      </div>

      {!hasData ? (
        <div className="h-56 flex flex-col items-center justify-center text-center">
          <div className="flex justify-center mb-2">
            <svg className="w-9 h-9 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 15l3.5-4 3 3L21 6" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">No activity yet</p>
          <p className="text-xs text-gray-400 mt-1">Booked value and expenses will appear here</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke={CHART_CHROME.axis} />
            <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} stroke={CHART_CHROME.axis} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Booked" name="Booked Value" fill={CHART.booked} radius={[4, 4, 0, 0]} maxBarSize={48} />
            <Bar dataKey="Expenses" name="Expenses" fill={CHART.expenses} radius={[4, 4, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}