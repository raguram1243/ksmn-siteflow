import { useState, useCallback, useRef, createContext, useContext, type ReactNode } from 'react'
import ConfirmDialog, { type ConfirmTone } from '../components/ConfirmDialog'

export interface ConfirmOptions {
  title: string
  message?: string
  details?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined)

/**
 * Provides an async `confirm()` that renders a styled in-app dialog and
 * resolves true/false. Replaces every native window.confirm() call.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    // A second request supersedes any in-flight one (resolve it as cancelled
    // so awaiting callers never hang).
    if (resolverRef.current) {
      resolverRef.current(false)
    }
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const settle = useCallback((result: boolean) => {
    setOptions(null)
    const resolve = resolverRef.current
    resolverRef.current = null
    if (resolve) resolve(result)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        isOpen={options !== null}
        title={options?.title ?? ''}
        message={options?.message}
        details={options?.details}
        confirmLabel={options?.confirmLabel}
        cancelLabel={options?.cancelLabel}
        tone={options?.tone ?? 'neutral'}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext)
  if (context === undefined) {
    throw new Error('useConfirm must be used within a ConfirmProvider')
  }
  return context
}