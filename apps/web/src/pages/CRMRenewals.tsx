import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { CRMHelpButton } from '@/components/CRMHelpButton'
import { formatDate } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'
import { HelpCircle } from 'lucide-react'
import { AuditTrail, AuditEntry } from '@/components/AuditTrail'

type Renewal = {
  _id: string
  accountId?: string | null
  accountNumber?: number | null
  accountName?: string | null
  productId?: string | null
  productName?: string | null
  productSku?: string | null
  name: string
  status: 'Active' | 'Pending Renewal' | 'Churned' | 'Cancelled' | 'On Hold'
  termStart?: string | null
  termEnd?: string | null
  renewalDate?: string | null
  mrr?: number | null
  arr?: number | null
  healthScore?: number | null
  churnRisk?: 'Low' | 'Medium' | 'High' | null
  upsellPotential?: 'Low' | 'Medium' | 'High' | null
  ownerName?: string | null
  ownerEmail?: string | null
  notes?: string | null
}

type ColumnDef = { key: string; label: string; visible: boolean }

const defaultCols: ColumnDef[] = [
  { key: 'account', label: 'Account', visible: true },
  { key: 'name', label: 'Renewal / Subscription', visible: true },
  { key: 'status', label: 'Status', visible: true },
  { key: 'renewalDate', label: 'Renewal date', visible: true },
  { key: 'mrr', label: 'MRR', visible: true },
  { key: 'arr', label: 'ARR', visible: true },
  { key: 'healthScore', label: 'Health', visible: true },
  { key: 'churnRisk', label: 'Churn risk', visible: true },
  { key: 'upsellPotential', label: 'Upsell', visible: true },
  { key: 'owner', label: 'Owner', visible: true },
]

type AccountPick = { _id: string; accountNumber?: number; name?: string }
type ProductPick = {
  _id: string
  sku?: string
  name: string
  type?: string
  basePrice?: number
  currency?: string
}

export default function CRMRenewals() {
  const qc = useQueryClient()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [q, setQ] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('')
  const [accountFilterId, setAccountFilterId] = React.useState<string>('')
  const [sort, setSort] = React.useState<'renewalDate' | 'updatedAt' | 'accountName' | 'mrr' | 'arr'>(
    'renewalDate',
  )
  const [dir, setDir] = React.useState<'asc' | 'desc'>('asc')

  const [cols, setCols] = React.useState<ColumnDef[]>(defaultCols)
  const [showColsMenu, setShowColsMenu] = React.useState(false)
  const [draggedCol, setDraggedCol] = React.useState<string | null>(null)

  const [editing, setEditing] = React.useState<Renewal | null>(null)

  // Audit trail state
  const [showHistory, setShowHistory] = React.useState(false)
  React.useEffect(() => { setShowHistory(false) }, [editing])

  const historyQ = useQuery({
    queryKey: ['renewal-history', editing?._id],
    enabled: !!editing?._id && showHistory,
    queryFn: async () => {
      if (!editing?._id) return { data: { history: [] } }
      const res = await http.get(`/api/crm/renewals/${editing._id}/history`)
      return res.data as { data: { history: Array<{ _id: string; createdAt: string; eventType: string; description: string; userName?: string; userEmail?: string; oldValue?: any; newValue?: any; metadata?: Record<string, any> }> } }
    },
  })

  React.useEffect(() => {
    const q0 = searchParams.get('q') || ''
    const status0 = searchParams.get('status') || ''
    const account0 = searchParams.get('accountId') || ''
    const sort0 = (searchParams.get('sort') as any) || 'renewalDate'
    const dir0 = (searchParams.get('dir') as any) || 'asc'
    setQ(q0)
    setStatusFilter(status0)
    setAccountFilterId(account0)
    setSort(sort0)
    setDir(dir0)
  }, [searchParams])

  React.useEffect(() => {
    const params: Record<string, string> = {}
    if (q) params.q = q
    if (statusFilter) params.status = statusFilter
    if (accountFilterId) params.accountId = accountFilterId
    if (sort !== 'renewalDate') params.sort = sort
    if (dir !== 'asc') params.dir = dir
    setSearchParams(params, { replace: true })
  }, [q, statusFilter, accountFilterId, sort, dir, setSearchParams])

  const { data, isFetching } = useQuery({
    queryKey: ['renewals', q, statusFilter, accountFilterId, sort, dir],
    queryFn: async () => {
      const res = await http.get('/api/crm/renewals', {
        params: { q, status: statusFilter, accountId: accountFilterId || undefined, sort, dir },
      })
      return res.data as { data: { items: Renewal[] } }
    },
  })
  const items = data?.data.items ?? []

  const accountsQ = useQuery({
    queryKey: ['accounts-pick'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', {
        params: { limit: 1000, sort: 'name', dir: 'asc' },
      })
      return res.data as { data: { items: AccountPick[] } }
    },
  })
  const accounts = accountsQ.data?.data.items ?? []
  const acctById = React.useMemo(
    () => new Map(accounts.map((a) => [a._id, a])),
    [accounts],
  )

  const productsQ = useQuery({
    queryKey: ['products-for-renewals'],
    queryFn: async () => {
      const res = await http.get('/api/crm/products', {
        params: { sort: 'name', dir: 'asc', limit: 1000 },
      })
      return res.data as { data: { items: ProductPick[] } }
    },
  })
  const products = React.useMemo(
    () =>
      (productsQ.data?.data.items ?? []).filter(
        (p) => p.type !== 'bundle' && p.name,
      ),
    [productsQ.data?.data.items],
  )
  const [selectedProductId, setSelectedProductId] = React.useState<string>('')
  const selectedProduct = React.useMemo(
    () => products.find((p) => p._id === selectedProductId),
    [products, selectedProductId],
  )

  type RenewalMetrics = {
    totalActiveMRR: number
    totalActiveARR: number
    mrrNext30: number
    mrrNext90: number
    countsByStatus: Record<string, number>
    countsByRisk: Record<string, number>
  }

  type AccountRenewalMetrics = {
    totalMRR: number
    totalARR: number
    activeCount: number
    churnedCount: number
    pendingCount: number
    avgHealthScore: number | null
    countsByRisk: Record<string, number>
    mrrAtRisk: number
    mrrChurned: number
    nextRenewalDate: string | null
    renewalCount: number
  }

  const { data: metricsData } = useQuery({
    queryKey: ['renewals-metrics'],
    queryFn: async () => {
      const res = await http.get('/api/crm/renewals/metrics/summary')
      return res.data as { data: RenewalMetrics }
    },
  })

  const { data: accountMetricsData } = useQuery({
    queryKey: ['renewals-account-metrics', accountFilterId],
    enabled: !!accountFilterId,
    queryFn: async () => {
      try {
        const res = await http.get('/api/crm/renewals/metrics/account', {
          params: { accountId: accountFilterId },
        })
        return res.data as { data: AccountRenewalMetrics }
      } catch (err: any) {
        // If the backend does not yet have this endpoint, fail soft and hide account metrics
        const status = err?.response?.status
        if (status === 404) {
          return { data: null as any }
        }
        throw err
      }
    },
  })

  // High-value alerts are disabled for now in production until the API is deployed everywhere.

  const create = useMutation({
    mutationFn: async (payload: any) => {
      const res = await http.post('/api/crm/renewals', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renewals'] })
      toast.showToast('BOAZ says: Renewal saved.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to save renewal'
      toast.showToast(msg, 'error')
    },
  })

  const update = useMutation({
    mutationFn: async (payload: any) => {
      const { _id, ...rest } = payload
      const res = await http.put(`/api/crm/renewals/${_id}`, rest)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renewals'] })
      toast.showToast('BOAZ says: Renewal updated.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to update renewal'
      toast.showToast(msg, 'error')
    },
  })

  function handleDragStart(key: string) {
    setDraggedCol(key)
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }
  function handleDrop(targetKey: string) {
    if (!draggedCol || draggedCol === targetKey) return
    const draggedIndex = cols.findIndex((c) => c.key === draggedCol)
    const targetIndex = cols.findIndex((c) => c.key === targetKey)
    if (draggedIndex === -1 || targetIndex === -1) return
    const next = [...cols]
    const [removed] = next.splice(draggedIndex, 1)
    next.splice(targetIndex, 0, removed)
    setCols(next)
    setDraggedCol(null)
  }

  function getColValue(r: Renewal, key: string) {
    if (key === 'account') {
      if (r.accountId) {
        const a = acctById.get(r.accountId)
        if (a) return `${a.accountNumber ?? '-'} - ${a.name ?? 'Account'}`
      }
      if (r.accountNumber && r.accountName) {
        return `${r.accountNumber} - ${r.accountName}`
      }
      return r.accountName ?? '-'
    }
    if (key === 'name') return r.name
    if (key === 'status') return r.status
    if (key === 'renewalDate') return r.renewalDate ? formatDate(r.renewalDate) : '-'
    if (key === 'mrr')
      return typeof r.mrr === 'number' ? `$${r.mrr.toLocaleString()}` : '-'
    if (key === 'arr')
      return typeof r.arr === 'number' ? `$${r.arr.toLocaleString()}` : '-'
    if (key === 'healthScore') {
      if (r.healthScore == null) return '-'
      return `${r.healthScore.toFixed(1)}/10`
    }
    if (key === 'churnRisk') return r.churnRisk ?? '-'
    if (key === 'upsellPotential') return r.upsellPotential ?? '-'
    if (key === 'owner')
      return r.ownerName || r.ownerEmail || '-'
    return ''
  }

  const [page, setPage] = React.useState(0)
  const pageSize = 25
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const pageItems = React.useMemo(
    () => items.slice(page * pageSize, page * pageSize + pageSize),
    [items, page],
  )

  return (
    <div className="space-y-4">
      <CRMNav />
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Renewals &amp; Subscriptions</h1>
        <CRMHelpButton tag="crm:renewals" />
      </div>

      {metricsData?.data && (
        <div className="grid gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-3">
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Active MRR
            </div>
            <div className="mt-1 text-lg font-semibold">
              ${metricsData.data.totalActiveMRR.toLocaleString()}
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-3">
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Active ARR
            </div>
            <div className="mt-1 text-lg font-semibold">
              ${metricsData.data.totalActiveARR.toLocaleString()}
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-3">
            <div className="text-xs text-[color:var(--color-text-muted)]">
              MRR renewing next 30 days
            </div>
            <div className="mt-1 text-lg font-semibold">
              ${metricsData.data.mrrNext30.toLocaleString()}
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-3">
            <div className="text-xs text-[color:var(--color-text-muted)]">
              High‑risk renewals
            </div>
            <div className="mt-1 text-lg font-semibold">
              {(metricsData.data.countsByRisk['High'] ?? 0).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {accountFilterId && accountMetricsData?.data && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-3">
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Account MRR / ARR
            </div>
            <div className="mt-1 text-lg font-semibold">
              ${accountMetricsData.data.totalMRR.toLocaleString()} MRR
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              ${accountMetricsData.data.totalARR.toLocaleString()} ARR
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-3">
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Health &amp; risk
            </div>
            <div className="mt-1 text-sm">
              Health:{' '}
              {accountMetricsData.data.avgHealthScore != null
                ? `${accountMetricsData.data.avgHealthScore.toFixed(1)}/10`
                : '-'}
            </div>
            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              High‑risk: {(accountMetricsData.data.countsByRisk['High'] ?? 0).toLocaleString()} ·
              Churned: {accountMetricsData.data.churnedCount.toLocaleString()}
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-3">
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Next renewal &amp; at‑risk MRR
            </div>
            <div className="mt-1 text-sm">
              Next renewal:{' '}
              {accountMetricsData.data.nextRenewalDate
                ? formatDate(accountMetricsData.data.nextRenewalDate)
                : '-'}
            </div>
            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              MRR at risk: ${accountMetricsData.data.mrrAtRisk.toLocaleString()} ·
              Churned MRR: ${accountMetricsData.data.mrrChurned.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(0)
            }}
            placeholder="Search renewals..."
            className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(0)
            }}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)]"
          >
            <option value="">All statuses</option>
            <option value="Active">Active</option>
            <option value="Pending Renewal">Pending Renewal</option>
            <option value="Churned">Churned</option>
            <option value="Cancelled">Cancelled</option>
            <option value="On Hold">On Hold</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold"
          >
            <option value="renewalDate">Renewal date</option>
            <option value="updatedAt">Last updated</option>
            <option value="accountName">Account</option>
            <option value="mrr">MRR</option>
            <option value="arr">ARR</option>
          </select>
          <select
            value={dir}
            onChange={(e) => setDir(e.target.value as any)}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold"
          >
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
          {isFetching && (
            <span className="text-xs text-[color:var(--color-text-muted)]">
              Loading...
            </span>
          )}
          <div className="relative" data-cols-menu>
            <button
              type="button"
              className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)]"
              onClick={() => setShowColsMenu((v) => !v)}
            >
              Columns
            </button>
            {showColsMenu && (
              <div className="absolute right-0 z-20 mt-1 w-56 space-y-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-2 shadow">
                <div className="border-b pb-1 text-xs text-[color:var(--color-text-muted)]">
                  Drag to reorder
                </div>
                {cols.map((col) => (
                  <div
                    key={col.key}
                    draggable
                    onDragStart={() => handleDragStart(col.key)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(col.key)}
                    className={`flex cursor-move items-center gap-2 rounded p-1 text-sm ${
                      draggedCol === col.key ? 'bg-[color:var(--color-muted)] opacity-50' : 'hover:bg-[color:var(--color-muted)]'
                    }`}
                  >
                    <span className="text-xs text-[color:var(--color-text-muted)]">
                      ≡
                    </span>
                    <input
                      type="checkbox"
                      checked={col.visible}
                      onChange={(e) =>
                        setCols(
                          cols.map((c) =>
                            c.key === col.key ? { ...c, visible: e.target.checked } : c,
                          ),
                        )
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span>{col.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <form
          className="flex flex-wrap items-center gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
              const payload: any = {
                name: String(fd.get('name') || '').trim(),
                accountId: String(fd.get('accountId') || '') || undefined,
                productId: String(fd.get('productId') || '') || undefined,
                status: String(fd.get('status') || 'Active'),
                renewalDate: String(fd.get('renewalDate') || '') || undefined,
                mrr: fd.get('mrr') ? Number(fd.get('mrr')) : undefined,
                arr: fd.get('arr') ? Number(fd.get('arr')) : undefined,
                healthScore: fd.get('healthScore') ? Number(fd.get('healthScore')) : undefined,
                churnRisk: String(fd.get('churnRisk') || '') || undefined,
                upsellPotential: String(fd.get('upsellPotential') || '') || undefined,
              }
            if (!payload.name) {
              toast.showToast('Please enter a name for the renewal.', 'error')
              return
            }
            create.mutate(payload)
            ;(e.currentTarget as HTMLFormElement).reset()
          }}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-[color:var(--color-text-muted)]">
                Name
              </span>
              <span title="Short label for this renewal or subscription (e.g., 'ACME – CRM Enterprise, Year 2').">
                <HelpCircle
                  size={14}
                  className="text-[color:var(--color-text-muted)]"
                />
              </span>
            </div>
            <input
              name="name"
              required
              placeholder="Renewal / Subscription name"
              className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-[color:var(--color-text-muted)]">
                Account
              </span>
              <span title="Optional: link this renewal to an existing CRM account so you can see renewals by customer.">
                <HelpCircle
                  size={14}
                  className="text-[color:var(--color-text-muted)]"
                />
              </span>
            </div>
            <select
              name="accountId"
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
            >
              <option value="">Account (optional)</option>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                    {(a.accountNumber ?? '-')} - {a.name ?? 'Account'}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-[color:var(--color-text-muted)]">
                Product / service
              </span>
              <span title="Optional: tie this renewal to a specific product or service from your catalog.">
                <HelpCircle
                  size={14}
                  className="text-[color:var(--color-text-muted)]"
                />
              </span>
            </div>
            <select
              name="productId"
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
              onChange={(e) => setSelectedProductId(e.target.value)}
            >
              <option value="">Product / service (optional)</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.sku ? `${p.sku} - ${p.name}` : p.name}
                </option>
              ))}
            </select>
            {selectedProduct && (
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">
                Baseline price:{' '}
                <span className="font-semibold text-[color:var(--color-text)]">
                  {typeof selectedProduct.basePrice === 'number'
                    ? `${selectedProduct.currency ?? 'USD'} ${selectedProduct.basePrice.toLocaleString()}`
                    : 'n/a'}
                </span>
                {' '}from product catalog
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-[color:var(--color-text-muted)]">
                Renewal date
              </span>
              <span title="The date this contract term renews or expires. Use this to drive your renewal pipeline.">
                <HelpCircle
                  size={14}
                  className="text-[color:var(--color-text-muted)]"
                />
              </span>
            </div>
            <input
              name="renewalDate"
              type="date"
              className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-[color:var(--color-text-muted)]">
                MRR
              </span>
              <span title="Monthly Recurring Revenue for this renewal. If you only enter MRR, ARR will be calculated for you.">
                <HelpCircle
                  size={14}
                  className="text-[color:var(--color-text-muted)]"
                />
              </span>
            </div>
            <input
              name="mrr"
              type="number"
              step="0.01"
              placeholder="MRR"
              className="w-32 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-[color:var(--color-text-muted)]">
                ARR
              </span>
              <span title="Annual Recurring Revenue for this renewal. If you only enter ARR, MRR will be calculated for you.">
                <HelpCircle
                  size={14}
                  className="text-[color:var(--color-text-muted)]"
                />
              </span>
            </div>
            <input
              name="arr"
              type="number"
              step="0.01"
              placeholder="ARR"
              className="w-32 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-[color:var(--color-text-muted)]">
                Status
              </span>
              <span title="High‑level lifecycle stage: Active subscription, upcoming renewal, churned, cancelled, or on hold.">
                <HelpCircle
                  size={14}
                  className="text-[color:var(--color-text-muted)]"
                />
              </span>
            </div>
            <select
              name="status"
              defaultValue="Active"
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
            >
              <option value="Active">Active</option>
              <option value="Pending Renewal">Pending Renewal</option>
              <option value="Churned">Churned</option>
              <option value="Cancelled">Cancelled</option>
              <option value="On Hold">On Hold</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-[color:var(--color-text-muted)]">
                Health (0–10)
              </span>
              <span title="Quick numeric health score for this customer/renewal (0–10). Use your own rubric for adoption, satisfaction, and value.">
                <HelpCircle
                  size={14}
                  className="text-[color:var(--color-text-muted)]"
                />
              </span>
            </div>
            <input
              name="healthScore"
              type="number"
              min={0}
              max={10}
              step="0.1"
              placeholder="Health 0–10"
              className="w-32 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-[color:var(--color-text-muted)]">
                Churn risk
              </span>
              <span title="Subjective churn risk for this renewal: Low, Medium, or High, based on sentiment, usage, and account signals.">
                <HelpCircle
                  size={14}
                  className="text-[color:var(--color-text-muted)]"
                />
              </span>
            </div>
            <select
              name="churnRisk"
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
            >
              <option value="">Churn risk</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-[color:var(--color-text-muted)]">
                Upsell potential
              </span>
              <span title="Rough sense of expansion opportunity: Low/Medium/High based on pipeline, product fit, or customer requests.">
                <HelpCircle
                  size={14}
                  className="text-[color:var(--color-text-muted)]"
                />
              </span>
            </div>
            <select
              name="upsellPotential"
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
            >
              <option value="">Upsell potential</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
          <button className="ml-auto rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">
            Add renewal
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[color:var(--color-text-muted)]">
              <tr>
                {cols
                  .filter((c) => c.visible)
                  .map((col) => (
                    <th
                      key={col.key}
                      draggable
                      onDragStart={() => handleDragStart(col.key)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(col.key)}
                      className={`px-4 py-2 cursor-move ${
                        draggedCol === col.key ? 'opacity-50' : ''
                      }`}
                      title="Drag to reorder"
                    >
                      {col.label}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((r) => (
                <tr
                  key={r._id}
                  className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]"
                  onClick={() => setEditing(r)}
                >
                  {cols
                    .filter((c) => c.visible)
                    .map((col) => (
                      <td key={col.key} className="px-4 py-2">
                        {getColValue(r, col.key)}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between p-4 text-sm">
          <div>
            <span>Rows: {items.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page <= 0}
            >
              Prev
            </button>
            <span>
              Page {page + 1} / {totalPages}
            </span>
            <button
              className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page + 1 >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setEditing(null)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,40rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Edit renewal</div>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!editing) return
                  const fd = new FormData(e.currentTarget)
                  const payload: any = {
                    _id: editing._id,
                    name: String(fd.get('name') || '').trim() || undefined,
                    accountId: String(fd.get('accountId') || '') || undefined,
                    status: String(fd.get('status') || '') || undefined,
                    renewalDate: String(fd.get('renewalDate') || '') || undefined,
                    mrr: fd.get('mrr') ? Number(fd.get('mrr')) : undefined,
                    arr: fd.get('arr') ? Number(fd.get('arr')) : undefined,
                    healthScore: fd.get('healthScore')
                      ? Number(fd.get('healthScore'))
                      : undefined,
                    churnRisk: String(fd.get('churnRisk') || '') || undefined,
                    upsellPotential: String(fd.get('upsellPotential') || '') || undefined,
                    notes: String(fd.get('notes') || '') || undefined,
                  }
                  update.mutate(payload)
                  setEditing(null)
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                      Renewal / Subscription name
                    </label>
                    <input
                      name="name"
                      defaultValue={editing.name}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                      Account
                    </label>
                    <select
                      name="accountId"
                      defaultValue={editing.accountId ?? ''}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
                    >
                      <option value="">(none)</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>
                          {(a.accountNumber ?? '-')} - {a.name ?? 'Account'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                      Status
                    </label>
                    <select
                      name="status"
                      defaultValue={editing.status}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
                    >
                      <option value="Active">Active</option>
                      <option value="Pending Renewal">Pending Renewal</option>
                      <option value="Churned">Churned</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="On Hold">On Hold</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                      Renewal date
                    </label>
                    <input
                      type="date"
                      name="renewalDate"
                      defaultValue={
                        editing.renewalDate ? editing.renewalDate.slice(0, 10) : ''
                      }
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                      MRR
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      name="mrr"
                      defaultValue={editing.mrr ?? undefined}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                      ARR
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      name="arr"
                      defaultValue={editing.arr ?? undefined}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                      Health (0–10)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step="0.1"
                      name="healthScore"
                      defaultValue={editing.healthScore ?? undefined}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                      Churn risk
                    </label>
                    <select
                      name="churnRisk"
                      defaultValue={editing.churnRisk ?? ''}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
                    >
                      <option value="">(none)</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                      Upsell potential
                    </label>
                    <select
                      name="upsellPotential"
                      defaultValue={editing.upsellPotential ?? ''}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
                    >
                      <option value="">(none)</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                      Notes
                    </label>
                    <textarea
                      name="notes"
                      defaultValue={editing.notes ?? ''}
                      rows={3}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2 mt-2">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold">History</div>
                      <button
                        type="button"
                        onClick={() => setShowHistory(!showHistory)}
                        className="text-xs text-[color:var(--color-primary-500)] hover:underline"
                      >
                        {showHistory ? 'Hide audit trail' : 'View audit trail'}
                      </button>
                    </div>
                    {showHistory && (
                      <AuditTrail
                        entries={(() => {
                          const entries: AuditEntry[] = []
                          if (historyQ.data?.data?.history) {
                            for (const h of historyQ.data.data.history) {
                              entries.push({
                                timestamp: h.createdAt,
                                action: h.eventType,
                                userName: h.userName,
                                userEmail: h.userEmail,
                                description: h.description,
                                oldValue: h.oldValue,
                                newValue: h.newValue,
                                metadata: h.metadata,
                              })
                            }
                          }
                          return entries
                        })()}
                        maxHeight="200px"
                        actionLabels={{
                          'created': { label: 'Created', color: 'text-emerald-400' },
                          'status_changed': { label: 'Status Changed', color: 'text-blue-400' },
                          'health_changed': { label: 'Health Changed', color: 'text-amber-400' },
                          'risk_changed': { label: 'Risk Changed', color: 'text-red-400' },
                          'field_changed': { label: 'Updated', color: 'text-sky-400' },
                          'deleted': { label: 'Deleted', color: 'text-red-400' },
                        }}
                        emptyMessage={historyQ.isLoading ? 'Loading history...' : 'No audit history yet.'}
                      />
                    )}
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
                  >
                    Save changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


