import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Monitor, Trash2, User, Filter, UserPlus, Users, Search, Edit2, X, Key, Mail, CheckCircle, XCircle, Clock, Shield, FolderOpen, FileText, Download } from 'lucide-react'
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
  const [activeTab, setActiveTab] = useState<'sessions' | 'users' | 'registration-requests' | 'access-management' | 'app-access-requests' | 'access-report'>('sessions')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [registrationRequestStatus, setRegistrationRequestStatus] = useState<'pending' | 'approved' | 'rejected' | undefined>(undefined)
  const [appAccessRequestStatus, setAppAccessRequestStatus] = useState<'pending' | 'approved' | 'rejected' | undefined>(undefined)
  const [userIdFilter, setUserIdFilter] = useState<string>('')
  const [emailFilter, setEmailFilter] = useState<string>('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Check if user has admin role
  const { data: currentUserRoles, isLoading: isLoadingRoles } = useQuery<{ roles: Array<{ name: string; permissions: string[] }>; isAdmin?: boolean; userId?: string }>({
    queryKey: ['user', 'roles'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me/roles')
      return res.data
    },
    staleTime: 5 * 60 * 1000,
  })

  const isAdmin = currentUserRoles?.isAdmin || currentUserRoles?.roles?.some(r => r.permissions.includes('*')) || false
  
  // User creation form state
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserPhone, setNewUserPhone] = useState('')
  const [newUserLocation, setNewUserLocation] = useState('')
  const [newUserRoleId, setNewUserRoleId] = useState<string>('')
  const [createdUserPassword, setCreatedUserPassword] = useState<string | null>(null)
  
  // User management state
  const [userSearch, setUserSearch] = useState<string>('')
  const [editingUserRole, setEditingUserRole] = useState<{ userId: string; roleId: string } | null>(null)
  const [editingUserPassword, setEditingUserPassword] = useState<{ userId: string; newPassword: string; forceChangeRequired: boolean } | null>(null)

  // Fetch available roles for dropdown
  const { data: rolesData } = useQuery<{ roles: Array<{ id: string; name: string; permissions: string[] }> }>({
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      const res = await http.get('/api/auth/admin/roles')
      return res.data
    },
    enabled: activeTab === 'users' && isAdmin && !isLoadingRoles,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't retry on 403
  })

  // Fetch users list
  type UserWithRoles = {
    id: string
    email: string
    name?: string
    phoneNumber?: string
    workLocation?: string
    verified: boolean
    passwordChangeRequired: boolean
    createdAt: number
    roles: Array<{ id: string; name: string; permissions: string[] }>
  }
  
  const { data: usersData } = useQuery<{ users: UserWithRoles[]; total: number }>({
    queryKey: ['admin', 'users', userSearch],
    queryFn: async () => {
      const params = userSearch ? { search: userSearch, limit: '100' } : { limit: '100' }
      const res = await http.get('/api/auth/admin/users', { params })
      return res.data
    },
    enabled: (activeTab === 'users' || activeTab === 'access-management') && isAdmin && !isLoadingRoles,
    staleTime: 30 * 1000, // Cache for 30 seconds
    retry: false, // Don't retry on 403
  })

  // Fetch all sessions (with optional user filter)
  const { data: sessionsData, isLoading } = useQuery<{ sessions: Session[] }>({
    queryKey: ['admin', 'sessions', userIdFilter],
    queryFn: async () => {
      const params = userIdFilter ? { userId: userIdFilter } : { limit: '200' }
      const res = await http.get('/api/auth/admin/sessions', { params })
      return res.data
    },
    enabled: activeTab === 'sessions' && isAdmin && !isLoadingRoles,
    staleTime: 30 * 1000, // Cache for 30 seconds
    retry: false, // Don't retry on 403
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
    mutationFn: async (data: { email: string; name?: string; phoneNumber?: string; workLocation?: string; roleId?: string }) => {
      const res = await http.post('/api/auth/admin/users', data)
      return res.data
    },
    onSuccess: (data) => {
      const successMsg = data.assignedRole 
        ? `${data.message || 'User created successfully'} Role "${data.assignedRole.name}" assigned.`
        : (data.message || 'User created successfully')
      
      setMessage(successMsg)
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
      setNewUserRoleId('')
      
      // Refresh user list
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      
      setTimeout(() => {
        setMessage('')
        setCreatedUserPassword(null)
      }, 10000) // Show message for 10 seconds
    },
    onError: (err: any) => {
      if (err.response?.status === 403) {
        setError('Access denied: You do not have admin permissions')
      } else {
        setError(err.response?.data?.error || 'Failed to create user')
      }
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
      roleId: newUserRoleId || undefined,
    })
  }

  // Update user role mutation
  const updateUserRole = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string | null }) => {
      const res = await http.patch(`/api/auth/admin/users/${userId}/role`, { roleId })
      return res.data
    },
    onSuccess: () => {
      setMessage('User role updated successfully')
      setError('')
      setEditingUserRole(null)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setTimeout(() => setMessage(''), 5000)
    },
    onError: (err: any) => {
      if (err.response?.status === 403) {
        setError('Access denied: You do not have admin permissions')
      } else {
        setError(err.response?.data?.error || 'Failed to update user role')
      }
      setMessage('')
      setEditingUserRole(null)
    },
  })

  // Update user password mutation
  const updateUserPassword = useMutation({
    mutationFn: async ({ userId, newPassword, forceChangeRequired }: { userId: string; newPassword: string; forceChangeRequired: boolean }) => {
      const res = await http.patch(`/api/auth/admin/users/${userId}/password`, { newPassword, forceChangeRequired })
      return res.data
    },
    onSuccess: (data) => {
      setMessage(data.message || 'Password updated successfully')
      setError('')
      setEditingUserPassword(null)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setTimeout(() => setMessage(''), 5000)
    },
    onError: (err: any) => {
      if (err.response?.status === 403) {
        setError('Access denied: You do not have admin permissions')
      } else {
        setError(err.response?.data?.error || 'Failed to update password')
      }
      setMessage('')
    },
  })

  // Delete user mutation
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const res = await http.delete(`/api/auth/admin/users/${userId}`)
      return res.data
    },
    onSuccess: () => {
      setMessage('User deleted successfully')
      setError('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setTimeout(() => setMessage(''), 5000)
    },
    onError: (err: any) => {
      if (err.response?.status === 403) {
        setError('Access denied: You do not have admin permissions')
      } else {
        setError(err.response?.data?.error || 'Failed to delete user')
      }
      setMessage('')
    },
  })

  // Fetch registration requests
  type RegistrationRequest = {
    id: string
    email: string
    name?: string
    phoneNumber?: string
    workLocation?: string
    status: 'pending' | 'approved' | 'rejected'
    createdAt: number
    reviewedAt?: number
    reviewedBy?: string
  }

  const { data: registrationRequestsData } = useQuery<{ requests: RegistrationRequest[] }>({
    queryKey: ['admin', 'registration-requests', registrationRequestStatus],
    queryFn: async () => {
      const params = registrationRequestStatus ? { status: registrationRequestStatus } : {}
      const res = await http.get('/api/auth/admin/registration-requests', { params })
      return res.data
    },
    enabled: activeTab === 'registration-requests' && isAdmin && !isLoadingRoles,
    staleTime: 30 * 1000, // Cache for 30 seconds
    retry: false, // Don't retry on 403
  })

  // Approve registration request mutation
  const approveRegistrationRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await http.post(`/api/auth/admin/registration-requests/${requestId}/approve`)
      return res.data
    },
    onSuccess: (data) => {
      if (data.emailSent) {
        setMessage(`Registration request approved. Enrollment email sent to ${data.user?.email || 'user'}.`)
      } else {
        setMessage(`Registration request approved, but email failed to send. Enrollment token: ${data.enrollmentToken || 'N/A'}`)
        setError('Email could not be sent. Please share the enrollment link manually.')
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'registration-requests'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setTimeout(() => {
        setMessage('')
        setError('')
      }, 10000)
    },
    onError: (err: any) => {
      if (err.response?.status === 403) {
        setError('Access denied: You do not have admin permissions')
      } else {
        setError(err.response?.data?.error || 'Failed to approve registration request')
      }
      setMessage('')
    },
  })

  // Fetch application access requests
  type ApplicationAccessRequest = {
    id: string
    userId: string
    userEmail: string
    userName?: string
    appKey: string
    status: 'pending' | 'approved' | 'rejected'
    requestedAt: number
    reviewedAt?: number
    reviewedBy?: string
  }

  const { data: appAccessRequestsData } = useQuery<{ requests: ApplicationAccessRequest[] }>({
    queryKey: ['admin', 'app-access-requests', appAccessRequestStatus],
    queryFn: async () => {
      const params = appAccessRequestStatus ? { status: appAccessRequestStatus } : {}
      const res = await http.get('/api/auth/admin/app-access-requests', { params })
      return res.data
    },
    enabled: activeTab === 'app-access-requests' && isAdmin && !isLoadingRoles,
    staleTime: 30 * 1000,
    retry: false,
  })

  // Approve application access request mutation
  const approveAppAccessRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await http.post(`/api/auth/admin/app-access-requests/${requestId}/approve`)
      return res.data
    },
    onSuccess: (data) => {
      if (data.emailSent) {
        setMessage(`Application access request approved. Access granted and email sent.`)
      } else {
        setMessage(`Application access request approved, but email failed to send.`)
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'app-access-requests'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['user', 'applications'] })
      setTimeout(() => {
        setMessage('')
        setError('')
      }, 5000)
    },
    onError: (err: any) => {
      if (err.response?.status === 403) {
        setError('Access denied: You do not have admin permissions')
      } else {
        setError(err.response?.data?.error || 'Failed to approve application access request')
      }
      setMessage('')
    },
  })

  // Reject application access request mutation
  const rejectAppAccessRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await http.post(`/api/auth/admin/app-access-requests/${requestId}/reject`)
      return res.data
    },
    onSuccess: () => {
      setMessage('Application access request rejected')
      setError('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'app-access-requests'] })
      setTimeout(() => {
        setMessage('')
      }, 5000)
    },
    onError: (err: any) => {
      if (err.response?.status === 403) {
        setError('Access denied: You do not have admin permissions')
      } else {
        setError(err.response?.data?.error || 'Failed to reject application access request')
      }
      setMessage('')
    },
  })

  // Reject registration request mutation
  const rejectRegistrationRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await http.post(`/api/auth/admin/registration-requests/${requestId}/reject`)
      return res.data
    },
    onSuccess: () => {
      setMessage('Registration request rejected successfully')
      setError('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'registration-requests'] })
      setTimeout(() => setMessage(''), 5000)
    },
    onError: (err: any) => {
      if (err.response?.status === 403) {
        setError('Access denied: You do not have admin permissions')
      } else {
        setError(err.response?.data?.error || 'Failed to reject registration request')
      }
      setMessage('')
    },
  })

  // Fetch applications catalog
  type Application = {
    key: string
    name: string
    description: string
  }

  const { data: applicationsData } = useQuery<{ applications: Application[] }>({
    queryKey: ['admin', 'applications'],
    queryFn: async () => {
      const res = await http.get('/api/auth/admin/applications')
      return res.data
    },
    enabled: (activeTab === 'access-management' || activeTab === 'app-access-requests') && isAdmin && !isLoadingRoles,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false,
  })

  // Fetch user's application access
  type UserApplicationAccess = {
    id: string
    userId: string
    appKey: string
    grantedAt: number
    grantedBy?: string
  }

  const { data: userAccessData } = useQuery<{ access: UserApplicationAccess[] }>({
    queryKey: ['admin', 'users', selectedUserId, 'applications'],
    queryFn: async () => {
      if (!selectedUserId) return { access: [] }
      const res = await http.get(`/api/auth/admin/users/${selectedUserId}/applications`)
      return res.data
    },
    enabled: activeTab === 'access-management' && !!selectedUserId && isAdmin && !isLoadingRoles,
    staleTime: 30 * 1000,
    retry: false,
  })

  // Grant application access mutation
  const grantAppAccess = useMutation({
    mutationFn: async ({ userId, appKey }: { userId: string; appKey: string }) => {
      const res = await http.post(`/api/auth/admin/users/${userId}/applications`, { appKey })
      return res.data
    },
    onSuccess: () => {
      setMessage('Application access granted successfully')
      setError('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', selectedUserId, 'applications'] })
      setTimeout(() => setMessage(''), 5000)
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to grant application access')
      setMessage('')
    },
  })

  // Revoke application access mutation
  const revokeAppAccess = useMutation({
    mutationFn: async ({ userId, appKey }: { userId: string; appKey: string }) => {
      const res = await http.delete(`/api/auth/admin/users/${userId}/applications/${appKey}`)
      return res.data
    },
    onSuccess: () => {
      setMessage('Application access revoked successfully')
      setError('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', selectedUserId, 'applications'] })
      setTimeout(() => setMessage(''), 5000)
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to revoke application access')
      setMessage('')
    },
  })

  // Resend welcome email mutation
  const resendWelcomeEmail = useMutation({
    mutationFn: async (userId: string) => {
      const res = await http.post(`/api/auth/admin/users/${userId}/resend-welcome`)
      return res.data
    },
    onSuccess: (data) => {
      if (data.emailSent) {
        setMessage('Welcome email sent successfully with new temporary password')
      } else if (data.temporaryPassword) {
        // Email failed but password was reset - show the password
        setMessage(`Email failed to send, but temporary password was reset: ${data.temporaryPassword}`)
        setError('Email could not be sent. Please share credentials manually.')
      } else {
        setMessage('Email failed, but new temporary password generated. Check response for details.')
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setTimeout(() => {
        setMessage('')
        setError('')
      }, 10000) // Show for 10 seconds if password is shown
    },
    onError: (err: any) => {
      console.error('Resend welcome email error:', err)
      if (err.response?.status === 403) {
        setError('Access denied: You do not have admin permissions')
      } else if (err.response?.status === 404) {
        setError('Endpoint not found. Please ensure the API server is running and has the latest code.')
      } else if (err.response?.data?.error) {
        setError(err.response.data.error)
      } else if (err.response?.data?.message) {
        setError(err.response.data.message)
      } else if (err.message) {
        setError(err.message)
      } else {
        setError('Failed to resend welcome email. Please check the console for details.')
      }
      setMessage('')
    },
  })

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

  // Show access denied message if user doesn't have admin permissions (but only after roles have loaded)
  const showAccessDenied = !isLoadingRoles && !isAdmin

  // Show loading state while checking roles
  if (isLoadingRoles) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center py-8 w-full">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-[color:var(--color-primary-600)] border-t-transparent"></div>
          <p className="text-sm text-[color:var(--color-text-muted)]">Checking access...</p>
        </div>
      </div>
    )
  }

  // Show access denied message if user doesn't have admin permissions
  if (showAccessDenied) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center py-8 w-full">
        <div className="w-[min(90vw,28rem)] mx-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-center">
          <h1 className="mb-3 text-xl font-semibold">Access Denied</h1>
          <p className="mb-4 text-sm text-[color:var(--color-text-muted)] leading-normal">
            You don't have administrator permissions to access this portal. Admin access requires a role with the <code className="rounded bg-[color:var(--color-muted)] px-1 py-0.5 text-xs">*</code> permission.
          </p>
          {currentUserRoles && (
            <div className="mb-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 text-sm text-left">
              <p className="font-medium mb-2">Current Roles:</p>
              {currentUserRoles.roles && currentUserRoles.roles.length > 0 ? (
                <ul className="mt-1 list-inside list-disc space-y-1">
                  {currentUserRoles.roles.map((role, idx) => (
                    <li key={idx}>
                      {role.name} - Permissions: {role.permissions.length > 0 ? role.permissions.join(', ') : 'None'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1">No roles assigned</p>
              )}
              {currentUserRoles.userId && (
                <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">User ID: {currentUserRoles.userId}</p>
              )}
            </div>
          )}
          <p className="mb-4 text-sm text-[color:var(--color-text-muted)]">
            Please contact your system administrator to assign you the admin role.
          </p>
          <a
            href="/dashboard"
            className="inline-block rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    )
  }

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
        <button
          onClick={() => setActiveTab('registration-requests')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'registration-requests'
              ? 'border-b-2 border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <Clock className="mr-2 inline h-4 w-4" />
          Registration Requests
        </button>
        <button
          onClick={() => setActiveTab('access-management')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'access-management'
              ? 'border-b-2 border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <Shield className="mr-2 inline h-4 w-4" />
          Access Management
        </button>
        <button
          onClick={() => setActiveTab('app-access-requests')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'app-access-requests'
              ? 'border-b-2 border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <FolderOpen className="mr-2 inline h-4 w-4" />
          App Access Requests
        </button>
        <button
          onClick={() => setActiveTab('access-report')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'access-report'
              ? 'border-b-2 border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <FileText className="mr-2 inline h-4 w-4" />
          Access Report
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
              
              <div className="grid gap-4 sm:grid-cols-2">
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
                
                <div>
                  <label htmlFor="user-role" className="mb-1 block text-sm font-medium">
                    Role
                  </label>
                  <select
                    id="user-role"
                    value={newUserRoleId}
                    onChange={(e) => setNewUserRoleId(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                  >
                    <option value="">No Role (Optional)</option>
                    {rolesData?.roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name} {role.permissions.includes('*') && '(Admin)'}
                      </option>
                    ))}
                  </select>
                </div>
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

          {/* User List */}
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Manage Users</h2>
                <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                  Search, update roles, or delete users
                </p>
              </div>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                {usersData?.total || 0} user(s)
              </div>
            </div>

            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-text-muted)]" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by email or name..."
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] pl-10 pr-10 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                />
                {userSearch && (
                  <button
                    onClick={() => setUserSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Users List */}
            {!usersData ? (
              <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">
                Loading users...
              </div>
            ) : usersData.users.length === 0 ? (
              <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">
                {userSearch ? 'No users found matching your search.' : 'No users found.'}
              </div>
            ) : (
              <div className="space-y-3">
                {usersData.users.map((user) => {
                  const isEditingRole = editingUserRole?.userId === user.id
                  const currentRoleId = user.roles.length > 0 ? user.roles[0].id : ''

                  return (
                    <div
                      key={user.id}
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="mb-2 flex items-center gap-2">
                            <User className="h-4 w-4 text-[color:var(--color-text-muted)]" />
                            <span className="font-semibold">{user.email}</span>
                            {user.passwordChangeRequired && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                                Password Change Required
                              </span>
                            )}
                            {!user.verified && (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-800">
                                Unverified
                              </span>
                            )}
                          </div>

                          <div className="space-y-1 text-sm text-[color:var(--color-text-muted)]">
                            {user.name && (
                              <div>
                                <span className="font-medium">Name:</span> {user.name}
                              </div>
                            )}
                            {user.phoneNumber && (
                              <div>
                                <span className="font-medium">Phone:</span> {user.phoneNumber}
                              </div>
                            )}
                            {user.workLocation && (
                              <div>
                                <span className="font-medium">Location:</span> {user.workLocation}
                              </div>
                            )}
                            <div>
                              <span className="font-medium">Created:</span> {formatDateTime(user.createdAt)}
                            </div>
                          </div>

                          {/* Current Role */}
                          <div className="mt-3">
                            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                              Role
                            </label>
                            {isEditingRole ? (
                              <div className="flex items-center gap-2">
                                <select
                                  value={editingUserRole.roleId}
                                  onChange={(e) =>
                                    setEditingUserRole({ userId: user.id, roleId: e.target.value })
                                  }
                                  className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-1.5 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                                >
                                  <option value="">No Role</option>
                                  {rolesData?.roles.map((role) => (
                                    <option key={role.id} value={role.id}>
                                      {role.name} {role.permissions.includes('*') && '(Admin)'}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => {
                                    updateUserRole.mutate({
                                      userId: user.id,
                                      roleId: editingUserRole.roleId || null,
                                    })
                                  }}
                                  disabled={updateUserRole.isPending}
                                  className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-1.5 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingUserRole(null)}
                                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-sm hover:bg-[color:var(--color-muted)]"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-1.5 text-sm">
                                  {user.roles.length > 0
                                    ? user.roles.map((r) => r.name).join(', ')
                                    : 'No role assigned'}
                                </div>
                                <button
                                  onClick={() => setEditingUserRole({ userId: user.id, roleId: currentRoleId })}
                                  className="rounded-lg border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
                                  title="Edit role"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Password Update */}
                          <div className="mt-3">
                            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                              Password
                            </label>
                            {editingUserPassword?.userId === user.id ? (
                              <div className="space-y-2">
                                <input
                                  type="password"
                                  value={editingUserPassword.newPassword}
                                  onChange={(e) =>
                                    setEditingUserPassword({
                                      ...editingUserPassword,
                                      newPassword: e.target.value,
                                    })
                                  }
                                  placeholder="Enter new password (min 6 characters)"
                                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-1.5 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                                />
                                <label className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={editingUserPassword.forceChangeRequired}
                                    onChange={(e) =>
                                      setEditingUserPassword({
                                        ...editingUserPassword,
                                        forceChangeRequired: e.target.checked,
                                      })
                                    }
                                    className="rounded border-[color:var(--color-border)]"
                                  />
                                  <span>Require password change on next login</span>
                                </label>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      if (editingUserPassword.newPassword.length < 6) {
                                        setError('Password must be at least 6 characters')
                                        return
                                      }
                                      updateUserPassword.mutate({
                                        userId: user.id,
                                        newPassword: editingUserPassword.newPassword,
                                        forceChangeRequired: editingUserPassword.forceChangeRequired,
                                      })
                                    }}
                                    disabled={updateUserPassword.isPending || editingUserPassword.newPassword.length < 6}
                                    className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-1.5 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingUserPassword(null)}
                                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-sm hover:bg-[color:var(--color-muted)]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-1.5 text-sm text-[color:var(--color-text-muted)]">
                                  ••••••••
                                </div>
                                <button
                                  onClick={() =>
                                    setEditingUserPassword({
                                      userId: user.id,
                                      newPassword: '',
                                      forceChangeRequired: false,
                                    })
                                  }
                                  className="rounded-lg border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
                                  title="Reset password"
                                >
                                  <Key className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="ml-4 flex flex-col gap-2">
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `This will reset ${user.email}'s password to a new temporary password and send them a welcome email. Their current sessions will be revoked. Continue?`
                                )
                              ) {
                                resendWelcomeEmail.mutate(user.id)
                              }
                            }}
                            disabled={resendWelcomeEmail.isPending}
                            className="rounded-lg border border-blue-300 bg-blue-50 p-2 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                            title="Resend welcome email"
                          >
                            <Mail className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `Are you sure you want to delete user "${user.email}"? This action cannot be undone.`
                                )
                              ) {
                                deleteUser.mutate(user.id)
                              }
                            }}
                            disabled={deleteUser.isPending}
                            className="rounded-lg border border-red-300 bg-red-50 p-2 text-red-700 hover:bg-red-100 disabled:opacity-50"
                            title="Delete user"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
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

      {/* Registration Requests */}
      {activeTab === 'registration-requests' && (
        <div className="space-y-6">
          {/* Status Filter */}
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Filter className="h-4 w-4 text-[color:var(--color-text-muted)]" />
              <h2 className="text-sm font-semibold">Filter by Status</h2>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRegistrationRequestStatus(undefined)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  registrationRequestStatus === undefined
                    ? 'bg-[color:var(--color-primary-600)] text-white'
                    : 'bg-[color:var(--color-border)] text-[color:var(--color-text)] hover:bg-[color:var(--color-border)]/80'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setRegistrationRequestStatus('pending')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  registrationRequestStatus === 'pending'
                    ? 'bg-amber-600 text-white'
                    : 'bg-[color:var(--color-border)] text-[color:var(--color-text)] hover:bg-[color:var(--color-border)]/80'
                }`}
              >
                <Clock className="mr-1 inline h-3 w-3" />
                Pending
              </button>
              <button
                onClick={() => setRegistrationRequestStatus('approved')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  registrationRequestStatus === 'approved'
                    ? 'bg-green-600 text-white'
                    : 'bg-[color:var(--color-border)] text-[color:var(--color-text)] hover:bg-[color:var(--color-border)]/80'
                }`}
              >
                <CheckCircle className="mr-1 inline h-3 w-3" />
                Approved
              </button>
              <button
                onClick={() => setRegistrationRequestStatus('rejected')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  registrationRequestStatus === 'rejected'
                    ? 'bg-red-600 text-white'
                    : 'bg-[color:var(--color-border)] text-[color:var(--color-text)] hover:bg-[color:var(--color-border)]/80'
                }`}
              >
                <XCircle className="mr-1 inline h-3 w-3" />
                Rejected
              </button>
            </div>
          </div>

          {/* Registration Requests List */}
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Registration Requests</h2>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                {registrationRequestsData?.requests?.length || 0} request(s)
              </div>
            </div>

            {!isAdmin ? (
              <div className="text-center py-8 text-[color:var(--color-text-muted)]">
                You don't have permission to view registration requests.
              </div>
            ) : !registrationRequestsData ? (
              <div className="text-center py-8 text-[color:var(--color-text-muted)]">Loading...</div>
            ) : registrationRequestsData.requests.length === 0 ? (
              <div className="text-center py-8 text-[color:var(--color-text-muted)]">
                No registration requests found.
              </div>
            ) : (
              <div className="space-y-4">
                {registrationRequestsData.requests.map((request) => (
                  <div
                    key={request.id}
                    className={`rounded-lg border p-4 ${
                      request.status === 'pending'
                        ? 'border-amber-300 bg-amber-50'
                        : request.status === 'approved'
                        ? 'border-green-300 bg-green-50'
                        : 'border-red-300 bg-red-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-lg">{request.email}</span>
                          {request.status === 'pending' && (
                            <span className="rounded-full bg-amber-600 px-2 py-0.5 text-xs font-medium text-white">
                              Pending
                            </span>
                          )}
                          {request.status === 'approved' && (
                            <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs font-medium text-white">
                              Approved
                            </span>
                          )}
                          {request.status === 'rejected' && (
                            <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                              Rejected
                            </span>
                          )}
                        </div>
                        {request.name && (
                          <div className="text-sm text-[color:var(--color-text-muted)] mb-1">
                            <strong>Name:</strong> {request.name}
                          </div>
                        )}
                        {request.phoneNumber && (
                          <div className="text-sm text-[color:var(--color-text-muted)] mb-1">
                            <strong>Phone:</strong> {request.phoneNumber}
                          </div>
                        )}
                        {request.workLocation && (
                          <div className="text-sm text-[color:var(--color-text-muted)] mb-1">
                            <strong>Work Location:</strong> {request.workLocation}
                          </div>
                        )}
                        <div className="text-xs text-[color:var(--color-text-muted)] mt-2">
                          Submitted: {formatDateTime(request.createdAt)}
                        </div>
                        {request.reviewedAt && (
                          <div className="text-xs text-[color:var(--color-text-muted)]">
                            Reviewed: {formatDateTime(request.reviewedAt)}
                          </div>
                        )}
                      </div>
                      {request.status === 'pending' && (
                        <div className="ml-4 flex gap-2">
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `Are you sure you want to approve the registration request for ${request.email}? An enrollment email will be sent to the user.`
                                )
                              ) {
                                approveRegistrationRequest.mutate(request.id)
                              }
                            }}
                            disabled={approveRegistrationRequest.isPending}
                            className="flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                            title="Approve registration request"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `Are you sure you want to reject the registration request for ${request.email}? This action cannot be undone.`
                                )
                              ) {
                                rejectRegistrationRequest.mutate(request.id)
                              }
                            }}
                            disabled={rejectRegistrationRequest.isPending}
                            className="flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                            title="Reject registration request"
                          >
                            <XCircle className="h-4 w-4" />
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Access Management */}
      {activeTab === 'access-management' && (
        <div className="space-y-6">
          {!isAdmin ? (
            <div className="text-center py-8 text-[color:var(--color-text-muted)]">
              You don't have permission to manage application access.
            </div>
          ) : (
            <>
              {/* User Selection */}
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                <h2 className="mb-4 text-lg font-semibold">Select User</h2>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search users by email or name..."
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                  />
                  {usersData?.users && usersData.users.length > 0 && (
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {usersData.users.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => setSelectedUserId(user.id)}
                          className={`w-full text-left rounded-lg border p-3 transition-colors ${
                            selectedUserId === user.id
                              ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-primary-50)]'
                              : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-panel)]'
                          }`}
                        >
                          <div className="font-medium">{user.email}</div>
                          {user.name && <div className="text-sm text-[color:var(--color-text-muted)]">{user.name}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Application Access Management */}
              {selectedUserId && (
                <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                  <h2 className="mb-4 text-lg font-semibold">Application Access</h2>
                  {!applicationsData ? (
                    <div className="text-center py-4 text-[color:var(--color-text-muted)]">Loading applications...</div>
                  ) : (
                    <div className="space-y-4">
                      {applicationsData.applications.map((app) => {
                        const hasAccess = userAccessData?.access?.some((a) => a.appKey === app.key) || false
                        return (
                          <div
                            key={app.key}
                            className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] p-4"
                          >
                            <div className="flex-1">
                              <div className="font-medium">{app.name}</div>
                              <div className="text-sm text-[color:var(--color-text-muted)]">{app.description}</div>
                              {hasAccess && userAccessData?.access && (
                                <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                                  Granted: {formatDateTime(userAccessData.access.find((a) => a.appKey === app.key)?.grantedAt || 0)}
                                </div>
                              )}
                            </div>
                            <div>
                              {hasAccess ? (
                                <button
                                  onClick={() => {
                                    if (confirm(`Revoke ${app.name} access for this user?`)) {
                                      revokeAppAccess.mutate({ userId: selectedUserId, appKey: app.key })
                                    }
                                  }}
                                  disabled={revokeAppAccess.isPending}
                                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                                >
                                  Revoke Access
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    grantAppAccess.mutate({ userId: selectedUserId, appKey: app.key })
                                  }}
                                  disabled={grantAppAccess.isPending}
                                  className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                                >
                                  Grant Access
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* App Access Requests */}
      {activeTab === 'app-access-requests' && (
        <div className="space-y-6">
          {/* Status Filter */}
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span className="text-sm font-medium">Filter by Status:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAppAccessRequestStatus(undefined)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  appAccessRequestStatus === undefined
                    ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-primary-600)] text-white'
                    : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setAppAccessRequestStatus('pending')}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  appAccessRequestStatus === 'pending'
                    ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-primary-600)] text-white'
                    : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]'
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => setAppAccessRequestStatus('approved')}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  appAccessRequestStatus === 'approved'
                    ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-primary-600)] text-white'
                    : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]'
                }`}
              >
                Approved
              </button>
              <button
                onClick={() => setAppAccessRequestStatus('rejected')}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  appAccessRequestStatus === 'rejected'
                    ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-primary-600)] text-white'
                    : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]'
                }`}
              >
                Rejected
              </button>
            </div>
          </div>

          {/* App Access Requests List */}
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Application Access Requests</h2>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                {appAccessRequestsData?.requests?.length || 0} request(s)
              </div>
            </div>

            {!appAccessRequestsData ? (
              <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">Loading...</div>
            ) : appAccessRequestsData.requests.length === 0 ? (
              <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">
                No application access requests found.
              </div>
            ) : (
              <div className="space-y-3">
                {appAccessRequestsData.requests.map((request) => {
                  const appInfo = applicationsData?.applications?.find((app) => app.key === request.appKey)
                  const appName = appInfo?.name || request.appKey
                  return (
                    <div
                      key={request.id}
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="font-medium">{appName}</span>
                            {request.status === 'pending' && (
                              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">Pending</span>
                            )}
                            {request.status === 'approved' && (
                              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Approved</span>
                            )}
                            {request.status === 'rejected' && (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">Rejected</span>
                            )}
                          </div>
                          <div className="text-sm text-[color:var(--color-text-muted)]">
                            <div>
                              <strong>User:</strong> {request.userName || 'N/A'} ({request.userEmail})
                            </div>
                            <div>
                              <strong>Requested:</strong> {formatDateTime(request.requestedAt)}
                            </div>
                            {request.reviewedAt && (
                              <div>
                                <strong>Reviewed:</strong> {formatDateTime(request.reviewedAt)}
                              </div>
                            )}
                          </div>
                        </div>
                        {request.status === 'pending' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => approveAppAccessRequest.mutate(request.id)}
                              disabled={approveAppAccessRequest.isPending}
                              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              <CheckCircle className="mr-1 inline h-4 w-4" />
                              Approve
                            </button>
                            <button
                              onClick={() => rejectAppAccessRequest.mutate(request.id)}
                              disabled={rejectAppAccessRequest.isPending}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              <XCircle className="mr-1 inline h-4 w-4" />
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Access Report */}
      {activeTab === 'access-report' && (
        <div className="space-y-6">
          {!isAdmin ? (
            <div className="text-center py-8 text-[color:var(--color-text-muted)]">
              You don't have permission to view access reports.
            </div>
          ) : (
            <AccessReportView />
          )}
        </div>
      )}
    </div>
  )
}

// Access Report Component
function AccessReportView() {
  const { data: reportData, isLoading } = useQuery<{ report: Array<{
    userId: string
    email: string
    name?: string
    createdAt: number
    lastLoginAt?: number
    roles: string[]
    applicationAccess: string[]
    isVerified: boolean
    passwordChangeRequired: boolean
  }> }>({
    queryKey: ['admin', 'access-report'],
    queryFn: async () => {
      const res = await http.get('/api/auth/admin/access-report')
      return res.data
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false,
  })

  const exportToCSV = () => {
    if (!reportData?.report) return

    const headers = ['Email', 'Name', 'Roles', 'Applications', 'Account Created', 'Last Login', 'Verified', 'Password Change Required']
    const rows = reportData.report.map(user => [
      user.email,
      user.name || 'N/A',
      user.roles.join(', ') || 'None',
      user.applicationAccess.join(', ') || 'None',
      formatDateTime(user.createdAt),
      user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never',
      user.isVerified ? 'Yes' : 'No',
      user.passwordChangeRequired ? 'Yes' : 'No',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `access-report-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">Loading access report...</div>
      </div>
    )
  }

  if (!reportData?.report) {
    return (
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">Failed to load access report.</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Access Report</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
            User access overview with last login times and application permissions
          </p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)]">
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Roles</th>
                <th className="px-4 py-3 text-left font-semibold">Applications</th>
                <th className="px-4 py-3 text-left font-semibold">Account Created</th>
                <th className="px-4 py-3 text-left font-semibold">Last Login</th>
                <th className="px-4 py-3 text-center font-semibold">Verified</th>
                <th className="px-4 py-3 text-center font-semibold">Password Change Required</th>
              </tr>
            </thead>
            <tbody>
              {reportData.report.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[color:var(--color-text-muted)]">
                    No users found
                  </td>
                </tr>
              ) : (
                reportData.report.map((user) => (
                  <tr key={user.userId} className="border-b border-[color:var(--color-border)]">
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">{user.name || 'N/A'}</td>
                    <td className="px-4 py-3">
                      {user.roles.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role, idx) => (
                            <span key={idx} className="rounded-full bg-[color:var(--color-muted)] px-2 py-0.5 text-xs">
                              {role}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[color:var(--color-text-muted)]">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.applicationAccess.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.applicationAccess.map((app, idx) => (
                            <span key={idx} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                              {app}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[color:var(--color-text-muted)]">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--color-text-muted)]">
                      {formatDateTime(user.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--color-text-muted)]">
                      {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : <span className="italic">Never</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {user.isVerified ? (
                        <CheckCircle className="mx-auto h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="mx-auto h-5 w-5 text-red-600" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {user.passwordChangeRequired ? (
                        <span className="text-xs text-yellow-600">Yes</span>
                      ) : (
                        <span className="text-xs text-[color:var(--color-text-muted)]">No</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-xs text-[color:var(--color-text-muted)]">
          Total users: {reportData.report.length}
        </div>
      </div>
    </div>
  )
}

