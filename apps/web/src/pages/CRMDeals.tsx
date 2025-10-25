import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'

type Deal = { _id: string; dealNumber?: number; title?: string; amount?: number; stage?: string; closeDate?: string }
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
  const create = useMutation({
    mutationFn: async (payload: { title: string; accountId: string; amount?: number; stage?: string; closeDate?: string }) => {
      const res = await http.post('/api/crm/deals', payload)
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
          <input name="stage" placeholder="Stage" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="closeDate" type="date" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Add deal</button>
        </form>
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2">Deal #</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2">Close date</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((d) => (
              <tr key={d._id} className="border-t border-[color:var(--color-border)]">
                <td className="px-4 py-2">{d.dealNumber ?? '-'}</td>
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
    </div>
  )
}


