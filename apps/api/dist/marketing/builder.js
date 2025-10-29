import { Router } from 'express';
import mjml2html from 'mjml';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { sendEmail } from '../alerts/mail.js';
export const marketingBuilderRouter = Router();
// POST /api/marketing/mjml/preview { mjml }
marketingBuilderRouter.post('/mjml/preview', async (req, res) => {
    const source = String(req.body?.mjml || '');
    try {
        const { html, errors } = mjml2html(source, { keepComments: false, validationLevel: 'soft' });
        return res.json({ data: { html, errors: errors || [] }, error: null });
    }
    catch (e) {
        return res.status(400).json({ data: null, error: 'mjml_render_failed' });
    }
});
// POST /api/marketing/campaigns/:id/test-send { to, subject?, mjml?, html? }
marketingBuilderRouter.post('/campaigns/:id/test-send', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const campaign = await db.collection('marketing_campaigns').findOne({ _id });
        if (!campaign)
            return res.status(404).json({ data: null, error: 'campaign_not_found' });
        const to = String(req.body?.to || '');
        if (!to)
            return res.status(400).json({ data: null, error: 'missing_to' });
        const subject = String(req.body?.subject || campaign.subject || campaign.name || 'Test Email');
        let html = String(req.body?.html || '');
        const mjml = String(req.body?.mjml || '');
        if (!html && mjml) {
            try {
                html = mjml2html(mjml, { validationLevel: 'soft' }).html;
            }
            catch { }
        }
        if (!html)
            html = String(campaign.html || '');
        if (!html)
            return res.status(400).json({ data: null, error: 'no_html' });
        await sendEmail({ to, subject, html });
        return res.status(200).json({ data: { ok: true }, error: null });
    }
    catch {
        return res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
