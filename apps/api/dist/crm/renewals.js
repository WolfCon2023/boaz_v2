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
