import { Router } from 'express'
import { getDb } from '../db.js'
import { ObjectId } from 'mongodb'
import { z } from 'zod'

export const crmRouter = Router()

// GET /api/crm/contacts?q=&cursor=&limit=&page=
crmRouter.get('/contacts', async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.json({ data: { items: [], nextCursor: null }, error: null })

    const { q, cursor } = req.query as { q?: string; cursor?: string }
    const page = Math.max(0, Number((req.query as any).page ?? 0))
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 25)))

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

    let items: any[] = []
    let nextCursor: string | null = null
    if (cursor) {
      items = await db
        .collection('contacts')
        .find(filter)
        .project({ name: 1, email: 1, company: 1, mobilePhone: 1, officePhone: 1, isPrimary: 1, primaryPhone: 1 })
        .sort({ _id: 1 })
        .limit(limit)
        .toArray()
      nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null
      res.json({ data: { items, nextCursor }, error: null })
      return
    }

    const total = await db.collection('contacts').countDocuments(filter)
    items = await db
      .collection('contacts')
      .find(filter)
      .project({ name: 1, email: 1, company: 1, mobilePhone: 1, officePhone: 1, isPrimary: 1, primaryPhone: 1 })
      .sort({ _id: 1 })
      .skip(page * limit)
      .limit(limit)
      .toArray()

    res.json({ data: { items, page, pageSize: limit, total }, error: null })
  } catch (e) {
    res.status(500).json({ data: null, error: 'contacts_error' })
  }
})

// POST /api/crm/contacts
crmRouter.post('/contacts', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    company: z.string().optional(),
    email: z.string().email().optional(),
    mobilePhone: z.string().optional(),
    officePhone: z.string().optional(),
    isPrimary: z.boolean().optional(),
    primaryPhone: z.enum(['mobile', 'office']).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const { name, company, email, mobilePhone, officePhone, isPrimary, primaryPhone } = parsed.data
  const doc: any = { name, company, email, mobilePhone, officePhone, isPrimary: Boolean(isPrimary), primaryPhone }
  const result = await db.collection('contacts').insertOne(doc)
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})

// PUT /api/crm/contacts/:id
crmRouter.put('/contacts/:id', async (req, res) => {
  const base = z.object({
    name: z.string().min(1).optional(),
    company: z.string().optional(),
    email: z.string().email().optional(),
    mobilePhone: z.string().optional(),
    officePhone: z.string().optional(),
    isPrimary: z.boolean().optional(),
    primaryPhone: z.enum(['mobile', 'office']).optional(),
  })
  const parsed = base.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const update: any = parsed.data
    await db.collection('contacts').updateOne({ _id }, { $set: update })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// DELETE /api/crm/contacts/:id
crmRouter.delete('/contacts/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    await db.collection('contacts').deleteOne({ _id })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})


