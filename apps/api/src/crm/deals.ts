import { Router } from 'express'
import { getDb } from '../db.js'
import { z } from 'zod'
import { ObjectId } from 'mongodb'

export const dealsRouter = Router()

dealsRouter.get('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20)))
  const items = await db.collection('deals').find({}).sort({ closeDate: -1 }).limit(limit).toArray()
  res.json({ data: { items }, error: null })
})

dealsRouter.post('/', async (req, res) => {
  const schema = z.object({
    title: z.string().min(1),
    accountId: z.string().min(1),
    amount: z.number().optional(),
    stage: z.string().optional(),
    closeDate: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const payload = parsed.data
  const doc: any = {
    title: payload.title,
    accountId: new ObjectId(payload.accountId),
    amount: payload.amount,
    stage: payload.stage ?? 'new',
  }
  if (payload.closeDate) doc.closeDate = new Date(payload.closeDate)
  const result = await db.collection('deals').insertOne(doc)
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})

// PATCH /api/crm/deals/:id/stage
dealsRouter.patch('/:id/stage', async (req, res) => {
  const schema = z.object({ stage: z.string().min(1) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    await db.collection('deals').updateOne({ _id }, { $set: { stage: parsed.data.stage } })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})


