import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import StatusBadge, { type BadgeTone } from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import { SkeletonTable } from '../components/Skeleton'

interface ProfitRow {
  project_id: string
  contact_name: string
  contact_phone?: string
  site_location?: string
  baseline_quotation_value: number
  adjusted_quotation_value: number | null
  actual_cost_total: number
  target_margin_percent: number
  margin_percent: number
  margin_status: string
  project_status: string
  closed_at: string | null
  created_at: string
}

const STATUS_TONE: Record<string, BadgeTone> = {
  above_target: 'green',
  on_target: 'blue',
  below_target: 'yellow',
  loss: 'red',
  no_data: 'gray',
}

const STATUS_LABEL: Record<string, string> = {
  above_target: 'Above Target',
  on_target: 'On Target',
  below_target: 'Below Target',
  loss: 'Loss',
  no_data: 'No Data',
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ProfitabilityReport() {
  const [rows, setRows] = useState<ProfitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterMargin, setFilterMargin] = useState('all')
  const [sortBy, setSortBy] = useState<'margin' | 'value' | 'recent'>('margin')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const [profitRes, projectsRes] = await Promise.all([
        supabase.rpc('get_project_profit_view'),
        supabase.from('projects').select('id, adjusted_quotation_value'),
      ])

      if (cancelled) return

      if (profitRes.error) {
        setError(profitRes.error.message)
        setLoading(false)
        return
      }

      // The RPC only sees baseline values; overlay adjusted (discounted)
      // values so margins match what ProjectsPage displays.
      const adjustedMap = new Map<string, number | null>()
      for (const p of (projectsRes.data || []) as any[]) {
        adjustedMap.set(p.id, p.adjusted_quotation_value)
      }

      const merged = ((profitRes.data || []) as any[]).map(r => {
        const adjusted = adjustedMap.get(r.project_id) ?? null
        const eff = Number(adjusted || r.baseline_quotation_value || 0)
        const cost = Number(r.actual_cost_total || 0)
        const margin = eff > 0 ? ((eff - cost) / eff) * 100 : 0
        const target = Number(r.target_margin_percent || 0)
        return {
          ...r,
          adjusted_quotation_value: adjusted,
          baseline_quotation_value: Number(r.baseline_quotation_value || 0),
          actual_cost_total: cost,
          target_margin_percent: target,
          margin_percent: eff > 0 ? Number(margin.toFixed(2)) : 0,
          margin_status: Number(r.baseline_quotation_value) === 0
            ? 'no_data'
            : margin >= target + 2 ? 'above_target'
            : margin >= target ? 'on_target'
            : margin > 0 ? 'below_target' : 'loss',
        } as ProfitRow
      })

      setRows(merged)
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = rows.filter(r => {
      if (q) {
        const hay = `${r.contact_name} ${r.contact_phone || ''} ${r.site_location || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filterStatus !== 'all' && r.project_status !== filterStatus) return false
      if (filterMargin === 'below' && !['below_target', 'loss'].includes(r.margin_status)) return false
      if (filterMargin === 'healthy' && !['above_target', 'on_target'].includes(r.margin_status)) return false
      if (filterMargin === 'loss' && r.margin_status !== 'loss') return false
      return true
    })

    return [...out].sort((a, b) => {
      if (sortBy === 'value') return b.baseline_quotation_value - a.baseline_quotation_value
      if (sortBy === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return a.margin_percent - b.margin_percent // worst first
    })
  }, [rows, search, filterStatus, filterMargin, sortBy])

  const summary = useMemo(() => {
    const withData = rows.filter(r => r.baseline_quotation_value > 0)
    const totalValue = rows.reduce((s, r) => s + r.baseline_quotation_value, 0)
    const totalCost = rows.reduce((s, r) => s + r.actual_cost_total, 0)
    const avgMargin = withData.length
      ? withData.reduce((s, r) => s + r.margin_percent, 0) / withData.length
      : 0
    return {
      count: rows.length,
      totalValue,
      totalCost,
      totalProfit: totalValue - totalCost,
      avgMargin: Number(avgMargin.toFixed(2)),
      lossCount: rows.filter(r => r.margin_status === 'loss').length,
      belowCount: rows.filter(r => r.margin_status === 'below_target').length,
    }
  }, [rows])

  function handleExport() {
    const header = ['Client', 'Phone', 'Location', 'Quotation Value', 'Cost', 'Profit', 'Margin %', 'Target %', 'Margin Status', 'Project Status', 'Closed At']
    const body = filtered.map(r => [
      r.contact_name,
      r.contact_phone || '',
      r.site_location || '',
      r.baseline_quotation_value,
      r.actual_cost_total,
      Number((r.baseline_quotation_value - r.actual_cost_total).toFixed(2)),
      r.margin_percent,
      r.target_margin_percent,
      STATUS_LABEL[r.margin_status] || r.margin_status,
      r.project_status,
      r.closed_at || '',
    ])
    downloadCsv(`profitability-report-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body])
  }

  const inputClass = 'px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500'

  return (
    <div>
      <div className="flex justify-between items-center mb-6 gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Profitability Report</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Per-project margin vs target, worst performers first
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="px-3 py-2 text-sm font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700"
          >
            Print
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">Projects</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{summary.count}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">Booked Value</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{inr(summary.totalValue)}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">Total Cost</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{inr(summary.totalCost)}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">Total Profit</div>
          <div className={`text-xl font-bold mt-1 ${summary.totalProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {inr(summary.totalProfit)}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">Avg Margin</div>
          <div className={`text-xl font-bold mt-1 ${summary.avgMargin >= 0 ? 'text-brand-600 dark:text-brand-400' : 'text-red-600 dark:text-red-400'}`}>
            {summary.avgMargin}%
          </div>
          {(summary.belowCount > 0 || summary.lossCount > 0) && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {summary.belowCount} below · {summary.lossCount} loss
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search client, phone or location…"
          className={`flex-1 min-w-[200px] ${inputClass}`}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={inputClass}>
          <option value="all">All Statuses</option>
          <option value="in_progress">In Progress</option>
          <option value="closed">Closed</option>
        </select>
        <select value={filterMargin} onChange={e => setFilterMargin(e.target.value)} className={inputClass}>
          <option value="all">All Margins</option>
          <option value="healthy">On/Above Target</option>
          <option value="below">Below Target</option>
          <option value="loss">Loss Only</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className={inputClass}>
          <option value="margin">Sort: Worst Margin</option>
          <option value="value">Sort: Highest Value</option>
          <option value="recent">Sort: Most Recent</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 rounded-lg p-4 text-sm">
          Could not load profitability data: {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable />
      ) : !error && filtered.length === 0 ? (
        <EmptyState
          icon="📊"
          title="No projects to report"
          description={
            rows.length === 0
              ? 'Projects appear here once a quotation is locked and approved.'
              : 'No projects match your current filters.'
          }
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Client</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Location</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Value</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Cost</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Profit</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Margin</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map(r => {
                  const profit = r.baseline_quotation_value - r.actual_cost_total
                  const adjusted =
                    r.adjusted_quotation_value != null &&
                    Number(r.adjusted_quotation_value) !== r.baseline_quotation_value
                  return (
                    <tr key={r.project_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{r.contact_name}</div>
                        {r.contact_phone && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">{r.contact_phone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.site_location || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">
                        {inr(r.baseline_quotation_value)}
                        {adjusted && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Adjusted</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                        {inr(r.actual_cost_total)}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums font-medium ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {inr(profit)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className={`tabular-nums font-semibold ${r.margin_percent >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-600 dark:text-red-400'}`}>
                          {r.margin_percent}%
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400">
                          Target {r.target_margin_percent}%
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={STATUS_TONE[r.margin_status] || 'gray'}>
                          {STATUS_LABEL[r.margin_status] || r.margin_status}
                        </StatusBadge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            Showing {filtered.length} of {rows.length} projects
          </div>
        </div>
      )}
    </div>
  )
}