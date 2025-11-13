import { Router } from 'express'
import { getDb } from '../db.js'
import { ObjectId, Sort, SortDirection } from 'mongodb'
import { requireAuth } from '../auth/rbac.js'
import { sendAuthEmail } from '../auth/email.js'
import { env } from '../env.js'

export const quotesRouter = Router()

// Types for approval requests
type QuoteApprovalRequestDoc = {
  _id: ObjectId
  quoteId: ObjectId
  quoteNumber?: number
  quoteTitle?: string
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

// Types for quote history
type QuoteHistoryEntry = {
  _id: ObjectId
  quoteId: ObjectId
  eventType: 'created' | 'updated' | 'status_changed' | 'approval_requested' | 'approved' | 'rejected' | 'version_changed' | 'signed' | 'field_changed' | 'accepted' | 'sent_to_signer'
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
async function addQuoteHistory(
  db: any,
  quoteId: ObjectId,
  eventType: QuoteHistoryEntry['eventType'],
  description: string,
  userId?: string,
  userName?: string,
  userEmail?: string,
  oldValue?: any,
  newValue?: any,
  metadata?: Record<string, any>
) {
  try {
    await db.collection('quote_history').insertOne({
      _id: new ObjectId(),
      quoteId,
      eventType,
      description,
      userId,
      userName,
      userEmail,
      oldValue,
      newValue,
      metadata,
      createdAt: new Date(),
    } as QuoteHistoryEntry)
  } catch (err) {
    console.error('Failed to add quote history:', err)
    // Don't fail the main operation if history fails
  }
}

// List with search/sort
quotesRouter.get('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  const q = String((req.query.q as string) ?? '').trim()
  const sortKeyRaw = (req.query.sort as string) ?? 'createdAt'
  const dirParam = ((req.query.dir as string) ?? 'desc').toLowerCase()
  const dir: SortDirection = dirParam === 'asc' ? 1 : -1
  const allowedKeys = new Set(['createdAt','updatedAt','quoteNumber','status','total','title'])
  const sortField = allowedKeys.has(sortKeyRaw) ? sortKeyRaw : 'createdAt'
  const sort: Sort = { [sortField]: dir }
  const filter: Record<string, unknown> = q
    ? { $or: [
        { title: { $regex: q, $options: 'i' } },
        { status: { $regex: q, $options: 'i' } },
        { signerEmail: { $regex: q, $options: 'i' } },
        { signerName: { $regex: q, $options: 'i' } },
      ] }
    : {}
  const items = await db.collection('quotes').find(filter).sort(sort).limit(200).toArray()
  res.json({ data: { items }, error: null })
})

// Create
quotesRouter.post('/', async (req, res) => {
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
  const doc: any = {
    title,
    accountId,
    dealId: (typeof raw.dealId === 'string' && ObjectId.isValid(raw.dealId)) ? new ObjectId(raw.dealId) : undefined,
    items: Array.isArray(raw.items) ? raw.items : [],
    subtotal: Number(raw.subtotal) || 0,
    tax: Number(raw.tax) || 0,
    total: Number(raw.total) || 0,
    status: (raw.status as string) || 'Draft',
    approver: raw.approver || null,
    approvedAt: raw.approvedAt ? new Date(raw.approvedAt) : null,
    signerName: raw.signerName || null,
    signerEmail: raw.signerEmail || null,
    esignStatus: raw.esignStatus || 'Not Sent',
    signedAt: raw.signedAt ? new Date(raw.signedAt) : null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }

  // Quote number with duplicate handling (like deals)
  // Always check the actual highest quote number first to ensure we don't create duplicates
  let quoteNumber: number | undefined
  let result: any
  let attempts = 0
  const maxAttempts = 10
  
  // Get the actual highest quote number from the database
  let highestQuoteNumber = 500000
  try {
    const last = await db.collection('quotes').find({ quoteNumber: { $type: 'number' } }).project({ quoteNumber: 1 }).sort({ quoteNumber: -1 }).limit(1).toArray()
    if (last.length > 0 && (last[0] as any)?.quoteNumber) {
      highestQuoteNumber = Number((last[0] as any).quoteNumber)
    }
  } catch {}
  
  while (attempts < maxAttempts) {
    try {
      // Try to get next sequence (only on first attempt)
      if (quoteNumber === undefined) {
        try {
          const { getNextSequence } = await import('../db.js')
          const seqNumber = await getNextSequence('quoteNumber')
          // Use the higher of: sequence number or highest existing quote number + 1
          quoteNumber = Math.max(seqNumber, highestQuoteNumber + 1)
        } catch {
          // Fallback: use highest existing + 1
          quoteNumber = highestQuoteNumber + 1
        }
      } else {
        // If previous attempt failed, increment and try next number
        quoteNumber++
      }
      
      const docWithNumber = { ...doc, quoteNumber }
      result = await db.collection('quotes').insertOne(docWithNumber)
      break // Success, exit loop
    } catch (err: any) {
      // Check if it's a duplicate key error
      if (err.code === 11000 && err.keyPattern?.quoteNumber) {
        attempts++
        if (attempts >= maxAttempts) {
          return res.status(500).json({ data: null, error: 'failed_to_generate_quote_number' })
        }
        // Continue loop to retry with incremented number
        continue
      }
      // Other errors, rethrow
      throw err
    }
  }
  
  if (!result || quoteNumber === undefined) {
    return res.status(500).json({ data: null, error: 'failed_to_create_quote' })
  }
  
  // Update doc with the final quote number
  doc.quoteNumber = quoteNumber
  
  // Add history entry for creation
  const auth = (req as any).auth as { userId: string; email: string } | undefined
  if (auth) {
    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    await addQuoteHistory(
      db,
      result.insertedId,
      'created',
      `Quote created: ${title}`,
      auth.userId,
      (user as any)?.name,
      auth.email
    )
  } else {
    await addQuoteHistory(
      db,
      result.insertedId,
      'created',
      `Quote created: ${title}`
    )
  }
  
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})

// Update (basic fields + version bump on items/total changes)
quotesRouter.put('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const raw = req.body ?? {}
    
    // Get current quote for comparison
    const currentQuote = await db.collection('quotes').findOne({ _id })
    if (!currentQuote) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }
    
    const update: any = { updatedAt: new Date() }
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let user: any = null
    if (auth) {
      user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    }
    
    // Track status changes
    if (typeof raw.status === 'string' && raw.status !== (currentQuote as any).status) {
      update.status = raw.status
      await addQuoteHistory(
        db,
        _id,
        'status_changed',
        `Status changed from "${(currentQuote as any).status}" to "${raw.status}"`,
        auth?.userId,
        user?.name,
        auth?.email,
        (currentQuote as any).status,
        raw.status
      )
    }
    
    // Track title changes
    if (typeof raw.title === 'string') {
      const newTitle = raw.title.trim()
      if (newTitle !== (currentQuote as any).title) {
        update.title = newTitle
        await addQuoteHistory(
          db,
          _id,
          'field_changed',
          `Title changed from "${(currentQuote as any).title}" to "${newTitle}"`,
          auth?.userId,
          user?.name,
          auth?.email,
          (currentQuote as any).title,
          newTitle
        )
      }
    }
    
    if (typeof raw.approver === 'string') update.approver = raw.approver
    if (raw.approvedAt) update.approvedAt = new Date(raw.approvedAt)
    
    // Track signer changes
    if (typeof raw.signerName === 'string' && raw.signerName !== (currentQuote as any).signerName) {
      update.signerName = raw.signerName
      await addQuoteHistory(
        db,
        _id,
        'field_changed',
        `Signer name changed to "${raw.signerName}"`,
        auth?.userId,
        user?.name,
        auth?.email
      )
    }
    if (typeof raw.signerEmail === 'string' && raw.signerEmail !== (currentQuote as any).signerEmail) {
      update.signerEmail = raw.signerEmail
      await addQuoteHistory(
        db,
        _id,
        'field_changed',
        `Signer email changed to "${raw.signerEmail}"`,
        auth?.userId,
        user?.name,
        auth?.email
      )
    }
    
    // Track e-sign status changes
    if (typeof raw.esignStatus === 'string' && raw.esignStatus !== (currentQuote as any).esignStatus) {
      update.esignStatus = raw.esignStatus
      // simple auto-transitions for signedAt
      if (raw.esignStatus === 'Signed' && !raw.signedAt) {
        update.signedAt = new Date()
        await addQuoteHistory(
          db,
          _id,
          'signed',
          `Quote signed by ${(currentQuote as any).signerName || (currentQuote as any).signerEmail || 'Unknown'}`,
          auth?.userId,
          user?.name,
          auth?.email
        )
      } else {
        await addQuoteHistory(
          db,
          _id,
          'field_changed',
          `E-sign status changed from "${(currentQuote as any).esignStatus}" to "${raw.esignStatus}"`,
          auth?.userId,
          user?.name,
          auth?.email,
          (currentQuote as any).esignStatus,
          raw.esignStatus
        )
      }
      if (raw.esignStatus !== 'Signed' && raw.signedAt === null) {
        update.signedAt = null
      }
    }
    if (raw.signedAt) update.signedAt = new Date(raw.signedAt)
    
    // Track version changes (when items/total change)
    if (Array.isArray(raw.items)) {
      const oldTotal = (currentQuote as any).total || 0
      const newTotal = Number(raw.total) || 0
      const oldVersion = (currentQuote as any).version || 1
      
      update.items = raw.items
      update.subtotal = Number(raw.subtotal) || 0
      update.tax = Number(raw.tax) || 0
      update.total = newTotal
      update.version = oldVersion + 1
      
      await addQuoteHistory(
        db,
        _id,
        'version_changed',
        `Quote updated to version ${oldVersion + 1}. Total changed from $${oldTotal.toFixed(2)} to $${newTotal.toFixed(2)}`,
        auth?.userId,
        user?.name,
        auth?.email,
        { version: oldVersion, total: oldTotal },
        { version: oldVersion + 1, total: newTotal }
      )
    }
    
    if (raw.accountId && ObjectId.isValid(raw.accountId)) update.accountId = new ObjectId(raw.accountId)
    
    await db.collection('quotes').updateOne({ _id }, { $set: update })
    
    // Add general update entry if no specific changes were tracked
    if (Object.keys(update).length === 1) { // Only updatedAt
      await addQuoteHistory(
        db,
        _id,
        'updated',
        'Quote updated',
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

// GET /api/crm/quotes/:id/history
quotesRouter.get('/:id/history', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const q = await db.collection('quotes').findOne({ _id })
    if (!q) return res.status(404).json({ data: null, error: 'not_found' })
    
    // Get all history entries for this quote, sorted by date (newest first)
    const historyEntries = await db.collection('quote_history')
      .find({ quoteId: _id })
      .sort({ createdAt: -1 })
      .toArray() as QuoteHistoryEntry[]
    
    // Get approval requests for this quote
    const approvalRequests = await db.collection('quote_approval_requests')
      .find({ quoteId: _id })
      .sort({ createdAt: -1 })
      .toArray() as QuoteApprovalRequestDoc[]
    
    // Add approval request events to history
    for (const req of approvalRequests) {
      if (req.status === 'pending') {
        // Check if this is already in history
        const exists = historyEntries.some(h => 
          h.eventType === 'approval_requested' && 
          h.metadata?.approvalRequestId?.toString() === req._id.toString()
        )
        if (!exists) {
          historyEntries.push({
            _id: new ObjectId(),
            quoteId: _id,
            eventType: 'approval_requested',
            description: `Approval requested from ${req.approverEmail}`,
            userId: req.requesterId,
            userEmail: req.requesterEmail,
            userName: req.requesterName,
            createdAt: req.requestedAt,
            metadata: { approvalRequestId: req._id },
          } as QuoteHistoryEntry)
        }
      }
    }
    
    // Sort all entries by date (newest first)
    historyEntries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    
    res.json({ 
      data: { 
        history: historyEntries,
        quote: { 
          title: (q as any).title, 
          status: (q as any).status, 
          total: (q as any).total, 
          quoteNumber: (q as any).quoteNumber, 
          createdAt: (q as any).createdAt || _id.getTimestamp(),
          updatedAt: (q as any).updatedAt 
        } 
      }, 
      error: null 
    })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// DELETE /api/crm/quotes/:id
quotesRouter.delete('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    await db.collection('quotes').deleteOne({ _id })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// POST /api/crm/quotes/:id/request-approval - Request approval for a quote
quotesRouter.post('/:id/request-approval', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const quoteId = new ObjectId(req.params.id)
    
    // Get quote
    const quote = await db.collection('quotes').findOne({ _id: quoteId })
    if (!quote) {
      return res.status(404).json({ data: null, error: 'quote_not_found' })
    }
    
    const quoteData = quote as any
    const approverEmail = quoteData.approver
    if (!approverEmail || typeof approverEmail !== 'string') {
      return res.status(400).json({ data: null, error: 'approver_email_required' })
    }
    
    // Get requester info
    const requester = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    if (!requester) {
      return res.status(404).json({ data: null, error: 'requester_not_found' })
    }
    const requesterData = requester as any
    
    // Get approver info
    const approver = await db.collection('users').findOne({ email: approverEmail.toLowerCase() })
    if (!approver) {
      return res.status(404).json({ data: null, error: 'approver_not_found' })
    }
    const approverData = approver as any
    
    // Check if approver has manager role
    const managerRole = await db.collection('roles').findOne({ name: 'manager' })
    if (!managerRole) {
      return res.status(500).json({ data: null, error: 'manager_role_not_found' })
    }
    
    const hasManagerRole = await db.collection('user_roles').findOne({
      userId: approverData._id.toString(),
      roleId: managerRole._id
    })
    
    if (!hasManagerRole) {
      return res.status(403).json({ data: null, error: 'approver_not_manager' })
    }
    
    // Check if there's already a pending request
    const existingRequest = await db.collection('quote_approval_requests').findOne({
      quoteId,
      approverEmail: approverEmail.toLowerCase(),
      status: 'pending'
    }) as QuoteApprovalRequestDoc | null
    
    if (existingRequest) {
      return res.status(400).json({ data: null, error: 'approval_request_already_exists' })
    }
    
    // Create approval request
    const now = new Date()
    const approvalRequest: QuoteApprovalRequestDoc = {
      _id: new ObjectId(),
      quoteId,
      quoteNumber: quoteData.quoteNumber,
      quoteTitle: quoteData.title,
      requesterId: auth.userId,
      requesterEmail: requesterData.email,
      requesterName: requesterData.name,
      approverEmail: approverEmail.toLowerCase(),
      approverId: approverData._id.toString(),
      status: 'pending',
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    }
    
    await db.collection('quote_approval_requests').insertOne(approvalRequest)
    
    // Update quote status
    await db.collection('quotes').updateOne(
      { _id: quoteId },
      { $set: { status: 'Submitted for Review', updatedAt: now } }
    )
    
    // Add history entry
    await addQuoteHistory(
      db,
      quoteId,
      'approval_requested',
      `Approval requested from ${approverEmail}`,
      auth.userId,
      requesterData.name,
      requesterData.email,
      quoteData.status,
      'Submitted for Review',
      { approvalRequestId: approvalRequest._id, approverEmail }
    )
    
    // Send email to approver
    const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
    const approvalQueueUrl = `${baseUrl}/apps/crm/quotes/approval-queue`
    
    try {
      await sendAuthEmail({
        to: approverEmail,
        subject: `Quote Approval Request: ${quoteData.quoteNumber ? `#${quoteData.quoteNumber}` : quoteData.title}`,
        checkPreferences: true,
        html: `
          <h2>Quote Approval Request</h2>
          <p>A new quote requires your approval:</p>
          <ul>
            <li><strong>Quote:</strong> ${quoteData.quoteNumber ? `#${quoteData.quoteNumber}` : 'N/A'} - ${quoteData.title || 'Untitled'}</li>
            <li><strong>Requested by:</strong> ${requesterData.name || requesterData.email}</li>
            <li><strong>Total:</strong> $${(quoteData.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</li>
            <li><strong>Requested:</strong> ${now.toLocaleString()}</li>
          </ul>
          <p><a href="${approvalQueueUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">View Approval Queue</a></p>
          <p>Or copy and paste this URL into your browser:</p>
          <p><code>${approvalQueueUrl}</code></p>
        `,
        text: `
Quote Approval Request

A new quote requires your approval:

Quote: ${quoteData.quoteNumber ? `#${quoteData.quoteNumber}` : 'N/A'} - ${quoteData.title || 'Untitled'}
Requested by: ${requesterData.name || requesterData.email}
Total: $${(quoteData.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Requested: ${now.toLocaleString()}

View Approval Queue: ${approvalQueueUrl}
        `,
      })
    } catch (emailErr) {
      console.error('Failed to send approval request email:', emailErr)
      // Don't fail the request if email fails
    }
    
    res.json({ data: { approvalRequestId: approvalRequest._id, message: 'Approval request sent' }, error: null })
  } catch (err: any) {
    console.error('Request approval error:', err)
    if (err.message?.includes('invalid_id')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: err.message || 'failed_to_request_approval' })
  }
})

// GET /api/crm/quotes/approval-queue - Get approval queue for managers
quotesRouter.get('/approval-queue', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    
    // Check if user has manager role
    const managerRole = await db.collection('roles').findOne({ name: 'manager' })
    if (!managerRole) {
      return res.status(500).json({ data: null, error: 'manager_role_not_found' })
    }
    
    // Get all user roles (same approach as requirePermission)
    const userRoles = await db.collection('user_roles').find({ userId: auth.userId } as any).toArray()
    const roleIds = userRoles.map((ur: any) => ur.roleId)
    
    if (roleIds.length === 0) {
      console.log('No roles found for user:', { userId: auth.userId, email: auth.email })
      return res.status(403).json({ data: null, error: 'manager_access_required' })
    }
    
    // Get role details
    const roles = await db.collection('roles').find({ _id: { $in: roleIds } } as any).toArray()
    const roleNames = roles.map((r: any) => r.name)
    
    // Check if user has manager or admin role
    const hasManagerRole = roleNames.includes('manager')
    const hasAdminRole = roleNames.includes('admin')
    
    if (!hasManagerRole && !hasAdminRole) {
      console.log('User does not have manager or admin role:', {
        userId: auth.userId,
        email: auth.email,
        roles: roleNames,
      })
      return res.status(403).json({ data: null, error: 'manager_access_required' })
    }
    
    // Get user email for filtering
    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    if (!user) {
      return res.status(404).json({ data: null, error: 'user_not_found' })
    }
    const userData = user as any
    
    // Get status filter
    const status = (req.query.status as string) || 'all'
    
    // Build query
    const query: any = { approverEmail: userData.email.toLowerCase() }
    if (status !== 'all') {
      query.status = status
    }
    
    // Get approval requests
    const requests = await db.collection('quote_approval_requests')
      .find(query)
      .sort({ requestedAt: -1 })
      .limit(100)
      .toArray() as QuoteApprovalRequestDoc[]
    
    // Get quote details for each request
    const quoteIds = requests.map(r => r.quoteId)
    const quotes = await quoteIds.length > 0
      ? await db.collection('quotes').find({ _id: { $in: quoteIds } }).toArray()
      : []
    
    const quoteMap = new Map(quotes.map((q: any) => [q._id.toString(), q]))
    
    // Combine requests with quote data
    const requestsWithQuotes = requests.map(req => {
      const quote = quoteMap.get(req.quoteId.toString())
      return {
        _id: req._id,
        quoteId: req.quoteId,
        quote: quote ? {
          _id: quote._id,
          quoteNumber: quote.quoteNumber,
          title: quote.title,
          total: quote.total,
          status: quote.status,
          accountId: quote.accountId,
        } : null,
        requesterId: req.requesterId,
        requesterEmail: req.requesterEmail,
        requesterName: req.requesterName,
        approverEmail: req.approverEmail,
        status: req.status,
        requestedAt: req.requestedAt,
        reviewedAt: req.reviewedAt,
        reviewedBy: req.reviewedBy,
        reviewNotes: req.reviewNotes,
      }
    })
    
    res.json({ data: { items: requestsWithQuotes }, error: null })
  } catch (err: any) {
    console.error('Get approval queue error:', err)
    res.status(500).json({ data: null, error: err.message || 'failed_to_get_approval_queue' })
  }
})

// POST /api/crm/quotes/:id/approve - Approve a quote
quotesRouter.post('/:id/approve', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const quoteId = new ObjectId(req.params.id)
    const { reviewNotes } = req.body || {}
    
    // Get all user roles (same approach as requirePermission)
    const userRoles = await db.collection('user_roles').find({ userId: auth.userId } as any).toArray()
    const roleIds = userRoles.map((ur: any) => ur.roleId)
    
    if (roleIds.length === 0) {
      return res.status(403).json({ data: null, error: 'manager_access_required' })
    }
    
    // Get role details
    const roles = await db.collection('roles').find({ _id: { $in: roleIds } } as any).toArray()
    const roleNames = roles.map((r: any) => r.name)
    
    // Check if user has manager or admin role
    const hasManagerRole = roleNames.includes('manager')
    const hasAdminRole = roleNames.includes('admin')
    
    if (!hasManagerRole && !hasAdminRole) {
      return res.status(403).json({ data: null, error: 'manager_access_required' })
    }
    
    // Get user email
    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    if (!user) {
      return res.status(404).json({ data: null, error: 'user_not_found' })
    }
    const userData = user as any
    
    // Get approval request
    const approvalRequest = await db.collection('quote_approval_requests').findOne({
      quoteId,
      approverEmail: userData.email.toLowerCase(),
      status: 'pending'
    }) as QuoteApprovalRequestDoc | null
    
    if (!approvalRequest) {
      return res.status(404).json({ data: null, error: 'approval_request_not_found' })
    }
    
    // Update approval request
    const now = new Date()
    await db.collection('quote_approval_requests').updateOne(
      { _id: approvalRequest._id },
      {
        $set: {
          status: 'approved',
          reviewedAt: now,
          reviewedBy: auth.userId,
          reviewNotes: typeof reviewNotes === 'string' ? reviewNotes : undefined,
          updatedAt: now,
        }
      }
    )
    
    // Update quote - ensure status is set to Approved and approver info is saved
    const quoteUpdate: any = {
      status: 'Approved',
      approvedAt: now,
      updatedAt: now,
    }
    
    // Ensure approver field is set if not already set
    const currentQuote = await db.collection('quotes').findOne({ _id: quoteId })
    if (currentQuote && !currentQuote.approver) {
      quoteUpdate.approver = userData.email
    }
    
    const updateResult = await db.collection('quotes').updateOne(
      { _id: quoteId },
      { $set: quoteUpdate }
    )
    
    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ data: null, error: 'quote_not_found' })
    }
    
    // Add history entry for approval
    await addQuoteHistory(
      db,
      quoteId,
      'approved',
      `Quote approved by ${userData.name || userData.email}${typeof reviewNotes === 'string' && reviewNotes ? `: ${reviewNotes}` : ''}`,
      auth.userId,
      userData.name,
      userData.email,
      (currentQuote as any)?.status,
      'Approved',
      { approvalRequestId: approvalRequest._id, reviewNotes }
    )
    
    // Send email to requester
    try {
      const quote = await db.collection('quotes').findOne({ _id: quoteId })
      const quoteData = quote as any
      
      await sendAuthEmail({
        to: approvalRequest.requesterEmail,
        subject: `Quote Approved: ${quoteData?.quoteNumber ? `#${quoteData.quoteNumber}` : quoteData?.title || 'Untitled'}`,
        checkPreferences: true,
        html: `
          <h2>Quote Approved</h2>
          <p>Your quote has been approved:</p>
          <ul>
            <li><strong>Quote:</strong> ${quoteData?.quoteNumber ? `#${quoteData.quoteNumber}` : 'N/A'} - ${quoteData?.title || 'Untitled'}</li>
            <li><strong>Approved by:</strong> ${userData.name || userData.email}</li>
            <li><strong>Approved at:</strong> ${now.toLocaleString()}</li>
            ${reviewNotes ? `<li><strong>Notes:</strong> ${reviewNotes}</li>` : ''}
          </ul>
        `,
        text: `
Quote Approved

Your quote has been approved:

Quote: ${quoteData?.quoteNumber ? `#${quoteData.quoteNumber}` : 'N/A'} - ${quoteData?.title || 'Untitled'}
Approved by: ${userData.name || userData.email}
Approved at: ${now.toLocaleString()}
${reviewNotes ? `Notes: ${reviewNotes}` : ''}
        `,
      })
    } catch (emailErr) {
      console.error('Failed to send approval email:', emailErr)
    }
    
    res.json({ data: { message: 'Quote approved' }, error: null })
  } catch (err: any) {
    console.error('Approve quote error:', err)
    if (err.message?.includes('invalid_id')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: err.message || 'failed_to_approve_quote' })
  }
})

// POST /api/crm/quotes/:id/reject - Reject a quote
quotesRouter.post('/:id/reject', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const quoteId = new ObjectId(req.params.id)
    const { reviewNotes } = req.body || {}
    
    // Get all user roles (same approach as requirePermission)
    const userRoles = await db.collection('user_roles').find({ userId: auth.userId } as any).toArray()
    const roleIds = userRoles.map((ur: any) => ur.roleId)
    
    if (roleIds.length === 0) {
      return res.status(403).json({ data: null, error: 'manager_access_required' })
    }
    
    // Get role details
    const roles = await db.collection('roles').find({ _id: { $in: roleIds } } as any).toArray()
    const roleNames = roles.map((r: any) => r.name)
    
    // Check if user has manager or admin role
    const hasManagerRole = roleNames.includes('manager')
    const hasAdminRole = roleNames.includes('admin')
    
    if (!hasManagerRole && !hasAdminRole) {
      return res.status(403).json({ data: null, error: 'manager_access_required' })
    }
    
    // Get user email
    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    if (!user) {
      return res.status(404).json({ data: null, error: 'user_not_found' })
    }
    const userData = user as any
    
    // Get approval request
    const approvalRequest = await db.collection('quote_approval_requests').findOne({
      quoteId,
      approverEmail: userData.email.toLowerCase(),
      status: 'pending'
    }) as QuoteApprovalRequestDoc | null
    
    if (!approvalRequest) {
      return res.status(404).json({ data: null, error: 'approval_request_not_found' })
    }
    
    // Update approval request
    const now = new Date()
    await db.collection('quote_approval_requests').updateOne(
      { _id: approvalRequest._id },
      {
        $set: {
          status: 'rejected',
          reviewedAt: now,
          reviewedBy: auth.userId,
          reviewNotes: typeof reviewNotes === 'string' ? reviewNotes : undefined,
          updatedAt: now,
        }
      }
    )
    
    // Get current quote for history
    const currentQuote = await db.collection('quotes').findOne({ _id: quoteId })
    
    // Update quote
    await db.collection('quotes').updateOne(
      { _id: quoteId },
      {
        $set: {
          status: 'Rejected',
          updatedAt: now,
        }
      }
    )
    
    // Add history entry for rejection
    await addQuoteHistory(
      db,
      quoteId,
      'rejected',
      `Quote rejected by ${userData.name || userData.email}${typeof reviewNotes === 'string' && reviewNotes ? `: ${reviewNotes}` : ''}`,
      auth.userId,
      userData.name,
      userData.email,
      (currentQuote as any)?.status,
      'Rejected',
      { approvalRequestId: approvalRequest._id, reviewNotes }
    )
    
    // Send email to requester
    try {
      const quote = await db.collection('quotes').findOne({ _id: quoteId })
      const quoteData = quote as any
      
      await sendAuthEmail({
        to: approvalRequest.requesterEmail,
        subject: `Quote Rejected: ${quoteData?.quoteNumber ? `#${quoteData.quoteNumber}` : quoteData?.title || 'Untitled'}`,
        checkPreferences: true,
        html: `
          <h2>Quote Rejected</h2>
          <p>Your quote has been rejected:</p>
          <ul>
            <li><strong>Quote:</strong> ${quoteData?.quoteNumber ? `#${quoteData.quoteNumber}` : 'N/A'} - ${quoteData?.title || 'Untitled'}</li>
            <li><strong>Rejected by:</strong> ${userData.name || userData.email}</li>
            <li><strong>Rejected at:</strong> ${now.toLocaleString()}</li>
            ${reviewNotes ? `<li><strong>Notes:</strong> ${reviewNotes}</li>` : ''}
          </ul>
        `,
        text: `
Quote Rejected

Your quote has been rejected:

Quote: ${quoteData?.quoteNumber ? `#${quoteData.quoteNumber}` : 'N/A'} - ${quoteData?.title || 'Untitled'}
Rejected by: ${userData.name || userData.email}
Rejected at: ${now.toLocaleString()}
${reviewNotes ? `Notes: ${reviewNotes}` : ''}
        `,
      })
    } catch (emailErr) {
      console.error('Failed to send rejection email:', emailErr)
    }
    
    res.json({ data: { message: 'Quote rejected' }, error: null })
  } catch (err: any) {
    console.error('Reject quote error:', err)
    if (err.message?.includes('invalid_id')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: err.message || 'failed_to_reject_quote' })
  }
})

// POST /api/crm/quotes/:id/send-to-signer - Send quote to signer for review and signing
// IMPORTANT: This route must be defined before the public routes section
quotesRouter.post('/:id/send-to-signer', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const quoteId = new ObjectId(req.params.id)
    
    // Get quote
    const quote = await db.collection('quotes').findOne({ _id: quoteId })
    if (!quote) {
      return res.status(404).json({ data: null, error: 'quote_not_found' })
    }
    
    const quoteData = quote as any
    const signerEmail = quoteData.signerEmail
    const signerName = quoteData.signerName
    
    if (!signerEmail || typeof signerEmail !== 'string') {
      return res.status(400).json({ data: null, error: 'signer_email_required' })
    }
    
    // Get sender info
    const sender = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    if (!sender) {
      return res.status(404).json({ data: null, error: 'sender_not_found' })
    }
    const senderData = sender as any
    
    // Generate unique token for quote viewing/signing
    const signToken = Buffer.from(`${quoteId.toString()}-${Date.now()}-${Math.random()}`).toString('base64url')
    
    // Update quote with sign token and status
    const now = new Date()
    await db.collection('quotes').updateOne(
      { _id: quoteId },
      {
        $set: {
          signToken,
          esignStatus: 'Sent',
          updatedAt: now,
        }
      }
    )
    
    // Add history entry
    await addQuoteHistory(
      db,
      quoteId,
      'sent_to_signer',
      `Quote sent to signer: ${signerName || signerEmail}`,
      auth.userId,
      senderData.name,
      senderData.email,
      quoteData.status,
      quoteData.status,
      { signerEmail, signerName, signToken }
    )
    
    // Send email to signer
    const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
    const quoteViewUrl = `${baseUrl}/quotes/view/${signToken}`
    
    try {
      await sendAuthEmail({
        to: signerEmail,
        subject: `Quote for Review: ${quoteData.quoteNumber ? `#${quoteData.quoteNumber}` : quoteData.title || 'Untitled'}`,
        checkPreferences: false, // Don't check preferences for external signers
        html: `
          <h2>Quote for Review</h2>
          <p>${signerName ? `Hello ${signerName},` : 'Hello,'}</p>
          <p>You have been sent a quote for review and signing:</p>
          <ul>
            <li><strong>Quote:</strong> ${quoteData.quoteNumber ? `#${quoteData.quoteNumber}` : 'N/A'} - ${quoteData.title || 'Untitled'}</li>
            <li><strong>Total:</strong> $${(quoteData.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</li>
            <li><strong>Sent by:</strong> ${senderData.name || senderData.email}</li>
            <li><strong>Sent at:</strong> ${now.toLocaleString()}</li>
          </ul>
          <p><a href="${quoteViewUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Review Quote</a></p>
          <p>Or copy and paste this URL into your browser:</p>
          <p><code>${quoteViewUrl}</code></p>
        `,
        text: `
Quote for Review

${signerName ? `Hello ${signerName},` : 'Hello,'}

You have been sent a quote for review and signing:

Quote: ${quoteData.quoteNumber ? `#${quoteData.quoteNumber}` : 'N/A'} - ${quoteData.title || 'Untitled'}
Total: $${(quoteData.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Sent by: ${senderData.name || senderData.email}
Sent at: ${now.toLocaleString()}

Review Quote: ${quoteViewUrl}
        `,
      })
    } catch (emailErr) {
      console.error('Failed to send quote to signer email:', emailErr)
      // Don't fail the request if email fails, but log it
    }
    
    res.json({ data: { message: 'Quote sent to signer', signToken }, error: null })
  } catch (err: any) {
    console.error('Send quote to signer error:', err)
    if (err.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: err.message || 'failed_to_send_quote_to_signer' })
  }
})

// ===== PUBLIC QUOTE VIEW ENDPOINTS (No auth required) =====

// GET /api/quotes/view/:token - Get quote by token (public endpoint)
quotesRouter.get('/view/:token', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const { token } = req.params
    const quote = await db.collection('quotes').findOne({ signToken: token }) as any
    
    if (!quote) {
      return res.status(404).json({ data: null, error: 'quote_not_found' })
    }
    
    // Get account info if available
    let accountInfo = null
    if (quote.accountId) {
      const account = await db.collection('accounts').findOne({ _id: quote.accountId })
      if (account) {
        accountInfo = {
          accountNumber: (account as any).accountNumber,
          name: (account as any).name,
        }
      }
    }
    
    res.json({
      data: {
        quote: {
          _id: String(quote._id),
          quoteNumber: quote.quoteNumber,
          title: quote.title,
          items: quote.items || [],
          subtotal: quote.subtotal || 0,
          tax: quote.tax || 0,
          total: quote.total || 0,
          status: quote.status,
          signerName: quote.signerName,
          signerEmail: quote.signerEmail,
          esignStatus: quote.esignStatus,
          signedAt: quote.signedAt,
          createdAt: quote.createdAt,
          accountInfo,
        }
      },
      error: null
    })
  } catch (err: any) {
    console.error('Get quote by token error:', err)
    res.status(500).json({ data: null, error: err.message || 'failed_to_get_quote' })
  }
})

// POST /api/quotes/view/:token/accept - Accept quote (public endpoint)
quotesRouter.post('/view/:token/accept', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const { token } = req.params
    const { signerName, notes } = req.body || {}
    
    const quote = await db.collection('quotes').findOne({ signToken: token }) as any
    
    if (!quote) {
      return res.status(404).json({ data: null, error: 'quote_not_found' })
    }
    
    // Check if already accepted
    if (quote.esignStatus === 'Accepted' || quote.esignStatus === 'Signed') {
      return res.status(400).json({ data: null, error: 'quote_already_accepted' })
    }
    
    const now = new Date()
    
    // Update quote
    await db.collection('quotes').updateOne(
      { _id: quote._id },
      {
        $set: {
          esignStatus: 'Accepted',
          signedAt: now,
          signerName: signerName || quote.signerName,
          updatedAt: now,
        }
      }
    )
    
    // Add history entry
    await addQuoteHistory(
      db,
      quote._id,
      'accepted',
      `Quote accepted by ${signerName || quote.signerName || quote.signerEmail}${notes ? `: ${notes}` : ''}`,
      undefined, // No user ID for external signers
      signerName || quote.signerName || 'External Signer',
      quote.signerEmail,
      quote.status,
      quote.status,
      { signerName, notes, acceptedAt: now }
    )
    
    // Create acceptance record for queue
    const acceptanceRecord = {
      _id: new ObjectId(),
      quoteId: quote._id,
      quoteNumber: quote.quoteNumber,
      quoteTitle: quote.title,
      signerName: signerName || quote.signerName,
      signerEmail: quote.signerEmail,
      acceptedAt: now,
      notes: notes || null,
      status: 'accepted',
      createdAt: now,
      updatedAt: now,
    }
    
    await db.collection('quote_acceptances').insertOne(acceptanceRecord)
    
    // Send notification email to internal team (optional - could be enhanced)
    // For now, just return success
    
    res.json({ data: { message: 'Quote accepted successfully', acceptanceId: acceptanceRecord._id }, error: null })
  } catch (err: any) {
    console.error('Accept quote error:', err)
    res.status(500).json({ data: null, error: err.message || 'failed_to_accept_quote' })
  }
})

// ===== INTERNAL ACCEPTANCE QUEUE ENDPOINTS (Auth required) =====

// GET /api/crm/quotes/acceptance-queue - Get quote acceptance queue (managers only)
quotesRouter.get('/acceptance-queue', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    
    // Check if user has manager role
    const managerRole = await db.collection('roles').findOne({ name: 'manager' })
    if (!managerRole) {
      return res.status(500).json({ data: null, error: 'manager_role_not_found' })
    }
    
    // Get all user roles (same approach as requirePermission)
    const userRoles = await db.collection('user_roles').find({ userId: auth.userId } as any).toArray()
    const roleIds = userRoles.map((ur: any) => ur.roleId)
    
    if (roleIds.length === 0) {
      console.log('No roles found for user:', { userId: auth.userId, email: auth.email })
      return res.status(403).json({ data: null, error: 'manager_access_required' })
    }
    
    // Get role details
    const roles = await db.collection('roles').find({ _id: { $in: roleIds } } as any).toArray()
    const roleNames = roles.map((r: any) => r.name)
    
    // Check if user has manager or admin role
    const hasManagerRole = roleNames.includes('manager')
    const hasAdminRole = roleNames.includes('admin')
    
    if (!hasManagerRole && !hasAdminRole) {
      console.log('User does not have manager or admin role:', {
        userId: auth.userId,
        email: auth.email,
        roles: roleNames,
      })
      return res.status(403).json({ data: null, error: 'manager_access_required' })
    }
    
    const { status, q } = req.query
    const filter: any = {}
    
    if (status && typeof status === 'string' && status !== 'all') {
      filter.status = status
    }
    
    if (q && typeof q === 'string') {
      filter.$or = [
        { quoteNumber: { $regex: q, $options: 'i' } },
        { quoteTitle: { $regex: q, $options: 'i' } },
        { signerName: { $regex: q, $options: 'i' } },
        { signerEmail: { $regex: q, $options: 'i' } },
      ]
    }
    
    const acceptances = await db.collection('quote_acceptances')
      .find(filter)
      .sort({ acceptedAt: -1 })
      .limit(200)
      .toArray()
    
    // Get quote details for each acceptance
    const items = await Promise.all(acceptances.map(async (acc: any) => {
      const quote = await db.collection('quotes').findOne({ _id: acc.quoteId })
      return {
        _id: String(acc._id),
        quoteId: String(acc.quoteId),
        quote: quote ? {
          _id: String(quote._id),
          quoteNumber: (quote as any).quoteNumber,
          title: (quote as any).title,
          total: (quote as any).total,
          status: (quote as any).status,
        } : null,
        quoteNumber: acc.quoteNumber,
        quoteTitle: acc.quoteTitle,
        signerName: acc.signerName,
        signerEmail: acc.signerEmail,
        acceptedAt: acc.acceptedAt,
        notes: acc.notes,
        status: acc.status,
      }
    }))
    
    res.json({ data: { items }, error: null })
  } catch (err: any) {
    console.error('Get acceptance queue error:', err)
    res.status(500).json({ data: null, error: err.message || 'failed_to_get_acceptance_queue' })
  }
})
