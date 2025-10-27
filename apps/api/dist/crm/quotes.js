import { Router } from 'express';
import { getDb } from '../db.js';
import { ObjectId } from 'mongodb';
export const quotesRouter = Router();
// List with search/sort
quotesRouter.get('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const q = String(req.query.q ?? '').trim();
    const sortKeyRaw = req.query.sort ?? 'createdAt';
    const dirParam = (req.query.dir ?? 'desc').toLowerCase();
    const dir = dirParam === 'asc' ? 1 : -1;
    const allowedKeys = new Set(['createdAt', 'updatedAt', 'quoteNumber', 'status', 'total', 'title']);
    const sortField = allowedKeys.has(sortKeyRaw) ? sortKeyRaw : 'createdAt';
    const sort = { [sortField]: dir };
    const filter = q
        ? { $or: [
                { title: { $regex: q, $options: 'i' } },
                { status: { $regex: q, $options: 'i' } },
                { signerEmail: { $regex: q, $options: 'i' } },
                { signerName: { $regex: q, $options: 'i' } },
            ] }
        : {};
    const items = await db.collection('quotes').find(filter).sort(sort).limit(200).toArray();
    res.json({ data: { items }, error: null });
});
// Create
quotesRouter.post('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const raw = req.body ?? {};
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title)
        return res.status(400).json({ data: null, error: 'invalid_payload' });
    let accountId = null;
    if (typeof raw.accountId === 'string' && ObjectId.isValid(raw.accountId))
        accountId = new ObjectId(raw.accountId);
    else if (typeof raw.accountNumber === 'number') {
        const acc = await db.collection('accounts').findOne({ accountNumber: raw.accountNumber });
        if (!acc?._id)
            return res.status(400).json({ data: null, error: 'account_not_found' });
        accountId = acc._id;
    }
    else
        return res.status(400).json({ data: null, error: 'missing_account' });
    const now = new Date();
    const doc = {
        title,
        accountId,
        dealId: (typeof raw.dealId === 'string' && ObjectId.isValid(raw.dealId)) ? new ObjectId(raw.dealId) : undefined,
        items: Array.isArray(raw.items) ? raw.items : [],
        subtotal: Number(raw.subtotal) || 0,
        tax: Number(raw.tax) || 0,
        total: Number(raw.total) || 0,
        status: raw.status || 'Draft',
        approver: raw.approver || null,
        approvedAt: raw.approvedAt ? new Date(raw.approvedAt) : null,
        signerName: raw.signerName || null,
        signerEmail: raw.signerEmail || null,
        esignStatus: raw.esignStatus || 'Not Sent',
        signedAt: raw.signedAt ? new Date(raw.signedAt) : null,
        version: 1,
        createdAt: now,
        updatedAt: now,
    };
    // Quote number
    try {
        const { getNextSequence } = await import('../db.js');
        doc.quoteNumber = await getNextSequence('quoteNumber');
    }
    catch { }
    if (doc.quoteNumber == null) {
        try {
            const last = await db.collection('quotes').find({ quoteNumber: { $type: 'number' } }).project({ quoteNumber: 1 }).sort({ quoteNumber: -1 }).limit(1).toArray();
            doc.quoteNumber = Number(last[0]?.quoteNumber ?? 500000) + 1;
        }
        catch {
            doc.quoteNumber = 500001;
        }
    }
    const result = await db.collection('quotes').insertOne(doc);
    res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null });
});
// Update (basic fields + version bump on items/total changes)
quotesRouter.put('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const raw = req.body ?? {};
        const update = { updatedAt: new Date() };
        if (typeof raw.title === 'string')
            update.title = raw.title.trim();
        if (typeof raw.status === 'string')
            update.status = raw.status;
        if (typeof raw.approver === 'string')
            update.approver = raw.approver;
        if (raw.approvedAt)
            update.approvedAt = new Date(raw.approvedAt);
        if (typeof raw.signerName === 'string')
            update.signerName = raw.signerName;
        if (typeof raw.signerEmail === 'string')
            update.signerEmail = raw.signerEmail;
        if (typeof raw.esignStatus === 'string') {
            update.esignStatus = raw.esignStatus;
            // simple auto-transitions for signedAt
            if (raw.esignStatus === 'Signed' && !raw.signedAt) {
                update.signedAt = new Date();
            }
            if (raw.esignStatus !== 'Signed' && raw.signedAt === null) {
                update.signedAt = null;
            }
        }
        if (raw.signedAt)
            update.signedAt = new Date(raw.signedAt);
        if (Array.isArray(raw.items)) {
            update.items = raw.items;
            update.subtotal = Number(raw.subtotal) || 0;
            update.tax = Number(raw.tax) || 0;
            update.total = Number(raw.total) || 0;
            // bump version
            const q = await db.collection('quotes').findOne({ _id }, { projection: { version: 1 } });
            update.version = q?.version ? q.version + 1 : 2;
        }
        if (raw.accountId && ObjectId.isValid(raw.accountId))
            update.accountId = new ObjectId(raw.accountId);
        await db.collection('quotes').updateOne({ _id }, { $set: update });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// GET /api/crm/quotes/:id/history
quotesRouter.get('/:id/history', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const q = await db.collection('quotes').findOne({ _id });
        if (!q)
            return res.status(404).json({ data: null, error: 'not_found' });
        const createdAt = q.createdAt || _id.getTimestamp();
        // Any events by account (if denormalized) could be added here
        res.json({ data: { createdAt, quote: { title: q.title, status: q.status, total: q.total, quoteNumber: q.quoteNumber, updatedAt: q.updatedAt } }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// DELETE /api/crm/quotes/:id
quotesRouter.delete('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        await db.collection('quotes').deleteOne({ _id });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
