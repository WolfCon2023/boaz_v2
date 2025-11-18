import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'
import { DocumentsList } from '@/components/DocumentsList'

type Account = { _id: string; accountNumber?: number; name?: string; companyName?: string; primaryContactName?: string; primaryContactEmail?: string; primaryContactPhone?: string }

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
  const [query, setQuery] = React.useState('')
  const [sort, setSort] = React.useState<'name'|'companyName'|'accountNumber'>('name')
  const [dir, setDir] = React.useState<'asc'|'desc'>('asc')
  type ColumnDef = { key: string; visible: boolean; label: string }
  const defaultCols: ColumnDef[] = [
    { key: 'accountNumber', visible: true, label: 'Account #' },
    { key: 'name', visible: true, label: 'Name' },
    { key: 'companyName', visible: true, label: 'Company' },
    { key: 'primaryContactName', visible: true, label: 'Primary contact' },
    { key: 'primaryContactEmail', visible: true, label: 'Email' },
    { key: 'primaryContactPhone', visible: true, label: 'Phone' },
    { key: 'surveyStatus', visible: true, label: 'Survey' },
  ]
  function ensureSurveyCol(cols: ColumnDef[]): ColumnDef[] {
    if (!cols.some((c) => c.key === 'surveyStatus')) {
      return [...cols, { key: 'surveyStatus', visible: true, label: 'Survey' }]
    }
    return cols
  }
  const [cols, setCols] = React.useState<ColumnDef[]>(ensureSurveyCol(defaultCols))
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

  // Initialize from URL and localStorage once
  React.useEffect(() => {
    if (initializedFromUrl.current) return
    initializedFromUrl.current = true
    const get = (key: string) => searchParams.get(key) || ''
    const q0 = get('q')
    const sort0 = (get('sort') as any) || 'name'
    const dir0 = (get('dir') as any) || 'asc'
    if (q0) setQuery(q0)
    setSort(sort0)
    setDir(dir0)
    try {
      const stored = localStorage.getItem('ACCOUNTS_COLS')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) setCols(ensureSurveyCol(parsed))
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
    if (c.cols) setCols(c.cols)
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

  function getColValue(a: Account, key: string) {
    if (key === 'accountNumber') return a.accountNumber ?? '-'
    if (key === 'name') return a.name ?? '-'
    if (key === 'companyName') return a.companyName ?? '-'
    if (key === 'primaryContactName') return a.primaryContactName ?? '-'
    if (key === 'primaryContactEmail') return a.primaryContactEmail ?? '-'
    if (key === 'primaryContactPhone') return a.primaryContactPhone ?? '-'
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
  const historyQ = useQuery({
    queryKey: ['account-history', editing?._id, showHistory],
    enabled: Boolean(editing?._id && showHistory),
    queryFn: async () => {
      const res = await http.get(`/api/crm/accounts/${editing?._id}/history`)
      return res.data as { data: { createdAt: string; deals: any[]; quotes: any[]; invoices: any[]; activities: any[] } }
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
      <h1 className="text-xl font-semibold">Accounts</h1>
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
                  className={`px-4 py-2 cursor-move ${draggedCol === col.key ? 'opacity-50' : ''}`}
                  title="Drag to reorder"
                >{col.label}</th>
              ))}
              <th className="px-4 py-2">Actions</th>
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


