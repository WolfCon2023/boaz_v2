/**
 * Customer Portal Invoices
 * 
 * View and access invoices
 */

import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { http } from '../lib/http'
import { ArrowLeft, FileText, Eye, Calendar, AlertCircle, CheckCircle } from 'lucide-react'

type Invoice = {
  id: string
  invoiceNumber: number
  title: string
  total: number
  balance: number
  status: string
  dueDate?: string
  createdAt: string
  paidAt?: string
  items: any[]
  payments: any[]
  subscriptionActive: boolean
}

export default function CustomerPortalInvoices() {
  const navigate = useNavigate()
  const [viewingInvoice, setViewingInvoice] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('customer_portal_token')
    if (!token) {
      navigate('/customer/login')
    }
  }, [navigate])

  function handleLogout() {
    localStorage.removeItem('customer_portal_token')
    localStorage.removeItem('customer_portal_user')
    navigate('/customer/login')
  }

  // Fetch invoices
  const invoicesQ = useQuery({
    queryKey: ['customer-portal-invoices'],
    queryFn: async () => {
      const token = localStorage.getItem('customer_portal_token')
      const res = await http.get('/api/customer-portal/data/invoices', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data.items as Invoice[]
    },
  })

  // Fetch specific invoice details
  const invoiceDetailQ = useQuery({
    queryKey: ['customer-portal-invoice', viewingInvoice],
    queryFn: async () => {
      const token = localStorage.getItem('customer_portal_token')
      const res = await http.get(`/api/customer-portal/data/invoices/${viewingInvoice}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data
    },
    enabled: !!viewingInvoice,
  })

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      paid: 'bg-green-100 text-green-800',
      sent: 'bg-blue-100 text-blue-800',
      draft: 'bg-gray-100 text-gray-800',
      overdue: 'bg-red-100 text-red-800',
      void: 'bg-gray-100 text-gray-500',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.toUpperCase()}
      </span>
    )
  }

  const invoiceDetail = invoiceDetailQ.data

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)]">
      {/* Header */}
      <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link
                to="/customer/dashboard"
                className="flex items-center space-x-2 text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Back to Dashboard</span>
              </Link>
              <div className="hidden sm:block w-px h-6 bg-[color:var(--color-border)]"></div>
              <h1 className="text-xl font-semibold text-[color:var(--color-text)] hidden sm:block">My Invoices</h1>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg px-4 py-2 text-sm text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {invoicesQ.isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[color:var(--color-primary-600)]"></div>
            <p className="mt-2 text-[color:var(--color-text-muted)]">Loading invoices...</p>
          </div>
        ) : invoicesQ.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-2" />
              <p className="text-sm text-red-800">Failed to load invoices</p>
            </div>
          </div>
        ) : !invoicesQ.data || invoicesQ.data.length === 0 ? (
          <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-12 text-center">
            <FileText className="w-16 h-16 text-[color:var(--color-text-muted)] opacity-50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[color:var(--color-text)] mb-2">No Invoices Found</h3>
            <p className="text-[color:var(--color-text-muted)]">You don't have any invoices yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Invoices List */}
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-[color:var(--color-text)] mb-4">All Invoices</h2>
              
              {invoicesQ.data.map((invoice) => (
                <div
                  key={invoice.id}
                  className={`rounded-lg border p-6 cursor-pointer bg-[color:var(--color-panel)] transition-all ${
                    viewingInvoice === invoice.id
                      ? 'border-[color:var(--color-primary-600)] ring-2 ring-[color:var(--color-primary-600)] ring-opacity-20'
                      : 'border-[color:var(--color-border)] hover:border-[color:var(--color-primary-600)]'
                  }`}
                  onClick={() => setViewingInvoice(invoice.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[color:var(--color-text)]">
                        Invoice #{invoice.invoiceNumber}
                      </h3>
                      <p className="text-sm text-[color:var(--color-text-muted)]">{invoice.title}</p>
                    </div>
                    {getStatusBadge(invoice.status)}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <p className="text-xs text-[color:var(--color-text-muted)] mb-1">Total</p>
                      <p className="text-lg font-semibold text-[color:var(--color-text)]">
                        ${invoice.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[color:var(--color-text-muted)] mb-1">Balance</p>
                      <p className={`text-lg font-bold ${invoice.balance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        ${invoice.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  {invoice.dueDate && (
                    <div className="flex items-center text-sm text-[color:var(--color-text-muted)] mb-2">
                      <Calendar className="w-4 h-4 mr-2" />
                      <span>
                        Due: {new Date(invoice.dueDate).toLocaleDateString()}
                        {invoice.status !== 'paid' && new Date(invoice.dueDate) < new Date() && (
                          <span className="ml-2 text-red-600 font-medium">(Overdue)</span>
                        )}
                      </span>
                    </div>
                  )}

                  {invoice.paidAt && (
                    <div className="flex items-center text-sm text-green-600">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      <span>Paid: {new Date(invoice.paidAt).toLocaleDateString()}</span>
                    </div>
                  )}

                  {invoice.subscriptionActive && (
                    <div className="mt-2 inline-flex items-center px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                      🔄 Subscription Active
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Invoice Detail */}
            <div className="lg:sticky lg:top-4 lg:self-start">
              {viewingInvoice && invoiceDetailQ.isLoading ? (
                <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-8 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[color:var(--color-primary-600)]"></div>
                  <p className="mt-2 text-[color:var(--color-text-muted)]">Loading details...</p>
                </div>
              ) : viewingInvoice && invoiceDetail ? (
                <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold text-[color:var(--color-text)]">Invoice Details</h3>
                    {getStatusBadge(invoiceDetail.status)}
                  </div>

                  <div className="space-y-4 mb-6">
                    <div>
                      <p className="text-sm text-[color:var(--color-text-muted)]">Invoice Number</p>
                      <p className="text-lg font-semibold text-[color:var(--color-text)]">#{invoiceDetail.invoiceNumber}</p>
                    </div>

                    <div>
                      <p className="text-sm text-[color:var(--color-text-muted)]">Title</p>
                      <p className="text-[color:var(--color-text)]">{invoiceDetail.title}</p>
                    </div>

                    {invoiceDetail.account && (
                      <div>
                        <p className="text-sm text-[color:var(--color-text-muted)]">Account</p>
                        <p className="text-[color:var(--color-text)]">{invoiceDetail.account.name}</p>
                        {invoiceDetail.account.email && (
                          <p className="text-sm text-[color:var(--color-text-muted)]">{invoiceDetail.account.email}</p>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-[color:var(--color-text-muted)]">Total Amount</p>
                        <p className="text-xl font-bold text-[color:var(--color-text)]">
                          ${invoiceDetail.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-[color:var(--color-text-muted)]">Balance Due</p>
                        <p className={`text-xl font-bold ${invoiceDetail.balance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          ${invoiceDetail.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    {invoiceDetail.dueDate && (
                      <div>
                        <p className="text-sm text-[color:var(--color-text-muted)]">Due Date</p>
                        <p className="text-[color:var(--color-text)]">{new Date(invoiceDetail.dueDate).toLocaleDateString()}</p>
                      </div>
                    )}

                    {invoiceDetail.notes && (
                      <div>
                        <p className="text-sm text-[color:var(--color-text-muted)]">Notes</p>
                        <p className="text-[color:var(--color-text)] text-sm">{invoiceDetail.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Line Items */}
                  {invoiceDetail.items && invoiceDetail.items.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-[color:var(--color-text)] mb-3">Line Items</h4>
                      <div className="space-y-2">
                        {invoiceDetail.items.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-sm border-b border-[color:var(--color-border)] pb-2">
                            <div>
                              <p className="font-medium text-[color:var(--color-text)]">{item.description}</p>
                              <p className="text-xs text-[color:var(--color-text-muted)]">Qty: {item.quantity} × ${item.unitPrice.toFixed(2)}</p>
                            </div>
                            <p className="font-semibold text-[color:var(--color-text)]">
                              ${(item.quantity * item.unitPrice).toFixed(2)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payments */}
                  {invoiceDetail.payments && invoiceDetail.payments.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-[color:var(--color-text)] mb-3">Payments</h4>
                      <div className="space-y-2">
                        {invoiceDetail.payments.map((payment: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-sm bg-green-50 p-2 rounded">
                            <div>
                              <p className="font-medium text-[color:var(--color-text)]">{payment.method}</p>
                              <p className="text-xs text-[color:var(--color-text-muted)]">{new Date(payment.paidAt).toLocaleDateString()}</p>
                            </div>
                            <p className="font-semibold text-green-600">
                              ${payment.amount.toFixed(2)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-4 border-t border-[color:var(--color-border)]">
                    <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
                      Need to make a payment? Visit our{' '}
                      <Link to="/customer/payments" className="text-[color:var(--color-primary-600)] hover:text-[color:var(--color-primary-700)] font-medium">
                        secure payment portal
                      </Link>
                      . Have questions? Contact us at{' '}
                      <a href="mailto:contactwcg@wolfconsultingnc.com" className="text-[color:var(--color-primary-600)] hover:text-[color:var(--color-primary-700)]">
                        contactwcg@wolfconsultingnc.com
                      </a>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-12 text-center">
                  <Eye className="w-12 h-12 text-[color:var(--color-text-muted)] opacity-50 mx-auto mb-3" />
                  <p className="text-[color:var(--color-text-muted)]">Select an invoice to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

