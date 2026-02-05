import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as React from 'react'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { CRMHelpButton } from '@/components/CRMHelpButton'
import { formatDate } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'
import { DocumentsList } from '@/components/DocumentsList'
import { RelatedTasks } from '@/components/RelatedTasks'
import { AuditTrail, type AuditEntry } from '@/components/AuditTrail'
import { Modal } from '@/components/Modal'

type Deal = {
  _id: string
  dealNumber?: number
  title?: string
  amount?: number
  stage?: string
  closeDate?: string
  forecastedCloseDate?: string
  accountId?: string
  accountNumber?: number
  marketingCampaignId?: string
  approver?: string
  ownerId?: string
}

type DealSurveyStatusSummary = {
  dealId: string
  responseCount: number
  lastResponseAt: string | null
  lastScore: number | null
}
type AccountPick = { _id: string; accountNumber?: number; name?: string }
type UserPick = { _id: string; name: string; email: string }
type LinkedRenewal = {
  _id: string
  name: string
  renewalDate?: string | null
  mrr?: number | null
  arr?: number | null
}

export default function CRMDeals() {
  const qc = useQueryClient()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [q, setQ] = React.useState('')
  const [sort, setSort] = React.useState<'dealNumber'|'title'|'stage'|'amount'|'closeDate'>('closeDate')
  const [dir, setDir] = React.useState<'asc'|'desc'>('desc')
  const [stage, setStage] = React.useState<string>('')
  const [minAmount, setMinAmount] = React.useState<string>('')
  const [maxAmount, setMaxAmount] = React.useState<string>('')
  const [startDate, setStartDate] = React.useState<string>('')
  const [endDate, setEndDate] = React.useState<string>('')
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(10)
  type ColumnDef = { key: string; visible: boolean; label: string }
  type DealProjectsSummaryRow = {
    dealId: string
    total: number
    active: number
    completed: number
    atRisk: number
    offTrack: number
  }

  const defaultCols: ColumnDef[] = [
    { key: 'dealNumber', visible: true, label: 'Deal #' },
    { key: 'account', visible: true, label: 'Account' },
    { key: 'title', visible: true, label: 'Title' },
    { key: 'amount', visible: true, label: 'Amount' },
    { key: 'stage', visible: true, label: 'Stage' },
    { key: 'ownerId', visible: true, label: 'Owner' },
    { key: 'forecastedCloseDate', visible: true, label: 'Forecast close' },
    { key: 'closeDate', visible: true, label: 'Actual close' },
    { key: 'tasks', visible: true, label: 'Tasks' },
    { key: 'projects', visible: true, label: 'Projects' },
    { key: 'surveyStatus', visible: true, label: 'Survey' },
  ]
  // Ensure Survey, Tasks, and Projects columns are always present and visible, even for old saved layouts
  function ensureSurveyCol(cols: ColumnDef[]): ColumnDef[] {
    let hasSurvey = false
    let hasTasks = false
    let hasProjects = false
    const next = cols.map((c) => {
      if (c.key === 'surveyStatus') {
        hasSurvey = true
        return { ...c, visible: true, label: 'Survey' }
      }
      if (c.key === 'tasks') {
        hasTasks = true
        return { ...c, visible: true, label: 'Tasks' }
      }
      if (c.key === 'projects') {
        hasProjects = true
        return { ...c, visible: true, label: 'Projects' }
      }
      return c
    })
    if (!hasTasks) {
      next.push({ key: 'tasks', visible: true, label: 'Tasks' })
    }
    if (!hasSurvey) {
      next.push({ key: 'surveyStatus', visible: true, label: 'Survey' })
    }
    if (!hasProjects) {
      next.push({ key: 'projects', visible: true, label: 'Projects' })
    }
    return next
  }
  const [showColsMenu, setShowColsMenu] = React.useState(false)
  const [cols, setCols] = React.useState<ColumnDef[]>(ensureSurveyCol(defaultCols))
  const [savedViews, setSavedViews] = React.useState<Array<{ id: string; name: string; config: any }>>([])
  const [showSaveViewDialog, setShowSaveViewDialog] = React.useState(false)
  const [savingViewName, setSavingViewName] = React.useState('')
  const [draggedCol, setDraggedCol] = React.useState<string | null>(null)
  const initializedFromUrl = React.useRef(false)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkStage, setBulkStage] = React.useState<string>('')
  const [inlineEditId, setInlineEditId] = React.useState<string | null>(null)
  const [inlineTitle, setInlineTitle] = React.useState<string>('')
  const [inlineAmount, setInlineAmount] = React.useState<string>('')
  const [inlineStage, setInlineStage] = React.useState<string>('')
  const [inlineCloseDate, setInlineCloseDate] = React.useState<string>('')

  // Initialize from URL and localStorage once
  React.useEffect(() => {
    if (initializedFromUrl.current) return
    initializedFromUrl.current = true
    const get = (key: string) => searchParams.get(key) || ''
    const getNum = (key: string, fallback: number) => {
      const v = searchParams.get(key)
      const n = v != null ? Number(v) : NaN
      return Number.isFinite(n) && n >= 0 ? n : fallback
    }
    const q0 = get('q')
    const sort0 = (get('sort') as any) || 'closeDate'
    const dir0 = (get('dir') as any) || 'desc'
    const stage0 = get('stage')
    const min0 = get('minAmount')
    const max0 = get('maxAmount')
    const start0 = get('startDate')
    const end0 = get('endDate')
    const page0 = getNum('page', 0)
    const limit0 = getNum('limit', 10)
    if (q0) setQ(q0)
    setSort(sort0)
    setDir(dir0)
    if (stage0) setStage(stage0)
    if (min0) setMinAmount(min0)
    if (max0) setMaxAmount(max0)
    if (start0) setStartDate(start0)
    if (end0) setEndDate(end0)
    setPage(page0)
    setPageSize(limit0)

    // Columns from localStorage or URL (comma-separated keys or full array)
    try {
      const stored = localStorage.getItem('DEALS_COLS')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCols(ensureSurveyCol(parsed))
        }
      }
    } catch {}
    const colsParam = get('cols')
    if (colsParam) {
      const keys = new Set(colsParam.split(',').map((s) => s.trim()).filter(Boolean))
      setCols(
        ensureSurveyCol(defaultCols.map((c) => ({ ...c, visible: keys.has(c.key) }))),
      )
    }

    // Load saved views
    try {
      const views = localStorage.getItem('DEALS_SAVED_VIEWS')
      if (views) {
        const parsed = JSON.parse(views)
        if (Array.isArray(parsed)) setSavedViews(parsed)
      }
    } catch {}
    ;(async () => {
      try {
        const res = await http.get('/api/views', { params: { viewKey: 'deals' } })
        const items = (res.data?.data?.items ?? []).map((v: any) => ({ id: String(v._id), name: v.name, config: v.config }))
        if (Array.isArray(items)) setSavedViews(items)
        if (items.length === 0) {
          const seeds = [
            { name: 'Open pipeline', config: { q: '', sort: 'closeDate', dir: 'desc', stage: '' } },
            { name: 'High value', config: { minAmount: '10000', sort: 'amount', dir: 'desc' } },
          ]
          for (const s of seeds) { try { await http.post('/api/views', { viewKey: 'deals', name: s.name, config: s.config }) } catch {} }
          try { const res2 = await http.get('/api/views', { params: { viewKey: 'deals' } }); const items2 = (res2.data?.data?.items ?? []).map((v: any) => ({ id: String(v._id), name: v.name, config: v.config })); if (Array.isArray(items2)) setSavedViews(items2) } catch {}
        }
      } catch {}
    })()
  }, [searchParams])

  // Persist filters and columns to URL/localStorage
  React.useEffect(() => {
    const params: Record<string, string> = {}
    if (q) params.q = q
    if (sort) params.sort = sort
    if (dir) params.dir = dir
    if (stage) params.stage = stage
    if (minAmount) params.minAmount = minAmount
    if (maxAmount) params.maxAmount = maxAmount
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate
    if (page) params.page = String(page)
    if (pageSize !== 10) params.limit = String(pageSize)
    const colKeys = cols.filter((c) => c.visible).map((c) => c.key).join(',')
    if (colKeys) params.cols = colKeys
    setSearchParams(params, { replace: true })
    try { localStorage.setItem('DEALS_COLS', JSON.stringify(cols)) } catch {}
    try { localStorage.setItem('DEALS_SAVED_VIEWS', JSON.stringify(savedViews)) } catch {}
  }, [q, sort, dir, stage, minAmount, maxAmount, startDate, endDate, page, pageSize, cols, savedViews, setSearchParams])
  const { data, isFetching } = useQuery<{ data: { items: Deal[]; total: number; page: number; limit: number } }>({
    queryKey: ['deals', q, sort, dir, stage, minAmount, maxAmount, startDate, endDate, page, pageSize],
    queryFn: async () => {
      const res = await http.get('/api/crm/deals', {
        params: {
          q,
          sort,
          dir,
          stage: stage || undefined,
          minAmount: minAmount || undefined,
          maxAmount: maxAmount || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          page,
          limit: pageSize,
        },
      })
      const result = res.data as { data: { items: Deal[]; total: number; page: number; limit: number } }
      // Ensure all deal IDs are properly formatted strings
      if (result?.data?.items) {
        result.data.items = result.data.items.map((deal) => {
          // Ensure _id is a string and valid ObjectId format
          if (deal._id) {
            const idStr = String(deal._id)
            // If ID is invalid, log a warning but don't break the UI
            if (!/^[0-9a-fA-F]{24}$/.test(idStr)) {
              console.warn(`Invalid deal ID detected: "${idStr}" (${idStr.length} chars) for deal "${deal.title || 'Unknown'}"`)
            }
            return { ...deal, _id: idStr }
          }
          return deal
        })
      }
      return result
    },
    placeholderData: keepPreviousData,
  })
  const accountsQ = useQuery({
    queryKey: ['accounts-pick'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', { params: { limit: 1000, sort: 'name', dir: 'asc' } })
      return res.data as { data: { items: AccountPick[] } }
    },
  })
  const usersQ = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => {
      const res = await http.get('/api/auth/users')
      return res.data as { data: { items: UserPick[] } }
    },
  })
  const { data: campaignsQ } = useQuery({
    queryKey: ['mkt-campaigns'],
    queryFn: async () => (await http.get('/api/marketing/campaigns')).data as { data: { items: { _id: string; name: string }[] } },
  })
  const accounts = accountsQ.data?.data.items ?? []
  const users = usersQ.data?.data.items ?? []
  const acctById = React.useMemo(() => new Map(accounts.map((a) => [a._id, a])), [accounts])
  const userById = React.useMemo(() => new Map(users.map((u) => [u._id, u])), [users])
  // Managers for approval workflow
  // Managers for approval workflow
  const { data: managersData } = useQuery({
    queryKey: ['managers'],
    queryFn: async () => {
      const res = await http.get('/api/auth/managers')
      return res.data as { managers: Array<{ id: string; email: string; name?: string }> }
    },
    refetchOnWindowFocus: false,
    retry: false,
  })
  const managers = managersData?.managers ?? []
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
  const [surveyProgramId, setSurveyProgramId] = React.useState('')
  const [surveyRecipientName, setSurveyRecipientName] = React.useState('')
  const [surveyRecipientEmail, setSurveyRecipientEmail] = React.useState('')

  const create = useMutation({
    mutationFn: async (payload: { title: string; accountId: string; amount?: number; stage?: string; closeDate?: string }) => {
      const res = await http.post('/api/crm/deals', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] })
      toast.showToast('BOAZ says: Deal saved.', 'success')
    },
  })
  const update = useMutation({
    mutationFn: async (payload: Partial<Deal> & { _id: string } & { accountId?: string; accountNumber?: number }) => {
      const { _id, ...rest } = payload as any
      if (!_id || typeof _id !== 'string') {
        throw new Error('Invalid deal ID: ID is missing or not a string')
      }
      // Validate ObjectId format (24 hex characters)
      if (!/^[0-9a-fA-F]{24}$/.test(_id)) {
        throw new Error(`Invalid deal ID format: "${_id}" is not a valid ObjectId (must be 24 hex characters)`)
      }
      const res = await http.put(`/api/crm/deals/${_id}`, rest)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] })
      qc.invalidateQueries({ queryKey: ['deal-history'] })
      toast.showToast('BOAZ says: Deal saved.', 'success')
    },
    onError: (err: any) => {
      console.error('Deal update error (full):', err)
      const errorData = err?.response?.data || {}
      const errorMsg = errorData.error || err?.message || 'Failed to update deal'
      const details = errorData.details || errorData.message
      const fullMessage = details ? `${errorMsg}: ${details}` : errorMsg
      toast.showToast(`Error: ${fullMessage}`, 'error')
      console.error('Deal update error (parsed):', { 
        error: errorMsg, 
        details, 
        status: err?.response?.status,
        statusText: err?.response?.statusText,
        data: errorData,
        url: err?.config?.url
      })
    },
  })
  const sendSurveyEmail = useMutation({
    mutationFn: async (payload: {
      programId: string
      recipientName?: string
      recipientEmail: string
      accountId?: string
      dealId?: string
    }) => {
      const { programId, ...rest } = payload
      const res = await http.post(`/api/crm/surveys/programs/${programId}/send-email`, rest)
      return res.data
    },
    onSuccess: () => {
      toast.showToast('Survey email sent', 'success')
      qc.invalidateQueries({ queryKey: ['deals-survey-status'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to send survey email'
      toast.showToast(msg, 'error')
    },
  })
  const requestApproval = useMutation({
    mutationFn: async (dealId: string) => {
      const res = await http.post(`/api/crm/deals/${dealId}/request-approval`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] })
      qc.invalidateQueries({ queryKey: ['deal-history'] })
      toast.showToast('BOAZ says: Deal approval request sent.', 'success')
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.error || 'Failed to send approval request'
      toast.showToast(errorMsg, 'error')
    },
  })
  async function applyBulkStage() {
    if (!bulkStage || selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    await Promise.allSettled(ids.map((id) => update.mutateAsync({ _id: id, stage: bulkStage } as any)))
    setSelectedIds(new Set())
    setBulkStage('')
  }
  async function applyBulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} deal(s)? This cannot be undone.`)) return
    const ids = Array.from(selectedIds)
    await Promise.allSettled(ids.map((id) => http.delete(`/api/crm/deals/${id}`)))
    qc.invalidateQueries({ queryKey: ['deals'] })
    setSelectedIds(new Set())
  }
  function startInlineEdit(d: Deal) {
    // Validate deal ID before starting inline edit
    const dealId = d._id
    if (!dealId || typeof dealId !== 'string') {
      toast.showToast('Cannot edit: Invalid deal ID', 'error')
      return
    }
    if (!/^[0-9a-fA-F]{24}$/.test(dealId)) {
      toast.showToast(`Cannot edit: Invalid deal ID format "${dealId}" (${dealId.length} chars, expected 24). This deal may be corrupted.`, 'error')
      return
    }
    setInlineEditId(dealId)
    setInlineTitle(d.title ?? '')
    setInlineAmount(typeof d.amount === 'number' ? String(d.amount) : '')
    setInlineStage(d.stage ?? '')
    setInlineCloseDate(d.closeDate ? d.closeDate.slice(0,10) : '')
  }
  async function saveInlineEdit() {
    if (!inlineEditId) return
    // Validate deal ID before saving
    if (typeof inlineEditId !== 'string') {
      toast.showToast('Cannot save: Invalid deal ID', 'error')
      return
    }
    if (!/^[0-9a-fA-F]{24}$/.test(inlineEditId)) {
      toast.showToast(`Cannot save: Invalid deal ID format "${inlineEditId}" (${inlineEditId.length} chars, expected 24). This deal may be corrupted.`, 'error')
      return
    }
    const payload: any = { _id: inlineEditId }
    if (inlineTitle && inlineTitle.trim()) payload.title = inlineTitle.trim()
    if (inlineStage && inlineStage.trim()) payload.stage = inlineStage.trim()
    if (inlineCloseDate && inlineCloseDate.trim()) payload.closeDate = inlineCloseDate.trim()
    if (inlineAmount.trim() !== '') {
      const n = Number(inlineAmount)
      if (Number.isFinite(n)) payload.amount = n
    }
    // Ensure at least one field is being updated
    const { _id, ...rest } = payload
    if (Object.keys(rest).length === 0) {
      toast.showToast('No changes to save', 'warning')
      return
    }
    await update.mutateAsync(payload)
    cancelInlineEdit()
  }
  function cancelInlineEdit() {
    setInlineEditId(null)
    setInlineTitle('')
    setInlineAmount('')
    setInlineStage('')
    setInlineCloseDate('')
  }

  const items = data?.data.items ?? []
  const total = data?.data.total ?? 0
  const anySelected = selectedIds.size > 0
  const allPageSelected = items.length > 0 && items.every((d) => selectedIds.has(d._id))
  React.useEffect(() => { setPage(0) }, [q, sort, dir, stage, minAmount, maxAmount, startDate, endDate, pageSize])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageItems = items

  // Survey status for visible deals
  const dealIdsParam = React.useMemo(
    () => (items.length ? items.map((d) => d._id).join(',') : ''),
    [items],
  )

  const { data: dealSurveyStatusData } = useQuery({
    queryKey: ['deals-survey-status', dealIdsParam],
    enabled: !!dealIdsParam,
    queryFn: async () => {
      const res = await http.get('/api/crm/surveys/deals/status', {
        params: { dealIds: dealIdsParam },
      })
      return res.data as { data: { items: DealSurveyStatusSummary[] } }
    },
  })

  const dealSurveyStatusMap = React.useMemo(() => {
    const map = new Map<string, DealSurveyStatusSummary>()
    for (const s of dealSurveyStatusData?.data.items ?? []) {
      map.set(s.dealId, s)
    }
    return map
  }, [dealSurveyStatusData?.data.items])

  const dealIdsForTasks = React.useMemo(
    () => (items.length ? items.map((d) => d._id).join(',') : ''),
    [items],
  )

  const { data: dealTaskCountsData } = useQuery({
    queryKey: ['deals-task-counts', dealIdsForTasks],
    enabled: !!dealIdsForTasks,
    queryFn: async () => {
      const res = await http.get('/api/crm/tasks/counts', {
        params: { relatedType: 'deal', relatedIds: dealIdsForTasks, status: 'open' },
      })
      return res.data as { data: { items: Array<{ relatedId: string; count: number }> } }
    },
  })

  const dealTaskCountMap = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const row of dealTaskCountsData?.data.items ?? []) {
      map.set(row.relatedId, row.count)
    }
    return map
  }, [dealTaskCountsData?.data.items])

  const dealIdsForProjects = React.useMemo(
    () => (items.length ? items.map((d) => d._id).join(',') : ''),
    [items],
  )

  const { data: dealProjectsSummaryData } = useQuery({
    queryKey: ['deals-projects-summary', dealIdsForProjects],
    enabled: !!dealIdsForProjects,
    queryFn: async () => {
      const res = await http.get('/api/crm/projects/counts', {
        params: { dealIds: dealIdsForProjects },
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

  const dealProjectsMap = React.useMemo(() => {
    const map = new Map<string, DealProjectsSummaryRow>()
    for (const row of dealProjectsSummaryData?.data.items ?? []) {
      if ((row as any).kind !== 'deal' || !row.dealId) continue
      const r = row as any
      map.set(r.dealId, {
        dealId: r.dealId,
        total: r.total ?? 0,
        active: r.active ?? 0,
        completed: r.completed ?? 0,
        atRisk: r.atRisk ?? 0,
        offTrack: r.offTrack ?? 0,
      })
    }
    return map
  }, [dealProjectsSummaryData?.data.items])

  const [editing, setEditing] = React.useState<Deal | null>(null)
  const [showHistory, setShowHistory] = React.useState(false)

  const { data: linkedRenewalData } = useQuery({
    queryKey: ['renewals-by-deal', editing?._id],
    enabled: !!editing?._id,
    queryFn: async () => {
      const res = await http.get('/api/crm/renewals', {
        params: { sourceDealId: editing?._id },
      })
      return res.data as { data: { items: LinkedRenewal[] } }
    },
  })
  const { data: dealProjectsForDrawer } = useQuery({
    queryKey: ['deal-projects', editing?._id],
    enabled: !!editing?._id,
    queryFn: async () => {
      const res = await http.get('/api/crm/projects', {
        params: { dealId: editing?._id, limit: 50, sort: 'targetEndDate', dir: 'asc' },
      })
      return res.data as {
        data: {
          items: Array<{
            _id: string
            name: string
            status: string
            health?: string
            targetEndDate?: string | null
          }>
        }
      }
    },
  })
  
  // History query
  const historyQ = useQuery({
    queryKey: ['deal-history', editing?._id, showHistory],
    enabled: Boolean(editing?._id && showHistory),
    queryFn: async () => {
      const res = await http.get(`/api/crm/deals/${editing?._id}/history`)
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
          deal: any
        }
      }
    },
  })
  
  // Reset history visibility when editing changes
  React.useEffect(() => {
    setShowHistory(false)
  }, [editing?._id])

  async function saveCurrentView() {
    const viewConfig = { q, sort, dir, stage, minAmount, maxAmount, startDate, endDate, cols, pageSize }
    const name = savingViewName || `View ${savedViews.length + 1}`
    try {
      const res = await http.post('/api/views', { viewKey: 'deals', name, config: viewConfig })
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
    if (c.stage !== undefined) setStage(c.stage)
    if (c.minAmount !== undefined) setMinAmount(c.minAmount)
    if (c.maxAmount !== undefined) setMaxAmount(c.maxAmount)
    if (c.startDate !== undefined) setStartDate(c.startDate)
    if (c.endDate !== undefined) setEndDate(c.endDate)
    if (c.cols) setCols(ensureSurveyCol(c.cols))
    if (c.pageSize) setPageSize(c.pageSize)
    setPage(0)
  }
  async function deleteView(id: string) { try { await http.delete(`/api/views/${id}`) } catch {}; setSavedViews((prev) => prev.filter((v) => v.id !== id)) }
  function copyShareLink() {
    const url = window.location.origin + window.location.pathname + '?' + searchParams.toString()
    navigator.clipboard?.writeText(url).then(() => toast.showToast('Link copied', 'success')).catch(() => toast.showToast('Failed to copy', 'error'))
  }
  function getColValue(d: Deal, key: string) {
    if (key === 'dealNumber') return d.dealNumber ?? ''
    if (key === 'account') {
      const a =
        (d.accountId && acctById.get(d.accountId)) ||
        accounts.find((x) => x.accountNumber === d.accountNumber)
      if (a) {
        return a.name ?? 'Account'
      }
      return '-'
    }
    if (key === 'title') return d.title ?? ''
    if (key === 'amount') return typeof d.amount === 'number' ? `$${d.amount.toLocaleString()}` : '-'
    if (key === 'stage') return d.stage ?? '-'
    if (key === 'forecastedCloseDate') return d.forecastedCloseDate ? formatDate(d.forecastedCloseDate) : '-'
    if (key === 'closeDate') return d.closeDate ? formatDate(d.closeDate) : '-'
    if (key === 'tasks') {
      const count = dealTaskCountMap.get(d._id) ?? 0
      return (
        <div className="flex items-center gap-1">
          {count > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] text-[color:var(--color-text)]">
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
                    relatedType: 'deal',
                    relatedId: d._id,
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
              navigate(`/apps/crm/tasks?relatedType=deal&relatedId=${encodeURIComponent(d._id)}`)
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
                  relatedType: 'deal',
                  relatedId: d._id,
                })
                qc.invalidateQueries({ queryKey: ['deals-task-counts'] })
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
      const summary = dealProjectsMap.get(d._id)
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
      const status = dealSurveyStatusMap.get(d._id)
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
    if (key === 'ownerId') {
      if (!d.ownerId) return '-'
      const owner = userById.get(d.ownerId)
      return owner ? owner.name : d.ownerId
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

  return (
    <div className="space-y-4">
      <CRMNav />
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Deals</h1>
        <CRMHelpButton tag="crm:deals" />
      </div>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deals..." className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button type="button" onClick={() => setQ('')} disabled={!q}
            className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50">Clear</button>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]">
            <option value="dealNumber">Deal #</option>
            <option value="closeDate">Close date</option>
            <option value="title">Title</option>
            <option value="stage">Stage</option>
            <option value="amount">Amount</option>
          </select>
          <select value={dir} onChange={(e) => setDir(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]">
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
          {isFetching && <span className="text-xs text-[color:var(--color-text-muted)]">Loading...</span>}
          <select value={stage} onChange={(e) => setStage(e.target.value)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">All stages</option>
            <option>Draft / Deal Created</option>
            <option>Submitted for Review</option>
            <option>Initial Validation</option>
            <option>Manager Approval</option>
            <option>Finance Approval</option>
            <option>Legal Review</option>
            <option>Executive Approval</option>
            <option>Approved / Ready for Signature</option>
            <option>Contract Signed / Closed Won</option>
            <option>Rejected / Returned for Revision</option>
          </select>
          <input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} type="number" placeholder="Min $" className="w-28 rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-2 text-sm" />
          <input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} type="number" placeholder="Max $" className="w-28 rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-2 text-sm" />
          <input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-2 text-sm" />
          <input value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-2 text-sm" />
          <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => { setStage(''); setMinAmount(''); setMaxAmount(''); setStartDate(''); setEndDate(''); setQ(''); setSort('closeDate'); setDir('desc'); }}>Reset</button>
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
          {anySelected && (
            <div className="ml-auto flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm">
              <span className="text-[color:var(--color-text-muted)]">{selectedIds.size} selected</span>
              <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value)} className="rounded border bg-[color:var(--color-panel)] px-2 py-1">
                <option value="">Change stage…</option>
                <option>Draft / Deal Created</option>
                <option>Submitted for Review</option>
                <option>Initial Validation</option>
                <option>Manager Approval</option>
                <option>Finance Approval</option>
                <option>Legal Review</option>
                <option>Executive Approval</option>
                <option>Approved / Ready for Signature</option>
                <option>Contract Signed / Closed Won</option>
                <option>Rejected / Returned for Revision</option>
              </select>
              <button type="button" className="rounded-lg border px-2 py-1" onClick={applyBulkStage} disabled={!bulkStage}>Apply</button>
              <button type="button" className="rounded-lg border border-red-400 text-red-600 px-2 py-1" onClick={applyBulkDelete}>Delete</button>
            </div>
          )}
          <button
            className="ml-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
            onClick={() => {
              const visibleCols = cols.filter((c) => c.visible)
              const headers = visibleCols.map((c) => c.label)
              const rows = pageItems.map((d: Deal) => visibleCols.map((col) => {
                if (col.key === 'dealNumber') return d.dealNumber ?? ''
                if (col.key === 'account') {
                  const a = (d.accountId && acctById.get(d.accountId)) || accounts.find((x) => x.accountNumber === d.accountNumber)
                  if (a) {
                    return a.name ?? 'Account'
                  }
                  return '-'
                }
                if (col.key === 'title') return d.title ?? ''
                if (col.key === 'amount') return typeof d.amount === 'number' ? d.amount : ''
                if (col.key === 'stage') return d.stage ?? ''
                if (col.key === 'forecastedCloseDate') return d.forecastedCloseDate ? new Date(d.forecastedCloseDate).toISOString().slice(0,10) : ''
                if (col.key === 'closeDate') return d.closeDate ? new Date(d.closeDate).toISOString().slice(0,10) : ''
                if (col.key === 'ownerId') {
                  const owner = d.ownerId && userById.get(d.ownerId)
                  return owner ? owner.name : (d.ownerId || '')
                }
                return ''
              }))
              const csv = [headers.join(','), ...rows.map((r) => r.map((x) => '"'+String(x).replaceAll('"','""')+'"').join(','))].join('\n')
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'deals.csv'
              a.click()
              URL.revokeObjectURL(url)
            }}
          >Export CSV</button>
        </div>
        <form className="flex flex-wrap gap-2 p-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const title = String(fd.get('title')||''); const accNumStr = String(fd.get('accountNumber')||''); const accNum = accNumStr ? Number(accNumStr) : undefined; const amount = fd.get('amount') ? Number(fd.get('amount')) : undefined; const stage = String(fd.get('stage')||'')|| undefined; const closeDate = String(fd.get('closeDate')||'')|| undefined; const forecastedCloseDate = String(fd.get('forecastedCloseDate')||'')|| undefined; const campaignSel = String(fd.get('marketingCampaignId')||''); const ownerId = String(fd.get('ownerId')||'').trim() || undefined; const acc = (accountsQ.data?.data.items ?? []).find(a => a.accountNumber === accNum); const payload: any = { title, amount, stage, closeDate, forecastedCloseDate, ownerId }; if (acc?._id) payload.accountId = acc._id; else if (typeof accNum === 'number' && Number.isFinite(accNum)) payload.accountNumber = accNum; if (campaignSel) payload.marketingCampaignId = campaignSel; create.mutate(payload); (e.currentTarget as HTMLFormElement).reset() }}>
          <input name="title" required placeholder="Title" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <select name="accountNumber" required className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">Select account</option>
            {(accountsQ.data?.data.items ?? []).filter((a) => typeof a.accountNumber === 'number').map((a) => (
              <option key={a._id} value={a.accountNumber ?? ''}>
                {(a.accountNumber ?? '-')} - {a.name ?? 'Account'}
              </option>
            ))}
          </select>
          <input name="amount" type="number" step="1" placeholder="Amount" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <select name="stage" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option>Draft / Deal Created</option>
            <option>Submitted for Review</option>
            <option>Initial Validation</option>
            <option>Manager Approval</option>
            <option>Finance Approval</option>
            <option>Legal Review</option>
            <option>Executive Approval</option>
            <option>Approved / Ready for Signature</option>
            <option>Contract Signed / Closed Won</option>
            <option>Rejected / Returned for Revision</option>
          </select>
          <div className="col-span-full grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-[color:var(--color-text-muted)] mb-1">Forecasted Close Date</label>
              <input name="forecastedCloseDate" type="date" className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
              <p className="text-[10px] text-[color:var(--color-text-muted)] mt-1">Expected close date (for forecasting)</p>
            </div>
            <div>
              <label className="block text-xs text-[color:var(--color-text-muted)] mb-1">Actual Close Date (optional)</label>
              <input name="closeDate" type="date" className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
              <p className="text-[10px] text-[color:var(--color-text-muted)] mt-1">Actual date when deal closed</p>
            </div>
          </div>
          <select name="marketingCampaignId" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">Campaign (optional)</option>
            {((campaignsQ?.data?.items ?? []) as any[]).map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          <select name="ownerId" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">Owner (optional)</option>
            {users.map((u) => (
              <option key={u._id} value={u._id}>{u.name} ({u.email})</option>
            ))}
          </select>
          <button className="ml-auto rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">
            Add deal
          </button>
        </form>
        {/* Horizontal scroll wrapper to prevent Actions column overflow */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="text-left text-[color:var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-2">
                  <input type="checkbox" checked={allPageSelected} onChange={(e) => {
                    const next = new Set(selectedIds)
                    if (e.target.checked) items.forEach((d) => next.add(d._id))
                    else items.forEach((d) => next.delete(d._id))
                    setSelectedIds(next)
                  }} />
                </th>
                {cols.filter((c) => c.visible).map((col) => (
                  <th
                    key={col.key}
                    draggable
                    onDragStart={() => handleDragStart(col.key)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(col.key)}
                    className={`px-4 py-2 cursor-move ${draggedCol === col.key ? 'opacity-50' : ''}`}
                    title="Drag to reorder"
                  >{col.label}</th>
                ))}
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((d) => (
                <tr key={d._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={selectedIds.has(d._id)} onChange={(e) => {
                      const next = new Set(selectedIds)
                      if (e.target.checked) next.add(d._id); else next.delete(d._id)
                      setSelectedIds(next)
                    }} />
                  </td>
                  {cols.filter((c) => c.visible).map((col) => (
                    <td key={col.key} className="px-4 py-2">
                      {inlineEditId === d._id ? (
                        col.key === 'title' ? (
                          <input value={inlineTitle} onChange={(e) => setInlineTitle(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                        ) : col.key === 'amount' ? (
                          <input type="number" value={inlineAmount} onChange={(e) => setInlineAmount(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                        ) : col.key === 'stage' ? (
                          <select value={inlineStage} onChange={(e) => setInlineStage(e.target.value)} className="w-full rounded border bg-[color:var(--color-panel)] px-2 py-1 text-sm text-[color:var(--color-text)]">
                            <option>Draft / Deal Created</option>
                            <option>Submitted for Review</option>
                            <option>Initial Validation</option>
                            <option>Manager Approval</option>
                            <option>Finance Approval</option>
                            <option>Legal Review</option>
                            <option>Executive Approval</option>
                            <option>Approved / Ready for Signature</option>
                            <option>Contract Signed / Closed Won</option>
                            <option>Rejected / Returned for Revision</option>
                          </select>
                        ) : col.key === 'closeDate' ? (
                          <input type="date" value={inlineCloseDate} onChange={(e) => setInlineCloseDate(e.target.value)} className="w-full rounded border bg-transparent px-2 py-1 text-sm" />
                        ) : (
                          getColValue(d, col.key)
                        )
                      ) : (
                        getColValue(d, col.key)
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2 whitespace-nowrap">
                    {inlineEditId === d._id ? (
                      <div className="flex items-center gap-2">
                        <button className="rounded-lg border px-2 py-1 text-xs" onClick={saveInlineEdit}>Save</button>
                        <button className="rounded-lg border px-2 py-1 text-xs" onClick={cancelInlineEdit}>Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button className="rounded-lg border px-2 py-1 text-xs" onClick={() => startInlineEdit(d)}>Edit</button>
                        <button className="rounded-lg border px-2 py-1 text-xs" onClick={() => {
                          // Validate deal ID before opening
                          const dealId = d._id
                          if (!dealId || typeof dealId !== 'string') {
                            toast.showToast('Invalid deal: missing ID', 'error')
                            return
                          }
                          // Ensure ID is exactly 24 hex characters (valid MongoDB ObjectId)
                          if (!/^[0-9a-fA-F]{24}$/.test(dealId)) {
                            toast.showToast(`Invalid deal ID format: "${dealId}" (${dealId.length} chars, expected 24). This deal may be corrupted.`, 'error')
                            return
                          }
                          setEditing(d)
                        }}>Open</button>
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
            <span>Rows: {total}</span>
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
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit deal" width="40rem">
        {editing && (
          <form
                className="grid gap-2 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  // Validate deal ID before submitting
                  if (!editing._id || typeof editing._id !== 'string') {
                    toast.showToast('Cannot save: Invalid deal ID', 'error')
                    return
                  }
                  if (!/^[0-9a-fA-F]{24}$/.test(editing._id)) {
                    toast.showToast(`Cannot save: Invalid deal ID format "${editing._id}" (${editing._id.length} chars, expected 24). This deal may be corrupted.`, 'error')
                    return
                  }
                  const fd = new FormData(e.currentTarget)
                  const title = String(fd.get('title')||'').trim() || undefined
                  const amountRaw = fd.get('amount')
                  const amount = amountRaw && String(amountRaw).trim() ? Number(amountRaw) : undefined
                  const stage = String(fd.get('stage')||'').trim() || undefined
                  const closeDateRaw = String(fd.get('closeDate')||'').trim() || undefined
                  const forecastedCloseDateRaw = String(fd.get('forecastedCloseDate')||'').trim() || undefined
                  const accSel = String(fd.get('accountId')||'').trim() || undefined
                  const campaignSel = String(fd.get('marketingCampaignId')||'').trim() || undefined
                  const ownerIdRaw = String(fd.get('ownerId')||'').trim() || undefined
                  const payload: any = { _id: editing._id }
                  if (title) payload.title = title
                  if (amount !== undefined && !isNaN(amount)) payload.amount = amount
                  if (stage) payload.stage = stage
                  if (closeDateRaw) payload.closeDate = closeDateRaw
                  if (forecastedCloseDateRaw) payload.forecastedCloseDate = forecastedCloseDateRaw
                  if (accSel) payload.accountId = accSel
                  if (campaignSel) payload.marketingCampaignId = campaignSel
                  else if (campaignSel === undefined && editing.marketingCampaignId) payload.marketingCampaignId = ''
                  if (ownerIdRaw) payload.ownerId = ownerIdRaw
                  update.mutate(payload)
                  setEditing(null)
                }}
              >
                <input name="title" defaultValue={editing.title ?? ''} placeholder="Title" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="amount" type="number" defaultValue={editing.amount as any} placeholder="Amount" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <select name="stage" defaultValue={editing.stage ?? ''} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                  <option>Draft / Deal Created</option>
                  <option>Submitted for Review</option>
                  <option>Initial Validation</option>
                  <option>Manager Approval</option>
                  <option>Finance Approval</option>
                  <option>Legal Review</option>
                  <option>Executive Approval</option>
                  <option>Approved / Ready for Signature</option>
                  <option>Contract Signed / Closed Won</option>
                  <option>Rejected / Returned for Revision</option>
                </select>
                <select name="ownerId" defaultValue={editing.ownerId ?? ''} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                  <option value="">Owner (optional)</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>{u.name} ({u.email})</option>
                  ))}
                </select>
                <div className="col-span-full grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-[color:var(--color-text-muted)] mb-1">Forecasted Close Date</label>
                    <input name="forecastedCloseDate" type="date" defaultValue={editing.forecastedCloseDate ? editing.forecastedCloseDate.slice(0,10) : ''} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    <p className="text-[10px] text-[color:var(--color-text-muted)] mt-1">Expected close date (for forecasting)</p>
                  </div>
                  <div>
                    <label className="block text-xs text-[color:var(--color-text-muted)] mb-1">Actual Close Date</label>
                    <input name="closeDate" type="date" defaultValue={editing.closeDate ? editing.closeDate.slice(0,10) : ''} className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                    <p className="text-[10px] text-[color:var(--color-text-muted)] mt-1">Actual date when deal closed</p>
                  </div>
                </div>
                <label className="col-span-full text-sm">Account
                  <select name="accountId" className="ml-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                    <option value="">(no change)</option>
                    {(accountsQ.data?.data.items ?? []).map((a) => (
                      <option key={a._id} value={a._id}>{(a.accountNumber ?? '-')} - {a.name ?? 'Account'}</option>
                    ))}
                  </select>
                </label>
                <div className="col-span-full mt-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Renewals &amp; Subscriptions</div>
                    <button
                      type="button"
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                      onClick={() => {
                        const accId = (editing as any).accountId
                        if (!accId) {
                          toast.showToast('No account is linked to this deal yet.', 'error')
                          return
                        }
                        window.location.href = `/apps/crm/renewals?accountId=${encodeURIComponent(accId)}`
                      }}
                    >
                      Open renewals for this account
                    </button>
                  </div>
                  <div className="col-span-full mt-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">Projects &amp; Delivery</div>
                      <button
                        type="button"
                        className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                        onClick={() => {
                          if (!editing?._id) return
                          window.location.href = `/apps/crm/projects?dealId=${encodeURIComponent(editing._id)}`
                        }}
                      >
                        Open projects
                      </button>
                    </div>
                    <div className="text-[11px] text-[color:var(--color-text-muted)]">
                      Projects and delivery work tied directly to this deal.
                    </div>
                    {dealProjectsForDrawer?.data.items?.length ? (
                      <>
                        {(() => {
                          const rows = dealProjectsForDrawer.data.items
                          const total = rows.length
                          const active = rows.filter((p) =>
                            ['not_started', 'in_progress', 'on_hold'].includes(p.status),
                          ).length
                          const completed = rows.filter((p) => p.status === 'completed').length
                          const atRisk = rows.filter((p) => p.health === 'at_risk').length
                          const offTrack = rows.filter((p) => p.health === 'off_track').length
                          const riskCount = atRisk + offTrack
                          return (
                            <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
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
                          <div className="font-semibold">Linked projects</div>
                          <ul className="space-y-1">
                            {dealProjectsForDrawer.data.items.slice(0, 3).map((p) => (
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
                    ) : (
                      <div className="text-[11px] text-[color:var(--color-text-muted)]">
                        No projects currently linked to this deal.
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-[color:var(--color-text-muted)]">
                    View renewals tied to this deal&apos;s account in the Renewals app.
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
                                  const accId = (editing as any).accountId
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
                      Once this deal is moved to Closed Won, BOAZ will auto-create a renewal record.
                    </div>
                  )}
                </div>
                {/* Surveys & Feedback */}
                <div className="col-span-full mt-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 space-y-3">
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
                          accountId: editing.accountId,
                          dealId: editing._id,
                        })
                      }}
                    >
                      {sendSurveyEmail.isPending ? 'Sending…' : 'Send survey email for deal'}
                    </button>
                  </div>
                </div>
                <div className="col-span-full flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    name="approver"
                    id="deal-approver-select"
                    defaultValue={editing.approver ?? ''}
                    className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
                  >
                    <option value="">Select Manager (Approver)</option>
                    {managers.map((manager) => (
                      <option key={manager.id} value={manager.email}>
                        {manager.name ? `${manager.name} (${manager.email})` : manager.email}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      const select = document.getElementById('deal-approver-select') as HTMLSelectElement | null
                      const approverEmail = select?.value || editing.approver
                      if (!approverEmail) {
                        toast.showToast('Please select an approver first', 'warning')
                        return
                      }
                      const confirmed = await confirm(`Send approval request to ${approverEmail}?`)
                      if (!confirmed) return

                      // Save approver if changed
                      if (editing.approver !== approverEmail) {
                        try {
                          await update.mutateAsync({ _id: editing._id, approver: approverEmail } as any)
                        } catch {
                          toast.showToast('Failed to save approver. Please try again.', 'error')
                          return
                        }
                      }

                      requestApproval.mutate(editing._id)
                    }}
                    disabled={requestApproval.isPending || update.isPending || managers.length === 0}
                    className="mt-2 flex items-center gap-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 sm:mt-0"
                    title={managers.length === 0 ? 'No managers available' : 'Send approval request to manager'}
                  >
                    Request Approval
                  </button>
                </div>
                <label className="col-span-full text-sm">Marketing Campaign (for ROI attribution)
                  <select name="marketingCampaignId" defaultValue={editing.marketingCampaignId ?? ''} className="ml-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                    <option value="">None</option>
                    {((campaignsQ?.data?.items ?? []) as any[]).map((c) => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <div className="col-span-full mt-2 flex items-center justify-end gap-2">
                  <button type="button" className="mr-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm text-red-600 hover:bg-[color:var(--color-muted)]" onClick={() => { if (editing?._id) http.delete(`/api/crm/deals/${editing._id}`).then(() => { qc.invalidateQueries({ queryKey: ['deals'] }); qc.invalidateQueries({ queryKey: ['deal-history'] }); setEditing(null) }) }}>Delete</button>
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setShowHistory((v) => !v)}>{showHistory ? 'Hide history' : 'View history'}</button>
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
                </div>
                {showHistory && historyQ.data && (
                  <div className="col-span-full mt-3">
                    <AuditTrail
                      entries={(historyQ.data.data.history || []).map((entry): AuditEntry => ({
                        timestamp: entry.createdAt,
                        action: entry.eventType,
                        userName: entry.userName,
                        userEmail: entry.userEmail,
                        description: entry.description,
                        oldValue: entry.oldValue,
                        newValue: entry.newValue,
                      }))}
                      title="Deal History"
                      emptyMessage="No history available for this deal."
                    />
                  </div>
                )}
                <div className="col-span-full mt-4 pt-4 border-t">
                  <DocumentsList
                    relatedToType="deal"
                    relatedToId={editing._id}
                    relatedToName={editing.title}
                    compact={true}
                  />
                </div>
                <div className="col-span-full mt-4">
                  <RelatedTasks relatedType="deal" relatedId={editing._id} />
                </div>
          </form>
        )}
      </Modal>
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


