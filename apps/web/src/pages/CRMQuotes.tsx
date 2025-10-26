import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'

type Quote = {
  _id: string
  quoteNumber?: number
  title?: string
  accountId?: string
  accountNumber?: number
  subtotal?: number
  tax?: number
  total?: number
  status?: string
  version?: number
  updatedAt?: string
  approver?: string
  signerName?: string
  signerEmail?: string
}
type AccountPick = { _id: string; accountNumber?: number; name?: string }

export default function CRMQuotes() {
  const qc = useQueryClient()
  const [q, setQ] = React.useState('')
  const [sort, setSort] = React.useState<'quoteNumber'|'title'|'total'|'status'|'updatedAt'>('updatedAt')
  const [dir, setDir] = React.useState<'asc'|'desc'>('desc')

  const { data, isFetching } = useQuery({
    queryKey: ['quotes', q, sort, dir],
    queryFn: async () => {
      const res = await http.get('/api/crm/quotes', { params: { q, sort, dir } })
      return res.data as { data: { items: Quote[] } }
    },
  })
  const quotes = data?.data.items ?? []

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
    mutationFn: async (payload: any) => {
      const res = await http.post('/api/crm/quotes', payload)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  })
  const update = useMutation({
    mutationFn: async (payload: any) => {
      const { _id, ...rest } = payload
      const res = await http.put(`/api/crm/quotes/${_id}`, rest)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  })

  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(10)
  React.useEffect(() => { setPage(0) }, [q, sort, dir, pageSize])

  const visible = React.useMemo(() => {
    const ql = q.trim().toLowerCase()
    let rows = quotes
    if (ql) rows = rows.filter((x) => [x.title, x.status].some((v) => (v ?? '').toString().toLowerCase().includes(ql)))
    const mul = dir === 'desc' ? -1 : 1
    rows = [...rows].sort((a: any, b: any) => {
      const av = a[sort]; const bv = b[sort]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (sort === 'total' || sort === 'quoteNumber') return ((av as number) - (bv as number)) * mul
      if (sort === 'updatedAt') return (new Date(av).getTime() - new Date(bv).getTime()) * mul
      return String(av).localeCompare(String(bv)) * mul
    })
    return rows
  }, [quotes, q, sort, dir])

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize))
  const pageItems = React.useMemo(() => visible.slice(page * pageSize, page * pageSize + pageSize), [visible, page, pageSize])

  const [editing, setEditing] = React.useState<Quote | null>(null)
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => {
    if (!editing) return
    const el = document.createElement('div')
    el.setAttribute('data-overlay', 'quote-editor')
    Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' })
    document.body.appendChild(el)
    setPortalEl(el)
    return () => { try { document.body.removeChild(el) } catch {}; setPortalEl(null) }
  }, [editing])

  return (
    <div className="space-y-4">
      <CRMNav />
      <h1 className="text-xl font-semibold">Quotes</h1>

      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search quotes..." className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button type="button" onClick={() => setQ('')} disabled={!q}
            className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50">Clear</button>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="updatedAt">Updated</option>
            <option value="quoteNumber">Quote #</option>
            <option value="title">Title</option>
            <option value="total">Total</option>
            <option value="status">Status</option>
          </select>
          <select value={dir} onChange={(e) => setDir(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
          {isFetching && <span className="text-xs text-[color:var(--color-text-muted)]">Loading...</span>}
          <button
            className="ml-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
            onClick={() => {
              const headers = ['Quote #','Title','Account','Total','Status','Approver','Signer Name','Signer Email','Version','Updated']
              const rows = visible.map((q) => {
                const acc = q.accountId && acctById.get(q.accountId)
                const accLabel = acc ? `${acc.accountNumber ?? '—'} — ${acc.name ?? 'Account'}` : (q.accountNumber ?? '')
                return [q.quoteNumber ?? '', q.title ?? '', accLabel, q.total ?? '', q.status ?? '', q.approver ?? '', q.signerName ?? '', q.signerEmail ?? '', q.version ?? '', q.updatedAt ? new Date(q.updatedAt).toISOString() : '']
              })
              const csv = [headers.join(','), ...rows.map((r) => r.map((x) => '"'+String(x).replaceAll('"','""')+'"').join(','))].join('\n')
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'quotes.csv'
              a.click()
              URL.revokeObjectURL(url)
            }}
          >Export CSV</button>
        </div>

        <form className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget)
          const title = String(fd.get('title')||'')
          const accNum = fd.get('accountNumber') ? Number(fd.get('accountNumber')) : undefined
          const subtotal = fd.get('subtotal') ? Number(fd.get('subtotal')) : 0
          const tax = fd.get('tax') ? Number(fd.get('tax')) : 0
          const total = subtotal + tax
          const payload: any = { title, subtotal, tax, total }
          const acc = accounts.find((a) => a.accountNumber === accNum)
          if (acc?._id) payload.accountId = acc._id; else if (accNum) payload.accountNumber = accNum
          create.mutate(payload)
          ;(e.currentTarget as HTMLFormElement).reset()
        }}>
          <input name="title" required placeholder="Quote title" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <select name="accountNumber" required className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">Select account</option>
            {accounts.filter((a) => typeof a.accountNumber === 'number').map((a) => (
              <option key={a._id} value={a.accountNumber ?? ''}>{(a.accountNumber ?? '—')} — {a.name ?? 'Account'}</option>
            ))}
          </select>
          <input name="subtotal" type="number" step="0.01" placeholder="Subtotal" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="tax" type="number" step="0.01" placeholder="Tax" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Add quote</button>
        </form>

        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2">Quote #</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Account</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Approver</th>
              <th className="px-4 py-2">Signer</th>
              <th className="px-4 py-2">Signer Email</th>
              <th className="px-4 py-2">Version</th>
              <th className="px-4 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((q) => (
              <tr key={q._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)] cursor-pointer" onClick={() => setEditing(q)}>
                <td className="px-4 py-2">{q.quoteNumber ?? '-'}</td>
                <td className="px-4 py-2">{q.title ?? '-'}</td>
                <td className="px-4 py-2">{(() => { const a = q.accountId && acctById.get(q.accountId!); return a ? `${a.accountNumber ?? '—'} — ${a.name ?? 'Account'}` : (q.accountNumber ?? '—') })()}</td>
                <td className="px-4 py-2">{typeof q.total === 'number' ? `$${q.total.toLocaleString()}` : '-'}</td>
                <td className="px-4 py-2">{q.status ?? '-'}</td>
                <td className="px-4 py-2">{q.approver ?? '-'}</td>
                <td className="px-4 py-2">{q.signerName ?? '-'}</td>
                <td className="px-4 py-2">{q.signerEmail ?? '-'}</td>
                <td className="px-4 py-2">{q.version ?? '-'}</td>
                <td className="px-4 py-2">{q.updatedAt ? new Date(q.updatedAt).toLocaleString() : '-'}</td>
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
              <div className="mb-3 text-base font-semibold">Edit quote</div>
              <form
                className="grid gap-2 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  const payload: any = {
                    _id: editing._id,
                    title: String(fd.get('title')||'') || undefined,
                    status: String(fd.get('status')||'') || undefined,
                    approver: String(fd.get('approver')||'') || undefined,
                    signerName: String(fd.get('signerName')||'') || undefined,
                    signerEmail: String(fd.get('signerEmail')||'') || undefined,
                  }
                  const subtotal = fd.get('subtotal') ? Number(fd.get('subtotal')) : undefined
                  const tax = fd.get('tax') ? Number(fd.get('tax')) : undefined
                  if (subtotal != null || tax != null) {
                    payload.subtotal = subtotal ?? editing.subtotal ?? 0
                    payload.tax = tax ?? editing.tax ?? 0
                    payload.total = (payload.subtotal || 0) + (payload.tax || 0)
                    payload.items = [] // keep simple for now
                  }
                  const accSel = String(fd.get('accountId')||'')
                  if (accSel) payload.accountId = accSel
                  update.mutate(payload)
                  setEditing(null)
                }}
              >
                <input name="title" defaultValue={editing.title ?? ''} placeholder="Title" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <select name="status" defaultValue={editing.status ?? 'Draft'} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                  <option>Draft</option>
                  <option>Submitted for Review</option>
                  <option>Approved</option>
                  <option>Rejected</option>
                  <option>Sent for Signature</option>
                  <option>Signed</option>
                </select>
                <input name="subtotal" type="number" step="0.01" defaultValue={editing.subtotal as any} placeholder="Subtotal" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="tax" type="number" step="0.01" defaultValue={editing.tax as any} placeholder="Tax" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <label className="col-span-full text-sm">Account
                  <select name="accountId" className="ml-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                    <option value="">(no change)</option>
                    {accounts.map((a) => (
                      <option key={a._id} value={a._id}>{(a.accountNumber ?? '—')} — {a.name ?? 'Account'}</option>
                    ))}
                  </select>
                </label>
                <input name="approver" defaultValue={editing.approver ?? ''} placeholder="Approver" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="signerName" defaultValue={editing.signerName ?? ''} placeholder="Signer name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="signerEmail" defaultValue={editing.signerEmail ?? ''} placeholder="Signer email" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <div className="col-span-full mt-2 flex items-center justify-end gap-2">
                  <button type="button" className="mr-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm text-red-600 hover:bg-[color:var(--color-muted)]" onClick={() => { if (editing?._id) http.delete(`/api/crm/quotes/${editing._id}`).then(() => { qc.invalidateQueries({ queryKey: ['quotes'] }); setEditing(null) }) }}>Delete</button>
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
                </div>
              </form>
            </div>
          </div>
        </div>, portalEl)}
    </div>
  )
}


