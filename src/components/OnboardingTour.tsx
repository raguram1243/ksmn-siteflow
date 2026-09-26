import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

interface TourStep {
  target: string
  title: string
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

const tourSteps: TourStep[] = [
  {
    target: '[title="What\'s New"]',
    title: 'Stay Updated',
    content: 'Check here for the latest features and improvements. We regularly add new functionality to make your work easier.',
    placement: 'bottom'
  },
  {
    target: '[title="Refresh data"]',
    title: 'Refresh Data',
    content: 'Click this button to manually refresh all data. The app also auto-refreshes every 5 minutes when the tab is visible.',
    placement: 'bottom'
  },
  {
    target: '[title="Light Mode"]',
    title: 'Dark Mode',
    content: 'Toggle between light and dark themes. Your preference is saved automatically.',
    placement: 'bottom'
  }
]

export default function OnboardingTour() {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const location = useLocation()

  const startTour = useCallback(() => {
    // Only run the tour on dashboard pages where the target elements exist
    const isDashboard = location.pathname === '/admin' || location.pathname === '/rep'
    if (!isDashboard) return

    const hasSeenTour = localStorage.getItem('ksmn-onboarding-completed')
    if (!hasSeenTour) {
      setIsOpen(true)
      setCurrentStep(0)
    }
  }, [location.pathname])

  const endTour = useCallback(() => {
    setIsOpen(false)
    localStorage.setItem('ksmn-onboarding-completed', 'true')
  }, [])

  const nextStep = useCallback(() => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      endTour()
    }
  }, [currentStep, endTour])

  const skipTour = useCallback(() => {
    endTour()
  }, [endTour])

  useEffect(() => {
    startTour()
  }, [startTour])

  useEffect(() => {
    if (!isOpen) return

    const step = tourSteps[currentStep]
    const element = document.querySelector(step.target) as HTMLElement
    setTargetElement(element || null)

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isOpen, currentStep])

  if (!isOpen || !targetElement) return null

  const step = tourSteps[currentStep]
  const rect = targetElement.getBoundingClientRect()

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={skipTour} />

      {/* Tooltip */}
      <div
        className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-sm"
        style={{
          top: `${rect.bottom + window.scrollY + 10}px`,
          left: `${Math.min(rect.left, window.innerWidth - 400)}px`
        }}
      >
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-base font-semibold text-gray-900">{step.title}</h3>
          <button
            onClick={skipTour}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">{step.content}</p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Step {currentStep + 1} of {tourSteps.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={skipTour}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Skip
            </button>
            <button
              onClick={nextStep}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              {currentStep < tourSteps.length - 1 ? 'Next' : 'Got it!'}
            </button>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex gap-1 mt-3 justify-center">
          {tourSteps.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full ${
                index === currentStep ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>
    </>
  )
}