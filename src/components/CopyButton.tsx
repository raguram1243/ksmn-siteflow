import { useState } from 'react'
import { useToast } from '../contexts/ToastContext'

interface CopyButtonProps {
  text: string
  label?: string
}

export default function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const { addToast } = useToast()

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      addToast(`${label || 'Copied'} to clipboard!`, 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      addToast('Failed to copy', 'error')
    }
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        handleCopy()
      }}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded transition-colors"
      title={`Copy ${label || 'to clipboard'}`}
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Copied!</span>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>Copy</span>
        </>
      )}
    </button>
  )
}