import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

interface PendingQuotation {
  id: string
  lead_name: string
  option_label: string
  created_at: string
  type: 'quotation'
}

interface PendingPayment {
  id: string
  project_name: string
  amount: number
  date: string
  created_by_name: string
  type: 'payment'
}

interface PendingExpense {
  id: string
  project_name: string
  item_name: string
  amount: number
  date: string
  type: 'expense'
}

type PendingItem = PendingQuotation | PendingPayment | PendingExpense

export default function NotificationBell() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState<PendingItem[]>([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (role !== 'admin') return

    async function fetchPending() {
      // Fetch pending quotations
      const { data: quotations } = await supabase
        .from('quotations')
        .select('id, option_label, created_at, contacts(name)')
        .eq('client_approved', true)
        .eq('admin_locked', false)
        .order('created_at', { ascending: false })

      // Fetch pending payments
      const { data: payments } = await supabase
        .from('project_payments')
        .select('id, amount, date, created_by, projects!inner(contacts!projects_contact_id_fkey(name))')
        .eq('status', 'pending')
        .order('date', { ascending: false })

      // Fetch pending expenses
      const { data: expenses } = await supabase
        .from('expense_entries')
        .select('id, item_name, amount, date, projects!inner(contacts!projects_contact_id_fkey(name))')
        .eq('status', 'pending')
        .order('date', { ascending: false })

      const items: PendingItem[] = []

      if (quotations) {
        items.push(...quotations.map((q: any) => ({
          id: q.id,
          lead_name: q.contacts?.name || 'Unknown',
          option_label: q.option_label,
          created_at: q.created_at,
          type: 'quotation' as const
        })))
      }

      if (payments) {
        items.push(...payments.map((p: any) => ({
          id: p.id,
          project_name: p.projects?.contacts?.name || 'Unknown Project',
          amount: p.amount,
          date: p.date,
          created_by_name: p.created_by,
          type: 'payment' as const
        })))
      }

      if (expenses) {
        items.push(...expenses.map((e: any) => ({
          id: e.id,
          project_name: e.projects?.contacts?.name || 'Unknown Project',
          item_name: e.item_name,
          amount: e.amount,
          date: e.date,
          type: 'expense' as const
        })))
      }

      // Sort by date (most recent first)
      items.sort((a, b) => {
        const dateA = a.type === 'quotation' ? a.created_at : a.date
        const dateB = b.type === 'quotation' ? b.created_at : b.date
        return new Date(dateB).getTime() - new Date(dateA).getTime()
      })
      
      setPending(items)
    }

    fetchPending()
    const interval = setInterval(fetchPending, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [role])

  if (role !== 'admin') return null

  const handleClick = (item: PendingItem) => {
    setIsOpen(false)
    if (item.type === 'quotation') {
      navigate('/quotations')
      setTimeout(() => {
        const event = new CustomEvent('viewQuotation', { detail: { quotationId: item.id } })
        window.dispatchEvent(event)
      }, 100)
    } else if (item.type === 'expense') {
      navigate('/expenses')
    } else {
      navigate('/payments')
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {pending.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
            {pending.length}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
            <div className="p-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Pending Approvals ({pending.length})</h3>
            </div>
            {pending.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">
                No pending approvals
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {pending.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleClick(item)}
                    className="w-full text-left p-3 hover:bg-gray-50 transition-colors"
                  >
                    {item.type === 'quotation' ? (
                      <>
                        <div className="text-sm font-medium text-gray-900">
                          {item.lead_name}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {item.option_label}
                        </div>
                        <div className="text-xs text-blue-600 mt-1 font-medium">
                          📄 Quotation
                        </div>
                      </>
                    ) : item.type === 'expense' ? (
                      <>
                        <div className="text-sm font-medium text-gray-900">
                          {item.project_name}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {item.item_name} — ₹{Number(item.amount).toLocaleString()}
                        </div>
                        <div className="text-xs text-orange-600 mt-1 font-medium">
                          🧾 Expense
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-medium text-gray-900">
                          {item.project_name}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          ₹{Number(item.amount).toLocaleString()}
                        </div>
                        <div className="text-xs text-green-600 mt-1 font-medium">
                          💳 Payment
                        </div>
                      </>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(item.type === 'quotation' ? item.created_at : item.date).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}