import { Router } from 'express';
import { getDb } from '../db.js';
import { ObjectId } from 'mongodb';
export const outreachTemplatesRouter = Router();
// GET /api/crm/outreach/templates?q=&sort=&dir=
outreachTemplatesRouter.get('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const q = String(req.query.q ?? '').trim();
    const sortKeyRaw = req.query.sort ?? 'updatedAt';
    const dirParam = (req.query.dir ?? 'desc').toLowerCase();
    const dir = dirParam === 'asc' ? 1 : -1;
    const allowed = new Set(['updatedAt', 'createdAt', 'name', 'channel']);
    const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'updatedAt';
    const sort = { [sortField]: dir };
    const filter = q
        ? { $or: [
                { name: { $regex: q, $options: 'i' } },
                { channel: { $regex: q, $options: 'i' } },
                { subject: { $regex: q, $options: 'i' } },
            ] }
        : {};
    const items = await db.collection('outreach_templates').find(filter).sort(sort).limit(200).toArray();
    res.json({ data: { items }, error: null });
});
// POST /api/crm/outreach/templates
outreachTemplatesRouter.post('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const raw = req.body ?? {};
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const channel = raw.channel === 'sms' ? 'sms' : 'email';
    const body = typeof raw.body === 'string' ? raw.body : '';
    const subject = channel === 'email' ? (typeof raw.subject === 'string' ? raw.subject : '') : '';
    if (!name || !body)
        return res.status(400).json({ data: null, error: 'invalid_payload' });
    const now = new Date();
    const doc = { name, channel, subject, body, variant: raw.variant || null, createdAt: now, updatedAt: now };
    const result = await db.collection('outreach_templates').insertOne(doc);
    res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null });
});
// PUT /api/crm/outreach/templates/:id
outreachTemplatesRouter.put('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const raw = req.body ?? {};
        const update = { updatedAt: new Date() };
        if (typeof raw.name === 'string')
            update.name = raw.name.trim();
        if (raw.channel === 'sms' || raw.channel === 'email')
            update.channel = raw.channel;
        if (typeof raw.body === 'string')
            update.body = raw.body;
        if (typeof raw.subject === 'string')
            update.subject = raw.subject;
        if (typeof raw.variant === 'string' || raw.variant === null)
            update.variant = raw.variant;
        await db.collection('outreach_templates').updateOne({ _id }, { $set: update });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// DELETE /api/crm/outreach/templates/:id
outreachTemplatesRouter.delete('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        await db.collection('outreach_templates').deleteOne({ _id });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
