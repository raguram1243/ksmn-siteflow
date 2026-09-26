import React, { type ReactNode, useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ToastContainer from './ToastContainer'
import NotificationBell from './NotificationBell'
import OfflineBanner from './OfflineBanner'
import { useDarkMode } from '../contexts/DarkModeContext'
import { useWhatsNew } from '../contexts/WhatsNewContext'
import OnboardingTour from './OnboardingTour'
import ProgressBar from './ProgressBar'
import PasswordInput from './PasswordInput'
import { useToast } from '../contexts/ToastContext'
import CommandPalette from './CommandPalette'
import { navItemsForRole } from '../constants/navigation'

// Refresh context type
interface RefreshContextType {
  refresh: () => Promise<void>
  isRefreshing: boolean
}
export const RefreshContext = React.createContext<RefreshContextType>({
  refresh: async () => {},
  isRefreshing: false
})

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const { addToast } = useToast()
  const isOnline = useOnlineStatus()
  const navigate = useNavigate()
  const location = useLocation()
  const { isDark, toggle } = useDarkMode()
  const { items, lastViewedVersion, markAsViewed, hasNewUpdates } = useWhatsNew()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const changelogRef = useRef<HTMLDivElement>(null)

  const isAdmin = profile?.role === 'admin'
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [touchExpanded, setTouchExpanded] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Close changelog dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (changelogRef.current && !changelogRef.current.contains(e.target as Node)) {
        setShowChangelog(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Global shortcut: Ctrl+K (or Cmd+K) opens the command palette
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowPalette(v => !v)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Close sidebar on click outside (mobile)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (touchExpanded && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setTouchExpanded(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [touchExpanded])

  const isExpanded = sidebarExpanded || touchExpanded

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters')
      return
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    setPasswordLoading(true)

    const username = profile?.username || ''
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: `${username}@ksmn.local`,
      password: currentPassword
    })

    if (signInError) {
      setPasswordError('Current password is incorrect')
      setPasswordLoading(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (updateError) {
      setPasswordError(updateError.message)
      setPasswordLoading(false)
      return
    }

    setShowChangePasswordModal(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmNewPassword('')
    addToast('Password changed successfully!', 'success')
  }

  // Shared with the command palette (src/constants/navigation.ts).
  // Dashboard path differs for reps.
  const navItems = navItemsForRole(profile?.role).map(item =>
    item.path === '/admin' && !isAdmin ? { ...item, path: '/rep' } : item
  )

  const bottomItems = [
    {
      label: 'Change Password',
      icon: (_active: boolean) => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      onClick: () => setShowChangePasswordModal(true)
    },
    {
      label: 'Sign Out',
      icon: (_active: boolean) => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      ),
      onClick: signOut
    },
  ]

  function isActive(path: string) {
    if (path === '/admin' || path === '/rep') {
      return location.pathname === '/admin' || location.pathname === '/rep'
    }
    return location.pathname === path
  }

  async function handleRefresh() {
    setIsRefreshing(true)
    // Dispatch custom event that pages can listen to
    window.dispatchEvent(new CustomEvent('app-refresh'))
    // Small delay to show spinning animation
    setTimeout(() => setIsRefreshing(false), 500)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Offline Banner */}
      <OfflineBanner />

      {/* Top Bar - simplified */}
      <header className="bg-white shadow-sm border-b fixed top-0 left-0 right-0 z-40 h-14">
        {/* Subtle brand gradient edge across the top bar */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-brand-500 via-brand-600 to-accent-500"
        />
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-1 sm:gap-3">
            {/* Hamburger toggle - visible on mobile to open the slide-out sidebar */}
            <button
              onClick={() => setTouchExpanded((v) => !v)}
              className="md:hidden p-2.5 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              aria-label="Toggle menu"
              aria-expanded={touchExpanded}
              title="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                {touchExpanded ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
            <img src="/KSMN_logo.png" alt="KSMN" className="h-7 w-auto" />
            <h1 className="hidden sm:block text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100">
              KSMN <span className="text-brand-600 dark:text-brand-400">SiteFlow</span>
            </h1>
            <span className={`hidden sm:inline-flex px-2 py-0.5 rounded text-xs font-medium ${
              isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <span className="hidden sm:inline text-xs text-gray-500 ml-1">({profile?.role})</span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Global search / command palette */}
            <button
              onClick={() => setShowPalette(true)}
              className="flex items-center gap-2 px-2.5 py-2 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Search (Ctrl+K)"
              aria-label="Open search"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
              <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Ctrl K</kbd>
            </button>

            {/* Notification Bell - Admin only */}
            <NotificationBell />
            
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              className={`p-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors ${isRefreshing ? 'animate-spin' : ''}`}
              title="Refresh data"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            
            {/* Changelog Icon & Dropdown */}
            <div ref={changelogRef} className="relative">
              <button
                onClick={() => setShowChangelog(!showChangelog)}
                className="relative p-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="What's New"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {hasNewUpdates && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                )}
              </button>

              {showChangelog && (
                <div className="absolute right-0 top-full mt-1 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
                  <div className="p-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">What's New</h3>
                      <button onClick={() => setShowChangelog(false)} className="text-gray-400 hover:text-gray-600">&times;</button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Stay updated with the latest features</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {items.map((item) => {
                      const isNew = item.version === items[0]?.version && item.version !== lastViewedVersion
                      return (
                    <div key={item.version} className={`p-4 ${isNew ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-gray-700">v{item.version}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{item.date}</span>
                              {isNew && <span className="px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded-full">New</span>}
                            </div>
                          </div>
                          <h4 className="text-sm font-medium text-gray-900 mb-1">{item.title}</h4>
                          <ul className="space-y-0.5">
                            {item.features.slice(0, 3).map((f, i) => (
                              <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                                <span className="text-green-500 mt-0.5">âœ“</span>
                                <span>{f}</span>
                              </li>
                            ))}
                            {item.features.length > 3 && (
                              <li className="text-xs text-blue-600">+{item.features.length - 3} more</li>
                            )}
                          </ul>
                          {isNew && (
                            <button
                              onClick={() => { markAsViewed(item.version); setShowChangelog(false) }}
                              className="mt-2 px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700"
                            >
                              Got it!
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            
            {/* Dark Mode Toggle */}
            <button
              onClick={toggle}
              className="p-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              title={isDark ? 'Light Mode' : 'Dark Mode'}
            >
              {isDark ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
        className={`fixed left-0 top-14 bottom-0 z-30 bg-white border-r border-gray-200 shadow-sm
          transition-all duration-200 ease-in-out overflow-hidden
          w-56 md:w-14 -translate-x-full md:translate-x-0
          ${touchExpanded ? 'translate-x-0' : ''}
          ${isExpanded ? 'md:w-56' : ''}`}
      >
        <div className="flex flex-col h-full">
          {/* Main Nav Items */}
          <nav className="flex-1 py-2 space-y-0.5 overflow-y-auto">
            {navItems.map((item) => {
              const active = isActive(item.path)
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path)
                    setTouchExpanded(false)
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-3 text-sm font-medium transition-colors duration-150
                    ${active
                      ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-r-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  title={item.label}
                >
                  <span className="flex-shrink-0 w-5 flex justify-center">
                    {item.icon(active)}
                  </span>
                  <span className={`whitespace-nowrap transition-opacity duration-200
                    ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
                    {item.label}
                  </span>
                </button>
              )
            })}
          </nav>

          {/* Divider */}
          <hr className="border-gray-200 mx-3" />

          {/* Bottom Items - Change Password & Sign Out */}
          <div className="py-2 space-y-0.5">
            {bottomItems.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  item.onClick()
                  setTouchExpanded(false)
                }}
                className={`w-full flex items-center gap-3 px-3 py-3 text-sm font-medium transition-colors duration-150
                  ${item.label === 'Sign Out'
                    ? 'text-red-600 hover:text-red-800 hover:bg-red-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                title={item.label}
              >
                <span className="flex-shrink-0 w-5 flex justify-center">
                  {item.icon(false)}
                </span>
                <span className={`whitespace-nowrap transition-opacity duration-200
                  ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Backdrop for mobile when expanded */}
      {touchExpanded && (
        <div
          className="fixed inset-0 z-20 bg-black bg-opacity-30 md:hidden"
          onClick={() => setTouchExpanded(false)}
        />
      )}

      {/* Main Content */}
      <main className={`transition-all duration-200 ease-in-out pt-14
        ${isExpanded ? 'md:ml-56' : 'md:ml-14'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Progress Bar */}
      <ProgressBar />

      {/* Onboarding Tour */}
      <OnboardingTour />

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Change Password</h3>
            <form onSubmit={handleChangePassword}>
              {passwordError && (
                <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm mb-4">
                  {passwordError}
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Current Password *</label>
                  <PasswordInput
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">New Password *</label>
                  <PasswordInput
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirm New Password *</label>
                  <PasswordInput
                    required
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    minLength={6}
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePasswordModal(false)
                    setCurrentPassword('')
                    setNewPassword('')
                    setConfirmNewPassword('')
                    setPasswordError('')
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {passwordLoading ? 'Updating...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global command palette (Ctrl+K) */}
      <CommandPalette isOpen={showPalette} onClose={() => setShowPalette(false)} />
    </div>
  )
}
