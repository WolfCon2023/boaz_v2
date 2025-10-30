import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from './db.js';
export const viewsRouter = Router();
// GET /api/views?viewKey=deals
viewsRouter.get('/views', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const viewKey = String(req.query.viewKey ?? '').trim();
    const filter = {};
    if (viewKey)
        filter.viewKey = viewKey;
    const items = await db.collection('views').find(filter).sort({ createdAt: -1 }).toArray();
    res.json({ data: { items }, error: null });
});
// POST /api/views { viewKey, name, config }
viewsRouter.post('/views', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const { viewKey, name, config } = req.body ?? {};
    if (!viewKey || typeof viewKey !== 'string')
        return res.status(400).json({ data: null, error: 'invalid_viewKey' });
    if (!name || typeof name !== 'string')
        return res.status(400).json({ data: null, error: 'invalid_name' });
    const doc = { viewKey: viewKey.trim(), name: name.trim(), config: config ?? {}, createdAt: new Date(), updatedAt: new Date() };
    const r = await db.collection('views').insertOne(doc);
    res.json({ data: { _id: r.insertedId, ...doc }, error: null });
});
// PUT /api/views/:id { name?, config? }
viewsRouter.put('/views/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const id = String(req.params.id || '');
    if (!ObjectId.isValid(id))
        return res.status(400).json({ data: null, error: 'invalid_id' });
    const { name, config } = req.body ?? {};
    const update = { updatedAt: new Date() };
    if (typeof name === 'string')
        update.name = name;
    if (config !== undefined)
        update.config = config;
    await db.collection('views').updateOne({ _id: new ObjectId(id) }, { $set: update });
    const doc = await db.collection('views').findOne({ _id: new ObjectId(id) });
    res.json({ data: doc, error: null });
});
// DELETE /api/views/:id
viewsRouter.delete('/views/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const id = String(req.params.id || '');
    if (!ObjectId.isValid(id))
        return res.status(400).json({ data: null, error: 'invalid_id' });
    await db.collection('views').deleteOne({ _id: new ObjectId(id) });
    res.json({ data: { ok: true }, error: null });
});
