import { useState, useEffect, useCallback } from 'react'

interface RefreshState {
  isRefreshing: boolean
  refresh: () => Promise<void>
  lastRefreshed: Date | null
}

export function useRefresh(refreshFn: () => Promise<void> | void): RefreshState {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    if (isRefreshing) return
    
    setIsRefreshing(true)
    try {
      await refreshFn()
      setLastRefreshed(new Date())
    } finally {
      // Small delay to show the spinning animation
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }, [refreshFn, isRefreshing])

  // Auto-refresh every 5 minutes when tab is visible
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>

    async function autoRefresh() {
      // Only auto-refresh if tab is visible
      if (document.visibilityState === 'visible') {
        await refresh()
      }
    }

    // Start auto-refresh interval
    intervalId = setInterval(autoRefresh, 5 * 60 * 1000) // 5 minutes

    // Handle visibility change - pause/resume
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // Refresh immediately when tab becomes visible again
        refresh()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refresh])

  return { isRefreshing, refresh, lastRefreshed }
}