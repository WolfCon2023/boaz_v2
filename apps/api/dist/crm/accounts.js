import { Router } from 'express';
import { getDb } from '../db.js';
import { z } from 'zod';
export const accountsRouter = Router();
accountsRouter.get('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 50)));
    const q = String(req.query.q ?? '').trim();
    const sortKey = req.query.sort ?? 'name';
    const dir = (req.query.dir ?? 'asc').toLowerCase() === 'desc' ? -1 : 1;
    const allowedSort = {
        name: dir,
        companyName: dir,
        accountNumber: dir,
    };
    const sort = allowedSort[sortKey] ? { [sortKey]: allowedSort[sortKey] } : { name: 1 };
    const filter = q
        ? { $or: [{ name: { $regex: q, $options: 'i' } }, { companyName: { $regex: q, $options: 'i' } }] }
        : {};
    const items = await db.collection('accounts').find(filter).sort(sort).limit(limit).toArray();
    res.json({ data: { items }, error: null });
});
// DELETE /api/crm/accounts/:id
accountsRouter.delete('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { ObjectId } = await import('mongodb');
        const _id = new ObjectId(req.params.id);
        await db.collection('accounts').deleteOne({ _id });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
accountsRouter.post('/', async (req, res) => {
    const opt = (schema) => z.preprocess((v) => {
        if (typeof v === 'string') {
            const t = v.trim();
            return t === '' ? undefined : t;
        }
        return v;
    }, schema.optional());
    const schema = z.object({
        name: z.string().trim().min(1),
        companyName: opt(z.string()),
        primaryContactName: opt(z.string()),
        primaryContactEmail: opt(z.string().email()),
        primaryContactPhone: opt(z.string()),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    // Generate accountNumber starting at 998801
    let accountNumber;
    try {
        const { getNextSequence } = await import('../db.js');
        accountNumber = await getNextSequence('accountNumber');
    }
    catch { }
    // Fallback if counter not initialized
    if (accountNumber === undefined) {
        try {
            const last = await db
                .collection('accounts')
                .find({ accountNumber: { $type: 'number' } })
                .project({ accountNumber: 1 })
                .sort({ accountNumber: -1 })
                .limit(1)
                .toArray();
            accountNumber = Number(last[0]?.accountNumber ?? 998800) + 1;
        }
        catch {
            accountNumber = 998801;
        }
    }
    const doc = { ...parsed.data, accountNumber };
    const result = await db.collection('accounts').insertOne(doc);
    res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null });
});
// PUT /api/crm/accounts/:id
accountsRouter.put('/:id', async (req, res) => {
    const schema = z.object({
        name: z.string().min(1).optional(),
        companyName: z.string().optional(),
        primaryContactName: z.string().optional(),
        primaryContactEmail: z.string().email().optional(),
        primaryContactPhone: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload' });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { ObjectId } = await import('mongodb');
        const _id = new ObjectId(req.params.id);
        await db.collection('accounts').updateOne({ _id }, { $set: parsed.data });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// GET /api/crm/accounts/:id/history
accountsRouter.get('/:id/history', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { ObjectId } = await import('mongodb');
        const _id = new ObjectId(req.params.id);
        const account = await db.collection('accounts').findOne({ _id });
        if (!account)
            return res.status(404).json({ data: null, error: 'not_found' });
        const createdAt = _id.getTimestamp();
        const deals = await db.collection('deals').find({ accountId: _id }).project({ title: 1, amount: 1, stage: 1, dealNumber: 1, closeDate: 1 }).sort({ _id: -1 }).limit(200).toArray();
        const quotes = await db.collection('quotes').find({ accountId: _id }).project({ title: 1, status: 1, quoteNumber: 1, total: 1, updatedAt: 1, createdAt: 1 }).sort({ updatedAt: -1 }).limit(200).toArray();
        const invoices = await db.collection('invoices').find({ accountId: _id }).project({ title: 1, invoiceNumber: 1, total: 1, status: 1, issuedAt: 1, dueDate: 1, updatedAt: 1 }).sort({ updatedAt: -1 }).limit(200).toArray();
        const activities = await db.collection('activities').find({ accountId: _id }).project({ type: 1, subject: 1, at: 1 }).sort({ at: -1 }).limit(200).toArray();
        res.json({ data: { createdAt, deals, quotes, invoices, activities }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
