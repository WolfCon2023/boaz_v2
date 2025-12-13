import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import mjml2html from 'mjml';
import { sendEmail } from '../alerts/mail.js';
import crypto from 'crypto';
import { env } from '../env.js';
export const marketingSendRouter = Router();
function applyFontFamilyToHtml(html, fontFamily) {
    const ff = String(fontFamily || '').trim();
    if (!ff)
        return html;
    // Very conservative safety check (campaigns.ts already sanitizes; keep defense in depth here).
    if (!/^[a-zA-Z0-9\s,"'\-]+$/.test(ff))
        return html;
    const css = `body, table, td, p, a, div, span { font-family: ${ff} !important; }`;
    const styleTag = `<style>${css}</style>`;
    if (/<head[\s>]/i.test(html)) {
        return html.replace(/<head[^>]*>/i, (m) => m + styleTag);
    }
    if (/<html[\s>]/i.test(html)) {
        return html.replace(/<html[^>]*>/i, (m) => m + `<head>${styleTag}</head>`);
    }
    return `<html><head>${styleTag}</head><body>${html}</body></html>`;
}
function buildFilterFromRules(rules) {
    const ands = [];
    for (const r of rules || []) {
        const field = typeof r?.field === 'string' ? r.field : '';
        const operator = typeof r?.operator === 'string' ? r.operator : 'contains';
        const value = typeof r?.value === 'string' ? r.value : '';
        if (!field || !value)
            continue;
        if (operator === 'equals')
            ands.push({ [field]: value });
        else if (operator === 'startsWith')
            ands.push({ [field]: { $regex: `^${value}`, $options: 'i' } });
        else
            ands.push({ [field]: { $regex: value, $options: 'i' } });
    }
    return ands.length ? { $and: ands } : {};
}
function injectUnsubscribe(html, unsubscribeUrl) {
    // Support both {{unsubscribeUrl}} and {{unsubscribeurl}} (case-insensitive)
    if (html.includes('{{unsubscribeUrl}}')) {
        return html.replaceAll('{{unsubscribeUrl}}', unsubscribeUrl);
    }
    if (html.includes('{{unsubscribeurl}}')) {
        return html.replaceAll('{{unsubscribeurl}}', unsubscribeUrl);
    }
    // Also handle older patterns like "http://{{unsubscribeurl}}/" or "https://{{unsubscribeurl}}"
    const fullRegex = /https?:\/\/\{\{unsubscribeurl\}\}\/?/gi;
    if (fullRegex.test(html)) {
        return html.replace(fullRegex, unsubscribeUrl);
    }
    // Case-insensitive replacement as fallback for bare token
    const regex = /\{\{unsubscribeurl\}\}/gi;
    if (regex.test(html)) {
        return html.replace(regex, unsubscribeUrl);
    }
    // If no placeholder found, append footer
    const footer = `<p style="font-size:12px;color:#64748b">You received this email because you subscribed. <a href="${unsubscribeUrl}">Unsubscribe</a></p>`;
    return html + footer;
}
function injectSurveyUrl(html, surveyUrl) {
    if (!surveyUrl)
        return html;
    let out = html;
    // Replace bare placeholders first
    if (out.includes('{{surveyUrl}}')) {
        out = out.replaceAll('{{surveyUrl}}', surveyUrl);
    }
    if (out.includes('{{surveyurl}}')) {
        out = out.replaceAll('{{surveyurl}}', surveyUrl);
    }
    // Also handle older patterns like "http://{{surveyurl}}/" or "https://{{surveyurl}}"
    const fullRegex = /https?:\/\/\{\{surveyurl\}\}\/?/gi;
    if (fullRegex.test(out)) {
        out = out.replace(fullRegex, surveyUrl);
    }
    return out;
}
function injectRecipientIntoTrackingLinks(html, baseUrl, email) {
    const e = encodeURIComponent(String(email || '').trim().toLowerCase());
    if (!e)
        return html;
    // Add `e=` to any marketing redirect links so click tracking can be tied back to the recipient.
    // We intentionally do this during per-recipient personalization (after global wrapLinksWithTracking).
    // Examples:
    //  href="https://host/api/marketing/r/abc" -> href="https://host/api/marketing/r/abc?e=..."
    //  href="https://host/api/marketing/r/abc?x=1" -> href="https://host/api/marketing/r/abc?x=1&e=..."
    const base = baseUrl.replace(/\/$/, '');
    const re = new RegExp(`href="(${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/marketing/r/[^"\\s]+)"`, 'g');
    return html.replace(re, (_m, url) => {
        const u = String(url);
        if (u.includes('e='))
            return `href="${u}"`;
        const joiner = u.includes('?') ? '&' : '?';
        return `href="${u}${joiner}e=${e}"`;
    });
}
function injectPixel(html, pixelUrl) {
    const img = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;
    if (/(<\/body>)/i.test(html))
        return html.replace(/<\/body>/i, img + '</body>');
    return html + img;
}
/**
 * Automatically wraps all external links in HTML with tracking tokens
 * @param html - The HTML content to process
 * @param campaignId - The campaign ObjectId
 * @param db - Database connection
 * @param baseUrl - Base URL for tracking redirects
 * @returns Modified HTML with all links wrapped for tracking
 */
async function wrapLinksWithTracking(html, campaignId, db, baseUrl, campaignName) {
    // Find all <a href="..."> tags
    const linkRegex = /<a\s+([^>]*\s+)?href=["']([^"']+)["']([^>]*)>/gi;
    const matches = [...html.matchAll(linkRegex)];
    if (matches.length === 0)
        return html;
    // Track replacements to avoid double-processing
    const replacements = new Map();
    for (const match of matches) {
        const fullTag = match[0];
        const beforeHref = match[1] || '';
        const originalUrl = match[2];
        const afterHref = match[3] || '';
        // Skip if already a tracking link
        if (originalUrl.includes('/api/marketing/r/'))
            continue;
        // Skip unsubscribe and pixel tracking URLs
        if (originalUrl.includes('/api/marketing/unsubscribe') ||
            originalUrl.includes('/api/marketing/pixel.gif'))
            continue;
        // Skip relative URLs, anchors, mailto, tel, javascript, etc.
        if (originalUrl.startsWith('#') ||
            originalUrl.startsWith('mailto:') ||
            originalUrl.startsWith('tel:') ||
            originalUrl.startsWith('javascript:') ||
            originalUrl.startsWith('{{') || // Skip template variables
            !originalUrl.match(/^https?:\/\//i) // Only process absolute HTTP(S) URLs
        )
            continue;
        // Check if we already processed this URL
        if (replacements.has(originalUrl)) {
            const trackedUrl = replacements.get(originalUrl);
            const newTag = `<a ${beforeHref}href="${trackedUrl}"${afterHref}>`;
            html = html.replace(fullTag, newTag);
            continue;
        }
        // Create a tracking token for this link
        const token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
        const linkDoc = {
            token,
            campaignId,
            url: originalUrl,
            utmSource: 'email',
            utmMedium: 'campaign',
            utmCampaign: campaignName || campaignId.toHexString(),
            createdAt: new Date()
        };
        try {
            await db.collection('marketing_links').insertOne(linkDoc);
            const trackedUrl = `${baseUrl}/api/marketing/r/${token}`;
            replacements.set(originalUrl, trackedUrl);
            // Replace in HTML
            const newTag = `<a ${beforeHref}href="${trackedUrl}"${afterHref}>`;
            html = html.replace(fullTag, newTag);
        }
        catch (err) {
            console.error('Failed to create tracking link:', err);
            // Skip this link if we can't create tracking
            continue;
        }
    }
    return html;
}
// POST /api/marketing/campaigns/:id/send { dryRun?: boolean }
marketingSendRouter.post('/campaigns/:id/send', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const campaign = await db.collection('marketing_campaigns').findOne({ _id });
        if (!campaign)
            return res.status(404).json({ data: null, error: 'campaign_not_found' });
        if (!campaign.segmentId)
            return res.status(400).json({ data: null, error: 'missing_segment' });
        const segment = await db.collection('marketing_segments').findOne({ _id: campaign.segmentId });
        if (!segment)
            return res.status(404).json({ data: null, error: 'segment_not_found' });
        let html = String(campaign.html || '');
        const mjml = String(campaign.mjml || '');
        if (!html && mjml) {
            try {
                html = mjml2html(mjml, { validationLevel: 'soft' }).html;
            }
            catch { }
        }
        if (!html)
            return res.status(400).json({ data: null, error: 'missing_html' });
        const base = `${req.protocol}://${req.get('host')}`;
        // Automatically wrap all links with tracking tokens
        html = await wrapLinksWithTracking(html, _id, db, base, campaign.name || 'campaign');
        // Apply campaign font choice to the email HTML
        html = applyFontFamilyToHtml(html, campaign.fontFamily);
        const filter = buildFilterFromRules(Array.isArray(segment.rules) ? segment.rules : []);
        const recipients = await db
            .collection('contacts')
            .find(filter, { projection: { email: 1, name: 1 } })
            .limit(5000)
            .toArray();
        const directEmails = Array.isArray(segment?.emails) ? segment.emails : [];
        const emailSet = new Set();
        const finalList = [];
        for (const r of recipients) {
            const email = String(r.email || '').trim().toLowerCase();
            if (!email || emailSet.has(email))
                continue;
            emailSet.add(email);
            finalList.push({ email, name: r.name });
        }
        for (const e of directEmails) {
            const email = String(e || '').trim().toLowerCase();
            if (!email || emailSet.has(email))
                continue;
            emailSet.add(email);
            finalList.push({ email });
        }
        const unsubbed = await db.collection('marketing_unsubscribes').find({}).toArray();
        const unsubSet = new Set(unsubbed.map((u) => String(u.email).toLowerCase()));
        const dryRun = !!req.body?.dryRun;
        let total = 0;
        let skipped = 0;
        let sent = 0;
        let errors = 0;
        for (const r of finalList) {
            const email = String(r.email || '').trim();
            if (!email)
                continue;
            total++;
            if (unsubSet.has(email.toLowerCase())) {
                skipped++;
                continue;
            }
            const unsubscribeUrl = `${base}/api/marketing/unsubscribe?e=${encodeURIComponent(email)}&c=${_id.toHexString()}`;
            const pixelUrl = `${base}/api/marketing/pixel.gif?c=${_id.toHexString()}&e=${encodeURIComponent(email)}`;
            let surveyUrl;
            if (campaign.surveyProgramId) {
                const token = crypto.randomBytes(24).toString('hex');
                await db.collection('survey_links').insertOne({
                    token,
                    programId: campaign.surveyProgramId,
                    contactId: null,
                    campaignId: _id,
                    email,
                    createdAt: new Date(),
                });
                const origin = (env.ORIGIN || '').split(',')[0]?.trim() || base;
                const normalizedOrigin = origin.replace(/\/$/, '');
                surveyUrl = `${normalizedOrigin}/surveys/respond/${token}`;
            }
            let personalized = html;
            personalized = injectSurveyUrl(personalized, surveyUrl);
            personalized = injectUnsubscribe(personalized, unsubscribeUrl);
            personalized = injectPixel(personalized, pixelUrl);
            personalized = injectRecipientIntoTrackingLinks(personalized, base, email);
            if (dryRun)
                continue;
            try {
                await sendEmail({ to: email, subject: String(campaign.subject || campaign.name || ''), html: personalized });
                const sentAt = new Date();
                // Log to marketing_events (for campaign-specific tracking)
                await db.collection('marketing_events').insertOne({ event: 'sent', campaignId: _id, recipient: email, at: sentAt });
                // Also log to outreach_events (for unified outreach tracking)
                await db.collection('outreach_events').insertOne({
                    channel: 'email',
                    event: 'sent',
                    recipient: email,
                    variant: `campaign:${campaign.name || _id.toHexString()}`,
                    templateId: null,
                    sequenceId: null,
                    meta: { campaignId: _id.toHexString(), campaignName: campaign.name },
                    at: sentAt
                });
                sent++;
            }
            catch {
                errors++;
            }
        }
        res.json({ data: { total, skipped, sent, errors }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
