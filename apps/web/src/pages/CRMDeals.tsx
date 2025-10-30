import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'

type Deal = { _id: string; dealNumber?: number; title?: string; amount?: number; stage?: string; closeDate?: string; accountId?: string; accountNumber?: number; marketingCampaignId?: string }
type AccountPick = { _id: string; accountNumber?: number; name?: string }

export default function CRMDeals() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const defaultCols: ColumnDef[] = [
    { key: 'dealNumber', visible: true, label: 'Deal #' },
    { key: 'account', visible: true, label: 'Account' },
    { key: 'title', visible: true, label: 'Title' },
    { key: 'amount', visible: true, label: 'Amount' },
    { key: 'stage', visible: true, label: 'Stage' },
    { key: 'closeDate', visible: true, label: 'Close date' },
  ]
  const [showColsMenu, setShowColsMenu] = React.useState(false)
  const [cols, setCols] = React.useState<ColumnDef[]>(defaultCols)
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
          setCols(parsed)
        }
      }
    } catch {}
    const colsParam = get('cols')
    if (colsParam) {
      const keys = new Set(colsParam.split(',').map((s) => s.trim()).filter(Boolean))
      setCols(defaultCols.map((c) => ({ ...c, visible: keys.has(c.key) })))
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
      return res.data as { data: { items: Deal[]; total: number; page: number; limit: number } }
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
  const { data: campaignsQ } = useQuery({
    queryKey: ['mkt-campaigns'],
    queryFn: async () => (await http.get('/api/marketing/campaigns')).data as { data: { items: { _id: string; name: string }[] } },
  })
  const accounts = accountsQ.data?.data.items ?? []
  const acctById = React.useMemo(() => new Map(accounts.map((a) => [a._id, a])), [accounts])
  const create = useMutation({
    mutationFn: async (payload: { title: string; accountId: string; amount?: number; stage?: string; closeDate?: string }) => {
      const res = await http.post('/api/crm/deals', payload)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  })
  const update = useMutation({
    mutationFn: async (payload: Partial<Deal> & { _id: string } & { accountId?: string; accountNumber?: number }) => {
      const { _id, ...rest } = payload as any
      const res = await http.put(`/api/crm/deals/${_id}`, rest)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
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
    setInlineEditId(d._id)
    setInlineTitle(d.title ?? '')
    setInlineAmount(typeof d.amount === 'number' ? String(d.amount) : '')
    setInlineStage(d.stage ?? '')
    setInlineCloseDate(d.closeDate ? d.closeDate.slice(0,10) : '')
  }
  async function saveInlineEdit() {
    if (!inlineEditId) return
    const payload: any = { _id: inlineEditId }
    payload.title = inlineTitle || undefined
    payload.stage = inlineStage || undefined
    payload.closeDate = inlineCloseDate || undefined
    if (inlineAmount.trim() !== '') {
      const n = Number(inlineAmount)
      if (Number.isFinite(n)) payload.amount = n
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

  const [editing, setEditing] = React.useState<Deal | null>(null)
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)

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
    if (c.cols) setCols(c.cols)
    if (c.pageSize) setPageSize(c.pageSize)
    setPage(0)
  }
  async function deleteView(id: string) { try { await http.delete(`/api/views/${id}`) } catch {}; setSavedViews((prev) => prev.filter((v) => v.id !== id)) }
  function copyShareLink() {
    const url = window.location.origin + window.location.pathname + '?' + searchParams.toString()
    navigator.clipboard?.writeText(url).then(() => alert('Link copied')).catch(() => alert('Failed to copy'))
  }
  function getColValue(d: Deal, key: string) {
    if (key === 'dealNumber') return d.dealNumber ?? ''
    if (key === 'account') {
      const a = (d.accountId && acctById.get(d.accountId)) || accounts.find((x) => x.accountNumber === d.accountNumber)
      return a ? `${a.accountNumber ?? '—'} — ${a.name ?? 'Account'}` : (d.accountNumber ?? '—')
    }
    if (key === 'title') return d.title ?? ''
    if (key === 'amount') return typeof d.amount === 'number' ? `$${d.amount.toLocaleString()}` : '-'
    if (key === 'stage') return d.stage ?? '-'
    if (key === 'closeDate') return d.closeDate ? new Date(d.closeDate).toLocaleDateString() : '-'
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

  React.useEffect(() => {
    if (!editing) return
    const el = document.createElement('div')
    el.setAttribute('data-overlay', 'deal-editor')
    Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' })
    document.body.appendChild(el)
    setPortalEl(el)
    return () => { try { document.body.removeChild(el) } catch {}; setPortalEl(null) }
  }, [editing])

  return (
    <div className="space-y-4">
      <CRMNav />
      <h1 className="text-xl font-semibold">Deals</h1>
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
                  return a ? `${a.accountNumber ?? '—'} — ${a.name ?? 'Account'}` : (d.accountNumber ?? '—')
                }
                if (col.key === 'title') return d.title ?? ''
                if (col.key === 'amount') return typeof d.amount === 'number' ? d.amount : ''
                if (col.key === 'stage') return d.stage ?? ''
                if (col.key === 'closeDate') return d.closeDate ? new Date(d.closeDate).toISOString().slice(0,10) : ''
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
        <form className="flex flex-wrap gap-2 p-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const title = String(fd.get('title')||''); const accNumStr = String(fd.get('accountNumber')||''); const accNum = accNumStr ? Number(accNumStr) : undefined; const amount = fd.get('amount') ? Number(fd.get('amount')) : undefined; const stage = String(fd.get('stage')||'')|| undefined; const closeDate = String(fd.get('closeDate')||'')|| undefined; const campaignSel = String(fd.get('marketingCampaignId')||''); const acc = (accountsQ.data?.data.items ?? []).find(a => a.accountNumber === accNum); const payload: any = { title, amount, stage, closeDate }; if (acc?._id) payload.accountId = acc._id; else if (typeof accNum === 'number' && Number.isFinite(accNum)) payload.accountNumber = accNum; if (campaignSel) payload.marketingCampaignId = campaignSel; create.mutate(payload); (e.currentTarget as HTMLFormElement).reset() }}>
          <input name="title" required placeholder="Title" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <select name="accountNumber" required className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">Select account</option>
            {(accountsQ.data?.data.items ?? []).filter((a) => typeof a.accountNumber === 'number').map((a) => (
              <option key={a._id} value={a.accountNumber ?? ''}>
                {(a.accountNumber ?? '—')} — {a.name ?? 'Account'}
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
          <input name="closeDate" type="date" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <select name="marketingCampaignId" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">Campaign (optional)</option>
            {((campaignsQ?.data?.items ?? []) as any[]).map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Add deal</button>
        </form>
        <table className="w-full text-sm">
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
                      <button className="rounded-lg border px-2 py-1 text-xs" onClick={() => setEditing(d)}>Open</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      {editing && portalEl && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,40rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Edit deal</div>
              <form
                className="grid gap-2 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  const title = String(fd.get('title')||'') || undefined
                  const amount = fd.get('amount') ? Number(fd.get('amount')) : undefined
                  const stage = String(fd.get('stage')||'') || undefined
                  const closeDateRaw = String(fd.get('closeDate')||'') || undefined
                  const accSel = String(fd.get('accountId')||'')
                  const campaignSel = String(fd.get('marketingCampaignId')||'')
                  const payload: any = { _id: editing._id, title, amount, stage }
                  if (closeDateRaw) payload.closeDate = closeDateRaw
                  if (accSel) payload.accountId = accSel
                  if (campaignSel) payload.marketingCampaignId = campaignSel
                  else if (campaignSel === '') payload.marketingCampaignId = ''
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
                <input name="closeDate" type="date" defaultValue={editing.closeDate ? editing.closeDate.slice(0,10) : ''} className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <label className="col-span-full text-sm">Account
                  <select name="accountId" className="ml-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                    <option value="">(no change)</option>
                    {(accountsQ.data?.data.items ?? []).map((a) => (
                      <option key={a._id} value={a._id}>{(a.accountNumber ?? '—')} — {a.name ?? 'Account'}</option>
                    ))}
                  </select>
                </label>
                <label className="col-span-full text-sm">Marketing Campaign (for ROI attribution)
                  <select name="marketingCampaignId" defaultValue={editing.marketingCampaignId ?? ''} className="ml-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                    <option value="">None</option>
                    {((campaignsQ?.data?.items ?? []) as any[]).map((c) => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <div className="col-span-full mt-2 flex items-center justify-end gap-2">
                  <button type="button" className="mr-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm text-red-600 hover:bg-[color:var(--color-muted)]" onClick={() => { if (editing?._id) http.delete(`/api/crm/deals/${editing._id}`).then(() => { qc.invalidateQueries({ queryKey: ['deals'] }); setEditing(null) }) }}>Delete</button>
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
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


