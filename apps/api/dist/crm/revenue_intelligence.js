import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/rbac.js';
export const revenueIntelligenceRouter = Router();
revenueIntelligenceRouter.use(requireAuth);
function isClosedWonStage(stageRaw) {
    const s = String(stageRaw || '').trim();
    return s === 'Closed Won' || s === 'Contract Signed / Closed Won';
}
function isClosedLostStage(stageRaw) {
    return String(stageRaw || '').trim() === 'Closed Lost';
}
async function computeForecast(db, period, ownerId, opts) {
    const now = new Date();
    const { startDate, endDate, endExclusive } = getRangeFromRequest(period, now, opts?.startDateRaw, opts?.endDateRaw);
    const startIso = startDate.toISOString();
    const endIso = endExclusive.toISOString();
    // Fetch deals in the period (use forecastedCloseDate for forecasting, fallback to closeDate)
    const dealMatch = {
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
    };
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
            ];
        }
        else {
            dealMatch.ownerId = ownerId;
        }
    }
    const deals = (await db.collection('deals').find(dealMatch).toArray());
    // Fetch account ages for scoring
    const accountIds = [...new Set(deals.map((d) => d.accountId).filter(Boolean))];
    const accounts = accountIds.length > 0
        ? (await db
            .collection('accounts')
            .find({ _id: { $in: accountIds.map((id) => new ObjectId(id)) } })
            .toArray())
        : [];
    const accountAgeMap = new Map();
    accounts.forEach((acc) => {
        const age = acc.createdAt ? Math.ceil((Date.now() - new Date(acc.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
        accountAgeMap.set(String(acc._id), age);
    });
    // Score each deal
    const scoredDeals = deals.map((deal) => {
        const dealAge = deal.createdAt ? Math.ceil((Date.now() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : undefined;
        const activityRecency = deal.lastActivityAt ? Math.ceil((Date.now() - new Date(deal.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24)) : undefined;
        const accountAge = accountAgeMap.get(deal.accountId);
        const scoring = calculateDealScore(deal, accountAge, dealAge, activityRecency);
        return {
            ...deal,
            aiScore: scoring.score,
            aiConfidence: scoring.confidence,
            aiFactors: scoring.factors,
        };
    });
    const wonDeals = scoredDeals.filter((d) => isClosedWonStage(d.stage));
    let pipelineDeals = scoredDeals.filter((d) => !isClosedWonStage(d.stage) && !isClosedLostStage(d.stage));
    // Optionally exclude overdue deals from pipeline (open deals whose close date is before today)
    if (opts?.excludeOverdue) {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        pipelineDeals = pipelineDeals.filter((d) => {
            const raw = d.forecastedCloseDate || d.closeDate;
            if (!raw)
                return true;
            const dt = new Date(raw);
            const t = dt.getTime();
            if (!Number.isFinite(t))
                return true;
            return dt >= todayStart;
        });
    }
    // Pipeline + won metrics (avoid double counting)
    const totalPipeline = pipelineDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
    const weightedPipeline = pipelineDeals.reduce((sum, d) => sum + (d.amount || 0) * (d.aiScore / 100), 0);
    const closedWon = wonDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
    // Confidence intervals (pessimistic, likely, optimistic) based on PIPELINE deals only
    const highConfDeals = pipelineDeals.filter((d) => d.aiConfidence === 'High');
    const medConfDeals = pipelineDeals.filter((d) => d.aiConfidence === 'Medium');
    const lowConfDeals = pipelineDeals.filter((d) => d.aiConfidence === 'Low');
    const pessimistic = closedWon +
        highConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.7, 0) +
        medConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.3, 0) +
        lowConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.1, 0);
    const likely = closedWon +
        highConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.85, 0) +
        medConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.5, 0) +
        lowConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.2, 0);
    const optimistic = closedWon +
        highConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.95, 0) +
        medConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.7, 0) +
        lowConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.4, 0);
    // Stage breakdown (PIPELINE only)
    const byStage = pipelineDeals.reduce((acc, d) => {
        const stage = d.stage || 'Unknown';
        if (!acc[stage])
            acc[stage] = { count: 0, value: 0, weightedValue: 0 };
        acc[stage].count++;
        acc[stage].value += d.amount || 0;
        acc[stage].weightedValue += (d.amount || 0) * (d.aiScore / 100);
        return acc;
    }, {});
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
    };
}
// Calculate AI-powered deal score based on multiple factors
function calculateDealScore(deal, accountAge, dealAge, activityRecency) {
    const factors = [];
    // Start with a base score of 50 (no probability field in deals)
    let score = 50;
    // Factor 1: Stage progression (higher stages = higher confidence)
    const stage = deal.stage || 'new';
    const stageWeights = {
        'new': -10,
        'Lead': -10,
        'Qualified': 0,
        'Proposal': 10,
        'Negotiation': 15,
        'Contract Signed / Closed Won': 0,
        'Closed Won': 0,
        'Closed Lost': 0,
        'Submitted for Review': 5,
    };
    const stageImpact = stageWeights[stage] || 0;
    if (stageImpact !== 0) {
        score += stageImpact;
        factors.push({
            factor: 'Deal Stage',
            impact: stageImpact,
            description: `${stage} stage ${stageImpact > 0 ? 'increases' : 'decreases'} likelihood`,
        });
    }
    // Factor 2: Deal age (too old = lower confidence)
    if (dealAge !== undefined) {
        if (dealAge > 180) {
            score -= 15;
            factors.push({ factor: 'Deal Age', impact: -15, description: 'Deal is stale (>180 days old)' });
        }
        else if (dealAge > 90) {
            score -= 8;
            factors.push({ factor: 'Deal Age', impact: -8, description: 'Deal is aging (>90 days old)' });
        }
        else if (dealAge > 60) {
            score -= 3;
            factors.push({ factor: 'Deal Age', impact: -3, description: 'Deal is maturing (>60 days old)' });
        }
    }
    // Factor 3: Activity recency (recent activity = higher confidence)
    if (activityRecency !== undefined) {
        if (activityRecency <= 7) {
            score += 10;
            factors.push({ factor: 'Recent Activity', impact: 10, description: 'Active engagement within last week' });
        }
        else if (activityRecency <= 14) {
            score += 5;
            factors.push({ factor: 'Recent Activity', impact: 5, description: 'Recent engagement within 2 weeks' });
        }
        else if (activityRecency > 30) {
            score -= 12;
            factors.push({ factor: 'Activity Gap', impact: -12, description: 'No activity for over 30 days' });
        }
        else if (activityRecency > 21) {
            score -= 6;
            factors.push({ factor: 'Activity Gap', impact: -6, description: 'No activity for over 3 weeks' });
        }
    }
    // Factor 4: Account maturity (established accounts = higher confidence)
    if (accountAge !== undefined) {
        if (accountAge > 365) {
            score += 8;
            factors.push({ factor: 'Account Maturity', impact: 8, description: 'Established account (>1 year)' });
        }
        else if (accountAge < 30) {
            score -= 5;
            factors.push({ factor: 'New Account', impact: -5, description: 'Very new account (<30 days)' });
        }
    }
    // Factor 5: Days in current stage (stuck = lower confidence)
    if (deal.daysInStage !== undefined && deal.stage !== 'Closed Won' && deal.stage !== 'Closed Lost') {
        if (deal.daysInStage > 60) {
            score -= 10;
            factors.push({ factor: 'Stage Duration', impact: -10, description: 'Stuck in stage for >60 days' });
        }
        else if (deal.daysInStage > 30) {
            score -= 5;
            factors.push({ factor: 'Stage Duration', impact: -5, description: 'In stage for >30 days' });
        }
    }
    // Factor 6: Close date proximity (closing soon with high stage = boost)
    // Use forecastedCloseDate if available, otherwise fallback to closeDate
    const closeDate = deal.forecastedCloseDate || deal.closeDate;
    const daysToClose = closeDate ? Math.ceil((new Date(closeDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 999;
    if (daysToClose < 0) {
        score -= 20;
        factors.push({ factor: 'Overdue Close Date', impact: -20, description: 'Close date has passed' });
    }
    else if (daysToClose <= 7 && (deal.stage === 'Negotiation' || deal.stage === 'Proposal')) {
        score += 12;
        factors.push({ factor: 'Closing Soon', impact: 12, description: 'Close date within 7 days and in late stage' });
    }
    else if (daysToClose <= 14 && deal.stage === 'Negotiation') {
        score += 8;
        factors.push({ factor: 'Closing Soon', impact: 8, description: 'Close date within 2 weeks and in negotiation' });
    }
    // Clamp score between 0 and 100
    score = Math.max(0, Math.min(100, score));
    // Determine confidence level
    let confidence = 'Medium';
    if (score >= 70 && factors.length >= 3)
        confidence = 'High';
    else if (score < 40 || factors.filter((f) => f.impact < 0).length >= 3)
        confidence = 'Low';
    return { score: Math.round(score), confidence, factors };
}
function getForecastRange(period, now) {
    // Fiscal year begins Jan 1st (calendar year).
    // Use half-open intervals [start, endExclusive) to avoid missing deals on the last day due to time components.
    let startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    let endExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    if (period === 'current_quarter') {
        const q = Math.floor(now.getMonth() / 3); // 0..3
        startDate = new Date(now.getFullYear(), q * 3, 1);
        endExclusive = new Date(now.getFullYear(), q * 3 + 3, 1);
    }
    else if (period === 'next_month') {
        startDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        endExclusive = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    }
    else if (period === 'next_quarter') {
        const nextQ = Math.floor(now.getMonth() / 3) + 1; // may overflow into next year via JS Date month overflow
        startDate = new Date(now.getFullYear(), nextQ * 3, 1);
        endExclusive = new Date(now.getFullYear(), nextQ * 3 + 3, 1);
    }
    else if (period === 'current_year') {
        startDate = new Date(now.getFullYear(), 0, 1);
        endExclusive = new Date(now.getFullYear() + 1, 0, 1);
    }
    else if (period === 'next_year') {
        startDate = new Date(now.getFullYear() + 1, 0, 1);
        endExclusive = new Date(now.getFullYear() + 2, 0, 1);
    }
    const endDate = new Date(endExclusive.getTime() - 1); // inclusive end-of-period for display
    return { startDate, endDate, endExclusive };
}
function parseDateOnly(value) {
    if (typeof value !== 'string')
        return null;
    const s = value.trim();
    if (!s)
        return null;
    // UI sends YYYY-MM-DD (date only)
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
function getRangeFromRequest(period, now, startDateRaw, endDateRaw) {
    const startParsed = parseDateOnly(startDateRaw);
    const endParsed = parseDateOnly(endDateRaw);
    if (startParsed && endParsed) {
        const startDate = new Date(startParsed.getFullYear(), startParsed.getMonth(), startParsed.getDate());
        const endExclusive = new Date(endParsed.getFullYear(), endParsed.getMonth(), endParsed.getDate() + 1);
        const endDate = new Date(endExclusive.getTime() - 1);
        return { startDate, endDate, endExclusive, isCustom: true };
    }
    const { startDate, endDate, endExclusive } = getForecastRange(period, now);
    return { startDate, endDate, endExclusive, isCustom: false };
}
// GET /api/crm/revenue-intelligence/forecast
// Returns pipeline forecast with confidence intervals
revenueIntelligenceRouter.get('/forecast', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const period = req.query.period || 'current_quarter';
    const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId.trim() : '';
    const startDateRaw = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDateRaw = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
    const excludeOverdue = String(req.query.excludeOverdue || '').toLowerCase() === 'true';
    const data = await computeForecast(db, period, ownerId || undefined, { startDateRaw, endDateRaw, excludeOverdue });
    res.json({ data, error: null });
});
// GET /api/crm/revenue-intelligence/deal-score/:dealId
// Get detailed AI scoring for a specific deal
revenueIntelligenceRouter.get('/deal-score/:dealId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const { dealId } = req.params;
    if (!ObjectId.isValid(dealId)) {
        return res.status(400).json({ data: null, error: 'invalid_deal_id' });
    }
    const deal = await db.collection('deals').findOne({ _id: new ObjectId(dealId) });
    if (!deal) {
        return res.status(404).json({ data: null, error: 'deal_not_found' });
    }
    // Get account age
    let accountAge;
    if (deal.accountId && ObjectId.isValid(deal.accountId)) {
        const account = await db.collection('accounts').findOne({ _id: new ObjectId(deal.accountId) });
        if (account?.createdAt) {
            accountAge = Math.ceil((Date.now() - new Date(account.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        }
    }
    const dealAge = deal.createdAt ? Math.ceil((Date.now() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : undefined;
    const activityRecency = deal.lastActivityAt ? Math.ceil((Date.now() - new Date(deal.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24)) : undefined;
    const scoring = calculateDealScore(deal, accountAge, dealAge, activityRecency);
    res.json({
        data: {
            dealId: deal._id,
            dealName: deal.title || 'Untitled',
            stage: deal.stage || 'new',
            value: deal.amount || 0,
            ...scoring,
        },
        error: null,
    });
});
// GET /api/crm/revenue-intelligence/rep-performance
// Rep performance predictions and analytics
revenueIntelligenceRouter.get('/rep-performance', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const period = req.query.period || 'current_quarter';
    // Calculate date range
    const now = new Date();
    const { startDate, endDate, endExclusive } = getForecastRange(period, now);
    // Fetch all deals in period (use forecastedCloseDate for forecasting, fallback to closeDate)
    const startIso = startDate.toISOString();
    const endIso = endExclusive.toISOString();
    const deals = await db.collection('deals').find({
        $or: [
            { forecastedCloseDate: { $gte: startDate, $lt: endExclusive } },
            { forecastedCloseDate: { $gte: startIso, $lt: endIso } },
            { $and: [{ forecastedCloseDate: null }, { closeDate: { $gte: startDate, $lt: endExclusive } }] },
            { $and: [{ forecastedCloseDate: null }, { closeDate: { $gte: startIso, $lt: endIso } }] },
            { $and: [{ forecastedCloseDate: { $exists: false } }, { closeDate: { $gte: startDate, $lt: endExclusive } }] },
            { $and: [{ forecastedCloseDate: { $exists: false } }, { closeDate: { $gte: startIso, $lt: endIso } }] },
        ],
    }).toArray();
    // Group by owner
    const byOwner = deals.reduce((acc, deal) => {
        const owner = deal.ownerId || 'Unassigned';
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
            };
        }
        acc[owner].totalDeals++;
        acc[owner].totalValue += deal.amount || 0;
        acc[owner].deals.push(deal);
        if (deal.stage === 'Contract Signed / Closed Won' || deal.stage === 'Closed Won') {
            acc[owner].closedWon++;
            acc[owner].wonValue += deal.amount || 0;
        }
        else if (deal.stage === 'Closed Lost') {
            acc[owner].closedLost++;
            acc[owner].lostValue += deal.amount || 0;
        }
        else {
            acc[owner].openDeals++;
            acc[owner].pipelineValue += deal.amount || 0;
        }
        return acc;
    }, {});
    // Calculate metrics for each rep
    const repPerformance = Object.values(byOwner).map((rep) => {
        rep.avgDealSize = rep.totalDeals > 0 ? rep.totalValue / rep.totalDeals : 0;
        rep.winRate = (rep.closedWon + rep.closedLost) > 0 ? (rep.closedWon / (rep.closedWon + rep.closedLost)) * 100 : 0;
        // Forecast: apply win rate to open pipeline
        rep.forecastedRevenue = rep.wonValue + (rep.pipelineValue * (rep.winRate / 100));
        // Performance score (0-100)
        let perfScore = 50;
        if (rep.winRate >= 50)
            perfScore += 20;
        else if (rep.winRate >= 30)
            perfScore += 10;
        else if (rep.winRate < 20)
            perfScore -= 10;
        if (rep.avgDealSize > 50000)
            perfScore += 15;
        else if (rep.avgDealSize > 25000)
            perfScore += 10;
        else if (rep.avgDealSize < 10000)
            perfScore -= 5;
        if (rep.openDeals > 10)
            perfScore += 10;
        else if (rep.openDeals > 5)
            perfScore += 5;
        else if (rep.openDeals < 3)
            perfScore -= 10;
        rep.performanceScore = Math.max(0, Math.min(100, perfScore));
        delete rep.deals; // Don't send full deal array
        return rep;
    });
    // Sort by forecasted revenue desc
    repPerformance.sort((a, b) => b.forecastedRevenue - a.forecastedRevenue);
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
    });
});
// POST /api/crm/revenue-intelligence/scenario
// What-if scenario modeling
revenueIntelligenceRouter.post('/scenario', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const { period, adjustments } = req.body;
    if (!adjustments || !Array.isArray(adjustments)) {
        return res.status(400).json({ data: null, error: 'invalid_adjustments' });
    }
    // Compute baseline without calling localhost (more reliable in deployments)
    const baseline = await computeForecast(db, period, undefined, {
        startDateRaw: typeof req.body?.startDate === 'string' ? req.body.startDate : undefined,
        endDateRaw: typeof req.body?.endDate === 'string' ? req.body.endDate : undefined,
        excludeOverdue: !!req.body?.excludeOverdue,
    });
    // Apply adjustments to deals
    const adjustedDeals = baseline.deals.map((deal) => {
        const adjustment = adjustments.find((adj) => adj.dealId === String(deal._id));
        if (adjustment) {
            return {
                ...deal,
                stage: adjustment.newStage || deal.stage,
                amount: adjustment.newValue !== undefined ? adjustment.newValue : deal.amount,
                closeDate: adjustment.newCloseDate ? new Date(adjustment.newCloseDate) : deal.closeDate,
                _adjusted: true,
            };
        }
        return deal;
    });
    // Recalculate forecast with adjusted deals
    const wonDeals = adjustedDeals.filter((d) => isClosedWonStage(d.stage));
    const pipelineDeals = adjustedDeals.filter((d) => !isClosedWonStage(d.stage) && !isClosedLostStage(d.stage));
    const totalPipeline = pipelineDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
    const weightedPipeline = pipelineDeals.reduce((sum, d) => sum + (d.amount || 0) * (d.aiScore / 100), 0);
    const closedWon = wonDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
    const highConfDeals = pipelineDeals.filter((d) => d.aiConfidence === 'High');
    const medConfDeals = pipelineDeals.filter((d) => d.aiConfidence === 'Medium');
    const lowConfDeals = pipelineDeals.filter((d) => d.aiConfidence === 'Low');
    const pessimistic = closedWon +
        highConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.7, 0) +
        medConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.3, 0) +
        lowConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.1, 0);
    const likely = closedWon +
        highConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.85, 0) +
        medConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.5, 0) +
        lowConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.2, 0);
    const optimistic = closedWon +
        highConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.95, 0) +
        medConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.7, 0) +
        lowConfDeals.reduce((sum, d) => sum + (d.amount || 0) * 0.4, 0);
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
                adjustedDeals: adjustedDeals.filter((d) => d._adjusted),
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
    });
});
