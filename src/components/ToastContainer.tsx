import { useToast } from '../contexts/ToastContext'
import type { ToastType } from '../contexts/ToastContext'

const toastStyles: Record<ToastType, { bg: string; icon: string; border: string }> = {
  success: {
    bg: 'bg-green-50 dark:bg-green-950',
    icon: '✓',
    border: 'border-green-400'
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-950',
    icon: '✕',
    border: 'border-red-400'
  },
  warning: {
    bg: 'bg-yellow-50 dark:bg-yellow-950',
    icon: '⚠',
    border: 'border-yellow-400'
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950',
    icon: 'ℹ',
    border: 'border-blue-400'
  }
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div className="fixed top-4 right-4 z-[70] space-y-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const style = toastStyles[toast.type]
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto ${style.bg} border-l-4 ${style.border} rounded-lg shadow-lg p-4 transform transition-all duration-300 ease-in-out animate-slide-in`}
            style={{
              animation: 'slideIn 0.3s ease-out'
            }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 text-lg font-bold text-gray-700">
                {style.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 break-words">
                  {toast.message}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {toast.actionLabel && toast.onAction && (
                  <button
                    onClick={toast.onAction}
                    className="text-xs font-semibold text-gray-900 underline hover:text-gray-700"
                  >
                    {toast.actionLabel}
                  </button>
                )}
                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}