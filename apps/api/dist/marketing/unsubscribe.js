import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth, requirePermission } from '../auth/rbac.js';
export const marketingUnsubscribeRouter = Router();
// GET /api/marketing/unsubscribe?e=email&c=campaignId (public endpoint)
marketingUnsubscribeRouter.get('/unsubscribe', async (req, res) => {
    console.log('📧 Unsubscribe request received:', {
        email: req.query.e,
        campaignId: req.query.c,
        url: req.originalUrl
    });
    const db = await getDb();
    if (!db) {
        console.error('❌ Database unavailable for unsubscribe');
        return res.status(500).send('db_unavailable');
    }
    const email = String(req.query.e || '').toLowerCase().trim();
    const c = String(req.query.c || '');
    if (!email) {
        console.error('❌ Missing email parameter');
        return res.status(400).send('missing_email');
    }
    const doc = { email, at: new Date() };
    if (ObjectId.isValid(c))
        doc.campaignId = new ObjectId(c);
    try {
        await db.collection('marketing_unsubscribes').updateOne({ email }, { $set: doc }, { upsert: true });
        console.log('✅ Successfully unsubscribed:', email);
    }
    catch (err) {
        console.error('❌ Failed to unsubscribe:', err);
        return res.status(500).send('Failed to process unsubscribe request');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Unsubscribed</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 40px;
      max-width: 500px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    h1 {
      color: #1e293b;
      font-size: 24px;
      margin: 0 0 16px 0;
    }
    p {
      color: #64748b;
      font-size: 16px;
      line-height: 1.6;
      margin: 0;
    }
    .email {
      color: #6366f1;
      font-weight: 600;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>You've been unsubscribed</h1>
    <p>
      We've removed <span class="email">${email}</span> from our mailing list.
      <br><br>
      You won't receive any more marketing emails from us.
      <br><br>
      You can safely close this page.
    </p>
  </div>
</body>
</html>`);
});
// GET /api/marketing/unsubscribes (list all unsubscribes - requires auth)
marketingUnsubscribeRouter.get('/unsubscribes', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const q = String(req.query.q ?? '').trim();
        const sortKeyRaw = req.query.sort ?? 'at';
        const dirParam = (req.query.dir ?? 'desc').toLowerCase();
        const dir = dirParam === 'asc' ? 1 : -1;
        const allowed = new Set(['email', 'at', 'campaignId']);
        const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'at';
        const sort = { [sortField]: dir };
        const filter = {};
        if (q) {
            filter.$or = [
                { email: { $regex: q, $options: 'i' } },
            ];
        }
        const unsubscribes = await db.collection('marketing_unsubscribes')
            .find(filter)
            .sort(sort)
            .limit(1000)
            .toArray();
        // Get campaign names for unsubscribes with campaignId
        const campaignIds = unsubscribes
            .map((u) => u.campaignId)
            .filter((id) => id && ObjectId.isValid(id))
            .map((id) => new ObjectId(id));
        const campaigns = campaignIds.length > 0
            ? await db.collection('marketing_campaigns')
                .find({ _id: { $in: campaignIds } })
                .project({ _id: 1, name: 1 })
                .toArray()
            : [];
        const campaignMap = new Map(campaigns.map((c) => [String(c._id), c.name]));
        // Get contact names for emails
        const emails = unsubscribes.map((u) => u.email);
        const contacts = emails.length > 0
            ? await db.collection('contacts')
                .find({ email: { $in: emails } })
                .project({ email: 1, name: 1 })
                .toArray()
            : [];
        const contactMap = new Map(contacts.map((c) => [String(c.email).toLowerCase(), c.name]));
        const items = unsubscribes.map((u) => ({
            _id: String(u._id),
            email: u.email,
            name: contactMap.get(u.email?.toLowerCase()) || null,
            campaignId: u.campaignId ? String(u.campaignId) : null,
            campaignName: u.campaignId ? campaignMap.get(String(u.campaignId)) || null : null,
            at: u.at,
        }));
        res.json({ data: { items }, error: null });
    }
    catch (err) {
        console.error('Get unsubscribes error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_unsubscribes' });
    }
});
// DELETE /api/marketing/unsubscribes/:id (remove from DNC list - admin only)
marketingUnsubscribeRouter.delete('/unsubscribes/:id', requireAuth, requirePermission('*'), async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const unsubscribeId = new ObjectId(req.params.id);
        const unsubscribe = await db.collection('marketing_unsubscribes').findOne({ _id: unsubscribeId });
        if (!unsubscribe) {
            return res.status(404).json({ data: null, error: 'unsubscribe_not_found' });
        }
        await db.collection('marketing_unsubscribes').deleteOne({ _id: unsubscribeId });
        res.json({ data: { message: 'Subscriber removed from Do Not Contact list', email: unsubscribe.email }, error: null });
    }
    catch (err) {
        console.error('Remove unsubscribe error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_remove_unsubscribe' });
    }
});
