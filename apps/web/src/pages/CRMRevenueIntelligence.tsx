import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'
import { formatDateOnly } from '@/lib/dateFormat'

type ForecastPeriod = 'current_month' | 'current_quarter' | 'next_month' | 'next_quarter' | 'current_year'
type DealStage = 'Lead' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Closed Won' | 'Closed Lost'

type Deal = {
  _id: string
  accountId?: string
  title?: string
  amount?: number
  stage?: string
  closeDate?: string
  forecastedCloseDate?: string
  ownerId?: string
  dealNumber?: number
  aiScore: number
  aiConfidence: 'High' | 'Medium' | 'Low'
  aiFactors: Array<{ factor: string; impact: number; description: string }>
}

type ForecastData = {
  period: ForecastPeriod
  startDate: string
  endDate: string
  summary: {
    totalDeals: number
    totalPipeline: number
    weightedPipeline: number
    closedWon: number
    forecast: {
      pessimistic: number
      likely: number
      optimistic: number
    }
    confidence: {
      high: number
      medium: number
      low: number
    }
  }
  byStage: Record<string, { count: number; value: number; weightedValue: number }>
  deals: Deal[]
}

type RepPerformance = {
  ownerId: string
  totalDeals: number
  openDeals: number
  closedWon: number
  closedLost: number
  totalValue: number
  wonValue: number
  lostValue: number
  pipelineValue: number
  avgDealSize: number
  winRate: number
  forecastedRevenue: number
  performanceScore: number
}

export default function CRMRevenueIntelligence() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [period, setPeriod] = React.useState<ForecastPeriod>(
    (searchParams.get('period') as ForecastPeriod) || 'current_quarter',
  )
  const [view, setView] = React.useState<'forecast' | 'reps' | 'scenario'>(
    (searchParams.get('view') as any) || 'forecast',
  )
  const [selectedDealId, setSelectedDealId] = React.useState<string | null>(null)

  React.useEffect(() => {
    const params = new URLSearchParams()
    params.set('period', period)
    params.set('view', view)
    setSearchParams(params, { replace: true })
  }, [period, view, setSearchParams])

  const forecastQ = useQuery({
    queryKey: ['revenue-intelligence-forecast', period],
    queryFn: async () => {
      const res = await http.get('/api/crm/revenue-intelligence/forecast', { params: { period } })
      return res.data as { data: ForecastData }
    },
  })

  const repsQ = useQuery({
    queryKey: ['revenue-intelligence-reps', period],
    enabled: view === 'reps',
    queryFn: async () => {
      const res = await http.get('/api/crm/revenue-intelligence/rep-performance', { params: { period } })
      return res.data as {
        data: {
          period: ForecastPeriod
          startDate: string
          endDate: string
          reps: RepPerformance[]
          summary: {
            totalReps: number
            totalPipeline: number
            totalWon: number
            avgWinRate: number
          }
        }
      }
    },
  })

  const forecast = forecastQ.data?.data
  const reps = repsQ.data?.data

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(
      value,
    )
  }

  function getConfidenceColor(confidence: 'High' | 'Medium' | 'Low'): string {
    if (confidence === 'High') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/50'
    if (confidence === 'Medium') return 'text-amber-400 bg-amber-500/10 border-amber-500/50'
    return 'text-red-400 bg-red-500/10 border-red-500/50'
  }

  function getStageColor(stage: DealStage): string {
    if (stage === 'Closed Won') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/50'
    if (stage === 'Closed Lost') return 'text-red-400 bg-red-500/10 border-red-500/50'
    if (stage === 'Negotiation') return 'text-blue-400 bg-blue-500/10 border-blue-500/50'
    if (stage === 'Proposal') return 'text-purple-400 bg-purple-500/10 border-purple-500/50'
    if (stage === 'Qualified') return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/50'
    return 'text-gray-400 bg-gray-500/10 border-gray-500/50'
  }

  return (
    <div className="space-y-6">
      <CRMNav />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-1">
        <div>
          <h1 className="text-xl font-semibold">Revenue Intelligence & Forecasting</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            AI-powered deal scoring, pipeline forecasting, and rep performance analytics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/apps/crm/support/kb?tag=crm:revenue-intelligence"
            className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-[11px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
          >
            <span className="text-xs">Help</span>
            <span className="text-[10px]">?</span>
          </a>
        </div>
      </header>

      {/* Period & View Selector */}
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[color:var(--color-text-muted)]">Period</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as ForecastPeriod)}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-xs"
            >
              <option value="current_month">Current Month</option>
              <option value="current_quarter">Current Quarter</option>
              <option value="next_month">Next Month</option>
              <option value="next_quarter">Next Quarter</option>
              <option value="current_year">Current Year</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[color:var(--color-text-muted)]">View</label>
            <div className="flex rounded-lg border border-[color:var(--color-border)] overflow-hidden">
              <button
                type="button"
                onClick={() => setView('forecast')}
                title="AI-powered pipeline forecasting with confidence intervals (pessimistic, likely, optimistic) based on deal scoring"
                className={`flex items-center gap-1 px-3 py-1.5 text-xs ${
                  view === 'forecast'
                    ? 'bg-[color:var(--color-primary-600)] text-white'
                    : 'bg-[color:var(--color-bg)] hover:bg-[color:var(--color-muted)]'
                }`}
              >
                <span>Forecast</span>
                <span className="text-[10px] opacity-60">ⓘ</span>
              </button>
              <button
                type="button"
                onClick={() => setView('reps')}
                title="Sales rep performance analytics including win rates, forecasted revenue, and performance scoring"
                className={`flex items-center gap-1 px-3 py-1.5 text-xs border-l border-[color:var(--color-border)] ${
                  view === 'reps'
                    ? 'bg-[color:var(--color-primary-600)] text-white'
                    : 'bg-[color:var(--color-bg)] hover:bg-[color:var(--color-muted)]'
                }`}
              >
                <span>Rep Performance</span>
                <span className="text-[10px] opacity-60">ⓘ</span>
              </button>
              <button
                type="button"
                onClick={() => setView('scenario')}
                title="Model pipeline changes by adjusting deal stages, values, and close dates to see forecast impact (coming soon)"
                className={`flex items-center gap-1 px-3 py-1.5 text-xs border-l border-[color:var(--color-border)] ${
                  view === 'scenario'
                    ? 'bg-[color:var(--color-primary-600)] text-white'
                    : 'bg-[color:var(--color-bg)] hover:bg-[color:var(--color-muted)]'
                }`}
              >
                <span>What-If Scenarios</span>
                <span className="text-[10px] opacity-60">ⓘ</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Forecast View */}
      {view === 'forecast' && forecast && (
        <>
          {/* No Data Message */}
          {forecast.summary.totalDeals === 0 && (
            <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
              <h2 className="mb-2 text-sm font-semibold text-amber-400">No Deals Found in Selected Period</h2>
              <p className="text-xs text-[color:var(--color-text-muted)] mb-3">
                Revenue Intelligence analyzes deals with close dates in the selected period. To see forecasts:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-[color:var(--color-text-muted)]">
                <li>Go to <a href="/apps/crm/deals" className="text-[color:var(--color-primary-600)] hover:underline">Deals</a> and create or edit deals</li>
                <li>Set a <strong>Forecasted Close Date</strong> for each deal (expected close date)</li>
                <li>Add an <strong>Amount</strong> (deal value)</li>
                <li>Set the <strong>Stage</strong> (Proposal, Negotiation, etc.)</li>
                <li>Return here to see AI-powered forecasts and scoring</li>
              </ul>
              <p className="mt-3 text-xs text-[color:var(--color-text-muted)]">
                Try selecting a different period above, or check if your deals have close dates set.
              </p>
            </section>
          )}

          {/* Summary Cards */}
          {forecast.summary.totalDeals > 0 && (
          <>
          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Total Pipeline</div>
              <div className="mt-1 text-2xl font-semibold">{formatCurrency(forecast.summary.totalPipeline)}</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">
                {forecast.summary.totalDeals} deals
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Weighted Pipeline</div>
              <div className="mt-1 text-2xl font-semibold">{formatCurrency(forecast.summary.weightedPipeline)}</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">AI-adjusted probability</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Closed Won</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-400">
                {formatCurrency(forecast.summary.closedWon)}
              </div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">Already closed</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Forecast (Likely)</div>
              <div className="mt-1 text-2xl font-semibold text-blue-400">
                {formatCurrency(forecast.summary.forecast.likely)}
              </div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">
                {forecast.summary.confidence.high}H / {forecast.summary.confidence.medium}M /{' '}
                {forecast.summary.confidence.low}L
              </div>
            </div>
          </section>

          {/* Forecast Range */}
          <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Forecast Range with Confidence Intervals</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                <div className="text-xs text-red-400">Pessimistic</div>
                <div className="mt-1 text-xl font-semibold text-red-300">
                  {formatCurrency(forecast.summary.forecast.pessimistic)}
                </div>
                <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">Conservative estimate</div>
              </div>
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                <div className="text-xs text-blue-400">Likely</div>
                <div className="mt-1 text-xl font-semibold text-blue-300">
                  {formatCurrency(forecast.summary.forecast.likely)}
                </div>
                <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">Most probable outcome</div>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <div className="text-xs text-emerald-400">Optimistic</div>
                <div className="mt-1 text-xl font-semibold text-emerald-300">
                  {formatCurrency(forecast.summary.forecast.optimistic)}
                </div>
                <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">Best case scenario</div>
              </div>
            </div>
          </section>

          {/* By Stage */}
          <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Pipeline by Stage</h2>
            <div className="space-y-2">
              {Object.entries(forecast.byStage).map(([stage, data]) => (
                <div
                  key={stage}
                  className="flex items-center justify-between rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getStageColor(stage as DealStage)}`}>
                      {stage}
                    </span>
                    <span className="text-xs text-[color:var(--color-text-muted)]">{data.count} deals</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-[color:var(--color-text-muted)]">Total: </span>
                      <span className="font-semibold">{formatCurrency(data.value)}</span>
                    </div>
                    <div>
                      <span className="text-[color:var(--color-text-muted)]">Weighted: </span>
                      <span className="font-semibold text-blue-400">{formatCurrency(data.weightedValue)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Deals Table */}
          <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Deals in Period ({forecast.deals.length})</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-[10px] uppercase text-[color:var(--color-text-muted)]">
                    <th className="px-2 py-2 text-left">Deal</th>
                    <th className="px-2 py-2 text-left">Stage</th>
                    <th className="px-2 py-2 text-right">Value</th>
                    <th className="px-2 py-2 text-center">AI Score</th>
                    <th className="px-2 py-2 text-center">Confidence</th>
                    <th className="px-2 py-2 text-left">Forecast Close</th>
                    <th className="px-2 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.deals.slice(0, 50).map((deal) => (
                    <tr key={deal._id} className="border-b border-[color:var(--color-border)]">
                      <td className="px-2 py-2">{deal.title || 'Untitled'}</td>
                      <td className="px-2 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getStageColor(deal.stage as DealStage)}`}>
                          {deal.stage || 'new'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-semibold">{formatCurrency(deal.amount || 0)}</td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            deal.aiScore >= 70
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : deal.aiScore >= 40
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {deal.aiScore}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getConfidenceColor(deal.aiConfidence)}`}>
                          {deal.aiConfidence}
                        </span>
                      </td>
                      <td className="px-2 py-2">{formatDateOnly(deal.forecastedCloseDate || deal.closeDate)}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => setSelectedDealId(deal._id)}
                          className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[color:var(--color-muted)]"
                        >
                          View Score
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          </>
          )}
        </>
      )}

      {/* Rep Performance View */}
      {view === 'reps' && reps && (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Total Reps</div>
              <div className="mt-1 text-2xl font-semibold">{reps.summary.totalReps}</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Total Pipeline</div>
              <div className="mt-1 text-2xl font-semibold">{formatCurrency(reps.summary.totalPipeline)}</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Total Won</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-400">{formatCurrency(reps.summary.totalWon)}</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">Avg Win Rate</div>
              <div className="mt-1 text-2xl font-semibold">{reps.summary.avgWinRate.toFixed(1)}%</div>
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Rep Performance Leaderboard</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-[10px] uppercase text-[color:var(--color-text-muted)]">
                    <th className="px-2 py-2 text-left">Rep</th>
                    <th className="px-2 py-2 text-center">Perf Score</th>
                    <th className="px-2 py-2 text-right">Forecasted</th>
                    <th className="px-2 py-2 text-center">Open</th>
                    <th className="px-2 py-2 text-center">Won</th>
                    <th className="px-2 py-2 text-center">Lost</th>
                    <th className="px-2 py-2 text-center">Win Rate</th>
                    <th className="px-2 py-2 text-right">Avg Deal</th>
                    <th className="px-2 py-2 text-right">Pipeline</th>
                  </tr>
                </thead>
                <tbody>
                  {reps.reps.map((rep) => (
                    <tr key={rep.ownerId} className="border-b border-[color:var(--color-border)]">
                      <td className="px-2 py-2 font-semibold">{rep.ownerId}</td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            rep.performanceScore >= 70
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : rep.performanceScore >= 50
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {rep.performanceScore}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-blue-400">
                        {formatCurrency(rep.forecastedRevenue)}
                      </td>
                      <td className="px-2 py-2 text-center">{rep.openDeals}</td>
                      <td className="px-2 py-2 text-center text-emerald-400">{rep.closedWon}</td>
                      <td className="px-2 py-2 text-center text-red-400">{rep.closedLost}</td>
                      <td className="px-2 py-2 text-center">{rep.winRate.toFixed(1)}%</td>
                      <td className="px-2 py-2 text-right">{formatCurrency(rep.avgDealSize)}</td>
                      <td className="px-2 py-2 text-right">{formatCurrency(rep.pipelineValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* What-If Scenario View */}
      {view === 'scenario' && forecast && (
        <>
          <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
            <h2 className="mb-3 text-sm font-semibold">What-If Scenario Modeling</h2>
            <p className="text-xs text-[color:var(--color-text-muted)] mb-4">
              Select deals below and adjust their stages, values, or close dates to see how changes impact your forecast.
            </p>
            
            {forecast.summary.totalDeals === 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-400">
                No deals available for scenario modeling. Add deals with forecasted close dates in the selected period.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                  <h3 className="text-sm font-semibold text-blue-400 mb-2">How to Use</h3>
                  <ol className="list-decimal pl-5 space-y-1 text-xs text-[color:var(--color-text-muted)]">
                    <li>Review your current deals in the table below</li>
                    <li>Click on any deal to see its AI scoring factors</li>
                    <li>Use the Forecast view to see baseline projections</li>
                    <li>Advanced scenario modeling (adjust values inline) coming in next release</li>
                  </ol>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-[color:var(--color-border)] text-[10px] uppercase text-[color:var(--color-text-muted)]">
                        <th className="px-2 py-2 text-left">Deal</th>
                        <th className="px-2 py-2 text-left">Stage</th>
                        <th className="px-2 py-2 text-right">Value</th>
                        <th className="px-2 py-2 text-center">AI Score</th>
                        <th className="px-2 py-2 text-center">Confidence</th>
                        <th className="px-2 py-2 text-left">Forecast Close</th>
                        <th className="px-2 py-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecast.deals.slice(0, 50).map((deal) => (
                        <tr key={deal._id} className="border-b border-[color:var(--color-border)]">
                          <td className="px-2 py-2">{deal.title || 'Untitled'}</td>
                          <td className="px-2 py-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getStageColor(deal.stage as DealStage)}`}>
                              {deal.stage || 'new'}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right font-semibold">{formatCurrency(deal.amount || 0)}</td>
                          <td className="px-2 py-2 text-center">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                deal.aiScore >= 70
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : deal.aiScore >= 40
                                    ? 'bg-amber-500/20 text-amber-400'
                                    : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {deal.aiScore}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getConfidenceColor(deal.aiConfidence)}`}>
                              {deal.aiConfidence}
                            </span>
                          </td>
                          <td className="px-2 py-2">{formatDateOnly(deal.forecastedCloseDate || deal.closeDate)}</td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => setSelectedDealId(deal._id)}
                              className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[color:var(--color-muted)]"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* Deal Score Detail Modal */}
      {selectedDealId && forecast && (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60">
          <div className="w-[min(90vw,48rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-2xl">
            {(() => {
              const deal = forecast.deals.find((d) => d._id === selectedDealId)
              if (!deal) return null

              return (
                <>
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">{deal.title || 'Untitled'}</h2>
                      <p className="text-xs text-[color:var(--color-text-muted)]">AI Deal Scoring Analysis</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedDealId(null)}
                      className="rounded-full px-3 py-1 text-xs text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
                    >
                      Close
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
                        <div className="text-[10px] text-[color:var(--color-text-muted)]">AI Score</div>
                        <div className="mt-1 text-2xl font-semibold">{deal.aiScore}</div>
                      </div>
                      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
                        <div className="text-[10px] text-[color:var(--color-text-muted)]">Confidence</div>
                        <div className="mt-1">
                          <span className={`rounded-full border px-2 py-1 text-xs ${getConfidenceColor(deal.aiConfidence)}`}>
                            {deal.aiConfidence}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
                        <div className="text-[10px] text-[color:var(--color-text-muted)]">Value</div>
                        <div className="mt-1 text-2xl font-semibold">{formatCurrency(deal.amount || 0)}</div>
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Scoring Factors</h3>
                      <div className="space-y-2">
                        {deal.aiFactors.map((factor, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3"
                          >
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                factor.impact > 0
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {factor.impact > 0 ? '+' : ''}
                              {factor.impact}
                            </span>
                            <div className="flex-1">
                              <div className="text-xs font-semibold">{factor.factor}</div>
                              <div className="text-[11px] text-[color:var(--color-text-muted)]">{factor.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

