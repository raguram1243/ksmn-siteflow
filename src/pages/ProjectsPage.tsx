import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../contexts/ToastContext'
import { useDebounce } from '../hooks/useDebounce'
import { SkeletonList, SkeletonDetail } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import type { Project, ExpenseEntry, ProjectProfitView } from '../types/database'

export default function ProjectsPage() {
  const { user, role } = useAuth()
  const { addToast } = useToast()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('created_at')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [adjustments, setAdjustments] = useState<any[]>([])
  const [profitData, setProfitData] = useState<ProjectProfitView | null>(null)
  const [selectedExpense, setSelectedExpense] = useState<ExpenseEntry | null>(null)
  const [showExpenseDetail, setShowExpenseDetail] = useState(false)

  // Add payment form
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [paymentReceipt, setPaymentReceipt] = useState<File | null>(null)
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)

  // Adjustment modal
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [adjustNewValue, setAdjustNewValue] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustSubmitting, setAdjustSubmitting] = useState(false)

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useDebounce(search, 300)

  useEffect(() => { fetchProjects() }, [debouncedSearch, filterStatus, sortBy])

  // Listen for refresh events
  useEffect(() => {
    function handleRefresh() {
      fetchProjects()
    }
    window.addEventListener('app-refresh', handleRefresh)
    return () => window.removeEventListener('app-refresh', handleRefresh)
  }, [debouncedSearch, filterStatus, sortBy])

  async function fetchProjects() {
    setLoading(true)

    let query = supabase
      .from('projects')
      .select('*, quotations(option_label, created_by), contacts!projects_contact_id_fkey(name, phone, site_location)')
      .order(sortBy as any, { ascending: false })

    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus)
    }

    const { data, error } = await query
    if (error) {
      console.error('Error fetching projects:', error.message)
      addToast('Failed to load projects', 'error')
    }
    
    let filtered = (data as Project[]) || []
    
    if (search) {
      const s = search.toLowerCase()
      filtered = filtered.filter((p: Project) =>
        (p.contacts?.name || '').toLowerCase().includes(s) ||
        (p.quotations?.option_label || '').toLowerCase().includes(s)
      )
    }
    
    setProjects(filtered)
    setLoading(false)
  }

  async function viewProjectDetail(project: Project) {
    setSelectedProject(project)
    setShowDetail(true)
    setExpenses([])
    setPayments([])
    setAdjustments([])
    setProfitData(null)

    // Calculate effective quotation value
    const effectiveValue = project.adjusted_quotation_value || project.baseline_quotation_value

    // Fetch expenses
    const { data: expData, error: expError } = await supabase
      .from('expense_entries')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
    if (expError) console.error('Error fetching expenses:', expError)
    setExpenses((expData as ExpenseEntry[]) || [])

    // Fetch payments
    const { data: payData, error: payError } = await supabase
      .from('project_payments')
      .select('*')
      .eq('project_id', project.id)
      .order('date', { ascending: false })
    if (payError) console.error('Error fetching payments:', payError)
    setPayments((payData as any[]) || [])

    // Fetch adjustments (admin only)
    if (role === 'admin') {
      const { data: adjData, error: adjError } = await supabase
        .from('quotation_adjustments')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
      if (adjError) console.error('Error fetching adjustments:', adjError)
      setAdjustments((adjData as any[]) || [])
    }

    // If admin, fetch profit data (using adjusted value)
    if (role === 'admin') {
      const { data: profit, error: profitError } = await supabase
        .rpc('get_project_profit_view')
      if (profitError) {
        console.error('Error fetching profit data:', profitError)
      } else if (profit) {
        const p = (profit as ProjectProfitView[]).find((p: ProjectProfitView) => p.project_id === project.id)
        setProfitData(p || null)
      }
    }
  }

  // Calculate totals (only approved payments count)
  function getTotalReceived(paymentsList: any[]): number {
    return paymentsList
      .filter(p => p.status === 'approved')
      .reduce((sum, p) => sum + Number(p.amount), 0)
  }

  function getEffectiveQuotationValue(project: Project): number {
    return Number(project.adjusted_quotation_value || project.baseline_quotation_value)
  }

  function getOutstandingBalance(project: Project, paymentsList: any[]): number {
    return getEffectiveQuotationValue(project) - getTotalReceived(paymentsList)
  }

  // Upload receipt
  async function uploadReceipt(paymentId: string): Promise<string | null> {
    if (!paymentReceipt) return null
    const fileExt = paymentReceipt.name.split('.').pop()
    const filePath = `payments/${paymentId}/${Date.now()}.${fileExt}`
    const { error: uploadError } = await supabase.storage
      .from('bills') // Reuse bills bucket
      .upload(filePath, paymentReceipt)
    if (uploadError) {
      console.error('Receipt upload error:', uploadError)
      addToast('Failed to upload receipt', 'error')
      return null
    }
    return filePath
  }

  async function handleAddPayment() {
    if (!selectedProject || !user) return
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount')
      return
    }
    setPaymentSubmitting(true)

    const { data: newPayment, error } = await supabase.from('project_payments').insert({
      project_id: selectedProject.id,
      date: paymentDate,
      amount,
      payment_mode: paymentMode,
      notes: paymentNotes || null,
      created_by: user.id
    }).select('id').single()

    if (error) {
      alert('Error: ' + error.message)
      addToast('Failed to add payment', 'error')
      setPaymentSubmitting(false)
      return
    }

    // Upload receipt if provided
    if (paymentReceipt && newPayment) {
      const receiptUrl = await uploadReceipt(newPayment.id)
      if (receiptUrl) {
        const { error: updateError } = await supabase.from('project_payments').update({ receipt_url: receiptUrl }).eq('id', newPayment.id)
        if (updateError) {
          console.error('Error updating payment with receipt:', updateError)
        }
      }
    }

    setPaymentSubmitting(false)
    setShowAddPayment(false)
    setPaymentDate(new Date().toISOString().split('T')[0])
    setPaymentAmount('')
    setPaymentMode('cash')
    setPaymentReceipt(null)
    setPaymentNotes('')
    setReceiptPreview(null)
    viewProjectDetail(selectedProject) // Refresh
    addToast('Payment added successfully!', 'success')
  }

  async function handleApplyAdjustment() {
    if (!selectedProject || !user) return
    const newValue = parseFloat(adjustNewValue)
    if (isNaN(newValue) || newValue <= 0) {
      alert('Please enter a valid positive amount')
      return
    }
    if (newValue >= getEffectiveQuotationValue(selectedProject)) {
      alert('New value must be LESS than the current value to apply a discount. Use a lower amount.')
      return
    }
    setAdjustSubmitting(true)

    const oldValue = getEffectiveQuotationValue(selectedProject)

    // Insert adjustment record
    const { error: adjError } = await supabase.from('quotation_adjustments').insert({
      project_id: selectedProject.id,
      old_value: oldValue,
      new_value: newValue,
      reason: adjustReason || null,
      created_by: user.id
    })

    if (adjError) {
      alert('Error: ' + adjError.message)
      setAdjustSubmitting(false)
      return
    }

    // Update project's adjusted_quotation_value
    const { error: updateError } = await supabase
      .from('projects')
      .update({ adjusted_quotation_value: newValue })
      .eq('id', selectedProject.id)

    if (updateError) {
      alert('Error updating value: ' + updateError.message)
      setAdjustSubmitting(false)
      return
    }

    // Refresh
    setAdjustSubmitting(false)
    setShowAdjustModal(false)
    setAdjustNewValue('')
    setAdjustReason('')

    // Re-fetch the project data
    const { data: refreshed } = await supabase
      .from('projects')
      .select('*, quotations(option_label, created_by), contacts!projects_contact_id_fkey(name, phone, site_location)')
      .eq('id', selectedProject.id)
      .single()
    if (refreshed) {
      setSelectedProject(refreshed as Project)
    }
    viewProjectDetail(selectedProject)
    fetchProjects()
  }

  async function handleCloseProject(projectId: string) {
    if (!user || !selectedProject) return
    const project = selectedProject

    // Check outstanding balance
    const outstanding = getOutstandingBalance(project, payments)
    if (outstanding > 0) {
      const msg = `This project still has ₹${outstanding.toLocaleString()} outstanding.\n\nAre you sure you want to close it?`
      if (!confirm(msg)) return
    }

    // Close the project
    const { error } = await supabase.from('projects').update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: user.id
    }).eq('id', projectId)

    if (error) {
      alert('Error closing project: ' + error.message)
      addToast('Failed to close project', 'error')
      return
    }

    fetchProjects()
    if (selectedProject?.id === projectId) {
      setSelectedProject({ ...selectedProject, status: 'closed' } as Project)
    }
    addToast('Project closed successfully', 'success')
  }

  async function handleReopenProject(projectId: string) {
    if (!confirm('Reopen this project? It will become active again and allow expense tracking.')) return
    if (!user) return
    
    const { error } = await supabase.from('projects').update({
      status: 'in_progress',
      closed_at: null,
      closed_by: null
    }).eq('id', projectId)
    
    if (error) {
      alert('Error reopening project: ' + error.message)
      addToast('Failed to reopen project', 'error')
      return
    }
    
    fetchProjects()
    if (selectedProject?.id === projectId) {
      setSelectedProject({ ...selectedProject, status: 'in_progress', closed_at: null, closed_by: null } as Project)
    }
    addToast('Project reopened successfully!', 'success')
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
      fetchProjects()
      if (selectedProject?.id === projectId) {
        setSelectedProject({ ...selectedProject, target_margin_percent: value } as Project)
      }
    }
  }

  // Get public URL for receipt
  function getReceiptUrl(receiptUrl: string | null): string | null {
    if (!receiptUrl) return null
    const { data } = supabase.storage.from('bills').getPublicUrl(receiptUrl)
    return data?.publicUrl || null
  }

  // Get public URL for bill
  function getBillUrl(billUrl: string | null): string | null {
    if (!billUrl) return null
    const { data } = supabase.storage.from('bills').getPublicUrl(billUrl)
    return data?.publicUrl || null
  }

  const statusBadge = (status: string) => {
    if (status === 'closed') return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-200 text-gray-600">Closed</span>
    if (status === 'in_progress') return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">In Progress</span>
    return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">{status}</span>
  }

  const marginStatusBadge = (status: string) => {
    if (status === 'above_target') return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">✅ Above Target</span>
    if (status === 'on_target') return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">🎯 On Target</span>
    if (status === 'below_target') return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">⚠ Below Target</span>
    if (status === 'loss') return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800">🔴 Loss</span>
    return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">No Data</span>
  }

  const paymentModeBadge = (mode: string) => {
    const colors: Record<string, string> = { cash: 'bg-green-100 text-green-800', upi: 'bg-blue-100 text-blue-800', bank_transfer: 'bg-purple-100 text-purple-800' }
    return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${colors[mode] || 'bg-gray-100 text-gray-600'}`}>{mode.replace('_', ' ')}</span>
  }

  const getStatusBadge = (status: string) => {
    if (status === 'pending') return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">⏳ Pending</span>
    if (status === 'approved') return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">✅ Approved</span>
    if (status === 'rejected') return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800">❌ Rejected</span>
    return null
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Projects</h2>

      <div className="mb-4 space-y-2">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client name or project..."
          className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
        <div className="flex gap-2">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500">
            <option value="all">All Projects</option>
            <option value="in_progress">In Progress</option>
            <option value="closed">Closed</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500">
            <option value="created_at">Sort by Date</option>
            <option value="baseline_quotation_value">Sort by Value</option>
          </select>
        </div>
      </div>

      {role === 'admin' && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm text-gray-500">Total Projects</div>
            <div className="text-2xl font-bold text-gray-900">{projects.length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm text-gray-500">Active</div>
            <div className="text-2xl font-bold text-gray-900">{projects.filter(p => p.status === 'in_progress').length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm text-gray-500">Total Quoted Value</div>
            <div className="text-2xl font-bold text-gray-900">₹{projects.reduce((sum, p) => sum + Number(p.baseline_quotation_value), 0).toLocaleString()}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm text-gray-500">Total Cost</div>
            <div className="text-2xl font-bold text-gray-900">₹{projects.reduce((sum, p) => sum + Number(p.actual_cost_total), 0).toLocaleString()}</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <SkeletonList />
        ) : projects.length === 0 ? (
          <EmptyState
            icon="📁"
            title="No projects yet"
            description="Projects are created automatically when you lock a confirmed quotation"
          />
        ) : (
          <div className="divide-y divide-gray-200">
            {projects.map((project: Project) => (
              <div key={project.id} className="p-4 hover:bg-gray-50 cursor-pointer" onClick={() => viewProjectDetail(project)}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{project.contacts?.name || 'Unknown'}</span>
                      {statusBadge(project.status)}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">{project.contacts?.phone} — {project.contacts?.site_location}</div>
                    <div className="mt-1 text-xs text-gray-400">
                      Quotation: {project.quotations?.option_label} | Value: ₹{Number(project.baseline_quotation_value).toLocaleString()} | Cost: ₹{Number(project.actual_cost_total).toLocaleString()}
                    </div>
                  </div>
                  {role === 'admin' && project.status !== 'closed' && (
                    <button onClick={(e) => { e.stopPropagation(); handleCloseProject(project.id) }}
                      className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200">Close</button>
                  )}
                  {role === 'admin' && project.status === 'closed' && (
                    <button onClick={(e) => { e.stopPropagation(); handleReopenProject(project.id) }}
                      className="px-3 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full hover:bg-green-200">Reopen</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Project Detail Modal */}
      <Modal isOpen={showDetail} onClose={() => { setShowDetail(false); setSelectedProject(null) }} size="2xl">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold">{selectedProject?.contacts?.name}</h3>
            <p className="text-sm text-gray-500">{selectedProject?.contacts?.phone} — {selectedProject?.contacts?.site_location}</p>
            <p className="text-xs text-gray-400">Quotation: {selectedProject?.quotations?.option_label}</p>
          </div>
          <button onClick={() => { setShowDetail(false); setSelectedProject(null) }}
            className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {selectedProject && (
          <>
            <div className="mb-4 flex items-center gap-2">
              {statusBadge(selectedProject.status)}
              {selectedProject.status === 'closed' && (
                <span className="text-xs text-gray-500">Closed: {selectedProject.closed_at ? new Date(selectedProject.closed_at).toLocaleDateString() : 'N/A'}</span>
              )}
            </div>

            {/* Financial Summary */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Financial Summary</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-500">Quotation Value</div>
                  <div className="text-lg font-bold text-gray-900">₹{Number(selectedProject.baseline_quotation_value).toLocaleString()}</div>
                  {(selectedProject.adjusted_quotation_value && Number(selectedProject.adjusted_quotation_value) !== Number(selectedProject.baseline_quotation_value)) && (
                    <div className="text-xs text-gray-500">Adjusted to: <span className="font-semibold text-gray-700">₹{Number(selectedProject.adjusted_quotation_value).toLocaleString()}</span></div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-gray-500">Actual Cost</div>
                  <div className="text-lg font-bold text-gray-900">₹{Number(selectedProject.actual_cost_total).toLocaleString()}</div>
                </div>
              </div>

              {/* Outstanding Balance — visible to ALL */}
              {(() => {
                const totalReceived = getTotalReceived(payments)
                const effectiveValue = getEffectiveQuotationValue(selectedProject)
                const outstanding = effectiveValue - totalReceived
                return (
                  <div className={`mt-3 pt-3 border-t border-gray-200 ${outstanding <= 0 ? 'bg-green-50 dark:bg-green-950 -mx-4 px-4 py-3 rounded-b-lg' : 'bg-amber-50 dark:bg-amber-950 -mx-4 px-4 py-3 rounded-b-lg'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Total Received</span>
                      <span className="text-sm font-bold text-gray-900">₹{totalReceived.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-medium text-gray-700">Outstanding Balance</span>
                      {outstanding > 0 ? (
                        <span className="text-base font-bold text-red-600">₹{outstanding.toLocaleString()}</span>
                      ) : outstanding < 0 ? (
                        <span className="text-base font-bold text-green-600">Overpaid by ₹{Math.abs(outstanding).toLocaleString()} ✅</span>
                      ) : (
                        <span className="text-base font-bold text-green-600">Fully Paid ✅</span>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Profit/Margin Section - Admin Only */}
              {role === 'admin' && profitData && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-500">Profit Amount</div>
                      <div className={`text-lg font-bold ${Number(profitData.profit_amount) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        ₹{Number(profitData.profit_amount).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Margin</div>
                      <div className="text-lg font-bold text-gray-900">{profitData.margin_percent}%</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      {marginStatusBadge(profitData.margin_status)}
                      <span className="ml-2 text-xs text-gray-400">Target: {profitData.target_margin}%</span>
                    </div>
                    <button onClick={() => handleUpdateProjectMargin(selectedProject.id, selectedProject.target_margin_percent)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium">Change Target</button>
                  </div>
                </div>
              )}

              {role === 'rep' && (
                <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-400">
                  Quotation value and payment tracking shown above. Cost tracking available in Expenses.
                </div>
              )}
            </div>

            {/* Payments Section */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-medium text-gray-700">
                  Client Payments (
                    {(() => {
                      const approved = payments.filter(p => p.status === 'approved').length
                      const rejected = payments.filter(p => p.status === 'rejected').length
                      const pending = payments.filter(p => p.status === 'pending').length
                      const parts: string[] = []
                      if (approved > 0) parts.push(`${approved} Approved`)
                      if (rejected > 0) parts.push(`${rejected} Rejected`)
                      if (pending > 0) parts.push(`${pending} Pending`)
                      return parts.join(', ') || '0'
                    })()}
                  )
                </h4>
                <button onClick={() => setShowAddPayment(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add Payment</button>
              </div>
              {payments.length === 0 ? (
                <p className="text-sm text-gray-400">No client payments recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {payments.map((p: any) => {
                    const receiptPublicUrl = getReceiptUrl(p.receipt_url)
                    return (
                      <div key={p.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">₹{Number(p.amount).toLocaleString()}</span>
                            {paymentModeBadge(p.payment_mode)}
                            {getStatusBadge(p.status)}
                          </div>
                          <div className="text-xs text-gray-500">{new Date(p.date).toLocaleDateString()}{p.notes ? ` — ${p.notes}` : ''}</div>
                          {p.status === 'rejected' && p.rejection_reason && (
                            <div className="text-xs text-red-600 mt-0.5">Reason: {p.rejection_reason}</div>
                          )}
                          {receiptPublicUrl && (
                            <a href={receiptPublicUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-800 underline mt-0.5 inline-block">View Receipt</a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {role === 'admin' && adjustments.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Adjustment History ({adjustments.length})</h4>
                <div className="space-y-2">
                  {adjustments.map((adj: any) => (
                    <div key={adj.id} className="bg-gray-50 p-3 rounded-md">
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          <span className="text-gray-500">₹{Number(adj.old_value).toLocaleString()}</span>
                          <span className="mx-1 text-gray-400">→</span>
                          <span className="font-medium text-gray-900">₹{Number(adj.new_value).toLocaleString()}</span>
                          <span className="ml-2 text-xs text-red-600">(-₹{(Number(adj.old_value) - Number(adj.new_value)).toLocaleString()})</span>
                        </div>
                        <div className="text-xs text-gray-400">{new Date(adj.created_at).toLocaleDateString()}</div>
                      </div>
                      {adj.reason && <div className="text-xs text-gray-500 mt-1">Reason: {adj.reason}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              {expenses.some(e => e.status === 'approved') && (() => {
                const groups: Record<string, { total: number; count: number }> = {}
                let grandTotal = 0
                // Only approved expenses count toward cost
                expenses.filter(e => e.status === 'approved').forEach((e: any) => {
                  const cat = e.category || 'other'
                  if (!groups[cat]) groups[cat] = { total: 0, count: 0 }
                  groups[cat].total += Number(e.amount) || 0
                  groups[cat].count += 1
                  grandTotal += Number(e.amount) || 0
                })
                return (
                  <div className="bg-gray-50 p-4 rounded-lg mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Expense Breakdown by Category</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(groups).map(([cat, data]) => (
                        <div key={cat} className="text-center">
                          <div className="text-base font-bold text-gray-900">₹{data.total.toLocaleString()}</div>
                          <div className="text-xs text-gray-500 capitalize">{cat}</div>
                          <div className="text-xs text-gray-400">
                            {grandTotal > 0 ? ((data.total / grandTotal) * 100).toFixed(1) : '0'}% ({data.count})
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Expense Entries (
                  {(() => {
                    const approved = expenses.filter(e => e.status === 'approved').length
                    const rejected = expenses.filter(e => e.status === 'rejected').length
                    const pending = expenses.filter(e => e.status === 'pending').length
                    const parts: string[] = []
                    if (approved > 0) parts.push(`${approved} Approved`)
                    if (rejected > 0) parts.push(`${rejected} Rejected`)
                    if (pending > 0) parts.push(`${pending} Pending`)
                    return parts.join(', ') || '0'
                  })()}
                )
              </h4>
              {expenses.length === 0 ? (
                <p className="text-sm text-gray-400">No expense entries yet.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {expenses.map((exp: ExpenseEntry) => {
                    const billUrls = exp.bill_urls && Array.isArray(exp.bill_urls) && exp.bill_urls.length > 0 ? exp.bill_urls : (exp.bill_url ? [exp.bill_url] : [])
                    return (
                      <div key={exp.id}
                        className="flex items-center justify-between bg-gray-50 p-3 rounded-md cursor-pointer hover:bg-gray-100"
                        onClick={() => { setSelectedExpense(exp); setShowExpenseDetail(true) }}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-900">{exp.item_name}</span>
                            {getStatusBadge(exp.status)}
                          </div>
                          <div className="text-xs text-gray-500">{exp.category} — {new Date(exp.date).toLocaleDateString()}</div>
                          {exp.status === 'rejected' && exp.rejection_reason && (
                            <div className="text-xs text-red-600 mt-0.5">Reason: {exp.rejection_reason}</div>
                          )}
                          {exp.bill_no && <div className="text-xs text-gray-400">Bill No: {exp.bill_no}</div>}
                          {billUrls.length > 0 && <div className="text-xs text-blue-500">📎 {billUrls.length > 1 ? `${billUrls.length} bills` : 'Bill'} attached</div>}
                        </div>
                        <div className="text-sm font-medium text-gray-900">₹{Number(exp.amount).toLocaleString()}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {role === 'admin' && (
              <div className="space-y-2">
                {selectedProject.status !== 'closed' && (
                  <button onClick={() => { setAdjustNewValue(String(getEffectiveQuotationValue(selectedProject))); setShowAdjustModal(true) }}
                    className="w-full px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300 rounded-md hover:bg-blue-100">
                    📝 Adjust Quotation Value
                  </button>
                )}
                {selectedProject.status !== 'closed' ? (
                  <button onClick={() => handleCloseProject(selectedProject.id)}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-md hover:bg-gray-700">
                    Close Project
                  </button>
                ) : (
                  <button onClick={() => handleReopenProject(selectedProject.id)}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700">
                    Reopen Project
                  </button>
                )}
              </div>
            )}
            {role === 'rep' && selectedProject.status !== 'closed' && (
              <div className="mt-4 pt-4 border-t">
                <button onClick={() => { setShowAddPayment(true) }}
                  className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
                  + Add Payment
                </button>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Add Payment Modal */}
      <Modal isOpen={showAddPayment} onClose={() => { setShowAddPayment(false); setPaymentReceipt(null); setReceiptPreview(null) }}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">Add Payment</h3>
          <button onClick={() => { setShowAddPayment(false); setPaymentReceipt(null); setReceiptPreview(null) }} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Date *</label>
            <input type="date" required value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Amount (₹) *</label>
            <input type="number" required min="0.01" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Payment Mode</label>
            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Receipt/Proof (optional)</label>
            <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                setPaymentReceipt(file)
                const reader = new FileReader()
                reader.onload = (ev) => setReceiptPreview(ev.target?.result as string)
                reader.readAsDataURL(file)
              }
            }}
              className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 dark:file:bg-blue-950 file:text-blue-700 hover:file:bg-blue-100" />
            {receiptPreview && (
              <div className="mt-2">
                {paymentReceipt?.type.startsWith('image/') ? (
                  <img src={receiptPreview} alt="Receipt preview" className="h-20 w-auto rounded border object-cover" />
                ) : (
                  <div className="h-20 w-20 rounded border bg-gray-100 flex items-center justify-center text-xs text-gray-500">PDF</div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Notes (optional)</label>
            <input type="text" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)}
              placeholder="e.g., Advance payment"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => { setShowAddPayment(false); setPaymentReceipt(null); setReceiptPreview(null) }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
          <button onClick={handleAddPayment} disabled={paymentSubmitting || !paymentAmount}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
            {paymentSubmitting ? 'Saving...' : 'Add Client Payment'}
          </button>
        </div>
      </Modal>

      {/* Adjust Quotation Value Modal */}
      <Modal isOpen={showAdjustModal} onClose={() => { setShowAdjustModal(false); }}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">Adjust Quotation Value (Discount)</h3>
          <button onClick={() => setShowAdjustModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="space-y-3">
          <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md text-sm text-blue-800 dark:text-blue-300">
            Current value: <strong>₹{selectedProject ? getEffectiveQuotationValue(selectedProject).toLocaleString() : ''}</strong><br />
            Enter a new value below to apply a discount.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">New Quotation Value (₹) *</label>
            <input type="number" required min="1" step="0.01" value={adjustNewValue} onChange={e => setAdjustNewValue(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Reason (optional)</label>
            <input type="text" value={adjustReason} onChange={e => setAdjustReason(e.target.value)}
              placeholder="e.g., 10% discount for referral"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setShowAdjustModal(false)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
          <button onClick={handleApplyAdjustment} disabled={adjustSubmitting || !adjustNewValue}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
            {adjustSubmitting ? 'Applying...' : 'Apply Discount'}
          </button>
        </div>
      </Modal>

      {/* Expense Detail Modal */}
      <Modal isOpen={showExpenseDetail} onClose={() => { setShowExpenseDetail(false); setSelectedExpense(null) }}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">Expense Details</h3>
          <button onClick={() => { setShowExpenseDetail(false); setSelectedExpense(null) }}
            className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        {selectedExpense && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500">Status</label>
              <div className="mt-0.5">{getStatusBadge(selectedExpense.status)}</div>
              {selectedExpense.status === 'rejected' && selectedExpense.rejection_reason && (
                <p className="mt-1 text-xs text-red-600">Reason: {selectedExpense.rejection_reason}</p>
              )}
            </div>
            <div><label className="block text-xs font-medium text-gray-500">Bill No</label><p className="text-sm text-gray-900">{selectedExpense.bill_no || '—'}</p></div>
            <div><label className="block text-xs font-medium text-gray-500">Item Name</label><p className="text-sm text-gray-900">{selectedExpense.item_name}</p></div>
            <div><label className="block text-xs font-medium text-gray-500">Amount</label><p className="text-sm font-bold text-gray-900">₹{Number(selectedExpense.amount).toLocaleString()}</p></div>
            <div><label className="block text-xs font-medium text-gray-500">Date</label><p className="text-sm text-gray-900">{new Date(selectedExpense.date).toLocaleDateString()}</p></div>
            <div><label className="block text-xs font-medium text-gray-500">Category</label><p className="text-sm text-gray-900">{selectedExpense.category}</p></div>
            <div><label className="block text-xs font-medium text-gray-500">Added by</label><p className="text-sm text-gray-900">{selectedExpense.created_by === user?.id ? 'You' : 'Admin'}</p></div>
            {(() => {
              const billUrls = selectedExpense.bill_urls && Array.isArray(selectedExpense.bill_urls) && selectedExpense.bill_urls.length > 0 ? selectedExpense.bill_urls : (selectedExpense.bill_url ? [selectedExpense.bill_url] : [])
              if (billUrls.length === 0) return null
              return (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Uploaded Bills ({billUrls.length})</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {billUrls.map((url: string, i: number) => {
                      const publicUrl = getBillUrl(url)
                      if (!publicUrl) return <p key={i} className="text-sm text-gray-400">Bill unavailable</p>
                      const isPdf = url.toLowerCase().endsWith('.pdf')
                      return (
                        <div key={i}>
                          {isPdf ? (
                            <div>
                              <iframe src={publicUrl} className="w-full h-24 rounded border" title={`Bill ${i + 1}`} />
                              <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline">Open PDF</a>
                            </div>
                          ) : (
                            <img src={publicUrl} alt={`Bill ${i + 1}`} className="w-full h-24 object-cover rounded border cursor-pointer" onClick={() => window.open(publicUrl, '_blank')}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                                const parent = (e.target as HTMLImageElement).parentElement
                                if (parent) {
                                  const msg = document.createElement('p')
                                  msg.className = 'text-sm text-amber-600 p-2'
                                  msg.textContent = 'File unavailable'
                                  parent.appendChild(msg)
                                }
                              }}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </Modal>
    </div>
  )
}