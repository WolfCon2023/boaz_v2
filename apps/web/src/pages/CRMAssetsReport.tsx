import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'
import { formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'

type Customer = {
  id: string
  name: string
  accountNumber?: number
}

type Environment = {
  _id: string
  customerId: string
  name: string
}

type LicenseReportRow = {
  _id: string
  productId: string
  customerId: string
  environmentId?: string
  environmentName?: string
  environmentType?: string
  productName: string
  productType?: string
  vendor?: string
  productStatus?: string
  supportLevel?: string
  licenseType: string
  licenseIdentifier?: string
  licenseKey?: string
  licenseCount: number
  seatsAssigned: number
  expirationDate?: string | null
  renewalStatus: string
  cost?: number
}

export default function CRMAssetsReport() {
  const toast = useToast()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [customerId, setCustomerId] = React.useState(searchParams.get('customerId') ?? 'all')
  const [environmentId, setEnvironmentId] = React.useState(searchParams.get('environmentId') ?? '')
  const [vendor, setVendor] = React.useState(searchParams.get('vendor') ?? '')
  const [windowDays, setWindowDays] = React.useState(searchParams.get('windowDays') ?? '0')
  const [licenseStatus, setLicenseStatus] = React.useState(searchParams.get('licenseStatus') ?? 'all')
  const [productStatus, setProductStatus] = React.useState(searchParams.get('productStatus') ?? 'all')

  const customersQ = useQuery({
    queryKey: ['assets-customers'],
    queryFn: async () => {
      const res = await http.get('/api/assets/customers')
      return res.data as { data: { items: Customer[] } }
    },
  })

  const customers = customersQ.data?.data.items ?? []

  const environmentsQ = useQuery({
    queryKey: ['assets-report-environments', customerId],
    enabled: customerId !== 'all' && !!customerId,
    queryFn: async () => {
      const res = await http.get(`/api/assets/environments/${customerId}`)
      return res.data as { data: { items: Environment[] } }
    },
  })

  const environments = environmentsQ.data?.data.items ?? []

  React.useEffect(() => {
    const params = new URLSearchParams()
    if (customerId && customerId !== 'all') params.set('customerId', customerId)
    if (environmentId) params.set('environmentId', environmentId)
    if (vendor.trim()) params.set('vendor', vendor.trim())
    if (windowDays && windowDays !== '0') params.set('windowDays', windowDays)
    if (licenseStatus !== 'all') params.set('licenseStatus', licenseStatus)
    if (productStatus !== 'all') params.set('productStatus', productStatus)
    setSearchParams(params, { replace: true })
  }, [customerId, environmentId, vendor, windowDays, licenseStatus, productStatus, setSearchParams])

  const reportQ = useQuery({
    queryKey: ['assets-license-report', customerId, environmentId, vendor, windowDays, licenseStatus, productStatus],
    queryFn: async () => {
      const params: any = {}
      if (customerId && customerId !== 'all') params.customerId = customerId
      if (environmentId) params.environmentId = environmentId
      if (vendor.trim()) params.vendor = vendor.trim()
      if (windowDays && windowDays !== '0') params.windowDays = Number(windowDays)
      if (licenseStatus !== 'all') params.licenseStatus = licenseStatus
      if (productStatus !== 'all') params.productStatus = productStatus
      const res = await http.get('/api/assets/license-report', { params })
      return res.data as { data: { items: LicenseReportRow[] } }
    },
  })

  React.useEffect(() => {
    if (reportQ.error) {
      const err: any = reportQ.error
      const msg = err?.response?.data?.error || err?.message || 'Failed to load license report.'
      toast.showToast(msg, 'error')
    }
  }, [reportQ.error, toast])

  const rows = reportQ.data?.data.items ?? []

  const [editingLicense, setEditingLicense] = React.useState<LicenseReportRow | null>(null)
  const [editLicenseType, setEditLicenseType] = React.useState('Subscription')
  const [editLicenseIdentifier, setEditLicenseIdentifier] = React.useState('')
  const [editLicenseKey, setEditLicenseKey] = React.useState('')
  const [editLicenseCount, setEditLicenseCount] = React.useState('1')
  const [editSeatsAssigned, setEditSeatsAssigned] = React.useState('0')
  const [editExpiration, setEditExpiration] = React.useState('')
  const [editRenewalStatus, setEditRenewalStatus] = React.useState<'Active' | 'Pending Renewal' | 'Expired'>('Active')
  const [editCost, setEditCost] = React.useState('')

  const [sortKey, setSortKey] = React.useState<
    'customer' | 'environment' | 'product' | 'vendor' | 'expiration' | 'renewalStatus' | 'productStatus' | 'seats'
  >('expiration')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc')

  const customerNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const c of customers) {
      const label = c.accountNumber ? `${c.accountNumber} – ${c.name}` : c.name
      map.set(c.id, label)
    }
    return map
  }, [customers])

  const sortedRows = React.useMemo(() => {
    const dirMul = sortDir === 'desc' ? -1 : 1

    function getCustomerLabel(r: LicenseReportRow) {
      return customerNameById.get(r.customerId) ?? r.customerId
    }

    function getSortValue(r: LicenseReportRow): number | string {
      if (sortKey === 'customer') return getCustomerLabel(r)
      if (sortKey === 'environment') return r.environmentName ?? ''
      if (sortKey === 'product') return r.productName ?? ''
      if (sortKey === 'vendor') return r.vendor ?? ''
      if (sortKey === 'renewalStatus') return r.renewalStatus ?? ''
      if (sortKey === 'productStatus') return r.productStatus ?? ''
      if (sortKey === 'seats') {
        const diff = (r.seatsAssigned ?? 0) - (r.licenseCount ?? 0)
        return diff
      }
      if (sortKey === 'expiration') {
        if (!r.expirationDate) return Number.MAX_SAFE_INTEGER
        const ts = new Date(r.expirationDate).getTime()
        return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER
      }
      return ''
    }

    return [...rows].sort((a, b) => {
      const av = getSortValue(a)
      const bv = getSortValue(b)
      if (typeof av === 'number' && typeof bv === 'number') {
        if (av === bv) return 0
        return av < bv ? -1 * dirMul : 1 * dirMul
      }
      const as = String(av)
      const bs = String(bv)
      if (as === bs) return 0
      return as.localeCompare(bs) * dirMul
    })
  }, [rows, sortKey, sortDir, customerNameById])

  function handleSort(next: typeof sortKey) {
    setSortKey((prevKey) => {
      if (prevKey === next) {
        setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'))
        return prevKey
      }
      setSortDir('asc')
      return next
    })
  }

  function renderSortLabel(label: string, key: typeof sortKey | null) {
    if (!key) return label
    const isActive = sortKey === key
    return (
      <button
        type="button"
        onClick={() => handleSort(key)}
        className={`inline-flex items-center gap-1 ${isActive ? 'text-[color:var(--color-text)]' : ''}`}
      >
        <span>{label}</span>
        {isActive && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    )
  }

  function exportCsv() {
    const headers = [
      'Customer',
      'Environment',
      'Environment Type',
      'Product',
      'Vendor',
      'Product Type',
      'Product Status',
      'Support Level',
      'License Type',
      'License Identifier',
      'License Key',
      'Licenses Purchased',
      'Seats Assigned',
      'Expiration',
      'Renewal Status',
      'Cost',
      'Days Until Expiration',
      'Over-allocated',
    ]
    const lines = rows.map((r) => {
      const customer = customerNameById.get(r.customerId) ?? r.customerId
      let daysUntil = ''
      if (r.expirationDate) {
        const now = new Date()
        const exp = new Date(r.expirationDate)
        const diffMs = exp.getTime() - now.getTime()
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
        daysUntil = String(diffDays)
      }
      const overAllocated = r.seatsAssigned > r.licenseCount && (r.licenseCount ?? 0) > 0
      const cells = [
        customer,
        r.environmentName ?? '',
        r.environmentType ?? '',
        r.productName,
        r.vendor ?? '',
        r.productType ?? '',
        r.productStatus ?? '',
        r.supportLevel ?? '',
        r.licenseType,
        r.licenseIdentifier ?? '',
        r.licenseKey ?? '',
        String(r.licenseCount ?? ''),
        String(r.seatsAssigned ?? ''),
        r.expirationDate ? formatDateTime(r.expirationDate) : '',
        r.renewalStatus ?? '',
        typeof r.cost === 'number' ? r.cost.toFixed(2) : '',
        daysUntil,
        overAllocated ? 'Yes' : 'No',
      ]
      return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
    })
    const csv = [headers.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'assets_license_report.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const updateLicense = useMutation({
    mutationFn: async () => {
      if (!editingLicense) throw new Error('No license selected.')
      const payload: any = {
        licenseType: editLicenseType as any,
        licenseIdentifier: editLicenseIdentifier.trim() || undefined,
        licenseKey: editLicenseKey.trim() || undefined,
        licenseCount: Number(editLicenseCount) || 1,
        seatsAssigned: Number(editSeatsAssigned) || 0,
        renewalStatus: editRenewalStatus as any,
      }
      if (editExpiration) {
        payload.expirationDate = editExpiration
      } else {
        payload.expirationDate = null
      }
      if (editCost.trim()) {
        const c = Number(editCost)
        if (Number.isFinite(c)) payload.cost = c
      } else {
        payload.cost = undefined
      }
      const res = await http.put(`/api/assets/licenses/${editingLicense._id}`, payload)
      return res.data
    },
    onSuccess: () => {
      setEditingLicense(null)
      qc.invalidateQueries({ queryKey: ['assets-license-report'] })
      qc.invalidateQueries({ queryKey: ['assets-summary'] })
      toast.showToast('License updated.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to update license.'
      toast.showToast(msg, 'error')
    },
  })

  return (
    <div className="space-y-6">
      <CRMNav />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-1">
        <div>
          <h1 className="text-xl font-semibold">Assets &amp; Licenses Report</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Cross‑customer view of installed products and licenses with exportable data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={reportQ.isFetching}
            onClick={exportCsv}
            className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </header>

      {/* Filters */}
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 space-y-3 text-xs">
        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Customer</label>
            <select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value)
                setEnvironmentId('')
              }}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-xs text-[color:var(--color-text)]"
            >
              <option value="all">All customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.accountNumber ? `${c.accountNumber} – ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Environment</label>
            <select
              value={environmentId}
              onChange={(e) => setEnvironmentId(e.target.value)}
              disabled={customerId === 'all' || !customerId}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-xs text-[color:var(--color-text)] disabled:opacity-50"
            >
              <option value="">All environments</option>
              {environments.map((env) => (
                <option key={env._id} value={env._id}>
                  {env.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Vendor</label>
            <input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Filter by vendor…"
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-2 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Renewal window</label>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-xs text-[color:var(--color-text)]"
            >
              <option value="0">All dates</option>
              <option value="30">&le; 30 days</option>
              <option value="60">&le; 60 days</option>
              <option value="90">&le; 90 days</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">License status</label>
            <select
              value={licenseStatus}
              onChange={(e) => setLicenseStatus(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-xs text-[color:var(--color-text)]"
            >
              <option value="all">All</option>
              <option value="Active">Active</option>
              <option value="Pending Renewal">Pending Renewal</option>
              <option value="Expired">Expired</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Product status</label>
            <select
              value={productStatus}
              onChange={(e) => setProductStatus(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-xs text-[color:var(--color-text)]"
            >
              <option value="all">All</option>
              <option value="Active">Active</option>
              <option value="Needs Upgrade">Needs Upgrade</option>
              <option value="Pending Renewal">Pending Renewal</option>
              <option value="Retired">Retired</option>
            </select>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2 text-[color:var(--color-text-muted)]">
          <div>
            {reportQ.isFetching
              ? 'Loading licenses…'
                : `${rows.length} license${rows.length === 1 ? '' : 's'} found`}
          </div>
        </div>
        {rows.length === 0 && !reportQ.isFetching ? (
          <div className="text-[11px] text-[color:var(--color-text-muted)]">
            No licenses match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-1 text-[11px]">
              <thead>
                <tr className="text-[10px] uppercase text-[color:var(--color-text-muted)]">
                  <th className="px-2 py-1 text-left">{renderSortLabel('Customer', 'customer')}</th>
                  <th className="px-2 py-1 text-left">{renderSortLabel('Environment', 'environment')}</th>
                  <th className="px-2 py-1 text-left">{renderSortLabel('Product', 'product')}</th>
                  <th className="px-2 py-1 text-left">{renderSortLabel('Vendor', 'vendor')}</th>
                  <th className="px-2 py-1 text-left">License</th>
                  <th className="px-2 py-1 text-left">Type</th>
                  <th className="px-2 py-1 text-left">{renderSortLabel('Count / Seats', 'seats')}</th>
                  <th className="px-2 py-1 text-left">{renderSortLabel('Expiration', 'expiration')}</th>
                  <th className="px-2 py-1 text-left">{renderSortLabel('Renewal status', 'renewalStatus')}</th>
                  <th className="px-2 py-1 text-left">{renderSortLabel('Product status', 'productStatus')}</th>
                  <th className="px-2 py-1 text-left">Support</th>
                  <th className="px-2 py-1 text-left">Days left</th>
                  <th className="px-2 py-1 text-left">Cost</th>
                  <th className="px-2 py-1 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => {
                  const customer = customerNameById.get(r.customerId) ?? r.customerId
                  const overAllocated =
                    r.seatsAssigned > r.licenseCount && (r.licenseCount ?? 0) > 0

                  const now = new Date()
                  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
                  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
                  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

                  const expDate = r.expirationDate ? new Date(r.expirationDate) : null
                  const isExpired = !!(expDate && expDate < now)
                  const is30 = !!(expDate && expDate >= now && expDate <= in30Days)
                  const is60 = !!(expDate && expDate > in30Days && expDate <= in60Days)
                  const is90 = !!(expDate && expDate > in60Days && expDate <= in90Days)

                  let rowBg = 'bg-[color:var(--color-bg)]'
                  let rowBorder = 'border-[color:var(--color-border)]'
                  if (isExpired || r.renewalStatus === 'Expired') {
                    rowBg = 'bg-red-950/40'
                    rowBorder = 'border-red-500/60'
                  } else if (is30 || r.renewalStatus === 'Pending Renewal') {
                    rowBg = 'bg-amber-950/40'
                    rowBorder = 'border-amber-500/60'
                  } else if (is60 || is90 || r.productStatus === 'Needs Upgrade') {
                    rowBg = 'bg-sky-950/40'
                    rowBorder = 'border-sky-500/50'
                  }

                  let daysLeftLabel = '-'
                  if (expDate) {
                    const diffMs = expDate.getTime() - now.getTime()
                    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
                    daysLeftLabel = `${diffDays}`
                  }

                  let renewalChipClass =
                    'inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px]'
                  if (r.renewalStatus === 'Expired') {
                    renewalChipClass =
                      'inline-flex items-center rounded-full border border-red-500/70 bg-red-500/15 px-2 py-0.5 text-[10px] text-red-200'
                  } else if (r.renewalStatus === 'Pending Renewal') {
                    renewalChipClass =
                      'inline-flex items-center rounded-full border border-amber-500/70 bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-100'
                  } else if (r.renewalStatus === 'Active') {
                    renewalChipClass =
                      'inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-100'
                  }

                  let productChipClass =
                    'inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px]'
                  if (r.productStatus === 'Needs Upgrade') {
                    productChipClass =
                      'inline-flex items-center rounded-full border border-sky-500/70 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-100'
                  } else if (r.productStatus === 'Pending Renewal') {
                    productChipClass =
                      'inline-flex items-center rounded-full border border-amber-500/70 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100'
                  }

                  return (
                    <tr
                      key={r._id}
                      className={`rounded-lg border ${rowBorder} ${rowBg}`}
                    >
                      <td className="px-2 py-1 align-top">{customer}</td>
                      <td className="px-2 py-1 align-top">
                        {r.environmentName || '-'}
                        {r.environmentType ? ` (${r.environmentType})` : ''}
                      </td>
                      <td className="px-2 py-1 align-top">{r.productName}</td>
                      <td className="px-2 py-1 align-top">{r.vendor ?? '-'}</td>
                      <td className="px-2 py-1 align-top">
                        {r.licenseIdentifier || r.licenseKey || 'License'}
                      </td>
                      <td className="px-2 py-1 align-top">{r.licenseType}</td>
                      <td className="px-2 py-1 align-top">
                        <span className="whitespace-nowrap">
                          {r.licenseCount} /{' '}
                          <span
                            className={
                              overAllocated ? 'text-[color:var(--color-danger)] font-semibold' : ''
                            }
                          >
                            {r.seatsAssigned}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-1 align-top">
                        {r.expirationDate ? formatDateTime(r.expirationDate) : '-'}
                      </td>
                      <td className="px-2 py-1 align-top">
                        <span className={renewalChipClass}>{r.renewalStatus}</span>
                      </td>
                      <td className="px-2 py-1 align-top">
                        {r.productStatus ? <span className={productChipClass}>{r.productStatus}</span> : '-'}
                      </td>
                      <td className="px-2 py-1 align-top">{r.supportLevel ?? '-'}</td>
                      <td className="px-2 py-1 align-top">
                        {daysLeftLabel !== '-' ? (
                          <span
                            className={
                              isExpired || Number(daysLeftLabel) < 0
                                ? 'text-[color:var(--color-danger)] font-semibold'
                                : is30
                                  ? 'text-amber-300 font-semibold'
                                  : ''
                            }
                          >
                            {daysLeftLabel}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-2 py-1 align-top">
                        {typeof r.cost === 'number' ? `$${r.cost.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-2 py-1 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[color:var(--color-muted)]"
                            onClick={() => {
                              window.location.href = `/apps/crm/accounts?accountId=${encodeURIComponent(
                                r.customerId,
                              )}`
                            }}
                          >
                            Open account
                          </button>
                          <button
                            type="button"
                            className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[color:var(--color-muted)]"
                            onClick={() => {
                              window.location.href = `/apps/crm/assets?customerId=${encodeURIComponent(
                                r.customerId,
                              )}`
                            }}
                          >
                            Open assets
                          </button>
                          <button
                            type="button"
                            className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[color:var(--color-muted)]"
                            onClick={() => {
                              setEditingLicense(r)
                              setEditLicenseType(r.licenseType)
                              setEditLicenseIdentifier(r.licenseIdentifier ?? '')
                              setEditLicenseKey(r.licenseKey ?? '')
                              setEditLicenseCount(String(r.licenseCount ?? 1))
                              setEditSeatsAssigned(String(r.seatsAssigned ?? 0))
                              setEditExpiration(r.expirationDate ? r.expirationDate.slice(0, 10) : '')
                              setEditRenewalStatus(
                                (r.renewalStatus as 'Active' | 'Pending Renewal' | 'Expired') ?? 'Active',
                              )
                              setEditCost(
                                typeof r.cost === 'number' && Number.isFinite(r.cost)
                                  ? String(r.cost)
                                  : '',
                              )
                            }}
                          >
                            Edit license
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingLicense && (
        <div className="fixed inset-0 z-[2147483647]">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              if (updateLicense.isPending) return
              setEditingLicense(null)
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,34rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 text-xs shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Edit license</div>
                  <div className="text-[11px] text-[color:var(--color-text-muted)]">
                    {editingLicense.productName} –{' '}
                    {editingLicense.licenseIdentifier || editingLicense.licenseKey || 'License'}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    Type
                  </label>
                  <select
                    value={editLicenseType}
                    onChange={(e) => setEditLicenseType(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  >
                    <option value="Subscription">Subscription</option>
                    <option value="Seat-based">Seat based</option>
                    <option value="Device-based">Device based</option>
                    <option value="Perpetual">Perpetual</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    License identifier
                  </label>
                  <input
                    type="text"
                    value={editLicenseIdentifier}
                    onChange={(e) => setEditLicenseIdentifier(e.target.value)}
                    placeholder="Agreement ID, SKU, etc."
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    License key
                  </label>
                  <input
                    type="text"
                    value={editLicenseKey}
                    onChange={(e) => setEditLicenseKey(e.target.value)}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    Licenses purchased
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editLicenseCount}
                    onChange={(e) => setEditLicenseCount(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    Seats assigned
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editSeatsAssigned}
                    onChange={(e) => setEditSeatsAssigned(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    Expiration
                  </label>
                  <input
                    type="date"
                    value={editExpiration}
                    onChange={(e) => setEditExpiration(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    Renewal status
                  </label>
                  <select
                    value={editRenewalStatus}
                    onChange={(e) =>
                      setEditRenewalStatus(e.target.value as 'Active' | 'Pending Renewal' | 'Expired')
                    }
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  >
                    <option value="Active">Active</option>
                    <option value="Pending Renewal">Pending Renewal</option>
                    <option value="Expired">Expired</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    Cost (optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-1.5 text-[11px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
                  disabled={updateLicense.isPending}
                  onClick={() => setEditingLicense(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={updateLicense.isPending || !editLicenseCount || Number(editLicenseCount) <= 0}
                  className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                  onClick={() => {
                    if (!editLicenseCount || Number(editLicenseCount) <= 0) {
                      toast.showToast('License count must be at least 1.', 'error')
                      return
                    }
                    updateLicense.mutate()
                  }}
                >
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


