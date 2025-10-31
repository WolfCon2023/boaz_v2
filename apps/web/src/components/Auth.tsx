import * as React from 'react'
import { Navigate, useLocation } from 'react-router-dom'

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

export async function logout() {
  try {
    // Call logout endpoint to revoke refresh token
    await fetch('/api/auth/logout', {
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

