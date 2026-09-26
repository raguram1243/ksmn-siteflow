import { useState, useEffect, useRef } from 'react'
import Modal from './Modal'

interface PromptModalProps {
  isOpen: boolean
  title: string
  message?: string
  label?: string
  confirmLabel?: string
  initialValue?: string
  type?: 'text' | 'number'
  multiline?: boolean
  min?: number
  max?: number
  onConfirm: (value: string) => void
  onCancel: () => void
}

/**
 * Styled replacement for the native prompt() dialog. Supports single-line
 * inputs (text/number) and multiline textareas, with Enter-to-submit.
 */
export default function PromptModal({
  isOpen,
  title,
  message,
  label,
  confirmLabel = 'Confirm',
  initialValue = '',
  type = 'text',
  multiline = false,
  min,
  max,
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isOpen) setValue(initialValue)
  }, [isOpen, initialValue])

  useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(() => {
      const el = multiline ? textareaRef.current : inputRef.current
      el?.focus()
      el?.select?.()
    }, 60)
    return () => clearTimeout(t)
  }, [isOpen, multiline])

  const trimmed = value.trim()
  const invalid = trimmed === '' || (type === 'number' && isNaN(parseFloat(trimmed)))

  function submit() {
    if (invalid) return
    onConfirm(trimmed)
  }

  const fieldClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500'

  return (
    <Modal isOpen={isOpen} onClose={onCancel}>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
      {message && <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{message}</p>}
      <form
        onSubmit={e => {
          e.preventDefault()
          submit()
        }}
      >
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
        )}
        {multiline ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            rows={3}
            className={fieldClass}
          />
        ) : (
          <input
            ref={inputRef}
            type={type}
            value={value}
            onChange={e => setValue(e.target.value)}
            min={min}
            max={max}
            className={fieldClass}
          />
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={invalid}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}