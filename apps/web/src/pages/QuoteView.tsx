import * as React from 'react'
import { useParams } from 'react-router-dom'
import { http } from '@/lib/http'
import { useQuery, useMutation } from '@tanstack/react-query'
import { formatDateTime } from '@/lib/dateFormat'
import { CheckCircle, FileText, AlertCircle, DollarSign } from 'lucide-react'
import { useConfirm } from '@/components/ConfirmDialog'

export default function QuoteView() {
  const { token } = useParams<{ token: string }>()
  const [signerName, setSignerName] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const { confirm, ConfirmDialog } = useConfirm()

  const { data, isLoading, error } = useQuery({
    queryKey: ['quote-view', token],
    queryFn: async () => {
      const res = await http.get(`/api/quotes/view/${token}`)
      return res.data as {
        data: {
          quote: {
            _id: string
            quoteNumber?: number
            title: string
            items: Array<{
              description?: string
              quantity?: number
              unitPrice?: number
              total?: number
            }>
            subtotal: number
            tax: number
            total: number
            status: string
            signerName?: string
            signerEmail?: string
            esignStatus: string
            signedAt?: string
            createdAt: string
            accountInfo?: {
              accountNumber?: number
              name?: string
            }
          }
        }
      }
    },
    enabled: !!token,
  })

  const acceptMutation = useMutation({
    mutationFn: async (payload: { signerName?: string; notes?: string }) => {
      const res = await http.post(`/api/quotes/view/${token}/accept`, payload)
      return res.data
    },
    onSuccess: () => {
      // Refresh data to show updated status
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    },
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading quote...</p>
        </div>
      </div>
    )
  }

  if (error || !data?.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Quote Not Found</h1>
          <p className="text-gray-600 mb-4">The quote link is invalid or has expired.</p>
          <p className="text-sm text-gray-500">Please contact the sender for a new link.</p>
        </div>
      </div>
    )
  }

  const { quote } = data.data
  const isAccepted = quote.esignStatus === 'Accepted' || quote.esignStatus === 'Signed'

  return (
    <>
      {ConfirmDialog}
      <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Quote Review</h1>
              <p className="text-sm text-gray-600">Review and accept the quote below</p>
            </div>
          </div>
          
          {quote.accountInfo && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <strong>Account:</strong> {quote.accountInfo.name || `#${quote.accountInfo.accountNumber}`}
              </p>
            </div>
          )}
        </div>

        {/* Quote Details */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {quote.title}
            </h2>
            {quote.quoteNumber && (
              <p className="text-sm text-gray-600">Quote #: {quote.quoteNumber}</p>
            )}
            <p className="text-sm text-gray-600">Status: {quote.status}</p>
            <p className="text-sm text-gray-600">Created: {formatDateTime(quote.createdAt)}</p>
          </div>

          {/* Quote Items */}
          {quote.items && quote.items.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Items</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-4 font-semibold text-gray-700">Description</th>
                      <th className="text-right py-2 px-4 font-semibold text-gray-700">Quantity</th>
                      <th className="text-right py-2 px-4 font-semibold text-gray-700">Unit Price</th>
                      <th className="text-right py-2 px-4 font-semibold text-gray-700">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-3 px-4 text-gray-900">{item.description || 'N/A'}</td>
                        <td className="py-3 px-4 text-right text-gray-700">{item.quantity || 0}</td>
                        <td className="py-3 px-4 text-right text-gray-700">
                          ${(item.unitPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-900 font-medium">
                          ${(item.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-gray-700">
                  <span>Subtotal:</span>
                  <span>${quote.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {quote.tax > 0 && (
                  <div className="flex justify-between text-gray-700">
                    <span>Tax:</span>
                    <span>${quote.tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-200">
                  <span>Total:</span>
                  <span className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    {quote.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Acceptance Status */}
        {isAccepted && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <div>
                <h3 className="text-lg font-semibold text-green-900">Quote Accepted</h3>
                <p className="text-sm text-green-700">
                  This quote has been accepted{quote.signedAt ? ` on ${formatDateTime(quote.signedAt)}` : ''}.
                </p>
                {quote.signerName && (
                  <p className="text-sm text-green-700 mt-1">
                    Accepted by: {quote.signerName}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Acceptance Form */}
        {!isAccepted && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Accept Quote</h3>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="signerName" className="block text-sm font-medium text-gray-700 mb-1">
                  Your Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="signerName"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder={quote.signerName || 'Enter your name'}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  required
                />
              </div>

              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes or comments..."
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={async () => {
                    if (!signerName.trim() && !quote.signerName) {
                      await confirm('Please enter your name', {
                        confirmText: 'OK',
                        cancelText: '',
                        confirmColor: 'primary',
                      })
                      return
                    }
                    const confirmed = await confirm('Are you sure you want to accept this quote?', {
                      confirmText: 'Accept',
                      cancelText: 'Cancel',
                      confirmColor: 'success',
                    })
                    if (confirmed) {
                      acceptMutation.mutate({
                        signerName: signerName.trim() || quote.signerName,
                        notes: notes.trim() || undefined,
                      })
                    }
                  }}
                  disabled={acceptMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-white font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <CheckCircle className="h-5 w-5" />
                  {acceptMutation.isPending ? 'Accepting...' : 'Accept Quote'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  )
}

