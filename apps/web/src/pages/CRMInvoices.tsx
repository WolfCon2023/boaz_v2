import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'

type Invoice = { _id: string; invoiceNumber?: number; title?: string; total?: number; balance?: number; status?: string; dueDate?: string; issuedAt?: string; accountId?: string; accountNumber?: number }
type AccountPick = { _id: string; accountNumber?: number; name?: string }

export default function CRMInvoices() {
  const qc = useQueryClient()
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

  const create = useMutation({
    mutationFn: async (payload: any) => { const res = await http.post('/api/crm/invoices', payload); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
  const update = useMutation({
    mutationFn: async (payload: any) => { const { _id, ...rest } = payload; const res = await http.put(`/api/crm/invoices/${_id}`, rest); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
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

  function saveCurrentView() {
    const viewConfig = { q, sort, dir, cols, pageSize }
    const id = Date.now().toString()
    const newView = { id, name: savingViewName || `View ${savedViews.length + 1}`, config: viewConfig }
    setSavedViews([...savedViews, newView])
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
  function deleteView(id: string) {
    setSavedViews(savedViews.filter((v) => v.id !== id))
  }
  function copyShareLink() {
    const url = window.location.origin + window.location.pathname + '?' + searchParams.toString()
    navigator.clipboard?.writeText(url).then(() => alert('Link copied')).catch(() => alert('Failed to copy'))
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
    if (key === 'dueDate') return inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-'
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

  const [editing, setEditing] = React.useState<Invoice | null>(null)
  const [showHistory, setShowHistory] = React.useState(false)
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

        <form className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const title = String(fd.get('title')||''); const accNum = fd.get('accountNumber') ? Number(fd.get('accountNumber')) : undefined; const subtotal = fd.get('subtotal') ? Number(fd.get('subtotal')) : 0; const tax = fd.get('tax') ? Number(fd.get('tax')) : 0; const total = subtotal + tax; const dueDate = String(fd.get('dueDate')||'') || undefined; const payload: any = { title, subtotal, tax, total, dueDate }; const acc = accounts.find(a => a.accountNumber === accNum); if (acc?._id) payload.accountId = acc._id; else if (accNum) payload.accountNumber = accNum; create.mutate(payload); (e.currentTarget as HTMLFormElement).reset() }}>
          <input name="title" required placeholder="Invoice title" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <select name="accountNumber" required className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">Select account</option>
            {accounts.filter((a) => typeof a.accountNumber === 'number').map((a) => (
              <option key={a._id} value={a.accountNumber ?? ''}>{(a.accountNumber ?? '—')} — {a.name ?? 'Account'}</option>
            ))}
          </select>
          <input name="subtotal" type="number" step="0.01" placeholder="Subtotal" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="tax" type="number" step="0.01" placeholder="Tax" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="dueDate" type="date" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Add invoice</button>
        </form>

        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]">
            <tr>
              {cols.filter((c)=> c.visible).map((col)=> (
                <th key={col.key} draggable onDragStart={()=>handleDragStart(col.key)} onDragOver={(e)=>{e.preventDefault()}} onDrop={()=>handleDrop(col.key)} className={`px-4 py-2 cursor-move ${draggedCol===col.key ? 'opacity-50' : ''}`} title="Drag to reorder">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((inv) => (
              <tr key={inv._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)] cursor-pointer" onClick={() => setEditing(inv)}>
                {cols.filter((c)=> c.visible).map((col)=> (
                  <td key={col.key} className="px-4 py-2">{getColValue(inv, col.key)}</td>
                ))}
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
            <div className="w-[min(90vw,48rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Edit invoice</div>
              <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const payload: any = { _id: editing._id, title: String(fd.get('title')||'') || undefined, status: String(fd.get('status')||'') || undefined }; const due = String(fd.get('dueDate')||''); if (due) payload.dueDate = due; const subtotal = fd.get('subtotal') ? Number(fd.get('subtotal')) : undefined; const tax = fd.get('tax') ? Number(fd.get('tax')) : undefined; if (subtotal != null || tax != null) { payload.subtotal = subtotal ?? editing['subtotal' as keyof Invoice]; payload.tax = tax ?? editing['tax' as keyof Invoice]; payload.total = (payload.subtotal || 0) + (payload.tax || 0); payload.items = [] } const accSel = String(fd.get('accountId')||''); if (accSel) payload.accountId = accSel; update.mutate(payload); setEditing(null) }}>
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
                  <button type="button" className="mr-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm text-red-600 hover:bg-[color:var(--color-muted)]" onClick={() => { if (editing?._id) http.delete(`/api/crm/invoices/${editing._id}`).then(() => { qc.invalidateQueries({ queryKey: ['invoices'] }); setEditing(null) }) }}>Delete</button>
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setShowHistory((v) => !v)}>{showHistory ? 'Hide history' : 'View history'}</button>
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
                </div>
                {showHistory && historyQ.data && (
                  <div className="col-span-full mt-3 rounded-xl border border-[color:var(--color-border)] p-3 text-xs">
                    <div>Created: {new Date(historyQ.data.data.createdAt).toLocaleString()}</div>
                    <div className="mt-1">Invoice: {historyQ.data.data.invoice?.invoiceNumber ?? ''} {historyQ.data.data.invoice?.title ?? ''} • Status: {historyQ.data.data.invoice?.status ?? ''}</div>
                    <div className="mt-2 font-semibold">Payments</div>
                    <ul className="list-disc pl-5">{historyQ.data.data.payments.map((p, i) => (<li key={i}>${p.amount ?? ''} • {p.method ?? ''} • {p.paidAt ? new Date(p.paidAt).toLocaleString() : ''}</li>))}{historyQ.data.data.payments.length===0 && <li>None</li>}</ul>
                    <div className="mt-2 font-semibold">Refunds</div>
                    <ul className="list-disc pl-5">{historyQ.data.data.refunds.map((r, i) => (<li key={i}>${r.amount ?? ''} • {r.reason ?? ''} • {r.refundedAt ? new Date(r.refundedAt).toLocaleString() : ''}</li>))}{historyQ.data.data.refunds.length===0 && <li>None</li>}</ul>
                  </div>
                )}
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


