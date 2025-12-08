/**
 * Admin: Customer Portal Users Management
 * 
 * Manage external customer portal users
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '../lib/http'
import { useToast } from '../components/Toast'
import { Users, Plus, Mail, CheckCircle, XCircle, RefreshCw, Trash2, ShieldCheck, Edit } from 'lucide-react'

type CustomerPortalUser = {
  id: string
  email: string
  name: string
  company: string | null
  phone: string | null
  accountId: string | null
  accountName: string | null
  emailVerified: boolean
  active: boolean
  createdAt: string
  lastLoginAt: string | null
}

export default function AdminCustomerPortalUsers() {
  const { showToast } = useToast()
  const qc = useQueryClient()
  
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending' | 'inactive'>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingUser, setEditingUser] = useState<CustomerPortalUser | null>(null)
  
  // Create form
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newAccountId, setNewAccountId] = useState('')
  const [sendVerificationEmail, setSendVerificationEmail] = useState(true)

  // Edit form
  const [editEmail, setEditEmail] = useState('')
  const [editName, setEditName] = useState('')
  const [editCompany, setEditCompany] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editAccountId, setEditAccountId] = useState('')

  // Fetch users
  const usersQ = useQuery({
    queryKey: ['admin-customer-portal-users', statusFilter, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (searchTerm) params.set('search', searchTerm)
      
      const res = await http.get(`/api/admin/customer-portal-users?${params}`)
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data
    },
  })

  // Fetch accounts for dropdown
  const accountsQ = useQuery({
    queryKey: ['crm-accounts-all'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', { params: { limit: 1000 } })
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data.items as Array<{ _id: string; name: string }>
    },
  })

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await http.post('/api/admin/customer-portal-users', data)
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-customer-portal-users'] })
      setShowCreateModal(false)
      resetCreateForm()
      showToast('User created successfully', 'success')
    },
    onError: (err: any) => {
      showToast(err.message || 'Failed to create user', 'error')
    },
  })

  // Edit user mutation
  const editUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await http.patch(`/api/admin/customer-portal-users/${data.id}`, data)
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-customer-portal-users'] })
      setShowEditModal(false)
      setEditingUser(null)
      showToast('User updated successfully', 'success')
    },
    onError: (err: any) => {
      showToast(err.message || 'Failed to update user', 'error')
    },
  })

  // Verify email mutation
  const verifyEmailMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await http.patch(`/api/admin/customer-portal-users/${userId}/verify`)
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-customer-portal-users'] })
      showToast('Email verified successfully', 'success')
    },
  })

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      const res = await http.patch(`/api/admin/customer-portal-users/${userId}/activate`, { active })
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-customer-portal-users'] })
      showToast('User status updated', 'success')
    },
  })

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await http.delete(`/api/admin/customer-portal-users/${userId}`)
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-customer-portal-users'] })
      showToast('User deleted successfully', 'success')
    },
  })

  // Resend verification mutation
  const resendVerificationMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await http.post(`/api/admin/customer-portal-users/${userId}/resend-verification`)
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data
    },
    onSuccess: () => {
      showToast('Verification email sent', 'success')
    },
  })

  function resetCreateForm() {
    setNewEmail('')
    setNewName('')
    setNewPassword('')
    setNewCompany('')
    setNewPhone('')
    setNewAccountId('')
    setSendVerificationEmail(true)
  }

  function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    createUserMutation.mutate({
      email: newEmail,
      name: newName,
      password: newPassword,
      company: newCompany || null,
      phone: newPhone || null,
      accountId: newAccountId || null,
      sendVerificationEmail,
    })
  }

  function openEditModal(user: CustomerPortalUser) {
    setEditingUser(user)
    setEditEmail(user.email)
    setEditName(user.name)
    setEditCompany(user.company || '')
    setEditPhone(user.phone || '')
    setEditAccountId(user.accountId || '')
    setShowEditModal(true)
  }

  function handleEditUser(e: React.FormEvent) {
    e.preventDefault()
    if (!editingUser) return
    editUserMutation.mutate({
      id: editingUser.id,
      name: editName,
      company: editCompany || null,
      phone: editPhone || null,
      accountId: editAccountId || null,
    })
  }

  function handleDeleteUser(user: CustomerPortalUser) {
    if (confirm(`Delete user ${user.email}? This action cannot be undone.`)) {
      deleteUserMutation.mutate(user.id)
    }
  }

  const users = usersQ.data?.items || []
  const stats = {
    total: users.length,
    verified: users.filter((u: CustomerPortalUser) => u.emailVerified).length,
    pending: users.filter((u: CustomerPortalUser) => !u.emailVerified).length,
    inactive: users.filter((u: CustomerPortalUser) => !u.active).length,
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--color-text)]">Customer Portal Users</h1>
          <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
            Manage external customer accounts and access
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
        >
          <Plus className="h-4 w-4" />
          <span>New Customer User</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[color:var(--color-text-muted)]">Total Users</p>
              <p className="mt-1 text-2xl font-semibold text-[color:var(--color-text)]">{stats.total}</p>
            </div>
            <Users className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[color:var(--color-text-muted)]">Verified</p>
              <p className="mt-1 text-2xl font-semibold text-green-600">{stats.verified}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </div>

        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[color:var(--color-text-muted)]">Pending</p>
              <p className="mt-1 text-2xl font-semibold text-yellow-600">{stats.pending}</p>
            </div>
            <Mail className="h-8 w-8 text-yellow-500" />
          </div>
        </div>

        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[color:var(--color-text-muted)]">Inactive</p>
              <p className="mt-1 text-2xl font-semibold text-red-600">{stats.inactive}</p>
            </div>
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {(['all', 'verified', 'pending', 'inactive'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                statusFilter === filter
                  ? 'bg-[color:var(--color-primary-600)] text-white'
                  : 'bg-[color:var(--color-muted)] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-border)]'
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name, email, or company..."
          className="w-full max-w-xs rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
        />
      </div>

      {/* Users Table */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        {usersQ.isLoading ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-[color:var(--color-primary-600)]"></div>
            <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">Loading users...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto mb-4 h-12 w-12 text-[color:var(--color-text-muted)] opacity-50" />
            <p className="text-sm text-[color:var(--color-text-muted)]">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-[color:var(--color-border)] bg-[color:var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[color:var(--color-text-muted)] uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[color:var(--color-text-muted)] uppercase">Account</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[color:var(--color-text-muted)] uppercase">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[color:var(--color-text-muted)] uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[color:var(--color-text-muted)] uppercase">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[color:var(--color-text-muted)] uppercase">Last Login</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[color:var(--color-text-muted)] uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {users.map((user: CustomerPortalUser) => (
                  <tr key={user.id} className="hover:bg-[color:var(--color-muted)]">
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-[color:var(--color-text)]">{user.name}</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">{user.email}</div>
                        {user.phone && (
                          <div className="text-xs text-[color:var(--color-text-muted)]">{user.phone}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        {user.accountName ? (
                          <span className="text-[color:var(--color-text)]">{user.accountName}</span>
                        ) : user.company ? (
                          <span className="text-[color:var(--color-text-muted)]">{user.company}</span>
                        ) : (
                          <span className="text-[color:var(--color-text-muted)]">No account</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800">
                        Customer
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {user.emailVerified ? (
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                            <CheckCircle className="h-3 w-3" />
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                            <Mail className="h-3 w-3" />
                            Pending
                          </span>
                        )}
                        {!user.active && (
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">
                            <XCircle className="h-3 w-3" />
                            Inactive
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[color:var(--color-text-muted)]">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-[color:var(--color-text-muted)]">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {!user.emailVerified && (
                          <>
                            <button
                              onClick={() => verifyEmailMutation.mutate(user.id)}
                              className="rounded p-1 text-green-600 hover:bg-green-50"
                              title="Manually verify email"
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => resendVerificationMutation.mutate(user.id)}
                              className="rounded p-1 text-blue-600 hover:bg-blue-50"
                              title="Resend verification email"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => openEditModal(user)}
                          className="rounded p-1 text-blue-600 hover:bg-blue-50"
                          title="Edit user"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleActiveMutation.mutate({ userId: user.id, active: !user.active })}
                          className={`rounded p-1 hover:bg-gray-50 ${user.active ? 'text-yellow-600' : 'text-green-600'}`}
                          title={user.active ? 'Deactivate' : 'Activate'}
                        >
                          {user.active ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                          title="Delete user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 sm:p-8 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-[color:var(--color-text)]">Create Customer User</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-[color:var(--color-text-muted)]">Email *</span>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                    required
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-[color:var(--color-text-muted)]">Full Name *</span>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                    required
                  />
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-[color:var(--color-text-muted)]">Password * (min. 8 characters)</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                  minLength={8}
                  required
                />
              </label>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-[color:var(--color-text-muted)]">Company</span>
                  <input
                    type="text"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-[color:var(--color-text-muted)]">Phone</span>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-[color:var(--color-text-muted)]">Link to CRM Account (optional)</span>
                <select
                  value={newAccountId}
                  onChange={(e) => setNewAccountId(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
                >
                  <option value="">No account (customer can register independently)</option>
                  {accountsQ.isLoading && <option value="">Loading accounts...</option>}
                  {accountsQ.data?.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-[color:var(--color-text-muted)]">
                  Link this user to an existing CRM account for invoice/quote/ticket access
                </span>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sendVerificationEmail}
                  onChange={(e) => setSendVerificationEmail(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-[color:var(--color-text-muted)]">
                  Send verification email (uncheck to auto-verify)
                </span>
              </label>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="flex-1 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                >
                  {createUserMutation.isPending ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 sm:p-8 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-[color:var(--color-text)]">Edit Customer User</h3>
              <button
                onClick={() => {
                  setShowEditModal(false)
                  setEditingUser(null)
                }}
                className="rounded-lg p-1 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleEditUser} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-[color:var(--color-text-muted)]">Email</span>
                  <input
                    type="email"
                    value={editEmail}
                    disabled
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-3 py-2 text-sm text-[color:var(--color-text-muted)] cursor-not-allowed"
                  />
                  <span className="mt-1 block text-xs text-[color:var(--color-text-muted)]">
                    Email cannot be changed
                  </span>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-[color:var(--color-text-muted)]">Full Name *</span>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                    required
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-[color:var(--color-text-muted)]">Company</span>
                  <input
                    type="text"
                    value={editCompany}
                    onChange={(e) => setEditCompany(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-[color:var(--color-text-muted)]">Phone</span>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-[color:var(--color-text-muted)]">Link to CRM Account</span>
                <select
                  value={editAccountId}
                  onChange={(e) => setEditAccountId(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
                >
                  <option value="">No account (customer can access independently)</option>
                  {accountsQ.isLoading && <option value="">Loading accounts...</option>}
                  {accountsQ.data?.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-[color:var(--color-text-muted)]">
                  Link this user to a CRM account for invoice/quote/ticket access
                </span>
              </label>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingUser(null)
                  }}
                  className="flex-1 rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editUserMutation.isPending}
                  className="flex-1 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                >
                  {editUserMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
