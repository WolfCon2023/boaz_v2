import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'

type Deal = { _id: string; dealNumber?: number; title?: string; amount?: number; stage?: string; closeDate?: string; accountId?: string; accountNumber?: number }
type AccountPick = { _id: string; accountNumber?: number; name?: string }

export default function CRMDeals() {
  const qc = useQueryClient()
  const [q, setQ] = React.useState('')
  const [sort, setSort] = React.useState<'title'|'stage'|'amount'|'closeDate'>('closeDate')
  const [dir, setDir] = React.useState<'asc'|'desc'>('desc')
  const { data, isFetching } = useQuery({
    queryKey: ['deals', q, sort, dir],
    queryFn: async () => {
      const res = await http.get('/api/crm/deals', { params: { q, sort, dir } })
      return res.data as { data: { items: Deal[] } }
    },
  })
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

  const items = data?.data.items ?? []
  const visibleItems = React.useMemo(() => {
    const ql = q.trim().toLowerCase()
    let rows = items
    if (ql) rows = rows.filter((d) => (d.title ?? '').toLowerCase().includes(ql) || (d.stage ?? '').toLowerCase().includes(ql))
    const dirMul = dir === 'desc' ? -1 : 1
    rows = [...rows].sort((a: any, b: any) => {
      const av = a[sort]
      const bv = b[sort]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (sort === 'amount') return ((av as number) - (bv as number)) * dirMul
      if (sort === 'closeDate') return (new Date(av).getTime() - new Date(bv).getTime()) * dirMul
      return String(av).localeCompare(String(bv)) * dirMul
    })
    return rows
  }, [items, q, sort, dir])
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(10)
  React.useEffect(() => { setPage(0) }, [q, sort, dir, pageSize])
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize))
  const pageItems = React.useMemo(() => visibleItems.slice(page * pageSize, page * pageSize + pageSize), [visibleItems, page, pageSize])

  const [editing, setEditing] = React.useState<Deal | null>(null)
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)
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
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]">
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
          <button
            className="ml-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
            onClick={() => {
              const headers = ['Deal #','Title','Amount','Stage','Close date']
              const rows = visibleItems.map((d) => [
                d.dealNumber ?? '',
                d.title ?? '',
                typeof d.amount === 'number' ? d.amount : '',
                d.stage ?? '',
                d.closeDate ? new Date(d.closeDate).toISOString().slice(0,10) : '',
              ])
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
        <form className="flex flex-wrap gap-2 p-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const title = String(fd.get('title')||''); const accNumStr = String(fd.get('accountNumber')||''); const accNum = accNumStr ? Number(accNumStr) : undefined; const amount = fd.get('amount') ? Number(fd.get('amount')) : undefined; const stage = String(fd.get('stage')||'')|| undefined; const closeDate = String(fd.get('closeDate')||'')|| undefined; const acc = (accountsQ.data?.data.items ?? []).find(a => a.accountNumber === accNum); const payload: any = { title, amount, stage, closeDate }; if (acc?._id) payload.accountId = acc._id; else if (typeof accNum === 'number' && Number.isFinite(accNum)) payload.accountNumber = accNum; create.mutate(payload); (e.currentTarget as HTMLFormElement).reset() }}>
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
          <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Add deal</button>
        </form>
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2">Deal #</th>
              <th className="px-4 py-2">Account</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2">Close date</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((d) => (
              <tr key={d._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)] cursor-pointer" onClick={() => setEditing(d)}>
                <td className="px-4 py-2">{d.dealNumber ?? '-'}</td>
                <td className="px-4 py-2">{
                  (() => {
                    const a = (d.accountId && acctById.get(d.accountId)) || accounts.find((x) => x.accountNumber === d.accountNumber)
                    return a ? `${a.accountNumber ?? '—'} — ${a.name ?? 'Account'}` : (d.accountNumber ?? '—')
                  })()
                }</td>
                <td className="px-4 py-2">{d.title ?? '-'}</td>
                <td className="px-4 py-2">{typeof d.amount === 'number' ? `$${d.amount.toLocaleString()}` : '-'}</td>
                <td className="px-4 py-2">{d.stage ?? '-'}</td>
                <td className="px-4 py-2">{d.closeDate ? new Date(d.closeDate).toLocaleDateString() : '-'}</td>
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
                  const payload: any = { _id: editing._id, title, amount, stage }
                  if (closeDateRaw) payload.closeDate = closeDateRaw
                  if (accSel) payload.accountId = accSel
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
                <div className="col-span-full mt-2 flex items-center justify-end gap-2">
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        portalEl
      )}
    </div>
  )
}


