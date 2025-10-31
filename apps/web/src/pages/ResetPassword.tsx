import * as React from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { getApiUrl } from '@/lib/http'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [message, setMessage] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const [showPwd, setShowPwd] = React.useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = React.useState(false)

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  React.useEffect(() => {
    if (!token) {
      setMessage('Invalid reset link. Please request a new password reset.')
    }
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)

    if (password !== confirmPassword) {
      setMessage('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setMessage('Password must be at least 6 characters')
      return
    }

    if (!token) {
      setMessage('Invalid reset token')
      return
    }

    setLoading(true)

    try {
      const res = await fetch(getApiUrl('/api/auth/forgot-password/reset'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setMessage(err.error ?? 'Reset failed')
        setLoading(false)
        return
      }

      setSuccess(true)
      setMessage('Password has been reset successfully')
      setLoading(false)

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login')
      }, 2000)
    } catch (err) {
      setMessage('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="relative overflow-hidden flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <style>{`
          @keyframes floatX { 0%{transform:translateX(-20%)} 50%{transform:translateX(20%)} 100%{transform:translateX(-20%)} }
          @keyframes floatY { 0%{transform:translateY(-10%)} 50%{transform:translateY(10%)} 100%{transform:translateY(-10%)} }
        `}</style>
        <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden="true">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl" style={{ background: 'radial-gradient(40% 40% at 50% 50%, #22c55e55, transparent 70%)', animation: 'floatX 9s ease-in-out infinite' }} />
          <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full blur-3xl" style={{ background: 'radial-gradient(40% 40% at 50% 50%, #3b82f655, transparent 70%)', animation: 'floatY 11s ease-in-out infinite' }} />
        </div>
        <div className={`w-[min(90vw,24rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow transition-all duration-300 ${mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.98]'}`}>
          <div className="mb-1 text-center text-xl font-semibold">Invalid Reset Link</div>
          <div className="mb-4 text-center text-sm text-red-400">{message || 'This password reset link is invalid or has expired.'}</div>
          <Link to="/forgot-password" className="block w-full rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-center text-sm text-white hover:bg-[color:var(--color-primary-700)]">
            Request New Reset Link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <style>{`
        @keyframes floatX { 0%{transform:translateX(-20%)} 50%{transform:translateX(20%)} 100%{transform:translateX(-20%)} }
        @keyframes floatY { 0%{transform:translateY(-10%)} 50%{transform:translateY(10%)} 100%{transform:translateY(-10%)} }
      `}</style>
      <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden="true">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl" style={{ background: 'radial-gradient(40% 40% at 50% 50%, #22c55e55, transparent 70%)', animation: 'floatX 9s ease-in-out infinite' }} />
        <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full blur-3xl" style={{ background: 'radial-gradient(40% 40% at 50% 50%, #3b82f655, transparent 70%)', animation: 'floatY 11s ease-in-out infinite' }} />
        <div className="absolute top-1/3 -right-20 h-64 w-64 rounded-full blur-3xl" style={{ background: 'radial-gradient(40% 40% at 50% 50%, #a855f755, transparent 70%)', animation: 'floatX 13s ease-in-out infinite' }} />
      </div>
      <div className={`w-[min(90vw,24rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow transition-all duration-300 ${mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.98]'}`}>
        <div className="mb-1 text-center text-xl font-semibold">Reset Password</div>
        <div className="mb-4 text-center text-xs text-[color:var(--color-text-muted)]">Enter your new password</div>

        {success ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-center">
              <div className="mb-2 text-sm font-medium text-green-400">✓ Password Reset Successful</div>
              <div className="text-xs text-[color:var(--color-text-muted)]">
                Redirecting to login...
              </div>
            </div>
            <Link to="/login" className="block w-full rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-center text-sm text-white hover:bg-[color:var(--color-primary-700)]">
              Go to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[color:var(--color-text-muted)]">New Password</span>
              <div className="relative">
                <input
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 pr-10 text-sm"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  autoFocus
                />
                <button
                  type="button"
                  aria-label="Toggle password visibility"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"
                  onClick={() => setShowPwd((v) => !v)}
                >
                  {showPwd ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[color:var(--color-text-muted)]">Confirm Password</span>
              <div className="relative">
                <input
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 pr-10 text-sm"
                  type={showConfirmPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  aria-label="Toggle password visibility"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"
                  onClick={() => setShowConfirmPwd((v) => !v)}
                >
                  {showConfirmPwd ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            {message && <div className={`text-sm ${success ? 'text-green-400' : 'text-red-400'}`}>{message}</div>}
            <button disabled={loading} className="mt-2 w-full rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50">
              {loading ? 'Resetting…' : 'Reset Password'}
            </button>
          </form>
        )}

        <div className="mt-4 text-center text-xs text-[color:var(--color-text-muted)]">
          <Link to="/login" className="underline">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  )
}

