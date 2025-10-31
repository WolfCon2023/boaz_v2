import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings as SettingsIcon, Shield, User, Clock, CheckCircle2, Circle, Monitor, LogOut, Trash2 } from 'lucide-react'
import { http } from '@/lib/http'
import { formatDateTime } from '@/lib/dateFormat'

type UserInfo = {
  id: string
  email: string
  name?: string
  phoneNumber?: string
  workLocation?: string
}

type Preferences = {
  theme?: 'light' | 'dark'
  layout?: 'default' | 'compact'
  locale?: string
  timezone?: string
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
  timeFormat?: '12h' | '24h'
  emailNotifications?: boolean
}

type Session = {
  jti: string
  userId: string
  email: string
  ipAddress?: string
  userAgent?: string
  createdAt: string
  lastUsedAt: string
  revoked?: boolean
  isCurrent?: boolean
}

export default function Settings() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'security' | 'sessions'>('profile')
  
  const { data: userData } = useQuery<UserInfo>({
    queryKey: ['user', 'me'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me')
      return res.data
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })
  
  const { data: securityQuestionsData } = useQuery<{ questions: string[] }>({
    queryKey: ['user', 'security-questions'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me/security-questions')
      return res.data
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })
  
  const { data: preferencesData } = useQuery<{ data: { preferences: Preferences } }>({
    queryKey: ['preferences', 'me'],
    queryFn: async () => {
      const res = await http.get('/api/preferences/me')
      return res.data
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes - shares cache with PreferencesProvider
  })
  
  // Check if user has admin role
  const { data: rolesData, refetch: refetchRoles } = useQuery<{ roles: Array<{ name: string; permissions: string[] }> }>({
    queryKey: ['user', 'roles'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me/roles')
      return res.data
    },
    staleTime: 5 * 60 * 1000,
  })

  const isAdmin = rolesData?.roles?.some(r => r.permissions.includes('*')) || false

  // Self-assign admin mutation (dev only)
  const selfAssignAdmin = useMutation({
    mutationFn: async () => {
      const res = await http.post('/api/auth/me/self-assign-admin')
      return res.data
    },
    onSuccess: () => {
      setMessage('Admin role assigned successfully! Please refresh the page.')
      setError('')
      refetchRoles()
      setTimeout(() => {
        window.location.reload()
      }, 2000)
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to assign admin role')
      setMessage('')
    },
  })
  
  // Sessions data
  const { data: sessionsData } = useQuery<{ sessions: Session[]; currentJti?: string }>({
    queryKey: ['sessions', 'me'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me/sessions')
      return res.data
    },
    enabled: activeTab === 'sessions',
    staleTime: 30 * 1000, // Cache for 30 seconds
  })
  
  // Revoke session mutation
  const revokeSession = useMutation({
    mutationFn: async (jti: string) => {
      const res = await http.delete(`/api/auth/me/sessions/${jti}`)
      return res.data
    },
    onSuccess: () => {
      setMessage('Session revoked successfully')
      setError('')
      queryClient.invalidateQueries({ queryKey: ['sessions', 'me'] })
      setTimeout(() => setMessage(''), 5000)
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to revoke session')
      setMessage('')
    },
  })
  
  // Revoke all other sessions mutation
  const revokeAllSessions = useMutation({
    mutationFn: async () => {
      const res = await http.post('/api/auth/me/sessions/revoke-all')
      return res.data
    },
    onSuccess: () => {
      setMessage('All other sessions revoked successfully')
      setError('')
      queryClient.invalidateQueries({ queryKey: ['sessions', 'me'] })
      setTimeout(() => setMessage(''), 5000)
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to revoke sessions')
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
  
  // Profile form state
  const [profileForm, setProfileForm] = useState({
    name: '',
    phoneNumber: '',
    workLocation: '',
  })
  
  // Preferences form state
  const [preferencesForm, setPreferencesForm] = useState<Preferences>({
    theme: 'dark',
    layout: 'default',
    locale: 'en-US',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    emailNotifications: true,
  })
  
  // Initialize forms with current data
  useEffect(() => {
    if (userData) {
      setProfileForm({
        name: userData.name || '',
        phoneNumber: userData.phoneNumber || '',
        workLocation: userData.workLocation || '',
      })
    }
  }, [userData])
  
  useEffect(() => {
    if (preferencesData?.data?.preferences) {
      setPreferencesForm((prev) => ({
        ...prev,
        ...preferencesData.data.preferences,
      }))
    }
  }, [preferencesData])
  
  const [securityQuestions, setSecurityQuestions] = useState([
    { question: '', answer: '' },
    { question: '', answer: '' },
    { question: '', answer: '' },
  ])
  const [testAnswers, setTestAnswers] = useState<{ [index: number]: string }>({})
  const [showTestResults, setShowTestResults] = useState<{ [index: number]: boolean | null }>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [editMode, setEditMode] = useState(false)
  
  // Profile update mutation
  const updateProfile = useMutation({
    mutationFn: async (payload: { name?: string; phoneNumber?: string; workLocation?: string }) => {
      const res = await http.put('/api/auth/me/profile', payload)
      return res.data
    },
    onSuccess: () => {
      setMessage('Profile updated successfully!')
      setError('')
      queryClient.invalidateQueries({ queryKey: ['user', 'me'] })
      setTimeout(() => setMessage(''), 5000)
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to update profile')
      setMessage('')
    },
  })
  
  // Preferences update mutation
  const updatePreferences = useMutation({
    mutationFn: async (payload: Preferences) => {
      const res = await http.put('/api/preferences/me', payload)
      return res.data
    },
    onSuccess: () => {
      setMessage('Preferences updated successfully!')
      setError('')
      // Invalidate to trigger PreferencesProvider to apply changes
      queryClient.invalidateQueries({ queryKey: ['preferences', 'me'] })
      // Also immediately apply theme/layout changes
      const el = document.documentElement
      if (preferencesForm.theme) {
        el.setAttribute('data-theme', preferencesForm.theme)
      }
      // Apply layout attribute
      if (preferencesForm.layout === 'compact') {
        el.setAttribute('data-layout', 'compact')
        el.style.setProperty('--dashboard-gap', '0.75rem')
        el.style.setProperty('--spacing-xs', '2px')
        el.style.setProperty('--spacing-sm', '4px')
        el.style.setProperty('--spacing-md', '6px')
        el.style.setProperty('--spacing-lg', '10px')
        el.style.setProperty('--spacing-xl', '16px')
        el.style.setProperty('--spacing-2xl', '24px')
        el.style.setProperty('--spacing-3xl', '32px')
        el.style.setProperty('--layout-padding', '0.75rem')
        el.style.setProperty('--layout-gap', '0.5rem')
        el.style.setProperty('--section-gap', '1rem')
      } else {
        el.setAttribute('data-layout', 'default')
        el.style.setProperty('--dashboard-gap', '1.5rem')
        el.style.setProperty('--spacing-xs', '4px')
        el.style.setProperty('--spacing-sm', '8px')
        el.style.setProperty('--spacing-md', '12px')
        el.style.setProperty('--spacing-lg', '16px')
        el.style.setProperty('--spacing-xl', '24px')
        el.style.setProperty('--spacing-2xl', '32px')
        el.style.setProperty('--spacing-3xl', '40px')
        el.style.setProperty('--layout-padding', '1rem')
        el.style.setProperty('--layout-gap', '1rem')
        el.style.setProperty('--section-gap', '1.5rem')
      }
      setTimeout(() => setMessage(''), 5000)
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to update preferences')
      setMessage('')
    },
  })
  
  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    updateProfile.mutate({
      name: profileForm.name.trim() || undefined,
      phoneNumber: profileForm.phoneNumber.trim() || undefined,
      workLocation: profileForm.workLocation.trim() || undefined,
    })
  }
  
  const handlePreferencesSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    updatePreferences.mutate(preferencesForm)
  }
  
  // Calculate profile completeness
  const profileCompleteness = useMemo(() => {
    if (!userData) return { percentage: 0, filled: 0, total: 0, fields: [] }
    
    const fields = [
      { key: 'email', label: 'Email Address', required: true, filled: !!userData.email },
      { key: 'name', label: 'Name', required: false, filled: !!(userData.name && userData.name.trim()) },
      { key: 'phoneNumber', label: 'Phone Number', required: false, filled: !!(userData.phoneNumber && userData.phoneNumber.trim()) },
      { key: 'workLocation', label: 'Work Location', required: false, filled: !!(userData.workLocation && userData.workLocation.trim()) },
      { key: 'securityQuestions', label: 'Security Questions', required: false, filled: !!(securityQuestionsData?.questions && securityQuestionsData.questions.length >= 3) },
    ]
    
    const filled = fields.filter(f => f.filled).length
    const total = fields.length
    
    return {
      percentage: Math.round((filled / total) * 100),
      filled,
      total,
      fields,
    }
  }, [userData, securityQuestionsData])
  
  // Load existing questions when they're available
  useEffect(() => {
    if (securityQuestionsData?.questions && securityQuestionsData.questions.length > 0 && !editMode) {
      setSecurityQuestions(
        securityQuestionsData.questions.map((q) => ({ question: q, answer: '' }))
      )
    }
  }, [securityQuestionsData, editMode])
  
  const updateSecurityQuestions = useMutation({
    mutationFn: async (payload: { securityQuestions: Array<{ question: string; answer: string }> }) => {
      const res = await http.put('/api/auth/me/security-questions', payload)
      return res.data
    },
    onSuccess: () => {
      setMessage('Security questions updated successfully!')
      setError('')
      setEditMode(false)
      // Invalidate and refetch security questions
      queryClient.invalidateQueries({ queryKey: ['user', 'security-questions'] })
      setTimeout(() => setMessage(''), 5000)
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to update security questions')
      setMessage('')
    },
  })
  
  const testAnswer = useMutation({
    mutationFn: async (payload: { question: string; answer: string; index: number }) => {
      const res = await http.post('/api/auth/me/test-security-answer', {
        question: payload.question,
        answer: payload.answer,
      })
      setShowTestResults((prev) => ({ ...prev, [payload.index]: res.data.valid }))
      return res.data
    },
    onSuccess: (_data, variables) => {
      // Clear the answer field immediately after testing for security
      setTestAnswers((prev) => {
        const updated = { ...prev }
        delete updated[variables.index]
        return updated
      })
      
      // Hide the test result after 3 seconds
      setTimeout(() => {
        setShowTestResults((prev) => {
          const updated = { ...prev }
          delete updated[variables.index]
          return updated
        })
      }, 3000)
    },
  })
  
  const handleTestAnswer = (index: number) => {
    const question = securityQuestions[index]?.question
    const answer = testAnswers[index]
    if (!question || !answer) {
      setError('Please enter an answer to test')
      return
    }
    testAnswer.mutate({ question, answer, index })
  }
  
  const handleSecuritySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    
    // Validate all questions are filled
    const allFilled = securityQuestions.every((sq) => sq.question.trim() && sq.answer.trim())
    if (!allFilled) {
      setError('Please provide all 3 security questions and answers.')
      return
    }
    
    updateSecurityQuestions.mutate({
      securityQuestions: securityQuestions.map((sq) => ({
        question: sq.question.trim(),
        answer: sq.answer.trim(),
      })),
    })
  }
  
  const updateQuestion = (index: number, field: 'question' | 'answer', value: string) => {
    setSecurityQuestions((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-2 border-b border-[color:var(--color-border)]">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'profile'
              ? 'border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'border-transparent text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <User className="h-4 w-4" />
          Profile
        </button>
        <button
          onClick={() => setActiveTab('preferences')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'preferences'
              ? 'border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'border-transparent text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <Clock className="h-4 w-4" />
          Preferences
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'security'
              ? 'border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'border-transparent text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <Shield className="h-4 w-4" />
          Security
        </button>
        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'sessions'
              ? 'border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'border-transparent text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <Monitor className="h-4 w-4" />
          Sessions
        </button>
      </div>
      
      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {/* Profile Completeness Indicator */}
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Profile Completeness</h2>
              <div className="text-2xl font-bold text-[color:var(--color-primary-600)]">
                {profileCompleteness.percentage}%
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="mb-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--color-muted)]">
                <div
                  className="h-full bg-[color:var(--color-primary-600)] transition-all duration-300"
                  style={{ width: `${profileCompleteness.percentage}%` }}
                />
              </div>
            </div>
            
            {/* Field Checklist */}
            <div className="space-y-2">
              <p className="mb-2 text-sm font-medium text-[color:var(--color-text-muted)]">
                Profile Fields ({profileCompleteness.filled} of {profileCompleteness.total} completed)
              </p>
              {profileCompleteness.fields.map((field) => (
                <div key={field.key} className="flex items-center gap-2 text-sm">
                  {field.filled ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Circle className="h-4 w-4 text-[color:var(--color-text-muted)]" />
                  )}
                  <span className={field.filled ? 'text-[color:var(--color-text)]' : 'text-[color:var(--color-text-muted)]'}>
                    {field.label}
                    {field.required && <span className="ml-1 text-red-500">*</span>}
                  </span>
                  {!field.filled && field.key === 'securityQuestions' && (
                    <span className="ml-auto text-xs text-[color:var(--color-text-muted)]">
                      <a href="#security" onClick={(e) => { e.preventDefault(); setActiveTab('security') }} className="underline hover:text-[color:var(--color-primary-600)]">
                        Set up
                      </a>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Profile Information Form */}
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
            <h2 className="mb-4 text-lg font-semibold">Profile Information</h2>
            
            {error && (
              <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}
            
            {message && (
              <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
                {message}
              </div>
            )}
            
            <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-3 py-2 text-sm text-[color:var(--color-text-muted)]">
                {userData?.email || '—'}
              </div>
              <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                Your email address cannot be changed.
              </p>
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium">User ID</label>
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-3 py-2 text-sm text-[color:var(--color-text-muted)] font-mono">
                {userData?.id || '—'}
              </div>
              <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                Your unique user identifier
              </p>
            </div>

            {/* Admin Role Assignment (Dev Only) */}
            {!isAdmin && import.meta.env.DEV && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-700" />
                  <h3 className="text-sm font-semibold text-amber-900">Admin Access</h3>
                </div>
                <p className="mb-3 text-xs text-amber-800">
                  You don't have admin access. In development mode, you can self-assign the admin role to access the Admin Portal.
                </p>
                <button
                  onClick={() => {
                    if (confirm('Assign admin role to your account? (Development only)')) {
                      selfAssignAdmin.mutate()
                    }
                  }}
                  disabled={selfAssignAdmin.isPending}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {selfAssignAdmin.isPending ? 'Assigning...' : 'Assign Admin Role'}
                </button>
              </div>
            )}

            {/* Admin Status */}
            {isAdmin && (
              <div className="rounded-lg border border-green-300 bg-green-50 p-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-700" />
                  <span className="text-sm font-semibold text-green-900">Admin Access Active</span>
                </div>
                <p className="mt-1 text-xs text-green-800">
                  You have administrator privileges. Access the Admin Portal from the sidebar.
                </p>
              </div>
            )}
            
            <div>
              <label htmlFor="profile-name" className="mb-1 block text-sm font-medium">
                Name
              </label>
              <input
                id="profile-name"
                type="text"
                value={profileForm.name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Your full name"
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                disabled={updateProfile.isPending}
              />
            </div>
            
            <div>
              <label htmlFor="profile-phone" className="mb-1 block text-sm font-medium">
                Phone Number
              </label>
              <input
                id="profile-phone"
                type="tel"
                value={profileForm.phoneNumber}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                placeholder="+1 (555) 123-4567"
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                disabled={updateProfile.isPending}
              />
            </div>
            
            <div>
              <label htmlFor="profile-location" className="mb-1 block text-sm font-medium">
                Work Location / Site Location
              </label>
              <input
                id="profile-location"
                type="text"
                value={profileForm.workLocation}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, workLocation: e.target.value }))}
                placeholder="e.g., Main Office, Downtown Branch"
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                disabled={updateProfile.isPending}
              />
            </div>
            
            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="mt-4 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
            >
              {updateProfile.isPending ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
          </div>
        </div>
      )}
      
      {/* Preferences Tab */}
      {activeTab === 'preferences' && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
          <h2 className="mb-4 text-lg font-semibold">Preferences</h2>
          
          {error && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
          
          {message && (
            <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
              {message}
            </div>
          )}
          
          <form onSubmit={handlePreferencesSubmit} className="space-y-6">
            <div>
              <label htmlFor="pref-theme" className="mb-1 block text-sm font-medium">
                Theme
              </label>
              <select
                id="pref-theme"
                value={preferencesForm.theme || 'dark'}
                onChange={(e) => setPreferencesForm((prev) => ({ ...prev, theme: e.target.value as 'light' | 'dark' }))}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                disabled={updatePreferences.isPending}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="pref-layout" className="mb-1 block text-sm font-medium">
                Layout
              </label>
              <select
                id="pref-layout"
                value={preferencesForm.layout || 'default'}
                onChange={(e) => setPreferencesForm((prev) => ({ ...prev, layout: e.target.value as 'default' | 'compact' }))}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                disabled={updatePreferences.isPending}
              >
                <option value="default">Default</option>
                <option value="compact">Compact</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="pref-timezone" className="mb-1 block text-sm font-medium">
                Timezone
              </label>
              <select
                id="pref-timezone"
                value={preferencesForm.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
                onChange={(e) => setPreferencesForm((prev) => ({ ...prev, timezone: e.target.value }))}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                disabled={updatePreferences.isPending}
              >
                <option value="America/New_York">Eastern Time (ET)</option>
                <option value="America/Chicago">Central Time (CT)</option>
                <option value="America/Denver">Mountain Time (MT)</option>
                <option value="America/Los_Angeles">Pacific Time (PT)</option>
                <option value="America/Phoenix">Arizona (MST)</option>
                <option value="America/Anchorage">Alaska Time (AKT)</option>
                <option value="Pacific/Honolulu">Hawaii Time (HST)</option>
                <option value="UTC">UTC</option>
                <option value="Europe/London">London (GMT)</option>
                <option value="Europe/Paris">Paris (CET)</option>
                <option value="Asia/Tokyo">Tokyo (JST)</option>
                <option value="Australia/Sydney">Sydney (AEDT)</option>
              </select>
              <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                This affects how dates and times are displayed throughout the application.
              </p>
            </div>
            
            <div>
              <label htmlFor="pref-date-format" className="mb-1 block text-sm font-medium">
                Date Format
              </label>
              <select
                id="pref-date-format"
                value={preferencesForm.dateFormat || 'MM/DD/YYYY'}
                onChange={(e) => setPreferencesForm((prev) => ({ ...prev, dateFormat: e.target.value as 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' }))}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                disabled={updatePreferences.isPending}
              >
                <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY (International)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="pref-time-format" className="mb-1 block text-sm font-medium">
                Time Format
              </label>
              <select
                id="pref-time-format"
                value={preferencesForm.timeFormat || '12h'}
                onChange={(e) => setPreferencesForm((prev) => ({ ...prev, timeFormat: e.target.value as '12h' | '24h' }))}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                disabled={updatePreferences.isPending}
              >
                <option value="12h">12-hour (AM/PM)</option>
                <option value="24h">24-hour</option>
              </select>
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium">
                Email Notifications
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferencesForm.emailNotifications ?? true}
                  onChange={(e) => setPreferencesForm((prev) => ({ ...prev, emailNotifications: e.target.checked }))}
                  className="rounded border-[color:var(--color-border)]"
                  disabled={updatePreferences.isPending}
                />
                <span className="text-sm">Receive email notifications</span>
              </label>
              <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                You'll receive emails for important account updates and notifications.
              </p>
            </div>
            
            <button
              type="submit"
              disabled={updatePreferences.isPending}
              className="mt-4 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
            >
              {updatePreferences.isPending ? 'Saving...' : 'Save Preferences'}
            </button>
          </form>
        </div>
      )}
      
      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Security Questions</h2>
              <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                {securityQuestionsData?.questions && securityQuestionsData.questions.length > 0
                  ? 'View and manage your security questions. One will be randomly selected when you need to recover your username.'
                  : 'Set up 3 security questions to enable account recovery.'}
              </p>
            </div>
            {securityQuestionsData?.questions && securityQuestionsData.questions.length > 0 && !editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
              >
                Edit
              </button>
            )}
          </div>
          
          {error && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
          
          {message && (
            <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
              {message}
            </div>
          )}
          
          {!editMode && securityQuestionsData?.questions && securityQuestionsData.questions.length > 0 ? (
            // View mode - show existing questions
            <div className="space-y-4">
              {securityQuestions.map((sq, index) => (
                <div key={index} className="rounded-lg border border-[color:var(--color-border)] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Security Question {index + 1}</h3>
                  </div>
                  <div className="mb-3">
                    <label className="mb-1 block text-xs text-[color:var(--color-text-muted)]">Question</label>
                    <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-3 py-2 text-sm">
                      {sq.question || 'Not set'}
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="mb-1 block text-xs text-[color:var(--color-text-muted)]">Answer</label>
                    <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-3 py-2 text-sm">
                      ••••••••
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                      Your answer is stored securely and cannot be viewed.
                    </p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={testAnswers[index] || ''}
                      onChange={(e) => setTestAnswers((prev) => ({ ...prev, [index]: e.target.value }))}
                      placeholder="Test your answer"
                      className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                    />
                    <button
                      onClick={() => handleTestAnswer(index)}
                      disabled={testAnswer.isPending || !testAnswers[index]}
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                    >
                      Test
                    </button>
                  </div>
                  {showTestResults[index] !== undefined && (
                    <div
                      className={`mt-2 rounded-lg border p-2 text-xs ${
                        showTestResults[index]
                          ? 'border-green-300 bg-green-50 text-green-800'
                          : 'border-red-300 bg-red-50 text-red-800'
                      }`}
                    >
                      {showTestResults[index] ? '✓ Correct answer' : '✗ Incorrect answer'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            // Edit mode - allow updating questions
            <form onSubmit={handleSecuritySubmit} className="space-y-6">
              {securityQuestions.map((sq, index) => (
                <div key={index} className="space-y-3 rounded-lg border border-[color:var(--color-border)] p-4">
                  <h3 className="text-sm font-semibold">Security Question {index + 1}</h3>
                  <div>
                    <label htmlFor={`question-${index}`} className="mb-1 block text-sm font-medium">
                      Question
                    </label>
                    <input
                      id={`question-${index}`}
                      type="text"
                      value={sq.question}
                      onChange={(e) => updateQuestion(index, 'question', e.target.value)}
                      placeholder="e.g., What was the name of your first pet?"
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                      required
                      disabled={updateSecurityQuestions.isPending}
                    />
                  </div>
                  <div>
                    <label htmlFor={`answer-${index}`} className="mb-1 block text-sm font-medium">
                      Answer
                    </label>
                    <input
                      id={`answer-${index}`}
                      type="text"
                      value={sq.answer}
                      onChange={(e) => updateQuestion(index, 'answer', e.target.value)}
                      placeholder={sq.question ? 'Your answer' : 'Enter question first'}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
                      required
                      disabled={updateSecurityQuestions.isPending}
                    />
                  </div>
                </div>
              ))}
              
              <div className="flex gap-2">
                {editMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditMode(false)
                      setError('')
                      setMessage('')
                      setTestAnswers({})
                      setShowTestResults({})
                      // Reload questions from cache
                      queryClient.invalidateQueries({ queryKey: ['user', 'security-questions'] })
                    }}
                    className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={updateSecurityQuestions.isPending}
                  className="flex-1 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                >
                  {updateSecurityQuestions.isPending ? 'Saving...' : editMode ? 'Update Security Questions' : 'Save Security Questions'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      
      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Active Sessions</h2>
              <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                Manage your active sessions across different devices and browsers.
              </p>
            </div>
            {sessionsData && sessionsData.sessions.length > 1 && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to revoke all other sessions? You will remain logged in on this device.')) {
                    revokeAllSessions.mutate()
                  }
                }}
                disabled={revokeAllSessions.isPending}
                className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                <LogOut className="mr-2 inline h-4 w-4" />
                {revokeAllSessions.isPending ? 'Revoking...' : 'Revoke All Others'}
              </button>
            )}
          </div>
          
          {error && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
          
          {message && (
            <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
              {message}
            </div>
          )}
          
          {!sessionsData ? (
            <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">
              Loading sessions...
            </div>
          ) : sessionsData.sessions.length === 0 ? (
            <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">
              No active sessions found.
            </div>
          ) : (
            <div className="space-y-3">
              {sessionsData.sessions.map((session) => {
                const isCurrent = session.isCurrent || false
                const { device, browser } = parseUserAgent(session.userAgent)
                
                return (
                  <div
                    key={session.jti}
                    className={`rounded-lg border p-4 ${
                      isCurrent
                        ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]'
                        : 'border-[color:var(--color-border)] bg-[color:var(--color-panel)]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="mb-2 flex items-center gap-2">
                          <Monitor className="h-4 w-4 text-[color:var(--color-text-muted)]" />
                          <span className="font-semibold">
                            {device} • {browser}
                          </span>
                          {isCurrent && (
                            <span className="rounded-full bg-[color:var(--color-primary-600)] px-2 py-0.5 text-xs text-white">
                              Current Session
                            </span>
                          )}
                        </div>
                        
                        <div className="space-y-1 text-sm text-[color:var(--color-text-muted)]">
                          {session.ipAddress && (
                            <div>
                              <span className="font-medium">IP Address:</span> {session.ipAddress}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">Created:</span> {formatDateTime(session.createdAt)}
                          </div>
                          <div>
                            <span className="font-medium">Last Used:</span> {formatDateTime(session.lastUsedAt)}
                          </div>
                        </div>
                      </div>
                      
                      {!isCurrent && (
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to revoke this session?')) {
                              revokeSession.mutate(session.jti)
                            }
                          }}
                          disabled={revokeSession.isPending}
                          className="ml-4 rounded-lg border border-red-300 bg-red-50 p-2 text-red-700 hover:bg-red-100 disabled:opacity-50"
                          title="Revoke this session"
                        >
                          <Trash2 className="h-4 w-4" />
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
    </div>
  )
}

