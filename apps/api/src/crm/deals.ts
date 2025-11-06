import { Router } from 'express'
import { getDb } from '../db.js'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { requireAuth } from '../auth/rbac.js'

export const dealsRouter = Router()

// Types for deal history
type DealHistoryEntry = {
  _id: ObjectId
  dealId: ObjectId
  eventType: 'created' | 'updated' | 'status_changed' | 'stage_changed' | 'amount_changed' | 'field_changed'
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
async function addDealHistory(
  db: any,
  dealId: ObjectId,
  eventType: DealHistoryEntry['eventType'],
  description: string,
  userId?: string,
  userName?: string,
  userEmail?: string,
  oldValue?: any,
  newValue?: any,
  metadata?: Record<string, any>
) {
  try {
    await db.collection('deal_history').insertOne({
      _id: new ObjectId(),
      dealId,
      eventType,
      description,
      userId,
      userName,
      userEmail,
      oldValue,
      newValue,
      metadata,
      createdAt: new Date(),
    } as DealHistoryEntry)
  } catch (err) {
    console.error('Failed to add deal history:', err)
    // Don't fail the main operation if history fails
  }
}

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
  
  // Backfill deal numbers for deals that don't have them
  try {
    const dealsWithoutNumber = await coll.find({ $or: [{ dealNumber: { $exists: false } }, { dealNumber: null }] }).limit(100).toArray()
    if (dealsWithoutNumber.length > 0) {
      // Get current max deal number
      const maxDoc = await coll.find({ dealNumber: { $type: 'number' } }).project({ dealNumber: 1 }).sort({ dealNumber: -1 }).limit(1).next()
      let nextNumber = typeof maxDoc?.dealNumber === 'number' ? maxDoc.dealNumber : 100000
      
      // Try to get from sequence counter
      try {
        const { getNextSequence } = await import('../db.js')
        const counterValue = await getNextSequence('dealNumber')
        if (counterValue > nextNumber) nextNumber = counterValue - 1
      } catch {}
      
      // Assign numbers to deals without them
      for (const deal of dealsWithoutNumber) {
        nextNumber += 1
        await coll.updateOne({ _id: deal._id }, { $set: { dealNumber: nextNumber } })
      }
      
      // Update counter if we assigned numbers
      if (dealsWithoutNumber.length > 0) {
        try {
          const counters = db.collection('counters')
          await counters.updateOne(
            { _id: 'dealNumber' as any },
            { $set: { seq: nextNumber } },
            { upsert: true }
          )
        } catch {}
      }
    }
  } catch (err) {
    // Don't fail the request if backfill fails
    console.error('Failed to backfill deal numbers:', err)
  }
  
  const [items, total] = await Promise.all([
    coll.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
    coll.countDocuments(filter),
  ])
  // Ensure all _id fields are serialized as strings
  const serializedItems = items.map((item: any) => ({
    ...item,
    _id: item._id ? String(item._id) : item._id,
    accountId: item.accountId ? String(item.accountId) : item.accountId,
    marketingCampaignId: item.marketingCampaignId ? String(item.marketingCampaignId) : item.marketingCampaignId,
  }))
  res.json({ data: { items: serializedItems, total, page, limit }, error: null })
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
    
    // Generate dealNumber starting at 100001
    // Retry logic to handle race conditions and duplicate key errors
    let dealNumber: number | undefined
    let result: any
    let attempts = 0
    const maxAttempts = 10
    
    while (attempts < maxAttempts) {
      try {
        // Try to get next sequence (only on first attempt)
        if (dealNumber === undefined) {
          try {
            const { getNextSequence } = await import('../db.js')
            dealNumber = await getNextSequence('dealNumber')
          } catch {}
          // Fallback if counter not initialized
          if (dealNumber === undefined) {
            try {
              const last = await db
                .collection('deals')
                .find({ dealNumber: { $type: 'number' } })
                .project({ dealNumber: 1 })
                .sort({ dealNumber: -1 })
                .limit(1)
                .toArray()
              dealNumber = Number((last[0] as any)?.dealNumber ?? 100000) + 1
            } catch {
              dealNumber = 100001
            }
          }
        } else {
          // If previous attempt failed, increment and try next number
          dealNumber++
        }
        
        const docWithNumber = { ...doc, dealNumber }
        result = await db.collection('deals').insertOne(docWithNumber)
        break // Success, exit loop
      } catch (err: any) {
        // Check if it's a duplicate key error
        if (err.code === 11000 && err.keyPattern?.dealNumber) {
          attempts++
          if (attempts >= maxAttempts) {
            return res.status(500).json({ data: null, error: 'failed_to_generate_deal_number' })
          }
          // Continue loop to retry with incremented number
          continue
        }
        // Other errors, rethrow
        throw err
      }
    }
    
    if (!result || dealNumber === undefined) {
      return res.status(500).json({ data: null, error: 'failed_to_create_deal' })
    }
    
    // Add history entry for creation
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    if (auth) {
      const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
      await addDealHistory(
        db,
        result.insertedId,
        'created',
        `Deal created: ${title}`,
        auth.userId,
        (user as any)?.name,
        auth.email
      )
    } else {
      await addDealHistory(
        db,
        result.insertedId,
        'created',
        `Deal created: ${title}`
      )
    }
    
    // Ensure _id is serialized as a string
    const responseData = {
      _id: String(result.insertedId),
      ...doc,
      dealNumber,
      accountId: doc.accountId ? String(doc.accountId) : doc.accountId,
      marketingCampaignId: doc.marketingCampaignId ? String(doc.marketingCampaignId) : doc.marketingCampaignId,
    }
    return res.status(201).json({ data: responseData, error: null })
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
    const currentDeal = await db.collection('deals').findOne({ _id })
    if (!currentDeal) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }
    
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let user: any = null
    if (auth) {
      user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    }
    
    // Track stage change
    if (parsed.data.stage !== (currentDeal as any).stage) {
      await addDealHistory(
        db,
        _id,
        'stage_changed',
        `Stage changed from "${(currentDeal as any).stage}" to "${parsed.data.stage}"`,
        auth?.userId,
        user?.name,
        auth?.email,
        (currentDeal as any).stage,
        parsed.data.stage
      )
    }
    
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
    marketingCampaignId: z.string().optional().or(z.literal('')),
    attributionToken: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  // Trim and validate the ID
  const idParam = String(req.params.id || '').trim()
  if (!idParam) {
    return res.status(400).json({ data: null, error: 'invalid_id', details: 'ID parameter is empty' })
  }
  if (!ObjectId.isValid(idParam)) {
    return res.status(400).json({ 
      data: null, 
      error: 'invalid_id', 
      details: `ID "${idParam}" (length: ${idParam.length}) is not a valid ObjectId. Must be exactly 24 hex characters.` 
    })
  }
  try {
    const _id = new ObjectId(idParam)
    
    // Get current deal for comparison
    const currentDeal = await db.collection('deals').findOne({ _id })
    if (!currentDeal) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }
    
    const update: any = { ...parsed.data }
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let user: any = null
    if (auth) {
      user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    }
    
    if (update.accountId) update.accountId = new ObjectId(update.accountId)
    if (update.marketingCampaignId === '') {
      update.marketingCampaignId = null
    } else if (update.marketingCampaignId && ObjectId.isValid(update.marketingCampaignId)) {
      update.marketingCampaignId = new ObjectId(update.marketingCampaignId)
    }
    if (update.attributionToken === '') delete update.attributionToken
    const closedWon = 'Contract Signed / Closed Won'
    if (update.closeDate) update.closeDate = new Date(`${update.closeDate}T12:00:00Z`)

    // Track stage changes
    if (update.stage && update.stage !== (currentDeal as any).stage) {
      await addDealHistory(
        db,
        _id,
        'stage_changed',
        `Stage changed from "${(currentDeal as any).stage}" to "${update.stage}"`,
        auth?.userId,
        user?.name,
        auth?.email,
        (currentDeal as any).stage,
        update.stage
      )
    }
    
    // Track amount changes
    if (update.amount !== undefined && update.amount !== (currentDeal as any).amount) {
      const oldAmount = (currentDeal as any).amount ?? 0
      const newAmount = update.amount ?? 0
      await addDealHistory(
        db,
        _id,
        'amount_changed',
        `Amount changed from $${oldAmount.toLocaleString()} to $${newAmount.toLocaleString()}`,
        auth?.userId,
        user?.name,
        auth?.email,
        oldAmount,
        newAmount
      )
    }
    
    // Track title changes
    if (update.title && update.title !== (currentDeal as any).title) {
      await addDealHistory(
        db,
        _id,
        'field_changed',
        `Title changed from "${(currentDeal as any).title}" to "${update.title}"`,
        auth?.userId,
        user?.name,
        auth?.email,
        (currentDeal as any).title,
        update.title
      )
    }
    
    // Track closeDate changes
    if (update.closeDate && update.closeDate.toString() !== ((currentDeal as any).closeDate?.toString() || '')) {
      await addDealHistory(
        db,
        _id,
        'field_changed',
        `Close date changed to ${new Date(update.closeDate).toLocaleDateString()}`,
        auth?.userId,
        user?.name,
        auth?.email
      )
    }

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
    
    // Add general update entry if no specific changes were tracked
    if (!update.stage && update.amount === undefined && !update.title && !update.closeDate) {
      await addDealHistory(
        db,
        _id,
        'updated',
        'Deal updated',
        auth?.userId,
        user?.name,
        auth?.email
      )
    }
    
    res.json({ data: { ok: true }, error: null })
  } catch (err: any) {
    // If it's already a validation error, return it
    if (err?.response) {
      throw err
    }
    // Otherwise, it's likely an ObjectId construction error
    console.error('Deal update error:', { id: idParam, error: err })
    res.status(400).json({ 
      data: null, 
      error: 'invalid_id',
      details: `Failed to process ID "${idParam}": ${err?.message || 'Unknown error'}`
    })
  }
})

// GET /api/crm/deals/:id/history
dealsRouter.get('/:id/history', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const d = await db.collection('deals').findOne({ _id })
    if (!d) return res.status(404).json({ data: null, error: 'not_found' })
    
    // Get all history entries for this deal, sorted by date (newest first)
    const historyEntries = await db.collection('deal_history')
      .find({ dealId: _id })
      .sort({ createdAt: -1 })
      .toArray() as DealHistoryEntry[]
    
    res.json({ 
      data: { 
        history: historyEntries,
        deal: { 
          title: (d as any).title, 
          stage: (d as any).stage, 
          amount: (d as any).amount, 
          dealNumber: (d as any).dealNumber, 
          createdAt: (d as any).createdAt || _id.getTimestamp(),
          updatedAt: (d as any).updatedAt 
        } 
      }, 
      error: null 
    })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})


