import { useState, useRef, type ReactNode } from 'react'

interface DragDropUploadProps {
  onFilesSelected: (files: File[]) => void
  accept?: string
  maxFiles?: number
  clickToUpload?: boolean
  children: ReactNode
}

export default function DragDropUpload({ onFilesSelected, accept, maxFiles, clickToUpload = true, children }: DragDropUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      onFilesSelected(files)
    }
  }

  function handleClick() {
    inputRef.current?.click()
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      onFilesSelected(files)
    }
    // Reset input so the same file can be selected again
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={clickToUpload ? handleClick : undefined}
      className={`relative cursor-pointer transition-all duration-200 ${
        isDragging ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950' : ''
      }`}
    >
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={maxFiles !== 1}
        onChange={handleInputChange}
        className="hidden"
      />
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-50 dark:bg-blue-950 bg-opacity-90 rounded-md">
          <div className="text-center">
            <svg className="w-12 h-12 text-blue-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-medium text-blue-900">Drop files here</p>
          </div>
        </div>
      )}
    </div>
  )
}