import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'
import { formatDate } from '@/lib/dateFormat'

type AccountPick = { _id: string; accountNumber?: number; name?: string }

type SlaContract = {
  _id: string
  accountId: string
  name: string
  type: 'support' | 'subscription' | 'project' | 'other'
  status: 'active' | 'expired' | 'scheduled' | 'cancelled'
  startDate?: string | null
  endDate?: string | null
  autoRenew: boolean
  renewalDate?: string | null
  responseTargetMinutes?: number | null
  resolutionTargetMinutes?: number | null
  entitlements?: string
  notes?: string
}

export default function CRMSLAs() {
  const toast = useToast()
  const qc = useQueryClient()

  const [accountFilter, setAccountFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'expired' | 'scheduled' | 'cancelled'>(
    'all',
  )
  const [typeFilter, setTypeFilter] = React.useState<'all' | 'support' | 'subscription' | 'project' | 'other'>('all')

  const [editing, setEditing] = React.useState<SlaContract | null>(null)
  const [editName, setEditName] = React.useState('')
  const [editType, setEditType] = React.useState<SlaContract['type']>('support')
  const [editStatus, setEditStatus] = React.useState<SlaContract['status']>('active')
  const [editAccountId, setEditAccountId] = React.useState('')
  const [editStartDate, setEditStartDate] = React.useState('')
  const [editEndDate, setEditEndDate] = React.useState('')
  const [editAutoRenew, setEditAutoRenew] = React.useState(false)
  const [editRenewalDate, setEditRenewalDate] = React.useState('')
  const [editResponseMinutes, setEditResponseMinutes] = React.useState('')
  const [editResolutionMinutes, setEditResolutionMinutes] = React.useState('')
  const [editEntitlements, setEditEntitlements] = React.useState('')
  const [editNotes, setEditNotes] = React.useState('')

  const accountsQ = useQuery({
    queryKey: ['accounts-pick'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', { params: { limit: 1000, sort: 'name', dir: 'asc' } })
      return res.data as { data: { items: AccountPick[] } }
    },
  })
  const accounts = accountsQ.data?.data.items ?? []
  const accountLabelById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const a of accounts) {
      const label = a.accountNumber ? `#${a.accountNumber} – ${a.name}` : a.name ?? ''
      map.set(a._id, label)
    }
    return map
  }, [accounts])

  const slasQ = useQuery<{ data: { items: SlaContract[] } }>({
    queryKey: ['slas', accountFilter, statusFilter, typeFilter],
    queryFn: async () => {
      const params: any = {}
      if (accountFilter) params.accountId = accountFilter
      if (statusFilter !== 'all') params.status = statusFilter
      if (typeFilter !== 'all') params.type = typeFilter
      const res = await http.get('/api/crm/slas', { params })
      return res.data as { data: { items: SlaContract[] } }
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<SlaContract>) => {
      const res = await http.post('/api/crm/slas', payload)
      return res.data as { data: SlaContract }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slas'] })
      toast.showToast('SLA/contract created.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to create SLA.'
      toast.showToast(msg, 'error')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; data: Partial<SlaContract> }) => {
      const res = await http.put(`/api/crm/slas/${payload.id}`, payload.data)
      return res.data as { data: SlaContract }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slas'] })
      toast.showToast('SLA/contract updated.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to update SLA.'
      toast.showToast(msg, 'error')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/crm/slas/${id}`)
      return res.data as { data: { ok: boolean } }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slas'] })
      toast.showToast('SLA/contract deleted.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to delete SLA.'
      toast.showToast(msg, 'error')
    },
  })

  function openNew() {
    setEditing({
      _id: '',
      accountId: '',
      name: '',
      type: 'support',
      status: 'active',
      startDate: null,
      endDate: null,
      autoRenew: false,
      renewalDate: null,
      responseTargetMinutes: null,
      resolutionTargetMinutes: null,
      entitlements: '',
      notes: '',
    })
    setEditAccountId(accountFilter || '')
    setEditName('')
    setEditType('support')
    setEditStatus('active')
    setEditStartDate('')
    setEditEndDate('')
    setEditAutoRenew(false)
    setEditRenewalDate('')
    setEditResponseMinutes('')
    setEditResolutionMinutes('')
    setEditEntitlements('')
    setEditNotes('')
  }

  function openEdit(s: SlaContract) {
    setEditing(s)
    setEditAccountId(s.accountId)
    setEditName(s.name)
    setEditType(s.type)
    setEditStatus(s.status)
    setEditStartDate(s.startDate ? s.startDate.slice(0, 10) : '')
    setEditEndDate(s.endDate ? s.endDate.slice(0, 10) : '')
    setEditAutoRenew(Boolean(s.autoRenew))
    setEditRenewalDate(s.renewalDate ? s.renewalDate.slice(0, 10) : '')
    setEditResponseMinutes(
      s.responseTargetMinutes != null ? String(s.responseTargetMinutes) : '',
    )
    setEditResolutionMinutes(
      s.resolutionTargetMinutes != null ? String(s.resolutionTargetMinutes) : '',
    )
    setEditEntitlements(s.entitlements ?? '')
    setEditNotes(s.notes ?? '')
  }

  function closeModal() {
    setEditing(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editAccountId) {
      toast.showToast('Account is required.', 'error')
      return
    }
    if (!editName.trim()) {
      toast.showToast('Name is required.', 'error')
      return
    }
    const payload: Partial<SlaContract> = {
      accountId: editAccountId,
      name: editName.trim(),
      type: editType,
      status: editStatus,
      startDate: editStartDate || undefined,
      endDate: editEndDate || undefined,
      autoRenew: editAutoRenew,
      renewalDate: editRenewalDate || undefined,
      responseTargetMinutes: editResponseMinutes
        ? Number(editResponseMinutes)
        : undefined,
      resolutionTargetMinutes: editResolutionMinutes
        ? Number(editResolutionMinutes)
        : undefined,
      entitlements: editEntitlements.trim() || undefined,
      notes: editNotes.trim() || undefined,
    }
    try {
      if (!editing || !editing._id) {
        await createMutation.mutateAsync(payload)
      } else {
        await updateMutation.mutateAsync({ id: editing._id, data: payload })
      }
      closeModal()
    } catch {
      // handled in mutation
    }
  }

  const rows = slasQ.data?.data.items ?? []

  return (
    <div className="space-y-4">
      <CRMNav />
      <header className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contracts &amp; SLAs</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Track customer contracts, SLAs, and response/resolution targets tied to Accounts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
          >
            New SLA / contract
          </button>
        </div>
      </header>

      <section className="px-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="min-w-[200px] rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
          >
            <option value="">Accounts (all)</option>
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.accountNumber ? `#${a.accountNumber} – ` : ''}
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
          >
            <option value="all">Status (all)</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
          >
            <option value="all">Type (all)</option>
            <option value="support">Support</option>
            <option value="subscription">Subscription</option>
            <option value="project">Project</option>
            <option value="other">Other</option>
          </select>
        </div>
      </section>

      <section className="px-4">
        <div className="overflow-x-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[color:var(--color-muted)] text-xs text-[color:var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Start</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">End</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Response target</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Resolution target</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-6 text-center text-xs text-[color:var(--color-text-muted)]"
                  >
                    No contracts / SLAs match the current filters.
                  </td>
                </tr>
              )}
              {rows.map((s) => {
                const accountLabel = accountLabelById.get(s.accountId) ?? s.accountId
                return (
                  <tr key={s._id} className="border-t border-[color:var(--color-border-soft)]">
                    <td className="px-3 py-2 align-top text-xs">{accountLabel}</td>
                    <td className="px-3 py-2 align-top text-xs">{s.name}</td>
                    <td className="px-3 py-2 align-top text-xs capitalize">{s.type}</td>
                    <td className="px-3 py-2 align-top text-xs capitalize">{s.status}</td>
                    <td className="px-3 py-2 align-top text-xs whitespace-nowrap">
                      {s.startDate ? formatDate(s.startDate) : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-xs whitespace-nowrap">
                      {s.endDate ? formatDate(s.endDate) : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-xs whitespace-nowrap">
                      {s.responseTargetMinutes != null ? `${s.responseTargetMinutes} min` : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-xs whitespace-nowrap">
                      {s.resolutionTargetMinutes != null ? `${s.resolutionTargetMinutes} min` : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-right text-xs">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]"
                          onClick={() => openEdit(s)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-500/60 px-2 py-1 text-red-200 hover:bg-red-500/15"
                          onClick={async () => {
                            if (!window.confirm('Delete this SLA / contract?')) return
                            await deleteMutation.mutateAsync(s._id)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <div className="fixed inset-0 z-[2147483647]">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,48rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">
                  {editing._id ? 'Edit contract / SLA' : 'New contract / SLA'}
                </h2>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-full border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                >
                  Close
                </button>
              </div>
              <form onSubmit={handleSave} className="space-y-3 text-sm">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Account</label>
                    <select
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editAccountId}
                      onChange={(e) => setEditAccountId(e.target.value)}
                    >
                      <option value="">Select account…</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.accountNumber ? `#${a.accountNumber} – ` : ''}
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Name</label>
                    <input
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Type</label>
                    <select
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as any)}
                    >
                      <option value="support">Support</option>
                      <option value="subscription">Subscription</option>
                      <option value="project">Project</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Status</label>
                    <select
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as any)}
                    >
                      <option value="active">Active</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="expired">Expired</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Start date</label>
                    <input
                      type="date"
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">End date</label>
                    <input
                      type="date"
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Auto-renew</label>
                    <div className="flex items-center gap-2">
                      <input
                        id="sla-auto-renew"
                        type="checkbox"
                        checked={editAutoRenew}
                        onChange={(e) => setEditAutoRenew(e.target.checked)}
                      />
                      <label htmlFor="sla-auto-renew" className="text-xs">
                        Automatically renew on renewal date
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Renewal date</label>
                    <input
                      type="date"
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editRenewalDate}
                      onChange={(e) => setEditRenewalDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Response target (minutes)</label>
                    <input
                      type="number"
                      min={1}
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editResponseMinutes}
                      onChange={(e) => setEditResponseMinutes(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Resolution target (minutes)</label>
                    <input
                      type="number"
                      min={1}
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editResolutionMinutes}
                      onChange={(e) => setEditResolutionMinutes(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Entitlements</label>
                  <textarea
                    className="min-h-[60px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                    value={editEntitlements}
                    onChange={(e) => setEditEntitlements(e.target.value)}
                    placeholder="Included services, hours, channels, or product entitlements."
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Notes</label>
                  <textarea
                    className="min-h-[60px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Additional context, special terms, or internal comments."
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-[color:var(--color-text-muted)]">
                  <div>
                    Link SLAs to Accounts to guide support priorities and renewal conversations.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="rounded-xl border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-xl bg-[color:var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-soft)]"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


