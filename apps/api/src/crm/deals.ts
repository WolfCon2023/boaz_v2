import { Router } from 'express'
import { getDb } from '../db.js'
import { z } from 'zod'
import { ObjectId } from 'mongodb'

export const dealsRouter = Router()

dealsRouter.get('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [], total: 0 }, error: null })
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 25)))
  const page = Math.max(0, Number(req.query.page ?? 0))
  const skip = page * limit
  const q = String((req.query.q as string) ?? '').trim()

  const filter: Record<string, any> = {}
  if (q) filter.title = { $regex: q, $options: 'i' }
  if (typeof req.query.stage === 'string' && req.query.stage.trim() !== '') filter.stage = req.query.stage
  const minAmount = req.query.minAmount != null ? Number(req.query.minAmount) : undefined
  const maxAmount = req.query.maxAmount != null ? Number(req.query.maxAmount) : undefined
  if (Number.isFinite(minAmount) || Number.isFinite(maxAmount)) {
    filter.amount = {}
    if (Number.isFinite(minAmount)) filter.amount.$gte = Number(minAmount)
    if (Number.isFinite(maxAmount)) filter.amount.$lte = Number(maxAmount)
  }
  const startDate = typeof req.query.startDate === 'string' && req.query.startDate ? new Date(`${req.query.startDate}T00:00:00Z`) : null
  const endDate = typeof req.query.endDate === 'string' && req.query.endDate ? new Date(`${req.query.endDate}T23:59:59Z`) : null
  if (startDate || endDate) {
    filter.closeDate = {}
    if (startDate) filter.closeDate.$gte = startDate
    if (endDate) filter.closeDate.$lte = endDate
  }

  const sortKey = (req.query.sort as string) ?? 'closeDate'
  const dir = ((req.query.dir as string) ?? 'desc').toLowerCase() === 'asc' ? 1 : -1
  const allowed: Record<string, 1 | -1> = { dealNumber: dir, title: dir, stage: dir, amount: dir, closeDate: dir, createdAt: dir }
  const sort: Record<string, 1 | -1> = allowed[sortKey] ? { [sortKey]: allowed[sortKey] } : { closeDate: -1 }

  const coll = db.collection('deals')
  const [items, total] = await Promise.all([
    coll.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
    coll.countDocuments(filter),
  ])
  res.json({ data: { items, total, page, limit }, error: null })
})

dealsRouter.post('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!title) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const accountIdRaw = typeof raw.accountId === 'string' ? raw.accountId.trim() : undefined
  const accountNumberRaw = raw.accountNumber
  const amountRaw = raw.amount
  const stageRaw = typeof raw.stage === 'string' ? raw.stage.trim() : undefined
  const closeDateRaw = typeof raw.closeDate === 'string' ? raw.closeDate.trim() : undefined
  const accountNumberParsed = accountNumberRaw === undefined || accountNumberRaw === '' ? undefined : Number(accountNumberRaw)
  const amountParsed = amountRaw === undefined || amountRaw === '' ? undefined : Number(amountRaw)
  try {
    let accountObjectId: ObjectId | null = null
    let accountNumberValue: number | undefined
    if (accountIdRaw) {
      if (!ObjectId.isValid(accountIdRaw)) {
        return res.status(400).json({ data: null, error: 'invalid_accountId' })
      }
      accountObjectId = new ObjectId(accountIdRaw)
      // Fetch accountNumber for denormalization
      const acc = await db.collection('accounts').findOne({ _id: accountObjectId })
      if (typeof (acc as any)?.accountNumber === 'number') {
        accountNumberValue = (acc as any).accountNumber as number
      }
    } else if (typeof accountNumberParsed === 'number' && Number.isFinite(accountNumberParsed)) {
      const acc = await db.collection('accounts').findOne({ accountNumber: accountNumberParsed })
      if (!acc?._id) return res.status(400).json({ data: null, error: 'account_not_found' })
      accountObjectId = acc._id as ObjectId
      accountNumberValue = accountNumberParsed
    } else {
      return res.status(400).json({ data: null, error: 'missing_account' })
    }

    const closedWon = 'Contract Signed / Closed Won'
    const doc: any = {
      title,
      accountId: accountObjectId,
      amount: typeof amountParsed === 'number' && Number.isFinite(amountParsed) ? amountParsed : undefined,
      stage: stageRaw || 'new',
    }
    if (ObjectId.isValid(raw.marketingCampaignId)) doc.marketingCampaignId = new ObjectId(raw.marketingCampaignId)
    if (typeof raw.attributionToken === 'string') doc.attributionToken = raw.attributionToken.trim()
    if (typeof accountNumberValue === 'number') doc.accountNumber = accountNumberValue
    // Normalize date-only strings to midday UTC to avoid timezone shifting one day back
    if (closeDateRaw) doc.closeDate = new Date(`${closeDateRaw}T12:00:00Z`)
    if (!doc.closeDate && doc.stage === closedWon) doc.closeDate = new Date()
    // Assign incremental dealNumber starting at 100001
    try {
      const { getNextSequence } = await import('../db.js')
      doc.dealNumber = await getNextSequence('dealNumber')
    } catch {}
    if (doc.dealNumber === undefined) {
      try {
        const last = await db
          .collection('deals')
          .find({ dealNumber: { $type: 'number' } })
          .project({ dealNumber: 1 })
          .sort({ dealNumber: -1 })
          .limit(1)
          .toArray()
        doc.dealNumber = Number((last[0] as any)?.dealNumber ?? 100000) + 1
      } catch {
        doc.dealNumber = 100001
      }
    }
    const result = await db.collection('deals').insertOne(doc)
    if (doc.dealNumber == null) {
      // Emergency fallback: assign after insert
      try {
        const { getNextSequence } = await import('../db.js')
        const n = await getNextSequence('dealNumber')
        await db.collection('deals').updateOne({ _id: result.insertedId }, { $set: { dealNumber: n } })
        doc.dealNumber = n
      } catch {
        // Secondary fallback: derive from current max
        try {
          const last = await db
            .collection('deals')
            .find({ dealNumber: { $type: 'number' } })
            .project({ dealNumber: 1 })
            .sort({ dealNumber: -1 })
            .limit(1)
            .toArray()
          const n = Number((last[0] as any)?.dealNumber ?? 100000) + 1
          await db.collection('deals').updateOne({ _id: result.insertedId }, { $set: { dealNumber: n } })
          doc.dealNumber = n
        } catch {}
      }
    }
    return res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
  } catch (e) {
    return res.status(500).json({ data: null, error: 'deals_insert_error' })
  }
})

// PATCH /api/crm/deals/:id/stage
dealsRouter.patch('/:id/stage', async (req, res) => {
  const schema = z.object({ stage: z.string().min(1) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    await db.collection('deals').updateOne({ _id }, { $set: { stage: parsed.data.stage } })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// DELETE /api/crm/deals/:id
dealsRouter.delete('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    await db.collection('deals').deleteOne({ _id })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// PUT /api/crm/deals/:id
dealsRouter.put('/:id', async (req, res) => {
  const schema = z.object({
    title: z.string().min(1).optional(),
    accountId: z.string().min(1).optional(),
    amount: z.number().optional(),
    stage: z.string().optional(),
    closeDate: z.string().optional(),
    marketingCampaignId: z.string().optional(),
    attributionToken: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const update: any = { ...parsed.data }
    if (update.accountId) update.accountId = new ObjectId(update.accountId)
    if (update.marketingCampaignId && ObjectId.isValid(update.marketingCampaignId)) update.marketingCampaignId = new ObjectId(update.marketingCampaignId)
    if (update.attributionToken === '') delete update.attributionToken
    const closedWon = 'Contract Signed / Closed Won'
    if (update.closeDate) update.closeDate = new Date(`${update.closeDate}T12:00:00Z`)

    // Auto-populate closeDate when moving to Closed Won
    if (update.stage === closedWon && !update.closeDate) {
      update.closeDate = new Date()
    }

    // Build update doc with optional $unset when moving away from Closed Won
    const updateDoc: any = { $set: update }
    if (update.stage && update.stage !== closedWon) {
      updateDoc.$unset = { closeDate: '' }
    }

    await db.collection('deals').updateOne({ _id }, updateDoc)
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})


