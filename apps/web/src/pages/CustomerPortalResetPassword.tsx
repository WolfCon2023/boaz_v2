/**
 * Customer Portal Reset Password
 * 
 * Handles password reset from the link sent to customers
 */

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { http } from '../lib/http'
import { useToast } from '../components/Toast'
import { CheckCircle, XCircle, Lock } from 'lucide-react'

export default function CustomerPortalResetPassword() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<'form' | 'success' | 'error'>('form')
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [token, setToken] = useState('')

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const t = searchParams.get('token')
    if (!t) {
      setStatus('error')
    } else {
      setToken(t)
    }
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error')
      return
    }
    
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error')
      return
    }

    setLoading(true)

    try {
      const res = await http.post('/api/customer-portal/auth/reset-password', {
        token,
        newPassword,
      })

      if (res.data.error) {
        if (res.data.error === 'invalid_or_expired_token') {
          showToast('Invalid or expired reset link', 'error')
          setStatus('error')
        } else {
          showToast('Password reset failed: ' + res.data.error, 'error')
        }
        return
      }

      setStatus('success')
      showToast('Password reset successfully!', 'success')
      // Auto-redirect after 3 seconds
      setTimeout(() => navigate('/customer/login'), 3000)
    } catch (err: any) {
      console.error('Reset password error:', err)
      showToast('Password reset failed', 'error')
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative overflow-hidden flex min-h-screen items-center justify-center bg-[color:var(--color-bg)]">
      {/* Animated background - matching BOAZ design */}
      <style>{`
        @keyframes floatX { 0%{transform:translateX(-20%)} 50%{transform:translateX(20%)} 100%{transform:translateX(-20%)} }
        @keyframes floatY { 0%{transform:translateY(-10%)} 50%{transform:translateY(10%)} 100%{transform:translateY(-10%)} }
      `}</style>
      <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden="true">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl" style={{ background: 'radial-gradient(40% 40% at 50% 50%, #22c55e55, transparent 70%)', animation: 'floatX 9s ease-in-out infinite' }} />
        <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full blur-3xl" style={{ background: 'radial-gradient(40% 40% at 50% 50%, #3b82f655, transparent 70%)', animation: 'floatY 11s ease-in-out infinite' }} />
        <div className="absolute top-1/3 -right-20 h-64 w-64 rounded-full blur-3xl" style={{ background: 'radial-gradient(40% 40% at 50% 50%, #a855f755, transparent 70%)', animation: 'floatX 13s ease-in-out infinite' }} />
      </div>

      <div className={`w-[min(90vw,28rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-8 shadow-lg transition-all duration-300 ${mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-[0.98]'}`}>
        {status === 'form' && (
          <>
            <div className="mb-6 text-center">
              <div className="mb-4 text-4xl">🔐</div>
              <h2 className="text-xl font-semibold text-[color:var(--color-text)] mb-2">
                Reset Your Password
              </h2>
              <p className="text-sm text-[color:var(--color-text-muted)]">
                Enter your new password below
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block text-[color:var(--color-text-muted)]">New Password</span>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 pr-16 text-sm text-[color:var(--color-text)]"
                    placeholder="••••••••"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"
                  >
                    {showPwd ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  Minimum 8 characters
                </div>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-[color:var(--color-text-muted)]">Confirm Password</span>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm text-[color:var(--color-text)]"
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 transition-colors"
              >
                {loading ? 'Resetting Password...' : 'Reset Password'}
              </button>

              <div className="text-center">
                <Link
                  to="/customer/login"
                  className="text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] underline"
                >
                  Back to Login
                </Link>
              </div>
            </form>
          </>
        )}

        {status === 'success' && (
          <div className="text-center">
            <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold text-[color:var(--color-text)] mb-2">
              Password Reset Successfully!
            </h2>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-6">
              Your password has been updated. You can now login with your new password.
            </p>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-6">
              Redirecting you to login...
            </p>
            <Link
              to="/customer/login"
              className="inline-block rounded-lg bg-[color:var(--color-primary-600)] px-6 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] transition-colors"
            >
              Go to Login
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <XCircle className="mx-auto h-16 w-16 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold text-[color:var(--color-text)] mb-2">
              Invalid Reset Link
            </h2>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-6">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <Link
              to="/customer/login"
              className="inline-block rounded-lg bg-[color:var(--color-primary-600)] px-6 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] transition-colors"
            >
              Go to Login
            </Link>
          </div>
        )}

        <div className="mt-8 text-center text-xs text-[color:var(--color-text-muted)]">
          © 2025 Wolf Consulting Group, LLC
        </div>
      </div>
    </div>
  )
}

