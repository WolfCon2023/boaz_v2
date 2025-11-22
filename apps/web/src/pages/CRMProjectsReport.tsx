import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'
import { formatDate } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'

type ProjectRow = {
  _id: string
  name: string
  status: string
  type?: string
  accountId?: string
  dealId?: string
  ownerName?: string
  ownerEmail?: string
  startDate?: string | null
  targetEndDate?: string | null
  health?: string
  progressPercent?: number | null
}

type AccountPick = { _id: string; accountNumber?: number; name?: string }
type DealPick = { _id: string; dealNumber?: number; title?: string }

export default function CRMProjectsReport() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [q, setQ] = React.useState(searchParams.get('q') ?? '')
  const [status, setStatus] = React.useState(searchParams.get('status') ?? '')
  const [type, setType] = React.useState(searchParams.get('type') ?? '')
  const [health, setHealth] = React.useState(searchParams.get('health') ?? '')
  const [accountId, setAccountId] = React.useState(searchParams.get('accountId') ?? '')
  const [dealId, setDealId] = React.useState(searchParams.get('dealId') ?? '')
  const [sortKey, setSortKey] = React.useState<'targetEndDate' | 'startDate' | 'name' | 'status' | 'health'>(
    (searchParams.get('sortKey') as any) || 'targetEndDate',
  )
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>(
    (searchParams.get('sortDir') as any) || 'asc',
  )

  React.useEffect(() => {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (status) params.set('status', status)
    if (type) params.set('type', type)
    if (health) params.set('health', health)
    if (accountId) params.set('accountId', accountId)
    if (dealId) params.set('dealId', dealId)
    if (sortKey) params.set('sortKey', sortKey)
    if (sortDir) params.set('sortDir', sortDir)
    setSearchParams(params, { replace: true })
  }, [q, status, type, health, accountId, dealId, sortKey, sortDir, setSearchParams])

  const accountsQ = useQuery({
    queryKey: ['accounts-pick'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', { params: { limit: 1000, sort: 'name', dir: 'asc' } })
      return res.data as { data: { items: AccountPick[] } }
    },
  })

  const dealsQ = useQuery({
    queryKey: ['deals-pick'],
    queryFn: async () => {
      const res = await http.get('/api/crm/deals', {
        params: { limit: 1000, sort: 'closeDate', dir: 'desc' },
      })
      return res.data as { data: { items: DealPick[]; total: number } }
    },
  })

  const reportQ = useQuery({
    queryKey: ['projects-report', q, status, type, health, accountId, dealId],
    queryFn: async () => {
      const params: any = {
        limit: 500,
        page: 0,
        sort: 'targetEndDate',
        dir: 'asc',
      }
      if (q.trim()) params.q = q.trim()
      if (status) params.status = status
      if (type) params.type = type
      if (health) params.health = health
      if (accountId) params.accountId = accountId
      if (dealId) params.dealId = dealId
      const res = await http.get('/api/crm/projects', { params })
      return res.data as { data: { items: ProjectRow[] } }
    },
  })

  React.useEffect(() => {
    if (reportQ.error) {
      const err: any = reportQ.error
      const msg = err?.response?.data?.error || err?.message || 'Failed to load projects report.'
      toast.showToast(msg, 'error')
    }
  }, [reportQ.error, toast])

  const accounts = accountsQ.data?.data.items ?? []
  const deals = dealsQ.data?.data.items ?? []

  const accountNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const a of accounts) {
      const label = a.accountNumber ? `${a.accountNumber} – ${a.name}` : a.name ?? ''
      map.set(a._id, label)
    }
    return map
  }, [accounts])

  const dealNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const d of deals) {
      const label = d.dealNumber ? `${d.dealNumber} – ${d.title}` : d.title ?? ''
      map.set(d._id, label)
    }
    return map
  }, [deals])

  const rows = reportQ.data?.data.items ?? []

  const sortedRows = React.useMemo(() => {
    const dirMul = sortDir === 'desc' ? -1 : 1

    function getSortValue(r: ProjectRow): number | string {
      if (sortKey === 'name') return r.name ?? ''
      if (sortKey === 'status') return r.status ?? ''
      if (sortKey === 'health') return r.health ?? ''
      if (sortKey === 'startDate') {
        if (!r.startDate) return Number.MAX_SAFE_INTEGER
        const ts = new Date(r.startDate).getTime()
        return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER
      }
      if (sortKey === 'targetEndDate') {
        if (!r.targetEndDate) return Number.MAX_SAFE_INTEGER
        const ts = new Date(r.targetEndDate).getTime()
        return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER
      }
      return ''
    }

    return [...rows].sort((a, b) => {
      const av = getSortValue(a)
      const bv = getSortValue(b)
      if (typeof av === 'number' && typeof bv === 'number') {
        if (av === bv) return 0
        return av < bv ? -1 * dirMul : 1 * dirMul
      }
      const as = String(av)
      const bs = String(bv)
      if (as === bs) return 0
      return as.localeCompare(bs) * dirMul
    })
  }, [rows, sortKey, sortDir])

  function handleSort(next: typeof sortKey) {
    setSortKey((prev) => {
      if (prev === next) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDir('asc')
      return next
    })
  }

  function renderSortLabel(label: string, key: typeof sortKey) {
    const isActive = sortKey === key
    return (
      <button
        type="button"
        onClick={() => handleSort(key)}
        className={`inline-flex items-center gap-1 ${isActive ? 'text-[color:var(--color-text)]' : ''}`}
      >
        <span>{label}</span>
        {isActive && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    )
  }

  function exportCsv() {
    const headers = [
      'Project',
      'Status',
      'Health',
      'Type',
      'Account',
      'Deal',
      'Owner',
      'Start date',
      'Target end date',
      'Progress %',
    ]
    const lines = sortedRows.map((r) => {
      const account = r.accountId ? accountNameById.get(r.accountId) ?? r.accountId : ''
      const deal = r.dealId ? dealNameById.get(r.dealId) ?? r.dealId : ''
      const cells = [
        r.name ?? '',
        r.status ?? '',
        r.health ?? '',
        r.type ?? '',
        account,
        deal,
        r.ownerName || r.ownerEmail || '',
        r.startDate ? formatDate(r.startDate) : '',
        r.targetEndDate ? formatDate(r.targetEndDate) : '',
        r.progressPercent != null ? String(r.progressPercent) : '',
      ]
      return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
    })
    const csv = [headers.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'projects_report.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <CRMNav />

      <header className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Projects report</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Portfolio view of projects across accounts and deals, with filters and CSV export.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
          >
            Export CSV
          </button>
          <a
            href="/apps/crm/support/kb?tag=crm:projects"
            className="inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
          >
            Help
          </a>
        </div>
      </header>

      <section className="space-y-3 px-4">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
            placeholder="Search by project name or description…"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
          >
            <option value="">Status (all)</option>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
          >
            <option value="">Type (all)</option>
            <option value="implementation">Implementation</option>
            <option value="onboarding">Onboarding</option>
            <option value="change_request">Change request</option>
            <option value="internal">Internal</option>
          </select>
          <select
            value={health}
            onChange={(e) => setHealth(e.target.value)}
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
          >
            <option value="">Health (all)</option>
            <option value="on_track">On track</option>
            <option value="at_risk">At risk</option>
            <option value="off_track">Off track</option>
          </select>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
          >
            <option value="">Account (all)</option>
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.accountNumber ? `#${a.accountNumber} – ` : ''}
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
          >
            <option value="">Deal (all)</option>
            {deals.map((d) => (
              <option key={d._id} value={d._id}>
                {d.dealNumber ? `#${d.dealNumber} – ` : ''}
                {d.title}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="px-4">
        <div className="overflow-x-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[color:var(--color-muted)] text-xs text-[color:var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2 text-left">{renderSortLabel('Project', 'name')}</th>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-left">Deal</th>
                <th className="px-3 py-2 text-left">{renderSortLabel('Status', 'status')}</th>
                <th className="px-3 py-2 text-left">{renderSortLabel('Health', 'health')}</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">
                  {renderSortLabel('Target end', 'targetEndDate')}
                </th>
                <th className="px-3 py-2 text-left whitespace-nowrap">
                  {renderSortLabel('Start date', 'startDate')}
                </th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Owner</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Progress %</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-6 text-center text-xs text-[color:var(--color-text-muted)]"
                  >
                    No projects found. Adjust filters or create a new project.
                  </td>
                </tr>
              )}
              {sortedRows.map((r) => {
                const account = r.accountId ? accountNameById.get(r.accountId) ?? r.accountId : ''
                const deal = r.dealId ? dealNameById.get(r.dealId) ?? r.dealId : ''
                let healthClass =
                  'inline-flex rounded-full px-2 py-0.5 text-[11px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-muted)]'
                if (r.health === 'on_track') {
                  healthClass =
                    'inline-flex rounded-full px-2 py-0.5 text-[11px] border border-emerald-500/60 bg-emerald-500/10 text-emerald-100'
                } else if (r.health === 'at_risk') {
                  healthClass =
                    'inline-flex rounded-full px-2 py-0.5 text-[11px] border border-amber-500/70 bg-amber-500/15 text-amber-100'
                } else if (r.health === 'off_track') {
                  healthClass =
                    'inline-flex rounded-full px-2 py-0.5 text-[11px] border border-red-500/70 bg-red-500/15 text-red-100'
                }
                return (
                  <tr key={r._id} className="border-t border-[color:var(--color-border-soft)]">
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium">{r.name}</div>
                      {r.type && (
                        <div className="mt-0.5 text-[11px] text-[color:var(--color-text-muted)]">{r.type}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">{account}</td>
                    <td className="px-3 py-2 align-top text-xs">{deal}</td>
                    <td className="px-3 py-2 align-top text-xs capitalize">{r.status?.replace('_', ' ')}</td>
                    <td className="px-3 py-2 align-top text-xs">
                      {r.health && <span className={healthClass}>{r.health.replace('_', ' ')}</span>}
                    </td>
                    <td className="px-3 py-2 align-top text-xs whitespace-nowrap">
                      {r.targetEndDate ? formatDate(r.targetEndDate) : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-xs whitespace-nowrap">
                      {r.startDate ? formatDate(r.startDate) : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">{r.ownerName || r.ownerEmail || ''}</td>
                    <td className="px-3 py-2 align-top text-right text-xs">
                      {r.progressPercent != null ? `${r.progressPercent.toFixed?.(0) ?? r.progressPercent}%` : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}


