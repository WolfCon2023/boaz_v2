import { Router } from 'express'
import { getDb } from '../db.js'
import { ObjectId, Sort } from 'mongodb'

export const supportTicketsRouter = Router()

type TicketComment = { author: any; body: string; at: Date }
type TicketDoc = {
  _id?: ObjectId
  ticketNumber?: number
  title: string
  description: string
  status: string
  priority: string
  accountId: ObjectId | null
  contactId: ObjectId | null
  assignee: any
  slaDueAt: Date | null
  comments: TicketComment[]
  createdAt: Date
  updatedAt: Date
}

// GET /api/crm/support/tickets?q=&status=&priority=&accountId=&contactId=&sort=&dir=
supportTicketsRouter.get('/tickets', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  const q = String((req.query.q as string) ?? '').trim()
  const status = String((req.query.status as string) ?? '')
  const priority = String((req.query.priority as string) ?? '')
  const accountId = String((req.query.accountId as string) ?? '')
  const contactId = String((req.query.contactId as string) ?? '')
  const dir = ((req.query.dir as string) ?? 'desc').toLowerCase() === 'asc' ? 1 : -1
  const sortKey = (req.query.sort as string) ?? 'createdAt'
  const sort: Sort = { [sortKey]: dir as 1 | -1 }
  const filter: any = {}
  if (q) filter.$or = [{ title: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }]
  if (status) filter.status = status
  if (priority) filter.priority = priority
  if (ObjectId.isValid(accountId)) filter.accountId = new ObjectId(accountId)
  if (ObjectId.isValid(contactId)) filter.contactId = new ObjectId(contactId)
  const items = await db.collection<TicketDoc>('support_tickets').find(filter).sort(sort).limit(200).toArray()
  res.json({ data: { items }, error: null })
})

// POST /api/crm/support/tickets
supportTicketsRouter.post('/tickets', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const raw = req.body ?? {}
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    if (!title) return res.status(400).json({ data: null, error: 'invalid_payload' })
    const doc: TicketDoc = {
      title,
      description: typeof raw.description === 'string' ? raw.description : '',
      status: (raw.status as string) || 'open',
      priority: (raw.priority as string) || 'normal',
      accountId: ObjectId.isValid(raw.accountId) ? new ObjectId(raw.accountId) : null,
      contactId: ObjectId.isValid(raw.contactId) ? new ObjectId(raw.contactId) : null,
      assignee: (raw.assignee as any) || null,
      slaDueAt: raw.slaDueAt ? new Date(raw.slaDueAt) : null,
      comments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    try {
      const { getNextSequence } = await import('../db.js')
      doc.ticketNumber = await getNextSequence('ticketNumber')
    } catch {}
    if (doc.ticketNumber == null) doc.ticketNumber = 200001
    const result = await db.collection<TicketDoc>('support_tickets').insertOne(doc)
    return res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
  } catch (err: any) {
    console.error('create_ticket_error', err)
    if (err && typeof err === 'object' && 'code' in err && (err as any).code === 11000) {
      return res.status(409).json({ data: null, error: 'duplicate_ticketNumber' })
    }
    return res.status(500).json({ data: null, error: 'insert_failed' })
  }
})

// PUT /api/crm/support/tickets/:id
supportTicketsRouter.put('/tickets/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const update: any = { updatedAt: new Date() }
    for (const k of ['title','description','status','priority','assignee']) if (typeof (req.body ?? {})[k] === 'string') update[k] = (req.body as any)[k]
    if (req.body?.slaDueAt) update.slaDueAt = new Date(req.body.slaDueAt)
    if (req.body?.accountId && ObjectId.isValid(req.body.accountId)) update.accountId = new ObjectId(req.body.accountId)
    if (req.body?.contactId && ObjectId.isValid(req.body.contactId)) update.contactId = new ObjectId(req.body.contactId)
    await db.collection<TicketDoc>('support_tickets').updateOne({ _id }, { $set: update })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// POST /api/crm/support/tickets/:id/comments { author, body }
supportTicketsRouter.post('/tickets/:id/comments', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const comment = { author: (req.body?.author || 'system'), body: String(req.body?.body || ''), at: new Date() }
    await db.collection<TicketDoc>('support_tickets').updateOne(
      { _id },
      { $push: { comments: comment as TicketComment }, $set: { updatedAt: new Date() } }
    )
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})


