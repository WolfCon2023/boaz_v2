import { Router } from 'express'
import { getDb } from '../db.js'

export const outreachSchedulerRouter = Router()

// POST /api/crm/outreach/scheduler/run
outreachSchedulerRouter.post('/run', async (_req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const sequences = await db.collection('outreach_sequences').find({}).toArray()
  const seqMap = new Map(sequences.map((s: any) => [String(s._id), s]))
  const now = new Date()
  const enrollments = await db.collection('outreach_enrollments').find({ completedAt: null }).toArray()
  let processed = 0
  for (const en of enrollments as any[]) {
    const seq = seqMap.get(String(en.sequenceId))
    if (!seq || !Array.isArray(seq.steps)) continue
    const nextIndex = Number(en.lastStepIndex ?? -1) + 1
    if (nextIndex >= seq.steps.length) {
      await db.collection('outreach_enrollments').updateOne({ _id: en._id }, { $set: { completedAt: now } })
      continue
    }
    const step = seq.steps[nextIndex]
    const due = new Date(en.startedAt)
    due.setDate(due.getDate() + Number(step.dayOffset ?? 0))
    if (due <= now) {
      const contact = await db.collection('contacts').findOne({ _id: en.contactId })
      if (step.channel === 'sms') {
        await db.collection('outreach_events').insertOne({ channel: 'sms', event: 'sent', recipient: contact?.mobilePhone ?? contact?.officePhone ?? null, at: now })
      } else {
        await db.collection('outreach_events').insertOne({ channel: 'email', event: 'sent', recipient: contact?.email ?? null, at: now })
      }
      await db.collection('outreach_enrollments').updateOne({ _id: en._id }, { $set: { lastStepIndex: nextIndex } })
      processed++
    }
  }
  res.json({ data: { processed }, error: null })
})


