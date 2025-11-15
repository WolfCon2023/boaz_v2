import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
export const marketingCampaignsRouter = Router();
// GET /api/marketing/campaigns?q=&sort=&dir=
marketingCampaignsRouter.get('/campaigns', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const q = String(req.query.q ?? '').trim();
    const dir = (req.query.dir ?? 'desc').toLowerCase() === 'asc' ? 1 : -1;
    const sortKey = req.query.sort ?? 'updatedAt';
    const sort = { [sortKey]: dir };
    const filter = {};
    if (q)
        filter.$or = [{ name: { $regex: q, $options: 'i' } }, { subject: { $regex: q, $options: 'i' } }];
    const items = await db.collection('marketing_campaigns').find(filter).sort(sort).limit(200).toArray();
    res.json({ data: { items }, error: null });
});
// POST /api/marketing/campaigns
marketingCampaignsRouter.post('/campaigns', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const raw = req.body ?? {};
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const subject = typeof raw.subject === 'string' ? raw.subject : '';
    const html = typeof raw.html === 'string' ? raw.html : '';
    const mjml = typeof raw.mjml === 'string' ? raw.mjml : '';
    const previewText = typeof raw.previewText === 'string' ? raw.previewText : '';
    const segmentId = ObjectId.isValid(raw.segmentId) ? new ObjectId(raw.segmentId) : null;
    const surveyProgramId = ObjectId.isValid(raw.surveyProgramId) ? new ObjectId(raw.surveyProgramId) : null;
    if (!name)
        return res.status(400).json({ data: null, error: 'invalid_payload' });
    const doc = {
        name,
        subject,
        html,
        mjml,
        previewText,
        segmentId,
        surveyProgramId,
        status: String(raw.status || 'draft'),
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const r = await db.collection('marketing_campaigns').insertOne(doc);
    res.status(201).json({ data: { _id: r.insertedId, ...doc }, error: null });
});
// PUT /api/marketing/campaigns/:id
marketingCampaignsRouter.put('/campaigns/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const update = { updatedAt: new Date() };
        for (const k of ['name', 'subject', 'html', 'status', 'mjml', 'previewText'])
            if (typeof (req.body ?? {})[k] === 'string')
                update[k] = req.body[k];
        if (req.body?.segmentId && ObjectId.isValid(req.body.segmentId))
            update.segmentId = new ObjectId(req.body.segmentId);
        if ('surveyProgramId' in (req.body ?? {})) {
            if (req.body.surveyProgramId && ObjectId.isValid(req.body.surveyProgramId)) {
                update.surveyProgramId = new ObjectId(req.body.surveyProgramId);
            }
            else {
                update.surveyProgramId = null;
            }
        }
        await db.collection('marketing_campaigns').updateOne({ _id }, { $set: update });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// DELETE /api/marketing/campaigns/:id
marketingCampaignsRouter.delete('/campaigns/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        await db.collection('marketing_campaigns').deleteOne({ _id });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
