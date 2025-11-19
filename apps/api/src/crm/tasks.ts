import { Router } from 'express'
import { getDb } from '../db.js'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { requireAuth } from '../auth/rbac.js'

export const tasksRouter = Router()

// All task routes require an authenticated user so we can use req.auth safely
tasksRouter.use(requireAuth)

type TaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'
type TaskType = 'call' | 'meeting' | 'todo'
type TaskPriority = 'low' | 'normal' | 'high'
type TaskRelatedType = 'contact' | 'account' | 'deal' | 'invoice' | 'quote'

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
  type: z.enum(['call', 'meeting', 'todo']).default('todo'),
  subject: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  dueAt: z.string().optional(), // ISO string from client
  relatedType: z.enum(['contact', 'account', 'deal', 'invoice', 'quote']).optional(),
  relatedId: z.string().optional(),
})

const updateTaskSchema = z.object({
  type: z.enum(['call', 'meeting', 'todo']).optional(),
  subject: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  dueAt: z.string().optional().nullable(),
  relatedType: z.enum(['contact', 'account', 'deal', 'invoice', 'quote']).optional().nullable(),
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
  if (type && ['call', 'meeting', 'todo'].includes(type)) {
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
  if (relatedType && ['contact', 'account', 'deal', 'invoice', 'quote'].includes(relatedType)) {
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

  const coll = db.collection<TaskDoc>('tasks')
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

  await db.collection<TaskDoc>('tasks').insertOne(doc)

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

  const coll = db.collection<TaskDoc>('tasks')
  const filter: any = {
    $or: [
      { _id: idStr },
      { _id: new ObjectId(idStr) },
    ],
  }
  const result = await coll.findOneAndUpdate(
    filter,
    { $set: update },
    { returnDocument: 'after' },
  ) as any

  if (!result || !result.value) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  res.json({ data: serializeTask(result.value), error: null })
})

// POST /api/crm/tasks/:id/complete
tasksRouter.post('/:id/complete', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const idStr = String(req.params.id)
  const now = new Date()
  const coll = db.collection<TaskDoc>('tasks')
  const filter: any = {
    $or: [
      { _id: idStr },
      { _id: new ObjectId(idStr) },
    ],
  }
  const result = await coll.findOneAndUpdate(
    filter,
    { $set: { status: 'completed' as TaskStatus, completedAt: now, updatedAt: now } },
    { returnDocument: 'after' },
  ) as any

  if (!result || !result.value) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  res.json({ data: serializeTask(result.value), error: null })
})

// DELETE /api/crm/tasks/:id
tasksRouter.delete('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const idStr = String(req.params.id)
  const result = await db.collection<TaskDoc>('tasks').deleteOne({
    $or: [
      { _id: idStr },
      { _id: new ObjectId(idStr) },
    ],
  } as any)
  if (!result.deletedCount) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  res.json({ data: { ok: true }, error: null })
})


