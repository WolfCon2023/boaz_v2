import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'
import { formatDateOnly } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'
import { Modal } from '@/components/Modal'

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

type ProductReportRow = {
  _id: string
  customerId: string
  environmentId?: string
  environmentName?: string
  environmentType?: string
  productName: string
  productType?: string
  vendor?: string
  status?: string
  supportLevel?: string
  deploymentDate?: string | null
  totalLicenseCount?: number
  totalSeatsAssigned?: number
  activeLicenses?: number
  pendingLicenses?: number
  expiredLicenses?: number
  nextExpirationDate?: string | null
}

export default function CRMAssetsProductsReport() {
  const toast = useToast()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [customerId, setCustomerId] = React.useState(searchParams.get('customerId') ?? 'all')
  const [environmentId, setEnvironmentId] = React.useState(searchParams.get('environmentId') ?? '')
  const [vendor, setVendor] = React.useState(searchParams.get('vendor') ?? '')
  const [windowDays, setWindowDays] = React.useState(searchParams.get('windowDays') ?? '0')
  const [productStatus, setProductStatus] = React.useState(searchParams.get('productStatus') ?? 'all')
  const [productType, setProductType] = React.useState(searchParams.get('productType') ?? 'all')

  const customersQ = useQuery({
    queryKey: ['assets-customers'],
    queryFn: async () => {
      const res = await http.get('/api/assets/customers')
      return res.data as { data: { items: Customer[] } }
    },
  })

  const customers = customersQ.data?.data.items ?? []

  const environmentsQ = useQuery({
    queryKey: ['assets-products-report-environments', customerId],
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
    if (productStatus !== 'all') params.set('productStatus', productStatus)
    if (productType !== 'all') params.set('productType', productType)
    setSearchParams(params, { replace: true })
  }, [customerId, environmentId, vendor, windowDays, productStatus, productType, setSearchParams])

  const reportQ = useQuery({
    queryKey: ['assets-product-report', customerId, environmentId, vendor, windowDays, productStatus, productType],
    queryFn: async () => {
      const params: any = {}
      if (customerId && customerId !== 'all') params.customerId = customerId
      if (environmentId) params.environmentId = environmentId
      if (vendor.trim()) params.vendor = vendor.trim()
      if (windowDays && windowDays !== '0') params.windowDays = Number(windowDays)
      if (productStatus !== 'all') params.productStatus = productStatus
      if (productType !== 'all') params.productType = productType
      const res = await http.get('/api/assets/product-report', { params })
      return res.data as { data: { items: ProductReportRow[] } }
    },
  })

  React.useEffect(() => {
    if (reportQ.error) {
      const err: any = reportQ.error
      const msg = err?.response?.data?.error || err?.message || 'Failed to load installed products report.'
      toast.showToast(msg, 'error')
    }
  }, [reportQ.error, toast])

  const rows = reportQ.data?.data.items ?? []

  const [sortKey, setSortKey] = React.useState<
    'customer' | 'environment' | 'product' | 'vendor' | 'status' | 'deployment' | 'nextExpiration'
  >('customer')
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

    function getCustomerLabel(r: ProductReportRow) {
      return customerNameById.get(r.customerId) ?? r.customerId
    }

    function getSortValue(r: ProductReportRow): number | string {
      if (sortKey === 'customer') return getCustomerLabel(r)
      if (sortKey === 'environment') return r.environmentName ?? ''
      if (sortKey === 'product') return r.productName ?? ''
      if (sortKey === 'vendor') return r.vendor ?? ''
      if (sortKey === 'status') return r.status ?? ''
      if (sortKey === 'deployment') {
        if (!r.deploymentDate) return Number.MAX_SAFE_INTEGER
        const ts = new Date(r.deploymentDate).getTime()
        return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER
      }
      if (sortKey === 'nextExpiration') {
        if (!r.nextExpirationDate) return Number.MAX_SAFE_INTEGER
        const ts = new Date(r.nextExpirationDate).getTime()
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
      'Status',
      'Support Level',
      'Deployment Date',
      'Total Licenses',
      'Total Seats Assigned',
      'Active Licenses',
      'Pending Licenses',
      'Expired Licenses',
      'Next Expiration',
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
        r.status ?? '',
        r.supportLevel ?? '',
        r.deploymentDate ? formatDateOnly(r.deploymentDate) : '',
        String(r.totalLicenseCount ?? ''),
        String(r.totalSeatsAssigned ?? ''),
        String(r.activeLicenses ?? ''),
        String(r.pendingLicenses ?? ''),
        String(r.expiredLicenses ?? ''),
        r.nextExpirationDate ? formatDateOnly(r.nextExpirationDate) : '',
      ]
      return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
    })
    const csv = [headers.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'assets_products_report.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const [editingProduct, setEditingProduct] = React.useState<ProductReportRow | null>(null)
  const [editProductName, setEditProductName] = React.useState('')
  const [editProductType, setEditProductType] = React.useState('Software')
  const [editVendor, setEditVendor] = React.useState('')
  const [editStatus, setEditStatus] = React.useState('Active')
  const [editSupportLevel, setEditSupportLevel] = React.useState('Standard')
  const [editDeploymentDate, setEditDeploymentDate] = React.useState('')

  const updateProduct = useMutation({
    mutationFn: async () => {
      if (!editingProduct) throw new Error('No product selected.')
      const payload: any = {
        productName: editProductName.trim(),
        productType: editProductType as any,
        vendor: editVendor.trim() || undefined,
        status: editStatus as any,
        supportLevel: editSupportLevel as any,
      }
      if (editDeploymentDate) {
        payload.deploymentDate = editDeploymentDate
      } else {
        payload.deploymentDate = null
      }
      const res = await http.put(`/api/assets/products/${editingProduct._id}`, payload)
      return res.data
    },
    onSuccess: () => {
      setEditingProduct(null)
      qc.invalidateQueries({ queryKey: ['assets-product-report'] })
      qc.invalidateQueries({ queryKey: ['assets-summary'] })
      toast.showToast('Installed product updated.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to update installed product.'
      toast.showToast(msg, 'error')
    },
  })

  return (
    <div className="space-y-6">
      <CRMNav />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-1">
        <div>
          <h1 className="text-xl font-semibold">Installed Products Report</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Cross customer view of installed products with vendor, environment, and license summaries.
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
          <div>
            <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Product type</label>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-xs text-[color:var(--color-text)]"
            >
              <option value="all">All</option>
              <option value="Software">Software</option>
              <option value="Hardware">Hardware</option>
              <option value="Cloud Service">Cloud Service</option>
              <option value="Integration">Integration</option>
              <option value="Subscription">Subscription</option>
            </select>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 space-y-3 text-xs">
        <div className="flex items-center justify-between gap-2 text-[color:var(--color-text-muted)]">
          <div>
            {reportQ.isFetching
              ? 'Loading installed products…'
              : `${rows.length} product${rows.length === 1 ? '' : 's'} found`}
          </div>
        </div>
        {rows.length === 0 && !reportQ.isFetching ? (
          <div className="text-[11px] text-[color:var(--color-text-muted)]">
            No installed products match the selected filters.
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
                  <th className="px-2 py-1 text-left">Type</th>
                  <th className="px-2 py-1 text-left">{renderSortLabel('Status', 'status')}</th>
                  <th className="px-2 py-1 text-left">Support</th>
                  <th className="px-2 py-1 text-left">{renderSortLabel('Deployed', 'deployment')}</th>
                  <th className="px-2 py-1 text-left">Licenses (total / seats)</th>
                  <th className="px-2 py-1 text-left">Active / Pending / Expired</th>
                  <th className="px-2 py-1 text-left">
                    {renderSortLabel('Next expiration', 'nextExpiration')}
                  </th>
                  <th className="px-2 py-1 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => {
                  const customer = customerNameById.get(r.customerId) ?? r.customerId

                  return (
                    <tr key={r._id} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)]">
                      <td className="px-2 py-1 align-top">{customer}</td>
                      <td className="px-2 py-1 align-top">
                        {r.environmentName || '-'}
                        {r.environmentType ? ` (${r.environmentType})` : ''}
                      </td>
                      <td className="px-2 py-1 align-top">{r.productName}</td>
                      <td className="px-2 py-1 align-top">{r.vendor ?? '-'}</td>
                      <td className="px-2 py-1 align-top">{r.productType ?? '-'}</td>
                      <td className="px-2 py-1 align-top">{r.status ?? '-'}</td>
                      <td className="px-2 py-1 align-top">{r.supportLevel ?? '-'}</td>
                      <td className="px-2 py-1 align-top">
                        {r.deploymentDate ? formatDateOnly(r.deploymentDate) : '-'}
                      </td>
                      <td className="px-2 py-1 align-top">
                        {typeof r.totalLicenseCount === 'number' || typeof r.totalSeatsAssigned === 'number' ? (
                          <span className="whitespace-nowrap">
                            {r.totalLicenseCount ?? 0} / {r.totalSeatsAssigned ?? 0}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-2 py-1 align-top">
                        <span className="whitespace-nowrap">
                          {r.activeLicenses ?? 0} / {r.pendingLicenses ?? 0} / {r.expiredLicenses ?? 0}
                        </span>
                      </td>
                      <td className="px-2 py-1 align-top">
                        {r.nextExpirationDate ? formatDateOnly(r.nextExpirationDate) : '-'}
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
                              setEditingProduct(r)
                              setEditProductName(r.productName)
                              setEditProductType((r.productType as any) || 'Software')
                              setEditVendor(r.vendor ?? '')
                              setEditStatus((r.status as any) || 'Active')
                              setEditSupportLevel((r.supportLevel as any) || 'Standard')
                              setEditDeploymentDate(r.deploymentDate ? r.deploymentDate.slice(0, 10) : '')
                            }}
                          >
                            Edit product
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

      <Modal
        open={!!editingProduct}
        onClose={() => {
          if (updateProduct.isPending) return
          setEditingProduct(null)
        }}
        title="Edit installed product"
        subtitle={editingProduct?.productName}
        width="34rem"
        showFullscreenToggle={false}
      >
        <div className="text-xs">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                Product name
              </label>
              <input
                type="text"
                value={editProductName}
                onChange={(e) => setEditProductName(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                Type
              </label>
              <select
                value={editProductType}
                onChange={(e) => setEditProductType(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
              >
                <option value="Software">Software</option>
                <option value="Hardware">Hardware</option>
                <option value="Cloud Service">Cloud Service</option>
                <option value="Integration">Integration</option>
                <option value="Subscription">Subscription</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                Vendor
              </label>
              <input
                type="text"
                value={editVendor}
                onChange={(e) => setEditVendor(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                Status
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
              >
                <option value="Active">Active</option>
                <option value="Needs Upgrade">Needs Upgrade</option>
                <option value="Pending Renewal">Pending Renewal</option>
                <option value="Retired">Retired</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                Support level
              </label>
              <select
                value={editSupportLevel}
                onChange={(e) => setEditSupportLevel(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
              >
                <option value="Basic">Basic</option>
                <option value="Standard">Standard</option>
                <option value="Premium">Premium</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                Deployment date
              </label>
              <input
                type="date"
                value={editDeploymentDate}
                onChange={(e) => setEditDeploymentDate(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-1.5 text-[11px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
              disabled={updateProduct.isPending}
              onClick={() => setEditingProduct(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={updateProduct.isPending || !editProductName.trim()}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
              onClick={() => {
                if (!editProductName.trim()) {
                  toast.showToast('Product name is required.', 'error')
                  return
                }
                updateProduct.mutate()
              }}
            >
              Save changes
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}


