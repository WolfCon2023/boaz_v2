import * as React from 'react'
import { useParams } from 'react-router-dom'
import { http } from '@/lib/http'
import { useQuery, useMutation } from '@tanstack/react-query'
import { formatDateTime } from '@/lib/dateFormat'
import { CheckCircle, XCircle, FileText, Clock, AlertCircle } from 'lucide-react'

export default function TermsReview() {
  const { token } = useParams<{ token: string }>()
  const [signerName, setSignerName] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [action, setAction] = React.useState<'approve' | 'reject' | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['terms-review', token],
    queryFn: async () => {
      const res = await http.get(`/api/terms/review/${token}`)
      return res.data as {
        data: {
          request: {
            _id: string
            termsName: string
            recipientEmail: string
            recipientName?: string
            senderName?: string
            customMessage?: string
            status: 'pending' | 'viewed' | 'approved' | 'rejected'
            sentAt: string
            viewedAt?: string
            respondedAt?: string
          }
          terms: {
            _id: string
            name: string
            description?: string
            content: string
          }
        }
      }
    },
    enabled: !!token,
  })

  const respondMutation = useMutation({
    mutationFn: async (payload: { action: 'approve' | 'reject'; notes?: string; signerName?: string }) => {
      const res = await http.post(`/api/terms/review/${token}/respond`, payload)
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
          <p className="text-gray-600">Loading terms...</p>
        </div>
      </div>
    )
  }

  if (error || !data?.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Review Not Found</h1>
          <p className="text-gray-600 mb-4">The terms review link is invalid or has expired.</p>
          <p className="text-sm text-gray-500">Please contact the sender for a new link.</p>
        </div>
      </div>
    )
  }

  const { request, terms } = data.data
  const isResponded = request.status === 'approved' || request.status === 'rejected'

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Terms & Conditions Review</h1>
              <p className="text-sm text-gray-600">Review and approve the terms below</p>
            </div>
          </div>
          
          {request.senderName && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <strong>From:</strong> {request.senderName}
              </p>
              {request.customMessage && (
                <p className="text-sm text-gray-600 mt-2 italic">&quot;{request.customMessage}&quot;</p>
              )}
            </div>
          )}
        </div>

        {/* Status Banner */}
        {isResponded && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            request.status === 'approved' 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            {request.status === 'approved' ? (
              <CheckCircle className="h-6 w-6 text-green-600" />
            ) : (
              <XCircle className="h-6 w-6 text-red-600" />
            )}
            <div>
              <p className={`font-semibold ${
                request.status === 'approved' ? 'text-green-900' : 'text-red-900'
              }`}>
                {request.status === 'approved' ? 'Approved' : 'Rejected'}
              </p>
              <p className={`text-sm ${
                request.status === 'approved' ? 'text-green-700' : 'text-red-700'
              }`}>
                {request.respondedAt && `Responded on ${formatDateTime(request.respondedAt)}`}
              </p>
            </div>
          </div>
        )}

        {/* Terms Content */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">{terms.name}</h2>
            {terms.description && (
              <p className="text-gray-600 mb-4">{terms.description}</p>
            )}
          </div>
          
          <div className="border-t border-gray-200 pt-6">
            <div 
              className="prose max-w-none text-gray-700 whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: terms.content.replace(/\n/g, '<br />') }}
            />
          </div>
        </div>

        {/* Review Form */}
        {!isResponded && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Response</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any comments or questions..."
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setAction('approve')
                    if (signerName.trim()) {
                      respondMutation.mutate({
                        action: 'approve',
                        signerName: signerName.trim(),
                        notes: notes.trim() || undefined,
                      })
                    }
                  }}
                  disabled={!signerName.trim() || respondMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <CheckCircle className="h-5 w-5" />
                  {respondMutation.isPending && action === 'approve' ? 'Processing...' : 'Approve Terms'}
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setAction('reject')
                    if (signerName.trim()) {
                      respondMutation.mutate({
                        action: 'reject',
                        signerName: signerName.trim(),
                        notes: notes.trim() || undefined,
                      })
                    }
                  }}
                  disabled={!signerName.trim() || respondMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <XCircle className="h-5 w-5" />
                  {respondMutation.isPending && action === 'reject' ? 'Processing...' : 'Reject Terms'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Info */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Sent to: {request.recipientName || request.recipientEmail}</p>
          {request.sentAt && <p>Sent on: {formatDateTime(request.sentAt)}</p>}
          {request.viewedAt && request.status !== 'approved' && request.status !== 'rejected' && (
            <p className="flex items-center justify-center gap-1 mt-2">
              <Clock className="h-4 w-4" />
              Viewed on: {formatDateTime(request.viewedAt)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

