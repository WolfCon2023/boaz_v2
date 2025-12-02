import { Router } from 'express'
import { getDb } from '../db.js'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { requireAuth } from '../auth/rbac.js'
import { sendAuthEmail } from '../auth/email.js'
import { env } from '../env.js'
import { vendorsRouter } from './vendors.js'
import { revenueIntelligenceRouter } from './revenue_intelligence.js'

export const crmRouter = Router()

// Types for contact history
type ContactHistoryEntry = {
  _id: ObjectId
  contactId: ObjectId
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
async function addContactHistory(
  db: any,
  contactId: ObjectId,
  eventType: ContactHistoryEntry['eventType'],
  description: string,
  userId?: string,
  userName?: string,
  userEmail?: string,
  oldValue?: any,
  newValue?: any,
  metadata?: Record<string, any>
) {
  try {
    await db.collection('contact_history').insertOne({
      _id: new ObjectId(),
      contactId,
      eventType,
      description,
      userId,
      userName,
      userEmail,
      oldValue,
      newValue,
      metadata,
      createdAt: new Date(),
    } as ContactHistoryEntry)
  } catch (err) {
    console.error('Failed to add contact history:', err)
    // Don't fail the main operation if history fails
  }
}

// GET /api/crm/contacts?q=&cursor=&limit=&page=
crmRouter.get('/contacts', async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.json({ data: { items: [], nextCursor: null }, error: null })

    const { q, cursor } = req.query as { q?: string; cursor?: string }
    const page = Math.max(0, Number((req.query as any).page ?? 0))
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 25)))

    const filter: Record<string, unknown> = {}
    if (q && q.trim()) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ]
    }
    if (cursor) {
      try {
        filter._id = { $gt: new ObjectId(cursor) }
      } catch {
        // ignore bad cursor
      }
    }

    let items: any[] = []
    let nextCursor: string | null = null
    if (cursor) {
      items = await db
        .collection('contacts')
        .find(filter)
        .project({ name: 1, email: 1, company: 1, mobilePhone: 1, officePhone: 1, isPrimary: 1, primaryPhone: 1 })
        .sort({ _id: 1 })
        .limit(limit)
        .toArray()
      nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null
      res.json({ data: { items, nextCursor }, error: null })
      return
    }

    const total = await db.collection('contacts').countDocuments(filter)
    items = await db
      .collection('contacts')
      .find(filter)
      .project({ name: 1, email: 1, company: 1, mobilePhone: 1, officePhone: 1, isPrimary: 1, primaryPhone: 1 })
      .sort({ _id: 1 })
      .skip(page * limit)
      .limit(limit)
      .toArray()

    res.json({ data: { items, page, pageSize: limit, total }, error: null })
  } catch (e) {
    res.status(500).json({ data: null, error: 'contacts_error' })
  }
})

// POST /api/crm/contacts
crmRouter.post('/contacts', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    company: z.string().optional(),
    email: z.string().email().optional(),
    mobilePhone: z.string().optional(),
    officePhone: z.string().optional(),
    isPrimary: z.boolean().optional(),
    primaryPhone: z.enum(['mobile', 'office']).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const { name, company, email, mobilePhone, officePhone, isPrimary, primaryPhone } = parsed.data
  const doc: any = { name, company, email, mobilePhone, officePhone, isPrimary: Boolean(isPrimary), primaryPhone }
  const result = await db.collection('contacts').insertOne(doc)
  
  // Add history entry for creation
  const auth = (req as any).auth as { userId: string; email: string } | undefined
  if (auth) {
    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    await addContactHistory(
      db,
      result.insertedId,
      'created',
      `Contact created: ${name}`,
      auth.userId,
      (user as any)?.name,
      auth.email
    )
  } else {
    await addContactHistory(
      db,
      result.insertedId,
      'created',
      `Contact created: ${name}`
    )
  }
  
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})

// PUT /api/crm/contacts/:id
crmRouter.put('/contacts/:id', async (req, res) => {
  const base = z.object({
    name: z.string().min(1).optional(),
    company: z.string().optional(),
    email: z.string().email().optional(),
    mobilePhone: z.string().optional(),
    officePhone: z.string().optional(),
    isPrimary: z.boolean().optional(),
    primaryPhone: z.enum(['mobile', 'office']).optional(),
  })
  const parsed = base.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    
    // Get current contact for comparison
    const currentContact = await db.collection('contacts').findOne({ _id })
    if (!currentContact) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }
    
    const update: any = parsed.data
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let user: any = null
    if (auth) {
      user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    }
    
    // Track field changes
    const fieldsToTrack = ['name', 'company', 'email', 'mobilePhone', 'officePhone', 'isPrimary', 'primaryPhone']
    let hasChanges = false
    
    for (const field of fieldsToTrack) {
      if (update[field] !== undefined && update[field] !== (currentContact as any)[field]) {
        hasChanges = true
        await addContactHistory(
          db,
          _id,
          'field_changed',
          `${field === 'isPrimary' ? 'Primary contact status' : field === 'primaryPhone' ? 'Primary phone' : field.charAt(0).toUpperCase() + field.slice(1)} changed from "${(currentContact as any)[field] ?? 'empty'}" to "${update[field] ?? 'empty'}"`,
          auth?.userId,
          user?.name,
          auth?.email,
          (currentContact as any)[field],
          update[field]
        )
      }
    }
    
    await db.collection('contacts').updateOne({ _id }, { $set: update })
    
    // Add general update entry if no specific changes were tracked
    if (!hasChanges) {
      await addContactHistory(
        db,
        _id,
        'updated',
        'Contact updated',
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

// DELETE /api/crm/contacts/:id
crmRouter.delete('/contacts/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    await db.collection('contacts').deleteOne({ _id })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// --- DEAL APPROVAL FALLBACK ROUTE (mirrors dealsRouter) ---

// POST /api/crm/deals/:id/request-approval
crmRouter.post('/deals/:id/request-approval', requireAuth, async (req, res) => {
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

    const requester = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    if (!requester) {
      return res.status(404).json({ data: null, error: 'requester_not_found' })
    }
    const requesterData = requester as any

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

    const existingRequest = await db.collection('deal_approval_requests').findOne({
      dealId,
      approverEmail,
      status: 'pending',
    })
    if (existingRequest) {
      return res.status(400).json({ data: null, error: 'approval_request_already_exists' })
    }

    const now = new Date()
    const approvalRequest = {
      _id: new ObjectId(),
      dealId,
      dealNumber: dealData.dealNumber,
      dealTitle: dealData.title,
      requesterId: auth.userId,
      requesterEmail: requesterData.email,
      requesterName: requesterData.name,
      approverEmail,
      approverId: approverData._id.toString(),
      status: 'pending' as const,
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    }

    await db.collection('deal_approval_requests').insertOne(approvalRequest)

    // Move deal to Submitted for Review
    await db.collection('deals').updateOne(
      { _id: dealId },
      { $set: { stage: 'Submitted for Review', updatedAt: now } },
    )

    // Email approver with link
    const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
    const approvalQueueUrl = `${baseUrl}/apps/crm/deals/approval-queue`

    try {
      await sendAuthEmail({
        to: approverEmail,
        subject: `Deal Approval Request: ${dealData.dealNumber ? `#${dealData.dealNumber}` : dealData.title}`,
        checkPreferences: true,
        html: `
          <h2>Deal Approval Request</h2>
          <p>A new deal requires your approval:</p>
          <ul>
            <li><strong>Deal:</strong> ${dealData.dealNumber ? `#${dealData.dealNumber}` : 'N/A'} - ${dealData.title || 'Untitled'}</li>
            <li><strong>Requested by:</strong> ${requesterData.name || requesterData.email}</li>
            <li><strong>Amount:</strong> $${(dealData.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</li>
            <li><strong>Requested:</strong> ${now.toLocaleString()}</li>
          </ul>
          <p><a href="${approvalQueueUrl}" style="display:inline-block;padding:10px 20px;background-color:#007bff;color:#ffffff;text-decoration:none;border-radius:5px;">View Deal Approval Queue</a></p>
          <p>Or copy and paste this URL into your browser:</p>
          <p><code>${approvalQueueUrl}</code></p>
        `,
        text: `
Deal Approval Request

A new deal requires your approval:

Deal: ${dealData.dealNumber ? `#${dealData.dealNumber}` : 'N/A'} - ${dealData.title || 'Untitled'}
Requested by: ${requesterData.name || requesterData.email}
Amount: $${(dealData.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Requested: ${now.toLocaleString()}

View Deal Approval Queue: ${approvalQueueUrl}
        `,
      })
    } catch (err) {
      console.error('Failed to send deal approval email (crmRouter fallback):', err)
    }

    res.json({ data: { approvalRequestId: approvalRequest._id, message: 'Approval request sent' }, error: null })
  } catch (err: any) {
    console.error('crmRouter deal approval error:', err)
    if (err.message?.includes('invalid_id')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: err.message || 'failed_to_request_approval' })
  }
})

// GET /api/crm/contacts/:id/history
crmRouter.get('/contacts/:id/history', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const contact = await db.collection('contacts').findOne({ _id })
    if (!contact) return res.status(404).json({ data: null, error: 'not_found' })
    const createdAt = _id.getTimestamp()

    // Get all history entries for this contact, sorted by date (newest first)
    const historyEntries = await db.collection('contact_history')
      .find({ contactId: _id })
      .sort({ createdAt: -1 })
      .toArray() as ContactHistoryEntry[]

    // Enrollments
    const enrollments = await db
      .collection('outreach_enrollments')
      .find({ contactId: _id })
      .sort({ startedAt: -1 })
      .limit(200)
      .toArray()
    // Map sequence names
    const sequenceIds = Array.from(new Set(enrollments.map((e: any) => String(e.sequenceId))))
    const sequences = sequenceIds.length
      ? await db
          .collection('outreach_sequences')
          .find({ _id: { $in: sequenceIds.map((s) => new ObjectId(s)) } })
          .project({ name: 1 })
          .toArray()
      : []
    const seqMap = new Map(sequences.map((s: any) => [String(s._id), s.name]))
    const enrollmentsOut = enrollments.map((e: any) => ({
      _id: e._id,
      sequenceId: e.sequenceId,
      sequenceName: seqMap.get(String(e.sequenceId)) ?? String(e.sequenceId),
      startedAt: e.startedAt,
      completedAt: e.completedAt ?? null,
      lastStepIndex: e.lastStepIndex ?? -1,
    }))

    // Outreach events for this contact by recipient (email or phone)
    const recipients: string[] = []
    if (typeof (contact as any).email === 'string' && (contact as any).email) recipients.push((contact as any).email)
    for (const k of ['mobilePhone', 'officePhone']) {
      const v = (contact as any)[k]
      if (typeof v === 'string' && v) recipients.push(v)
    }
    const events = recipients.length
      ? await db
          .collection('outreach_events')
          .find({ recipient: { $in: recipients } })
          .sort({ at: -1 })
          .limit(200)
          .toArray()
      : []

    res.json({ 
      data: { 
        history: historyEntries,
        createdAt, 
        enrollments: enrollmentsOut, 
        events,
        contact: {
          name: (contact as any).name,
          email: (contact as any).email,
          company: (contact as any).company,
          createdAt,
        }
      }, 
      error: null 
    })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// Mount sub-routers that use /api/crm prefix
crmRouter.use('/vendors', vendorsRouter)
crmRouter.use('/revenue-intelligence', revenueIntelligenceRouter)


