import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { CRMHelpButton } from '@/components/CRMHelpButton'
import { Modal } from '@/components/Modal'
import { formatDateTime } from '@/lib/dateFormat'
import { AuditTrail, type AuditEntry } from '@/components/AuditTrail'
import { Package, Layers, Tag, FileText, TrendingUp, Download, TrendingDown, DollarSign, PackageIcon, BarChart3, PieChart, FileDown } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Legend } from 'recharts'
import { useToast } from '@/components/Toast'

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

type ProductSurveyStatusSummary = {
  productId: string
  responseCount: number
  lastResponseAt: string | null
  lastScore: number | null
}

const CURRENCY_OPTIONS: Array<{ code: string; label: string; symbol: string }> = [
  { code: 'USD', label: 'USD - US Dollar', symbol: '$' },
  { code: 'EUR', label: 'EUR - Euro', symbol: '€' },
  { code: 'GBP', label: 'GBP - British Pound', symbol: '£' },
  { code: 'CAD', label: 'CAD - Canadian Dollar', symbol: '$' },
  { code: 'AUD', label: 'AUD - Australian Dollar', symbol: '$' },
  { code: 'JPY', label: 'JPY - Japanese Yen', symbol: '¥' },
  { code: 'INR', label: 'INR - Indian Rupee', symbol: '₹' },
]

const currencySymbolMap: Record<string, string> = CURRENCY_OPTIONS.reduce((acc, c) => {
  acc[c.code] = c.symbol
  return acc
}, {} as Record<string, string>)

function formatCurrency(amount: number, currency?: string) {
  const code = currency || 'USD'
  const symbol = currencySymbolMap[code]
  const fixed = Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
  if (symbol) return `${symbol}${fixed}`
  return `${code} ${fixed}`
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
  const toast = useToast()
  const [activeTab, setActiveTab] = React.useState<'products' | 'bundles' | 'discounts' | 'terms' | 'profitability' | 'terms-ledger'>('products')
  const [q, setQ] = React.useState('')
  const [editing, setEditing] = React.useState<Product | Bundle | Discount | CustomTerms | null>(null)
  const [productFormPrice, setProductFormPrice] = React.useState(0)
  const [productFormCost, setProductFormCost] = React.useState(0)
  const [inlineEditId, setInlineEditId] = React.useState<string | null>(null)
  const [inlineName, setInlineName] = React.useState<string>('')
  const [inlinePrice, setInlinePrice] = React.useState<string>('')
  const [inlineCost, setInlineCost] = React.useState<string>('')
  const [inlineCategory, setInlineCategory] = React.useState<string>('')
  const [inlineIsActive, setInlineIsActive] = React.useState<boolean>(true)
  const [showHistory, setShowHistory] = React.useState(false)
  const [sendingTerms, setSendingTerms] = React.useState<CustomTerms | null>(null)
  const [sendTermsRecipientEmail, setSendTermsRecipientEmail] = React.useState('')
  const [sendTermsRecipientName, setSendTermsRecipientName] = React.useState('')
  const [sendTermsCustomMessage, setSendTermsCustomMessage] = React.useState('')
  const [sendTermsAccountId, setSendTermsAccountId] = React.useState('')
  const [sendTermsContactId, setSendTermsContactId] = React.useState('')
  const [surveyProgramId, setSurveyProgramId] = React.useState('')
  const [surveyRecipientName, setSurveyRecipientName] = React.useState('')
  const [surveyRecipientEmail, setSurveyRecipientEmail] = React.useState('')
  
  // Terms Ledger state
  const [ledgerQ, setLedgerQ] = React.useState('')
  const [ledgerStatus, setLedgerStatus] = React.useState<'pending' | 'viewed' | 'approved' | 'rejected' | ''>('')
  const [ledgerSort, setLedgerSort] = React.useState<'sentAt' | 'viewedAt' | 'respondedAt' | 'status' | 'recipientEmail' | 'termsName'>('sentAt')
  const [ledgerDir, setLedgerDir] = React.useState<'asc' | 'desc'>('desc')
  
  // Sort state - separate for each tab
  const [productSort, setProductSort] = React.useState<'name' | 'sku' | 'type' | 'basePrice' | 'cost' | 'category' | 'isActive' | 'updatedAt' | 'createdAt'>('updatedAt')
  const [productDir, setProductDir] = React.useState<'asc' | 'desc'>('desc')
  const [bundleSort, setBundleSort] = React.useState<'name' | 'sku' | 'bundlePrice' | 'isActive' | 'updatedAt' | 'createdAt'>('updatedAt')
  const [bundleDir, setBundleDir] = React.useState<'asc' | 'desc'>('desc')
  const [discountSort, setDiscountSort] = React.useState<'name' | 'code' | 'type' | 'value' | 'scope' | 'isActive' | 'updatedAt' | 'createdAt'>('updatedAt')
  const [discountDir, setDiscountDir] = React.useState<'asc' | 'desc'>('desc')
  const [termsSort, setTermsSort] = React.useState<'name' | 'isDefault' | 'isActive' | 'updatedAt' | 'createdAt'>('updatedAt')
  const [termsDir, setTermsDir] = React.useState<'asc' | 'desc'>('desc')
  
  // Helper function to handle column header click for sorting
  const handleSort = (column: string, currentSort: string, currentDir: string, setSort: (s: any) => void, setDir: (d: 'asc' | 'desc') => void) => {
    if (currentSort === column) {
      setDir(currentDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSort(column)
      setDir('asc')
    }
  }
  
  // Helper function to get sort indicator
  const getSortIndicator = (column: string, currentSort: string, currentDir: string) => {
    if (currentSort !== column) return null
    return currentDir === 'asc' ? '↑' : '↓'
  }

  // Products query
  const { data: productsData } = useQuery({
    queryKey: ['products', q, productSort, productDir],
    queryFn: async () => {
      const res = await http.get('/api/crm/products', { params: { q, sort: productSort, dir: productDir } })
      return res.data as { data: { items: Product[] } }
    },
  })
  const products = productsData?.data.items ?? []

  // Survey programs
  const { data: surveyProgramsData } = useQuery({
    queryKey: ['survey-programs'],
    queryFn: async () => {
      const res = await http.get('/api/crm/surveys/programs')
      return res.data as {
        data: {
          items: Array<{ _id: string; name: string; type: 'NPS' | 'CSAT' | 'Post‑interaction' }>
        }
      }
    },
  })
  const surveyPrograms = React.useMemo(
    () => surveyProgramsData?.data.items ?? [],
    [surveyProgramsData?.data.items],
  )

  // Product survey status
  const productIdsParam = React.useMemo(
    () => (products.length ? products.map((p) => p._id).join(',') : ''),
    [products],
  )

  const { data: productSurveyStatusData } = useQuery({
    queryKey: ['products-survey-status', productIdsParam],
    enabled: !!productIdsParam,
    queryFn: async () => {
      const res = await http.get('/api/crm/surveys/products/status', {
        params: { productIds: productIdsParam },
      })
      return res.data as { data: { items: ProductSurveyStatusSummary[] } }
    },
  })

  const productSurveyStatusMap = React.useMemo(() => {
    const map = new Map<string, ProductSurveyStatusSummary>()
    for (const s of productSurveyStatusData?.data.items ?? []) {
      map.set(s.productId, s)
    }
    return map
  }, [productSurveyStatusData?.data.items])

  // Bundles query
  const { data: bundlesData } = useQuery({
    queryKey: ['bundles', q, bundleSort, bundleDir],
    queryFn: async () => {
      const res = await http.get('/api/crm/products/bundles', { params: { q, sort: bundleSort, dir: bundleDir } })
      return res.data as { data: { items: Bundle[] } }
    },
  })
  const bundles = bundlesData?.data.items ?? []

  // Discounts query
  const { data: discountsData } = useQuery({
    queryKey: ['discounts', q, discountSort, discountDir],
    queryFn: async () => {
      const res = await http.get('/api/crm/products/discounts', { params: { q, sort: discountSort, dir: discountDir } })
      return res.data as { data: { items: Discount[] } }
    },
  })
  const discounts = discountsData?.data.items ?? []

  // Terms query
  const { data: termsData } = useQuery({
    queryKey: ['terms', q, termsSort, termsDir],
    queryFn: async () => {
      const res = await http.get('/api/crm/products/terms', { params: { q, sort: termsSort, dir: termsDir } })
      return res.data as { data: { items: CustomTerms[] } }
    },
  })
  const terms = termsData?.data.items ?? []
  // Send survey mutation for products
  const sendSurveyEmail = useMutation({
    mutationFn: async (payload: {
      programId: string
      recipientName?: string
      recipientEmail: string
      productId: string
    }) => {
      const { programId, ...rest } = payload
      const res = await http.post(`/api/crm/surveys/programs/${programId}/send-email`, rest)
      return res.data
    },
    onSuccess: () => {
      toast.showToast('Survey email sent', 'success')
      qc.invalidateQueries({ queryKey: ['products-survey-status'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to send survey email'
      toast.showToast(msg, 'error')
    },
  })
  
  // Accounts and Contacts queries for sending terms
  const accountsQ = useQuery({
    queryKey: ['accounts-pick-terms'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', { params: { limit: 1000, sort: 'name', dir: 'asc' } })
      return res.data as { data: { items: Array<{ _id: string; name?: string; accountNumber?: number; primaryContactEmail?: string; primaryContactName?: string }> } }
    },
  })
  const accounts = accountsQ.data?.data.items ?? []
  
  const contactsQ = useQuery({
    queryKey: ['contacts-pick-terms'],
    queryFn: async () => {
      // Fetch contacts using page-based pagination to get all items
      const allContacts: Array<{ _id: string; name?: string; email?: string; company?: string }> = []
      let page = 0
      const pageSize = 100
      let hasMore = true
      
      while (hasMore && page < 10) { // Limit to 1000 contacts max
        const res = await http.get('/api/crm/contacts', { params: { page, limit: pageSize } })
        const data = res.data as { data: { items: Array<{ _id: string; name?: string; email?: string; company?: string }>; total?: number; pageSize?: number } }
        if (data?.data?.items) {
          allContacts.push(...data.data.items)
          hasMore = data.data.items.length === pageSize
          page++
        } else {
          hasMore = false
        }
      }
      
      return { data: { items: allContacts } }
    },
  })
  const contacts = contactsQ.data?.data.items ?? []
  
  // Send terms for review mutation
  const sendTermsForReview = useMutation({
    mutationFn: async (payload: { termsId: string; accountId?: string; contactId?: string; recipientEmail: string; recipientName?: string; customMessage?: string }) => {
      const res = await http.post(`/api/crm/products/terms/${payload.termsId}/send-for-review`, payload)
      return res.data
    },
    onSuccess: () => {
      setSendingTerms(null)
      setSendTermsRecipientEmail('')
      setSendTermsRecipientName('')
      setSendTermsCustomMessage('')
      setSendTermsAccountId('')
      setSendTermsContactId('')
      qc.invalidateQueries({ queryKey: ['terms-review-requests'] })
      toast.showToast('Terms review request sent successfully!', 'success')
    },
  })
  
  // Terms Ledger query
  const ledgerQData = useQuery({
    queryKey: ['terms-review-requests', ledgerQ, ledgerStatus, ledgerSort, ledgerDir],
    queryFn: async () => {
      const params: any = { sort: ledgerSort, dir: ledgerDir }
      if (ledgerQ) params.q = ledgerQ
      if (ledgerStatus) params.status = ledgerStatus
      // Use the new ledger endpoint to avoid any ambiguity with /terms/:id routes
      const res = await http.get('/api/crm/products/terms/ledger', { params })
      return res.data as { data: { items: Array<{
        _id: string
        termsId: string
        termsName: string
        recipientEmail: string
        recipientName?: string
        senderName?: string
        senderEmail?: string
        status: 'pending' | 'viewed' | 'approved' | 'rejected'
        sentAt: string
        viewedAt?: string
        respondedAt?: string
        responseNotes?: string
        reviewToken: string
      }> } }
    },
  })
  const ledgerItems = ledgerQData.data?.data.items ?? []

  // Products mutations
  const createProduct = useMutation({
    mutationFn: async (payload: any) => {
      const res = await http.post('/api/crm/products', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.showToast('BOAZ says: Product saved.', 'success')
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
      qc.invalidateQueries({ queryKey: ['product-history'] })
      toast.showToast('BOAZ says: Product saved.', 'success')
      setEditing(null)
    },
  })
  
  // History query (products, bundles, discounts, terms)
  const historyQ = useQuery({
    queryKey: ['product-history', editing?._id, showHistory, activeTab],
    enabled: Boolean(
      editing?._id &&
        showHistory &&
        (activeTab === 'products' || activeTab === 'bundles' || activeTab === 'discounts' || activeTab === 'terms')
    ),
    queryFn: async () => {
      if (!editing?._id) {
        return {
          data: { history: [], product: null },
        } as {
          data: {
            history: Array<{
              _id: string
              eventType: string
              description: string
              userName?: string
              userEmail?: string
              oldValue?: any
              newValue?: any
              createdAt: string
            }>
            product?: any
          }
        }
      }

      let url = ''
      if (activeTab === 'products') url = `/api/crm/products/${editing._id}/history`
      else if (activeTab === 'bundles') url = `/api/crm/products/bundles/${editing._id}/history`
      else if (activeTab === 'discounts') url = `/api/crm/products/discounts/${editing._id}/history`
      else if (activeTab === 'terms') url = `/api/crm/products/terms/${editing._id}/history`
      else url = `/api/crm/products/${editing._id}/history`

      const res = await http.get(url)
      return res.data as {
        data: {
          history: Array<{
            _id: string
            eventType: string
            description: string
            userName?: string
            userEmail?: string
            oldValue?: any
            newValue?: any
            createdAt: string
          }>
          product?: any
          bundle?: any
          discount?: any
          terms?: any
        }
      }
    },
  })
  
  // Reset history visibility when editing changes
  React.useEffect(() => {
    setShowHistory(false)
  }, [editing?._id])

  function startInlineEdit(p: Product) {
    setInlineEditId(p._id)
    setInlineName(p.name ?? '')
    setInlinePrice(typeof p.basePrice === 'number' ? String(p.basePrice) : '')
    setInlineCost(typeof p.cost === 'number' ? String(p.cost) : '')
    setInlineCategory(p.category ?? '')
    setInlineIsActive(p.isActive !== false)
  }
  async function saveInlineEdit() {
    if (!inlineEditId) return
    const payload: any = { _id: inlineEditId }
    payload.name = inlineName || undefined
    if (inlinePrice.trim() !== '') {
      const n = Number(inlinePrice)
      if (Number.isFinite(n)) payload.basePrice = n
    }
    if (inlineCost.trim() !== '') {
      const n = Number(inlineCost)
      if (Number.isFinite(n)) payload.cost = n
    } else {
      payload.cost = undefined
    }
    payload.category = inlineCategory || undefined
    payload.isActive = inlineIsActive
    await updateProduct.mutateAsync(payload)
    cancelInlineEdit()
  }
  function cancelInlineEdit() {
    setInlineEditId(null)
    setInlineName('')
    setInlinePrice('')
    setInlineCost('')
    setInlineCategory('')
    setInlineIsActive(true)
  }

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/api/crm/products/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product-history'] })
      toast.showToast('BOAZ says: Product deleted.', 'success')
      setEditing(null)
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
      toast.showToast('BOAZ says: Bundle saved.', 'success')
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
      toast.showToast('BOAZ says: Bundle saved.', 'success')
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
      toast.showToast('BOAZ says: Discount saved.', 'success')
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
      toast.showToast('BOAZ says: Discount saved.', 'success')
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
      toast.showToast('BOAZ says: Terms saved.', 'success')
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
      toast.showToast('BOAZ says: Terms saved.', 'success')
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
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Product Catalog &amp; Pricing</h1>
        <CRMHelpButton tag="crm:products" />
      </div>

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
          onClick={() => setActiveTab('terms-ledger')}
          className={`flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'terms-ledger'
              ? 'border-[color:var(--color-primary-600)] text-[color:var(--color-primary-600)]'
              : 'border-transparent text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]'
          }`}
        >
          <FileText className="h-4 w-4" />
          Terms Ledger
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
        <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <div className="flex flex-wrap items-center gap-2 p-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products..."
              className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                const headers = ['SKU', 'Name', 'Type', 'Currency', 'Price', 'Cost', 'Margin', 'Margin %', 'Category', 'Status', 'Updated']
                const rows = products.map((product) => {
                  const cost = product.cost ?? 0
                  const margin = product.basePrice - cost
                  const marginPercent = product.basePrice > 0 ? ((margin / product.basePrice) * 100) : 0
                  return [
                    product.sku || '',
                    product.name || '',
                    product.type || '',
                    product.currency || 'USD',
                    product.basePrice?.toFixed(2) || '0.00',
                    cost > 0 ? cost.toFixed(2) : '',
                    cost > 0 ? margin.toFixed(2) : '',
                    cost > 0 ? `${marginPercent.toFixed(1)}%` : '',
                    product.category || '',
                    product.isActive ? 'Active' : 'Inactive',
                    product.updatedAt ? new Date(product.updatedAt).toISOString() : ''
                  ]
                })
                const csv = [headers.join(','), ...rows.map((r) => r.map((x) => '"' + String(x).replaceAll('"', '""') + '"').join(','))].join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'products.csv'
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => setEditing({} as Product)}
              className="ml-auto rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
            >
              New Product
            </button>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[color:var(--color-text-muted)]">
              <tr>
                <th
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('sku', productSort, productDir, setProductSort, setProductDir)}
                >
                  <div className="inline-flex items-center gap-1">
                    <span>SKU {getSortIndicator('sku', productSort, productDir)}</span>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                      title="Unique SKU or item code used to identify this product."
                    >
                      ?
                    </button>
                  </div>
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('name', productSort, productDir, setProductSort, setProductDir)}
                >
                  <div className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span>Name {getSortIndicator('name', productSort, productDir)}</span>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                      title="Product name shown on quotes, invoices, and reports."
                    >
                      ?
                    </button>
                  </div>
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('type', productSort, productDir, setProductSort, setProductDir)}
                >
                  <div className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span>Type {getSortIndicator('type', productSort, productDir)}</span>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                      title="High-level product type (e.g., Software, Service, Hardware, Subscription)."
                    >
                      ?
                    </button>
                  </div>
                </th>
                <th className="px-4 py-2 whitespace-nowrap">
                  <div className="inline-flex items-center gap-1">
                    <span>Currency</span>
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                      title="Currency used for price and cost for this product."
                    >
                      ?
                    </span>
                  </div>
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('basePrice', productSort, productDir, setProductSort, setProductDir)}
                >
                  <div className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span>Price {getSortIndicator('basePrice', productSort, productDir)}</span>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                      title="Standard selling price before discounts or taxes."
                    >
                      ?
                    </button>
                  </div>
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('cost', productSort, productDir, setProductSort, setProductDir)}
                >
                  <div className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span>Cost {getSortIndicator('cost', productSort, productDir)}</span>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                      title="Internal cost basis used to calculate margin and profitability."
                    >
                      ?
                    </button>
                  </div>
                </th>
                <th className="px-4 py-2 whitespace-nowrap">
                  <div className="inline-flex items-center gap-1">
                    <span>Margin</span>
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                      title="Difference between price and cost (Price − Cost)."
                    >
                      ?
                    </span>
                  </div>
                </th>
                <th className="px-4 py-2 whitespace-nowrap">
                  <div className="inline-flex items-center gap-1">
                    <span>Margin %</span>
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                      title="Margin expressed as a percentage of price ((Price − Cost) ÷ Price)."
                    >
                      ?
                    </span>
                  </div>
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('category', productSort, productDir, setProductSort, setProductDir)}
                >
                  <div className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span>Category {getSortIndicator('category', productSort, productDir)}</span>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                      title="Grouping used for reporting, bundles, and filtering (e.g., Licenses, Hardware)."
                    >
                      ?
                    </button>
                  </div>
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('isActive', productSort, productDir, setProductSort, setProductDir)}
                >
                  <div className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span>Status {getSortIndicator('isActive', productSort, productDir)}</span>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                      title="Whether the product is active and available to use on deals, quotes, and invoices."
                    >
                      ?
                    </button>
                  </div>
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('updatedAt', productSort, productDir, setProductSort, setProductDir)}
                >
                  <div className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span>Updated {getSortIndicator('updatedAt', productSort, productDir)}</span>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                      title="Last time this product record was modified."
                    >
                      ?
                    </button>
                  </div>
                </th>
                <th className="px-4 py-2 whitespace-nowrap">
                  <div className="inline-flex items-center gap-1">
                    <span>Survey</span>
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                      title="Survey or feedback configuration related to this product."
                    >
                      ?
                    </span>
                  </div>
                </th>
                <th className="px-4 py-2 whitespace-nowrap">
                  <div className="inline-flex items-center gap-1">
                    <span>Actions</span>
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                      title="Shortcuts to edit, configure, or analyze this product."
                    >
                      ?
                    </span>
                  </div>
                </th>
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
                    <td className="px-4 py-2">
                      {product.sku ? (
                        <button
                          type="button"
                          onClick={() => setEditing(product)}
                          className="max-w-[12rem] truncate text-left text-[color:var(--color-primary-400)] hover:text-[color:var(--color-primary-300)] hover:underline"
                          title={product.sku}
                        >
                          {product.sku}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {inlineEditId === product._id ? (
                        <input value={inlineName} onChange={(e) => setInlineName(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditing(product)}
                          className="max-w-[16rem] truncate text-left text-[color:var(--color-text)] hover:text-[color:var(--color-primary-300)] hover:underline"
                          title={product.name}
                        >
                          {product.name}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2 capitalize">{product.type}</td>
                    <td className="px-4 py-2">{product.currency || 'USD'}</td>
                    <td className="px-4 py-2">
                      {inlineEditId === product._id ? (
                        <input type="number" step="0.01" value={inlinePrice} onChange={(e) => setInlinePrice(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                      ) : (
                        formatCurrency(product.basePrice, product.currency)
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {inlineEditId === product._id ? (
                        <input type="number" step="0.01" value={inlineCost} onChange={(e) => setInlineCost(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                      ) : (
                        cost > 0 ? formatCurrency(cost, product.currency) : '-'
                      )}
                    </td>
                    <td className={`px-4 py-2 font-medium ${marginColor}`}>
                      {cost > 0 ? formatCurrency(margin, product.currency) : '-'}
                    </td>
                    <td className={`px-4 py-2 font-medium ${marginColor}`}>
                      {cost > 0 ? `${marginPercent.toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-4 py-2">
                      {inlineEditId === product._id ? (
                        <input value={inlineCategory} onChange={(e) => setInlineCategory(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                      ) : (
                        product.category || '-'
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {inlineEditId === product._id ? (
                        <select value={inlineIsActive ? 'active' : 'inactive'} onChange={(e) => setInlineIsActive(e.target.value === 'active')} className="w-full rounded border bg-[color:var(--color-panel)] px-2 py-1 text-sm text-[color:var(--color-text)]">
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      ) : (
                        <span className={`rounded px-2 py-0.5 text-xs ${product.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {product.isActive ? 'Active' : 'Inactive'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{product.updatedAt ? formatDateTime(product.updatedAt) : '-'}</td>
                    <td className="px-4 py-2">
                      {(() => {
                        const status = productSurveyStatusMap.get(product._id)
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
                              {status.responseCount} response
                              {status.responseCount === 1 ? '' : 's'}
                            </span>
                            <span className="text-[10px] text-[color:var(--color-text-muted)]">
                              Last score:{' '}
                              <span className="font-semibold text-[color:var(--color-text)]">
                                {status.lastScore != null
                                  ? status.lastScore.toFixed(1)
                                  : '-'}
                              </span>
                            </span>
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {inlineEditId === product._id ? (
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs"
                            onClick={saveInlineEdit}
                          >
                            Save
                          </button>
                          <button
                            className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs"
                            onClick={cancelInlineEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startInlineEdit(product)}
                            className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(product)}
                            className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs"
                          >
                            Open
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
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
              onClick={() => {
                const headers = ['SKU', 'Name', 'Items', 'Bundle Price', 'Status', 'Updated']
                const rows = bundles.map((bundle) => [
                  bundle.sku || '',
                  bundle.name || '',
                  bundle.items?.length || 0,
                  bundle.bundlePrice?.toFixed(2) || '0.00',
                  bundle.isActive ? 'Active' : 'Inactive',
                  bundle.updatedAt ? new Date(bundle.updatedAt).toISOString() : ''
                ])
                const csv = [headers.join(','), ...rows.map((r) => r.map((x) => '"' + String(x).replaceAll('"', '""') + '"').join(','))].join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'bundles.csv'
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
            >
              Export CSV
            </button>
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
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('sku', bundleSort, bundleDir, setBundleSort, setBundleDir)}
                >
                  SKU {getSortIndicator('sku', bundleSort, bundleDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('name', bundleSort, bundleDir, setBundleSort, setBundleDir)}
                >
                  Name {getSortIndicator('name', bundleSort, bundleDir)}
                </th>
                <th className="px-4 py-2">Items</th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('bundlePrice', bundleSort, bundleDir, setBundleSort, setBundleDir)}
                >
                  Bundle Price {getSortIndicator('bundlePrice', bundleSort, bundleDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('isActive', bundleSort, bundleDir, setBundleSort, setBundleDir)}
                >
                  Status {getSortIndicator('isActive', bundleSort, bundleDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('updatedAt', bundleSort, bundleDir, setBundleSort, setBundleDir)}
                >
                  Updated {getSortIndicator('updatedAt', bundleSort, bundleDir)}
                </th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bundles.map((bundle) => (
                <tr key={bundle._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                  <td className="px-4 py-2">{bundle.sku || '-'}</td>
                  <td className="px-4 py-2">{bundle.name}</td>
                  <td className="px-4 py-2">{bundle.items?.length || 0} items</td>
                  <td className="px-4 py-2">${bundle.bundlePrice.toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${bundle.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {bundle.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2">{bundle.updatedAt ? formatDateTime(bundle.updatedAt) : '-'}</td>
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
              onClick={() => {
                const headers = ['Code', 'Name', 'Type', 'Value', 'Scope', 'Status', 'Updated']
                const rows = discounts.map((discount) => [
                  discount.code || '',
                  discount.name || '',
                  discount.type || '',
                  discount.type === 'percentage' ? `${discount.value}%` : `$${discount.value?.toFixed(2) || '0.00'}`,
                  discount.scope || '',
                  discount.isActive ? 'Active' : 'Inactive',
                  discount.updatedAt ? new Date(discount.updatedAt).toISOString() : ''
                ])
                const csv = [headers.join(','), ...rows.map((r) => r.map((x) => '"' + String(x).replaceAll('"', '""') + '"').join(','))].join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'discounts.csv'
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
            >
              Export CSV
            </button>
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
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('code', discountSort, discountDir, setDiscountSort, setDiscountDir)}
                >
                  Code {getSortIndicator('code', discountSort, discountDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('name', discountSort, discountDir, setDiscountSort, setDiscountDir)}
                >
                  Name {getSortIndicator('name', discountSort, discountDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('type', discountSort, discountDir, setDiscountSort, setDiscountDir)}
                >
                  Type {getSortIndicator('type', discountSort, discountDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('value', discountSort, discountDir, setDiscountSort, setDiscountDir)}
                >
                  Value {getSortIndicator('value', discountSort, discountDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('scope', discountSort, discountDir, setDiscountSort, setDiscountDir)}
                >
                  Scope {getSortIndicator('scope', discountSort, discountDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('isActive', discountSort, discountDir, setDiscountSort, setDiscountDir)}
                >
                  Status {getSortIndicator('isActive', discountSort, discountDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('updatedAt', discountSort, discountDir, setDiscountSort, setDiscountDir)}
                >
                  Updated {getSortIndicator('updatedAt', discountSort, discountDir)}
                </th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((discount) => (
                <tr key={discount._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                  <td className="px-4 py-2">{discount.code || '-'}</td>
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
                  <td className="px-4 py-2">{discount.updatedAt ? formatDateTime(discount.updatedAt) : '-'}</td>
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

      {/* Terms Ledger Tab */}
      {activeTab === 'terms-ledger' && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <div className="flex flex-wrap items-center gap-2 p-4">
            <input
              value={ledgerQ}
              onChange={(e) => setLedgerQ(e.target.value)}
              placeholder="Search by recipient, terms, sender..."
              className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <select
              value={ledgerStatus}
              onChange={(e) => setLedgerStatus(e.target.value as any)}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="viewed">Viewed</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <select
              value={ledgerSort}
              onChange={(e) => setLedgerSort(e.target.value as any)}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
            >
              <option value="sentAt">Sent Date</option>
              <option value="viewedAt">Viewed Date</option>
              <option value="respondedAt">Responded Date</option>
              <option value="status">Status</option>
              <option value="recipientEmail">Recipient</option>
              <option value="termsName">Terms Name</option>
            </select>
            <select
              value={ledgerDir}
              onChange={(e) => setLedgerDir(e.target.value as any)}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
            <button
              type="button"
              onClick={() => {
                const headers = ['Terms', 'Recipient Email', 'Recipient Name', 'Sender', 'Status', 'Sent', 'Viewed', 'Responded', 'Response Notes']
                const rows = ledgerItems.map((item) => [
                  item.termsName || '',
                  item.recipientEmail || '',
                  item.recipientName || '',
                  item.senderName || item.senderEmail || '',
                  item.status || '',
                  item.sentAt ? new Date(item.sentAt).toISOString() : '',
                  item.viewedAt ? new Date(item.viewedAt).toISOString() : '',
                  item.respondedAt ? new Date(item.respondedAt).toISOString() : '',
                  item.responseNotes || ''
                ])
                const csv = [headers.join(','), ...rows.map((r) => r.map((x) => '"' + String(x).replaceAll('"', '""') + '"').join(','))].join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'terms-review-ledger.csv'
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="ml-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
            >
              Export CSV
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-[color:var(--color-text-muted)]">
              <tr>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('termsName', ledgerSort, ledgerDir, setLedgerSort, setLedgerDir)}
                >
                  Terms {getSortIndicator('termsName', ledgerSort, ledgerDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('recipientEmail', ledgerSort, ledgerDir, setLedgerSort, setLedgerDir)}
                >
                  Recipient {getSortIndicator('recipientEmail', ledgerSort, ledgerDir)}
                </th>
                <th className="px-4 py-2">Recipient Name</th>
                <th className="px-4 py-2">Sender</th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('status', ledgerSort, ledgerDir, setLedgerSort, setLedgerDir)}
                >
                  Status {getSortIndicator('status', ledgerSort, ledgerDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('sentAt', ledgerSort, ledgerDir, setLedgerSort, setLedgerDir)}
                >
                  Sent {getSortIndicator('sentAt', ledgerSort, ledgerDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('viewedAt', ledgerSort, ledgerDir, setLedgerSort, setLedgerDir)}
                >
                  Viewed {getSortIndicator('viewedAt', ledgerSort, ledgerDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('respondedAt', ledgerSort, ledgerDir, setLedgerSort, setLedgerDir)}
                >
                  Responded {getSortIndicator('respondedAt', ledgerSort, ledgerDir)}
                </th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ledgerItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[color:var(--color-text-muted)]">
                    {ledgerQData.isLoading ? 'Loading...' : 'No review requests found'}
                  </td>
                </tr>
              ) : (
                ledgerItems.map((item) => {
                  const statusColors = {
                    pending: 'bg-yellow-100 text-yellow-800',
                    viewed: 'bg-blue-100 text-blue-800',
                    approved: 'bg-green-100 text-green-800',
                    rejected: 'bg-red-100 text-red-800',
                  }
                  const baseUrl = window.location.origin
                  const reviewUrl = `${baseUrl}/terms/review/${item.reviewToken}`
                  
                  return (
                    <tr key={item._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                      <td className="px-4 py-2 font-medium">{item.termsName}</td>
                      <td className="px-4 py-2">{item.recipientEmail}</td>
                      <td className="px-4 py-2">{item.recipientName || '-'}</td>
                      <td className="px-4 py-2">{item.senderName || item.senderEmail || '-'}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs capitalize ${statusColors[item.status] || 'bg-gray-100 text-gray-800'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-2">{item.sentAt ? formatDateTime(item.sentAt) : '-'}</td>
                      <td className="px-4 py-2">{item.viewedAt ? formatDateTime(item.viewedAt) : '-'}</td>
                      <td className="px-4 py-2">{item.respondedAt ? formatDateTime(item.respondedAt) : '-'}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(reviewUrl).then(() => toast.showToast('Review link copied!', 'success'))
                            }}
                            className="rounded border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                            title="Copy review link"
                          >
                            Copy Link
                          </button>
                          {item.responseNotes && (
                            <button
                              type="button"
                              onClick={() => toast.showToast(`Response Notes:\n\n${item.responseNotes}`, 'info', 10000)}
                              className="rounded border border-blue-400 px-2 py-1 text-xs text-blue-400 hover:bg-blue-50"
                              title="View response notes"
                            >
                              Notes
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          {ledgerItems.length > 0 && (
            <div className="p-4 text-sm text-[color:var(--color-text-muted)] border-t border-[color:var(--color-border)]">
              Showing {ledgerItems.length} review request{ledgerItems.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Profitability Report Tab */}
      {activeTab === 'profitability' && (
        <>
          <style>{`
            @media print {
              body * {
                visibility: hidden;
              }
              .print-report, .print-report * {
                visibility: visible;
              }
              .print-report {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                background: white;
                color: black;
                padding: 2rem;
              }
              .no-print {
                display: none !important;
              }
              .print-page-break {
                page-break-after: always;
              }
              .print-section {
                margin-bottom: 2rem;
              }
              @page {
                margin: 1in;
              }
              .print-report h1,
              .print-report h2,
              .print-report h3 {
                color: #000 !important;
                page-break-after: avoid;
              }
              .print-report .rounded-2xl,
              .print-report .rounded-xl {
                border: 1px solid #ddd !important;
                page-break-inside: avoid;
              }
            }
          `}</style>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] print-report">
            <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold print:text-2xl print:font-bold">Product Profitability Report</h2>
              <div className="flex gap-2 no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
                >
                  <FileDown className="h-4 w-4" />
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                  const productsWithCost = products.filter((p: Product) => (p.cost ?? 0) > 0)
                  const totalRevenue = productsWithCost.reduce((sum: number, p: Product) => sum + p.basePrice, 0)
                  const totalCost = productsWithCost.reduce((sum: number, p: Product) => sum + (p.cost ?? 0), 0)
                  const totalMargin = totalRevenue - totalCost
                  const overallMarginPercent = totalRevenue > 0 ? ((totalMargin / totalRevenue) * 100) : 0
                  
                  const byCategory = productsWithCost.reduce((acc: Record<string, { revenue: number; cost: number; count: number; products: Product[] }>, p: Product) => {
                    const cat = p.category || 'Uncategorized'
                    if (!acc[cat]) {
                      acc[cat] = { revenue: 0, cost: 0, count: 0, products: [] }
                    }
                    acc[cat].revenue += p.basePrice
                    acc[cat].cost += (p.cost ?? 0)
                    acc[cat].count += 1
                    acc[cat].products.push(p)
                    return acc
                  }, {})
                  
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
                    ].map((x: any) => '"' + String(x).replaceAll('"', '""') + '"').join(','))
                  })
                  csvRows.push('')
                  csvRows.push('')
                  
                  // All products with margins (sorted by margin)
                  csvRows.push('ALL PRODUCTS BY MARGIN')
                  csvRows.push('Product Name,SKU,Category,Type,Price,Cost,Margin,Margin %')
                  const sortedProducts = [...productsWithCost].sort((a: Product, b: Product) => {
                    const marginA = a.basePrice - (a.cost ?? 0)
                    const marginB = b.basePrice - (b.cost ?? 0)
                    return marginB - marginA
                  })
                  sortedProducts.forEach((product: Product) => {
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
                    ].map((x: any) => '"' + String(x).replaceAll('"', '""') + '"').join(','))
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
                  {/* Report Header for Print */}
                  <div className="no-print print-section border-b border-[color:var(--color-border)] pb-6 mb-8">
                    <h1 className="text-3xl font-bold text-[color:var(--color-text)] mb-2">Product Profitability Report</h1>
                    <p className="text-sm text-[color:var(--color-text-muted)]">Generated on {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  </div>

                  {/* Summary Cards - Enhanced */}
                  <div className="print-section grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="group relative overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]">
                      <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-blue-200/20 dark:bg-blue-800/20 blur-2xl"></div>
                      <div className="relative flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-xs font-medium text-[color:var(--color-text-muted)] uppercase tracking-wide">Total Products</div>
                          <div className="mt-2 text-3xl font-bold text-blue-900 dark:text-blue-100">{products.length}</div>
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
                  <div className="print-section print-page-break grid gap-6 lg:grid-cols-2">
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
                            {categoryChartData.map((_entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Margin Distribution - Pie Chart */}
                    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-sm overflow-hidden">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base font-semibold flex items-center gap-2 pr-2">
                          <PieChart className="h-4 w-4 flex-shrink-0" />
                          <span className="break-words">Margin Distribution</span>
                        </h3>
                      </div>
                      <div className="overflow-hidden">
                        <ResponsiveContainer width="100%" height={300}>
                          <RechartsPieChart>
                            <Pie
                              data={pieChartData}
                              cx="50%"
                              cy="45%"
                              labelLine={false}
                              outerRadius={70}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {pieChartData.map((_entry, index) => (
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
                              formatter={(value: number, _name: string, props: any) => {
                                const entry = props.payload
                                return [
                                  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${((value / pieChartData.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1)}%)`,
                                  entry.name
                                ]
                              }}
                            />
                            <Legend 
                              verticalAlign="bottom" 
                              height={50}
                              wrapperStyle={{ 
                                paddingTop: '10px', 
                                fontSize: '11px', 
                                width: '100%',
                                overflow: 'hidden',
                                wordWrap: 'break-word'
                              }}
                              iconType="circle"
                              iconSize={8}
                              layout="horizontal"
                              formatter={(value, entry: any) => {
                                const total = pieChartData.reduce((sum, d) => sum + d.value, 0)
                                const percent = ((entry.payload.value / total) * 100).toFixed(1)
                                return `${value} (${percent}%)`
                              }}
                            />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* By Category - Enhanced Cards */}
                  <div className="print-section print-page-break">
                    <h3 className="mb-4 text-lg font-bold text-[color:var(--color-text)] flex items-center gap-2">
                      <Package className="h-5 w-5" />
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
                  <div className="print-section print-page-break space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-[color:var(--color-text)] flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Top Products by Margin
                      </h3>
                      <span className="text-xs text-[color:var(--color-text-muted)] no-print">Showing top 10</span>
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
                            formatter={(value: number, name: string, _props: any) => {
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
                            {topProductsChartData.map((product, _index) => {
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
        </>
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
              onClick={() => {
                const headers = ['Name', 'Default', 'Status', 'Updated']
                const rows = terms.map((term) => [
                  term.name || '',
                  term.isDefault ? 'Yes' : 'No',
                  term.isActive ? 'Active' : 'Inactive',
                  term.updatedAt ? new Date(term.updatedAt).toISOString() : ''
                ])
                const csv = [headers.join(','), ...rows.map((r) => r.map((x) => '"' + String(x).replaceAll('"', '""') + '"').join(','))].join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'custom-terms.csv'
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
            >
              Export CSV
            </button>
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
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('name', termsSort, termsDir, setTermsSort, setTermsDir)}
                >
                  Name {getSortIndicator('name', termsSort, termsDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('isDefault', termsSort, termsDir, setTermsSort, setTermsDir)}
                >
                  Default {getSortIndicator('isDefault', termsSort, termsDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('isActive', termsSort, termsDir, setTermsSort, setTermsDir)}
                >
                  Status {getSortIndicator('isActive', termsSort, termsDir)}
                </th>
                <th 
                  className="px-4 py-2 cursor-pointer hover:text-[color:var(--color-text)] select-none"
                  onClick={() => handleSort('updatedAt', termsSort, termsDir, setTermsSort, setTermsDir)}
                >
                  Updated {getSortIndicator('updatedAt', termsSort, termsDir)}
                </th>
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
                  <td className="px-4 py-2">{term.updatedAt ? formatDateTime(term.updatedAt) : '-'}</td>
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
                        onClick={() => setSendingTerms(term)}
                        className="rounded border border-blue-400 px-2 py-1 text-xs text-blue-400 hover:bg-blue-50"
                      >
                        Send for Review
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
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={
          activeTab === 'products' ? (editing?._id ? 'Edit Product' : 'New Product') :
          activeTab === 'bundles' ? (editing?._id ? 'Edit Bundle' : 'New Bundle') :
          activeTab === 'discounts' ? (editing?._id ? 'Edit Discount' : 'New Discount') :
          activeTab === 'terms' ? (editing?._id ? 'Edit Terms' : 'New Terms') :
          'Edit'
        }
        width="48rem"
      >
        {editing && (
          <>
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
                      <select
                        name="currency"
                        defaultValue={(editing as Product).currency || 'USD'}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
                      >
                        {CURRENCY_OPTIONS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
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
                        <div className="mb-1 text-xs text-[color:var(--color-text-muted)]">
                          Projected Margin
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium">Margin: </span>
                            <span className={`font-semibold ${marginColor}`}>
                              {formatCurrency(margin, (editing as Product).currency)} ({marginPercent.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="mb-1 block text-sm font-medium">Category</label>
                      <input
                        name="category"
                        defaultValue={(editing as Product).category}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="flex items-center gap-2">
                        <input
                          name="isActive"
                          type="checkbox"
                          defaultChecked={(editing as Product).isActive !== false}
                          className="rounded border-[color:var(--color-border)]"
                        />
                        <span className="text-sm">Active</span>
                      </label>
                    </div>
                    {/* Surveys & Feedback */}
                    <div className="sm:col-span-2 mt-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 space-y-3">
                      <div className="text-sm font-semibold">Surveys &amp; Feedback</div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                            Program
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
                              productId: editing._id,
                            })
                          }}
                        >
                          {sendSurveyEmail.isPending ? 'Sending…' : 'Send survey email for product'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4 border-t border-[color:var(--color-border)]">
                    {activeTab === 'products' && editing._id && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowHistory((v) => !v)}
                          className="mr-auto rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                        >
                          {showHistory ? 'Hide history' : 'View history'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Delete "${(editing as Product).name}"?`)) {
                              deleteProduct.mutate((editing as Product)._id)
                            }
                          }}
                          className="mr-2 rounded-lg border border-red-500 px-4 py-2 text-sm text-red-500 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
                    >
                      Save
                    </button>
                  </div>
                  {activeTab === 'products' && showHistory && historyQ.data && historyQ.data.data.history && (
                    <div className="mt-3">
                      <AuditTrail
                        entries={historyQ.data.data.history.map((entry): AuditEntry => ({
                          timestamp: entry.createdAt,
                          action: entry.eventType,
                          userName: entry.userName,
                          userEmail: entry.userEmail,
                          description: entry.description,
                          oldValue: entry.oldValue,
                          newValue: entry.newValue,
                        }))}
                        title="Product History"
                        emptyMessage="No history available."
                      />
                    </div>
                  )}
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
                      <select
                        name="currency"
                        defaultValue={(editing as Bundle).currency || 'USD'}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
                      >
                        {CURRENCY_OPTIONS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
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
                    {activeTab === 'bundles' && editing._id && (
                      <button
                        type="button"
                        onClick={() => setShowHistory((v) => !v)}
                        className="mr-auto rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                      >
                        {showHistory ? 'Hide history' : 'View history'}
                      </button>
                    )}
                    <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]">
                      Cancel
                    </button>
                    <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">
                      Save
                    </button>
                  </div>
                  {activeTab === 'bundles' && showHistory && historyQ.data && historyQ.data.data.history && (
                    <div className="mt-3">
                      <AuditTrail
                        entries={historyQ.data.data.history.map((entry): AuditEntry => ({
                          timestamp: entry.createdAt,
                          action: entry.eventType,
                          userName: entry.userName,
                          userEmail: entry.userEmail,
                          description: entry.description,
                          oldValue: entry.oldValue,
                          newValue: entry.newValue,
                        }))}
                        title="Bundle History"
                        emptyMessage="No history available."
                      />
                    </div>
                  )}
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
                    {activeTab === 'discounts' && editing._id && (
                      <button
                        type="button"
                        onClick={() => setShowHistory((v) => !v)}
                        className="mr-auto rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                      >
                        {showHistory ? 'Hide history' : 'View history'}
                      </button>
                    )}
                    <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]">
                      Cancel
                    </button>
                    <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">
                      Save
                    </button>
                  </div>
                  {activeTab === 'discounts' && showHistory && historyQ.data && historyQ.data.data.history && (
                    <div className="mt-3">
                      <AuditTrail
                        entries={historyQ.data.data.history.map((entry): AuditEntry => ({
                          timestamp: entry.createdAt,
                          action: entry.eventType,
                          userName: entry.userName,
                          userEmail: entry.userEmail,
                          description: entry.description,
                          oldValue: entry.oldValue,
                          newValue: entry.newValue,
                        }))}
                        title="Discount History"
                        emptyMessage="No history available."
                      />
                    </div>
                  )}
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
                    {activeTab === 'terms' && editing._id && (
                      <button
                        type="button"
                        onClick={() => setShowHistory((v) => !v)}
                        className="mr-auto rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                      >
                        {showHistory ? 'Hide history' : 'View history'}
                      </button>
                    )}
                    <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]">
                      Cancel
                    </button>
                    <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">
                      Save
                    </button>
                  </div>
                  {activeTab === 'terms' && showHistory && historyQ.data && historyQ.data.data.history && (
                    <div className="mt-3">
                      <AuditTrail
                        entries={historyQ.data.data.history.map((entry): AuditEntry => ({
                          timestamp: entry.createdAt,
                          action: entry.eventType,
                          userName: entry.userName,
                          userEmail: entry.userEmail,
                          description: entry.description,
                          oldValue: entry.oldValue,
                          newValue: entry.newValue,
                        }))}
                        title="Terms History"
                        emptyMessage="No history available."
                      />
                    </div>
                  )}
                </form>
              )}
          </>
        )}
      </Modal>

      {/* Send Terms for Review Modal */}
      <Modal
        open={!!sendingTerms}
        onClose={() => setSendingTerms(null)}
        title="Send Terms for Review"
        width="40rem"
      >
        {sendingTerms && (
          <>
            <div className="mb-4 p-3 rounded-lg bg-[color:var(--color-muted)]">
              <div className="text-sm font-medium">{sendingTerms.name}</div>
              {sendingTerms.description && <div className="text-xs text-[color:var(--color-text-muted)] mt-1">{sendingTerms.description}</div>}
            </div>
            <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const selectedAccount = sendTermsAccountId ? accounts.find(a => a._id === sendTermsAccountId) : null
                  const selectedContact = sendTermsContactId ? contacts.find(c => c._id === sendTermsContactId) : null
                  
                  sendTermsForReview.mutate({
                    termsId: sendingTerms._id,
                    accountId: sendTermsAccountId || undefined,
                    contactId: sendTermsContactId || undefined,
                    recipientEmail: sendTermsRecipientEmail || selectedContact?.email || selectedAccount?.primaryContactEmail || '',
                    recipientName: sendTermsRecipientName || selectedContact?.name || selectedAccount?.primaryContactName || undefined,
                    customMessage: sendTermsCustomMessage || undefined,
                  })
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium mb-1">Account (Optional)</label>
                  <select
                    value={sendTermsAccountId}
                    onChange={(e) => {
                      setSendTermsAccountId(e.target.value)
                      const account = accounts.find(a => a._id === e.target.value)
                      if (account) {
                        setSendTermsRecipientEmail(account.primaryContactEmail || '')
                        setSendTermsRecipientName(account.primaryContactName || '')
                      }
                    }}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
                  >
                    <option value="">Select account (optional)</option>
                    {accounts.map((acc) => (
                      <option key={acc._id} value={acc._id}>
                        {acc.accountNumber ? `#${acc.accountNumber} - ` : ''}{acc.name || 'Unnamed Account'}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Contact (Optional)</label>
                  <select
                    value={sendTermsContactId}
                    onChange={(e) => {
                      setSendTermsContactId(e.target.value)
                      const contact = contacts.find(c => c._id === e.target.value)
                      if (contact) {
                        setSendTermsRecipientEmail(contact.email || '')
                        setSendTermsRecipientName(contact.name || '')
                      }
                    }}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
                  >
                    <option value="">Select contact (optional)</option>
                    {contacts.map((contact) => (
                      <option key={contact._id} value={contact._id}>
                        {contact.name || 'Unnamed'} {contact.email ? `(${contact.email})` : ''} {contact.company ? `- ${contact.company}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Recipient Email *</label>
                  <input
                    type="email"
                    required
                    value={sendTermsRecipientEmail}
                    onChange={(e) => setSendTermsRecipientEmail(e.target.value)}
                    placeholder="customer@example.com"
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Recipient Name (Optional)</label>
                  <input
                    type="text"
                    value={sendTermsRecipientName}
                    onChange={(e) => setSendTermsRecipientName(e.target.value)}
                    placeholder="Customer Name"
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Custom Message (Optional)</label>
                  <textarea
                    value={sendTermsCustomMessage}
                    onChange={(e) => setSendTermsCustomMessage(e.target.value)}
                    placeholder="Add a personal message to accompany the terms..."
                    rows={4}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                  />
                </div>
                
              <div className="flex items-center justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setSendingTerms(null)}
                  className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendTermsForReview.isPending}
                  className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                >
                  {sendTermsForReview.isPending ? 'Sending...' : 'Send for Review'}
                </button>
              </div>
            </form>
          </>
        )}
      </Modal>
    </div>
  )
}

