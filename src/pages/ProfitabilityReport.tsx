import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import StatusBadge, { type BadgeTone } from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import { SkeletonTable } from '../components/Skeleton'
import { calcProfit, calcExpectedProfit } from '../lib/profit'
import { formatINR } from '../lib/format'

interface ProfitRow {
  project_id: string
  contact_name: string
  contact_phone?: string
  site_location?: string
  baseline_quotation_value: number
  adjusted_quotation_value: number | null
  quotation_value: number
  actual_cost_total: number
  total_received: number
  profit_amount: number
  expected_profit: number
  expected_margin: number
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

const inr = formatINR

type ColumnKey = 'location' | 'quotation' | 'received' | 'cost' | 'expected' | 'status'

const COLUMN_LABELS: Record<ColumnKey, string> = {
  location: 'Location',
  quotation: 'Quotation',
  received: 'Received',
  cost: 'Cost',
  expected: 'Expected profit',
  status: 'Status',
}

const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  location: true, quotation: true, received: true, cost: true, expected: true, status: true,
}

const COLUMNS_STORAGE_KEY = 'profitability-report-columns'

function loadColumns(): Record<ColumnKey, boolean> {
  try {
    const raw = localStorage.getItem(COLUMNS_STORAGE_KEY)
    if (raw) return { ...DEFAULT_COLUMNS, ...JSON.parse(raw) }
  } catch {
    // storage unavailable or corrupt - fall back to defaults
  }
  return DEFAULT_COLUMNS
}

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
  const [columns, setColumns] = useState<Record<ColumnKey, boolean>>(loadColumns)
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const columnMenuRef = useRef<HTMLDivElement>(null)

  function toggleColumn(key: ColumnKey) {
    setColumns(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next)) } catch { /* non-critical */ }
      return next
    })
  }

  useEffect(() => {
    if (!showColumnMenu) return
    function onDown(e: MouseEvent) {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) setShowColumnMenu(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowColumnMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showColumnMenu])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const profitRes = await supabase.rpc('get_project_profit_view')

      if (cancelled) return

      if (profitRes.error) {
        setError(profitRes.error.message)
        setLoading(false)
        return
      }

      // Profit is cash-basis (received - cost); quotation value is reference only.
      const merged = ((profitRes.data || []) as any[]).map(r => {
        const received = Number(r.total_received || 0)
        const cost = Number(r.actual_cost_total || 0)
        const target = Number(r.target_margin_percent || 0)
        const { profit, margin, status } = calcProfit(received, cost, target)
        const quotation = Number(r.effective_quotation_value || r.baseline_quotation_value || 0)
        const expected = calcExpectedProfit(quotation, cost)
        return {
          ...r,
          baseline_quotation_value: Number(r.baseline_quotation_value || 0),
          adjusted_quotation_value: r.adjusted_quotation_value ?? null,
          quotation_value: Number(r.effective_quotation_value || r.baseline_quotation_value || 0),
          actual_cost_total: cost,
          total_received: received,
          profit_amount: profit,
          expected_profit: expected.profit,
          expected_margin: expected.margin,
          target_margin_percent: target,
          margin_percent: margin,
          margin_status: status,
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
      if (sortBy === 'value') return b.quotation_value - a.quotation_value
      if (sortBy === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return a.margin_percent - b.margin_percent // worst first
    })
  }, [rows, search, filterStatus, filterMargin, sortBy])

  const summary = useMemo(() => {
    const withReceipts = rows.filter(r => r.total_received > 0)
    const totalValue = rows.reduce((s, r) => s + r.quotation_value, 0)
    const totalReceived = rows.reduce((s, r) => s + r.total_received, 0)
    const totalCost = rows.reduce((s, r) => s + r.actual_cost_total, 0)
    const avgMargin = withReceipts.length
      ? withReceipts.reduce((s, r) => s + r.margin_percent, 0) / withReceipts.length
      : 0
    return {
      count: rows.length,
      totalValue,
      totalReceived,
      totalCost,
      totalProfit: totalReceived - totalCost,
      avgMargin: Number(avgMargin.toFixed(2)),
      lossCount: rows.filter(r => r.margin_status === 'loss').length,
      belowCount: rows.filter(r => r.margin_status === 'below_target').length,
    }
  }, [rows])

  function handleExport() {
    const header = ['Client', 'Phone', 'Location', 'Quotation Value', 'Total Received', 'Cost', 'Profit', 'Expected Profit', 'Margin %', 'Expected Margin %', 'Target %', 'Margin Status', 'Project Status', 'Closed At']
    const body = filtered.map(r => [
      r.contact_name,
      r.contact_phone || '',
      r.site_location || '',
      r.quotation_value,
      r.total_received,
      r.actual_cost_total,
      Number(r.profit_amount.toFixed(2)),
      Number(r.expected_profit.toFixed(2)),
      r.margin_percent,
      r.expected_margin,
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
            Per-project margin vs target, worst performers first. Profit = Total Received − Actual Cost; margin = profit ÷ received.
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
          <div className="text-xs text-gray-500 dark:text-gray-400">Total Received</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{inr(summary.totalReceived)}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">of {inr(summary.totalValue)} quoted</div>
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
        <div className="relative no-print" ref={columnMenuRef}>
          <button
            type="button"
            onClick={() => setShowColumnMenu(o => !o)}
            aria-haspopup="true"
            aria-expanded={showColumnMenu}
            className={`${inputClass} font-medium`}
          >
            Columns ▾
          </button>
          {showColumnMenu && (
            <div className="absolute right-0 z-30 mt-1 w-48 rounded-md border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-600 dark:bg-gray-800">
              {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map(key => (
                <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700">
                  <input type="checkbox" checked={columns[key]} onChange={() => toggleColumn(key)} />
                  {COLUMN_LABELS[key]}
                </label>
              ))}
              <div className="mt-1 border-t border-gray-100 px-2 pt-1.5 text-[11px] text-gray-400 dark:border-gray-700">
                Client, Profit and Margin are always shown.
              </div>
            </div>
          )}
        </div>
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
          <div className="overflow-auto max-h-[70vh] print:max-h-none print:overflow-visible">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 text-left shadow-[0_1px_0_0_rgb(229,231,235)] dark:shadow-[0_1px_0_0_rgb(55,65,81)]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Client</th>
                  {columns.location && <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Location</th>}
                  {columns.quotation && <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Quotation</th>}
                  {columns.received && <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Received</th>}
                  {columns.cost && <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Cost</th>}
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Profit</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-right">Margin</th>
                  {columns.status && <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Status</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map(r => {
                  const profit = r.profit_amount
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
                      {columns.location && <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.site_location || '—'}</td>}
                      {columns.quotation && (
                        <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">
                          {inr(r.quotation_value)}
                          {adjusted && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Adjusted</div>
                          )}
                        </td>
                      )}
                      {columns.received && (
                        <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">
                          {inr(r.total_received)}
                        </td>
                      )}
                      {columns.cost && (
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                          {inr(r.actual_cost_total)}
                        </td>
                      )}
                      <td className={`px-4 py-3 text-right tabular-nums font-medium ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {inr(profit)}
                        {columns.expected && (
                          <div className="text-[10px] font-normal text-gray-400 dark:text-gray-500">
                            Expected {inr(r.expected_profit)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className={`tabular-nums font-semibold ${r.margin_percent >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-600 dark:text-red-400'}`}>
                          {r.margin_percent}%
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400">
                          Target {r.target_margin_percent}%
                        </div>
                      </td>
                      {columns.status && (
                        <td className="px-4 py-3">
                          <StatusBadge tone={STATUS_TONE[r.margin_status] || 'gray'}>
                            {STATUS_LABEL[r.margin_status] || r.margin_status}
                          </StatusBadge>
                        </td>
                      )}
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