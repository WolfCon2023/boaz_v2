import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'
import { DocumentsList } from '@/components/DocumentsList'
import { Plus, X, Package, Send } from 'lucide-react'

type Invoice = { 
  _id: string
  invoiceNumber?: number
  title?: string
  total?: number
  balance?: number
  status?: string
  dueDate?: string
  issuedAt?: string
  accountId?: string
  accountNumber?: number
  subtotal?: number
  tax?: number
  items?: InvoiceLineItem[]
  discountCode?: string
  discountId?: string
}

type InvoiceLineItem = {
  productId?: string
  productName?: string
  productSku?: string
  bundleId?: string
  bundleName?: string
  description?: string
  quantity: number
  unitPrice: number
  taxRate?: number
  cost?: number
  lineTotal: number
  isBundle?: boolean
}

type AccountPick = { _id: string; accountNumber?: number; name?: string; primaryContactEmail?: string }

type Product = {
  _id: string
  sku?: string
  name: string
  description?: string
  basePrice: number
  taxRate?: number
  cost?: number
  isActive?: boolean
  type?: string
}

type Bundle = {
  _id: string
  sku?: string
  name: string
  description?: string
  bundlePrice: number
  items: Array<{
    productId: string
    quantity: number
    priceOverride?: number
  }>
  currency?: string
  isActive?: boolean
}

type Discount = {
  _id: string
  code?: string
  name: string
  description?: string
  type: 'percentage' | 'fixed' | 'tiered'
  value: number
  scope: 'global' | 'product' | 'bundle' | 'account'
  minQuantity?: number
  minAmount?: number
  maxDiscount?: number
  startDate?: string
  endDate?: string
  isActive?: boolean
}

export default function CRMInvoices() {
  const qc = useQueryClient()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [q, setQ] = React.useState('')
  const [sort, setSort] = React.useState<'updatedAt'|'invoiceNumber'|'total'|'status'|'dueDate'>('updatedAt')
  const [dir, setDir] = React.useState<'asc'|'desc'>('desc')
  type ColumnDef = { key: string; visible: boolean; label: string }
  const defaultCols: ColumnDef[] = [
    { key: 'invoiceNumber', visible: true, label: 'Invoice #' },
    { key: 'title', visible: true, label: 'Title' },
    { key: 'account', visible: true, label: 'Account' },
    { key: 'total', visible: true, label: 'Total' },
    { key: 'balance', visible: true, label: 'Balance' },
    { key: 'status', visible: true, label: 'Status' },
    { key: 'dueDate', visible: true, label: 'Due' },
  ]
  const [cols, setCols] = React.useState<ColumnDef[]>(defaultCols)
  const [savedViews, setSavedViews] = React.useState<Array<{ id: string; name: string; config: any }>>([])
  const [showSaveViewDialog, setShowSaveViewDialog] = React.useState(false)
  const [savingViewName, setSavingViewName] = React.useState('')
  const [showColsMenu, setShowColsMenu] = React.useState(false)
  const [draggedCol, setDraggedCol] = React.useState<string | null>(null)
  const initializedFromUrl = React.useRef(false)
  const [inlineEditId, setInlineEditId] = React.useState<string | null>(null)
  const [inlineTitle, setInlineTitle] = React.useState<string>('')
  const [inlineStatus, setInlineStatus] = React.useState<string>('')
  const [inlineDueDate, setInlineDueDate] = React.useState<string>('')
  const { data, isFetching } = useQuery({
    queryKey: ['invoices', q, sort, dir],
    queryFn: async () => {
      const res = await http.get('/api/crm/invoices', { params: { q, sort, dir } })
      return res.data as { data: { items: Invoice[] } }
    },
  })
  const items = data?.data.items ?? []

  const accountsQ = useQuery({
    queryKey: ['accounts-pick'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', { params: { limit: 1000, sort: 'name', dir: 'asc' } })
      return res.data as { data: { items: AccountPick[] } }
    },
  })
  const accounts = accountsQ.data?.data.items ?? []
  const acctById = React.useMemo(() => new Map(accounts.map((a) => [a._id, a])), [accounts])

  // Products query for line items
  const { data: productsData } = useQuery({
    queryKey: ['products-for-invoices'],
    queryFn: async () => {
      const res = await http.get('/api/crm/products', { params: { sort: 'name', dir: 'asc', limit: 1000 } })
      return res.data as { data: { items: Product[] } }
    },
  })
  const products = React.useMemo(() => (productsData?.data.items ?? []).filter((p: Product) => p.isActive !== false && p.type !== 'bundle'), [productsData?.data.items])

  // Bundles query
  const { data: bundlesData } = useQuery({
    queryKey: ['bundles-for-invoices'],
    queryFn: async () => {
      const res = await http.get('/api/crm/products/bundles', { params: { sort: 'name', dir: 'asc', limit: 1000 } })
      return res.data as { data: { items: Bundle[] } }
    },
  })
  const bundles = React.useMemo(() => (bundlesData?.data.items ?? []).filter((b: Bundle) => b.isActive !== false), [bundlesData?.data.items])

  // Discounts query
  const { data: discountsData } = useQuery({
    queryKey: ['discounts-for-invoices'],
    queryFn: async () => {
      const res = await http.get('/api/crm/products/discounts', { params: { sort: 'name', dir: 'asc', limit: 1000 } })
      return res.data as { data: { items: Discount[] } }
    },
  })
  const discounts = React.useMemo(() => (discountsData?.data.items ?? []).filter((d: Discount) => d.isActive !== false), [discountsData?.data.items])

  // Discount code state
  const [discountCode, setDiscountCode] = React.useState('')
  const [appliedDiscount, setAppliedDiscount] = React.useState<Discount | null>(null)

  const create = useMutation({
    mutationFn: async (payload: any) => { const res = await http.post('/api/crm/invoices', payload); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
  const update = useMutation({
    mutationFn: async (payload: any) => { const { _id, ...rest } = payload; const res = await http.put(`/api/crm/invoices/${_id}`, rest); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
  const sendEmail = useMutation({
    mutationFn: async ({ id, recipientEmail }: { id: string; recipientEmail?: string }) => {
      const res = await http.post(`/api/crm/invoices/${id}/send-email`, { recipientEmail })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.showToast('Invoice sent via email', 'success')
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.error || 'Failed to send invoice email'
      toast.showToast(
        errorMsg === 'recipient_email_required' ? 'Please enter a recipient email address' : errorMsg,
        'error',
      )
    },
  })

  function startInlineEdit(inv: Invoice) {
    setInlineEditId(inv._id)
    setInlineTitle(inv.title ?? '')
    setInlineStatus(inv.status ?? '')
    setInlineDueDate(inv.dueDate ? inv.dueDate.slice(0,10) : '')
  }
  async function saveInlineEdit() {
    if (!inlineEditId) return
    const payload: any = { _id: inlineEditId }
    payload.title = inlineTitle || undefined
    payload.status = inlineStatus || undefined
    payload.dueDate = inlineDueDate || undefined
    await update.mutateAsync(payload)
    cancelInlineEdit()
  }
  function cancelInlineEdit() {
    setInlineEditId(null)
    setInlineTitle('')
    setInlineStatus('')
    setInlineDueDate('')
  }
  const pay = useMutation({
    mutationFn: async ({ id, amount, method }: { id: string; amount: number; method?: string }) => {
      const res = await http.post(`/api/crm/invoices/${id}/payments`, { amount, method })
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
  const refund = useMutation({
    mutationFn: async ({ id, amount, reason }: { id: string; amount: number; reason?: string }) => {
      const res = await http.post(`/api/crm/invoices/${id}/refunds`, { amount, reason })
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })

  const visible = React.useMemo(() => {
    const ql = q.trim().toLowerCase()
    let rows = items
    if (ql) rows = rows.filter((x) => [x.title, x.status].some((v) => (v ?? '').toString().toLowerCase().includes(ql)))
    const mul = dir === 'desc' ? -1 : 1
    rows = [...rows].sort((a: any, b: any) => {
      const av = a[sort]; const bv = b[sort]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (sort === 'total' || sort === 'invoiceNumber') return ((av as number) - (bv as number)) * mul
      if (sort === 'updatedAt' || sort === 'dueDate') return (new Date(av).getTime() - new Date(bv).getTime()) * mul
      return String(av).localeCompare(String(bv)) * mul
    })
    return rows
  }, [items, q, sort, dir])

  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(10)
  React.useEffect(() => { setPage(0) }, [q, sort, dir, pageSize])
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize))
  const pageItems = React.useMemo(() => visible.slice(page * pageSize, page * pageSize + pageSize), [visible, page, pageSize])

  // Initialize from URL and localStorage once
  React.useEffect(() => {
    if (initializedFromUrl.current) return
    initializedFromUrl.current = true
    const get = (key: string) => searchParams.get(key) || ''
    const q0 = get('q')
    const sort0 = (get('sort') as any) || 'updatedAt'
    const dir0 = (get('dir') as any) || 'desc'
    if (q0) setQ(q0)
    setSort(sort0)
    setDir(dir0)
    try {
      const stored = localStorage.getItem('INVOICES_COLS')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) setCols(parsed)
      }
    } catch {}
    try {
      const views = localStorage.getItem('INVOICES_SAVED_VIEWS')
      if (views) {
        const parsed = JSON.parse(views)
        if (Array.isArray(parsed)) setSavedViews(parsed)
      }
    } catch {}
    ;(async () => {
      try {
        const res = await http.get('/api/views', { params: { viewKey: 'invoices' } })
        const items = (res.data?.data?.items ?? []).map((v: any) => ({ id: String(v._id), name: v.name, config: v.config }))
        if (Array.isArray(items)) setSavedViews(items)
        if (items.length === 0) {
          const seeds = [
            { name: 'Open invoices', config: { q: '', sort: 'updatedAt', dir: 'desc' } },
            { name: 'Overdue', config: { q: '', sort: 'dueDate', dir: 'asc' } },
          ]
          for (const s of seeds) { try { await http.post('/api/views', { viewKey: 'invoices', name: s.name, config: s.config }) } catch {} }
          try { const res2 = await http.get('/api/views', { params: { viewKey: 'invoices' } }); const items2 = (res2.data?.data?.items ?? []).map((v: any) => ({ id: String(v._id), name: v.name, config: v.config })); if (Array.isArray(items2)) setSavedViews(items2) } catch {}
        }
      } catch {}
    })()
  }, [searchParams])

  // Persist to URL/localStorage
  React.useEffect(() => {
    const params: Record<string, string> = {}
    if (q) params.q = q
    if (sort !== 'updatedAt') params.sort = sort
    if (dir !== 'desc') params.dir = dir
    const colKeys = cols.filter((c) => c.visible).map((c) => c.key).join(',')
    if (colKeys) params.cols = colKeys
    setSearchParams(params, { replace: true })
    try { localStorage.setItem('INVOICES_COLS', JSON.stringify(cols)) } catch {}
    try { localStorage.setItem('INVOICES_SAVED_VIEWS', JSON.stringify(savedViews)) } catch {}
  }, [q, sort, dir, cols, savedViews, setSearchParams])

  async function saveCurrentView() {
    const viewConfig = { q, sort, dir, cols, pageSize }
    const name = savingViewName || `View ${savedViews.length + 1}`
    try {
      const res = await http.post('/api/views', { viewKey: 'invoices', name, config: viewConfig })
      const doc = res.data?.data
      const newItem = doc && doc._id ? { id: String(doc._id), name: doc.name, config: doc.config } : { id: Date.now().toString(), name, config: viewConfig }
      setSavedViews((prev) => [...prev, newItem])
    } catch {
      setSavedViews((prev) => [...prev, { id: Date.now().toString(), name, config: viewConfig }])
    }
    setShowSaveViewDialog(false)
    setSavingViewName('')
  }
  function loadView(view: { id: string; name: string; config: any }) {
    const c = view.config
    if (c.q !== undefined) setQ(c.q)
    if (c.sort) setSort(c.sort)
    if (c.dir) setDir(c.dir)
    if (c.cols) setCols(c.cols)
    if (c.pageSize) setPageSize(c.pageSize)
    setPage(0)
  }
  async function deleteView(id: string) { try { await http.delete(`/api/views/${id}`) } catch {}; setSavedViews((prev) => prev.filter((v) => v.id !== id)) }
  function copyShareLink() {
    const url = window.location.origin + window.location.pathname + '?' + searchParams.toString()
    navigator.clipboard?.writeText(url).then(() => toast.showToast('Link copied', 'success')).catch(() => toast.showToast('Failed to copy', 'error'))
  }
  function getColValue(inv: Invoice, key: string) {
    if (key === 'invoiceNumber') return inv.invoiceNumber ?? '-'
    if (key === 'title') return inv.title ?? '-'
    if (key === 'account') {
      const acc = inv.accountId && acctById.get(inv.accountId)
      return acc ? `${acc.accountNumber ?? '—'} — ${acc.name ?? 'Account'}` : (inv.accountNumber ?? '—')
    }
    if (key === 'total') return typeof inv.total === 'number' ? `$${inv.total.toLocaleString()}` : '-'
    if (key === 'balance') return typeof inv.balance === 'number' ? `$${inv.balance.toLocaleString()}` : '-'
    if (key === 'status') return inv.status ?? '-'
    if (key === 'dueDate') return inv.dueDate ? formatDate(inv.dueDate) : '-'
    return ''
  }
  function handleDragStart(key: string) { setDraggedCol(key) }
  function handleDrop(targetKey: string) {
    if (!draggedCol || draggedCol === targetKey) return
    const draggedIndex = cols.findIndex((c) => c.key === draggedCol)
    const targetIndex = cols.findIndex((c) => c.key === targetKey)
    if (draggedIndex === -1 || targetIndex === -1) return
    const newCols = [...cols]
    const [removed] = newCols.splice(draggedIndex, 1)
    newCols.splice(targetIndex, 0, removed)
    setCols(newCols)
    setDraggedCol(null)
  }

  React.useEffect(() => {
    if (!showColsMenu) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-cols-menu]')) setShowColsMenu(false)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showColsMenu])

  const [editing, setEditing] = React.useState<Invoice | null>(null)
  const [lineItems, setLineItems] = React.useState<InvoiceLineItem[]>([])
  const [showHistory, setShowHistory] = React.useState(false)
  const editingIdRef = React.useRef<string | null>(null)
  // Recipient email state for "Send Invoice"
  const [invoiceRecipientEmail, setInvoiceRecipientEmail] = React.useState('')

  // Initialize line items when editing changes
  React.useEffect(() => {
    const currentEditingId = editing?._id || null
    
    // Only run if editing actually changed
    if (editingIdRef.current === currentEditingId) {
      return
    }
    
    editingIdRef.current = currentEditingId
    
    if (editing && editing.items && Array.isArray(editing.items)) {
      setLineItems(editing.items.map((item: any) => ({
        productId: item.productId,
        productName: item.productName || item.name,
        productSku: item.productSku || item.sku,
        bundleId: item.bundleId,
        bundleName: item.bundleName,
        description: item.description || '',
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || item.price || 0,
        taxRate: item.taxRate,
        cost: item.cost,
        lineTotal: (item.quantity || 1) * (item.unitPrice || item.price || 0),
        isBundle: item.isBundle || false,
      })))
      // Load discount if present
      const editingDiscountCode = (editing as any).discountCode
      const editingDiscountId = (editing as any).discountId
      if (editingDiscountCode) {
        setDiscountCode(editingDiscountCode)
        // Try to find the discount - only update if discounts array is available
        if (discounts.length > 0) {
          const discount = discounts.find((d: Discount) => 
            d.code?.toUpperCase() === editingDiscountCode?.toUpperCase() || 
            d._id === editingDiscountId
          )
          setAppliedDiscount(discount || null)
        } else {
          // If discounts haven't loaded yet, clear applied discount
          setAppliedDiscount(null)
        }
      } else {
        setDiscountCode('')
        setAppliedDiscount(null)
      }
    } else if (editing) {
      setLineItems([])
      setDiscountCode('')
      setAppliedDiscount(null)
    } else {
      // When editing is null, reset everything
      setLineItems([])
      setDiscountCode('')
      setAppliedDiscount(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?._id])

  // Keep invoiceRecipientEmail in sync with the selected account when editing changes
  React.useEffect(() => {
    if (editing && editing.accountId) {
      const acct = acctById.get(editing.accountId)
      setInvoiceRecipientEmail(acct?.primaryContactEmail || '')
    } else {
      setInvoiceRecipientEmail('')
    }
  }, [editing, acctById])

  // When discounts load, try to match discount code if editing has one
  React.useEffect(() => {
    if (!editing || discounts.length === 0) return
    
    const editingDiscountCode = (editing as any).discountCode
    const editingDiscountId = (editing as any).discountId
    
    if (editingDiscountCode && !appliedDiscount) {
      const discount = discounts.find((d: Discount) => 
        d.code?.toUpperCase() === editingDiscountCode?.toUpperCase() || 
        d._id === editingDiscountId
      )
      if (discount) {
        setAppliedDiscount(discount)
      }
    }
  }, [discounts.length, editing?._id, editing?.discountCode, editing?.discountId, appliedDiscount?._id])

  // Calculate totals from line items and apply discount
  const calculatedTotals = React.useMemo(() => {
    let subtotal = 0
    let tax = 0
    let totalCost = 0

    lineItems.forEach((item) => {
      subtotal += item.lineTotal
      if (item.taxRate) {
        tax += item.lineTotal * (item.taxRate / 100)
      }
      if (item.cost) {
        totalCost += item.cost * item.quantity
      }
    })

    // Apply discount
    let discountAmount = 0
    if (appliedDiscount && subtotal > 0) {
      const now = new Date()
      const startDate = appliedDiscount.startDate ? new Date(appliedDiscount.startDate) : null
      const endDate = appliedDiscount.endDate ? new Date(appliedDiscount.endDate) : null
      
      // Check date validity
      if ((!startDate || now >= startDate) && (!endDate || now <= endDate)) {
        // Check minimum amount
        if (!appliedDiscount.minAmount || subtotal >= appliedDiscount.minAmount) {
          if (appliedDiscount.type === 'percentage') {
            discountAmount = (subtotal * appliedDiscount.value) / 100
            if (appliedDiscount.maxDiscount) {
              discountAmount = Math.min(discountAmount, appliedDiscount.maxDiscount)
            }
          } else if (appliedDiscount.type === 'fixed') {
            discountAmount = Math.min(appliedDiscount.value, subtotal)
          }
          // Note: tiered discounts would need more complex logic
        }
      }
    }

    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount)
    const total = subtotalAfterDiscount + tax

    return {
      subtotal,
      discountAmount,
      subtotalAfterDiscount,
      tax,
      total,
      totalCost,
      hasCostData: totalCost > 0,
    }
  }, [lineItems, appliedDiscount])

  const historyQ = useQuery({
    queryKey: ['invoice-history', editing?._id, showHistory],
    enabled: Boolean(editing?._id && showHistory),
    queryFn: async () => { const res = await http.get(`/api/crm/invoices/${editing?._id}/history`); return res.data as { data: { createdAt: string; payments: any[]; refunds: any[]; invoice: any } } },
  })
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => { if (!editing) return; const el = document.createElement('div'); el.setAttribute('data-overlay', 'invoice-editor'); Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' }); document.body.appendChild(el); setPortalEl(el); return () => { try { document.body.removeChild(el) } catch {}; setPortalEl(null) } }, [editing])

  return (
    <div className="space-y-4">
      <CRMNav />
      <h1 className="text-xl font-semibold">Invoices</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoices..." className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button type="button" onClick={() => { setQ(''); setSort('updatedAt'); setDir('desc'); setPage(0) }} disabled={!q && sort==='updatedAt' && dir==='desc'} className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50">Reset</button>
          <div className="relative">
            <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setShowSaveViewDialog(true)}>Save view</button>
          </div>
          <div className="relative">
            <select className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)]" onChange={(e) => { const v = savedViews.find((x) => x.id === e.target.value); if (v) loadView(v); e.currentTarget.value=''; }}>
              <option value="">Saved views</option>
              {savedViews.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}
            </select>
          </div>
          <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={copyShareLink}>Share link</button>
          <div className="relative" data-cols-menu>
            <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setShowColsMenu((v) => !v)}>Columns</button>
            {showColsMenu && (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-2 shadow space-y-1">
                <div className="text-xs text-[color:var(--color-text-muted)] pb-1 border-b">Drag to reorder</div>
                {cols.map((col) => (
                  <div key={col.key} draggable onDragStart={() => handleDragStart(col.key)} onDragOver={(e)=>{e.preventDefault()}} onDrop={() => handleDrop(col.key)} className={`flex items-center gap-2 p-1 text-sm cursor-move rounded ${draggedCol===col.key ? 'opacity-50 bg-[color:var(--color-muted)]' : 'hover:bg-[color:var(--color-muted)]'}`}>
                    <span className="text-xs text-[color:var(--color-text-muted)]">≡</span>
                    <input type="checkbox" checked={col.visible} onChange={(e)=> setCols(cols.map((c)=> c.key===col.key ? { ...c, visible: e.target.checked } : c))} onClick={(e)=> e.stopPropagation()} />
                    <span>{col.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="updatedAt">Updated</option>
            <option value="invoiceNumber">Invoice #</option>
            <option value="dueDate">Due date</option>
            <option value="total">Total</option>
            <option value="status">Status</option>
          </select>
          <select value={dir} onChange={(e) => setDir(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
          {isFetching && <span className="text-xs text-[color:var(--color-text-muted)]">Loading...</span>}
          <button className="ml-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
            onClick={() => {
              const visibleCols = cols.filter((c)=> c.visible)
              const headers = visibleCols.map((c)=> c.label)
              const rows = pageItems.map((inv) => visibleCols.map((col)=> {
                if (col.key==='invoiceNumber') return inv.invoiceNumber ?? ''
                if (col.key==='title') return inv.title ?? ''
                if (col.key==='account') {
                  const acc = inv.accountId && acctById.get(inv.accountId!)
                  return acc ? `${acc.accountNumber ?? '—'} — ${acc.name ?? 'Account'}` : (inv.accountNumber ?? '—')
                }
                if (col.key==='total') return typeof inv.total==='number' ? inv.total : ''
                if (col.key==='balance') return typeof inv.balance==='number' ? inv.balance : ''
                if (col.key==='status') return inv.status ?? ''
                if (col.key==='dueDate') return inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0,10) : ''
                return ''
              }))
              const csv = [headers.join(','), ...rows.map((r)=> r.map((x)=> '"'+String(x).replaceAll('"','""')+'"').join(','))].join('\n')
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'invoices.csv'
              a.click()
              URL.revokeObjectURL(url)
            }}>Export CSV</button>
        </div>

        <form className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { 
          e.preventDefault(); 
          const fd = new FormData(e.currentTarget); 
          const title = String(fd.get('title')||''); 
          const accNum = fd.get('accountNumber') ? Number(fd.get('accountNumber')) : undefined; 
          const dueDate = String(fd.get('dueDate')||'') || undefined; 
          
          // Allow creating with empty items - totals will be 0
          const payload: any = { 
            title, 
            subtotal: 0, 
            tax: 0, 
            total: 0,
            balance: 0,
            items: [],
            dueDate
          }; 
          
          const acc = accounts.find(a => a.accountNumber === accNum); 
          if (acc?._id) payload.accountId = acc._id; 
          else if (accNum) payload.accountNumber = accNum; 
          
          create.mutate(payload, {
            onSuccess: () => {
              ;(e.currentTarget as HTMLFormElement).reset()
            }
          })
        }}>
          <input name="title" required placeholder="Invoice title" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <select name="accountNumber" required className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">Select account</option>
            {accounts.filter((a) => typeof a.accountNumber === 'number').map((a) => (
              <option key={a._id} value={a.accountNumber ?? ''}>{(a.accountNumber ?? '—')} — {a.name ?? 'Account'}</option>
            ))}
          </select>
          <input name="dueDate" type="date" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Add invoice</button>
        </form>

        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]">
            <tr>
              {cols.filter((c)=> c.visible).map((col)=> (
                <th key={col.key} draggable onDragStart={()=>handleDragStart(col.key)} onDragOver={(e)=>{e.preventDefault()}} onDrop={()=>handleDrop(col.key)} className={`px-4 py-2 cursor-move ${draggedCol===col.key ? 'opacity-50' : ''}`} title="Drag to reorder">{col.label}</th>
              ))}
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((inv) => (
              <tr key={inv._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                {cols.filter((c)=> c.visible).map((col)=> (
                  <td key={col.key} className="px-4 py-2">
                    {inlineEditId === inv._id ? (
                      col.key === 'title' ? (
                        <input value={inlineTitle} onChange={(e) => setInlineTitle(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                      ) : col.key === 'status' ? (
                        <select value={inlineStatus} onChange={(e) => setInlineStatus(e.target.value)} className="w-full rounded border bg-[color:var(--color-panel)] px-2 py-1 text-sm text-[color:var(--color-text)]">
                          <option>Draft</option>
                          <option>Sent</option>
                          <option>Paid</option>
                          <option>Overdue</option>
                          <option>Void</option>
                        </select>
                      ) : col.key === 'dueDate' ? (
                        <input type="date" value={inlineDueDate} onChange={(e) => setInlineDueDate(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                      ) : (
                        getColValue(inv, col.key)
                      )
                    ) : (
                      getColValue(inv, col.key)
                    )}
                  </td>
                ))}
                <td className="px-4 py-2 whitespace-nowrap">
                  {inlineEditId === inv._id ? (
                    <div className="flex items-center gap-2">
                      <button className="rounded-lg border px-2 py-1 text-xs" onClick={saveInlineEdit}>Save</button>
                      <button className="rounded-lg border px-2 py-1 text-xs" onClick={cancelInlineEdit}>Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button className="rounded-lg border px-2 py-1 text-xs" onClick={() => startInlineEdit(inv)}>Edit</button>
                      <button className="rounded-lg border px-2 py-1 text-xs" onClick={() => setEditing(inv)}>Open</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between p-4 text-sm">
          <div className="flex items-center gap-2">
            <span>Rows: {visible.length}</span>
            <label className="ml-4 flex items-center gap-1">Page size
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1">
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0}>Prev</button>
            <span>Page {page + 1} / {totalPages}</span>
            <button className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page + 1 >= totalPages}>Next</button>
          </div>
        </div>
      </div>

      {editing && portalEl && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,64rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Edit invoice</div>
              <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { 
                e.preventDefault(); 
                const fd = new FormData(e.currentTarget); 
                const payload: any = { 
                  _id: editing._id, 
                  title: String(fd.get('title')||'') || undefined, 
                  status: String(fd.get('status')||'') || undefined 
                }; 
                
                const due = String(fd.get('dueDate')||''); 
                if (due) payload.dueDate = due; 
                
                // Use calculated totals from line items, or manual override
                const manualSubtotal = fd.get('subtotal') ? Number(fd.get('subtotal')) : null
                const manualTax = fd.get('tax') ? Number(fd.get('tax')) : null
                
                if (lineItems.length > 0) {
                  // Use calculated totals from line items
                  payload.subtotal = calculatedTotals.subtotalAfterDiscount
                  payload.tax = calculatedTotals.tax
                  payload.total = calculatedTotals.total
                  payload.balance = calculatedTotals.total - (editing.balance ? (editing.total || 0) - (editing.balance || 0) : 0)
                  if (calculatedTotals.discountAmount > 0 && appliedDiscount) {
                    payload.discountCode = appliedDiscount.code || appliedDiscount.name
                    payload.discountAmount = calculatedTotals.discountAmount
                    payload.discountId = appliedDiscount._id
                  }
                  payload.items = lineItems.map(item => ({
                    productId: item.productId,
                    productName: item.productName,
                    productSku: item.productSku,
                    bundleId: item.bundleId,
                    bundleName: item.bundleName,
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    taxRate: item.taxRate,
                    cost: item.cost,
                    lineTotal: item.lineTotal,
                    isBundle: item.isBundle,
                  }))
                } else if (manualSubtotal != null || manualTax != null) {
                  // Use manual totals
                  payload.subtotal = manualSubtotal ?? editing.subtotal ?? 0
                  payload.tax = manualTax ?? editing.tax ?? 0
                  payload.total = (payload.subtotal || 0) + (payload.tax || 0)
                  payload.balance = payload.total - (editing.balance ? (editing.total || 0) - (editing.balance || 0) : 0)
                  payload.items = []
                }
                
                const accSel = String(fd.get('accountId')||''); 
                if (accSel) payload.accountId = accSel; 
                
                update.mutate(payload); 
                setEditing(null) 
              }}>
                <input name="title" defaultValue={editing.title ?? ''} placeholder="Title" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <select name="status" defaultValue={editing.status ?? 'draft'} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                  <option>draft</option>
                  <option>open</option>
                  <option>paid</option>
                  <option>void</option>
                  <option>uncollectible</option>
                </select>
                <input name="subtotal" type="number" step="0.01" defaultValue={(editing as any).subtotal ?? ''} placeholder="Subtotal" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="tax" type="number" step="0.01" defaultValue={(editing as any).tax ?? ''} placeholder="Tax" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="dueDate" type="date" defaultValue={editing.dueDate ? editing.dueDate.slice(0,10) : ''} className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />

                {/* Line Items Section */}
                <div className="col-span-full mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Line Items
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setLineItems([...lineItems, {
                          productId: '',
                          productName: '',
                          productSku: '',
                          bundleId: '',
                          bundleName: '',
                          description: '',
                          quantity: 1,
                          unitPrice: 0,
                          taxRate: undefined,
                          cost: undefined,
                          lineTotal: 0,
                          isBundle: false,
                        }])
                      }}
                      className="flex items-center gap-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                    >
                      <Plus className="h-3 w-3" />
                      Add Item
                    </button>
                  </div>

                  {lineItems.length > 0 ? (
                    <div className="space-y-2">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-left text-[color:var(--color-text-muted)] border-b border-[color:var(--color-border)]">
                            <tr>
                              <th className="px-2 py-1.5">Product</th>
                              <th className="px-2 py-1.5">Description</th>
                              <th className="px-2 py-1.5 w-20">Qty</th>
                              <th className="px-2 py-1.5 w-24">Price</th>
                              <th className="px-2 py-1.5 w-20">Tax %</th>
                              <th className="px-2 py-1.5 w-24">Total</th>
                              <th className="px-2 py-1.5 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {lineItems.map((item, index) => {
                              return (
                                <tr key={index} className="border-b border-[color:var(--color-border)]">
                                  <td className="px-2 py-1.5">
                                    <select
                                      value={item.isBundle ? `bundle-${item.bundleId}` : (item.productId || '')}
                                      onChange={(e) => {
                                        const newItems = [...lineItems]
                                        const value = e.target.value
                                        
                                        if (value.startsWith('bundle-')) {
                                          const bundleId = value.replace('bundle-', '')
                                          const selectedBundle = bundles.find((b: Bundle) => b._id === bundleId)
                                          if (selectedBundle) {
                                            newItems[index] = {
                                              ...newItems[index],
                                              bundleId: selectedBundle._id,
                                              bundleName: selectedBundle.name,
                                              productId: '',
                                              productName: '',
                                              productSku: '',
                                              description: selectedBundle.description || '',
                                              unitPrice: selectedBundle.bundlePrice,
                                              taxRate: undefined,
                                              cost: undefined,
                                              lineTotal: newItems[index].quantity * selectedBundle.bundlePrice,
                                              isBundle: true,
                                            }
                                          }
                                        } else {
                                          const selectedProduct = products.find((p: Product) => p._id === value)
                                          if (selectedProduct) {
                                            newItems[index] = {
                                              ...newItems[index],
                                              productId: selectedProduct._id,
                                              productName: selectedProduct.name,
                                              productSku: selectedProduct.sku || '',
                                              bundleId: '',
                                              bundleName: '',
                                              description: selectedProduct.description || '',
                                              unitPrice: selectedProduct.basePrice,
                                              taxRate: selectedProduct.taxRate,
                                              cost: selectedProduct.cost,
                                              lineTotal: newItems[index].quantity * selectedProduct.basePrice,
                                              isBundle: false,
                                            }
                                          } else {
                                            newItems[index] = {
                                              ...newItems[index],
                                              productId: '',
                                              productName: '',
                                              productSku: '',
                                              bundleId: '',
                                              bundleName: '',
                                              unitPrice: 0,
                                              lineTotal: 0,
                                              isBundle: false,
                                            }
                                          }
                                        }
                                        setLineItems(newItems)
                                      }}
                                      className="w-full rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-xs text-[color:var(--color-text)]"
                                    >
                                      <option value="" className="text-gray-900">(Manual Item)</option>
                                      {products.length > 0 && (
                                        <optgroup label="Products" className="text-gray-900">
                                          {products.map((p: Product) => (
                                            <option key={p._id} value={p._id} className="text-gray-900">
                                              {p.sku ? `${p.sku} - ` : ''}{p.name} (${p.basePrice.toFixed(2)})
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                      {bundles.length > 0 && (
                                        <optgroup label="Bundles" className="text-gray-900">
                                          {bundles.map((b: Bundle) => (
                                            <option key={`bundle-${b._id}`} value={`bundle-${b._id}`} className="text-gray-900 font-semibold">
                                              {b.sku ? `${b.sku} - ` : ''}{b.name} (${b.bundlePrice.toFixed(2)})
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                    </select>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="text"
                                      value={item.description || ''}
                                      onChange={(e) => {
                                        const newItems = [...lineItems]
                                        newItems[index].description = e.target.value
                                        setLineItems(newItems)
                                      }}
                                      placeholder="Description"
                                      className="w-full rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-xs"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      value={item.quantity || 1}
                                      onChange={(e) => {
                                        const newItems = [...lineItems]
                                        const qty = parseFloat(e.target.value) || 1
                                        newItems[index].quantity = qty
                                        newItems[index].lineTotal = qty * newItems[index].unitPrice
                                        setLineItems(newItems)
                                      }}
                                      className="w-full rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-xs"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.unitPrice || 0}
                                      onChange={(e) => {
                                        const newItems = [...lineItems]
                                        const price = parseFloat(e.target.value) || 0
                                        newItems[index].unitPrice = price
                                        newItems[index].lineTotal = newItems[index].quantity * price
                                        setLineItems(newItems)
                                      }}
                                      className="w-full rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-xs"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.taxRate || ''}
                                      onChange={(e) => {
                                        const newItems = [...lineItems]
                                        newItems[index].taxRate = e.target.value ? parseFloat(e.target.value) : undefined
                                        setLineItems(newItems)
                                      }}
                                      placeholder="0"
                                      className="w-full rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-xs"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 font-medium">
                                    ${item.lineTotal.toFixed(2)}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLineItems(lineItems.filter((_, i) => i !== index))
                                      }}
                                      className="rounded p-1 hover:bg-[color:var(--color-muted)] text-red-600"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Discount Code Input */}
                      <div className="mt-3 flex gap-2">
                        <input
                          type="text"
                          value={discountCode}
                          onChange={(e) => {
                            const code = e.target.value.toUpperCase().trim()
                            setDiscountCode(code)
                            if (code) {
                              const discount = discounts.find((d: Discount) => d.code?.toUpperCase() === code)
                              setAppliedDiscount(discount || null)
                            } else {
                              setAppliedDiscount(null)
                            }
                          }}
                          placeholder="Enter discount code"
                          className="flex-1 rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-xs"
                        />
                        {appliedDiscount && (
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountCode('')
                              setAppliedDiscount(null)
                            }}
                            className="rounded border border-red-400 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      {appliedDiscount && (
                        <div className="rounded-lg border border-green-400 bg-green-50 p-2 text-xs">
                          <div className="font-semibold text-green-800">{appliedDiscount.name}</div>
                          {appliedDiscount.description && (
                            <div className="text-green-700">{appliedDiscount.description}</div>
                          )}
                        </div>
                      )}

                      {/* Calculated Totals */}
                      <div className="mt-3 space-y-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-[color:var(--color-text-muted)]">Subtotal:</span>
                          <span className="font-medium">${calculatedTotals.subtotal.toFixed(2)}</span>
                        </div>
                        {calculatedTotals.discountAmount > 0 && (
                          <div className="flex justify-between text-sm text-green-600">
                            <span>Discount ({appliedDiscount?.name || discountCode}):</span>
                            <span className="font-medium">-${calculatedTotals.discountAmount.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-[color:var(--color-text-muted)]">Subtotal After Discount:</span>
                          <span className="font-medium">${calculatedTotals.subtotalAfterDiscount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-[color:var(--color-text-muted)]">Tax:</span>
                          <span className="font-medium">${calculatedTotals.tax.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between border-t border-[color:var(--color-border)] pt-2 text-sm font-semibold">
                          <span>Total:</span>
                          <span>${calculatedTotals.total.toFixed(2)}</span>
                        </div>
                        {calculatedTotals.hasCostData && (
                          <div className="mt-2 border-t border-[color:var(--color-border)] pt-2 space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-[color:var(--color-text-muted)]">Total Cost:</span>
                              <span>${calculatedTotals.totalCost.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-[color:var(--color-text-muted)]">Margin:</span>
                              <span className={`font-semibold ${
                                ((calculatedTotals.subtotalAfterDiscount - calculatedTotals.totalCost) / calculatedTotals.subtotalAfterDiscount * 100) >= 50 ? 'text-green-600' :
                                ((calculatedTotals.subtotalAfterDiscount - calculatedTotals.totalCost) / calculatedTotals.subtotalAfterDiscount * 100) >= 30 ? 'text-green-500' :
                                ((calculatedTotals.subtotalAfterDiscount - calculatedTotals.totalCost) / calculatedTotals.subtotalAfterDiscount * 100) >= 10 ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>
                                ${(calculatedTotals.subtotalAfterDiscount - calculatedTotals.totalCost).toFixed(2)} (
                                {calculatedTotals.subtotalAfterDiscount > 0 
                                  ? ((calculatedTotals.subtotalAfterDiscount - calculatedTotals.totalCost) / calculatedTotals.subtotalAfterDiscount * 100).toFixed(1)
                                  : '0'
                                }%)
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-4 text-center text-sm text-[color:var(--color-text-muted)]">
                      No line items. Click "Add Item" to add products or manual line items.
                    </div>
                  )}
                </div>

                {/* Manual Override (hidden if line items exist) */}
                {lineItems.length === 0 && (
                  <>
                    <input name="subtotal" type="number" step="0.01" defaultValue={(editing as any).subtotal ?? ''} placeholder="Subtotal" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    <input name="tax" type="number" step="0.01" defaultValue={(editing as any).tax ?? ''} placeholder="Tax" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                  </>
                )}
                <label className="col-span-full text-sm">Account
                  <select name="accountId" className="ml-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                    <option value="">(no change)</option>
                    {accounts.map((a) => (<option key={a._id} value={a._id}>{(a.accountNumber ?? '—')} — {a.name ?? 'Account'}</option>))}
                  </select>
                </label>
                <div className="col-span-full mt-2 flex items-center gap-2">
                  <input id="payAmount" type="number" step="0.01" placeholder="Payment amount" className="w-40 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => {
                    const input = (document.getElementById('payAmount') as HTMLInputElement)
                    const amt = Number(input.value)
                    if (amt > 0) pay.mutate({ id: editing._id, amount: amt })
                  }}>Apply payment</button>
                  <input id="refundAmount" type="number" step="0.01" placeholder="Refund amount" className="w-40 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => {
                    const input = (document.getElementById('refundAmount') as HTMLInputElement)
                    const amt = Number(input.value)
                    if (amt > 0) refund.mutate({ id: editing._id, amount: amt })
                  }}>Issue refund</button>
                </div>
                <div className="col-span-full mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="mr-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm text-red-600 hover:bg-[color:var(--color-muted)]"
                    onClick={() => {
                      if (editing?._id)
                        http.delete(`/api/crm/invoices/${editing._id}`).then(() => {
                          qc.invalidateQueries({ queryKey: ['invoices'] })
                          setEditing(null)
                        })
                    }}
                  >
                    Delete
                  </button>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-[color:var(--color-text-muted)]">
                      Recipient email
                    </label>
                    <input
                      type="email"
                      value={invoiceRecipientEmail}
                      onChange={(e) => setInvoiceRecipientEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="w-64 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const trimmed = invoiceRecipientEmail.trim()
                      const account: AccountPick | undefined = editing.accountId
                        ? accounts.find((a) => a._id === editing.accountId)
                        : undefined
                      const fallbackEmail = account?.primaryContactEmail || ''
                      const recipientEmail = trimmed || fallbackEmail

                      if (!recipientEmail) {
                        toast.showToast(
                          'Please enter a recipient email address or set a primary contact email for the account',
                          'warning',
                        )
                        return
                      }

                      const confirmed = window.confirm(`Send invoice to ${recipientEmail}?`)
                      if (confirmed) {
                        sendEmail.mutate({ id: editing._id, recipientEmail })
                      }
                    }}
                    disabled={sendEmail.isPending || !editing.accountId}
                    className="flex items-center gap-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                    title={!editing.accountId ? 'Please select an account first' : 'Send invoice via email'}
                  >
                    <Send className="h-3 w-3" />
                    Send Invoice
                  </button>
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setShowHistory((v) => !v)}>{showHistory ? 'Hide history' : 'View history'}</button>
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
                </div>
                {showHistory && historyQ.data && (
                  <div className="col-span-full mt-3 rounded-xl border border-[color:var(--color-border)] p-3 text-xs">
                    <div>Created: {formatDateTime(historyQ.data.data.createdAt)}</div>
                    <div className="mt-1">Invoice: {historyQ.data.data.invoice?.invoiceNumber ?? ''} {historyQ.data.data.invoice?.title ?? ''} • Status: {historyQ.data.data.invoice?.status ?? ''}</div>
                    <div className="mt-2 font-semibold">Payments</div>
                    <ul className="list-disc pl-5">{historyQ.data.data.payments.map((p, i) => (<li key={i}>${p.amount ?? ''} • {p.method ?? ''} • {p.paidAt ? formatDateTime(p.paidAt) : ''}</li>))}{historyQ.data.data.payments.length===0 && <li>None</li>}</ul>
                    <div className="mt-2 font-semibold">Refunds</div>
                    <ul className="list-disc pl-5">{historyQ.data.data.refunds.map((r, i) => (<li key={i}>${r.amount ?? ''} • {r.reason ?? ''} • {r.refundedAt ? formatDateTime(r.refundedAt) : ''}</li>))}{historyQ.data.data.refunds.length===0 && <li>None</li>}</ul>
                  </div>
                )}
                <div className="col-span-full mt-4 pt-4 border-t">
                  <DocumentsList
                    relatedToType="invoice"
                    relatedToId={editing._id}
                    relatedToName={editing.title}
                    compact={true}
                  />
                </div>
              </form>
            </div>
          </div>
        </div>, portalEl)}
      {showSaveViewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowSaveViewDialog(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 w-[min(90vw,24rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-base font-semibold">Save view</div>
            <input
              value={savingViewName}
              onChange={(e) => setSavingViewName(e.target.value)}
              placeholder="View name"
              className="mb-3 w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { saveCurrentView() } else if (e.key === 'Escape') setShowSaveViewDialog(false) }}
            />
            <div className="flex items-center justify-end gap-2">
              <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => { setShowSaveViewDialog(false); setSavingViewName('') }}>Cancel</button>
              <button type="button" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]" onClick={saveCurrentView}>Save</button>
            </div>
            {savedViews.length > 0 && (
              <div className="mt-4 border-t border-[color:var(--color-border)] pt-4">
                <div className="mb-2 text-xs text-[color:var(--color-text-muted)]">Saved views</div>
                <div className="space-y-1">
                  {savedViews.map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] p-2 text-sm">
                      <button type="button" className="flex-1 text-left hover:underline" onClick={() => { loadView(v); setShowSaveViewDialog(false) }}>{v.name}</button>
                      <button type="button" className="ml-2 rounded-lg border border-red-400 text-red-400 px-2 py-1 text-xs hover:bg-red-50" onClick={() => { if (confirm(`Delete \"${v.name}\"?`)) deleteView(v.id) }}>Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


