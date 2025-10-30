import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
export const marketingUnsubscribeRouter = Router();
// GET /api/marketing/unsubscribe?e=email&c=campaignId
marketingUnsubscribeRouter.get('/unsubscribe', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).send('db_unavailable');
    const email = String(req.query.e || '').toLowerCase().trim();
    const c = String(req.query.c || '');
    if (!email)
        return res.status(400).send('missing_email');
    const doc = { email, at: new Date() };
    if (ObjectId.isValid(c))
        doc.campaignId = new ObjectId(c);
    await db.collection('marketing_unsubscribes').updateOne({ email }, { $set: doc }, { upsert: true });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send('<!doctype html><html><body><div style="font-family:system-ui;padding:24px">You have been unsubscribed. You can close this page.</div></body></html>');
});
