import { Router } from 'express';
import { getDb } from '../db.js';
import { ObjectId } from 'mongodb';
export const outreachEnrollmentsRouter = Router();
// GET /api/crm/outreach/enroll?contactId=...
outreachEnrollmentsRouter.get('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const contactId = String(req.query.contactId || '');
    if (!contactId || !ObjectId.isValid(contactId))
        return res.json({ data: { items: [] }, error: null });
    const includeCompleted = String(req.query.includeCompleted || 'false').toLowerCase() === 'true' || String(req.query.includeCompleted) === '1';
    const filter = { contactId: new ObjectId(contactId) };
    if (!includeCompleted)
        filter.completedAt = null;
    const items = await db
        .collection('outreach_enrollments')
        .find(filter)
        .sort({ startedAt: -1 })
        .limit(50)
        .toArray();
    res.json({ data: { items }, error: null });
});
// POST /api/crm/outreach/enroll/:id/unenroll
outreachEnrollmentsRouter.post('/:id/unenroll', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(String(req.params.id));
        await db.collection('outreach_enrollments').updateOne({ _id }, { $set: { completedAt: new Date() } });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// POST /api/crm/outreach/enroll/bulk/unenroll { contactId }
outreachEnrollmentsRouter.post('/bulk/unenroll', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const contactId = String(req.body?.contactId || '');
    if (!contactId || !ObjectId.isValid(contactId))
        return res.status(400).json({ data: null, error: 'invalid_payload' });
    const r = await db
        .collection('outreach_enrollments')
        .updateMany({ contactId: new ObjectId(contactId), completedAt: null }, { $set: { completedAt: new Date() } });
    res.json({ data: { modifiedCount: r.modifiedCount }, error: null });
});
// POST /api/crm/outreach/enroll { contactId, sequenceId, startAt }
outreachEnrollmentsRouter.post('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const { contactId, sequenceId, startAt } = req.body ?? {};
    if (!ObjectId.isValid(contactId) || !ObjectId.isValid(sequenceId))
        return res.status(400).json({ data: null, error: 'invalid_payload' });
    const doc = { contactId: new ObjectId(contactId), sequenceId: new ObjectId(sequenceId), startedAt: startAt ? new Date(startAt) : new Date(), lastStepIndex: -1, completedAt: null };
    const r = await db.collection('outreach_enrollments').insertOne(doc);
    res.status(201).json({ data: { _id: r.insertedId }, error: null });
});
// (scheduler moved to outreach_scheduler.ts)
