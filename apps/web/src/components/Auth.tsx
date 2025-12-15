import * as React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { getApiUrl } from '@/lib/http'

export function useAccessToken(): string | null {
  try {
    return localStorage.getItem('token')
  } catch {
    return null
  }
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAccessToken()
  const loc = useLocation()
  if (!token) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  return <>{children}</>
}

export function RequireApplication({ appKey, children }: { appKey: string; children: React.ReactNode }) {
  const token = useAccessToken()
  const loc = useLocation()
  const [hasAccess, setHasAccess] = React.useState<boolean | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    // Check application access
    fetch(getApiUrl(`/api/auth/me/applications/${appKey}`), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (res.ok) {
          return res.json()
        }
        return { hasAccess: false }
      })
      .then((data) => {
        setHasAccess(data.hasAccess || false)
        setLoading(false)
      })
      .catch(() => {
        setHasAccess(false)
        setLoading(false)
      })
  }, [token, appKey])

  if (!token) {
    return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-[color:var(--color-primary-600)] border-t-transparent"></div>
          <p className="text-sm text-[color:var(--color-text-muted)]">Checking access...</p>
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center py-8 w-full">
        <div className="w-[min(90vw,28rem)] mx-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-center">
          <h1 className="mb-3 text-xl font-semibold">Access Denied</h1>
          <p className="mb-4 text-sm text-[color:var(--color-text-muted)] leading-normal">
            You don't have access to this application. Please contact an administrator to request access.
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

  return <>{children}</>
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const token = useAccessToken()
  const loc = useLocation()
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!token) {
      setLoading(false)
      setIsAdmin(false)
      return
    }

    fetch(getApiUrl('/api/auth/me/roles'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) return { roles: [], isAdmin: false }
        return await res.json()
      })
      .then((data: any) => {
        const adminFlag = Boolean(data?.isAdmin)
        const hasAdminRole = Array.isArray(data?.roles) && data.roles.some((r: any) => r?.name === 'admin')
        setIsAdmin(adminFlag || hasAdminRole)
        setLoading(false)
      })
      .catch(() => {
        setIsAdmin(false)
        setLoading(false)
      })
  }, [token])

  if (!token) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-[color:var(--color-primary-600)] border-t-transparent"></div>
          <p className="text-sm text-[color:var(--color-text-muted)]">Checking access...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center py-8 w-full">
        <div className="w-[min(90vw,28rem)] mx-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-center">
          <h1 className="mb-3 text-xl font-semibold">Access Denied</h1>
          <p className="mb-4 text-sm text-[color:var(--color-text-muted)] leading-normal">
            Integrations are only available to administrators. Please contact an admin if you need access.
          </p>
          <a
            href="/apps/crm"
            className="inline-block rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
          >
            Go to CRM Hub
          </a>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export async function logout() {
  try {
    // Call logout endpoint to revoke refresh token
    await fetch(getApiUrl('/api/auth/logout'), {
      method: 'POST',
      credentials: 'include', // Include cookies for refresh token
    })
  } catch (err) {
    // Continue with logout even if API call fails
    console.error('Logout API call failed:', err)
  } finally {
    // Clear local token
    localStorage.removeItem('token')
    // Redirect to login
    window.location.href = '/login'
  }
}

