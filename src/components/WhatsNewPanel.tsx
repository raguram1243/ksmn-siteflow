import { useState } from 'react'
import { useWhatsNew } from '../contexts/WhatsNewContext'

export default function WhatsNewPanel() {
  const { items, lastViewedVersion, markAsViewed, hasNewUpdates } = useWhatsNew()
  const [isOpen, setIsOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (!hasNewUpdates || dismissed) return null

  const latestVersion = items[0]
  const isNew = lastViewedVersion !== latestVersion.version

  if (!isNew) return null

  return (
    <div className="mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="text-3xl">🎉</div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">
              What's New in v{latestVersion.version}
            </h3>
            <p className="text-xs text-blue-700 mb-2">{latestVersion.description}</p>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {isOpen ? 'Hide details' : `See what's new (${latestVersion.features.length} features)`}
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
        >
          ×
        </button>
      </div>

      {isOpen && (
        <div className="mt-3 pt-3 border-t border-blue-200">
          <ul className="space-y-1.5">
            {latestVersion.features.map((feature, index) => (
              <li key={index} className="flex items-start gap-2 text-xs text-blue-800">
                <span className="text-blue-500 mt-0.5">✓</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              markAsViewed(latestVersion.version)
              setDismissed(true)
            }}
            className="mt-3 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700"
          >
            Got it!
          </button>
        </div>
      )}
    </div>
  )
}