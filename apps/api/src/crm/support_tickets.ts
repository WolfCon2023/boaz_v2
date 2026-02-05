import { Router } from 'express'
import { getDb, getNextSequence } from '../db.js'
import { ObjectId, Sort, Db } from 'mongodb'
import multer, { FileFilterCallback } from 'multer'
import fs from 'fs'
import path from 'path'
import { sendAuthEmail } from '../auth/email.js'
import { env } from '../env.js'
import { generateEmailTemplate, formatEmailTimestamp } from '../lib/email-templates.js'
import { createStandardEmailTemplate, createStandardTextEmail, createContentBox, createField } from '../lib/email-templates.js'
import { requireAuth } from '../auth/rbac.js'
import { dispatchCrmEvent } from './integrations_core.js'

export const supportTicketsRouter = Router()

type TicketHistoryEntry = {
  _id: ObjectId
  ticketId: string
  eventType: 'created' | 'updated' | 'status_changed' | 'priority_changed' | 'assigned' | 'escalated' | 'resolved' | 'closed' | 'comment_added' | 'field_changed' | 'deleted'
  description: string
  userId?: string
  userName?: string
  userEmail?: string
  oldValue?: any
  newValue?: any
  metadata?: Record<string, any>
  createdAt: Date
}

// Helper function to add ticket history entry
async function addTicketHistory(
  db: Db,
  ticketId: string,
  eventType: TicketHistoryEntry['eventType'],
  description: string,
  userId?: string,
  userName?: string,
  userEmail?: string,
  oldValue?: any,
  newValue?: any,
  metadata?: Record<string, any>
) {
  try {
    await db.collection('ticket_history').insertOne({
      _id: new ObjectId(),
      ticketId,
      eventType,
      description,
      userId,
      userName,
      userEmail,
      oldValue,
      newValue,
      metadata,
      createdAt: new Date(),
    } as TicketHistoryEntry)
  } catch (err) {
    console.error('Failed to add ticket history:', err)
    // Don't fail the main operation if history fails
  }
}

// === Ticket Attachments (disk storage, similar to CRM documents) ===
const ticketUploadDir = env.UPLOAD_DIR
  ? path.join(env.UPLOAD_DIR, 'ticket_attachments')
  : path.join(process.cwd(), 'uploads', 'ticket_attachments')

function ensureTicketUploadDir() {
  if (fs.existsSync(ticketUploadDir)) return
  fs.mkdirSync(ticketUploadDir, { recursive: true })
}

const ticketAttachmentStorage = multer.diskStorage({
  destination: (_req: any, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    try {
      // Lazily create the directory to avoid any startup-time filesystem stalls in some hosts.
      ensureTicketUploadDir()
      cb(null, ticketUploadDir)
    } catch (e: any) {
      cb(e, ticketUploadDir)
    }
  },
  filename: (_req: any, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')
    const ts = Date.now()
    const ext = path.extname(safe)
    const name = path.basename(safe, ext)
    cb(null, `${ts}-${name}${ext}`)
  },
})

const uploadTicketAttachments = multer({
  storage: ticketAttachmentStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 10 }, // 50MB each, up to 10 files per request
  fileFilter: (_req: any, _file: Express.Multer.File, cb: FileFilterCallback) => cb(null, true),
})

// Helper to extract email from assignee string (format: "Name <email>" or just "email")
function extractAssigneeEmail(assignee: any): string | null {
  if (!assignee || typeof assignee !== 'string') return null
  const match = assignee.match(/<(.+?)>/)
  if (match) return match[1].trim()
  // If no angle brackets, assume it's just an email
  if (assignee.includes('@')) return assignee.trim()
  return null
}

// Helper to send ticket notification email
async function sendTicketNotification(
  db: any,
  ticket: TicketDoc,
  assigneeEmail: string
) {
  try {
    const webUrl = env.ORIGIN.split(',')[0].trim() // Use first origin if multiple
    const ticketUrl = `${webUrl}/apps/crm/support/tickets?ticket=${ticket._id?.toHexString()}`

    // Get account and contact info if available
    let accountName = ''
    let contactName = ''
    
    if (ticket.accountId) {
      const account = await db.collection('accounts').findOne({ _id: ticket.accountId })
      if (account) accountName = account.name || ''
    }
    
    if (ticket.contactId) {
      const contact = await db.collection('contacts').findOne({ _id: ticket.contactId })
      if (contact) contactName = contact.name || contact.email || ''
    }

    // Build info box items
    const infoItems: Array<{ label: string; value: string }> = [
      { label: 'Ticket Number', value: `#${ticket.ticketNumber || 'N/A'}` },
      { label: 'Subject', value: ticket.shortDescription },
    ]
    
    if (ticket.description) {
      infoItems.push({ label: 'Description', value: ticket.description })
    }
    
    const priorityBadge = (ticket.priority || 'normal').toUpperCase()
    infoItems.push({ label: 'Priority', value: priorityBadge })
    infoItems.push({ label: 'Status', value: (ticket.status || 'open').toUpperCase() })
    
    if (accountName) {
      infoItems.push({ label: 'Account', value: accountName })
    }
    
    if (contactName) {
      infoItems.push({ label: 'Contact', value: contactName })
    }
    
    if (ticket.requesterName || ticket.requesterEmail) {
      const requester = `${ticket.requesterName || ''} ${ticket.requesterEmail ? `<${ticket.requesterEmail}>` : ''}`.trim()
      infoItems.push({ label: 'Requester', value: requester })
    }
    
    if (ticket.slaDueAt) {
      infoItems.push({ label: 'SLA Due', value: formatEmailTimestamp(new Date(ticket.slaDueAt)) })
    }
    
    infoItems.push({ label: 'Created', value: formatEmailTimestamp(new Date(ticket.createdAt)) })

    // Generate email using unified template
    const { html, text } = generateEmailTemplate({
      header: {
        title: 'Support Ticket Assigned',
        subtitle: `Ticket #${ticket.ticketNumber || 'N/A'}`,
        icon: '🎟️',
      },
      content: {
        message: 'A new support ticket has been assigned to you. Please review the details below and take appropriate action.',
        infoBox: {
          title: 'Ticket Details',
          items: infoItems,
        },
        actionButton: {
          text: 'View Ticket',
          url: ticketUrl,
        },
        additionalInfo: 'This ticket has been assigned to you in the BOAZ-OS Help Desk. Click the button above to view full details and respond to the ticket.',
      },
    })

    await sendAuthEmail({
      to: assigneeEmail,
      subject: `🎟️ Support Ticket #${ticket.ticketNumber || 'N/A'} Assigned: ${ticket.shortDescription}`,
      html,
      text,
    })

    console.log(`✅ Ticket notification sent to ${assigneeEmail} for ticket #${ticket.ticketNumber}`)
  } catch (error) {
    console.error(`❌ Failed to send ticket notification to ${assigneeEmail}:`, error)
    // Don't throw - we don't want email failures to prevent ticket creation
  }
}

type TicketComment = { author: any; body: string; at: Date }
type TicketAttachment = {
  _id: ObjectId
  filename: string
  originalFilename: string
  contentType: string
  size: number
  path: string
  uploadedAt: Date
  uploadedByUserId?: ObjectId
  uploadedByName?: string
  uploadedByEmail?: string
}
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
  assigneeId: ObjectId | null
  owner: any
  ownerId: ObjectId | null
  slaDueAt: Date | null
  comments: TicketComment[]
  attachments?: TicketAttachment[]
  createdAt: Date
  updatedAt: Date
  requesterName?: string | null
  requesterEmail?: string | null
  requesterPhone?: string | null
  type?: string | null
}

// POST /api/crm/support/tickets/:id/attachments (multipart/form-data with files[])
supportTicketsRouter.post('/tickets/:id/attachments', requireAuth, uploadTicketAttachments.array('files', 10), async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const ticket = await db.collection<TicketDoc>('support_tickets').findOne({ _id })
    if (!ticket) return res.status(404).json({ data: null, error: 'not_found' })

    const auth = (req as any).auth as { userId: string; email: string }
    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    const userName = (user as any)?.name || auth.email

    const files = ((req as any).files as Express.Multer.File[] | undefined) ?? []
    if (!files.length) return res.status(400).json({ data: null, error: 'missing_files' })

    const attachments: TicketAttachment[] = files.map((f) => ({
      _id: new ObjectId(),
      filename: f.filename,
      originalFilename: f.originalname,
      contentType: f.mimetype,
      size: f.size,
      path: f.path,
      uploadedAt: new Date(),
      uploadedByUserId: new ObjectId(auth.userId),
      uploadedByName: userName,
      uploadedByEmail: auth.email,
    }))

    await db.collection<TicketDoc>('support_tickets').updateOne(
      { _id },
      {
        $push: { attachments: { $each: attachments } } as any,
        $set: { updatedAt: new Date() },
      }
    )

    res.json({
      data: {
        items: attachments.map((a) => ({
          id: a._id.toHexString(),
          name: a.originalFilename,
          size: a.size,
          contentType: a.contentType,
          uploadedAt: a.uploadedAt,
          uploadedByName: a.uploadedByName,
          uploadedByEmail: a.uploadedByEmail,
        })),
      },
      error: null,
    })
  } catch (e: any) {
    console.error('Ticket attachment upload error:', e)
    res.status(400).json({ data: null, error: e?.message || 'upload_failed' })
  }
})

// GET /api/crm/support/tickets/:id/attachments/:attachmentId/download
supportTicketsRouter.get('/tickets/:id/attachments/:attachmentId/download', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const attId = new ObjectId(req.params.attachmentId)
    const ticket = await db.collection<TicketDoc>('support_tickets').findOne({ _id }, { projection: { attachments: 1 } as any })
    if (!ticket) return res.status(404).json({ data: null, error: 'not_found' })
    const att = (ticket.attachments ?? []).find((a) => String(a._id) === String(attId))
    if (!att) return res.status(404).json({ data: null, error: 'attachment_not_found' })
    if (!att.path || !fs.existsSync(att.path)) return res.status(404).json({ data: null, error: 'file_missing' })

    res.setHeader('Content-Type', att.contentType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${String(att.originalFilename || 'attachment').replace(/"/g, '')}"`)
    fs.createReadStream(att.path).pipe(res)
  } catch (e: any) {
    res.status(400).json({ data: null, error: e?.message || 'invalid_request' })
  }
})

// DELETE /api/crm/support/tickets/:id/attachments/:attachmentId
supportTicketsRouter.delete('/tickets/:id/attachments/:attachmentId', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const attId = new ObjectId(req.params.attachmentId)
    const ticket = await db
      .collection<TicketDoc>('support_tickets')
      .findOne({ _id }, { projection: { attachments: 1 } as any })
    if (!ticket) return res.status(404).json({ data: null, error: 'not_found' })

    const att = (ticket.attachments ?? []).find((a) => String(a._id) === String(attId))
    if (!att) return res.status(404).json({ data: null, error: 'attachment_not_found' })

    await db.collection<TicketDoc>('support_tickets').updateOne(
      { _id },
      {
        $pull: { attachments: { _id: attId } } as any,
        $set: { updatedAt: new Date() },
      },
    )

    // Best-effort disk cleanup; don't fail the request if the file is already missing.
    try {
      if (att.path && fs.existsSync(att.path)) fs.unlinkSync(att.path)
    } catch (e) {
      console.warn('Failed to delete ticket attachment file:', e)
    }

    return res.json({ data: { ok: true }, error: null })
  } catch (e: any) {
    return res.status(400).json({ data: null, error: e?.message || 'invalid_request' })
  }
})

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
      assigneeId: ObjectId.isValid(raw.assigneeId) ? new ObjectId(raw.assigneeId) : null,
      owner: (raw.owner as any) || null,
      ownerId: ObjectId.isValid(raw.ownerId) ? new ObjectId(raw.ownerId) : null,
      slaDueAt: raw.slaDueAt ? new Date(raw.slaDueAt) : null,
      comments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      requesterName: typeof raw.requesterName === 'string' ? raw.requesterName : null,
      requesterEmail: typeof raw.requesterEmail === 'string' ? raw.requesterEmail : null,
      requesterPhone: typeof raw.requesterPhone === 'string' ? raw.requesterPhone : null,
      type: typeof raw.type === 'string' ? raw.type : 'internal',
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
        doc._id = result.insertedId
        
        // Emit webhook event (fire-and-forget)
        dispatchCrmEvent(
          db,
          'support.ticket.created',
          {
            ticketId: String(result.insertedId),
            ticketNumber: doc.ticketNumber ?? null,
            shortDescription: doc.shortDescription,
            status: doc.status,
            priority: doc.priority,
            accountId: doc.accountId ? String(doc.accountId) : null,
            contactId: doc.contactId ? String(doc.contactId) : null,
            requesterName: doc.requesterName ?? null,
            requesterEmail: doc.requesterEmail ?? null,
            requesterPhone: doc.requesterPhone ?? null,
            createdAt: doc.createdAt,
          },
          { source: 'crm.support_tickets.create' },
        ).catch(() => {})

        // Add history entry for creation
        const auth = (req as any).auth as { userId: string; email: string } | undefined
        let creatorName: string | undefined
        try {
          if (auth?.userId) {
            const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
            if (user && typeof (user as any).name === 'string') {
              creatorName = (user as any).name
            }
          }
        } catch {}
        await addTicketHistory(
          db,
          result.insertedId.toHexString(),
          'created',
          `Ticket #${doc.ticketNumber} created: ${doc.shortDescription}`,
          auth?.userId,
          creatorName,
          auth?.email
        )

        // Send email notification to assignee if assigned
        if (doc.assignee) {
          const assigneeEmail = extractAssigneeEmail(doc.assignee)
          if (assigneeEmail) {
            // Send email asynchronously (don't wait)
            sendTicketNotification(db, doc, assigneeEmail).catch(err => {
              console.error('Failed to send ticket notification:', err)
            })
          }
        }
        
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
// POST /api/crm/support/portal/tickets { shortDescription, description, requesterName, requesterEmail, requesterPhone }
supportTicketsRouter.post('/portal/tickets', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const raw = req.body ?? {}
    const shortDescription = typeof raw.shortDescription === 'string' ? raw.shortDescription.trim() : ''
    const requesterName = typeof raw.requesterName === 'string' ? raw.requesterName.trim() : ''
    const requesterEmail = typeof raw.requesterEmail === 'string' ? raw.requesterEmail.trim() : ''
    const requesterPhone = typeof raw.requesterPhone === 'string' ? raw.requesterPhone.trim() : ''
    
    // Validate required fields
    // Support Portal UI only requires email + short description. Phone/name are optional.
    if (!shortDescription) {
      return res.status(400).json({ data: null, error: 'missing_shortDescription' })
    }
    if (!requesterEmail && !requesterPhone) {
      return res.status(400).json({ data: null, error: 'missing_contact' })
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
      assigneeId: null,
      owner: null,
      ownerId: null,
      slaDueAt: null,
      comments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      requesterName: requesterName || requesterEmail || 'Customer',
      requesterEmail: requesterEmail || null,
      requesterPhone: requesterPhone || null,
      type: 'external',
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
        doc._id = result.insertedId
        
        // Send email notification to assignee if assigned (for portal tickets too)
        if (doc.assignee) {
          const assigneeEmail = extractAssigneeEmail(doc.assignee)
          if (assigneeEmail) {
            // Send email asynchronously (don't wait)
            sendTicketNotification(db, doc, assigneeEmail).catch(err => {
              console.error('Failed to send ticket notification:', err)
            })
          }
        }
        
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
    
    // Get current ticket to check if assignee is changing
    const currentTicket = await db.collection<TicketDoc>('support_tickets').findOne({ _id })
    if (!currentTicket) {
      return res.status(404).json({ data: null, error: 'ticket_not_found' })
    }
    
    const update: any = { updatedAt: new Date() }
    // Accept both 'shortDescription' and legacy 'title' for compatibility
    if (typeof (req.body ?? {}).shortDescription === 'string') update.shortDescription = (req.body as any).shortDescription
    else if (typeof (req.body ?? {}).title === 'string') update.shortDescription = (req.body as any).title
    for (const k of ['status','priority','assignee','owner']) if (typeof (req.body ?? {})[k] === 'string') update[k] = (req.body as any)[k]
    if (typeof (req.body ?? {}).description === 'string') {
      const d = String((req.body as any).description)
      update.description = d.length > 2500 ? d.slice(0, 2500) : d
    }
    if (req.body?.slaDueAt) update.slaDueAt = new Date(req.body.slaDueAt)
    if (req.body?.accountId && ObjectId.isValid(req.body.accountId)) update.accountId = new ObjectId(req.body.accountId)
    if (req.body?.contactId && ObjectId.isValid(req.body.contactId)) update.contactId = new ObjectId(req.body.contactId)
    if (req.body?.assigneeId && ObjectId.isValid(req.body.assigneeId)) update.assigneeId = new ObjectId(req.body.assigneeId)
    if (req.body?.ownerId && ObjectId.isValid(req.body.ownerId)) update.ownerId = new ObjectId(req.body.ownerId)
    
    await db.collection<TicketDoc>('support_tickets').updateOne({ _id }, { $set: update })
    
    // Get user info for history
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let userName: string | undefined
    try {
      if (auth?.userId) {
        const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
        if (user && typeof (user as any).name === 'string') {
          userName = (user as any).name
        }
      }
    } catch {}

    // Track history for significant changes
    if (update.status && update.status !== currentTicket.status) {
      let eventType: TicketHistoryEntry['eventType'] = 'status_changed'
      if (update.status === 'resolved') eventType = 'resolved'
      else if (update.status === 'closed') eventType = 'closed'
      
      await addTicketHistory(
        db,
        req.params.id,
        eventType,
        `Status changed from "${currentTicket.status}" to "${update.status}"`,
        auth?.userId,
        userName,
        auth?.email,
        currentTicket.status,
        update.status
      )
    }

    if (update.priority && update.priority !== currentTicket.priority) {
      const isEscalation = ['high', 'urgent', 'p1'].includes(update.priority) && 
                          !['high', 'urgent', 'p1'].includes(currentTicket.priority || '')
      await addTicketHistory(
        db,
        req.params.id,
        isEscalation ? 'escalated' : 'priority_changed',
        `Priority changed from "${currentTicket.priority}" to "${update.priority}"`,
        auth?.userId,
        userName,
        auth?.email,
        currentTicket.priority,
        update.priority
      )
    }

    if (update.assignee && update.assignee !== currentTicket.assignee) {
      await addTicketHistory(
        db,
        req.params.id,
        'assigned',
        `Assigned to ${update.assignee}`,
        auth?.userId,
        userName,
        auth?.email,
        currentTicket.assignee,
        update.assignee
      )
    }

    // Track other field changes
    const changedFields: string[] = []
    if (update.shortDescription && update.shortDescription !== currentTicket.shortDescription) changedFields.push('shortDescription')
    if (update.description && update.description !== currentTicket.description) changedFields.push('description')
    if (update.slaDueAt) changedFields.push('slaDueAt')
    if (update.accountId) changedFields.push('accountId')
    if (update.contactId) changedFields.push('contactId')
    if (update.owner && update.owner !== currentTicket.owner) changedFields.push('owner')

    const otherChanges = changedFields.filter(f => !['status', 'priority', 'assignee'].includes(f))
    if (otherChanges.length > 0) {
      await addTicketHistory(
        db,
        req.params.id,
        'field_changed',
        `Fields updated: ${otherChanges.join(', ')}`,
        auth?.userId,
        userName,
        auth?.email,
        undefined,
        undefined,
        { changedFields: otherChanges }
      )
    }
    
    // Send email notification if assignee was added or changed
    if (update.assignee && update.assignee !== currentTicket.assignee) {
      const assigneeEmail = extractAssigneeEmail(update.assignee)
      if (assigneeEmail) {
        // Get updated ticket with all fields for email
        const updatedTicket = await db.collection<TicketDoc>('support_tickets').findOne({ _id })
        if (updatedTicket) {
          // Send email asynchronously (don't wait)
          sendTicketNotification(db, updatedTicket, assigneeEmail).catch(err => {
            console.error('Failed to send ticket notification on update:', err)
          })
        }
      }
    }
    
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

    // Add history entry for comment
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let userName: string | undefined
    try {
      if (auth?.userId) {
        const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
        if (user && typeof (user as any).name === 'string') {
          userName = (user as any).name
        }
      }
    } catch {}
    await addTicketHistory(
      db,
      req.params.id,
      'comment_added',
      `Comment added by ${comment.author}`,
      auth?.userId,
      userName,
      auth?.email,
      undefined,
      undefined,
      { commentPreview: comment.body.slice(0, 100) }
    )

    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// GET /api/crm/support/tickets/:id/history - Get ticket history
supportTicketsRouter.get('/tickets/:id/history', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const ticketId = req.params.id
    const history = await db
      .collection<TicketHistoryEntry>('ticket_history')
      .find({ ticketId })
      .sort({ createdAt: -1 })
      .toArray()
    res.json({ data: { history }, error: null })
  } catch (err) {
    console.error('Error fetching ticket history:', err)
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// DELETE /api/crm/support/tickets/:id - Delete a ticket (admin only)
supportTicketsRouter.delete('/tickets/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    
    // Get ticket before deletion for history
    const ticket = await db.collection<TicketDoc>('support_tickets').findOne({ _id })
    if (!ticket) {
      return res.status(404).json({ data: null, error: 'ticket_not_found' })
    }

    // Add history entry before deletion
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let userName: string | undefined
    try {
      if (auth?.userId) {
        const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
        if (user && typeof (user as any).name === 'string') {
          userName = (user as any).name
        }
      }
    } catch {}
    await addTicketHistory(
      db,
      req.params.id,
      'deleted',
      `Ticket #${ticket.ticketNumber} deleted: ${ticket.shortDescription}`,
      auth?.userId,
      userName,
      auth?.email
    )

    const result = await db.collection<TicketDoc>('support_tickets').deleteOne({ _id })
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ data: null, error: 'ticket_not_found' })
    }
    
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// POST /api/crm/support/tickets/:id/notify-customer - Send update email to customer
supportTicketsRouter.post('/tickets/:id/notify-customer', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const _id = new ObjectId(req.params.id)
    const { message, ccEmails } = req.body
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ data: null, error: 'message_required' })
    }
    
    // Get ticket details
    const ticket = await db.collection<TicketDoc>('support_tickets').findOne({ _id })
    if (!ticket) {
      return res.status(404).json({ data: null, error: 'ticket_not_found' })
    }
    
    if (!ticket.requesterEmail) {
      return res.status(400).json({ data: null, error: 'no_requester_email' })
    }
    
    // Send email
    const webUrl = env.ORIGIN.split(',')[0].trim()
    const ticketUrl = `${webUrl}/customer/tickets`
    
    const { html, text } = generateEmailTemplate({
      header: {
        title: 'Ticket Update',
        subtitle: `Ticket #${ticket.ticketNumber || 'N/A'}`,
        icon: '📬',
      },
      content: {
        greeting: `Hello ${ticket.requesterName || 'Customer'},`,
        message: message,
        infoBox: {
          title: 'Ticket Details',
          items: [
            { label: 'Ticket Number', value: `#${ticket.ticketNumber || 'N/A'}` },
            { label: 'Subject', value: ticket.shortDescription },
            { label: 'Status', value: (ticket.status || 'open').toUpperCase() },
            { label: 'Priority', value: (ticket.priority || 'normal').toUpperCase() },
          ],
        },
        actionButton: {
          text: 'View Ticket',
          url: ticketUrl,
        },
        additionalInfo: 'You can view the full ticket details and add comments by logging into the customer portal.',
      },
    })
    
    // Prepare recipients
    const recipients = [ticket.requesterEmail]
    if (ccEmails && typeof ccEmails === 'string') {
      const ccList = ccEmails.split(',').map(e => e.trim()).filter(Boolean)
      recipients.push(...ccList)
    }
    
    // Send to all recipients
    for (const recipient of recipients) {
      await sendAuthEmail({
        to: recipient,
        subject: `📬 Ticket Update: #${ticket.ticketNumber || 'N/A'} - ${ticket.shortDescription}`,
        html,
        text,
      })
    }
    
    // Add a system comment to the ticket
    const comment = {
      author: 'system',
      body: `Update sent to customer (${recipients.join(', ')}): ${message}`,
      at: new Date(),
    }
    
    await db.collection<TicketDoc>('support_tickets').updateOne(
      { _id },
      {
        $push: { comments: comment as TicketComment },
        $set: { updatedAt: new Date() },
      }
    )
    
    console.log(`✅ Customer update sent for ticket #${ticket.ticketNumber} to ${recipients.join(', ')}`)
    
    res.json({ data: { ok: true, recipients }, error: null })
  } catch (err: any) {
    console.error('Send customer update error:', err)
    res.status(500).json({ data: null, error: err.message || 'send_failed' })
  }
})


