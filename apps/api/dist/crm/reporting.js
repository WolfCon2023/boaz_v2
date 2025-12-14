import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/rbac.js';
export const reportingRouter = Router();
reportingRouter.use(requireAuth);
function safeNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}
function parseDateOnly(value) {
    if (typeof value !== 'string')
        return null;
    const s = value.trim();
    if (!s)
        return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [yy, mm, dd] = s.split('-').map((n) => Number(n));
        if (!yy || !mm || !dd)
            return null;
        const d = new Date(yy, mm - 1, dd);
        return Number.isFinite(d.getTime()) ? d : null;
    }
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
}
function getRange(startRaw, endRaw) {
    const now = new Date();
    const startParsed = parseDateOnly(startRaw);
    const endParsed = parseDateOnly(endRaw);
    if (startParsed && endParsed) {
        const start = new Date(startParsed.getFullYear(), startParsed.getMonth(), startParsed.getDate());
        const endExclusive = new Date(endParsed.getFullYear(), endParsed.getMonth(), endParsed.getDate() + 1);
        return { start, endExclusive, end: new Date(endExclusive.getTime() - 1) };
    }
    // Default: last 30 days
    const endExclusive = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const start = new Date(endExclusive.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start, endExclusive, end: new Date(endExclusive.getTime() - 1) };
}
async function computeOverview(db, start, endExclusive) {
    const startIso = start.toISOString();
    const endIso = endExclusive.toISOString();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rangeDays = Math.max(1, Math.ceil((endExclusive.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
    // === Deals / pipeline ===
    const closedWonStages = new Set(['Closed Won', 'Contract Signed / Closed Won']);
    const closedLostStages = new Set(['Closed Lost']);
    const closeDateMatch = {
        $or: [
            { forecastedCloseDate: { $gte: start, $lt: endExclusive } },
            { forecastedCloseDate: { $gte: startIso, $lt: endIso } },
            { $and: [{ forecastedCloseDate: null }, { closeDate: { $gte: start, $lt: endExclusive } }] },
            { $and: [{ forecastedCloseDate: null }, { closeDate: { $gte: startIso, $lt: endIso } }] },
            { $and: [{ forecastedCloseDate: { $exists: false } }, { closeDate: { $gte: start, $lt: endExclusive } }] },
            { $and: [{ forecastedCloseDate: { $exists: false } }, { closeDate: { $gte: startIso, $lt: endIso } }] },
        ],
    };
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
        .toArray());
    const pipelineDeals = deals.filter((d) => !closedWonStages.has(String(d.stage || '')) && !closedLostStages.has(String(d.stage || '')));
    const wonDeals = deals.filter((d) => closedWonStages.has(String(d.stage || '')));
    const pipelineValue = pipelineDeals.reduce((s, d) => s + safeNumber(d.amount), 0);
    const wonValue = wonDeals.reduce((s, d) => s + safeNumber(d.amount), 0);
    // === Support tickets ===
    const tickets = (await db
        .collection('support_tickets')
        .find({ createdAt: { $gte: start, $lt: endExclusive } }, { projection: { status: 1, priority: 1, slaDueAt: 1, createdAt: 1 } })
        .toArray());
    const openStatuses = new Set(['open', 'in_progress']);
    const openTickets = tickets.filter((t) => openStatuses.has(String(t.status || '')));
    const breachedTickets = openTickets.filter((t) => t.slaDueAt && new Date(t.slaDueAt).getTime() < now.getTime());
    const openByPriority = {};
    for (const t of openTickets) {
        const p = String(t.priority || 'normal');
        openByPriority[p] = (openByPriority[p] ?? 0) + 1;
    }
    // === Marketing engagement ===
    const events = (await db
        .collection('marketing_events')
        .find({ at: { $gte: start, $lt: endExclusive } }, { projection: { event: 1 } })
        .toArray());
    const opens = events.filter((e) => e.event === 'open').length;
    const clicks = events.filter((e) => e.event === 'click').length;
    const unsubscribes = await db.collection('marketing_unsubscribes').countDocuments({ at: { $gte: start, $lt: endExclusive } });
    const engagedSegments = (await db
        .collection('marketing_segments')
        .find({ engagementCampaignId: { $exists: true, $ne: null } }, { projection: { name: 1, emails: 1, updatedAt: 1, engagementCampaignId: 1 } })
        .limit(200)
        .toArray());
    const totalEngagedEmails = engagedSegments.reduce((sum, s) => sum + (Array.isArray(s.emails) ? s.emails.length : 0), 0);
    // === Surveys / feedback ===
    const surveyResponses = await db.collection('survey_responses').countDocuments({ createdAt: { $gte: start, $lt: endExclusive } });
    // === Quotes ===
    const quotesCreated = await db.collection('quotes').countDocuments({ createdAt: { $gte: start, $lt: endExclusive } });
    const quotesAccepted = await db.collection('quote_acceptances').countDocuments({ acceptedAt: { $gte: start, $lt: endExclusive } });
    const quoteAcceptanceRate = quotesCreated > 0 ? quotesAccepted / quotesCreated : 0;
    // === Invoices / receivables ===
    const invoicesCreated = await db.collection('invoices').countDocuments({ createdAt: { $gte: start, $lt: endExclusive } });
    // Invoiced revenue (issued in selected range)
    const invoicedDocs = (await db
        .collection('invoices')
        .find({ issuedAt: { $gte: start, $lt: endExclusive } }, { projection: { total: 1 } })
        .limit(5000)
        .toArray());
    const invoicedRevenue = invoicedDocs.reduce((s, inv) => s + safeNumber(inv.total), 0);
    // Avg days-to-pay for invoices that were paid during the selected range (best-effort approximation)
    const paidDocs = (await db
        .collection('invoices')
        .find({ paidAt: { $gte: start, $lt: endExclusive } }, { projection: { issuedAt: 1, paidAt: 1 } })
        .limit(5000)
        .toArray());
    let paidCount = 0;
    let paidDaysSum = 0;
    for (const inv of paidDocs) {
        const issued = inv.issuedAt ? new Date(inv.issuedAt) : null;
        const paid = inv.paidAt ? new Date(inv.paidAt) : null;
        if (!issued || !paid)
            continue;
        if (!Number.isFinite(issued.getTime()) || !Number.isFinite(paid.getTime()))
            continue;
        const days = Math.max(0, Math.ceil((paid.getTime() - issued.getTime()) / (24 * 60 * 60 * 1000)));
        paidCount++;
        paidDaysSum += days;
    }
    const avgDaysToPay = paidCount > 0 ? paidDaysSum / paidCount : null;
    const openInvoices = (await db
        .collection('invoices')
        .find({ balance: { $gt: 0 }, status: { $nin: ['void', 'uncollectible'] } }, { projection: { invoiceNumber: 1, title: 1, status: 1, balance: 1, total: 1, dueDate: 1, issuedAt: 1, createdAt: 1 } })
        .limit(2000)
        .toArray());
    let receivablesOutstanding = 0;
    let receivablesOverdue = 0;
    const aging = {
        current: { count: 0, balance: 0 },
        '1_30': { count: 0, balance: 0 },
        '31_60': { count: 0, balance: 0 },
        '61_90': { count: 0, balance: 0 },
        '90_plus': { count: 0, balance: 0 },
    };
    for (const inv of openInvoices) {
        const bal = safeNumber(inv.balance);
        receivablesOutstanding += bal;
        const due = inv.dueDate ? new Date(inv.dueDate) : null;
        if (!due || !Number.isFinite(due.getTime())) {
            aging.current.count++;
            aging.current.balance += bal;
            continue;
        }
        const overdueDays = Math.floor((todayStart.getTime() - new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()) / (24 * 60 * 60 * 1000));
        if (overdueDays <= 0) {
            aging.current.count++;
            aging.current.balance += bal;
        }
        else if (overdueDays <= 30) {
            receivablesOverdue += bal;
            aging['1_30'].count++;
            aging['1_30'].balance += bal;
        }
        else if (overdueDays <= 60) {
            receivablesOverdue += bal;
            aging['31_60'].count++;
            aging['31_60'].balance += bal;
        }
        else if (overdueDays <= 90) {
            receivablesOverdue += bal;
            aging['61_90'].count++;
            aging['61_90'].balance += bal;
        }
        else {
            receivablesOverdue += bal;
            aging['90_plus'].count++;
            aging['90_plus'].balance += bal;
        }
    }
    // DSO (best-effort): (current AR / average daily invoiced revenue in range) * days
    const dsoDays = invoicedRevenue > 0 ? receivablesOutstanding / (invoicedRevenue / rangeDays) : null;
    // === Renewals ===
    const renewalsActive = (await db
        .collection('renewals')
        .find({ status: { $in: ['Active', 'Pending Renewal'] } }, { projection: { status: 1, renewalDate: 1, mrr: 1, arr: 1, churnRisk: 1 } })
        .limit(5000)
        .toArray());
    let totalActiveMRR = 0;
    let totalActiveARR = 0;
    let mrrNext30 = 0;
    let mrrNext90 = 0;
    let highChurnRisk = 0;
    const next30 = new Date(now);
    next30.setDate(next30.getDate() + 30);
    const next90 = new Date(now);
    next90.setDate(next90.getDate() + 90);
    for (const r of renewalsActive) {
        const mrr = r.mrr != null ? safeNumber(r.mrr) : r.arr != null ? safeNumber(r.arr) / 12 : 0;
        const arr = r.arr != null ? safeNumber(r.arr) : r.mrr != null ? safeNumber(r.mrr) * 12 : 0;
        totalActiveMRR += mrr;
        totalActiveARR += arr;
        if (String(r.churnRisk || '') === 'High')
            highChurnRisk++;
        if (r.renewalDate) {
            const d = new Date(r.renewalDate);
            if (Number.isFinite(d.getTime())) {
                if (d >= now && d <= next30)
                    mrrNext30 += mrr;
                if (d >= now && d <= next90)
                    mrrNext90 += mrr;
            }
        }
    }
    const renewalsDueInRange = renewalsActive.filter((r) => {
        if (!r.renewalDate)
            return false;
        const d = new Date(r.renewalDate);
        return Number.isFinite(d.getTime()) && d >= start && d < endExclusive;
    });
    const renewalsDueCount = renewalsDueInRange.length;
    const renewalsDueMRR = renewalsDueInRange.reduce((s, r) => {
        const mrr = r.mrr != null ? safeNumber(r.mrr) : r.arr != null ? safeNumber(r.arr) / 12 : 0;
        return s + mrr;
    }, 0);
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
    };
}
// GET /api/crm/reporting/overview?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// A lightweight "competitive edge" reporting endpoint (cross-module KPIs).
reportingRouter.get('/overview', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const { start, end, endExclusive } = getRange(typeof req.query.startDate === 'string' ? req.query.startDate : undefined, typeof req.query.endDate === 'string' ? req.query.endDate : undefined);
    const overview = await computeOverview(db, start, endExclusive);
    res.json({ data: overview, error: null });
});
// POST /api/crm/reporting/snapshots { startDate?, endDate? }
reportingRouter.post('/snapshots', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const raw = req.body ?? {};
    const { start, endExclusive } = getRange(typeof raw.startDate === 'string' ? raw.startDate : undefined, typeof raw.endDate === 'string' ? raw.endDate : undefined);
    const overview = await computeOverview(db, start, endExclusive);
    const auth = req.auth;
    const doc = {
        _id: new ObjectId(),
        createdAt: new Date(),
        createdByUserId: auth?.userId,
        range: { startDate: overview.range.startDate, endDate: overview.range.endDate },
        kpis: overview.kpis,
    };
    await db.collection('reporting_snapshots').insertOne(doc);
    res.json({
        data: {
            id: doc._id.toHexString(),
            createdAt: doc.createdAt,
            range: doc.range,
            kpis: doc.kpis,
        },
        error: null,
    });
});
// GET /api/crm/reporting/snapshots?limit=20
reportingRouter.get('/snapshots', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
    const items = (await db
        .collection('reporting_snapshots')
        .find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray());
    res.json({
        data: {
            items: items.map((s) => ({
                id: s._id.toHexString(),
                createdAt: s.createdAt,
                createdByUserId: s.createdByUserId ?? null,
                range: s.range,
                kpis: s.kpis,
            })),
        },
        error: null,
    });
});
