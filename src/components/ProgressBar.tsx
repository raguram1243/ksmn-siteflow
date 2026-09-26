import { useEffect, useState } from 'react'

export default function ProgressBar() {
  const [progress, setProgress] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    function handleStart() {
      setIsVisible(true)
      setProgress(30)
    }

    function handleProgress() {
      setProgress(prev => Math.min(prev + 20, 80))
    }

    function handleComplete() {
      setProgress(100)
      setTimeout(() => {
        setIsVisible(false)
        setProgress(0)
      }, 300)
    }

    window.addEventListener('progress-start', handleStart)
    window.addEventListener('progress-update', handleProgress)
    window.addEventListener('progress-complete', handleComplete)

    return () => {
      window.removeEventListener('progress-start', handleStart)
      window.removeEventListener('progress-update', handleProgress)
      window.removeEventListener('progress-complete', handleComplete)
    }
  }, [])

  if (!isVisible) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-gray-200">
      <div
        className="h-full bg-blue-600 transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}