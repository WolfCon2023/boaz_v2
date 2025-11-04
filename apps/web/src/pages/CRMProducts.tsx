import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { formatDateTime } from '@/lib/dateFormat'
import { Package, Layers, Tag, FileText, TrendingUp, Download, TrendingDown, DollarSign, PackageIcon, BarChart3, PieChart } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Legend } from 'recharts'

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
  const [activeTab, setActiveTab] = React.useState<'products' | 'bundles' | 'discounts' | 'terms' | 'profitability'>('products')
  const [q, setQ] = React.useState('')
  const [editing, setEditing] = React.useState<Product | Bundle | Discount | CustomTerms | null>(null)
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)
  const [productFormPrice, setProductFormPrice] = React.useState(0)
  const [productFormCost, setProductFormCost] = React.useState(0)

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

  // Update form state when editing product
  React.useEffect(() => {
    if (editing && activeTab === 'products') {
      setProductFormPrice((editing as Product).basePrice || 0)
      setProductFormCost((editing as Product).cost || 0)
    } else if (!editing) {
      setProductFormPrice(0)
      setProductFormCost(0)
    }
  }, [editing, activeTab])

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
        <button
          type="button"
          onClick={() => setActiveTab('profitability')}
          className={`flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'profitability'
              ? 'border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'border-transparent text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          Profitability Report
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
                <th className="px-4 py-2">Cost</th>
                <th className="px-4 py-2">Margin</th>
                <th className="px-4 py-2">Margin %</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const cost = product.cost ?? 0
                const margin = product.basePrice - cost
                const marginPercent = product.basePrice > 0 ? ((margin / product.basePrice) * 100) : 0
                const marginColor = marginPercent >= 50 ? 'text-green-600' : marginPercent >= 30 ? 'text-green-500' : marginPercent >= 10 ? 'text-yellow-600' : 'text-red-600'
                
                return (
                  <tr key={product._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                    <td className="px-4 py-2">{product.sku || '—'}</td>
                    <td className="px-4 py-2">{product.name}</td>
                    <td className="px-4 py-2 capitalize">{product.type}</td>
                    <td className="px-4 py-2">${product.basePrice.toFixed(2)}</td>
                    <td className="px-4 py-2">{cost > 0 ? `$${cost.toFixed(2)}` : '—'}</td>
                    <td className={`px-4 py-2 font-medium ${marginColor}`}>
                      {cost > 0 ? `$${margin.toFixed(2)}` : '—'}
                    </td>
                    <td className={`px-4 py-2 font-medium ${marginColor}`}>
                      {cost > 0 ? `${marginPercent.toFixed(1)}%` : '—'}
                    </td>
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
                )
              })}
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

      {/* Profitability Report Tab */}
      {activeTab === 'profitability' && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Product Profitability Report</h2>
              <button
                type="button"
                onClick={() => {
                  const productsWithCost = products.filter(p => (p.cost ?? 0) > 0)
                  const totalRevenue = productsWithCost.reduce((sum, p) => sum + p.basePrice, 0)
                  const totalCost = productsWithCost.reduce((sum, p) => sum + (p.cost ?? 0), 0)
                  const totalMargin = totalRevenue - totalCost
                  const overallMarginPercent = totalRevenue > 0 ? ((totalMargin / totalRevenue) * 100) : 0
                  
                  const byCategory = productsWithCost.reduce((acc, p) => {
                    const cat = p.category || 'Uncategorized'
                    if (!acc[cat]) {
                      acc[cat] = { revenue: 0, cost: 0, count: 0, products: [] }
                    }
                    acc[cat].revenue += p.basePrice
                    acc[cat].cost += (p.cost ?? 0)
                    acc[cat].count += 1
                    acc[cat].products.push(p)
                    return acc
                  }, {} as Record<string, { revenue: number; cost: number; count: number; products: Product[] }>)
                  
                  // Build CSV data
                  const csvRows: string[] = []
                  
                  // Summary section
                  csvRows.push('PROFITABILITY REPORT SUMMARY')
                  csvRows.push('')
                  csvRows.push('Total Products,' + products.length)
                  csvRows.push('Products with Cost Data,' + productsWithCost.length)
                  csvRows.push('Total Revenue Potential,' + totalRevenue.toFixed(2))
                  csvRows.push('Total Cost,' + totalCost.toFixed(2))
                  csvRows.push('Total Margin,' + totalMargin.toFixed(2))
                  csvRows.push('Overall Margin %,' + overallMarginPercent.toFixed(2) + '%')
                  csvRows.push('')
                  csvRows.push('')
                  
                  // Category breakdown
                  csvRows.push('PROFITABILITY BY CATEGORY')
                  csvRows.push('Category,Product Count,Revenue,Cost,Margin,Margin %')
                  Object.entries(byCategory).forEach(([category, data]) => {
                    const margin = data.revenue - data.cost
                    const marginPercent = data.revenue > 0 ? ((margin / data.revenue) * 100) : 0
                    csvRows.push([
                      category,
                      data.count.toString(),
                      data.revenue.toFixed(2),
                      data.cost.toFixed(2),
                      margin.toFixed(2),
                      marginPercent.toFixed(2) + '%'
                    ].map(x => '"' + String(x).replaceAll('"', '""') + '"').join(','))
                  })
                  csvRows.push('')
                  csvRows.push('')
                  
                  // All products with margins (sorted by margin)
                  csvRows.push('ALL PRODUCTS BY MARGIN')
                  csvRows.push('Product Name,SKU,Category,Type,Price,Cost,Margin,Margin %')
                  [...productsWithCost]
                    .sort((a, b) => {
                      const marginA = a.basePrice - (a.cost ?? 0)
                      const marginB = b.basePrice - (b.cost ?? 0)
                      return marginB - marginA
                    })
                    .forEach((product) => {
                      const cost = product.cost ?? 0
                      const margin = product.basePrice - cost
                      const marginPercent = product.basePrice > 0 ? ((margin / product.basePrice) * 100) : 0
                      csvRows.push([
                        product.name,
                        product.sku || '',
                        product.category || 'Uncategorized',
                        product.type,
                        product.basePrice.toFixed(2),
                        cost.toFixed(2),
                        margin.toFixed(2),
                        marginPercent.toFixed(2) + '%'
                      ].map(x => '"' + String(x).replaceAll('"', '""') + '"').join(','))
                    })
                  
                  const csv = csvRows.join('\n')
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `profitability-report-${new Date().toISOString().split('T')[0]}.csv`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                }}
                className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
            {(() => {
              const productsWithCost = products.filter(p => (p.cost ?? 0) > 0)
              const totalRevenue = productsWithCost.reduce((sum, p) => sum + p.basePrice, 0)
              const totalCost = productsWithCost.reduce((sum, p) => sum + (p.cost ?? 0), 0)
              const totalMargin = totalRevenue - totalCost
              const overallMarginPercent = totalRevenue > 0 ? ((totalMargin / totalRevenue) * 100) : 0
              
              const byCategory = productsWithCost.reduce((acc, p) => {
                const cat = p.category || 'Uncategorized'
                if (!acc[cat]) {
                  acc[cat] = { revenue: 0, cost: 0, count: 0, products: [] }
                }
                acc[cat].revenue += p.basePrice
                acc[cat].cost += (p.cost ?? 0)
                acc[cat].count += 1
                acc[cat].products.push(p)
                return acc
              }, {} as Record<string, { revenue: number; cost: number; count: number; products: Product[] }>)

              // Prepare chart data
              const categoryChartData = Object.entries(byCategory).map(([category, data]) => {
                const margin = data.revenue - data.cost
                const marginPercent = data.revenue > 0 ? ((margin / data.revenue) * 100) : 0
                return {
                  name: category,
                  revenue: data.revenue,
                  cost: data.cost,
                  margin: margin,
                  marginPercent: marginPercent,
                  products: data.count
                }
              }).sort((a, b) => b.margin - a.margin)

              const topProductsChartData = [...productsWithCost]
                .sort((a, b) => {
                  const marginA = a.basePrice - (a.cost ?? 0)
                  const marginB = b.basePrice - (b.cost ?? 0)
                  return marginB - marginA
                })
                .slice(0, 10)
                .map(p => ({
                  name: p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name,
                  fullName: p.name,
                  margin: p.basePrice - (p.cost ?? 0),
                  marginPercent: p.basePrice > 0 ? (((p.basePrice - (p.cost ?? 0)) / p.basePrice) * 100) : 0,
                  revenue: p.basePrice,
                  cost: p.cost ?? 0
                }))

              const pieChartData = categoryChartData.map(cat => ({
                name: cat.name,
                value: cat.margin,
                products: cat.products
              }))

              const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

              return (
                <div className="space-y-8">
                  {/* Summary Cards - Enhanced */}
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="group relative overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]">
                      <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-blue-200/20 dark:bg-blue-800/20 blur-2xl"></div>
                      <div className="relative flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-xs font-medium text-[color:var(--color-text-muted)] uppercase tracking-wide">Total Products</div>
                          <div className="mt-2 text-3xl font-bold text-[color:var(--color-text)]">{products.length}</div>
                          <div className="mt-2 flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                            <PackageIcon className="h-3 w-3" />
                            <span>{productsWithCost.length} with cost data</span>
                          </div>
                        </div>
                        <div className="rounded-xl bg-blue-500/10 p-3">
                          <PackageIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                      </div>
                    </div>

                    <div className="group relative overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]">
                      <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-emerald-200/20 dark:bg-emerald-800/20 blur-2xl"></div>
                      <div className="relative flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-xs font-medium text-[color:var(--color-text-muted)] uppercase tracking-wide">Revenue Potential</div>
                          <div className="mt-2 text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                            ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </div>
                          <div className="mt-2 flex items-center gap-1 text-xs text-[color:var(--color-text-muted)]">
                            <TrendingUp className="h-3 w-3" />
                            <span>Total potential</span>
                          </div>
                        </div>
                        <div className="rounded-xl bg-emerald-500/10 p-3">
                          <DollarSign className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                      </div>
                    </div>

                    <div className="group relative overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]">
                      <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-amber-200/20 dark:bg-amber-800/20 blur-2xl"></div>
                      <div className="relative flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-xs font-medium text-[color:var(--color-text-muted)] uppercase tracking-wide">Total Cost</div>
                          <div className="mt-2 text-3xl font-bold text-amber-700 dark:text-amber-400">
                            ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </div>
                          <div className="mt-2 flex items-center gap-1 text-xs text-[color:var(--color-text-muted)]">
                            <span>COGS</span>
                          </div>
                        </div>
                        <div className="rounded-xl bg-amber-500/10 p-3">
                          <TrendingDown className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                        </div>
                      </div>
                    </div>

                    <div className="group relative overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]">
                      <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-green-200/20 dark:bg-green-800/20 blur-2xl"></div>
                      <div className="relative flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-xs font-medium text-[color:var(--color-text-muted)] uppercase tracking-wide">Profit Margin</div>
                          <div className={`mt-2 text-3xl font-bold ${totalMargin >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                            ${totalMargin.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              overallMarginPercent >= 50 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                              overallMarginPercent >= 30 ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                              overallMarginPercent >= 10 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                              'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                              {overallMarginPercent.toFixed(1)}%
                            </div>
                            <div className="h-1.5 flex-1 rounded-full bg-[color:var(--color-muted)] overflow-hidden">
                              <div 
                                className={`h-full transition-all ${
                                  overallMarginPercent >= 50 ? 'bg-green-500' :
                                  overallMarginPercent >= 30 ? 'bg-green-400' :
                                  overallMarginPercent >= 10 ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(overallMarginPercent, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-xl bg-green-500/10 p-3">
                          <BarChart3 className="h-6 w-6 text-green-600 dark:text-green-400" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Charts Section */}
                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Margin by Category - Bar Chart */}
                    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-sm">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base font-semibold flex items-center gap-2">
                          <BarChart3 className="h-4 w-4" />
                          Margin by Category
                        </h3>
                      </div>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={categoryChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                          <XAxis 
                            dataKey="name" 
                            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis 
                            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                            tickFormatter={(value) => `$${value.toLocaleString()}`}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--color-panel)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '8px',
                              padding: '8px'
                            }}
                            formatter={(value: number, name: string) => {
                              if (name === 'margin') return [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Margin']
                              if (name === 'marginPercent') return [`${value.toFixed(1)}%`, 'Margin %']
                              return [value, name]
                            }}
                          />
                          <Bar dataKey="margin" fill="var(--color-primary-600)" radius={[8, 8, 0, 0]}>
                            {categoryChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Margin Distribution - Pie Chart */}
                    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-sm">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base font-semibold flex items-center gap-2">
                          <PieChart className="h-4 w-4" />
                          Margin Distribution
                        </h3>
                      </div>
                      <ResponsiveContainer width="100%" height={300}>
                        <RechartsPieChart>
                          <Pie
                            data={pieChartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {pieChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--color-panel)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '8px',
                              padding: '8px'
                            }}
                            formatter={(value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          />
                          <Legend />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* By Category - Enhanced Cards */}
                  <div>
                    <h3 className="mb-4 text-base font-semibold flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Profitability by Category
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      {Object.entries(byCategory)
                        .sort(([, a], [, b]) => {
                          const marginA = a.revenue - a.cost
                          const marginB = b.revenue - b.cost
                          return marginB - marginA
                        })
                        .map(([category, data], index) => {
                          const margin = data.revenue - data.cost
                          const marginPercent = data.revenue > 0 ? ((margin / data.revenue) * 100) : 0
                          const color = COLORS[index % COLORS.length]
                          return (
                            <div key={category} className="group relative overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5 shadow-sm transition-all hover:shadow-md hover:border-[color:var(--color-primary-300)]">
                              <div className="absolute top-0 left-0 h-1 w-full" style={{ backgroundColor: color }}></div>
                              <div className="mt-1 flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-semibold text-[color:var(--color-text)]">{category}</h4>
                                    <span className="rounded-full bg-[color:var(--color-muted)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-text-muted)]">
                                      {data.count} {data.count === 1 ? 'product' : 'products'}
                                    </span>
                                  </div>
                                  <div className="mt-3 grid grid-cols-3 gap-4">
                                    <div>
                                      <div className="text-xs text-[color:var(--color-text-muted)]">Revenue</div>
                                      <div className="mt-1 text-sm font-semibold text-[color:var(--color-text)]">
                                        ${data.revenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs text-[color:var(--color-text-muted)]">Cost</div>
                                      <div className="mt-1 text-sm font-semibold text-[color:var(--color-text)]">
                                        ${data.cost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs text-[color:var(--color-text-muted)]">Margin</div>
                                      <div className={`mt-1 text-sm font-semibold ${margin >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                        ${margin.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-4">
                                    <div className="mb-1 flex items-center justify-between text-xs">
                                      <span className="text-[color:var(--color-text-muted)]">Margin Percentage</span>
                                      <span className={`font-semibold ${
                                        marginPercent >= 50 ? 'text-green-600 dark:text-green-400' :
                                        marginPercent >= 30 ? 'text-green-500 dark:text-green-400' :
                                        marginPercent >= 10 ? 'text-yellow-600 dark:text-yellow-400' :
                                        'text-red-600 dark:text-red-400'
                                      }`}>
                                        {marginPercent.toFixed(1)}%
                                      </span>
                                    </div>
                                    <div className="h-2 rounded-full bg-[color:var(--color-muted)] overflow-hidden">
                                      <div 
                                        className="h-full transition-all rounded-full"
                                        style={{ 
                                          width: `${Math.min(marginPercent, 100)}%`,
                                          backgroundColor: color
                                        }}
                                      ></div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>

                  {/* Top Products by Margin - Enhanced with Chart */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Top Products by Margin
                      </h3>
                      <span className="text-xs text-[color:var(--color-text-muted)]">Showing top 10</span>
                    </div>
                    
                    {/* Horizontal Bar Chart */}
                    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-sm">
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={topProductsChartData} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                          <XAxis 
                            type="number"
                            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                            tickFormatter={(value) => `$${value.toLocaleString()}`}
                          />
                          <YAxis 
                            type="category" 
                            dataKey="name"
                            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                            width={110}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--color-panel)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '8px',
                              padding: '8px'
                            }}
                            formatter={(value: number, name: string, props: any) => {
                              if (name === 'margin') return [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Margin']
                              if (name === 'marginPercent') return [`${value.toFixed(1)}%`, 'Margin %']
                              if (name === 'revenue') return [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Price']
                              if (name === 'cost') return [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Cost']
                              return [value, name]
                            }}
                            labelFormatter={(label) => `Product: ${topProductsChartData.find(d => d.name === label)?.fullName || label}`}
                          />
                          <Bar dataKey="margin" fill="var(--color-primary-600)" radius={[0, 8, 8, 0]}>
                            {topProductsChartData.map((entry, index) => {
                              const color = entry.marginPercent >= 50 ? '#10b981' : entry.marginPercent >= 30 ? '#3b82f6' : entry.marginPercent >= 10 ? '#f59e0b' : '#ef4444'
                              return <Cell key={`cell-${index}`} fill={color} />
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Enhanced Table */}
                    <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[color:var(--color-muted)]">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[color:var(--color-text-muted)]">Product</th>
                              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[color:var(--color-text-muted)]">Category</th>
                              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[color:var(--color-text-muted)]">Price</th>
                              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[color:var(--color-text-muted)]">Cost</th>
                              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[color:var(--color-text-muted)]">Margin</th>
                              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[color:var(--color-text-muted)]">Margin %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[color:var(--color-border)]">
                            {topProductsChartData.map((product, index) => {
                              const marginColor = product.marginPercent >= 50 ? 'text-green-600 dark:text-green-400' : 
                                                  product.marginPercent >= 30 ? 'text-green-500 dark:text-green-400' : 
                                                  product.marginPercent >= 10 ? 'text-yellow-600 dark:text-yellow-400' : 
                                                  'text-red-600 dark:text-red-400'
                              
                              return (
                                <tr key={product.fullName} className="transition-colors hover:bg-[color:var(--color-muted)]">
                                  <td className="px-6 py-4">
                                    <div className="font-medium text-[color:var(--color-text)]">{product.fullName}</div>
                                    {products.find(p => p.name === product.fullName)?.sku && (
                                      <div className="text-xs text-[color:var(--color-text-muted)] mt-0.5">
                                        SKU: {products.find(p => p.name === product.fullName)?.sku}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className="inline-flex items-center rounded-full bg-[color:var(--color-muted)] px-2.5 py-0.5 text-xs font-medium text-[color:var(--color-text)]">
                                      {products.find(p => p.name === product.fullName)?.category || 'Uncategorized'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-right font-medium text-[color:var(--color-text)]">
                                    ${product.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-6 py-4 text-right font-medium text-[color:var(--color-text)]">
                                    ${product.cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className={`px-6 py-4 text-right font-semibold ${marginColor}`}>
                                    ${product.margin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center justify-end gap-2">
                                      <span className={`font-semibold ${marginColor}`}>
                                        {product.marginPercent.toFixed(1)}%
                                      </span>
                                      <div className="w-16 h-2 rounded-full bg-[color:var(--color-muted)] overflow-hidden">
                                        <div 
                                          className={`h-full transition-all ${
                                            product.marginPercent >= 50 ? 'bg-green-500' :
                                            product.marginPercent >= 30 ? 'bg-green-400' :
                                            product.marginPercent >= 10 ? 'bg-yellow-500' :
                                            'bg-red-500'
                                          }`}
                                          style={{ width: `${Math.min(product.marginPercent, 100)}%` }}
                                        ></div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
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
              {activeTab === 'products' && (() => {
                const margin = productFormPrice - productFormCost
                const marginPercent = productFormPrice > 0 ? ((margin / productFormPrice) * 100) : 0
                const marginColor = marginPercent >= 50 ? 'text-green-600' : marginPercent >= 30 ? 'text-green-500' : marginPercent >= 10 ? 'text-yellow-600' : 'text-red-600'
                
                return (
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
                      <input 
                        name="basePrice" 
                        type="number" 
                        step="0.01" 
                        required 
                        defaultValue={(editing as Product).basePrice || 0} 
                        onChange={(e) => setProductFormPrice(parseFloat(e.target.value) || 0)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Currency</label>
                      <input name="currency" defaultValue={(editing as Product).currency || 'USD'} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Cost (COGS)</label>
                      <input 
                        name="cost" 
                        type="number" 
                        step="0.01" 
                        defaultValue={(editing as Product).cost} 
                        onChange={(e) => setProductFormCost(parseFloat(e.target.value) || 0)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" 
                      />
                      <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">Cost of goods sold - used for margin calculations</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Tax Rate (%)</label>
                      <input name="taxRate" type="number" step="0.01" defaultValue={(editing as Product).taxRate} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    </div>
                    {productFormCost > 0 && (
                      <div className="sm:col-span-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3">
                        <div className="text-xs text-[color:var(--color-text-muted)] mb-1">Projected Margin</div>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium">Margin: </span>
                            <span className={`font-semibold ${marginColor}`}>
                              ${margin.toFixed(2)} ({marginPercent.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
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
                )
              })()}

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

