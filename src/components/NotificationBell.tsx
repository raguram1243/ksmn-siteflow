import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAlerts, alertKey, type AlertTone } from '../contexts/AlertsContext'

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

const ALERT_TONE_DOT: Record<AlertTone, string> = {
  danger: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-brand-500',
  success: 'bg-green-500',
}

const ALERT_TONE_CHIP: Record<AlertTone, string> = {
  danger: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
  warning: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300',
  info: 'bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300',
  success: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
}

const ALERT_TONE_LABEL: Record<AlertTone, string> = {
  danger: 'Critical',
  warning: 'Warning',
  info: 'Info',
  success: 'Resolved',
}

const CHECK_ICON = 'M5 13l4 4L19 7'
const TRASH_ICON = 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3'

const TYPE_META: Record<PendingItem['type'], { emoji: string; label: string; cls: string }> = {
  quotation: { emoji: '📄', label: 'Quotation', cls: 'text-blue-600 dark:text-blue-400' },
  expense: { emoji: '🧾', label: 'Expense', cls: 'text-orange-600 dark:text-orange-400' },
  payment: { emoji: '💳', label: 'Payment', cls: 'text-green-600 dark:text-green-400' },
}

/** Pending-approval list, split out to keep the main component readable. */
function PendingPanel({
  items,
  readIds,
  onOpen,
  onToggleRead,
  onDelete,
}: {
  items: PendingItem[]
  readIds: string[]
  onOpen: (item: PendingItem) => void
  onToggleRead: (id: string) => void
  onDelete: (id: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-3xl mb-2">📭</div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No pending approvals</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Quotations, payments and expenses awaiting review.
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700">
      {items.map(item => {
        const read = readIds.includes(item.id)
        const meta = TYPE_META[item.type]
        const title = item.type === 'quotation' ? item.lead_name : item.project_name
        const detail =
          item.type === 'quotation'
            ? item.option_label
            : `₹${Number(item.amount).toLocaleString()}${
                item.type === 'expense' ? ` · ${item.item_name}` : ''
              }`
        const date = item.type === 'quotation' ? item.created_at : item.date

        return (
          <div
            key={`${item.type}-${item.id}`}
            className={`flex items-start gap-2 p-3 transition-colors ${read ? 'bg-gray-50 dark:bg-gray-900/40' : 'bg-white dark:bg-gray-800'}`}
          >
            <button onClick={() => onOpen(item)} className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm">{meta.emoji}</span>
                <span className={`text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
                {!read && <span className="w-1.5 h-1.5 rounded-full bg-brand-500" aria-label="Unread" />}
              </div>
              <p className={`text-sm mt-1 ${read ? 'font-normal text-gray-600 dark:text-gray-400' : 'font-semibold text-gray-900 dark:text-gray-100'}`}>
                {title}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{detail}</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(date).toLocaleDateString()}</p>
            </button>

            <div className="flex-shrink-0 flex items-center gap-0.5">
              <button
                onClick={() => onToggleRead(item.id)}
                className="p-1.5 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 rounded transition-colors"
                title={read ? 'Mark as unread' : 'Mark as read'}
                aria-label={read ? 'Mark as unread' : 'Mark as read'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d={CHECK_ICON} />
                </svg>
              </button>
              <button
                onClick={() => onDelete(item.id)}
                className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                title="Delete"
                aria-label="Delete notification"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d={TRASH_ICON} />
                </svg>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function NotificationBell() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState<PendingItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [tab, setTab] = useState<'alerts' | 'approvals'>('alerts')
  const [deletedPending, setDeletedPending] = useState<string[]>([])
  const [readPending, setReadPending] = useState<string[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const {
    alerts,
    isRead,
    isDismissed,
    markRead,
    markUnread,
    markAllRead,
    dismiss,
    restoreAll,
  } = useAlerts()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (role !== 'admin') return

    async function fetchPending() {
      const { data: quotations } = await supabase
        .from('quotations')
        .select('id, option_label, created_at, contacts(name)')
        .eq('client_approved', true)
        .eq('admin_locked', false)
        .order('created_at', { ascending: false })

      const { data: payments } = await supabase
        .from('project_payments')
        .select('id, amount, date, created_by, projects!inner(contacts!projects_contact_id_fkey(name))')
        .eq('status', 'pending')
        .order('date', { ascending: false })

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

      items.sort((a, b) => {
        const dateA = a.type === 'quotation' ? a.created_at : a.date
        const dateB = b.type === 'quotation' ? b.created_at : b.date
        return new Date(dateB).getTime() - new Date(dateA).getTime()
      })

      setPending(items)
    }

    fetchPending()
    const interval = setInterval(fetchPending, 30000)
    return () => clearInterval(interval)
  }, [role])

  if (role !== 'admin') return null

  const visibleAlerts = alerts.filter(a => !isDismissed(alertKey(a)))
  const dismissedCount = alerts.length - visibleAlerts.length
  const visiblePending = pending.filter(p => !deletedPending.includes(p.id))

  const unreadAlerts = visibleAlerts.filter(a => !isRead(alertKey(a))).length
  const unreadPending = visiblePending.filter(p => !readPending.includes(p.id)).length
  const totalUnread = unreadAlerts + unreadPending

  const handlePendingClick = (item: PendingItem) => {
    setReadPending(prev => (prev.includes(item.id) ? prev : [...prev, item.id]))
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
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(v => !v)}
        className="relative p-2.5 text-gray-600 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
        title="Notifications"
        aria-label={`Notifications${totalUnread > 0 ? ` (${totalUnread} unread)` : ''}`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
          {/* Header + bulk actions */}
          <div className="px-3 pt-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
              <div className="flex items-center gap-1">
                {tab === 'alerts' && unreadAlerts > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    Mark all read
                  </button>
                )}
                {tab === 'approvals' && unreadPending > 0 && (
                  <button
                    onClick={() => setReadPending(visiblePending.map(p => p.id))}
                    className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => {
                    if (tab === 'alerts') restoreAll()
                    else setDeletedPending(visiblePending.map(p => p.id))
                  }}
                  className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:underline"
                >
                  {tab === 'alerts' ? 'Restore all' : 'Delete all'}
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 -mb-px">
              <button
                onClick={() => setTab('alerts')}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  tab === 'alerts'
                    ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Alerts
                {unreadAlerts > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px]">{unreadAlerts}</span>
                )}
              </button>
              <button
                onClick={() => setTab('approvals')}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  tab === 'approvals'
                    ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Approvals
                {unreadPending > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px]">{unreadPending}</span>
                )}
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {tab === 'alerts' ? (
              visibleAlerts.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="text-3xl mb-2">✅</div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">All clear</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {dismissedCount > 0
                      ? 'Deleted alerts hidden. Use "Restore all" to bring them back.'
                      : 'No alerts right now.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {visibleAlerts.map(alert => {
                    const key = alertKey(alert)
                    const read = isRead(key)
                    return (
                      <div
                        key={key}
                        className={`flex items-start gap-2.5 p-3 transition-colors ${read ? 'bg-gray-50 dark:bg-gray-900/40' : 'bg-white dark:bg-gray-800'}`}
                      >
                        <span className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${ALERT_TONE_DOT[alert.tone]}`} />

                        <button
                          onClick={() => {
                            markRead(key)
                            if (alert.path) {
                              setIsOpen(false)
                              navigate(alert.path)
                            }
                          }}
                          className="flex-1 min-w-0 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${ALERT_TONE_CHIP[alert.tone]}`}>
                              {ALERT_TONE_LABEL[alert.tone]}
                            </span>
                            {!read && <span className="w-1.5 h-1.5 rounded-full bg-brand-500" aria-label="Unread" />}
                          </div>
                          <p className={`text-sm mt-1 ${read ? 'font-normal text-gray-600 dark:text-gray-400' : 'font-semibold text-gray-900 dark:text-gray-100'}`}>
                            {alert.title}
                          </p>
                          {alert.detail && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{alert.detail}</p>
                          )}
                          {alert.path && (
                            <span className="inline-block mt-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400">
                              {alert.actionLabel || 'Review'} →
                            </span>
                          )}
                        </button>

                        <div className="flex-shrink-0 flex items-center gap-0.5">
                          <button
                            onClick={() => (read ? markUnread(key) : markRead(key))}
                            className="p-1.5 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 rounded transition-colors"
                            title={read ? 'Mark as unread' : 'Mark as read'}
                            aria-label={read ? 'Mark as unread' : 'Mark as read'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d={CHECK_ICON} />
                            </svg>
                          </button>
                          <button
                            onClick={() => dismiss(key)}
                            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                            title="Delete"
                            aria-label="Delete notification"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d={TRASH_ICON} />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            ) : (
              <PendingPanel
                items={visiblePending}
                readIds={readPending}
                onOpen={handlePendingClick}
                onToggleRead={id =>
                  setReadPending(prev =>
                    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                  )
                }
                onDelete={id => setDeletedPending(prev => [...prev, id])}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
