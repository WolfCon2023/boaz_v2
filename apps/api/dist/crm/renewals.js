import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/rbac.js';
export const renewalsRouter = Router();
// Require auth for all renewals routes so we can safely use req.auth
renewalsRouter.use(requireAuth);
const renewalBaseSchema = z.object({
    accountId: z.string().optional(),
    accountNumber: z.number().optional(),
    accountName: z.string().optional(),
    productId: z.string().optional(),
    productName: z.string().optional(),
    productSku: z.string().optional(),
    // Optional linkage back to CRM objects
    sourceDealId: z.string().optional(),
    sourceInvoiceId: z.string().optional(),
    sourceType: z.enum(['deal', 'invoice']).optional(),
    name: z.string().min(1),
    status: z
        .enum(['Active', 'Pending Renewal', 'Churned', 'Cancelled', 'On Hold'])
        .default('Active'),
    termStart: z.string().optional(),
    termEnd: z.string().optional(),
    renewalDate: z.string().optional(),
    mrr: z.number().nonnegative().optional(),
    arr: z.number().nonnegative().optional(),
    healthScore: z.number().min(0).max(10).optional(),
    churnRisk: z.enum(['Low', 'Medium', 'High']).optional(),
    upsellPotential: z.enum(['Low', 'Medium', 'High']).optional(),
    ownerId: z.string().optional(),
    ownerName: z.string().optional(),
    ownerEmail: z.string().email().optional(),
    notes: z.string().optional(),
});
const createSchema = renewalBaseSchema;
const updateSchema = renewalBaseSchema.partial();
function toDate(value) {
    if (!value)
        return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}
// GET /api/crm/renewals?q=&status=&sort=&dir=
renewalsRouter.get('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const accountIdParam = String(req.query.accountId ?? '').trim();
    const sourceDealIdParam = String(req.query.sourceDealId ?? '').trim();
    const sourceInvoiceIdParam = String(req.query.sourceInvoiceId ?? '').trim();
    const sortKeyRaw = req.query.sort ?? 'renewalDate';
    const dirParam = (req.query.dir ?? 'asc').toLowerCase();
    const dir = dirParam === 'desc' ? -1 : 1;
    const allowedSort = new Set(['renewalDate', 'updatedAt', 'accountName', 'mrr', 'arr', 'healthScore']);
    const sortField = allowedSort.has(sortKeyRaw) ? sortKeyRaw : 'renewalDate';
    const sort = { [sortField]: dir };
    const filter = {};
    if (q) {
        filter.$or = [
            { name: { $regex: q, $options: 'i' } },
            { accountName: { $regex: q, $options: 'i' } },
        ];
    }
    if (status) {
        filter.status = status;
    }
    if (accountIdParam) {
        try {
            filter.accountId = new ObjectId(accountIdParam);
        }
        catch {
            // ignore bad accountId
        }
    }
    if (sourceDealIdParam && ObjectId.isValid(sourceDealIdParam)) {
        filter.sourceDealId = new ObjectId(sourceDealIdParam);
    }
    if (sourceInvoiceIdParam && ObjectId.isValid(sourceInvoiceIdParam)) {
        filter.sourceInvoiceId = new ObjectId(sourceInvoiceIdParam);
    }
    const items = await db
        .collection('renewals')
        .find(filter)
        .sort(sort)
        .limit(500)
        .toArray();
    res.json({
        data: {
            items: items.map((r) => ({
                ...r,
                _id: String(r._id),
                accountId: r.accountId ? String(r.accountId) : null,
                productId: r.productId ? String(r.productId) : null,
                sourceDealId: r.sourceDealId ? String(r.sourceDealId) : null,
                sourceInvoiceId: r.sourceInvoiceId ? String(r.sourceInvoiceId) : null,
                termStart: r.termStart ?? null,
                termEnd: r.termEnd ?? null,
                renewalDate: r.renewalDate ?? null,
            })),
        },
        error: null,
    });
});
// GET /api/crm/renewals/metrics/summary
renewalsRouter.get('/metrics/summary', async (_req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const now = new Date();
    const inDays = (days) => {
        const d = new Date(now);
        d.setDate(d.getDate() + days);
        return d;
    };
    const baseFilter = {
        status: { $in: ['Active', 'Pending Renewal'] },
    };
    const all = await db
        .collection('renewals')
        .find(baseFilter)
        .toArray();
    let totalActiveMRR = 0;
    let totalActiveARR = 0;
    let mrrNext30 = 0;
    let mrrNext90 = 0;
    const countsByStatus = {};
    const countsByRisk = {};
    const next30 = inDays(30);
    const next90 = inDays(90);
    for (const r of all) {
        const mrr = r.mrr ?? (r.arr != null ? r.arr / 12 : 0);
        const arr = r.arr ?? (r.mrr != null ? r.mrr * 12 : 0);
        totalActiveMRR += mrr || 0;
        totalActiveARR += arr || 0;
        if (r.renewalDate instanceof Date) {
            const d = r.renewalDate;
            if (d >= now && d <= next30) {
                mrrNext30 += mrr || 0;
            }
            if (d >= now && d <= next90) {
                mrrNext90 += mrr || 0;
            }
        }
        countsByStatus[r.status] = (countsByStatus[r.status] ?? 0) + 1;
        if (r.churnRisk) {
            countsByRisk[r.churnRisk] = (countsByRisk[r.churnRisk] ?? 0) + 1;
        }
    }
    res.json({
        data: {
            totalActiveMRR,
            totalActiveARR,
            mrrNext30,
            mrrNext90,
            countsByStatus,
            countsByRisk,
        },
        error: null,
    });
});
// GET /api/crm/renewals/metrics/account?accountId=...
renewalsRouter.get('/metrics/account', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const accountIdStr = String(req.query.accountId ?? '').trim();
    if (!accountIdStr || !ObjectId.isValid(accountIdStr)) {
        return res.status(400).json({ data: null, error: 'invalid_accountId' });
    }
    const accountId = new ObjectId(accountIdStr);
    const now = new Date();
    const docs = await db
        .collection('renewals')
        .find({ accountId })
        .toArray();
    let totalMRR = 0;
    let totalARR = 0;
    let activeCount = 0;
    let churnedCount = 0;
    let pendingCount = 0;
    let sumHealth = 0;
    let healthCount = 0;
    let mrrAtRisk = 0;
    let mrrChurned = 0;
    let nextRenewalDate = null;
    const countsByRisk = {};
    for (const r of docs) {
        const mrr = r.mrr ?? (r.arr != null ? r.arr / 12 : 0);
        const arr = r.arr ?? (r.mrr != null ? r.mrr * 12 : 0);
        totalMRR += mrr || 0;
        totalARR += arr || 0;
        if (r.status === 'Active')
            activeCount += 1;
        if (r.status === 'Churned')
            churnedCount += 1;
        if (r.status === 'Pending Renewal')
            pendingCount += 1;
        if (typeof r.healthScore === 'number') {
            sumHealth += r.healthScore;
            healthCount += 1;
        }
        if (r.churnRisk) {
            countsByRisk[r.churnRisk] = (countsByRisk[r.churnRisk] ?? 0) + 1;
            if (r.churnRisk === 'High') {
                mrrAtRisk += mrr || 0;
            }
        }
        if (r.status === 'Churned') {
            mrrChurned += mrr || 0;
        }
        if (r.renewalDate instanceof Date && r.renewalDate > now) {
            if (!nextRenewalDate || r.renewalDate < nextRenewalDate) {
                nextRenewalDate = r.renewalDate;
            }
        }
    }
    const avgHealthScore = healthCount > 0 ? sumHealth / healthCount : null;
    res.json({
        data: {
            totalMRR,
            totalARR,
            activeCount,
            churnedCount,
            pendingCount,
            avgHealthScore,
            countsByRisk,
            mrrAtRisk,
            mrrChurned,
            nextRenewalDate,
            renewalCount: docs.length,
        },
        error: null,
    });
});
// GET /api/crm/renewals/alerts/upcoming-high-value?days=&minMrr=
renewalsRouter.get('/alerts/upcoming-high-value', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const days = Number(req.query.days ?? 60);
    const minMrr = Number(req.query.minMrr ?? 1000);
    const now = new Date();
    const until = new Date(now);
    until.setDate(until.getDate() + (Number.isFinite(days) && days > 0 ? days : 60));
    const baseFilter = {
        status: { $in: ['Active', 'Pending Renewal'] },
        renewalDate: { $gte: now, $lte: until },
    };
    const docs = await db
        .collection('renewals')
        .find(baseFilter)
        .sort({ renewalDate: 1 })
        .limit(50)
        .toArray();
    const alerts = docs
        .map((r) => {
        const mrr = r.mrr ?? (r.arr != null ? r.arr / 12 : 0);
        return {
            _id: String(r._id),
            accountId: r.accountId ? String(r.accountId) : null,
            accountName: r.accountName ?? null,
            name: r.name,
            renewalDate: r.renewalDate ?? null,
            mrr,
            arr: r.arr ?? null,
            churnRisk: r.churnRisk ?? null,
            status: r.status,
        };
    })
        .filter((a) => (Number.isFinite(a.mrr) ? a.mrr >= minMrr : false));
    res.json({ data: { items: alerts }, error: null });
});
// POST /api/crm/renewals
renewalsRouter.post('/', async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: 'invalid_payload' });
    }
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const data = parsed.data;
    const now = new Date();
    const mrr = data.mrr ?? (data.arr != null ? data.arr / 12 : null);
    const arr = data.arr ?? (data.mrr != null ? data.mrr * 12 : null);
    // Optionally hydrate product metadata if a productId is provided
    let productId = null;
    let productName = data.productName ?? null;
    let productSku = data.productSku ?? null;
    if (data.productId) {
        try {
            productId = new ObjectId(data.productId);
            const prod = await db.collection('products').findOne({ _id: productId });
            if (prod) {
                if (!productName)
                    productName = prod.name ?? null;
                if (!productSku)
                    productSku = prod.sku ?? null;
            }
        }
        catch {
            productId = null;
        }
    }
    const doc = {
        _id: new ObjectId(),
        accountId: data.accountId ? new ObjectId(data.accountId) : null,
        accountNumber: data.accountNumber ?? null,
        accountName: data.accountName ?? null,
        productId,
        productName,
        productSku,
        name: data.name,
        status: data.status,
        termStart: toDate(data.termStart),
        termEnd: toDate(data.termEnd),
        renewalDate: toDate(data.renewalDate),
        mrr,
        arr,
        healthScore: data.healthScore ?? null,
        churnRisk: data.churnRisk ?? null,
        upsellPotential: data.upsellPotential ?? null,
        ownerId: data.ownerId ?? auth?.userId ?? null,
        ownerName: data.ownerName ?? auth?.name ?? null,
        ownerEmail: data.ownerEmail ?? auth?.email ?? null,
        notes: data.notes ?? null,
        createdAt: now,
        updatedAt: now,
    };
    await db.collection('renewals').insertOne(doc);
    res.status(201).json({
        data: {
            ...doc,
            _id: String(doc._id),
            accountId: doc.accountId ? String(doc.accountId) : null,
        },
        error: null,
    });
});
// PUT /api/crm/renewals/:id
renewalsRouter.put('/:id', async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: 'invalid_payload' });
    }
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    let _id;
    try {
        _id = new ObjectId(req.params.id);
    }
    catch {
        return res.status(400).json({ data: null, error: 'invalid_id' });
    }
    const data = parsed.data;
    const update = { ...data, updatedAt: new Date() };
    if (data.accountId !== undefined) {
        update.accountId = data.accountId ? new ObjectId(data.accountId) : null;
    }
    if (data.termStart !== undefined)
        update.termStart = toDate(data.termStart);
    if (data.termEnd !== undefined)
        update.termEnd = toDate(data.termEnd);
    if (data.renewalDate !== undefined)
        update.renewalDate = toDate(data.renewalDate);
    if (data.productId !== undefined) {
        if (data.productId) {
            try {
                const pid = new ObjectId(data.productId);
                update.productId = pid;
                const prod = await db.collection('products').findOne({ _id: pid });
                if (prod) {
                    if (data.productName === undefined)
                        update.productName = prod.name ?? null;
                    if (data.productSku === undefined)
                        update.productSku = prod.sku ?? null;
                }
            }
            catch {
                update.productId = null;
            }
        }
        else {
            update.productId = null;
        }
    }
    // Recompute MRR/ARR if one of them changed
    if (data.mrr != null && (data.arr == null || Number.isNaN(data.arr))) {
        update.mrr = data.mrr;
        update.arr = data.mrr * 12;
    }
    else if (data.arr != null && (data.mrr == null || Number.isNaN(data.mrr))) {
        update.arr = data.arr;
        update.mrr = data.arr / 12;
    }
    await db.collection('renewals').updateOne({ _id }, { $set: update });
    const updated = await db.collection('renewals').findOne({ _id });
    if (!updated)
        return res.status(404).json({ data: null, error: 'not_found' });
    res.json({
        data: {
            ...updated,
            _id: String(updated._id),
            accountId: updated.accountId ? String(updated.accountId) : null,
        },
        error: null,
    });
});
