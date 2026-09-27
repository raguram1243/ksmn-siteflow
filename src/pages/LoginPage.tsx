import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import AuroraBackground from '../components/AuroraBackground'
import AnimatedText from '../components/AnimatedText'
import PasswordInput from '../components/PasswordInput'
import { useDarkMode } from '../contexts/DarkModeContext'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, user, role, authNotice } = useAuth()
  const navigate = useNavigate()
  const { isDark, toggle } = useDarkMode()

  // Redirect if already logged in
  if (user && role) {
    navigate(role === 'admin' ? '/admin' : '/rep', { replace: true })
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn(username, password)
    if (result.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated aurora background (pure CSS, no WebGL) */}
      <AuroraBackground />

      {/* Dark mode toggle — top-right corner */}
      <button
        onClick={toggle}
        className="fixed top-4 right-4 z-20 p-2.5 rounded-full bg-white/70 dark:bg-gray-800/70 backdrop-blur-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/90 dark:hover:bg-gray-800/90 shadow-sm transition-all"
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        aria-label="Toggle dark mode"
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

      {/* Login card — semi-transparent with backdrop blur for legibility over animated bg */}
      <div className="relative z-10 max-w-md w-full space-y-8 p-8 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-xl shadow-lg border border-white/40 dark:border-gray-700/40 overflow-hidden">
        {/* Brand gradient edge, echoing the in-app top bar */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-brand-600 to-accent-500"
        />
        <div>
          <div className="flex justify-center mb-4">
            <img src="/KSMN_logo.png" alt="KSMN Logo" className="h-20 w-auto" />
          </div>
          <AnimatedText
            text="KSMN SiteFlow"
            as="h2"
            className="text-center text-3xl font-bold text-gray-900 dark:text-gray-100"
            delay={0.1}
            stagger={0.1}
            duration={0.7}
          />
          <AnimatedText
            text="Sign in to your account"
            as="p"
            className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400"
            delay={0.4}
            stagger={0.06}
            duration={0.6}
          />
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {(error || authNotice) && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-3 rounded-md text-sm">
              {error || authNotice}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Username
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white/80 dark:bg-gray-700/80 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your username"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <PasswordInput
                id="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
