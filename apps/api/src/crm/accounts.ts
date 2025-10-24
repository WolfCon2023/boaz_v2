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

accountsRouter.post('/', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    companyName: z.string().optional(),
    primaryContactName: z.string().optional(),
    primaryContactEmail: z.string().email().optional(),
    primaryContactPhone: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
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


