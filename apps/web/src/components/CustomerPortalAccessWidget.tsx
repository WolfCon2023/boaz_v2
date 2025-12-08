/**
 * Customer Portal Access Widget
 * 
 * Reusable component for managing customer portal access from Quotes/Invoices
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '../lib/http'
import { useToast } from './Toast'
import { Users, UserPlus, CheckCircle, Mail, X } from 'lucide-react'

type CustomerPortalUser = {
  id: string
  email: string
  name: string
  emailVerified: boolean
}

type Props = {
  accountId: string | null | undefined
  onNotify?: (userIds: string[]) => void
  showInline?: boolean
}

export function CustomerPortalAccessWidget({ accountId, onNotify, showInline = false }: Props) {
  const { showToast } = useToast()
  const qc = useQueryClient()
  
  const [showModal, setShowModal] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [showInviteForm, setShowInviteForm] = useState(false)

  // Get portal users for this account
  const portalUsersQ = useQuery({
    queryKey: ['portal-users-by-account', accountId],
    queryFn: async () => {
      if (!accountId) return []
      const res = await http.get(`/api/admin/customer-portal-users/by-account/${accountId}`)
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data as CustomerPortalUser[]
    },
    enabled: !!accountId && (showModal || showInline),
  })

  // Quick invite mutation
  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; name: string; accountId: string }) => {
      const res = await http.post('/api/admin/customer-portal-users/quick-invite', data)
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['portal-users-by-account', accountId] })
      setShowInviteForm(false)
      setInviteEmail('')
      setInviteName('')
      if (data.existed) {
        showToast(`${data.name} already has portal access`, 'info')
      } else {
        showToast(`Invited ${data.name} to customer portal`, 'success')
      }
      // Auto-select the newly invited/linked user
      setSelectedUsers(prev => [...prev, data.id])
    },
    onError: (err: any) => {
      showToast(err.message || 'Failed to invite user', 'error')
    },
  })

  const portalUsers = portalUsersQ.data || []
  const hasPortalAccess = portalUsers.length > 0

  const handleInvite = () => {
    if (!inviteEmail || !inviteName || !accountId) return
    inviteMutation.mutate({ email: inviteEmail, name: inviteName, accountId })
  }

  const handleNotify = () => {
    if (selectedUsers.length === 0) {
      showToast('Please select at least one recipient', 'warning')
      return
    }
    onNotify?.(selectedUsers)
    setShowModal(false)
    setSelectedUsers([])
  }

  // Inline view for embedding in forms
  if (showInline) {
    if (!accountId) {
      return (
        <div className="text-xs text-[color:var(--color-text-muted)] italic">
          Select an account to manage portal access
        </div>
      )
    }

    return (
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[color:var(--color-primary-600)]" />
            <span className="text-sm font-medium">Customer Portal Access</span>
          </div>
          {hasPortalAccess ? (
            <div className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="h-3 w-3" />
              <span>{portalUsers.length} user(s)</span>
            </div>
          ) : (
            <span className="text-xs text-[color:var(--color-text-muted)]">No access yet</span>
          )}
        </div>

        {portalUsersQ.isLoading ? (
          <div className="text-xs text-[color:var(--color-text-muted)]">Loading...</div>
        ) : portalUsers.length > 0 ? (
          <div className="space-y-1">
            {portalUsers.map(user => (
              <div key={user.id} className="flex items-center justify-between text-xs">
                <span className="text-[color:var(--color-text)]">{user.name}</span>
                <span className="text-[color:var(--color-text-muted)]">{user.email}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-[color:var(--color-text-muted)]">
            No customer portal users linked to this account
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="mt-2 flex items-center gap-1 rounded border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]"
        >
          <UserPlus className="h-3 w-3" />
          <span>Invite Customer</span>
        </button>
      </div>
    )
  }

  // Button to open modal
  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        disabled={!accountId}
        className="flex items-center gap-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1.5 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
        title={!accountId ? 'Select an account first' : 'Manage customer portal access'}
      >
        <Users className="h-3 w-3" />
        <span>Portal Access</span>
        {hasPortalAccess && (
          <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
            {portalUsers.length}
          </span>
        )}
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[color:var(--color-text)]">
                Customer Portal Access
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 hover:bg-[color:var(--color-muted)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!accountId ? (
              <div className="text-sm text-[color:var(--color-text-muted)]">
                Please select an account first to manage portal access.
              </div>
            ) : portalUsersQ.isLoading ? (
              <div className="py-8 text-center text-[color:var(--color-text-muted)]">
                Loading...
              </div>
            ) : (
              <div className="space-y-4">
                {/* Existing users */}
                {portalUsers.length > 0 ? (
                  <div>
                    <div className="mb-2 text-sm font-medium text-[color:var(--color-text)]">
                      Select recipients for notification:
                    </div>
                    <div className="space-y-2">
                      {portalUsers.map(user => (
                        <label
                          key={user.id}
                          className="flex items-center gap-2 rounded border border-[color:var(--color-border)] p-2 hover:bg-[color:var(--color-muted)] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(user.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedUsers([...selectedUsers, user.id])
                              } else {
                                setSelectedUsers(selectedUsers.filter(id => id !== user.id))
                              }
                            }}
                            className="rounded"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-[color:var(--color-text)]">
                              {user.name}
                            </div>
                            <div className="text-xs text-[color:var(--color-text-muted)]">
                              {user.email}
                            </div>
                          </div>
                          {user.emailVerified ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <div title="Email not verified">
                              <Mail className="h-4 w-4 text-yellow-600" />
                            </div>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                    No customer portal users linked to this account yet.
                  </div>
                )}

                {/* Invite form */}
                {showInviteForm ? (
                  <div className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 space-y-2">
                    <div className="text-sm font-medium text-[color:var(--color-text)]">
                      Invite New Customer
                    </div>
                    <input
                      type="text"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Customer Name"
                      className="w-full rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                    />
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="w-full rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleInvite}
                        disabled={!inviteEmail || !inviteName || inviteMutation.isPending}
                        className="flex-1 rounded bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                      >
                        {inviteMutation.isPending ? 'Inviting...' : 'Send Invite'}
                      </button>
                      <button
                        onClick={() => {
                          setShowInviteForm(false)
                          setInviteEmail('')
                          setInviteName('')
                        }}
                        className="rounded border border-[color:var(--color-border)] px-3 py-2 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowInviteForm(true)}
                    className="flex items-center gap-2 rounded border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)] w-full justify-center"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>Invite New Customer</span>
                  </button>
                )}

                {/* Actions */}
                <div className="flex gap-2 border-t border-[color:var(--color-border)] pt-4">
                  <button
                    onClick={handleNotify}
                    disabled={selectedUsers.length === 0}
                    className="flex-1 rounded bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                  >
                    Notify Selected ({selectedUsers.length})
                  </button>
                  <button
                    onClick={() => setShowModal(false)}
                    className="rounded border border-[color:var(--color-border)] px-4 py-2 text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

