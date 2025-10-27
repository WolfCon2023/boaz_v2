import { Router } from 'express';
import { getDb } from '../db.js';
import { ObjectId } from 'mongodb';
export const outreachEventsRouter = Router();
// GET /api/crm/outreach/events?q=&event=&channel=&sort=&dir=
outreachEventsRouter.get('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const q = String(req.query.q ?? '').trim();
    const event = String(req.query.event ?? '');
    const channel = String(req.query.channel ?? '');
    const sortKeyRaw = req.query.sort ?? 'at';
    const dirParam = (req.query.dir ?? 'desc').toLowerCase();
    const dir = dirParam === 'asc' ? 1 : -1;
    const sort = { [sortKeyRaw === 'at' ? 'at' : 'at']: dir };
    const filter = {};
    if (q)
        filter.recipient = { $regex: q, $options: 'i' };
    if (event)
        filter.event = event;
    if (channel)
        filter.channel = channel;
    const items = await db.collection('outreach_events').find(filter).sort(sort).limit(200).toArray();
    res.json({ data: { items }, error: null });
});
// POST /api/crm/outreach/events
outreachEventsRouter.post('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const raw = req.body ?? {};
    const channel = raw.channel === 'sms' ? 'sms' : 'email';
    const allowed = new Set(['sent', 'delivered', 'opened', 'clicked', 'bounced', 'spam', 'unsubscribed']);
    const event = allowed.has(raw.event) ? raw.event : 'sent';
    const now = new Date();
    const doc = {
        templateId: (typeof raw.templateId === 'string' && ObjectId.isValid(raw.templateId)) ? new ObjectId(raw.templateId) : null,
        sequenceId: (typeof raw.sequenceId === 'string' && ObjectId.isValid(raw.sequenceId)) ? new ObjectId(raw.sequenceId) : null,
        recipient: typeof raw.recipient === 'string' ? raw.recipient : null,
        channel,
        event,
        variant: typeof raw.variant === 'string' ? raw.variant : null,
        meta: (raw.meta && typeof raw.meta === 'object') ? raw.meta : null,
        at: raw.at ? new Date(raw.at) : now,
    };
    const result = await db.collection('outreach_events').insertOne(doc);
    res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null });
});
