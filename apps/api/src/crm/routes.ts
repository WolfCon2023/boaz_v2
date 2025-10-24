import { Router } from 'express'
import { getDb } from '../db.js'
import { ObjectId } from 'mongodb'
import { z } from 'zod'

export const crmRouter = Router()

// GET /api/crm/contacts?q=&cursor=&limit=
crmRouter.get('/contacts', async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.json({ data: { items: [], nextCursor: null }, error: null })

    const { q, cursor } = req.query as { q?: string; cursor?: string }
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20)))

    const filter: Record<string, unknown> = {}
    if (q && q.trim()) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ]
    }
    if (cursor) {
      try {
        filter._id = { $gt: new ObjectId(cursor) }
      } catch {
        // ignore bad cursor
      }
    }

    const items = await db
      .collection('contacts')
      .find(filter)
      .project({ name: 1, email: 1, company: 1 })
      .sort({ _id: 1 })
      .limit(limit)
      .toArray()

    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null
    res.json({ data: { items, nextCursor }, error: null })
  } catch (e) {
    res.status(500).json({ data: null, error: 'contacts_error' })
  }
})

// POST /api/crm/contacts
crmRouter.post('/contacts', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    company: z.string().optional(),
    primaryContactName: z.string().optional(),
    primaryContactEmail: z.string().email().optional(),
    primaryContactPhone: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const { name, company, primaryContactName, primaryContactEmail, primaryContactPhone } = parsed.data
  const doc: any = { name, company, primaryContactName, primaryContactEmail, primaryContactPhone }
  const result = await db.collection('contacts').insertOne(doc)
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})


