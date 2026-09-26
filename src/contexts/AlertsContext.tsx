import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react'

export type AlertTone = 'danger' | 'warning' | 'info' | 'success'

export interface AdminAlert {
  id: string
  tone: AlertTone
  title: string
  detail?: string
  actionLabel?: string
  path?: string
  /**
   * Changes whenever the underlying data changes (e.g. the count). Dismissal
   * is keyed on id+signature so a resolved-then-returning alert resurfaces
   * instead of staying permanently hidden.
   */
  signature?: string
}

interface AlertsContextType {
  alerts: AdminAlert[]
  setAlerts: (alerts: AdminAlert[]) => void
  readKeys: string[]
  dismissedKeys: string[]
  isRead: (key: string) => boolean
  isDismissed: (key: string) => boolean
  markRead: (key: string) => void
  markAllRead: () => void
  markUnread: (key: string) => void
  dismiss: (key: string) => void
  restoreAll: () => void
  unreadCount: number
}

const AlertsContext = createContext<AlertsContextType | null>(null)

const STORAGE_KEY = 'ksmn-alert-state-v1'

interface Stored {
  read: string[]
  dismissed: string[]
}

function load(): Stored {
  if (typeof window === 'undefined') return { read: [], dismissed: [] }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { read: [], dismissed: [] }
    const parsed = JSON.parse(raw)
    return {
      read: Array.isArray(parsed.read) ? parsed.read : [],
      dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed : [],
    }
  } catch {
    return { read: [], dismissed: [] }
  }
}

function save(state: Stored) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable (private mode) — state stays in memory */
  }
}

export function alertKey(alert: AdminAlert) {
  return `${alert.id}:${alert.signature ?? ''}`
}

/**
 * Holds the dashboard's derived alerts plus their read/dismissed state, so the
 * notification bell can own them (the dashboard no longer renders a strip).
 */
export function AlertsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AdminAlert[]>([])
  const [read, setRead] = useState<string[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])

  // Load persisted state once, after mount to avoid SSR/hydration mismatch.
  useEffect(() => {
    const stored = load()
    setRead(stored.read)
    setDismissed(stored.dismissed)
  }, [])

  const persist = useCallback((nextRead: string[], nextDismissed: string[]) => {
    save({ read: nextRead, dismissed: nextDismissed })
  }, [])

  const markRead = useCallback((key: string) => {
    setRead(prev => {
      if (prev.includes(key)) return prev
      const next = [...prev, key]
      persist(next, dismissed)
      return next
    })
  }, [persist, dismissed])

  const markUnread = useCallback((key: string) => {
    setRead(prev => {
      const next = prev.filter(k => k !== key)
      persist(next, dismissed)
      return next
    })
  }, [persist, dismissed])

  const markAllRead = useCallback(() => {
    setRead(prev => {
      const keys = alerts.map(alertKey)
      const next = Array.from(new Set([...prev, ...keys]))
      persist(next, dismissed)
      return next
    })
  }, [alerts, persist, dismissed])

  const dismiss = useCallback((key: string) => {
    setDismissed(prev => {
      if (prev.includes(key)) return prev
      const next = [...prev, key]
      persist(read, next)
      return next
    })
  }, [persist, read])

  const restoreAll = useCallback(() => {
    setDismissed([])
    persist(read, [])
  }, [persist, read])

  // Prune stored keys for alerts that no longer exist, so the arrays don't
  // grow forever and stale keys don't resurface if an id returns later.
  useEffect(() => {
    if (alerts.length === 0) return
    const current = new Set(alerts.map(alertKey))
    const prune = (list: string[]) => list.filter(k => current.has(k))
    let changed = false
    setRead(prev => {
      const next = prune(prev)
      if (next.length !== prev.length) changed = true
      return next
    })
    setDismissed(prev => {
      const next = prune(prev)
      if (next.length !== prev.length) changed = true
      return next
    })
    if (changed) {
      // Best-effort sync to storage
      try {
        const stored = load()
        save({ read: stored.read.filter(k => current.has(k)), dismissed: stored.dismissed.filter(k => current.has(k)) })
      } catch { /* noop */ }
    }
  }, [alerts])

  const value: AlertsContextType = {
    alerts,
    setAlerts,
    readKeys: read,
    dismissedKeys: dismissed,
    isRead: (key) => read.includes(key),
    isDismissed: (key) => dismissed.includes(key),
    markRead,
    markAllRead,
    markUnread,
    dismiss,
    restoreAll,
    unreadCount: alerts.filter(a => !read.includes(alertKey(a)) && !dismissed.includes(alertKey(a))).length,
  }

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>
}

export function useAlerts() {
  const ctx = useContext(AlertsContext)
  if (!ctx) throw new Error('useAlerts must be used within an AlertsProvider')
  return ctx
}