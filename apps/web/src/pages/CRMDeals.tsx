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
  const [showColsMenu, setShowColsMenu] = React.useState(false)
  const [cols, setCols] = React.useState<{ dealNumber: boolean; account: boolean; title: boolean; amount: boolean; stage: boolean; closeDate: boolean }>({
    dealNumber: true,
    account: true,
    title: true,
    amount: true,
    stage: true,
    closeDate: true,
  })
  const initializedFromUrl = React.useRef(false)

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

    // Columns from localStorage or URL (comma-separated keys)
    try {
      const stored = localStorage.getItem('DEALS_COLS')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed && typeof parsed === 'object') setCols((prev) => ({ ...prev, ...parsed }))
      }
    } catch {}
    const colsParam = get('cols')
    if (colsParam) {
      const keys = new Set(colsParam.split(',').map((s) => s.trim()).filter(Boolean))
      setCols({
        dealNumber: keys.has('dealNumber'),
        account: keys.has('account'),
        title: keys.has('title'),
        amount: keys.has('amount'),
        stage: keys.has('stage'),
        closeDate: keys.has('closeDate'),
      })
    }
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
    const colKeys = Object.entries(cols).filter(([, v]) => v).map(([k]) => k).join(',')
    if (colKeys) params.cols = colKeys
    setSearchParams(params, { replace: true })
    try { localStorage.setItem('DEALS_COLS', JSON.stringify(cols)) } catch {}
  }, [q, sort, dir, stage, minAmount, maxAmount, startDate, endDate, page, pageSize, cols, setSearchParams])
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

  const items = data?.data.items ?? []
  const total = data?.data.total ?? 0
  React.useEffect(() => { setPage(0) }, [q, sort, dir, stage, minAmount, maxAmount, startDate, endDate, pageSize])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageItems = items

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
            <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setShowColsMenu((v) => !v)}>Columns</button>
            {showColsMenu && (
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-2 shadow">
                {([
                  ['dealNumber','Deal #'],
                  ['account','Account'],
                  ['title','Title'],
                  ['amount','Amount'],
                  ['stage','Stage'],
                  ['closeDate','Close date'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 p-1 text-sm">
                    <input
                      type="checkbox"
                      checked={(cols as any)[key]}
                      onChange={(e) => setCols((prev) => ({ ...prev, [key]: e.target.checked }))}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            className="ml-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
            onClick={() => {
              const all: Array<[string, (d: Deal) => any]> = [
                cols.dealNumber && ['Deal #', (d: Deal) => d.dealNumber ?? ''],
                cols.account && ['Account', (d: Deal) => {
                  const a = (d.accountId && acctById.get(d.accountId)) || accounts.find((x) => x.accountNumber === d.accountNumber)
                  return a ? `${a.accountNumber ?? '—'} — ${a.name ?? 'Account'}` : (d.accountNumber ?? '—')
                }],
                cols.title && ['Title', (d: Deal) => d.title ?? ''],
                cols.amount && ['Amount', (d: Deal) => (typeof d.amount === 'number' ? d.amount : '')],
                cols.stage && ['Stage', (d: Deal) => d.stage ?? ''],
                cols.closeDate && ['Close date', (d: Deal) => (d.closeDate ? new Date(d.closeDate).toISOString().slice(0,10) : '')],
              ].filter(Boolean) as Array<[string, (d: Deal)=>any]>
              const headers = all.map(([h]) => h)
              const rows = pageItems.map((d: Deal) => all.map(([, getter]) => getter(d)))
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
              {cols.dealNumber && <th className="px-4 py-2">Deal #</th>}
              {cols.account && <th className="px-4 py-2">Account</th>}
              {cols.title && <th className="px-4 py-2">Title</th>}
              {cols.amount && <th className="px-4 py-2">Amount</th>}
              {cols.stage && <th className="px-4 py-2">Stage</th>}
              {cols.closeDate && <th className="px-4 py-2">Close date</th>}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((d) => (
              <tr key={d._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)] cursor-pointer" onClick={() => setEditing(d)}>
                {cols.dealNumber && (<td className="px-4 py-2">{d.dealNumber ?? '-'}</td>)}
                {cols.account && (
                  <td className="px-4 py-2">{
                    (() => {
                      const a = (d.accountId && acctById.get(d.accountId)) || accounts.find((x) => x.accountNumber === d.accountNumber)
                      return a ? `${a.accountNumber ?? '—'} — ${a.name ?? 'Account'}` : (d.accountNumber ?? '—')
                    })()
                  }</td>
                )}
                {cols.title && (<td className="px-4 py-2">{d.title ?? '-'}</td>)}
                {cols.amount && (<td className="px-4 py-2">{typeof d.amount === 'number' ? `$${d.amount.toLocaleString()}` : '-'}</td>)}
                {cols.stage && (<td className="px-4 py-2">{d.stage ?? '-'}</td>)}
                {cols.closeDate && (<td className="px-4 py-2">{d.closeDate ? new Date(d.closeDate).toLocaleDateString() : '-'}</td>)}
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
    </div>
  )
}


