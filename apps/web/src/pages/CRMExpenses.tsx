import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CRMNav } from '@/components/CRMNav'
import { CRMHelpButton } from '@/components/CRMHelpButton'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'
import { useAccessToken } from '@/components/Auth'

type ExpenseStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'paid' | 'void'

type ExpenseLine = {
  category: string
  accountNumber?: string
  amount: number
  description?: string
  projectId?: string
}

type ExpenseAttachment = {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  uploadedByUserId: string
  uploadedByEmail?: string
  uploadedAt: string
  url: string
}

type Expense = {
  _id: string
  expenseNumber: number
  date: string
  vendorId?: string
  vendorName?: string
  payee?: string
  description: string
  lines: ExpenseLine[]
  total: number
  paymentMethod?: string
  referenceNumber?: string
  status: ExpenseStatus
  submittedBy?: string
  submittedByName?: string
  submittedByEmail?: string
  submittedAt?: string
  approverUserId?: string
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
  voidedBy?: string
  voidedAt?: string
  voidReason?: string
  journalEntryId?: string
  attachments?: ExpenseAttachment[]
  notes?: string
  createdAt: string
  updatedAt: string
}

type ExpenseCategory = {
  category: string
  accountNumber: string
}

type Vendor = {
  id: string
  name: string
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
  pending_approval: 'Pending Approval',
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

export default function CRMExpenses() {
  const qc = useQueryClient()
  const toast = useToast()
  const token = useAccessToken()

  // Filters
  const [q, setQ] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<ExpenseStatus | 'all'>('all')
  const [dateRange] = React.useState<{ start: string; end: string }>({ start: '', end: '' })

  // Edit modal state
  const [editing, setEditing] = React.useState<Expense | null>(null)
  const [isCreating, setIsCreating] = React.useState(false)

  // Form state
  const [formDate, setFormDate] = React.useState('')
  const [formVendorId, setFormVendorId] = React.useState('')
  const [formPayee, setFormPayee] = React.useState('')
  const [formDescription, setFormDescription] = React.useState('')
  const [formPaymentMethod, setFormPaymentMethod] = React.useState('')
  const [formReferenceNumber, setFormReferenceNumber] = React.useState('')
  const [formNotes, setFormNotes] = React.useState('')
  const [formLines, setFormLines] = React.useState<ExpenseLine[]>([])

  // Check if user is admin
  const rolesQ = useQuery<{ roles: Array<{ name: string; permissions: string[] }>; isAdmin?: boolean }>({
    queryKey: ['user', 'roles'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me/roles')
      return res.data
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  })
  const isAdmin = !!rolesQ.data?.isAdmin || (rolesQ.data?.roles ?? []).some((r) => (r.permissions ?? []).includes('*'))

  // Fetch expenses
  const expensesQ = useQuery({
    queryKey: ['crm-expenses', q, statusFilter, dateRange],
    queryFn: async () => {
      const params: any = { limit: 200 }
      if (q.trim()) params.q = q.trim()
      if (statusFilter !== 'all') params.status = statusFilter
      if (dateRange.start) params.startDate = dateRange.start
      if (dateRange.end) params.endDate = dateRange.end
      const res = await http.get('/api/crm/expenses', { params })
      return res.data as { data: { items: Expense[]; total: number } }
    },
  })
  const expenses = expensesQ.data?.data.items ?? []

  // Fetch categories
  const categoriesQ = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const res = await http.get('/api/crm/expenses/categories')
      return res.data as { data: { categories: ExpenseCategory[] } }
    },
  })
  const categories = categoriesQ.data?.data.categories ?? []

  // Fetch vendors
  const vendorsQ = useQuery({
    queryKey: ['vendors-options'],
    queryFn: async () => {
      const res = await http.get('/api/crm/vendors/options', { params: { status: 'Active' } })
      return res.data as { data: { items: Vendor[] } }
    },
  })
  const vendors = vendorsQ.data?.data.items ?? []

  // Fetch summary
  const summaryQ = useQuery({
    queryKey: ['crm-expenses-summary'],
    queryFn: async () => {
      const res = await http.get('/api/crm/expenses/summary')
      return res.data as {
        data: {
          byStatus: Record<ExpenseStatus, { count: number; total: number }>
          byCategory: Array<{ category: string; total: number; count: number }>
        }
      }
    },
  })
  const summary = summaryQ.data?.data

  // Fetch approvers (managers who can approve expenses)
  const approversQ = useQuery({
    queryKey: ['expense-approvers'],
    queryFn: async () => {
      const res = await http.get('/api/crm/expenses/approvers')
      return res.data as { data: { approvers: Array<{ id: string; name: string; email: string }> } }
    },
  })
  const approvers = approversQ.data?.data.approvers ?? []

  // Submit dialog state
  const [submitDialogOpen, setSubmitDialogOpen] = React.useState(false)
  const [submitExpenseId, setSubmitExpenseId] = React.useState<string | null>(null)
  const [selectedApproverId, setSelectedApproverId] = React.useState<string>('')

  // Mutations
  const saveExpense = useMutation({
    mutationFn: async () => {
      // Ensure lines have proper number amounts
      const cleanedLines = formLines.map((line) => ({
        category: line.category,
        amount: Number(line.amount) || 0,
        description: line.description || undefined,
      }))
      const payload = {
        date: formDate,
        vendorId: formVendorId || undefined,
        vendorName: formVendorId ? vendors.find((v) => v.id === formVendorId)?.name : undefined,
        payee: formPayee || undefined,
        description: formDescription,
        lines: cleanedLines,
        paymentMethod: formPaymentMethod || undefined,
        referenceNumber: formReferenceNumber || undefined,
        notes: formNotes || undefined,
      }
      console.log('[expenses] Submitting payload:', JSON.stringify(payload, null, 2))
      if (editing?._id) {
        return http.patch(`/api/crm/expenses/${editing._id}`, payload)
      }
      return http.post('/api/crm/expenses', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-expenses'] })
      qc.invalidateQueries({ queryKey: ['crm-expenses-summary'] })
      closeModal()
      toast.showToast(editing?._id ? 'Expense updated.' : 'Expense created.', 'success')
    },
    onError: (err: any) => {
      console.error('[expenses] Save error:', err?.response?.data)
      const errorData = err?.response?.data?.error
      let errorMsg = 'Failed to save expense.'
      if (typeof errorData === 'string') {
        errorMsg = errorData
      } else if (errorData?.fieldErrors) {
        // Zod flatten() format
        const fields = Object.entries(errorData.fieldErrors)
          .map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`)
          .join('; ')
        errorMsg = fields || errorMsg
      } else if (errorData?.formErrors?.length) {
        errorMsg = errorData.formErrors.join(', ')
      }
      toast.showToast(errorMsg, 'error')
    },
  })

  const submitExpense = useMutation({
    mutationFn: async ({ id, approverUserId }: { id: string; approverUserId: string }) => 
      http.post(`/api/crm/expenses/${id}/submit`, { approverUserId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-expenses'] })
      qc.invalidateQueries({ queryKey: ['crm-expenses-summary'] })
      setSubmitDialogOpen(false)
      setSubmitExpenseId(null)
      setSelectedApproverId('')
      toast.showToast('Expense submitted for approval.', 'success')
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.error
      if (errorMsg === 'approver_required') {
        toast.showToast('Please select an approver.', 'error')
      } else {
        toast.showToast(errorMsg || 'Failed to submit expense.', 'error')
      }
    },
  })

  // Open submit dialog
  function openSubmitDialog(expenseId: string) {
    setSubmitExpenseId(expenseId)
    setSelectedApproverId(approvers.length > 0 ? approvers[0].id : '')
    setSubmitDialogOpen(true)
  }

  // Handle submit with approver
  function handleSubmitWithApprover() {
    if (!submitExpenseId || !selectedApproverId) {
      toast.showToast('Please select an approver.', 'error')
      return
    }
    submitExpense.mutate({ id: submitExpenseId, approverUserId: selectedApproverId })
  }

  const approveExpense = useMutation({
    mutationFn: async (id: string) => http.post(`/api/crm/expenses/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-expenses'] })
      qc.invalidateQueries({ queryKey: ['crm-expenses-summary'] })
      toast.showToast('Expense approved.', 'success')
    },
    onError: (err: any) => {
      toast.showToast(err?.response?.data?.error || 'Failed to approve expense.', 'error')
    },
  })

  const rejectExpense = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      http.post(`/api/crm/expenses/${id}/reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-expenses'] })
      qc.invalidateQueries({ queryKey: ['crm-expenses-summary'] })
      toast.showToast('Expense rejected.', 'success')
    },
    onError: (err: any) => {
      toast.showToast(err?.response?.data?.error || 'Failed to reject expense.', 'error')
    },
  })

  const payExpense = useMutation({
    mutationFn: async (id: string) => http.post(`/api/crm/expenses/${id}/pay`),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['crm-expenses'] })
      qc.invalidateQueries({ queryKey: ['crm-expenses-summary'] })
      const jeId = res?.data?.journalEntryId
      if (jeId) {
        toast.showToast('Expense paid and posted to Financial Intelligence.', 'success')
      } else {
        toast.showToast('Expense marked as paid. (No open accounting period for journal entry)', 'info')
      }
    },
    onError: (err: any) => {
      toast.showToast(err?.response?.data?.error || 'Failed to pay expense.', 'error')
    },
  })

  const voidExpense = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      http.post(`/api/crm/expenses/${id}/void`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-expenses'] })
      qc.invalidateQueries({ queryKey: ['crm-expenses-summary'] })
      toast.showToast('Expense voided.', 'success')
    },
    onError: (err: any) => {
      toast.showToast(err?.response?.data?.error || 'Failed to void expense.', 'error')
    },
  })

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => http.delete(`/api/crm/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-expenses'] })
      qc.invalidateQueries({ queryKey: ['crm-expenses-summary'] })
      toast.showToast('Expense deleted.', 'success')
    },
    onError: (err: any) => {
      toast.showToast(err?.response?.data?.error || 'Failed to delete expense.', 'error')
    },
  })

  // Attachment state
  const [viewingExpense, setViewingExpense] = React.useState<Expense | null>(null)
  const [uploadingAttachment, setUploadingAttachment] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Upload attachment mutation
  const uploadAttachment = useMutation({
    mutationFn: async ({ expenseId, file }: { expenseId: string; file: File }) => {
      const formData = new FormData()
      formData.append('file', file)
      return http.post(`/api/crm/expenses/${expenseId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-expenses'] })
      toast.showToast('Attachment uploaded.', 'success')
      setUploadingAttachment(false)
    },
    onError: (err: any) => {
      toast.showToast(err?.response?.data?.error || 'Failed to upload attachment.', 'error')
      setUploadingAttachment(false)
    },
  })

  // Delete attachment mutation
  const deleteAttachment = useMutation({
    mutationFn: async ({ expenseId, attachmentId }: { expenseId: string; attachmentId: string }) =>
      http.delete(`/api/crm/expenses/${expenseId}/attachments/${attachmentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-expenses'] })
      toast.showToast('Attachment deleted.', 'success')
    },
    onError: (err: any) => {
      toast.showToast(err?.response?.data?.error || 'Failed to delete attachment.', 'error')
    },
  })

  // Handle file upload
  function handleFileUpload(expenseId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setUploadingAttachment(true)
      uploadAttachment.mutate({ expenseId, file })
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Format file size
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function openCreateModal() {
    setIsCreating(true)
    setEditing(null)
    setFormDate(new Date().toISOString().split('T')[0])
    setFormVendorId('')
    setFormPayee('')
    setFormDescription('')
    setFormPaymentMethod('')
    setFormReferenceNumber('')
    setFormNotes('')
    setFormLines([{ category: categories[0]?.category || 'Other Expense', amount: 0, description: '' }])
  }

  function openEditModal(expense: Expense) {
    setIsCreating(true)
    setEditing(expense)
    setFormDate(expense.date.split('T')[0])
    setFormVendorId(expense.vendorId || '')
    setFormPayee(expense.payee || '')
    setFormDescription(expense.description)
    setFormPaymentMethod(expense.paymentMethod || '')
    setFormReferenceNumber(expense.referenceNumber || '')
    setFormNotes(expense.notes || '')
    setFormLines(expense.lines.length > 0 ? expense.lines : [{ category: 'Other Expense', amount: 0, description: '' }])
  }

  function closeModal() {
    setIsCreating(false)
    setEditing(null)
  }

  function addLine() {
    setFormLines([...formLines, { category: categories[0]?.category || 'Other Expense', amount: 0, description: '' }])
  }

  function removeLine(index: number) {
    setFormLines(formLines.filter((_, i) => i !== index))
  }

  function updateLine(index: number, field: keyof ExpenseLine, value: string | number) {
    const updated = [...formLines]
    if (field === 'amount') {
      updated[index] = { ...updated[index], [field]: parseFloat(String(value)) || 0 }
    } else {
      updated[index] = { ...updated[index], [field]: value }
    }
    setFormLines(updated)
  }

  const formTotal = formLines.reduce((sum, line) => sum + (line.amount || 0), 0)

  return (
    <div className="space-y-6">
      <CRMNav />

      <header className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Expenses</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Track and manage business expenses with approval workflow. Paid expenses auto-post to Financial Intelligence.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <CRMHelpButton tag="crm:expenses" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search expenses..."
            className="w-36 rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
          <button
            type="button"
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[color:var(--color-primary-700)]"
            onClick={openCreateModal}
          >
            New Expense
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
            <div className="text-xs text-[color:var(--color-text-muted)]">Pending Approval</div>
            <div className="mt-1 text-2xl font-semibold text-amber-400">
              {formatCurrency(summary.byStatus.pending_approval?.total || 0)}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              {summary.byStatus.pending_approval?.count || 0} expenses
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
            <div className="text-xs text-[color:var(--color-text-muted)]">Approved (Unpaid)</div>
            <div className="mt-1 text-2xl font-semibold text-blue-400">
              {formatCurrency(summary.byStatus.approved?.total || 0)}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              {summary.byStatus.approved?.count || 0} expenses
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
            <div className="text-xs text-[color:var(--color-text-muted)]">Paid (YTD)</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-400">
              {formatCurrency(summary.byStatus.paid?.total || 0)}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              {summary.byStatus.paid?.count || 0} expenses
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
            <div className="text-xs text-[color:var(--color-text-muted)]">Drafts</div>
            <div className="mt-1 text-2xl font-semibold text-gray-400">
              {formatCurrency(summary.byStatus.draft?.total || 0)}
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              {summary.byStatus.draft?.count || 0} expenses
            </div>
          </div>
        </div>
      )}

      {/* Expenses Table */}
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
        <div className="mb-3 flex items-center justify-between gap-2 text-xs text-[color:var(--color-text-muted)]">
          <span>{expenses.length} expenses</span>
          {expensesQ.isFetching && <span>Loading…</span>}
        </div>

        {expenses.length === 0 ? (
          <div className="py-8 text-center text-xs text-[color:var(--color-text-muted)]">
            No expenses found. Click "New Expense" to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-1 text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-[color:var(--color-text-muted)]">
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">Date</th>
                  <th className="px-2 py-1 text-left">Payee</th>
                  <th className="px-2 py-1 text-left">Description</th>
                  <th className="px-2 py-1 text-right">Amount</th>
                  <th className="px-2 py-1 text-center">Status</th>
                  <th className="px-2 py-1 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr
                    key={exp._id}
                    className="rounded-lg bg-[color:var(--color-bg)] hover:bg-[color:var(--color-muted)]"
                  >
                    <td className="px-2 py-2 font-mono text-[color:var(--color-text-muted)]">
                      EXP-{exp.expenseNumber}
                    </td>
                    <td className="px-2 py-2">{formatDate(exp.date)}</td>
                    <td className="px-2 py-2">{exp.vendorName || exp.payee || '—'}</td>
                    <td className="px-2 py-2 max-w-[200px] truncate">{exp.description}</td>
                    <td className="px-2 py-2 text-right font-mono">{formatCurrency(exp.total)}</td>
                    <td className="px-2 py-2 text-center">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[10px] ${STATUS_COLORS[exp.status]}`}
                      >
                        {STATUS_LABELS[exp.status]}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {exp.status === 'draft' && (
                          <>
                            <button
                              onClick={() => openEditModal(exp)}
                              className="rounded px-2 py-1 hover:bg-[color:var(--color-muted)]"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => openSubmitDialog(exp._id)}
                              className="rounded bg-amber-500/20 px-2 py-1 text-amber-400 hover:bg-amber-500/30"
                            >
                              Submit
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Delete this expense?')) deleteExpense.mutate(exp._id)
                              }}
                              className="rounded px-2 py-1 text-red-400 hover:bg-red-500/20"
                            >
                              Delete
                            </button>
                          </>
                        )}
                        {exp.status === 'pending_approval' && isAdmin && (
                          <>
                            <button
                              onClick={() => approveExpense.mutate(exp._id)}
                              className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-400 hover:bg-emerald-500/30"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => {
                                const reason = prompt('Rejection reason:')
                                if (reason !== null) rejectExpense.mutate({ id: exp._id, reason })
                              }}
                              className="rounded px-2 py-1 text-red-400 hover:bg-red-500/20"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {exp.status === 'approved' && isAdmin && (
                          <button
                            onClick={() => payExpense.mutate(exp._id)}
                            className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-400 hover:bg-emerald-500/30"
                          >
                            Mark Paid
                          </button>
                        )}
                        {exp.status === 'rejected' && (
                          <button
                            onClick={() => openEditModal(exp)}
                            className="rounded px-2 py-1 hover:bg-[color:var(--color-muted)]"
                          >
                            Edit & Resubmit
                          </button>
                        )}
                        {exp.status === 'paid' && exp.journalEntryId && (
                          <span className="text-[10px] text-emerald-400">Posted to GL</span>
                        )}
                        <button
                          onClick={() => setViewingExpense(exp)}
                          className="rounded px-2 py-1 text-blue-400 hover:bg-blue-500/20"
                          title="View details and attachments"
                        >
                          View
                        </button>
                        {!['paid', 'void'].includes(exp.status) && isAdmin && (
                          <button
                            onClick={() => {
                              const reason = prompt('Void reason:')
                              if (reason !== null) voidExpense.mutate({ id: exp._id, reason })
                            }}
                            className="rounded px-2 py-1 text-gray-400 hover:bg-gray-500/20"
                            title="Void expense"
                          >
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create/Edit Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div className="relative z-10 max-h-[90vh] w-[min(90vw,40rem)] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">
              {editing?._id ? `Edit Expense #${editing.expenseNumber}` : 'New Expense'}
            </h2>

            <div className="space-y-4">
              {/* Date and Payee */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium">Date *</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Vendor</label>
                  <select
                    value={formVendorId}
                    onChange={(e) => setFormVendorId(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                  >
                    <option value="">— Select vendor or enter payee —</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!formVendorId && (
                <div>
                  <label className="mb-1 block text-xs font-medium">Payee (if not a vendor)</label>
                  <input
                    type="text"
                    value={formPayee}
                    onChange={(e) => setFormPayee(e.target.value)}
                    placeholder="e.g., Amazon, Office Depot"
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium">Description *</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Brief description of the expense"
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                />
              </div>

              {/* Expense Lines */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium">Line Items *</label>
                  <button
                    type="button"
                    onClick={addLine}
                    className="rounded bg-[color:var(--color-primary-600)] px-2 py-1 text-xs text-white hover:bg-[color:var(--color-primary-700)]"
                  >
                    + Add Line
                  </button>
                </div>
                <div className="space-y-2">
                  {formLines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded-lg bg-[color:var(--color-bg)] p-2">
                      <select
                        value={line.category}
                        onChange={(e) => updateLine(idx, 'category', e.target.value)}
                        className="flex-1 rounded border border-[color:var(--color-border)] bg-[#1a1a2e] px-2 py-1 text-xs text-white"
                      >
                        {categories.map((c) => (
                          <option key={c.category} value={c.category} className="bg-[#1a1a2e] text-white">
                            {c.category}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={line.amount || ''}
                        onChange={(e) => updateLine(idx, 'amount', e.target.value)}
                        placeholder="Amount"
                        step="0.01"
                        min="0"
                        className="w-24 rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-xs text-right"
                      />
                      <input
                        type="text"
                        value={line.description || ''}
                        onChange={(e) => updateLine(idx, 'description', e.target.value)}
                        placeholder="Notes (optional)"
                        className="flex-1 rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-xs"
                      />
                      {formLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="text-red-400 hover:text-red-300"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-right text-sm font-semibold">
                  Total: {formatCurrency(formTotal)}
                </div>
              </div>

              {/* Payment Info */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium">Payment Method</label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                  >
                    <option value="">— Select —</option>
                    <option value="Cash">Cash</option>
                    <option value="Check">Check</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Debit Card">Debit Card</option>
                    <option value="ACH">ACH Transfer</option>
                    <option value="Wire">Wire Transfer</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Reference # (check, transaction ID)</label>
                  <input
                    type="text"
                    value={formReferenceNumber}
                    onChange={(e) => setFormReferenceNumber(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">Notes</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder="Additional notes..."
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveExpense.mutate()}
                disabled={!formDate || !formDescription || formLines.length === 0 || formTotal <= 0 || saveExpense.isPending}
                className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
              >
                {saveExpense.isPending ? 'Saving...' : editing?._id ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit for Approval Dialog */}
      {submitDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSubmitDialogOpen(false)} />
          <div className="relative z-10 w-[min(90vw,24rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">Submit for Approval</h2>
            <p className="mb-4 text-sm text-[color:var(--color-text-muted)]">
              Select a manager to review and approve this expense.
            </p>
            
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium">Approver *</label>
              <select
                value={selectedApproverId}
                onChange={(e) => setSelectedApproverId(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
              >
                <option value="">— Select approver —</option>
                {approvers.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.email})
                  </option>
                ))}
              </select>
              {approvers.length === 0 && (
                <p className="mt-1 text-xs text-amber-400">
                  No approvers available. Contact your administrator.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSubmitDialogOpen(false)
                  setSubmitExpenseId(null)
                  setSelectedApproverId('')
                }}
                className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitWithApprover}
                disabled={!selectedApproverId || submitExpense.isPending}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {submitExpense.isPending ? 'Submitting...' : 'Submit for Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expense Detail Modal with Attachments */}
      {viewingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setViewingExpense(null)} />
          <div className="relative z-10 max-h-[90vh] w-[min(90vw,48rem)] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Expense #{viewingExpense.expenseNumber}
              </h2>
              <span
                className={`inline-block rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[viewingExpense.status]}`}
              >
                {STATUS_LABELS[viewingExpense.status]}
              </span>
            </div>

            {/* Expense Details */}
            <div className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <span className="text-[color:var(--color-text-muted)]">Date:</span>{' '}
                <span>{formatDate(viewingExpense.date)}</span>
              </div>
              <div>
                <span className="text-[color:var(--color-text-muted)]">Amount:</span>{' '}
                <span className="font-semibold">{formatCurrency(viewingExpense.total)}</span>
              </div>
              <div>
                <span className="text-[color:var(--color-text-muted)]">Payee:</span>{' '}
                <span>{viewingExpense.vendorName || viewingExpense.payee || '—'}</span>
              </div>
              <div>
                <span className="text-[color:var(--color-text-muted)]">Payment Method:</span>{' '}
                <span>{viewingExpense.paymentMethod || '—'}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-[color:var(--color-text-muted)]">Description:</span>{' '}
                <span>{viewingExpense.description}</span>
              </div>
              {viewingExpense.approverName && (
                <div>
                  <span className="text-[color:var(--color-text-muted)]">Approver:</span>{' '}
                  <span>{viewingExpense.approverName}</span>
                </div>
              )}
              {viewingExpense.submittedByName && (
                <div>
                  <span className="text-[color:var(--color-text-muted)]">Submitted By:</span>{' '}
                  <span>{viewingExpense.submittedByName}</span>
                </div>
              )}
              {viewingExpense.rejectionReason && (
                <div className="sm:col-span-2">
                  <span className="text-red-400">Rejection Reason:</span>{' '}
                  <span>{viewingExpense.rejectionReason}</span>
                </div>
              )}
            </div>

            {/* Line Items */}
            {viewingExpense.lines.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-2 text-sm font-medium">Line Items</h3>
                <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
                  <div className="space-y-2 text-xs">
                    {viewingExpense.lines.map((line, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span>
                          {line.category}
                          {line.description ? ` - ${line.description}` : ''}
                        </span>
                        <span className="font-mono">{formatCurrency(line.amount)}</span>
                      </div>
                    ))}
                    <div className="border-t border-[color:var(--color-border)] pt-2 mt-2 flex items-center justify-between font-semibold">
                      <span>Total</span>
                      <span className="font-mono">{formatCurrency(viewingExpense.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Attachments Section */}
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium">Receipts & Attachments</h3>
                {/* Upload button - only for draft, rejected, or if admin */}
                {(viewingExpense.status === 'draft' || viewingExpense.status === 'rejected' || isAdmin) && (
                  <label className="cursor-pointer rounded-lg bg-[color:var(--color-primary-600)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-700)]">
                    {uploadingAttachment ? 'Uploading...' : 'Upload Receipt'}
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                      onChange={(e) => handleFileUpload(viewingExpense._id, e)}
                      disabled={uploadingAttachment}
                    />
                  </label>
                )}
              </div>

              {(!viewingExpense.attachments || viewingExpense.attachments.length === 0) ? (
                <div className="rounded-lg border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4 text-center text-xs text-[color:var(--color-text-muted)]">
                  No attachments yet. Upload receipts or supporting documents.
                </div>
              ) : (
                <div className="space-y-2">
                  {viewingExpense.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-[color:var(--color-muted)] text-xs">
                          {att.fileType.includes('pdf') ? '📄' : '🖼️'}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{att.fileName}</div>
                          <div className="text-xs text-[color:var(--color-text-muted)]">
                            {formatFileSize(att.fileSize)} • Uploaded {formatDate(att.uploadedAt)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-500/20"
                        >
                          Download
                        </a>
                        {(viewingExpense.status !== 'paid' || isAdmin) && (
                          <button
                            onClick={() => {
                              if (confirm('Delete this attachment?')) {
                                deleteAttachment.mutate({
                                  expenseId: viewingExpense._id,
                                  attachmentId: att.id,
                                })
                              }
                            }}
                            className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/20"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            {viewingExpense.notes && (
              <div className="mb-6">
                <h3 className="mb-2 text-sm font-medium">Notes</h3>
                <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 text-sm">
                  {viewingExpense.notes}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setViewingExpense(null)}
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
