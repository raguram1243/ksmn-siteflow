import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { SkeletonDashboard, SkeletonList } from '../components/Skeleton'
import MarginTrendChart from '../components/MarginTrendChart'
import Modal from '../components/Modal'
import type { Project, PendingApproval } from '../types/database'

export default function AdminDashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({
    totalContacts: 0,
    activeLeads: 0,
    activeProjects: 0,
    totalQuotedValue: 0,
    avgMargin: 0,
    belowTargetCount: 0,
    totalProjects: 0
  })
  const [recentProjects, setRecentProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // New stats
  const [funnel, setFunnel] = useState({ total_contacts: 0, total_leads: 0, quotations_sent: 0, confirmed: 0 })
  const [monthly, setMonthly] = useState({ this_month_contacts: 0, last_month_contacts: 0, this_month_confirmed: 0, last_month_confirmed: 0, this_month_value: 0, last_month_value: 0 })
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [overdueFollowups, setOverdueFollowups] = useState<any[]>([])
  const [repActivity, setRepActivity] = useState<any[]>([])
  const [globalMargin, setGlobalMargin] = useState('10.00')
  const [showMarginModal, setShowMarginModal] = useState(false)
  const [editingMargin, setEditingMargin] = useState('10.00')
  const [monthlyError, setMonthlyError] = useState<string | null>(null)

  // New admin-only stats
  const [collectionSummary, setCollectionSummary] = useState({ total_collected: 0, total_outstanding: 0, total_quotation_value: 0, project_count: 0 })
  const [overdueCollections, setOverdueCollections] = useState<any[]>([])
  const [avgProjectDuration, setAvgProjectDuration] = useState({ avg_duration_days: 0, completed_count: 0 })
  const [totalProfit, setTotalProfit] = useState({ total_profit: 0, total_revenue: 0, total_cost: 0, closed_project_count: 0 })

  useEffect(() => {
    fetchStats()
  }, [])

  // Listen for refresh events
  useEffect(() => {
    function handleRefresh() {
      fetchStats()
    }
    window.addEventListener('app-refresh', handleRefresh)
    return () => window.removeEventListener('app-refresh', handleRefresh)
  }, [])

  async function fetchStats() {
    setLoading(true)

    // Fetch all stats in parallel
    const [portfolioRes, funnelRes, monthlyRes, approvalsRes, followupsRes, repActivityRes, settingsRes,
           collectionRes, overdueRes, durationRes, profitRes] = await Promise.all([
      supabase.rpc('get_admin_portfolio_summary'),
      supabase.rpc('get_conversion_funnel'),
      supabase.rpc('get_monthly_comparison'),
      supabase.rpc('get_pending_approvals'),
      supabase.rpc('get_overdue_followups', { days_threshold: 14 }),
      supabase.rpc('get_rep_activity'),
      supabase.rpc('get_global_setting', { p_setting_key: 'default_target_margin' }),
      supabase.rpc('get_admin_collection_summary'),
      supabase.rpc('get_overdue_collections'),
      supabase.rpc('get_average_project_duration'),
      supabase.rpc('get_total_profit')
    ])

    // Check for errors
    if (portfolioRes.error) console.error('Error fetching portfolio:', portfolioRes.error)
    if (funnelRes.error) console.error('Error fetching funnel:', funnelRes.error)
    if (monthlyRes.error) console.error('Error fetching monthly:', monthlyRes.error)
    if (approvalsRes.error) console.error('Error fetching approvals:', approvalsRes.error)
    if (followupsRes.error) console.error('Error fetching followups:', followupsRes.error)
    if (repActivityRes.error) console.error('Error fetching rep activity:', repActivityRes.error)
    if (settingsRes.error) console.error('Error fetching settings:', settingsRes.error)
    if (collectionRes.error) console.error('Error fetching collection:', collectionRes.error)
    if (overdueRes.error) console.error('Error fetching overdue:', overdueRes.error)
    if (durationRes.error) console.error('Error fetching duration:', durationRes.error)
    if (profitRes.error) console.error('Error fetching profit:', profitRes.error)

    const portfolio = portfolioRes.data as any
    const portfolioData = Array.isArray(portfolio) ? portfolio[0] : portfolio
    if (portfolioData) {
      setStats({
        totalContacts: 0,
        activeLeads: 0,
        activeProjects: portfolioData.active_projects || 0,
        totalQuotedValue: portfolioData.total_quoted_value || 0,
        avgMargin: portfolioData.avg_margin || 0,
        belowTargetCount: portfolioData.below_target_count || 0,
        totalProjects: portfolioData.total_projects || 0
      })
    }

    const funnelData = funnelRes.data as any
    if (funnelData && funnelData.length > 0) {
      setFunnel(funnelData[0])
      setStats(prev => ({
        ...prev,
        totalContacts: funnelData[0].total_contacts || 0,
        activeLeads: funnelData[0].total_leads || 0
      }))
    }

    const monthlyData = monthlyRes.data as any
    if (monthlyRes.error) {
      setMonthlyError(monthlyRes.error.message)
    } else if (monthlyData && monthlyData.length > 0) {
      setMonthly(monthlyData[0])
      setMonthlyError(null)
    } else {
      setMonthlyError(null)
    }

    setPendingApprovals((approvalsRes.data as any) || [])
    setOverdueFollowups((followupsRes.data as any) || [])
    setRepActivity((repActivityRes.data as any) || [])

    if (settingsRes.data) {
      setGlobalMargin(settingsRes.data)
      setEditingMargin(settingsRes.data)
    }

    // New admin-only stats
    const collectionData = collectionRes.data as any
    if (collectionData && collectionData.length > 0) {
      setCollectionSummary(collectionData[0])
    }

    setOverdueCollections((overdueRes.data as any) || [])

    const durationData = durationRes.data as any
    if (durationData && durationData.length > 0) {
      setAvgProjectDuration(durationData[0])
    }

    const profitData = profitRes.data as any
    if (profitData && profitData.length > 0) {
      setTotalProfit(profitData[0])
    }

    // Fetch recent projects
    const recent = await supabase
      .from('projects')
      .select('*, quotations(option_label, created_by), contacts!projects_contact_id_fkey(name, site_location)')
      .order('created_at', { ascending: false })
      .limit(5)

    setRecentProjects((recent.data as Project[]) || [])
    setLoading(false)
  }

  async function handleUpdateGlobalMargin() {
    const value = parseFloat(editingMargin)
    if (isNaN(value) || value < 0 || value > 100) {
      alert('Please enter a valid margin percentage (0-100)')
      return
    }

    const { error } = await supabase.rpc('update_global_setting', {
      setting_key: 'default_target_margin',
      setting_value: value.toFixed(2)
    })

    if (error) {
      alert('Error updating margin: ' + error.message)
    } else {
      setGlobalMargin(editingMargin)
      setShowMarginModal(false)
      alert('Global target margin updated to ' + value + '%\n\nThis will only apply to new projects created after this change.')
    }
  }

  async function handleUpdateProjectMargin(projectId: string, currentMargin: number) {
    const newMargin = prompt('Enter new target margin % for this project:', currentMargin.toString())
    if (newMargin === null) return

    const value = parseFloat(newMargin)
    if (isNaN(value) || value < 0 || value > 100) {
      alert('Please enter a valid margin percentage (0-100)')
      return
    }

    const { error } = await supabase
      .from('projects')
      .update({ target_margin_percent: value })
      .eq('id', projectId)

    if (error) {
      alert('Error updating project margin: ' + error.message)
    } else {
      alert('Project target margin updated to ' + value + '%')
      fetchStats()
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard</h2>
        <button
          onClick={() => setShowMarginModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          ⚙️ Global Target Margin: {globalMargin}%
        </button>
      </div>

      {loading ? (
        <SkeletonDashboard />
      ) : (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">Total Contacts</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalContacts}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">Active Leads</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.activeLeads}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">Active Projects</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.activeProjects}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">Avg Margin</h3>
              <p className={`text-3xl font-bold mt-2 ${stats.avgMargin >= parseFloat(globalMargin) ? 'text-green-600' : stats.avgMargin > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                {stats.avgMargin.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Portfolio Overview */}
          <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Portfolio Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-500">Total Quoted Value</div>
                <div className="text-xl font-bold text-gray-900">₹{Number(stats.totalQuotedValue).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Below Target Margin</div>
                <div className={`text-xl font-bold ${stats.belowTargetCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {stats.belowTargetCount} projects
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total Projects</div>
                <div className="text-xl font-bold text-gray-900">{stats.totalProjects}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Target Margin</div>
                <div className="text-xl font-bold text-blue-600">{globalMargin}%</div>
              </div>
            </div>
          </div>

          {/* Collection Summary - NEW */}
          <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Collection Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-500">Total Collected</div>
                <div className="text-xl font-bold text-green-600">₹{Number(collectionSummary.total_collected).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total Outstanding</div>
                <div className="text-xl font-bold text-red-600">₹{Number(collectionSummary.total_outstanding).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total Quotation Value</div>
                <div className="text-xl font-bold text-gray-900">₹{Number(collectionSummary.total_quotation_value).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Projects</div>
                <div className="text-xl font-bold text-gray-900">{collectionSummary.project_count}</div>
              </div>
            </div>
          </div>

          {/* Profit & Duration Summary - NEW */}
          <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary (Closed Projects)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-500">Total Profit</div>
                <div className={`text-xl font-bold ${Number(totalProfit.total_profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ₹{Number(totalProfit.total_profit).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total Revenue</div>
                <div className="text-xl font-bold text-gray-900">₹{Number(totalProfit.total_revenue).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total Cost</div>
                <div className="text-xl font-bold text-gray-900">₹{Number(totalProfit.total_cost).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Avg Project Duration</div>
                <div className="text-xl font-bold text-gray-900">{avgProjectDuration.avg_duration_days} days</div>
                <div className="text-xs text-gray-500">{avgProjectDuration.completed_count} closed projects</div>
              </div>
            </div>
          </div>

          {/* Pending Approvals - Prominent */}
          {pendingApprovals.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-950 border-l-4 border-yellow-400 p-6 rounded-lg shadow-sm border mb-8">
              <h3 className="text-lg font-semibold text-yellow-900 mb-4">
                ⚠️ Pending Admin Approvals ({pendingApprovals.length})
              </h3>
              <p className="text-sm text-yellow-700 mb-4">These quotations have been approved by clients and need your confirmation to lock them.</p>
              <div className="space-y-2">
                {pendingApprovals.map((approval) => (
                  <div key={approval.id} className="bg-white p-4 rounded-md border border-yellow-200 flex justify-between items-center">
                    <div>
                      <span className="font-medium">{approval.contact_name}</span>
                      <span className="ml-2 text-sm text-gray-600">({approval.option_label})</span>
                      <div className="text-sm text-gray-500">₹{Number(approval.total_value).toLocaleString()}</div>
                    </div>
                    <button
                      onClick={() => window.location.href = `/quotations?highlight=${approval.id}`}
                      className="px-4 py-2 bg-yellow-600 text-white rounded-md text-sm font-medium hover:bg-yellow-700"
                    >
                      Review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conversion Funnel */}
          <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Conversion Funnel</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{funnel.total_contacts}</div>
                <div className="text-sm text-gray-500">Contacts Met</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">{funnel.total_leads}</div>
                <div className="text-sm text-gray-500">Leads</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">{funnel.quotations_sent}</div>
                <div className="text-sm text-gray-500">Quotations Sent</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{funnel.confirmed}</div>
                <div className="text-sm text-gray-500">Confirmed</div>
              </div>
            </div>
          </div>

          {/* Month Over Month Comparison */}
          <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">This Month vs Last Month</h3>
            {monthlyError ? (
              <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 rounded-md">
                <p className="text-sm text-red-700 font-medium">Unable to load this data</p>
                <p className="text-xs text-red-600 mt-1">{monthlyError}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-500">New Contacts</div>
                  <div className="text-xl font-bold text-gray-900">
                    {monthly.this_month_contacts}
                    <span className={`text-sm ml-2 ${monthly.this_month_contacts >= monthly.last_month_contacts ? 'text-green-600' : 'text-red-600'}`}>
                      ({monthly.this_month_contacts >= monthly.last_month_contacts ? '+' : ''}{monthly.this_month_contacts - monthly.last_month_contacts})
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Confirmed Projects</div>
                  <div className="text-xl font-bold text-gray-900">
                    {monthly.this_month_confirmed}
                    <span className={`text-sm ml-2 ${monthly.this_month_confirmed >= monthly.last_month_confirmed ? 'text-green-600' : 'text-red-600'}`}>
                      ({monthly.this_month_confirmed >= monthly.last_month_confirmed ? '+' : ''}{monthly.this_month_confirmed - monthly.last_month_confirmed})
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Total Quoted Value</div>
                  <div className="text-xl font-bold text-gray-900">
                    ₹{Number(monthly.this_month_value).toLocaleString()}
                    <span className={`text-sm ml-2 ${monthly.this_month_value >= monthly.last_month_value ? 'text-green-600' : 'text-red-600'}`}>
                      ({monthly.this_month_value >= monthly.last_month_value ? '+' : ''}₹{(monthly.this_month_value - monthly.last_month_value).toLocaleString()})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Margin Trend Chart */}
          <div className="mb-8">
            <MarginTrendChart />
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Projects Below Target Margin */}
            <div className="bg-white rounded-lg shadow-sm border">
              <h3 className="text-lg font-semibold text-gray-900 px-6 py-4 border-b">
                Projects Below Target Margin ({stats.belowTargetCount})
              </h3>
              {stats.belowTargetCount === 0 ? (
                <div className="p-6 text-center text-gray-500">All projects are meeting target margin! 🎉</div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {recentProjects
                    .filter((p: Project) => {
                      if (p.baseline_quotation_value <= 0) return false
                      const margin = ((p.baseline_quotation_value - p.actual_cost_total) / p.baseline_quotation_value * 100)
                      return margin < p.target_margin_percent
                    })
                    .map((p: Project) => {
                      const margin = p.baseline_quotation_value > 0
                        ? ((p.baseline_quotation_value - p.actual_cost_total) / p.baseline_quotation_value * 100)
                        : 0
                      return (
                        <div key={p.id} className="px-6 py-3 hover:bg-gray-50">
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="text-sm font-medium text-gray-900">{p.contacts?.name || 'Unknown'}</span>
                              <span className="ml-2 text-xs text-gray-500">{p.contacts?.site_location}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-red-600">{margin.toFixed(1)}%</div>
                              <div className="text-xs text-gray-500">Target: {p.target_margin_percent}%</div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>

            {/* Overdue Follow-ups */}
            <div className="bg-white rounded-lg shadow-sm border">
              <h3 className="text-lg font-semibold text-gray-900 px-6 py-4 border-b">
                Overdue Follow-ups ({overdueFollowups.length})
              </h3>
              {overdueFollowups.length === 0 ? (
                <div className="p-6 text-center text-gray-500">No overdue follow-ups! 🎉</div>
              ) : (
                <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                  {overdueFollowups.slice(0, 10).map((followup: any) => (
                    <div key={followup.out_contact_id} className="px-6 py-3 hover:bg-gray-50">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-sm font-medium text-gray-900">{followup.name}</span>
                          <span className="ml-2 text-xs text-gray-500">{followup.phone}</span>
                          <div className="text-xs text-gray-500">{followup.site_location}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-red-600">{followup.days_since_contact} days</div>
                          <div className="text-xs text-gray-500">
                            {new Date(followup.last_activity).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Overdue Collections - NEW */}
          <div className="bg-white rounded-lg shadow-sm border mb-8">
            <h3 className="text-lg font-semibold text-gray-900 px-6 py-4 border-b">
              Overdue Collections ({overdueCollections.length})
            </h3>
            {overdueCollections.length === 0 ? (
              <div className="p-6 text-center text-gray-500">All projects are fully paid! 🎉</div>
            ) : (
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {overdueCollections.map((oc: any) => (
                  <div key={oc.project_id} className="px-6 py-3 hover:bg-gray-50">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-sm font-medium text-gray-900">{oc.contact_name}</span>
                        <span className="ml-2 text-xs text-gray-500">{oc.site_location}</span>
                        <div className="text-xs text-gray-500">
                          Quotation: ₹{Number(oc.quotation_value).toLocaleString()} | Received: ₹{Number(oc.total_received).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-400">
                          Outstanding for {oc.days_outstanding} days since project creation
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-red-600">₹{Number(oc.outstanding).toLocaleString()}</div>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          oc.project_status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-600'
                        }`}>{oc.project_status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rep Activity */}
          {repActivity.length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Rep Activity</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {repActivity.map((rep: any) => (
                  <div key={rep.rep_id} className="border rounded-md p-4">
                    <div className="font-medium text-gray-900">{rep.rep_name}</div>
                    <div className="text-sm text-gray-500 mt-2">
                      <div>Today: <span className="font-semibold text-blue-600">{rep.visits_today} visits</span></div>
                      <div>This Week: <span className="font-semibold text-purple-600">{rep.visits_this_week} visits</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Projects */}
          <div className="bg-white rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 px-6 py-4 border-b">Recent Projects</h3>
            {recentProjects.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No projects yet. Lock a confirmed quotation to create one.</div>
            ) : (
              <div className="divide-y divide-gray-200">
                {recentProjects.map((p: Project) => (
                  <div key={p.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{p.contacts?.name || 'Unknown'}</span>
                      <span className="ml-2 text-xs text-gray-500">{p.contacts?.site_location}</span>
                    </div>
                    <div className="text-sm text-gray-900 font-medium">
                      ₹{Number(p.baseline_quotation_value).toLocaleString()}
                      <span className={`ml-2 text-xs ${
                        p.status === 'in_progress' ? 'text-blue-600' : 'text-gray-500'
                      }`}>{p.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Global Margin Settings Modal */}
      <Modal isOpen={showMarginModal} onClose={() => { setShowMarginModal(false); setEditingMargin(globalMargin) }}>
        <h3 className="text-lg font-semibold mb-4">Global Target Margin Setting</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Target Margin (%)
            </label>
            <input
              type="number"
              value={editingMargin}
              onChange={(e) => setEditingMargin(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              min="0"
              max="100"
              step="0.1"
            />
            <p className="mt-2 text-xs text-gray-500">
              This is the default margin target for new projects. Existing projects keep their original margin.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => {
              setShowMarginModal(false)
              setEditingMargin(globalMargin)
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleUpdateGlobalMargin}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Save Changes
          </button>
        </div>
      </Modal>
    </div>
  )
}