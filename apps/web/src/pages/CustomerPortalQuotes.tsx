/**
 * Customer Portal Quotes
 * 
 * View quotes and contracts
 */

import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { http } from '../lib/http'
import { ArrowLeft, FileSignature, Eye, AlertCircle, CheckCircle2 } from 'lucide-react'

type Quote = {
  id: string
  quoteNumber: number
  title: string
  total: number
  status: string
  expiresAt?: string
  signedAt?: string
  signedBy?: string
  createdAt: string
  items: any[]
}

export default function CustomerPortalQuotes() {
  const navigate = useNavigate()
  const [viewingQuote, setViewingQuote] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('customer_portal_token')
    if (!token) {
      navigate('/portal/login')
    }
  }, [navigate])

  const quotesQ = useQuery({
    queryKey: ['customer-portal-quotes'],
    queryFn: async () => {
      const token = localStorage.getItem('customer_portal_token')
      const res = await http.get('/api/customer-portal/data/quotes', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data.items as Quote[]
    },
  })

  const quoteDetailQ = useQuery({
    queryKey: ['customer-portal-quote', viewingQuote],
    queryFn: async () => {
      const token = localStorage.getItem('customer_portal_token')
      const res = await http.get(`/api/customer-portal/data/quotes/${viewingQuote}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data
    },
    enabled: !!viewingQuote,
  })

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      sent: 'bg-blue-100 text-blue-800',
      viewed: 'bg-purple-100 text-purple-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      expired: 'bg-gray-100 text-gray-500',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.toUpperCase()}
      </span>
    )
  }

  const quoteDetail = quoteDetailQ.data

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-4">
            <Link to="/portal/dashboard" className="flex items-center space-x-2 text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Dashboard</span>
            </Link>
            <div className="hidden sm:block w-px h-6 bg-gray-300"></div>
            <h1 className="text-xl font-bold text-gray-900 hidden sm:block">My Quotes</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {quotesQ.isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="mt-2 text-gray-600">Loading quotes...</p>
          </div>
        ) : quotesQ.error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-2" />
              <p className="text-red-800">Failed to load quotes</p>
            </div>
          </div>
        ) : !quotesQ.data || quotesQ.data.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <FileSignature className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Quotes Found</h3>
            <p className="text-gray-600">You don't have any quotes yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quotes List */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">All Quotes</h2>
              
              {quotesQ.data.map((quote) => (
                <div
                  key={quote.id}
                  className={`bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border cursor-pointer ${
                    viewingQuote === quote.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-200'
                  }`}
                  onClick={() => setViewingQuote(quote.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        Quote #{quote.quoteNumber}
                      </h3>
                      <p className="text-sm text-gray-600">{quote.title}</p>
                    </div>
                    {getStatusBadge(quote.status)}
                  </div>

                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-1">Total Amount</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  <div className="text-sm text-gray-600 space-y-1">
                    <p>Created: {new Date(quote.createdAt).toLocaleDateString()}</p>
                    {quote.expiresAt && (
                      <p>Expires: {new Date(quote.expiresAt).toLocaleDateString()}</p>
                    )}
                    {quote.signedAt && (
                      <div className="flex items-center text-green-600 mt-2">
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        <span>Signed: {new Date(quote.signedAt).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Quote Detail */}
            <div className="lg:sticky lg:top-4 lg:self-start">
              {viewingQuote && quoteDetailQ.isLoading ? (
                <div className="bg-white rounded-lg shadow-md p-8 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                  <p className="mt-2 text-gray-600">Loading details...</p>
                </div>
              ) : viewingQuote && quoteDetail ? (
                <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-gray-900">Quote Details</h3>
                    {getStatusBadge(quoteDetail.status)}
                  </div>

                  <div className="space-y-4 mb-6">
                    <div>
                      <p className="text-sm text-gray-500">Quote Number</p>
                      <p className="text-lg font-semibold text-gray-900">#{quoteDetail.quoteNumber}</p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500">Title</p>
                      <p className="text-gray-900">{quoteDetail.title}</p>
                    </div>

                    {quoteDetail.account && (
                      <div>
                        <p className="text-sm text-gray-500">Account</p>
                        <p className="text-gray-900">{quoteDetail.account.name}</p>
                      </div>
                    )}

                    <div>
                      <p className="text-sm text-gray-500">Total Amount</p>
                      <p className="text-3xl font-bold text-gray-900">
                        ${quoteDetail.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    {quoteDetail.expiresAt && (
                      <div>
                        <p className="text-sm text-gray-500">Expires On</p>
                        <p className="text-gray-900">{new Date(quoteDetail.expiresAt).toLocaleDateString()}</p>
                      </div>
                    )}

                    {quoteDetail.signedAt && (
                      <div>
                        <p className="text-sm text-gray-500">Signed</p>
                        <p className="text-green-600 font-medium">
                          {new Date(quoteDetail.signedAt).toLocaleDateString()}
                          {quoteDetail.signedBy && ` by ${quoteDetail.signedBy}`}
                        </p>
                      </div>
                    )}

                    {quoteDetail.notes && (
                      <div>
                        <p className="text-sm text-gray-500">Notes</p>
                        <p className="text-gray-900 text-sm">{quoteDetail.notes}</p>
                      </div>
                    )}

                    {quoteDetail.terms && (
                      <div>
                        <p className="text-sm text-gray-500">Terms & Conditions</p>
                        <p className="text-gray-700 text-sm whitespace-pre-wrap">{quoteDetail.terms}</p>
                      </div>
                    )}
                  </div>

                  {/* Line Items */}
                  {quoteDetail.items && quoteDetail.items.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Line Items</h4>
                      <div className="space-y-2">
                        {quoteDetail.items.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-sm border-b border-gray-100 pb-2">
                            <div>
                              <p className="font-medium text-gray-900">{item.description}</p>
                              <p className="text-xs text-gray-500">Qty: {item.quantity} × ${item.unitPrice.toFixed(2)}</p>
                            </div>
                            <p className="font-semibold text-gray-900">
                              ${(item.quantity * item.unitPrice).toFixed(2)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t">
                    <p className="text-sm text-gray-600">
                      Questions about this quote? Contact us at{' '}
                      <a href="mailto:contactwcg@wolfconsultingnc.com" className="text-indigo-600 hover:text-indigo-700">
                        contactwcg@wolfconsultingnc.com
                      </a>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-md p-12 text-center border border-gray-200">
                  <Eye className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600">Select a quote to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

