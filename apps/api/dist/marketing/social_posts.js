import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/rbac.js';
import { z } from 'zod';
export const socialPostsRouter = Router();
const socialPostSchema = z.object({
    content: z.string().min(1).max(5000),
    platforms: z.array(z.enum(['facebook', 'twitter', 'linkedin', 'instagram'])),
    accountIds: z.array(z.string()),
    images: z.array(z.string().url()).optional(),
    videoUrl: z.string().url().optional(),
    link: z.string().url().optional(),
    linkTitle: z.string().optional(),
    linkDescription: z.string().optional(),
    hashtags: z.array(z.string()).optional(),
    status: z.enum(['draft', 'scheduled', 'published']).default('draft'),
    scheduledFor: z.string().optional(),
    campaignId: z.string().optional(),
});
// GET /api/marketing/social/posts - List all posts
socialPostsRouter.get('/posts', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const status = req.query.status;
        const platform = req.query.platform;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const filter = {};
        if (status)
            filter.status = status;
        if (platform)
            filter.platforms = platform;
        if (startDate || endDate) {
            filter.$or = [];
            const dateFilter = {};
            if (startDate)
                dateFilter.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                dateFilter.$lte = end;
            }
            filter.$or.push({ scheduledFor: dateFilter });
            filter.$or.push({ publishedAt: dateFilter });
        }
        const posts = await db.collection('social_posts')
            .find(filter)
            .sort({ scheduledFor: -1, createdAt: -1 })
            .limit(500)
            .toArray();
        const items = posts.map((p) => ({
            _id: p._id.toHexString(),
            content: p.content,
            platforms: p.platforms,
            accountIds: p.accountIds,
            images: p.images,
            videoUrl: p.videoUrl,
            link: p.link,
            linkTitle: p.linkTitle,
            linkDescription: p.linkDescription,
            hashtags: p.hashtags,
            status: p.status,
            scheduledFor: p.scheduledFor,
            publishedAt: p.publishedAt,
            campaignId: p.campaignId?.toHexString(),
            metrics: p.metrics,
            platformPostIds: p.platformPostIds,
            error: p.error,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
        }));
        res.json({ data: { items }, error: null });
    }
    catch (err) {
        console.error('Get social posts error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_posts' });
    }
});
// POST /api/marketing/social/posts - Create new post
socialPostsRouter.post('/posts', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const parsed = socialPostSchema.parse(req.body);
        const userId = req.user?.userId || 'system';
        const now = new Date();
        const doc = {
            content: parsed.content,
            platforms: parsed.platforms,
            accountIds: parsed.accountIds,
            images: parsed.images,
            videoUrl: parsed.videoUrl,
            link: parsed.link,
            linkTitle: parsed.linkTitle,
            linkDescription: parsed.linkDescription,
            hashtags: parsed.hashtags,
            status: parsed.status,
            scheduledFor: parsed.scheduledFor ? new Date(parsed.scheduledFor) : undefined,
            campaignId: parsed.campaignId && ObjectId.isValid(parsed.campaignId) ? new ObjectId(parsed.campaignId) : undefined,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
        };
        const result = await db.collection('social_posts').insertOne(doc);
        const postId = result.insertedId.toHexString();
        // If status is 'published' and no scheduledFor, publish immediately
        if (parsed.status === 'published' && !parsed.scheduledFor) {
            console.log('📱 Immediate publish requested for post:', postId);
            // Trigger actual publishing to platforms (async, don't wait)
            fetch(`${req.protocol}://${req.get('host')}/api/marketing/social/publish/${postId}`, {
                method: 'POST',
                headers: {
                    'Cookie': req.headers.cookie || '',
                    'Content-Type': 'application/json'
                }
            }).catch(err => {
                console.error('Failed to trigger publish:', err);
            });
        }
        res.status(201).json({
            data: {
                _id: postId,
                message: 'Social post created successfully'
            },
            error: null
        });
    }
    catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ data: null, error: 'invalid_payload', details: err.errors });
        }
        console.error('Create social post error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_create_post' });
    }
});
// PUT /api/marketing/social/posts/:id - Update post
socialPostsRouter.put('/posts/:id', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const updates = { updatedAt: new Date() };
        if (req.body.content !== undefined)
            updates.content = req.body.content;
        if (req.body.platforms)
            updates.platforms = req.body.platforms;
        if (req.body.accountIds)
            updates.accountIds = req.body.accountIds;
        if (req.body.images)
            updates.images = req.body.images;
        if (req.body.videoUrl !== undefined)
            updates.videoUrl = req.body.videoUrl;
        if (req.body.link !== undefined)
            updates.link = req.body.link;
        if (req.body.linkTitle !== undefined)
            updates.linkTitle = req.body.linkTitle;
        if (req.body.linkDescription !== undefined)
            updates.linkDescription = req.body.linkDescription;
        if (req.body.hashtags)
            updates.hashtags = req.body.hashtags;
        if (req.body.status)
            updates.status = req.body.status;
        if (req.body.scheduledFor !== undefined) {
            updates.scheduledFor = req.body.scheduledFor ? new Date(req.body.scheduledFor) : null;
        }
        if (req.body.publishedAt)
            updates.publishedAt = new Date(req.body.publishedAt);
        if (req.body.metrics)
            updates.metrics = req.body.metrics;
        if (req.body.platformPostIds)
            updates.platformPostIds = req.body.platformPostIds;
        if (req.body.error !== undefined)
            updates.error = req.body.error;
        await db.collection('social_posts').updateOne({ _id }, { $set: updates });
        res.json({ data: { message: 'Post updated successfully' }, error: null });
    }
    catch (err) {
        console.error('Update social post error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_update_post' });
    }
});
// DELETE /api/marketing/social/posts/:id - Delete post
socialPostsRouter.delete('/posts/:id', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const post = await db.collection('social_posts').findOne({ _id });
        if (!post) {
            return res.status(404).json({ data: null, error: 'post_not_found' });
        }
        // Only allow deletion of draft or scheduled posts
        if (post.status === 'published') {
            return res.status(400).json({ data: null, error: 'cannot_delete_published_post' });
        }
        await db.collection('social_posts').deleteOne({ _id });
        res.json({ data: { message: 'Post deleted successfully' }, error: null });
    }
    catch (err) {
        console.error('Delete social post error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_delete_post' });
    }
});
// POST /api/marketing/social/posts/:id/publish - Publish a post immediately
// Note: This endpoint is now handled by social_publish.ts for actual platform API calls
// GET /api/marketing/social/analytics - Get aggregated analytics
socialPostsRouter.get('/analytics', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const match = { status: 'published' };
        if (startDate || endDate) {
            match.publishedAt = {};
            if (startDate)
                match.publishedAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                match.publishedAt.$lte = end;
            }
        }
        const posts = await db.collection('social_posts').find(match).toArray();
        // Aggregate metrics
        const analytics = {
            totalPosts: posts.length,
            byPlatform: {},
            totalEngagement: {
                likes: 0,
                shares: 0,
                comments: 0,
                clicks: 0,
                reach: 0,
                impressions: 0,
            }
        };
        posts.forEach((post) => {
            if (post.metrics) {
                Object.entries(post.metrics).forEach(([platform, metrics]) => {
                    if (!analytics.byPlatform[platform]) {
                        analytics.byPlatform[platform] = {
                            posts: 0,
                            likes: 0,
                            shares: 0,
                            comments: 0,
                            clicks: 0,
                            reach: 0,
                            impressions: 0,
                        };
                    }
                    analytics.byPlatform[platform].posts++;
                    analytics.byPlatform[platform].likes += metrics.likes || 0;
                    analytics.byPlatform[platform].shares += metrics.shares || 0;
                    analytics.byPlatform[platform].comments += metrics.comments || 0;
                    analytics.byPlatform[platform].clicks += metrics.clicks || 0;
                    analytics.byPlatform[platform].reach += metrics.reach || 0;
                    analytics.byPlatform[platform].impressions += metrics.impressions || 0;
                    analytics.totalEngagement.likes += metrics.likes || 0;
                    analytics.totalEngagement.shares += metrics.shares || 0;
                    analytics.totalEngagement.comments += metrics.comments || 0;
                    analytics.totalEngagement.clicks += metrics.clicks || 0;
                    analytics.totalEngagement.reach += metrics.reach || 0;
                    analytics.totalEngagement.impressions += metrics.impressions || 0;
                });
            }
        });
        res.json({ data: analytics, error: null });
    }
    catch (err) {
        console.error('Get social analytics error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_analytics' });
    }
});
