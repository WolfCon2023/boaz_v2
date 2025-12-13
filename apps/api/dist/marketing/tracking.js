import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
export const marketingTrackingRouter = Router();
async function ensureEngagementSegmentAndAddEmail(db, campaignId, rawEmail) {
    if (!campaignId)
        return;
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!email || !email.includes('@'))
        return;
    // Respect Do-Not-Contact list
    const unsub = await db.collection('marketing_unsubscribes').findOne({ email });
    if (unsub)
        return;
    // Find (or create) a dedicated "engaged" segment for this campaign
    const campaign = await db.collection('marketing_campaigns').findOne({ _id: campaignId }, { projection: { name: 1 } });
    const campaignName = String(campaign?.name || campaignId.toHexString());
    const segFilter = { engagementCampaignId: campaignId };
    let seg = await db.collection('marketing_segments').findOne(segFilter);
    if (!seg) {
        const now = new Date();
        const doc = {
            name: `Engaged: ${campaignName}`,
            description: `Auto-generated segment. Populated when recipients open/click "${campaignName}" and are not unsubscribed.`,
            rules: [],
            emails: [],
            engagementCampaignId: campaignId,
            createdAt: now,
            updatedAt: now,
        };
        const r = await db.collection('marketing_segments').insertOne(doc);
        seg = { _id: r.insertedId, ...doc };
    }
    await db.collection('marketing_segments').updateOne({ _id: seg._id }, { $addToSet: { emails: email }, $set: { updatedAt: new Date() } });
}
// GET /api/marketing/metrics?campaignId=&startDate=&endDate=
marketingTrackingRouter.get('/metrics', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { byCampaign: [] }, error: null });
    const campaignId = String(req.query.campaignId ?? '');
    const startDate = String(req.query.startDate ?? '');
    const endDate = String(req.query.endDate ?? '');
    const match = {};
    if (ObjectId.isValid(campaignId))
        match.campaignId = new ObjectId(campaignId);
    // Add date filters
    if (startDate || endDate) {
        const dateFilter = {};
        if (startDate) {
            const d = new Date(startDate);
            if (!isNaN(d.getTime()))
                dateFilter.$gte = d;
        }
        if (endDate) {
            const d = new Date(endDate);
            if (!isNaN(d.getTime())) {
                d.setHours(23, 59, 59, 999);
                dateFilter.$lte = d;
            }
        }
        if (Object.keys(dateFilter).length > 0)
            match.at = dateFilter;
    }
    const agg = await db.collection('marketing_events').aggregate([
        { $match: match },
        {
            $group: {
                _id: '$campaignId',
                sent: { $sum: { $cond: [{ $eq: ['$event', 'sent'] }, 1, 0] } },
                opens: { $sum: { $cond: [{ $eq: ['$event', 'open'] }, 1, 0] } },
                clicks: { $sum: { $cond: [{ $eq: ['$event', 'click'] }, 1, 0] } },
                visits: { $sum: { $cond: [{ $eq: ['$event', 'visit'] }, 1, 0] } }
            }
        },
        { $project: { campaignId: '$_id', sent: 1, opens: 1, clicks: 1, visits: 1, _id: 0 } }
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
// POST /api/marketing/links { campaignId, url, utmSource, utmMedium }
marketingTrackingRouter.post('/links', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const raw = req.body ?? {};
    const url = String(raw.url || '');
    if (!/^https?:\/\//i.test(url))
        return res.status(400).json({ data: null, error: 'invalid_url' });
    const campaignId = ObjectId.isValid(raw.campaignId) ? new ObjectId(raw.campaignId) : null;
    const utmSource = String(raw.utmSource || 'email');
    const utmMedium = String(raw.utmMedium || 'email');
    const utmCampaign = String(raw.utmCampaign || '');
    const token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    const doc = { token, campaignId, url, utmSource, utmMedium, utmCampaign, createdAt: new Date() };
    await db.collection('marketing_links').insertOne(doc);
    res.status(201).json({ data: { token }, error: null });
});
// GET /api/marketing/r/:token — record click and redirect
marketingTrackingRouter.get('/r/:token', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).send('db_unavailable');
    const token = String(req.params.token || '');
    const link = await db.collection('marketing_links').findOne({ token });
    if (!link)
        return res.status(404).send('not_found');
    const recipient = String(req.query.e || '').trim().toLowerCase();
    const target = new URL(link.url);
    if (link.utmSource)
        target.searchParams.set('utm_source', link.utmSource);
    if (link.utmMedium)
        target.searchParams.set('utm_medium', link.utmMedium);
    if (link.utmCampaign)
        target.searchParams.set('utm_campaign', link.utmCampaign);
    const clickedAt = new Date();
    // Fetch campaign name for better tracking
    let campaign = null;
    if (link.campaignId) {
        campaign = await db.collection('marketing_campaigns').findOne({ _id: link.campaignId }, { projection: { name: 1 } });
    }
    const campaignName = campaign?.name || link.utmCampaign || 'unknown';
    // Log to marketing_events (for campaign-specific tracking)
    await db.collection('marketing_events').insertOne({
        event: 'click',
        token,
        campaignId: link.campaignId || null,
        recipient: recipient || null,
        url: target.toString(),
        at: clickedAt,
    });
    // Response-based segmentation: add engaged recipients to an auto-generated segment (if not unsubscribed)
    if (recipient) {
        try {
            await ensureEngagementSegmentAndAddEmail(db, link.campaignId || null, recipient);
        }
        catch {
            // best-effort; never block redirect
        }
    }
    // Also log to outreach_events (for unified outreach tracking)
    if (link.campaignId) {
        await db.collection('outreach_events').insertOne({
            channel: 'email',
            event: 'clicked',
            recipient: recipient || null,
            variant: `campaign:${campaignName}`,
            meta: { campaignId: link.campaignId.toHexString(), campaignName, url: link.url, token },
            at: clickedAt
        });
    }
    res.redirect(302, target.toString());
});
// GET /api/marketing/pixel.gif?c=&e=
marketingTrackingRouter.get('/pixel.gif', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).end();
    const c = String(req.query.c || '');
    const e = String(req.query.e || '');
    try {
        const campaignId = ObjectId.isValid(c) ? new ObjectId(c) : null;
        const openedAt = new Date();
        // Log to marketing_events (for campaign-specific tracking)
        await db.collection('marketing_events').insertOne({ event: 'open', campaignId, recipient: e || null, at: openedAt });
        // Response-based segmentation: add engaged recipients to an auto-generated segment (if not unsubscribed)
        if (campaignId && e) {
            try {
                await ensureEngagementSegmentAndAddEmail(db, campaignId, e);
            }
            catch {
                // best-effort
            }
        }
        // Also log to outreach_events (for unified outreach tracking)
        if (e) {
            await db.collection('outreach_events').insertOne({
                channel: 'email',
                event: 'opened',
                recipient: e,
                variant: campaignId ? `campaign:${campaignId.toHexString()}` : null,
                meta: { campaignId: campaignId?.toHexString() || null },
                at: openedAt
            });
        }
    }
    catch {
        // ignore
    }
    // 1x1 transparent GIF
    const gif = Buffer.from('R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.send(gif);
});
// GET /api/marketing/metrics/links?campaignId=
marketingTrackingRouter.get('/metrics/links', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const campaignId = String(req.query.campaignId ?? '');
    const match = {};
    if (ObjectId.isValid(campaignId))
        match.campaignId = new ObjectId(campaignId);
    const items = await db.collection('marketing_links').aggregate([
        { $match: match },
        {
            $lookup: {
                from: 'marketing_events',
                let: { t: '$token' },
                pipeline: [
                    { $match: { $expr: { $and: [{ $eq: ['$event', 'click'] }, { $eq: ['$token', '$$t'] }] } } },
                    { $count: 'count' },
                ],
                as: 'clicksAgg'
            }
        },
        { $addFields: { clicks: { $ifNull: [{ $arrayElemAt: ['$clicksAgg.count', 0] }, 0] } } },
        { $project: { _id: 0, token: 1, url: 1, utmSource: 1, utmMedium: 1, utmCampaign: 1, campaignId: 1, clicks: 1 } },
    ]).toArray();
    res.json({ data: { items }, error: null });
});
// GET /api/marketing/metrics/roi?campaignId=
marketingTrackingRouter.get('/metrics/roi', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const campaignId = String(req.query.campaignId ?? '');
    const match = { marketingCampaignId: { $exists: true, $ne: null } };
    if (ObjectId.isValid(campaignId))
        match.marketingCampaignId = new ObjectId(campaignId);
    const closedWon = 'Contract Signed / Closed Won';
    const items = await db.collection('deals').aggregate([
        { $match: { ...match, stage: closedWon, amount: { $type: 'number', $gt: 0 } } },
        { $group: { _id: '$marketingCampaignId', revenue: { $sum: '$amount' }, dealsCount: { $sum: 1 } } },
        { $project: { campaignId: '$_id', revenue: 1, dealsCount: 1, _id: 0 } },
    ]).toArray();
    res.json({ data: { items }, error: null });
});
// GET /api/marketing/metrics/surveys?campaignId=&startDate=&endDate=
// Aggregates survey responses that originated from campaigns (via survey_links)
marketingTrackingRouter.get('/metrics/surveys', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const campaignId = String(req.query.campaignId ?? '');
    const startDateRaw = String(req.query.startDate ?? '');
    const endDateRaw = String(req.query.endDate ?? '');
    const match = {
        outreachEnrollmentId: { $exists: true, $ne: null },
    };
    if (ObjectId.isValid(campaignId)) {
        match.outreachEnrollmentId = new ObjectId(campaignId);
    }
    const createdAt = {};
    if (startDateRaw) {
        const d = new Date(startDateRaw);
        if (!isNaN(d.getTime()))
            createdAt.$gte = d;
    }
    if (endDateRaw) {
        const d = new Date(endDateRaw);
        if (!isNaN(d.getTime())) {
            d.setHours(23, 59, 59, 999);
            createdAt.$lte = d;
        }
    }
    if (Object.keys(createdAt).length > 0) {
        match.createdAt = createdAt;
    }
    const items = await db
        .collection('survey_responses')
        .aggregate([
        { $match: match },
        {
            $group: {
                _id: { campaignId: '$outreachEnrollmentId', programId: '$programId' },
                responses: { $sum: 1 },
                averageScore: { $avg: '$score' },
            },
        },
        {
            $lookup: {
                from: 'survey_programs',
                localField: '_id.programId',
                foreignField: '_id',
                as: 'program',
            },
        },
        { $unwind: { path: '$program', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                _id: 0,
                campaignId: '$_id.campaignId',
                programId: '$_id.programId',
                responses: 1,
                averageScore: 1,
                programName: '$program.name',
                programType: '$program.type',
            },
        },
    ])
        .toArray();
    res.json({ data: { items }, error: null });
});
