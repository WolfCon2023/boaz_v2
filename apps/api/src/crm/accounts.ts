import { Router } from 'express'
import { getDb } from '../db.js'
import { z } from 'zod'
import { ObjectId } from 'mongodb'

export const accountsRouter = Router()

// Types for account history
type AccountHistoryEntry = {
  _id: ObjectId
  accountId: ObjectId
  eventType: 'created' | 'updated' | 'field_changed'
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
async function addAccountHistory(
  db: any,
  accountId: ObjectId,
  eventType: AccountHistoryEntry['eventType'],
  description: string,
  userId?: string,
  userName?: string,
  userEmail?: string,
  oldValue?: any,
  newValue?: any,
  metadata?: Record<string, any>
) {
  try {
    await db.collection('account_history').insertOne({
      _id: new ObjectId(),
      accountId,
      eventType,
      description,
      userId,
      userName,
      userEmail,
      oldValue,
      newValue,
      metadata,
      createdAt: new Date(),
    } as AccountHistoryEntry)
  } catch (err) {
    console.error('Failed to add account history:', err)
    // Don't fail the main operation if history fails
  }
}

accountsRouter.get('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 50)))
  const q = String((req.query.q as string) ?? '').trim()
  const sortKey = (req.query.sort as string) ?? 'name'
  const dir = ((req.query.dir as string) ?? 'asc').toLowerCase() === 'desc' ? -1 : 1
  const allowedSort: Record<string, 1 | -1> = {
    name: dir,
    companyName: dir,
    accountNumber: dir,
  }
  const sort: Record<string, 1 | -1> = allowedSort[sortKey] ? { [sortKey]: allowedSort[sortKey] } : { name: 1 }
  const filter: Record<string, unknown> = q
    ? { $or: [ { name: { $regex: q, $options: 'i' } }, { companyName: { $regex: q, $options: 'i' } } ] }
    : {}
  const items = await db.collection('accounts').find(filter).sort(sort).limit(limit).toArray()
  res.json({ data: { items }, error: null })
})

// DELETE /api/crm/accounts/:id
accountsRouter.delete('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const { ObjectId } = await import('mongodb')
    const _id = new ObjectId(req.params.id)
    await db.collection('accounts').deleteOne({ _id })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

accountsRouter.post('/', async (req, res) => {
  const opt = (schema: z.ZodTypeAny) =>
    z.preprocess((v) => {
      if (typeof v === 'string') {
        const t = v.trim()
        return t === '' ? undefined : t
      }
      return v
    }, schema.optional())
  const schema = z.object({
    name: z.string().trim().min(1),
    companyName: opt(z.string()),
    primaryContactName: opt(z.string()),
    primaryContactEmail: opt(z.string().email()),
    primaryContactPhone: opt(z.string()),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  // Generate accountNumber starting at 998801
  let accountNumber: number | undefined
  try {
    const { getNextSequence } = await import('../db.js')
    accountNumber = await getNextSequence('accountNumber')
  } catch {}
  // Fallback if counter not initialized
  if (accountNumber === undefined) {
    try {
      const last = await db
        .collection('accounts')
        .find({ accountNumber: { $type: 'number' } })
        .project({ accountNumber: 1 })
        .sort({ accountNumber: -1 })
        .limit(1)
        .toArray()
      accountNumber = Number((last[0] as any)?.accountNumber ?? 998800) + 1
    } catch {
      accountNumber = 998801
    }
  }
  const doc = { ...parsed.data, accountNumber }
  const result = await db.collection('accounts').insertOne(doc)
  
  // Add history entry for creation
  const auth = (req as any).auth as { userId: string; email: string } | undefined
  if (auth) {
    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    await addAccountHistory(
      db,
      result.insertedId,
      'created',
      `Account created: ${parsed.data.name}${parsed.data.companyName ? ` (${parsed.data.companyName})` : ''}`,
      auth.userId,
      (user as any)?.name,
      auth.email
    )
  } else {
    await addAccountHistory(
      db,
      result.insertedId,
      'created',
      `Account created: ${parsed.data.name}${parsed.data.companyName ? ` (${parsed.data.companyName})` : ''}`
    )
  }
  
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})

// PUT /api/crm/accounts/:id
accountsRouter.put('/:id', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    companyName: z.string().optional(),
    primaryContactName: z.string().optional(),
    primaryContactEmail: z.string().email().optional(),
    primaryContactPhone: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    
    // Get current account for comparison
    const currentAccount = await db.collection('accounts').findOne({ _id })
    if (!currentAccount) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }
    
    const update: any = parsed.data
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let user: any = null
    if (auth) {
      user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    }
    
    // Track field changes
    const fieldsToTrack = ['name', 'companyName', 'primaryContactName', 'primaryContactEmail', 'primaryContactPhone']
    let hasChanges = false
    
    for (const field of fieldsToTrack) {
      if (update[field] !== undefined && update[field] !== (currentAccount as any)[field]) {
        hasChanges = true
        const fieldName = field === 'companyName' ? 'Company name' : field === 'primaryContactName' ? 'Primary contact name' : field === 'primaryContactEmail' ? 'Primary contact email' : field === 'primaryContactPhone' ? 'Primary contact phone' : 'Name'
        await addAccountHistory(
          db,
          _id,
          'field_changed',
          `${fieldName} changed from "${(currentAccount as any)[field] ?? 'empty'}" to "${update[field] ?? 'empty'}"`,
          auth?.userId,
          user?.name,
          auth?.email,
          (currentAccount as any)[field],
          update[field]
        )
      }
    }
    
    await db.collection('accounts').updateOne({ _id }, { $set: update })
    
    // Add general update entry if no specific changes were tracked
    if (!hasChanges) {
      await addAccountHistory(
        db,
        _id,
        'updated',
        'Account updated',
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

// GET /api/crm/accounts/:id/history
accountsRouter.get('/:id/history', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const account = await db.collection('accounts').findOne({ _id })
    if (!account) return res.status(404).json({ data: null, error: 'not_found' })
    const createdAt = _id.getTimestamp()
    
    // Get all history entries for this account, sorted by date (newest first)
    const historyEntries = await db.collection('account_history')
      .find({ accountId: _id })
      .sort({ createdAt: -1 })
      .toArray() as AccountHistoryEntry[]
    
    // Related records (deals, quotes, invoices, activities)
    const deals = await db.collection('deals').find({ accountId: _id }).project({ title: 1, amount: 1, stage: 1, dealNumber: 1, closeDate: 1 }).sort({ _id: -1 }).limit(200).toArray()
    const quotes = await db.collection('quotes').find({ accountId: _id }).project({ title: 1, status: 1, quoteNumber: 1, total: 1, updatedAt: 1, createdAt: 1 }).sort({ updatedAt: -1 }).limit(200).toArray()
    const invoices = await db.collection('invoices').find({ accountId: _id }).project({ title: 1, invoiceNumber: 1, total: 1, status: 1, issuedAt: 1, dueDate: 1, updatedAt: 1 }).sort({ updatedAt: -1 }).limit(200).toArray()
    const activities = await db.collection('activities').find({ accountId: _id }).project({ type: 1, subject: 1, at: 1 }).sort({ at: -1 }).limit(200).toArray()
    
    res.json({ 
      data: { 
        history: historyEntries,
        createdAt, 
        deals, 
        quotes, 
        invoices, 
        activities,
        account: {
          name: (account as any).name,
          companyName: (account as any).companyName,
          accountNumber: (account as any).accountNumber,
          createdAt,
        }
      }, 
      error: null 
    })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})


