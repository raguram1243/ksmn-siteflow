import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

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
            <div className="text-3xl mb-1">📊</div>
            <p className="text-xs text-gray-500">No historical data yet</p>
            <p className="text-xs text-gray-400 mt-1">Complete projects to see trends</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Margin Trend (6 Months)</h3>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#9ca3af" />
          <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" domain={[0, 'auto']} />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="margin"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}