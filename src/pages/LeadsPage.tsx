import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../contexts/ToastContext'
import { useNavigate } from 'react-router-dom'
import { useDebounce } from '../hooks/useDebounce'
import type { Contact } from '../types/database'
import { SkeletonTable } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import CopyButton from '../components/CopyButton'
import Spinner from '../components/Spinner'

export default function LeadsPage() {
  const { role } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [leads, setLeads] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('updated_at')
  const [selectedLead, setSelectedLead] = useState<Contact | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [leadQuotations, setLeadQuotations] = useState<any[]>([])
  const [leadVisits, setLeadVisits] = useState<any[]>([])

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useDebounce(search, 300)

  useEffect(() => {
    fetchLeads()
  }, [debouncedSearch, filterStatus, sortBy])

  // Listen for refresh events
  useEffect(() => {
    function handleRefresh() {
      fetchLeads()
    }
    window.addEventListener('app-refresh', handleRefresh)
    return () => window.removeEventListener('app-refresh', handleRefresh)
  }, [debouncedSearch, filterStatus, sortBy])

  async function fetchLeads() {
    setLoading(true)
    let query = supabase
      .from('contacts')
      .select('*')
      .eq('is_lead', true)

    if (debouncedSearch) {
      query = query.or(`name.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%,site_location.ilike.%${debouncedSearch}%`)
    }

    if (filterStatus !== 'all') {
      query = query.eq('lead_status', filterStatus)
    }

    const { data } = await query.order(sortBy as any, { ascending: false })
    setLeads((data as Contact[]) || [])
    setLoading(false)
  }

  async function openLeadDetail(lead: Contact) {
    setSelectedLead(lead)
    setShowDetail(true)

    // Fetch quotations for this lead
    const { data: quotes } = await supabase
      .from('quotations')
      .select('*')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
    setLeadQuotations((quotes as any[]) || [])

    // Fetch site visits for this lead
    const { data: visits } = await supabase
      .from('site_visits')
      .select('*')
      .eq('contact_id', lead.id)
      .order('visit_date', { ascending: false })
    setLeadVisits((visits as any[]) || [])
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Leads</h2>
      </div>

      {/* Search, Filter, Sort */}
      <div className="mb-4 space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search leads..."
          className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="quotation_sent">Quotation Sent</option>
            <option value="quotation_selected">Quotation Selected</option>
            <option value="confirmed">Confirmed</option>
            <option value="lost">Lost</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500"
          >
            <option value="updated_at">Sort by Updated</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
        {loading ? (
          <SkeletonTable />
        ) : leads.length === 0 ? (
          <EmptyState
            icon="🎯"
            title="No leads yet"
            description="Promote contacts to leads when they show interest"
            action={{ label: '+ Add Contact', onClick: () => navigate('/contacts') }}
          />
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Site</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lead Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quotations</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {leads.map((lead) => (
                <tr key={lead.id} onClick={() => openLeadDetail(lead)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{lead.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {lead.phone && <span className="inline-flex items-center gap-1">{lead.phone}<CopyButton text={lead.phone} label="Phone" /></span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {lead.site_location && <span className="inline-flex items-center gap-1">{lead.site_location}<CopyButton text={lead.site_location} label="Site address" /></span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      lead.lead_status === 'active' ? 'bg-blue-100 text-blue-800' :
                      lead.lead_status === 'quotation_sent' ? 'bg-yellow-100 text-yellow-800' :
                      lead.lead_status === 'confirmed' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {lead.lead_status?.replace('_', ' ') || 'Active'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {leadQuotations.filter(q => q.lead_id === lead.id).length || '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Lead Detail Modal */}
      <Modal isOpen={showDetail} onClose={() => { setShowDetail(false); setSelectedLead(null) }}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold">{selectedLead?.name}</h3>
            <p className="text-sm text-gray-500">{selectedLead?.phone} | {selectedLead?.site_location}</p>
            <p className="text-xs text-gray-400">{selectedLead ? `Met: ${new Date(selectedLead.date_first_met).toLocaleDateString()} | Source: ${selectedLead.source}` : ''}</p>
          </div>
          <button onClick={() => { setShowDetail(false); setSelectedLead(null) }}
            className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {selectedLead && (
          <>
            {/* Lead Status */}
            <div className="mb-4">
              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                selectedLead.lead_status === 'active' ? 'bg-blue-100 text-blue-800' :
                selectedLead.lead_status === 'quotation_sent' ? 'bg-yellow-100 text-yellow-800' :
                selectedLead.lead_status === 'confirmed' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {selectedLead.lead_status?.replace('_', ' ') || 'Active'}
              </span>
            </div>

            {/* Quotations */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Quotations ({leadQuotations.length})</h4>
              {leadQuotations.length === 0 ? (
                <p className="text-sm text-gray-400">No quotations yet</p>
              ) : (
                <div className="space-y-2">
                  {leadQuotations.map((q: any) => (
                    <div key={q.id} className="bg-gray-50 p-3 rounded-md">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{q.option_label}</span>
                        <span className="text-sm font-bold text-gray-900">₹{Number(q.total_value).toLocaleString()}</span>
                      </div>
                      <div className="mt-1 flex gap-2">
                        {q.is_selected && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Selected</span>}
                        {q.client_approved && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">Client Approved</span>}
                        {q.admin_locked && <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Locked</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Site Visits */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Site Visits ({leadVisits.length})</h4>
              {leadVisits.length === 0 ? (
                <p className="text-sm text-gray-400">No site visits logged</p>
              ) : (
                <div className="space-y-2">
                  {leadVisits.map((v: any) => (
                    <div key={v.id} className="bg-gray-50 p-3 rounded-md">
                      <div className="text-sm text-gray-900">{v.notes || 'No notes'}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(v.visit_date || v.created_at).toLocaleString()}
                        {v.photo_url && v.photo_url !== 'pending_upload' && ' | 📷 Photo'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Admin-only Delete */}
            {role === 'admin' && selectedLead && (
              <div className="mt-4 pt-4 border-t border-red-200">
                <button
                  onClick={async () => {
                    if (!selectedLead || deleting) return
                    if (!confirm(`Are you sure you want to delete this lead (${selectedLead.name})? This cannot be undone.`)) return

                    setDeleting(true)
                    try {
                      // Check for dependent records
                      const { data: quotations } = await supabase
                        .from('quotations')
                        .select('id')
                        .eq('lead_id', selectedLead.id)
                        .limit(1)

                      if (quotations && quotations.length > 0) {
                        alert('Cannot delete this lead — it has quotations attached. Archive or remove the quotations first.')
                        return
                      }

                      const { error } = await supabase.from('contacts').delete().eq('id', selectedLead.id)
                      if (error) {
                        alert('Error deleting lead: ' + error.message)
                        addToast('Failed to delete lead', 'error')
                        return
                      }

                      setShowDetail(false)
                      setSelectedLead(null)
                      fetchLeads()
                      addToast('Lead deleted successfully', 'success')
                    } finally {
                      setDeleting(false)
                    }
                  }}
                  disabled={deleting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded-md hover:bg-red-100 border border-red-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {deleting ? <><Spinner /> Deleting…</> : '🗑️ Delete Lead'}
                </button>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}
