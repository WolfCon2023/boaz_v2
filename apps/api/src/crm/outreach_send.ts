import { Router } from 'express'
import multer, { FileFilterCallback } from 'multer'
import fs from 'fs'
import path from 'path'
import { getDb } from '../db.js'
import { env } from '../env.js'
import { requireAuth } from '../auth/rbac.js'
import { sendAuthEmail } from '../auth/email.js'

export const outreachSendRouter = Router()

// Setup multer for file uploads
const uploadDir = env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req: any, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => cb(null, uploadDir),
  filename: (_req: any, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')
    const ts = Date.now()
    cb(null, `${ts}-${safe}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (_req: any, file: Express.Multer.File, cb: FileFilterCallback) => {
    // Allow most file types for email attachments
    cb(null, true)
  },
})

// POST /api/crm/outreach/send/email { to, subject, text, html, variant } + file attachment
outreachSendRouter.post('/email', requireAuth, upload.single('attachment'), async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  const { to, subject, text, html, variant } = req.body ?? {}
  if (!to || !(subject || text || html)) return res.status(400).json({ data: null, error: 'invalid_payload' })
  
  const file = (req as any).file as Express.Multer.File | undefined
  let attachment: { filename: string; content: Buffer; contentType?: string } | undefined
  
  // Process attachment if provided
  if (file) {
    try {
      const fileContent = fs.readFileSync(file.path)
      attachment = {
        filename: file.originalname,
        content: fileContent,
        contentType: file.mimetype,
      }
      // Clean up temp file after reading
      fs.unlinkSync(file.path)
    } catch (err) {
      console.error('Error reading attachment file:', err)
      // Continue without attachment if file read fails
    }
  }
  
  // Log sent event immediately (before attempting to send)
  try {
    await db.collection('outreach_events').insertOne({ 
      channel: 'email', 
      event: 'sent', 
      recipient: to, 
      variant: variant ?? null, 
      at: new Date() 
    })
    console.log(`[Outreach] Logged 'sent' event for ${to}`)
  } catch (err) {
    console.error('[Outreach] Failed to log sent event:', err)
  }
  
  // Use the same email sending function as the rest of the app (supports SendGrid, Mailgun, SMTP)
  try {
    const result = await sendAuthEmail({
      to,
      subject: subject || 'Message',
      text: text || undefined,
      html: html || undefined,
      attachments: attachment ? [attachment] : undefined,
      checkPreferences: false, // Don't check preferences for one-off emails
    })
    
    if (result.sent) {
      return res.status(200).json({ data: { queued: true, provider: result.provider || 'unknown' }, error: null })
    } else {
      return res.status(500).json({ data: null, error: result.reason || 'email_send_failed', details: { provider: result.provider } })
    }
  } catch (e: any) {
    console.error('Email send error:', e)
    return res.status(500).json({ data: null, error: 'email_send_error', details: e.message })
  }
})

// POST /api/crm/outreach/send/sms { to, text }
outreachSendRouter.post('/sms', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const { to, text } = req.body ?? {}
  if (!to || !text) return res.status(400).json({ data: null, error: 'invalid_payload' })
  // Log sent event immediately (before attempting to send)
  try {
    await db.collection('outreach_events').insertOne({ 
      channel: 'sms', 
      event: 'sent', 
      recipient: to, 
      at: new Date() 
    })
    console.log(`[Outreach] Logged 'sent' event for SMS to ${to}`)
  } catch (err) {
    console.error('[Outreach] Failed to log SMS sent event:', err)
  }
  try {
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) {
      const form = new URLSearchParams({
        To: to,
        From: env.TWILIO_FROM_NUMBER,
        Body: text,
      })
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      })
      const body = await r.text()
      return res.status(202).json({ data: { queued: r.ok, provider: 'twilio', status: r.status, body }, error: null })
    }
    return res.status(202).json({ data: { queued: true, provider: 'none' }, error: null })
  } catch {
    return res.status(202).json({ data: { queued: false, error: 'provider_error' }, error: null })
  }
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
  if (docs.length) {
    await db.collection('outreach_events').insertMany(docs)
    console.log(`[Outreach Webhook] Logged ${docs.length} SendGrid events`)
  }
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
  if (out) {
    await db.collection('outreach_events').insertOne({ channel: 'email', event: out, recipient: e?.recipient || e?.message?.headers?.to, at: e?.timestamp ? new Date(e.timestamp * 1000) : new Date() })
    console.log(`[Outreach Webhook] Logged Mailgun '${out}' event for ${e?.recipient || e?.message?.headers?.to}`)
  }
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
  if (out && to) {
    await db.collection('outreach_events').insertOne({ channel: 'sms', event: out, recipient: to, at: new Date() })
    console.log(`[Outreach Webhook] Logged Twilio '${out}' event for SMS to ${to}`)
  }
  res.json({ ok: true })
})


