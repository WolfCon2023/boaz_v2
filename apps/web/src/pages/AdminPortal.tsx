import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Monitor, Trash2, User, Filter, UserPlus, Users } from 'lucide-react'
import { http } from '@/lib/http'
import { formatDateTime } from '@/lib/dateFormat'

type Session = {
  jti: string
  userId: string
  email: string
  ipAddress?: string
  userAgent?: string
  createdAt: string
  lastUsedAt: string
  revoked?: boolean
}

export default function AdminPortal() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'sessions' | 'users'>('sessions')
  const [userIdFilter, setUserIdFilter] = useState<string>('')
  const [emailFilter, setEmailFilter] = useState<string>('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  
  // User creation form state
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserPhone, setNewUserPhone] = useState('')
  const [newUserLocation, setNewUserLocation] = useState('')
  const [createdUserPassword, setCreatedUserPassword] = useState<string | null>(null)

  // Fetch all sessions (with optional user filter)
  const { data: sessionsData, isLoading } = useQuery<{ sessions: Session[] }>({
    queryKey: ['admin', 'sessions', userIdFilter],
    queryFn: async () => {
      const params = userIdFilter ? { userId: userIdFilter } : { limit: '200' }
      const res = await http.get('/api/auth/admin/sessions', { params })
      return res.data
    },
    staleTime: 30 * 1000, // Cache for 30 seconds
  })

  // Revoke session mutation
  const revokeSession = useMutation({
    mutationFn: async (jti: string) => {
      const res = await http.delete(`/api/auth/admin/sessions/${jti}`)
      return res.data
    },
    onSuccess: () => {
      setMessage('Session revoked successfully')
      setError('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] })
      setTimeout(() => setMessage(''), 5000)
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to revoke session')
      setMessage('')
    },
  })

  // Create user mutation
  const createUser = useMutation({
    mutationFn: async (data: { email: string; name?: string; phoneNumber?: string; workLocation?: string }) => {
      const res = await http.post('/api/auth/admin/users', data)
      return res.data
    },
    onSuccess: (data) => {
      setMessage(data.message || 'User created successfully')
      setError('')
      
      // If email wasn't sent, show the password
      if (!data.emailSent && data.temporaryPassword) {
        setCreatedUserPassword(data.temporaryPassword)
      } else {
        setCreatedUserPassword(null)
      }
      
      // Reset form
      setNewUserEmail('')
      setNewUserName('')
      setNewUserPhone('')
      setNewUserLocation('')
      
      setTimeout(() => {
        setMessage('')
        setCreatedUserPassword(null)
      }, 10000) // Show message for 10 seconds
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to create user')
      setMessage('')
      setCreatedUserPassword(null)
    },
  })

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUserEmail) {
      setError('Email is required')
      return
    }
    
    createUser.mutate({
      email: newUserEmail,
      name: newUserName || undefined,
      phoneNumber: newUserPhone || undefined,
      workLocation: newUserLocation || undefined,
    })
  }

  // Helper to parse user agent
  const parseUserAgent = (ua?: string): { device: string; browser: string } => {
    if (!ua) return { device: 'Unknown', browser: 'Unknown' }

    let device = 'Desktop'
    if (ua.match(/Mobile|Android|iPhone|iPad/i)) {
      device = ua.match(/iPhone/i) ? 'iPhone' : ua.match(/iPad/i) ? 'iPad' : 'Mobile'
    }

    let browser = 'Unknown'
    if (ua.match(/Chrome/i) && !ua.match(/Edg/i)) browser = 'Chrome'
    else if (ua.match(/Firefox/i)) browser = 'Firefox'
    else if (ua.match(/Safari/i) && !ua.match(/Chrome/i)) browser = 'Safari'
    else if (ua.match(/Edg/i)) browser = 'Edge'
    else if (ua.match(/Opera|OPR/i)) browser = 'Opera'

    return { device, browser }
  }

  // Filter sessions
  const filteredSessions = sessionsData?.sessions?.filter((session) => {
    if (emailFilter && !session.email.toLowerCase().includes(emailFilter.toLowerCase())) {
      return false
    }
    if (userIdFilter && session.userId !== userIdFilter) {
      return false
    }
    return !session.revoked
  }) || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin Portal</h1>
          <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
            Manage users and sessions across the platform
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[color:var(--color-border)]">
        <button
          onClick={() => setActiveTab('sessions')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'sessions'
              ? 'border-b-2 border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <Monitor className="mr-2 inline h-4 w-4" />
          Sessions
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'users'
              ? 'border-b-2 border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <Users className="mr-2 inline h-4 w-4" />
          Users
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          {message}
        </div>
      )}

      {/* User Management */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
            <div className="mb-4 flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Create New User</h2>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label htmlFor="user-email" className="mb-1 block text-sm font-medium">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="user-email"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                />
              </div>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="user-name" className="mb-1 block text-sm font-medium">
                    Name
                  </label>
                  <input
                    id="user-name"
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                  />
                </div>
                
                <div>
                  <label htmlFor="user-phone" className="mb-1 block text-sm font-medium">
                    Phone Number
                  </label>
                  <input
                    id="user-phone"
                    type="tel"
                    value={newUserPhone}
                    onChange={(e) => setNewUserPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="user-location" className="mb-1 block text-sm font-medium">
                  Work Location
                </label>
                <input
                  id="user-location"
                  type="text"
                  value={newUserLocation}
                  onChange={(e) => setNewUserLocation(e.target.value)}
                  placeholder="Office Location"
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                />
              </div>
              
              <button
                type="submit"
                disabled={createUser.isPending || !newUserEmail}
                className="w-full rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
              >
                {createUser.isPending ? 'Creating...' : 'Create User'}
              </button>
            </form>
            
            {createdUserPassword && (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
                <p className="mb-2 text-sm font-semibold text-amber-900">
                  ⚠️ Email could not be sent. Please share these credentials manually:
                </p>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-medium">Email:</span> {newUserEmail}
                  </p>
                  <p>
                    <span className="font-medium">Temporary Password:</span>{' '}
                    <code className="rounded bg-amber-100 px-2 py-1 font-mono">{createdUserPassword}</code>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sessions Management */}
      {activeTab === 'sessions' && (
        <>
          {/* Filters */}
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Filter className="h-4 w-4 text-[color:var(--color-text-muted)]" />
          <h2 className="text-sm font-semibold">Filters</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="user-id-filter" className="mb-1 block text-xs text-[color:var(--color-text-muted)]">
              User ID
            </label>
            <input
              id="user-id-filter"
              type="text"
              value={userIdFilter}
              onChange={(e) => setUserIdFilter(e.target.value)}
              placeholder="Filter by user ID"
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="email-filter" className="mb-1 block text-xs text-[color:var(--color-text-muted)]">
              Email
            </label>
            <input
              id="email-filter"
              type="text"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
              placeholder="Filter by email"
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
            />
          </div>
        </div>
        {(userIdFilter || emailFilter) && (
          <button
            onClick={() => {
              setUserIdFilter('')
              setEmailFilter('')
            }}
            className="mt-3 text-xs text-[color:var(--color-primary-600)] hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Sessions List */}
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Active Sessions</h2>
          <div className="text-sm text-[color:var(--color-text-muted)]">
            {isLoading ? 'Loading...' : `${filteredSessions.length} active session(s)`}
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">
            Loading sessions...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">
            {userIdFilter || emailFilter ? 'No sessions match your filters.' : 'No active sessions found.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session) => {
              const { device, browser } = parseUserAgent(session.userAgent)

              return (
                <div
                  key={session.jti}
                  className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-[color:var(--color-text-muted)]" />
                        <span className="font-semibold">
                          {device} • {browser}
                        </span>
                      </div>

                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-4">
                          <div className="text-[color:var(--color-text-muted)]">
                            <User className="mr-1 inline h-3 w-3" />
                            <span className="font-medium">User:</span> {session.email}
                          </div>
                          <div className="text-xs text-[color:var(--color-text-muted)]">
                            ID: {session.userId.substring(0, 8)}...
                          </div>
                        </div>
                        {session.ipAddress && (
                          <div>
                            <span className="font-medium text-[color:var(--color-text-muted)]">IP Address:</span>{' '}
                            <span className="text-[color:var(--color-text)]">{session.ipAddress}</span>
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-[color:var(--color-text-muted)]">Created:</span>{' '}
                          <span className="text-[color:var(--color-text)]">{formatDateTime(session.createdAt)}</span>
                        </div>
                        <div>
                          <span className="font-medium text-[color:var(--color-text-muted)]">Last Used:</span>{' '}
                          <span className="text-[color:var(--color-text)]">{formatDateTime(session.lastUsedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        if (confirm(`Are you sure you want to revoke this session for ${session.email}?`)) {
                          revokeSession.mutate(session.jti)
                        }
                      }}
                      disabled={revokeSession.isPending}
                      className="ml-4 rounded-lg border border-red-300 bg-red-50 p-2 text-red-700 hover:bg-red-100 disabled:opacity-50"
                      title="Revoke this session"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        </div>
        </>
      )}
    </div>
  )
}

