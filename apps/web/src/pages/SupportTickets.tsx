import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'

type Ticket = {
  _id: string
  ticketNumber?: number
  title?: string
  shortDescription?: string
  description?: string
  status?: 'open' | 'pending' | 'resolved' | 'closed' | 'canceled'
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  accountId?: string | null
  contactId?: string | null
  assignee?: string | null
  slaDueAt?: string | null
  createdAt?: string
  updatedAt?: string
  comments?: { author?: string; body?: string; at?: string }[]
}

type SurveyProgramPick = {
  _id: string
  name: string
  type: 'NPS' | 'CSAT' | 'Post‑interaction'
}

export default function SupportTickets() {
  const qc = useQueryClient()
  const toast = useToast()
  const location = useLocation()
  const createFormRef = React.useRef<HTMLFormElement | null>(null)
  type ColumnDef = { key: string; visible: boolean; label: string }
  const defaultCols: ColumnDef[] = [
    { key: 'ticketNumber', visible: true, label: 'Ticket #' },
    { key: 'shortDescription', visible: true, label: 'Short description' },
    { key: 'status', visible: true, label: 'Status' },
    { key: 'priority', visible: true, label: 'Priority' },
    { key: 'assignee', visible: true, label: 'Assignee' },
    { key: 'slaDueAt', visible: true, label: 'SLA Due' },
    { key: 'updatedAt', visible: true, label: 'Updated' },
  ]
  const [cols, setCols] = React.useState<ColumnDef[]>(defaultCols)
  const [savedViews, setSavedViews] = React.useState<Array<{ id: string; name: string; config: any }>>([])
  const [showSaveViewDialog, setShowSaveViewDialog] = React.useState(false)
  const [savingViewName, setSavingViewName] = React.useState('')
  const [showColsMenu, setShowColsMenu] = React.useState(false)
  const [draggedCol, setDraggedCol] = React.useState<string | null>(null)
  const initializedFromUrl = React.useRef(false)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [priority, setPriority] = React.useState('')
  const [sort, setSort] = React.useState<'createdAt'|'updatedAt'|'ticketNumber'|'priority'|'status'|'slaDueAt'>('createdAt')
  const [dir, setDir] = React.useState<'asc'|'desc'>('desc')
  const [statusMulti, setStatusMulti] = React.useState<string[]>([])
  const [breachedOnly, setBreachedOnly] = React.useState(false)
  const [dueNext60, setDueNext60] = React.useState(false)
  const { data, isFetching } = useQuery({
    queryKey: ['support-tickets', q, status, statusMulti.join(','), priority, sort, dir, breachedOnly, dueNext60],
    queryFn: async () => {
      const params: any = { q, status, priority, sort, dir }
      if (breachedOnly) params.breached = 1
      if (dueNext60) params.dueWithin = 60
      if (statusMulti.length > 0) params.statuses = statusMulti.join(',')
      const res = await http.get('/api/crm/support/tickets', { params })
      return res.data as { data: { items: Ticket[] } }
    },
  })
  const items = data?.data.items ?? []

  const { data: surveyProgramsData } = useQuery({
    queryKey: ['surveys-programs-support'],
    queryFn: async () => {
      const res = await http.get('/api/crm/surveys/programs', {})
      return res.data as { data: { items: SurveyProgramPick[] } }
    },
  })
  const surveyPrograms = React.useMemo(
    () =>
      (surveyProgramsData?.data.items ?? []).filter(
        (p) => p.type === 'CSAT' || p.type === 'Post‑interaction',
      ),
    [surveyProgramsData?.data.items],
  )
  // Sync filters from URL query params
  React.useEffect(() => {
    if (!initializedFromUrl.current) {
      try { const stored = localStorage.getItem('TICKETS_COLS'); if (stored) { const parsed = JSON.parse(stored); if (Array.isArray(parsed) && parsed.length>0) setCols(parsed) } } catch {}
      try { const views = localStorage.getItem('TICKETS_SAVED_VIEWS'); if (views) { const parsed = JSON.parse(views); if (Array.isArray(parsed)) setSavedViews(parsed) } } catch {}
      initializedFromUrl.current = true
    }
    const sp = new URLSearchParams(location.search)
    const qParam = sp.get('q') ?? ''
    const statuses = sp.get('statuses') ?? ''
    const breached = sp.get('breached') === '1'
    const dueWithin = sp.get('dueWithin')
    const sortParam = (sp.get('sort') as any) || ''
    const dirParam = (sp.get('dir') as any) || ''
    setQ(qParam)
    if (statuses) {
      setStatus('')
      setStatusMulti(statuses.split(',').map((s) => s.trim()).filter(Boolean))
    } else {
      setStatusMulti([])
    }
    setBreachedOnly(breached)
    setDueNext60(!!dueWithin)
    if (sortParam) setSort(sortParam)
    if (dirParam) setDir(dirParam)
    // Load server views (global)
    ;(async () => {
      try {
        const res = await http.get('/api/views', { params: { viewKey: 'tickets' } })
        const items = (res.data?.data?.items ?? []).map((v: any) => ({ id: String(v._id), name: v.name, config: v.config }))
        if (Array.isArray(items)) setSavedViews(items)
        if (items.length === 0) {
          // Seed sensible defaults
          const seeds = [
            { name: 'Open', config: { status: '', statusMulti: ['open','pending'], breachedOnly: false, dueNext60: false, sort: 'createdAt', dir: 'desc' } },
            { name: 'Breached SLA', config: { status: '', statusMulti: ['open','pending'], breachedOnly: true, dueNext60: false, sort: 'slaDueAt', dir: 'asc' } },
            { name: 'Due next 60m', config: { status: '', statusMulti: ['open','pending'], breachedOnly: false, dueNext60: true, sort: 'slaDueAt', dir: 'asc' } },
          ]
          for (const s of seeds) {
            try { await http.post('/api/views', { viewKey: 'tickets', name: s.name, config: s.config }) } catch {}
          }
          try {
            const res2 = await http.get('/api/views', { params: { viewKey: 'tickets' } })
            const items2 = (res2.data?.data?.items ?? []).map((v: any) => ({ id: String(v._id), name: v.name, config: v.config }))
            if (Array.isArray(items2)) setSavedViews(items2)
          } catch {}
        }
      } catch {}
    })()
  }, [location.search])
  React.useEffect(() => { try { localStorage.setItem('TICKETS_COLS', JSON.stringify(cols)) } catch {}; try { localStorage.setItem('TICKETS_SAVED_VIEWS', JSON.stringify(savedViews)) } catch {} }, [cols, savedViews])
  // Heartbeat to keep SLA view in sync with system time
  const [nowTs, setNowTs] = React.useState(() => Date.now())
  React.useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 60_000) // update every minute
    return () => clearInterval(id)
  }, [])
  // Fallback client-side metrics so the UI works even if the API route isn't deployed yet
  const computedMetrics = React.useMemo(() => {
    const now = nowTs
    const next60 = now + 60 * 60 * 1000
    const isOpen = (s?: string) => s === 'open' || s === 'pending'
    const open = items.filter((t) => isOpen(t.status)).length
    const breached = items.filter((t) => isOpen(t.status) && t.slaDueAt && new Date(t.slaDueAt).getTime() < now).length
    const dueNext60 = items.filter((t) => isOpen(t.status) && t.slaDueAt) 
      .filter((t) => { const d = new Date(t.slaDueAt as string).getTime(); return d >= now && d <= next60 })
      .length
    return { open, breached, dueNext60 }
  }, [items, nowTs])

  const create = useMutation({
    mutationFn: async (payload: any) => { const res = await http.post('/api/crm/support/tickets', payload); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-tickets'] }),
  })
  const update = useMutation({
    mutationFn: async (payload: any) => { const { _id, ...rest } = payload; const res = await http.put(`/api/crm/support/tickets/${_id}`, rest); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-tickets'] }),
  })
  const addComment = useMutation({
    mutationFn: async (payload: { _id: string, body: string }) => { const res = await http.post(`/api/crm/support/tickets/${payload._id}/comments`, { body: payload.body }); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-tickets'] }),
  })

  const logSurvey = useMutation({
    mutationFn: async (payload: {
      programId: string
      score: number
      comment?: string
      ticketId: string
      accountId?: string | null
      contactId?: string | null
    }) => {
      const { programId, ...rest } = payload
      const res = await http.post(`/api/crm/surveys/programs/${programId}/responses`, rest)
      return res.data
    },
    onSuccess: () => {
      toast.showToast('Survey response recorded', 'success')
    },
    onError: () => {
      toast.showToast('Failed to record survey response', 'error')
    },
  })

  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(10)
  React.useEffect(() => { setPage(0) }, [q, status, statusMulti.join(','), priority, sort, dir, pageSize, breachedOnly, dueNext60])
  const filteredItems = React.useMemo(() => {
    let arr = items.slice()
    if (statusMulti.length > 0) arr = arr.filter((t) => statusMulti.includes(String(t.status)))
    if (breachedOnly) {
      arr = arr.filter((t) => !!t.slaDueAt && new Date(t.slaDueAt).getTime() < nowTs)
    } else if (dueNext60) {
      const until = nowTs + 60 * 60 * 1000
      arr = arr.filter((t) => {
        if (!t.slaDueAt) return false
        const ts = new Date(t.slaDueAt).getTime()
        return ts >= nowTs && ts <= until
      })
    }
    if (sort === 'slaDueAt') {
      arr.sort((a, b) => {
        const aTs = a.slaDueAt ? new Date(a.slaDueAt).getTime() : Number.POSITIVE_INFINITY
        const bTs = b.slaDueAt ? new Date(b.slaDueAt).getTime() : Number.POSITIVE_INFINITY
        return (dir === 'asc' ? 1 : -1) * (aTs - bTs)
      })
    }
    return arr
  }, [items, statusMulti, breachedOnly, dueNext60, nowTs, sort, dir])
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const pageItems = React.useMemo(() => filteredItems.slice(page * pageSize, page * pageSize + pageSize), [filteredItems, page, pageSize])
  async function saveCurrentView() {
    const viewConfig = { q, status, statusMulti, priority, sort, dir, breachedOnly, dueNext60, cols }
    const name = savingViewName || `View ${savedViews.length + 1}`
    try {
      const res = await http.post('/api/views', { viewKey: 'tickets', name, config: viewConfig })
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
    if (Array.isArray(c.statusMulti)) { setStatus(''); setStatusMulti(c.statusMulti) } else if (c.status !== undefined) setStatus(c.status)
    if (c.priority !== undefined) setPriority(c.priority)
    if (c.sort) setSort(c.sort)
    if (c.dir) setDir(c.dir)
    setBreachedOnly(!!c.breachedOnly)
    setDueNext60(!!c.dueNext60)
    if (c.cols) setCols(c.cols)
    setPage(0)
  }
  async function deleteView(id: string) {
    try { await http.delete(`/api/views/${id}`) } catch {}
    setSavedViews((prev) => prev.filter((v) => v.id !== id))
  }
  function copyShareLink() { const url = window.location.origin + window.location.pathname + window.location.search; navigator.clipboard?.writeText(url) }
  function getColValue(t: Ticket, key: string) {
    if (key==='ticketNumber') return t.ticketNumber ?? '-'
    if (key==='shortDescription') return t.shortDescription ?? t.title ?? '-'
    if (key==='status') return t.status ?? '-'
    if (key==='priority') return t.priority ?? '-'
    if (key==='assignee') return t.assignee ?? '-'
    if (key==='slaDueAt') return t.slaDueAt ? formatDateTime(t.slaDueAt) : '-'
    if (key==='updatedAt') return t.updatedAt ? formatDateTime(t.updatedAt) : '-'
    return ''
  }
  function handleDragStart(key: string) { setDraggedCol(key) }
  function handleDrop(targetKey: string) {
    if (!draggedCol || draggedCol===targetKey) return
    const from = cols.findIndex((c)=> c.key===draggedCol)
    const to = cols.findIndex((c)=> c.key===targetKey)
    if (from<0 || to<0) return
    const next = [...cols]
    const [m] = next.splice(from,1)
    next.splice(to,0,m)
    setCols(next)
    setDraggedCol(null)
  }
  React.useEffect(() => {
    if (!showColsMenu) return
    function onDoc(e: MouseEvent) { const t = e.target as HTMLElement; if (!t.closest('[data-cols-menu]')) setShowColsMenu(false) }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [showColsMenu])

  function exportCsv() {
    const rows = filteredItems.map((t) => ({
      ticketNumber: t.ticketNumber ?? '',
      shortDescription: t.shortDescription ?? t.title ?? '',
      description: t.description ?? '',
      status: t.status ?? '',
      priority: t.priority ?? '',
      assignee: t.assignee ?? '',
      accountId: t.accountId ?? '',
      contactId: t.contactId ?? '',
      commentsCount: Array.isArray(t.comments) ? String(t.comments.length) : '0',
      slaDueAt: t.slaDueAt ? new Date(t.slaDueAt).toISOString() : '',
      createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : '',
      updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : '',
    }))
    const headers = [
      'ticketNumber',
      'shortDescription',
      'description',
      'status',
      'priority',
      'assignee',
      'accountId',
      'contactId',
      'commentsCount',
      'slaDueAt',
      'createdAt',
      'updatedAt',
    ]
    const escape = (v: any) => {
      const s = String(v ?? '')
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
      return s
    }
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape((r as any)[h])).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tickets_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(filteredItems, null, 2)], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tickets_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function copyToClipboard() {
    try {
      const text = JSON.stringify(filteredItems, null, 2)
      await navigator.clipboard.writeText(text)
      // Optional: simple visual feedback
      toast.showToast('Copied current filtered tickets to clipboard', 'success')
    } catch {
      // Fallback
      const textArea = document.createElement('textarea')
      textArea.value = JSON.stringify(filteredItems, null, 2)
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      toast.showToast('Copied current filtered tickets to clipboard', 'success')
    }
  }

  const [editing, setEditing] = React.useState<Ticket | null>(null)
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => { if (!editing) return; const el = document.createElement('div'); el.setAttribute('data-overlay', 'ticket-editor'); Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' }); document.body.appendChild(el); setPortalEl(el); return () => { try { document.body.removeChild(el) } catch {}; setPortalEl(null) } }, [editing])

  const [surveyProgramId, setSurveyProgramId] = React.useState('')
  const [surveyScore, setSurveyScore] = React.useState('')
  const [surveyComment, setSurveyComment] = React.useState('')
  React.useEffect(() => {
    if (!editing) {
      setSurveyProgramId('')
      setSurveyScore('')
      setSurveyComment('')
    }
  }, [editing])

  // Inline SLA due date/time picker
  const [slaEditing, setSlaEditing] = React.useState<Ticket | null>(null)
  const [slaPortal, setSlaPortal] = React.useState<HTMLElement | null>(null)
  const [slaValue, setSlaValue] = React.useState('')
  React.useEffect(() => {
    if (!slaEditing) return
    const el = document.createElement('div')
    el.setAttribute('data-overlay', 'ticket-sla')
    Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' })
    document.body.appendChild(el)
    setSlaPortal(el)
    setSlaValue(slaEditing.slaDueAt ? slaEditing.slaDueAt.slice(0, 16) : '')
    return () => { try { document.body.removeChild(el) } catch {}; setSlaPortal(null) }
  }, [slaEditing])

  // Create-form SLA modal picker
  const [createSlaOpen, setCreateSlaOpen] = React.useState(false)
  const [createSlaPortal, setCreateSlaPortal] = React.useState<HTMLElement | null>(null)
  const [createSlaValue, setCreateSlaValue] = React.useState('')
  React.useEffect(() => {
    if (!createSlaOpen) return
    const el = document.createElement('div')
    el.setAttribute('data-overlay', 'ticket-sla-create')
    Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' })
    document.body.appendChild(el)
    setCreateSlaPortal(el)
    return () => { try { document.body.removeChild(el) } catch {}; setCreateSlaPortal(null) }
  }, [createSlaOpen])

  return (
    <div className="space-y-4">
      <CRMNav />
      <h1 className="text-xl font-semibold">Support Tickets</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tickets..." className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button type="button" onClick={() => { setQ(''); setStatus(''); setStatusMulti([]); setPriority(''); setBreachedOnly(false); setDueNext60(false); setSort('createdAt'); setDir('desc'); setPage(0) }} disabled={!q && !status && statusMulti.length===0 && !priority && !breachedOnly && !dueNext60 && sort==='createdAt' && dir==='desc'} className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50">Reset</button>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">All status</option>
            <option value="open">open</option>
            <option value="pending">pending</option>
            <option value="resolved">resolved</option>
            <option value="closed">closed</option>
            <option value="canceled">canceled</option>
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">All priority</option>
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
            <option value="urgent">urgent</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="createdAt">Created</option>
            <option value="updatedAt">Updated</option>
            <option value="ticketNumber">Ticket #</option>
            <option value="priority">Priority</option>
            <option value="status">Status</option>
            <option value="slaDueAt">SLA Due</option>
          </select>
          <select value={dir} onChange={(e) => setDir(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
          {isFetching && <span className="text-xs text-[color:var(--color-text-muted)]">Loading...</span>}
          <div className="relative ml-auto" data-cols-menu>
            <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setShowColsMenu((v)=> !v)}>Columns</button>
            {showColsMenu && (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-2 shadow space-y-1">
                <div className="text-xs text-[color:var(--color-text-muted)] pb-1 border-b">Drag to reorder</div>
                {cols.map((col)=> (
                  <div key={col.key} draggable onDragStart={()=>handleDragStart(col.key)} onDragOver={(e)=>{e.preventDefault()}} onDrop={()=>handleDrop(col.key)} className={`flex items-center gap-2 p-1 text-sm cursor-move rounded ${draggedCol===col.key ? 'opacity-50 bg-[color:var(--color-muted)]' : 'hover:bg-[color:var(--color-muted)]'}`}>
                    <span className="text-xs text-[color:var(--color-text-muted)]">≡</span>
                    <input type="checkbox" checked={col.visible} onChange={(e)=> setCols(cols.map((c)=> c.key===col.key ? { ...c, visible: e.target.checked } : c))} onClick={(e)=> e.stopPropagation()} />
                    <span>{col.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowSaveViewDialog(true)} className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Save view</button>
            <select className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)]" onChange={(e)=> { const v = savedViews.find((x)=> x.id===e.target.value); if (v) loadView(v); e.currentTarget.value='' }}>
              <option value="">Saved views</option>
              {savedViews.map((v)=> (<option key={v.id} value={v.id}>{v.name}</option>))}
            </select>
            <button type="button" onClick={copyShareLink} className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Share link</button>
          </div>
          <div className="ml-2 flex items-center gap-2">
            <button type="button" onClick={exportCsv} className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Export CSV</button>
            <button type="button" onClick={exportJson} className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Export JSON</button>
            <button type="button" onClick={copyToClipboard} className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Copy</button>
          </div>
          <div className="ml-2 flex items-center gap-2">
            <button type="button" onClick={() => setBreachedOnly((v) => !v)} className={`rounded-full border px-3 py-1 text-xs ${breachedOnly ? 'bg-red-500/20 border-red-500 text-red-300' : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]'}`}>Breached</button>
            <button type="button" onClick={() => setDueNext60((v) => !v)} className={`rounded-full border px-3 py-1 text-xs ${dueNext60 ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300' : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]'}`}>Due 60m</button>
          </div>
        </div>
        {(
          <div className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-3">
            <button type="button" onClick={() => { setStatus(''); setStatusMulti(['open','pending']); setBreachedOnly(false); setDueNext60(false); setSort('createdAt'); setDir('desc') }} className="text-left rounded-lg border border-[color:var(--color-border)] p-3 hover:bg-[color:var(--color-muted)]"><div className="text-xs text-[color:var(--color-text-muted)]">Open</div><div className="text-xl font-semibold">{computedMetrics.open}</div></button>
            <button type="button" onClick={() => { setStatus(''); setStatusMulti(['open','pending']); setBreachedOnly(true); setDueNext60(false); setSort('slaDueAt'); setDir('asc') }} className="text-left rounded-lg border border-[color:var(--color-border)] p-3 hover:bg-[color:var(--color-muted)]"><div className="text-xs text-[color:var(--color-text-muted)]">Breached SLA</div><div className="text-xl font-semibold text-red-400">{computedMetrics.breached}</div></button>
            <button type="button" onClick={() => { setStatus(''); setStatusMulti(['open','pending']); setBreachedOnly(false); setDueNext60(true); setSort('slaDueAt'); setDir('asc') }} className="text-left rounded-lg border border-[color:var(--color-border)] p-3 hover:bg-[color:var(--color-muted)]"><div className="text-xs text-[color:var(--color-text-muted)]">Due next 60m</div><div className="text-xl font-semibold text-yellow-300">{computedMetrics.dueNext60}</div></button>
          </div>
        )}
        <form ref={createFormRef} className="grid items-start gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const shortDescription = String(fd.get('shortDescription')||''); const description = String(fd.get('description')||''); const assignee = String(fd.get('assignee')||''); const status = String(fd.get('status')||'') || 'open'; const priority = String(fd.get('priority')||'') || 'normal'; const rawSla = createSlaValue || String(fd.get('slaDueAt')||''); const slaDueAt = rawSla ? new Date(rawSla).toISOString() : undefined; create.mutate({ shortDescription, description, assignee, status, priority, slaDueAt }); (e.currentTarget as HTMLFormElement).reset(); setCreateSlaValue('') }}>
          <input name="shortDescription" required placeholder="Short description" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <select name="status" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold"><option>open</option><option>pending</option><option>resolved</option><option>closed</option><option>canceled</option></select>
          <input name="assignee" placeholder="Assignee" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] text-[color:var(--color-text)] px-3 py-2 text-sm" />
          
          <select name="priority" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold"><option>normal</option><option>low</option><option>high</option><option>urgent</option></select>
          <div className="flex items-center gap-2">
            <input name="slaDueAt" type="hidden" value={createSlaValue} readOnly />
            <div className="text-sm text-[color:var(--color-text-muted)]">
              {createSlaValue ? formatDateTime(createSlaValue) : 'SLA due (optional)'}
            </div>
            <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setCreateSlaOpen(true)}>Set</button>
          </div>
          <textarea name="description" placeholder="Description" maxLength={2500} className="sm:col-span-2 h-32 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <div className="flex items-center gap-2">
            <button className="inline-flex w-fit self-start justify-center rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Create ticket</button>
            <button type="button" className="inline-flex w-fit self-start justify-center rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => { createFormRef.current?.reset(); setCreateSlaValue('') }}>Clear</button>
          </div>
        </form>
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]"><tr>
            {cols.filter((c)=> c.visible).map((col)=> (
              <th key={col.key} draggable onDragStart={()=>handleDragStart(col.key)} onDragOver={(e)=>{e.preventDefault()}} onDrop={()=>handleDrop(col.key)} className={`px-4 py-2 cursor-move ${draggedCol===col.key ? 'opacity-50' : ''}`} title="Drag to reorder">{col.label}</th>
            ))}
          </tr></thead>
          <tbody>
            {pageItems.map((t) => {
              const isBreached = !!t.slaDueAt && new Date(t.slaDueAt).getTime() < nowTs && (t.status === 'open' || t.status === 'pending')
              return (
              <tr key={t._id} className={`border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)] cursor-pointer ${isBreached ? 'bg-red-500/10' : ''}`} onClick={() => setEditing(t)}>
                {cols.filter((c)=> c.visible).map((col)=> (
                  <td key={col.key} className={`px-4 py-2 ${col.key==='slaDueAt' ? 'flex items-center gap-2' : ''}`}>{
                    col.key==='slaDueAt'
                      ? (<><span>{getColValue(t, col.key)}</span><button type="button" className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-xs hover:bg-[color:var(--color-muted)]" onClick={(e)=>{ e.stopPropagation(); setSlaEditing(t) }}>Set</button></>)
                      : getColValue(t, col.key)
                  }</td>
                ))}
              </tr>
              )})}
          </tbody>
        </table>
        <div className="flex items-center justify-between p-4 text-sm">
          <div className="flex items-center gap-2">
            <span>Rows: {items.length}</span>
            <label className="ml-4 flex items-center gap-1">Page size
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1">
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
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
            <div className="w-[min(90vw,48rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Edit ticket</div>
              <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const payload: any = { _id: editing._id, shortDescription: String(fd.get('shortDescription')||'')||undefined, status: String(fd.get('status')||'')||undefined, priority: String(fd.get('priority')||'')||undefined, assignee: String(fd.get('assignee')||'')||undefined, description: String(fd.get('description')||'')||undefined }; const sla = String(fd.get('slaDueAt')||''); if (sla) payload.slaDueAt = new Date(sla).toISOString(); update.mutate(payload); setEditing(null) }}>
                <label className="text-xs text-[color:var(--color-text-muted)]">Short description</label>
                <input name="shortDescription" defaultValue={editing.shortDescription ?? editing.title ?? ''} placeholder="Short description" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <label className="text-xs text-[color:var(--color-text-muted)]">Status</label>
                <select name="status" defaultValue={editing.status ?? 'open'} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold"><option>open</option><option>pending</option><option>resolved</option><option>closed</option><option>canceled</option></select>
                <label className="text-xs text-[color:var(--color-text-muted)]">Priority</label>
                <select name="priority" defaultValue={editing.priority ?? 'normal'} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold"><option>low</option><option>normal</option><option>high</option><option>urgent</option></select>
                <label className="text-xs text-[color:var(--color-text-muted)]">Assignee</label>
                <input name="assignee" defaultValue={editing.assignee ?? ''} placeholder="Assignee" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] text-[color:var(--color-text)] px-3 py-2 text-sm" />
                <label className="text-xs text-[color:var(--color-text-muted)]">SLA Due</label>
                <div className="flex items-center gap-2">
                  <input name="slaDueAt" type="datetime-local" defaultValue={editing.slaDueAt ? editing.slaDueAt.slice(0,16) : ''} className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                  <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">OK</button>
                </div>
                <label className="text-xs text-[color:var(--color-text-muted)] sm:col-span-2">Description</label>
                <textarea name="description" defaultValue={editing.description ?? ''} placeholder="Description" maxLength={2500} className="sm:col-span-2 h-40 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <div className="sm:col-span-2 mt-2">
                  <div className="mb-2 text-sm font-semibold">History</div>
                  <div className="space-y-2 max-h-48 overflow-auto rounded-lg border border-[color:var(--color-border)] p-2">
                    <div className="text-xs text-[color:var(--color-text-muted)]">Created: {editing.createdAt ? formatDateTime(editing.createdAt) : '-'}</div>
                    {(editing.comments ?? []).map((c, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="text-xs text-[color:var(--color-text-muted)]">{c.at ? formatDateTime(c.at) : ''} • {c.author || 'system'}</div>
                        <div>{c.body}</div>
                      </div>
                    ))}
                    {(!editing.comments || editing.comments.length === 0) && (
                      <div className="text-xs text-[color:var(--color-text-muted)]">No comments yet.</div>
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-semibold">Add comment</label>
                  <AddComment editing={editing} onAdded={(comment) => { setEditing((prev) => prev ? { ...prev, comments: [...(prev.comments ?? []), comment] } : prev) }} addComment={addComment} />
                </div>

                {surveyPrograms.length > 0 && (
                  <div className="sm:col-span-2 mt-2 rounded-lg border border-[color:var(--color-border)] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Surveys &amp; Feedback</div>
                      <div className="text-[11px] text-[color:var(--color-text-muted)]">
                        Log a CSAT/post‑interaction survey response for this ticket.
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <div className="sm:col-span-2">
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
                          Score
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={surveyScore}
                          onChange={(e) => setSurveyScore(e.target.value)}
                          className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                          placeholder="0–10"
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                          Comment (optional)
                        </label>
                        <textarea
                          value={surveyComment}
                          onChange={(e) => setSurveyComment(e.target.value)}
                          rows={2}
                          className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                          placeholder="Customer feedback, notes, etc."
                        />
                      </div>
                      <div className="sm:col-span-4 flex justify-end">
                        <button
                          type="button"
                          className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-60"
                          disabled={!surveyProgramId || !surveyScore || logSurvey.isPending}
                          onClick={() => {
                            if (!editing) return
                            const n = Number(surveyScore)
                            if (Number.isNaN(n)) {
                              toast.showToast('Score must be a number.', 'error')
                              return
                            }
                            if (n < 0 || n > 10) {
                              toast.showToast('Score must be between 0 and 10.', 'error')
                              return
                            }
                            logSurvey.mutate({
                              programId: surveyProgramId,
                              score: n,
                              comment: surveyComment || undefined,
                              ticketId: editing._id,
                              accountId: editing.accountId ?? undefined,
                              contactId: editing.contactId ?? undefined,
                            })
                            setSurveyScore('')
                            setSurveyComment('')
                          }}
                        >
                          Log survey response
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="col-span-full mt-2 flex items-center justify-end gap-2">
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
                </div>
              </form>
            </div>
          </div>
        </div>, portalEl)}

      {slaEditing && slaPortal && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setSlaEditing(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,24rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Set SLA due date/time</div>
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <input type="datetime-local" value={slaValue} onChange={(e) => setSlaValue(e.target.value)} className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]" onClick={() => { if (slaEditing?._id) { const iso = slaValue ? new Date(slaValue).toISOString() : undefined; update.mutate({ _id: slaEditing._id, slaDueAt: iso }); setSlaEditing(null) } }}>OK</button>
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setSlaEditing(null)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>, slaPortal)}

      {createSlaOpen && createSlaPortal && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setCreateSlaOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,24rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Set SLA due date/time</div>
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <input type="datetime-local" value={createSlaValue} onChange={(e) => setCreateSlaValue(e.target.value)} className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                  <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]" onClick={() => setCreateSlaOpen(false)}>OK</button>
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => { setCreateSlaValue(''); setCreateSlaOpen(false) }}>Clear</button>
                </div>
              </div>
            </div>
          </div>
        </div>, createSlaPortal)}
      {showSaveViewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowSaveViewDialog(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 w-[min(90vw,24rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-base font-semibold">Save view</div>
            <input value={savingViewName} onChange={(e)=> setSavingViewName(e.target.value)} placeholder="View name" className="mb-3 w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" autoFocus onKeyDown={(e)=> { if (e.key==='Enter') saveCurrentView(); else if (e.key==='Escape') setShowSaveViewDialog(false) }} />
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

function AddComment({ editing, onAdded, addComment }: { editing: Ticket, onAdded: (c: { author?: string; body?: string; at?: string }) => void, addComment: { mutateAsync: (vars: { _id: string; body: string }) => Promise<any> } }) {
  const [value, setValue] = React.useState('')
  return (
    <div className="flex items-start gap-2">
      <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="Write a comment..." className="min-h-[72px] flex-1 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
      <div className="flex flex-col gap-2">
        <button type="button" disabled={!value.trim()} className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50" onClick={async () => {
          if (!value.trim()) return
          await addComment.mutateAsync({ _id: editing._id, body: value.trim() })
          const newComment = { author: 'you', body: value.trim(), at: new Date().toISOString() }
          onAdded(newComment)
          setValue('')
        }}>Add</button>
        <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setValue('')}>Clear</button>
    </div>
    </div>
  )
}


