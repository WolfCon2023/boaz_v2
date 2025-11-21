import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
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

  const customerNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const c of customers) {
      const label = c.accountNumber ? `${c.accountNumber} – ${c.name}` : c.name
      map.set(c.id, label)
    }
    return map
  }, [customers])

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
    ]
    const lines = rows.map((r) => {
      const customer = customerNameById.get(r.customerId) ?? r.customerId
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
                  <th className="px-2 py-1 text-left">Customer</th>
                  <th className="px-2 py-1 text-left">Environment</th>
                  <th className="px-2 py-1 text-left">Product</th>
                  <th className="px-2 py-1 text-left">Vendor</th>
                  <th className="px-2 py-1 text-left">License</th>
                  <th className="px-2 py-1 text-left">Type</th>
                  <th className="px-2 py-1 text-left">Count / Seats</th>
                  <th className="px-2 py-1 text-left">Expiration</th>
                  <th className="px-2 py-1 text-left">Renewal status</th>
                  <th className="px-2 py-1 text-left">Product status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const customer = customerNameById.get(r.customerId) ?? r.customerId
                  const overAllocated =
                    r.seatsAssigned > r.licenseCount && (r.licenseCount ?? 0) > 0
                  return (
                    <tr
                      key={r._id}
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)]"
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
                      <td className="px-2 py-1 align-top">{r.renewalStatus}</td>
                      <td className="px-2 py-1 align-top">{r.productStatus ?? '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}


