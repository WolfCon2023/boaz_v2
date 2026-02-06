import { Router } from 'express'
import { getDb } from '../db.js'
import { z } from 'zod'
import { ObjectId, Db } from 'mongodb'
import { requireAuth } from '../auth/rbac.js'

export const tasksRouter = Router()

// All task routes require an authenticated user so we can use req.auth safely
tasksRouter.use(requireAuth)

type TaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'
type TaskType = 'call' | 'meeting' | 'todo' | 'email' | 'note'
type TaskPriority = 'low' | 'normal' | 'high'
type TaskRelatedType = 'contact' | 'account' | 'deal' | 'invoice' | 'quote' | 'project'

type TaskHistoryEntry = {
  _id: ObjectId
  taskId: string
  eventType: 'created' | 'updated' | 'status_changed' | 'priority_changed' | 'completed' | 'reopened' | 'field_changed' | 'deleted'
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
async function addTaskHistory(
  db: Db,
  taskId: string,
  eventType: TaskHistoryEntry['eventType'],
  description: string,
  userId?: string,
  userName?: string,
  userEmail?: string,
  oldValue?: any,
  newValue?: any,
  metadata?: Record<string, any>
) {
  try {
    await db.collection('task_history').insertOne({
      _id: new ObjectId(),
      taskId,
      eventType,
      description,
      userId,
      userName,
      userEmail,
      oldValue,
      newValue,
      metadata,
      createdAt: new Date(),
    } as TaskHistoryEntry)
  } catch (err) {
    console.error('Failed to add task history:', err)
    // Don't fail the main operation if history fails
  }
}

type TaskDoc = {
  _id: string
  type: TaskType
  subject: string
  description?: string
  status: TaskStatus
  priority?: TaskPriority
  dueAt?: Date | null
  completedAt?: Date | null
  ownerUserId?: string
  ownerName?: string
  ownerEmail?: string
  relatedType?: TaskRelatedType
  relatedId?: string
  createdAt: Date
  updatedAt: Date
}

const createTaskSchema = z.object({
  type: z.enum(['call', 'meeting', 'todo', 'email', 'note']).default('todo'),
  subject: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  dueAt: z.string().optional(), // ISO string from client
  relatedType: z.enum(['contact', 'account', 'deal', 'invoice', 'quote', 'project']).optional(),
  relatedId: z.string().optional(),
})

const updateTaskSchema = z.object({
  type: z.enum(['call', 'meeting', 'todo', 'email', 'note']).optional(),
  subject: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  dueAt: z.string().optional().nullable(),
  relatedType: z.enum(['contact', 'account', 'deal', 'invoice', 'quote', 'project']).optional().nullable(),
  relatedId: z.string().optional().nullable(),
})

function serializeTask(doc: TaskDoc) {
  return {
    ...doc,
    _id: String(doc._id),
    dueAt: doc.dueAt ? doc.dueAt.toISOString() : null,
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
    createdAt: doc.createdAt ? doc.createdAt.toISOString() : undefined,
    updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : undefined,
  }
}

// GET /api/crm/tasks
// Query params:
//   q, status, type, priority, mine (1|0), ownerId, relatedType, relatedId, sort, dir, page, limit
tasksRouter.get('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [], total: 0, page: 0, limit: 25 }, error: null })

  const auth = (req as any).auth as { userId: string; email: string } | undefined
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 25)))
  const page = Math.max(0, Number(req.query.page ?? 0))
  const skip = page * limit

  const filter: Record<string, any> = {}

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (q) {
    filter.$or = [
      { subject: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ]
  }

  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined
  if (status && ['open', 'in_progress', 'completed', 'cancelled'].includes(status)) {
    filter.status = status
  }

  const type = typeof req.query.type === 'string' && req.query.type ? req.query.type : undefined
  if (type && ['call', 'meeting', 'todo', 'email', 'note'].includes(type)) {
    filter.type = type
  }

  const priority = typeof req.query.priority === 'string' && req.query.priority ? req.query.priority : undefined
  if (priority && ['low', 'normal', 'high'].includes(priority)) {
    filter.priority = priority
  }

  const mine = String(req.query.mine ?? '').trim()
  const ownerIdParam = String(req.query.ownerId ?? '').trim()
  if (mine === '1' && auth?.userId) {
    filter.ownerUserId = auth.userId
  } else if (ownerIdParam) {
    filter.ownerUserId = ownerIdParam
  }

  const relatedType = typeof req.query.relatedType === 'string' && req.query.relatedType ? req.query.relatedType : undefined
  if (relatedType && ['contact', 'account', 'deal', 'invoice', 'quote', 'project'].includes(relatedType)) {
    filter.relatedType = relatedType
  }
  const relatedId = typeof req.query.relatedId === 'string' && req.query.relatedId ? req.query.relatedId : undefined
  if (relatedId) {
    filter.relatedId = relatedId
  }

  const sortKeyRaw = (req.query.sort as string) || ''
  const dirRaw = (req.query.dir as string) || 'asc'
  const dir: 1 | -1 = dirRaw.toLowerCase() === 'desc' ? -1 : 1
  const allowedSort: Record<string, 1 | -1> = {
    dueAt: dir,
    createdAt: dir,
    priority: dir,
    status: dir,
  }
  const sort: Record<string, 1 | -1> =
    allowedSort[sortKeyRaw] ? { [sortKeyRaw]: allowedSort[sortKeyRaw] } : { dueAt: 1, createdAt: -1 }

  const coll = db.collection<TaskDoc>('crm_tasks')
  const [items, total] = await Promise.all([
    coll.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
    coll.countDocuments(filter),
  ])

  res.json({
    data: {
      items: items.map(serializeTask),
      total,
      page,
      limit,
    },
    error: null,
  })
})

// GET /api/crm/tasks/counts?relatedType=contact&relatedIds=id1,id2,id3&status=open
tasksRouter.get('/counts', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const relatedType = typeof req.query.relatedType === 'string' ? req.query.relatedType : ''
  const idsParam = typeof req.query.relatedIds === 'string' ? req.query.relatedIds : ''
  const status = typeof req.query.status === 'string' ? req.query.status : ''

  if (!relatedType || !['contact', 'account', 'deal', 'invoice', 'quote', 'project'].includes(relatedType)) {
    return res.status(400).json({ data: null, error: 'invalid_relatedType' })
  }
  const rawIds = idsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!rawIds.length) {
    return res.json({ data: { items: [] }, error: null })
  }

  const match: any = {
    relatedType,
    relatedId: { $in: rawIds },
  }
  if (status && ['open', 'in_progress', 'completed', 'cancelled'].includes(status)) {
    match.status = status
  }

  const coll = db.collection<TaskDoc>('crm_tasks')
  const rows = await coll
    .aggregate<{ _id: string; count: number }>([
      { $match: match },
      { $group: { _id: '$relatedId', count: { $sum: 1 } } },
    ])
    .toArray()

  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(String(r._id), r.count)
  }

  const items = rawIds.map((id) => ({
    relatedId: id,
    count: map.get(id) ?? 0,
  }))

  return res.json({ data: { items }, error: null })
})

// GET /api/crm/tasks/:id - single-task fetch with related entity details
tasksRouter.get('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const idStr = String(req.params.id)
  const coll = db.collection<TaskDoc>('crm_tasks')

  const doc = await coll.findOne({ _id: idStr } as any)

  if (!doc) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  const serialized: any = serializeTask(doc)

  // Enrich with related entity details (contact name/email/phone, account name, deal name)
  if (doc.relatedType && doc.relatedId) {
    try {
      const collectionMap: Record<string, string> = {
        contact: 'contacts',
        account: 'accounts',
        deal: 'deals',
        invoice: 'invoices',
        quote: 'quotes',
        project: 'projects',
      }
      const relCollection = collectionMap[doc.relatedType]
      if (relCollection) {
        let relDoc: any = null
        // contacts/accounts/deals use ObjectId; try ObjectId first, then string
        if (ObjectId.isValid(doc.relatedId)) {
          relDoc = await db.collection(relCollection).findOne({ _id: new ObjectId(doc.relatedId) })
        }
        if (!relDoc) {
          relDoc = await db.collection(relCollection).findOne({ _id: doc.relatedId } as any)
        }
        if (relDoc) {
          serialized.relatedEntity = {
            id: String(relDoc._id),
            type: doc.relatedType,
            name: relDoc.name || relDoc.subject || relDoc.title || relDoc.dealName || null,
            email: relDoc.email || null,
            phone: relDoc.mobilePhone || relDoc.officePhone || relDoc.phone || null,
            company: relDoc.company || relDoc.accountName || null,
          }
        }
      }
    } catch (_e) {
      // Non-critical – just skip entity enrichment
    }
  }

  return res.json({ data: serialized, error: null })
})

// POST /api/crm/tasks
tasksRouter.post('/', async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = (req as any).auth as { userId: string; email: string } | undefined
  const now = new Date()

  let dueAt: Date | undefined
  if (parsed.data.dueAt) {
    const d = new Date(parsed.data.dueAt)
    if (!Number.isFinite(d.getTime())) {
      return res.status(400).json({ data: null, error: 'invalid_dueAt' })
    }
    dueAt = d
  }

  const status: TaskStatus = parsed.data.status ?? 'open'

  let ownerName: string | undefined
  let ownerUserId: string | undefined = auth?.userId
  let ownerEmail: string | undefined = auth?.email

  try {
    if (auth?.userId) {
      const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
      if (user && typeof (user as any).name === 'string') {
        ownerName = (user as any).name
      }
    }
  } catch {
    // If user lookup fails, we still create the task
  }

  const newId = new ObjectId().toHexString()

  const doc: TaskDoc = {
    _id: newId,
    type: parsed.data.type,
    subject: parsed.data.subject,
    description: parsed.data.description,
    status,
    priority: parsed.data.priority ?? 'normal',
    dueAt: dueAt ?? null,
    completedAt: status === 'completed' ? now : null,
    ownerUserId,
    ownerName,
    ownerEmail,
    relatedType: parsed.data.relatedType,
    relatedId: parsed.data.relatedId,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection<TaskDoc>('crm_tasks').insertOne(doc)

  // Add history entry for creation
  await addTaskHistory(
    db,
    newId,
    'created',
    `Task "${parsed.data.subject}" created`,
    auth?.userId,
    ownerName,
    auth?.email
  )

  res.status(201).json({ data: serializeTask(doc), error: null })
})

// PUT /api/crm/tasks/:id
tasksRouter.put('/:id', async (req, res) => {
  const parsed = updateTaskSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = (req as any).auth as { userId: string; email: string } | undefined
  let userName: string | undefined
  try {
    if (auth?.userId) {
      const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
      if (user && typeof (user as any).name === 'string') {
        userName = (user as any).name
      }
    }
  } catch {
    // ignore lookup failures
  }

  const idStr = String(req.params.id)
  const update: Partial<TaskDoc> = {}
  const body = parsed.data

  if (body.type) update.type = body.type
  if (body.subject !== undefined) update.subject = body.subject
  if (body.description !== undefined) update.description = body.description
  if (body.priority) update.priority = body.priority
  if (body.relatedType !== undefined) update.relatedType = body.relatedType ?? undefined
  if (body.relatedId !== undefined) update.relatedId = body.relatedId ?? undefined

  if (body.dueAt !== undefined) {
    if (body.dueAt === null || body.dueAt === '') {
      update.dueAt = null
    } else {
      const d = new Date(body.dueAt)
      if (!Number.isFinite(d.getTime())) {
        return res.status(400).json({ data: null, error: 'invalid_dueAt' })
      }
      update.dueAt = d
    }
  }

  const now = new Date()

  if (body.status) {
    update.status = body.status
    if (body.status === 'completed') {
      update.completedAt = now
    } else if (body.status === 'open' || body.status === 'in_progress') {
      update.completedAt = null
    }
  }

  update.updatedAt = now

  const coll = db.collection<TaskDoc>('crm_tasks')
  const filter: any = { _id: idStr }

  const existing = await coll.findOne(filter as any)
  if (!existing) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  await coll.updateOne(filter as any, { $set: update } as any)
  const updated = await coll.findOne(filter as any)

  // Track history for significant changes
  if (body.status && body.status !== existing.status) {
    if (body.status === 'completed' && existing.status !== 'completed') {
      await addTaskHistory(
        db,
        idStr,
        'completed',
        `Task marked as completed`,
        auth?.userId,
        userName,
        auth?.email,
        existing.status,
        body.status
      )
    } else if ((body.status === 'open' || body.status === 'in_progress') && existing.status === 'completed') {
      await addTaskHistory(
        db,
        idStr,
        'reopened',
        `Task reopened (status changed from "${existing.status}" to "${body.status}")`,
        auth?.userId,
        userName,
        auth?.email,
        existing.status,
        body.status
      )
    } else {
      await addTaskHistory(
        db,
        idStr,
        'status_changed',
        `Status changed from "${existing.status}" to "${body.status}"`,
        auth?.userId,
        userName,
        auth?.email,
        existing.status,
        body.status
      )
    }
  }

  if (body.priority && body.priority !== existing.priority) {
    await addTaskHistory(
      db,
      idStr,
      'priority_changed',
      `Priority changed from "${existing.priority}" to "${body.priority}"`,
      auth?.userId,
      userName,
      auth?.email,
      existing.priority,
      body.priority
    )
  }

  // Track other field changes
  const changedFields: string[] = []
  if (body.subject !== undefined && body.subject !== existing.subject) changedFields.push('subject')
  if (body.description !== undefined && body.description !== existing.description) changedFields.push('description')
  if (body.type && body.type !== existing.type) changedFields.push('type')
  if (body.dueAt !== undefined) changedFields.push('dueAt')
  if (body.relatedType !== undefined && body.relatedType !== existing.relatedType) changedFields.push('relatedType')
  if (body.relatedId !== undefined && body.relatedId !== existing.relatedId) changedFields.push('relatedId')

  // Remove fields already tracked separately
  const otherChanges = changedFields.filter(f => !['status', 'priority'].includes(f))
  if (otherChanges.length > 0) {
    await addTaskHistory(
      db,
      idStr,
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

  res.json({ data: serializeTask(updated as TaskDoc), error: null })
})

// POST /api/crm/tasks/:id/complete
tasksRouter.post('/:id/complete', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = (req as any).auth as { userId: string; email: string } | undefined
  let userName: string | undefined
  try {
    if (auth?.userId) {
      const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
      if (user && typeof (user as any).name === 'string') {
        userName = (user as any).name
      }
    }
  } catch {
    // ignore lookup failures
  }

  const idStr = String(req.params.id)
  const now = new Date()
  const coll = db.collection<TaskDoc>('crm_tasks')
  const filter: any = { _id: idStr }

  const existing = await coll.findOne(filter as any)
  if (!existing) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  await coll.updateOne(filter as any, { $set: { status: 'completed' as TaskStatus, completedAt: now, updatedAt: now } } as any)
  const updated = await coll.findOne(filter as any)

  // Add history entry for completion
  await addTaskHistory(
    db,
    idStr,
    'completed',
    `Task marked as completed`,
    auth?.userId,
    userName,
    auth?.email,
    existing.status,
    'completed'
  )

  res.json({ data: serializeTask(updated as TaskDoc), error: null })
})

// DELETE /api/crm/tasks/:id
tasksRouter.delete('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = (req as any).auth as { userId: string; email: string } | undefined
  let userName: string | undefined
  try {
    if (auth?.userId) {
      const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
      if (user && typeof (user as any).name === 'string') {
        userName = (user as any).name
      }
    }
  } catch {
    // ignore lookup failures
  }

  const idStr = String(req.params.id)
  
  const existing = await db.collection<TaskDoc>('crm_tasks').findOne({ _id: idStr } as any)
  if (!existing) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  // Add history entry before deletion
  await addTaskHistory(
    db,
    idStr,
    'deleted',
    `Task "${existing.subject}" deleted`,
    auth?.userId,
    userName,
    auth?.email
  )

  const result = await db.collection<TaskDoc>('crm_tasks').deleteOne({ _id: idStr } as any)
  if (!result.deletedCount) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  res.json({ data: { ok: true }, error: null })
})

// GET /api/crm/tasks/:id/history
tasksRouter.get('/:id/history', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const idStr = String(req.params.id)
  
  // Get task info
  const task = await db.collection<TaskDoc>('crm_tasks').findOne({ _id: idStr } as any)
  if (!task) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  // Get history entries
  const history = await db
    .collection<TaskHistoryEntry>('task_history')
    .find({ taskId: idStr })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray()

  res.json({
    data: {
      task: serializeTask(task),
      history: history.map((h) => ({
        _id: h._id.toHexString(),
        eventType: h.eventType,
        description: h.description,
        userName: h.userName,
        userEmail: h.userEmail,
        oldValue: h.oldValue,
        newValue: h.newValue,
        metadata: h.metadata,
        createdAt: h.createdAt.toISOString(),
      })),
      createdAt: task.createdAt?.toISOString?.() ?? new Date().toISOString(),
    },
    error: null,
  })
})


