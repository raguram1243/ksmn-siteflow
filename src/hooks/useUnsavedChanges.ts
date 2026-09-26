import { useEffect, useCallback } from 'react'
import { useConfirm } from '../contexts/ConfirmContext'

interface UseUnsavedChangesOptions {
  message?: string
}

export function useUnsavedChanges(
  hasChanges: boolean,
  options: UseUnsavedChangesOptions = {}
) {
  const { message = 'You have unsaved changes. Are you sure you want to leave?' } = options
  const confirm = useConfirm()

  // Handle browser back/close navigation.
  // NOTE: Browsers only show their own native dialog here and ignore custom
  // text, so this necessarily stays a beforeunload guard.
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

  // Handle in-app navigation (e.g., clicking links) with the styled dialog.
  const handleNavigation = useCallback(async (navigationAction: () => void) => {
    if (!hasChanges) {
      navigationAction()
      return
    }

    const confirmed = await confirm({
      title: 'Discard unsaved changes?',
      message,
      confirmLabel: 'Discard & Leave',
      tone: 'warning',
    })
    if (confirmed) {
      navigationAction()
    }
  }, [hasChanges, message, confirm])

  return {
    handleNavigation
  }
}