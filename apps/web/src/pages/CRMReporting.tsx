import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CRMNav } from '@/components/CRMNav'
import { CRMHelpButton } from '@/components/CRMHelpButton'
import { http } from '@/lib/http'
import { formatDateOnly } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'

type Overview = {
  range: { startDate: string; endDate: string }
  kpis: {
    pipelineDeals: number
    pipelineValue: number
    closedWonDeals: number
    closedWonValue: number
    openTickets: number
    breachedTickets: number
    ticketsOpenByPriority?: Record<string, number>
    marketingOpens: number
    marketingClicks: number
    marketingUnsubscribes: number
    marketingClickThroughRate?: number
    surveyResponses: number
    engagedSegments: number
    engagedEmails?: number
    quotesCreated?: number
    quotesAccepted?: number
    quoteAcceptanceRate?: number
    invoicesCreated?: number
    invoicedRevenue?: number
    receivablesOutstanding?: number
    receivablesOverdue?: number
    receivablesAging?: Record<string, { count: number; balance: number }>
    dsoDays?: number | null
    avgDaysToPay?: number | null
    totalActiveMRR?: number
    totalActiveARR?: number
    renewalsMrrNext30?: number
    renewalsMrrNext90?: number
    renewalsHighChurnRisk?: number
    renewalsDueCount?: number
    renewalsDueMRR?: number
  }
  lists: {
    engagedSegments: Array<{ id: string; name: string; emailCount: number; updatedAt: string | null }>
    topPipeline: Array<{ id: string; dealNumber: number | null; title: string; stage: string | null; amount: number; ownerId: string | null; forecastedCloseDate: string | null }>
  }
}

export default function CRMReporting() {
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')

  const q = useQuery({
    queryKey: ['crm-reporting-overview', startDate, endDate],
    queryFn: async () => {
      const res = await http.get('/api/crm/reporting/overview', { params: { startDate: startDate || undefined, endDate: endDate || undefined } })
      return res.data as { data: Overview }
    },
  })

  const data = q.data?.data

  const snapshotsQ = useQuery({
    queryKey: ['crm-reporting-snapshots'],
    queryFn: async () => {
      const res = await http.get('/api/crm/reporting/snapshots', { params: { limit: 20 } })
      return res.data as {
        data: {
          items: Array<{
            id: string
            createdAt: string
            createdByUserId: string | null
            kind?: 'manual' | 'scheduled'
            scheduleKey?: string | null
            range: { startDate: string; endDate: string }
            kpis: Record<string, any>
          }>
        }
      }
    },
    staleTime: 10_000,
  })

  const saveSnapshot = useMutation({
    mutationFn: async () => {
      const res = await http.post('/api/crm/reporting/snapshots', { startDate: startDate || undefined, endDate: endDate || undefined })
      return res.data as { data: { id: string } }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-reporting-snapshots'] })
      toast.showToast('BOAZ says: Snapshot saved.', 'success')
    },
    onError: () => toast.showToast('Failed to save snapshot', 'error'),
  })

  const runDailySnapshot = useMutation({
    mutationFn: async () => {
      const res = await http.post('/api/crm/reporting/snapshots/run-daily')
      return res.data as { data: { ok: boolean; scheduleKey?: string } }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-reporting-snapshots'] })
      toast.showToast('BOAZ says: Daily snapshot generated.', 'success')
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to generate daily snapshot', 'error'),
  })

  const lastScheduledSnapshot = React.useMemo(() => {
    const items = snapshotsQ.data?.data.items ?? []
    return items.find((s) => s.kind === 'scheduled') || null
  }, [snapshotsQ.data?.data.items])

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value || 0)
  }

  function formatNumber(value: number) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0)
  }

  function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
    const csv = [headers.join(','), ...rows.map((r) => r.map((x) => `"${String(x ?? '').replaceAll('"', '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportOverviewCsv() {
    if (!data) return
    const headers = ['metric', 'value']
    const rows: Array<[string, string | number]> = [
      ['rangeStart', data.range.startDate],
      ['rangeEnd', data.range.endDate],
      ['pipelineDeals', data.kpis.pipelineDeals],
      ['pipelineValue', data.kpis.pipelineValue],
      ['closedWonDeals', data.kpis.closedWonDeals],
      ['closedWonValue', data.kpis.closedWonValue],
      ['openTickets', data.kpis.openTickets],
      ['breachedTickets', data.kpis.breachedTickets],
      ['ticketsOpenByPriority', JSON.stringify(data.kpis.ticketsOpenByPriority || {})],
      ['marketingOpens', data.kpis.marketingOpens],
      ['marketingClicks', data.kpis.marketingClicks],
      ['marketingUnsubscribes', data.kpis.marketingUnsubscribes],
      ['marketingCTR', data.kpis.marketingClickThroughRate != null ? Number(data.kpis.marketingClickThroughRate) : ''],
      ['surveyResponses', data.kpis.surveyResponses],
      ['engagedSegments', data.kpis.engagedSegments],
      ['engagedEmails', data.kpis.engagedEmails ?? ''],
      ['quotesCreated', data.kpis.quotesCreated ?? ''],
      ['quotesAccepted', data.kpis.quotesAccepted ?? ''],
      ['quoteAcceptanceRate', data.kpis.quoteAcceptanceRate != null ? Number(data.kpis.quoteAcceptanceRate) : ''],
      ['invoicesCreated', data.kpis.invoicesCreated ?? ''],
      ['receivablesOutstanding', data.kpis.receivablesOutstanding ?? ''],
      ['receivablesOverdue', data.kpis.receivablesOverdue ?? ''],
      ['receivablesAging', JSON.stringify(data.kpis.receivablesAging || {})],
      ['totalActiveMRR', data.kpis.totalActiveMRR ?? ''],
      ['totalActiveARR', data.kpis.totalActiveARR ?? ''],
      ['renewalsMrrNext30', data.kpis.renewalsMrrNext30 ?? ''],
      ['renewalsMrrNext90', data.kpis.renewalsMrrNext90 ?? ''],
      ['renewalsHighChurnRisk', data.kpis.renewalsHighChurnRisk ?? ''],
      ['renewalsDueCount', data.kpis.renewalsDueCount ?? ''],
      ['renewalsDueMRR', data.kpis.renewalsDueMRR ?? ''],
    ]
    downloadCsv('reporting-overview.csv', headers, rows)
  }

  function exportTopPipelineCsv() {
    if (!data) return
    const headers = ['dealId', 'dealNumber', 'title', 'stage', 'amount', 'ownerId', 'forecastedCloseDate']
    const rows = data.lists.topPipeline.map((d) => [d.id, d.dealNumber ?? '', d.title, d.stage ?? '', d.amount, d.ownerId ?? '', d.forecastedCloseDate ?? ''])
    downloadCsv('reporting-top-pipeline.csv', headers, rows)
  }

  function exportEngagedSegmentsCsv() {
    if (!data) return
    const headers = ['segmentId', 'name', 'emailCount', 'updatedAt']
    const rows = data.lists.engagedSegments.map((s) => [s.id, s.name, s.emailCount, s.updatedAt ?? ''])
    downloadCsv('reporting-engaged-segments.csv', headers, rows)
  }

  function exportPackJson() {
    const pack = {
      type: 'boaz_reporting_export_pack',
      generatedAt: new Date().toISOString(),
      selectedRange: { startDate: startDate || null, endDate: endDate || null },
      overview: data || null,
      snapshots: snapshotsQ.data?.data.items ?? [],
    }
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'boaz-report-pack.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportPackCsv() {
    if (!data) return
    const rows: Array<Array<string | number>> = []
    for (const [k, v] of Object.entries(data.kpis as any)) {
      rows.push(['kpis', k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')])
    }
    rows.push(['', '', ''])
    rows.push(['topPipeline', 'dealId', 'dealNumber|title|stage|amount|forecastedCloseDate'])
    for (const d of data.lists.topPipeline) {
      rows.push(['topPipeline', d.id, `${d.dealNumber ?? ''}|${d.title}|${d.stage ?? ''}|${d.amount}|${d.forecastedCloseDate ?? ''}`])
    }
    rows.push(['', '', ''])
    rows.push(['engagedSegments', 'segmentId', 'name|emailCount|updatedAt'])
    for (const s of data.lists.engagedSegments) {
      rows.push(['engagedSegments', s.id, `${s.name}|${s.emailCount}|${s.updatedAt ?? ''}`])
    }
    downloadCsv('boaz-report-pack.csv', ['section', 'metric', 'value'], rows)
  }

  function exportPdf() {
    if (!data) return
    const params = new URLSearchParams()
    // Use the currently loaded range to ensure what you see matches the PDF.
    params.set('startDate', data.range.startDate.slice(0, 10))
    params.set('endDate', data.range.endDate.slice(0, 10))
    params.set('autoprint', '1')
    navigate(`/apps/crm/reporting/print?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      <CRMNav />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-1">
        <div>
          <h1 className="text-xl font-semibold">Reporting</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">Competitive-edge dashboards across pipeline, service, and marketing.</p>
        </div>
        <div className="flex items-center gap-2">
          <CRMHelpButton tag="crm:reporting" />
          <button
            type="button"
            onClick={exportPdf}
            disabled={!data}
            className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={exportPackJson}
            className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
            title="Downloads a single JSON file containing KPIs, lists, and recent snapshots"
          >
            Export Pack (JSON)
          </button>
          <button
            type="button"
            onClick={exportPackCsv}
            disabled={!data}
            className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
            title="Downloads a single CSV with KPIs + lists (sections)"
          >
            Export Pack (CSV)
          </button>
          <button
            type="button"
            onClick={() => saveSnapshot.mutate()}
            disabled={saveSnapshot.isPending}
            className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
          >
            {saveSnapshot.isPending ? 'Saving…' : 'Save snapshot'}
          </button>
          <button
            type="button"
            onClick={exportOverviewCsv}
            disabled={!data}
            className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs text-[color:var(--color-text-muted)]">Date range</div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-xs"
          />
          <span className="text-xs text-[color:var(--color-text-muted)]">→</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-xs"
          />
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => { setStartDate(''); setEndDate('') }}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
            >
              Clear
            </button>
          )}
          {data && (
            <div className="ml-auto text-[11px] text-[color:var(--color-text-muted)]">
              Loaded: <span className="font-semibold text-[color:var(--color-text)]">{formatDateOnly(data.range.startDate)}</span> →{' '}
              <span className="font-semibold text-[color:var(--color-text)]">{formatDateOnly(data.range.endDate)}</span>
            </div>
          )}
        </div>
      </section>

      {q.isLoading && (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-sm text-[color:var(--color-text-muted)]">
          Loading reporting overview…
        </div>
      )}

      {q.error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
          Failed to load reporting overview.
        </div>
      )}

      {data && (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <a href={`/apps/crm/deals?startDate=${data.range.startDate.slice(0,10)}&endDate=${data.range.endDate.slice(0,10)}`} className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 hover:bg-[color:var(--color-muted)]">
              <div className="text-xs text-[color:var(--color-text-muted)]">Open Pipeline</div>
              <div className="mt-1 text-2xl font-semibold">{formatCurrency(data.kpis.pipelineValue)}</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">{data.kpis.pipelineDeals} deals</div>
            </a>
            <a href={`/apps/crm/deals?startDate=${data.range.startDate.slice(0,10)}&endDate=${data.range.endDate.slice(0,10)}`} className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 hover:bg-[color:var(--color-muted)]">
              <div className="text-xs text-[color:var(--color-text-muted)]">Closed Won</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-400">{formatCurrency(data.kpis.closedWonValue)}</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">{data.kpis.closedWonDeals} deals</div>
            </a>
            <a href="/apps/crm/support/tickets" className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 hover:bg-[color:var(--color-muted)]">
              <div className="text-xs text-[color:var(--color-text-muted)]">Support Health</div>
              <div className="mt-1 text-2xl font-semibold">{data.kpis.openTickets} open</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">{data.kpis.breachedTickets} SLA-breached</div>
            </a>
            <a href="/apps/crm/marketing" className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 hover:bg-[color:var(--color-muted)]">
              <div className="text-xs text-[color:var(--color-text-muted)]">Marketing Engagement</div>
              <div className="mt-1 text-2xl font-semibold">{data.kpis.marketingClicks} clicks</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">{data.kpis.marketingOpens} opens • {data.kpis.marketingUnsubscribes} unsub</div>
            </a>
          </section>

          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Quotes (range)</div>
              <div className="mt-1 text-2xl font-semibold">{data.kpis.quotesAccepted ?? 0} accepted</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">
                {data.kpis.quotesCreated ?? 0} created • {data.kpis.quoteAcceptanceRate != null ? `${Math.round(Number(data.kpis.quoteAcceptanceRate) * 100)}%` : '—'}
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Receivables</div>
              <div className="mt-1 text-2xl font-semibold">{formatCurrency(data.kpis.receivablesOutstanding ?? 0)}</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">Overdue: {formatCurrency(data.kpis.receivablesOverdue ?? 0)}</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Cash Efficiency</div>
              <div className="mt-1 text-2xl font-semibold">
                {data.kpis.dsoDays == null ? '—' : `${formatNumber(Number(data.kpis.dsoDays))}d`} DSO
              </div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">
                Avg days-to-pay: {data.kpis.avgDaysToPay == null ? '—' : `${formatNumber(Number(data.kpis.avgDaysToPay))}d`}
              </div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">
                Invoiced (range): {formatCurrency(data.kpis.invoicedRevenue ?? 0)}
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Renewal Book</div>
              <div className="mt-1 text-2xl font-semibold">{formatCurrency(data.kpis.totalActiveARR ?? 0)} ARR</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">
                {formatCurrency(data.kpis.totalActiveMRR ?? 0)} MRR • {data.kpis.renewalsHighChurnRisk ?? 0} high risk
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Renewals Due (range)</div>
              <div className="mt-1 text-2xl font-semibold">{data.kpis.renewalsDueCount ?? 0}</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">MRR due: {formatCurrency(data.kpis.renewalsDueMRR ?? 0)}</div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <h2 className="mb-3 text-sm font-semibold">Receivables Aging</h2>
              <div className="grid gap-2 text-xs">
                {[
                  { key: 'current', label: 'Current' },
                  { key: '1_30', label: '1–30' },
                  { key: '31_60', label: '31–60' },
                  { key: '61_90', label: '61–90' },
                  { key: '90_plus', label: '90+' },
                ].map((b) => {
                  const row = data.kpis.receivablesAging?.[b.key] || { count: 0, balance: 0 }
                  return (
                    <div key={b.key} className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2">
                      <div className="font-semibold">{b.label} days</div>
                      <div className="text-[color:var(--color-text-muted)]">
                        {row.count} invoices • <span className="font-semibold text-[color:var(--color-text)]">{formatCurrency(row.balance)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <h2 className="mb-3 text-sm font-semibold">Open Tickets by Priority</h2>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.kpis.ticketsOpenByPriority || {}).length === 0 ? (
                  <div className="text-xs text-[color:var(--color-text-muted)]">No open tickets in the selected range.</div>
                ) : (
                  Object.entries(data.kpis.ticketsOpenByPriority || {}).map(([p, n]) => (
                    <a
                      key={p}
                      href={`/apps/crm/support/tickets?priority=${encodeURIComponent(p)}`}
                      className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1 text-xs"
                    >
                      <span className="font-semibold">{p}</span>
                      <span className="ml-2 text-[color:var(--color-text-muted)]">{n}</span>
                    </a>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Top Pipeline Deals (by amount)</h2>
                <button
                  type="button"
                  onClick={exportTopPipelineCsv}
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                >
                  Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)] text-[10px] uppercase text-[color:var(--color-text-muted)]">
                      <th className="px-2 py-2 text-left">Deal</th>
                      <th className="px-2 py-2 text-left">Stage</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2 text-left">Forecast Close</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lists.topPipeline.map((d) => (
                      <tr key={d.id} className="border-b border-[color:var(--color-border)]">
                        <td className="px-2 py-2">
                          <div className="font-semibold">{d.title}</div>
                          <div className="text-[10px] text-[color:var(--color-text-muted)]">#{d.dealNumber ?? '—'}</div>
                        </td>
                        <td className="px-2 py-2">{d.stage ?? '—'}</td>
                        <td className="px-2 py-2 text-right font-semibold">{formatCurrency(d.amount)}</td>
                        <td className="px-2 py-2">{d.forecastedCloseDate ? formatDateOnly(d.forecastedCloseDate) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Engaged Segments (auto)</h2>
                <button
                  type="button"
                  onClick={exportEngagedSegmentsCsv}
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                >
                  Export CSV
                </button>
              </div>
              <div className="space-y-2">
                {data.lists.engagedSegments.length === 0 ? (
                  <div className="text-xs text-[color:var(--color-text-muted)]">No engaged segments yet.</div>
                ) : (
                  data.lists.engagedSegments.slice(0, 10).map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 text-xs">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{s.name}</div>
                        <div className="text-[10px] text-[color:var(--color-text-muted)]">{s.updatedAt ? `Updated ${new Date(s.updatedAt).toLocaleDateString()}` : '—'}</div>
                      </div>
                      <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        {s.emailCount} emails
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Snapshots</h2>
              <div className="flex items-center gap-2">
                <div className="text-[10px] text-[color:var(--color-text-muted)]">
                  {lastScheduledSnapshot
                    ? `Last scheduled: ${new Date(lastScheduledSnapshot.createdAt).toLocaleString()}`
                    : 'No scheduled snapshot yet'}
                </div>
                <button
                  type="button"
                  onClick={() => runDailySnapshot.mutate()}
                  disabled={runDailySnapshot.isPending}
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                >
                  {runDailySnapshot.isPending ? 'Running…' : 'Run daily snapshot now'}
                </button>
              </div>
            </div>
            {snapshotsQ.isLoading ? (
              <div className="text-xs text-[color:var(--color-text-muted)]">Loading snapshots…</div>
            ) : (snapshotsQ.data?.data.items?.length ?? 0) === 0 ? (
              <div className="text-xs text-[color:var(--color-text-muted)]">No snapshots yet. Click “Save snapshot”.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)] text-[10px] uppercase text-[color:var(--color-text-muted)]">
                      <th className="px-2 py-2 text-left">Created</th>
                      <th className="px-2 py-2 text-left">Range</th>
                      <th className="px-2 py-2 text-right">Pipeline</th>
                      <th className="px-2 py-2 text-right">Won</th>
                      <th className="px-2 py-2 text-right">Open tickets</th>
                      <th className="px-2 py-2 text-right">Overdue AR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(snapshotsQ.data?.data.items ?? []).map((s, idx, arr) => {
                      const prev = arr[idx + 1]
                      const delta = (key: string) => {
                        const cur = Number(s.kpis?.[key] ?? 0)
                        const p = Number(prev?.kpis?.[key] ?? 0)
                        const d = cur - p
                        if (!prev) return ''
                        return d === 0 ? '0' : d > 0 ? `+${d}` : `${d}`
                      }
                      return (
                        <tr key={s.id} className="border-b border-[color:var(--color-border)]">
                          <td className="px-2 py-2">
                            <div className="font-semibold">{new Date(s.createdAt).toLocaleString()}</div>
                            <div className="text-[10px] text-[color:var(--color-text-muted)]">
                              {(s.kind || 'manual')}{s.scheduleKey ? ` • ${s.scheduleKey}` : ''}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            {formatDateOnly(s.range.startDate)} → {formatDateOnly(s.range.endDate)}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {formatCurrency(Number(s.kpis?.pipelineValue ?? 0))}{' '}
                            <span className="text-[10px] text-[color:var(--color-text-muted)]">({delta('pipelineValue')})</span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            {formatCurrency(Number(s.kpis?.closedWonValue ?? 0))}{' '}
                            <span className="text-[10px] text-[color:var(--color-text-muted)]">({delta('closedWonValue')})</span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            {Number(s.kpis?.openTickets ?? 0)}{' '}
                            <span className="text-[10px] text-[color:var(--color-text-muted)]">({delta('openTickets')})</span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            {formatCurrency(Number(s.kpis?.receivablesOverdue ?? 0))}{' '}
                            <span className="text-[10px] text-[color:var(--color-text-muted)]">({delta('receivablesOverdue')})</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}


