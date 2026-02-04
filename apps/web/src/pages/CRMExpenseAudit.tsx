import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'
import { useAccessToken } from '@/components/Auth'

type ExpenseStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'paid' | 'void'

type ExpenseAuditItem = {
  _id: string
  expenseNumber: number
  date: string
  vendorName?: string
  payee?: string
  description: string
  total: number
  status: ExpenseStatus
  submittedBy?: string
  submittedByName?: string
  submittedByEmail?: string
  submittedAt?: string
  approverName?: string
  approverEmail?: string
  approvedBy?: string
  approvedByName?: string
  approvedAt?: string
  rejectedBy?: string
  rejectedByName?: string
  rejectedAt?: string
  rejectionReason?: string
  paidBy?: string
  paidAt?: string
  journalEntryId?: string
  createdBy: string
  createdByName?: string
  createdByEmail?: string
  createdAt: string
}

type UserOption = {
  id: string
  name: string
  email: string
}

const STATUS_COLORS: Record<ExpenseStatus, string> = {
  draft: 'bg-gray-500/10 text-gray-400 border-gray-500/50',
  pending_approval: 'bg-amber-500/10 text-amber-400 border-amber-500/50',
  approved: 'bg-blue-500/10 text-blue-400 border-blue-500/50',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/50',
  paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/50',
  void: 'bg-gray-500/10 text-gray-500 border-gray-500/50',
}

const STATUS_LABELS: Record<ExpenseStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  paid: 'Paid',
  void: 'Void',
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function CRMExpenseAudit() {
  const token = useAccessToken()

  // Filter state
  const [searchTerm, setSearchTerm] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<ExpenseStatus | 'all'>('all')
  const [userFilter, setUserFilter] = React.useState<string>('')
  const [minAmount, setMinAmount] = React.useState<string>('')
  const [maxAmount, setMaxAmount] = React.useState<string>('')
  const [startDate, setStartDate] = React.useState<string>('')
  const [endDate, setEndDate] = React.useState<string>('')

  // Pagination state
  const [page, setPage] = React.useState(1)
  const pageSize = 25

  // Fetch all expenses for audit
  const expensesQ = useQuery({
    queryKey: ['expense-audit', statusFilter, userFilter, minAmount, maxAmount, startDate, endDate, searchTerm, page],
    queryFn: async () => {
      const params: Record<string, string | number> = { 
        limit: pageSize, 
        skip: (page - 1) * pageSize,
      }
      if (statusFilter !== 'all') params.status = statusFilter
      if (userFilter) params.createdBy = userFilter
      if (searchTerm.trim()) params.q = searchTerm.trim()
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      // Note: min/max amount filtering would need backend support
      
      const res = await http.get('/api/crm/expenses', { params })
      return res.data as { data: { items: ExpenseAuditItem[]; total: number } }
    },
    enabled: !!token,
  })

  const expenses = expensesQ.data?.data.items ?? []
  const totalExpenses = expensesQ.data?.data.total ?? 0
  const totalPages = Math.ceil(totalExpenses / pageSize)

  // Fetch users for filter dropdown (employees only, not customers)
  const usersQ = useQuery({
    queryKey: ['audit-users'],
    queryFn: async () => {
      const res = await http.get('/api/admin/users', { params: { limit: 500 } })
      return res.data as { data: { items: Array<{ _id: string; name?: string; email: string }> } }
    },
    enabled: !!token,
  })

  const users: UserOption[] = (usersQ.data?.data.items ?? []).map((u) => ({
    id: u._id,
    name: u.name || u.email,
    email: u.email,
  }))

  // Calculate summary stats for current filter
  const filteredTotal = expenses.reduce((sum, e) => sum + e.total, 0)
  const paidTotal = expenses.filter(e => e.status === 'paid').reduce((sum, e) => sum + e.total, 0)
  const pendingTotal = expenses.filter(e => e.status === 'pending_approval').reduce((sum, e) => sum + e.total, 0)
  const approvedTotal = expenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + e.total, 0)

  // Filter by amount (client-side since backend might not support it)
  const filteredExpenses = expenses.filter((e) => {
    if (minAmount && e.total < parseFloat(minAmount)) return false
    if (maxAmount && e.total > parseFloat(maxAmount)) return false
    return true
  })

  function clearFilters() {
    setSearchTerm('')
    setStatusFilter('all')
    setUserFilter('')
    setMinAmount('')
    setMaxAmount('')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <CRMNav />

      <header className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Expense Audit</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Track and audit all expenses across the organization. Search by user, amount, date, or status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/apps/crm/expenses"
            className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
          >
            Back to Expenses
          </Link>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="text-xs text-[color:var(--color-text-muted)]">Total Records</div>
          <div className="mt-1 text-2xl font-semibold">{totalExpenses}</div>
          <div className="text-xs text-[color:var(--color-text-muted)]">
            Showing {filteredExpenses.length} on this page
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="text-xs text-[color:var(--color-text-muted)]">Page Total</div>
          <div className="mt-1 text-2xl font-semibold">{formatCurrency(filteredTotal)}</div>
          <div className="text-xs text-[color:var(--color-text-muted)]">Current page expenses</div>
        </div>
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="text-xs text-[color:var(--color-text-muted)]">Paid (Page)</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-400">{formatCurrency(paidTotal)}</div>
          <div className="text-xs text-[color:var(--color-text-muted)]">Posted to GL</div>
        </div>
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="text-xs text-[color:var(--color-text-muted)]">Pending Review</div>
          <div className="mt-1 text-2xl font-semibold text-amber-400">{formatCurrency(pendingTotal + approvedTotal)}</div>
          <div className="text-xs text-[color:var(--color-text-muted)]">Pending + Approved (unpaid)</div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Filters</h2>
          <button
            onClick={clearFilters}
            className="text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"
          >
            Clear All
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="mb-1 block text-[10px] text-[color:var(--color-text-muted)]">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder="Description, payee..."
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-[color:var(--color-text-muted)]">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="paid">Paid</option>
              <option value="void">Void</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-[color:var(--color-text-muted)]">User</label>
            <select
              value={userFilter}
              onChange={(e) => { setUserFilter(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
            >
              <option value="">All Users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-[color:var(--color-text-muted)]">Min Amount</label>
            <input
              type="number"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="0"
              min="0"
              step="0.01"
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-[color:var(--color-text-muted)]">Max Amount</label>
            <input
              type="number"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="No limit"
              min="0"
              step="0.01"
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-[color:var(--color-text-muted)]">Date Range</label>
            <div className="flex gap-1">
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-1 py-1.5 text-[10px]"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-1 py-1.5 text-[10px]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Expense #</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Payee</th>
                <th className="px-3 py-2">Created By</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Approver</th>
                <th className="px-3 py-2">Approved/Rejected</th>
                <th className="px-3 py-2">GL Posted</th>
              </tr>
            </thead>
            <tbody>
              {expensesQ.isLoading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-[color:var(--color-text-muted)]">
                    Loading expenses...
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-[color:var(--color-text-muted)]">
                    No expenses found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr
                    key={exp._id}
                    className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]"
                  >
                    <td className="px-3 py-2 font-mono">EXP-{exp.expenseNumber}</td>
                    <td className="px-3 py-2">{formatDate(exp.date)}</td>
                    <td className="px-3 py-2 max-w-[150px] truncate" title={exp.description}>
                      {exp.description}
                    </td>
                    <td className="px-3 py-2">{exp.vendorName || exp.payee || '—'}</td>
                    <td className="px-3 py-2">
                      <div>{exp.createdByName || exp.createdByEmail || '—'}</div>
                      {exp.createdByEmail && exp.createdByName && (
                        <div className="text-[10px] text-[color:var(--color-text-muted)]">{exp.createdByEmail}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium">
                      {formatCurrency(exp.total)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] ${STATUS_COLORS[exp.status]}`}>
                        {STATUS_LABELS[exp.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {exp.approverName || exp.approverEmail || '—'}
                    </td>
                    <td className="px-3 py-2">
                      {exp.approvedAt ? (
                        <div>
                          <div className="text-emerald-400">{exp.approvedByName || 'Approved'}</div>
                          <div className="text-[10px] text-[color:var(--color-text-muted)]">{formatDateTime(exp.approvedAt)}</div>
                        </div>
                      ) : exp.rejectedAt ? (
                        <div>
                          <div className="text-red-400">{exp.rejectedByName || 'Rejected'}</div>
                          <div className="text-[10px] text-[color:var(--color-text-muted)]">{formatDateTime(exp.rejectedAt)}</div>
                          {exp.rejectionReason && (
                            <div className="text-[10px] text-red-400" title={exp.rejectionReason}>
                              {exp.rejectionReason.substring(0, 20)}...
                            </div>
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {exp.journalEntryId ? (
                        <span className="text-emerald-400">Yes</span>
                      ) : exp.status === 'paid' ? (
                        <span className="text-amber-400">No Period</span>
                      ) : (
                        <span className="text-[color:var(--color-text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[color:var(--color-border)] px-4 py-3">
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Page {page} of {totalPages} ({totalExpenses} total records)
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="rounded border border-[color:var(--color-border)] px-2 py-1 text-xs disabled:opacity-50"
              >
                First
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded border border-[color:var(--color-border)] px-2 py-1 text-xs disabled:opacity-50"
              >
                Prev
              </button>
              <span className="px-2 text-xs">{page}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded border border-[color:var(--color-border)] px-2 py-1 text-xs disabled:opacity-50"
              >
                Next
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="rounded border border-[color:var(--color-border)] px-2 py-1 text-xs disabled:opacity-50"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
