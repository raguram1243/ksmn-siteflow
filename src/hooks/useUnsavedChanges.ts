import { useState, useEffect, useCallback } from 'react'

interface UseUnsavedChangesOptions {
  message?: string
}

export function useUnsavedChanges(
  hasChanges: boolean,
  options: UseUnsavedChangesOptions = {}
) {
  const { message = 'You have unsaved changes. Are you sure you want to leave?' } = options
  const [showWarning, setShowWarning] = useState(false)

  // Handle browser back/close navigation
  useEffect(() => {
    if (!hasChanges) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = message
      return message
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasChanges, message])

  // Handle in-app navigation (e.g., clicking links)
  const handleNavigation = useCallback((navigationAction: () => void) => {
    if (!hasChanges) {
      navigationAction()
      return
    }

    const confirmed = window.confirm(message)
    if (confirmed) {
      navigationAction()
    }
  }, [hasChanges, message])

  // Reset warning state when changes are saved
  useEffect(() => {
    if (!hasChanges) {
      setShowWarning(false)
    }
  }, [hasChanges])

  return {
    showWarning,
    setShowWarning,
    handleNavigation
  }
}