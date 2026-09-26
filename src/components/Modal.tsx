import { useEffect, useRef, useCallback } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

export default function Modal({ isOpen, onClose, children, size = 'md' }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const isClosingRef = useRef(false)

  // Size classes for different modal widths
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if clicking directly on the backdrop (not on modal content)
    if (e.target === e.currentTarget && !isClosingRef.current) {
      onClose()
    }
  }, [onClose])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !isClosingRef.current) {
      isClosingRef.current = true
      onClose()
      // Reset flag after a short delay to allow modal to close
      setTimeout(() => {
        isClosingRef.current = false
      }, 100)
    }
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden'

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      // Restore body scroll when modal closes
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 modal-animate-in p-4 sm:p-6"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className={`bg-white dark:bg-gray-800 rounded-lg w-full ${sizeClasses[size]} mx-4 modal-animate-in flex flex-col max-h-[90vh] shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}
