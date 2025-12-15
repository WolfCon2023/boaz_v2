import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { requireAuth } from '../auth/rbac.js'
import { requirePermission } from '../auth/rbac.js'

export const revenueIntelligenceRouter = Router()

revenueIntelligenceRouter.use(requireAuth)

type DealStage = 'Lead' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Closed Won' | 'Closed Lost'

type DealDoc = {
  _id: string
  accountId?: string
  title?: string
  amount?: number
  stage?: string
  closeDate?: Date
  ownerId?: string
  createdAt?: Date
  updatedAt?: Date
  lastActivityAt?: Date
  daysInStage?: number
  dealNumber?: number
  approver?: string
}

type ForecastPeriod = 'current_month' | 'current_quarter' | 'next_month' | 'next_quarter' | 'current_year' | 'next_year'

type RevenueIntelligenceSettings = {
  // Stage scoring weights (impact on AI score, -100..100)
  stageWeights: Record<string, number>

  // Deal age thresholds (days) and impacts
  dealAge: { warnDays: number; agingDays: number; staleDays: number; warnImpact: number; agingImpact: number; staleImpact: number }

  // Activity recency thresholds (days) and impacts
  activity: { hotDays: number; warmDays: number; coolDays: number; coldDays: number; hotImpact: number; warmImpact: number; coolImpact: number; coldImpact: number }

  // Account maturity thresholds (days) and impacts
  account: { matureDays: number; newDays: number; matureImpact: number; newImpact: number }

  // Days in stage thresholds (days) and impacts
  stageDuration: { warnDays: number; stuckDays: number; warnImpact: number; stuckImpact: number }

  // Close-date proximity boosts/penalties
  closeDate: { overdueImpact: number; closingSoonDays: number; closingSoonImpact: number; closingSoonWarmDays: number; closingSoonWarmImpact: number }

  // Used for Stale / At-risk panels
  stalePanel: { noActivityDays: number; stuckInStageDays: number }
}

const DEFAULT_RI_SETTINGS: RevenueIntelligenceSettings = {
  stageWeights: {
    new: -10,
    'Draft / Deal Created': -10,
    Lead: -10,
    Qualified: 0,
    'Initial Validation': 2,
    'Manager Approval': 4,
    'Finance Approval': 6,
    'Legal Review': 8,
    'Executive Approval': 10,
    'Sent for Signature': 14,
    Proposal: 10,
    Negotiation: 15,
    'Submitted for Review': 6,
    'Approved / Ready for Signature': 12,
    'Contract Signed / Closed Won': 0,
    'Closed Won': 0,
    'Closed Lost': 0,
  },
  dealAge: { warnDays: 60, agingDays: 90, staleDays: 180, warnImpact: -3, agingImpact: -8, staleImpact: -15 },
  activity: { hotDays: 7, warmDays: 14, coolDays: 21, coldDays: 30, hotImpact: 10, warmImpact: 5, coolImpact: -6, coldImpact: -12 },
  account: { matureDays: 365, newDays: 30, matureImpact: 8, newImpact: -5 },
  stageDuration: { warnDays: 30, stuckDays: 60, warnImpact: -5, stuckImpact: -10 },
  closeDate: { overdueImpact: -20, closingSoonDays: 7, closingSoonImpact: 12, closingSoonWarmDays: 14, closingSoonWarmImpact: 8 },
  stalePanel: { noActivityDays: 30, stuckInStageDays: 60 },
}

async function getRevenueIntelligenceSettings(db: any): Promise<RevenueIntelligenceSettings> {
  const doc = await db.collection('revenue_intelligence_settings').findOne({ _id: 'default' } as any)
  const raw = (doc as any)?.settings ?? doc
  if (!raw || typeof raw !== 'object') return DEFAULT_RI_SETTINGS

  const safeNum = (v: any, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  const safeObj = (v: any) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)

  const stageWeightsRaw = safeObj((raw as any).stageWeights) || {}
  const stageWeights: Record<string, number> = { ...DEFAULT_RI_SETTINGS.stageWeights }
  for (const [k, v] of Object.entries(stageWeightsRaw)) stageWeights[k] = safeNum(v, stageWeights[k] ?? 0)

  const dealAgeRaw = safeObj((raw as any).dealAge) || {}
  const activityRaw = safeObj((raw as any).activity) || {}
  const accountRaw = safeObj((raw as any).account) || {}
  const stageDurationRaw = safeObj((raw as any).stageDuration) || {}
  const closeDateRaw = safeObj((raw as any).closeDate) || {}
  const stalePanelRaw = safeObj((raw as any).stalePanel) || {}

  return {
    stageWeights,
    dealAge: {
      warnDays: safeNum((dealAgeRaw as any).warnDays, DEFAULT_RI_SETTINGS.dealAge.warnDays),
      agingDays: safeNum((dealAgeRaw as any).agingDays, DEFAULT_RI_SETTINGS.dealAge.agingDays),
      staleDays: safeNum((dealAgeRaw as any).staleDays, DEFAULT_RI_SETTINGS.dealAge.staleDays),
      warnImpact: safeNum((dealAgeRaw as any).warnImpact, DEFAULT_RI_SETTINGS.dealAge.warnImpact),
      agingImpact: safeNum((dealAgeRaw as any).agingImpact, DEFAULT_RI_SETTINGS.dealAge.agingImpact),
      staleImpact: safeNum((dealAgeRaw as any).staleImpact, DEFAULT_RI_SETTINGS.dealAge.staleImpact),
    },
    activity: {
      hotDays: safeNum((activityRaw as any).hotDays, DEFAULT_RI_SETTINGS.activity.hotDays),
      warmDays: safeNum((activityRaw as any).warmDays, DEFAULT_RI_SETTINGS.activity.warmDays),
      coolDays: safeNum((activityRaw as any).coolDays, DEFAULT_RI_SETTINGS.activity.coolDays),
      coldDays: safeNum((activityRaw as any).coldDays, DEFAULT_RI_SETTINGS.activity.coldDays),
      hotImpact: safeNum((activityRaw as any).hotImpact, DEFAULT_RI_SETTINGS.activity.hotImpact),
      warmImpact: safeNum((activityRaw as any).warmImpact, DEFAULT_RI_SETTINGS.activity.warmImpact),
      coolImpact: safeNum((activityRaw as any).coolImpact, DEFAULT_RI_SETTINGS.activity.coolImpact),
      coldImpact: safeNum((activityRaw as any).coldImpact, DEFAULT_RI_SETTINGS.activity.coldImpact),
    },
    account: {
      matureDays: safeNum((accountRaw as any).matureDays, DEFAULT_RI_SETTINGS.account.matureDays),
      newDays: safeNum((accountRaw as any).newDays, DEFAULT_RI_SETTINGS.account.newDays),
      matureImpact: safeNum((accountRaw as any).matureImpact, DEFAULT_RI_SETTINGS.account.matureImpact),
      newImpact: safeNum((accountRaw as any).newImpact, DEFAULT_RI_SETTINGS.account.newImpact),
    },
    stageDuration: {
      warnDays: safeNum((stageDurationRaw as any).warnDays, DEFAULT_RI_SETTINGS.stageDuration.warnDays),
      stuckDays: safeNum((stageDurationRaw as any).stuckDays, DEFAULT_RI_SETTINGS.stageDuration.stuckDays),
      warnImpact: safeNum((stageDurationRaw as any).warnImpact, DEFAULT_RI_SETTINGS.stageDuration.warnImpact),
      stuckImpact: safeNum((stageDurationRaw as any).stuckImpact, DEFAULT_RI_SETTINGS.stageDuration.stuckImpact),
    },
    closeDate: {
      overdueImpact: safeNum((closeDateRaw as any).overdueImpact, DEFAULT_RI_SETTINGS.closeDate.overdueImpact),
      closingSoonDays: safeNum((closeDateRaw as any).closingSoonDays, DEFAULT_RI_SETTINGS.closeDate.closingSoonDays),
      closingSoonImpact: safeNum((closeDateRaw as any).closingSoonImpact, DEFAULT_RI_SETTINGS.closeDate.closingSoonImpact),
      closingSoonWarmDays: safeNum((closeDateRaw as any).closingSoonWarmDays, DEFAULT_RI_SETTINGS.closeDate.closingSoonWarmDays),
      closingSoonWarmImpact: safeNum((closeDateRaw as any).closingSoonWarmImpact, DEFAULT_RI_SETTINGS.closeDate.closingSoonWarmImpact),
    },
    stalePanel: {
      noActivityDays: safeNum((stalePanelRaw as any).noActivityDays, DEFAULT_RI_SETTINGS.stalePanel.noActivityDays),
      stuckInStageDays: safeNum((stalePanelRaw as any).stuckInStageDays, DEFAULT_RI_SETTINGS.stalePanel.stuckInStageDays),
    },
  }
}

// GET /api/crm/revenue-intelligence/settings (read-only for authenticated users)
revenueIntelligenceRouter.get('/settings', async (_req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const settings = await getRevenueIntelligenceSettings(db)
  res.json({ data: settings, error: null })
})

// GET /api/crm/revenue-intelligence/settings/defaults (recommended defaults shipped with BOAZ-OS)
revenueIntelligenceRouter.get('/settings/defaults', async (_req, res) => {
  res.json({ data: DEFAULT_RI_SETTINGS, error: null })
})

// PUT /api/crm/revenue-intelligence/settings (admin-only)
revenueIntelligenceRouter.put('/settings', requirePermission('*'), async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const incoming = req.body ?? {}
  // Store as-is (we sanitize on read). Keep updatedAt for auditing.
  await db.collection('revenue_intelligence_settings').updateOne(
    { _id: 'default' } as any,
    { $set: { _id: 'default', settings: incoming, updatedAt: new Date() } },
    { upsert: true },
  )
  const settings = await getRevenueIntelligenceSettings(db)
  res.json({ data: settings, error: null })
})

// POST /api/crm/revenue-intelligence/backfill (admin-only)
// Repairs legacy deal fields used by scoring/forecasting so dashboards don't show gaps.
revenueIntelligenceRouter.post('/backfill', requirePermission('*'), async (_req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const coll = db.collection('deals')
  const query: any = {
    $or: [
      { lastActivityAt: { $exists: false } },
      { stageChangedAt: { $exists: false } },
      { forecastedCloseDate: { $type: 'string' } },
      { closeDate: { $type: 'string' } },
      { createdAt: { $type: 'string' } },
      { updatedAt: { $type: 'string' } },
    ],
  }

  let scanned = 0
  let updated = 0
  let fixedLastActivityAt = 0
  let fixedStageChangedAt = 0
  let normalizedForecastedCloseDate = 0
  let normalizedCloseDate = 0
  let normalizedCreatedAt = 0
  let normalizedUpdatedAt = 0

  const parseAnyDate = (v: any): Date | null => {
    if (!v) return null
    if (v instanceof Date && Number.isFinite(v.getTime())) return v
    if (typeof v === 'string') {
      const s = v.trim()
      if (!s) return null
      // Prefer YYYY-MM-DD inputs: store midday UTC to avoid TZ shifts when rendered as date-only.
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(`${s}T12:00:00Z`)
        return Number.isFinite(d.getTime()) ? d : null
      }
      const d = new Date(s)
      return Number.isFinite(d.getTime()) ? d : null
    }
    return null
  }

  const candidates = (await coll
    .find(query, {
      projection: {
        lastActivityAt: 1,
        stageChangedAt: 1,
        forecastedCloseDate: 1,
        closeDate: 1,
        createdAt: 1,
        updatedAt: 1,
        stage: 1,
      } as any,
    })
    .limit(10_000)
    .toArray()) as any[]

  // Use deal_history to derive best-effort timestamps for activity + stage change.
  // This makes scoring + "stale" panels more accurate for legacy records.
  const ids = candidates.map((d) => d._id).filter(Boolean)
  const histMap = new Map<string, { lastHistoryAt?: Date; lastStageAt?: Date }>()
  if (ids.length) {
    try {
      const hist = await db
        .collection('deal_history')
        .aggregate([
          { $match: { dealId: { $in: ids } } },
          {
            $group: {
              _id: '$dealId',
              lastHistoryAt: { $max: '$createdAt' },
              lastStageAt: {
                $max: {
                  $cond: [{ $eq: ['$eventType', 'stage_changed'] }, '$createdAt', null],
                },
              },
            },
          },
        ])
        .toArray()
      for (const row of hist as any[]) {
        histMap.set(String(row._id), { lastHistoryAt: row.lastHistoryAt, lastStageAt: row.lastStageAt })
      }
    } catch (e) {
      // best-effort
      console.warn('RI backfill: deal_history aggregation failed', e)
    }
  }

  const ops: any[] = []
  for (const deal of candidates) {
    scanned++
    const set: any = {}

    // Normalize createdAt/updatedAt if stored as string
    if (typeof deal.createdAt === 'string') {
      const d = parseAnyDate(deal.createdAt)
      if (d) {
        set.createdAt = d
        normalizedCreatedAt++
      }
    }
    if (typeof deal.updatedAt === 'string') {
      const d = parseAnyDate(deal.updatedAt)
      if (d) {
        set.updatedAt = d
        normalizedUpdatedAt++
      }
    }

    // Normalize close dates if stored as string
    if (typeof deal.forecastedCloseDate === 'string') {
      const d = parseAnyDate(deal.forecastedCloseDate)
      if (d) {
        set.forecastedCloseDate = d
        normalizedForecastedCloseDate++
      }
    }
    if (typeof deal.closeDate === 'string') {
      const d = parseAnyDate(deal.closeDate)
      if (d) {
        set.closeDate = d
        normalizedCloseDate++
      }
    }

    // Fill lastActivityAt if missing (use deal_history, then updatedAt/createdAt)
    if (!deal.lastActivityAt) {
      const hist = histMap.get(String(deal._id))
      const fallback =
        (hist?.lastHistoryAt && parseAnyDate(hist.lastHistoryAt)) ||
        parseAnyDate(deal.updatedAt) ||
        parseAnyDate(deal.createdAt)
      if (fallback) {
        set.lastActivityAt = fallback
        fixedLastActivityAt++
      }
    }

    // Fill stageChangedAt if missing (prefer last stage_changed history timestamp)
    if (!deal.stageChangedAt) {
      const hist = histMap.get(String(deal._id))
      const fallback =
        (hist?.lastStageAt && parseAnyDate(hist.lastStageAt)) ||
        (hist?.lastHistoryAt && parseAnyDate(hist.lastHistoryAt)) ||
        parseAnyDate(deal.updatedAt) ||
        parseAnyDate(deal.createdAt)
      if (fallback) {
        set.stageChangedAt = fallback
        fixedStageChangedAt++
      }
    }

    if (Object.keys(set).length) {
      ops.push({ updateOne: { filter: { _id: deal._id }, update: { $set: set } } })
    }

    if (ops.length >= 500) {
      const r = await coll.bulkWrite(ops, { ordered: false })
      updated += r.modifiedCount ?? 0
      ops.length = 0
    }
  }

  if (ops.length) {
    const r = await coll.bulkWrite(ops, { ordered: false })
    updated += r.modifiedCount ?? 0
  }

  res.json({
    data: {
      ok: true,
      scanned,
      updated,
      fixedLastActivityAt,
      fixedStageChangedAt,
      normalizedForecastedCloseDate,
      normalizedCloseDate,
      normalizedCreatedAt,
      normalizedUpdatedAt,
    },
    error: null,
  })
})
type ForecastData = {
  period: ForecastPeriod
  startDate: Date
  endDate: Date
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
  deals: any[]
}

function isClosedWonStage(stageRaw: unknown): boolean {
  const s = String(stageRaw || '').trim()
  return s === 'Closed Won' || s === 'Contract Signed / Closed Won'
}

function isClosedLostStage(stageRaw: unknown): boolean {
  return String(stageRaw || '').trim() === 'Closed Lost'
}

async function computeForecast(
  db: any,
  period: ForecastPeriod,
  ownerId?: string,
  opts?: { startDateRaw?: string; endDateRaw?: string; excludeOverdue?: boolean },
) {
  const now = new Date()
  const { startDate, endDate, endExclusive } = getRangeFromRequest(period, now, opts?.startDateRaw, opts?.endDateRaw)
  const startIso = startDate.toISOString()
  const endIso = endExclusive.toISOString()
  const settings = await getRevenueIntelligenceSettings(db)

  // Fetch deals in the period (use forecastedCloseDate for forecasting, fallback to closeDate)
  const dealMatch: any = {
    $or: [
      // forecastedCloseDate stored as a Mongo Date
      { forecastedCloseDate: { $gte: startDate, $lt: endExclusive } },
      // forecastedCloseDate stored as an ISO string
      { forecastedCloseDate: { $gte: startIso, $lt: endIso } },

      // Fallback to closeDate when forecastedCloseDate is null or missing
      { $and: [{ forecastedCloseDate: null }, { closeDate: { $gte: startDate, $lt: endExclusive } }] },
      { $and: [{ forecastedCloseDate: null }, { closeDate: { $gte: startIso, $lt: endIso } }] },
      { $and: [{ forecastedCloseDate: { $exists: false } }, { closeDate: { $gte: startDate, $lt: endExclusive } }] },
      { $and: [{ forecastedCloseDate: { $exists: false } }, { closeDate: { $gte: startIso, $lt: endIso } }] },
    ],
    stage: { $nin: ['Closed Lost'] },
  }
  if (ownerId) {
    // Special case: UI supports "Unassigned" which should match missing/empty ownerId values.
    if (ownerId === 'Unassigned') {
      dealMatch.$and = [
        ...(Array.isArray(dealMatch.$and) ? dealMatch.$and : []),
        {
          $or: [
            { ownerId: null },
            { ownerId: { $exists: false } },
            { ownerId: '' },
          ],
        },
      ]
    } else {
      dealMatch.ownerId = ownerId
    }
  }

  const deals = (await db.collection('deals').find(dealMatch).toArray()) as any[]

  // Fetch account ages for scoring
  const accountIds = [...new Set(deals.map((d) => d.accountId).filter(Boolean))]
  const accounts =
    accountIds.length > 0
      ? ((await db
          .collection('accounts')
          .find({ _id: { $in: accountIds.map((id) => new ObjectId(id)) } })
          .toArray()) as any[])
      : []
  const accountAgeMap = new Map<string, number>()
  accounts.forEach((acc) => {
    const age = acc.createdAt ? Math.ceil((Date.now() - new Date(acc.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0
    accountAgeMap.set(String(acc._id), age)
  })

  // Score each deal
  const scoredDeals = deals.map((deal) => {
    const dealAge = deal.createdAt ? Math.ceil((Date.now() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : undefined
    const activitySource = (deal as any).lastActivityAt || (deal as any).updatedAt || (deal as any).createdAt
    const activityRecency = activitySource ? Math.ceil((Date.now() - new Date(activitySource).getTime()) / (1000 * 60 * 60 * 24)) : undefined
    const accountAge = accountAgeMap.get(deal.accountId)

    // Derive daysInStage if missing and we have stageChangedAt
    let derivedDaysInStage: number | undefined = undefined
    const existingDaysInStage = Number((deal as any).daysInStage)
    if (Number.isFinite(existingDaysInStage)) {
      derivedDaysInStage = existingDaysInStage
    } else if ((deal as any).stageChangedAt) {
      const sc = new Date((deal as any).stageChangedAt)
      if (Number.isFinite(sc.getTime())) {
        derivedDaysInStage = Math.ceil((Date.now() - sc.getTime()) / (1000 * 60 * 60 * 24))
      }
    }

    const dealForScoring = {
      ...(deal as any),
      lastActivityAt: (deal as any).lastActivityAt || (deal as any).updatedAt || (deal as any).createdAt,
      daysInStage: derivedDaysInStage ?? (deal as any).daysInStage,
    }

    const scoring = calculateDealScore(dealForScoring, settings, accountAge, dealAge, activityRecency)
    return {
      ...dealForScoring,
      aiScore: scoring.score,
      aiConfidence: scoring.confidence,
      aiFactors: scoring.factors,
    }
  })

  const wonDeals = scoredDeals.filter((d) => isClosedWonStage(d.stage))
  let pipelineDeals = scoredDeals.filter((d) => !isClosedWonStage(d.stage) && !isClosedLostStage(d.stage))

  // Optionally exclude overdue deals from pipeline (open deals whose close date is before today)
  if (opts?.excludeOverdue) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    pipelineDeals = pipelineDeals.filter((d: any) => {
      const raw = d.forecastedCloseDate || d.closeDate
      if (!raw) return true
      const dt = new Date(raw)
      const t = dt.getTime()
      if (!Number.isFinite(t)) return true
      return dt >= todayStart
    })
  }

  // Pipeline + won metrics (avoid double counting)
  const totalPipeline = pipelineDeals.reduce((sum, d) => sum + (d.amount || 0), 0)
  const weightedPipeline = pipelineDeals.reduce((sum, d) => sum + (d.amount || 0) * (d.aiScore / 100), 0)
  const closedWon = wonDeals.reduce((sum, d) => sum + (d.amount || 0), 0)

  // Confidence intervals (pessimistic, likely, optimistic) based on PIPELINE deals only
  const highConfDeals = pipelineDeals.filter((d) => d.aiConfidence === 'High')
  const medConfDeals = pipelineDeals.filter((d) => d.aiConfidence === 'Medium')
  const lowConfDeals = pipelineDeals.filter((d) => d.aiConfidence === 'Low')

  const pessimistic =
    closedWon +
    highConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.7, 0) +
    medConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.3, 0) +
    lowConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.1, 0)

  const likely =
    closedWon +
    highConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.85, 0) +
    medConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.5, 0) +
    lowConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.2, 0)

  const optimistic =
    closedWon +
    highConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.95, 0) +
    medConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.7, 0) +
    lowConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.4, 0)

  // Stage breakdown (PIPELINE only)
  const byStage = pipelineDeals.reduce((acc, d) => {
    const stage = d.stage || 'Unknown'
    if (!acc[stage]) acc[stage] = { count: 0, value: 0, weightedValue: 0 }
    acc[stage].count++
    acc[stage].value += d.amount || 0
    acc[stage].weightedValue += (d.amount || 0) * (d.aiScore / 100)
    return acc
  }, {} as Record<string, { count: number; value: number; weightedValue: number }>)

  return {
    period,
    startDate,
    endDate,
    summary: {
      totalDeals: scoredDeals.length,
      totalPipeline,
      weightedPipeline,
      closedWon,
      forecast: {
        pessimistic: Math.round(pessimistic),
        likely: Math.round(likely),
        optimistic: Math.round(optimistic),
      },
      confidence: {
        high: highConfDeals.length,
        medium: medConfDeals.length,
        low: lowConfDeals.length,
      },
    },
    byStage,
    deals: scoredDeals,
  } satisfies ForecastData
}

// Calculate AI-powered deal score based on multiple factors
function calculateDealScore(
  deal: DealDoc,
  settings: RevenueIntelligenceSettings,
  accountAge?: number,
  dealAge?: number,
  activityRecency?: number,
): {
  score: number
  confidence: 'High' | 'Medium' | 'Low'
  factors: Array<{ factor: string; impact: number; description: string }>
} {
  const factors: Array<{ factor: string; impact: number; description: string }> = []
  // Start with a base score of 50 (no probability field in deals)
  let score = 50

  // Factor 1: Stage progression (higher stages = higher confidence)
  const stage = deal.stage || 'new'
  const stageImpact = settings.stageWeights[stage] ?? 0
  if (stageImpact !== 0) {
    score += stageImpact
    factors.push({
      factor: 'Deal Stage',
      impact: stageImpact,
      description: `${stage} stage ${stageImpact > 0 ? 'increases' : 'decreases'} likelihood`,
    })
  }

  // Factor 2: Deal age (too old = lower confidence)
  if (dealAge !== undefined) {
    if (dealAge > settings.dealAge.staleDays) {
      score += settings.dealAge.staleImpact
      factors.push({ factor: 'Deal Age', impact: settings.dealAge.staleImpact, description: `Deal is stale (>${settings.dealAge.staleDays} days old)` })
    } else if (dealAge > settings.dealAge.agingDays) {
      score += settings.dealAge.agingImpact
      factors.push({ factor: 'Deal Age', impact: settings.dealAge.agingImpact, description: `Deal is aging (>${settings.dealAge.agingDays} days old)` })
    } else if (dealAge > settings.dealAge.warnDays) {
      score += settings.dealAge.warnImpact
      factors.push({ factor: 'Deal Age', impact: settings.dealAge.warnImpact, description: `Deal is maturing (>${settings.dealAge.warnDays} days old)` })
    }
  }

  // Factor 3: Activity recency (recent activity = higher confidence)
  if (activityRecency !== undefined) {
    if (activityRecency <= settings.activity.hotDays) {
      score += settings.activity.hotImpact
      factors.push({ factor: 'Recent Activity', impact: settings.activity.hotImpact, description: `Active engagement within last ${settings.activity.hotDays} days` })
    } else if (activityRecency <= settings.activity.warmDays) {
      score += settings.activity.warmImpact
      factors.push({ factor: 'Recent Activity', impact: settings.activity.warmImpact, description: `Recent engagement within ${settings.activity.warmDays} days` })
    } else if (activityRecency > settings.activity.coldDays) {
      score += settings.activity.coldImpact
      factors.push({ factor: 'Activity Gap', impact: settings.activity.coldImpact, description: `No activity for over ${settings.activity.coldDays} days` })
    } else if (activityRecency > settings.activity.coolDays) {
      score += settings.activity.coolImpact
      factors.push({ factor: 'Activity Gap', impact: settings.activity.coolImpact, description: `No activity for over ${settings.activity.coolDays} days` })
    }
  }

  // Factor 4: Account maturity (established accounts = higher confidence)
  if (accountAge !== undefined) {
    if (accountAge > settings.account.matureDays) {
      score += settings.account.matureImpact
      factors.push({ factor: 'Account Maturity', impact: settings.account.matureImpact, description: `Established account (>${settings.account.matureDays} days)` })
    } else if (accountAge < settings.account.newDays) {
      score += settings.account.newImpact
      factors.push({ factor: 'New Account', impact: settings.account.newImpact, description: `Very new account (<${settings.account.newDays} days)` })
    }
  }

  // Factor 5: Days in current stage (stuck = lower confidence)
  if (deal.daysInStage !== undefined && deal.stage !== 'Closed Won' && deal.stage !== 'Closed Lost') {
    if (deal.daysInStage > settings.stageDuration.stuckDays) {
      score += settings.stageDuration.stuckImpact
      factors.push({ factor: 'Stage Duration', impact: settings.stageDuration.stuckImpact, description: `Stuck in stage for >${settings.stageDuration.stuckDays} days` })
    } else if (deal.daysInStage > settings.stageDuration.warnDays) {
      score += settings.stageDuration.warnImpact
      factors.push({ factor: 'Stage Duration', impact: settings.stageDuration.warnImpact, description: `In stage for >${settings.stageDuration.warnDays} days` })
    }
  }

  // Factor 6: Close date proximity (closing soon with high stage = boost)
  // Use forecastedCloseDate if available, otherwise fallback to closeDate
  const closeDate = (deal as any).forecastedCloseDate || deal.closeDate
  const daysToClose = closeDate ? Math.ceil((new Date(closeDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 999
  if (daysToClose < 0) {
    score += settings.closeDate.overdueImpact
    factors.push({ factor: 'Overdue Close Date', impact: settings.closeDate.overdueImpact, description: 'Close date has passed' })
  } else if (daysToClose <= settings.closeDate.closingSoonDays && (deal.stage === 'Negotiation' || deal.stage === 'Proposal')) {
    score += settings.closeDate.closingSoonImpact
    factors.push({ factor: 'Closing Soon', impact: settings.closeDate.closingSoonImpact, description: `Close date within ${settings.closeDate.closingSoonDays} days and in late stage` })
  } else if (daysToClose <= settings.closeDate.closingSoonWarmDays && deal.stage === 'Negotiation') {
    score += settings.closeDate.closingSoonWarmImpact
    factors.push({ factor: 'Closing Soon', impact: settings.closeDate.closingSoonWarmImpact, description: `Close date within ${settings.closeDate.closingSoonWarmDays} days and in negotiation` })
  }

  // Clamp score between 0 and 100
  score = Math.max(0, Math.min(100, score))

  // Determine confidence level
  let confidence: 'High' | 'Medium' | 'Low' = 'Medium'
  if (score >= 70 && factors.length >= 3) confidence = 'High'
  else if (score < 40 || factors.filter((f) => f.impact < 0).length >= 3) confidence = 'Low'

  return { score: Math.round(score), confidence, factors }
}

function getForecastRange(period: ForecastPeriod, now: Date) {
  // Fiscal year begins Jan 1st (calendar year).
  // Use half-open intervals [start, endExclusive) to avoid missing deals on the last day due to time components.
  let startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  let endExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  if (period === 'current_quarter') {
    const q = Math.floor(now.getMonth() / 3) // 0..3
    startDate = new Date(now.getFullYear(), q * 3, 1)
    endExclusive = new Date(now.getFullYear(), q * 3 + 3, 1)
  } else if (period === 'next_month') {
    startDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    endExclusive = new Date(now.getFullYear(), now.getMonth() + 2, 1)
  } else if (period === 'next_quarter') {
    const nextQ = Math.floor(now.getMonth() / 3) + 1 // may overflow into next year via JS Date month overflow
    startDate = new Date(now.getFullYear(), nextQ * 3, 1)
    endExclusive = new Date(now.getFullYear(), nextQ * 3 + 3, 1)
  } else if (period === 'current_year') {
    startDate = new Date(now.getFullYear(), 0, 1)
    endExclusive = new Date(now.getFullYear() + 1, 0, 1)
  } else if (period === 'next_year') {
    startDate = new Date(now.getFullYear() + 1, 0, 1)
    endExclusive = new Date(now.getFullYear() + 2, 0, 1)
  }

  const endDate = new Date(endExclusive.getTime() - 1) // inclusive end-of-period for display
  return { startDate, endDate, endExclusive }
}

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (!s) return null
  // UI sends YYYY-MM-DD (date only)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [yy, mm, dd] = s.split('-').map((n) => Number(n))
    if (!yy || !mm || !dd) return null
    const d = new Date(yy, mm - 1, dd)
    return Number.isFinite(d.getTime()) ? d : null
  }
  const d = new Date(s)
  return Number.isFinite(d.getTime()) ? d : null
}

function getRangeFromRequest(period: ForecastPeriod, now: Date, startDateRaw?: string, endDateRaw?: string) {
  const startParsed = parseDateOnly(startDateRaw)
  const endParsed = parseDateOnly(endDateRaw)
  if (startParsed && endParsed) {
    const startDate = new Date(startParsed.getFullYear(), startParsed.getMonth(), startParsed.getDate())
    const endExclusive = new Date(endParsed.getFullYear(), endParsed.getMonth(), endParsed.getDate() + 1)
    const endDate = new Date(endExclusive.getTime() - 1)
    return { startDate, endDate, endExclusive, isCustom: true }
  }
  const { startDate, endDate, endExclusive } = getForecastRange(period, now)
  return { startDate, endDate, endExclusive, isCustom: false }
}

// GET /api/crm/revenue-intelligence/forecast
// Returns pipeline forecast with confidence intervals
revenueIntelligenceRouter.get('/forecast', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const period = (req.query.period as ForecastPeriod) || 'current_quarter'
  const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId.trim() : ''
  const startDateRaw = typeof req.query.startDate === 'string' ? req.query.startDate : undefined
  const endDateRaw = typeof req.query.endDate === 'string' ? req.query.endDate : undefined
  const excludeOverdue = String(req.query.excludeOverdue || '').toLowerCase() === 'true'

  const data = await computeForecast(db, period, ownerId || undefined, { startDateRaw, endDateRaw, excludeOverdue })
  res.json({ data, error: null })
})

// GET /api/crm/revenue-intelligence/deal-score/:dealId
// Get detailed AI scoring for a specific deal
revenueIntelligenceRouter.get('/deal-score/:dealId', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { dealId } = req.params
  if (!ObjectId.isValid(dealId)) {
    return res.status(400).json({ data: null, error: 'invalid_deal_id' })
  }

  const deal = await db.collection('deals').findOne({ _id: new ObjectId(dealId) }) as any
  if (!deal) {
    return res.status(404).json({ data: null, error: 'deal_not_found' })
  }

  // Get account age
  let accountAge: number | undefined
  if (deal.accountId && ObjectId.isValid(deal.accountId)) {
    const account = await db.collection('accounts').findOne({ _id: new ObjectId(deal.accountId) }) as any
    if (account?.createdAt) {
      accountAge = Math.ceil((Date.now() - new Date(account.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    }
  }

  const dealAge = deal.createdAt ? Math.ceil((Date.now() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : undefined
  const activityRecency = deal.lastActivityAt ? Math.ceil((Date.now() - new Date(deal.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24)) : undefined

  const settings = await getRevenueIntelligenceSettings(db)
  const scoring = calculateDealScore(deal, settings, accountAge, dealAge, activityRecency)

  res.json({
    data: {
      dealId: deal._id,
      dealName: deal.title || 'Untitled',
      stage: deal.stage || 'new',
      value: deal.amount || 0,
      ...scoring,
    },
    error: null,
  })
})

// GET /api/crm/revenue-intelligence/rep-performance
// Rep performance predictions and analytics
revenueIntelligenceRouter.get('/rep-performance', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const period = (req.query.period as ForecastPeriod) || 'current_quarter'

  // Calculate date range
  const now = new Date()
  const { startDate, endDate, endExclusive } = getForecastRange(period, now)

  // Fetch all deals in period (use forecastedCloseDate for forecasting, fallback to closeDate)
  const startIso = startDate.toISOString()
  const endIso = endExclusive.toISOString()
  const deals = await db.collection('deals').find({
    $or: [
      { forecastedCloseDate: { $gte: startDate, $lt: endExclusive } },
      { forecastedCloseDate: { $gte: startIso, $lt: endIso } },
      { $and: [{ forecastedCloseDate: null }, { closeDate: { $gte: startDate, $lt: endExclusive } }] },
      { $and: [{ forecastedCloseDate: null }, { closeDate: { $gte: startIso, $lt: endIso } }] },
      { $and: [{ forecastedCloseDate: { $exists: false } }, { closeDate: { $gte: startDate, $lt: endExclusive } }] },
      { $and: [{ forecastedCloseDate: { $exists: false } }, { closeDate: { $gte: startIso, $lt: endIso } }] },
    ],
  }).toArray() as any[]

  // Group by owner
  const byOwner = deals.reduce((acc, deal) => {
    const owner = deal.ownerId || 'Unassigned'
    if (!acc[owner]) {
      acc[owner] = {
        ownerId: owner,
        totalDeals: 0,
        openDeals: 0,
        closedWon: 0,
        closedLost: 0,
        totalValue: 0,
        wonValue: 0,
        lostValue: 0,
        pipelineValue: 0,
        avgDealSize: 0,
        winRate: 0,
        deals: [],
      }
    }
    acc[owner].totalDeals++
    acc[owner].totalValue += deal.amount || 0
    acc[owner].deals.push(deal)

    if (deal.stage === 'Contract Signed / Closed Won' || deal.stage === 'Closed Won') {
      acc[owner].closedWon++
      acc[owner].wonValue += deal.amount || 0
    } else if (deal.stage === 'Closed Lost') {
      acc[owner].closedLost++
      acc[owner].lostValue += deal.amount || 0
    } else {
      acc[owner].openDeals++
      acc[owner].pipelineValue += deal.amount || 0
    }

    return acc
  }, {} as Record<string, any>)

  // Calculate metrics for each rep
  const repPerformance = Object.values(byOwner).map((rep: any) => {
    rep.avgDealSize = rep.totalDeals > 0 ? rep.totalValue / rep.totalDeals : 0
    rep.winRate = (rep.closedWon + rep.closedLost) > 0 ? (rep.closedWon / (rep.closedWon + rep.closedLost)) * 100 : 0

    // Forecast: apply win rate to open pipeline
    rep.forecastedRevenue = rep.wonValue + (rep.pipelineValue * (rep.winRate / 100))

    // Performance score (0-100)
    let perfScore = 50
    if (rep.winRate >= 50) perfScore += 20
    else if (rep.winRate >= 30) perfScore += 10
    else if (rep.winRate < 20) perfScore -= 10

    if (rep.avgDealSize > 50000) perfScore += 15
    else if (rep.avgDealSize > 25000) perfScore += 10
    else if (rep.avgDealSize < 10000) perfScore -= 5

    if (rep.openDeals > 10) perfScore += 10
    else if (rep.openDeals > 5) perfScore += 5
    else if (rep.openDeals < 3) perfScore -= 10

    rep.performanceScore = Math.max(0, Math.min(100, perfScore))
    delete rep.deals // Don't send full deal array

    return rep
  })

  // Sort by forecasted revenue desc
  repPerformance.sort((a, b) => b.forecastedRevenue - a.forecastedRevenue)

  res.json({
    data: {
      period,
      startDate,
      endDate,
      reps: repPerformance,
      summary: {
        totalReps: repPerformance.length,
        totalPipeline: repPerformance.reduce((sum, r) => sum + r.pipelineValue, 0),
        totalWon: repPerformance.reduce((sum, r) => sum + r.wonValue, 0),
        avgWinRate: repPerformance.reduce((sum, r) => sum + r.winRate, 0) / (repPerformance.length || 1),
      },
    },
    error: null,
  })
})

// POST /api/crm/revenue-intelligence/scenario
// What-if scenario modeling
revenueIntelligenceRouter.post('/scenario', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { period, adjustments } = req.body as {
    period: ForecastPeriod
    startDate?: string
    endDate?: string
    excludeOverdue?: boolean
    adjustments: Array<{
      dealId: string
      newStage?: DealStage
      newValue?: number
      newProbability?: number
      newCloseDate?: string
    }>
  }

  if (!adjustments || !Array.isArray(adjustments)) {
    return res.status(400).json({ data: null, error: 'invalid_adjustments' })
  }

  // Compute baseline without calling localhost (more reliable in deployments)
  const baseline = await computeForecast(db, period, undefined, {
    startDateRaw: typeof (req.body as any)?.startDate === 'string' ? (req.body as any).startDate : undefined,
    endDateRaw: typeof (req.body as any)?.endDate === 'string' ? (req.body as any).endDate : undefined,
    excludeOverdue: !!(req.body as any)?.excludeOverdue,
  })

  // Apply adjustments to deals
  const adjustedDeals = baseline.deals.map((deal: any) => {
    const adjustment = adjustments.find((adj) => adj.dealId === String(deal._id))
    if (adjustment) {
      return {
        ...deal,
        stage: adjustment.newStage || deal.stage,
        amount: adjustment.newValue !== undefined ? adjustment.newValue : deal.amount,
        closeDate: adjustment.newCloseDate ? new Date(adjustment.newCloseDate) : deal.closeDate,
        _adjusted: true,
      }
    }
    return deal
  })

  // Recalculate forecast with adjusted deals
  const wonDeals = adjustedDeals.filter((d: any) => isClosedWonStage(d.stage))
  const pipelineDeals = adjustedDeals.filter((d: any) => !isClosedWonStage(d.stage) && !isClosedLostStage(d.stage))

  const totalPipeline = pipelineDeals.reduce((sum: number, d: any) => sum + (d.amount || 0), 0)
  const weightedPipeline = pipelineDeals.reduce((sum: number, d: any) => sum + (d.amount || 0) * (d.aiScore / 100), 0)
  const closedWon = wonDeals.reduce((sum: number, d: any) => sum + (d.amount || 0), 0)

  const highConfDeals = pipelineDeals.filter((d: any) => d.aiConfidence === 'High')
  const medConfDeals = pipelineDeals.filter((d: any) => d.aiConfidence === 'Medium')
  const lowConfDeals = pipelineDeals.filter((d: any) => d.aiConfidence === 'Low')

  const pessimistic = closedWon +
    highConfDeals.reduce((sum: number, d: any) => sum + (d.amount || 0) * 0.7, 0) +
    medConfDeals.reduce((sum: number, d: any) => sum + (d.amount || 0) * 0.3, 0) +
    lowConfDeals.reduce((sum: number, d: any) => sum + (d.amount || 0) * 0.1, 0)

  const likely = closedWon +
    highConfDeals.reduce((sum: number, d: any) => sum + (d.amount || 0) * 0.85, 0) +
    medConfDeals.reduce((sum: number, d: any) => sum + (d.amount || 0) * 0.5, 0) +
    lowConfDeals.reduce((sum: number, d: any) => sum + (d.amount || 0) * 0.2, 0)

  const optimistic = closedWon +
    highConfDeals.reduce((sum: number, d: any) => sum + (d.amount || 0) * 0.95, 0) +
    medConfDeals.reduce((sum: number, d: any) => sum + (d.amount || 0) * 0.7, 0) +
    lowConfDeals.reduce((sum: number, d: any) => sum + (d.amount || 0) * 0.4, 0)

  res.json({
    data: {
      baseline: baseline.summary,
      scenario: {
        totalDeals: adjustedDeals.length,
        totalPipeline,
        weightedPipeline,
        closedWon,
        forecast: {
          pessimistic: Math.round(pessimistic),
          likely: Math.round(likely),
          optimistic: Math.round(optimistic),
        },
        adjustedDeals: adjustedDeals.filter((d: any) => d._adjusted),
      },
      delta: {
        totalPipeline: totalPipeline - baseline.summary.totalPipeline,
        weightedPipeline: weightedPipeline - baseline.summary.weightedPipeline,
        pessimistic: Math.round(pessimistic) - baseline.summary.forecast.pessimistic,
        likely: Math.round(likely) - baseline.summary.forecast.likely,
        optimistic: Math.round(optimistic) - baseline.summary.forecast.optimistic,
      },
    },
    error: null,
  })
})

