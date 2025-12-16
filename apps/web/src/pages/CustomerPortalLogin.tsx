/**
 * Customer Portal Login & Registration
 * 
 * External customer-facing authentication page
 * Matches BOAZ-OS design system
 */

import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { http } from '../lib/http'
import { useToast } from '../components/Toast'

export default function CustomerPortalLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast } = useToast()
  
  const [mode, setMode] = React.useState<'login' | 'register' | 'forgot'>('login')
  const [loading, setLoading] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const [showPwd, setShowPwd] = React.useState(false)
  const [capsOn, setCapsOn] = React.useState(false)
  
  // Login form
  const [loginEmail, setLoginEmail] = React.useState('')
  const [loginPassword, setLoginPassword] = React.useState('')
  
  // Register form
  const [regEmail, setRegEmail] = React.useState('')
  const [regPassword, setRegPassword] = React.useState('')
  const [regName, setRegName] = React.useState('')
  const [regPhone, setRegPhone] = React.useState('')
  
  // Forgot password
  const [forgotEmail, setForgotEmail] = React.useState('')
  const [forgotSent, setForgotSent] = React.useState(false)
  
  // Registration success
  const [regSuccess, setRegSuccess] = React.useState(false)

  const redirectAfterAuth = React.useMemo(() => {
    try {
      const params = new URLSearchParams(location.search || '')
      const next = (params.get('next') || '').trim()
      const invoiceId = (params.get('invoiceId') || '').trim()

      // Only allow safe in-app customer routes to avoid open redirects.
      const safeNext = next.startsWith('/customer/') ? next : '/customer/dashboard'
      if (!invoiceId) return safeNext

      const joiner = safeNext.includes('?') ? '&' : '?'
      return `${safeNext}${joiner}invoiceId=${encodeURIComponent(invoiceId)}`
    } catch {
      return '/customer/dashboard'
    }
  }, [location.search])

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  React.useEffect(() => {
    try {
      if (mode === 'login') (document.getElementById('customer-login-email') as HTMLInputElement | null)?.focus()
      if (mode === 'register') (document.getElementById('customer-register-name') as HTMLInputElement | null)?.focus()
      if (mode === 'forgot') (document.getElementById('customer-forgot-email') as HTMLInputElement | null)?.focus()
    } catch {}
  }, [mode])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await http.post('/api/customer-portal/auth/login', {
        email: loginEmail,
        password: loginPassword,
      })

      if (res.data.error) {
        if (res.data.error === 'invalid_credentials') {
          showToast('Invalid email or password', 'error')
        } else if (res.data.error === 'email_not_verified') {
          showToast('Please verify your email before logging in', 'error')
        } else if (res.data.error === 'account_inactive') {
          showToast('Your account has been deactivated', 'error')
        } else {
          showToast('Login failed: ' + res.data.error, 'error')
        }
        return
      }

      // Clear admin token to prevent conflicts
      localStorage.removeItem('token')
      
      localStorage.setItem('customer_portal_token', res.data.data.token)
      localStorage.setItem('customer_portal_user', JSON.stringify(res.data.data.customer))
      
      showToast('Welcome back!', 'success')
      navigate(redirectAfterAuth)
    } catch (err: any) {
      console.error('Login error:', err)
      showToast('Login failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await http.post('/api/customer-portal/auth/register', {
        email: regEmail,
        password: regPassword,
        name: regName,
        phone: regPhone,
      })

      if (res.data.error) {
        if (res.data.error === 'email_already_registered') {
          showToast('Email already registered', 'error')
        } else {
          showToast('Registration failed: ' + res.data.error, 'error')
        }
        return
      }

      setRegSuccess(true)
      showToast('Registration successful! Check your email to verify your account.', 'success')
    } catch (err: any) {
      console.error('Registration error:', err)
      showToast('Registration failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      await http.post('/api/customer-portal/auth/forgot-password', {
        email: forgotEmail,
      })

      setForgotSent(true)
      showToast('Password reset email sent (if account exists)', 'success')
    } catch (err: any) {
      console.error('Forgot password error:', err)
      showToast('Failed to send reset email', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative overflow-hidden flex min-h-[calc(100vh-8rem)] items-center justify-center">
      {/* Animated background - match internal sign-in */}
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
        <div className="mb-1 text-center text-xl font-semibold">
          {mode === 'login' && 'Sign in'}
          {mode === 'register' && 'Create account'}
          {mode === 'forgot' && 'Reset password'}
        </div>
        <div className="mb-4 text-center text-xs text-[color:var(--color-text-muted)]">
          {mode === 'login' && 'Customer Portal — Welcome back to BOAZ‑OS'}
          {mode === 'register' && 'Customer Portal — Create your access'}
          {mode === 'forgot' && 'Customer Portal — We’ll email a reset link'}
        </div>

        {/* Login Form */}
        {mode === 'login' && !forgotSent && (
          <form onSubmit={handleLogin} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[color:var(--color-text-muted)]">Email</span>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm text-[color:var(--color-text)]"
                placeholder="you@example.com"
                id="customer-login-email"
                autoComplete="email"
                required
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-[color:var(--color-text-muted)]">Password</span>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 pr-10 text-sm text-[color:var(--color-text)]"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  onKeyUp={(e) => setCapsOn((e as any).getModifierState && (e as any).getModifierState('CapsLock'))}
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
              {capsOn && <div className="mt-1 text-[11px] text-yellow-300">Caps Lock is on</div>}
            </label>

            <div className="text-right">
              <button
                type="button"
                onClick={() => setMode('forgot')}
                className="text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] underline"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="pt-1 text-center text-xs text-[color:var(--color-text-muted)]">
              Need an account?{' '}
              <button type="button" className="underline" onClick={() => { setMode('register'); setForgotSent(false); setRegSuccess(false) }}>
                Register
              </button>
            </div>
          </form>
        )}

        {/* Register Form */}
        {mode === 'register' && !regSuccess && (
          <form onSubmit={handleRegister} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[color:var(--color-text-muted)]">Full Name *</span>
              <input
                type="text"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm text-[color:var(--color-text)]"
                placeholder="John Doe"
                id="customer-register-name"
                required
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-[color:var(--color-text-muted)]">Email Address *</span>
              <input
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm text-[color:var(--color-text)]"
                placeholder="you@company.com"
                required
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-[color:var(--color-text-muted)]">Password * (min. 8 characters)</span>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 pr-10 text-sm text-[color:var(--color-text)]"
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
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-[color:var(--color-text-muted)]">Phone Number</span>
              <input
                type="tel"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm text-[color:var(--color-text)]"
                placeholder="(555) 123-4567"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>

            <div className="pt-1 text-center text-xs text-[color:var(--color-text-muted)]">
              Already have an account?{' '}
              <button type="button" className="underline" onClick={() => { setMode('login'); setForgotSent(false); setRegSuccess(false) }}>
                Sign in
              </button>
            </div>
          </form>
        )}

        {/* Registration Success */}
        {regSuccess && (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✉️</div>
            <h3 className="text-lg font-semibold text-[color:var(--color-text)] mb-2">
              Check Your Email
            </h3>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-6">
              We've sent a verification link to <strong className="text-[color:var(--color-text)]">{regEmail}</strong>. 
              Please click the link to verify your account and login.
            </p>
            <button
              onClick={() => {
                setRegSuccess(false)
                setMode('login')
              }}
              className="text-sm text-[color:var(--color-primary-600)] hover:text-[color:var(--color-primary-700)] underline"
            >
              Back to Login
            </button>
          </div>
        )}

        {/* Forgot Password Form */}
        {mode === 'forgot' && !forgotSent && (
          <form onSubmit={handleForgotPassword} className="space-y-3">
            <div className="mb-4 text-sm text-[color:var(--color-text-muted)]">
              Enter your email address and we'll send you a link to reset your password.
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-[color:var(--color-text-muted)]">Email Address</span>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm text-[color:var(--color-text)]"
                placeholder="you@company.com"
                id="customer-forgot-email"
                required
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <button
              type="button"
              onClick={() => setMode('login')}
              className="w-full text-sm text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] underline"
            >
              Back to Login
            </button>
          </form>
        )}

        {/* Forgot Password Success */}
        {forgotSent && (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✉️</div>
            <h3 className="text-lg font-semibold text-[color:var(--color-text)] mb-2">
              Check Your Email
            </h3>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-6">
              If an account exists with that email, we've sent a password reset link.
            </p>
            <button
              onClick={() => {
                setForgotSent(false)
                setMode('login')
              }}
              className="text-sm text-[color:var(--color-primary-600)] hover:text-[color:var(--color-primary-700)] underline"
            >
              Back to Login
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-[color:var(--color-text-muted)]">
          © 2025 Wolf Consulting Group, LLC
        </div>
      </div>
    </div>
  )
}
