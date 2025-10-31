import * as React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getApiUrl } from '@/lib/http'
import { Lock, Eye, EyeOff } from 'lucide-react'

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [message, setMessage] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [showCurrentPwd, setShowCurrentPwd] = React.useState(false)
  const [showNewPwd, setShowNewPwd] = React.useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = React.useState(false)
  const [capsOn, setCapsOn] = React.useState(false)
  
  const navigate = useNavigate()
  const location = useLocation()
  const requireChange = (location.state as any)?.requireChange || false
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  React.useEffect(() => {
    try {
      ;(document.getElementById('current-password') as HTMLInputElement | null)?.focus()
    } catch {}
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required')
      return
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current password')
      return
    }

    setLoading(true)

    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setError('You must be logged in to change your password')
        setLoading(false)
        navigate('/login')
        return
      }

      const res = await fetch(getApiUrl('/api/auth/me/change-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error ?? 'Failed to change password')
        setLoading(false)
        return
      }

      setMessage('Password changed successfully! Redirecting...')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')

      // Wait a moment, then redirect
      setTimeout(() => {
        if (requireChange) {
          // If this was a required change, redirect to home
          navigate('/', { replace: true })
        } else {
          // Otherwise go back
          navigate(-1)
        }
      }, 1500)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="relative overflow-hidden flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <style>{`
        @keyframes floatX { 0%{transform:translateX(-20%)} 50%{transform:translateX(20%)} 100%{transform:translateX(-20%)} }
        @keyframes floatY { 0%{transform:translateY(-10%)} 50%{transform:translateY(10%)} 100%{transform:translateY(-10%)} }
      `}</style>
      <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden="true">
        <div
          className="absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl"
          style={{
            background: 'radial-gradient(40% 40% at 50% 50%, #22c55e55, transparent 70%)',
            animation: 'floatX 9s ease-in-out infinite',
          }}
        />
        <div
          className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full blur-3xl"
          style={{
            background: 'radial-gradient(40% 40% at 50% 50%, #3b82f655, transparent 70%)',
            animation: 'floatY 11s ease-in-out infinite',
          }}
        />
        <div
          className="absolute top-1/3 -right-20 h-64 w-64 rounded-full blur-3xl"
          style={{
            background: 'radial-gradient(40% 40% at 50% 50%, #a855f755, transparent 70%)',
            animation: 'floatX 13s ease-in-out infinite',
          }}
        />
      </div>
      <div
        className={`w-[min(90vw,28rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow transition-all duration-300 ${
          mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.98]'
        }`}
      >
        <div className="mb-1 flex items-center justify-center gap-2 text-center text-xl font-semibold">
          <Lock className="h-5 w-5" />
          {requireChange ? 'Change Your Password' : 'Change Password'}
        </div>
        {requireChange && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-center text-xs text-amber-800">
            You must change your password before continuing.
          </div>
        )}
        <div className="mb-4 text-center text-xs text-[color:var(--color-text-muted)]">
          {requireChange
            ? 'Please set a new password for your account'
            : 'Update your account password'}
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-[color:var(--color-text-muted)]">Current Password</span>
            <div className="relative">
              <input
                id="current-password"
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 pr-10 text-sm"
                type={showCurrentPwd ? 'text' : 'password'}
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                onKeyUp={(e) => setCapsOn((e as any).getModifierState && (e as any).getModifierState('CapsLock'))}
              />
              <button
                type="button"
                aria-label="Toggle password visibility"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"
                onClick={() => setShowCurrentPwd((v) => !v)}
              >
                {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-[color:var(--color-text-muted)]">New Password</span>
            <div className="relative">
              <input
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 pr-10 text-sm"
                type={showNewPwd ? 'text' : 'password'}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                aria-label="Toggle password visibility"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"
                onClick={() => setShowNewPwd((v) => !v)}
              >
                {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">Must be at least 6 characters</div>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-[color:var(--color-text-muted)]">Confirm New Password</span>
            <div className="relative">
              <input
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 pr-10 text-sm"
                type={showConfirmPwd ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                aria-label="Toggle password visibility"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"
                onClick={() => setShowConfirmPwd((v) => !v)}
              >
                {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          {capsOn && <div className="text-[11px] text-yellow-300">Caps Lock is on</div>}
          {error && <div className="text-sm text-red-400">{error}</div>}
          {message && <div className="text-sm text-green-400">{message}</div>}

          <button
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
          >
            {loading ? 'Changing Password…' : requireChange ? 'Change Password & Continue' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

