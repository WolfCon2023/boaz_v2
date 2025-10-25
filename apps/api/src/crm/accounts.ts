import { Router } from 'express'
import { getDb } from '../db.js'
import { z } from 'zod'

export const accountsRouter = Router()

accountsRouter.get('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20)))
  const items = await db.collection('accounts').find({}).sort({ name: 1 }).limit(limit).toArray()
  res.json({ data: { items }, error: null })
})

// DELETE /api/crm/accounts/:id
accountsRouter.delete('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const { ObjectId } = await import('mongodb')
    const _id = new ObjectId(req.params.id)
    await db.collection('accounts').deleteOne({ _id })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

accountsRouter.post('/', async (req, res) => {
  const opt = (schema: z.ZodTypeAny) =>
    z.preprocess((v) => {
      if (typeof v === 'string') {
        const t = v.trim()
        return t === '' ? undefined : t
      }
      return v
    }, schema.optional())
  const schema = z.object({
    name: z.string().trim().min(1),
    companyName: opt(z.string()),
    primaryContactName: opt(z.string()),
    primaryContactEmail: opt(z.string().email()),
    primaryContactPhone: opt(z.string()),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  // Generate accountNumber starting at 998801
  let accountNumber: number | undefined
  try {
    const { getNextSequence } = await import('../db.js')
    accountNumber = await getNextSequence('accountNumber')
  } catch {}
  const doc = { ...parsed.data, accountNumber }
  const result = await db.collection('accounts').insertOne(doc)
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})

// PUT /api/crm/accounts/:id
accountsRouter.put('/:id', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    companyName: z.string().optional(),
    primaryContactName: z.string().optional(),
    primaryContactEmail: z.string().email().optional(),
    primaryContactPhone: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const { ObjectId } = await import('mongodb')
    const _id = new ObjectId(req.params.id)
    await db.collection('accounts').updateOne({ _id }, { $set: parsed.data })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})


