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
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [customerId, setCustomerId] = React.useState('')
  const initializedFromUrl = React.useRef(false)

  const [newEnvName, setNewEnvName] = React.useState('')
  const [newEnvType, setNewEnvType] = React.useState('Production')
  const [newEnvLocation, setNewEnvLocation] = React.useState('')
  const [newEnvStatus, setNewEnvStatus] = React.useState('Active')
  const [newEnvNotes, setNewEnvNotes] = React.useState('')

  const [newProdEnvId, setNewProdEnvId] = React.useState('')
  const [newProdName, setNewProdName] = React.useState('')
  const [newProdType, setNewProdType] = React.useState('Software')
  const [newProdVendor, setNewProdVendor] = React.useState('')
  const [newProdVersion, setNewProdVersion] = React.useState('')
  const [newProdStatus, setNewProdStatus] = React.useState('Active')
  const [newProdSupport, setNewProdSupport] = React.useState('Standard')
  const [newProdDeploymentDate, setNewProdDeploymentDate] = React.useState('')

  const [editingEnv, setEditingEnv] = React.useState<Environment | null>(null)
  const [editingProd, setEditingProd] = React.useState<InstalledProduct | null>(null)
  const [licenseProduct, setLicenseProduct] = React.useState<InstalledProduct | null>(null)
  const [editingLicense, setEditingLicense] = React.useState<License | null>(null)
  const [licenseType, setLicenseType] = React.useState('Subscription')
  const [licenseIdentifier, setLicenseIdentifier] = React.useState('')
  const [licenseKey, setLicenseKey] = React.useState('')
  const [licenseCount, setLicenseCount] = React.useState('1')
  const [licenseSeatsAssigned, setLicenseSeatsAssigned] = React.useState('0')
  const [licenseExpiration, setLicenseExpiration] = React.useState('')
  const [licenseRenewalStatus, setLicenseRenewalStatus] = React.useState('Active')
  const [licenseCost, setLicenseCost] = React.useState('')

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
  const productIdForLicenses = licenseProduct?._id ?? ''

  const licensesQ = useQuery({
    queryKey: ['assets-licenses', productIdForLicenses],
    enabled: !!productIdForLicenses,
    queryFn: async () => {
      const res = await http.get(`/api/assets/licenses/product/${productIdForLicenses}`)
      return res.data as { data: { items: License[] } }
    },
  })
  const licenses = licensesQ.data?.data.items ?? []

  const envById = React.useMemo(() => {
    const map = new Map<string, Environment>()
    for (const e of environments) map.set(e._id, e)
    return map
  }, [environments])

  React.useEffect(() => {
    if (!customers.length || initializedFromUrl.current) return
    const fromUrl = searchParams.get('customerId')
    if (fromUrl && customers.some((c) => c.id === fromUrl)) {
      setCustomerId(fromUrl)
    } else {
      setCustomerId(customers[0].id)
    }
    initializedFromUrl.current = true
  }, [customers, searchParams])

  React.useEffect(() => {
    if (customersQ.isError) {
      toast.showToast('Failed to load customers for assets.', 'error')
    }
  }, [customersQ.isError, toast])

  React.useEffect(() => {
    if (!customerId) return
    const params = new URLSearchParams(searchParams)
    params.set('customerId', customerId)
    setSearchParams(params, { replace: true })
  }, [customerId, searchParams, setSearchParams])

  const createEnvironment = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error('Select a customer first.')
      const payload = {
        customerId,
        name: newEnvName.trim(),
        environmentType: newEnvType as any,
        location: newEnvLocation.trim() || undefined,
        status: newEnvStatus as any,
        notes: newEnvNotes.trim() || undefined,
      }
      const res = await http.post('/api/assets/environments', payload)
      return res.data
    },
    onSuccess: () => {
      setNewEnvName('')
      setNewEnvLocation('')
      setNewEnvNotes('')
      setNewEnvType('Production')
      setNewEnvStatus('Active')
      qc.invalidateQueries({ queryKey: ['assets-environments', customerId] })
      qc.invalidateQueries({ queryKey: ['assets-summary', customerId] })
      toast.showToast('Environment added.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to add environment.'
      toast.showToast(msg, 'error')
    },
  })

  const createProduct = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error('Select a customer first.')
      if (!newProdEnvId) throw new Error('Select an environment for this product.')
      const payload: any = {
        customerId,
        environmentId: newProdEnvId,
        productName: newProdName.trim(),
        productType: newProdType as any,
        vendor: newProdVendor.trim() || undefined,
        version: newProdVersion.trim() || undefined,
        status: newProdStatus as any,
        supportLevel: newProdSupport as any,
      }
      if (newProdDeploymentDate) {
        const d = new Date(newProdDeploymentDate)
        if (!Number.isNaN(d.getTime())) {
          payload.deploymentDate = d.toISOString()
        }
      }
      const res = await http.post('/api/assets/products', payload)
      return res.data
    },
    onSuccess: () => {
      setNewProdEnvId('')
      setNewProdName('')
      setNewProdType('Software')
      setNewProdVendor('')
      setNewProdVersion('')
      setNewProdStatus('Active')
      setNewProdSupport('Standard')
      setNewProdDeploymentDate('')
      qc.invalidateQueries({ queryKey: ['assets-products', customerId] })
      qc.invalidateQueries({ queryKey: ['assets-summary', customerId] })
      toast.showToast('Installed product added.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to add installed product.'
      toast.showToast(msg, 'error')
    },
  })

  const updateEnvironment = useMutation({
    mutationFn: async (payload: Partial<Environment> & { _id: string }) => {
      const { _id, ...rest } = payload
      const res = await http.put(`/api/assets/environments/${_id}`, rest)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets-environments', customerId] })
      qc.invalidateQueries({ queryKey: ['assets-summary', customerId] })
      setEditingEnv(null)
      toast.showToast('Environment updated.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to update environment.'
      toast.showToast(msg, 'error')
    },
  })

  const updateProduct = useMutation({
    mutationFn: async (payload: Partial<InstalledProduct> & { _id: string }) => {
      const { _id, ...rest } = payload
      const res = await http.put(`/api/assets/products/${_id}`, rest)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets-products', customerId] })
      qc.invalidateQueries({ queryKey: ['assets-summary', customerId] })
      setEditingProd(null)
      toast.showToast('Installed product updated.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to update installed product.'
      toast.showToast(msg, 'error')
    },
  })

  const createLicense = useMutation({
    mutationFn: async () => {
      if (!licenseProduct) throw new Error('No product selected.')
      const payload: any = {
        productId: licenseProduct._id,
        licenseType: licenseType as any,
        licenseIdentifier: licenseIdentifier.trim() || undefined,
        licenseKey: licenseKey.trim() || undefined,
        licenseCount: Number(licenseCount) || 1,
        seatsAssigned: Number(licenseSeatsAssigned) || 0,
        renewalStatus: licenseRenewalStatus as any,
      }
      if (licenseExpiration) {
        const d = new Date(licenseExpiration)
        if (!Number.isNaN(d.getTime())) {
          payload.expirationDate = d.toISOString()
        }
      }
      if (licenseCost.trim()) {
        const c = Number(licenseCost)
        if (Number.isFinite(c)) payload.cost = c
      }
      const res = await http.post('/api/assets/licenses', payload)
      return res.data
    },
    onSuccess: () => {
      if (licenseProduct) {
        qc.invalidateQueries({ queryKey: ['assets-licenses', licenseProduct._id] })
        qc.invalidateQueries({ queryKey: ['assets-summary', customerId] })
      }
      setEditingLicense(null)
      toast.showToast('License added.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to add license.'
      toast.showToast(msg, 'error')
    },
  })

  const updateLicense = useMutation({
    mutationFn: async () => {
      if (!editingLicense) throw new Error('No license selected.')
      const payload: any = {
        licenseType: licenseType as any,
        licenseIdentifier: licenseIdentifier.trim() || undefined,
        licenseKey: licenseKey.trim() || undefined,
        licenseCount: Number(licenseCount) || 1,
        seatsAssigned: Number(licenseSeatsAssigned) || 0,
        renewalStatus: licenseRenewalStatus as any,
      }
      if (licenseExpiration) {
        const d = new Date(licenseExpiration)
        if (!Number.isNaN(d.getTime())) {
          payload.expirationDate = d.toISOString()
        }
      } else {
        payload.expirationDate = null
      }
      if (licenseCost.trim()) {
        const c = Number(licenseCost)
        if (Number.isFinite(c)) payload.cost = c
      } else {
        payload.cost = undefined
      }
      const res = await http.put(`/api/assets/licenses/${editingLicense._id}`, payload)
      return res.data
    },
    onSuccess: () => {
      if (licenseProduct) {
        qc.invalidateQueries({ queryKey: ['assets-licenses', licenseProduct._id] })
        qc.invalidateQueries({ queryKey: ['assets-summary', customerId] })
      }
      setEditingLicense(null)
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
          <div className="space-y-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 text-[11px]">
            <div className="mb-1 font-semibold text-[color:var(--color-text)]">Add environment</div>
            <div className="space-y-2">
              <input
                type="text"
                value={newEnvName}
                onChange={(e) => setNewEnvName(e.target.value)}
                placeholder="Environment name (e.g., Production)"
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
              />
              <div className="flex gap-2">
                <select
                  value={newEnvType}
                  onChange={(e) => setNewEnvType(e.target.value)}
                  className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                >
                  <option value="Production">Production</option>
                  <option value="UAT">UAT</option>
                  <option value="Dev">Dev</option>
                  <option value="Sandbox">Sandbox</option>
                  <option value="Retail Store">Retail Store</option>
                  <option value="Satellite Office">Satellite Office</option>
                  <option value="Cloud Tenant">Cloud Tenant</option>
                </select>
                <select
                  value={newEnvStatus}
                  onChange={(e) => setNewEnvStatus(e.target.value)}
                  className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Planned">Planned</option>
                  <option value="Retired">Retired</option>
                </select>
              </div>
              <input
                type="text"
                value={newEnvLocation}
                onChange={(e) => setNewEnvLocation(e.target.value)}
                placeholder="Location (optional)"
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
              />
              <textarea
                value={newEnvNotes}
                onChange={(e) => setNewEnvNotes(e.target.value)}
                rows={2}
                placeholder="Notes (optional)"
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!newEnvName.trim()) {
                      toast.showToast('Environment name is required.', 'error')
                      return
                    }
                    createEnvironment.mutate()
                  }}
                  disabled={createEnvironment.isPending || !customerId}
                  className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
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
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[color:var(--color-muted)] px-2 py-0.5 text-[10px] uppercase">
                        {env.environmentType}
                      </span>
                      <button
                        type="button"
                        className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[color:var(--color-muted)]"
                        onClick={() => setEditingEnv(env)}
                      >
                        Edit
                      </button>
                    </div>
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
        <div className="lg:col-span-2 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 space-y-3">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[color:var(--color-text-muted)]">
            <span>Installed products</span>
            {productsQ.isFetching && <span>Loading…</span>}
          </div>
          <div className="space-y-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 text-[11px]">
            <div className="mb-1 font-semibold text-[color:var(--color-text)]">Add installed product</div>
            <div className="grid gap-2 md:grid-cols-4">
              <div className="md:col-span-2">
                <input
                  type="text"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder="Product name"
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
                />
              </div>
              <div>
                <select
                  value={newProdEnvId}
                  onChange={(e) => setNewProdEnvId(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                >
                  <option value="">Environment…</option>
                  {environments.map((env) => (
                    <option key={env._id} value={env._id}>
                      {env.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  value={newProdType}
                  onChange={(e) => setNewProdType(e.target.value)}
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
                <input
                  type="text"
                  value={newProdVendor}
                  onChange={(e) => setNewProdVendor(e.target.value)}
                  placeholder="Vendor"
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
                />
              </div>
              <div>
                <input
                  type="text"
                  value={newProdVersion}
                  onChange={(e) => setNewProdVersion(e.target.value)}
                  placeholder="Version"
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
                />
              </div>
              <div>
                <select
                  value={newProdStatus}
                  onChange={(e) => setNewProdStatus(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                >
                  <option value="Active">Active</option>
                  <option value="Needs Upgrade">Needs Upgrade</option>
                  <option value="Pending Renewal">Pending Renewal</option>
                  <option value="Retired">Retired</option>
                </select>
              </div>
              <div>
                <select
                  value={newProdSupport}
                  onChange={(e) => setNewProdSupport(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                >
                  <option value="Basic">Basic</option>
                  <option value="Standard">Standard</option>
                  <option value="Premium">Premium</option>
                </select>
              </div>
              <div>
                <input
                  type="date"
                  value={newProdDeploymentDate}
                  onChange={(e) => setNewProdDeploymentDate(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!newProdName.trim()) {
                    toast.showToast('Product name is required.', 'error')
                    return
                  }
                  if (!newProdEnvId) {
                    toast.showToast('Select an environment for this product.', 'error')
                    return
                  }
                  createProduct.mutate()
                }}
                disabled={createProduct.isPending || !customerId}
                className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
              >
                Add
              </button>
            </div>
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
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium text-[color:var(--color-text)]">{p.productName}</div>
                            <button
                              type="button"
                              className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[color:var(--color-muted)]"
                              onClick={() => setEditingProd(p)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[color:var(--color-muted)]"
                              onClick={() => {
                                setLicenseProduct(p)
                                setEditingLicense(null)
                                setLicenseType('Subscription')
                                setLicenseIdentifier('')
                                setLicenseKey('')
                                setLicenseCount('1')
                                setLicenseSeatsAssigned('0')
                                setLicenseExpiration('')
                                setLicenseRenewalStatus('Active')
                                setLicenseCost('')
                              }}
                            >
                              Licenses
                            </button>
                          </div>
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

      {/* Edit environment modal */}
      {editingEnv && (
        <div className="fixed inset-0 z-[2147483647]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditingEnv(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,28rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl text-xs">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Edit environment</div>
                  <div className="text-[11px] text-[color:var(--color-text-muted)]">{editingEnv.name}</div>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Name</label>
                  <input
                    type="text"
                    defaultValue={editingEnv.name}
                    onBlur={(e) => setEditingEnv({ ...editingEnv, name: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Type</label>
                    <select
                      defaultValue={editingEnv.environmentType}
                      onChange={(e) =>
                        setEditingEnv({
                          ...editingEnv,
                          environmentType: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                    >
                      <option value="Production">Production</option>
                      <option value="UAT">UAT</option>
                      <option value="Dev">Dev</option>
                      <option value="Sandbox">Sandbox</option>
                      <option value="Retail Store">Retail Store</option>
                      <option value="Satellite Office">Satellite Office</option>
                      <option value="Cloud Tenant">Cloud Tenant</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Status</label>
                    <select
                      defaultValue={editingEnv.status}
                      onChange={(e) =>
                        setEditingEnv({
                          ...editingEnv,
                          status: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Planned">Planned</option>
                      <option value="Retired">Retired</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Location</label>
                  <input
                    type="text"
                    defaultValue={editingEnv.location ?? ''}
                    onBlur={(e) => setEditingEnv({ ...editingEnv, location: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Notes</label>
                  <textarea
                    rows={3}
                    defaultValue={editingEnv.notes ?? ''}
                    onBlur={(e) => setEditingEnv({ ...editingEnv, notes: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-1.5 text-[11px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
                  onClick={() => setEditingEnv(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={updateEnvironment.isPending}
                  className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                  onClick={() => {
                    if (!editingEnv) return
                    updateEnvironment.mutate({
                      _id: editingEnv._id,
                      name: editingEnv.name,
                      environmentType: editingEnv.environmentType,
                      status: editingEnv.status,
                      location: editingEnv.location,
                      notes: editingEnv.notes,
                    })
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit product modal */}
      {editingProd && (
        <div className="fixed inset-0 z-[2147483647]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditingProd(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,36rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl text-xs">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Edit installed product</div>
                  <div className="text-[11px] text-[color:var(--color-text-muted)]">{editingProd.productName}</div>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Product name</label>
                  <input
                    type="text"
                    defaultValue={editingProd.productName}
                    onBlur={(e) => setEditingProd({ ...editingProd, productName: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Environment</label>
                  <select
                    defaultValue={editingProd.environmentId}
                    onChange={(e) => setEditingProd({ ...editingProd, environmentId: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  >
                    {environments.map((env) => (
                      <option key={env._id} value={env._id}>
                        {env.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Type</label>
                  <select
                    defaultValue={editingProd.productType}
                    onChange={(e) => setEditingProd({ ...editingProd, productType: e.target.value })}
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
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Vendor</label>
                  <input
                    type="text"
                    defaultValue={editingProd.vendor ?? ''}
                    onBlur={(e) => setEditingProd({ ...editingProd, vendor: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Version</label>
                  <input
                    type="text"
                    defaultValue={editingProd.version ?? ''}
                    onBlur={(e) => setEditingProd({ ...editingProd, version: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Status</label>
                  <select
                    defaultValue={editingProd.status}
                    onChange={(e) => setEditingProd({ ...editingProd, status: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  >
                    <option value="Active">Active</option>
                    <option value="Needs Upgrade">Needs Upgrade</option>
                    <option value="Pending Renewal">Pending Renewal</option>
                    <option value="Retired">Retired</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Support level</label>
                  <select
                    defaultValue={editingProd.supportLevel ?? 'Standard'}
                    onChange={(e) => setEditingProd({ ...editingProd, supportLevel: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  >
                    <option value="Basic">Basic</option>
                    <option value="Standard">Standard</option>
                    <option value="Premium">Premium</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Deployment date</label>
                  <input
                    type="date"
                    defaultValue={editingProd.deploymentDate ? editingProd.deploymentDate.slice(0, 10) : ''}
                    onChange={(e) => setEditingProd({ ...editingProd, deploymentDate: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-1.5 text-[11px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
                  onClick={() => setEditingProd(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={updateProduct.isPending}
                  className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                  onClick={() => {
                    if (!editingProd) return
                    updateProduct.mutate({
                      _id: editingProd._id,
                      productName: editingProd.productName,
                      environmentId: editingProd.environmentId,
                      productType: editingProd.productType,
                      vendor: editingProd.vendor,
                      version: editingProd.version,
                      status: editingProd.status,
                      supportLevel: editingProd.supportLevel,
                      deploymentDate: editingProd.deploymentDate || undefined,
                    })
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Licenses modal */}
      {licenseProduct && (
        <div className="fixed inset-0 z-[2147483647]">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setLicenseProduct(null)
              setEditingLicense(null)
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,40rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl text-xs">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Licenses</div>
                  <div className="text-[11px] text-[color:var(--color-text-muted)]">{licenseProduct.productName}</div>
                </div>
                {licensesQ.isFetching && (
                  <span className="text-[11px] text-[color:var(--color-text-muted)]">Loading…</span>
                )}
              </div>

              <div className="mb-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-[color:var(--color-text)]">
                    {editingLicense ? 'Edit license' : 'Add license'}
                  </div>
                  {editingLicense && (
                    <button
                      type="button"
                      className="text-[10px] text-[color:var(--color-text-muted)] underline"
                      onClick={() => {
                        setEditingLicense(null)
                        setLicenseType('Subscription')
                        setLicenseIdentifier('')
                        setLicenseKey('')
                        setLicenseCount('1')
                        setLicenseSeatsAssigned('0')
                        setLicenseExpiration('')
                        setLicenseRenewalStatus('Active')
                        setLicenseCost('')
                      }}
                    >
                      Switch to add new
                    </button>
                  )}
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Type</label>
                    <select
                      value={licenseType}
                      onChange={(e) => setLicenseType(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                    >
                      <option value="Subscription">Subscription</option>
                      <option value="Seat-based">Seat-based</option>
                      <option value="Device-based">Device-based</option>
                      <option value="Perpetual">Perpetual</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                      License identifier
                    </label>
                    <input
                      type="text"
                      value={licenseIdentifier}
                      onChange={(e) => setLicenseIdentifier(e.target.value)}
                      placeholder="Agreement ID, SKU, etc."
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">License key</label>
                    <input
                      type="text"
                      value={licenseKey}
                      onChange={(e) => setLicenseKey(e.target.value)}
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
                      value={licenseCount}
                      onChange={(e) => setLicenseCount(e.target.value)}
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
                      value={licenseSeatsAssigned}
                      onChange={(e) => setLicenseSeatsAssigned(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Expiration</label>
                    <input
                      type="date"
                      value={licenseExpiration}
                      onChange={(e) => setLicenseExpiration(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                      Renewal status
                    </label>
                    <select
                      value={licenseRenewalStatus}
                      onChange={(e) => setLicenseRenewalStatus(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                    >
                      <option value="Active">Active</option>
                      <option value="Pending Renewal">Pending Renewal</option>
                      <option value="Expired">Expired</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">Cost (optional)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={licenseCost}
                      onChange={(e) => setLicenseCost(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={createLicense.isPending || updateLicense.isPending}
                    className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                    onClick={() => {
                      if (!licenseCount || Number(licenseCount) <= 0) {
                        toast.showToast('License count must be at least 1.', 'error')
                        return
                      }
                      if (editingLicense) updateLicense.mutate()
                      else createLicense.mutate()
                    }}
                  >
                    {editingLicense ? 'Save changes' : 'Add license'}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-[color:var(--color-text)]">Existing licenses</div>
                {licenses.length === 0 ? (
                  <div className="text-[11px] text-[color:var(--color-text-muted)]">
                    No licenses recorded for this product yet.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {licenses.map((lic) => {
                      const overAllocated = lic.seatsAssigned > lic.licenseCount && lic.licenseCount > 0
                      const expLabel = lic.expirationDate ? formatDateTime(lic.expirationDate) : 'No expiration'
                      return (
                        <li
                          key={lic._id}
                          className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-[color:var(--color-muted)] px-2 py-0.5 text-[10px] uppercase">
                                  {lic.licenseType}
                                </span>
                                <span className="text-[11px] font-medium">
                                  {lic.licenseIdentifier || lic.licenseKey || 'License'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-3 text-[10px] text-[color:var(--color-text-muted)]">
                                <span>
                                  Count: {lic.licenseCount} • Seats assigned:{' '}
                                  <span className={overAllocated ? 'text-[color:var(--color-danger)] font-semibold' : ''}>
                                    {lic.seatsAssigned}
                                  </span>
                                </span>
                                <span>Expires: {expLabel}</span>
                                <span>Status: {lic.renewalStatus}</span>
                                {typeof lic.cost === 'number' && <span>Cost: {lic.cost.toFixed(2)}</span>}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="h-7 rounded border border-[color:var(--color-border)] px-2 py-0 text-[10px] hover:bg-[color:var(--color-muted)]"
                              onClick={() => {
                                setEditingLicense(lic)
                                setLicenseType(lic.licenseType)
                                setLicenseIdentifier(lic.licenseIdentifier ?? '')
                                setLicenseKey(lic.licenseKey ?? '')
                                setLicenseCount(String(lic.licenseCount ?? 1))
                                setLicenseSeatsAssigned(String(lic.seatsAssigned ?? 0))
                                setLicenseExpiration(lic.expirationDate ? lic.expirationDate.slice(0, 10) : '')
                                setLicenseRenewalStatus(lic.renewalStatus)
                                setLicenseCost(
                                  typeof lic.cost === 'number' && Number.isFinite(lic.cost)
                                    ? String(lic.cost)
                                    : '',
                                )
                              }}
                            >
                              Edit
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-1.5 text-[11px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
                  onClick={() => {
                    setLicenseProduct(null)
                    setEditingLicense(null)
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


