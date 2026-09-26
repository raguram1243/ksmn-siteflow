import { useState, useCallback, createContext, useContext, type ReactNode } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
  actionLabel?: string
  onAction?: () => void
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (message: string, type?: ToastType) => void
  addUndoToast: (message: string, onUndo: () => void, duration?: number) => { id: string; cancel: () => void }
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

// Unique even when two toasts are created in the same millisecond
function createToastId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = createToastId()
    setToasts(prev => [...prev, { id, message, type }])
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  const addUndoToast = useCallback((message: string, onUndo: () => void, duration: number = 10000) => {
    const id = createToastId()
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    setToasts(prev => [...prev, { id, message, type: 'warning', actionLabel: 'Undo', onAction: () => {
      if (timeoutId) clearTimeout(timeoutId)
      cancelled = true
      onUndo()
      removeToast(id)
    }}])

    timeoutId = setTimeout(() => {
      if (!cancelled) {
        setToasts(prev => prev.filter(t => t.id !== id))
      }
    }, duration)

    return {
      id,
      cancel: () => {
        if (timeoutId) clearTimeout(timeoutId)
        cancelled = true
        setToasts(prev => prev.filter(t => t.id !== id))
      }
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, addUndoToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export type { Toast, ToastContextType }
