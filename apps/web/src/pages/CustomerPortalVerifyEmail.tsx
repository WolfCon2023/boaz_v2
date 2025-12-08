/**
 * Customer Portal Email Verification
 * 
 * Handles email verification from the link sent to customers
 */

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { http } from '../lib/http'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

export default function CustomerPortalVerifyEmail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [message, setMessage] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setStatus('error')
      setMessage('Invalid verification link')
      return
    }

    // Verify email
    http.get(`/api/customer-portal/auth/verify-email?token=${token}`)
      .then((res) => {
        if (res.data.error) {
          setStatus('error')
          setMessage(res.data.error === 'invalid_token' 
            ? 'Invalid or expired verification link' 
            : 'Verification failed')
        } else {
          setStatus('success')
          setMessage('Email verified successfully!')
          // Auto-redirect to login after 3 seconds
          setTimeout(() => navigate('/customer/login'), 3000)
        }
      })
      .catch((err) => {
        console.error('Verification error:', err)
        setStatus('error')
        setMessage('Verification failed')
      })
  }, [searchParams, navigate])

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
        <div className="text-center">
          {status === 'verifying' && (
            <>
              <Loader2 className="mx-auto h-16 w-16 animate-spin text-[color:var(--color-primary-600)] mb-4" />
              <h2 className="text-xl font-semibold text-[color:var(--color-text)] mb-2">
                Verifying Your Email
              </h2>
              <p className="text-sm text-[color:var(--color-text-muted)]">
                Please wait while we verify your email address...
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
              <h2 className="text-xl font-semibold text-[color:var(--color-text)] mb-2">
                Email Verified!
              </h2>
              <p className="text-sm text-[color:var(--color-text-muted)] mb-6">
                {message}
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
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="mx-auto h-16 w-16 text-red-500 mb-4" />
              <h2 className="text-xl font-semibold text-[color:var(--color-text)] mb-2">
                Verification Failed
              </h2>
              <p className="text-sm text-[color:var(--color-text-muted)] mb-6">
                {message}
              </p>
              <Link
                to="/customer/login"
                className="inline-block rounded-lg bg-[color:var(--color-primary-600)] px-6 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] transition-colors"
              >
                Go to Login
              </Link>
            </>
          )}
        </div>

        <div className="mt-8 text-center text-xs text-[color:var(--color-text-muted)]">
          © 2025 Wolf Consulting Group, LLC
        </div>
      </div>
    </div>
  )
}

