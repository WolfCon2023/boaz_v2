import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { formatDateTime } from '@/lib/dateFormat'
import { Package, Layers, Tag, FileText } from 'lucide-react'

type Product = {
  _id: string
  sku?: string
  name: string
  description?: string
  type: 'product' | 'service' | 'bundle'
  basePrice: number
  currency?: string
  cost?: number
  taxRate?: number
  isActive?: boolean
  category?: string
  tags?: string[]
  createdAt?: string
  updatedAt?: string
}

type Bundle = {
  _id: string
  sku?: string
  name: string
  description?: string
  items: Array<{
    productId: string
    quantity: number
    priceOverride?: number
  }>
  bundlePrice: number
  currency?: string
  isActive?: boolean
  category?: string
  tags?: string[]
  createdAt?: string
  updatedAt?: string
}

type Discount = {
  _id: string
  code?: string
  name: string
  description?: string
  type: 'percentage' | 'fixed' | 'tiered'
  value: number
  scope: 'global' | 'product' | 'bundle' | 'account'
  productIds?: string[]
  bundleIds?: string[]
  accountIds?: string[]
  minQuantity?: number
  minAmount?: number
  maxDiscount?: number
  startDate?: string
  endDate?: string
  isActive?: boolean
  usageLimit?: number
  usageCount?: number
  createdAt?: string
  updatedAt?: string
}

type CustomTerms = {
  _id: string
  name: string
  description?: string
  content: string
  isDefault?: boolean
  accountIds?: string[]
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

export default function CRMProducts() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = React.useState<'products' | 'bundles' | 'discounts' | 'terms'>('products')
  const [q, setQ] = React.useState('')
  const [editing, setEditing] = React.useState<Product | Bundle | Discount | CustomTerms | null>(null)
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)

  // Products query
  const { data: productsData } = useQuery({
    queryKey: ['products', q],
    queryFn: async () => {
      const res = await http.get('/api/crm/products', { params: { q, sort: 'updatedAt', dir: 'desc' } })
      return res.data as { data: { items: Product[] } }
    },
  })
  const products = productsData?.data.items ?? []

  // Bundles query
  const { data: bundlesData } = useQuery({
    queryKey: ['bundles', q],
    queryFn: async () => {
      const res = await http.get('/api/crm/products/bundles', { params: { q, sort: 'updatedAt', dir: 'desc' } })
      return res.data as { data: { items: Bundle[] } }
    },
  })
  const bundles = bundlesData?.data.items ?? []

  // Discounts query
  const { data: discountsData } = useQuery({
    queryKey: ['discounts', q],
    queryFn: async () => {
      const res = await http.get('/api/crm/products/discounts', { params: { q, sort: 'updatedAt', dir: 'desc' } })
      return res.data as { data: { items: Discount[] } }
    },
  })
  const discounts = discountsData?.data.items ?? []

  // Terms query
  const { data: termsData } = useQuery({
    queryKey: ['terms', q],
    queryFn: async () => {
      const res = await http.get('/api/crm/products/terms', { params: { q, sort: 'updatedAt', dir: 'desc' } })
      return res.data as { data: { items: CustomTerms[] } }
    },
  })
  const terms = termsData?.data.items ?? []

  // Products mutations
  const createProduct = useMutation({
    mutationFn: async (payload: any) => {
      const res = await http.post('/api/crm/products', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      setEditing(null)
    },
  })

  const updateProduct = useMutation({
    mutationFn: async ({ _id, ...rest }: any) => {
      const res = await http.put(`/api/crm/products/${_id}`, rest)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      setEditing(null)
    },
  })

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/api/crm/products/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })

  // Bundles mutations
  const createBundle = useMutation({
    mutationFn: async (payload: any) => {
      const res = await http.post('/api/crm/products/bundles', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bundles'] })
      setEditing(null)
    },
  })

  const updateBundle = useMutation({
    mutationFn: async ({ _id, ...rest }: any) => {
      const res = await http.put(`/api/crm/products/bundles/${_id}`, rest)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bundles'] })
      setEditing(null)
    },
  })

  const deleteBundle = useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/api/crm/products/bundles/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bundles'] })
    },
  })

  // Discounts mutations
  const createDiscount = useMutation({
    mutationFn: async (payload: any) => {
      const res = await http.post('/api/crm/products/discounts', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discounts'] })
      setEditing(null)
    },
  })

  const updateDiscount = useMutation({
    mutationFn: async ({ _id, ...rest }: any) => {
      const res = await http.put(`/api/crm/products/discounts/${_id}`, rest)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discounts'] })
      setEditing(null)
    },
  })

  const deleteDiscount = useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/api/crm/products/discounts/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discounts'] })
    },
  })

  // Terms mutations
  const createTerms = useMutation({
    mutationFn: async (payload: any) => {
      const res = await http.post('/api/crm/products/terms', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['terms'] })
      setEditing(null)
    },
  })

  const updateTerms = useMutation({
    mutationFn: async ({ _id, ...rest }: any) => {
      const res = await http.put(`/api/crm/products/terms/${_id}`, rest)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['terms'] })
      setEditing(null)
    },
  })

  const deleteTerms = useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/api/crm/products/terms/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['terms'] })
    },
  })

  React.useEffect(() => {
    if (!editing) return
    const el = document.createElement('div')
    el.setAttribute('data-overlay', 'product-editor')
    Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' })
    document.body.appendChild(el)
    setPortalEl(el)
    return () => {
      try {
        document.body.removeChild(el)
      } catch {}
      setPortalEl(null)
    }
  }, [editing])

  return (
    <div className="space-y-4">
      <CRMNav />
      <h1 className="text-xl font-semibold">Product Catalog & Pricing</h1>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[color:var(--color-border)]">
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'products'
              ? 'border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'border-transparent text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <Package className="h-4 w-4" />
          Products
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('bundles')}
          className={`flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'bundles'
              ? 'border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'border-transparent text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <Layers className="h-4 w-4" />
          Bundles
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('discounts')}
          className={`flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'discounts'
              ? 'border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'border-transparent text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <Tag className="h-4 w-4" />
          Discounts
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('terms')}
          className={`flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'terms'
              ? 'border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'border-transparent text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <FileText className="h-4 w-4" />
          Custom Terms
        </button>
      </div>

      {/* Products Tab */}
      {activeTab === 'products' && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <div className="flex flex-wrap items-center gap-2 p-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products..."
              className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setEditing({} as Product)}
              className="ml-auto rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
            >
              New Product
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-[color:var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Price</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                  <td className="px-4 py-2">{product.sku || '—'}</td>
                  <td className="px-4 py-2">{product.name}</td>
                  <td className="px-4 py-2 capitalize">{product.type}</td>
                  <td className="px-4 py-2">${product.basePrice.toFixed(2)}</td>
                  <td className="px-4 py-2">{product.category || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${product.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {product.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2">{product.updatedAt ? formatDateTime(product.updatedAt) : '—'}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(product)}
                        className="rounded border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete "${product.name}"?`)) deleteProduct.mutate(product._id)
                        }}
                        className="rounded border border-red-400 px-2 py-1 text-xs text-red-400 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bundles Tab */}
      {activeTab === 'bundles' && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <div className="flex flex-wrap items-center gap-2 p-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search bundles..."
              className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setEditing({} as Bundle)}
              className="ml-auto rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
            >
              New Bundle
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-[color:var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Items</th>
                <th className="px-4 py-2">Bundle Price</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bundles.map((bundle) => (
                <tr key={bundle._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                  <td className="px-4 py-2">{bundle.sku || '—'}</td>
                  <td className="px-4 py-2">{bundle.name}</td>
                  <td className="px-4 py-2">{bundle.items?.length || 0} items</td>
                  <td className="px-4 py-2">${bundle.bundlePrice.toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${bundle.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {bundle.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2">{bundle.updatedAt ? formatDateTime(bundle.updatedAt) : '—'}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(bundle)}
                        className="rounded border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete "${bundle.name}"?`)) deleteBundle.mutate(bundle._id)
                        }}
                        className="rounded border border-red-400 px-2 py-1 text-xs text-red-400 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Discounts Tab */}
      {activeTab === 'discounts' && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <div className="flex flex-wrap items-center gap-2 p-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search discounts..."
              className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setEditing({} as Discount)}
              className="ml-auto rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
            >
              New Discount
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-[color:var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Value</th>
                <th className="px-4 py-2">Scope</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((discount) => (
                <tr key={discount._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                  <td className="px-4 py-2">{discount.code || '—'}</td>
                  <td className="px-4 py-2">{discount.name}</td>
                  <td className="px-4 py-2 capitalize">{discount.type}</td>
                  <td className="px-4 py-2">
                    {discount.type === 'percentage' ? `${discount.value}%` : `$${discount.value.toFixed(2)}`}
                  </td>
                  <td className="px-4 py-2 capitalize">{discount.scope}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${discount.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {discount.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2">{discount.updatedAt ? formatDateTime(discount.updatedAt) : '—'}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(discount)}
                        className="rounded border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete "${discount.name}"?`)) deleteDiscount.mutate(discount._id)
                        }}
                        className="rounded border border-red-400 px-2 py-1 text-xs text-red-400 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Terms Tab */}
      {activeTab === 'terms' && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <div className="flex flex-wrap items-center gap-2 p-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search terms..."
              className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setEditing({} as CustomTerms)}
              className="ml-auto rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
            >
              New Terms
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-[color:var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Default</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {terms.map((term) => (
                <tr key={term._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                  <td className="px-4 py-2">{term.name}</td>
                  <td className="px-4 py-2">
                    {term.isDefault && <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">Default</span>}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${term.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {term.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2">{term.updatedAt ? formatDateTime(term.updatedAt) : '—'}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(term)}
                        className="rounded border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete "${term.name}"?`)) deleteTerms.mutate(term._id)
                        }}
                        className="rounded border border-red-400 px-2 py-1 text-xs text-red-400 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Editor Modal */}
      {editing && portalEl && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4 overflow-y-auto">
            <div className="w-[min(90vw,48rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-2xl my-8">
              <div className="mb-4 text-lg font-semibold">
                {activeTab === 'products' && (editing._id ? 'Edit Product' : 'New Product')}
                {activeTab === 'bundles' && (editing._id ? 'Edit Bundle' : 'New Bundle')}
                {activeTab === 'discounts' && (editing._id ? 'Edit Discount' : 'New Discount')}
                {activeTab === 'terms' && (editing._id ? 'Edit Terms' : 'New Terms')}
              </div>

              {/* Product Form */}
              {activeTab === 'products' && (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const fd = new FormData(e.currentTarget)
                    const payload: any = {
                      sku: String(fd.get('sku') || '').trim() || undefined,
                      name: String(fd.get('name') || '').trim(),
                      description: String(fd.get('description') || '').trim() || undefined,
                      type: String(fd.get('type') || 'product'),
                      basePrice: Number(fd.get('basePrice') || 0),
                      currency: String(fd.get('currency') || 'USD'),
                      cost: fd.get('cost') ? Number(fd.get('cost')) : undefined,
                      taxRate: fd.get('taxRate') ? Number(fd.get('taxRate')) : undefined,
                      isActive: fd.get('isActive') === 'on',
                      category: String(fd.get('category') || '').trim() || undefined,
                    }
                    if (editing._id) {
                      updateProduct.mutate({ _id: editing._id, ...payload })
                    } else {
                      createProduct.mutate(payload)
                    }
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium mb-1">SKU</label>
                      <input name="sku" defaultValue={(editing as Product).sku} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Name *</label>
                      <input name="name" required defaultValue={(editing as Product).name} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea name="description" defaultValue={(editing as Product).description} rows={3} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Type</label>
                      <select name="type" defaultValue={(editing as Product).type || 'product'} className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm">
                        <option value="product">Product</option>
                        <option value="service">Service</option>
                        <option value="bundle">Bundle</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Base Price *</label>
                      <input name="basePrice" type="number" step="0.01" required defaultValue={(editing as Product).basePrice || 0} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Currency</label>
                      <input name="currency" defaultValue={(editing as Product).currency || 'USD'} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Cost</label>
                      <input name="cost" type="number" step="0.01" defaultValue={(editing as Product).cost} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Tax Rate (%)</label>
                      <input name="taxRate" type="number" step="0.01" defaultValue={(editing as Product).taxRate} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Category</label>
                      <input name="category" defaultValue={(editing as Product).category} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="flex items-center gap-2">
                        <input name="isActive" type="checkbox" defaultChecked={(editing as Product).isActive !== false} className="rounded border-[color:var(--color-border)]" />
                        <span className="text-sm">Active</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4 border-t border-[color:var(--color-border)]">
                    <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]">
                      Cancel
                    </button>
                    <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">
                      Save
                    </button>
                  </div>
                </form>
              )}

              {/* Bundle Form */}
              {activeTab === 'bundles' && (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const fd = new FormData(e.currentTarget)
                    const payload: any = {
                      sku: String(fd.get('sku') || '').trim() || undefined,
                      name: String(fd.get('name') || '').trim(),
                      description: String(fd.get('description') || '').trim() || undefined,
                      bundlePrice: Number(fd.get('bundlePrice') || 0),
                      currency: String(fd.get('currency') || 'USD'),
                      isActive: fd.get('isActive') === 'on',
                      items: [], // TODO: Implement bundle items editor
                    }
                    if (editing._id) {
                      updateBundle.mutate({ _id: editing._id, ...payload })
                    } else {
                      createBundle.mutate(payload)
                    }
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium mb-1">SKU</label>
                      <input name="sku" defaultValue={(editing as Bundle).sku} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Name *</label>
                      <input name="name" required defaultValue={(editing as Bundle).name} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea name="description" defaultValue={(editing as Bundle).description} rows={3} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Bundle Price *</label>
                      <input name="bundlePrice" type="number" step="0.01" required defaultValue={(editing as Bundle).bundlePrice || 0} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Currency</label>
                      <input name="currency" defaultValue={(editing as Bundle).currency || 'USD'} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="flex items-center gap-2">
                        <input name="isActive" type="checkbox" defaultChecked={(editing as Bundle).isActive !== false} className="rounded border-[color:var(--color-border)]" />
                        <span className="text-sm">Active</span>
                      </label>
                      <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">Note: Bundle items editor coming soon. Use the API to manage items.</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4 border-t border-[color:var(--color-border)]">
                    <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]">
                      Cancel
                    </button>
                    <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">
                      Save
                    </button>
                  </div>
                </form>
              )}

              {/* Discount Form */}
              {activeTab === 'discounts' && (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const fd = new FormData(e.currentTarget)
                    const payload: any = {
                      code: String(fd.get('code') || '').trim().toUpperCase() || undefined,
                      name: String(fd.get('name') || '').trim(),
                      description: String(fd.get('description') || '').trim() || undefined,
                      type: String(fd.get('type') || 'percentage'),
                      value: Number(fd.get('value') || 0),
                      scope: String(fd.get('scope') || 'global'),
                      minQuantity: fd.get('minQuantity') ? Number(fd.get('minQuantity')) : undefined,
                      minAmount: fd.get('minAmount') ? Number(fd.get('minAmount')) : undefined,
                      maxDiscount: fd.get('maxDiscount') ? Number(fd.get('maxDiscount')) : undefined,
                      startDate: fd.get('startDate') ? String(fd.get('startDate')) : undefined,
                      endDate: fd.get('endDate') ? String(fd.get('endDate')) : undefined,
                      isActive: fd.get('isActive') === 'on',
                      usageLimit: fd.get('usageLimit') ? Number(fd.get('usageLimit')) : undefined,
                    }
                    if (editing._id) {
                      updateDiscount.mutate({ _id: editing._id, ...payload })
                    } else {
                      createDiscount.mutate(payload)
                    }
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium mb-1">Code</label>
                      <input name="code" defaultValue={(editing as Discount).code} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Name *</label>
                      <input name="name" required defaultValue={(editing as Discount).name} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea name="description" defaultValue={(editing as Discount).description} rows={2} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Type</label>
                      <select name="type" defaultValue={(editing as Discount).type || 'percentage'} className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm">
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed Amount</option>
                        <option value="tiered">Tiered</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Value *</label>
                      <input name="value" type="number" step="0.01" required defaultValue={(editing as Discount).value || 0} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Scope</label>
                      <select name="scope" defaultValue={(editing as Discount).scope || 'global'} className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm">
                        <option value="global">Global</option>
                        <option value="product">Product</option>
                        <option value="bundle">Bundle</option>
                        <option value="account">Account</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Min Quantity</label>
                      <input name="minQuantity" type="number" defaultValue={(editing as Discount).minQuantity} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Min Amount</label>
                      <input name="minAmount" type="number" step="0.01" defaultValue={(editing as Discount).minAmount} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Max Discount</label>
                      <input name="maxDiscount" type="number" step="0.01" defaultValue={(editing as Discount).maxDiscount} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Usage Limit</label>
                      <input name="usageLimit" type="number" defaultValue={(editing as Discount).usageLimit} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Start Date</label>
                      <input name="startDate" type="date" defaultValue={(editing as Discount).startDate ? new Date((editing as Discount).startDate!).toISOString().split('T')[0] : ''} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">End Date</label>
                      <input name="endDate" type="date" defaultValue={(editing as Discount).endDate ? new Date((editing as Discount).endDate!).toISOString().split('T')[0] : ''} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="flex items-center gap-2">
                        <input name="isActive" type="checkbox" defaultChecked={(editing as Discount).isActive !== false} className="rounded border-[color:var(--color-border)]" />
                        <span className="text-sm">Active</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4 border-t border-[color:var(--color-border)]">
                    <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]">
                      Cancel
                    </button>
                    <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">
                      Save
                    </button>
                  </div>
                </form>
              )}

              {/* Terms Form */}
              {activeTab === 'terms' && (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const fd = new FormData(e.currentTarget)
                    const payload: any = {
                      name: String(fd.get('name') || '').trim(),
                      description: String(fd.get('description') || '').trim() || undefined,
                      content: String(fd.get('content') || '').trim(),
                      isDefault: fd.get('isDefault') === 'on',
                      isActive: fd.get('isActive') === 'on',
                    }
                    if (editing._id) {
                      updateTerms.mutate({ _id: editing._id, ...payload })
                    } else {
                      createTerms.mutate(payload)
                    }
                  }}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium mb-1">Name *</label>
                      <input name="name" required defaultValue={(editing as CustomTerms).name} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <input name="description" defaultValue={(editing as CustomTerms).description} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium mb-1">Content *</label>
                      <textarea name="content" required defaultValue={(editing as CustomTerms).content} rows={10} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm font-mono" />
                    </div>
                    <div className="sm:col-span-2 space-y-2">
                      <label className="flex items-center gap-2">
                        <input name="isDefault" type="checkbox" defaultChecked={(editing as CustomTerms).isDefault} className="rounded border-[color:var(--color-border)]" />
                        <span className="text-sm">Set as default terms</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input name="isActive" type="checkbox" defaultChecked={(editing as CustomTerms).isActive !== false} className="rounded border-[color:var(--color-border)]" />
                        <span className="text-sm">Active</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4 border-t border-[color:var(--color-border)]">
                    <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]">
                      Cancel
                    </button>
                    <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">
                      Save
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>,
        portalEl
      )}
    </div>
  )
}

