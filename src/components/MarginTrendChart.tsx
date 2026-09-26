import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, type TooltipProps } from 'recharts'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

interface MonthlyData {
  month: string
  margin: number
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2 border border-gray-200 rounded-lg shadow-lg">
        <p className="text-xs font-medium text-gray-900">{label}</p>
        <p className="text-sm text-gray-700">
          Margin: <span className="font-bold">{payload[0].value.toFixed(1)}%</span>
        </p>
      </div>
    )
  }
  return null
}

export default function MarginTrendChart() {
  const { role } = useAuth()

  const chartData = useMemo(() => {
    if (role !== 'admin') return []

    // For now, return empty array since we just cleared data
    // In production, this would fetch from Supabase:
    // const { data } = await supabase.rpc('get_monthly_margin_trend')
    
    // Placeholder structure for when data exists:
    // return [
    //   { month: 'Jan', margin: 12.5 },
    //   { month: 'Feb', margin: 15.2 },
    //   ...
    // ]
    
    return []
  }, [role])

  if (role !== 'admin') return null

  // Show empty state if no data
  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Margin Trend (6 Months)</h3>
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
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Margin Trend (6 Months)</h3>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey="month" 
            tick={{ fontSize: 10 }}
            stroke="#9ca3af"
          />
          <YAxis 
            tick={{ fontSize: 10 }}
            stroke="#9ca3af"
            domain={[0, 30]}
          />
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