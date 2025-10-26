import { Router } from 'express'
import { getDb } from '../db.js'
import { env } from '../env.js'

export const outreachSendRouter = Router()

// POST /api/crm/outreach/send/email { to, subject, text, html, variant }
outreachSendRouter.post('/email', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const { to, subject, text, html, variant } = req.body ?? {}
  if (!to || !(subject || text || html)) return res.status(400).json({ data: null, error: 'invalid_payload' })
  try {
    // Log sent event immediately
    await db.collection('outreach_events').insertOne({ channel: 'email', event: 'sent', recipient: to, variant: variant ?? null, at: new Date() })
  } catch {}
  // Integrate with provider (SendGrid/Mailgun) — stubbed for now
  // If SENDGRID_API_KEY present, you could call @sendgrid/mail here
  // If MAILGUN_API_KEY/DOMAIN present, call Mailgun REST here
  res.status(202).json({ data: { queued: true }, error: null })
})

// POST /api/crm/outreach/send/sms { to, text }
outreachSendRouter.post('/sms', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const { to, text } = req.body ?? {}
  if (!to || !text) return res.status(400).json({ data: null, error: 'invalid_payload' })
  try {
    await db.collection('outreach_events').insertOne({ channel: 'sms', event: 'sent', recipient: to, at: new Date() })
  } catch {}
  // Integrate with Twilio here if creds exist
  res.status(202).json({ data: { queued: true }, error: null })
})

// Webhooks
// POST /api/crm/outreach/webhook/sendgrid
outreachSendRouter.post('/webhook/sendgrid', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const events = Array.isArray(req.body) ? req.body : []
  const allowed = new Set(['delivered','open','click','bounce','spamreport','unsubscribe'])
  const map: Record<string, string> = { delivered: 'delivered', open: 'opened', click: 'clicked', bounce: 'bounced', spamreport: 'spam', unsubscribe: 'unsubscribed' }
  const docs = events
    .filter((e: any) => e && allowed.has(e.event))
    .map((e: any) => ({ channel: 'email', event: map[e.event], recipient: e.email, variant: e.variant ?? null, at: e.timestamp ? new Date(e.timestamp * 1000) : new Date() }))
  if (docs.length) await db.collection('outreach_events').insertMany(docs)
  res.json({ ok: true })
})

// POST /api/crm/outreach/webhook/mailgun
outreachSendRouter.post('/webhook/mailgun', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const e = req.body?.eventData || req.body
  const map: Record<string, string> = { delivered: 'delivered', opened: 'opened', clicked: 'clicked', bounced: 'bounced', complained: 'spam', unsubscribed: 'unsubscribed' }
  const type = e?.event || e?.eventName
  const out = map[type]
  if (out) await db.collection('outreach_events').insertOne({ channel: 'email', event: out, recipient: e?.recipient || e?.message?.headers?.to, at: e?.timestamp ? new Date(e.timestamp * 1000) : new Date() })
  res.json({ ok: true })
})

// POST /api/crm/outreach/webhook/twilio
outreachSendRouter.post('/webhook/twilio', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const status = String(req.body?.MessageStatus || req.body?.SmsStatus || '').toLowerCase()
  const to = req.body?.To || req.body?.to
  const map: Record<string, string> = { delivered: 'delivered', sent: 'sent', failed: 'bounced' }
  const out = map[status]
  if (out && to) await db.collection('outreach_events').insertOne({ channel: 'sms', event: out, recipient: to, at: new Date() })
  res.json({ ok: true })
})


