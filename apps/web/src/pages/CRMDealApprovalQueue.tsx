import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'
import { CheckCircle, XCircle, Clock, FileText } from 'lucide-react'

type DealApprovalRequest = {
  _id: string
  dealId: string
  deal?: {
    _id: string
    dealNumber?: number
    title?: string
    amount?: number
    stage?: string
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

export default function CRMDealApprovalQueue() {
  const qc = useQueryClient()
  const toast = useToast()
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [selectedRequest, setSelectedRequest] = React.useState<DealApprovalRequest | null>(null)
  const [reviewNotes, setReviewNotes] = React.useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['deal-approval-queue', statusFilter],
    queryFn: async () => {
      const res = await http.get('/api/crm/deals/approval-queue', {
        params: { status: statusFilter },
      })
      return res.data as { data: { items: DealApprovalRequest[] } }
    },
    retry: false,
  })

  const requests = data?.data.items ?? []

  const approveDeal = useMutation({
    mutationFn: async ({ dealId, notes }: { dealId: string; notes?: string }) => {
      const res = await http.post(`/api/crm/deals/${dealId}/approve`, { reviewNotes: notes })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal-approval-queue'] })
      qc.invalidateQueries({ queryKey: ['deals'] })
      qc.invalidateQueries({ queryKey: ['deal-history'] })
      setSelectedRequest(null)
      setReviewNotes('')
      toast.showToast('BOAZ says: Deal approved successfully.', 'success')
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.error || 'Failed to approve deal'
      toast.showToast(errorMsg, 'error')
    },
  })

  const rejectDeal = useMutation({
    mutationFn: async ({ dealId, notes }: { dealId: string; notes?: string }) => {
      const res = await http.post(`/api/crm/deals/${dealId}/reject`, { reviewNotes: notes })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal-approval-queue'] })
      qc.invalidateQueries({ queryKey: ['deals'] })
      qc.invalidateQueries({ queryKey: ['deal-history'] })
      setSelectedRequest(null)
      setReviewNotes('')
      toast.showToast('BOAZ says: Deal rejected.', 'info')
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.error || 'Failed to reject deal'
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
                You must have the manager role to access the deal approval queue.
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
        <h1 className="text-xl font-semibold">Deal Approval Queue</h1>
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
              <thead className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Deal</th>
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
                    className="border-t border-[color:var(--color-border)] cursor-pointer hover:bg-[color:var(--color-muted)]"
                    onClick={() => setSelectedRequest(request)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {request.deal?.dealNumber ? `#${request.deal.dealNumber}` : 'N/A'} -{' '}
                        {request.deal?.title || 'Untitled'}
                      </div>
                      {typeof request.deal?.amount === 'number' && (
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          $
                          {request.deal.amount.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>{request.requesterName || request.requesterEmail}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {request.requesterEmail}
                      </div>
                    </td>
                    <td className="px-4 py-3">{formatDateTime(request.requestedAt)}</td>
                    <td className="px-4 py-3">{getStatusBadge(request.status)}</td>
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
                        <div
                          className="max-w-xs truncate text-xs text-[color:var(--color-text-muted)]"
                          title={request.reviewNotes}
                        >
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
            <h2 className="mb-4 text-lg font-semibold">Review Deal Approval Request</h2>

            <div className="mb-4 space-y-2 text-sm">
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Deal: </span>
                <span>
                  {selectedRequest.deal?.dealNumber ? `#${selectedRequest.deal.dealNumber}` : 'N/A'} -{' '}
                  {selectedRequest.deal?.title || 'Untitled'}
                </span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Amount: </span>
                <span>
                  $
                  {selectedRequest.deal?.amount != null
                    ? selectedRequest.deal.amount.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : '0.00'}
                </span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">
                  Requested by:{' '}
                </span>
                <span>{selectedRequest.requesterName || selectedRequest.requesterEmail}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Requested at: </span>
                <span>{formatDateTime(selectedRequest.requestedAt)}</span>
              </div>
            </div>

            <label className="mb-4 block text-sm">
              <span className="mb-1 block font-medium text-[color:var(--color-text-muted)]">
                Review notes (optional)
              </span>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  rejectDeal.mutate({ dealId: selectedRequest.dealId, notes: reviewNotes || undefined })
                }
                className="inline-flex items-center gap-1 rounded-lg border border-red-500 px-3 py-2 text-sm text-red-500 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
              <button
                type="button"
                onClick={() =>
                  approveDeal.mutate({ dealId: selectedRequest.dealId, notes: reviewNotes || undefined })
                }
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-2 text-sm text-white hover:bg-emerald-600"
              >
                <CheckCircle className="h-4 w-4" />
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


