import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import type { Profile } from '../types/database'

interface User extends Profile {
  is_active: boolean
  must_change_password: boolean
}

export default function UserManagementPage() {
  const { profile } = useAuth()
  const { addToast, addUndoToast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)

  // Form state
  const [formUsername, setFormUsername] = useState('')
  const [formFullName, setFormFullName] = useState('')
  const [formRole, setFormRole] = useState<'admin' | 'rep'>('rep')
  const [formPassword, setFormPassword] = useState('')
  const [tempPassword, setTempPassword] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [])

  // Listen for refresh events
  useEffect(() => {
    function handleRefresh() {
      fetchUsers()
    }
    window.addEventListener('app-refresh', handleRefresh)
    return () => window.removeEventListener('app-refresh', handleRefresh)
  }, [])

  async function fetchUsers() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { action: 'list' }
    })

    if (error) {
      console.error('Error fetching users:', error)
      setError('Failed to load users')
    } else if (data?.users) {
      setUsers(data.users)
    }
    setLoading(false)
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          action: 'create',
          username: formUsername,
          full_name: formFullName,
          role: formRole,
          password: formPassword
        }
      })

      if (error) {
        setError(error.message || 'Failed to create user')
      } else if (data?.error) {
        setError(data.error)
      } else {
        // Success
        setShowCreateModal(false)
        setFormUsername('')
        setFormFullName('')
        setFormRole('rep')
        setFormPassword('')
        fetchUsers()
        addToast('User created successfully!', 'success')
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetPassword(userId: string) {
    if (!confirm('Reset password for this user? They will be required to change it on next login.')) return

    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { action: 'reset_password', targetUserId: userId }
    })

    if (error || data?.error) {
      alert('Error: ' + (data?.error || error?.message))
    } else if (data?.temporary_password) {
      alert(`Password reset successful!\n\nTemporary password: ${data.temporary_password}\n\nPlease share this with the user. They will be required to change it on first login.`)
    }
  }

  async function handleToggleActive(user: User) {
    const action = user.is_active ? 'deactivate' : 'reactivate'
    const confirmMsg = user.is_active 
      ? 'Deactivate this user? They will not be able to log in, but their data will remain intact.'
      : 'Reactivate this user? They will be able to log in again.'

    if (!confirm(confirmMsg)) return

    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { action, targetUserId: user.id }
    })

    if (error || data?.error) {
      alert('Error: ' + (data?.error || error?.message))
    } else {
      fetchUsers()
    }
  }

  async function handleDeleteUser(user: User) {
    const confirmMsg = `Delete user "${user.full_name}"?\n\nThis will permanently remove their account. Their historical records (contacts, leads, etc.) will be preserved but will show as "Created by: Removed User".\n\nThis action cannot be undone.`

    if (deletingUserId) return
    if (!confirm(confirmMsg)) return

    setDeletingUserId(user.id)

    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { action: 'delete', targetUserId: user.id }
    })

    if (error || data?.error) {
      alert('Error: ' + (data?.error || error?.message))
      setDeletingUserId(null)
      return
    }

    await fetchUsers()
    setDeletingUserId(null)
    
    // Show undo toast
    addUndoToast(
      `User "${user.full_name}" deleted successfully`,
      async () => {
        // Note: Full user restoration may not be possible as it requires password
        // This will show an error message explaining the limitation
        addToast('User restoration is not available. Please create a new user account instead.', 'error')
      }
    )
  }

  async function handleEditUser(user: User) {
    setSelectedUser(user)
    setFormFullName(user.full_name)
    setError('')
    setShowEditModal(true)
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUser) return

    setSubmitting(true)
    setError('')
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        action: 'update',
        targetUserId: selectedUser.id,
        newFullName: formFullName
      }
    })

    if (error || data?.error) {
      setError('Error updating user: ' + (data?.error || error?.message))
    } else {
      setShowEditModal(false)
      setSelectedUser(null)
      setFormFullName('')
      fetchUsers()
    }
    setSubmitting(false)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
        <button
          onClick={() => {
            setError('')
            setShowCreateModal(true)
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          + Create New User
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Users List */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No users found.</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {users.map((user) => (
              <div key={user.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{user.full_name}</span>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {user.role}
                      </span>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {user.must_change_password && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          Must Change Password
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      @{user.username}
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      Created: {new Date(user.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditUser(user)}
                      className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full hover:bg-blue-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleResetPassword(user.id)}
                      className="px-3 py-1 text-xs font-medium text-yellow-700 bg-yellow-100 rounded-full hover:bg-yellow-200"
                    >
                      Reset Password
                    </button>
                    <button
                      onClick={() => handleToggleActive(user)}
                      className={`px-3 py-1 text-xs font-medium rounded-full ${
                        user.is_active
                          ? 'text-red-700 bg-red-100 hover:bg-red-200'
                          : 'text-green-700 bg-green-100 hover:bg-green-200'
                      }`}
                    >
                      {user.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user)}
                      disabled={deletingUserId !== null}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-red-600 rounded-full hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {deletingUserId === user.id ? <><Spinner className="h-3 w-3" /> Deleting…</> : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <h3 className="text-lg font-semibold mb-4">Create New User</h3>
            <form onSubmit={handleCreateUser}>
              {error && (
                <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 p-3 rounded-md text-sm mb-4">
                  {error}
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Username *</label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    placeholder="lowercase letters and numbers only"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Only lowercase letters and numbers. No spaces or special characters.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role *</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as 'admin' | 'rep')}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="rep">Representative</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Temporary Password *</label>
                  <input
                    type="text"
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Set a temporary password"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    User will be required to change this on first login.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={showEditModal} onClose={() => { setShowEditModal(false); setSelectedUser(null); setFormFullName(''); setError('') }}>
        <h3 className="text-lg font-semibold mb-4">Edit User</h3>
            <form onSubmit={handleUpdateUser}>
              {error && (
                <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 p-3 rounded-md text-sm mb-4">
                  {error}
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Username</label>
                  <input
                    type="text"
                    disabled
                    value={selectedUser?.username || ''}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <input
                    type="text"
                    disabled
                    value={selectedUser?.role || ''}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <input
                    type="text"
                    disabled
                    value={selectedUser?.is_active ? 'Active' : 'Inactive'}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Use the Deactivate/Reactivate button in the user list to change status.
                  </p>
                </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false)
                    setSelectedUser(null)
                    setFormFullName('')
                    setError('')
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
      </Modal>
    </div>
  )
}