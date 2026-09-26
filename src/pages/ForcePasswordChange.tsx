import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function ForcePasswordChange() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { updatePassword, profile } = useAuth()
  const navigate = useNavigate()

  // Redirect if not required
  useEffect(() => {
    // This page should only be accessed when mustChangePassword is true
    // If user somehow navigates here without the flag, redirect them
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    const { error } = await updatePassword(password)

    if (error) {
      setError(error)
      setLoading(false)
    } else {
      // Password changed successfully, redirect to dashboard
      navigate(profile?.role === 'admin' ? '/admin' : '/rep', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div>
          <div className="flex justify-center mb-4">
            <img src="/KSMN_logo.png" alt="KSMN Logo" className="h-20 w-auto" />
          </div>
          <h2 className="text-center text-3xl font-bold text-gray-900">
            Set Your Password
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            You must change your temporary password before continuing.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                New Password *
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter new password (min 6 characters)"
                minLength={6}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm New Password *
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Re-enter new password"
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Updating Password...' : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}