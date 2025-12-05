import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/rbac.js';
import { z } from 'zod';
export const socialAccountsRouter = Router();
const socialAccountSchema = z.object({
    platform: z.enum(['facebook', 'twitter', 'linkedin', 'instagram']),
    accountName: z.string().min(1),
    accountId: z.string().min(1),
    username: z.string().optional(),
    profileImage: z.string().url().optional(),
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
    status: z.enum(['active', 'disconnected', 'expired', 'error']).default('active'),
});
// GET /api/marketing/social/accounts - List all connected accounts
socialAccountsRouter.get('/accounts', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const accounts = await db.collection('social_accounts')
            .find({})
            .sort({ platform: 1, createdAt: -1 })
            .toArray();
        // Don't send tokens to frontend
        const sanitized = accounts.map((acc) => ({
            _id: acc._id.toHexString(),
            platform: acc.platform,
            accountName: acc.accountName,
            accountId: acc.accountId,
            username: acc.username,
            profileImage: acc.profileImage,
            status: acc.status,
            followerCount: acc.followerCount,
            lastSync: acc.lastSync,
            createdAt: acc.createdAt,
            updatedAt: acc.updatedAt,
        }));
        res.json({ data: { items: sanitized }, error: null });
    }
    catch (err) {
        console.error('Get social accounts error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_accounts' });
    }
});
// POST /api/marketing/social/accounts - Connect new account
socialAccountsRouter.post('/accounts', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const parsed = socialAccountSchema.parse(req.body);
        const userId = req.user?.userId || 'system';
        // Check if account already exists
        const existing = await db.collection('social_accounts').findOne({
            platform: parsed.platform,
            accountId: parsed.accountId,
        });
        if (existing) {
            return res.status(400).json({ data: null, error: 'account_already_connected' });
        }
        const now = new Date();
        const doc = {
            platform: parsed.platform,
            accountName: parsed.accountName,
            accountId: parsed.accountId,
            username: parsed.username,
            profileImage: parsed.profileImage,
            accessToken: parsed.accessToken,
            refreshToken: parsed.refreshToken,
            status: parsed.status,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
        };
        const result = await db.collection('social_accounts').insertOne(doc);
        res.status(201).json({
            data: {
                _id: result.insertedId.toHexString(),
                message: 'Social account connected successfully'
            },
            error: null
        });
    }
    catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ data: null, error: 'invalid_payload', details: err.errors });
        }
        console.error('Connect social account error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_connect_account' });
    }
});
// PUT /api/marketing/social/accounts/:id - Update account
socialAccountsRouter.put('/accounts/:id', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const updates = { updatedAt: new Date() };
        if (req.body.status)
            updates.status = req.body.status;
        if (req.body.accountName)
            updates.accountName = req.body.accountName;
        if (req.body.accessToken)
            updates.accessToken = req.body.accessToken;
        if (req.body.refreshToken)
            updates.refreshToken = req.body.refreshToken;
        if (req.body.followerCount !== undefined)
            updates.followerCount = req.body.followerCount;
        if (req.body.lastSync)
            updates.lastSync = new Date(req.body.lastSync);
        await db.collection('social_accounts').updateOne({ _id }, { $set: updates });
        res.json({ data: { message: 'Account updated successfully' }, error: null });
    }
    catch (err) {
        console.error('Update social account error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_update_account' });
    }
});
// DELETE /api/marketing/social/accounts/:id - Disconnect account
socialAccountsRouter.delete('/accounts/:id', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const account = await db.collection('social_accounts').findOne({ _id });
        if (!account) {
            return res.status(404).json({ data: null, error: 'account_not_found' });
        }
        await db.collection('social_accounts').deleteOne({ _id });
        res.json({ data: { message: 'Account disconnected successfully' }, error: null });
    }
    catch (err) {
        console.error('Disconnect social account error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_disconnect_account' });
    }
});
