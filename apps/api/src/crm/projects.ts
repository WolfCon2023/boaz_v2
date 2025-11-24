import { Router } from 'express'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { requireAuth } from '../auth/rbac.js'

export const projectsRouter = Router()

// All project routes require auth
projectsRouter.use(requireAuth)

type ProjectStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled'
type ProjectType = 'implementation' | 'onboarding' | 'change_request' | 'internal'
type ProjectHealth = 'on_track' | 'at_risk' | 'off_track'

type ProjectDoc = {
  _id: string
  name: string
  description?: string
  status: ProjectStatus
  type?: ProjectType
  accountId?: string
  dealId?: string
  ownerUserId?: string
  ownerName?: string
  ownerEmail?: string
  startDate?: Date | null
  targetEndDate?: Date | null
  actualEndDate?: Date | null
  health?: ProjectHealth
  progressPercent?: number | null
  createdAt: Date
  updatedAt: Date
}

type ProjectCountsByAccount = {
  kind: 'account'
  accountId: string
  total: number
  active: number
  completed: number
  atRisk: number
  offTrack: number
}

type ProjectCountsByDeal = {
  kind: 'deal'
  dealId: string
  total: number
  active: number
  completed: number
  atRisk: number
  offTrack: number
}

async function recomputeOnboardingStatus(db: any, accountIdStr?: string | null) {
  if (!accountIdStr) return
  let accountObjectId: ObjectId
  try {
    accountObjectId = new ObjectId(accountIdStr)
  } catch {
    return
  }

  const coll = db.collection('crm_projects')
  const rows = (await coll
    .find({ accountId: accountIdStr, type: 'onboarding' })
    .project({ status: 1 } as any)
    .toArray()) as Array<{ status: ProjectStatus }>

  let onboardingStatus: 'not_started' | 'in_progress' | 'complete' = 'not_started'

  if (rows.length) {
    const hasInProgressOrOnHold = rows.some(
      (r: { status: ProjectStatus }) => r.status === 'in_progress' || r.status === 'on_hold',
    )
    const hasCompleted = rows.some((r: { status: ProjectStatus }) => r.status === 'completed')

    if (hasInProgressOrOnHold) {
      // Any onboarding project that is actively being worked (in progress / on hold)
      onboardingStatus = 'in_progress'
    } else if (hasCompleted) {
      // No active projects but at least one completed → overall onboarding complete
      onboardingStatus = 'complete'
    } else {
      // Only not_started and/or cancelled onboarding projects → treat as not started
      onboardingStatus = 'not_started'
    }
  }

  await db.collection('accounts').updateOne({ _id: accountObjectId }, { $set: { onboardingStatus } })
}

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['not_started', 'in_progress', 'on_hold', 'completed', 'cancelled']).optional(),
  type: z.enum(['implementation', 'onboarding', 'change_request', 'internal']).optional(),
  accountId: z.string().optional(),
  dealId: z.string().optional(),
  startDate: z.string().optional(), // ISO from client
  targetEndDate: z.string().optional(),
  actualEndDate: z.string().optional(),
  health: z.enum(['on_track', 'at_risk', 'off_track']).optional(),
  progressPercent: z.number().min(0).max(100).optional(),
})

const updateProjectSchema = createProjectSchema.partial()

function serializeProject(doc: ProjectDoc) {
  return {
    ...doc,
    _id: String(doc._id),
    startDate: doc.startDate ? doc.startDate.toISOString() : null,
    targetEndDate: doc.targetEndDate ? doc.targetEndDate.toISOString() : null,
    actualEndDate: doc.actualEndDate ? doc.actualEndDate.toISOString() : null,
    createdAt: doc.createdAt?.toISOString?.() ?? undefined,
    updatedAt: doc.updatedAt?.toISOString?.() ?? undefined,
  }
}

// GET /api/crm/projects
// Query: q, status, type, health, accountId, dealId, ownerId, sort, dir, page, limit
projectsRouter.get('/', async (req, res) => {
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
      { name: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ]
  }

  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined
  if (status && ['not_started', 'in_progress', 'on_hold', 'completed', 'cancelled'].includes(status)) {
    filter.status = status
  }

  const type = typeof req.query.type === 'string' && req.query.type ? req.query.type : undefined
  if (type && ['implementation', 'onboarding', 'change_request', 'internal'].includes(type)) {
    filter.type = type
  }

  const health = typeof req.query.health === 'string' && req.query.health ? req.query.health : undefined
  if (health && ['on_track', 'at_risk', 'off_track'].includes(health)) {
    filter.health = health
  }

  const ownerIdParam = String(req.query.ownerId ?? '').trim()
  const mine = String(req.query.mine ?? '').trim()
  if (mine === '1' && auth?.userId) {
    filter.ownerUserId = auth.userId
  } else if (ownerIdParam) {
    filter.ownerUserId = ownerIdParam
  }

  const accountId = typeof req.query.accountId === 'string' && req.query.accountId ? req.query.accountId : undefined
  if (accountId) filter.accountId = accountId

  const dealId = typeof req.query.dealId === 'string' && req.query.dealId ? req.query.dealId : undefined
  if (dealId) filter.dealId = dealId

  const sortKeyRaw = (req.query.sort as string) || ''
  const dirRaw = (req.query.dir as string) || 'asc'
  const dir: 1 | -1 = dirRaw.toLowerCase() === 'desc' ? -1 : 1
  const allowedSort: Record<string, 1 | -1> = {
    targetEndDate: dir,
    startDate: dir,
    createdAt: dir,
    status: dir,
    health: dir,
  }
  const sort: Record<string, 1 | -1> =
    allowedSort[sortKeyRaw] ? { [sortKeyRaw]: allowedSort[sortKeyRaw] } : { targetEndDate: 1, createdAt: -1 }

  const coll = db.collection<ProjectDoc>('crm_projects')
  const [items, total] = await Promise.all([
    coll.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
    coll.countDocuments(filter),
  ])

  res.json({
    data: {
      items: items.map(serializeProject),
      total,
      page,
      limit,
    },
    error: null,
  })
})

// GET /api/crm/projects/counts?accountIds=id1,id2&dealIds=id3,id4
projectsRouter.get('/counts', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const accountIdsParam = typeof req.query.accountIds === 'string' ? req.query.accountIds : ''
  const dealIdsParam = typeof req.query.dealIds === 'string' ? req.query.dealIds : ''

  const accountIds = accountIdsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const dealIds = dealIdsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (!accountIds.length && !dealIds.length) {
    return res.json({ data: { items: [] as Array<ProjectCountsByAccount | ProjectCountsByDeal> }, error: null })
  }

  const coll = db.collection<ProjectDoc>('crm_projects')
  const items: Array<ProjectCountsByAccount | ProjectCountsByDeal> = []

  if (accountIds.length) {
    const rows = await coll
      .aggregate<{
        _id: string
        total: number
        active: number
        completed: number
        atRisk: number
        offTrack: number
      }>([
        { $match: { accountId: { $in: accountIds } } },
        {
          $group: {
            _id: '$accountId',
            total: { $sum: 1 },
            active: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['not_started', 'in_progress', 'on_hold']] },
                  1,
                  0,
                ],
              },
            },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
              },
            },
            atRisk: {
              $sum: {
                $cond: [{ $eq: ['$health', 'at_risk'] }, 1, 0],
              },
            },
            offTrack: {
              $sum: {
                $cond: [{ $eq: ['$health', 'off_track'] }, 1, 0],
              },
            },
          },
        },
      ])
      .toArray()

    for (const r of rows) {
      items.push({
        kind: 'account',
        accountId: r._id,
        total: r.total ?? 0,
        active: r.active ?? 0,
        completed: r.completed ?? 0,
        atRisk: r.atRisk ?? 0,
        offTrack: r.offTrack ?? 0,
      })
    }
  }

  if (dealIds.length) {
    const rows = await coll
      .aggregate<{
        _id: string
        total: number
        active: number
        completed: number
        atRisk: number
        offTrack: number
      }>([
        { $match: { dealId: { $in: dealIds } } },
        {
          $group: {
            _id: '$dealId',
            total: { $sum: 1 },
            active: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['not_started', 'in_progress', 'on_hold']] },
                  1,
                  0,
                ],
              },
            },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
              },
            },
            atRisk: {
              $sum: {
                $cond: [{ $eq: ['$health', 'at_risk'] }, 1, 0],
              },
            },
            offTrack: {
              $sum: {
                $cond: [{ $eq: ['$health', 'off_track'] }, 1, 0],
              },
            },
          },
        },
      ])
      .toArray()

    for (const r of rows) {
      items.push({
        kind: 'deal',
        dealId: r._id,
        total: r.total ?? 0,
        active: r.active ?? 0,
        completed: r.completed ?? 0,
        atRisk: r.atRisk ?? 0,
        offTrack: r.offTrack ?? 0,
      })
    }
  }

  return res.json({ data: { items }, error: null })
})

// GET /api/crm/projects/:id
projectsRouter.get('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const idStr = String(req.params.id)
  const coll = db.collection<ProjectDoc>('crm_projects')
  const doc = await coll.findOne({ _id: idStr } as any)

  if (!doc) return res.status(404).json({ data: null, error: 'not_found' })

  res.json({ data: serializeProject(doc), error: null })
})

// POST /api/crm/projects
projectsRouter.post('/', async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = (req as any).auth as { userId: string; email: string } | undefined

  const now = new Date()

  const parseDate = (value?: string) => {
    if (!value) return null
    // Handle YYYY-MM-DD (date-only) strings in a timezone-safe way by anchoring at midday UTC
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map((v) => Number(v))
      const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
      if (!Number.isFinite(dt.getTime())) return null
      return dt
    }
    const dt = new Date(value)
    if (!Number.isFinite(dt.getTime())) return null
    return dt
  }

  const body = parsed.data
  const newId = new ObjectId().toHexString()

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
    // ignore owner lookup failures
  }

  const doc: ProjectDoc = {
    _id: newId,
    name: body.name,
    description: body.description,
    status: body.status ?? 'not_started',
    type: body.type,
    accountId: body.accountId,
    dealId: body.dealId,
    ownerUserId,
    ownerName,
    ownerEmail,
    startDate: parseDate(body.startDate),
    targetEndDate: parseDate(body.targetEndDate),
    actualEndDate: parseDate(body.actualEndDate),
    health: body.health ?? 'on_track',
    progressPercent: body.progressPercent ?? 0,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection<ProjectDoc>('crm_projects').insertOne(doc)

  // If this is an onboarding project, update the parent account's onboarding status
  if (doc.type === 'onboarding' && doc.accountId) {
    await recomputeOnboardingStatus(db, doc.accountId)
  }

  res.status(201).json({ data: serializeProject(doc), error: null })
})

// PUT /api/crm/projects/:id
projectsRouter.put('/:id', async (req, res) => {
  const parsed = updateProjectSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const idStr = String(req.params.id)
  const coll = db.collection<ProjectDoc>('crm_projects')

  const existing = await coll.findOne({ _id: idStr } as any)
  if (!existing) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  const body = parsed.data

  const parseDate = (value?: string) => {
    if (!value) return undefined
    if (value === '') return null
    // Handle YYYY-MM-DD (date-only) strings in a timezone-safe way by anchoring at midday UTC
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map((v) => Number(v))
      const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
      if (!Number.isFinite(dt.getTime())) return undefined
      return dt
    }
    const dt = new Date(value)
    if (!Number.isFinite(dt.getTime())) return undefined
    return dt
  }

  const update: Partial<ProjectDoc> = {}

  if (body.name !== undefined) update.name = body.name
  if (body.description !== undefined) update.description = body.description
  if (body.status !== undefined) update.status = body.status
  if (body.type !== undefined) update.type = body.type
  if (body.accountId !== undefined) update.accountId = body.accountId || undefined
  if (body.dealId !== undefined) update.dealId = body.dealId || undefined
  if (body.health !== undefined) update.health = body.health
  if (body.progressPercent !== undefined) update.progressPercent = body.progressPercent

  if (body.startDate !== undefined) {
    const d = parseDate(body.startDate)
    if (d === undefined) {
      return res.status(400).json({ data: null, error: 'invalid_startDate' })
    }
    update.startDate = d
  }

  if (body.targetEndDate !== undefined) {
    const d = parseDate(body.targetEndDate)
    if (d === undefined) {
      return res.status(400).json({ data: null, error: 'invalid_targetEndDate' })
    }
    update.targetEndDate = d
  }

  if (body.actualEndDate !== undefined) {
    const d = parseDate(body.actualEndDate)
    if (d === undefined) {
      return res.status(400).json({ data: null, error: 'invalid_actualEndDate' })
    }
    update.actualEndDate = d
  }

  update.updatedAt = new Date()

  await coll.updateOne({ _id: idStr } as any, { $set: update } as any)
  const updated = (await coll.findOne({ _id: idStr } as any)) as ProjectDoc | null

  // Recompute onboarding status for affected accounts
  const previousAccountId = existing.accountId
  const nextAccountId = (update.accountId ?? existing.accountId) || null

  if (previousAccountId) {
    await recomputeOnboardingStatus(db, previousAccountId)
  }
  if (nextAccountId && nextAccountId !== previousAccountId) {
    await recomputeOnboardingStatus(db, nextAccountId)
  }

  res.json({ data: updated ? serializeProject(updated) : null, error: null })
})

// DELETE /api/crm/projects/:id
projectsRouter.delete('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const idStr = String(req.params.id)
  const coll = db.collection<ProjectDoc>('crm_projects')

  const existing = await coll.findOne({ _id: idStr } as any)
  if (!existing) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  const result = await coll.deleteOne({ _id: idStr } as any)
  if (!result.deletedCount) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  if (existing.accountId) {
    await recomputeOnboardingStatus(db, existing.accountId)
  }

  res.json({ data: { ok: true }, error: null })
})


