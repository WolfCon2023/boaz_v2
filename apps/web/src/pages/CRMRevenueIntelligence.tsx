import * as React from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CRMNav } from '@/components/CRMNav'
import { CRMHelpButton } from '@/components/CRMHelpButton'
import { http } from '@/lib/http'
import { formatDateOnly } from '@/lib/dateFormat'

type ForecastPeriod = 'current_month' | 'current_quarter' | 'next_month' | 'next_quarter' | 'current_year' | 'next_year'
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
  createdAt?: string
  updatedAt?: string
  lastActivityAt?: string
  daysInStage?: number
  aiScore: number
  aiConfidence: 'High' | 'Medium' | 'Low'
  aiFactors: Array<{ factor: string; impact: number; description: string }>
}

type RevenueIntelligenceSettings = {
  stageWeights: Record<string, number>
  dealAge: { warnDays: number; agingDays: number; staleDays: number; warnImpact: number; agingImpact: number; staleImpact: number }
  activity: { hotDays: number; warmDays: number; coolDays: number; coldDays: number; hotImpact: number; warmImpact: number; coolImpact: number; coldImpact: number }
  account: { matureDays: number; newDays: number; matureImpact: number; newImpact: number }
  stageDuration: { warnDays: number; stuckDays: number; warnImpact: number; stuckImpact: number }
  closeDate: { overdueImpact: number; closingSoonDays: number; closingSoonImpact: number; closingSoonWarmDays: number; closingSoonWarmImpact: number }
  stalePanel: { noActivityDays: number; stuckInStageDays: number }
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
  const [ownerId, setOwnerId] = React.useState<string>(searchParams.get('ownerId') || '')
  const [startDate, setStartDate] = React.useState<string>(searchParams.get('startDate') || '')
  const [endDate, setEndDate] = React.useState<string>(searchParams.get('endDate') || '')
  const [excludeOverdue, setExcludeOverdue] = React.useState<boolean>(searchParams.get('excludeOverdue') === 'true')
  const [view, setView] = React.useState<'forecast' | 'reps' | 'scenario'>(
    (searchParams.get('view') as any) || 'forecast',
  )
  const [selectedDealId, setSelectedDealId] = React.useState<string | null>(null)
  const [showScoringSettings, setShowScoringSettings] = React.useState(false)
  const [settingsText, setSettingsText] = React.useState('')
  const [settingsError, setSettingsError] = React.useState<string | null>(null)
  
  // Scenario adjustments state
  const [scenarioAdjustments, setScenarioAdjustments] = React.useState<
    Map<string, { newStage?: string; newValue?: number; newCloseDate?: string }>
  >(new Map())
  const [editingDealId, setEditingDealId] = React.useState<string | null>(null)
  const [editStage, setEditStage] = React.useState('')
  const [editValue, setEditValue] = React.useState('')
  const [editCloseDate, setEditCloseDate] = React.useState('')

  React.useEffect(() => {
    const params = new URLSearchParams()
    params.set('period', period)
    params.set('view', view)
    if (ownerId) params.set('ownerId', ownerId)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    if (excludeOverdue) params.set('excludeOverdue', 'true')
    setSearchParams(params, { replace: true })
  }, [period, view, ownerId, startDate, endDate, excludeOverdue, setSearchParams])

  const forecastQ = useQuery({
    queryKey: ['revenue-intelligence-forecast', period, ownerId, startDate, endDate, excludeOverdue],
    queryFn: async () => {
      const res = await http.get('/api/crm/revenue-intelligence/forecast', {
        params: {
          period,
          ownerId: ownerId || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          excludeOverdue: excludeOverdue ? true : undefined,
        },
      })
      return res.data as { data: ForecastData }
    },
  })

  const settingsQ = useQuery({
    queryKey: ['revenue-intelligence-settings'],
    queryFn: async () => {
      const res = await http.get('/api/crm/revenue-intelligence/settings')
      return res.data as { data: RevenueIntelligenceSettings }
    },
  })

  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: any) => {
      const res = await http.put('/api/crm/revenue-intelligence/settings', settings)
      return res.data as { data: RevenueIntelligenceSettings }
    },
    onSuccess: () => {
      settingsQ.refetch()
      setSettingsError(null)
      setShowScoringSettings(false)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to save settings'
      setSettingsError(String(msg))
    },
  })

  async function loadRecommendedDefaults() {
    try {
      setSettingsError(null)
      const res = await http.get('/api/crm/revenue-intelligence/settings/defaults')
      const defaults = (res.data?.data ?? {}) as RevenueIntelligenceSettings
      setSettingsText(JSON.stringify(defaults, null, 2))
    } catch (e: any) {
      setSettingsError(e?.response?.data?.error || e?.message || 'Failed to load defaults')
    }
  }

  function getPeriodRange(p: ForecastPeriod, now: Date) {
    // Fiscal year begins Jan 1 (calendar year). Use half-open interval [start, endExclusive).
    let start = new Date(now.getFullYear(), now.getMonth(), 1)
    let endExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    if (p === 'current_quarter') {
      const q = Math.floor(now.getMonth() / 3)
      start = new Date(now.getFullYear(), q * 3, 1)
      endExclusive = new Date(now.getFullYear(), q * 3 + 3, 1)
    } else if (p === 'next_month') {
      start = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      endExclusive = new Date(now.getFullYear(), now.getMonth() + 2, 1)
    } else if (p === 'next_quarter') {
      const q = Math.floor(now.getMonth() / 3) + 1
      start = new Date(now.getFullYear(), q * 3, 1)
      endExclusive = new Date(now.getFullYear(), q * 3 + 3, 1)
    } else if (p === 'current_year') {
      start = new Date(now.getFullYear(), 0, 1)
      endExclusive = new Date(now.getFullYear() + 1, 0, 1)
    } else if (p === 'next_year') {
      start = new Date(now.getFullYear() + 1, 0, 1)
      endExclusive = new Date(now.getFullYear() + 2, 0, 1)
    }
    const end = new Date(endExclusive.getTime() - 1)
    return { start, end, endExclusive }
  }

  function computeRepPerformance(deals: any[]): { reps: RepPerformance[]; summary: { totalReps: number; totalPipeline: number; totalWon: number; avgWinRate: number } } {
    const byOwner = new Map<string, any>()
    for (const d of deals) {
      const owner = String(d.ownerId || 'Unassigned')
      if (!byOwner.has(owner)) {
        byOwner.set(owner, {
          ownerId: owner,
          totalDeals: 0,
          openDeals: 0,
          closedWon: 0,
          closedLost: 0,
          totalValue: 0,
          wonValue: 0,
          lostValue: 0,
          pipelineValue: 0,
        })
      }
      const r = byOwner.get(owner)
      const amt = Number(d.amount || 0) || 0
      const stage = String(d.stage || '')
      r.totalDeals++
      r.totalValue += amt
      const isWon = stage === 'Contract Signed / Closed Won' || stage === 'Closed Won'
      const isLost = stage === 'Closed Lost'
      if (isWon) {
        r.closedWon++
        r.wonValue += amt
      } else if (isLost) {
        r.closedLost++
        r.lostValue += amt
      } else {
        r.openDeals++
        r.pipelineValue += amt
      }
    }

    const reps: RepPerformance[] = Array.from(byOwner.values()).map((rep: any) => {
      const decided = rep.closedWon + rep.closedLost
      const winRate = decided > 0 ? (rep.closedWon / decided) * 100 : 0
      const avgDealSize = rep.totalDeals > 0 ? rep.totalValue / rep.totalDeals : 0
      const forecastedRevenue = rep.wonValue + (rep.pipelineValue * (winRate / 100))

      let perfScore = 50
      if (winRate >= 50) perfScore += 20
      else if (winRate >= 30) perfScore += 10
      else if (winRate < 20) perfScore -= 10

      if (avgDealSize > 50000) perfScore += 15
      else if (avgDealSize > 25000) perfScore += 10
      else if (avgDealSize < 10000) perfScore -= 5

      if (rep.openDeals > 10) perfScore += 10
      else if (rep.openDeals > 5) perfScore += 5
      else if (rep.openDeals < 3) perfScore -= 10

      return {
        ownerId: rep.ownerId,
        totalDeals: rep.totalDeals,
        openDeals: rep.openDeals,
        closedWon: rep.closedWon,
        closedLost: rep.closedLost,
        totalValue: rep.totalValue,
        wonValue: rep.wonValue,
        lostValue: rep.lostValue,
        pipelineValue: rep.pipelineValue,
        avgDealSize,
        winRate,
        forecastedRevenue,
        performanceScore: Math.max(0, Math.min(100, perfScore)),
      }
    })

    reps.sort((a, b) => b.forecastedRevenue - a.forecastedRevenue)

    const summary = {
      totalReps: reps.length,
      totalPipeline: reps.reduce((s, r) => s + (r.pipelineValue || 0), 0),
      totalWon: reps.reduce((s, r) => s + (r.wonValue || 0), 0),
      avgWinRate: reps.length ? reps.reduce((s, r) => s + (r.winRate || 0), 0) / reps.length : 0,
    }
    return { reps, summary }
  }

  const repsQ = useQuery({
    queryKey: ['revenue-intelligence-reps', period],
    enabled: view === 'reps',
    queryFn: async () => {
      // Compute rep performance client-side from deals to avoid backend period/range mismatches in deployed envs.
      // This uses forecastedCloseDate (preferred) and falls back to closeDate.
      const res = await http.get('/api/crm/deals', { params: { limit: 2000, sort: 'updatedAt', dir: 'desc' } })
      const items = (res.data?.data?.items ?? []) as any[]
      const now = new Date()
      const hasCustom = !!startDate && !!endDate
      const start = hasCustom ? new Date(`${startDate}T00:00:00`) : getPeriodRange(period, now).start
      const endExclusive = hasCustom ? new Date(new Date(`${endDate}T00:00:00`).getTime() + 24 * 60 * 60 * 1000) : getPeriodRange(period, now).endExclusive
      const end = hasCustom ? new Date(endExclusive.getTime() - 1) : getPeriodRange(period, now).end
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      const inPeriod = items.filter((d) => {
        const rawDate = d.forecastedCloseDate || d.closeDate
        if (!rawDate) return false
        const dt = new Date(rawDate)
        const t = dt.getTime()
        if (!Number.isFinite(t)) return false
        if (!(dt >= start && dt < endExclusive)) return false
        if (excludeOverdue && dt < todayStart) return false
        return true
      })

      const computed = computeRepPerformance(inPeriod)
      return {
        data: {
          period,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          reps: computed.reps,
          summary: computed.summary,
        },
      }
    },
  })

  // Fetch users for name resolution
  const usersQ = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => {
      const res = await http.get('/api/auth/users')
      return res.data as { data: { items: Array<{ _id: string; name: string; email: string }> } }
    },
  })

  const forecast = forecastQ.data?.data
  const reps = repsQ.data?.data
  const users = usersQ.data?.data.items ?? []
  const userById = React.useMemo(() => new Map(users.map((u) => [u._id, u])), [users])
  const riSettings = settingsQ.data?.data

  const pipelineDealsForUi = React.useMemo(() => {
    if (!forecast?.deals) return []
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return forecast.deals.filter((d) => {
      const stage = String(d.stage || '')
      const isWon = stage === 'Contract Signed / Closed Won' || stage === 'Closed Won'
      const isLost = stage === 'Closed Lost'
      if (isWon || isLost) return false
      if (!excludeOverdue) return true
      const raw = d.forecastedCloseDate || d.closeDate
      if (!raw) return true
      const dt = new Date(raw)
      if (!Number.isFinite(dt.getTime())) return true
      return dt >= todayStart
    })
  }, [forecast?.deals, excludeOverdue])

  const atRisk = React.useMemo(() => {
    if (!forecast?.deals) return null
    const s = riSettings?.stalePanel
    const noActivityDays = s?.noActivityDays ?? 30
    const stuckInStageDays = s?.stuckInStageDays ?? 30

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const msDay = 24 * 60 * 60 * 1000

    const overdue = pipelineDealsForUi.filter((d) => {
      const raw = d.forecastedCloseDate || d.closeDate
      if (!raw) return false
      const dt = new Date(raw)
      if (!Number.isFinite(dt.getTime())) return false
      return dt < todayStart
    })

    const noActivity = pipelineDealsForUi.filter((d) => {
      const raw = d.lastActivityAt || d.updatedAt || d.createdAt
      if (!raw) return false
      const dt = new Date(raw)
      if (!Number.isFinite(dt.getTime())) return false
      const days = Math.floor((now.getTime() - dt.getTime()) / msDay)
      return days >= noActivityDays
    })

    const stuck = pipelineDealsForUi.filter((d) => {
      const days = Number(d.daysInStage)
      if (!Number.isFinite(days)) return false
      return days >= stuckInStageDays
    })

    // Build a de-duped list of rows (prioritize Overdue > No activity > Stuck)
    const rowMap = new Map<string, { d: Deal; risk: 'Overdue' | 'No activity' | 'Stuck in stage' }>()
    for (const d of overdue) rowMap.set(d._id, { d, risk: 'Overdue' })
    for (const d of noActivity) if (!rowMap.has(d._id)) rowMap.set(d._id, { d, risk: 'No activity' })
    for (const d of stuck) if (!rowMap.has(d._id)) rowMap.set(d._id, { d, risk: 'Stuck in stage' })
    const rows = Array.from(rowMap.values()).slice(0, 15)

    return {
      noActivityDays,
      stuckInStageDays,
      overdue,
      noActivity,
      stuck,
      rows,
    }
  }, [forecast?.deals, pipelineDealsForUi, riSettings?.stalePanel])

  const drivers = React.useMemo(() => {
    if (!forecast?.deals) return null
    const pipeline = pipelineDealsForUi
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const overdueCount = pipeline.filter((d) => {
      const raw = d.forecastedCloseDate || d.closeDate
      if (!raw) return false
      const dt = new Date(raw)
      if (!Number.isFinite(dt.getTime())) return false
      return dt < todayStart
    }).length

    const high = pipeline.filter((d) => d.aiConfidence === 'High').length
    const med = pipeline.filter((d) => d.aiConfidence === 'Medium').length
    const low = pipeline.filter((d) => d.aiConfidence === 'Low').length

    const factorTotals = new Map<string, number>()
    for (const d of pipeline) {
      for (const f of d.aiFactors || []) {
        factorTotals.set(f.factor, (factorTotals.get(f.factor) || 0) + (Number(f.impact) || 0))
      }
    }
    const factorList = Array.from(factorTotals.entries()).map(([factor, totalImpact]) => ({ factor, totalImpact }))
    const topPositive = factorList.filter((x) => x.totalImpact > 0).sort((a, b) => b.totalImpact - a.totalImpact).slice(0, 3)
    const topNegative = factorList.filter((x) => x.totalImpact < 0).sort((a, b) => a.totalImpact - b.totalImpact).slice(0, 3)

    return {
      pipelineDeals: pipeline.length,
      overdueCount,
      confidence: { high, medium: med, low },
      topPositive,
      topNegative,
    }
  }, [forecast?.deals, pipelineDealsForUi])

  // Scenario mutation
  const scenarioMutation = useMutation({
    mutationFn: async (adjustments: Array<{ dealId: string; newStage?: string; newValue?: number; newCloseDate?: string }>) => {
      const res = await http.post('/api/crm/revenue-intelligence/scenario', {
        period,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        excludeOverdue,
        adjustments,
      })
      return res.data as {
        data: {
          baseline: ForecastData['summary']
          scenario: {
            totalDeals: number
            totalPipeline: number
            weightedPipeline: number
            closedWon: number
            forecast: { pessimistic: number; likely: number; optimistic: number }
          }
          delta: {
            totalPipeline: number
            weightedPipeline: number
            pessimistic: number
            likely: number
            optimistic: number
          }
        }
      }
    },
  })

  function startEditDeal(deal: Deal) {
    setEditingDealId(deal._id)
    const existing = scenarioAdjustments.get(deal._id)
    setEditStage(existing?.newStage || deal.stage || '')
    setEditValue(String(existing?.newValue !== undefined ? existing.newValue : deal.amount || ''))
    setEditCloseDate(existing?.newCloseDate || deal.forecastedCloseDate || deal.closeDate || '')
  }

  function saveScenarioAdjustment(dealId: string) {
    const newAdj = new Map(scenarioAdjustments)
    const deal = forecast?.deals.find((d) => d._id === dealId)
    if (!deal) return

    const changes: any = {}
    if (editStage && editStage !== deal.stage) changes.newStage = editStage
    if (editValue && Number(editValue) !== deal.amount) changes.newValue = Number(editValue)
    if (editCloseDate && editCloseDate !== (deal.forecastedCloseDate || deal.closeDate)) changes.newCloseDate = editCloseDate

    if (Object.keys(changes).length > 0) {
      newAdj.set(dealId, changes)
    } else {
      newAdj.delete(dealId)
    }

    setScenarioAdjustments(newAdj)
    setEditingDealId(null)
  }

  function cancelEdit() {
    setEditingDealId(null)
    setEditStage('')
    setEditValue('')
    setEditCloseDate('')
  }

  function clearScenario() {
    setScenarioAdjustments(new Map())
    scenarioMutation.reset()
  }

  function runScenario() {
    const adjustments = Array.from(scenarioAdjustments.entries()).map(([dealId, changes]) => ({
      dealId,
      ...changes,
    }))
    scenarioMutation.mutate(adjustments)
  }

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
          <CRMHelpButton tag="crm:revenue-intelligence" />
          <button
            type="button"
            onClick={() => {
              setSettingsError(null)
              setShowScoringSettings(true)
              const current = settingsQ.data?.data
              setSettingsText(current ? JSON.stringify(current, null, 2) : '')
            }}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
            title="View/edit AI scoring settings (admin only)"
          >
            Scoring settings
          </button>
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
              <option value="next_year">Next Year</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-[color:var(--color-text-muted)]">Owner</label>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-xs"
            >
              <option value="">All</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name || u.email}
                </option>
              ))}
              <option value="Unassigned">Unassigned</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-[color:var(--color-text-muted)]">Start</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[color:var(--color-text-muted)]">End</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-xs"
            />
          </div>
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => {
                setStartDate('')
                setEndDate('')
              }}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
              title="Clear custom date range"
            >
              Clear dates
            </button>
          )}

          <label className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={excludeOverdue}
              onChange={(e) => setExcludeOverdue(e.target.checked)}
              className="h-4 w-4 accent-[color:var(--color-primary-600)]"
            />
            Exclude overdue
          </label>
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
          <div className="text-[11px] text-[color:var(--color-text-muted)]">
            Range:{' '}
            <span className="font-semibold text-[color:var(--color-text)]">
              {formatDateOnly((view === 'reps' ? reps?.startDate : forecast?.startDate) || '')}
            </span>
            {' '}→{' '}
            <span className="font-semibold text-[color:var(--color-text)]">
              {formatDateOnly((view === 'reps' ? reps?.endDate : forecast?.endDate) || '')}
            </span>
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
              <div className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                <span>Total Pipeline</span>
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                  title="Total value of open (not Closed Won/Lost) deals in the selected period."
                >
                  ?
                </span>
              </div>
              <div className="mt-1 text-2xl font-semibold">{formatCurrency(forecast.summary.totalPipeline)}</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">
                {forecast.summary.totalDeals} deals
              </div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                <span>Weighted Pipeline</span>
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                  title="AI-weighted value of open pipeline: sum(amount × AI score%). Closed Won is excluded."
                >
                  ?
                </span>
              </div>
              <div className="mt-1 text-2xl font-semibold">{formatCurrency(forecast.summary.weightedPipeline)}</div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">AI-adjusted probability</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                <span>Closed Won</span>
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                  title="Total value of deals already marked Closed Won in the selected period."
                >
                  ?
                </span>
              </div>
              <div className="mt-1 text-2xl font-semibold text-emerald-400">
                {formatCurrency(forecast.summary.closedWon)}
              </div>
              <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">Already closed</div>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                <span>Forecast (Likely)</span>
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[10px] text-[color:var(--color-text-muted)]"
                  title="Likely forecast = Closed Won + probability-weighted open pipeline based on AI confidence buckets."
                >
                  ?
                </span>
              </div>
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
                <div className="flex items-center gap-2 text-xs text-red-400">
                  <span>Pessimistic</span>
                  <span
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-red-500/40 text-[10px] text-red-300"
                    title="Conservative estimate: includes Closed Won + a low share of open pipeline by confidence."
                  >
                    ?
                  </span>
                </div>
                <div className="mt-1 text-xl font-semibold text-red-300">
                  {formatCurrency(forecast.summary.forecast.pessimistic)}
                </div>
                <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">Conservative estimate</div>
              </div>
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                <div className="flex items-center gap-2 text-xs text-blue-400">
                  <span>Likely</span>
                  <span
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-blue-500/40 text-[10px] text-blue-300"
                    title="Most probable estimate: includes Closed Won + a medium share of open pipeline by confidence."
                  >
                    ?
                  </span>
                </div>
                <div className="mt-1 text-xl font-semibold text-blue-300">
                  {formatCurrency(forecast.summary.forecast.likely)}
                </div>
                <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">Most probable outcome</div>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <span>Optimistic</span>
                  <span
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-emerald-500/40 text-[10px] text-emerald-300"
                    title="Best-case estimate: includes Closed Won + a high share of open pipeline by confidence."
                  >
                    ?
                  </span>
                </div>
                <div className="mt-1 text-xl font-semibold text-emerald-300">
                  {formatCurrency(forecast.summary.forecast.optimistic)}
                </div>
                <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">Best case scenario</div>
              </div>
            </div>
          </section>

          {/* Top Drivers */}
          {drivers && (
            <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <h2 className="mb-3 text-sm font-semibold">Top Drivers (Why this forecast looks the way it does)</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 text-xs">
                  <div className="mb-2 font-semibold">Pipeline composition</div>
                  <div className="space-y-1 text-[color:var(--color-text-muted)]">
                    <div><span className="text-[color:var(--color-text)] font-semibold">{drivers.pipelineDeals}</span> open pipeline deals in range</div>
                    <div><span className="text-[color:var(--color-text)] font-semibold">{drivers.confidence.high}</span> high / <span className="text-[color:var(--color-text)] font-semibold">{drivers.confidence.medium}</span> medium / <span className="text-[color:var(--color-text)] font-semibold">{drivers.confidence.low}</span> low confidence deals</div>
                    <div><span className="text-[color:var(--color-text)] font-semibold">{drivers.overdueCount}</span> overdue close dates (if included)</div>
                  </div>
                </div>
                <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 text-xs">
                  <div className="mb-2 font-semibold">AI scoring drivers (aggregated)</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-emerald-400">Top positive</div>
                      <div className="space-y-1">
                        {drivers.topPositive.length ? drivers.topPositive.map((x) => (
                          <div key={x.factor} className="flex items-center justify-between text-[color:var(--color-text-muted)]">
                            <span className="truncate">{x.factor}</span>
                            <span className="ml-2 text-emerald-400 font-semibold">+{x.totalImpact}</span>
                          </div>
                        )) : <div className="text-[color:var(--color-text-muted)]">—</div>}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-red-400">Top negative</div>
                      <div className="space-y-1">
                        {drivers.topNegative.length ? drivers.topNegative.map((x) => (
                          <div key={x.factor} className="flex items-center justify-between text-[color:var(--color-text-muted)]">
                            <span className="truncate">{x.factor}</span>
                            <span className="ml-2 text-red-400 font-semibold">{x.totalImpact}</span>
                          </div>
                        )) : <div className="text-[color:var(--color-text-muted)]">—</div>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Stale / At-Risk Deals */}
          {atRisk && (
            <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Stale / At-Risk Deals</h2>
                  <p className="text-xs text-[color:var(--color-text-muted)]">
                    Flags open pipeline deals with overdue close dates, no activity for {atRisk.noActivityDays}+ days, or stuck in stage for {atRisk.stuckInStageDays}+ days.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <div className="text-xs text-red-300">Overdue close date</div>
                  <div className="mt-1 text-2xl font-semibold text-red-200">{atRisk.overdue.length}</div>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="text-xs text-amber-300">No activity</div>
                  <div className="mt-1 text-2xl font-semibold text-amber-200">{atRisk.noActivity.length}</div>
                </div>
                <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
                  <div className="text-xs text-purple-300">Stuck in stage</div>
                  <div className="mt-1 text-2xl font-semibold text-purple-200">{atRisk.stuck.length}</div>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)] text-[10px] uppercase text-[color:var(--color-text-muted)]">
                      <th className="px-2 py-2 text-left">Deal</th>
                      <th className="px-2 py-2 text-left">Stage</th>
                      <th className="px-2 py-2 text-right">Value</th>
                      <th className="px-2 py-2 text-left">Forecast Close</th>
                      <th className="px-2 py-2 text-left">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atRisk.rows.map(({ d, risk }) => (
                        <tr key={d._id} className="border-b border-[color:var(--color-border)]">
                          <td className="px-2 py-2">{d.title || 'Untitled'}</td>
                          <td className="px-2 py-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getStageColor(d.stage as DealStage)}`}>
                              {d.stage || 'new'}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right font-semibold">{formatCurrency(d.amount || 0)}</td>
                          <td className="px-2 py-2">{formatDateOnly(d.forecastedCloseDate || d.closeDate)}</td>
                          <td className="px-2 py-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                              risk === 'Overdue'
                                ? 'border-red-500/40 bg-red-500/10 text-red-300'
                                : risk === 'No activity'
                                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                  : 'border-purple-500/40 bg-purple-500/10 text-purple-300'
                            }`}>
                              {risk}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

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
                  {reps.reps.map((rep) => {
                    const user = userById.get(rep.ownerId)
                    const repName = user ? user.name : rep.ownerId
                    return (
                    <tr key={rep.ownerId} className="border-b border-[color:var(--color-border)]">
                      <td className="px-2 py-2 font-semibold">{repName}</td>
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
                  )
                  })}
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
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold">What-If Scenario Modeling</h2>
                <p className="text-xs text-[color:var(--color-text-muted)]">
                  Adjust deal values to see forecast impact. Changes are temporary and don't affect actual deals.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {scenarioAdjustments.size > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={clearScenario}
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                    >
                      Clear ({scenarioAdjustments.size})
                    </button>
                    <button
                      type="button"
                      onClick={runScenario}
                      disabled={scenarioMutation.isPending}
                      className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-1.5 text-xs text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                    >
                      {scenarioMutation.isPending ? 'Calculating...' : 'Run Scenario'}
                    </button>
                  </>
                )}
              </div>
            </div>
            
            {forecast.summary.totalDeals === 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-400">
                No deals available for scenario modeling. Add deals with forecasted close dates in the selected period.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Scenario Results */}
                {scenarioMutation.data && (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-blue-400">Scenario Impact</h3>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
                        <div className="text-[10px] text-[color:var(--color-text-muted)]">Pessimistic</div>
                        <div className="mt-1 text-lg font-semibold">
                          {formatCurrency(scenarioMutation.data.data.scenario.forecast.pessimistic)}
                        </div>
                        <div className="mt-1 text-[10px]">
                          <span className={scenarioMutation.data.data.delta.pessimistic >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {scenarioMutation.data.data.delta.pessimistic >= 0 ? '+' : ''}
                            {formatCurrency(scenarioMutation.data.data.delta.pessimistic)}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
                        <div className="text-[10px] text-[color:var(--color-text-muted)]">Likely</div>
                        <div className="mt-1 text-lg font-semibold text-blue-400">
                          {formatCurrency(scenarioMutation.data.data.scenario.forecast.likely)}
                        </div>
                        <div className="mt-1 text-[10px]">
                          <span className={scenarioMutation.data.data.delta.likely >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {scenarioMutation.data.data.delta.likely >= 0 ? '+' : ''}
                            {formatCurrency(scenarioMutation.data.data.delta.likely)}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
                        <div className="text-[10px] text-[color:var(--color-text-muted)]">Optimistic</div>
                        <div className="mt-1 text-lg font-semibold text-emerald-400">
                          {formatCurrency(scenarioMutation.data.data.scenario.forecast.optimistic)}
                        </div>
                        <div className="mt-1 text-[10px]">
                          <span className={scenarioMutation.data.data.delta.optimistic >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {scenarioMutation.data.data.delta.optimistic >= 0 ? '+' : ''}
                            {formatCurrency(scenarioMutation.data.data.delta.optimistic)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-[color:var(--color-border)] text-[10px] uppercase text-[color:var(--color-text-muted)]">
                        <th className="px-2 py-2 text-left">Deal</th>
                        <th className="px-2 py-2 text-left">Stage</th>
                        <th className="px-2 py-2 text-right">Value</th>
                        <th className="px-2 py-2 text-left">Forecast Close</th>
                        <th className="px-2 py-2 text-center">AI Score</th>
                        <th className="px-2 py-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecast.deals.slice(0, 50).map((deal) => {
                        const isEditing = editingDealId === deal._id
                        const hasAdjustment = scenarioAdjustments.has(deal._id)
                        const adjustment = scenarioAdjustments.get(deal._id)

                        return (
                          <tr
                            key={deal._id}
                            className={`border-b border-[color:var(--color-border)] ${hasAdjustment ? 'bg-blue-500/5' : ''}`}
                          >
                            <td className="px-2 py-2">
                              {deal.title || 'Untitled'}
                              {hasAdjustment && (
                                <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-blue-400" title="Modified" />
                              )}
                            </td>
                            <td className="px-2 py-2">
                              {isEditing ? (
                                <select
                                  value={editStage}
                                  onChange={(e) => setEditStage(e.target.value)}
                                  className="w-full rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-xs"
                                >
                                  <option value="new">new</option>
                                  <option value="Draft / Deal Created">Draft / Deal Created</option>
                                  <option value="Submitted for Review">Submitted for Review</option>
                                  <option value="Initial Validation">Initial Validation</option>
                                  <option value="Manager Approval">Manager Approval</option>
                                  <option value="Finance Approval">Finance Approval</option>
                                  <option value="Legal Review">Legal Review</option>
                                  <option value="Executive Approval">Executive Approval</option>
                                  <option value="Approved / Ready for Signature">Approved / Ready for Signature</option>
                                  <option value="Proposal">Proposal</option>
                                  <option value="Negotiation">Negotiation</option>
                                  <option value="Contract Signed / Closed Won">Contract Signed / Closed Won</option>
                                  <option value="Closed Lost">Closed Lost</option>
                                </select>
                              ) : (
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getStageColor((adjustment?.newStage || deal.stage) as DealStage)}`}>
                                  {adjustment?.newStage || deal.stage || 'new'}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="w-full rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-xs text-right"
                                />
                              ) : (
                                <span className="font-semibold">
                                  {formatCurrency(adjustment?.newValue !== undefined ? adjustment.newValue : deal.amount || 0)}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              {isEditing ? (
                                <input
                                  type="date"
                                  value={editCloseDate ? editCloseDate.slice(0, 10) : ''}
                                  onChange={(e) => setEditCloseDate(e.target.value)}
                                  className="w-full rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-xs"
                                />
                              ) : (
                                formatDateOnly(adjustment?.newCloseDate || deal.forecastedCloseDate || deal.closeDate)
                              )}
                            </td>
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
                            <td className="px-2 py-2">
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => saveScenarioAdjustment(deal._id)}
                                    className="rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-500/20"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[color:var(--color-muted)]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => startEditDeal(deal)}
                                    className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[color:var(--color-muted)]"
                                  >
                                    {hasAdjustment ? 'Edit' : 'Adjust'}
                                  </button>
                                  {hasAdjustment && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newAdj = new Map(scenarioAdjustments)
                                        newAdj.delete(deal._id)
                                        setScenarioAdjustments(newAdj)
                                      }}
                                      className="rounded border border-red-500/50 px-2 py-0.5 text-[10px] text-red-400 hover:bg-red-500/10"
                                    >
                                      Reset
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
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

      {/* Scoring Settings Modal */}
      {showScoringSettings && (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 p-4">
          <div className="w-[min(90vw,56rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Revenue Intelligence – Scoring Settings</h2>
                <p className="text-xs text-[color:var(--color-text-muted)]">
                  Admin only. Edit JSON and save to apply immediately to AI scoring.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowScoringSettings(false)}
                className="rounded-full px-3 py-1 text-xs text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
              >
                Close
              </button>
            </div>

            {settingsError && (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                {settingsError}
              </div>
            )}

            <textarea
              value={settingsText}
              onChange={(e) => setSettingsText(e.target.value)}
              className="w-full min-h-[320px] rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 font-mono text-[11px] text-[color:var(--color-text)]"
              placeholder={riSettings ? JSON.stringify(riSettings, null, 2) : 'Loading settings…'}
            />

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={loadRecommendedDefaults}
                className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
                title="Load recommended BOAZ-OS defaults"
              >
                Load recommended defaults
              </button>
              <button
                type="button"
                onClick={() => {
                  const current = settingsQ.data?.data
                  setSettingsText(current ? JSON.stringify(current, null, 2) : '')
                  setSettingsError(null)
                }}
                className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
              >
                Reset changes
              </button>
              <button
                type="button"
                disabled={saveSettingsMutation.isPending}
                onClick={() => {
                  try {
                    const parsed = JSON.parse(settingsText || '{}')
                    setSettingsError(null)
                    saveSettingsMutation.mutate(parsed)
                  } catch (e: any) {
                    setSettingsError(`Invalid JSON: ${e?.message || 'Parse error'}`)
                  }
                }}
                className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-xs font-semibold text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
              >
                {saveSettingsMutation.isPending ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

