import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'
import { CheckCircle, XCircle, Clock, FileText } from 'lucide-react'

type ApprovalRequest = {
  _id: string
  quoteId: string
  quote?: {
    _id: string
    quoteNumber?: number
    title?: string
    total?: number
    status?: string
    accountId?: string
  }
  requesterId: string
  requesterEmail: string
  requesterName?: string
  approverEmail: string
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: string
  reviewedAt?: string
  reviewedBy?: string
  reviewNotes?: string
}

export default function CRMApprovalQueue() {
  const qc = useQueryClient()
  const toast = useToast()
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [selectedRequest, setSelectedRequest] = React.useState<ApprovalRequest | null>(null)
  const [reviewNotes, setReviewNotes] = React.useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['quote-approval-queue', statusFilter],
    queryFn: async () => {
      const res = await http.get('/api/crm/quotes/approval-queue', {
        params: { status: statusFilter },
      })
      return res.data as { data: { items: ApprovalRequest[] } }
    },
    retry: false,
  })

  const requests = data?.data.items ?? []

  const approveQuote = useMutation({
    mutationFn: async ({ quoteId, notes }: { quoteId: string; notes?: string }) => {
      const res = await http.post(`/api/crm/quotes/${quoteId}/approve`, { reviewNotes: notes })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote-approval-queue'] })
      qc.invalidateQueries({ queryKey: ['quotes'] })
      qc.invalidateQueries({ queryKey: ['quote-history'] })
      setSelectedRequest(null)
      setReviewNotes('')
      toast.showToast('Quote approved successfully!', 'success')
    },
    onError: (err: any) => {
      const errorMsg = err.response?.data?.error || 'Failed to approve quote'
      toast.showToast(errorMsg, 'error')
    },
  })

  const rejectQuote = useMutation({
    mutationFn: async ({ quoteId, notes }: { quoteId: string; notes?: string }) => {
      const res = await http.post(`/api/crm/quotes/${quoteId}/reject`, { reviewNotes: notes })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote-approval-queue'] })
      qc.invalidateQueries({ queryKey: ['quotes'] })
      qc.invalidateQueries({ queryKey: ['quote-history'] })
      setSelectedRequest(null)
      setReviewNotes('')
      toast.showToast('Quote rejected.', 'info')
    },
    onError: (err: any) => {
      const errorMsg = err.response?.data?.error || 'Failed to reject quote'
      toast.showToast(errorMsg, 'error')
    },
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        )
      case 'approved':
        return (
          <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
            <CheckCircle className="h-3 w-3" />
            Approved
          </span>
        )
      case 'rejected':
        return (
          <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
            <XCircle className="h-3 w-3" />
            Rejected
          </span>
        )
      default:
        return <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-800">{status}</span>
    }
  }

  if (error) {
    const errorMsg = (error as any)?.response?.data?.error
    if (errorMsg === 'manager_access_required') {
      return (
        <div className="space-y-4">
          <CRMNav />
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="w-[min(90vw,28rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-center">
              <h1 className="mb-3 text-xl font-semibold">Access Denied</h1>
              <p className="mb-4 text-sm text-[color:var(--color-text-muted)]">
                You must have the manager role to access the approval queue.
              </p>
            </div>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="space-y-4">
      <CRMNav />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quote Approval Queue</h1>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
          >
            <option value="all">All Requests</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-[color:var(--color-primary-600)] border-t-transparent"></div>
            <p className="text-sm text-[color:var(--color-text-muted)]">Loading approval queue...</p>
          </div>
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-8 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-[color:var(--color-text-muted)]" />
          <p className="text-sm text-[color:var(--color-text-muted)]">
            {statusFilter === 'all'
              ? 'No approval requests found.'
              : `No ${statusFilter} approval requests found.`}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[color:var(--color-text-muted)] border-b border-[color:var(--color-border)]">
                <tr>
                  <th className="px-4 py-3">Quote</th>
                  <th className="px-4 py-3">Requested By</th>
                  <th className="px-4 py-3">Requested At</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reviewed At</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr
                    key={request._id}
                    className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)] cursor-pointer"
                    onClick={() => setSelectedRequest(request)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {request.quote?.quoteNumber ? `#${request.quote.quoteNumber}` : 'N/A'} - {request.quote?.title || 'Untitled'}
                      </div>
                      {request.quote?.total !== undefined && (
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          ${request.quote.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>{request.requesterName || request.requesterEmail}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">{request.requesterEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      {formatDateTime(request.requestedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(request.status)}
                    </td>
                    <td className="px-4 py-3">
                      {request.reviewedAt ? formatDateTime(request.reviewedAt) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {request.status === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedRequest(request)
                            }}
                            className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                          >
                            Review
                          </button>
                        </div>
                      )}
                      {request.status !== 'pending' && request.reviewNotes && (
                        <div className="text-xs text-[color:var(--color-text-muted)] max-w-xs truncate" title={request.reviewNotes}>
                          {request.reviewNotes}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {selectedRequest && selectedRequest.status === 'pending' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedRequest(null)} />
          <div className="relative z-10 w-[min(90vw,32rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold">Review Quote Approval Request</h2>
            
            <div className="mb-4 space-y-2 text-sm">
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Quote: </span>
                <span>{selectedRequest.quote?.quoteNumber ? `#${selectedRequest.quote.quoteNumber}` : 'N/A'} - {selectedRequest.quote?.title || 'Untitled'}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Total: </span>
                <span>${selectedRequest.quote?.total?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Requested by: </span>
                <span>{selectedRequest.requesterName || selectedRequest.requesterEmail}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Requested at: </span>
                <span>{formatDateTime(selectedRequest.requestedAt)}</span>
              </div>
            </div>

            <div className="mb-4">
              <label className="block mb-2 text-sm font-medium">Review Notes (Optional)</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                placeholder="Add any notes about your decision..."
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedRequest(null)
                  setReviewNotes('')
                }}
                className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Reject this quote?')) {
                    rejectQuote.mutate({ quoteId: selectedRequest.quoteId, notes: reviewNotes || undefined })
                  }
                }}
                disabled={rejectQuote.isPending}
                className="flex items-center gap-2 rounded-lg border border-red-400 bg-red-50 px-4 py-2 text-sm text-red-600 hover:bg-red-100 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Approve this quote?')) {
                    approveQuote.mutate({ quoteId: selectedRequest.quoteId, notes: reviewNotes || undefined })
                  }
                }}
                disabled={approveQuote.isPending}
                className="flex items-center gap-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal for Approved/Rejected */}
      {selectedRequest && selectedRequest.status !== 'pending' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedRequest(null)} />
          <div className="relative z-10 w-[min(90vw,32rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold">Approval Request Details</h2>
            
            <div className="mb-4 space-y-2 text-sm">
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Quote: </span>
                <span>{selectedRequest.quote?.quoteNumber ? `#${selectedRequest.quote.quoteNumber}` : 'N/A'} - {selectedRequest.quote?.title || 'Untitled'}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Total: </span>
                <span>${selectedRequest.quote?.total?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Requested by: </span>
                <span>{selectedRequest.requesterName || selectedRequest.requesterEmail}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Status: </span>
                {getStatusBadge(selectedRequest.status)}
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Requested at: </span>
                <span>{formatDateTime(selectedRequest.requestedAt)}</span>
              </div>
              {selectedRequest.reviewedAt && (
                <div>
                  <span className="font-medium text-[color:var(--color-text-muted)]">Reviewed at: </span>
                  <span>{formatDateTime(selectedRequest.reviewedAt)}</span>
                </div>
              )}
              {selectedRequest.reviewNotes && (
                <div>
                  <span className="font-medium text-[color:var(--color-text-muted)]">Review Notes: </span>
                  <div className="mt-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-2">
                    {selectedRequest.reviewNotes}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

