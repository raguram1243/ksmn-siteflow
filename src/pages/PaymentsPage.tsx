import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../contexts/ToastContext'
import { useDebounce } from '../hooks/useDebounce'
import { SkeletonList } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import Spinner from '../components/Spinner'
import PromptModal from '../components/PromptModal'

export default function PaymentsPage() {
  const { user, role } = useAuth()
  const { addToast, addUndoToast } = useToast()
  const [payments, setPayments] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<any>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [generatingReceipt, setGeneratingReceipt] = useState(false)
  const [selectedOverdue, setSelectedOverdue] = useState<any>(null)
  const [showOverdueDetail, setShowOverdueDetail] = useState(false)
  const [rejectingPaymentId, setRejectingPaymentId] = useState<string | null>(null)

  // Add payment form
  const [formProject, setFormProject] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [paymentReceipt, setPaymentReceipt] = useState<File | null>(null)
  const [paymentNotes, setPaymentNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)

  // Admin-only stats
  const [paymentMonthly, setPaymentMonthly] = useState({ this_month_collected: 0, all_time_collected: 0, this_month_count: 0, all_time_count: 0 })
  const [paymentModeBreakdown, setPaymentModeBreakdown] = useState<any[]>([])
  const [overduePayments, setOverduePayments] = useState<any[]>([])
  const [collectionSummary, setCollectionSummary] = useState({ total_collected: 0, total_outstanding: 0, total_quotation_value: 0, project_count: 0 })

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useDebounce(search, 300)

  useEffect(() => {
    fetchPayments()
    if (role === 'admin') {
      fetchAdminStats()
    }
  }, [debouncedSearch, filterProject, role])

  // Listen for refresh events
  useEffect(() => {
    function handleRefresh() {
      fetchPayments()
      if (role === 'admin') {
        fetchAdminStats()
      }
    }

    window.addEventListener('app-refresh', handleRefresh)
    return () => window.removeEventListener('app-refresh', handleRefresh)
  }, [role])

  async function fetchAdminStats() {
    const [monthlyRes, modeRes, overdueRes, collectionRes] = await Promise.all([
      supabase.rpc('get_payment_monthly_comparison'),
      supabase.rpc('get_payment_mode_breakdown'),
      supabase.rpc('get_overdue_collections'),
      supabase.rpc('get_admin_collection_summary')
    ])

    const monthlyData = monthlyRes.data as any
    if (monthlyData && monthlyData.length > 0) setPaymentMonthly(monthlyData[0])

    setPaymentModeBreakdown((modeRes.data as any) || [])
    setOverduePayments((overdueRes.data as any) || [])

    const collectionData = collectionRes.data as any
    if (collectionData && collectionData.length > 0) setCollectionSummary(collectionData[0])
  }

  async function fetchPayments() {
    setLoading(true)
    const [payRes, projRes] = await Promise.all([
      supabase
        .from('project_payments')
        .select('*, projects!inner(quotation_id, quotations(option_label), contacts!projects_contact_id_fkey(name))')
        .order('date', { ascending: false }),
      supabase
        .from('projects')
        .select('id, status, quotations(option_label), contacts!projects_contact_id_fkey(name)')
        .neq('status', 'closed')
    ])

    let payments = (payRes.data as any[]) || []

    if (filterProject !== 'all') {
      payments = payments.filter(p => p.project_id === filterProject)
    }
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase()
      payments = payments.filter(p =>
        (p.projects?.contacts?.name || '').toLowerCase().includes(s) ||
        (p.notes || '').toLowerCase().includes(s) ||
        (p.payment_mode || '').toLowerCase().includes(s)
      )
    }

    setPayments(payments)
    setProjects((projRes.data as any[]) || [])
    setLoading(false)
  }

  async function handleApprovePayment(paymentId: string) {
    const { error } = await supabase
      .from('project_payments')
      .update({ status: 'approved' })
      .eq('id', paymentId)

    if (error) {
      addToast('Failed to approve payment', 'error')
    } else {
      addToast('Payment approved successfully', 'success')
      fetchPayments()
    }
  }

  async function handleRejectPayment(paymentId: string, reason: string) {
    const { error } = await supabase
      .from('project_payments')
      .update({ status: 'rejected', rejection_reason: reason })
      .eq('id', paymentId)

    if (error) {
      addToast('Failed to reject payment', 'error')
    } else {
      addToast('Payment rejected', 'success')
      fetchPayments()
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'pending':
        return <StatusBadge tone="yellow">Pending</StatusBadge>
      case 'approved':
        return <StatusBadge tone="green">Approved</StatusBadge>
      case 'rejected':
        return <StatusBadge tone="red">Rejected</StatusBadge>
      default:
        return null
    }
  }

  function getReceiptUrl(receiptUrl: string | null): string | null {
    if (!receiptUrl) return null
    const { data } = supabase.storage.from('bills').getPublicUrl(receiptUrl)
    return data?.publicUrl || null
  }

  async function generateReceipt(paymentId: string) {
    setGeneratingReceipt(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate-receipt', {
        body: { payment_id: paymentId }
      })

      if (error) {
        console.error('Error generating receipt:', error)
        // Extract specific error message from the response
        const errorMessage = error.message || error || 'Failed to generate receipt'
        addToast(errorMessage, 'error')
        return
      }

      if (data?.success) {
        addToast('Receipt generated successfully!', 'success')
        fetchPayments() // Refresh to show receipt
      } else if (data?.error) {
        console.error('Error generating receipt:', data.error)
        addToast(data.error, 'error')
      } else {
        addToast('Failed to generate receipt', 'error')
      }
    } catch (err) {
      console.error('Error generating receipt:', err)
      addToast('An unexpected error occurred while generating receipt', 'error')
    } finally {
      setGeneratingReceipt(false)
    }
  }

  function viewReceipt(receiptUrl: string) {
    setReceiptUrl(receiptUrl)
    setShowReceipt(true)
  }

  function downloadReceipt(receiptUrl: string, receiptNumber: string) {
    const link = document.createElement('a')
    link.href = receiptUrl
    link.download = `Receipt-${receiptNumber}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  function shareViaWhatsApp(payment: any) {
    const receiptNumber = payment.receipt_number || 'N/A'
    const amount = Number(payment.amount).toLocaleString()
    const clientName = payment.projects?.contacts?.name || 'Client'
    const date = new Date(payment.date).toLocaleDateString('en-IN')
    
    const message = `Payment Receipt Confirmation\n\n` +
      `Receipt No: ${receiptNumber}\n` +
      `Date: ${date}\n` +
      `Received From: ${clientName}\n` +
      `Amount: ₹${amount}\n` +
      `Payment Mode: ${payment.payment_mode?.replace('_', ' ').toUpperCase()}\n\n` +
      `Thank you for your payment!`
    
    const encodedMessage = encodeURIComponent(message)
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank')
  }

  function shareViaEmail(payment: any) {
    const receiptNumber = payment.receipt_number || 'N/A'
    const amount = Number(payment.amount).toLocaleString()
    const clientName = payment.projects?.contacts?.name || 'Client'
    const date = new Date(payment.date).toLocaleDateString('en-IN')
    
    const subject = `Payment Receipt - ${receiptNumber}`
    const body = `Dear ${clientName},\n\n` +
      `Thank you for your payment.\n\n` +
      `Receipt Details:\n` +
      `Receipt No: ${receiptNumber}\n` +
      `Date: ${date}\n` +
      `Amount: ₹${amount}\n` +
      `Payment Mode: ${payment.payment_mode?.replace('_', ' ').toUpperCase()}\n\n` +
      `Please find your receipt attached.\n\n` +
      `Best regards,\n` +
      `KSMN Services`
    
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mailtoLink
  }

  async function uploadReceipt(paymentId: string): Promise<string | null> {
    if (!paymentReceipt) return null
    const fileExt = paymentReceipt.name.split('.').pop()
    const filePath = `payments/${paymentId}/${Date.now()}.${fileExt}`
    const { error: uploadError } = await supabase.storage
      .from('bills')
      .upload(filePath, paymentReceipt)
    if (uploadError) {
      console.error('Receipt upload error:', uploadError)
      return null
    }
    return filePath
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!formProject || !user) return
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      addToast('Please enter a valid amount', 'warning')
      return
    }
    setSubmitting(true)

    const { data: newPayment, error } = await supabase.from('project_payments').insert({
      project_id: formProject,
      date: paymentDate,
      amount,
      payment_mode: paymentMode,
      notes: paymentNotes || null,
      created_by: user.id
    }).select('id').single()

    if (error) {
      addToast('Error: ' + error.message, 'error')
      addToast('Failed to add payment', 'error')
      setSubmitting(false)
      return
    }

    // Upload receipt if provided
    if (paymentReceipt && newPayment) {
      const receiptUrl = await uploadReceipt(newPayment.id)
      if (receiptUrl) {
        await supabase.from('project_payments').update({ receipt_url: receiptUrl }).eq('id', newPayment.id)
      }
    }

    setSubmitting(false)
    setShowAdd(false)
    resetForm()
    fetchPayments()
    addToast('Payment added successfully!', 'success')
  }

  function resetForm() {
    setFormProject('')
    setPaymentDate(new Date().toISOString().split('T')[0])
    setPaymentAmount('')
    setPaymentMode('cash')
    setPaymentReceipt(null)
    setPaymentNotes('')
    setReceiptPreview(null)
  }

  async function handleDelete(id: string, projectId: string, receiptUrl: string | null, paymentData?: any) {
    if (deletingId) return
    if (!confirm('Delete this payment entry? This action cannot be undone.')) return

    // Store data for potential undo
    const deletedPayment = paymentData || { id, project_id: projectId, receipt_url: receiptUrl }

    setDeletingId(id)
    try {
      if (receiptUrl) {
        await supabase.storage.from('bills').remove([receiptUrl])
      }

      const { error } = await supabase.from('project_payments').delete().eq('id', id)
      if (error) {
        addToast('Error deleting payment: ' + error.message, 'error')
        addToast('Failed to delete payment', 'error')
        return
      }

      await fetchPayments()
    } finally {
      setDeletingId(null)
    }
    
    // Show undo toast
    addUndoToast(
      'Payment deleted successfully',
      async () => {
        // Restore the payment entry
        const { error: restoreError } = await supabase.from('project_payments').insert({
          id: deletedPayment.id,
          project_id: deletedPayment.project_id,
          date: deletedPayment.date,
          amount: deletedPayment.amount,
          payment_mode: deletedPayment.payment_mode,
          notes: deletedPayment.notes,
          created_by: deletedPayment.created_by,
          receipt_url: deletedPayment.receipt_url,
          status: deletedPayment.status || 'pending'
        })
        
        if (restoreError) {
          console.error('Error restoring payment:', restoreError)
          addToast('Failed to restore payment', 'error')
          return
        }
        
        fetchPayments()
        addToast('Payment restored successfully', 'success')
      }
    )
  }

  function openPaymentDetail(payment: any) {
    setSelectedPayment(payment)
    setShowDetail(true)
  }

  const paymentModeBadge = (mode: string) => {
    const colors: Record<string, string> = { cash: 'bg-green-100 text-green-800', upi: 'bg-blue-100 text-blue-800', bank_transfer: 'bg-purple-100 text-purple-800' }
    return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${colors[mode] || 'bg-gray-100 text-gray-600'}`}>{mode.replace('_', ' ')}</span>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Client Payments (Collection)</h2>
        <button onClick={() => setShowAdd(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">+ Add Client Payment</button>
      </div>

      {/* Admin-only stats */}
      {role === 'admin' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm text-gray-500">This Month Collected</div>
            <div className="text-xl font-bold text-green-600">₹{Number(paymentMonthly.this_month_collected).toLocaleString()}</div>
            <div className="text-xs text-gray-400">{paymentMonthly.this_month_count} client payments</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm text-gray-500">All-Time Collected</div>
            <div className="text-xl font-bold text-green-600">₹{Number(paymentMonthly.all_time_collected).toLocaleString()}</div>
            <div className="text-xs text-gray-400">{paymentMonthly.all_time_count} client payments</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm text-gray-500">Total Outstanding</div>
            <div className="text-xl font-bold text-red-600">₹{Number(collectionSummary.total_outstanding).toLocaleString()}</div>
            <div className="text-xs text-gray-400">{collectionSummary.project_count} projects</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm text-gray-500">Total Collected (All)</div>
            <div className="text-xl font-bold text-green-600">₹{Number(collectionSummary.total_collected).toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Pending Payments - Admin Only */}
      {role === 'admin' && payments.filter(p => p.status === 'pending').length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-yellow-900 mb-3">
            ⚠️ Pending Client Payment Approvals ({payments.filter(p => p.status === 'pending').length})
          </h3>
          <div className="space-y-2">
            {payments.filter(p => p.status === 'pending').map((payment: any) => (
              <div key={payment.id} className="bg-white p-3 rounded-md border border-yellow-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {payment.projects?.contacts?.name || 'Unknown Project'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      ₹{Number(payment.amount).toLocaleString()} • {payment.date} • {payment.payment_mode}
                    </div>
                    {payment.receipt_url && (
                      <div className="text-xs text-blue-600 mt-1">
                        📎 Receipt attached
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-2">
                    <button
                      onClick={() => handleApprovePayment(payment.id)}
                      className="px-3 py-1 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectingPaymentId(payment.id)}
                      className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin-only payment mode breakdown */}
      {role === 'admin' && paymentModeBreakdown.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow-sm border mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Breakdown by Payment Mode</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {paymentModeBreakdown.map((mode: any) => (
              <div key={mode.payment_mode} className="text-center">
                <div className="text-lg font-bold text-gray-900">₹{Number(mode.total_amount).toLocaleString()}</div>
                <div className="text-xs text-gray-500">{mode.payment_mode.replace('_', ' ')}</div>
                <div className="text-xs text-gray-400">{mode.percentage}% ({mode.payment_count})</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin-only overdue payments list */}
      {role === 'admin' && overduePayments.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow-sm border mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Overdue Client Payments ({overduePayments.length})</h3>
          <div className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
            {overduePayments.map((oc: any) => (
              <div key={oc.project_id} role="button" onClick={() => { setSelectedOverdue(oc); setShowOverdueDetail(true) }} className="py-2 flex justify-between items-center cursor-pointer hover:bg-gray-50 rounded-md px-2 -mx-2">
                <div>
                  <span className="text-sm font-medium text-gray-900">{oc.contact_name}</span>
                  <span className="ml-2 text-xs text-gray-500">{oc.site_location}</span>
                  <div className="text-xs text-gray-400">
                    Outstanding for {oc.days_outstanding} days | {oc.project_status}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-red-600">₹{Number(oc.outstanding).toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Received: ₹{Number(oc.total_received).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by project/client name, payment mode..."
          className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500">
          <option value="all">All Projects</option>
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.contacts?.name} — {p.quotations?.option_label || 'Project'}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <SkeletonList />
        ) : payments.length === 0 ? (
          <EmptyState
            icon="💳"
            title="No client payments yet"
            description="Start tracking client payments by adding your first payment entry"
            action={{ label: '+ Add Client Payment', onClick: () => setShowAdd(true) }}
          />
        ) : (
          <div className="divide-y divide-gray-200">
            {payments.map((payment: any) => {
              const receiptPublicUrl = getReceiptUrl(payment.receipt_url)
              return (
                <div key={payment.id} className="p-4 hover:bg-gray-50 cursor-pointer" onClick={() => openPaymentDetail(payment)}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{payment.projects?.contacts?.name || 'Unknown Project'}</span>
                        {paymentModeBadge(payment.payment_mode)}
                        {getStatusBadge(payment.status)}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {new Date(payment.date).toLocaleDateString()}
                        {payment.notes ? ` — ${payment.notes}` : ''}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        Added by {payment.created_by === user?.id ? 'you' : 'admin'}
                      </div>
                      {payment.status === 'rejected' && payment.rejection_reason && (
                        <div className="mt-1 text-xs text-red-600">
                          Reason: {payment.rejection_reason}
                        </div>
                      )}
                      {receiptPublicUrl && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600">📎 Receipt attached</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-900">₹{Number(payment.amount).toLocaleString()}</span>
                      {role === 'admin' && payment.status !== 'rejected' && (
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(payment.id, payment.project_id, payment.receipt_url) }}
                          disabled={deletingId !== null}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed">
                          {deletingId === payment.id ? <><Spinner className="h-3 w-3" /> Deleting…</> : 'Delete'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Payment Detail Modal */}
      <Modal isOpen={showDetail} onClose={() => { setShowDetail(false); setSelectedPayment(null) }}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">Payment Details</h3>
          <button onClick={() => { setShowDetail(false); setSelectedPayment(null) }}
            className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {selectedPayment && (
          <div className="space-y-3">
            <div><label className="block text-xs font-medium text-gray-500">Project</label><p className="text-sm text-gray-900">{selectedPayment.projects?.contacts?.name || 'Unknown'}</p></div>
            <div><label className="block text-xs font-medium text-gray-500">Amount</label><p className="text-sm font-bold text-gray-900">₹{Number(selectedPayment.amount).toLocaleString()}</p></div>
            <div><label className="block text-xs font-medium text-gray-500">Date</label><p className="text-sm text-gray-900">{new Date(selectedPayment.date).toLocaleDateString()}</p></div>
            <div><label className="block text-xs font-medium text-gray-500">Payment Mode</label><div className="mt-0.5">{paymentModeBadge(selectedPayment.payment_mode)}</div></div>
            <div><label className="block text-xs font-medium text-gray-500">Notes</label><p className="text-sm text-gray-900">{selectedPayment.notes || '—'}</p></div>
            <div><label className="block text-xs font-medium text-gray-500">Added by</label><p className="text-sm text-gray-900">{selectedPayment.created_by === user?.id ? 'You' : 'Admin'}</p></div>

            {/* Receipt Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              {selectedPayment.receipt_url && (() => {
                const receiptUrl = getReceiptUrl(selectedPayment.receipt_url)
                return (
                  <>
                    <button onClick={() => viewReceipt(receiptUrl!)}
                      className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300 rounded-md hover:bg-blue-100">
                      👁️ View Receipt
                    </button>
                    <button onClick={() => downloadReceipt(receiptUrl!, selectedPayment.receipt_number || 'N/A')}
                      className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 dark:bg-green-950 dark:text-green-300 rounded-md hover:bg-green-100">
                      ⬇️ Download
                    </button>
                    <button onClick={() => shareViaWhatsApp(selectedPayment)}
                      className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 dark:bg-green-950 dark:text-green-300 rounded-md hover:bg-green-100">
                      📱 WhatsApp
                    </button>
                    <button onClick={() => shareViaEmail(selectedPayment)}
                      className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300 rounded-md hover:bg-blue-100">
                      📧 Email
                    </button>
                  </>
                )
              })()}
              {!selectedPayment.receipt_url && selectedPayment.status === 'approved' && (
                <button 
                  onClick={() => generateReceipt(selectedPayment.id)}
                  disabled={generatingReceipt}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {generatingReceipt ? 'Generating...' : '🧾 Generate Receipt'}
                </button>
              )}
            </div>

            {/* Receipt Preview */}
            {(() => {
              const receiptUrl = getReceiptUrl(selectedPayment.receipt_url)
              if (!receiptUrl) return null
              const isPdf = selectedPayment.receipt_url?.toLowerCase().endsWith('.pdf')
              return (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Receipt/Proof</label>
                  {isPdf ? (
                    <div>
                      <iframe src={receiptUrl} className="w-full h-48 rounded border" title="Receipt" />
                      <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline">Open PDF</a>
                    </div>
                  ) : (
                    <img src={receiptUrl} alt="Receipt" className="w-full rounded border cursor-pointer" onClick={() => window.open(receiptUrl, '_blank')} />
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </Modal>

      {/* Overdue Payment Detail Modal */}
      <Modal isOpen={showOverdueDetail} onClose={() => { setShowOverdueDetail(false); setSelectedOverdue(null) }}>
        {selectedOverdue && (() => {
          const projectPayments = payments.filter((p: any) => p.project_id === selectedOverdue.project_id)
          return (
            <div>
              <h3 className="text-lg font-semibold mb-1">{selectedOverdue.contact_name}</h3>
              <p className="text-sm text-gray-500 mb-4">{selectedOverdue.site_location} · {selectedOverdue.project_status}</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-red-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-500">Outstanding</div>
                  <div className="text-lg font-bold text-red-600">₹{Number(selectedOverdue.outstanding).toLocaleString()}</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <div className="text-xs text-gray-500">Received So Far</div>
                  <div className="text-lg font-bold text-green-700">₹{Number(selectedOverdue.total_received).toLocaleString()}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg col-span-2">
                  <div className="text-xs text-gray-500">Outstanding For</div>
                  <div className="text-sm font-medium text-gray-900">{selectedOverdue.days_outstanding} days</div>
                </div>
              </div>

              <h4 className="text-sm font-medium text-gray-700 mb-2">Payment History ({projectPayments.length})</h4>
              <div className="divide-y divide-gray-200 max-h-48 overflow-y-auto mb-4">
                {projectPayments.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">No payments recorded yet for this project.</p>
                ) : (
                  projectPayments.map((p: any) => (
                    <div key={p.id} className="py-2 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                      onClick={() => { setShowOverdueDetail(false); setSelectedPayment(p); setShowDetail(true) }}>
                      <div>
                        <div className="text-sm text-gray-900">{new Date(p.date).toLocaleDateString()}</div>
                        <div className="text-xs text-gray-500">{p.payment_mode?.replace('_', ' ')}</div>
                      </div>
                      <div className="text-sm font-bold text-gray-900">₹{Number(p.amount).toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>

              <button onClick={() => { setShowOverdueDetail(false); setSelectedOverdue(null) }}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                Close
              </button>
            </div>
          )
        })()}
      </Modal>

      {/* Reject Reason Modal */}
      <PromptModal
        isOpen={rejectingPaymentId !== null}
        title="Reject Payment"
        message="Please provide a reason so the submitter knows what to correct."
        label="Rejection reason"
        confirmLabel="Reject Payment"
        multiline
        onCancel={() => setRejectingPaymentId(null)}
        onConfirm={(reason) => {
          const id = rejectingPaymentId
          setRejectingPaymentId(null)
          if (id) handleRejectPayment(id, reason)
        }}
      />

      {/* Receipt Viewer Modal */}
      <Modal isOpen={showReceipt} onClose={() => { setShowReceipt(false); setReceiptUrl(null); }}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">Receipt</h3>
          <button onClick={() => { setShowReceipt(false); setReceiptUrl(null); }}
            className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        {receiptUrl && (
          <div>
            <iframe src={receiptUrl} className="w-full h-96 rounded border" title="Receipt" />
            <div className="mt-3 flex justify-end gap-2">
              <a href={receiptUrl} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300 rounded-md hover:bg-blue-100">
                Open in New Tab
              </a>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Payment Modal */}
      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); resetForm(); }}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">Add Payment</h3>
          <button onClick={() => { setShowAdd(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleAddPayment}>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Project *</label>
              <select required value={formProject} onChange={e => setFormProject(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                <option value="">Select a project...</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.contacts?.name} — {p.quotations?.option_label || 'Project'}</option>
                ))}
              </select>
            </div>
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
            <button type="button" onClick={() => { setShowAdd(false); resetForm(); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={submitting || !paymentAmount}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Saving...' : 'Add Payment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
