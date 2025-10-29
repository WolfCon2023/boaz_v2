import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
export const marketingTrackingRouter = Router();
// GET /api/marketing/metrics?campaignId=
marketingTrackingRouter.get('/metrics', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { byCampaign: [] }, error: null });
    const campaignId = String(req.query.campaignId ?? '');
    const match = {};
    if (ObjectId.isValid(campaignId))
        match.campaignId = new ObjectId(campaignId);
    const agg = await db.collection('marketing_events').aggregate([
        { $match: match },
        { $group: { _id: '$campaignId', clicks: { $sum: { $cond: [{ $eq: ['$event', 'click'] }, 1, 0] } }, opens: { $sum: { $cond: [{ $eq: ['$event', 'open'] }, 1, 0] } }, visits: { $sum: { $cond: [{ $eq: ['$event', 'visit'] }, 1, 0] } } } },
        { $project: { campaignId: '$_id', clicks: 1, opens: 1, visits: 1, _id: 0 } }
    ]).toArray();
    res.json({ data: { byCampaign: agg }, error: null });
});
// POST /api/marketing/track  body: { campaignId?, event, utmSource, utmMedium, utmCampaign, url }
marketingTrackingRouter.post('/track', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const raw = req.body ?? {};
    const event = typeof raw.event === 'string' ? raw.event : 'visit';
    const doc = {
        event,
        campaignId: ObjectId.isValid(raw.campaignId) ? new ObjectId(raw.campaignId) : null,
        utmSource: String(raw.utmSource || ''),
        utmMedium: String(raw.utmMedium || ''),
        utmCampaign: String(raw.utmCampaign || ''),
        url: String(raw.url || ''),
        at: new Date(),
    };
    await db.collection('marketing_events').insertOne(doc);
    res.status(201).json({ data: { ok: true }, error: null });
});
