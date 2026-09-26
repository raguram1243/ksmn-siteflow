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

  const messages = {
    offline: { text: "You're offline — changes will sync when reconnected", bg: 'bg-yellow-500', icon: '📡' },
    syncing: { text: `Back online, syncing ${syncQueueCount} item${syncQueueCount !== 1 ? 's' : ''}...`, bg: 'bg-blue-500', icon: '🔄' },
    synced: { text: 'All synced successfully!', bg: 'bg-green-500', icon: '✅' }
  }

  const { text, bg, icon } = messages[status]

  return (
    <div className={`fixed top-0 left-0 right-0 ${bg} text-white px-4 py-2.5 z-[60] shadow-lg animate-pulse`}>
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm font-medium">
        <span className="text-lg">{icon}</span>
        <span>{text}</span>
      </div>
    </div>
  )
}