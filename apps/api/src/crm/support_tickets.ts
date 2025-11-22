import { Router } from 'express'
import { getDb, getNextSequence } from '../db.js'
import { ObjectId, Sort } from 'mongodb'

export const supportTicketsRouter = Router()

type TicketComment = { author: any; body: string; at: Date }
type TicketDoc = {
  _id?: ObjectId
  ticketNumber?: number
  shortDescription: string
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
  requesterName?: string | null
  requesterEmail?: string | null
}

// GET /api/crm/support/tickets?q=&status=&priority=&accountId=&contactId=&sort=&dir=&breached=&dueWithin=
supportTicketsRouter.get('/tickets', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  const q = String((req.query.q as string) ?? '').trim()
  const status = String((req.query.status as string) ?? '')
  const statusesRaw = String((req.query.statuses as string) ?? '')
  const priority = String((req.query.priority as string) ?? '')
  const accountId = String((req.query.accountId as string) ?? '')
  const contactId = String((req.query.contactId as string) ?? '')
  const dir = ((req.query.dir as string) ?? 'desc').toLowerCase() === 'asc' ? 1 : -1
  const sortKey = (req.query.sort as string) ?? 'createdAt'
  const sort: Sort = { [sortKey]: dir as 1 | -1 }
  const filter: any = {}
  if (q) filter.$or = [{ title: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }]
  if (statusesRaw) {
    const list = statusesRaw.split(',').map((s) => s.trim()).filter(Boolean)
    if (list.length > 0) filter.status = { $in: list }
  } else if (status) filter.status = status
  if (priority) filter.priority = priority
  if (ObjectId.isValid(accountId)) filter.accountId = new ObjectId(accountId)
  if (ObjectId.isValid(contactId)) filter.contactId = new ObjectId(contactId)
  const now = new Date()
  const breached = String((req.query.breached as string) ?? '')
  const dueWithin = Number((req.query.dueWithin as string) ?? '')
  if (breached === '1') {
    // Explicitly prefer breached filter when both are present
    filter.slaDueAt = { $ne: null, $lt: now }
  } else if (!isNaN(dueWithin) && dueWithin > 0) {
    const until = new Date(now.getTime() + dueWithin * 60 * 1000)
    filter.slaDueAt = { $ne: null, $gte: now, $lte: until }
  }
  const items = await db.collection<TicketDoc>('support_tickets').find(filter).sort(sort).limit(200).toArray()
  res.json({ data: { items }, error: null })
})

// GET /api/crm/support/tickets/by-account?accountIds=id1,id2
supportTicketsRouter.get('/tickets/by-account', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const rawIds = String((req.query.accountIds as string) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (!rawIds.length) {
    return res.json({ data: { items: [] }, error: null })
  }

  const idMap = new Map<string, ObjectId>()
  for (const id of rawIds) {
    if (ObjectId.isValid(id)) {
      idMap.set(id, new ObjectId(id))
    }
  }
  if (!idMap.size) {
    return res.json({ data: { items: [] }, error: null })
  }

  const now = new Date()
  const coll = db.collection<TicketDoc>('support_tickets')

  const rows = await coll
    .aggregate<{
      _id: ObjectId | null
      open: number
      high: number
      breached: number
    }>([
      {
        $match: {
          accountId: { $in: Array.from(idMap.values()) },
          status: { $in: ['open', 'pending'] },
        },
      },
      {
        $group: {
          _id: '$accountId',
          open: { $sum: 1 },
          high: {
            $sum: {
              $cond: [
                { $in: ['$priority', ['high', 'urgent', 'p1']] },
                1,
                0,
              ],
            },
          },
          breached: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$slaDueAt', null] },
                    { $lt: ['$slaDueAt', now] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ])
    .toArray()

  const items = rows
    .filter((r) => r._id)
    .map((r) => ({
      accountId: String(r._id),
      open: r.open ?? 0,
      high: r.high ?? 0,
      breached: r.breached ?? 0,
    }))

  return res.json({ data: { items }, error: null })
})

// GET /api/crm/support/tickets/metrics
supportTicketsRouter.get('/tickets/metrics', async (_req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { open: 0, breached: 0, dueNext60: 0 }, error: null })
  const now = new Date()
  const next60 = new Date(now.getTime() + 60 * 60 * 1000)
  const coll = db.collection<TicketDoc>('support_tickets')
  const [open, breached, dueNext60] = await Promise.all([
    coll.countDocuments({ status: { $in: ['open','pending'] } }),
    coll.countDocuments({ status: { $in: ['open','pending'] }, slaDueAt: { $ne: null, $lt: now } }),
    coll.countDocuments({ status: { $in: ['open','pending'] }, slaDueAt: { $gte: now, $lte: next60 } }),
  ])
  res.json({ data: { open, breached, dueNext60 }, error: null })
})

// Alias: GET /api/crm/support/metrics (same payload)
supportTicketsRouter.get('/metrics', async (_req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { open: 0, breached: 0, dueNext60: 0 }, error: null })
  const now = new Date()
  const next60 = new Date(now.getTime() + 60 * 60 * 1000)
  const coll = db.collection<TicketDoc>('support_tickets')
  const [open, breached, dueNext60] = await Promise.all([
    coll.countDocuments({ status: { $in: ['open','pending'] } }),
    coll.countDocuments({ status: { $in: ['open','pending'] }, slaDueAt: { $ne: null, $lt: now } }),
    coll.countDocuments({ status: { $in: ['open','pending'] }, slaDueAt: { $gte: now, $lte: next60 } }),
  ])
  res.json({ data: { open, breached, dueNext60 }, error: null })
})

// POST /api/crm/support/tickets
supportTicketsRouter.post('/tickets', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const raw = req.body ?? {}
    const shortDescription = typeof raw.shortDescription === 'string' && raw.shortDescription.trim()
      ? raw.shortDescription.trim()
      : (typeof raw.title === 'string' ? raw.title.trim() : '')
    if (!shortDescription) return res.status(400).json({ data: null, error: 'invalid_payload' })
    const descRaw = typeof raw.description === 'string' ? raw.description : ''
    const description = descRaw.length > 2500 ? descRaw.slice(0, 2500) : descRaw
    const doc: TicketDoc = {
      shortDescription,
      description,
      status: (raw.status as string) || 'open',
      priority: (raw.priority as string) || 'normal',
      accountId: ObjectId.isValid(raw.accountId) ? new ObjectId(raw.accountId) : null,
      contactId: ObjectId.isValid(raw.contactId) ? new ObjectId(raw.contactId) : null,
      assignee: (raw.assignee as any) || null,
      slaDueAt: raw.slaDueAt ? new Date(raw.slaDueAt) : null,
      comments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      requesterName: typeof raw.requesterName === 'string' ? raw.requesterName : null,
      requesterEmail: typeof raw.requesterEmail === 'string' ? raw.requesterEmail : null,
    }
    try {
      doc.ticketNumber = await getNextSequence('ticketNumber')
    } catch {}
    if (doc.ticketNumber == null) doc.ticketNumber = 200001

    const coll = db.collection<TicketDoc>('support_tickets')
    // Robust retry loop to avoid duplicate numbers under contention
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const result = await coll.insertOne(doc)
        return res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
      } catch (errInsert: any) {
        if (errInsert && typeof errInsert === 'object' && 'code' in errInsert && errInsert.code === 11000) {
          // Align counter and pick next number deterministically from current max
          const maxDocs = await coll
            .find({}, { projection: { ticketNumber: 1 } as any })
            .sort({ ticketNumber: -1 } as any)
            .limit(1)
            .toArray()
          const maxNum = maxDocs[0]?.ticketNumber ?? 200000
          await db
            .collection<{ _id: string; seq: number }>('counters')
            .updateOne({ _id: 'ticketNumber' }, [{ $set: { seq: { $max: [ '$seq', maxNum ] } } }] as any, { upsert: true })
          // Set next candidate directly to max+1 to break tie immediately
          doc.ticketNumber = (maxNum ?? 200000) + 1
          continue
        }
        throw errInsert
      }
    }
    return res.status(409).json({ data: null, error: 'duplicate_ticketNumber' })
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

// PUBLIC PORTAL
// POST /api/crm/support/portal/tickets { shortDescription, description, requesterName, requesterEmail }
supportTicketsRouter.post('/portal/tickets', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const raw = req.body ?? {}
    const shortDescription = typeof raw.shortDescription === 'string' ? raw.shortDescription.trim() : ''
    const requesterEmail = typeof raw.requesterEmail === 'string' ? raw.requesterEmail.trim() : ''
    if (!shortDescription || !requesterEmail) {
      return res.status(400).json({ data: null, error: 'invalid_payload' })
    }
    const description = typeof raw.description === 'string' ? raw.description.slice(0, 2500) : ''
    const doc: TicketDoc = {
      shortDescription,
      description,
      status: 'open',
      priority: 'normal',
      accountId: null,
      contactId: null,
      assignee: null,
      slaDueAt: null,
      comments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      requesterName: typeof raw.requesterName === 'string' ? raw.requesterName : null,
      requesterEmail,
    }
    try {
      doc.ticketNumber = await getNextSequence('ticketNumber')
    } catch {}
    if (doc.ticketNumber == null) doc.ticketNumber = 200001

    const coll = db.collection<TicketDoc>('support_tickets')
    // Use the same robust retry logic as the internal ticket creation route
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const result = await coll.insertOne(doc)
        return res
          .status(201)
          .json({ data: { _id: result.insertedId, ticketNumber: doc.ticketNumber }, error: null })
      } catch (errInsert: any) {
        if (errInsert && typeof errInsert === 'object' && 'code' in errInsert && errInsert.code === 11000) {
          // Duplicate ticketNumber – align counter with current max and try the next number
          const maxDocs = await coll
            .find({}, { projection: { ticketNumber: 1 } as any })
            .sort({ ticketNumber: -1 } as any)
            .limit(1)
            .toArray()
          const maxNum = maxDocs[0]?.ticketNumber ?? 200000
          await db
            .collection<{ _id: string; seq: number }>('counters')
            .updateOne(
              { _id: 'ticketNumber' },
              [{ $set: { seq: { $max: ['$seq', maxNum] } } }] as any,
              { upsert: true },
            )
          doc.ticketNumber = (maxNum ?? 200000) + 1
          continue
        }
        throw errInsert
      }
    }
    return res.status(409).json({ data: null, error: 'duplicate_ticketNumber' })
  } catch (err: any) {
    console.error('portal_create_ticket_error', err)
    if (err && typeof err === 'object' && 'code' in err && (err as any).code === 11000) {
      return res.status(409).json({ data: null, error: 'duplicate_ticketNumber' })
    }
    return res.status(500).json({ data: null, error: 'insert_failed' })
  }
})

// GET /api/crm/support/portal/tickets/:ticketNumber
supportTicketsRouter.get('/portal/tickets/:ticketNumber', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const num = Number(req.params.ticketNumber)
  if (!num) return res.status(400).json({ data: null, error: 'invalid_ticketNumber' })
  const item = await db.collection<TicketDoc>('support_tickets').findOne({ ticketNumber: num })
  if (!item) return res.status(404).json({ data: null, error: 'not_found' })
  res.json({ data: { item }, error: null })
})

// POST /api/crm/support/portal/tickets/:ticketNumber/comments { body, author }
supportTicketsRouter.post('/portal/tickets/:ticketNumber/comments', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const num = Number(req.params.ticketNumber)
  if (!num) return res.status(400).json({ data: null, error: 'invalid_ticketNumber' })
  const comment: TicketComment = { author: req.body?.author || 'customer', body: String(req.body?.body || ''), at: new Date() }
  await db.collection<TicketDoc>('support_tickets').updateOne({ ticketNumber: num }, { $push: { comments: comment }, $set: { updatedAt: new Date() } })
  res.json({ data: { ok: true }, error: null })
})

// PUT /api/crm/support/tickets/:id
supportTicketsRouter.put('/tickets/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const update: any = { updatedAt: new Date() }
    // Accept both 'shortDescription' and legacy 'title' for compatibility
    if (typeof (req.body ?? {}).shortDescription === 'string') update.shortDescription = (req.body as any).shortDescription
    else if (typeof (req.body ?? {}).title === 'string') update.shortDescription = (req.body as any).title
    for (const k of ['status','priority','assignee']) if (typeof (req.body ?? {})[k] === 'string') update[k] = (req.body as any)[k]
    if (typeof (req.body ?? {}).description === 'string') {
      const d = String((req.body as any).description)
      update.description = d.length > 2500 ? d.slice(0, 2500) : d
    }
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


