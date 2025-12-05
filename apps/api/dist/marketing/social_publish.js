import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/rbac.js';
export const socialPublishRouter = Router();
/**
 * Social Media Publishing Engine
 *
 * This module handles actual API calls to social media platforms to publish posts.
 *
 * Platform APIs:
 * - Facebook: Graph API v18.0
 * - Twitter: API v2
 * - LinkedIn: Share API
 * - Instagram: Graph API (via Facebook)
 */
/**
 * Publish to Facebook
 */
async function publishToFacebook(account, post) {
    try {
        const { accessToken, accountId } = account;
        if (!accessToken) {
            return { success: false, error: 'No access token for Facebook account' };
        }
        // Build the post payload
        const payload = {
            message: post.content,
        };
        // Add link if provided
        if (post.link) {
            payload.link = post.link;
            if (post.linkTitle)
                payload.name = post.linkTitle;
            if (post.linkDescription)
                payload.description = post.linkDescription;
        }
        // For images, we need to upload them first, then reference them
        if (post.images && post.images.length > 0) {
            // Single image: use 'url' parameter in post
            if (post.images.length === 1) {
                payload.url = post.images[0];
            }
            else {
                // Multiple images: use batch photo upload (more complex)
                // For now, we'll post the first image
                payload.url = post.images[0];
            }
        }
        // Make API call to Facebook
        const response = await fetch(`https://graph.facebook.com/v18.0/${accountId}/feed?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok || data.error) {
            console.error('Facebook API error:', data.error);
            return {
                success: false,
                error: data.error?.message || 'Facebook API error'
            };
        }
        console.log('✅ Published to Facebook:', data.id);
        return { success: true, platformPostId: data.id };
    }
    catch (error) {
        console.error('Facebook publish error:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Publish to Twitter
 */
async function publishToTwitter(account, post) {
    try {
        const { accessToken } = account;
        if (!accessToken) {
            return { success: false, error: 'No access token for Twitter account' };
        }
        // Build tweet payload
        const payload = {
            text: post.content,
        };
        // Add media if images provided
        if (post.images && post.images.length > 0) {
            // Note: Twitter requires uploading media first, then attaching media_ids
            // For now, we'll just post the text with a note about images
            payload.text = `${post.content}\n\n📷 Images: ${post.images.length}`;
        }
        // Make API call to Twitter
        const response = await fetch('https://api.twitter.com/2/tweets', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok || data.errors) {
            console.error('Twitter API error:', data.errors || data);
            return {
                success: false,
                error: data.errors?.[0]?.message || data.detail || 'Twitter API error'
            };
        }
        console.log('✅ Published to Twitter:', data.data?.id);
        return { success: true, platformPostId: data.data?.id };
    }
    catch (error) {
        console.error('Twitter publish error:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Publish to LinkedIn
 */
async function publishToLinkedIn(account, post) {
    try {
        const { accessToken, accountId } = account;
        if (!accessToken) {
            return { success: false, error: 'No access token for LinkedIn account' };
        }
        // Build LinkedIn share payload
        const payload = {
            author: `urn:li:person:${accountId}`,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: {
                        text: post.content
                    },
                    shareMediaCategory: post.images && post.images.length > 0 ? 'IMAGE' : 'NONE'
                }
            },
            visibility: {
                'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
            }
        };
        // Add link/article if provided
        if (post.link) {
            payload.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'ARTICLE';
            payload.specificContent['com.linkedin.ugc.ShareContent'].media = [{
                    status: 'READY',
                    originalUrl: post.link,
                    title: { text: post.linkTitle || post.link }
                }];
        }
        // Make API call to LinkedIn
        const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Restli-Protocol-Version': '2.0.0'
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('LinkedIn API error:', data);
            return {
                success: false,
                error: data.message || 'LinkedIn API error'
            };
        }
        console.log('✅ Published to LinkedIn:', data.id);
        return { success: true, platformPostId: data.id };
    }
    catch (error) {
        console.error('LinkedIn publish error:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Main publish handler
 * POST /api/marketing/social/publish/:postId
 */
socialPublishRouter.post('/publish/:postId', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const postId = new ObjectId(req.params.postId);
        const post = await db.collection('social_posts').findOne({ _id: postId });
        if (!post) {
            return res.status(404).json({ data: null, error: 'post_not_found' });
        }
        // Get all accounts for this post
        const accountIds = (post.accountIds || []).map((id) => new ObjectId(id));
        const accounts = await db.collection('social_accounts')
            .find({ _id: { $in: accountIds } })
            .toArray();
        if (accounts.length === 0) {
            return res.status(400).json({ data: null, error: 'no_accounts_found' });
        }
        // Publish to each account
        const results = [];
        const platformPostIds = {};
        let hasSuccess = false;
        let hasFailure = false;
        for (const account of accounts) {
            let result;
            switch (account.platform) {
                case 'facebook':
                    result = await publishToFacebook(account, post);
                    break;
                case 'twitter':
                    result = await publishToTwitter(account, post);
                    break;
                case 'linkedin':
                    result = await publishToLinkedIn(account, post);
                    break;
                case 'instagram':
                    result = { success: false, error: 'Instagram publishing coming soon' };
                    break;
                default:
                    result = { success: false, error: 'Unsupported platform' };
            }
            results.push({
                platform: account.platform,
                accountName: account.accountName,
                ...result
            });
            if (result.success) {
                hasSuccess = true;
                platformPostIds[account.platform] = result.platformPostId;
            }
            else {
                hasFailure = true;
            }
        }
        // Update post status
        const updates = {
            publishedAt: new Date(),
            updatedAt: new Date(),
            platformPostIds
        };
        if (hasSuccess && !hasFailure) {
            updates.status = 'published';
        }
        else if (hasFailure && !hasSuccess) {
            updates.status = 'failed';
            updates.error = results.map(r => r.error).filter(Boolean).join('; ');
        }
        else {
            // Partial success
            updates.status = 'published';
            updates.error = `Some platforms failed: ${results.filter(r => !r.success).map(r => `${r.platform}: ${r.error}`).join('; ')}`;
        }
        await db.collection('social_posts').updateOne({ _id: postId }, { $set: updates });
        res.json({
            data: {
                message: hasSuccess ? 'Post published successfully' : 'Failed to publish post',
                results
            },
            error: hasFailure && !hasSuccess ? 'publish_failed' : null
        });
    }
    catch (err) {
        console.error('Publish error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_publish' });
    }
});
