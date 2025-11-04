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

  // Quote number
  try {
    const { getNextSequence } = await import('../db.js')
    doc.quoteNumber = await getNextSequence('quoteNumber')
  } catch {}
  if (doc.quoteNumber == null) {
    try {
      const last = await db.collection('quotes').find({ quoteNumber: { $type: 'number' } }).project({ quoteNumber: 1 }).sort({ quoteNumber: -1 }).limit(1).toArray()
      doc.quoteNumber = Number((last[0] as any)?.quoteNumber ?? 500000) + 1
    } catch { doc.quoteNumber = 500001 }
  }

  const result = await db.collection('quotes').insertOne(doc)
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})

// Update (basic fields + version bump on items/total changes)
quotesRouter.put('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const raw = req.body ?? {}
    const update: any = { updatedAt: new Date() }
    if (typeof raw.title === 'string') update.title = raw.title.trim()
    if (typeof raw.status === 'string') update.status = raw.status
    if (typeof raw.approver === 'string') update.approver = raw.approver
    if (raw.approvedAt) update.approvedAt = new Date(raw.approvedAt)
    if (typeof raw.signerName === 'string') update.signerName = raw.signerName
    if (typeof raw.signerEmail === 'string') update.signerEmail = raw.signerEmail
    if (typeof raw.esignStatus === 'string') {
      update.esignStatus = raw.esignStatus
      // simple auto-transitions for signedAt
      if (raw.esignStatus === 'Signed' && !raw.signedAt) {
        update.signedAt = new Date()
      }
      if (raw.esignStatus !== 'Signed' && raw.signedAt === null) {
        update.signedAt = null
      }
    }
    if (raw.signedAt) update.signedAt = new Date(raw.signedAt)
    if (Array.isArray(raw.items)) {
      update.items = raw.items
      update.subtotal = Number(raw.subtotal) || 0
      update.tax = Number(raw.tax) || 0
      update.total = Number(raw.total) || 0
      // bump version
      const q = await db.collection('quotes').findOne({ _id }, { projection: { version: 1 } })
      update.version = (q as any)?.version ? (q as any).version + 1 : 2
    }
    if (raw.accountId && ObjectId.isValid(raw.accountId)) update.accountId = new ObjectId(raw.accountId)
    await db.collection('quotes').updateOne({ _id }, { $set: update })
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
    const createdAt = (q as any).createdAt || _id.getTimestamp()
    // Any events by account (if denormalized) could be added here
    res.json({ data: { createdAt, quote: { title: (q as any).title, status: (q as any).status, total: (q as any).total, quoteNumber: (q as any).quoteNumber, updatedAt: (q as any).updatedAt } }, error: null })
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
    const existingRequest = await db.collection<QuoteApprovalRequestDoc>('quote_approval_requests').findOne({
      quoteId,
      approverEmail: approverEmail.toLowerCase(),
      status: 'pending'
    })
    
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
    const requests = await db.collection<QuoteApprovalRequestDoc>('quote_approval_requests')
      .find(query)
      .sort({ requestedAt: -1 })
      .limit(100)
      .toArray()
    
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
    const approvalRequest = await db.collection<QuoteApprovalRequestDoc>('quote_approval_requests').findOne({
      quoteId,
      approverEmail: userData.email.toLowerCase(),
      status: 'pending'
    })
    
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
    
    // Update quote
    await db.collection('quotes').updateOne(
      { _id: quoteId },
      {
        $set: {
          status: 'Approved',
          approvedAt: now,
          updatedAt: now,
        }
      }
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
    const approvalRequest = await db.collection<QuoteApprovalRequestDoc>('quote_approval_requests').findOne({
      quoteId,
      approverEmail: userData.email.toLowerCase(),
      status: 'pending'
    })
    
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


