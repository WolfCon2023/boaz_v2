import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'
import { CheckCircle, XCircle, Clock, DollarSign, ArrowRight } from 'lucide-react'

type ExpenseStatus = 
  | 'draft'
  | 'pending_manager_approval'
  | 'pending_senior_approval'
  | 'pending_finance_approval'
  | 'pending_approval'  // Legacy
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'void'

type ApprovalHistoryEntry = {
  action: string
  userId: string
  userEmail?: string
  userName?: string
  timestamp: string
  notes?: string
  approvalLevel?: number
  roleName?: string
}

type ExpenseApprovalItem = {
  _id: string
  expenseId: string
  expenseNumber: number
  description: string
  total: number
  date: string
  status: ExpenseStatus
  currentApprovalLevel?: number
  vendorName?: string
  payee?: string
  
  // Submitter
  requesterId: string
  requesterEmail?: string
  requesterName?: string
  requestedAt?: string
  
  // Level 1: Manager
  managerApproverUserId?: string
  managerApproverEmail?: string
  managerApproverName?: string
  managerApprovedAt?: string
  
  // Level 2: Senior Manager
  seniorManagerApproverUserId?: string
  seniorManagerApproverEmail?: string
  seniorManagerApproverName?: string
  seniorManagerApprovedAt?: string
  
  // Level 3: Finance Manager
  financeManagerApproverUserId?: string
  financeManagerApproverEmail?: string
  financeManagerApproverName?: string
  financeManagerApprovedAt?: string
  
  // Legacy
  approverUserId?: string
  approverEmail?: string
  approverName?: string
  
  reviewedAt?: string
  reviewedBy?: string
  reviewNotes?: string
  rejectedAtLevel?: number
  lines?: Array<{ category: string; amount: number; description?: string }>
  approvalHistory?: ApprovalHistoryEntry[]
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

// Check if a status is pending any approval
function isPendingStatus(status: ExpenseStatus): boolean {
  return [
    'pending_manager_approval',
    'pending_senior_approval',
    'pending_finance_approval',
    'pending_approval',
  ].includes(status)
}

export default function CRMExpenseApprovalQueue() {
  const qc = useQueryClient()
  const toast = useToast()
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [selectedExpense, setSelectedExpense] = React.useState<ExpenseApprovalItem | null>(null)
  const [reviewNotes, setReviewNotes] = React.useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['expense-approval-queue', statusFilter],
    queryFn: async () => {
      const res = await http.get('/api/crm/expenses/approval-queue', {
        params: { status: statusFilter === 'pending' ? undefined : statusFilter },
      })
      return res.data as { data: { items: ExpenseApprovalItem[]; userRoles?: string[] } }
    },
    retry: false,
  })

  const items = data?.data.items ?? []
  const userRoles = data?.data.userRoles ?? []

  const approveExpense = useMutation({
    mutationFn: async ({ expenseId, notes }: { expenseId: string; notes?: string }) => {
      const res = await http.post(`/api/crm/expenses/${expenseId}/approve`, { reviewNotes: notes })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-approval-queue'] })
      qc.invalidateQueries({ queryKey: ['crm-expenses'] })
      qc.invalidateQueries({ queryKey: ['crm-expenses-summary'] })
      setSelectedExpense(null)
      setReviewNotes('')
      toast.showToast('Expense approved successfully.', 'success')
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.error || 'Failed to approve expense'
      toast.showToast(errorMsg, 'error')
    },
  })

  const rejectExpense = useMutation({
    mutationFn: async ({ expenseId, reason }: { expenseId: string; reason?: string }) => {
      const res = await http.post(`/api/crm/expenses/${expenseId}/reject`, { reason })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-approval-queue'] })
      qc.invalidateQueries({ queryKey: ['crm-expenses'] })
      qc.invalidateQueries({ queryKey: ['crm-expenses-summary'] })
      setSelectedExpense(null)
      setReviewNotes('')
      toast.showToast('Expense rejected.', 'info')
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.error || 'Failed to reject expense'
      toast.showToast(errorMsg, 'error')
    },
  })

  const getStatusBadge = (status: ExpenseStatus) => {
    switch (status) {
      case 'pending_manager_approval':
        return (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/50 px-2 py-1 text-xs font-medium text-amber-400">
            <Clock className="h-3 w-3" />
            Manager Review
          </span>
        )
      case 'pending_senior_approval':
        return (
          <span className="flex items-center gap-1 rounded-full bg-orange-500/10 border border-orange-500/50 px-2 py-1 text-xs font-medium text-orange-400">
            <Clock className="h-3 w-3" />
            Sr. Manager Review
          </span>
        )
      case 'pending_finance_approval':
        return (
          <span className="flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/50 px-2 py-1 text-xs font-medium text-purple-400">
            <Clock className="h-3 w-3" />
            Finance Review
          </span>
        )
      case 'pending_approval':
        return (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/50 px-2 py-1 text-xs font-medium text-amber-400">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        )
      case 'approved':
        return (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/50 px-2 py-1 text-xs font-medium text-emerald-400">
            <CheckCircle className="h-3 w-3" />
            Approved
          </span>
        )
      case 'rejected':
        return (
          <span className="flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/50 px-2 py-1 text-xs font-medium text-red-400">
            <XCircle className="h-3 w-3" />
            Rejected
          </span>
        )
      case 'paid':
        return (
          <span className="flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/50 px-2 py-1 text-xs font-medium text-blue-400">
            <DollarSign className="h-3 w-3" />
            Paid
          </span>
        )
      default:
        return <span className="rounded-full bg-gray-500/10 px-2 py-1 text-xs text-gray-400">{status}</span>
    }
  }

  if (error) {
    const errorMsg = (error as any)?.response?.data?.error
    if (errorMsg === 'manager_access_required' || errorMsg === 'approval_role_required') {
      return (
        <div className="space-y-4">
          <CRMNav />
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="w-[min(90vw,28rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-center">
              <h1 className="mb-3 text-xl font-semibold">Access Denied</h1>
              <p className="mb-4 text-sm text-[color:var(--color-text-muted)]">
                You must have an approval role (Manager, Senior Manager, or Finance Manager) to access the expense approval queue.
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
        <div>
          <h1 className="text-xl font-semibold">Expense Approval Queue</h1>
          {userRoles.length > 0 && (
            <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              Your roles: {userRoles.map(r => r.replace('_', ' ')).join(', ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
          >
            <option value="pending">Pending My Approval</option>
            <option value="all">All Requests</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>
      
      {/* Approval Flow Legend */}
      <div className="flex items-center gap-2 rounded-lg bg-[color:var(--color-muted)] p-3 text-xs">
        <span className="text-[color:var(--color-text-muted)]">Approval Flow:</span>
        <span className="rounded bg-amber-500/20 px-2 py-1 text-amber-400">1. Manager</span>
        <ArrowRight className="h-3 w-3 text-[color:var(--color-text-muted)]" />
        <span className="rounded bg-orange-500/20 px-2 py-1 text-orange-400">2. Sr. Manager</span>
        <ArrowRight className="h-3 w-3 text-[color:var(--color-text-muted)]" />
        <span className="rounded bg-purple-500/20 px-2 py-1 text-purple-400">3. Finance</span>
        <ArrowRight className="h-3 w-3 text-[color:var(--color-text-muted)]" />
        <span className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-400">Approved</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-[color:var(--color-primary-600)] border-t-transparent"></div>
            <p className="text-sm text-[color:var(--color-text-muted)]">Loading approval queue...</p>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-8 text-center">
          <DollarSign className="mx-auto mb-4 h-12 w-12 text-[color:var(--color-text-muted)]" />
          <p className="text-sm text-[color:var(--color-text-muted)]">
            {statusFilter === 'pending'
              ? 'No expenses pending your approval.'
              : statusFilter === 'all'
              ? 'No expense approval requests found.'
              : `No ${statusFilter} expenses found.`}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Expense #</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Payee</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Submitted By</th>
                  <th className="px-4 py-3">Submitted At</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item._id}
                    className="border-t border-[color:var(--color-border)] cursor-pointer hover:bg-[color:var(--color-muted)]"
                    onClick={() => setSelectedExpense(item)}
                  >
                    <td className="px-4 py-3 font-mono text-[color:var(--color-text-muted)]">
                      EXP-{item.expenseNumber}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate">
                      {item.description}
                    </td>
                    <td className="px-4 py-3">
                      {item.vendorName || item.payee || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium">
                      {formatCurrency(item.total)}
                    </td>
                    <td className="px-4 py-3">
                      <div>{item.requesterName || item.requesterEmail || '—'}</div>
                      {item.requesterEmail && item.requesterName && (
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          {item.requesterEmail}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.requestedAt ? formatDateTime(item.requestedAt) : '—'}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                    <td className="px-4 py-3">
                      {isPendingStatus(item.status) && (
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedExpense(item)
                            }}
                            className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                          >
                            Review
                          </button>
                        </div>
                      )}
                      {!isPendingStatus(item.status) && item.reviewNotes && (
                        <div
                          className="max-w-xs truncate text-xs text-[color:var(--color-text-muted)]"
                          title={item.reviewNotes}
                        >
                          {item.reviewNotes}
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
      {selectedExpense && isPendingStatus(selectedExpense.status) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedExpense(null)} />
          <div className="relative z-10 w-[min(90vw,40rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold">Review Expense Approval Request</h2>

            {/* Current Status */}
            <div className="mb-4 flex items-center gap-2">
              {getStatusBadge(selectedExpense.status)}
            </div>

            {/* Approval Progress */}
            <div className="mb-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
              <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-2">Approval Progress</div>
              <div className="flex items-center gap-2 text-xs">
                {/* Manager */}
                <div className={`flex items-center gap-1 rounded px-2 py-1 ${
                  selectedExpense.managerApprovedAt 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : selectedExpense.status === 'pending_manager_approval' || selectedExpense.status === 'pending_approval'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {selectedExpense.managerApprovedAt ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  Manager
                </div>
                <ArrowRight className="h-3 w-3 text-[color:var(--color-text-muted)]" />
                
                {/* Senior Manager */}
                <div className={`flex items-center gap-1 rounded px-2 py-1 ${
                  selectedExpense.seniorManagerApprovedAt 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : selectedExpense.status === 'pending_senior_approval'
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {selectedExpense.seniorManagerApprovedAt ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  Sr. Manager
                </div>
                <ArrowRight className="h-3 w-3 text-[color:var(--color-text-muted)]" />
                
                {/* Finance Manager */}
                <div className={`flex items-center gap-1 rounded px-2 py-1 ${
                  selectedExpense.financeManagerApprovedAt 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : selectedExpense.status === 'pending_finance_approval'
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {selectedExpense.financeManagerApprovedAt ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  Finance
                </div>
              </div>
              
              {/* Show assigned approvers */}
              <div className="mt-2 space-y-1 text-xs text-[color:var(--color-text-muted)]">
                {selectedExpense.managerApproverName && (
                  <div>Manager: {selectedExpense.managerApproverName} {selectedExpense.managerApprovedAt && `(approved ${formatDateTime(selectedExpense.managerApprovedAt)})`}</div>
                )}
                {selectedExpense.seniorManagerApproverName && (
                  <div>Sr. Manager: {selectedExpense.seniorManagerApproverName} {selectedExpense.seniorManagerApprovedAt && `(approved ${formatDateTime(selectedExpense.seniorManagerApprovedAt)})`}</div>
                )}
                {selectedExpense.financeManagerApproverName && (
                  <div>Finance: {selectedExpense.financeManagerApproverName} {selectedExpense.financeManagerApprovedAt && `(approved ${formatDateTime(selectedExpense.financeManagerApprovedAt)})`}</div>
                )}
              </div>
            </div>

            <div className="mb-4 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[color:var(--color-text-muted)]">Expense: </span>
                <span className="font-mono">EXP-{selectedExpense.expenseNumber}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Description: </span>
                <span>{selectedExpense.description}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Payee: </span>
                <span>{selectedExpense.vendorName || selectedExpense.payee || '—'}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Amount: </span>
                <span className="font-semibold text-lg">{formatCurrency(selectedExpense.total)}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Date: </span>
                <span>{selectedExpense.date ? formatDateTime(selectedExpense.date) : '—'}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Submitted By: </span>
                <span>{selectedExpense.requesterName || selectedExpense.requesterEmail}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Submitted At: </span>
                <span>{selectedExpense.requestedAt ? formatDateTime(selectedExpense.requestedAt) : '—'}</span>
              </div>

              {/* Line Items */}
              {selectedExpense.lines && selectedExpense.lines.length > 0 && (
                <div className="mt-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
                  <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-2">Line Items</div>
                  <div className="space-y-1">
                    {selectedExpense.lines.map((line, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span>{line.category}{line.description ? ` - ${line.description}` : ''}</span>
                        <span className="font-mono">{formatCurrency(line.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <label className="mb-4 block text-sm">
              <span className="mb-1 block font-medium text-[color:var(--color-text-muted)]">
                Review notes (optional)
              </span>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                placeholder="Add notes for approval or rejection reason..."
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedExpense(null)}
                className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  rejectExpense.mutate({ expenseId: selectedExpense.expenseId, reason: reviewNotes || undefined })
                }
                disabled={rejectExpense.isPending}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
              <button
                type="button"
                onClick={() =>
                  approveExpense.mutate({ expenseId: selectedExpense.expenseId, notes: reviewNotes || undefined })
                }
                disabled={approveExpense.isPending}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                Approve Level
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal (for approved/rejected) */}
      {selectedExpense && !isPendingStatus(selectedExpense.status) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedExpense(null)} />
          <div className="relative z-10 w-[min(90vw,40rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold">Expense Details</h2>

            <div className="mb-4 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[color:var(--color-text-muted)]">Expense: </span>
                <span className="font-mono">EXP-{selectedExpense.expenseNumber}</span>
                {getStatusBadge(selectedExpense.status)}
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Description: </span>
                <span>{selectedExpense.description}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Amount: </span>
                <span className="font-semibold">{formatCurrency(selectedExpense.total)}</span>
              </div>
              <div>
                <span className="font-medium text-[color:var(--color-text-muted)]">Submitted By: </span>
                <span>{selectedExpense.requesterName || selectedExpense.requesterEmail}</span>
              </div>
              {selectedExpense.reviewedAt && (
                <div>
                  <span className="font-medium text-[color:var(--color-text-muted)]">Reviewed At: </span>
                  <span>{formatDateTime(selectedExpense.reviewedAt)}</span>
                </div>
              )}
              {selectedExpense.reviewNotes && (
                <div>
                  <span className="font-medium text-[color:var(--color-text-muted)]">Notes: </span>
                  <span>{selectedExpense.reviewNotes}</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedExpense(null)}
                className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
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
