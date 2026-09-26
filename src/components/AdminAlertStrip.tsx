import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export type AlertTone = 'danger' | 'warning' | 'info' | 'success'

export interface AdminAlert {
  id: string
  tone: AlertTone
  title: string
  detail?: string
  actionLabel?: string
  path?: string
}

interface AdminAlertStripProps {
  alerts: AdminAlert[]
}

const TONE_STYLES: Record<AlertTone, { wrap: string; iconBg: string; icon: string }> = {
  danger: {
    wrap: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900',
    iconBg: 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400',
    icon: 'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z',
  },
  warning: {
    wrap: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900',
    iconBg: 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1',
  },
  info: {
    wrap: 'bg-brand-50 dark:bg-brand-950/40 border-brand-200 dark:border-brand-900',
    iconBg: 'bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-400',
    icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  },
  success: {
    wrap: 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900',
    iconBg: 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400',
    icon: 'm9 12 2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  },
}

/**
 * Dismissible alert banner for the admin dashboard. Surfaces the signals the
 * owner needs to act on today. Renders nothing when every alert is dismissed
 * or the list is empty.
 */
export default function AdminAlertStrip({ alerts }: AdminAlertStripProps) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState<string[]>([])

  const visible = alerts.filter(a => !dismissed.includes(a.id))
  if (visible.length === 0) return null

  return (
    <section aria-label="Alerts requiring attention" className="mb-6 space-y-2">
      {visible.map(alert => {
        const style = TONE_STYLES[alert.tone]
        return (
          <div
            key={alert.id}
            role="status"
            className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${style.wrap}`}
          >
            <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${style.iconBg}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d={style.icon} />
              </svg>
            </span>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{alert.title}</p>
              {alert.detail && (
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{alert.detail}</p>
              )}
            </div>

            {alert.path && (
              <button
                onClick={() => navigate(alert.path!)}
                className="flex-shrink-0 self-center px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-md hover:bg-brand-700"
              >
                {alert.actionLabel || 'Review'}
              </button>
            )}

            <button
              onClick={() => setDismissed(prev => [...prev, alert.id])}
              className="flex-shrink-0 self-center p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded transition-colors"
              aria-label={`Dismiss: ${alert.title}`}
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })}
    </section>
  )
}