import { Router } from 'express';
import { getDb } from '../db.js';
import { ObjectId } from 'mongodb';
export const outreachSequencesRouter = Router();
// GET /api/crm/outreach/sequences
outreachSequencesRouter.get('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const q = String(req.query.q ?? '').trim();
    const sortKeyRaw = req.query.sort ?? 'updatedAt';
    const dirParam = (req.query.dir ?? 'desc').toLowerCase();
    const dir = dirParam === 'asc' ? 1 : -1;
    const sort = { [sortKeyRaw === 'name' ? 'name' : 'updatedAt']: dir };
    const filter = q ? { name: { $regex: q, $options: 'i' } } : {};
    const items = await db.collection('outreach_sequences').find(filter).sort(sort).limit(200).toArray();
    res.json({ data: { items }, error: null });
});
// POST /api/crm/outreach/sequences
outreachSequencesRouter.post('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const raw = req.body ?? {};
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const steps = Array.isArray(raw.steps) ? raw.steps : [];
    if (!name)
        return res.status(400).json({ data: null, error: 'invalid_payload' });
    const now = new Date();
    const doc = { name, steps, abGroup: raw.abGroup ?? null, createdAt: now, updatedAt: now };
    const result = await db.collection('outreach_sequences').insertOne(doc);
    res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null });
});
// PUT /api/crm/outreach/sequences/:id
outreachSequencesRouter.put('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const raw = req.body ?? {};
        const update = { updatedAt: new Date() };
        if (typeof raw.name === 'string')
            update.name = raw.name.trim();
        if (Array.isArray(raw.steps))
            update.steps = raw.steps;
        if (raw.abGroup === 'A' || raw.abGroup === 'B' || raw.abGroup === null)
            update.abGroup = raw.abGroup;
        await db.collection('outreach_sequences').updateOne({ _id }, { $set: update });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// DELETE /api/crm/outreach/sequences/:id
outreachSequencesRouter.delete('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        await db.collection('outreach_sequences').deleteOne({ _id });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
