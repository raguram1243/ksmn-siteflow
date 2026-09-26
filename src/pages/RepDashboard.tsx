import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { SkeletonDashboard } from '../components/Skeleton'

export default function RepDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({
    totalContacts: 0,
    activeLeads: 0,
    pendingApproval: 0,
    todayVisits: 0,
    activeProjects: 0
  })
  const [recentContacts, setRecentContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    fetchStats()
  }, [user])

  // Listen for refresh events
  useEffect(() => {
    function handleRefresh() {
      if (user) fetchStats()
    }
    window.addEventListener('app-refresh', handleRefresh)
    return () => window.removeEventListener('app-refresh', handleRefresh)
  }, [user])

  async function fetchStats() {
    if (!user) return
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    const [contactsRes, leadsRes, quotesPending, quotesApproved, visitsRes, projectsRes] = await Promise.all([
      supabase.from('contacts').select('id', { count: 'exact', head: true }),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('is_lead', true),
      // Quotations that are client-approved but NOT yet admin-locked = pending admin approval
      supabase.from('quotations').select('id', { count: 'exact', head: true }).eq('client_approved', true).eq('admin_locked', false),
      // Quotations that are locked = approved
      supabase.from('quotations').select('id', { count: 'exact', head: true }).eq('admin_locked', true),
      supabase.from('site_visits').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('projects').select('id', { count: 'exact', head: true })
        .in('lead_id', (await supabase.from('contacts').select('id').eq('is_lead', true)).data?.map(c => c.id) || [])
    ])

    setStats({
      totalContacts: contactsRes.count || 0,
      activeLeads: leadsRes.count || 0,
      pendingApproval: quotesPending.count || 0,
      todayVisits: visitsRes.count || 0,
      activeProjects: projectsRes.count || 0
    })

    // Get recent contacts for display
    const { data } = await supabase
      .from('contacts')
      .select('name, phone, site_location, is_lead, created_at')
      .order('created_at', { ascending: false })
      .limit(5)
    setRecentContacts((data as any[]) || [])
    setLoading(false)
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">My Dashboard</h2>

      {loading ? (
        <SkeletonDashboard />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="bg-white p-5 rounded-lg shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">Total Contacts</h3>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalContacts}</p>
            </div>
            <div className="bg-white p-5 rounded-lg shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">Active Leads</h3>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.activeLeads}</p>
            </div>
            <div className="bg-white p-5 rounded-lg shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">Awaiting Admin</h3>
              <p className="text-3xl font-bold text-yellow-600 mt-1">{stats.pendingApproval}</p>
            </div>
            <div className="bg-white p-5 rounded-lg shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">Today's Visits</h3>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.todayVisits}</p>
            </div>
            <div className="bg-white p-5 rounded-lg shadow-sm border">
              <h3 className="text-sm font-medium text-gray-500">Active Projects</h3>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.activeProjects}</p>
            </div>
          </div>

          {/* Recent Contacts */}
          {recentContacts.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border mb-8">
              <h3 className="text-sm font-semibold text-gray-700 px-6 py-3 border-b">Recent Contacts</h3>
              <div className="divide-y divide-gray-100">
                {recentContacts.map((c: any, i: number) => (
                  <div key={i} className="px-6 py-3 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-gray-900">{c.name}</span>
                      {c.is_lead && <span className="ml-2 text-xs text-green-600 font-medium">Lead</span>}
                    </div>
                    <div className="text-gray-500">{c.phone || c.site_location || ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded-lg p-6">
            <h3 className="text-sm font-medium text-blue-800 mb-3">Quick Actions</h3>
            <div className="flex flex-wrap gap-3">
              <a href="/contacts" className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">
                + Add Contact
              </a>
              <a href="/visits" className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700">
                📷 Log Site Visit
              </a>
              <a href="/quotations" className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700">
                📄 Create Quotation
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}