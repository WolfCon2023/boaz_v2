import { Router } from 'express'
import { getDb, getNextSequence } from '../db.js'
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
      doc.ticketNumber = await getNextSequence('ticketNumber')
    } catch {}
    if (doc.ticketNumber == null) doc.ticketNumber = 200001

    const coll = db.collection<TicketDoc>('support_tickets')
    try {
      const result = await coll.insertOne(doc)
      return res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
    } catch (e1: any) {
      // Retry on duplicate ticketNumber by fetching a new sequence
      if (e1 && typeof e1 === 'object' && 'code' in e1 && e1.code === 11000) {
        try {
          doc.ticketNumber = await getNextSequence('ticketNumber')
          const r2 = await coll.insertOne(doc)
          return res.status(201).json({ data: { _id: r2.insertedId, ...doc }, error: null })
        } catch (e2: any) {
          if (!(e2 && typeof e2 === 'object' && 'code' in e2 && e2.code === 11000)) throw e2
          // Align counter to current max then try once more
          const max = await coll.find({}, { projection: { ticketNumber: 1 } as any }).sort({ ticketNumber: -1 } as any).limit(1).toArray()
          const maxNum = max[0]?.ticketNumber ?? 200000
          await db.collection<{ _id: string; seq: number }>('counters').updateOne(
            { _id: 'ticketNumber' },
            { $set: { seq: maxNum } },
            { upsert: true }
          )
          try {
            doc.ticketNumber = await getNextSequence('ticketNumber')
            const r3 = await coll.insertOne(doc)
            return res.status(201).json({ data: { _id: r3.insertedId, ...doc }, error: null })
          } catch (e3: any) {
            if (e3 && typeof e3 === 'object' && 'code' in e3 && e3.code === 11000) {
              return res.status(409).json({ data: null, error: 'duplicate_ticketNumber' })
            }
            throw e3
          }
        }
      }
      throw e1
    }
  } catch (err: any) {
    console.error('create_ticket_error', err)
    if (err && typeof err === 'object' && 'code' in err && (err as any).code === 11000) {
      return res.status(409).json({ data: null, error: 'duplicate_ticketNumber' })
    }
    const details: any = {}
    if (err && typeof err === 'object') {
      if ('message' in err && typeof (err as any).message === 'string') details.message = (err as any).message
      if ('code' in err && typeof (err as any).code !== 'undefined') details.code = (err as any).code
      if ('name' in err && typeof (err as any).name === 'string') details.name = (err as any).name
      if ('errmsg' in err && typeof (err as any).errmsg === 'string') details.errmsg = (err as any).errmsg
      if ('keyPattern' in err) details.keyPattern = (err as any).keyPattern
      if ('keyValue' in err) details.keyValue = (err as any).keyValue
    }
    return res.status(500).json({ data: null, error: 'insert_failed', details })
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


