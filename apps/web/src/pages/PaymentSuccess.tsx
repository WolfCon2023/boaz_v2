/**
 * Payment Success Page
 * 
 * Displayed after successful Stripe/PayPal payment
 */

import { useEffect, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { CheckCircle, Download, Home } from 'lucide-react'

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = searchParams.get('session_id')
  const [countdown, setCountdown] = useState(10)

  useEffect(() => {
    if (!sessionId) {
      navigate('/customer/payments')
      return
    }

    // Countdown timer to redirect
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          navigate('/customer/dashboard')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [sessionId, navigate])

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-8 text-center">
          {/* Success Icon */}
          <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-6">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>

          {/* Success Message */}
          <h1 className="text-3xl font-bold text-[color:var(--color-text)] mb-2">
            Payment Successful!
          </h1>
          <p className="text-lg text-[color:var(--color-text-muted)] mb-6">
            Thank you for your payment. Your transaction has been completed successfully.
          </p>

          {/* Details */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-6 mb-8 text-left">
            <h3 className="font-semibold text-[color:var(--color-text)] mb-3">What happens next?</h3>
            <ul className="space-y-2 text-sm text-[color:var(--color-text-muted)]">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>A confirmation email has been sent to your email address</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Your invoice balance has been updated</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>You can view your receipt in the Payment History section</span>
              </li>
            </ul>
          </div>

          {/* Session ID */}
          {sessionId && (
            <div className="mb-6 text-xs text-[color:var(--color-text-muted)]">
              <div>Transaction ID: {sessionId.slice(0, 20)}...</div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            <Link
              to="/customer/payments"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-6 py-3 text-sm font-medium text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)] transition-colors"
            >
              <Download className="h-4 w-4" />
              View Payment History
            </Link>
            <Link
              to="/customer/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[color:var(--color-primary-600)] px-6 py-3 text-sm font-medium text-white hover:bg-[color:var(--color-primary-700)] transition-colors"
            >
              <Home className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </div>

          {/* Auto-redirect notice */}
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Redirecting to dashboard in {countdown} seconds...
          </p>
        </div>
      </div>
    </div>
  )
}

