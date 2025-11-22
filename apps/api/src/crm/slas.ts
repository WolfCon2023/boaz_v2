import { Router } from 'express'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { requireAuth } from '../auth/rbac.js'

export const slasRouter = Router()

slasRouter.use(requireAuth)

type SlaStatus = 'active' | 'expired' | 'scheduled' | 'cancelled'
type SlaType = 'support' | 'subscription' | 'project' | 'other'

type SlaContractDoc = {
  _id: ObjectId
  accountId: ObjectId
  name: string
  type: SlaType
  status: SlaStatus
  startDate: Date | null
  endDate: Date | null
  autoRenew: boolean
  renewalDate: Date | null
  responseTargetMinutes: number | null
  resolutionTargetMinutes: number | null
  entitlements?: string
  notes?: string
  createdAt: Date
  updatedAt: Date
}

const createSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['support', 'subscription', 'project', 'other']).default('support'),
  status: z.enum(['active', 'expired', 'scheduled', 'cancelled']).default('active'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  autoRenew: z.boolean().optional(),
  renewalDate: z.string().optional(),
  responseTargetMinutes: z.number().int().positive().optional(),
  resolutionTargetMinutes: z.number().int().positive().optional(),
  entitlements: z.string().optional(),
  notes: z.string().optional(),
})

const updateSchema = createSchema.partial()

function parseDate(value?: string): Date | null {
  if (!value) return null
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

function serialize(doc: SlaContractDoc) {
  return {
    ...doc,
    _id: String(doc._id),
    accountId: String(doc.accountId),
    startDate: doc.startDate ? doc.startDate.toISOString() : null,
    endDate: doc.endDate ? doc.endDate.toISOString() : null,
    renewalDate: doc.renewalDate ? doc.renewalDate.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

// GET /api/crm/slas?accountId=&status=&type=
slasRouter.get('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })

  const { accountId, status, type } = req.query as {
    accountId?: string
    status?: string
    type?: string
  }

  const filter: any = {}
  if (accountId && ObjectId.isValid(accountId)) {
    filter.accountId = new ObjectId(accountId)
  }
  if (status && ['active', 'expired', 'scheduled', 'cancelled'].includes(status)) {
    filter.status = status
  }
  if (type && ['support', 'subscription', 'project', 'other'].includes(type)) {
    filter.type = type
  }

  const items = await db.collection<SlaContractDoc>('sla_contracts').find(filter).sort({ endDate: 1 }).limit(500).toArray()
  res.json({ data: { items: items.map(serialize) }, error: null })
})

// GET /api/crm/slas/:id
slasRouter.get('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { id } = req.params
  if (!ObjectId.isValid(id)) return res.status(400).json({ data: null, error: 'invalid_id' })

  const doc = await db.collection<SlaContractDoc>('sla_contracts').findOne({ _id: new ObjectId(id) })
  if (!doc) return res.status(404).json({ data: null, error: 'not_found' })

  res.json({ data: serialize(doc), error: null })
})

// POST /api/crm/slas
slasRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const body = parsed.data
  if (!ObjectId.isValid(body.accountId)) {
    return res.status(400).json({ data: null, error: 'invalid_accountId' })
  }

  const now = new Date()
  const doc: SlaContractDoc = {
    _id: new ObjectId(),
    accountId: new ObjectId(body.accountId),
    name: body.name,
    type: body.type ?? 'support',
    status: body.status ?? 'active',
    startDate: parseDate(body.startDate),
    endDate: parseDate(body.endDate),
    autoRenew: body.autoRenew ?? false,
    renewalDate: parseDate(body.renewalDate),
    responseTargetMinutes: body.responseTargetMinutes ?? null,
    resolutionTargetMinutes: body.resolutionTargetMinutes ?? null,
    entitlements: body.entitlements,
    notes: body.notes,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection<SlaContractDoc>('sla_contracts').insertOne(doc)
  res.status(201).json({ data: serialize(doc), error: null })
})

// PUT /api/crm/slas/:id
slasRouter.put('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { id } = req.params
  if (!ObjectId.isValid(id)) return res.status(400).json({ data: null, error: 'invalid_id' })

  const body = parsed.data
  const update: Partial<SlaContractDoc> = {}

  if (body.accountId !== undefined) {
    if (!ObjectId.isValid(body.accountId)) {
      return res.status(400).json({ data: null, error: 'invalid_accountId' })
    }
    update.accountId = new ObjectId(body.accountId)
  }
  if (body.name !== undefined) update.name = body.name
  if (body.type !== undefined) update.type = body.type
  if (body.status !== undefined) update.status = body.status
  if (body.startDate !== undefined) update.startDate = parseDate(body.startDate)
  if (body.endDate !== undefined) update.endDate = parseDate(body.endDate)
  if (body.autoRenew !== undefined) update.autoRenew = body.autoRenew
  if (body.renewalDate !== undefined) update.renewalDate = parseDate(body.renewalDate)
  if (body.responseTargetMinutes !== undefined) update.responseTargetMinutes = body.responseTargetMinutes ?? null
  if (body.resolutionTargetMinutes !== undefined) update.resolutionTargetMinutes = body.resolutionTargetMinutes ?? null
  if (body.entitlements !== undefined) update.entitlements = body.entitlements
  if (body.notes !== undefined) update.notes = body.notes

  update.updatedAt = new Date()

  const coll = db.collection<SlaContractDoc>('sla_contracts')
  const result = await coll.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: 'after' } as any
  )
  const value = (result as any)?.value as SlaContractDoc | null
  if (!value) return res.status(404).json({ data: null, error: 'not_found' })

  res.json({ data: serialize(value), error: null })
})

// DELETE /api/crm/slas/:id
slasRouter.delete('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { id } = req.params
  if (!ObjectId.isValid(id)) return res.status(400).json({ data: null, error: 'invalid_id' })

  const result = await db.collection<SlaContractDoc>('sla_contracts').deleteOne({ _id: new ObjectId(id) })
  if (!result.deletedCount) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  res.json({ data: { ok: true }, error: null })
})

// GET /api/crm/slas/by-account?accountIds=id1,id2
slasRouter.get('/by-account', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const raw = String((req.query.accountIds as string) ?? '').trim()
  if (!raw) return res.json({ data: { items: [] }, error: null })

  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => ObjectId.isValid(s))
    .map((s) => new ObjectId(s))

  if (!ids.length) return res.json({ data: { items: [] }, error: null })

  const now = new Date()
  const soon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  const coll = db.collection<SlaContractDoc>('sla_contracts')
  const rows = await coll
    .aggregate<{
      _id: ObjectId
      activeCount: number
      expiringSoon: number
      bestResponse: number | null
      bestResolution: number | null
      nextExpiry: Date | null
    }>([
      {
        $match: {
          accountId: { $in: ids },
        },
      },
      {
        $group: {
          _id: '$accountId',
          activeCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0],
            },
          },
          expiringSoon: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$endDate', null] },
                    { $gte: ['$endDate', now] },
                    { $lte: ['$endDate', soon] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          bestResponse: { $min: '$responseTargetMinutes' },
          bestResolution: { $min: '$resolutionTargetMinutes' },
          nextExpiry: { $min: '$endDate' },
        },
      },
    ])
    .toArray()

  const items = rows.map((r) => ({
    accountId: String(r._id),
    activeCount: r.activeCount ?? 0,
    expiringSoon: r.expiringSoon ?? 0,
    bestResponse: r.bestResponse ?? null,
    bestResolution: r.bestResolution ?? null,
    nextExpiry: r.nextExpiry ?? null,
  }))

  res.json({ data: { items }, error: null })
})


