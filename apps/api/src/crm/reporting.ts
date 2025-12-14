import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { requireAuth } from '../auth/rbac.js'

export const reportingRouter = Router()

reportingRouter.use(requireAuth)

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [yy, mm, dd] = s.split('-').map((n) => Number(n))
    if (!yy || !mm || !dd) return null
    const d = new Date(yy, mm - 1, dd)
    return Number.isFinite(d.getTime()) ? d : null
  }
  const d = new Date(s)
  return Number.isFinite(d.getTime()) ? d : null
}

function getRange(startRaw?: string, endRaw?: string) {
  const now = new Date()
  const startParsed = parseDateOnly(startRaw)
  const endParsed = parseDateOnly(endRaw)
  if (startParsed && endParsed) {
    const start = new Date(startParsed.getFullYear(), startParsed.getMonth(), startParsed.getDate())
    const endExclusive = new Date(endParsed.getFullYear(), endParsed.getMonth(), endParsed.getDate() + 1)
    return { start, endExclusive, end: new Date(endExclusive.getTime() - 1) }
  }
  // Default: last 30 days
  const endExclusive = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const start = new Date(endExclusive.getTime() - 30 * 24 * 60 * 60 * 1000)
  return { start, endExclusive, end: new Date(endExclusive.getTime() - 1) }
}

// GET /api/crm/reporting/overview?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// A lightweight "competitive edge" reporting endpoint (cross-module KPIs).
reportingRouter.get('/overview', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { start, end, endExclusive } = getRange(
    typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
    typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
  )

  const startIso = start.toISOString()
  const endIso = endExclusive.toISOString()
  const now = new Date()

  // === Deals / pipeline ===
  const closedWonStages = new Set(['Closed Won', 'Contract Signed / Closed Won'])
  const closedLostStages = new Set(['Closed Lost'])
  const closeDateMatch: any = {
    $or: [
      { forecastedCloseDate: { $gte: start, $lt: endExclusive } },
      { forecastedCloseDate: { $gte: startIso, $lt: endIso } },
      { $and: [{ forecastedCloseDate: null }, { closeDate: { $gte: start, $lt: endExclusive } }] },
      { $and: [{ forecastedCloseDate: null }, { closeDate: { $gte: startIso, $lt: endIso } }] },
      { $and: [{ forecastedCloseDate: { $exists: false } }, { closeDate: { $gte: start, $lt: endExclusive } }] },
      { $and: [{ forecastedCloseDate: { $exists: false } }, { closeDate: { $gte: startIso, $lt: endIso } }] },
    ],
  }

  const deals = (await db.collection('deals').find(closeDateMatch).project({ title: 1, amount: 1, stage: 1, ownerId: 1, forecastedCloseDate: 1, closeDate: 1, dealNumber: 1, lastActivityAt: 1, updatedAt: 1, createdAt: 1, stageChangedAt: 1 }).toArray()) as any[]
  const pipelineDeals = deals.filter((d) => !closedWonStages.has(String(d.stage || '')) && !closedLostStages.has(String(d.stage || '')))
  const wonDeals = deals.filter((d) => closedWonStages.has(String(d.stage || '')))

  const pipelineValue = pipelineDeals.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const wonValue = wonDeals.reduce((s, d) => s + (Number(d.amount) || 0), 0)

  // === Support tickets ===
  const tickets = (await db
    .collection('support_tickets')
    .find({ createdAt: { $gte: start, $lt: endExclusive } }, { projection: { status: 1, priority: 1, slaDueAt: 1, createdAt: 1 } as any })
    .toArray()) as any[]
  const openStatuses = new Set(['open', 'in_progress'])
  const openTickets = tickets.filter((t) => openStatuses.has(String(t.status || '')))
  const breachedTickets = openTickets.filter((t) => t.slaDueAt && new Date(t.slaDueAt).getTime() < now.getTime())

  // === Marketing engagement ===
  const events = (await db
    .collection('marketing_events')
    .find({ at: { $gte: start, $lt: endExclusive } }, { projection: { event: 1 } as any })
    .toArray()) as any[]
  const opens = events.filter((e) => e.event === 'open').length
  const clicks = events.filter((e) => e.event === 'click').length
  const unsubscribes = await db.collection('marketing_unsubscribes').countDocuments({ at: { $gte: start, $lt: endExclusive } } as any)

  const engagedSegments = (await db
    .collection('marketing_segments')
    .find({ engagementCampaignId: { $exists: true, $ne: null } }, { projection: { name: 1, emails: 1, updatedAt: 1, engagementCampaignId: 1 } as any })
    .limit(50)
    .toArray()) as any[]

  // === Surveys / feedback (lightweight) ===
  const surveyResponses = await db.collection('survey_responses').countDocuments({ createdAt: { $gte: start, $lt: endExclusive } } as any)

  res.json({
    data: {
      range: { startDate: start, endDate: end },
      kpis: {
        pipelineDeals: pipelineDeals.length,
        pipelineValue,
        closedWonDeals: wonDeals.length,
        closedWonValue: wonValue,
        openTickets: openTickets.length,
        breachedTickets: breachedTickets.length,
        marketingOpens: opens,
        marketingClicks: clicks,
        marketingUnsubscribes: unsubscribes,
        surveyResponses,
        engagedSegments: engagedSegments.length,
      },
      lists: {
        engagedSegments: engagedSegments.map((s) => ({
          id: String(s._id),
          name: s.name,
          emailCount: Array.isArray(s.emails) ? s.emails.length : 0,
          updatedAt: s.updatedAt || null,
        })),
        topPipeline: pipelineDeals
          .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
          .slice(0, 10)
          .map((d) => ({
            id: String(d._id),
            dealNumber: d.dealNumber ?? null,
            title: d.title || 'Untitled',
            stage: d.stage || null,
            amount: Number(d.amount) || 0,
            ownerId: d.ownerId || null,
            forecastedCloseDate: d.forecastedCloseDate || null,
          })),
      },
    },
    error: null,
  })
})


