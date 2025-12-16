import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { CRMHelpButton } from '@/components/CRMHelpButton'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'
import { DocumentsList } from '@/components/DocumentsList'
import { Plus, X, Package, Send, Printer } from 'lucide-react'

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
  id: string
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
  currency?: string
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

type SurveyProgramPick = {
  _id: string
  name: string
  type: 'NPS' | 'CSAT' | 'Post‑interaction'
}

type InvoiceSurveyStatusSummary = {
  invoiceId: string
  responseCount: number
  lastResponseAt: string | null
  lastScore: number | null
}
type LinkedRenewal = {
  _id: string
  name: string
  renewalDate?: string | null
  mrr?: number | null
  arr?: number | null
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
    { key: 'surveyStatus', visible: true, label: 'Survey' },
  ]
  // Ensure Survey column is always present and visible, even for old saved layouts
  function ensureSurveyCol(cols: ColumnDef[]): ColumnDef[] {
    let hasSurvey = false
    const next = cols.map((c) => {
      if (c.key === 'surveyStatus') {
        hasSurvey = true
        return { ...c, visible: true, label: 'Survey' }
      }
      return c
    })
    if (!hasSurvey) {
      next.push({ key: 'surveyStatus', visible: true, label: 'Survey' })
    }
    return next
  }
  const [cols, setCols] = React.useState<ColumnDef[]>(ensureSurveyCol(defaultCols))
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

  const { data: surveyProgramsData } = useQuery({
    queryKey: ['surveys-programs-invoices'],
    queryFn: async () => {
      const res = await http.get('/api/crm/surveys/programs')
      return res.data as { data: { items: SurveyProgramPick[] } }
    },
  })
  const surveyPrograms = React.useMemo(
    () => surveyProgramsData?.data.items ?? [],
    [surveyProgramsData?.data.items],
  )
  const [surveyProgramId, setSurveyProgramId] = React.useState('')
  const [surveyRecipientName, setSurveyRecipientName] = React.useState('')
  const [surveyRecipientEmail, setSurveyRecipientEmail] = React.useState('')

  const invoiceIdsParam = React.useMemo(
    () => (items.length ? items.map((inv) => inv._id).join(',') : ''),
    [items],
  )

  const { data: invoiceSurveyStatusData } = useQuery({
    queryKey: ['invoices-survey-status', invoiceIdsParam],
    enabled: !!invoiceIdsParam,
    queryFn: async () => {
      const res = await http.get('/api/crm/surveys/invoices/status', {
        params: { invoiceIds: invoiceIdsParam },
      })
      return res.data as { data: { items: InvoiceSurveyStatusSummary[] } }
    },
  })

  const invoiceSurveyStatusMap = React.useMemo(() => {
    const map = new Map<string, InvoiceSurveyStatusSummary>()
    for (const s of invoiceSurveyStatusData?.data.items ?? []) {
      map.set(s.invoiceId, s)
    }
    return map
  }, [invoiceSurveyStatusData?.data.items])

  const create = useMutation({
    mutationFn: async (payload: any) => {
      const res = await http.post('/api/crm/invoices', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.showToast('BOAZ says: Invoice saved.', 'success')
    },
  })
  const update = useMutation({
    mutationFn: async (payload: any) => {
      const { _id, ...rest } = payload
      const res = await http.put(`/api/crm/invoices/${_id}`, rest)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      toast.showToast('BOAZ says: Invoice saved.', 'success')
    },
  })
  const sendEmail = useMutation({
    mutationFn: async ({ id, recipientEmail }: { id: string; recipientEmail?: string }) => {
      console.log('[CRMInvoices] Sending invoice:', id, 'to:', recipientEmail)
      console.log('[CRMInvoices] Invoice accountId:', editing?.accountId)
      const res = await http.post(`/api/crm/invoices/${id}/send-email`, { recipientEmail })
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['customer-portal-dashboard'] })
      qc.invalidateQueries({ queryKey: ['customer-portal-invoices'] })
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

  const sendSurveyEmail = useMutation({
    mutationFn: async (payload: {
      programId: string
      recipientName?: string
      recipientEmail: string
      accountId?: string
      invoiceId?: string
    }) => {
      const { programId, ...rest } = payload
      const res = await http.post(`/api/crm/surveys/programs/${programId}/send-email`, rest)
      return res.data
    },
    onSuccess: () => {
      toast.showToast('Survey email sent', 'success')
      qc.invalidateQueries({ queryKey: ['invoices-survey-status'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to send survey email'
      toast.showToast(msg, 'error')
    },
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
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCols(ensureSurveyCol(parsed))
        }
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
    if (c.cols) setCols(ensureSurveyCol(c.cols))
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
      return acc ? `${acc.accountNumber ?? '-'} - ${acc.name ?? 'Account'}` : (inv.accountNumber ?? '-')
    }
    if (key === 'total') return typeof inv.total === 'number' ? `$${inv.total.toLocaleString()}` : '-'
    if (key === 'balance') return typeof inv.balance === 'number' ? `$${inv.balance.toLocaleString()}` : '-'
    if (key === 'status') return inv.status ?? '-'
    if (key === 'dueDate') return inv.dueDate ? formatDate(inv.dueDate) : '-'
    if (key === 'surveyStatus') {
      const status = invoiceSurveyStatusMap.get(inv._id)
      if (!status || status.responseCount === 0) {
        return (
          <span className="inline-flex rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-muted)]">
            No surveys
          </span>
        )
      }
      return (
        <div className="flex flex-col gap-0.5 text-[11px]">
          <span className="inline-flex rounded-full border border-emerald-500/60 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200">
            {status.responseCount} response{status.responseCount === 1 ? '' : 's'}
          </span>
          <span className="text-[10px] text-[color:var(--color-text-muted)]">
            Last score:{' '}
            <span className="font-semibold text-[color:var(--color-text)]">
              {status.lastScore != null ? status.lastScore.toFixed(1) : '-'}
            </span>
          </span>
        </div>
      )
    }
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

  // Load CRM contacts for send dropdown
  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['crm-contacts-list'],
    queryFn: async () => {
      const res = await http.get('/api/crm/contacts', { params: { limit: 100 } })
      console.log('[CRMInvoices] Contacts loaded:', res.data?.data?.items?.length || 0)
      return res.data as { data: { items: Array<{ _id: string; name: string; email: string }> } }
    },
  })
  const contacts = React.useMemo(() => {
    const items = contactsData?.data.items ?? []
    console.log('[CRMInvoices] Raw contacts:', items.length, items)
    // Only show contacts with email addresses
    const withEmail = items.filter((c: any) => c.email && c.email.trim())
    console.log('[CRMInvoices] Contacts with email:', withEmail.length, withEmail)
    return items // Return all for now to debug
  }, [contactsData?.data.items])

  // Load portal users when account is selected
  const { data: portalUsersData } = useQuery({
    queryKey: ['portal-users-by-account', editing?.accountId],
    queryFn: async () => {
      if (!editing?.accountId) return []
      const res = await http.get(`/api/admin/customer-portal-users/by-account/${editing.accountId}`)
      if (res.data.error) return []
      return res.data.data as Array<{ id: string; name: string; email: string }>
    },
    enabled: !!editing?.accountId,
  })
  const portalUsers = React.useMemo(() => {
    const users = portalUsersData || []
    console.log('[CRMInvoices] AccountId:', editing?.accountId)
    console.log('[CRMInvoices] Portal users raw data:', portalUsersData)
    console.log('[CRMInvoices] Portal users loaded:', users.length, users)
    return users
  }, [portalUsersData, editing?.accountId])

  const editingIdRef = React.useRef<string | null>(null)
  // Recipient email state for "Send Invoice"
  const [invoiceRecipientEmail, setInvoiceRecipientEmail] = React.useState('')
  const makeLineItemId = React.useCallback(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c: any = (globalThis as any).crypto
      if (c?.randomUUID) return c.randomUUID() as string
    } catch {
      // ignore
    }
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`
  }, [])

  // Controlled-number-input UX: allow temporary empty string while typing, then coerce on blur.
  const [qtyDraftById, setQtyDraftById] = React.useState<Record<string, string>>({})

  const { data: linkedRenewalData } = useQuery({
    queryKey: ['renewals-by-invoice', editing?._id],
    enabled: !!editing?._id,
    queryFn: async () => {
      const res = await http.get('/api/crm/renewals', {
        params: { sourceInvoiceId: editing?._id },
      })
      return res.data as { data: { items: LinkedRenewal[] } }
    },
  })

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
        id: makeLineItemId(),
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
      setQtyDraftById({})
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
      setQtyDraftById({})
      setDiscountCode('')
      setAppliedDiscount(null)
    } else {
      // When editing is null, reset everything
      setLineItems([])
      setQtyDraftById({})
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
    queryFn: async () => { 
      const res = await http.get(`/api/crm/invoices/${editing?._id}/history`)
      return res.data as { 
        data: { 
          history: Array<{
            _id: string
            eventType: string
            description: string
            userName?: string
            userEmail?: string
            createdAt: string
            oldValue?: any
            newValue?: any
            metadata?: any
          }>
          createdAt: string
          payments: any[]
          refunds: any[]
          invoice: any
        } 
      } 
    },
  })
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => { if (!editing) return; const el = document.createElement('div'); el.setAttribute('data-overlay', 'invoice-editor'); Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' }); document.body.appendChild(el); setPortalEl(el); return () => { try { document.body.removeChild(el) } catch {}; setPortalEl(null) } }, [editing])

  return (
    <div className="space-y-4">
      <CRMNav />
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Invoices</h1>
        <CRMHelpButton tag="crm:invoices" />
      </div>
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
                  return acc ? `${acc.accountNumber ?? '-'} - ${acc.name ?? 'Account'}` : (inv.accountNumber ?? '-')
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

        <form className="flex flex-wrap items-center gap-2 p-4" onSubmit={(e) => {
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
              <option key={a._id} value={a.accountNumber ?? ''}>{(a.accountNumber ?? '-')} - {a.name ?? 'Account'}</option>
            ))}
          </select>
          <input name="dueDate" type="date" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button className="ml-auto rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">
            Add invoice
          </button>
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
                  // Use calculated totals from line items (and discount, if selected)
                  // NOTE: `subtotal` remains the pre-discount subtotal; discount is stored separately.
                  payload.subtotal = calculatedTotals.subtotal
                  payload.tax = calculatedTotals.tax
                  payload.total = calculatedTotals.total
                  payload.balance = calculatedTotals.total - (editing.balance ? (editing.total || 0) - (editing.balance || 0) : 0)

                  // Always send discount fields so clearing a discount persists correctly.
                  payload.discountId = appliedDiscount?._id ?? null
                  payload.discountCode = appliedDiscount ? (appliedDiscount.code || appliedDiscount.name) : null
                  payload.discountAmount = calculatedTotals.discountAmount || 0

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
                  // Use manual totals (and apply discount, if selected)
                  payload.subtotal = manualSubtotal ?? editing.subtotal ?? 0
                  payload.tax = manualTax ?? editing.tax ?? 0
                  const manualDiscountAmount = appliedDiscount ? calculatedTotals.discountAmount : 0
                  payload.discountId = appliedDiscount?._id ?? null
                  payload.discountCode = appliedDiscount ? (appliedDiscount.code || appliedDiscount.name) : null
                  payload.discountAmount = manualDiscountAmount || 0
                  payload.total = Math.max(0, (payload.subtotal || 0) - (payload.discountAmount || 0)) + (payload.tax || 0)
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
                <div className="col-span-full mt-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Renewals &amp; Subscriptions</div>
                    <button
                      type="button"
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                      onClick={() => {
                        const accId = editing.accountId as any
                        if (!accId) {
                          toast.showToast('No account is linked to this invoice yet.', 'error')
                          return
                        }
                        window.location.href = `/apps/crm/renewals?accountId=${encodeURIComponent(accId)}`
                      }}
                    >
                      Open renewals for this account
                    </button>
                  </div>
                  <div className="text-[11px] text-[color:var(--color-text-muted)]">
                    View renewals tied to this invoice&apos;s account in the Renewals app.
                  </div>
                  {linkedRenewalData?.data?.items?.length ? (
                    <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-xs">
                      {(() => {
                        const r = linkedRenewalData.data.items[0]
                        return (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-medium">
                              Linked renewal: {r.name}
                            </div>
                            <div className="flex items-center gap-3 text-[color:var(--color-text-muted)]">
                              <span>
                                {r.renewalDate ? `Renews ${formatDate(r.renewalDate)}` : 'No renewal date'}
                              </span>
                              <span>
                                MRR {typeof r.mrr === 'number' ? `$${r.mrr.toLocaleString()}` : '-'}
                              </span>
                              <button
                                type="button"
                                className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] hover:bg-[color:var(--color-muted)]"
                                onClick={() => {
                                  const accId = editing.accountId as any
                                  window.location.href = `/apps/crm/renewals?accountId=${accId ?? ''}`
                                }}
                              >
                                View in Renewals
                              </button>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <div className="text-[11px] text-[color:var(--color-text-muted)]">
                      When this invoice is used to start a subscription, BOAZ will auto-create a renewal record.
                    </div>
                  )}
                </div>

                {surveyPrograms.length > 0 && (
                  <div className="col-span-full mt-2 rounded-xl border border-[color:var(--color-border)] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Surveys &amp; Feedback</div>
                      <div className="text-[11px] text-[color:var(--color-text-muted)]">
                        Send a CSAT/NPS survey related to this invoice.
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                          Survey program
                        </label>
                        <select
                          value={surveyProgramId}
                          onChange={(e) => setSurveyProgramId(e.target.value)}
                          className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
                        >
                          <option value="">Select a program…</option>
                          {surveyPrograms.map((p) => (
                            <option key={p._id} value={p._id}>
                              {p.name} ({p.type})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                          Customer name (for email)
                        </label>
                        <input
                          type="text"
                          value={surveyRecipientName}
                          onChange={(e) => setSurveyRecipientName(e.target.value)}
                          className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                          placeholder="Customer name"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                          Customer email (for survey link)
                        </label>
                        <input
                          type="email"
                          value={surveyRecipientEmail}
                          onChange={(e) => setSurveyRecipientEmail(e.target.value)}
                          className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                          placeholder="name@example.com"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-60"
                        disabled={!surveyProgramId || !surveyRecipientEmail || sendSurveyEmail.isPending}
                        onClick={() => {
                          if (!editing || !surveyProgramId || !surveyRecipientEmail) return
                          sendSurveyEmail.mutate({
                            programId: surveyProgramId,
                            recipientName: surveyRecipientName || undefined,
                            recipientEmail: surveyRecipientEmail,
                            accountId: editing.accountId,
                            invoiceId: editing._id,
                          })
                        }}
                      >
                        {sendSurveyEmail.isPending ? 'Sending…' : 'Send survey email for invoice'}
                      </button>
                    </div>
                  </div>
                )}

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
                          id: makeLineItemId(),
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
                                <tr key={item.id} className="border-b border-[color:var(--color-border)]">
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
                                              {p.sku ? `${p.sku} - ` : ''}
                                              {p.name} ({(p.currency || 'USD')} {p.basePrice.toFixed(2)})
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                      {bundles.length > 0 && (
                                        <optgroup label="Bundles" className="text-gray-900">
                                          {bundles.map((b: Bundle) => (
                                            <option key={`bundle-${b._id}`} value={`bundle-${b._id}`} className="text-gray-900 font-semibold">
                                              {b.sku ? `${b.sku} - ` : ''}
                                              {b.name} ({(b.currency || 'USD')} {b.bundlePrice.toFixed(2)})
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
                                      type="text"
                                      inputMode="decimal"
                                      pattern="[0-9]*[.,]?[0-9]*"
                                      value={qtyDraftById[item.id] ?? String(item.quantity ?? 1)}
                                      onChange={(e) => {
                                        const raw = e.target.value
                                        // Allow empty while typing; only allow numbers + optional decimal point
                                        if (!/^\d*[.,]?\d*$/.test(raw)) return
                                        setQtyDraftById((m) => ({ ...m, [item.id]: raw }))
                                        if (raw === '') return
                                        const newItems = [...lineItems]
                                        const qty = parseFloat(raw.replace(',', '.'))
                                        if (!Number.isFinite(qty) || qty <= 0) return
                                        newItems[index].quantity = qty
                                        newItems[index].lineTotal = qty * newItems[index].unitPrice
                                        setLineItems(newItems)
                                      }}
                                      onFocus={(e) => {
                                        // Make it easy to replace "1" with "4" without needing to backspace first.
                                        e.currentTarget.select()
                                      }}
                                      onMouseDown={(e) => {
                                        // If the user clicks into an already-focused input, onFocus won't fire.
                                        // Ensure we still select the whole value, but don't break focus.
                                        if (document.activeElement === e.currentTarget) return
                                        e.preventDefault()
                                        e.currentTarget.focus()
                                        // Defer selection until after focus is applied.
                                        requestAnimationFrame(() => e.currentTarget.select())
                                      }}
                                      onWheel={(e) => {
                                        // Prevent mouse-wheel from "scrolling" the number value (common UX footgun on Windows)
                                        ;(e.currentTarget as HTMLInputElement).blur()
                                      }}
                                      onBlur={() => {
                                        const raw = qtyDraftById[item.id]
                                        if (raw == null) return
                                        const parsed = parseFloat(raw.replace(',', '.'))
                                        const qty = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
                                        const newItems = [...lineItems]
                                        newItems[index].quantity = qty
                                        newItems[index].lineTotal = qty * newItems[index].unitPrice
                                        setLineItems(newItems)
                                        setQtyDraftById((m) => {
                                          const next = { ...m }
                                          delete next[item.id]
                                          return next
                                        })
                                      }}
                                      placeholder="1"
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
                                        setQtyDraftById((m) => {
                                          if (!m[item.id]) return m
                                          const next = { ...m }
                                          delete next[item.id]
                                          return next
                                        })
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

                      {/* Discount dropdown */}
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="text-xs text-[color:var(--color-text-muted)] sm:w-36">
                          Discount
                        </label>
                        <div className="flex flex-1 items-center gap-2">
                          <select
                            value={appliedDiscount?._id ?? ''}
                            onChange={(e) => {
                              const id = e.target.value
                              if (!id) {
                                setAppliedDiscount(null)
                                setDiscountCode('')
                                return
                              }
                              const d = discounts.find((x: Discount) => x._id === id) || null
                              setAppliedDiscount(d)
                              setDiscountCode(d?.code || d?.name || '')
                            }}
                            className="flex-1 rounded border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-xs text-[color:var(--color-text)]"
                          >
                            <option value="">No discount</option>
                            {discounts.map((d: Discount) => (
                              <option key={d._id} value={d._id}>
                                {(d.code ? `${d.code} — ` : '')}{d.name}
                              </option>
                            ))}
                          </select>
                          {appliedDiscount && (
                            <button
                              type="button"
                              onClick={() => {
                                setAppliedDiscount(null)
                                setDiscountCode('')
                              }}
                              className="rounded border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                            >
                              Clear
                            </button>
                          )}
                        </div>
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
                    {accounts.map((a) => (<option key={a._id} value={a._id}>{(a.accountNumber ?? '-')} - {a.name ?? 'Account'}</option>))}
                  </select>
                </label>

                {/* Send Invoice Section */}
                <div className="col-span-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3">
                  <div className="mb-2 text-sm font-semibold">Send Invoice</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                        CRM Contact
                      </label>
                      <select
                        key={`contacts-${contacts.length}`}
                        id="invoice-send-contact"
                        disabled={contactsLoading}
                        className="w-full rounded border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] disabled:opacity-50"
                      >
                        <option value="">
                          {contactsLoading ? 'Loading contacts...' : contacts.length === 0 ? 'No contacts found' : 'Select contact...'}
                        </option>
                        {contacts.map((c: any) => (
                          <option key={c._id} value={c.email || c._id}>
                            {c.name || 'Unnamed'} ({c.email || 'No email'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                        Customer Portal User
                      </label>
                      <select
                        key={`portal-users-${portalUsers.length}-${editing.accountId}`}
                        id="invoice-send-portal-user"
                        disabled={!editing.accountId}
                        className="w-full rounded border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] disabled:opacity-50"
                      >
                        <option value="">
                          {!editing.accountId 
                            ? 'Select account first' 
                            : portalUsers.length === 0 
                            ? 'No portal users found' 
                            : 'Select portal user...'}
                        </option>
                        {portalUsers.map((user: any) => (
                          <option key={user.id} value={user.email}>
                            {user.name} ({user.email})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => {
                          const contactSelect = document.getElementById('invoice-send-contact') as HTMLSelectElement
                          const portalSelect = document.getElementById('invoice-send-portal-user') as HTMLSelectElement
                          
                          const email = contactSelect?.value || portalSelect?.value
                          if (!email) {
                            toast.showToast('Please select a recipient', 'warning')
                            return
                          }
                          
                          sendEmail.mutate({ id: editing._id, recipientEmail: email })
                        }}
                        disabled={sendEmail.isPending}
                        className="w-full rounded bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                      >
                        <Send className="inline h-3 w-3 mr-1" />
                        Send Invoice
                      </button>
                    </div>
                  </div>
                </div>

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
                  <button
                    type="button"
                    onClick={() => {
                      if (!editing?._id) return
                      const url = `/apps/crm/invoices/${editing._id}/print`
                      window.open(url, '_blank', 'noopener,noreferrer')
                    }}
                    className="flex items-center gap-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]"
                    title="Open printable invoice view"
                  >
                    <Printer className="h-3 w-3" />
                    Print Invoice
                  </button>
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setShowHistory((v) => !v)}>{showHistory ? 'Hide history' : 'View history'}</button>
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
                </div>
                {showHistory && historyQ.data && (
                  <div className="col-span-full mt-3 rounded-xl border border-[color:var(--color-border)] p-3 text-xs space-y-3">
                    <div>
                      <div className="font-semibold mb-2">Invoice Information</div>
                      <div>Created: {formatDateTime(historyQ.data.data.createdAt)}</div>
                      <div className="mt-1">Invoice: {historyQ.data.data.invoice?.invoiceNumber ?? ''} {historyQ.data.data.invoice?.title ?? ''} • Status: {historyQ.data.data.invoice?.status ?? ''}</div>
                    </div>
                    
                    <div>
                      <div className="font-semibold mb-2">History Timeline</div>
                      {historyQ.data.data.history && historyQ.data.data.history.length > 0 ? (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                          {historyQ.data.data.history.map((entry) => (
                            <div key={entry._id} className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-bg)] p-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="font-medium">{entry.description}</div>
                                  {entry.userName && (
                                    <div className="mt-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                                      By: {entry.userName} ({entry.userEmail})
                                    </div>
                                  )}
                                  {(entry.oldValue !== undefined || entry.newValue !== undefined) && (
                                    <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">
                                      {entry.oldValue !== undefined && <span>From: {JSON.stringify(entry.oldValue)}</span>}
                                      {entry.oldValue !== undefined && entry.newValue !== undefined && <span> → </span>}
                                      {entry.newValue !== undefined && <span>To: {JSON.stringify(entry.newValue)}</span>}
                                    </div>
                                  )}
                                </div>
                                <div className="text-[10px] text-[color:var(--color-text-muted)] whitespace-nowrap">
                                  {formatDateTime(entry.createdAt)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[color:var(--color-text-muted)]">No history entries found.</div>
                      )}
                    </div>
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


