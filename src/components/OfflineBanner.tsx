import { useState, useEffect } from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { db } from '../db/indexeddb'

export default function OfflineBanner() {
  const isOnline = useOnlineStatus()
  const [status, setStatus] = useState<'online' | 'offline' | 'syncing' | 'synced'>('online')
  const [syncQueueCount, setSyncQueueCount] = useState(0)

  useEffect(() => {
    if (!isOnline) {
      setStatus('offline')
      return
    }

    // Online - check if there's anything to sync
    async function checkSyncQueue() {
      const queue = await db.syncQueue.toArray()
      if (queue.length > 0) {
        setStatus('syncing')
        setSyncQueueCount(queue.length)
        
        // Simulate sync completion (in real app, this would be triggered by actual sync completion)
        // For now, we'll just show syncing for a few seconds then show synced
        setTimeout(() => {
          setStatus('synced')
          setSyncQueueCount(0)
          
          // After showing "synced" for 3 seconds, go back to online
          setTimeout(() => {
            setStatus('online')
          }, 3000)
        }, 2000)
      } else {
        setStatus('online')
      }
    }

    checkSyncQueue()
  }, [isOnline])

  if (status === 'online') return null

  // Tones pulled from the shared palette so the banner matches the rest of
  // the app (amber = attention, brand = in-progress, green = success).
  // Icons are inline SVG rather than emoji for a consistent look.
  const messages = {
    offline: {
      text: "You're offline — changes will sync when reconnected",
      bg: 'bg-amber-500',
      icon: 'M8.72 8.72L12 12m0 0l3.28 3.28M12 12l3.28-3.28M12 12l-3.28 3.28M5.65 5.65A9 9 0 0012 21a9 9 0 008.35-4.65M5.65 5.65A9 9 0 0112 3c1.69 0 3.27.47 4.65 1.28M1 1l22 22',
    },
    syncing: {
      text: `Back online, syncing ${syncQueueCount} item${syncQueueCount !== 1 ? 's' : ''}…`,
      bg: 'bg-brand-600',
      icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    },
    synced: {
      text: 'All synced successfully!',
      bg: 'bg-green-600',
      icon: 'm5 13 4 4L19 7',
    },
  } as const

  const { text, bg, icon } = messages[status]

  return (
    <div className={`fixed top-0 left-0 right-0 ${bg} text-white px-4 py-2.5 z-[60] shadow-lg`} role="status">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm font-medium">
        <svg
          className={`w-4 h-4 flex-shrink-0 ${status === 'syncing' ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        <span>{text}</span>
      </div>
    </div>
  )
}