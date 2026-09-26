import Modal from './Modal'

export type ConfirmTone = 'danger' | 'warning' | 'neutral' | 'success'

const TONE_STYLES: Record<ConfirmTone, { icon: string; iconBg: string; button: string }> = {
  danger: {
    icon: 'M12 9v2m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z',
    iconBg: 'bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400',
    button: 'bg-red-600 hover:bg-red-700',
  },
  warning: {
    icon: 'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z',
    iconBg: 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400',
    button: 'bg-amber-600 hover:bg-amber-700',
  },
  neutral: {
    icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    iconBg: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
    button: 'bg-brand-600 hover:bg-brand-700',
  },
  success: {
    icon: 'm9 12 2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    iconBg: 'bg-green-100 dark:bg-green-950 text-green-600 dark:text-green-400',
    button: 'bg-green-600 hover:bg-green-700',
  },
}

export interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message?: string
  details?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Styled, accessible replacement for the native confirm() dialog.
 * Tones make irreversible actions visually distinct from routine ones.
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  details,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'neutral',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const style = TONE_STYLES[tone]

  return (
    <Modal isOpen={isOpen} onClose={loading ? () => {} : onCancel} size="sm">
      <div className="flex gap-4">
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${style.iconBg}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={style.icon} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          {message && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">{message}</p>
          )}
          {details && (
            <div className="mt-3 px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
              {details}
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 ${style.button}`}
        >
          {loading ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}