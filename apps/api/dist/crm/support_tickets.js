import { Router } from 'express';
import { getDb, getNextSequence } from '../db.js';
import { ObjectId } from 'mongodb';
export const supportTicketsRouter = Router();
// GET /api/crm/support/tickets?q=&status=&priority=&accountId=&contactId=&sort=&dir=
supportTicketsRouter.get('/tickets', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '');
    const priority = String(req.query.priority ?? '');
    const accountId = String(req.query.accountId ?? '');
    const contactId = String(req.query.contactId ?? '');
    const dir = (req.query.dir ?? 'desc').toLowerCase() === 'asc' ? 1 : -1;
    const sortKey = req.query.sort ?? 'createdAt';
    const sort = { [sortKey]: dir };
    const filter = {};
    if (q)
        filter.$or = [{ title: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }];
    if (status)
        filter.status = status;
    if (priority)
        filter.priority = priority;
    if (ObjectId.isValid(accountId))
        filter.accountId = new ObjectId(accountId);
    if (ObjectId.isValid(contactId))
        filter.contactId = new ObjectId(contactId);
    const items = await db.collection('support_tickets').find(filter).sort(sort).limit(200).toArray();
    res.json({ data: { items }, error: null });
});
// POST /api/crm/support/tickets
supportTicketsRouter.post('/tickets', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const raw = req.body ?? {};
        const shortDescription = typeof raw.shortDescription === 'string' && raw.shortDescription.trim()
            ? raw.shortDescription.trim()
            : (typeof raw.title === 'string' ? raw.title.trim() : '');
        if (!shortDescription)
            return res.status(400).json({ data: null, error: 'invalid_payload' });
        const descRaw = typeof raw.description === 'string' ? raw.description : '';
        const description = descRaw.length > 2500 ? descRaw.slice(0, 2500) : descRaw;
        const doc = {
            shortDescription,
            description,
            status: raw.status || 'open',
            priority: raw.priority || 'normal',
            accountId: ObjectId.isValid(raw.accountId) ? new ObjectId(raw.accountId) : null,
            contactId: ObjectId.isValid(raw.contactId) ? new ObjectId(raw.contactId) : null,
            assignee: raw.assignee || null,
            slaDueAt: raw.slaDueAt ? new Date(raw.slaDueAt) : null,
            comments: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        try {
            doc.ticketNumber = await getNextSequence('ticketNumber');
        }
        catch { }
        if (doc.ticketNumber == null)
            doc.ticketNumber = 200001;
        const coll = db.collection('support_tickets');
        // Robust retry loop to avoid duplicate numbers under contention
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const result = await coll.insertOne(doc);
                return res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null });
            }
            catch (errInsert) {
                if (errInsert && typeof errInsert === 'object' && 'code' in errInsert && errInsert.code === 11000) {
                    // Align counter and pick next number deterministically from current max
                    const maxDocs = await coll
                        .find({}, { projection: { ticketNumber: 1 } })
                        .sort({ ticketNumber: -1 })
                        .limit(1)
                        .toArray();
                    const maxNum = maxDocs[0]?.ticketNumber ?? 200000;
                    await db
                        .collection('counters')
                        .updateOne({ _id: 'ticketNumber' }, [{ $set: { seq: { $max: ['$seq', maxNum] } } }], { upsert: true });
                    // Set next candidate directly to max+1 to break tie immediately
                    doc.ticketNumber = (maxNum ?? 200000) + 1;
                    continue;
                }
                throw errInsert;
            }
        }
        return res.status(409).json({ data: null, error: 'duplicate_ticketNumber' });
    }
    catch (err) {
        console.error('create_ticket_error', err);
        if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
            return res.status(409).json({ data: null, error: 'duplicate_ticketNumber' });
        }
        const details = {};
        if (err && typeof err === 'object') {
            if ('message' in err && typeof err.message === 'string')
                details.message = err.message;
            if ('code' in err && typeof err.code !== 'undefined')
                details.code = err.code;
            if ('name' in err && typeof err.name === 'string')
                details.name = err.name;
            if ('errmsg' in err && typeof err.errmsg === 'string')
                details.errmsg = err.errmsg;
            if ('keyPattern' in err)
                details.keyPattern = err.keyPattern;
            if ('keyValue' in err)
                details.keyValue = err.keyValue;
        }
        return res.status(500).json({ data: null, error: 'insert_failed', details });
    }
});
// PUT /api/crm/support/tickets/:id
supportTicketsRouter.put('/tickets/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const update = { updatedAt: new Date() };
        // Accept both 'shortDescription' and legacy 'title' for compatibility
        if (typeof (req.body ?? {}).shortDescription === 'string')
            update.shortDescription = req.body.shortDescription;
        else if (typeof (req.body ?? {}).title === 'string')
            update.shortDescription = req.body.title;
        for (const k of ['status', 'priority', 'assignee'])
            if (typeof (req.body ?? {})[k] === 'string')
                update[k] = req.body[k];
        if (typeof (req.body ?? {}).description === 'string') {
            const d = String(req.body.description);
            update.description = d.length > 2500 ? d.slice(0, 2500) : d;
        }
        if (req.body?.slaDueAt)
            update.slaDueAt = new Date(req.body.slaDueAt);
        if (req.body?.accountId && ObjectId.isValid(req.body.accountId))
            update.accountId = new ObjectId(req.body.accountId);
        if (req.body?.contactId && ObjectId.isValid(req.body.contactId))
            update.contactId = new ObjectId(req.body.contactId);
        await db.collection('support_tickets').updateOne({ _id }, { $set: update });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// POST /api/crm/support/tickets/:id/comments { author, body }
supportTicketsRouter.post('/tickets/:id/comments', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const comment = { author: (req.body?.author || 'system'), body: String(req.body?.body || ''), at: new Date() };
        await db.collection('support_tickets').updateOne({ _id }, { $push: { comments: comment }, $set: { updatedAt: new Date() } });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
