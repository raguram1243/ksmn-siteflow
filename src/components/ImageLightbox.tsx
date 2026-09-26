import { useState, useEffect, useCallback } from 'react'

interface ImageLightboxProps {
  isOpen: boolean
  onClose: () => void
  src: string
  alt?: string
  isPdf?: boolean
}

export default function ImageLightbox({ isOpen, onClose, src, alt = 'Image', isPdf = false }: ImageLightboxProps) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const resetZoom = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    if (isOpen) {
      resetZoom()
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, resetZoom])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale(prev => Math.min(Math.max(prev + delta, 0.5), 3))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const distance = Math.sqrt(dx * dx + dy * dy)
      setDragStart({ x: distance, y: scale })
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const distance = Math.sqrt(dx * dx + dy * dy)
      const newScale = Math.min(Math.max((dragStart.y * distance) / dragStart.x, 0.5), 3)
      setScale(newScale)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black bg-opacity-90 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-gray-300 z-10 p-2"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Zoom indicator */}
      {scale > 1 && (
        <div className="absolute top-4 left-4 text-white text-sm bg-black bg-opacity-50 px-3 py-1 rounded-full">
          {Math.round(scale * 100)}%
        </div>
      )}

      {/* Reset zoom button */}
      {scale > 1 && (
        <button
          onClick={resetZoom}
          className="absolute bottom-4 left-4 text-white hover:text-gray-300 bg-black bg-opacity-50 px-4 py-2 rounded-lg text-sm"
        >
          Reset Zoom
        </button>
      )}

      {/* Image/PDF container */}
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {isPdf ? (
          <iframe
            src={src}
            className="w-full h-full border-0"
            title={alt}
          />
        ) : (
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              cursor: scale > 1 ? 'grab' : 'default'
            }}
            draggable={false}
          />
        )}
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 right-4 text-white text-xs bg-black bg-opacity-50 px-3 py-2 rounded-lg">
        {!isPdf && (
          <>
            <div>Scroll to zoom • Drag to pan</div>
            <div>Click outside or press ESC to close</div>
          </>
        )}
        {isPdf && (
          <div>Press ESC to close</div>
        )}
      </div>
    </div>
  )
}