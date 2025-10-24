import { Router } from 'express'
import { getDb } from '../db.js'

export const accountsRouter = Router()

accountsRouter.get('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20)))
  const items = await db.collection('accounts').find({}).sort({ name: 1 }).limit(limit).toArray()
  res.json({ data: { items }, error: null })
})


