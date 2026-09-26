import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../contexts/ToastContext'
import { useDebounce } from '../hooks/useDebounce'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { SkeletonList } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import DragDropUpload from '../components/DragDropUpload'
import Spinner from '../components/Spinner'
import PromptModal from '../components/PromptModal'
import { useConfirm } from '../contexts/ConfirmContext'

const MAX_FILES = 3

export default function ExpensesPage() {
  const { user, role } = useAuth()
  const { addToast, addUndoToast } = useToast()
  const confirm = useConfirm()
  const [projects, setProjects] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any>([])
  const [projectOnlyExpenses, setProjectOnlyExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterProject, setFilterProject] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [formProject, setFormProject] = useState('')
  const [formBillNo, setFormBillNo] = useState('')
  const [formLineItems, setFormLineItems] = useState<{ description: string; amount: string }[]>([{ description: '', amount: '' }])
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0])
  const [formCategory, setFormCategory] = useState('material')
  const [formBillFiles, setFormBillFiles] = useState<{ dataUrl: string; file?: File }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [billReading, setBillReading] = useState(false)
  const [billReadError, setBillReadError] = useState<string | null>(null)
  const [selectedExpense, setSelectedExpense] = useState<any>(null)
  const [showExpenseDetail, setShowExpenseDetail] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [rejectingExpenseId, setRejectingExpenseId] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Track if form has unsaved changes
  const hasUnsavedChanges = showAdd && (
    formProject !== '' ||
    formBillNo !== '' ||
    formLineItems.some(line => line.description !== '' || line.amount !== '') ||
    formDate !== '' ||
    formCategory !== 'material' ||
    formBillFiles.length > 0
  )

  useUnsavedChanges(hasUnsavedChanges)

  // Admin-only stats
  const [expenseMonthly, setExpenseMonthly] = useState({ this_month_total: 0, last_month_total: 0, this_month_count: 0, last_month_count: 0 })
  const [categoryBreakdown, setCategoryBreakdown] = useState<any[]>([])
  const [topProjectByExpense, setTopProjectByExpense] = useState<any>(null)
  const [avgExpensePerProject, setAvgExpensePerProject] = useState({ avg_expense: 0, active_project_count: 0, total_expense: 0 })

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useDebounce(search, 300)

  useEffect(() => {
    fetchExpenses()
    if (role === 'admin') {
      fetchAdminStats()
    }
  }, [debouncedSearch, filterCategory, filterProject, role])

  // Listen for refresh events
  useEffect(() => {
    function handleRefresh() {
      fetchExpenses()
      if (role === 'admin') {
        fetchAdminStats()
      }
    }
    window.addEventListener('app-refresh', handleRefresh)
    return () => window.removeEventListener('app-refresh', handleRefresh)
  }, [debouncedSearch, filterCategory, filterProject, role])

  async function fetchAdminStats() {
    const [monthlyRes, categoryRes, topRes, avgRes] = await Promise.all([
      supabase.rpc('get_expense_monthly_comparison'),
      supabase.rpc('get_expense_category_breakdown'),
      supabase.rpc('get_top_project_by_expense'),
      supabase.rpc('get_avg_expense_per_project')
    ])

    const monthlyData = monthlyRes.data as any
    if (monthlyData && monthlyData.length > 0) setExpenseMonthly(monthlyData[0])

    setCategoryBreakdown((categoryRes.data as any) || [])

    const topData = topRes.data as any
    if (topData && topData.length > 0) setTopProjectByExpense(topData[0])

    const avgData = avgRes.data as any
    if (avgData && avgData.length > 0) setAvgExpensePerProject(avgData[0])
  }

  // Helper: get all bill urls (handles backward compat)
  function getBillUrls(exp: any): string[] {
    if (exp.bill_urls && Array.isArray(exp.bill_urls) && exp.bill_urls.length > 0) {
      return exp.bill_urls
    }
    if (exp.bill_url && exp.bill_url !== '') {
      return [exp.bill_url]
    }
    return []
  }

  async function fetchExpenses() {
    setLoading(true)
    const [expRes, projRes] = await Promise.all([
      supabase.from('expense_entries').select('*, expense_line_items(id, description, amount), projects!inner(quotation_id, quotations(option_label), contacts!projects_contact_id_fkey(name))').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, status, quotations(option_label), contacts!projects_contact_id_fkey(name)').neq('status', 'closed')
    ])

    let expenses = (expRes.data as any[]) || []

    if (filterCategory !== 'all') {
      expenses = expenses.filter(e => e.category === filterCategory)
    }
    if (filterProject !== 'all') {
      expenses = expenses.filter(e => e.project_id === filterProject)
    }
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase()
      expenses = expenses.filter(e =>
        (e.item_name || '').toLowerCase().includes(s) ||
        (e.bill_no || '').toLowerCase().includes(s) ||
        (e.projects?.contacts?.name || '').toLowerCase().includes(s) ||
        // Search in line items descriptions
        (e.expense_line_items || []).some((line: any) => 
          (line.description || '').toLowerCase().includes(s)
        )
      )
    }

    let projectFiltered = (expRes.data as any[]) || []
    if (filterProject !== 'all') {
      projectFiltered = projectFiltered.filter(e => e.project_id === filterProject)
    }
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase()
      projectFiltered = projectFiltered.filter(e =>
        (e.item_name || '').toLowerCase().includes(s) ||
        (e.bill_no || '').toLowerCase().includes(s) ||
        (e.projects?.contacts?.name || '').toLowerCase().includes(s) ||
        (e.expense_line_items || []).some((line: any) => (line.description || '').toLowerCase().includes(s))
      )
    }
    setProjectOnlyExpenses(projectFiltered)
    setExpenses(expenses)
    setProjects((projRes.data as any[]) || [])
    setLoading(false)
  }

  async function handleApproveExpense(expenseId: string) {
    const { error } = await supabase
      .from('expense_entries')
      .update({ status: 'approved' })
      .eq('id', expenseId)

    if (error) {
      addToast('Failed to approve expense', 'error')
    } else {
      addToast('Expense approved successfully', 'success')
      closeExpenseDetail()
      fetchExpenses()
      fetchAdminStats()
    }
  }

  async function handleRejectExpense(expenseId: string, reason: string) {
    const { error } = await supabase
      .from('expense_entries')
      .update({ status: 'rejected', rejection_reason: reason })
      .eq('id', expenseId)

    if (error) {
      addToast('Failed to reject expense', 'error')
    } else {
      addToast('Expense rejected', 'success')
      closeExpenseDetail()
      fetchExpenses()
      fetchAdminStats()
    }
  }

  function promptRejectExpense(expenseId: string) {
    setRejectingExpenseId(expenseId)
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

  function getBillUrl(billUrl: string | null): string | null {
    if (!billUrl) return null
    const { data } = supabase.storage.from('bills').getPublicUrl(billUrl)
    return data?.publicUrl || null
  }

  // Camera functions
  function startCamera() {
    setShowCamera(true)
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
      .catch(err => {
        addToast('Camera access denied. Please allow camera permissions.', 'warning')
        console.error('Camera error:', err)
        setShowCamera(false)
      })
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setShowCamera(false)
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    stopCamera()

    const blob = dataURLtoBlob(dataUrl)
    const file = new File([blob], `camera-bill-${Date.now()}.jpg`, { type: 'image/jpeg' })
    const newFiles = [...formBillFiles, { dataUrl, file }]
    setFormBillFiles(newFiles)

    if (formBillFiles.length === 0) {
      readBillWithGemini(file)
    }
  }

  function dataURLtoBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',')
    const mime = arr[0].match(/:(.*?);/)![1]
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) { u8arr[n] = bstr.charCodeAt(n) }
    return new Blob([u8arr], { type: mime })
  }

  function handleBillFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      addToast('Please select a JPG, PNG, or PDF file', 'warning')
      e.target.value = ''
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      addToast('File size must be less than 10MB', 'warning')
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      const newFiles = [...formBillFiles, { dataUrl, file }]
      setFormBillFiles(newFiles)

      if (formBillFiles.length === 0) {
        readBillWithGemini(file)
      }
    }
    reader.readAsDataURL(file)
  }

  function removeBillFile(index: number) {
    setFormBillFiles(formBillFiles.filter((_, i) => i !== index))
  }

  function handleFilesSelected(files: File[]) {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
    const maxSize = 10 * 1024 * 1024 // 10MB

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        addToast('Please select JPG, PNG, or PDF files only', 'warning')
        return
      }
      if (file.size > maxSize) {
        addToast('File size must be less than 10MB', 'warning')
        return
      }
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const newFiles = files.map(file => ({
        dataUrl: ev.target?.result as string,
        file
      }))
      setFormBillFiles([...formBillFiles, ...newFiles])
    }
    reader.readAsDataURL(files[0])
  }

  async function readBillWithGemini(file: File) {
    setBillReading(true)
    setBillReadError(null)

    try {
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string
          const base64 = result.split(',')[1]
          resolve(base64)
        }
        reader.onerror = reject
      })
      reader.readAsDataURL(file)
      const image_base64 = await base64Promise
      const mime_type = file.type

      const { data, error } = await supabase.functions.invoke('process-bill', {
        body: { image_base64, mime_type }
      })

      if (error) {
        console.error('Edge function error:', error)
        if (error.message?.includes('429') || error.message?.includes('RATE_LIMIT')) {
          setBillReadError('Bill reading is temporarily busy, please enter details manually')
        } else {
          setBillReadError('Could not read bill — please enter details manually')
        }
        return
      }

      if (!data?.success || !data?.data) {
        setBillReadError('Could not read bill — please enter details manually')
        return
      }

      const { bill_no } = data.data
      let errorMsg = ''

      if (!bill_no) {
        errorMsg += 'Could not read Bill No — please enter manually. '
      } else {
        setFormBillNo(bill_no)
      }

      // Note: We no longer auto-fill amount since it's now split across line items
      // The user will manually enter amounts in the line items

      if (errorMsg) {
        setBillReadError(errorMsg.trim())
      }

    } catch (err) {
      console.error('Error reading bill:', err)
      setBillReadError('Could not read bill — please enter details manually')
    } finally {
      setBillReading(false)
    }
  }

  function addLineItem() {
    setFormLineItems([...formLineItems, { description: '', amount: '' }])
  }

  function removeLineItem(index: number) {
    setFormLineItems(formLineItems.filter((_, i) => i !== index))
  }

  function updateLineItem(index: number, field: 'description' | 'amount', value: string) {
    const lines = [...formLineItems]
    lines[index] = { ...lines[index], [field]: value }
    setFormLineItems(lines)
  }

  function getLineItemsTotal(): number {
    return formLineItems.reduce((sum, line) => {
      const amount = parseFloat(line.amount)
      return sum + (isNaN(amount) ? 0 : amount)
    }, 0)
  }

  async function uploadBills(expenseId: string): Promise<string[]> {
    const urls: string[] = []
    for (let i = 0; i < formBillFiles.length; i++) {
      const bf = formBillFiles[i]
      if (!bf.file) continue
      const fileExt = bf.file.name.split('.').pop()
      const filePath = `${expenseId}/${Date.now()}_${i}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('bills')
        .upload(filePath, bf.file)
      if (uploadError) {
        console.error('Bill upload error:', uploadError)
      } else {
        urls.push(filePath)
      }
    }
    return urls
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!formProject || !user) return
    setSubmitting(true)

    const totalAmount = getLineItemsTotal()
    if (totalAmount <= 0) {
      addToast('Please enter at least one line item with a valid amount', 'warning')
      setSubmitting(false)
      return
    }

    // Validate that at least one line item has a description
    const hasDescription = formLineItems.some(line => line.description.trim() !== '')
    if (!hasDescription) {
      addToast('Please enter at least one line item description', 'warning')
      setSubmitting(false)
      return
    }

    // Create a combined item_name for backward compatibility (first line item description)
    const primaryDescription = formLineItems[0]?.description || 'Expense'

    // Status is set by the database: rep entries start as 'pending', admin entries as 'approved'
    const { data: newExpense, error } = await supabase.from('expense_entries').insert({
      project_id: formProject,
      created_by: user.id,
      bill_no: formBillNo || null,
      item_name: primaryDescription,
      amount: totalAmount,
      date: formDate,
      category: formCategory
    }).select('id, status').single()

    if (error) {
      addToast('Error: ' + error.message, 'error')
      addToast('Failed to add expense', 'error')
      setSubmitting(false)
      return
    }

    // Insert line items
    const lineItemsToInsert = formLineItems
      .filter(line => line.description.trim() !== '')
      .map(line => ({
        expense_id: newExpense.id,
        description: line.description.trim(),
        amount: parseFloat(line.amount) || 0
      }))

    if (lineItemsToInsert.length > 0) {
      const { error: linesError } = await supabase.from('expense_line_items').insert(lineItemsToInsert)
      if (linesError) {
        console.error('Error inserting line items:', linesError)
        addToast('Failed to save line items', 'error')
      }
    }

    if (formBillFiles.length > 0 && newExpense) {
      const billUrls = await uploadBills(newExpense.id)
      if (billUrls.length > 0) {
        await supabase.from('expense_entries').update({
          bill_url: billUrls[0],
          bill_urls: billUrls
        }).eq('id', newExpense.id)
      }
    }

    const { error: rpcErr } = await supabase.rpc('update_project_cost', { p_project_id: formProject })
    if (rpcErr) console.error('Cost recalculation RPC error:', rpcErr.message)

    setSubmitting(false)
    setShowAdd(false)
    resetForm()
    fetchExpenses()
    if (role === 'admin') fetchAdminStats()
    addToast(newExpense.status === 'pending' ? 'Expense submitted for admin approval' : 'Expense added successfully!', 'success')
  }

  function resetForm() {
    setFormProject('')
    setFormBillNo('')
    setFormLineItems([{ description: '', amount: '' }])
    setFormDate(new Date().toISOString().split('T')[0])
    setFormCategory('material')
    setFormBillFiles([])
    setBillReadError(null)
    stopCamera()
  }

  async function closeAddModal() {
    if (hasUnsavedChanges) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        message: 'You have unsaved changes in this expense entry. Closing now will lose them.',
        confirmLabel: 'Discard',
        tone: 'warning',
      })
      if (!ok) return
    }
    setShowAdd(false)
    resetForm()
  }

  async function handleDelete(id: string, projectId: string, billUrls: string[] | null, expenseData?: any) {
    if (deletingId) return

    // Store data for potential undo
    const deletedExpense = expenseData || { id, project_id: projectId, bill_urls: billUrls }

    const ok = await confirm({
      title: 'Delete expense entry?',
      message: 'This expense and any uploaded bills will be removed.',
      details: 'You can undo this for a short while afterwards.',
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return

    setDeletingId(id)
    try {
      if (billUrls && billUrls.length > 0) {
        await supabase.storage.from('bills').remove(billUrls)
      }

      const { error } = await supabase.from('expense_entries').delete().eq('id', id)
      if (error) {
        addToast('Error deleting expense: ' + error.message, 'error')
        addToast('Failed to delete expense', 'error')
        return
      }

      const { error: rpcErr } = await supabase.rpc('update_project_cost', { p_project_id: projectId })
      if (rpcErr) console.error('Cost recalculation RPC error:', rpcErr.message)
      await fetchExpenses()
    } finally {
      setDeletingId(null)
    }
    
    // Show undo toast
    addUndoToast(
      'Expense deleted successfully',
      async () => {
        // Restore the expense entry
        const { error: restoreError } = await supabase.from('expense_entries').insert({
          id: deletedExpense.id,
          project_id: deletedExpense.project_id,
          bill_no: deletedExpense.bill_no,
          item_name: deletedExpense.item_name,
          amount: deletedExpense.amount,
          date: deletedExpense.date,
          category: deletedExpense.category,
          created_by: deletedExpense.created_by,
          bill_url: deletedExpense.bill_url,
          bill_urls: deletedExpense.bill_urls
        })
        
        if (restoreError) {
          console.error('Error restoring expense:', restoreError)
          addToast('Failed to restore expense', 'error')
          return
        }
        
        // Restore line items if they exist
        if (deletedExpense.expense_line_items && deletedExpense.expense_line_items.length > 0) {
          const lineItemsToRestore = deletedExpense.expense_line_items.map((line: any) => ({
            expense_id: deletedExpense.id,
            description: line.description,
            amount: line.amount
          }))
          
          await supabase.from('expense_line_items').insert(lineItemsToRestore)
        }
        
        // Recalculate project cost
        const { error: rpcErr } = await supabase.rpc('update_project_cost', { p_project_id: deletedExpense.project_id })
        if (rpcErr) console.error('Cost recalculation RPC error:', rpcErr.message)
        
        fetchExpenses()
        addToast('Expense restored successfully', 'success')
      }
    )
  }

  function openExpenseDetail(exp: any) {
    setSelectedExpense(exp)
    setShowExpenseDetail(true)
  }

  function closeExpenseDetail() {
    setShowExpenseDetail(false)
    setSelectedExpense(null)
  }

  const pendingExpenses = expenses.filter((e: any) => e.status === 'pending')

  const categoryBadge = (cat: string) => {
    const colors: Record<string, string> = {
      material: 'bg-blue-100 text-blue-800',
      labor: 'bg-purple-100 text-purple-800',
      transport: 'bg-yellow-100 text-yellow-800',
      other: 'bg-gray-100 text-gray-800'
    }
    return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${colors[cat] || colors.other}`}>{cat}</span>
  }

  const filteredCategoryBreakdown = (() => {
    const groups: Record<string, { total: number; count: number }> = {}
    let grandTotal = 0
    // Only approved expenses count toward cost
    projectOnlyExpenses.filter((e: any) => e.status === 'approved').forEach((e: any) => {
      const cat = e.category || 'other'
      if (!groups[cat]) groups[cat] = { total: 0, count: 0 }
      groups[cat].total += Number(e.amount) || 0
      groups[cat].count += 1
      grandTotal += Number(e.amount) || 0
    })
    return { groups, grandTotal }
  })()

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Expense Entries</h2>
        <button onClick={() => setShowAdd(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">+ Add Expense</button>
      </div>

      {/* Admin-only stats */}
      {role === 'admin' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm text-gray-500">This Month Expenses</div>
            <div className="text-xl font-bold text-gray-900">₹{Number(expenseMonthly.this_month_total).toLocaleString()}</div>
            <div className="text-xs text-gray-400">{expenseMonthly.this_month_count} entries</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm text-gray-500">Last Month Expenses</div>
            <div className="text-xl font-bold text-gray-900">₹{Number(expenseMonthly.last_month_total).toLocaleString()}</div>
            <div className="text-xs text-gray-400">{expenseMonthly.last_month_count} entries</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm text-gray-500">Top Project by Expense</div>
            {topProjectByExpense ? (
              <div>
                <div className="text-xl font-bold text-gray-900">₹{Number(topProjectByExpense.total_expense).toLocaleString()}</div>
                <div className="text-xs text-gray-500">{topProjectByExpense.contact_name}</div>
              </div>
            ) : (
              <div className="text-sm text-gray-400">No data</div>
            )}
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm text-gray-500">Avg Expense/Project</div>
            <div className="text-xl font-bold text-gray-900">₹{Number(avgExpensePerProject.avg_expense).toLocaleString()}</div>
            <div className="text-xs text-gray-400">{avgExpensePerProject.active_project_count} active projects</div>
          </div>
        </div>
      )}

      {/* Pending Expenses - Admin Only */}
      {role === 'admin' && pendingExpenses.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-semibold text-yellow-900 mb-3">
            ⚠️ Pending Expense Approvals ({pendingExpenses.length})
          </h3>
          <div className="space-y-2">
            {pendingExpenses.map((exp: any) => {
              const billCount = getBillUrls(exp).length
              return (
                <div key={exp.id} className="bg-white p-3 rounded-md border border-yellow-200 cursor-pointer hover:bg-gray-50"
                  onClick={() => openExpenseDetail(exp)}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {exp.item_name} — {exp.projects?.contacts?.name || 'Unknown Project'}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        ₹{Number(exp.amount).toLocaleString()} • {exp.date} • {exp.category}
                        {exp.bill_no ? ` • Bill No: ${exp.bill_no}` : ''}
                      </div>
                      {billCount > 0 && (
                        <div className="text-xs text-blue-600 mt-1">
                          📎 {billCount} bill{billCount > 1 ? 's' : ''} attached — click to view
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleApproveExpense(exp.id) }}
                        className="px-3 py-1 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); promptRejectExpense(exp.id) }}
                        className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Admin-only category breakdown */}
      {role === 'admin' && categoryBreakdown.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow-sm border mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Breakdown by Category</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {categoryBreakdown.map((cat: any) => (
              <div key={cat.category} className="text-center">
                <div className="text-lg font-bold text-gray-900">₹{Number(cat.total_amount).toLocaleString()}</div>
                <div className="text-xs text-gray-500">{cat.category}</div>
                <div className="text-xs text-gray-400">{cat.percentage}% ({cat.entry_count})</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by bill no, item, or client..."
          className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500">
          <option value="all">All Projects</option>
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.contacts?.name} — {p.quotations?.option_label || 'Project'}</option>
          ))}
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500">
          <option value="all">All Categories</option>
          <option value="material">Material</option>
          <option value="labor">Labor</option>
          <option value="transport">Transport</option>
          <option value="other">Other</option>
        </select>
      </div>

      {role === 'admin' && filterProject !== 'all' && (
        <div className="bg-white p-4 rounded-lg shadow-sm border mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-1">
            Breakdown for {projects.find((p: any) => p.id === filterProject)?.contacts?.name || 'Selected Project'}
          </h3>
          <div className="text-sm text-gray-500 mb-2">
            Total: <span className="font-bold text-gray-900">₹{filteredCategoryBreakdown.grandTotal.toLocaleString()}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(filteredCategoryBreakdown.groups).map(([cat, data]) => (
              <div key={cat} className="text-center">
                <div className="text-lg font-bold text-gray-900">₹{data.total.toLocaleString()}</div>
                <div className="text-xs text-gray-500 capitalize">{cat}</div>
                <div className="text-xs text-gray-400">
                  {filteredCategoryBreakdown.grandTotal > 0 ? ((data.total / filteredCategoryBreakdown.grandTotal) * 100).toFixed(1) : '0'}% ({data.count})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <SkeletonList />
        ) : expenses.length === 0 ? (
          <EmptyState
            icon="💰"
            title="No expenses yet"
            description="Add expenses against active projects to track costs"
            action={{ label: '+ Add Expense', onClick: () => setShowAdd(true) }}
          />
        ) : (
          <div className="divide-y divide-gray-200">
            {expenses.map((exp: any) => {
              const billUrls = getBillUrls(exp)
              return (
                <div key={exp.id} className="p-4 hover:bg-gray-50 cursor-pointer" onClick={() => openExpenseDetail(exp)}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{exp.item_name}</span>
                        {categoryBadge(exp.category)}
                        {getStatusBadge(exp.status)}
                      </div>
                      {exp.bill_no && <div className="mt-0.5 text-xs text-gray-500">Bill No: {exp.bill_no}</div>}
                      <div className="mt-1 text-sm text-gray-500">Project: {exp.projects?.contacts?.name || 'Unknown'}</div>
                      <div className="mt-1 text-xs text-gray-400">
                        {new Date(exp.date).toLocaleDateString()} | Added by {exp.created_by === user?.id ? 'you' : 'admin'}
                      </div>
                      {exp.status === 'rejected' && exp.rejection_reason && (
                        <div className="mt-1 text-xs text-red-600">
                          Reason: {exp.rejection_reason}
                        </div>
                      )}
                      {billUrls.length > 0 && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600">📎 {billUrls.length} bill{billUrls.length > 1 ? 's' : ''} attached</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-900">₹{Number(exp.amount).toLocaleString()}</span>
                      {role === 'admin' && (
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(exp.id, exp.project_id, getBillUrls(exp)) }}
                          disabled={deletingId !== null}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed">
                          {deletingId === exp.id ? <><Spinner className="h-3 w-3" /> Deleting…</> : 'Delete'}
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

      {/* Expense Detail Modal */}
      <Modal isOpen={showExpenseDetail} onClose={closeExpenseDetail}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">Expense Details</h3>
          <button onClick={closeExpenseDetail}
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
            {role === 'admin' && selectedExpense.status === 'pending' && (
              <div className="flex gap-2">
                <button onClick={() => handleApproveExpense(selectedExpense.id)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700">
                  Approve
                </button>
                <button onClick={() => promptRejectExpense(selectedExpense.id)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700">
                  Reject
                </button>
              </div>
            )}
            <div><label className="block text-xs font-medium text-gray-500">Bill No</label><p className="text-sm text-gray-900">{selectedExpense.bill_no || '—'}</p></div>
            <div><label className="block text-xs font-medium text-gray-500">Item Name</label><p className="text-sm text-gray-900">{selectedExpense.item_name}</p></div>
            <div><label className="block text-xs font-medium text-gray-500">Amount</label><p className="text-sm font-bold text-gray-900">₹{Number(selectedExpense.amount).toLocaleString()}</p></div>
            <div><label className="block text-xs font-medium text-gray-500">Date</label><p className="text-sm text-gray-900">{new Date(selectedExpense.date).toLocaleDateString()}</p></div>
            <div><label className="block text-xs font-medium text-gray-500">Category</label><div className="mt-0.5">{categoryBadge(selectedExpense.category)}</div></div>
            <div><label className="block text-xs font-medium text-gray-500">Project</label><p className="text-sm text-gray-900">{selectedExpense.projects?.contacts?.name || 'Unknown'}</p></div>
            <div><label className="block text-xs font-medium text-gray-500">Added by</label><p className="text-sm text-gray-900">{selectedExpense.created_by === user?.id ? 'You' : 'Admin'}</p></div>

            {/* Line Items */}
            {selectedExpense.expense_line_items && selectedExpense.expense_line_items.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Line Items</label>
                <div className="border rounded-md overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedExpense.expense_line_items.map((line: any) => (
                        <tr key={line.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">{line.description}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right font-medium">₹{Number(line.amount).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={1} className="px-4 py-2 text-sm font-medium text-gray-700 text-right">Total:</td>
                        <td className="px-4 py-2 text-sm font-bold text-gray-900 text-right">₹{Number(selectedExpense.amount).toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {(() => {
              const billUrls = getBillUrls(selectedExpense)
              if (billUrls.length === 0) return null
              return (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Uploaded Bills ({billUrls.length})</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {billUrls.map((url, i) => {
                      const publicUrl = getBillUrl(url)
                      if (!publicUrl) return <p key={i} className="text-sm text-gray-400">Bill unavailable: {url}</p>
                      const isPdf = url.toLowerCase().endsWith('.pdf')
                      return (
                        <div key={i}>
                          {isPdf ? (
                            <div>
                              <iframe src={publicUrl} className="w-full h-24 rounded border" title={`Bill ${i + 1}`} />
                              <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline">Open PDF</a>
                            </div>
                          ) : (
                            <div>
                              <img src={publicUrl} alt={`Bill ${i + 1}`}
                                className="w-full h-24 object-cover rounded border cursor-pointer"
                                onClick={() => window.open(publicUrl, '_blank')}
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
                            </div>
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

      {/* Reject Reason Modal */}
      <PromptModal
        isOpen={rejectingExpenseId !== null}
        title="Reject Expense"
        message="Please provide a reason so the submitter knows what to correct."
        label="Rejection reason"
        confirmLabel="Reject Expense"
        multiline
        onCancel={() => setRejectingExpenseId(null)}
        onConfirm={(reason) => {
          const id = rejectingExpenseId
          setRejectingExpenseId(null)
          if (id) handleRejectExpense(id, reason)
        }}
      />

      {/* Add Expense Modal */}
      <Modal isOpen={showAdd} onClose={closeAddModal}>
        <DragDropUpload
          onFilesSelected={handleFilesSelected}
          accept=".jpg,.jpeg,.png,.pdf"
          maxFiles={MAX_FILES - formBillFiles.length}
          clickToUpload={false}
        >
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">Add Expense</h3>
          <button onClick={() => { setShowAdd(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleAddExpense}>
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
              <label className="block text-sm font-medium text-gray-700">Upload Bills ({formBillFiles.length}/{MAX_FILES})</label>

              {showCamera && (
                <div className="mb-2 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  <video ref={videoRef} autoPlay playsInline className="w-full max-h-64 bg-black rounded" />
                  <div className="mt-2 flex gap-2 justify-center">
                    <button type="button" onClick={capturePhoto}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Capture</button>
                    <button type="button" onClick={stopCamera}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300">Cancel</button>
                  </div>
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />

              {formBillFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {formBillFiles.map((bf, i) => (
                    <div key={i} className="relative group">
                      {bf.file?.type?.startsWith('image/') || (!bf.file) ? (
                        <img src={bf.dataUrl} alt={`Bill ${i + 1}`} className="h-16 w-16 object-cover rounded border" />
                      ) : (
                        <div className="h-16 w-16 rounded border bg-gray-100 flex items-center justify-center text-xs text-gray-500">PDF</div>
                      )}
                      <button type="button" onClick={() => removeBillFile(i)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {formBillFiles.length < MAX_FILES && !showCamera && (
                <DragDropUpload
                  onFilesSelected={handleFilesSelected}
                  accept=".jpg,.jpeg,.png,.pdf"
                  maxFiles={MAX_FILES - formBillFiles.length}
                >
                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer inline-flex items-center px-3 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Choose File
                      <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleBillFileSelect} className="hidden" />
                    </label>
                    <button type="button" onClick={startCamera}
                      className="inline-flex items-center px-3 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Open Camera
                    </button>
                  </div>
                </DragDropUpload>
              )}
              {formBillFiles.length >= MAX_FILES && (
                <p className="text-xs text-gray-500">Maximum {MAX_FILES} bills reached</p>
              )}

              {billReading && (
                <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  Reading bill...
                </div>
              )}
              {billReadError && !billReading && (
                <p className="mt-1 text-xs text-amber-600">{billReadError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Bill No</label>
              <input type="text" value={formBillNo} onChange={e => setFormBillNo(e.target.value)}
                placeholder={billReading ? 'Reading...' : 'Auto-filled from bill or enter manually'}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
            </div>

            {/* Line Items Section */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Line Items</label>
                <button type="button" onClick={addLineItem} className="text-xs text-blue-600 hover:text-blue-800">+ Add Line Item</button>
              </div>
              <div className="space-y-2">
                {formLineItems.map((line, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 bg-gray-50 rounded-md">
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <input type="text" placeholder="Description" value={line.description}
                          onChange={e => updateLineItem(i, 'description', e.target.value)}
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500" />
                        <button type="button" onClick={() => removeLineItem(i)} className="text-red-500 hover:text-red-700 text-sm px-2">✕</button>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="block text-xs text-gray-500 mb-0.5">Amount (₹)</label>
                          <input type="number" min="0.01" step="0.01" placeholder="0.00" value={line.amount}
                            onChange={e => updateLineItem(i, 'amount', e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-right text-sm font-medium text-gray-900">
                Total: ₹{getLineItemsTotal().toLocaleString()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Date *</label>
                <input type="date" required value={formDate} onChange={e => setFormDate(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Category</label>
                <select value={formCategory} onChange={e => setFormCategory(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                  <option value="material">Material</option>
                  <option value="labor">Labor</option>
                  <option value="transport">Transport</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => { setShowAdd(false); resetForm(); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={submitting || billReading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Saving...' : billReading ? 'Reading bill...' : 'Add Expense'}
            </button>
          </div>
        </form>
        </DragDropUpload>
      </Modal>
    </div>
  )
}
