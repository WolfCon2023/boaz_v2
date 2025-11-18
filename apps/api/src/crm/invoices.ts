import { Router } from 'express'
import { ObjectId, Sort, SortDirection } from 'mongodb'
import { getDb } from '../db.js'
import { sendAuthEmail } from '../auth/email.js'
import { env } from '../env.js'
import { requireAuth } from '../auth/rbac.js'

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

// Types for invoice history
type InvoiceHistoryEntry = {
  _id: ObjectId
  invoiceId: ObjectId
  eventType: 'created' | 'updated' | 'status_changed' | 'payment_received' | 'refund_issued' | 'total_changed' | 'field_changed' | 'subscription_started' | 'subscription_canceled' | 'dunning_state_changed'
  description: string
  userId?: string
  userName?: string
  userEmail?: string
  oldValue?: any
  newValue?: any
  metadata?: Record<string, any>
  createdAt: Date
}

// Helper function to add history entry
async function addInvoiceHistory(
  db: any,
  invoiceId: ObjectId,
  eventType: InvoiceHistoryEntry['eventType'],
  description: string,
  userId?: string,
  userName?: string,
  userEmail?: string,
  oldValue?: any,
  newValue?: any,
  metadata?: Record<string, any>
) {
  try {
    await db.collection('invoice_history').insertOne({
      _id: new ObjectId(),
      invoiceId,
      eventType,
      description,
      userId,
      userName,
      userEmail,
      oldValue,
      newValue,
      metadata,
      createdAt: new Date(),
    } as InvoiceHistoryEntry)
  } catch (err) {
    console.error('Failed to add invoice history:', err)
    // Don't fail the main operation if history fails
  }
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

// GET /api/crm/invoices/:id/history
invoicesRouter.get('/:id/history', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const inv = await db.collection<InvoiceDoc>('invoices').findOne({ _id })
    if (!inv) return res.status(404).json({ data: null, error: 'not_found' })
    
    // Get all history entries for this invoice, sorted by date (newest first)
    const historyEntries = await db.collection('invoice_history')
      .find({ invoiceId: _id })
      .sort({ createdAt: -1 })
      .toArray() as InvoiceHistoryEntry[]
    
    // Also include payments and refunds as history entries if not already in history
    const payments = (inv as any).payments ?? []
    const refunds = (inv as any).refunds ?? []
    
    // Add payment events to history if not already tracked
    for (const payment of payments) {
      const exists = historyEntries.some(h => 
        h.eventType === 'payment_received' && 
        h.metadata?.paidAt?.toString() === payment.paidAt?.toString() &&
        h.metadata?.amount === payment.amount
      )
      if (!exists) {
        historyEntries.push({
          _id: new ObjectId(),
          invoiceId: _id,
          eventType: 'payment_received',
          description: `Payment received: $${payment.amount.toFixed(2)} via ${payment.method}`,
          createdAt: payment.paidAt instanceof Date ? payment.paidAt : new Date(payment.paidAt),
          metadata: payment,
        } as InvoiceHistoryEntry)
      }
    }
    
    // Add refund events to history if not already tracked
    for (const refund of refunds) {
      const exists = historyEntries.some(h => 
        h.eventType === 'refund_issued' && 
        h.metadata?.refundedAt?.toString() === refund.refundedAt?.toString() &&
        h.metadata?.amount === refund.amount
      )
      if (!exists) {
        historyEntries.push({
          _id: new ObjectId(),
          invoiceId: _id,
          eventType: 'refund_issued',
          description: `Refund issued: $${refund.amount.toFixed(2)}${refund.reason !== 'refund' ? ` (${refund.reason})` : ''}`,
          createdAt: refund.refundedAt instanceof Date ? refund.refundedAt : new Date(refund.refundedAt),
          metadata: refund,
        } as InvoiceHistoryEntry)
      }
    }
    
    // Sort all entries by date (newest first)
    historyEntries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    
    res.json({ 
      data: { 
        history: historyEntries,
        payments,
        refunds,
        invoice: { 
          title: (inv as any).title, 
          total: (inv as any).total, 
          status: (inv as any).status, 
          invoiceNumber: (inv as any).invoiceNumber, 
          createdAt: (inv as any).createdAt || _id.getTimestamp(),
          issuedAt: (inv as any).issuedAt, 
          dueDate: (inv as any).dueDate,
          updatedAt: (inv as any).updatedAt
        } 
      }, 
      error: null 
    })
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

  // Auto-increment invoiceNumber with duplicate handling (like deals)
  // Always check the actual highest invoice number first to ensure we don't create duplicates
  let invoiceNumber: number | undefined
  let result: any
  let attempts = 0
  const maxAttempts = 10
  
  // Get the actual highest invoice number from the database
  let highestInvoiceNumber = 700000
  try {
    const last = await db.collection('invoices').find({ invoiceNumber: { $type: 'number' } }).project({ invoiceNumber: 1 }).sort({ invoiceNumber: -1 }).limit(1).toArray()
    if (last.length > 0 && (last[0] as any)?.invoiceNumber) {
      highestInvoiceNumber = Number((last[0] as any).invoiceNumber)
    }
  } catch {}
  
  while (attempts < maxAttempts) {
    try {
      // Try to get next sequence (only on first attempt)
      if (invoiceNumber === undefined) {
        try {
          const { getNextSequence } = await import('../db.js')
          const seqNumber = await getNextSequence('invoiceNumber')
          // Use the higher of: sequence number or highest existing invoice number + 1
          invoiceNumber = Math.max(seqNumber, highestInvoiceNumber + 1)
        } catch {
          // Fallback: use highest existing + 1
          invoiceNumber = highestInvoiceNumber + 1
        }
      } else {
        // If previous attempt failed, increment and try next number
        invoiceNumber++
      }
      
      const docWithNumber = { ...doc, invoiceNumber }
      result = await db.collection<InvoiceDoc>('invoices').insertOne(docWithNumber as any)
      break // Success, exit loop
    } catch (err: any) {
      // Check if it's a duplicate key error
      if (err.code === 11000 && err.keyPattern?.invoiceNumber) {
        attempts++
        if (attempts >= maxAttempts) {
          return res.status(500).json({ data: null, error: 'failed_to_generate_invoice_number' })
        }
        // Continue loop to retry with incremented number
        continue
      }
      // Other errors, rethrow
      throw err
    }
  }
  
  if (!result || invoiceNumber === undefined) {
    return res.status(500).json({ data: null, error: 'failed_to_create_invoice' })
  }
  
  // Update doc with the final invoice number
  doc.invoiceNumber = invoiceNumber
  
  // Add history entry for creation
  const auth = (req as any).auth as { userId: string; email: string } | undefined
  if (auth) {
    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    await addInvoiceHistory(
      db,
      result.insertedId,
      'created',
      `Invoice created: ${title}`,
      auth.userId,
      (user as any)?.name,
      auth.email
    )
  } else {
    await addInvoiceHistory(
      db,
      result.insertedId,
      'created',
      `Invoice created: ${title}`
    )
  }
  
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})

// PUT /api/crm/invoices/:id
invoicesRouter.put('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    
    // Get current invoice for comparison
    const currentInvoice = await db.collection<InvoiceDoc>('invoices').findOne({ _id })
    if (!currentInvoice) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }
    
    const raw = req.body ?? {}
    const update: any = { updatedAt: new Date() }
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let user: any = null
    if (auth) {
      user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    }
    
    // Track status changes
    if (typeof raw.status === 'string' && raw.status !== (currentInvoice as any).status) {
      update.status = raw.status
      await addInvoiceHistory(
        db,
        _id,
        'status_changed',
        `Status changed from "${(currentInvoice as any).status}" to "${raw.status}"`,
        auth?.userId,
        user?.name,
        auth?.email,
        (currentInvoice as any).status,
        raw.status
      )
    }
    
    // Track title changes
    if (typeof raw.title === 'string') {
      const newTitle = raw.title.trim()
      if (newTitle !== (currentInvoice as any).title) {
        update.title = newTitle
        await addInvoiceHistory(
          db,
          _id,
          'field_changed',
          `Title changed from "${(currentInvoice as any).title}" to "${newTitle}"`,
          auth?.userId,
          user?.name,
          auth?.email,
          (currentInvoice as any).title,
          newTitle
        )
      }
    }
    
    // Track dueDate changes
    if (raw.dueDate != null) {
      const newDueDate = raw.dueDate ? new Date(raw.dueDate) : null
      const oldDueDate = (currentInvoice as any).dueDate
      if (newDueDate?.toString() !== oldDueDate?.toString()) {
        update.dueDate = newDueDate
        await addInvoiceHistory(
          db,
          _id,
          'field_changed',
          `Due date changed${oldDueDate ? ` from ${new Date(oldDueDate).toLocaleDateString()}` : ''} to ${newDueDate ? new Date(newDueDate).toLocaleDateString() : 'removed'}`,
          auth?.userId,
          user?.name,
          auth?.email
        )
      }
    }
    
    if (raw.issuedAt != null) update.issuedAt = raw.issuedAt ? new Date(raw.issuedAt) : null
    
    // Track total/items changes
    if (Array.isArray(raw.items)) {
      const oldTotal = (currentInvoice as any).total ?? 0
      update.items = raw.items
      update.subtotal = Number(raw.subtotal) || 0
      update.tax = Number(raw.tax) || 0
      update.total = Number(raw.total) || (update.subtotal + update.tax)
      
      // Adjust balance if payments exist: balance = total - sum(payments) + sum(refunds)
      const inv = await db.collection<InvoiceDoc>('invoices').findOne({ _id }, { projection: { payments: 1, refunds: 1 } })
      const paid = (inv?.payments ?? []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
      const refunded = (inv?.refunds ?? []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)
      update.balance = Math.max(0, update.total - paid + refunded)
      
      if (update.total !== oldTotal) {
        await addInvoiceHistory(
          db,
          _id,
          'total_changed',
          `Total changed from $${oldTotal.toFixed(2)} to $${update.total.toFixed(2)}`,
          auth?.userId,
          user?.name,
          auth?.email,
          oldTotal,
          update.total
        )
      }
    }
    
    if (raw.accountId && ObjectId.isValid(raw.accountId)) update.accountId = new ObjectId(raw.accountId)
    
    await db.collection<InvoiceDoc>('invoices').updateOne({ _id }, { $set: update })
    
    // Add general update entry if no specific changes were tracked
    if (!update.status && !update.title && raw.dueDate === undefined && !Array.isArray(raw.items)) {
      await addInvoiceHistory(
        db,
        _id,
        'updated',
        'Invoice updated',
        auth?.userId,
        user?.name,
        auth?.email
      )
    }
    
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
    const oldBalance = Number(inv.balance ?? inv.total ?? 0)
    const newBalance = Math.max(0, oldBalance - amount)
    const fields: any = {
      updatedAt: new Date(),
      balance: newBalance,
    }
    if (newBalance === 0) fields.paidAt = paidAt
    
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let user: any = null
    if (auth) {
      user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    }
    
    await db.collection<InvoiceDoc>('invoices').updateOne(
      { _id },
      { $push: { payments: { amount, method, paidAt } }, $set: fields },
    )
    
    // Add history entry for payment
    await addInvoiceHistory(
      db,
      _id,
      'payment_received',
      `Payment received: $${amount.toFixed(2)} via ${method}. Balance: $${oldBalance.toFixed(2)} → $${newBalance.toFixed(2)}`,
      auth?.userId,
      user?.name,
      auth?.email,
      oldBalance,
      newBalance,
      { amount, method, paidAt }
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
    const oldBalance = Number(inv.balance ?? 0)
    const newBalance = oldBalance + amount
    
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let user: any = null
    if (auth) {
      user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    }
    
    await db.collection<InvoiceDoc>('invoices').updateOne(
      { _id },
      { $push: { refunds: { amount, reason, refundedAt } }, $set: { updatedAt: new Date(), balance: newBalance } },
    )
    
    // Add history entry for refund
    await addInvoiceHistory(
      db,
      _id,
      'refund_issued',
      `Refund issued: $${amount.toFixed(2)}${reason !== 'refund' ? ` (${reason})` : ''}. Balance: $${oldBalance.toFixed(2)} → $${newBalance.toFixed(2)}`,
      auth?.userId,
      user?.name,
      auth?.email,
      oldBalance,
      newBalance,
      { amount, reason, refundedAt }
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
    const interval = String(req.body?.interval || 'monthly') as 'monthly' | 'annual'
    const startAt = req.body?.startAt ? new Date(req.body.startAt) : new Date()
    const next = new Date(startAt)
    if (interval === 'monthly') next.setMonth(next.getMonth() + 1)
    else next.setFullYear(next.getFullYear() + 1)

    // Load invoice to get account, totals, etc.
    const invoice = await db.collection<InvoiceDoc>('invoices').findOne({ _id }) as any
    if (!invoice) return res.status(404).json({ data: null, error: 'not_found' })
    
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let user: any = null
    if (auth) {
      user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    }
    
    await db.collection<InvoiceDoc>('invoices').updateOne(
      { _id },
      { $set: { updatedAt: new Date(), subscription: { interval, active: true, startedAt: startAt, nextInvoiceAt: next } } as any },
    )
    
    // Add history entry
    await addInvoiceHistory(
      db,
      _id,
      'subscription_started',
      `Subscription started: ${interval} billing`,
      auth?.userId,
      user?.name,
      auth?.email,
      null,
      { interval, startAt, nextInvoiceAt: next }
    )

    // Auto-create or update a Renewal tied to this subscription invoice
    try {
      const renewals = db.collection('renewals')
      const existing = await renewals.findOne({ sourceInvoiceId: _id })

      const accountId = (invoice as any).accountId as ObjectId | undefined
      let accountName: string | null = null
      let accountNumber: number | null = null
      if (accountId) {
        const acc = await db.collection('accounts').findOne({ _id: accountId })
        if (acc) {
          accountName = (acc as any).name ?? null
          accountNumber = (acc as any).accountNumber ?? null
        }
      }

      const total = Number((invoice as any).total ?? 0)
      const arr = interval === 'annual' ? total : total * 12
      const mrr = arr / 12

      const baseDoc = {
        accountId: accountId ?? null,
        accountNumber,
        accountName,
        productId: null,
        productName: null,
        productSku: null,
        sourceDealId: null,
        sourceInvoiceId: _id,
        sourceType: 'invoice' as const,
        name: (invoice as any).title || 'Subscription invoice',
        status: 'Active',
        termStart: startAt,
        termEnd: next,
        renewalDate: next,
        mrr,
        arr,
        healthScore: null,
        churnRisk: null,
        upsellPotential: 'Medium',
        ownerId: auth?.userId ?? null,
        ownerName: user?.name ?? null,
        ownerEmail: auth?.email ?? null,
        notes: 'Auto-created from subscription invoice',
        updatedAt: new Date(),
      }

      if (existing) {
        await renewals.updateOne(
          { _id: (existing as any)._id },
          { $set: baseDoc },
        )
      } else {
        await renewals.insertOne({
          _id: new ObjectId(),
          ...baseDoc,
          createdAt: new Date(),
        })
      }
    } catch (err) {
      console.error('Failed to auto-create renewal from subscription invoice:', err)
    }
    
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
    
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let user: any = null
    if (auth) {
      user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    }
    
    await db.collection<InvoiceDoc>('invoices').updateOne(
      { _id },
      { $set: { updatedAt: new Date(), 'subscription.active': false, 'subscription.canceledAt': new Date() } as any },
    )
    
    // Add history entry
    await addInvoiceHistory(
      db,
      _id,
      'subscription_canceled',
      'Subscription canceled',
      auth?.userId,
      user?.name,
      auth?.email
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
    
    const currentInvoice = await db.collection<InvoiceDoc>('invoices').findOne({ _id })
    const oldState = (currentInvoice as any)?.dunningState || 'none'
    
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let user: any = null
    if (auth) {
      user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    }
    
    await db.collection<InvoiceDoc>('invoices').updateOne(
      { _id },
      { $set: { updatedAt: new Date(), dunningState: state, lastDunningAt: new Date() } as any },
    )
    
    // Add history entry
    if (state !== oldState) {
      await addInvoiceHistory(
        db,
        _id,
        'dunning_state_changed',
        `Dunning state changed from "${oldState}" to "${state}"`,
        auth?.userId,
        user?.name,
        auth?.email,
        oldState,
        state
      )
    }
    
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// POST /api/crm/invoices/:id/send-email - Send invoice via email
invoicesRouter.post('/:id/send-email', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const invoiceId = new ObjectId(req.params.id)
    const { recipientEmail } = req.body
    
    // Get invoice
    const invoice = await db.collection('invoices').findOne({ _id: invoiceId })
    if (!invoice) {
      return res.status(404).json({ data: null, error: 'invoice_not_found' })
    }
    
    const invoiceData = invoice as any
    
    // Get recipient email - from request body, or from account
    let emailToSend = recipientEmail
    if (!emailToSend && invoiceData.accountId) {
      const account = await db.collection('accounts').findOne({ _id: invoiceData.accountId })
      if (account) {
        emailToSend = (account as any).primaryContactEmail
      }
    }
    
    if (!emailToSend || typeof emailToSend !== 'string') {
      return res.status(400).json({ data: null, error: 'recipient_email_required' })
    }
    
    // Get sender info
    const sender = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    if (!sender) {
      return res.status(404).json({ data: null, error: 'sender_not_found' })
    }
    const senderData = sender as any
    
    // Get account info
    let accountInfo: any = null
    if (invoiceData.accountId) {
      const account = await db.collection('accounts').findOne({ _id: invoiceData.accountId })
      if (account) {
        accountInfo = {
          accountNumber: (account as any).accountNumber,
          name: (account as any).name,
          companyName: (account as any).companyName,
          primaryContactName: (account as any).primaryContactName,
        }
      }
    }
    
    // Send email
    const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
    const invoiceViewUrl = `${baseUrl}/apps/crm/invoices/${invoiceId.toString()}/print`
    
    const now = new Date()
    try {
      await sendAuthEmail({
        to: emailToSend,
        subject: `Invoice: ${invoiceData.invoiceNumber ? `#${invoiceData.invoiceNumber}` : invoiceData.title || 'Untitled'}`,
        checkPreferences: false, // Don't check preferences for invoice emails
        html: `
          <h2>Invoice</h2>
          <p>${accountInfo?.primaryContactName ? `Hello ${accountInfo.primaryContactName},` : 'Hello,'}</p>
          <p>Please find your invoice below:</p>
          <ul>
            <li><strong>Invoice:</strong> ${invoiceData.invoiceNumber ? `#${invoiceData.invoiceNumber}` : 'N/A'} - ${invoiceData.title || 'Untitled'}</li>
            <li><strong>Account:</strong> ${accountInfo?.name || accountInfo?.companyName || 'N/A'}</li>
            <li><strong>Total:</strong> $${(invoiceData.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</li>
            ${invoiceData.dueDate ? `<li><strong>Due Date:</strong> ${new Date(invoiceData.dueDate).toLocaleDateString()}</li>` : ''}
            <li><strong>Status:</strong> ${invoiceData.status || 'draft'}</li>
            <li><strong>Sent by:</strong> ${senderData.name || senderData.email}</li>
            <li><strong>Sent at:</strong> ${now.toLocaleString()}</li>
          </ul>
          <p><a href="${invoiceViewUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">View Invoice</a></p>
          <p>Or copy and paste this URL into your browser:</p>
          <p><code>${invoiceViewUrl}</code></p>
        `,
        text: `
Invoice

${accountInfo?.primaryContactName ? `Hello ${accountInfo.primaryContactName},` : 'Hello,'}

Please find your invoice below:

Invoice: ${invoiceData.invoiceNumber ? `#${invoiceData.invoiceNumber}` : 'N/A'} - ${invoiceData.title || 'Untitled'}
Account: ${accountInfo?.name || accountInfo?.companyName || 'N/A'}
Total: $${(invoiceData.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
${invoiceData.dueDate ? `Due Date: ${new Date(invoiceData.dueDate).toLocaleDateString()}\n` : ''}Status: ${invoiceData.status || 'draft'}
Sent by: ${senderData.name || senderData.email}
Sent at: ${now.toLocaleString()}

View Invoice: ${invoiceViewUrl}
        `,
      })
    } catch (emailErr) {
      console.error('Failed to send invoice email:', emailErr)
      return res.status(500).json({ data: null, error: 'failed_to_send_email' })
    }
    
    // Add history entry
    await addInvoiceHistory(
      db,
      invoiceId,
      'field_changed',
      `Invoice sent via email to ${emailToSend}`,
      auth.userId,
      senderData.name,
      auth.email,
      null,
      null,
      { recipientEmail: emailToSend, sentAt: now }
    )
    
    res.json({ data: { message: 'Invoice sent via email', recipientEmail: emailToSend }, error: null })
  } catch (err: any) {
    console.error('Send invoice email error:', err)
    if (err.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: err.message || 'failed_to_send_invoice_email' })
  }
})


