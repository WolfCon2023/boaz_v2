import { Router } from 'express'
import { ObjectId, Sort, SortDirection } from 'mongodb'
import { getDb } from '../db.js'

type Payment = { amount: number; method: string; paidAt: Date }
type Refund = { amount: number; reason: string; refundedAt: Date }
type InvoiceDoc = {
  _id: ObjectId
  total?: number
  balance?: number
  payments?: Payment[]
  refunds?: Refund[]
  subscription?: { interval: 'monthly' | 'annual'; active: boolean; startedAt?: Date; canceledAt?: Date; nextInvoiceAt?: Date }
  dunningState?: 'none' | 'first_notice' | 'second_notice' | 'final_notice' | 'collections'
  lastDunningAt?: Date
}

export const invoicesRouter = Router()

// GET /api/crm/invoices/:id
invoicesRouter.get('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const inv = await db.collection<InvoiceDoc>('invoices').findOne({ _id })
    if (!inv) return res.status(404).json({ data: null, error: 'not_found' })
    res.json({ data: inv, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// DELETE /api/crm/invoices/:id
invoicesRouter.delete('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    await db.collection<InvoiceDoc>('invoices').deleteOne({ _id })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// GET /api/crm/invoices?q=&sort=&dir=
invoicesRouter.get('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  const q = String((req.query.q as string) ?? '').trim()
  const sortKeyRaw = (req.query.sort as string) ?? 'updatedAt'
  const dirParam = ((req.query.dir as string) ?? 'desc').toLowerCase()
  const dir: SortDirection = dirParam === 'asc' ? 1 : -1
  const allowed = new Set(['updatedAt','createdAt','invoiceNumber','total','status','dueDate'])
  const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'updatedAt'
  const sort: Sort = { [sortField]: dir }

  const filter: Record<string, unknown> = q
    ? { $or: [
        { title: { $regex: q, $options: 'i' } },
        { status: { $regex: q, $options: 'i' } },
      ] }
    : {}

  const items = await db.collection<InvoiceDoc>('invoices').find(filter as any).sort(sort).limit(200).toArray()
  res.json({ data: { items }, error: null })
})

// POST /api/crm/invoices
invoicesRouter.post('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!title) return res.status(400).json({ data: null, error: 'invalid_payload' })

  let accountId: ObjectId | null = null
  if (typeof raw.accountId === 'string' && ObjectId.isValid(raw.accountId)) accountId = new ObjectId(raw.accountId)
  else if (typeof raw.accountNumber === 'number') {
    const acc = await db.collection('accounts').findOne({ accountNumber: raw.accountNumber })
    if (!acc?._id) return res.status(400).json({ data: null, error: 'account_not_found' })
    accountId = acc._id as ObjectId
  } else return res.status(400).json({ data: null, error: 'missing_account' })

  const now = new Date()
  const subtotal = Number(raw.subtotal) || 0
  const tax = Number(raw.tax) || 0
  const total = Number(raw.total) || subtotal + tax
  const currency = (raw.currency as string) || 'USD'
  const status = (raw.status as string) || 'draft' // draft, open, paid, void, uncollectible
  const dueDate = raw.dueDate ? new Date(raw.dueDate) : null
  const issuedAt = raw.issuedAt ? new Date(raw.issuedAt) : now

  const doc: any = {
    title,
    accountId,
    items: Array.isArray(raw.items) ? raw.items : [],
    subtotal,
    tax,
    total,
    balance: total,
    currency,
    status,
    dueDate,
    issuedAt,
    paidAt: null,
    createdAt: now,
    updatedAt: now,
    payments: [],
    refunds: [],
    // optional: subscriptionId, dunningState, etc.
  }

  // Auto-increment invoiceNumber with fallback
  try {
    const { getNextSequence } = await import('../db.js')
    doc.invoiceNumber = await getNextSequence('invoiceNumber')
  } catch {}
  if (doc.invoiceNumber == null) {
    try {
      const last = await db.collection('invoices').find({ invoiceNumber: { $type: 'number' } }).project({ invoiceNumber: 1 }).sort({ invoiceNumber: -1 }).limit(1).toArray()
      doc.invoiceNumber = Number((last[0] as any)?.invoiceNumber ?? 700000) + 1
    } catch { doc.invoiceNumber = 700001 }
  }

  const result = await db.collection<InvoiceDoc>('invoices').insertOne(doc as any)
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})

// PUT /api/crm/invoices/:id
invoicesRouter.put('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const raw = req.body ?? {}
    const update: any = { updatedAt: new Date() }
    if (typeof raw.title === 'string') update.title = raw.title.trim()
    if (typeof raw.status === 'string') update.status = raw.status
    if (raw.dueDate != null) update.dueDate = raw.dueDate ? new Date(raw.dueDate) : null
    if (raw.issuedAt != null) update.issuedAt = raw.issuedAt ? new Date(raw.issuedAt) : null
    if (Array.isArray(raw.items)) {
      update.items = raw.items
      update.subtotal = Number(raw.subtotal) || 0
      update.tax = Number(raw.tax) || 0
      update.total = Number(raw.total) || (update.subtotal + update.tax)
      // Adjust balance if payments exist: balance = total - sum(payments) + sum(refunds)
      const inv = await db.collection<InvoiceDoc>('invoices').findOne({ _id }, { projection: { payments: 1, refunds: 1 } })
      const paid = (inv?.payments ?? []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
      const refunded = (inv?.refunds ?? []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)
      update.balance = Math.max(0, update.total - paid + refunded)
    }
    if (raw.accountId && ObjectId.isValid(raw.accountId)) update.accountId = new ObjectId(raw.accountId)
    await db.collection<InvoiceDoc>('invoices').updateOne({ _id }, { $set: update })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// POST /api/crm/invoices/:id/payments { amount, method, paidAt }
invoicesRouter.post('/:id/payments', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const amount = Number(req.body?.amount) || 0
    if (!(amount > 0)) return res.status(400).json({ data: null, error: 'invalid_amount' })
    const method = String(req.body?.method || 'card')
    const paidAt = req.body?.paidAt ? new Date(req.body.paidAt) : new Date()
    const inv = await db.collection<InvoiceDoc>('invoices').findOne({ _id }, { projection: { total: 1, balance: 1, payments: 1 } })
    if (!inv) return res.status(404).json({ data: null, error: 'not_found' })
    const newBalance = Math.max(0, Number(inv.balance ?? inv.total ?? 0) - amount)
    const fields: any = {
      updatedAt: new Date(),
      balance: newBalance,
    }
    if (newBalance === 0) fields.paidAt = paidAt
    await db.collection<InvoiceDoc>('invoices').updateOne(
      { _id },
      { $push: { payments: { amount, method, paidAt } }, $set: fields },
    )
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// POST /api/crm/invoices/:id/refunds { amount, reason, refundedAt }
invoicesRouter.post('/:id/refunds', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const amount = Number(req.body?.amount) || 0
    if (!(amount > 0)) return res.status(400).json({ data: null, error: 'invalid_amount' })
    const reason = String(req.body?.reason || 'refund')
    const refundedAt = req.body?.refundedAt ? new Date(req.body.refundedAt) : new Date()
    const inv = await db.collection<InvoiceDoc>('invoices').findOne({ _id }, { projection: { balance: 1 } })
    if (!inv) return res.status(404).json({ data: null, error: 'not_found' })
    // Refunds increase balance (merchant owes customer) — we keep balance non-negative for simplicity
    const newBalance = Number(inv.balance ?? 0) + amount
    await db.collection<InvoiceDoc>('invoices').updateOne(
      { _id },
      { $push: { refunds: { amount, reason, refundedAt } }, $set: { updatedAt: new Date(), balance: newBalance } },
    )
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// POST /api/crm/invoices/:id/subscribe { interval, startAt }
invoicesRouter.post('/:id/subscribe', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const interval = (String(req.body?.interval || 'monthly') as 'monthly' | 'annual')
    const startAt = req.body?.startAt ? new Date(req.body.startAt) : new Date()
    const next = new Date(startAt)
    if (interval === 'monthly') next.setMonth(next.getMonth() + 1)
    else next.setFullYear(next.getFullYear() + 1)
    await db.collection<InvoiceDoc>('invoices').updateOne(
      { _id },
      { $set: { updatedAt: new Date(), subscription: { interval, active: true, startedAt: startAt, nextInvoiceAt: next } } as any },
    )
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// POST /api/crm/invoices/:id/cancel-subscription
invoicesRouter.post('/:id/cancel-subscription', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    await db.collection<InvoiceDoc>('invoices').updateOne(
      { _id },
      { $set: { updatedAt: new Date(), 'subscription.active': false, 'subscription.canceledAt': new Date() } as any },
    )
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// POST /api/crm/invoices/:id/dunning { state }
invoicesRouter.post('/:id/dunning', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const state = (String(req.body?.state || 'none') as InvoiceDoc['dunningState'])
    await db.collection<InvoiceDoc>('invoices').updateOne(
      { _id },
      { $set: { updatedAt: new Date(), dunningState: state, lastDunningAt: new Date() } as any },
    )
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})


