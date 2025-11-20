import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
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
  environmentType: string
  location?: string
  status: string
  notes?: string
  createdAt: string
  updatedAt: string
}

type InstalledProduct = {
  _id: string
  customerId: string
  environmentId: string
  productName: string
  productType: string
  vendor?: string
  version?: string
  status: string
  supportLevel?: string
  deploymentDate?: string | null
  createdAt: string
  updatedAt: string
}

type License = {
  _id: string
  productId: string
  licenseType: string
  licenseKey?: string
  licenseIdentifier?: string
  licenseCount: number
  seatsAssigned: number
  expirationDate?: string | null
  renewalStatus: string
  cost?: number
  assignedUsers?: string[]
  createdAt: string
  updatedAt: string
}

type Summary = {
  totalEnvironments: number
  totalProducts: number
  upcomingRenewals: License[]
  licenseAllocation: Array<{
    productId: string
    licenseCount: number
    seatsAssigned: number
    overAllocated: boolean
  }>
  productHealth: {
    Active: number
    NeedsUpgrade: number
    PendingRenewal: number
    Retired: number
  }
}

export default function CRMAssets() {
  const toast = useToast()
  const [customerId, setCustomerId] = React.useState('')

  const customersQ = useQuery({
    queryKey: ['assets-customers'],
    queryFn: async () => {
      const res = await http.get('/api/assets/customers')
      return res.data as { data: { items: Customer[] } }
    },
  })

  const environmentsQ = useQuery({
    queryKey: ['assets-environments', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const res = await http.get(`/api/assets/environments/${customerId}`)
      return res.data as { data: { items: Environment[] } }
    },
  })

  const productsQ = useQuery({
    queryKey: ['assets-products', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const res = await http.get(`/api/assets/products/${customerId}`)
      return res.data as { data: { items: InstalledProduct[] } }
    },
  })

  const summaryQ = useQuery({
    queryKey: ['assets-summary', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const res = await http.get(`/api/assets/summary/${customerId}`)
      return res.data as { data: Summary }
    },
  })

  const customers = customersQ.data?.data.items ?? []
  const environments = environmentsQ.data?.data.items ?? []
  const products = productsQ.data?.data.items ?? []
  const summary = summaryQ.data?.data

  const envById = React.useMemo(() => {
    const map = new Map<string, Environment>()
    for (const e of environments) map.set(e._id, e)
    return map
  }, [environments])

  React.useEffect(() => {
    if (!customers.length || customerId) return
    setCustomerId(customers[0].id)
  }, [customers, customerId])

  React.useEffect(() => {
    if (customersQ.isError) {
      toast.showToast('Failed to load customers for assets.', 'error')
    }
  }, [customersQ.isError, toast])

  return (
    <div className="space-y-6">
      <CRMNav />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-1">
        <div>
          <h1 className="text-xl font-semibold">Assets &amp; Installed Base</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Track customer environments, installed products, and licenses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[color:var(--color-text-muted)]">Customer</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="min-w-[200px] rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm text-[color:var(--color-text)]"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.accountNumber ? `${c.accountNumber} – ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Summary */}
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text-muted)]">
          <span>Customer installed base summary</span>
          {summaryQ.isFetching && <span>Loading…</span>}
        </div>
        {summary ? (
          <div className="grid gap-4 md:grid-cols-4 text-sm">
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
              <div className="text-xs text-[color:var(--color-text-muted)]">Environments</div>
              <div className="mt-1 text-2xl font-semibold">{summary.totalEnvironments}</div>
            </div>
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
              <div className="text-xs text-[color:var(--color-text-muted)]">Installed products</div>
              <div className="mt-1 text-2xl font-semibold">{summary.totalProducts}</div>
            </div>
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 space-y-1">
              <div className="text-xs text-[color:var(--color-text-muted)]">Product health</div>
              <div className="flex flex-wrap gap-2 text-[11px] text-[color:var(--color-text-muted)]">
                <span>Active: {summary.productHealth.Active}</span>
                <span>Needs upgrade: {summary.productHealth.NeedsUpgrade}</span>
                <span>Pending renewal: {summary.productHealth.PendingRenewal}</span>
                <span>Retired: {summary.productHealth.Retired}</span>
              </div>
            </div>
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 space-y-1">
              <div className="text-xs text-[color:var(--color-text-muted)]">Upcoming renewals (next 90 days)</div>
              {summary.upcomingRenewals.length === 0 ? (
                <div className="text-[11px] text-[color:var(--color-text-muted)]">No upcoming renewals.</div>
              ) : (
                <ul className="space-y-1 text-[11px]">
                  {summary.upcomingRenewals.slice(0, 4).map((lic) => (
                    <li key={lic._id} className="flex items-center justify-between gap-2">
                      <span>{lic.licenseIdentifier || lic.licenseKey || 'License'} </span>
                      <span className="text-[color:var(--color-text-muted)]">
                        {lic.expirationDate ? formatDateTime(lic.expirationDate) : 'No date'}
                      </span>
                    </li>
                  ))}
                  {summary.upcomingRenewals.length > 4 && (
                    <li className="text-[11px] text-[color:var(--color-text-muted)]">
                      +{summary.upcomingRenewals.length - 4} more…
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-[color:var(--color-text-muted)]">
            Select a customer to see environments, products, and license health.
          </div>
        )}
      </section>

      {/* Environments and products */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Environments */}
        <div className="lg:col-span-1 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs text-[color:var(--color-text-muted)]">
            <span>Environments</span>
            {environmentsQ.isFetching && <span>Loading…</span>}
          </div>
          {environments.length === 0 ? (
            <div className="text-[11px] text-[color:var(--color-text-muted)]">
              No environments yet for this customer.
            </div>
          ) : (
            <ul className="space-y-2 text-xs">
              {environments.map((env) => (
                <li
                  key={env._id}
                  className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{env.name}</div>
                    <span className="rounded-full bg-[color:var(--color-muted)] px-2 py-0.5 text-[10px] uppercase">
                      {env.environmentType}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-col gap-1 text-[11px] text-[color:var(--color-text-muted)]">
                    {env.location && <span>Location: {env.location}</span>}
                    <span>Status: {env.status}</span>
                    {env.notes && <span className="line-clamp-2">Notes: {env.notes}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Products */}
        <div className="lg:col-span-2 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-[color:var(--color-text-muted)]">
            <span>Installed products</span>
            {productsQ.isFetching && <span>Loading…</span>}
          </div>
          {products.length === 0 ? (
            <div className="text-[11px] text-[color:var(--color-text-muted)]">
              No installed products recorded for this customer.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-1 text-xs">
                <thead>
                  <tr className="text-[10px] uppercase text-[color:var(--color-text-muted)]">
                    <th className="px-2 py-1 text-left">Product</th>
                    <th className="px-2 py-1 text-left">Environment</th>
                    <th className="px-2 py-1 text-left">Type</th>
                    <th className="px-2 py-1 text-left">Vendor</th>
                    <th className="px-2 py-1 text-left">Version</th>
                    <th className="px-2 py-1 text-left">Status</th>
                    <th className="px-2 py-1 text-left">Support</th>
                    <th className="px-2 py-1 text-left">Deployed</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const env = envById.get(p.environmentId)
                    return (
                      <tr
                        key={p._id}
                        className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)]"
                      >
                        <td className="px-2 py-1 align-top">
                          <div className="font-medium text-[color:var(--color-text)]">{p.productName}</div>
                        </td>
                        <td className="px-2 py-1 align-top">{env ? env.name : '-'}</td>
                        <td className="px-2 py-1 align-top">{p.productType}</td>
                        <td className="px-2 py-1 align-top">{p.vendor ?? '-'}</td>
                        <td className="px-2 py-1 align-top">{p.version ?? '-'}</td>
                        <td className="px-2 py-1 align-top">{p.status}</td>
                        <td className="px-2 py-1 align-top">{p.supportLevel ?? '-'}</td>
                        <td className="px-2 py-1 align-top">
                          {p.deploymentDate ? formatDateTime(p.deploymentDate) : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}


