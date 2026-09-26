import { db } from '../db/indexeddb'
import { supabase } from '../lib/supabase'

export async function processSyncQueue() {
  const queue = await db.syncQueue.toArray()
  
  for (const item of queue) {
    try {
      if (item.table === 'site_visits' && item.action === 'create') {
        const { error } = await supabase
          .from('site_visits')
          .insert(item.data)
        
        if (error) throw error
        
        // Mark the local record as synced
        if (item.data.id) {
          await db.siteVisits
            .where('id')
            .equals(item.data.id as string)
            .modify({ is_synced: true })
        }
      }
      
      // Remove from queue after successful sync
      if (item.id !== undefined) {
        await db.syncQueue.delete(item.id)
      }
    } catch (err) {
      console.error('Sync failed for item:', item.id, err)
      // Increment retry count
      if (item.id !== undefined) {
        await db.syncQueue.update(item.id, { 
          retry_count: item.retry_count + 1 
        })
      }
    }
  }
}

export function setupAutoSync() {
  // Process queue when coming online
  window.addEventListener('online', () => {
    processSyncQueue()
  })

  // Process queue periodically (every 30 seconds)
  setInterval(() => {
    if (navigator.onLine) {
      processSyncQueue()
    }
  }, 30000)
}