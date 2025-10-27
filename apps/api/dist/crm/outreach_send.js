import { Router } from 'express';
import { getDb } from '../db.js';
import { env } from '../env.js';
export const outreachSendRouter = Router();
// POST /api/crm/outreach/send/email { to, subject, text, html, variant }
outreachSendRouter.post('/email', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const { to, subject, text, html, variant } = req.body ?? {};
    if (!to || !(subject || text || html))
        return res.status(400).json({ data: null, error: 'invalid_payload' });
    try {
        // Log sent event immediately
        await db.collection('outreach_events').insertOne({ channel: 'email', event: 'sent', recipient: to, variant: variant ?? null, at: new Date() });
    }
    catch { }
    // Provider: SendGrid first, else Mailgun, else accept without external send
    try {
        if (env.SENDGRID_API_KEY && env.OUTBOUND_EMAIL_FROM) {
            const sgPayload = {
                personalizations: [{ to: [{ email: to }] }],
                from: { email: env.OUTBOUND_EMAIL_FROM },
                subject: subject ?? undefined,
                content: [
                    html ? { type: 'text/html', value: String(html) } : undefined,
                    text ? { type: 'text/plain', value: String(text) } : undefined,
                ].filter(Boolean),
            };
            const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(sgPayload),
            });
            if (!r.ok) {
                const body = await r.text();
                return res.status(202).json({ data: { queued: false, provider: 'sendgrid', status: r.status, body }, error: null });
            }
            return res.status(202).json({ data: { queued: true, provider: 'sendgrid' }, error: null });
        }
        if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN && env.OUTBOUND_EMAIL_FROM) {
            const form = new URLSearchParams({
                to,
                from: env.OUTBOUND_EMAIL_FROM,
                subject: subject || '',
                text: text || '',
                html: html || '',
            });
            const r = await fetch(`https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`, {
                method: 'POST',
                headers: {
                    Authorization: 'Basic ' + Buffer.from('api:' + env.MAILGUN_API_KEY).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: form.toString(),
            });
            const body = await r.text();
            return res.status(202).json({ data: { queued: r.ok, provider: 'mailgun', status: r.status, body }, error: null });
        }
        return res.status(202).json({ data: { queued: true, provider: 'none' }, error: null });
    }
    catch (e) {
        return res.status(202).json({ data: { queued: false, error: 'provider_error' }, error: null });
    }
});
// POST /api/crm/outreach/send/sms { to, text }
outreachSendRouter.post('/sms', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const { to, text } = req.body ?? {};
    if (!to || !text)
        return res.status(400).json({ data: null, error: 'invalid_payload' });
    try {
        await db.collection('outreach_events').insertOne({ channel: 'sms', event: 'sent', recipient: to, at: new Date() });
    }
    catch { }
    try {
        if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) {
            const form = new URLSearchParams({
                To: to,
                From: env.TWILIO_FROM_NUMBER,
                Body: text,
            });
            const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
                method: 'POST',
                headers: {
                    Authorization: 'Basic ' + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: form.toString(),
            });
            const body = await r.text();
            return res.status(202).json({ data: { queued: r.ok, provider: 'twilio', status: r.status, body }, error: null });
        }
        return res.status(202).json({ data: { queued: true, provider: 'none' }, error: null });
    }
    catch {
        return res.status(202).json({ data: { queued: false, error: 'provider_error' }, error: null });
    }
});
// Webhooks
// POST /api/crm/outreach/webhook/sendgrid
outreachSendRouter.post('/webhook/sendgrid', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const events = Array.isArray(req.body) ? req.body : [];
    const allowed = new Set(['delivered', 'open', 'click', 'bounce', 'spamreport', 'unsubscribe']);
    const map = { delivered: 'delivered', open: 'opened', click: 'clicked', bounce: 'bounced', spamreport: 'spam', unsubscribe: 'unsubscribed' };
    const docs = events
        .filter((e) => e && allowed.has(e.event))
        .map((e) => ({ channel: 'email', event: map[e.event], recipient: e.email, variant: e.variant ?? null, at: e.timestamp ? new Date(e.timestamp * 1000) : new Date() }));
    if (docs.length)
        await db.collection('outreach_events').insertMany(docs);
    res.json({ ok: true });
});
// POST /api/crm/outreach/webhook/mailgun
outreachSendRouter.post('/webhook/mailgun', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const e = req.body?.eventData || req.body;
    const map = { delivered: 'delivered', opened: 'opened', clicked: 'clicked', bounced: 'bounced', complained: 'spam', unsubscribed: 'unsubscribed' };
    const type = e?.event || e?.eventName;
    const out = map[type];
    if (out)
        await db.collection('outreach_events').insertOne({ channel: 'email', event: out, recipient: e?.recipient || e?.message?.headers?.to, at: e?.timestamp ? new Date(e.timestamp * 1000) : new Date() });
    res.json({ ok: true });
});
// POST /api/crm/outreach/webhook/twilio
outreachSendRouter.post('/webhook/twilio', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const status = String(req.body?.MessageStatus || req.body?.SmsStatus || '').toLowerCase();
    const to = req.body?.To || req.body?.to;
    const map = { delivered: 'delivered', sent: 'sent', failed: 'bounced' };
    const out = map[status];
    if (out && to)
        await db.collection('outreach_events').insertOne({ channel: 'sms', event: out, recipient: to, at: new Date() });
    res.json({ ok: true });
});
