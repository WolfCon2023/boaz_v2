import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CRMNav } from '@/components/CRMNav'
import { CRMHelpButton } from '@/components/CRMHelpButton'
import { http } from '@/lib/http'
import { formatDateOnly } from '@/lib/dateFormat'

type Overview = {
  range: { startDate: string; endDate: string }
  kpis: {
    pipelineDeals: number
    pipelineValue: number
    closedWonDeals: number
    closedWonValue: number
    openTickets: number
    breachedTickets: number
    marketingOpens: number
    marketingClicks: number
    marketingUnsubscribes: number
    surveyResponses: number
    engagedSegments: number
  }
  lists: {
    engagedSegments: Array<{ id: string; name: string; emailCount: number; updatedAt: string | null }>
    topPipeline: Array<{ id: string; dealNumber: number | null; title: string; stage: string | null; amount: number; ownerId: string | null; forecastedCloseDate: string | null }>
  }
}

export default function CRMReporting() {
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

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value || 0)
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
      ['marketingOpens', data.kpis.marketingOpens],
      ['marketingClicks', data.kpis.marketingClicks],
      ['marketingUnsubscribes', data.kpis.marketingUnsubscribes],
      ['surveyResponses', data.kpis.surveyResponses],
      ['engagedSegments', data.kpis.engagedSegments],
    ]
    downloadCsv('reporting-overview.csv', headers, rows)
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
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Open Pipeline</div>
              <div className="mt-1 text-2xl font-semibold">{formatCurrency(data.kpis.pipelineValue)}</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">{data.kpis.pipelineDeals} deals</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Closed Won</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-400">{formatCurrency(data.kpis.closedWonValue)}</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">{data.kpis.closedWonDeals} deals</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Support Health</div>
              <div className="mt-1 text-2xl font-semibold">{data.kpis.openTickets} open</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">{data.kpis.breachedTickets} SLA-breached</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Marketing Engagement</div>
              <div className="mt-1 text-2xl font-semibold">{data.kpis.marketingClicks} clicks</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">{data.kpis.marketingOpens} opens • {data.kpis.marketingUnsubscribes} unsub</div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <h2 className="mb-3 text-sm font-semibold">Top Pipeline Deals (by amount)</h2>
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
              <h2 className="mb-3 text-sm font-semibold">Engaged Segments (auto)</h2>
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
        </>
      )}
    </div>
  )
}


