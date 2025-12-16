/**
 * Payment Portal
 * 
 * Comprehensive payment management system for:
 * - Customer online payments
 * - Internal rep phone/mail payment recording
 * - Payment history and tracking
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '../lib/http'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import { CRMNav } from '../components/CRMNav'
import { 
  CreditCard, 
  DollarSign, 
  Search, 
  Calendar, 
  CheckCircle, 
  AlertCircle,
  Phone,
  Mail,
  Building2,
  Globe,
  History,
  Download,
  ChevronDown,
  ChevronUp,
  Info,
  HelpCircle,
  Shield,
  Lock
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
  processedBy?: string
  reconciled?: boolean
  stripePaymentIntentId?: string
  paypalTransactionId?: string
}

export default function PaymentPortal() {
  const { showToast } = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const qc = useQueryClient()

  // Tabs
  const [activeTab, setActiveTab] = useState<'make-payment' | 'record-payment' | 'history'>('make-payment')

  // Make Payment Tab State
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'ach' | 'wire' | 'paypal' | 'check' | 'cash'>('credit_card')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)

  // Record Payment Tab State
  const [recordInvoiceSearch, setRecordInvoiceSearch] = useState('')
  const [recordInvoice, setRecordInvoice] = useState<Invoice | null>(null)
  const [recordAmount, setRecordAmount] = useState('')
  const [recordMethod, setRecordMethod] = useState<Payment['method']>('check')
  const [recordReference, setRecordReference] = useState('')
  const [recordNotes, setRecordNotes] = useState('')
  const [recordDate, setRecordDate] = useState(new Date().toISOString().split('T')[0])

  // Payment History State
  const [historySearch, setHistorySearch] = useState('')
  const [historyFilter, setHistoryFilter] = useState<'all' | 'reconciled' | 'unreconciled'>('all')
  const [historyDateFrom, setHistoryDateFrom] = useState('')
  const [historyDateTo, setHistoryDateTo] = useState('')

  // Fetch unpaid invoices for payment
  const invoicesQuery = useQuery({
    queryKey: ['invoices-unpaid'],
    queryFn: async () => {
      const res = await http.get('/api/crm/invoices', {
        params: { limit: 1000, sort: 'dueDate', dir: 'asc' }
      })
      const items = res.data?.data?.items ?? []
      // Filter unpaid invoices (balance > 0)
      return items.filter((inv: Invoice) => (inv.balance ?? inv.total ?? 0) > 0)
    }
  })

  // Fetch all invoices for recording payments
  const allInvoicesQuery = useQuery({
    queryKey: ['invoices-all-for-payment'],
    queryFn: async () => {
      const res = await http.get('/api/crm/invoices', {
        params: { limit: 1000, sort: 'invoiceNumber', dir: 'desc' }
      })
      return res.data?.data?.items ?? []
    }
  })

  // Fetch payment history
  const paymentsQuery = useQuery({
    queryKey: ['payment-history', historySearch, historyFilter, historyDateFrom, historyDateTo],
    queryFn: async () => {
      const res = await http.get('/api/payments/history', {
        params: {
          search: historySearch,
          filter: historyFilter,
          dateFrom: historyDateFrom,
          dateTo: historyDateTo
        }
      })
      return res.data?.data ?? []
    }
  })

  // Process payment mutation
  const processPaymentMutation = useMutation({
    mutationFn: async (data: { invoiceId: string; amount: number; method: string }) => {
      const res = await http.post(`/api/crm/invoices/${data.invoiceId}/payments`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices-unpaid'] })
      qc.invalidateQueries({ queryKey: ['payment-history'] })
      showToast('Payment processed successfully', 'success')
      setSelectedInvoice(null)
      setPaymentAmount('')
    },
    onError: (error: any) => {
      showToast(error.response?.data?.error || 'Failed to process payment', 'error')
    }
  })

  // Record payment mutation
  const recordPaymentMutation = useMutation({
    mutationFn: async (data: Payment) => {
      const res = await http.post('/api/payments/record', data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices-all-for-payment'] })
      qc.invalidateQueries({ queryKey: ['payment-history'] })
      showToast('Payment recorded successfully', 'success')
      setRecordInvoice(null)
      setRecordAmount('')
      setRecordReference('')
      setRecordNotes('')
      setRecordInvoiceSearch('')
    },
    onError: (error: any) => {
      showToast(error.response?.data?.error || 'Failed to record payment', 'error')
    }
  })

  // Reconcile payment mutation
  const reconcilePaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await http.post(`/api/payments/reconcile/${paymentId}`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-history'] })
      showToast('Payment marked as reconciled', 'success')
    },
    onError: (error: any) => {
      showToast(error.response?.data?.error || 'Failed to reconcile payment', 'error')
    }
  })

  const handleProcessPayment = () => {
    if (!selectedInvoice) {
      showToast('Please select an invoice', 'error')
      return
    }

    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid payment amount', 'error')
      return
    }

    const balance = selectedInvoice.balance ?? selectedInvoice.total ?? 0
    if (amount > balance) {
      showToast('Payment amount cannot exceed invoice balance', 'error')
      return
    }

    // For credit card payments, redirect to secure checkout page
    if (paymentMethod === 'credit_card') {
      window.location.href = `/payment/checkout?invoice=${selectedInvoice._id}&amount=${amount}&method=credit_card`
      return
    }

    // For PayPal, redirect to PayPal checkout
    if (paymentMethod === 'paypal') {
      showToast('Redirecting to PayPal...', 'info')
      // In production, redirect to PayPal checkout URL
      window.location.href = `/payment/checkout?invoice=${selectedInvoice._id}&amount=${amount}&method=paypal`
      return
    }

    // For offline methods, show instructions
    setShowInstructions(true)
    showToast('Please follow the payment instructions displayed below', 'info')
  }

  const handleRecordPayment = () => {
    if (!recordInvoice) {
      showToast('Please select an invoice', 'error')
      return
    }

    const amount = parseFloat(recordAmount)
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid payment amount', 'error')
      return
    }

    recordPaymentMutation.mutate({
      invoiceId: recordInvoice._id,
      invoiceNumber: recordInvoice.invoiceNumber,
      amount,
      method: recordMethod,
      reference: recordReference,
      notes: recordNotes,
      paidAt: new Date(recordDate).toISOString()
    })
  }

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'credit_card': return <CreditCard className="h-4 w-4" />
      case 'ach': return <Building2 className="h-4 w-4" />
      case 'wire': return <Globe className="h-4 w-4" />
      case 'paypal': return <DollarSign className="h-4 w-4" />
      case 'check': return <Mail className="h-4 w-4" />
      case 'cash': return <DollarSign className="h-4 w-4" />
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
      case 'cash': return 'Cash'
      default: return method
    }
  }

  return (
    <div className="space-y-4">
      <CRMNav />
      
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-[color:var(--color-text)]">Payment Portal</h1>
            <div className="flex items-center gap-1 rounded-full border border-green-600 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
              <Shield className="h-3 w-3" />
              PCI DSS Compliant
            </div>
          </div>
          <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
            Process online payments, record phone/mail payments, and view payment history
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
            <Lock className="h-3 w-3" />
            <span>Secure payment processing powered by Stripe and PayPal</span>
          </div>
        </div>
        <a
          href="/apps/crm/support/kb?tag=payments"
          className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-4 py-2 text-sm font-medium hover:bg-[color:var(--color-muted)]"
          title="View Payment Portal Guide & Security Information"
        >
          <HelpCircle className="h-4 w-4" />
          Help & Security
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[color:var(--color-border)]">
        <button
          onClick={() => setActiveTab('make-payment')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'make-payment'
              ? 'border-b-2 border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          Make Payment
        </button>
        <button
          onClick={() => setActiveTab('record-payment')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'record-payment'
              ? 'border-b-2 border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <Phone className="mr-1 inline-block h-4 w-4" />
          Record Payment
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'border-b-2 border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <History className="mr-1 inline-block h-4 w-4" />
          Payment History
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'make-payment' && (
        <div className="space-y-6">
          {/* Info Boxes */}
          <div className="space-y-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-blue-900">Customer Online Payments</h4>
                  <p className="mt-1 text-sm text-blue-800">
                    Select an invoice and choose your payment method. For credit card and PayPal payments, 
                    you&apos;ll be redirected to a secure payment page.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-green-900">🔒 Bank-Level Security & PCI Compliance</h4>
                  <p className="mt-1 text-sm text-green-800">
                    All payments are secured with industry-standard encryption (TLS 1.2+). We are <strong>PCI DSS SAQ A compliant</strong>—your 
                    credit card information never touches our servers and is securely processed by Stripe, a Level 1 PCI certified payment processor.
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
          </div>

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
                          {invoice.accountName && (
                            <div className="text-xs text-[color:var(--color-text-muted)]">
                              {invoice.accountName}
                            </div>
                          )}
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
                          onClick={() => setPaymentMethod(method.value as any)}
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

                  {/* Instructions Toggle */}
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
                          <div className="text-xs">
                            <p>Make check payable to:</p>
                            <div className="mt-1 font-semibold">
                              <div>Wolf Consulting Group, LLC</div>
                              <div>2114 Willowcrest Drive</div>
                              <div>Waxhaw, NC 28173</div>
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
                          <strong>Secure Payment Processing:</strong> You&apos;ll be redirected to a PCI DSS certified payment page hosted by {paymentMethod === 'credit_card' ? 'Stripe' : 'PayPal'}. 
                          Your payment details are encrypted and never stored on our servers. This ensures the highest level of security for your transaction.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    onClick={handleProcessPayment}
                    disabled={processPaymentMutation.isPending || !paymentAmount}
                    className="w-full rounded-lg bg-[color:var(--color-primary-600)] px-4 py-3 text-sm font-semibold text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {processPaymentMutation.isPending ? (
                      'Processing...'
                    ) : ['credit_card', 'paypal'].includes(paymentMethod) ? (
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
                      <span>•</span>
                      <a href="/apps/crm/support/kb?tag=payments" className="underline hover:text-[color:var(--color-text)]">
                        Security Info
                      </a>
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

      {activeTab === 'record-payment' && (
        <div className="space-y-6">
          {/* Info Box */}
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-yellow-900">Internal Use: Record Phone/Mail Payments</h4>
                <p className="mt-1 text-sm text-yellow-800">
                  Use this form to record payments received by phone, mail, or other offline methods. 
                  All fields are required for proper reconciliation.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
            <h3 className="mb-6 text-lg font-semibold text-[color:var(--color-text)]">
              Record Payment
            </h3>

            <div className="space-y-4">
              {/* Search Invoice */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                  Search Invoice
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--color-text-muted)]" />
                  <input
                    type="text"
                    value={recordInvoiceSearch}
                    onChange={(e) => setRecordInvoiceSearch(e.target.value)}
                    placeholder="Search by invoice number, title, or account name..."
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent pl-10 pr-4 py-2 text-[color:var(--color-text)]"
                  />
                </div>
              </div>

              {/* Invoice Results */}
              {recordInvoiceSearch && (
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border border-[color:var(--color-border)] p-2">
                  {allInvoicesQuery.data
                    ?.filter((inv: Invoice) => {
                      const search = recordInvoiceSearch.toLowerCase()
                      return (
                        String(inv.invoiceNumber).includes(search) ||
                        inv.title?.toLowerCase().includes(search) ||
                        inv.accountName?.toLowerCase().includes(search)
                      )
                    })
                    .slice(0, 10)
                    .map((invoice: Invoice) => (
                      <button
                        key={invoice._id}
                        onClick={() => {
                          setRecordInvoice(invoice)
                          setRecordInvoiceSearch('')
                        }}
                        className="w-full rounded-lg border border-[color:var(--color-border)] p-3 text-left hover:bg-[color:var(--color-muted)]"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-[color:var(--color-text)]">
                              Invoice #{invoice.invoiceNumber ?? invoice._id.slice(-6)}
                            </div>
                            <div className="text-sm text-[color:var(--color-text-muted)]">
                              {invoice.title}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-[color:var(--color-text)]">
                              ${(invoice.balance ?? invoice.total ?? 0).toLocaleString()}
                            </div>
                            <div className="text-xs text-[color:var(--color-text-muted)]">
                              Balance
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              )}

              {/* Selected Invoice */}
              {recordInvoice && (
                <div className="rounded-lg border border-[color:var(--color-primary-600)] bg-[color:var(--color-primary-50)] p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm text-[color:var(--color-text-muted)]">
                        Selected Invoice
                      </div>
                      <div className="mt-1 font-semibold text-[color:var(--color-text)]">
                        #{recordInvoice.invoiceNumber ?? recordInvoice._id.slice(-6)}
                      </div>
                      <div className="text-sm text-[color:var(--color-text-muted)]">
                        {recordInvoice.title}
                      </div>
                    </div>
                    <button
                      onClick={() => setRecordInvoice(null)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="mt-3 text-lg font-bold text-[color:var(--color-text)]">
                    Balance: ${(recordInvoice.balance ?? recordInvoice.total ?? 0).toLocaleString()}
                  </div>
                </div>
              )}

              {/* Payment Amount */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                  Payment Amount *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-text-muted)]">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={recordAmount}
                    onChange={(e) => setRecordAmount(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent pl-8 pr-4 py-2 text-[color:var(--color-text)]"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                  Payment Method *
                </label>
                <select
                  value={recordMethod}
                  onChange={(e) => setRecordMethod(e.target.value as Payment['method'])}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-4 py-2 text-[color:var(--color-text)]"
                  style={{
                    colorScheme: 'dark',
                  }}
                >
                  <option value="check" className="bg-[color:var(--color-panel)] text-[color:var(--color-text)]">Check</option>
                  <option value="cash" className="bg-[color:var(--color-panel)] text-[color:var(--color-text)]">Cash</option>
                  <option value="credit_card" className="bg-[color:var(--color-panel)] text-[color:var(--color-text)]">Credit Card (Phone)</option>
                  <option value="ach" className="bg-[color:var(--color-panel)] text-[color:var(--color-text)]">ACH Transfer</option>
                  <option value="wire" className="bg-[color:var(--color-panel)] text-[color:var(--color-text)]">Wire Transfer</option>
                  <option value="paypal" className="bg-[color:var(--color-panel)] text-[color:var(--color-text)]">PayPal</option>
                </select>
              </div>

              {/* Reference Number */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                  Reference Number *
                </label>
                <input
                  type="text"
                  value={recordReference}
                  onChange={(e) => setRecordReference(e.target.value)}
                  placeholder="Check number, transaction ID, etc."
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2 text-[color:var(--color-text)]"
                />
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                  Payment Date *
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--color-text-muted)]" />
                  <input
                    type="date"
                    value={recordDate}
                    onChange={(e) => setRecordDate(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent pl-10 pr-4 py-2 text-[color:var(--color-text)]"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                  Notes
                </label>
                <textarea
                  value={recordNotes}
                  onChange={(e) => setRecordNotes(e.target.value)}
                  placeholder="Additional notes about this payment..."
                  rows={3}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2 text-[color:var(--color-text)]"
                />
              </div>

              {/* Submit Button */}
              <button
                onClick={handleRecordPayment}
                disabled={recordPaymentMutation.isPending || !recordInvoice || !recordAmount || !recordReference}
                className="w-full rounded-lg bg-[color:var(--color-primary-600)] px-4 py-3 text-sm font-semibold text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {recordPaymentMutation.isPending ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--color-text-muted)]" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Invoice, reference..."
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent pl-10 pr-4 py-2 text-sm text-[color:var(--color-text)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                  Status
                </label>
                <select
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value as any)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-4 py-2 text-sm text-[color:var(--color-text)]"
                  style={{
                    colorScheme: 'dark',
                  }}
                >
                  <option value="all" className="bg-[color:var(--color-panel)] text-[color:var(--color-text)]">All Payments</option>
                  <option value="reconciled" className="bg-[color:var(--color-panel)] text-[color:var(--color-text)]">Reconciled</option>
                  <option value="unreconciled" className="bg-[color:var(--color-panel)] text-[color:var(--color-text)]">Pending Reconciliation</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                  From Date
                </label>
                <input
                  type="date"
                  value={historyDateFrom}
                  onChange={(e) => setHistoryDateFrom(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2 text-sm text-[color:var(--color-text)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--color-text)] mb-2">
                  To Date
                </label>
                <input
                  type="date"
                  value={historyDateTo}
                  onChange={(e) => setHistoryDateTo(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2 text-sm text-[color:var(--color-text)]"
                />
              </div>
            </div>
          </div>

          {/* Payment History Table */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[color:var(--color-border)]">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-[color:var(--color-text)]">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[color:var(--color-text)]">
                      Invoice
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[color:var(--color-text)]">
                      Method
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[color:var(--color-text)]">
                      Reference
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-[color:var(--color-text)]">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-[color:var(--color-text)]">
                      Status
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-[color:var(--color-text)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsQuery.isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-[color:var(--color-text-muted)]">
                        Loading payment history...
                      </td>
                    </tr>
                  ) : (paymentsQuery.data?.length ?? 0) === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-[color:var(--color-text-muted)]">
                        No payment history found
                      </td>
                    </tr>
                  ) : (
                    paymentsQuery.data?.map((payment: any, idx: number) => (
                      <tr
                        key={payment._id ?? idx}
                        className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]"
                      >
                        <td className="px-4 py-3 text-[color:var(--color-text)]">
                          {formatDate(payment.paidAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[color:var(--color-text)]">
                            #{payment.invoiceNumber ?? 'N/A'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-[color:var(--color-text)]">
                            {getMethodIcon(payment.method)}
                            {getMethodLabel(payment.method)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[color:var(--color-text)]">
                          {payment.reference || '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-[color:var(--color-text)]">
                          ${payment.amount?.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {payment.reconciled ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                              <CheckCircle className="h-3 w-3" />
                              Reconciled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-700">
                              <AlertCircle className="h-3 w-3" />
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {!payment.reconciled && (
                            <button
                              onClick={async () => {
                                const confirmed = await confirm('Mark this payment as reconciled? This confirms that the funds have been verified in your bank account.', {
                                  confirmText: 'Mark as Reconciled',
                                  confirmColor: 'success'
                                })
                                if (confirmed) {
                                  reconcilePaymentMutation.mutate(payment._id)
                                }
                              }}
                              disabled={reconcilePaymentMutation.isPending}
                              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Mark as reconciled"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Reconcile
                            </button>
                          )}
                          {payment.reconciled && (
                            <span className="text-xs text-[color:var(--color-text-muted)]">
                              -
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Export Button */}
          <div className="flex justify-end">
            <button className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]">
              <Download className="h-4 w-4" />
              Export to CSV
            </button>
          </div>
        </div>
      )}
      {ConfirmDialog}
    </div>
  )
}

