import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'
import { DocumentsList } from '@/components/DocumentsList'
import { RelatedTasks } from '@/components/RelatedTasks'

type Account = {
  _id: string
  accountNumber?: number
  name?: string
  companyName?: string
  primaryContactName?: string
  primaryContactEmail?: string
  primaryContactPhone?: string
  onboardingStatus?: 'not_started' | 'in_progress' | 'complete'
}

type AccountSurveyStatusSummary = {
  accountId: string
  responseCount: number
  lastResponseAt: string | null
  lastScore: number | null
}

export default function CRMAccounts() {
  const qc = useQueryClient()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [query, setQuery] = React.useState('')
  const [sort, setSort] = React.useState<'name'|'companyName'|'accountNumber'>('name')
  const [dir, setDir] = React.useState<'asc'|'desc'>('asc')
  type ColumnDef = { key: string; visible: boolean; label: string }
  type AssetsSummary = {
    totalEnvironments: number
    totalProducts: number
    upcomingRenewals: Array<{
      _id: string
      licenseIdentifier?: string
      licenseKey?: string
      expirationDate?: string | null
      renewalStatus: string
    }>
    productHealth: {
      Active: number
      NeedsUpgrade: number
      PendingRenewal: number
      Retired: number
    }
  }
  type AccountProjectSummaryRow = {
    accountId: string
    total: number
    active: number
    completed: number
    atRisk: number
    offTrack: number
  }

  type AccountTicketSummaryRow = {
    accountId: string
    open: number
    high: number
    breached: number
  }

  type AccountSuccessHealthRow = {
    score: number
    label: 'Low' | 'Medium' | 'High'
    className: string
    tooltip: string
  }

  const defaultCols: ColumnDef[] = [
    { key: 'accountNumber', visible: true, label: 'Account #' },
    { key: 'name', visible: true, label: 'Name' },
    { key: 'companyName', visible: true, label: 'Company' },
    { key: 'primaryContactName', visible: true, label: 'Primary contact' },
    { key: 'primaryContactEmail', visible: true, label: 'Email' },
    { key: 'primaryContactPhone', visible: true, label: 'Phone' },
    { key: 'onboardingStatus', visible: true, label: 'Onboarding' },
    { key: 'tasks', visible: true, label: 'Tasks' },
    { key: 'projects', visible: true, label: 'Projects' },
    { key: 'surveyStatus', visible: true, label: 'Survey' },
    { key: 'assetRisk', visible: true, label: 'Asset risk' },
    { key: 'successHealth', visible: true, label: 'Success' },
  ]
  function ensureCoreCols(cols: ColumnDef[]): ColumnDef[] {
    let hasTasks = false
    let hasSurvey = false
    let hasAssetRisk = false
    let hasProjects = false
    let hasSuccess = false
    let hasOnboarding = false

    const next = cols.map((c) => {
      if (c.key === 'tasks') {
        hasTasks = true
        return { ...c, visible: true, label: 'Tasks' }
      }
      if (c.key === 'surveyStatus') {
        hasSurvey = true
        return { ...c, visible: true, label: 'Survey' }
      }
      if (c.key === 'onboardingStatus') {
        hasOnboarding = true
        return { ...c, visible: true, label: 'Onboarding' }
      }
      if (c.key === 'assetRisk') {
        hasAssetRisk = true
        return { ...c, visible: true, label: 'Asset risk' }
      }
      if (c.key === 'projects') {
        hasProjects = true
        return { ...c, visible: true, label: 'Projects' }
      }
      if (c.key === 'successHealth') {
        hasSuccess = true
        return { ...c, visible: true, label: 'Success' }
      }
      return c
    })

    const out = [...next]
    if (!hasTasks) out.push({ key: 'tasks', visible: true, label: 'Tasks' })
    if (!hasSurvey) out.push({ key: 'surveyStatus', visible: true, label: 'Survey' })
    if (!hasOnboarding) out.push({ key: 'onboardingStatus', visible: true, label: 'Onboarding' })
    if (!hasAssetRisk) out.push({ key: 'assetRisk', visible: true, label: 'Asset risk' })
    if (!hasProjects) out.push({ key: 'projects', visible: true, label: 'Projects' })
    if (!hasSuccess) out.push({ key: 'successHealth', visible: true, label: 'Success' })
    return out
  }
  const [cols, setCols] = React.useState<ColumnDef[]>(ensureCoreCols(defaultCols))
  const [savedViews, setSavedViews] = React.useState<Array<{ id: string; name: string; config: any }>>([])
  const [showSaveViewDialog, setShowSaveViewDialog] = React.useState(false)
  const [savingViewName, setSavingViewName] = React.useState('')
  const [showColsMenu, setShowColsMenu] = React.useState(false)
  const [draggedCol, setDraggedCol] = React.useState<string | null>(null)
  const initializedFromUrl = React.useRef(false)
  const { data, isFetching } = useQuery({
    queryKey: ['accounts', query, sort, dir],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', { params: { q: query, sort, dir } })
      return res.data as { data: { items: Account[] } }
    },
  })
  const create = useMutation({
    mutationFn: async (payload: { name: string; companyName?: string; primaryContactName?: string; primaryContactEmail?: string; primaryContactPhone?: string }) => {
      const res = await http.post('/api/crm/accounts', payload)
      return res.data as { data: Account }
    },
    onSuccess: (created) => {
      qc.setQueryData(['accounts'], (prev: any) => {
        if (!prev?.data?.items) return { data: { items: [created.data] } }
        return { data: { items: [created.data, ...prev.data.items] } }
      })
      const accountName = created.data.name || 'Account'
      const accountNumber = created.data.accountNumber ? ` (${created.data.accountNumber})` : ''
      toast.showToast(`Account "${accountName}${accountNumber}" has been added successfully.`, 'success')
    },
  })

  const items = data?.data.items ?? []
  const visibleItems = React.useMemo(() => {
    const ql = query.trim().toLowerCase()
    let rows = items
    if (ql) {
      rows = rows.filter((a) =>
        [a.name, a.companyName, a.primaryContactName, a.primaryContactEmail, a.primaryContactPhone]
          .some((v) => (v ?? '').toString().toLowerCase().includes(ql))
      )
    }
    const dirMul = dir === 'desc' ? -1 : 1
    rows = [...rows].sort((a: any, b: any) => {
      const av = a[sort]
      const bv = b[sort]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dirMul
      return String(av).localeCompare(String(bv)) * dirMul
    })
    return rows
  }, [items, query, sort, dir])
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(10)
  React.useEffect(() => { setPage(0) }, [query, sort, dir, pageSize])
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize))
  const pageItems = React.useMemo(() => visibleItems.slice(page * pageSize, page * pageSize + pageSize), [visibleItems, page, pageSize])
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/crm/accounts/${id}`)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })

  const update = useMutation({
    mutationFn: async (payload: Partial<Account> & { _id: string }) => {
      const { _id, ...rest } = payload
      const res = await http.put(`/api/crm/accounts/${_id}`, rest)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.showToast('BOAZ says: Account saved.', 'success')
    },
  })

  const createSuccessTask = useMutation({
    mutationFn: async (payload: { accountId: string; kind: 'health' | 'qbr' }) => {
      const { accountId, kind } = payload
      const subject =
        kind === 'health'
          ? 'Customer success follow-up'
          : 'Schedule QBR / executive review'
      const description =
        kind === 'health'
          ? 'Review recent surveys, tickets, assets, and projects for this account and plan next success actions.'
          : 'Schedule a QBR / executive business review to align on outcomes, adoption, and upcoming renewals.'
      const res = await http.post('/api/crm/tasks', {
        type: 'todo',
        subject,
        description,
        status: 'open',
        priority: kind === 'health' ? 'high' : 'normal',
        relatedType: 'account',
        relatedId: accountId,
      })
      return res.data as { data?: any }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      if (variables?.accountId) {
        qc.invalidateQueries({ queryKey: ['related-tasks', 'account', variables.accountId] })
      }
      toast.showToast('BOAZ says: Success playbook task created.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to create success playbook task.'
      toast.showToast(msg, 'error')
    },
  })

  const createOnboardingProject = useMutation({
    mutationFn: async (accountId: string) => {
      const today = new Date()
      const start = today.toISOString().slice(0, 10)
      const target = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      const payload = {
        name: `Onboarding – ${editing?.name || editing?.companyName || 'New customer'}`,
        description:
          'Standard onboarding and implementation project for this account. Adjust scope, milestones, and owners as needed.',
        status: 'not_started',
        type: 'onboarding',
        health: 'on_track',
        progressPercent: 0,
        accountId,
        startDate: start,
        targetEndDate: target.toISOString().slice(0, 10),
      }
      const res = await http.post('/api/crm/projects', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account-projects'] })
      qc.invalidateQueries({ queryKey: ['accounts-projects-summary'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.showToast('BOAZ says: Onboarding project created.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to create onboarding project.'
      toast.showToast(msg, 'error')
    },
  })

  const [inlineEditId, setInlineEditId] = React.useState<string | null>(null)
  const [inlineName, setInlineName] = React.useState<string>('')
  const [inlineCompanyName, setInlineCompanyName] = React.useState<string>('')
  const [inlinePrimaryContactName, setInlinePrimaryContactName] = React.useState<string>('')
  const [inlinePrimaryContactEmail, setInlinePrimaryContactEmail] = React.useState<string>('')
  const [inlinePrimaryContactPhone, setInlinePrimaryContactPhone] = React.useState<string>('')

  function startInlineEdit(a: Account) {
    setInlineEditId(a._id)
    setInlineName(a.name ?? '')
    setInlineCompanyName(a.companyName ?? '')
    setInlinePrimaryContactName(a.primaryContactName ?? '')
    setInlinePrimaryContactEmail(a.primaryContactEmail ?? '')
    setInlinePrimaryContactPhone(a.primaryContactPhone ?? '')
  }
  async function saveInlineEdit() {
    if (!inlineEditId) return
    const payload: any = { _id: inlineEditId }
    payload.name = inlineName || undefined
    payload.companyName = inlineCompanyName || undefined
    payload.primaryContactName = inlinePrimaryContactName || undefined
    payload.primaryContactEmail = inlinePrimaryContactEmail || undefined
    payload.primaryContactPhone = inlinePrimaryContactPhone || undefined
    await update.mutateAsync(payload)
    cancelInlineEdit()
  }
  function cancelInlineEdit() {
    setInlineEditId(null)
    setInlineName('')
    setInlineCompanyName('')
    setInlinePrimaryContactName('')
    setInlinePrimaryContactEmail('')
    setInlinePrimaryContactPhone('')
  }

  const [pendingOpenAccountId, setPendingOpenAccountId] = React.useState<string | null>(null)

  // Initialize from URL and localStorage once
  React.useEffect(() => {
    if (initializedFromUrl.current) return
    initializedFromUrl.current = true
    const get = (key: string) => searchParams.get(key) || ''
    const q0 = get('q')
    const sort0 = (get('sort') as any) || 'name'
    const dir0 = (get('dir') as any) || 'asc'
    const openId = get('openAccountId')
    if (q0) setQuery(q0)
    setSort(sort0)
    setDir(dir0)
    if (openId) {
      setPendingOpenAccountId(openId)
    }
    try {
      const stored = localStorage.getItem('ACCOUNTS_COLS')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCols(ensureCoreCols(parsed))
        }
      }
    } catch {}
    try {
      const views = localStorage.getItem('ACCOUNTS_SAVED_VIEWS')
      if (views) {
        const parsed = JSON.parse(views)
        if (Array.isArray(parsed)) setSavedViews(parsed)
      }
    } catch {}
    ;(async () => {
      try {
        const res = await http.get('/api/views', { params: { viewKey: 'accounts' } })
        const items = (res.data?.data?.items ?? []).map((v: any) => ({ id: String(v._id), name: v.name, config: v.config }))
        if (Array.isArray(items)) setSavedViews(items)
        if (items.length === 0) {
          const seeds = [
            { name: 'Key accounts', config: { query: '', sort: 'name', dir: 'asc' } },
            { name: 'New this month', config: { query: '', sort: 'accountNumber', dir: 'desc' } },
          ]
          for (const s of seeds) { try { await http.post('/api/views', { viewKey: 'accounts', name: s.name, config: s.config }) } catch {} }
          try { const res2 = await http.get('/api/views', { params: { viewKey: 'accounts' } }); const items2 = (res2.data?.data?.items ?? []).map((v: any) => ({ id: String(v._id), name: v.name, config: v.config })); if (Array.isArray(items2)) setSavedViews(items2) } catch {}
        }
      } catch {}
    })()
  }, [searchParams])

  // Persist to URL/localStorage
  React.useEffect(() => {
    const params: Record<string, string> = {}
    if (query) params.q = query
    if (sort !== 'name') params.sort = sort
    if (dir !== 'asc') params.dir = dir
    const colKeys = cols.filter((c) => c.visible).map((c) => c.key).join(',')
    if (colKeys) params.cols = colKeys
    setSearchParams(params, { replace: true })
    try { localStorage.setItem('ACCOUNTS_COLS', JSON.stringify(cols)) } catch {}
    try { localStorage.setItem('ACCOUNTS_SAVED_VIEWS', JSON.stringify(savedViews)) } catch {}
  }, [query, sort, dir, cols, savedViews, setSearchParams])

  // If deep-linked with openAccountId, open that account drawer once data is loaded
  React.useEffect(() => {
    if (!pendingOpenAccountId) return
    if (!items.length) return
    const found = items.find((a) => a._id === pendingOpenAccountId)
    if (found) {
      setEditing(found)
      setPendingOpenAccountId(null)
    }
  }, [items, pendingOpenAccountId])

  async function saveCurrentView() {
    const viewConfig = { query, sort, dir, cols, pageSize }
    const name = savingViewName || `View ${savedViews.length + 1}`
    try {
      const res = await http.post('/api/views', { viewKey: 'accounts', name, config: viewConfig })
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
    if (c.query !== undefined) setQuery(c.query)
    if (c.sort) setSort(c.sort)
    if (c.dir) setDir(c.dir)
    if (c.cols) setCols(ensureCoreCols(c.cols))
    if (c.pageSize) setPageSize(c.pageSize)
    setPage(0)
  }
  async function deleteView(id: string) { try { await http.delete(`/api/views/${id}`) } catch {}; setSavedViews((prev) => prev.filter((v) => v.id !== id)) }
  function copyShareLink() {
    const url = window.location.origin + window.location.pathname + '?' + searchParams.toString()
    navigator.clipboard?.writeText(url).then(() => toast.showToast('Link copied', 'success')).catch(() => toast.showToast('Failed to copy', 'error'))
  }
  const accountIdsParam = React.useMemo(
    () => (visibleItems.length ? visibleItems.map((a) => a._id).join(',') : ''),
    [visibleItems],
  )

  const { data: accountSurveyStatusData } = useQuery({
    queryKey: ['accounts-survey-status', accountIdsParam],
    enabled: !!accountIdsParam,
    queryFn: async () => {
      const res = await http.get('/api/crm/surveys/accounts/status', {
        params: { accountIds: accountIdsParam },
      })
      return res.data as { data: { items: AccountSurveyStatusSummary[] } }
    },
  })

  const accountSurveyStatusMap = React.useMemo(() => {
    const map = new Map<string, AccountSurveyStatusSummary>()
    for (const s of accountSurveyStatusData?.data.items ?? []) {
      map.set(s.accountId, s)
    }
    return map
  }, [accountSurveyStatusData?.data.items])

  const accountIdsForTasks = React.useMemo(
    () => (visibleItems.length ? visibleItems.map((a) => a._id).join(',') : ''),
    [visibleItems],
  )

  const { data: accountTaskCountsData } = useQuery({
    queryKey: ['accounts-task-counts', accountIdsForTasks],
    enabled: !!accountIdsForTasks,
    queryFn: async () => {
      const res = await http.get('/api/crm/tasks/counts', {
        params: { relatedType: 'account', relatedIds: accountIdsForTasks, status: 'open' },
      })
      return res.data as { data: { items: Array<{ relatedId: string; count: number }> } }
    },
  })

  const accountTaskCountMap = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const row of accountTaskCountsData?.data.items ?? []) {
      map.set(row.relatedId, row.count)
    }
    return map
  }, [accountTaskCountsData?.data.items])

  type LicenseAlertRow = {
    customerId: string
    productStatus?: string
    renewalStatus: string
    expirationDate?: string | null
  }

  const { data: accountAssetsRiskData } = useQuery({
    queryKey: ['accounts-assets-risk'],
    queryFn: async () => {
      const res = await http.get('/api/assets/license-report', {
        params: { windowDays: 90 },
      })
      return res.data as { data: { items: LicenseAlertRow[] } }
    },
  })

  const accountAssetsRiskMap = React.useMemo(() => {
    const rows = accountAssetsRiskData?.data.items ?? []
    const byCustomer = new Map<string, LicenseAlertRow[]>()
    for (const row of rows) {
      if (!row.customerId) continue
      if (!byCustomer.has(row.customerId)) byCustomer.set(row.customerId, [])
      byCustomer.get(row.customerId)!.push(row)
    }

    const result = new Map<
      string,
      {
        score: number
        label: string
        className: string
        expired: number
        expiring30: number
        expiring60: number
        expiring90: number
        needsUpgrade: number
        pendingRenewalProducts: number
      }
    >()
    const now = new Date()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

    byCustomer.forEach((items, customerId) => {
      let expired = 0
      let expiring30 = 0
      let expiring60 = 0
      let expiring90 = 0
      let needsUpgrade = 0
      let pendingRenewalProducts = 0

      for (const row of items) {
        if (row.productStatus === 'Needs Upgrade') needsUpgrade++
        if (row.productStatus === 'Pending Renewal') pendingRenewalProducts++

        if (!row.expirationDate) continue
        const d = new Date(row.expirationDate)
        if (!Number.isFinite(d.getTime())) continue
        if (d < now) {
          expired++
        } else if (d <= in30Days) {
          expiring30++
        } else if (d <= in60Days) {
          expiring60++
        } else if (d <= in90Days) {
          expiring90++
        }
      }

      let score = 0
      if (expired > 0) score += 40
      if (expiring30 > 0) score += 30
      if (expiring60 > 0) score += 15
      if (expiring90 > 0) score += 10
      if (needsUpgrade > 0) score += 10
      if (pendingRenewalProducts > 0) score += 10
      if (score > 100) score = 100

      let label = 'Low'
      let className =
        'inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100'
      if (score >= 70) {
        label = 'High'
        className =
          'inline-flex items-center rounded-full border border-red-500/70 bg-red-500/15 px-2 py-0.5 text-[11px] text-red-200'
      } else if (score >= 30) {
        label = 'Medium'
        className =
          'inline-flex items-center rounded-full border border-amber-500/70 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-100'
      }

      result.set(customerId, {
        score,
        label,
        className,
        expired,
        expiring30,
        expiring60,
        expiring90,
        needsUpgrade,
        pendingRenewalProducts,
      })
    })

    return result
  }, [accountAssetsRiskData?.data.items])

  const accountIdsForTickets = React.useMemo(
    () => (visibleItems.length ? visibleItems.map((a) => a._id).join(',') : ''),
    [visibleItems],
  )

  const { data: accountTicketsData } = useQuery({
    queryKey: ['accounts-tickets-summary', accountIdsForTickets],
    enabled: !!accountIdsForTickets,
    queryFn: async () => {
      const res = await http.get('/api/crm/support/tickets/by-account', {
        params: { accountIds: accountIdsForTickets },
      })
      return res.data as { data: { items: AccountTicketSummaryRow[] } }
    },
  })

  const accountTicketsMap = React.useMemo(() => {
    const map = new Map<string, AccountTicketSummaryRow>()
    for (const row of accountTicketsData?.data.items ?? []) {
      map.set(row.accountId, row)
    }
    return map
  }, [accountTicketsData?.data.items])

  const accountIdsForProjects = React.useMemo(
    () => (visibleItems.length ? visibleItems.map((a) => a._id).join(',') : ''),
    [visibleItems],
  )

  const { data: accountProjectsSummaryData } = useQuery({
    queryKey: ['accounts-projects-summary', accountIdsForProjects],
    enabled: !!accountIdsForProjects,
    queryFn: async () => {
      const res = await http.get('/api/crm/projects/counts', {
        params: { accountIds: accountIdsForProjects },
      })
      return res.data as {
        data: {
          items: Array<{
            kind: 'account' | 'deal'
            accountId?: string
            dealId?: string
            total: number
            active: number
            completed: number
            atRisk: number
            offTrack: number
          }>
        }
      }
    },
  })

  const accountProjectsMap = React.useMemo(() => {
    const map = new Map<string, AccountProjectSummaryRow>()
    for (const row of accountProjectsSummaryData?.data.items ?? []) {
      if ((row as any).kind !== 'account' || !row.accountId) continue
      const r = row as any
      map.set(r.accountId, {
        accountId: r.accountId,
        total: r.total ?? 0,
        active: r.active ?? 0,
        completed: r.completed ?? 0,
        atRisk: r.atRisk ?? 0,
        offTrack: r.offTrack ?? 0,
      })
    }
    return map
  }, [accountProjectsSummaryData?.data.items])

  const accountRowMap = React.useMemo(() => {
    const map = new Map<string, Account>()
    for (const a of items) {
      map.set(a._id, a)
    }
    return map
  }, [items])

  const accountSuccessMap = React.useMemo(() => {
    const map = new Map<string, AccountSuccessHealthRow>()

    for (const a of items) {
      const id = a._id
      const survey = accountSurveyStatusMap.get(id)
      const assets = accountAssetsRiskMap.get(id)
      const tickets = accountTicketsMap.get(id)
      const projects = accountProjectsMap.get(id)

      let score = 0
      const parts: string[] = []

      // Surveys (NPS/CSAT)
      if (survey && survey.responseCount > 0) {
        const last = survey.lastScore ?? 0
        parts.push(`Surveys: ${survey.responseCount} responses, last score ${last.toFixed(1)}`)
        if (last <= 6) score += 35
        else if (last <= 7.5) score += 20
        else if (last <= 8.5) score += 10
      } else {
        parts.push('Surveys: no recent responses')
      }

      // Support tickets
      if (tickets) {
        const { open, high, breached } = tickets
        parts.push(
          `Support: ${open} open (${high} high/urgent), ${breached} breached SLA`,
        )
        score += Math.min(open * 4, 24)
        score += Math.min(high * 6, 18)
        score += Math.min(breached * 10, 30)
      } else {
        parts.push('Support: no open tickets')
      }

      // Assets / Installed base risk
      if (assets) {
        parts.push(`Assets: ${assets.label} asset risk (score ${assets.score})`)
        score += Math.round(assets.score * 0.4)
      } else {
        parts.push('Assets: low visible risk')
      }

      // Projects risk
      if (projects) {
        const riskCount = (projects.atRisk ?? 0) + (projects.offTrack ?? 0)
        parts.push(
          `Projects: ${projects.total} total, ${projects.active ?? 0} active, ${riskCount} at risk`,
        )
        if (riskCount > 0) {
          score += Math.min(30, riskCount * 10)
        }
      } else {
        parts.push('Projects: none tracked')
      }

      if (score > 100) score = 100

      let label: AccountSuccessHealthRow['label'] = 'Low'
      let className =
        'inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100'
      if (score >= 70) {
        label = 'High'
        className =
          'inline-flex items-center rounded-full border border-red-500/70 bg-red-500/15 px-2 py-0.5 text-[11px] text-red-200'
      } else if (score >= 35) {
        label = 'Medium'
        className =
          'inline-flex items-center rounded-full border border-amber-500/70 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-100'
      }

      const tooltip = [`Success health score: ${score}`, ...parts].join(' • ')

      map.set(id, { score, label, className, tooltip })
    }

    return map
  }, [items, accountSurveyStatusMap, accountAssetsRiskMap, accountTicketsMap, accountProjectsMap])

  function getColValue(a: Account, key: string) {
    if (key === 'accountNumber') return a.accountNumber ?? '-'
    if (key === 'name') return a.name ?? '-'
    if (key === 'companyName') return a.companyName ?? '-'
    if (key === 'primaryContactName') return a.primaryContactName ?? '-'
    if (key === 'primaryContactEmail') return a.primaryContactEmail ?? '-'
    if (key === 'primaryContactPhone') {
      const value = a.primaryContactPhone ?? '-'
      return <span className="whitespace-nowrap font-mono text-xs">{value}</span>
    }
    if (key === 'onboardingStatus') {
      const value = a.onboardingStatus ?? 'not_started'
      let label = 'Not started'
      let className =
        'inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-muted)]'
      if (value === 'in_progress') {
        label = 'In progress'
        className =
          'inline-flex items-center rounded-full border border-sky-500/70 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-100'
      } else if (value === 'complete') {
        label = 'Complete'
        className =
          'inline-flex items-center rounded-full border border-emerald-500/70 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100'
      }
      return <span className={className}>{label}</span>
    }
    if (key === 'tasks') {
      const count = accountTaskCountMap.get(a._id) ?? 0
      return (
        <div className="flex items-center gap-1">
          {count > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-primary-500)]" />
              {count} open
            </span>
          ) : (
            <span className="text-[11px] text-[color:var(--color-text-muted)]">No open tasks</span>
          )}
          <button
            type="button"
            className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[color:var(--color-muted)]"
            onClick={async (e) => {
              e.stopPropagation()
              try {
                const res = await http.get('/api/crm/tasks', {
                  params: {
                    relatedType: 'account',
                    relatedId: a._id,
                    status: 'open',
                    sort: 'dueAt',
                    dir: 'asc',
                    page: 0,
                    limit: 1,
                  },
                })
                const first = (res.data?.data?.items ?? [])[0] as any
                if (first && first._id) {
                  navigate(`/apps/crm/tasks?task=${encodeURIComponent(first._id)}`)
                  return
                }
              } catch {
                // fall through
              }
              navigate(`/apps/crm/tasks?relatedType=account&relatedId=${encodeURIComponent(a._id)}`)
            }}
          >
            Open
          </button>
          <button
            type="button"
            className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[color:var(--color-muted)]"
            onClick={async (e) => {
              e.stopPropagation()
              const subject = window.prompt('Short description for new task?')?.trim()
              if (!subject) return
              try {
                await http.post('/api/crm/tasks', {
                  type: 'todo',
                  subject,
                  status: 'open',
                  priority: 'normal',
                  relatedType: 'account',
                  relatedId: a._id,
                })
                qc.invalidateQueries({ queryKey: ['accounts-task-counts'] })
                qc.invalidateQueries({ queryKey: ['tasks'] })
                toast.showToast('Task created.', 'success')
              } catch (err: any) {
                const msg = err?.response?.data?.error || err?.message || 'Failed to create task'
                toast.showToast(msg, 'error')
              }
            }}
          >
            Add
          </button>
        </div>
      )
    }
    if (key === 'projects') {
      const summary = accountProjectsMap.get(a._id)
      if (!summary || summary.total === 0) {
        return (
          <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-muted)]">
            No projects
          </span>
        )
      }
      const riskCount = (summary.atRisk ?? 0) + (summary.offTrack ?? 0)
      const baseClass =
        riskCount > 0
          ? 'inline-flex items-center rounded-full border border-amber-500/70 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-100'
          : 'inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100'
      const titleParts = [
        `${summary.total} total`,
        `${summary.active ?? 0} active`,
        `${summary.completed ?? 0} completed`,
        riskCount ? `${riskCount} at risk` : null,
      ]
        .filter(Boolean)
        .join(' • ')
      return (
        <span className={baseClass} title={titleParts}>
          {summary.total} proj • {summary.active ?? 0} active
          {riskCount ? ` • ${riskCount} at risk` : ''}
        </span>
      )
    }
    if (key === 'surveyStatus') {
      const status = accountSurveyStatusMap.get(a._id)
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
    if (key === 'assetRisk') {
      const risk = accountAssetsRiskMap.get(a._id)
      if (!risk) {
        return (
          <span
            className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-muted)]"
            title="No expiring licenses or upgrade issues detected in the next 90 days."
          >
            Low
          </span>
        )
      }
      const tooltip = [
        `Score: ${risk.score}`,
        risk.expired ? `${risk.expired} expired` : null,
        risk.expiring30 ? `${risk.expiring30} expiring ≤30d` : null,
        risk.expiring60 ? `${risk.expiring60} expiring ≤60d` : null,
        risk.expiring90 ? `${risk.expiring90} expiring ≤90d` : null,
        risk.needsUpgrade ? `${risk.needsUpgrade} need upgrade` : null,
        risk.pendingRenewalProducts ? `${risk.pendingRenewalProducts} pending renewal` : null,
      ]
        .filter(Boolean)
        .join(' • ')

      return (
        <span className={risk.className} title={tooltip}>
          {risk.label}
        </span>
      )
    }
    if (key === 'successHealth') {
      const row = accountSuccessMap.get(a._id)
      if (!row) {
        return (
          <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-muted)]">
            OK
          </span>
        )
      }
      return (
        <span className={row.className} title={row.tooltip}>
          {row.label}
        </span>
      )
    }
    return ''
  }
  function handleDragStart(key: string) { setDraggedCol(key) }
  function handleDragOver(e: React.DragEvent) { e.preventDefault() }
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

  const [editing, setEditing] = React.useState<Account | null>(null)
  const [showHistory, setShowHistory] = React.useState(false)
  const assetsSummaryQ = useQuery({
    queryKey: ['assets-summary-account', editing?._id],
    enabled: !!editing?._id,
    queryFn: async () => {
      const res = await http.get(`/api/assets/summary/${editing?._id}`)
      return res.data as { data: AssetsSummary }
    },
  })
  const { data: accountProjectsForDrawer } = useQuery({
    queryKey: ['account-projects', editing?._id],
    enabled: !!editing?._id,
    queryFn: async () => {
      const res = await http.get('/api/crm/projects', {
        params: { accountId: editing?._id, limit: 50, sort: 'targetEndDate', dir: 'asc' },
      })
      return res.data as {
        data: {
          items: Array<{
            _id: string
            name: string
            status: string
            type?: string
            health?: string
            targetEndDate?: string | null
          }>
        }
      }
    },
  })
  const historyQ = useQuery({
    queryKey: ['account-history', editing?._id, showHistory],
    enabled: Boolean(editing?._id && showHistory),
    queryFn: async () => {
      const res = await http.get(`/api/crm/accounts/${editing?._id}/history`)
      return res.data as {
        data: {
          createdAt: string
          deals: any[]
          quotes: any[]
          invoices: any[]
          activities: any[]
          history?: Array<{
            description?: string
            createdAt?: string
            userName?: string
          }>
        }
      }
    },
  })

  const { data: surveyProgramsData } = useQuery({
    queryKey: ['surveys-programs-accounts'],
    queryFn: async () => {
      const res = await http.get('/api/crm/surveys/programs')
      return res.data as {
        data: { items: Array<{ _id: string; name: string; type: 'NPS' | 'CSAT' | 'Post‑interaction' }> }
      }
    },
  })
  const surveyPrograms = React.useMemo(
    () => surveyProgramsData?.data.items ?? [],
    [surveyProgramsData?.data.items],
  )

  const [surveyProgramId, setSurveyProgramId] = React.useState('')
  const [surveyRecipientName, setSurveyRecipientName] = React.useState('')
  const [surveyRecipientEmail, setSurveyRecipientEmail] = React.useState('')

  React.useEffect(() => {
    if (!editing) return
    setSurveyRecipientName(editing.primaryContactName ?? editing.name ?? '')
    setSurveyRecipientEmail(editing.primaryContactEmail ?? '')
  }, [editing])

  const sendSurveyEmail = useMutation({
    mutationFn: async (payload: {
      programId: string
      recipientName?: string
      recipientEmail: string
      accountId: string
    }) => {
      const { programId, ...rest } = payload
      const res = await http.post(`/api/crm/surveys/programs/${programId}/send-email`, rest)
      return res.data
    },
    onSuccess: () => {
      toast.showToast('Survey email sent', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to send survey email'
      toast.showToast(msg, 'error')
    },
  })
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => {
    if (!editing) return
    const el = document.createElement('div')
    el.setAttribute('data-overlay', 'account-editor')
    Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' })
    document.body.appendChild(el)
    setPortalEl(el)
    return () => {
      try { document.body.removeChild(el) } catch {}
      setPortalEl(null)
    }
  }, [editing])

  return (
    <div className="space-y-4">
      <CRMNav />
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <a
          href="/apps/crm/support/kb?tag=crm:accounts"
          className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-[11px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
        >
          <span className="text-xs">Help</span>
          <span className="text-[10px]">?</span>
        </a>
      </div>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search accounts..." className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button type="button" onClick={() => { setQuery(''); setSort('name'); setDir('asc') }} disabled={!query && sort === 'name' && dir === 'asc'}
            className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50">
            Reset
          </button>
          <div className="relative">
            <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setShowSaveViewDialog(true)}>Save view</button>
          </div>
          <div className="relative">
            <select className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)]" onChange={(e) => {
              const selected = savedViews.find((v) => v.id === e.target.value)
              if (selected) loadView(selected)
              e.target.value = ''
            }}>
              <option value="">Saved views</option>
              {savedViews.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={copyShareLink}>Share link</button>
          <div className="relative" data-cols-menu>
            <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setShowColsMenu((v) => !v)}>Columns</button>
            {showColsMenu && (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-2 shadow space-y-1">
                <div className="text-xs text-[color:var(--color-text-muted)] pb-1 border-b">Drag to reorder</div>
                {cols.map((col) => (
                  <div
                    key={col.key}
                    draggable
                    onDragStart={() => handleDragStart(col.key)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(col.key)}
                    className={`flex items-center gap-2 p-1 text-sm cursor-move rounded ${draggedCol === col.key ? 'opacity-50 bg-[color:var(--color-muted)]' : 'hover:bg-[color:var(--color-muted)]'}`}
                  >
                    <span className="text-xs text-[color:var(--color-text-muted)]">≡</span>
                    <input
                      type="checkbox"
                      checked={col.visible}
                      onChange={(e) => setCols(cols.map((c) => c.key === col.key ? { ...c, visible: e.target.checked } : c))}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span>{col.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]">
            <option value="name">Name</option>
            <option value="companyName">Company</option>
            <option value="accountNumber">Account #</option>
          </select>
          <select value={dir} onChange={(e) => setDir(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]">
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
          {isFetching && <span className="text-xs text-[color:var(--color-text-muted)]">Loading...</span>}
          <button
            className="ml-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
            onClick={() => {
              const visibleCols = cols.filter((c) => c.visible)
              const headers = visibleCols.map((c) => c.label)
              const rows = pageItems.map((a) => visibleCols.map((col) => getColValue(a, col.key)))
              const csv = [headers.join(','), ...rows.map((r) => r.map((x) => '"'+String(x).replaceAll('"','""')+'"').join(','))].join('\n')
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'accounts.csv'
              a.click()
              URL.revokeObjectURL(url)
            }}
          >Export CSV</button>
        </div>
        <form className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); create.mutate({ name: String(fd.get('name')||''), companyName: String(fd.get('companyName')||'')|| undefined, primaryContactName: String(fd.get('primaryContactName')||'')|| undefined, primaryContactEmail: String(fd.get('primaryContactEmail')||'')|| undefined, primaryContactPhone: String(fd.get('primaryContactPhone')||'')|| undefined }); (e.currentTarget as HTMLFormElement).reset() }}>
          <input name="name" required placeholder="Account name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="companyName" placeholder="Company name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="primaryContactName" placeholder="Primary contact name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="primaryContactEmail" placeholder="Primary contact email" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="primaryContactPhone" placeholder="Primary contact phone" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button className="ml-auto rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">
            Add account
          </button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[color:var(--color-text-muted)]">
              <tr>
                {cols.filter((c) => c.visible).map((col) => (
                  <th
                    key={col.key}
                    draggable
                    onDragStart={() => handleDragStart(col.key)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(col.key)}
                    className={`px-4 py-2 cursor-move whitespace-nowrap ${draggedCol === col.key ? 'opacity-50' : ''}`}
                    title="Drag to reorder"
                  >
                    {col.key === 'assetRisk' ? (
                      <div className="inline-flex items-center gap-1">
                        <span>{col.label}</span>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                          title="Aggregated license and product health risk for this account over the next 90 days."
                        >
                          ?
                        </button>
                      </div>
                    ) : col.key === 'successHealth' ? (
                      <div className="inline-flex items-center gap-1">
                        <span>{col.label}</span>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                          title="Customer success health score combines surveys, support tickets, asset risk, and project risk into a single Low/Medium/High signal. Higher scores indicate more risk and need for proactive success playbooks."
                        >
                          ?
                        </button>
                      </div>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
                <th className="px-4 py-2 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((a) => (
                <tr key={a._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                  {cols.filter((c) => c.visible).map((col) => (
                    <td key={col.key} className="px-4 py-2">
                      {inlineEditId === a._id ? (
                        col.key === 'name' ? (
                          <input value={inlineName} onChange={(e) => setInlineName(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                        ) : col.key === 'companyName' ? (
                          <input value={inlineCompanyName} onChange={(e) => setInlineCompanyName(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                        ) : col.key === 'primaryContactName' ? (
                          <input value={inlinePrimaryContactName} onChange={(e) => setInlinePrimaryContactName(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                        ) : col.key === 'primaryContactEmail' ? (
                          <input type="email" value={inlinePrimaryContactEmail} onChange={(e) => setInlinePrimaryContactEmail(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                        ) : col.key === 'primaryContactPhone' ? (
                          <input value={inlinePrimaryContactPhone} onChange={(e) => setInlinePrimaryContactPhone(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                        ) : (
                          getColValue(a, col.key)
                        )
                      ) : (
                        getColValue(a, col.key)
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2 whitespace-nowrap">
                    {inlineEditId === a._id ? (
                      <div className="flex items-center gap-2">
                        <button className="rounded-lg border px-2 py-1 text-xs" onClick={saveInlineEdit}>Save</button>
                        <button className="rounded-lg border px-2 py-1 text-xs" onClick={cancelInlineEdit}>Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button className="rounded-lg border px-2 py-1 text-xs" onClick={() => startInlineEdit(a)}>Edit</button>
                        <button className="rounded-lg border px-2 py-1 text-xs" onClick={() => setEditing(a)}>Open</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-4 text-sm">
          <div className="flex items-center gap-2">
            <span>Rows: {visibleItems.length}</span>
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
            <div className="w-[min(90vw,40rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Edit account</div>
              <form
                className="grid gap-2 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  update.mutate({
                    _id: editing._id,
                    name: String(fd.get('name')||'')||undefined,
                    companyName: String(fd.get('companyName')||'')||undefined,
                    primaryContactName: String(fd.get('primaryContactName')||'')||undefined,
                    primaryContactEmail: String(fd.get('primaryContactEmail')||'')||undefined,
                    primaryContactPhone: String(fd.get('primaryContactPhone')||'')||undefined,
                  })
                  setEditing(null)
                }}
              >
                <input name="name" defaultValue={editing.name ?? ''} placeholder="Account name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="companyName" defaultValue={editing.companyName ?? ''} placeholder="Company name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="primaryContactName" defaultValue={editing.primaryContactName ?? ''} placeholder="Primary contact name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="primaryContactEmail" defaultValue={editing.primaryContactEmail ?? ''} placeholder="Primary contact email" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="primaryContactPhone" defaultValue={editing.primaryContactPhone ?? ''} placeholder="Primary contact phone" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <div className="col-span-full mt-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 space-y-2">
                  <div className="text-sm font-semibold">Renewals &amp; Subscriptions</div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-[color:var(--color-text-muted)]">
                      View renewals tied to this account in the Renewals app.
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                      onClick={() => {
                        if (!editing._id) return
                        window.location.href = `/apps/crm/renewals?accountId=${encodeURIComponent(editing._id)}`
                      }}
                    >
                      Open renewals for this account
                    </button>
                  </div>
                </div>
                <div className="col-span-full mt-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">Onboarding summary</div>
                      <div className="text-[11px] text-[color:var(--color-text-muted)]">
                        Current onboarding status and key onboarding project for this account.
                      </div>
                    </div>
                    <div>
                      {(() => {
                        const row = accountRowMap.get(editing._id) || editing
                        const value: 'not_started' | 'in_progress' | 'complete' =
                          row.onboardingStatus ?? 'not_started'

                        let label = 'Not started'
                        let className =
                          'inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-muted)]'
                        if (value === 'in_progress') {
                          label = 'In progress'
                          className =
                            'inline-flex items-center rounded-full border border-sky-500/70 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-100'
                        } else if (value === 'complete') {
                          label = 'Complete'
                          className =
                            'inline-flex items-center rounded-full border border-emerald-500/70 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100'
                        }
                        return <span className={className}>{label}</span>
                      })()}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[color:var(--color-text-muted)]">
                    <div className="flex-1">
                      {(() => {
                        const rows = accountProjectsForDrawer?.data.items ?? []
                        const onboardingProjects = rows.filter((p) => p.type === 'onboarding')
                        if (!onboardingProjects.length) {
                          return <span>No onboarding project is currently linked to this account.</span>
                        }
                        const next = onboardingProjects[0]!
                        return (
                          <span>
                            Onboarding project:{' '}
                            <span className="font-semibold text-[color:var(--color-text)]">{next.name}</span>
                            {next.targetEndDate ? (
                              <>
                                {' '}
                                · target {formatDate(next.targetEndDate)}
                              </>
                            ) : null}
                          </span>
                        )
                      })()}
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-muted)]"
                      onClick={() => {
                        if (!editing?._id) return
                        window.location.href = `/apps/crm/projects?accountId=${encodeURIComponent(
                          editing._id,
                        )}&type=onboarding`
                      }}
                    >
                      View onboarding projects
                    </button>
                  </div>
                </div>
                <div className="col-span-full mt-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="inline-flex items-center gap-1">
                        <div className="text-sm font-semibold">Customer success health</div>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                          title="Customer success health combines surveys, support tickets, asset risk, and project risk into a single signal. Use it to prioritize QBRs, adoption reviews, and proactive outreach."
                        >
                          ?
                        </button>
                      </div>
                      <div className="text-[11px] text-[color:var(--color-text-muted)]">
                        Combined view of surveys, support load, asset risk, and projects.
                      </div>
                    </div>
                    <div>
                      {(() => {
                        const row = accountSuccessMap.get(editing._id)
                        if (!row) {
                          return (
                            <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-muted)]">
                              OK
                            </span>
                          )
                        }
                        return (
                          <span className={row.className} title={row.tooltip}>
                            {row.label}
                          </span>
                        )
                      })()}
                    </div>
                  </div>
                  <div className="grid gap-2 text-[11px] text-[color:var(--color-text-muted)] md:grid-cols-2">
                    <div>
                      <div className="font-semibold text-[color:var(--color-text)]">Signals</div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        <li>
                          Surveys:{' '}
                          {(() => {
                            const s = accountSurveyStatusMap.get(editing._id)
                            if (!s || s.responseCount === 0) return 'no recent responses'
                            return `${s.responseCount} responses, last score ${
                              s.lastScore != null ? s.lastScore.toFixed(1) : '-'
                            }`
                          })()}
                        </li>
                        <li>
                          Support:{' '}
                          {(() => {
                            const t = accountTicketsMap.get(editing._id)
                            if (!t) return 'no open tickets'
                            return `${t.open} open (${t.high} high/urgent), ${t.breached} breached SLA`
                          })()}
                        </li>
                        <li>
                          Assets:{' '}
                          {(() => {
                            const r = accountAssetsRiskMap.get(editing._id)
                            if (!r) return 'low visible risk'
                            return `${r.label} risk (score ${r.score})`
                          })()}
                        </li>
                        <li>
                          Projects:{' '}
                          {(() => {
                            const p = accountProjectsMap.get(editing._id)
                            if (!p) return 'none tracked'
                            const riskCount = (p.atRisk ?? 0) + (p.offTrack ?? 0)
                            return `${p.total} total, ${p.active ?? 0} active, ${riskCount} at risk`
                          })()}
                        </li>
                      </ul>
                    </div>
                    <div>
                      <div className="font-semibold text-[color:var(--color-text)]">Suggested playbooks</div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        <li>Run a health check call when surveys trend low or tickets spike.</li>
                        <li>Pair upcoming renewals with an Assets / Installed Base review.</li>
                        <li>Align in‑flight projects with renewal timelines and success metrics.</li>
                        <li>Trigger outreach sequences for champions when health is High.</li>
                      </ul>
                      {(() => {
                        const row = accountSuccessMap.get(editing._id)
                        const label = row?.label
                        if (label !== 'High' && label !== 'Medium') return null
                        return (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]">
                              Playbook actions
                            </span>
                            <button
                              type="button"
                              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-muted)]"
                              disabled={createSuccessTask.isPending}
                              onClick={() => {
                                if (!editing?._id) return
                                createSuccessTask.mutate({ accountId: editing._id, kind: 'health' })
                              }}
                            >
                              Create follow‑up task
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-muted)]"
                              disabled={createSuccessTask.isPending}
                              onClick={() => {
                                if (!editing?._id) return
                                createSuccessTask.mutate({ accountId: editing._id, kind: 'qbr' })
                              }}
                            >
                              Schedule QBR task
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-muted)]"
                              onClick={() => {
                                if (!editing?._id) return
                                window.location.href = `/apps/crm/outreach/sequences?accountId=${encodeURIComponent(
                                  editing._id,
                                )}`
                              }}
                            >
                              Open outreach sequences
                            </button>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>
                <div className="col-span-full mt-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">Projects &amp; Delivery</div>
                      <div className="text-[11px] text-[color:var(--color-text-muted)]">
                        Implementations and delivery projects linked to this account.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                      onClick={() => {
                        if (!editing?._id) return
                        window.location.href = `/apps/crm/projects?accountId=${encodeURIComponent(editing._id)}`
                      }}
                    >
                      Open projects
                    </button>
                  </div>
                  {accountProjectsForDrawer?.data.items == null && accountProjectsForDrawer == null && (
                    <div className="text-[11px] text-[color:var(--color-text-muted)]">
                      No project data loaded for this account yet.
                    </div>
                  )}
                  {accountProjectsForDrawer && accountProjectsForDrawer.data.items.length === 0 && (
                    <div className="text-[11px] text-[color:var(--color-text-muted)]">
                      No projects are currently linked to this account.
                    </div>
                  )}
                  {accountProjectsForDrawer?.data.items?.length ? (
                    <>
                      {(() => {
                        const rows = accountProjectsForDrawer.data.items
                        const total = rows.length
                        const active = rows.filter((p) =>
                          ['not_started', 'in_progress', 'on_hold'].includes(p.status),
                        ).length
                        const completed = rows.filter((p) => p.status === 'completed').length
                        const atRisk = rows.filter((p) => p.health === 'at_risk').length
                        const offTrack = rows.filter((p) => p.health === 'off_track').length
                        const riskCount = atRisk + offTrack
                        return (
                          <div className="flex flex-wrap gap-1.5 text-[10px]">
                            <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-0.5">
                              {total} total
                            </span>
                            <span className="inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-emerald-100">
                              {active} active
                            </span>
                            <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-0.5">
                              {completed} completed
                            </span>
                            {riskCount > 0 && (
                              <span className="inline-flex items-center rounded-full border border-amber-500/70 bg-amber-500/15 px-2 py-0.5 text-amber-100">
                                {riskCount} at risk
                              </span>
                            )}
                          </div>
                        )
                      })()}
                      <div className="mt-2 space-y-1 text-[11px] text-[color:var(--color-text-muted)]">
                        <div className="font-semibold">Top projects</div>
                        <ul className="space-y-1">
                          {accountProjectsForDrawer.data.items.slice(0, 3).map((p) => (
                            <li key={p._id} className="flex items-center justify-between gap-2">
                              <span className="truncate">{p.name}</span>
                              <span className="flex items-center gap-2">
                                {p.health && (
                                  <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${
                                      p.health === 'on_track'
                                        ? 'border border-emerald-500/60 bg-emerald-500/10 text-emerald-100'
                                        : p.health === 'at_risk'
                                        ? 'border border-amber-500/70 bg-amber-500/15 text-amber-100'
                                        : 'border border-red-500/70 bg-red-500/15 text-red-100'
                                    }`}
                                  >
                                    {p.health === 'on_track'
                                      ? 'On track'
                                      : p.health === 'at_risk'
                                      ? 'At risk'
                                      : 'Off track'}
                                  </span>
                                )}
                                <span className="whitespace-nowrap">
                                  {p.targetEndDate ? formatDate(p.targetEndDate) : ''}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  ) : null}
                </div>
                <div className="col-span-full mt-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">Onboarding &amp; kickoff wizard</div>
                      <div className="text-[11px] text-[color:var(--color-text-muted)]">
                        Guided steps to start an onboarding project, align contracts, and set up success monitoring.
                      </div>
                    </div>
                  </div>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-[11px] text-[color:var(--color-text-muted)]">
                    <li className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">
                        Create an onboarding project to track implementation, milestones, and owners for this account.
                      </span>
                      <button
                        type="button"
                        className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-muted)]"
                        disabled={createOnboardingProject.isPending || !editing?._id}
                        onClick={() => {
                          if (!editing?._id) return
                          createOnboardingProject.mutate(editing._id)
                        }}
                      >
                        Create onboarding project
                      </button>
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">
                        Review or create the main contract and SLA for this customer, including commercial and legal terms.
                      </span>
                      <button
                        type="button"
                        className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-muted)]"
                        onClick={() => {
                          if (!editing?._id) return
                          window.location.href = `/apps/crm/slas?accountId=${encodeURIComponent(editing._id)}`
                        }}
                      >
                        Open contracts &amp; SLAs
                      </button>
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">
                        Set up ongoing success monitoring and playbooks for this account in the Customer Success app.
                      </span>
                      <button
                        type="button"
                        className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-muted)]"
                        onClick={() => {
                          if (!editing?._id) return
                          const q = encodeURIComponent(editing.name || editing.companyName || '')
                          window.location.href = `/apps/crm/success?q=${q}`
                        }}
                      >
                        Open Customer Success
                      </button>
                    </li>
                  </ol>
                </div>
                <div className="col-span-full mt-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">Success timeline</div>
                      <div className="text-[11px] text-[color:var(--color-text-muted)]">
                        Recent surveys, support, projects, and renewals for this account.
                      </div>
                    </div>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-[color:var(--color-text-muted)]">
                    {(() => {
                      const items: { at: Date | null; label: string }[] = []
                      const s = accountSurveyStatusMap.get(editing._id)
                      if (s && s.responseCount > 0 && s.lastResponseAt) {
                        const d = new Date(s.lastResponseAt)
                        if (Number.isFinite(d.getTime())) {
                          items.push({
                            at: d,
                            label: `Last survey: score ${
                              s.lastScore != null ? s.lastScore.toFixed(1) : '-'
                            } on ${formatDateTime(d.toISOString())}`,
                          })
                        }
                      }
                      const t = accountTicketsMap.get(editing._id)
                      if (t && (t.open || t.high || t.breached)) {
                        items.push({
                          at: null,
                          label: `Current support load: ${t.open} open (${t.high} high/urgent), ${t.breached} breached SLA`,
                        })
                      }
                      const renewals = assetsSummaryQ.data?.data.upcomingRenewals ?? []
                      if (renewals.length > 0) {
                        let nextIdx = -1
                        let nextDate: Date | null = null
                        renewals.forEach((r, idx) => {
                          if (!r.expirationDate) return
                          const d = new Date(r.expirationDate)
                          if (!Number.isFinite(d.getTime())) return
                          if (!nextDate || d < nextDate) {
                            nextDate = d
                            nextIdx = idx
                          }
                        })
                        if (nextIdx >= 0 && nextDate) {
                          const r = renewals[nextIdx]!
                          const labelParts: string[] = []
                          if (r.licenseIdentifier) labelParts.push(r.licenseIdentifier)
                          else if (r.licenseKey) labelParts.push(r.licenseKey)
                          items.push({
                            at: nextDate,
                            label: `Next renewal: ${
                              labelParts.join(' ') || 'license'
                            } expires ${formatDate(r.expirationDate ?? '')} (${r.renewalStatus})`,
                          })
                        }
                      }
                      const projItems = accountProjectsForDrawer?.data.items ?? []
                      if (projItems.length > 0) {
                        let nextProj: { name: string; status: string; health?: string; targetEndDate?: string | null } | null =
                          null
                        let nextProjDate: Date | null = null
                        for (const p of projItems) {
                          if (!p.targetEndDate) continue
                          const d = new Date(p.targetEndDate)
                          if (!Number.isFinite(d.getTime())) continue
                          if (!nextProjDate || d < nextProjDate) {
                            nextProjDate = d
                            nextProj = p
                          }
                        }
                        if (nextProj && nextProjDate) {
                          const statusLabel =
                            nextProj.health === 'at_risk'
                              ? 'at risk'
                              : nextProj.health === 'off_track'
                              ? 'off track'
                              : nextProj.health === 'on_track'
                              ? 'on track'
                              : nextProj.status
                          items.push({
                            at: nextProjDate,
                            label: `Project milestone: ${nextProj.name} (${statusLabel}) target ${formatDate(
                              nextProjDate.toISOString(),
                            )}`,
                          })
                        }
                      }

                      if (!items.length) {
                        return (
                          <li className="text-[color:var(--color-text-muted)]">
                            No recent success events recorded yet for this account.
                          </li>
                        )
                      }

                      items.sort((a, b) => {
                        const av = a.at ? a.at.getTime() : 0
                        const bv = b.at ? b.at.getTime() : 0
                        return bv - av
                      })

                      return items.map((it, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span className="mt-[5px] inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-primary-500)]" />
                          <span>{it.label}</span>
                        </li>
                      ))
                    })()}
                  </ul>
                </div>
                <div className="col-span-full mt-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">Installed Base</div>
                      <div className="text-[11px] text-[color:var(--color-text-muted)]">
                        Environments, installed products, and license renewals for this account.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                      onClick={() => {
                        if (!editing?._id) return
                        window.location.href = `/apps/crm/assets?customerId=${encodeURIComponent(editing._id)}`
                      }}
                    >
                      Open assets
                    </button>
                  </div>
                  {assetsSummaryQ.isLoading && (
                    <div className="text-[11px] text-[color:var(--color-text-muted)]">Loading installed base…</div>
                  )}
                  {assetsSummaryQ.data && (
                    <div className="grid gap-3 md:grid-cols-3 text-[11px]">
                      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-2">
                        <div className="text-[10px] text-[color:var(--color-text-muted)]">Environments</div>
                        <div className="mt-1 text-lg font-semibold">
                          {assetsSummaryQ.data.data.totalEnvironments}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-2">
                        <div className="text-[10px] text-[color:var(--color-text-muted)]">Installed products</div>
                        <div className="mt-1 text-lg font-semibold">
                          {assetsSummaryQ.data.data.totalProducts}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-2">
                        <div className="flex items-center justify-between gap-1 text-[10px] text-[color:var(--color-text-muted)]">
                          <span>Upcoming renewals (90 days)</span>
                          {assetsSummaryQ.data.data.upcomingRenewals.length > 0 && (
                            <span className="inline-flex items-center rounded-full border border-amber-500/70 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-100">
                              Attention
                            </span>
                          )}
                        </div>
                        <div
                          className={`mt-1 text-lg font-semibold ${
                            assetsSummaryQ.data.data.upcomingRenewals.length > 0
                              ? 'text-amber-200'
                              : ''
                          }`}
                        >
                          {assetsSummaryQ.data.data.upcomingRenewals.length}
                        </div>
                      </div>
                    </div>
                  )}
                  {assetsSummaryQ.data?.data.upcomingRenewals?.length ? (
                    <div className="mt-2 space-y-1">
                      <div className="text-[10px] font-semibold text-[color:var(--color-text-muted)]">
                        Next renewals
                      </div>
                      <ul className="space-y-1 text-[10px] text-[color:var(--color-text-muted)]">
                        {assetsSummaryQ.data.data.upcomingRenewals.slice(0, 3).map((lic) => (
                          <li key={lic._id} className="flex items-center justify-between gap-2">
                            <span>{lic.licenseIdentifier || lic.licenseKey || 'License'}</span>
                            <span>{lic.expirationDate ? formatDateTime(lic.expirationDate) : 'No date'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div className="col-span-full mt-2 flex items-center justify-end gap-2">
                  <button type="button" className="mr-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm text-red-600 hover:bg-[color:var(--color-muted)]" onClick={() => { if (editing?._id) remove.mutate(editing._id); setEditing(null) }}>Delete</button>
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setShowHistory((v) => !v)}>{showHistory ? 'Hide history' : 'View history'}</button>
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
                </div>
                {surveyPrograms.length > 0 && (
                  <div className="col-span-full mt-4 rounded-xl border border-[color:var(--color-border)] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Surveys &amp; Feedback</div>
                      <div className="text-[11px] text-[color:var(--color-text-muted)]">
                        Send a CSAT/NPS survey for this account.
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="sm:col-span-1">
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
                        disabled={
                          !editing ||
                          !surveyProgramId ||
                          !surveyRecipientEmail ||
                          sendSurveyEmail.isPending
                        }
                        onClick={() => {
                          if (!editing || !surveyProgramId || !surveyRecipientEmail) return
                          sendSurveyEmail.mutate({
                            programId: surveyProgramId,
                            recipientName: surveyRecipientName || undefined,
                            recipientEmail: surveyRecipientEmail,
                            accountId: editing._id,
                          })
                        }}
                      >
                        {sendSurveyEmail.isPending ? 'Sending…' : 'Send survey email for account'}
                      </button>
                    </div>
                  </div>
                )}
                {showHistory && (
                  <div className="col-span-full mt-3 rounded-xl border border-[color:var(--color-border)] p-3 text-xs">
                    {historyQ.isLoading && <div>Loading…</div>}
                    {historyQ.data && (
                      <div className="space-y-2">
                        <div>Created: {formatDateTime(historyQ.data.data.createdAt)}</div>
                        <div>
                          <div className="font-semibold">Account history</div>
                          <ul className="list-disc pl-5">
                            {(historyQ.data.data.history ?? []).map((h, i) => (
                              <li key={i}>
                                {h.createdAt ? `${formatDateTime(h.createdAt)} – ` : ''}
                                {h.description ?? ''}
                                {h.userName ? ` (${h.userName})` : ''}
                              </li>
                            ))}
                            {(!historyQ.data.data.history ||
                              historyQ.data.data.history.length === 0) && <li>None</li>}
                          </ul>
                        </div>
                        <div>
                          <div className="font-semibold">Deals</div>
                          <ul className="list-disc pl-5">{historyQ.data.data.deals.map((d, i) => (<li key={i}>{d.dealNumber ?? ''} {d.title ?? ''} {d.amount ? `$${d.amount}` : ''} {d.stage ?? ''} {d.closeDate ? `• Close: ${formatDate(d.closeDate)}` : ''}</li>))}{historyQ.data.data.deals.length===0 && <li>None</li>}</ul>
                        </div>
                        <div>
                          <div className="font-semibold">Quotes</div>
                          <ul className="list-disc pl-5">{historyQ.data.data.quotes.map((q, i) => (<li key={i}>{q.quoteNumber ?? ''} {q.title ?? ''} ${q.total ?? ''} {q.status ?? ''} {q.updatedAt ? `• Updated: ${formatDateTime(q.updatedAt)}` : ''}</li>))}{historyQ.data.data.quotes.length===0 && <li>None</li>}</ul>
                        </div>
                        <div>
                          <div className="font-semibold">Invoices</div>
                          <ul className="list-disc pl-5">{historyQ.data.data.invoices.map((inv, i) => (<li key={i}>{inv.invoiceNumber ?? ''} {inv.title ?? ''} ${inv.total ?? ''} {inv.status ?? ''} {inv.issuedAt ? `• Issued: ${formatDate(inv.issuedAt)}` : ''} {inv.dueDate ? `• Due: ${formatDate(inv.dueDate)}` : ''}</li>))}{historyQ.data.data.invoices.length===0 && <li>None</li>}</ul>
                        </div>
                        <div>
                          <div className="font-semibold">Activities</div>
                          <ul className="list-disc pl-5">{historyQ.data.data.activities.map((a, i) => (<li key={i}>{formatDateTime(a.at)} - {a.type ?? ''} {a.subject ?? ''}</li>))}{historyQ.data.data.activities.length===0 && <li>None</li>}</ul>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="col-span-full mt-4 pt-4 border-t">
                  <DocumentsList
                    relatedToType="account"
                    relatedToId={editing._id}
                    relatedToName={editing.name || editing.companyName}
                    compact={true}
                  />
                </div>
                <div className="col-span-full mt-4">
                  <RelatedTasks relatedType="account" relatedId={editing._id} />
                </div>
              </form>
            </div>
          </div>
        </div>,
        portalEl
      )}
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
                      <button type="button" className="ml-2 rounded-lg border border-red-400 text-red-400 px-2 py-1 text-xs hover:bg-red-50" onClick={() => { if (confirm(`Delete "${v.name}"?`)) deleteView(v.id) }}>Delete</button>
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


