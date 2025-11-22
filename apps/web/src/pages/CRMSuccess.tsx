import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'

type Account = {
  _id: string
  accountNumber?: number
  name?: string
  companyName?: string
}

type AccountSurveyStatusSummary = {
  accountId: string
  responseCount: number
  lastResponseAt: string | null
  lastScore: number | null
}

type LicenseAlertRow = {
  customerId: string
  productStatus?: string
  renewalStatus: string
  expirationDate?: string | null
}

type AccountTicketSummaryRow = {
  accountId: string
  open: number
  high: number
  breached: number
}

type AccountProjectSummaryRow = {
  accountId: string
  total: number
  active: number
  completed: number
  atRisk: number
  offTrack: number
}

type AccountSuccessHealthRow = {
  score: number
  label: 'Low' | 'Medium' | 'High'
  className: string
  tooltip: string
}

export default function CRMSuccess() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [q, setQ] = React.useState(searchParams.get('q') ?? '')
  const [healthFilter, setHealthFilter] = React.useState(searchParams.get('health') ?? 'high')
  const [savedViews, setSavedViews] = React.useState<Array<{ id: string; name: string; config: any }>>([])

  React.useEffect(() => {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (healthFilter && healthFilter !== 'all') params.set('health', healthFilter)
    setSearchParams(params, { replace: true })
    try {
      localStorage.setItem('SUCCESS_SAVED_VIEWS', JSON.stringify(savedViews))
    } catch {}
  }, [q, healthFilter, savedViews, setSearchParams])

  // Load saved views once on mount
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem('SUCCESS_SAVED_VIEWS')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) setSavedViews(parsed)
      }
    } catch {}
    ;(async () => {
      try {
        const res = await http.get('/api/views', { params: { viewKey: 'success' } })
        const items = (res.data?.data?.items ?? []).map((v: any) => ({
          id: String(v._id),
          name: v.name,
          config: v.config,
        }))
        if (Array.isArray(items) && items.length > 0) {
          setSavedViews(items)
        }
      } catch {}
    })()
  }, [])

  const accountsQ = useQuery({
    queryKey: ['success-accounts'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', { params: { limit: 500, sort: 'name', dir: 'asc' } })
      return res.data as { data: { items: Account[] } }
    },
  })

  const items = accountsQ.data?.data.items ?? []

  const accountIdsParam = React.useMemo(
    () => (items.length ? items.map((a) => a._id).join(',') : ''),
    [items],
  )

  const surveysQ = useQuery({
    queryKey: ['success-accounts-survey-status', accountIdsParam],
    enabled: !!accountIdsParam,
    queryFn: async () => {
      const res = await http.get('/api/crm/surveys/accounts/status', { params: { accountIds: accountIdsParam } })
      return res.data as { data: { items: AccountSurveyStatusSummary[] } }
    },
  })

  const ticketsQ = useQuery({
    queryKey: ['success-accounts-tickets', accountIdsParam],
    enabled: !!accountIdsParam,
    queryFn: async () => {
      const res = await http.get('/api/crm/support/tickets/by-account', { params: { accountIds: accountIdsParam } })
      return res.data as { data: { items: AccountTicketSummaryRow[] } }
    },
  })

  const assetsQ = useQuery({
    queryKey: ['success-assets-license-report'],
    queryFn: async () => {
      const res = await http.get('/api/assets/license-report', { params: { windowDays: 90 } })
      return res.data as { data: { items: LicenseAlertRow[] } }
    },
  })

  const projectsQ = useQuery({
    queryKey: ['success-projects-counts', accountIdsParam],
    enabled: !!accountIdsParam,
    queryFn: async () => {
      const res = await http.get('/api/crm/projects/counts', { params: { accountIds: accountIdsParam } })
      return res.data as { data: { items: AccountProjectSummaryRow[] } }
    },
  })

  React.useEffect(() => {
    const anyError = surveysQ.error || ticketsQ.error || assetsQ.error || projectsQ.error
    if (anyError) {
      const err: any = anyError
      const msg = err?.response?.data?.error || err?.message || 'Failed to load success data.'
      toast.showToast(msg, 'error')
    }
  }, [surveysQ.error, ticketsQ.error, assetsQ.error, projectsQ.error, toast])

  const accountSurveyStatusMap = React.useMemo(() => {
    const map = new Map<string, AccountSurveyStatusSummary>()
    for (const s of surveysQ.data?.data.items ?? []) {
      map.set(s.accountId, s)
    }
    return map
  }, [surveysQ.data?.data.items])

  const accountAssetsRiskMap = React.useMemo(() => {
    const rows = assetsQ.data?.data.items ?? []
    const byCustomer = new Map<string, LicenseAlertRow[]>()
    for (const row of rows) {
      if (!row.customerId) continue
      if (!byCustomer.has(row.customerId)) byCustomer.set(row.customerId, [])
      byCustomer.get(row.customerId)!.push(row)
    }

    const result = new Map<
      string,
      {
        score: number
        label: string
        expired: number
        expiring30: number
        expiring60: number
        expiring90: number
        needsUpgrade: number
        pendingRenewalProducts: number
      }
    >()
    const now = new Date()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

    byCustomer.forEach((rowsForCustomer, customerId) => {
      let expired = 0
      let expiring30 = 0
      let expiring60 = 0
      let expiring90 = 0
      let needsUpgrade = 0
      let pendingRenewalProducts = 0

      for (const row of rowsForCustomer) {
        if (row.productStatus === 'Needs Upgrade') needsUpgrade++
        if (row.productStatus === 'Pending Renewal') pendingRenewalProducts++

        if (!row.expirationDate) continue
        const d = new Date(row.expirationDate)
        if (!Number.isFinite(d.getTime())) continue
        if (d < now) {
          expired++
        } else if (d <= in30Days) {
          expiring30++
        } else if (d <= in60Days) {
          expiring60++
        } else if (d <= in90Days) {
          expiring90++
        }
      }

      let score = 0
      if (expired > 0) score += 40
      if (expiring30 > 0) score += 30
      if (expiring60 > 0) score += 15
      if (expiring90 > 0) score += 10
      if (needsUpgrade > 0) score += 10
      if (pendingRenewalProducts > 0) score += 10
      if (score > 100) score = 100

      let label = 'Low'
      if (score >= 70) label = 'High'
      else if (score >= 30) label = 'Medium'

      result.set(customerId, {
        score,
        label,
        expired,
        expiring30,
        expiring60,
        expiring90,
        needsUpgrade,
        pendingRenewalProducts,
      })
    })

    return result
  }, [assetsQ.data?.data.items])

  const accountTicketsMap = React.useMemo(() => {
    const map = new Map<string, AccountTicketSummaryRow>()
    for (const row of ticketsQ.data?.data.items ?? []) {
      map.set(row.accountId, row)
    }
    return map
  }, [ticketsQ.data?.data.items])

  const accountProjectsMap = React.useMemo(() => {
    const map = new Map<string, AccountProjectSummaryRow>()
    for (const row of projectsQ.data?.data.items ?? []) {
      map.set(row.accountId, row)
    }
    return map
  }, [projectsQ.data?.data.items])

  const accountSuccessMap = React.useMemo(() => {
    const map = new Map<string, AccountSuccessHealthRow>()

    for (const a of items) {
      const id = a._id
      const survey = accountSurveyStatusMap.get(id)
      const assets = accountAssetsRiskMap.get(id)
      const tickets = accountTicketsMap.get(id)
      const projects = accountProjectsMap.get(id)

      let score = 0
      const parts: string[] = []

      if (survey && survey.responseCount > 0) {
        const last = survey.lastScore ?? 0
        parts.push(`Surveys: ${survey.responseCount} responses, last score ${last.toFixed(1)}`)
        if (last <= 6) score += 35
        else if (last <= 7.5) score += 20
        else if (last <= 8.5) score += 10
      } else {
        parts.push('Surveys: no recent responses')
      }

      if (tickets) {
        const { open, high, breached } = tickets
        parts.push(`Support: ${open} open (${high} high/urgent), ${breached} breached SLA`)
        score += Math.min(open * 4, 24)
        score += Math.min(high * 6, 18)
        score += Math.min(breached * 10, 30)
      } else {
        parts.push('Support: no open tickets')
      }

      if (assets) {
        parts.push(`Assets: ${assets.label} asset risk (score ${assets.score})`)
        score += Math.round(assets.score * 0.4)
      } else {
        parts.push('Assets: low visible risk')
      }

      if (projects) {
        const riskCount = (projects.atRisk ?? 0) + (projects.offTrack ?? 0)
        parts.push(
          `Projects: ${projects.total} total, ${projects.active ?? 0} active, ${riskCount} at risk`,
        )
        if (riskCount > 0) {
          score += Math.min(30, riskCount * 10)
        }
      } else {
        parts.push('Projects: none tracked')
      }

      if (score > 100) score = 100

      let label: AccountSuccessHealthRow['label'] = 'Low'
      let className =
        'inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100'
      if (score >= 70) {
        label = 'High'
        className =
          'inline-flex items-center rounded-full border border-red-500/70 bg-red-500/15 px-2 py-0.5 text-[11px] text-red-200'
      } else if (score >= 35) {
        label = 'Medium'
        className =
          'inline-flex items-center rounded-full border border-amber-500/70 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-100'
      }

      const tooltip = [`Success health score: ${score}`, ...parts].join(' • ')

      map.set(id, { score, label, className, tooltip })
    }

    return map
  }, [items, accountSurveyStatusMap, accountAssetsRiskMap, accountTicketsMap, accountProjectsMap])

  const rows = React.useMemo(() => {
    let out = items.map((a) => {
      const success = accountSuccessMap.get(a._id)
      return { account: a, success }
    })

    if (q.trim()) {
      const ql = q.trim().toLowerCase()
      out = out.filter(({ account }) =>
        [account.name, account.companyName, account.accountNumber]
          .some((v) => (v ?? '').toString().toLowerCase().includes(ql)),
      )
    }

    if (healthFilter === 'high') {
      out = out.filter(({ success }) => success && success.label === 'High')
    } else if (healthFilter === 'medium') {
      out = out.filter(({ success }) => success && success.label === 'Medium')
    } else if (healthFilter === 'low') {
      out = out.filter(({ success }) => success && success.label === 'Low')
    }

    // Sort by score desc
    return out.sort((a, b) => (b.success?.score ?? 0) - (a.success?.score ?? 0))
  }, [items, accountSuccessMap, q, healthFilter])

  const highCount = rows.filter((r) => r.success?.label === 'High').length
  const medCount = rows.filter((r) => r.success?.label === 'Medium').length

  async function saveCurrentView() {
    const name = window.prompt('Name for this view?')?.trim()
    if (!name) return
    const viewConfig = { q, healthFilter }
    try {
      const res = await http.post('/api/views', { viewKey: 'success', name, config: viewConfig })
      const doc = res.data?.data
      const newItem =
        doc && doc._id
          ? { id: String(doc._id), name: doc.name, config: doc.config }
          : { id: Date.now().toString(), name, config: viewConfig }
      setSavedViews((prev) => [...prev, newItem])
    } catch {
      setSavedViews((prev) => [...prev, { id: Date.now().toString(), name, config: viewConfig }])
    }
  }

  function loadView(view: { id: string; name: string; config: any }) {
    const c = view.config ?? {}
    if (c.q !== undefined) setQ(c.q)
    if (c.healthFilter !== undefined) setHealthFilter(c.healthFilter)
  }

  function exportCsv() {
    const headers = [
      'Account',
      'Company',
      'Success label',
      'Success score',
      'Survey responses',
      'Last survey score',
      'Open tickets',
      'High tickets',
      'Breached SLAs',
      'Asset risk label',
      'Asset risk score',
      'Projects total',
      'Projects active',
      'Projects at risk',
    ]
    const lines = rows.map(({ account, success }) => {
      const survey = accountSurveyStatusMap.get(account._id)
      const tickets = accountTicketsMap.get(account._id)
      const assets = accountAssetsRiskMap.get(account._id)
      const projects = accountProjectsMap.get(account._id)
      const projectsRisk = projects ? (projects.atRisk ?? 0) + (projects.offTrack ?? 0) : 0
      const cells = [
        account.accountNumber ? `#${account.accountNumber} – ${account.name ?? ''}` : account.name ?? '',
        account.companyName ?? '',
        success?.label ?? 'OK',
        String(success?.score ?? 0),
        String(survey?.responseCount ?? 0),
        survey?.lastScore != null ? survey.lastScore.toFixed(1) : '',
        String(tickets?.open ?? 0),
        String(tickets?.high ?? 0),
        String(tickets?.breached ?? 0),
        assets?.label ?? '',
        assets ? String(assets.score) : '',
        String(projects?.total ?? 0),
        String(projects?.active ?? 0),
        String(projectsRisk),
      ]
      return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
    })
    const csv = [headers.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'customer_success_accounts.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <CRMNav />
      <header className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Customer Success</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Monitor customer health across surveys, support, assets, and projects, and prioritize follow-up.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[color:var(--color-text-muted)]">
          <div className="inline-flex items-center gap-1 rounded-xl border border-[color:var(--color-border)] px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-red-500" /> <span>{highCount} high‑risk</span>
          </div>
          <div className="inline-flex items-center gap-1 rounded-xl border border-[color:var(--color-border)] px-2 py-1">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> <span>{medCount} medium‑risk</span>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-muted)]"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={saveCurrentView}
            className="inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-2 py-1 text-[11px] hover:bg-[color:var(--color-muted)]"
          >
            Save view
          </button>
          <select
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-[11px] text-[color:var(--color-text)]"
            onChange={(e) => {
              const selected = savedViews.find((v) => v.id === e.target.value)
              if (selected) loadView(selected)
              e.target.value = ''
            }}
          >
            <option value="">Saved views</option>
            {savedViews.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="px-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search accounts by name, company, or #…"
            className="min-w-[200px] flex-1 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
          />
          <select
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value)}
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
          >
            <option value="high">High‑risk only</option>
            <option value="medium">Medium/High</option>
            <option value="low">Low/Medium/High</option>
            <option value="all">All accounts</option>
          </select>
        </div>
      </section>

      <section className="px-4">
        <div className="overflow-x-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[color:var(--color-muted)] text-xs text-[color:var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Success</th>
                <th className="px-3 py-2 text-left">Surveys</th>
                <th className="px-3 py-2 text-left">Support</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Asset risk</th>
                <th className="px-3 py-2 text-left">Projects</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-xs text-[color:var(--color-text-muted)]"
                  >
                    No accounts match the current filters.
                  </td>
                </tr>
              )}
              {rows.map(({ account, success }) => {
                const survey = accountSurveyStatusMap.get(account._id)
                const tickets = accountTicketsMap.get(account._id)
                const assets = accountAssetsRiskMap.get(account._id)
                const projects = accountProjectsMap.get(account._id)
                const projectsRisk = projects
                  ? (projects.atRisk ?? 0) + (projects.offTrack ?? 0)
                  : 0
                return (
                  <tr key={account._id} className="border-t border-[color:var(--color-border-soft)]">
                    <td className="px-3 py-2 align-top text-xs">
                      <div className="font-medium">
                        {account.accountNumber ? `#${account.accountNumber} – ` : ''}
                        {account.name}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-xs">{account.companyName ?? ''}</td>
                    <td className="px-3 py-2 align-top text-xs">
                      {success ? (
                        <span className={success.className} title={success.tooltip}>
                          {success.label}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] text-[color:var(--color-text-muted)]">
                          OK
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      {survey ? (
                        <div className="flex flex-col gap-0.5">
                          <span>
                            {survey.responseCount} resp.
                            {survey.lastScore != null ? `, last ${survey.lastScore.toFixed(1)}` : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[color:var(--color-text-muted)]">
                          No recent surveys
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      {tickets ? (
                        <span>
                          {tickets.open} open ({tickets.high} high, {tickets.breached} breached)
                        </span>
                      ) : (
                        <span className="text-[11px] text-[color:var(--color-text-muted)]">
                          No open tickets
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      {assets ? (
                        <span className="inline-flex items-center rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] text-[color:var(--color-text)]">
                          {assets.label} (score {assets.score})
                        </span>
                      ) : (
                        <span className="text-[11px] text-[color:var(--color-text-muted)]">
                          Low risk
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      {projects ? (
                        <span>
                          {projects.total} total, {projects.active ?? 0} active, {projectsRisk} at risk
                        </span>
                      ) : (
                        <span className="text-[11px] text-[color:var(--color-text-muted)]">
                          No projects
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-right text-xs">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]"
                          onClick={() => {
                            window.location.href = `/apps/crm/accounts?accountId=${encodeURIComponent(
                              account._id,
                            )}`
                          }}
                        >
                          Open account
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]"
                          onClick={() => {
                            window.location.href = `/apps/crm/support/tickets?accountId=${encodeURIComponent(
                              account._id,
                            )}`
                          }}
                        >
                          Tickets
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]"
                          onClick={() => {
                            window.location.href = `/apps/crm/projects?accountId=${encodeURIComponent(
                              account._id,
                            )}`
                          }}
                        >
                          Projects
                        </button>
                      </div>
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


