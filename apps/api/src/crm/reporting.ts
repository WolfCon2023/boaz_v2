import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { requireAuth } from '../auth/rbac.js'
import { computeReportingOverview, getRange as getCoreRange } from './reporting_core.js'

export const reportingRouter = Router()

reportingRouter.use(requireAuth)

function safeNumber(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

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

function validateDateOnlyParam(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true, value: '' }
  if (typeof raw !== 'string') return { ok: false, error: 'invalid_date' }
  const d = parseDateOnly(raw)
  if (!d) return { ok: false, error: 'invalid_date' }
  // normalize to YYYY-MM-DD for consistent downstream behavior
  const iso = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10)
  return { ok: true, value: iso }
}

async function computeOverview(db: any, start: Date, endExclusive: Date) {
  const startIso = start.toISOString()
  const endIso = endExclusive.toISOString()
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const rangeDays = Math.max(1, Math.ceil((endExclusive.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)))

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

  const deals = (await db
    .collection('deals')
    .find(closeDateMatch)
    .project({
      title: 1,
      amount: 1,
      stage: 1,
      ownerId: 1,
      forecastedCloseDate: 1,
      closeDate: 1,
      dealNumber: 1,
      lastActivityAt: 1,
      updatedAt: 1,
      createdAt: 1,
      stageChangedAt: 1,
    })
    .toArray()) as any[]

  const pipelineDeals = deals.filter((d) => !closedWonStages.has(String(d.stage || '')) && !closedLostStages.has(String(d.stage || '')))
  const wonDeals = deals.filter((d) => closedWonStages.has(String(d.stage || '')))

  const pipelineValue = pipelineDeals.reduce((s, d) => s + safeNumber(d.amount), 0)
  const wonValue = wonDeals.reduce((s, d) => s + safeNumber(d.amount), 0)

  // === Support tickets ===
  const tickets = (await db
    .collection('support_tickets')
    .find({ createdAt: { $gte: start, $lt: endExclusive } }, { projection: { status: 1, priority: 1, slaDueAt: 1, createdAt: 1 } as any })
    .toArray()) as any[]
  const openStatuses = new Set(['open', 'in_progress'])
  const openTickets = tickets.filter((t) => openStatuses.has(String(t.status || '')))
  const breachedTickets = openTickets.filter((t) => t.slaDueAt && new Date(t.slaDueAt).getTime() < now.getTime())
  const openByPriority: Record<string, number> = {}
  for (const t of openTickets) {
    const p = String(t.priority || 'normal')
    openByPriority[p] = (openByPriority[p] ?? 0) + 1
  }

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
    .limit(200)
    .toArray()) as any[]
  const totalEngagedEmails = engagedSegments.reduce((sum, s) => sum + (Array.isArray(s.emails) ? s.emails.length : 0), 0)

  // === Surveys / feedback ===
  const surveyResponses = await db.collection('survey_responses').countDocuments({ createdAt: { $gte: start, $lt: endExclusive } } as any)

  // === Quotes ===
  const quotesCreated = await db.collection('quotes').countDocuments({ createdAt: { $gte: start, $lt: endExclusive } } as any)
  const quotesAccepted = await db.collection('quote_acceptances').countDocuments({ acceptedAt: { $gte: start, $lt: endExclusive } } as any)
  const quoteAcceptanceRate = quotesCreated > 0 ? quotesAccepted / quotesCreated : 0

  // === Invoices / receivables ===
  const invoicesCreated = await db.collection('invoices').countDocuments({ createdAt: { $gte: start, $lt: endExclusive } } as any)

  // Invoiced revenue (issued in selected range)
  const invoicedDocs = (await db
    .collection('invoices')
    .find({ issuedAt: { $gte: start, $lt: endExclusive } } as any, { projection: { total: 1 } as any })
    .limit(5000)
    .toArray()) as any[]
  const invoicedRevenue = invoicedDocs.reduce((s, inv) => s + safeNumber(inv.total), 0)

  // Avg days-to-pay for invoices that were paid during the selected range (best-effort approximation)
  const paidDocs = (await db
    .collection('invoices')
    .find({ paidAt: { $gte: start, $lt: endExclusive } } as any, { projection: { issuedAt: 1, paidAt: 1 } as any })
    .limit(5000)
    .toArray()) as any[]
  let paidCount = 0
  let paidDaysSum = 0
  for (const inv of paidDocs) {
    const issued = inv.issuedAt ? new Date(inv.issuedAt) : null
    const paid = inv.paidAt ? new Date(inv.paidAt) : null
    if (!issued || !paid) continue
    if (!Number.isFinite(issued.getTime()) || !Number.isFinite(paid.getTime())) continue
    const days = Math.max(0, Math.ceil((paid.getTime() - issued.getTime()) / (24 * 60 * 60 * 1000)))
    paidCount++
    paidDaysSum += days
  }
  const avgDaysToPay = paidCount > 0 ? paidDaysSum / paidCount : null

  const openInvoices = (await db
    .collection('invoices')
    .find(
      { balance: { $gt: 0 }, status: { $nin: ['void', 'uncollectible'] } } as any,
      { projection: { invoiceNumber: 1, title: 1, status: 1, balance: 1, total: 1, dueDate: 1, issuedAt: 1, createdAt: 1 } as any },
    )
    .limit(2000)
    .toArray()) as any[]

  let receivablesOutstanding = 0
  let receivablesOverdue = 0
  const aging: Record<string, { count: number; balance: number }> = {
    current: { count: 0, balance: 0 },
    '1_30': { count: 0, balance: 0 },
    '31_60': { count: 0, balance: 0 },
    '61_90': { count: 0, balance: 0 },
    '90_plus': { count: 0, balance: 0 },
  }
  for (const inv of openInvoices) {
    const bal = safeNumber(inv.balance)
    receivablesOutstanding += bal
    const due = inv.dueDate ? new Date(inv.dueDate) : null
    if (!due || !Number.isFinite(due.getTime())) {
      aging.current.count++
      aging.current.balance += bal
      continue
    }
    const overdueDays = Math.floor((todayStart.getTime() - new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()) / (24 * 60 * 60 * 1000))
    if (overdueDays <= 0) {
      aging.current.count++
      aging.current.balance += bal
    } else if (overdueDays <= 30) {
      receivablesOverdue += bal
      aging['1_30'].count++
      aging['1_30'].balance += bal
    } else if (overdueDays <= 60) {
      receivablesOverdue += bal
      aging['31_60'].count++
      aging['31_60'].balance += bal
    } else if (overdueDays <= 90) {
      receivablesOverdue += bal
      aging['61_90'].count++
      aging['61_90'].balance += bal
    } else {
      receivablesOverdue += bal
      aging['90_plus'].count++
      aging['90_plus'].balance += bal
    }
  }

  // DSO (best-effort): (current AR / average daily invoiced revenue in range) * days
  const dsoDays = invoicedRevenue > 0 ? receivablesOutstanding / (invoicedRevenue / rangeDays) : null

  // === Renewals ===
  const renewalsActive = (await db
    .collection('renewals')
    .find({ status: { $in: ['Active', 'Pending Renewal'] } } as any, { projection: { status: 1, renewalDate: 1, mrr: 1, arr: 1, churnRisk: 1 } as any })
    .limit(5000)
    .toArray()) as any[]

  let totalActiveMRR = 0
  let totalActiveARR = 0
  let mrrNext30 = 0
  let mrrNext90 = 0
  let highChurnRisk = 0
  const next30 = new Date(now)
  next30.setDate(next30.getDate() + 30)
  const next90 = new Date(now)
  next90.setDate(next90.getDate() + 90)

  for (const r of renewalsActive) {
    const mrr = r.mrr != null ? safeNumber(r.mrr) : r.arr != null ? safeNumber(r.arr) / 12 : 0
    const arr = r.arr != null ? safeNumber(r.arr) : r.mrr != null ? safeNumber(r.mrr) * 12 : 0
    totalActiveMRR += mrr
    totalActiveARR += arr
    if (String(r.churnRisk || '') === 'High') highChurnRisk++

    if (r.renewalDate) {
      const d = new Date(r.renewalDate)
      if (Number.isFinite(d.getTime())) {
        if (d >= now && d <= next30) mrrNext30 += mrr
        if (d >= now && d <= next90) mrrNext90 += mrr
      }
    }
  }

  const renewalsDueInRange = renewalsActive.filter((r) => {
    if (!r.renewalDate) return false
    const d = new Date(r.renewalDate)
    return Number.isFinite(d.getTime()) && d >= start && d < endExclusive
  })
  const renewalsDueCount = renewalsDueInRange.length
  const renewalsDueMRR = renewalsDueInRange.reduce((s, r) => {
    const mrr = r.mrr != null ? safeNumber(r.mrr) : r.arr != null ? safeNumber(r.arr) / 12 : 0
    return s + mrr
  }, 0)

  return {
    range: { startDate: start, endDate: new Date(endExclusive.getTime() - 1) },
    kpis: {
      pipelineDeals: pipelineDeals.length,
      pipelineValue,
      closedWonDeals: wonDeals.length,
      closedWonValue: wonValue,
      openTickets: openTickets.length,
      breachedTickets: breachedTickets.length,
      ticketsOpenByPriority: openByPriority,
      marketingOpens: opens,
      marketingClicks: clicks,
      marketingUnsubscribes: unsubscribes,
      marketingClickThroughRate: opens > 0 ? clicks / opens : 0,
      engagedSegments: engagedSegments.length,
      engagedEmails: totalEngagedEmails,
      surveyResponses,
      quotesCreated,
      quotesAccepted,
      quoteAcceptanceRate,
      invoicesCreated,
      invoicedRevenue,
      receivablesOutstanding,
      receivablesOverdue,
      receivablesAging: aging,
      dsoDays,
      avgDaysToPay,
      totalActiveMRR,
      totalActiveARR,
      renewalsMrrNext30: mrrNext30,
      renewalsMrrNext90: mrrNext90,
      renewalsHighChurnRisk: highChurnRisk,
      renewalsDueCount,
      renewalsDueMRR,
    },
    lists: {
      engagedSegments: engagedSegments.map((s) => ({
        id: String(s._id),
        name: s.name,
        emailCount: Array.isArray(s.emails) ? s.emails.length : 0,
        updatedAt: s.updatedAt || null,
      })),
      topPipeline: pipelineDeals
        .sort((a, b) => safeNumber(b.amount) - safeNumber(a.amount))
        .slice(0, 10)
        .map((d) => ({
          id: String(d._id),
          dealNumber: d.dealNumber ?? null,
          title: d.title || 'Untitled',
          stage: d.stage || null,
          amount: safeNumber(d.amount),
          ownerId: d.ownerId || null,
          forecastedCloseDate: d.forecastedCloseDate || null,
        })),
    },
  }
}

// GET /api/crm/reporting/overview?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// A lightweight "competitive edge" reporting endpoint (cross-module KPIs).
reportingRouter.get('/overview', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const t0 = Date.now()
  const startParam = validateDateOnlyParam(req.query.startDate)
  const endParam = validateDateOnlyParam(req.query.endDate)
  if (!startParam.ok) return res.status(400).json({ data: null, error: 'invalid_startDate' })
  if (!endParam.ok) return res.status(400).json({ data: null, error: 'invalid_endDate' })

  const { start, end, endExclusive } = getRange(
    startParam.value || undefined,
    endParam.value || undefined,
  )

  const overview = await computeOverview(db, start, endExclusive)
  console.log(`[reporting] GET /overview ${res.statusCode} ${Date.now() - t0}ms`)
  res.json({ data: overview, error: null })
})

// GET /api/crm/reporting/report?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Detailed executive report payload (overview + detailed financial/ops tables)
reportingRouter.get('/report', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const t0 = Date.now()
  const startParam = validateDateOnlyParam(req.query.startDate)
  const endParam = validateDateOnlyParam(req.query.endDate)
  if (!startParam.ok) return res.status(400).json({ data: null, error: 'invalid_startDate' })
  if (!endParam.ok) return res.status(400).json({ data: null, error: 'invalid_endDate' })

  const { start, end, endExclusive } = getRange(
    startParam.value || undefined,
    endParam.value || undefined,
  )

  const overview = await computeOverview(db, start, endExclusive)

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const msDay = 24 * 60 * 60 * 1000

  // === Financial details ===
  // Payments collected during range (from embedded invoice.payments array)
  const paidInvoices = (await db
    .collection('invoices')
    .find(
      { 'payments.paidAt': { $gte: start, $lt: endExclusive } } as any,
      { projection: { invoiceNumber: 1, title: 1, accountId: 1, payments: 1, total: 1, status: 1 } as any },
    )
    .limit(5000)
    .toArray()) as any[]
  let cashCollected = 0
  const paymentsByMethod: Record<string, number> = {}
  const paymentEvents: Array<{
    invoiceId: string
    invoiceNumber: number | null
    title: string
    accountId: string | null
    accountName: string | null
    amount: number
    method: string | null
    paidAt: string
  }> = []
  for (const inv of paidInvoices) {
    for (const p of inv.payments ?? []) {
      const paidAt = p?.paidAt ? new Date(p.paidAt) : null
      if (!paidAt || !Number.isFinite(paidAt.getTime())) continue
      if (paidAt >= start && paidAt < endExclusive) {
        const amt = safeNumber(p.amount)
        const method = String(p.method || 'unknown')
        cashCollected += amt
        paymentsByMethod[method] = (paymentsByMethod[method] ?? 0) + amt
        paymentEvents.push({
          invoiceId: String(inv._id),
          invoiceNumber: typeof inv.invoiceNumber === 'number' ? inv.invoiceNumber : null,
          title: inv.title || 'Untitled',
          accountId: inv.accountId ? String(inv.accountId) : null,
          accountName: null,
          amount: amt,
          method: method || null,
          paidAt: paidAt.toISOString(),
        })
      }
    }
  }

  // Refunds issued during range (from embedded invoice.refunds array)
  const refundedInvoices = (await db
    .collection('invoices')
    .find(
      { 'refunds.refundedAt': { $gte: start, $lt: endExclusive } } as any,
      { projection: { invoiceNumber: 1, title: 1, accountId: 1, refunds: 1, total: 1, status: 1 } as any },
    )
    .limit(5000)
    .toArray()) as any[]
  let refundsIssued = 0
  const refundEvents: Array<{
    invoiceId: string
    invoiceNumber: number | null
    title: string
    accountId: string | null
    accountName: string | null
    amount: number
    reason: string | null
    refundedAt: string
  }> = []
  for (const inv of refundedInvoices) {
    for (const r of inv.refunds ?? []) {
      const refundedAt = r?.refundedAt ? new Date(r.refundedAt) : null
      if (!refundedAt || !Number.isFinite(refundedAt.getTime())) continue
      if (refundedAt >= start && refundedAt < endExclusive) {
        const amt = safeNumber(r.amount)
        refundsIssued += amt
        refundEvents.push({
          invoiceId: String(inv._id),
          invoiceNumber: typeof inv.invoiceNumber === 'number' ? inv.invoiceNumber : null,
          title: inv.title || 'Untitled',
          accountId: inv.accountId ? String(inv.accountId) : null,
          accountName: null,
          amount: amt,
          reason: typeof r.reason === 'string' ? r.reason : null,
          refundedAt: refundedAt.toISOString(),
        })
      }
    }
  }
  const netCash = cashCollected - refundsIssued

  // Invoicing composition (issued in range)
  const invoicedDocs = (await db
    .collection('invoices')
    .find({ issuedAt: { $gte: start, $lt: endExclusive } } as any, { projection: { subtotal: 1, tax: 1, discountAmount: 1, total: 1 } as any })
    .limit(5000)
    .toArray()) as any[]
  const invoiced = {
    subtotal: invoicedDocs.reduce((s, x) => s + safeNumber(x.subtotal), 0),
    discounts: invoicedDocs.reduce((s, x) => s + safeNumber(x.discountAmount), 0),
    tax: invoicedDocs.reduce((s, x) => s + safeNumber(x.tax), 0),
    total: invoicedDocs.reduce((s, x) => s + safeNumber(x.total), 0),
    count: invoicedDocs.length,
  }

  // Top overdue invoices
  const overdueInvoices = (await db
    .collection('invoices')
    .find(
      {
        balance: { $gt: 0 },
        status: { $nin: ['void', 'uncollectible'] },
        dueDate: { $lt: todayStart },
      } as any,
      { projection: { invoiceNumber: 1, title: 1, accountId: 1, balance: 1, dueDate: 1, issuedAt: 1, status: 1 } as any },
    )
    .sort({ dueDate: 1 })
    .limit(50)
    .toArray()) as any[]

  const accountIds = Array.from(
    new Set(
      overdueInvoices
        .map((x) => x.accountId)
        .filter(Boolean)
        .map((id: any) => String(id)),
    ),
  )
  const accountDocs =
    accountIds.length > 0
      ? ((await db
          .collection('accounts')
          .find({ _id: { $in: accountIds.filter(ObjectId.isValid).map((id) => new ObjectId(id)) } } as any, { projection: { name: 1, accountNumber: 1 } as any })
          .toArray()) as any[])
      : []
  const accountNameById = new Map(accountDocs.map((a) => [String(a._id), a.name || `Account ${a.accountNumber || ''}`.trim()]))

  // Fill accountName for payment/refund events where possible
  for (const ev of paymentEvents) {
    if (ev.accountId) ev.accountName = accountNameById.get(ev.accountId) || null
  }
  for (const ev of refundEvents) {
    if (ev.accountId) ev.accountName = accountNameById.get(ev.accountId) || null
  }

  const overdueInvoiceRows = overdueInvoices.map((inv) => {
    const due = inv.dueDate ? new Date(inv.dueDate) : null
    const dueStart = due ? new Date(due.getFullYear(), due.getMonth(), due.getDate()) : null
    const daysOverdue =
      dueStart && Number.isFinite(dueStart.getTime()) ? Math.max(0, Math.floor((todayStart.getTime() - dueStart.getTime()) / msDay)) : null
    return {
      invoiceId: String(inv._id),
      invoiceNumber: inv.invoiceNumber ?? null,
      title: inv.title || 'Untitled',
      accountId: inv.accountId ? String(inv.accountId) : null,
      accountName: inv.accountId ? accountNameById.get(String(inv.accountId)) || null : null,
      balance: safeNumber(inv.balance),
      status: inv.status || null,
      dueDate: inv.dueDate || null,
      issuedAt: inv.issuedAt || null,
      daysOverdue,
    }
  })

  // Top paid invoices (by amount collected in range)
  const paidByInvoice = new Map<string, { invoiceId: string; invoiceNumber: number | null; title: string; accountName: string | null; totalPaid: number; paymentCount: number }>() 
  for (const ev of paymentEvents) {
    const key = ev.invoiceId
    const cur = paidByInvoice.get(key) || {
      invoiceId: ev.invoiceId,
      invoiceNumber: ev.invoiceNumber,
      title: ev.title,
      accountName: ev.accountName,
      totalPaid: 0,
      paymentCount: 0,
    }
    cur.totalPaid += ev.amount
    cur.paymentCount += 1
    paidByInvoice.set(key, cur)
  }
  const topPaidInvoices = Array.from(paidByInvoice.values())
    .sort((a, b) => b.totalPaid - a.totalPaid)
    .slice(0, 25)

  // === Renewals lists ===
  const renewalsDue = (await db
    .collection('renewals')
    .find({ renewalDate: { $gte: start, $lt: endExclusive }, status: { $in: ['Active', 'Pending Renewal'] } } as any, { projection: { name: 1, accountName: 1, status: 1, renewalDate: 1, mrr: 1, arr: 1, churnRisk: 1 } as any })
    .sort({ renewalDate: 1 })
    .limit(50)
    .toArray()) as any[]
  const highRiskRenewals = (await db
    .collection('renewals')
    .find({ churnRisk: 'High', status: { $in: ['Active', 'Pending Renewal'] } } as any, { projection: { name: 1, accountName: 1, status: 1, renewalDate: 1, mrr: 1, arr: 1, churnRisk: 1 } as any })
    .sort({ renewalDate: 1 })
    .limit(50)
    .toArray()) as any[]

  // === Ticket backlog ===
  const backlog = (await db
    .collection('support_tickets')
    .find({ status: { $in: ['open', 'in_progress'] } } as any, { projection: { ticketNumber: 1, shortDescription: 1, priority: 1, status: 1, slaDueAt: 1, updatedAt: 1, requesterName: 1, requesterEmail: 1 } as any })
    .sort({ priority: 1, updatedAt: -1 })
    .limit(50)
    .toArray()) as any[]
  const breached = backlog.filter((t) => t.slaDueAt && new Date(t.slaDueAt).getTime() < now.getTime()).slice(0, 50)

  res.json({
    data: {
      overview,
      details: {
        financial: {
          invoiced,
          cashCollected,
          refundsIssued,
          netCash,
          topOverdueInvoices: overdueInvoiceRows,
          paymentsByMethod,
          topPaidInvoices,
          paymentEvents: paymentEvents.sort((a, b) => b.paidAt.localeCompare(a.paidAt)).slice(0, 200),
          refundEvents: refundEvents.sort((a, b) => b.refundedAt.localeCompare(a.refundedAt)).slice(0, 200),
        },
        renewals: {
          dueInRange: renewalsDue.map((r) => ({
            id: String(r._id),
            name: r.name,
            accountName: r.accountName || null,
            status: r.status,
            renewalDate: r.renewalDate || null,
            mrr: safeNumber(r.mrr) || (r.arr != null ? safeNumber(r.arr) / 12 : 0),
            arr: safeNumber(r.arr) || (r.mrr != null ? safeNumber(r.mrr) * 12 : 0),
            churnRisk: r.churnRisk || null,
          })),
          highChurnRisk: highRiskRenewals.map((r) => ({
            id: String(r._id),
            name: r.name,
            accountName: r.accountName || null,
            status: r.status,
            renewalDate: r.renewalDate || null,
            mrr: safeNumber(r.mrr) || (r.arr != null ? safeNumber(r.arr) / 12 : 0),
            arr: safeNumber(r.arr) || (r.mrr != null ? safeNumber(r.mrr) * 12 : 0),
            churnRisk: r.churnRisk || null,
          })),
        },
        support: {
          backlog: backlog.map((t) => ({
            id: String(t._id),
            ticketNumber: t.ticketNumber ?? null,
            shortDescription: t.shortDescription || 'Untitled',
            priority: t.priority || 'normal',
            status: t.status || 'open',
            slaDueAt: t.slaDueAt || null,
            updatedAt: t.updatedAt || null,
            requesterName: t.requesterName || null,
            requesterEmail: t.requesterEmail || null,
          })),
          breached: breached.map((t) => ({
            id: String(t._id),
            ticketNumber: t.ticketNumber ?? null,
            shortDescription: t.shortDescription || 'Untitled',
            priority: t.priority || 'normal',
            status: t.status || 'open',
            slaDueAt: t.slaDueAt || null,
            updatedAt: t.updatedAt || null,
            requesterName: t.requesterName || null,
            requesterEmail: t.requesterEmail || null,
          })),
        },
      },
    },
    error: null,
  })
  console.log(`[reporting] GET /report ${res.statusCode} ${Date.now() - t0}ms`)
})

// === Snapshots ===
type ReportingSnapshotDoc = {
  _id: ObjectId | string
  createdAt: Date
  createdByUserId?: string
  kind?: 'manual' | 'scheduled'
  scheduleKey?: string | null
  range: { startDate: Date; endDate: Date }
  kpis: Record<string, any>
}

// POST /api/crm/reporting/snapshots/run-daily
// Triggers (or upserts) the scheduled daily snapshot now. Safe in multi-instance environments due to stable string _id.
reportingRouter.post('/snapshots/run-daily', async (_req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const now = new Date()
  const dayKey = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10)
  const scheduleKey = `daily:${dayKey}`

  const endDate = dayKey
  const startDt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  startDt.setUTCDate(startDt.getUTCDate() - 29)
  const startDate = startDt.toISOString().slice(0, 10)

  const { start, endExclusive } = getCoreRange(startDate, endDate)
  const overview = await computeReportingOverview({ db, start, endExclusive })

  const doc: any = {
    _id: scheduleKey,
    createdAt: new Date(),
    createdByUserId: null,
    kind: 'scheduled',
    scheduleKey,
    range: { startDate: overview.range.startDate, endDate: overview.range.endDate },
    kpis: overview.kpis,
  }

  await db.collection<any>('reporting_snapshots').updateOne(
    { _id: scheduleKey } as any,
    { $setOnInsert: doc },
    { upsert: true },
  )

  res.json({ data: { ok: true, scheduleKey }, error: null })
})

// POST /api/crm/reporting/snapshots { startDate?, endDate? }
reportingRouter.post('/snapshots', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const raw = req.body ?? {}
  const startParam = validateDateOnlyParam(raw.startDate)
  const endParam = validateDateOnlyParam(raw.endDate)
  if (!startParam.ok) return res.status(400).json({ data: null, error: 'invalid_startDate' })
  if (!endParam.ok) return res.status(400).json({ data: null, error: 'invalid_endDate' })

  const { start, endExclusive } = getRange(startParam.value || undefined, endParam.value || undefined)

  const overview = await computeOverview(db, start, endExclusive)
  const auth = (req as any).auth as { userId: string; email: string } | undefined

  const doc: ReportingSnapshotDoc = {
    _id: new ObjectId(),
    createdAt: new Date(),
    createdByUserId: auth?.userId,
    kind: 'manual',
    scheduleKey: null,
    range: { startDate: overview.range.startDate as any, endDate: overview.range.endDate as any },
    kpis: overview.kpis as any,
  }

  await db.collection('reporting_snapshots').insertOne(doc as any)

  res.json({
    data: {
      id: String(doc._id),
      createdAt: doc.createdAt,
      kind: doc.kind,
      scheduleKey: doc.scheduleKey,
      range: doc.range,
      kpis: doc.kpis,
    },
    error: null,
  })
})

// GET /api/crm/reporting/snapshots?limit=20
reportingRouter.get('/snapshots', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const limitRaw = Number(req.query.limit)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20

  const items = (await db
    .collection<ReportingSnapshotDoc>('reporting_snapshots')
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()) as ReportingSnapshotDoc[]

  res.json({
    data: {
      items: items.map((s) => ({
        id: String((s as any)._id),
        createdAt: s.createdAt,
        createdByUserId: s.createdByUserId ?? null,
        kind: (s as any).kind ?? 'manual',
        scheduleKey: (s as any).scheduleKey ?? null,
        range: s.range,
        kpis: s.kpis,
      })),
    },
    error: null,
  })
})


