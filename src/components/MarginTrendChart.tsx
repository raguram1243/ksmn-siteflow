import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { CHART_CHROME, marginColor } from '../lib/chartColors'

interface MonthlyData {
  month: string
  margin: number
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
        <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{label}</p>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Margin: <span className="font-bold">{Number(payload[0].value).toFixed(1)}%</span>
        </p>
      </div>
    )
  }
  return null
}

/**
 * Average margin trend for closed projects over recent months.
 * Requires get_monthly_margin_trend() (see supabase-margin-trend.sql).
 * If the function is not deployed yet, falls back to the empty state.
 */
export default function MarginTrendChart() {
  const { role } = useAuth()
  const [chartData, setChartData] = useState<MonthlyData[]>([])

  useEffect(() => {
    if (role !== 'admin') return
    let cancelled = false

    supabase.rpc('get_monthly_margin_trend').then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        // Function not deployed yet — show empty state instead of breaking.
        console.warn('Margin trend unavailable:', error.message)
        setChartData([])
        return
      }
      setChartData((data as MonthlyData[]) || [])
    })

    return () => {
      cancelled = true
    }
  }, [role])

  if (role !== 'admin') return null

  if (chartData.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Margin Trend (6 Months)</h3>
        <div className="h-32 flex items-center justify-center">
          <div className="text-center">
            <div className="flex justify-center mb-2">
              <svg className="w-9 h-9 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-xs text-gray-500">No historical data yet</p>
            <p className="text-xs text-gray-400 mt-1">Close some projects to see trends</p>
          </div>
        </div>
      </div>
    )
  }

  // Color the line by where the most recent month landed relative to the
  // 10% default target: green = healthy, amber = below, red = at a loss.
  const latest = chartData[chartData.length - 1]
  const lineColor = marginColor(Number(latest.margin) || 0, 10)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Margin Trend (6 Months)</h3>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${lineColor}1a`, color: lineColor }}
        >
          {Number(latest.margin).toFixed(1)}%
        </span>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke={CHART_CHROME.axis} />
          <YAxis tick={{ fontSize: 10 }} stroke={CHART_CHROME.axis} domain={[0, 'auto']} />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="margin"
            stroke={lineColor}
            strokeWidth={2}
            dot={{ fill: lineColor, r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}