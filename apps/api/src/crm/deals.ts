import { Router } from 'express'
import { getDb } from '../db.js'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { requireAuth, requirePermission } from '../auth/rbac.js'
import { sendAuthEmail } from '../auth/email.js'
import { env } from '../env.js'
import { createStandardEmailTemplate, createStandardTextEmail, createContentBox, createField } from '../lib/email-templates.js'

export const dealsRouter = Router()

// Debug middleware to log all requests to deals router
dealsRouter.use((req, _res, next) => {
  console.log('🔍 DEALS ROUTER - REQUEST:', req.method, req.path, 'Full URL:', req.originalUrl)
  next()
})

// Types for deal history
type DealHistoryEntry = {
  _id: ObjectId
  dealId: ObjectId
  eventType:
    | 'created'
    | 'updated'
    | 'status_changed'
    | 'stage_changed'
    | 'amount_changed'
    | 'field_changed'
    | 'approval_requested'
    | 'approved'
    | 'rejected'
  description: string
  userId?: string
  userName?: string
  userEmail?: string
  oldValue?: any
  newValue?: any
  metadata?: Record<string, any>
  createdAt: Date
}

// Types for deal approval requests
type DealApprovalRequestDoc = {
  _id: ObjectId
  dealId: ObjectId
  dealNumber?: number
  dealTitle?: string
  requesterId: string
  requesterEmail: string
  requesterName?: string
  approverEmail: string
  approverId?: string
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: Date
  reviewedAt?: Date
  reviewedBy?: string
  reviewNotes?: string
  createdAt: Date
  updatedAt: Date
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
  
  // Backfill deal numbers for deals that don't have them or have duplicates
  try {
    // Find deals without numbers or with duplicate numbers
    const dealsWithoutNumber = await coll.find({ $or: [{ dealNumber: { $exists: false } }, { dealNumber: null }] }).limit(100).toArray()
    
    // Find deals with duplicate dealNumbers (group by dealNumber and find those with count > 1)
    const allDeals = await coll.find({ dealNumber: { $type: 'number' } }).project({ _id: 1, dealNumber: 1 }).toArray()
    const dealNumberCounts = new Map<number, string[]>()
    for (const deal of allDeals) {
      const num = (deal as any).dealNumber
      if (typeof num === 'number') {
        if (!dealNumberCounts.has(num)) {
          dealNumberCounts.set(num, [])
        }
        dealNumberCounts.get(num)!.push(String((deal as any)._id))
      }
    }
    // Get IDs of deals with duplicate numbers (keep first, fix the rest)
    const duplicateDealIds: string[] = []
    for (const [num, ids] of dealNumberCounts.entries()) {
      if (ids.length > 1) {
        // Keep the first one, mark the rest for renumbering
        duplicateDealIds.push(...ids.slice(1))
      }
    }
    
    const dealsToFix = [...dealsWithoutNumber, ...(duplicateDealIds.length > 0 ? await coll.find({ _id: { $in: duplicateDealIds.map(id => new ObjectId(id)) } }).limit(100).toArray() : [])]
    
    if (dealsToFix.length > 0) {
      // Get current max deal number from deals that are NOT in the fixes list
      // This ensures we don't count duplicates when determining the next number
      const fixedDealIds = new Set(dealsToFix.map(d => String(d._id)))
      const allValidDeals = await coll.find({ dealNumber: { $type: 'number' } }).project({ _id: 1, dealNumber: 1 }).toArray()
      const validDealNumbers = allValidDeals
        .filter(d => !fixedDealIds.has(String(d._id)))
        .map(d => (d as any).dealNumber)
        .filter((n): n is number => typeof n === 'number')
      
      let nextNumber = validDealNumbers.length > 0 ? Math.max(...validDealNumbers) : 100000
      
      // Try to get from sequence counter
      try {
        const { getNextSequence } = await import('../db.js')
        const counterValue = await getNextSequence('dealNumber')
        if (counterValue > nextNumber) nextNumber = counterValue - 1
      } catch {}
      
      // Assign unique numbers to deals
      for (const deal of dealsToFix) {
        nextNumber += 1
        await coll.updateOne({ _id: deal._id }, { $set: { dealNumber: nextNumber } })
      }
      
      // Update counter if we assigned numbers
      if (dealsToFix.length > 0) {
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
  // Ensure all _id fields are serialized as strings and validate accountId
  const serializedItems = items.map((item: any) => {
    const accountIdStr = item.accountId ? String(item.accountId) : null
    // Validate accountId is a valid ObjectId (24 hex chars), if not, set to null
    const validAccountId = accountIdStr && /^[0-9a-fA-F]{24}$/.test(accountIdStr) ? accountIdStr : null
    
    return {
      ...item,
      _id: item._id ? String(item._id) : item._id,
      accountId: validAccountId,
      marketingCampaignId: item.marketingCampaignId ? String(item.marketingCampaignId) : item.marketingCampaignId,
    }
  })
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
  const forecastedCloseDateRaw = typeof raw.forecastedCloseDate === 'string' ? raw.forecastedCloseDate.trim() : undefined
  const accountNumberParsed = accountNumberRaw === undefined || accountNumberRaw === '' ? undefined : Number(accountNumberRaw)
  const amountParsed = amountRaw === undefined || amountRaw === '' ? undefined : Number(amountRaw)
  try {
    let accountObjectId: ObjectId | null = null
    let accountNumberValue: number | undefined
    if (accountIdRaw) {
      // Validate accountId is exactly 24 hex characters
      if (!/^[0-9a-fA-F]{24}$/.test(accountIdRaw)) {
        return res.status(400).json({ 
          data: null, 
          error: 'invalid_accountId',
          details: `Account ID "${accountIdRaw}" (length: ${accountIdRaw.length}) is not a valid ObjectId. Must be exactly 24 hex characters.`
        })
      }
      if (!ObjectId.isValid(accountIdRaw)) {
        return res.status(400).json({ 
          data: null, 
          error: 'invalid_accountId',
          details: `Account ID "${accountIdRaw}" failed MongoDB ObjectId validation.`
        })
      }
      accountObjectId = new ObjectId(accountIdRaw)
      // Verify the account actually exists
      const acc = await db.collection('accounts').findOne({ _id: accountObjectId })
      if (!acc) {
        return res.status(400).json({ data: null, error: 'account_not_found', details: `Account with ID "${accountIdRaw}" does not exist.` })
      }
      if (typeof (acc as any)?.accountNumber === 'number') {
        accountNumberValue = (acc as any).accountNumber as number
      }
    } else if (typeof accountNumberParsed === 'number' && Number.isFinite(accountNumberParsed)) {
      const acc = await db.collection('accounts').findOne({ accountNumber: accountNumberParsed })
      if (!acc?._id) return res.status(400).json({ data: null, error: 'account_not_found', details: `Account with number ${accountNumberParsed} does not exist.` })
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
      approver: typeof raw.approver === 'string' ? raw.approver.trim() || undefined : undefined,
      ownerId: typeof raw.ownerId === 'string' ? raw.ownerId.trim() || undefined : undefined,
    }
    if (ObjectId.isValid(raw.marketingCampaignId)) doc.marketingCampaignId = new ObjectId(raw.marketingCampaignId)
    if (typeof raw.attributionToken === 'string') doc.attributionToken = raw.attributionToken.trim()
    if (typeof accountNumberValue === 'number') doc.accountNumber = accountNumberValue
    // Normalize date-only strings to midday UTC to avoid timezone shifting one day back
    if (closeDateRaw) doc.closeDate = new Date(`${closeDateRaw}T12:00:00Z`)
    if (forecastedCloseDateRaw) doc.forecastedCloseDate = new Date(`${forecastedCloseDateRaw}T12:00:00Z`)
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

// POST /api/crm/deals/:id/request-approval - Request approval for a deal
dealsRouter.post('/:id/request-approval', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const dealId = new ObjectId(req.params.id)

    const deal = await db.collection('deals').findOne({ _id: dealId })
    if (!deal) {
      return res.status(404).json({ data: null, error: 'deal_not_found' })
    }

    const dealData = deal as any
    const approverEmailRaw = dealData.approver
    if (!approverEmailRaw || typeof approverEmailRaw !== 'string') {
      return res.status(400).json({ data: null, error: 'approver_email_required' })
    }
    const approverEmail = approverEmailRaw.toLowerCase()

    // Requester info
    const requester = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    if (!requester) {
      return res.status(404).json({ data: null, error: 'requester_not_found' })
    }
    const requesterData = requester as any

    // Approver must exist and be a manager
    const approver = await db.collection('users').findOne({ email: approverEmail })
    if (!approver) {
      return res.status(404).json({ data: null, error: 'approver_not_found' })
    }
    const approverData = approver as any

    const managerRole = await db.collection('roles').findOne({ name: 'manager' })
    if (!managerRole) {
      return res.status(500).json({ data: null, error: 'manager_role_not_found' })
    }

    const hasManagerRole = await db.collection('user_roles').findOne({
      userId: approverData._id.toString(),
      roleId: managerRole._id,
    })
    if (!hasManagerRole) {
      return res.status(403).json({ data: null, error: 'approver_not_manager' })
    }

    // Ensure there's no existing pending request for this approver/deal
    const existingRequest = (await db.collection('deal_approval_requests').findOne({
      dealId,
      approverEmail,
      status: 'pending',
    })) as DealApprovalRequestDoc | null

    if (existingRequest) {
      return res.status(400).json({ data: null, error: 'approval_request_already_exists' })
    }

    const now = new Date()
    const approvalRequest: DealApprovalRequestDoc = {
      _id: new ObjectId(),
      dealId,
      dealNumber: dealData.dealNumber,
      dealTitle: dealData.title,
      requesterId: auth.userId,
      requesterEmail: requesterData.email,
      requesterName: requesterData.name,
      approverEmail,
      approverId: approverData._id.toString(),
      status: 'pending',
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    }

    await db.collection('deal_approval_requests').insertOne(approvalRequest)

    // Move deal to "Submitted for Review" stage
    const previousStage = dealData.stage
    await db.collection('deals').updateOne(
      { _id: dealId },
      { $set: { stage: 'Submitted for Review', updatedAt: now } },
    )

    await addDealHistory(
      db,
      dealId,
      'approval_requested',
      `Approval requested from ${approverEmail}`,
      auth.userId,
      requesterData.name,
      requesterData.email,
      previousStage,
      'Submitted for Review',
      { approvalRequestId: approvalRequest._id, approverEmail },
    )

    // Email approver with a link to the deal approval queue
    const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
    const approvalQueueUrl = `${baseUrl}/apps/crm/deals/approval-queue`

    try {
      const dealDetails = `
        <div style="font-size: 22px; font-weight: bold; color: #667eea; margin-bottom: 20px;">
          Deal ${dealData.dealNumber ? `#${dealData.dealNumber}` : ''} – ${dealData.title || 'Untitled'}
        </div>
        ${createField('Requested By', requesterData.name || requesterData.email)}
        ${createField('Amount', `$${(dealData.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
        ${dealData.stage ? createField('Stage', dealData.stage) : ''}
        ${dealData.accountName ? createField('Account', dealData.accountName) : ''}
      `

      const htmlBody = createStandardEmailTemplate({
        title: 'Deal Approval Request',
        emoji: '💼',
        subtitle: `Deal ${dealData.dealNumber ? `#${dealData.dealNumber}` : ''}`,
        bodyContent: `
          <p>A new deal requires your approval:</p>
          ${createContentBox(dealDetails)}
          <p style="font-size: 13px; color: #6b7280; margin-top: 20px;">
            Review all pending approval requests in your approval queue.
          </p>
        `,
        buttonText: 'View Approval Queue',
        buttonUrl: approvalQueueUrl,
        footerText: 'Please review and approve or reject this deal at your earliest convenience.',
      })

      const textBody = createStandardTextEmail({
        title: 'Deal Approval Request',
        emoji: '💼',
        subtitle: `Deal ${dealData.dealNumber ? `#${dealData.dealNumber}` : ''}`,
        bodyContent: `
A new deal requires your approval:

Deal: ${dealData.dealNumber ? `#${dealData.dealNumber}` : 'N/A'} - ${dealData.title || 'Untitled'}
Requested By: ${requesterData.name || requesterData.email}
Amount: $${(dealData.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
${dealData.stage ? `Stage: ${dealData.stage}\n` : ''}
${dealData.accountName ? `Account: ${dealData.accountName}\n` : ''}

Review all pending approval requests in your approval queue.
        `,
        buttonText: 'View Approval Queue',
        buttonUrl: approvalQueueUrl,
        footerText: 'Please review and approve or reject this deal at your earliest convenience.',
      })

      await sendAuthEmail({
        to: approverEmail,
        subject: `💼 Deal Approval Request: ${dealData.dealNumber ? `#${dealData.dealNumber}` : dealData.title}`,
        checkPreferences: true,
        html: htmlBody,
        text: textBody,
      })
    } catch (emailErr) {
      console.error('Failed to send deal approval request email:', emailErr)
      // Do not fail the request if email sending fails
    }

    res.json({
      data: { approvalRequestId: approvalRequest._id, message: 'Approval request sent' },
      error: null,
    })
  } catch (err: any) {
    console.error('Request deal approval error:', err)
    if (err.message?.includes('invalid_id')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: err.message || 'failed_to_request_approval' })
  }
})

// GET /api/crm/deals/approval-queue - Get approval queue for managers
dealsRouter.get('/approval-queue', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  try {
    const auth = (req as any).auth as { userId: string; email: string }

    // Check roles
    const userRoles = await db.collection('user_roles').find({ userId: auth.userId } as any).toArray()
    const roleIds = userRoles.map((ur: any) => ur.roleId)
    if (roleIds.length === 0) {
      return res.status(403).json({ data: null, error: 'manager_access_required' })
    }

    const roles = await db.collection('roles').find({ _id: { $in: roleIds } } as any).toArray()
    const roleNames = roles.map((r: any) => r.name)
    const hasManagerRole = roleNames.includes('manager')
    const hasAdminRole = roleNames.includes('admin')

    if (!hasManagerRole && !hasAdminRole) {
      return res.status(403).json({ data: null, error: 'manager_access_required' })
    }

    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    if (!user) {
      return res.status(404).json({ data: null, error: 'user_not_found' })
    }
    const userData = user as any

    const status = (req.query.status as string) || 'all'
    const query: any = { approverEmail: userData.email.toLowerCase() }
    if (status !== 'all') query.status = status

    const requests = (await db
      .collection<DealApprovalRequestDoc>('deal_approval_requests')
      .find(query)
      .sort({ requestedAt: -1 })
      .limit(100)
      .toArray()) as DealApprovalRequestDoc[]

    const dealIds = Array.from(
      new Set(requests.map((r) => r.dealId).filter((id): id is ObjectId => !!id)),
    )

    const dealsById = new Map<string, any>()
    if (dealIds.length > 0) {
      const deals = await db
        .collection('deals')
        .find({ _id: { $in: dealIds } } as any)
        .toArray()
      for (const d of deals) {
        dealsById.set(String(d._id), d)
      }
    }

    const items = requests.map((r) => {
      const deal = r.dealId ? dealsById.get(String(r.dealId)) : null
      return {
        _id: String(r._id),
        dealId: String(r.dealId),
        deal: deal
          ? {
              _id: String(deal._id),
              dealNumber: deal.dealNumber,
              title: deal.title,
              amount: deal.amount,
              stage: deal.stage,
              accountId: deal.accountId ? String(deal.accountId) : undefined,
            }
          : undefined,
        requesterId: r.requesterId,
        requesterEmail: r.requesterEmail,
        requesterName: r.requesterName,
        approverEmail: r.approverEmail,
        status: r.status,
        requestedAt: r.requestedAt,
        reviewedAt: r.reviewedAt,
        reviewedBy: r.reviewedBy,
        reviewNotes: r.reviewNotes,
      }
    })

    res.json({ data: { items }, error: null })
  } catch (err: any) {
    console.error('Failed to get deal approval queue:', err)
    res.status(500).json({ data: null, error: err.message || 'failed_to_get_approval_queue' })
  }
})

// POST /api/crm/deals/:id/approve - Approve a deal
dealsRouter.post('/:id/approve', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const dealId = new ObjectId(req.params.id)
    const { reviewNotes } = req.body || {}

    const userRoles = await db.collection('user_roles').find({ userId: auth.userId } as any).toArray()
    const roleIds = userRoles.map((ur: any) => ur.roleId)
    if (roleIds.length === 0) {
      return res.status(403).json({ data: null, error: 'manager_access_required' })
    }

    const roles = await db.collection('roles').find({ _id: { $in: roleIds } } as any).toArray()
    const roleNames = roles.map((r: any) => r.name)
    const hasManagerRole = roleNames.includes('manager')
    const hasAdminRole = roleNames.includes('admin')
    if (!hasManagerRole && !hasAdminRole) {
      return res.status(403).json({ data: null, error: 'manager_access_required' })
    }

    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    if (!user) {
      return res.status(404).json({ data: null, error: 'user_not_found' })
    }
    const userData = user as any

    const approvalRequest = (await db.collection('deal_approval_requests').findOne({
      dealId,
      approverEmail: userData.email.toLowerCase(),
      status: 'pending',
    })) as DealApprovalRequestDoc | null

    if (!approvalRequest) {
      return res.status(404).json({ data: null, error: 'approval_request_not_found' })
    }

    const now = new Date()
    await db.collection('deal_approval_requests').updateOne(
      { _id: approvalRequest._id },
      {
        $set: {
          status: 'approved',
          reviewedAt: now,
          reviewedBy: auth.userId,
          reviewNotes: typeof reviewNotes === 'string' ? reviewNotes : undefined,
          updatedAt: now,
        },
      },
    )

    const currentDeal = await db.collection('deals').findOne({ _id: dealId })
    if (!currentDeal) {
      return res.status(404).json({ data: null, error: 'deal_not_found' })
    }

    const update: any = {
      stage: 'Approved / Ready for Signature',
      approvedAt: now,
      updatedAt: now,
    }
    if (!(currentDeal as any).approver) {
      update.approver = userData.email
    }

    await db.collection('deals').updateOne({ _id: dealId }, { $set: update })

    await addDealHistory(
      db,
      dealId,
      'approved',
      `Deal approved by ${userData.name || userData.email}${
        typeof reviewNotes === 'string' && reviewNotes ? `: ${reviewNotes}` : ''
      }`,
      auth.userId,
      userData.name,
      userData.email,
      (currentDeal as any).stage,
      'Approved / Ready for Signature',
      { approvalRequestId: approvalRequest._id, reviewNotes },
    )

    // Notify requester
    try {
      const deal = await db.collection('deals').findOne({ _id: dealId })
      const dealData = deal as any
      const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
      const dealUrl = `${baseUrl}/apps/crm/deals?deal=${dealId.toHexString()}`

      const dealDetails = `
        <div style="font-size: 22px; font-weight: bold; color: #10b981; margin-bottom: 20px;">
          ✅ Deal ${dealData?.dealNumber ? `#${dealData.dealNumber}` : ''} – ${dealData?.title || 'Untitled'}
        </div>
        ${createField('Approved By', userData.name || userData.email)}
        ${createField('Amount', `$${(dealData?.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
        ${dealData?.stage ? createField('Stage', dealData.stage) : ''}
        ${reviewNotes ? createField('Approval Notes', reviewNotes) : ''}
      `

      const htmlBody = createStandardEmailTemplate({
        title: 'Deal Approved',
        emoji: '✅',
        subtitle: `Deal ${dealData?.dealNumber ? `#${dealData.dealNumber}` : ''}`,
        bodyContent: `
          <p>Great news! Your deal has been approved:</p>
          ${createContentBox(dealDetails)}
          <p style="font-size: 13px; color: #6b7280; margin-top: 20px;">
            This deal is now in "Approved / Ready for Signature" stage.
          </p>
        `,
        buttonText: 'View Deal',
        buttonUrl: dealUrl,
        footerText: 'Your deal has been approved and is ready to move forward.',
      })

      const textBody = createStandardTextEmail({
        title: 'Deal Approved',
        emoji: '✅',
        subtitle: `Deal ${dealData?.dealNumber ? `#${dealData.dealNumber}` : ''}`,
        bodyContent: `
Great news! Your deal has been approved:

Deal: ${dealData?.dealNumber ? `#${dealData.dealNumber}` : 'N/A'} - ${dealData?.title || 'Untitled'}
Approved By: ${userData.name || userData.email}
Amount: $${(dealData?.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
${dealData?.stage ? `Stage: ${dealData.stage}\n` : ''}
${reviewNotes ? `Approval Notes: ${reviewNotes}\n` : ''}

This deal is now in "Approved / Ready for Signature" stage.
        `,
        buttonText: 'View Deal',
        buttonUrl: dealUrl,
        footerText: 'Your deal has been approved and is ready to move forward.',
      })

      await sendAuthEmail({
        to: approvalRequest.requesterEmail,
        subject: `✅ Deal Approved: ${dealData?.dealNumber ? `#${dealData.dealNumber}` : dealData?.title || 'Untitled'}`,
        checkPreferences: true,
        html: htmlBody,
        text: textBody,
      })
    } catch (emailErr) {
      console.error('Failed to send deal approval email:', emailErr)
    }

    res.json({ data: { message: 'Deal approved' }, error: null })
  } catch (err: any) {
    console.error('Approve deal error:', err)
    if (err.message?.includes('invalid_id')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: err.message || 'failed_to_approve_deal' })
  }
})

// POST /api/crm/deals/:id/reject - Reject a deal
dealsRouter.post('/:id/reject', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const dealId = new ObjectId(req.params.id)
    const { reviewNotes } = req.body || {}

    const userRoles = await db.collection('user_roles').find({ userId: auth.userId } as any).toArray()
    const roleIds = userRoles.map((ur: any) => ur.roleId)
    if (roleIds.length === 0) {
      return res.status(403).json({ data: null, error: 'manager_access_required' })
    }

    const roles = await db.collection('roles').find({ _id: { $in: roleIds } } as any).toArray()
    const roleNames = roles.map((r: any) => r.name)
    const hasManagerRole = roleNames.includes('manager')
    const hasAdminRole = roleNames.includes('admin')
    if (!hasManagerRole && !hasAdminRole) {
      return res.status(403).json({ data: null, error: 'manager_access_required' })
    }

    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    if (!user) {
      return res.status(404).json({ data: null, error: 'user_not_found' })
    }
    const userData = user as any

    const approvalRequest = (await db.collection('deal_approval_requests').findOne({
      dealId,
      approverEmail: userData.email.toLowerCase(),
      status: 'pending',
    })) as DealApprovalRequestDoc | null

    if (!approvalRequest) {
      return res.status(404).json({ data: null, error: 'approval_request_not_found' })
    }

    const now = new Date()
    await db.collection('deal_approval_requests').updateOne(
      { _id: approvalRequest._id },
      {
        $set: {
          status: 'rejected',
          reviewedAt: now,
          reviewedBy: auth.userId,
          reviewNotes: typeof reviewNotes === 'string' ? reviewNotes : undefined,
          updatedAt: now,
        },
      },
    )

    const currentDeal = await db.collection('deals').findOne({ _id: dealId })
    if (!currentDeal) {
      return res.status(404).json({ data: null, error: 'deal_not_found' })
    }

    await db.collection('deals').updateOne(
      { _id: dealId },
      {
        $set: {
          stage: 'Rejected / Returned for Revision',
          updatedAt: now,
        },
      },
    )

    await addDealHistory(
      db,
      dealId,
      'rejected',
      `Deal rejected by ${userData.name || userData.email}${
        typeof reviewNotes === 'string' && reviewNotes ? `: ${reviewNotes}` : ''
      }`,
      auth.userId,
      userData.name,
      userData.email,
      (currentDeal as any).stage,
      'Rejected / Returned for Revision',
      { approvalRequestId: approvalRequest._id, reviewNotes },
    )

    // Notify requester
    try {
      const deal = await db.collection('deals').findOne({ _id: dealId })
      const dealData = deal as any

      await sendAuthEmail({
        to: approvalRequest.requesterEmail,
        subject: `Deal Rejected: ${dealData?.dealNumber ? `#${dealData.dealNumber}` : dealData?.title || 'Untitled'}`,
        checkPreferences: true,
        html: `
          <h2>Deal Rejected</h2>
          <p>Your deal has been reviewed and rejected:</p>
          <ul>
            <li><strong>Deal:</strong> ${dealData?.dealNumber ? `#${dealData.dealNumber}` : 'N/A'} - ${
          dealData?.title || 'Untitled'
        }</li>
            <li><strong>Reviewed by:</strong> ${userData.name || userData.email}</li>
            <li><strong>Reviewed at:</strong> ${now.toLocaleString()}</li>
            ${reviewNotes ? `<li><strong>Notes:</strong> ${reviewNotes}</li>` : ''}
          </ul>
        `,
        text: `Deal Rejected

Your deal has been reviewed and rejected:

Deal: ${dealData?.dealNumber ? `#${dealData.dealNumber}` : 'N/A'} - ${dealData?.title || 'Untitled'}
Reviewed by: ${userData.name || userData.email}
Reviewed at: ${now.toLocaleString()}
${reviewNotes ? `Notes: ${reviewNotes}` : ''}
        `,
      })
    } catch (emailErr) {
      console.error('Failed to send deal rejection email:', emailErr)
    }

    res.json({ data: { message: 'Deal rejected' }, error: null })
  } catch (err: any) {
    console.error('Reject deal error:', err)
    if (err.message?.includes('invalid_id')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: err.message || 'failed_to_reject_deal' })
  }
})

// PUT /api/crm/deals/:id
dealsRouter.put('/:id', async (req, res) => {
  try {
    // Log the incoming request for debugging
    console.log('PUT /api/crm/deals/:id', { 
      id: req.params.id, 
      body: req.body,
      bodyKeys: Object.keys(req.body || {}),
      params: req.params
    })
    
    // Trim and validate the ID FIRST, before any other processing
    const idParam = String(req.params.id || '').trim()
    console.log('Validating ID:', { idParam, length: idParam.length, isValid: ObjectId.isValid(idParam) })
    
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
    
    const schema = z.object({
      title: z.string().min(1).optional(),
      accountId: z.string().min(1).optional(),
      amount: z.number().optional(),
      stage: z.string().optional(),
      closeDate: z.string().optional(),
      forecastedCloseDate: z.string().optional(),
      marketingCampaignId: z.string().optional().or(z.literal('')),
      attributionToken: z.string().optional(),
      approver: z.string().optional(),
      ownerId: z.string().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      console.error('Schema validation failed:', parsed.error)
      return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.errors })
    }
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
    
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
    
    if (update.accountId) {
      // Validate accountId is exactly 24 hex characters
      const accountIdStr = String(update.accountId).trim()
      if (!/^[0-9a-fA-F]{24}$/.test(accountIdStr)) {
        return res.status(400).json({ 
          data: null, 
          error: 'invalid_accountId',
          details: `Account ID "${accountIdStr}" (length: ${accountIdStr.length}) is not a valid ObjectId. Must be exactly 24 hex characters.`
        })
      }
      if (!ObjectId.isValid(accountIdStr)) {
        return res.status(400).json({ 
          data: null, 
          error: 'invalid_accountId',
          details: `Account ID "${accountIdStr}" failed MongoDB ObjectId validation.`
        })
      }
      // Verify the account actually exists
      const acc = await db.collection('accounts').findOne({ _id: new ObjectId(accountIdStr) })
      if (!acc) {
        return res.status(400).json({ 
          data: null, 
          error: 'account_not_found', 
          details: `Account with ID "${accountIdStr}" does not exist.` 
        })
      }
      update.accountId = new ObjectId(accountIdStr)
    }
    if (update.marketingCampaignId === '') {
      update.marketingCampaignId = null
    } else if (update.marketingCampaignId && ObjectId.isValid(update.marketingCampaignId)) {
      update.marketingCampaignId = new ObjectId(update.marketingCampaignId)
    }
    if (update.attributionToken === '') delete update.attributionToken
    const closedWon = 'Contract Signed / Closed Won'
    if (update.closeDate) update.closeDate = new Date(`${update.closeDate}T12:00:00Z`)
    if (update.forecastedCloseDate) update.forecastedCloseDate = new Date(`${update.forecastedCloseDate}T12:00:00Z`)

    const previousStage = (currentDeal as any).stage as string | undefined
    const movingToClosedWon = update.stage === closedWon && previousStage !== closedWon

    // Track stage changes
    if (update.stage && update.stage !== previousStage) {
      await addDealHistory(
        db,
        _id,
        'stage_changed',
        `Stage changed from "${previousStage ?? 'empty'}" to "${update.stage}"`,
        auth?.userId,
        user?.name,
        auth?.email,
        previousStage,
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

    // Track approver changes
    if (update.approver && update.approver !== (currentDeal as any).approver) {
      await addDealHistory(
        db,
        _id,
        'field_changed',
        `Approver changed from "${(currentDeal as any).approver ?? 'empty'}" to "${update.approver}"`,
        auth?.userId,
        user?.name,
        auth?.email,
        (currentDeal as any).approver,
        update.approver
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

    // If the deal just moved to Closed Won, auto-create a Renewal record (if one doesn't already exist)
    if (movingToClosedWon) {
      try {
        const renewals = db.collection('renewals')
        const existing = await renewals.findOne({ sourceDealId: _id })
        if (!existing) {
          const accountObjectId =
            (update.accountId as ObjectId | undefined) ?? ((currentDeal as any).accountId as ObjectId | undefined) ?? null

          let accountName: string | null = null
          let accountNumber: number | null = null
          if (accountObjectId) {
            const acc = await db.collection('accounts').findOne({ _id: accountObjectId })
            if (acc) {
              accountName = (acc as any).name ?? null
              accountNumber = (acc as any).accountNumber ?? null
            }
          }

          const amount = (update.amount as number | undefined) ?? ((currentDeal as any).amount as number | undefined) ?? 0
          const closeDateValue =
            (update.closeDate as Date | undefined) ?? ((currentDeal as any).closeDate as Date | undefined) ?? new Date()

          const termStart = closeDateValue
          const termEnd = new Date(termStart)
          termEnd.setFullYear(termEnd.getFullYear() + 1)

          const arr = amount
          const mrr = arr / 12

          const renewalDoc = {
            _id: new ObjectId(),
            accountId: accountObjectId,
            accountNumber,
            accountName,
            productId: null,
            productName: null,
            productSku: null,
            sourceDealId: _id,
            sourceInvoiceId: null,
            sourceType: 'deal' as const,
            name: (currentDeal as any).title || 'Closed-won deal',
            status: 'Active',
            termStart,
            termEnd,
            renewalDate: termEnd,
            mrr,
            arr,
            healthScore: null,
            churnRisk: null,
            upsellPotential: 'Medium',
            ownerId: auth?.userId ?? null,
            ownerName: user?.name ?? null,
            ownerEmail: auth?.email ?? null,
            notes: 'Auto-created from closed-won deal',
            createdAt: new Date(),
            updatedAt: new Date(),
          }

          await renewals.insertOne(renewalDoc)

          await addDealHistory(
            db,
            _id,
            'field_changed',
            `Auto-created renewal "${renewalDoc.name}" (MRR $${(renewalDoc.mrr ?? 0).toFixed(
              2,
            )}) from Closed Won stage`,
            auth?.userId,
            user?.name,
            auth?.email,
          )
        }
      } catch (err) {
        console.error('Failed to auto-create renewal from closed-won deal:', err)
      }
    }
    
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
    } catch (innerErr: any) {
      // Log the full error for debugging
      console.error('Deal update inner error:', { 
        id: idParam, 
        error: innerErr,
        message: innerErr?.message,
        stack: innerErr?.stack,
        name: innerErr?.name
      })
      
      // Check if it's an ObjectId construction error
      if (innerErr?.name === 'BSONTypeError' || innerErr?.message?.includes('ObjectId')) {
        return res.status(400).json({ 
          data: null, 
          error: 'invalid_id',
          details: `Invalid ObjectId format: "${idParam}". ${innerErr?.message || 'Unknown error'}`
        })
      }
      
      // Re-throw to outer catch
      throw innerErr
    }
  } catch (err: any) {
    // Log the full error for debugging
    console.error('Deal update error (outer):', { 
      error: err,
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
      params: req.params
    })
    
    // If it's already a validation error, return it
    if (err?.response) {
      throw err
    }
    
    // Generic error response
    res.status(400).json({ 
      data: null, 
      error: 'update_failed',
      details: `Failed to update deal: ${err?.message || 'Unknown error'}`
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

// POST /api/crm/deals/fix-duplicate-numbers (Admin only)
// This endpoint immediately fixes duplicate deal numbers
dealsRouter.post('/fix-duplicate-numbers', requireAuth, requirePermission('*'), async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const coll = db.collection('deals')
    
    // Find deals with duplicate dealNumbers
    const allDeals = await coll.find({ dealNumber: { $type: 'number' } }).project({ _id: 1, dealNumber: 1 }).toArray()
    const dealNumberCounts = new Map<number, string[]>()
    for (const deal of allDeals) {
      const num = (deal as any).dealNumber
      if (typeof num === 'number') {
        if (!dealNumberCounts.has(num)) {
          dealNumberCounts.set(num, [])
        }
        dealNumberCounts.get(num)!.push(String((deal as any)._id))
      }
    }
    
    // Get IDs of deals with duplicate numbers (keep first, fix the rest)
    const duplicateDealIds: string[] = []
    for (const [num, ids] of dealNumberCounts.entries()) {
      if (ids.length > 1) {
        // Keep the first one, mark the rest for renumbering
        duplicateDealIds.push(...ids.slice(1))
      }
    }
    
    if (duplicateDealIds.length === 0) {
      return res.json({
        data: {
          message: 'No duplicate deal numbers found.',
          results: { fixed: 0, total: allDeals.length }
        },
        error: null
      })
    }
    
    const dealsToFix = await coll.find({ _id: { $in: duplicateDealIds.map(id => new ObjectId(id)) } }).toArray()
    
    // Get current max deal number from deals that are NOT being fixed
    const fixedDealIds = new Set(dealsToFix.map(d => String(d._id)))
    const validDealNumbers = allDeals
      .filter(d => !fixedDealIds.has(String(d._id)))
      .map(d => (d as any).dealNumber)
      .filter((n): n is number => typeof n === 'number')
    
    let nextNumber = validDealNumbers.length > 0 ? Math.max(...validDealNumbers) : 100000
    
    // Try to get from sequence counter
    try {
      const { getNextSequence } = await import('../db.js')
      const counterValue = await getNextSequence('dealNumber')
      if (counterValue > nextNumber) nextNumber = counterValue - 1
    } catch {}
    
    // Assign unique numbers to deals
    for (const deal of dealsToFix) {
      nextNumber += 1
      await coll.updateOne({ _id: deal._id }, { $set: { dealNumber: nextNumber } })
    }
    
    // Update counter
    try {
      const counters = db.collection('counters')
      await counters.updateOne(
        { _id: 'dealNumber' as any },
        { $set: { seq: nextNumber } },
        { upsert: true }
      )
    } catch {}
    
    res.json({
      data: {
        message: `Fixed ${dealsToFix.length} deals with duplicate numbers.`,
        results: {
          fixed: dealsToFix.length,
          total: allDeals.length,
          nextNumber
        }
      },
      error: null
    })
  } catch (err: any) {
    console.error('Fix duplicate deal numbers error:', err)
    res.status(500).json({ data: null, error: 'fix_failed', details: err.message })
  }
})

// POST /api/crm/deals/fix-invalid-accountids (Admin only)
// This endpoint fixes deals with invalid accountId values by matching them to accounts using accountNumber
dealsRouter.post('/fix-invalid-accountids', requireAuth, requirePermission('*'), async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    // Find all deals
    const allDeals = await db.collection('deals').find({}).toArray()
    
    const results = {
      total: allDeals.length,
      fixed: 0,
      notFound: 0,
      alreadyValid: 0,
      errors: [] as Array<{ dealId: string; error: string }>
    }
    
    for (const deal of allDeals) {
      const dealId = (deal as any)._id
      const accountId = (deal as any).accountId
      const accountNumber = (deal as any).accountNumber
      
      // Check if accountId is invalid (not 24 hex characters or not a valid ObjectId)
      const accountIdStr = accountId ? String(accountId) : null
      const isValidAccountId = accountIdStr && /^[0-9a-fA-F]{24}$/.test(accountIdStr) && ObjectId.isValid(accountIdStr)
      
      if (isValidAccountId) {
        // Verify the account actually exists
        try {
          const acc = await db.collection('accounts').findOne({ _id: new ObjectId(accountIdStr) })
          if (acc) {
            results.alreadyValid++
            continue
          }
        } catch {
          // AccountId is invalid, continue to fix it
        }
      }
      
      // Try to fix by matching accountNumber
      if (typeof accountNumber === 'number') {
        try {
          const acc = await db.collection('accounts').findOne({ accountNumber })
          if (acc && acc._id) {
            // Found matching account, update the deal
            await db.collection('deals').updateOne(
              { _id: dealId },
              { $set: { accountId: acc._id } }
            )
            results.fixed++
            continue
          }
        } catch (err: any) {
          results.errors.push({
            dealId: String(dealId),
            error: `Failed to find account for deal: ${err.message}`
          })
        }
      }
      
      // No matching account found, set accountId to null
      if (accountId) {
        try {
          await db.collection('deals').updateOne(
            { _id: dealId },
            { $set: { accountId: null } }
          )
          results.notFound++
        } catch (err: any) {
          results.errors.push({
            dealId: String(dealId),
            error: `Failed to update deal: ${err.message}`
          })
        }
      } else {
        results.alreadyValid++
      }
    }
    
    res.json({
      data: {
        message: `Fixed ${results.fixed} deals, ${results.notFound} deals had no matching account (accountId set to null), ${results.alreadyValid} deals were already valid.`,
        results
      },
      error: null
    })
  } catch (err: any) {
    console.error('Fix invalid accountIds error:', err)
    res.status(500).json({ data: null, error: 'fix_failed', details: err.message })
  }
})


