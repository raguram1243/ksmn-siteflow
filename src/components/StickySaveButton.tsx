import type { ReactNode } from 'react'

interface StickySaveButtonProps {
  children: ReactNode
  disabled?: boolean
  className?: string
}

export default function StickySaveButton({ children, disabled = false, className = '' }: StickySaveButtonProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={disabled}
            className={`px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md ${className}`}
          >
            {children}
          </button>
        </div>
      </div>
    </div>
  )
}