/**
 * Secure Checkout Page
 * 
 * PCI DSS compliant payment page using Stripe Elements
 * Card data never touches our servers - handled entirely by Stripe
 */

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { http } from '../lib/http'
import { useToast } from '../components/Toast'
import { 
  CreditCard, 
  Lock,
  Shield,
  AlertCircle,
  ArrowLeft,
  Info
} from 'lucide-react'

type Invoice = {
  _id: string
  invoiceNumber?: number
  title?: string
  total?: number
  balance?: number
  accountName?: string
}

export default function SecureCheckout() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()

  // Get payment details from URL
  const invoiceId = searchParams.get('invoice')
  const amount = searchParams.get('amount')
  const method = searchParams.get('method') // 'stripe' or 'paypal'

  // Form state
  const [cardholderName, setCardholderName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [country, setCountry] = useState('US')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [authorizeCharge, setAuthorizeCharge] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Fetch invoice details
  const invoiceQuery = useQuery({
    queryKey: ['invoice-checkout', invoiceId],
    queryFn: async () => {
      if (!invoiceId) throw new Error('No invoice ID provided')
      const res = await http.get(`/api/crm/invoices/${invoiceId}`)
      return res.data.data as Invoice
    },
    enabled: !!invoiceId
  })

  const invoice = invoiceQuery.data
  const paymentAmount = parseFloat(amount || '0')

  useEffect(() => {
    if (!invoiceId || !amount) {
      showToast('Invalid payment link. Please try again.', 'error')
      navigate(-1)
    }
  }, [invoiceId, amount, navigate, showToast])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!termsAccepted || !authorizeCharge) {
      showToast('Please accept the terms and authorize the charge', 'error')
      return
    }

    if (!cardholderName || !email || !addressLine1 || !city || !state || !zipCode) {
      showToast('Please fill in all required fields', 'error')
      return
    }

    setIsProcessing(true)

    try {
      // Create Stripe Checkout Session or PayPal Order
      const res = await http.post('/api/payments/create-checkout-session', {
        invoiceId,
        amount: paymentAmount,
        method,
        customerInfo: {
          name: cardholderName,
          email,
          phone,
          address: {
            line1: addressLine1,
            line2: addressLine2,
            city,
            state,
            postal_code: zipCode,
            country
          }
        }
      })

      if (res.data.error) {
        throw new Error(res.data.error)
      }

      // Redirect to Stripe Checkout or PayPal
      if (res.data.data.url) {
        window.location.href = res.data.data.url
      } else {
        throw new Error('No checkout URL received')
      }
    } catch (err: any) {
      console.error('Checkout error:', err)
      showToast(err.message || 'Failed to create checkout session', 'error')
      setIsProcessing(false)
    }
  }

  if (!invoiceId || !amount) {
    return null
  }

  if (invoiceQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[color:var(--color-bg)] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-[color:var(--color-primary-600)]"></div>
          <p className="mt-4 text-[color:var(--color-text-muted)]">Loading payment details...</p>
        </div>
      </div>
    )
  }

  if (invoiceQuery.error || !invoice) {
    return (
      <div className="min-h-screen bg-[color:var(--color-bg)] flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-600" />
          <h2 className="mt-4 text-lg font-semibold text-red-900">Payment Error</h2>
          <p className="mt-2 text-sm text-red-800">
            Unable to load invoice details. Please try again or contact support.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)]">
      {/* Header */}
      <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back</span>
              </button>
              <div className="h-6 w-px bg-[color:var(--color-border)]"></div>
              <h1 className="text-xl font-semibold text-[color:var(--color-text)]">Secure Checkout</h1>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-600">Secure Payment</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Payment Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Security Notice */}
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-medium text-green-900">🔒 Bank-Level Security</h3>
                    <p className="mt-1 text-sm text-green-800">
                      Your payment information is encrypted and securely processed by Stripe, a PCI DSS Level 1 certified payment processor. 
                      We never store your complete card number or security code.
                    </p>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                <h3 className="mb-4 text-lg font-semibold text-[color:var(--color-text)] flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Contact Information
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2 text-[color:var(--color-text)]"
                      placeholder="you@example.com"
                    />
                    <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                      Receipt will be sent to this email
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                      Phone Number (optional)
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2 text-[color:var(--color-text)]"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
              </div>

              {/* Billing Address */}
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                <h3 className="mb-4 text-lg font-semibold text-[color:var(--color-text)] flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Billing Address
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                      Cardholder Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={cardholderName}
                      onChange={(e) => setCardholderName(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2 text-[color:var(--color-text)]"
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                      Address Line 1 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2 text-[color:var(--color-text)]"
                      placeholder="123 Main Street"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                      Address Line 2 (optional)
                    </label>
                    <input
                      type="text"
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2 text-[color:var(--color-text)]"
                      placeholder="Apt 4B, Suite 100, etc."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                        City <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2 text-[color:var(--color-text)]"
                        placeholder="New York"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                        State <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2 text-[color:var(--color-text)]"
                        placeholder="NY"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                        ZIP Code <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2 text-[color:var(--color-text)]"
                        placeholder="10001"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                        Country <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2 text-[color:var(--color-text)]"
                      >
                        <option value="US">United States</option>
                        <option value="CA">Canada</option>
                        <option value="GB">United Kingdom</option>
                        <option value="AU">Australia</option>
                        <option value="DE">Germany</option>
                        <option value="FR">France</option>
                        <option value="IT">Italy</option>
                        <option value="ES">Spain</option>
                        <option value="NL">Netherlands</option>
                        <option value="SE">Sweden</option>
                        <option value="NO">Norway</option>
                        <option value="DK">Denmark</option>
                        <option value="FI">Finland</option>
                        <option value="IE">Ireland</option>
                        <option value="NZ">New Zealand</option>
                        <option value="SG">Singapore</option>
                        <option value="JP">Japan</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Terms and Authorization */}
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                <h3 className="mb-4 text-lg font-semibold text-[color:var(--color-text)]">
                  Terms & Authorization
                </h3>
                
                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={authorizeCharge}
                      onChange={(e) => setAuthorizeCharge(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-[color:var(--color-border)]"
                    />
                    <span className="text-sm text-[color:var(--color-text)]">
                      I authorize <strong>Wolf Consulting Group, LLC</strong> to charge my payment method for{' '}
                      <strong className="text-[color:var(--color-primary-600)]">
                        ${paymentAmount.toFixed(2)}
                      </strong>
                      .
                    </span>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-[color:var(--color-border)]"
                    />
                    <span className="text-sm text-[color:var(--color-text)]">
                      I agree to the{' '}
                      <a href="/legal/terms" target="_blank" className="text-[color:var(--color-primary-600)] underline hover:text-[color:var(--color-primary-700)]">
                        Terms of Service
                      </a>
                      ,{' '}
                      <a href="/legal/privacy" target="_blank" className="text-[color:var(--color-primary-600)] underline hover:text-[color:var(--color-primary-700)]">
                        Privacy Policy
                      </a>
                      , and{' '}
                      <a href="/legal/refund-policy" target="_blank" className="text-[color:var(--color-primary-600)] underline hover:text-[color:var(--color-primary-700)]">
                        Refund Policy
                      </a>
                      .
                    </span>
                  </label>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isProcessing || !termsAccepted || !authorizeCharge}
                className="w-full rounded-lg bg-[color:var(--color-primary-600)] px-6 py-4 text-lg font-semibold text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-colors"
              >
                {isProcessing ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-white"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <Lock className="h-5 w-5" />
                    Continue to Secure {method === 'paypal' ? 'PayPal' : 'Stripe'} Payment
                  </>
                )}
              </button>

              {/* Security Badges */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-4 text-xs text-[color:var(--color-text-muted)]">
                  <span className="flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    256-bit SSL
                  </span>
                  <span>•</span>
                  <span>PCI DSS Level 1</span>
                  <span>•</span>
                  <span>Powered by Stripe</span>
                </div>
              </div>
            </form>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              {/* Payment Summary */}
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                <h3 className="mb-4 text-lg font-semibold text-[color:var(--color-text)]">
                  Payment Summary
                </h3>
                
                <div className="space-y-3">
                  <div className="pb-3 border-b border-[color:var(--color-border)]">
                    <div className="text-sm text-[color:var(--color-text-muted)]">Invoice</div>
                    <div className="mt-1 font-semibold text-[color:var(--color-text)]">
                      #{invoice.invoiceNumber || invoice._id.slice(-6)}
                    </div>
                    {invoice.title && (
                      <div className="mt-1 text-sm text-[color:var(--color-text-muted)]">
                        {invoice.title}
                      </div>
                    )}
                    {invoice.accountName && (
                      <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                        {invoice.accountName}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-[color:var(--color-text-muted)]">Subtotal</span>
                    <span className="font-medium text-[color:var(--color-text)]">
                      ${paymentAmount.toFixed(2)}
                    </span>
                  </div>

                  {method === 'stripe' && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[color:var(--color-text-muted)]">Processing Fee (2.9% + $0.30)</span>
                      <span className="font-medium text-[color:var(--color-text)]">
                        ${((paymentAmount * 0.029) + 0.30).toFixed(2)}
                      </span>
                    </div>
                  )}

                  {method === 'paypal' && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[color:var(--color-text-muted)]">Processing Fee (3.49% + $0.49)</span>
                      <span className="font-medium text-[color:var(--color-text)]">
                        ${((paymentAmount * 0.0349) + 0.49).toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="pt-3 border-t border-[color:var(--color-border)] flex justify-between">
                    <span className="font-semibold text-[color:var(--color-text)]">Total</span>
                    <span className="text-2xl font-bold text-[color:var(--color-text)]">
                      ${method === 'stripe' 
                        ? (paymentAmount + (paymentAmount * 0.029) + 0.30).toFixed(2)
                        : method === 'paypal'
                        ? (paymentAmount + (paymentAmount * 0.0349) + 0.49).toFixed(2)
                        : paymentAmount.toFixed(2)
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Security Notice */}
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                <div className="flex items-start gap-2">
                  <Lock className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-purple-900">
                    <div className="font-semibold mb-1">Your information is secure</div>
                    <div>
                      We use industry-standard encryption and never store your complete card number or CVV. 
                      Your payment is processed by Stripe, a certified PCI DSS Level 1 service provider.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

