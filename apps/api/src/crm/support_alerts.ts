import { Router } from 'express'
import { getDb } from '../db.js'
import { sendEmail } from '../alerts/mail.js'
import { env } from '../env.js'

export const supportAlertsRouter = Router()

// POST /api/crm/support/alerts/run
// Scans for breached or soon-due tickets and sends emails. Use Railway cron or manual trigger.
supportAlertsRouter.post('/alerts/run', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const withinMin = env.SLA_ALERT_WITHIN_MIN ?? 60
  const cooldownMin = env.SLA_ALERT_COOLDOWN_MIN ?? 360
  const now = new Date()
  const until = new Date(now.getTime() + withinMin * 60 * 1000)
  const cooldownSince = new Date(now.getTime() - cooldownMin * 60 * 1000)
  const coll = db.collection<any>('support_tickets')

  const candidates = await coll
    .find({
      status: { $in: ['open', 'pending'] },
      $or: [
        { slaDueAt: { $ne: null, $lt: now } },
        { slaDueAt: { $ne: null, $gte: now, $lte: until } },
      ],
      $orIgnoreCooldown: [{ lastSlaAlertAt: { $exists: false } }, { lastSlaAlertAt: { $lt: cooldownSince } }],
    } as any)
    .limit(200)
    .toArray()

  let sent = 0
  for (const t of candidates) {
    try {
      const to = env.ALERT_TO || env.SMTP_USER
      if (!to) continue
      const due = t.slaDueAt ? new Date(t.slaDueAt).toLocaleString() : 'N/A'
      const subject = t.slaDueAt && new Date(t.slaDueAt) < now
        ? `SLA BREACHED: Ticket #${t.ticketNumber} ${t.shortDescription || ''}`
        : `SLA Due Soon: Ticket #${t.ticketNumber} ${t.shortDescription || ''}`
      const body = `Ticket #${t.ticketNumber}\nStatus: ${t.status}\nPriority: ${t.priority}\nAssignee: ${t.assignee || '-'}\nSLA Due: ${due}\n\n${t.description || ''}`
      await sendEmail({ to, subject, text: body })
      await coll.updateOne({ _id: t._id }, { $set: { lastSlaAlertAt: new Date() } })
      sent++
    } catch (_e) {
      // continue
    }
  }
  res.json({ data: { sent, candidates: candidates.length }, error: null })
})


