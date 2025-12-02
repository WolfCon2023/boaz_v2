import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { requireAuth } from '../auth/rbac.js'

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

type ForecastPeriod = 'current_month' | 'current_quarter' | 'next_month' | 'next_quarter' | 'current_year'

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

// Calculate AI-powered deal score based on multiple factors
function calculateDealScore(deal: DealDoc, accountAge?: number, dealAge?: number, activityRecency?: number): {
  score: number
  confidence: 'High' | 'Medium' | 'Low'
  factors: Array<{ factor: string; impact: number; description: string }>
} {
  const factors: Array<{ factor: string; impact: number; description: string }> = []
  // Start with a base score of 50 (no probability field in deals)
  let score = 50

  // Factor 1: Stage progression (higher stages = higher confidence)
  const stage = deal.stage || 'new'
  const stageWeights: Record<string, number> = {
    'new': -10,
    'Lead': -10,
    'Qualified': 0,
    'Proposal': 10,
    'Negotiation': 15,
    'Contract Signed / Closed Won': 0,
    'Closed Won': 0,
    'Closed Lost': 0,
    'Submitted for Review': 5,
  }
  const stageImpact = stageWeights[stage] || 0
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
    if (dealAge > 180) {
      score -= 15
      factors.push({ factor: 'Deal Age', impact: -15, description: 'Deal is stale (>180 days old)' })
    } else if (dealAge > 90) {
      score -= 8
      factors.push({ factor: 'Deal Age', impact: -8, description: 'Deal is aging (>90 days old)' })
    } else if (dealAge > 60) {
      score -= 3
      factors.push({ factor: 'Deal Age', impact: -3, description: 'Deal is maturing (>60 days old)' })
    }
  }

  // Factor 3: Activity recency (recent activity = higher confidence)
  if (activityRecency !== undefined) {
    if (activityRecency <= 7) {
      score += 10
      factors.push({ factor: 'Recent Activity', impact: 10, description: 'Active engagement within last week' })
    } else if (activityRecency <= 14) {
      score += 5
      factors.push({ factor: 'Recent Activity', impact: 5, description: 'Recent engagement within 2 weeks' })
    } else if (activityRecency > 30) {
      score -= 12
      factors.push({ factor: 'Activity Gap', impact: -12, description: 'No activity for over 30 days' })
    } else if (activityRecency > 21) {
      score -= 6
      factors.push({ factor: 'Activity Gap', impact: -6, description: 'No activity for over 3 weeks' })
    }
  }

  // Factor 4: Account maturity (established accounts = higher confidence)
  if (accountAge !== undefined) {
    if (accountAge > 365) {
      score += 8
      factors.push({ factor: 'Account Maturity', impact: 8, description: 'Established account (>1 year)' })
    } else if (accountAge < 30) {
      score -= 5
      factors.push({ factor: 'New Account', impact: -5, description: 'Very new account (<30 days)' })
    }
  }

  // Factor 5: Days in current stage (stuck = lower confidence)
  if (deal.daysInStage !== undefined && deal.stage !== 'Closed Won' && deal.stage !== 'Closed Lost') {
    if (deal.daysInStage > 60) {
      score -= 10
      factors.push({ factor: 'Stage Duration', impact: -10, description: 'Stuck in stage for >60 days' })
    } else if (deal.daysInStage > 30) {
      score -= 5
      factors.push({ factor: 'Stage Duration', impact: -5, description: 'In stage for >30 days' })
    }
  }

  // Factor 6: Close date proximity (closing soon with high stage = boost)
  // Use forecastedCloseDate if available, otherwise fallback to closeDate
  const closeDate = (deal as any).forecastedCloseDate || deal.closeDate
  const daysToClose = closeDate ? Math.ceil((new Date(closeDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 999
  if (daysToClose < 0) {
    score -= 20
    factors.push({ factor: 'Overdue Close Date', impact: -20, description: 'Close date has passed' })
  } else if (daysToClose <= 7 && (deal.stage === 'Negotiation' || deal.stage === 'Proposal')) {
    score += 12
    factors.push({ factor: 'Closing Soon', impact: 12, description: 'Close date within 7 days and in late stage' })
  } else if (daysToClose <= 14 && deal.stage === 'Negotiation') {
    score += 8
    factors.push({ factor: 'Closing Soon', impact: 8, description: 'Close date within 2 weeks and in negotiation' })
  }

  // Clamp score between 0 and 100
  score = Math.max(0, Math.min(100, score))

  // Determine confidence level
  let confidence: 'High' | 'Medium' | 'Low' = 'Medium'
  if (score >= 70 && factors.length >= 3) confidence = 'High'
  else if (score < 40 || factors.filter((f) => f.impact < 0).length >= 3) confidence = 'Low'

  return { score: Math.round(score), confidence, factors }
}

// GET /api/crm/revenue-intelligence/forecast
// Returns pipeline forecast with confidence intervals
revenueIntelligenceRouter.get('/forecast', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const period = (req.query.period as ForecastPeriod) || 'current_quarter'
  const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId.trim() : ''

  // Calculate date range based on period
  const now = new Date()
  let startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  let endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  if (period === 'current_quarter') {
    const currentQuarter = Math.floor(now.getMonth() / 3)
    startDate = new Date(now.getFullYear(), currentQuarter * 3, 1)
    endDate = new Date(now.getFullYear(), currentQuarter * 3 + 3, 0)
  } else if (period === 'next_month') {
    startDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0)
  } else if (period === 'next_quarter') {
    const nextQuarter = Math.floor(now.getMonth() / 3) + 1
    startDate = new Date(now.getFullYear(), nextQuarter * 3, 1)
    endDate = new Date(now.getFullYear(), nextQuarter * 3 + 3, 0)
  } else if (period === 'current_year') {
    startDate = new Date(now.getFullYear(), 0, 1)
    endDate = new Date(now.getFullYear(), 11, 31)
  }

  // Fetch deals in the period (use forecastedCloseDate for forecasting, fallback to closeDate)
  const dealMatch: any = {
    $or: [
      { forecastedCloseDate: { $gte: startDate, $lte: endDate } },
      { $and: [{ forecastedCloseDate: { $exists: false } }, { closeDate: { $gte: startDate, $lte: endDate } }] },
    ],
    stage: { $nin: ['Closed Lost'] },
  }
  if (ownerId) dealMatch.ownerId = ownerId

  const deals = await db.collection('deals').find(dealMatch).toArray() as any[]

  // Fetch account ages for scoring
  const accountIds = [...new Set(deals.map((d) => d.accountId).filter(Boolean))]
  const accounts = await db.collection('accounts').find({ _id: { $in: accountIds.map((id) => new ObjectId(id)) } }).toArray() as any[]
  const accountAgeMap = new Map<string, number>()
  accounts.forEach((acc) => {
    const age = acc.createdAt ? Math.ceil((Date.now() - new Date(acc.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0
    accountAgeMap.set(String(acc._id), age)
  })

  // Score each deal
  const scoredDeals = deals.map((deal) => {
    const dealAge = deal.createdAt ? Math.ceil((Date.now() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : undefined
    const activityRecency = deal.lastActivityAt ? Math.ceil((Date.now() - new Date(deal.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24)) : undefined
    const accountAge = accountAgeMap.get(deal.accountId)
    const scoring = calculateDealScore(deal, accountAge, dealAge, activityRecency)
    return {
      ...deal,
      aiScore: scoring.score,
      aiConfidence: scoring.confidence,
      aiFactors: scoring.factors,
    }
  })

  // Calculate forecast metrics (use 'amount' field from deals)
  const totalPipeline = scoredDeals.reduce((sum, d) => sum + (d.amount || 0), 0)
  const weightedPipeline = scoredDeals.reduce((sum, d) => sum + (d.amount || 0) * (d.aiScore / 100), 0)
  const closedWon = scoredDeals.filter((d) => d.stage === 'Contract Signed / Closed Won' || d.stage === 'Closed Won').reduce((sum, d) => sum + (d.amount || 0), 0)

  // Confidence intervals (pessimistic, likely, optimistic)
  const highConfDeals = scoredDeals.filter((d) => d.aiConfidence === 'High')
  const medConfDeals = scoredDeals.filter((d) => d.aiConfidence === 'Medium')
  const lowConfDeals = scoredDeals.filter((d) => d.aiConfidence === 'Low')

  const pessimistic = closedWon +
    highConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.7, 0) +
    medConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.3, 0) +
    lowConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.1, 0)

  const likely = closedWon +
    highConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.85, 0) +
    medConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.5, 0) +
    lowConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.2, 0)

  const optimistic = closedWon +
    highConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.95, 0) +
    medConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.7, 0) +
    lowConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.4, 0)

  // Stage breakdown
  const byStage = scoredDeals.reduce((acc, d) => {
    const stage = d.stage || 'Unknown'
    if (!acc[stage]) acc[stage] = { count: 0, value: 0, weightedValue: 0 }
    acc[stage].count++
    acc[stage].value += d.amount || 0
    acc[stage].weightedValue += (d.amount || 0) * (d.aiScore / 100)
    return acc
  }, {} as Record<string, { count: number; value: number; weightedValue: number }>)

  res.json({
    data: {
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
    },
    error: null,
  })
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

  const scoring = calculateDealScore(deal, accountAge, dealAge, activityRecency)

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
  let startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  let endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  if (period === 'current_quarter') {
    const currentQuarter = Math.floor(now.getMonth() / 3)
    startDate = new Date(now.getFullYear(), currentQuarter * 3, 1)
    endDate = new Date(now.getFullYear(), currentQuarter * 3 + 3, 0)
  } else if (period === 'current_year') {
    startDate = new Date(now.getFullYear(), 0, 1)
    endDate = new Date(now.getFullYear(), 11, 31)
  }

  // Fetch all deals in period (use forecastedCloseDate for forecasting, fallback to closeDate)
  const deals = await db.collection('deals').find({
    $or: [
      { forecastedCloseDate: { $gte: startDate, $lte: endDate } },
      { $and: [{ forecastedCloseDate: { $exists: false } }, { closeDate: { $gte: startDate, $lte: endDate } }] },
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

  // Fetch current forecast
  const forecastRes = await fetch(`http://localhost:${process.env.PORT || 4004}/api/crm/revenue-intelligence/forecast?period=${period}`, {
    headers: { cookie: req.headers.cookie || '' },
  })
  const forecastData = (await forecastRes.json()) as { data: ForecastData }
  const baseline = forecastData.data

  // Apply adjustments to deals
  const adjustedDeals = baseline.deals.map((deal: any) => {
    const adjustment = adjustments.find((adj) => adj.dealId === String(deal._id))
    if (adjustment) {
      return {
        ...deal,
        stage: adjustment.newStage || deal.stage,
        value: adjustment.newValue !== undefined ? adjustment.newValue : deal.value,
        probability: adjustment.newProbability !== undefined ? adjustment.newProbability : deal.probability,
        closeDate: adjustment.newCloseDate ? new Date(adjustment.newCloseDate) : deal.closeDate,
        _adjusted: true,
      }
    }
    return deal
  })

  // Recalculate forecast with adjusted deals
  const totalPipeline = adjustedDeals.reduce((sum: number, d: any) => sum + (d.value || 0), 0)
  const weightedPipeline = adjustedDeals.reduce((sum: number, d: any) => sum + (d.value || 0) * (d.aiScore / 100), 0)
  const closedWon = adjustedDeals.filter((d: any) => d.stage === 'Closed Won').reduce((sum: number, d: any) => sum + (d.value || 0), 0)

  const highConfDeals = adjustedDeals.filter((d: any) => d.aiConfidence === 'High')
  const medConfDeals = adjustedDeals.filter((d: any) => d.aiConfidence === 'Medium')
  const lowConfDeals = adjustedDeals.filter((d: any) => d.aiConfidence === 'Low')

  const pessimistic = closedWon +
    highConfDeals.reduce((sum: number, d: any) => sum + (d.value || 0) * 0.7, 0) +
    medConfDeals.reduce((sum: number, d: any) => sum + (d.value || 0) * 0.3, 0) +
    lowConfDeals.reduce((sum: number, d: any) => sum + (d.value || 0) * 0.1, 0)

  const likely = closedWon +
    highConfDeals.reduce((sum: number, d: any) => sum + (d.value || 0) * 0.85, 0) +
    medConfDeals.reduce((sum: number, d: any) => sum + (d.value || 0) * 0.5, 0) +
    lowConfDeals.reduce((sum: number, d: any) => sum + (d.value || 0) * 0.2, 0)

  const optimistic = closedWon +
    highConfDeals.reduce((sum: number, d: any) => sum + (d.value || 0) * 0.95, 0) +
    medConfDeals.reduce((sum: number, d: any) => sum + (d.value || 0) * 0.7, 0) +
    lowConfDeals.reduce((sum: number, d: any) => sum + (d.value || 0) * 0.4, 0)

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

