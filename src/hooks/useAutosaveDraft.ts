import { useState, useEffect, useCallback } from 'react'

interface DraftData {
  [key: string]: any
}

export function useAutosaveDraft(key: string, data: DraftData, delay: number = 2000) {
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(`draft_${key}`, JSON.stringify(data))
      setLastSaved(new Date())
      setIsSaving(false)
    } catch (error) {
      console.error('Failed to save draft:', error)
    }
  }, [key, data])

  useEffect(() => {
    if (!data || Object.keys(data).length === 0) return

    setIsSaving(true)
    const timer = setTimeout(saveDraft, delay)
    return () => clearTimeout(timer)
  }, [data, delay, saveDraft])

  const clearDraft = useCallback(() => {
    localStorage.removeItem(`draft_${key}`)
    setLastSaved(null)
  }, [key])

  const loadDraft = useCallback((): DraftData | null => {
    try {
      const saved = localStorage.getItem(`draft_${key}`)
      return saved ? JSON.parse(saved) : null
    } catch (error) {
      console.error('Failed to load draft:', error)
      return null
    }
  }, [key])

  return {
    lastSaved,
    isSaving,
    clearDraft,
    loadDraft
  }
}