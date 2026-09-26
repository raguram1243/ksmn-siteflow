import { useState, useEffect, useRef, type ReactElement } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../contexts/ToastContext'
import { useDebounce } from '../hooks/useDebounce'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { SkeletonTable } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import DragDropUpload from '../components/DragDropUpload'
import Spinner from '../components/Spinner'
import type { Contact, Quotation, QuotationLineItem, CatalogItem } from '../types/database'

const MAX_FILES = 3

export default function QuotationsPage() {
  const { user, role } = useAuth()
  const { addToast } = useToast()
  const [leads, setLeads] = useState<Contact[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null)
  const [quotationLines, setQuotationLines] = useState<QuotationLineItem[]>([])
  const [showDetail, setShowDetail] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [filterTab, setFilterTab] = useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<string>('created_at')

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useDebounce(search, 300)

  // Create form state
  const [formLead, setFormLead] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [formLines, setFormLines] = useState<Omit<QuotationLineItem, 'id' | 'quotation_id' | 'amount'>[]>([])
  
  // New cost fields for quotation
  const [formMechanizedToolCost, setFormMechanizedToolCost] = useState('')
  const [formMaskingKitCost, setFormMaskingKitCost] = useState('')
  const [formDiscount, setFormDiscount] = useState('')
  const [formReferenceTotal, setFormReferenceTotal] = useState('')
  const [extractingPdf, setExtractingPdf] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)

  // Multi-file attachment state
  const [formAttachFiles, setFormAttachFiles] = useState<{ dataUrl: string; file?: File }[]>([])
  const [uploadingAttach, setUploadingAttach] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Track if form has unsaved changes
  const hasUnsavedChanges = showCreate && (
    formLead !== '' ||
    formLabel !== '' ||
    formLines.length > 0 ||
    formMechanizedToolCost !== '' ||
    formMaskingKitCost !== '' ||
    formDiscount !== '' ||
    formReferenceTotal !== '' ||
    formAttachFiles.length > 0
  )

  const { handleNavigation } = useUnsavedChanges(hasUnsavedChanges)

  useEffect(() => { fetchData() }, [debouncedSearch, sortBy, filterTab])

  // Listen for refresh events
  useEffect(() => {
    function handleRefresh() {
      fetchData()
    }
    window.addEventListener('app-refresh', handleRefresh)
    return () => window.removeEventListener('app-refresh', handleRefresh)
  }, [debouncedSearch, sortBy, filterTab])

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  async function fetchData() {
    setLoading(true)

    let leadsQuery = supabase.from('contacts').select('*').eq('is_lead', true).order('name')
    let quotesQuery = supabase.from('quotations').select('*, contacts(name), profiles!quotations_created_by_fkey(full_name)').order(sortBy as any, { ascending: false })

    const [leadsRes, quotesRes, catalogRes] = await Promise.all([
      leadsQuery,
      quotesQuery,
      supabase.from('catalog_items').select('*').order('category').order('name')
    ])

    if (leadsRes.error) console.error('Error fetching leads:', leadsRes.error)
    if (quotesRes.error) console.error('Error fetching quotations:', quotesRes.error)
    if (catalogRes.error) console.error('Error fetching catalog:', catalogRes.error)

    setLeads((leadsRes.data as Contact[]) || [])
    setQuotations((quotesRes.data as Quotation[]) || [])
    setCatalog((catalogRes.data as CatalogItem[]) || [])
    setLoading(false)
  }

  // Helper: get all attachment urls (handles backward compat)
  function getAttachmentUrls(q: Quotation): string[] {
    if (q.attachment_urls && Array.isArray(q.attachment_urls) && q.attachment_urls.length > 0) {
      return q.attachment_urls
    }
    if (q.attachment_url && q.attachment_url !== '') {
      return [q.attachment_url]
    }
    return []
  }

  const filteredQuotations = quotations.filter((q: Quotation) => {
    if (filterTab === 'all') return true
    if (filterTab === 'pending') return q.client_approved === true && q.admin_locked === false
    if (filterTab === 'draft') return q.client_approved === false && q.admin_locked === false
    if (filterTab === 'locked') return q.admin_locked === true
    return true
  }).filter((q: Quotation) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (q.contacts?.name || '').toLowerCase().includes(s) ||
           (q.option_label || '').toLowerCase().includes(s)
  })

  function openCreate() {
    setShowCreate(true)
    setFormLead('')
    setFormLabel('Option 1')
    setFormLines([{ catalog_item_id: null, description: '', quantity: 1, unit: 'unit', rate: 0, is_custom: true, notes: '' }])
    setFormMechanizedToolCost('')
    setFormMaskingKitCost('')
    setFormDiscount('')
    setFormReferenceTotal('')
    setFormAttachFiles([])
    setExtractError(null)
    stopCamera()
  }

  function closeCreateModal() {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to close?')
      if (!confirmed) return
    }
    setShowCreate(false)
    setFormLead('')
    setFormLabel('Option 1')
    setFormLines([{ catalog_item_id: null, description: '', quantity: 1, unit: 'unit', rate: 0, is_custom: true, notes: '' }])
    setFormMechanizedToolCost('')
    setFormMaskingKitCost('')
    setFormDiscount('')
    setFormReferenceTotal('')
    setFormAttachFiles([])
    setExtractError(null)
    stopCamera()
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
        alert('Camera access denied. Please allow camera permissions.')
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
    setFormAttachFiles([...formAttachFiles, { dataUrl }])
    stopCamera()
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

  function handleAttachFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      alert('Please select a JPG, PNG, or PDF file')
      e.target.value = ''
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB')
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      const newFiles = [...formAttachFiles, { dataUrl, file }]
      setFormAttachFiles(newFiles)

      // If this is the first file and it's a PDF, try to extract data
      if (formAttachFiles.length === 0 && file.type === 'application/pdf') {
        extractQuotationFromPdf(file)
      }
    }
    reader.readAsDataURL(file)
  }

  function removeAttachFile(index: number) {
    setFormAttachFiles(formAttachFiles.filter((_, i) => i !== index))
  }

  function handleFilesSelected(files: File[]) {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
    const maxSize = 10 * 1024 * 1024 // 10MB

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        alert('Please select JPG, PNG, or PDF files only')
        return
      }
      if (file.size > maxSize) {
        alert('File size must be less than 10MB')
        return
      }
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const newFiles = files.map(file => ({
        dataUrl: ev.target?.result as string,
        file
      }))
      setFormAttachFiles([...formAttachFiles, ...newFiles])
    }
    reader.readAsDataURL(files[0])
  }

  async function extractQuotationFromPdf(file: File) {
    setExtractingPdf(true)
    setExtractError(null)

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
      const pdf_base64 = await base64Promise

      const { data, error } = await supabase.functions.invoke('process-quotation-pdf', {
        body: { pdf_base64, mime_type: 'application/pdf' }
      })

      if (error) {
        console.error('Edge function error:', error)
        if (error.message?.includes('429') || error.message?.includes('RATE_LIMIT')) {
          setExtractError('PDF processing is temporarily busy, please enter details manually')
        } else {
          setExtractError('Could not extract data from PDF — please enter details manually')
        }
        return
      }

      if (!data?.success || !data?.data) {
        setExtractError('Could not extract data from PDF — please enter details manually')
        return
      }

      const extracted = data.data
      let errorMsg = ''

      // Populate line items from extracted products
      if (extracted.line_items && Array.isArray(extracted.line_items) && extracted.line_items.length > 0) {
        const newLines = extracted.line_items.map((item: any) => ({
          catalog_item_id: null,
          description: item.product_name || '',
          quantity: 1,
          unit: 'unit',
          rate: item.cost || 0,
          is_custom: true,
          notes: item.remarks || ''
        }))
        setFormLines(newLines)
      } else {
        errorMsg += 'Could not extract product rows. '
      }

      // Populate additional cost fields
      if (extracted.mechanized_tool_cost !== null && extracted.mechanized_tool_cost !== undefined) {
        setFormMechanizedToolCost(extracted.mechanized_tool_cost.toString())
      }
      if (extracted.masking_kit_cost !== null && extracted.masking_kit_cost !== undefined) {
        setFormMaskingKitCost(extracted.masking_kit_cost.toString())
      }
      if (extracted.discount !== null && extracted.discount !== undefined) {
        setFormDiscount(extracted.discount.toString())
      }

      // Populate reference total
      if (extracted.total !== null && extracted.total !== undefined) {
        setFormReferenceTotal(extracted.total.toString())
      }

      if (errorMsg) {
        setExtractError(errorMsg.trim())
      } else {
        addToast('Quotation data extracted from PDF', 'success')
      }

    } catch (err) {
      console.error('Error extracting quotation:', err)
      setExtractError('Could not extract data from PDF — please enter details manually')
    } finally {
      setExtractingPdf(false)
    }
  }

  function addLine() {
    setFormLines([...formLines, { catalog_item_id: null, description: '', quantity: 1, unit: 'unit', rate: 0, is_custom: true, notes: '' }])
  }

  function removeLine(index: number) {
    setFormLines(formLines.filter((_, i) => i !== index))
  }

  function updateLine(index: number, field: keyof Omit<QuotationLineItem, 'id' | 'quotation_id' | 'amount'>, value: any) {
    const lines = [...formLines] as Omit<QuotationLineItem, 'id' | 'quotation_id' | 'amount'>[]
    lines[index] = { ...lines[index], [field]: value }
    if (field === 'catalog_item_id' && value) {
      const item = catalog.find(c => c.id === value)
      if (item) {
        lines[index].description = item.name
        lines[index].unit = item.unit
        lines[index].rate = item.standard_rate
        lines[index].is_custom = false
      }
    }
    setFormLines(lines)
  }

  function calcLineTotal(line: typeof formLines[0]) { return line.quantity * line.rate }
  
  // Backward-compatible total calculation with new fields
  function calcTotal() {
    const lineItemsTotal = formLines.reduce((sum, line) => sum + calcLineTotal(line), 0)
    const mechanizedTool = parseFloat(formMechanizedToolCost) || 0
    const maskingKit = parseFloat(formMaskingKitCost) || 0
    const discount = parseFloat(formDiscount) || 0
    return lineItemsTotal + mechanizedTool + maskingKit - discount
  }

  async function uploadAttachments(quotationId: string): Promise<string[]> {
    const urls: string[] = []
    setUploadingAttach(true)
    for (let i = 0; i < formAttachFiles.length; i++) {
      const af = formAttachFiles[i]
      if (!af.file) continue
      const fileExt = af.file.name.split('.').pop()
      const filePath = `${quotationId}/${Date.now()}_${i}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('quotations')
        .upload(filePath, af.file)
      if (uploadError) {
        console.error('Attachment upload error:', uploadError)
        addToast(`Failed to upload attachment ${i + 1}`, 'error')
      } else {
        urls.push(filePath)
      }
    }
    setUploadingAttach(false)
    return urls
  }

  async function handleCreateQuotation(e: React.FormEvent) {
    e.preventDefault()
    if (!formLead || !user) return
    const totalValue = calcTotal()

    const { data: quoteData, error: quoteError } = await supabase.from('quotations').insert({
      lead_id: formLead,
      created_by: user.id,
      option_label: formLabel,
      total_value: totalValue,
      mechanized_tool_cost: parseFloat(formMechanizedToolCost) || 0,
      masking_kit_cost: parseFloat(formMaskingKitCost) || 0,
      discount_amount: parseFloat(formDiscount) || 0,
      is_selected: false, is_archived: false,
      client_approved: false, admin_locked: false
    }).select().single()

    if (quoteError || !quoteData) { 
      alert('Error: ' + quoteError?.message)
      addToast('Failed to create quotation', 'error')
      return 
    }

    const lineItems = formLines.map(line => ({
      quotation_id: quoteData.id,
      catalog_item_id: line.catalog_item_id,
      description: line.description,
      quantity: line.quantity, unit: line.unit,
      rate: line.rate, amount: calcLineTotal(line),
      is_custom: line.is_custom,
      notes: line.notes || ''
    }))
    const { error: linesError } = await supabase.from('quotation_line_items').insert(lineItems)
    if (linesError) { 
      alert('Error adding line items: ' + linesError.message)
      addToast('Failed to add line items', 'error')
      return 
    }

    // Upload attachments
    if (formAttachFiles.length > 0) {
      const attachUrls = await uploadAttachments(quoteData.id)
      if (attachUrls.length > 0) {
        const { error: updateError } = await supabase.from('quotations').update({
          attachment_url: attachUrls[0],
          attachment_urls: attachUrls
        }).eq('id', quoteData.id)
        if (updateError) {
          console.error('Error updating quotation with attachments:', updateError)
        }
      }
    }

    const { error: contactError } = await supabase.from('contacts').update({ lead_status: 'quotation_sent' }).eq('id', formLead)
    if (contactError) {
      console.error('Error updating contact status:', contactError)
    }
    
    setShowCreate(false)
    setFormAttachFiles([])
    fetchData()
    addToast('Quotation created successfully!', 'success')
  }

  async function viewQuotationDetail(quotation: Quotation) {
    setSelectedQuotation(quotation)
    const { data, error } = await supabase.from('quotation_line_items').select('*').eq('quotation_id', quotation.id).order('id')
    if (error) console.error('Error fetching line items:', error)
    setQuotationLines((data as QuotationLineItem[]) || [])
    setShowDetail(true)
  }

  function getPublicUrl(storagePath: string): string | null {
    if (!storagePath) return null
    const { data } = supabase.storage.from('quotations').getPublicUrl(storagePath)
    return data?.publicUrl || null
  }

  async function handleMarkSelected(quotation: Quotation) {
    const { error } = await supabase.from('quotations').update({ is_selected: true }).eq('id', quotation.id)
    if (error) {
      addToast('Failed to mark quotation as selected', 'error')
      return
    }
    const { error: contactError } = await supabase.from('contacts').update({ lead_status: 'quotation_selected' }).eq('id', quotation.lead_id)
    if (contactError) {
      console.error('Error updating contact status:', contactError)
    }
    fetchData()
    if (selectedQuotation?.id === quotation.id) {
      setSelectedQuotation({ ...quotation, is_selected: true })
    }
    addToast('Quotation marked as selected', 'success')
  }

  async function handleClientApprove(quotation: Quotation) {
    const { error } = await supabase.from('quotations').update({ client_approved: true }).eq('id', quotation.id)
    if (error) {
      addToast('Failed to log client approval', 'error')
      return
    }
    fetchData()
    if (selectedQuotation?.id === quotation.id) {
      setSelectedQuotation({ ...quotation, client_approved: true })
    }
    addToast('Client approval logged', 'success')
  }

  async function handleAdminLock(quotation: Quotation) {
    if (!confirm('Lock this quotation and create a project? This action cannot be undone.')) return

    const { error: quoteErr } = await supabase.from('quotations').update({ admin_locked: true, client_approved: true }).eq('id', quotation.id)
    if (quoteErr) { 
      alert('Error locking quotation: ' + quoteErr.message)
      addToast('Failed to lock quotation', 'error')
      return 
    }

    const { error: leadErr } = await supabase.from('contacts').update({ lead_status: 'confirmed' }).eq('id', quotation.lead_id)
    if (leadErr) { 
      alert('Error updating lead status: ' + leadErr.message)
      addToast('Failed to update lead status', 'error')
      return 
    }

    const { error: projErr } = await supabase.from('projects').insert({
      quotation_id: quotation.id,
      lead_id: quotation.lead_id,
      contact_id: quotation.lead_id,
      baseline_quotation_value: quotation.total_value,
      target_margin_percent: 10.00,
      actual_cost_total: 0,
      status: 'in_progress'
    })
    if (projErr) {
      alert('❌ Error creating project: ' + projErr.message + '\n\nCheck: Did you run the RLS fix SQL in Supabase? The admin needs INSERT permission on the projects table.')
      addToast('Failed to create project', 'error')
      return
    }

    fetchData()
    if (selectedQuotation?.id === quotation.id) {
      setSelectedQuotation({ ...quotation, admin_locked: true, client_approved: true })
    }
    addToast('Quotation locked and project created successfully!', 'success')
  }

  async function handleUnlock(quotation: Quotation) {
    if (!confirm('Unlock this quotation? The associated project will be deleted and the quotation will return to draft state.')) return

    const { data: proj, error: projError } = await supabase.from('projects').select('id').eq('quotation_id', quotation.id).single()
    if (projError && projError.code !== 'PGRST116') {
      console.error('Error fetching project:', projError)
    }
    
    if (proj) {
      const { error: deleteError } = await supabase.from('projects').delete().eq('id', proj.id)
      if (deleteError) {
        console.error('Error deleting project:', deleteError)
        addToast('Warning: Project deletion may have failed', 'error')
      }
    }

    const { error } = await supabase.from('quotations').update({ admin_locked: false, client_approved: false }).eq('id', quotation.id)
    if (error) { 
      alert('Error unlocking quotation: ' + error.message)
      addToast('Failed to unlock quotation', 'error')
      return 
    }

    const { error: contactError } = await supabase.from('contacts').update({ lead_status: 'active' }).eq('id', quotation.lead_id)
    if (contactError) {
      console.error('Error updating contact status:', contactError)
    }

    fetchData()
    if (selectedQuotation?.id === quotation.id) {
      setSelectedQuotation({ ...quotation, admin_locked: false, client_approved: false })
    }
    addToast('Quotation unlocked and project deleted', 'success')
  }

  async function handleArchive(quotation: Quotation) {
    const { error } = await supabase.from('quotations').update({ is_archived: true }).eq('id', quotation.id)
    if (error) {
      addToast('Failed to archive quotation', 'error')
      return
    }
    fetchData()
    addToast('Quotation archived', 'success')
  }

  const statusBadge = (q: Quotation): ReactElement => {
    if (q.admin_locked) return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">✅ Locked</span>
    if (q.client_approved) return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">⏳ Pending Admin</span>
    if (q.is_selected) return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Selected</span>
    if (q.is_archived) return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-200 text-gray-600">Archived</span>
    return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">Draft</span>
  }

  const pendingCount = quotations.filter(q => q.client_approved && !q.admin_locked).length

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-900">Quotations</h2>
          {role === 'admin' && pendingCount > 0 && (
            <span className="px-3 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full animate-pulse">
              {pendingCount} awaiting approval
            </span>
          )}
        </div>
        <button onClick={openCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
          + New Quotation
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client name or option..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500">
          <option value="created_at">Sort by Date</option>
          <option value="total_value">Sort by Value</option>
        </select>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[
          { key: 'all', label: 'All' },
          { key: 'draft', label: 'Drafts' },
          ...(role === 'admin' ? [{ key: 'pending', label: `Pending Approval (${pendingCount})` }] : []),
          { key: 'locked', label: 'Locked' }
        ].map(tab => (
          <button key={tab.key} onClick={() => setFilterTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md whitespace-nowrap ${filterTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <SkeletonTable />
        ) : filteredQuotations.length === 0 ? (
          <EmptyState
            icon="📄"
            title="No quotations yet"
            description={
              filterTab === 'pending' ? 'No quotations awaiting approval.' :
              filterTab === 'draft' ? 'No draft quotations.' :
              filterTab === 'locked' ? 'No locked quotations yet.' :
              'Create a quotation for a lead to get started'
            }
          />
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredQuotations.map((q: Quotation) => {
              const attachUrls = getAttachmentUrls(q)
              return (
                <div key={q.id}
                  className={`p-4 hover:bg-gray-50 cursor-pointer ${q.client_approved && !q.admin_locked && role === 'admin' ? 'bg-yellow-50 dark:bg-yellow-950 border-l-4 border-l-yellow-400' : ''}`}
                  onClick={() => viewQuotationDetail(q)}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{q.contacts?.name || 'Unknown'}</span>
                        {statusBadge(q)}
                      </div>
                      <div className="mt-1 text-sm text-gray-500">{q.option_label} — ₹{Number(q.total_value).toLocaleString()}</div>
                      <div className="mt-1 text-xs text-gray-400">
                        {new Date(q.created_at).toLocaleDateString()}
                        {q.created_by && <span> | Created by: {q.profiles?.full_name || 'Unknown'}</span>}
                        {attachUrls.length > 0 && <span className="ml-2 text-blue-500">📎 {attachUrls.length} attachment{attachUrls.length > 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-gray-900">₹{Number(q.total_value).toLocaleString()}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Quotation Modal */}
      <Modal isOpen={showCreate} onClose={closeCreateModal}>
        <DragDropUpload
          onFilesSelected={handleFilesSelected}
          accept=".jpg,.jpeg,.png,.pdf"
          maxFiles={MAX_FILES - formAttachFiles.length}
          clickToUpload={false}
        >
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold">New Quotation</h3>
          <button onClick={() => { setShowCreate(false); stopCamera(); }} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleCreateQuotation}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Lead *</label>
              <select required value={formLead} onChange={e => setFormLead(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                <option value="">Select a lead...</option>
                {leads.map(l => (<option key={l.id} value={l.id}>{l.name} — {l.phone || l.site_location}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Option Label</label>
              <input type="text" value={formLabel} onChange={e => setFormLabel(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
            </div>

            {/* Multi-file Attachment Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Attachments ({formAttachFiles.length}/{MAX_FILES})</label>

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

              {/* Thumbnail previews */}
              {formAttachFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {formAttachFiles.map((af, i) => (
                    <div key={i} className="relative group">
                      {af.file?.type?.startsWith('image/') || (!af.file) ? (
                        <img src={af.dataUrl} alt={`Attachment ${i + 1}`} className="h-16 w-16 object-cover rounded border" />
                      ) : (
                        <div className="h-16 w-16 rounded border bg-gray-100 flex items-center justify-center text-xs text-gray-500">PDF</div>
                      )}
                      <button type="button" onClick={() => removeAttachFile(i)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {extractingPdf && (
                <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  Extracting data from PDF...
                </div>
              )}
              {extractError && !extractingPdf && (
                <p className="mt-1 text-xs text-amber-600">{extractError}</p>
              )}

              {formAttachFiles.length < MAX_FILES && !showCamera && (
                <DragDropUpload
                  onFilesSelected={handleFilesSelected}
                  accept=".jpg,.jpeg,.png,.pdf"
                  maxFiles={MAX_FILES - formAttachFiles.length}
                >
                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Choose File
                      <input type="file" accept=".pdf" onChange={handleAttachFileSelect} className="hidden" />
                    </label>
                    <button type="button" onClick={startCamera}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Open Camera
                    </button>
                  </div>
                </DragDropUpload>
              )}
              {formAttachFiles.length >= MAX_FILES && (
                <p className="text-xs text-gray-500">Maximum {MAX_FILES} attachments reached</p>
              )}
              <p className="text-xs text-gray-400 mt-1">PDF files will be automatically processed to extract quotation details</p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Line Items</label>
                <button type="button" onClick={addLine} className="text-xs text-blue-600 hover:text-blue-800">+ Add Line Item</button>
              </div>
              <div className="space-y-2">
                {formLines.map((line, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 bg-gray-50 rounded-md">
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <select value={line.catalog_item_id || ''} onChange={e => updateLine(i, 'catalog_item_id', e.target.value || null)}
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500">
                          <option value="">Custom item</option>
                          {catalog.map(c => (<option key={c.id} value={c.id}>{c.name} (₹{c.standard_rate}/{c.unit})</option>))}
                        </select>
                        <button type="button" onClick={() => removeLine(i)} className="text-red-500 hover:text-red-700 text-sm px-2">✕</button>
                      </div>
                      {!line.catalog_item_id && (
                        <input type="text" placeholder="Description" value={line.description}
                          onChange={e => updateLine(i, 'description', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500" />
                      )}
                      {/* Notes field for extracted data */}
                      <input type="text" placeholder="Notes (e.g., painting system details)" value={line.notes || ''}
                        onChange={e => updateLine(i, 'notes', e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500" />
                      <div className="flex gap-2">
                        <input type="number" min="1" step="1" placeholder="Qty" value={line.quantity || ''}
                          onChange={e => updateLine(i, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500" />
                        <input type="text" placeholder="Unit" value={line.unit}
                          onChange={e => updateLine(i, 'unit', e.target.value)}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500" />
                        <input type="number" min="0" step="0.01" placeholder="Rate" value={line.rate || ''}
                          onChange={e => updateLine(i, 'rate', parseFloat(e.target.value) || 0)}
                          className="w-28 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500" />
                        <span className="text-sm text-gray-600 self-center">₹{calcLineTotal(line).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-right text-sm font-medium text-gray-900">Total: ₹{calcTotal().toLocaleString()}</div>
            </div>

            {/* Additional Cost Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Mechanized Tool Cost (₹)</label>
                <input type="number" min="0" step="0.01" value={formMechanizedToolCost}
                  onChange={e => setFormMechanizedToolCost(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Masking Kit Cost (₹)</label>
                <input type="number" min="0" step="0.01" value={formMaskingKitCost}
                  onChange={e => setFormMaskingKitCost(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Discount (₹)</label>
                <input type="number" min="0" step="0.01" value={formDiscount}
                  onChange={e => setFormDiscount(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Reference Total (₹)</label>
                <input type="number" min="0" step="0.01" value={formReferenceTotal}
                  onChange={e => setFormReferenceTotal(e.target.value)}
                  placeholder="Auto-filled from PDF"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                <p className="text-xs text-gray-400 mt-0.5">Editable reference from PDF</p>
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => { setShowCreate(false); stopCamera(); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={uploadingAttach || extractingPdf}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
              {uploadingAttach ? 'Uploading...' : extractingPdf ? 'Extracting...' : 'Create Quotation'}
            </button>
          </div>
        </form>
        </DragDropUpload>
      </Modal>

      {/* Quotation Detail Modal */}
      <Modal isOpen={showDetail} onClose={() => { setShowDetail(false); setSelectedQuotation(null) }}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold">Quotation Detail</h3>
            <p className="text-sm text-gray-500">{selectedQuotation?.contacts?.name}</p>
            <p className="text-xs text-gray-400">{selectedQuotation?.option_label}</p>
          </div>
          <button onClick={() => { setShowDetail(false); setSelectedQuotation(null) }}
            className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {selectedQuotation && (
          <>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">{statusBadge(selectedQuotation)}</div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <span className={`px-2 py-0.5 rounded ${selectedQuotation.is_selected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100'}`}>📋 Selected</span>
                <span className="text-gray-300">→</span>
                <span className={`px-2 py-0.5 rounded ${selectedQuotation.client_approved ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100'}`}>👤 Client OK</span>
                <span className="text-gray-300">→</span>
                <span className={`px-2 py-0.5 rounded ${selectedQuotation.admin_locked ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>🔒 Admin Lock</span>
              </div>
            </div>

            {/* Additional Costs Display */}
            {(selectedQuotation.mechanized_tool_cost > 0 || selectedQuotation.masking_kit_cost > 0 || selectedQuotation.discount_amount > 0) && (
              <div className="border rounded-md overflow-hidden mb-4 bg-gray-50 p-3">
                <h4 className="text-xs font-medium text-gray-700 mb-2">Additional Costs</h4>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {selectedQuotation.mechanized_tool_cost > 0 && (
                    <div>
                      <span className="text-gray-600">Mechanized Tool:</span>
                      <span className="float-right font-medium">₹{Number(selectedQuotation.mechanized_tool_cost).toLocaleString()}</span>
                    </div>
                  )}
                  {selectedQuotation.masking_kit_cost > 0 && (
                    <div>
                      <span className="text-gray-600">Masking Kit:</span>
                      <span className="float-right font-medium">₹{Number(selectedQuotation.masking_kit_cost).toLocaleString()}</span>
                    </div>
                  )}
                  {selectedQuotation.discount_amount > 0 && (
                    <div>
                      <span className="text-gray-600">Discount:</span>
                      <span className="float-right font-medium text-red-600">-₹{Number(selectedQuotation.discount_amount).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="border rounded-md overflow-x-auto mb-4">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Notes</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Qty</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Rate</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {quotationLines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-4 py-2 text-sm text-gray-900">{line.description}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{line.notes || '—'}</td>
                      <td className="px-4 py-2 text-sm text-gray-500 text-right">{line.quantity} {line.unit}</td>
                      <td className="px-4 py-2 text-sm text-gray-500 text-right">₹{Number(line.rate).toLocaleString()}</td>
                      <td className="px-4 py-2 text-sm text-gray-900 text-right font-medium">₹{Number(line.amount).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-sm font-medium text-gray-700 text-right">Total:</td>
                    <td className="px-4 py-2 text-sm font-bold text-gray-900 text-right">₹{Number(selectedQuotation.total_value).toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Attachments Gallery */}
            {(() => {
              const attachUrls = getAttachmentUrls(selectedQuotation)
              if (attachUrls.length === 0) return null
              return (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Attachments ({attachUrls.length})</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {attachUrls.map((url, i) => {
                      const publicUrl = getPublicUrl(url)
                      if (!publicUrl) return <p key={i} className="text-sm text-gray-400">Attachment unavailable</p>
                      const isPdf = url.toLowerCase().endsWith('.pdf')
                      return (
                        <div key={i} className="relative">
                          {isPdf ? (
                            <div>
                              <iframe src={publicUrl} className="w-full h-24 rounded border" title={`Attachment ${i + 1}`} />
                              <a href={publicUrl} target="_blank" rel="noopener noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline">Open PDF</a>
                            </div>
                          ) : (
                            <div>
                              <img src={publicUrl} alt={`Attachment ${i + 1}`}
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

            <div className="space-y-2">
              <button onClick={() => window.print()}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                🖨️ Print Quotation
              </button>
              
              {role !== 'admin' && !selectedQuotation.client_approved && !selectedQuotation.admin_locked && (
                <>
                  {!selectedQuotation.is_selected && (
                    <button onClick={() => handleMarkSelected(selectedQuotation)}
                      className="w-full px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300 rounded-md hover:bg-blue-100">📋 Mark as Client's Choice (Selected)</button>
                  )}
                  <button onClick={() => handleClientApprove(selectedQuotation)}
                    className="w-full px-4 py-2 text-sm font-medium text-yellow-700 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-300 rounded-md hover:bg-yellow-100">👤 Log Client Approval</button>
                </>
              )}
              {role === 'admin' && !selectedQuotation.admin_locked && (
                selectedQuotation.client_approved ? (
                  <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 rounded-md p-3 mb-2">
                    <p className="text-sm font-medium text-yellow-800 mb-2">⏳ This quotation has client approval and is awaiting your final confirmation.</p>
                    <button onClick={() => handleAdminLock(selectedQuotation)}
                      className="w-full px-4 py-3 text-sm font-bold text-white bg-green-600 rounded-md hover:bg-green-700 shadow-md">🔒 CONFIRM & LOCK — Create Project</button>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                    <p className="text-sm text-gray-500 mb-2">Client hasn't formally approved yet. You can still lock it if you have direct confirmation.</p>
                    <button onClick={() => handleAdminLock(selectedQuotation)}
                      className="w-full px-4 py-3 text-sm font-bold text-white bg-green-700 rounded-md hover:bg-green-800 shadow-md">🔒 ADMIN LOCK & CREATE PROJECT</button>
                  </div>
                )
              )}
              {selectedQuotation.admin_locked && (
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 rounded-md p-3 text-center">
                  <p className="text-sm font-medium text-green-800 mb-2">✅ Quotation is locked and a project has been created.</p>
                  {role === 'admin' && (
                    <button onClick={() => handleUnlock(selectedQuotation)}
                      className="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200">🔓 Unlock Quotation & Delete Project</button>
                  )}
                </div>
              )}
              {!selectedQuotation.is_archived && !selectedQuotation.admin_locked && (
                <button onClick={() => handleArchive(selectedQuotation)}
                  className="w-full px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200">Archive Option</button>
              )}

              {/* Admin-only Delete */}
              {role === 'admin' && selectedQuotation && (
                <div className="pt-4 border-t border-red-200">
                  <button
                    onClick={async () => {
                      if (!selectedQuotation || deleting) return
                      if (!confirm(`Are you sure you want to delete this quotation (${selectedQuotation.option_label})? This cannot be undone.`)) return

                      // Block deletion if locked (has project)
                      if (selectedQuotation.admin_locked) {
                        alert('Cannot delete this quotation — it is locked and has an associated project. Unlock it first.')
                        return
                      }

                      setDeleting(true)
                      try {
                        // Delete line items first
                        await supabase.from('quotation_line_items').delete().eq('quotation_id', selectedQuotation.id)

                        const { error } = await supabase.from('quotations').delete().eq('id', selectedQuotation.id)
                        if (error) {
                          alert('Error deleting quotation: ' + error.message)
                          addToast('Failed to delete quotation', 'error')
                          return
                        }

                        setShowDetail(false)
                        setSelectedQuotation(null)
                        fetchData()
                        addToast('Quotation deleted successfully', 'success')
                      } finally {
                        setDeleting(false)
                      }
                    }}
                    disabled={deleting}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded-md hover:bg-red-100 border border-red-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {deleting ? <><Spinner /> Deleting…</> : '🗑️ Delete Quotation'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}