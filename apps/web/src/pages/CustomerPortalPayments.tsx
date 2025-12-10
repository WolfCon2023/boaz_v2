/**
 * Customer Portal - Payment Page
 * 
 * Standalone payment portal for customers to:
 * - View and pay outstanding invoices
 * - See payment history
 * - Access payment instructions
 */

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { http } from '../lib/http'
import { useToast } from '../components/Toast'
import { 
  CreditCard, 
  DollarSign, 
  CheckCircle, 
  Building2,
  Globe,
  History,
  ChevronDown,
  ChevronUp,
  Shield,
  Lock,
  ArrowLeft,
  Mail
} from 'lucide-react'
import { formatDate } from '../lib/dateFormat'

type Invoice = {
  _id: string
  invoiceNumber?: number
  title?: string
  total?: number
  balance?: number
  status?: string
  dueDate?: string
  accountId?: string
  accountName?: string
}

type Payment = {
  _id?: string
  invoiceId: string
  invoiceNumber?: number
  amount: number
  method: string
  paidAt: Date | string
  reference?: string
  notes?: string
}

export default function CustomerPortalPayments() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  // Check authentication
  useEffect(() => {
    const token = localStorage.getItem('customer_portal_token')
    if (!token) {
      navigate('/customer/login')
    }
  }, [navigate])

  // Tabs
  const [activeTab, setActiveTab] = useState<'pay' | 'history'>('pay')

  // Payment State
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'ach' | 'wire' | 'paypal' | 'check'>('credit_card')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)

  // Fetch unpaid invoices
  const invoicesQuery = useQuery({
    queryKey: ['customer-portal-invoices'],
    queryFn: async () => {
      const token = localStorage.getItem('customer_portal_token')
      const res = await http.get('/api/customer-portal/data/invoices', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.data.error) throw new Error(res.data.error)
      const items = res.data.data.items ?? []
      // Filter unpaid invoices
      return items.filter((inv: Invoice) => (inv.balance ?? inv.total ?? 0) > 0)
    }
  })

  // Fetch payment history
  const paymentsQuery = useQuery({
    queryKey: ['customer-portal-payments'],
    queryFn: async () => {
      const token = localStorage.getItem('customer_portal_token')
      const res = await http.get('/api/customer-portal/data/payments', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data.items as Payment[]
    },
    enabled: activeTab === 'history'
  })

  const handleProcessPayment = () => {
    if (!selectedInvoice || !paymentAmount) {
      showToast('Please select an invoice and enter an amount', 'error')
      return
    }

    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid payment amount', 'error')
      return
    }

    if (amount > (selectedInvoice.balance ?? selectedInvoice.total ?? 0)) {
      showToast('Payment amount cannot exceed invoice balance', 'error')
      return
    }

    // For credit card payments, redirect to secure checkout page
    if (paymentMethod === 'credit_card') {
      window.location.href = `/payment/checkout?invoice=${selectedInvoice._id}&amount=${amount}&method=credit_card&return=/customer/invoices`
      return
    }

    // For PayPal, redirect to PayPal checkout
    if (paymentMethod === 'paypal') {
      showToast('Redirecting to PayPal...', 'info')
      window.location.href = `/payment/checkout?invoice=${selectedInvoice._id}&amount=${amount}&method=paypal&return=/customer/invoices`
      return
    }

    // For offline methods, show instructions
    setShowInstructions(true)
    showToast('Please follow the payment instructions below', 'info')
  }

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'credit_card': return <CreditCard className="h-4 w-4" />
      case 'ach': return <Building2 className="h-4 w-4" />
      case 'wire': return <Globe className="h-4 w-4" />
      case 'paypal': return <DollarSign className="h-4 w-4" />
      case 'check': return <Mail className="h-4 w-4" />
      default: return <DollarSign className="h-4 w-4" />
    }
  }

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'credit_card': return 'Credit Card'
      case 'ach': return 'ACH Transfer'
      case 'wire': return 'Wire Transfer'
      case 'paypal': return 'PayPal'
      case 'check': return 'Check'
      default: return method
    }
  }

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)]">
      {/* Header */}
      <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link 
                to="/customer/dashboard" 
                className="flex items-center space-x-2 text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Dashboard</span>
              </Link>
              <div className="hidden sm:block h-6 w-px bg-[color:var(--color-border)]"></div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-semibold text-[color:var(--color-text)]">Payments</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-full border border-green-600 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                <Shield className="h-3 w-3" />
                PCI DSS Compliant
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Security Banner */}
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-green-900">🔒 Bank-Level Security</h4>
                <p className="mt-1 text-sm text-green-800">
                  All payments are secured with 256-bit encryption. We are PCI DSS SAQ A compliant—your 
                  credit card information never touches our servers and is securely processed by certified payment processors.
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-white px-2 py-0.5 font-medium text-green-800">
                    <Lock className="h-3 w-3" />
                    256-bit Encryption
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-white px-2 py-0.5 font-medium text-green-800">
                    <Shield className="h-3 w-3" />
                    PCI DSS Level 1
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-white px-2 py-0.5 font-medium text-green-800">
                    <CheckCircle className="h-3 w-3" />
                    No Card Data Stored
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-[color:var(--color-border)]">
            <button
              onClick={() => setActiveTab('pay')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'pay'
                  ? 'border-b-2 border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
                  : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
              }`}
            >
              <CreditCard className="mr-2 inline-block h-4 w-4" />
              Make Payment
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'border-b-2 border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
                  : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
              }`}
            >
              <History className="mr-2 inline-block h-4 w-4" />
              Payment History
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'pay' && (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Select Invoice */}
                <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                  <h3 className="mb-4 text-lg font-semibold text-[color:var(--color-text)]">
                    1. Select Invoice
                  </h3>

                  {invoicesQuery.isLoading ? (
                    <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">
                      Loading invoices...
                    </div>
                  ) : (invoicesQuery.data?.length ?? 0) === 0 ? (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                      <CheckCircle className="mx-auto h-8 w-8 text-green-600" />
                      <p className="mt-2 text-sm font-medium text-green-900">
                        All invoices are paid!
                      </p>
                      <p className="mt-1 text-xs text-green-700">
                        You have no outstanding invoices at this time.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {invoicesQuery.data?.map((invoice: Invoice) => (
                        <button
                          key={invoice._id}
                          onClick={() => {
                            setSelectedInvoice(invoice)
                            setPaymentAmount(String(invoice.balance ?? invoice.total ?? 0))
                            setShowInstructions(false)
                          }}
                          className={`w-full rounded-lg border p-4 text-left transition-colors ${
                            selectedInvoice?._id === invoice._id
                              ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-primary-50)]'
                              : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-semibold text-[color:var(--color-text)]">
                                Invoice #{invoice.invoiceNumber ?? invoice._id.slice(-6)}
                              </div>
                              <div className="text-sm text-[color:var(--color-text-muted)]">
                                {invoice.title}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-[color:var(--color-text)]">
                                ${(invoice.balance ?? invoice.total ?? 0).toLocaleString()}
                              </div>
                              {invoice.dueDate && (
                                <div className={`text-xs ${
                                  new Date(invoice.dueDate) < new Date()
                                    ? 'text-red-600 font-semibold'
                                    : 'text-[color:var(--color-text-muted)]'
                                }`}>
                                  Due: {formatDate(invoice.dueDate)}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payment Details */}
                <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                  <h3 className="mb-4 text-lg font-semibold text-[color:var(--color-text)]">
                    2. Payment Details
                  </h3>

                  {selectedInvoice ? (
                    <div className="space-y-4">
                      {/* Selected Invoice Summary */}
                      <div className="rounded-lg bg-[color:var(--color-muted)] p-4">
                        <div className="text-sm text-[color:var(--color-text-muted)]">
                          Selected Invoice
                        </div>
                        <div className="mt-1 font-semibold text-[color:var(--color-text)]">
                          #{selectedInvoice.invoiceNumber ?? selectedInvoice._id.slice(-6)}
                        </div>
                        <div className="mt-2 text-2xl font-bold text-[color:var(--color-text)]">
                          ${(selectedInvoice.balance ?? selectedInvoice.total ?? 0).toLocaleString()}
                        </div>
                      </div>

                      {/* Payment Amount */}
                      <div>
                        <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                          Payment Amount
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-text-muted)]">
                            $
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={selectedInvoice.balance ?? selectedInvoice.total ?? 0}
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent pl-8 pr-4 py-2 text-[color:var(--color-text)]"
                            placeholder="0.00"
                          />
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                          Maximum: ${(selectedInvoice.balance ?? selectedInvoice.total ?? 0).toLocaleString()}
                        </div>
                      </div>

                      {/* Payment Method */}
                      <div>
                        <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                          Payment Method
                        </label>
                        <div className="space-y-2">
                          {[
                            { 
                              value: 'credit_card', 
                              label: 'Credit/Debit Card', 
                              icon: CreditCard, 
                              online: true,
                              desc: 'Instant • 2.9% + $0.30 fee',
                              security: 'Stripe PCI Level 1'
                            },
                            { 
                              value: 'paypal', 
                              label: 'PayPal', 
                              icon: DollarSign, 
                              online: true,
                              desc: 'Instant • 3.49% + $0.49 fee',
                              security: 'PayPal Secure'
                            },
                            { 
                              value: 'ach', 
                              label: 'ACH Bank Transfer', 
                              icon: Building2, 
                              online: false,
                              desc: '2-3 business days • No fee',
                              security: 'NACHA Guidelines'
                            },
                            { 
                              value: 'wire', 
                              label: 'Wire Transfer', 
                              icon: Globe, 
                              online: false,
                              desc: '1-5 business days • Bank fees may apply',
                              security: 'SWIFT/Bank Secure'
                            },
                            { 
                              value: 'check', 
                              label: 'Check by Mail', 
                              icon: Mail, 
                              online: false,
                              desc: '7-10 business days • No fee',
                              security: 'Physical Mail'
                            },
                          ].map((method) => (
                            <button
                              key={method.value}
                              onClick={() => {
                                setPaymentMethod(method.value as any)
                                setShowInstructions(false)
                              }}
                              className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                                paymentMethod === method.value
                                  ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-primary-50)]'
                                  : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]'
                              }`}
                            >
                              <method.icon className="h-5 w-5 text-[color:var(--color-text)] mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-[color:var(--color-text)] flex items-center gap-2">
                                  {method.label}
                                  {method.online && (
                                    <span className="text-xs text-green-600 font-semibold">
                                      Instant
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-[color:var(--color-text-muted)] mt-0.5">
                                  {method.desc}
                                </div>
                                {method.online && (
                                  <div className="text-[10px] text-[color:var(--color-text-muted)] mt-1 flex items-center gap-1">
                                    <Lock className="h-2.5 w-2.5" />
                                    {method.security}
                                  </div>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Instructions Toggle for Offline Methods */}
                      {!['credit_card', 'paypal'].includes(paymentMethod) && (
                        <button
                          onClick={() => setShowInstructions(!showInstructions)}
                          className="flex w-full items-center justify-between rounded-lg border border-[color:var(--color-border)] p-3 text-sm hover:bg-[color:var(--color-muted)]"
                        >
                          <span className="font-medium text-[color:var(--color-text)]">
                            View Payment Instructions
                          </span>
                          {showInstructions ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      )}

                      {/* Payment Instructions */}
                      {showInstructions && !['credit_card', 'paypal'].includes(paymentMethod) && (
                        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-4 text-sm">
                          {paymentMethod === 'ach' && (
                            <div className="space-y-2">
                              <p className="font-semibold">ACH Transfer Instructions:</p>
                              <div className="space-y-1 text-xs">
                                <div><strong>Bank:</strong> First Citizens Bank</div>
                                <div><strong>Routing:</strong> 053100300</div>
                                <div><strong>Account:</strong> ****7890</div>
                                <div><strong>Reference:</strong> Invoice #{selectedInvoice.invoiceNumber}</div>
                              </div>
                            </div>
                          )}
                          {paymentMethod === 'wire' && (
                            <div className="space-y-2">
                              <p className="font-semibold">Wire Transfer Instructions:</p>
                              <div className="space-y-1 text-xs">
                                <div><strong>Bank:</strong> First Citizens Bank</div>
                                <div><strong>SWIFT:</strong> FCBIUS33</div>
                                <div><strong>Routing:</strong> 053100300</div>
                                <div><strong>Account:</strong> ****7890</div>
                                <div><strong>Reference:</strong> Invoice #{selectedInvoice.invoiceNumber}</div>
                              </div>
                            </div>
                          )}
                          {paymentMethod === 'check' && (
                            <div className="space-y-2">
                              <p className="font-semibold">Check Payment Instructions:</p>
                              <div className="mt-1 text-xs">
                                <p>Make checks payable to:</p>
                                <div className="mt-1 font-semibold">
                                  <div>Wolf Consulting Group, LLC</div>
                                  <div>123 Main St, Suite 100</div>
                                  <div>Raleigh, NC 27601</div>
                                </div>
                                <p className="mt-2">Include invoice number: <strong>#{selectedInvoice.invoiceNumber}</strong></p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Secure Payment Notice for Online Methods */}
                      {['credit_card', 'paypal'].includes(paymentMethod) && (
                        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs">
                          <div className="flex items-start gap-2">
                            <Lock className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                            <div className="text-purple-900">
                              <strong>Secure Payment Processing:</strong> You'll be redirected to a PCI DSS certified payment page hosted by {paymentMethod === 'credit_card' ? 'Stripe' : 'PayPal'}. 
                              Your payment details are encrypted and never stored on our servers.
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Submit Button */}
                      <button
                        onClick={handleProcessPayment}
                        disabled={!paymentAmount}
                        className="w-full rounded-lg bg-[color:var(--color-primary-600)] px-4 py-3 text-sm font-semibold text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {['credit_card', 'paypal'].includes(paymentMethod) ? (
                          <>
                            <Lock className="h-4 w-4" />
                            {`Continue to Secure ${getMethodLabel(paymentMethod)} Payment`}
                          </>
                        ) : (
                          'View Payment Instructions'
                        )}
                      </button>

                      {/* PCI Compliance Footer */}
                      <div className="text-center text-[10px] text-[color:var(--color-text-muted)]">
                        <div className="flex items-center justify-center gap-4">
                          <span>🔒 256-bit SSL Encryption</span>
                          <span>•</span>
                          <span>PCI DSS SAQ A Compliant</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center text-sm text-[color:var(--color-text-muted)]">
                      Select an invoice to continue
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Payment History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                <h3 className="mb-4 text-lg font-semibold text-[color:var(--color-text)]">
                  Payment History
                </h3>

                {paymentsQuery.isLoading ? (
                  <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">
                    Loading payment history...
                  </div>
                ) : (paymentsQuery.data?.length ?? 0) === 0 ? (
                  <div className="py-8 text-center">
                    <History className="mx-auto h-12 w-12 text-[color:var(--color-text-muted)]" />
                    <p className="mt-4 text-sm text-[color:var(--color-text-muted)]">
                      No payment history found
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-text-muted)]">
                          <th className="pb-3 font-medium">Date</th>
                          <th className="pb-3 font-medium">Invoice</th>
                          <th className="pb-3 font-medium">Method</th>
                          <th className="pb-3 font-medium text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentsQuery.data?.map((payment) => (
                          <tr key={payment._id} className="border-b border-[color:var(--color-border)] text-sm">
                            <td className="py-3 text-[color:var(--color-text)]">
                              {formatDate(payment.paidAt)}
                            </td>
                            <td className="py-3 text-[color:var(--color-text)]">
                              #{payment.invoiceNumber ?? 'N/A'}
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-2 text-[color:var(--color-text)]">
                                {getMethodIcon(payment.method)}
                                {getMethodLabel(payment.method)}
                              </div>
                            </td>
                            <td className="py-3 text-right font-semibold text-[color:var(--color-text)]">
                              ${payment.amount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

