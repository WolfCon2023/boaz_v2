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
  const emails = Array.isArray(raw.emails) ? raw.emails.filter((e: any) => typeof e === 'string' && e.includes('@')) : []
  const doc = { name, description: String(raw.description || ''), rules, emails, createdAt: new Date(), updatedAt: new Date() }
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
    if (Array.isArray(req.body?.emails)) update.emails = req.body.emails.filter((e: any) => typeof e === 'string' && e.includes('@'))
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

// GET /api/marketing/segments/:id/preview — returns first 50 matching contacts and count
marketingSegmentsRouter.get('/segments/:id/preview', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { total: 0, contacts: [] }, error: null })
  try {
    const _id = new ObjectId(req.params.id)
    const seg = await db.collection('marketing_segments').findOne({ _id }) as any
    const rules: any[] = Array.isArray(seg?.rules) ? seg.rules : []
    const directEmails: string[] = Array.isArray(seg?.emails) ? seg.emails : []
    const ands: any[] = []
    for (const r of rules) {
      const field = typeof r?.field === 'string' ? r.field : ''
      const operator = typeof r?.operator === 'string' ? r.operator : 'contains'
      const value = typeof r?.value === 'string' ? r.value : ''
      if (!field || !value) continue
      if (operator === 'equals') ands.push({ [field]: value })
      else if (operator === 'startsWith') ands.push({ [field]: { $regex: `^${value}`, $options: 'i' } })
      else ands.push({ [field]: { $regex: value, $options: 'i' } })
    }
    const filter = ands.length ? { $and: ands } : {}
    const coll = db.collection('contacts')
    const totalContacts = await coll.countDocuments(filter)
    const contacts = await coll.find(filter, { projection: { name: 1, email: 1 } as any }).limit(50).toArray()
    res.json({ data: { total: totalContacts + directEmails.length, contacts, directEmails: directEmails.slice(0, 50) }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})


