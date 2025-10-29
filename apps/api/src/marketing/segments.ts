import { Router } from 'express'
import { ObjectId, Sort } from 'mongodb'
import { getDb } from '../db.js'

export const marketingSegmentsRouter = Router()

// GET /api/marketing/segments?q=&sort=&dir=
marketingSegmentsRouter.get('/segments', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  const q = String((req.query.q as string) ?? '').trim()
  const dir = ((req.query.dir as string) ?? 'desc').toLowerCase() === 'asc' ? 1 : -1
  const sortKey = (req.query.sort as string) ?? 'updatedAt'
  const sort: Sort = { [sortKey]: dir as 1 | -1 }
  const filter: any = {}
  if (q) filter.$or = [{ name: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }]
  const items = await db.collection('marketing_segments').find(filter).sort(sort).limit(200).toArray()
  res.json({ data: { items }, error: null })
})

// POST /api/marketing/segments
marketingSegmentsRouter.post('/segments', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const rules = Array.isArray(raw.rules) ? raw.rules : []
  if (!name) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const doc = { name, description: String(raw.description || ''), rules, createdAt: new Date(), updatedAt: new Date() }
  const r = await db.collection('marketing_segments').insertOne(doc)
  res.status(201).json({ data: { _id: r.insertedId, ...doc }, error: null })
})

// PUT /api/marketing/segments/:id
marketingSegmentsRouter.put('/segments/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const update: any = { updatedAt: new Date() }
    if (typeof req.body?.name === 'string') update.name = req.body.name
    if (typeof req.body?.description === 'string') update.description = req.body.description
    if (Array.isArray(req.body?.rules)) update.rules = req.body.rules
    await db.collection('marketing_segments').updateOne({ _id }, { $set: update })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// DELETE /api/marketing/segments/:id
marketingSegmentsRouter.delete('/segments/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    await db.collection('marketing_segments').deleteOne({ _id })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})


