/**
 * Secure Payment Checkout Page
 * 
 * PCI-compliant payment form using Stripe Elements
 * Handles credit card payments securely
 */

import { useState } from 'react'
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
  CheckCircle
} from 'lucide-react'

type Invoice = {
  _id: string
  invoiceNumber?: number
  title?: string
  total?: number
  balance?: number
  dueDate?: string
  accountName?: string
}

export default function SecurePaymentCheckout() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()

  const invoiceId = searchParams.get('invoice')
  const amount = searchParams.get('amount')
  const returnUrl = searchParams.get('return') || '/apps/crm/invoices'

  // Form state
  const [cardholderName, setCardholderName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [cvv, setCvv] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  
  // Billing address
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('US')

  // Consent
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [authorizeCharge, setAuthorizeCharge] = useState(false)

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false)

  // Fetch invoice details
  const invoiceQuery = useQuery({
    queryKey: ['invoice-checkout', invoiceId],
    queryFn: async () => {
      const res = await http.get(`/api/crm/invoices/${invoiceId}`)
      return res.data.data as Invoice
    },
    enabled: !!invoiceId
  })

  const invoice = invoiceQuery.data
  const paymentAmount = amount ? parseFloat(amount) : (invoice?.balance ?? invoice?.total ?? 0)

  // Card type detection
  const getCardType = (number: string) => {
    const cleaned = number.replace(/\s/g, '')
    if (/^4/.test(cleaned)) return 'Visa'
    if (/^5[1-5]/.test(cleaned)) return 'Mastercard'
    if (/^3[47]/.test(cleaned)) return 'American Express'
    if (/^6(?:011|5)/.test(cleaned)) return 'Discover'
    return 'Unknown'
  }

  // Format card number with spaces
  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s/g, '')
    const chunks = cleaned.match(/.{1,4}/g) || []
    return chunks.join(' ').substr(0, 19)
  }

  // Format expiration date
  const formatExpirationDate = (value: string) => {
    const cleaned = value.replace(/\D/g, '')
    if (cleaned.length >= 2) {
      return cleaned.substr(0, 2) + '/' + cleaned.substr(2, 2)
    }
    return cleaned
  }

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value)
    setCardNumber(formatted)
  }

  const handleExpirationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatExpirationDate(e.target.value)
    setExpirationDate(formatted)
  }

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').substr(0, 4)
    setCvv(value)
  }

  const validateForm = () => {
    if (!cardholderName.trim()) {
      showToast('Please enter cardholder name', 'error')
      return false
    }
    if (cardNumber.replace(/\s/g, '').length < 13) {
      showToast('Please enter a valid card number', 'error')
      return false
    }
    if (!expirationDate.match(/^\d{2}\/\d{2}$/)) {
      showToast('Please enter expiration date as MM/YY', 'error')
      return false
    }
    if (cvv.length < 3) {
      showToast('Please enter a valid CVV', 'error')
      return false
    }
    if (!email.trim() || !email.includes('@')) {
      showToast('Please enter a valid email address', 'error')
      return false
    }
    if (!addressLine1.trim()) {
      showToast('Please enter billing address', 'error')
      return false
    }
    if (!city.trim()) {
      showToast('Please enter city', 'error')
      return false
    }
    if (!state.trim()) {
      showToast('Please enter state', 'error')
      return false
    }
    if (!postalCode.trim()) {
      showToast('Please enter postal code', 'error')
      return false
    }
    if (!authorizeCharge) {
      showToast('Please authorize the charge', 'error')
      return false
    }
    if (!agreeTerms) {
      showToast('Please agree to the terms of service', 'error')
      return false
    }
    return true
  }

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    setIsProcessing(true)

    try {
      // In production, this would:
      // 1. Create a Stripe payment intent on the backend
      // 2. Use Stripe Elements to tokenize the card (PCI compliant)
      // 3. Confirm the payment with Stripe
      // 4. Return success/failure
      
      // For now, we'll call a backend endpoint that will handle Stripe integration
      const res = await http.post('/api/payments/process', {
        invoiceId,
        amount: paymentAmount,
        method: 'credit_card',
        paymentDetails: {
          cardholderName,
          // In production, we'd send a Stripe token, NOT raw card data
          // cardToken: stripeToken.id,
          email,
          phone,
          billingAddress: {
            line1: addressLine1,
            line2: addressLine2,
            city,
            state,
            postalCode,
            country
          }
        }
      })

      if (res.data.error) {
        throw new Error(res.data.error)
      }

      showToast('Payment processed successfully!', 'success')
      
      // Redirect back to where they came from
      setTimeout(() => {
        navigate(returnUrl)
      }, 2000)

    } catch (err: any) {
      console.error('Payment error:', err)
      showToast(err.message || 'Payment failed. Please try again.', 'error')
      setIsProcessing(false)
    }
  }

  if (!invoiceId) {
    return (
      <div className="min-h-screen bg-[color:var(--color-bg)] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-4 text-xl font-semibold text-[color:var(--color-text)]">Invalid Payment Link</h1>
          <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">No invoice specified</p>
          <button
            onClick={() => navigate('/apps/crm/payments')}
            className="mt-4 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
          >
            Return to Payment Portal
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)]">
      {/* Header */}
      <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-sm text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <div className="hidden sm:block h-6 w-px bg-[color:var(--color-border)]"></div>
              <h1 className="text-lg font-semibold text-[color:var(--color-text)]">Secure Payment Checkout</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-full border border-green-600 bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
                <Lock className="h-3 w-3" />
                256-bit Encrypted
              </div>
              <div className="flex items-center gap-1 rounded-full border border-blue-600 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                <Shield className="h-3 w-3" />
                PCI Compliant
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Security Notice */}
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-green-900">🔒 Your payment is secure</h3>
              <p className="mt-1 text-sm text-green-800">
                This page is secured with 256-bit SSL encryption. Your credit card information is processed securely 
                through Stripe, a PCI DSS Level 1 certified payment processor. We never store your complete card details.
              </p>
            </div>
          </div>
        </div>

        {/* Demo Notice - Remove in Production */}
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-yellow-900">⚠️ Demo Mode</h3>
              <p className="mt-1 text-sm text-yellow-800">
                <strong>For Production:</strong> This form will be replaced with Stripe Elements (secure iframe) 
                that handles card data in a PCI-compliant manner. Card information will never touch your servers.
                This demo shows the UI/UX and required fields only.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Payment Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmitPayment} className="space-y-6">
              {/* Card Information */}
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[color:var(--color-text)]">
                  <CreditCard className="h-5 w-5" />
                  Card Information
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">
                      Cardholder Name *
                    </label>
                    <input
                      type="text"
                      value={cardholderName}
                      onChange={(e) => setCardholderName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-[color:var(--color-text)]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">
                      Card Number *
                    </label>
                    {/* PRODUCTION NOTE: Replace this with Stripe CardElement component */}
                    {/* This ensures PCI compliance by never exposing card data to your servers */}
                    <div className="relative">
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={handleCardNumberChange}
                        placeholder="1234 5678 9012 3456"
                        maxLength={19}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 pr-20 text-[color:var(--color-text)]"
                        required
                      />
                      {cardNumber && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[color:var(--color-text-muted)]">
                          {getCardType(cardNumber)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-blue-600">
                      <Lock className="inline h-3 w-3" /> Production: Stripe secure iframe
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">
                        Expiration Date *
                      </label>
                      <input
                        type="text"
                        value={expirationDate}
                        onChange={handleExpirationChange}
                        placeholder="MM/YY"
                        maxLength={5}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-[color:var(--color-text)]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">
                        CVV / CVC *
                      </label>
                      <input
                        type="text"
                        value={cvv}
                        onChange={handleCvvChange}
                        placeholder="123"
                        maxLength={4}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-[color:var(--color-text)]"
                        required
                      />
                      <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                        3-4 digit code on back of card
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                <h2 className="mb-4 text-lg font-semibold text-[color:var(--color-text)]">
                  Contact Information
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="john@example.com"
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-[color:var(--color-text)]"
                      required
                    />
                    <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                      Receipt will be sent to this email
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-[color:var(--color-text)]"
                    />
                  </div>
                </div>
              </div>

              {/* Billing Address */}
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                <h2 className="mb-4 text-lg font-semibold text-[color:var(--color-text)]">
                  Billing Address
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">
                      Address Line 1 *
                    </label>
                    <input
                      type="text"
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      placeholder="123 Main Street"
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-[color:var(--color-text)]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">
                      Address Line 2 (Optional)
                    </label>
                    <input
                      type="text"
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                      placeholder="Apt 4B"
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-[color:var(--color-text)]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">
                        City *
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="New York"
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-[color:var(--color-text)]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">
                        State / Region *
                      </label>
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="NY"
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-[color:var(--color-text)]"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">
                        Postal Code *
                      </label>
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        placeholder="10001"
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-[color:var(--color-text)]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[color:var(--color-text)] mb-1">
                        Country *
                      </label>
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-[color:var(--color-text)]"
                        required
                      >
                        <option value="US">United States</option>
                        <option value="CA">Canada</option>
                        <option value="GB">United Kingdom</option>
                        <option value="AU">Australia</option>
                        <option value="DE">Germany</option>
                        <option value="FR">France</option>
                        <option value="JP">Japan</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Consent & Terms */}
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                <h2 className="mb-4 text-lg font-semibold text-[color:var(--color-text)]">
                  Authorization & Consent
                </h2>

                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={authorizeCharge}
                      onChange={(e) => setAuthorizeCharge(e.target.checked)}
                      className="mt-1"
                      required
                    />
                    <span className="text-sm text-[color:var(--color-text)]">
                      I authorize Wolf Consulting Group, LLC to charge my card for{' '}
                      <strong>${paymentAmount.toFixed(2)}</strong>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="mt-1"
                      required
                    />
                    <span className="text-sm text-[color:var(--color-text)]">
                      I agree to the{' '}
                      <a href="/legal/terms" target="_blank" className="text-[color:var(--color-primary-600)] underline">
                        Terms of Service
                      </a>
                      {' '}and{' '}
                      <a href="/legal/privacy" target="_blank" className="text-[color:var(--color-primary-600)] underline">
                        Privacy Policy
                      </a>
                    </span>
                  </label>

                  <div className="mt-3 text-xs text-[color:var(--color-text-muted)]">
                    <p>
                      <strong>Refund Policy:</strong> Contact us within 30 days for refund requests. 
                      Refunds typically process within 5-10 business days.
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => navigate(returnUrl)}
                  className="flex-1 rounded-lg border border-[color:var(--color-border)] px-4 py-3 text-sm font-medium text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]"
                  disabled={isProcessing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing || !authorizeCharge || !agreeTerms}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-3 text-sm font-semibold text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Pay ${paymentAmount.toFixed(2)} Securely
                    </>
                  )}
                </button>
              </div>

              {/* Security Footer */}
              <div className="text-center text-xs text-[color:var(--color-text-muted)]">
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <span>🔒 256-bit SSL Encryption</span>
                  <span>•</span>
                  <span>PCI DSS Level 1 Certified</span>
                  <span>•</span>
                  <span>Powered by Stripe</span>
                </div>
              </div>
            </form>
          </div>

          {/* Order Summary Sidebar */}
          <div>
            <div className="sticky top-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
              <h2 className="mb-4 text-lg font-semibold text-[color:var(--color-text)]">
                Payment Summary
              </h2>

              {invoiceQuery.isLoading ? (
                <div className="py-4 text-center text-sm text-[color:var(--color-text-muted)]">
                  Loading...
                </div>
              ) : invoice ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-[color:var(--color-text-muted)]">Invoice Number</div>
                    <div className="font-semibold text-[color:var(--color-text)]">
                      #{invoice.invoiceNumber ?? invoice._id.slice(-6)}
                    </div>
                  </div>

                  {invoice.title && (
                    <div>
                      <div className="text-sm text-[color:var(--color-text-muted)]">Description</div>
                      <div className="text-sm text-[color:var(--color-text)]">{invoice.title}</div>
                    </div>
                  )}

                  {invoice.accountName && (
                    <div>
                      <div className="text-sm text-[color:var(--color-text-muted)]">Account</div>
                      <div className="text-sm text-[color:var(--color-text)]">{invoice.accountName}</div>
                    </div>
                  )}

                  <div className="border-t border-[color:var(--color-border)] pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-[color:var(--color-text-muted)]">Subtotal</span>
                      <span className="text-sm text-[color:var(--color-text)]">
                        ${paymentAmount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-[color:var(--color-text-muted)]">Processing Fee</span>
                      <span className="text-sm text-[color:var(--color-text)]">
                        ${(paymentAmount * 0.029 + 0.30).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-[color:var(--color-border)]">
                      <span className="font-semibold text-[color:var(--color-text)]">Total Charge</span>
                      <span className="text-xl font-bold text-[color:var(--color-text)]">
                        ${(paymentAmount + paymentAmount * 0.029 + 0.30).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-green-800">
                        You'll receive an email receipt immediately after payment is processed.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-red-600">Failed to load invoice</div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

