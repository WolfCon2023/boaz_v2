import { Router } from 'express'
import { getDb } from '../db.js'
import { ObjectId, Sort } from 'mongodb'

export const kbRouter = Router()

// GET /api/crm/support/kb?q=&tag=&sort=&dir=
kbRouter.get('/kb', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  const q = String((req.query.q as string) ?? '').trim()
  const tag = String((req.query.tag as string) ?? '')
  const dir = ((req.query.dir as string) ?? 'desc').toLowerCase() === 'asc' ? 1 : -1
  const sortKey = (req.query.sort as string) ?? 'updatedAt'
  const sort: Sort = { [sortKey]: dir as 1 | -1 }
  const filter: any = {}
  if (q) filter.$or = [{ title: { $regex: q, $options: 'i' } }, { body: { $regex: q, $options: 'i' } }]
  if (tag) filter.tags = tag
  const items = await db.collection('kb_articles').find(filter).sort(sort).limit(200).toArray()
  res.json({ data: { items }, error: null })
})

// POST /api/crm/support/kb
kbRouter.post('/kb', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const body = typeof raw.body === 'string' ? raw.body : ''
  const tags = Array.isArray(raw.tags) ? raw.tags : []
  if (!title || !body) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const doc = { title, body, tags, createdAt: new Date(), updatedAt: new Date(), author: raw.author || 'system' }
  const r = await db.collection('kb_articles').insertOne(doc)
  res.status(201).json({ data: { _id: r.insertedId, ...doc }, error: null })
})

// PUT /api/crm/support/kb/:id
kbRouter.put('/kb/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const update: any = { updatedAt: new Date() }
    if (typeof req.body?.title === 'string') update.title = req.body.title
    if (typeof req.body?.body === 'string') update.body = req.body.body
    if (Array.isArray(req.body?.tags)) update.tags = req.body.tags
    await db.collection('kb_articles').updateOne({ _id }, { $set: update })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})


