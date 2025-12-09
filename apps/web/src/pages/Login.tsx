import * as React from 'react'
import type { AuthResponse } from '@boaz/shared'
import { useLocation, useNavigate } from 'react-router-dom'
import { getApiUrl } from '@/lib/http'

export default function Login() {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [message, setMessage] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const navigate = useNavigate()
  const location = useLocation() as any
  const from: string = location?.state?.from || '/'
  const [mounted, setMounted] = React.useState(false)
  const [showPwd, setShowPwd] = React.useState(false)
  const [capsOn, setCapsOn] = React.useState(false)
  React.useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id) }, [])
  React.useEffect(() => { try { (document.getElementById('login-email') as HTMLInputElement | null)?.focus() } catch {} }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setLoading(true)
    const res = await fetch(getApiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setMessage(err.error ?? 'Login failed')
      setLoading(false)
      return
    }
    const data = (await res.json()) as AuthResponse & { passwordChangeRequired?: boolean }
    
    // Clear customer portal tokens to prevent conflicts
    localStorage.removeItem('customer_portal_token')
    localStorage.removeItem('customer_portal_user')
    
    localStorage.setItem('token', data.token)
    setLoading(false)
    
    // If password change is required, redirect to password change page
    if (data.passwordChangeRequired) {
      navigate('/change-password', { replace: true, state: { requireChange: true } })
      return
    }
    
    navigate(from, { replace: true })
  }

  return (
    <div className="relative overflow-hidden flex min-h-[calc(100vh-8rem)] items-center justify-center">
      {/* flashy but tasteful animated background */}
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
        <div className="mb-1 text-center text-xl font-semibold">Sign in</div>
        <div className="mb-4 text-center text-xs text-[color:var(--color-text-muted)]">Welcome back to BOAZ‑OS</div>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-[color:var(--color-text-muted)]">Email</span>
            <input id="login-email" className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <div className="mt-1 text-right">
              <a href="/forgot-username" className="text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] underline">
                Forgot username?
              </a>
            </div>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[color:var(--color-text-muted)]">Password</span>
            <div className="relative">
              <input
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 pr-10 text-sm"
                type={showPwd ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                onKeyUp={(e) => setCapsOn((e as any).getModifierState && (e as any).getModifierState('CapsLock'))}
              />
              <button type="button" aria-label="Toggle password visibility" className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]" onClick={() => setShowPwd((v) => !v)}>{showPwd ? 'Hide' : 'Show'}</button>
            </div>
            {capsOn && <div className="mt-1 text-[11px] text-yellow-300">Caps Lock is on</div>}
          </label>
          {message && <div className="text-sm text-red-400">{message}</div>}
          <div className="text-right">
            <a href="/forgot-password" className="text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] underline">
              Forgot password?
            </a>
          </div>
          <button disabled={loading} className="mt-2 w-full rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50">{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <div className="mt-4 text-center text-xs text-[color:var(--color-text-muted)]">
          Need an account? <a className="underline" href="/register">Register</a>
        </div>
      </div>
    </div>
  )
}


