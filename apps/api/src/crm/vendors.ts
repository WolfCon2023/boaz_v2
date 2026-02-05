import { Router } from 'express'
import { z } from 'zod'
import { ObjectId, Db } from 'mongodb'
import { getDb } from '../db.js'
import { requireAuth } from '../auth/rbac.js'

export const vendorsRouter = Router()

type VendorHistoryEntry = {
  _id: ObjectId
  vendorId: string
  eventType: 'created' | 'updated' | 'status_changed' | 'field_changed' | 'deleted'
  description: string
  userId?: string
  userName?: string
  userEmail?: string
  oldValue?: any
  newValue?: any
  metadata?: Record<string, any>
  createdAt: Date
}

// Helper function to add vendor history entry
async function addVendorHistory(
  db: Db,
  vendorId: string,
  eventType: VendorHistoryEntry['eventType'],
  description: string,
  userId?: string,
  userName?: string,
  userEmail?: string,
  oldValue?: any,
  newValue?: any,
  metadata?: Record<string, any>
) {
  try {
    await db.collection('vendor_history').insertOne({
      _id: new ObjectId(),
      vendorId,
      eventType,
      description,
      userId,
      userName,
      userEmail,
      oldValue,
      newValue,
      metadata,
      createdAt: new Date(),
    } as VendorHistoryEntry)
  } catch (err) {
    console.error('Failed to add vendor history:', err)
  }
}

vendorsRouter.use(requireAuth)

type VendorStatus = 'Active' | 'Inactive'

type VendorDoc = {
  _id: ObjectId
  name: string
  legalName?: string
  website?: string
  supportEmail?: string
  supportPhone?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  status: VendorStatus
  categories?: string[]
  notes?: string
  createdAt: Date
  updatedAt: Date
}

const vendorSchema = z.object({
  name: z.string().trim().min(1),
  legalName: z.string().trim().optional(),
  website: z.string().trim().url().optional().or(z.literal('')),
  supportEmail: z.string().trim().email().optional().or(z.literal('')),
  supportPhone: z.string().trim().optional(),
  addressLine1: z.string().trim().optional(),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  postalCode: z.string().trim().optional(),
  country: z.string().trim().optional(),
  status: z.enum(['Active', 'Inactive']).default('Active'),
  categories: z.array(z.string().trim()).optional(),
  notes: z.string().optional(),
})

const vendorUpdateSchema = vendorSchema.partial()

function serializeVendor(doc: VendorDoc) {
  return {
    ...doc,
    _id: doc._id.toHexString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

// GET /api/crm/vendors?q=&status=&category=
vendorsRouter.get('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })

  const q = String((req.query.q as string) ?? '').trim()
  const status = (req.query.status as VendorStatus | undefined) || undefined
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : ''

  const filter: Record<string, unknown> = {}
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { legalName: { $regex: q, $options: 'i' } },
      { website: { $regex: q, $options: 'i' } },
    ]
  }
  if (status && (status === 'Active' || status === 'Inactive')) {
    filter.status = status
  }
  if (category) {
    filter.categories = category
  }

  const items = await db
    .collection<VendorDoc>('crm_vendors')
    .find(filter)
    .sort({ name: 1 })
    .limit(500)
    .toArray()

  res.json({ data: { items: items.map(serializeVendor) }, error: null })
})

// Lightweight list for dropdowns
// GET /api/crm/vendors/options?status=Active
vendorsRouter.get('/options', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })

  const status = (req.query.status as VendorStatus | undefined) || undefined
  const filter: Record<string, unknown> = {}
  if (status && (status === 'Active' || status === 'Inactive')) {
    filter.status = status
  }

  const items = await db
    .collection<VendorDoc>('crm_vendors')
    .find(filter, { projection: { name: 1, website: 1, status: 1 } as any })
    .sort({ name: 1 })
    .limit(500)
    .toArray()

  res.json({
    data: {
      items: items.map((v) => ({
        id: v._id.toHexString(),
        name: v.name,
        website: v.website,
        status: v.status,
      })),
    },
    error: null,
  })
})

// POST /api/crm/vendors
vendorsRouter.post('/', async (req, res) => {
  const parsed = vendorSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res
      .status(400)
      .json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const now = new Date()
  const _id = new ObjectId()

  const data = parsed.data
  const doc: VendorDoc = {
    _id,
    name: data.name,
    legalName: data.legalName || undefined,
    website: data.website || undefined,
    supportEmail: data.supportEmail || undefined,
    supportPhone: data.supportPhone || undefined,
    addressLine1: data.addressLine1 || undefined,
    addressLine2: data.addressLine2 || undefined,
    city: data.city || undefined,
    state: data.state || undefined,
    postalCode: data.postalCode || undefined,
    country: data.country || undefined,
    status: data.status ?? 'Active',
    categories: data.categories?.filter(Boolean),
    notes: data.notes,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection<VendorDoc>('crm_vendors').insertOne(doc as any)

  // Add history entry for creation
  const auth = (req as any).auth as { userId: string; email: string; name?: string } | undefined
  await addVendorHistory(
    db,
    _id.toHexString(),
    'created',
    `Vendor created: ${doc.name}`,
    auth?.userId,
    auth?.name,
    auth?.email
  )

  res.status(201).json({ data: serializeVendor(doc), error: null })
})

// PUT /api/crm/vendors/:id
vendorsRouter.put('/:id', async (req, res) => {
  const parsed = vendorUpdateSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res
      .status(400)
      .json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  let _id: ObjectId
  try {
    _id = new ObjectId(String(req.params.id))
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const update: Partial<VendorDoc> = {
    ...parsed.data,
    updatedAt: new Date(),
  }
  if (update.website === '') update.website = undefined
  if (update.supportEmail === '') update.supportEmail = undefined

  const coll = db.collection<VendorDoc>('crm_vendors')
  const existing = await coll.findOne({ _id } as any)
  if (!existing) return res.status(404).json({ data: null, error: 'not_found' })

  await coll.updateOne({ _id } as any, { $set: update } as any)
  const updated = await coll.findOne({ _id } as any)

  // Add history for status change or other updates
  const auth = (req as any).auth as { userId: string; email: string; name?: string } | undefined
  if (parsed.data.status && parsed.data.status !== existing.status) {
    await addVendorHistory(
      db,
      req.params.id,
      'status_changed',
      `Status changed from "${existing.status}" to "${parsed.data.status}"`,
      auth?.userId,
      auth?.name,
      auth?.email,
      existing.status,
      parsed.data.status
    )
  } else {
    const changedFields = Object.keys(parsed.data).filter(k => k !== 'status')
    if (changedFields.length > 0) {
      await addVendorHistory(
        db,
        req.params.id,
        'field_changed',
        `Vendor updated: ${existing.name}`,
        auth?.userId,
        auth?.name,
        auth?.email,
        undefined,
        undefined,
        { changedFields }
      )
    }
  }

  res.json({ data: updated ? serializeVendor(updated) : null, error: null })
})

// DELETE /api/crm/vendors/:id
vendorsRouter.delete('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  let _id: ObjectId
  try {
    _id = new ObjectId(String(req.params.id))
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  // Get vendor before deletion for history
  const existing = await db.collection<VendorDoc>('crm_vendors').findOne({ _id } as any)
  if (!existing) return res.status(404).json({ data: null, error: 'not_found' })

  // Add history before deletion
  const auth = (req as any).auth as { userId: string; email: string; name?: string } | undefined
  await addVendorHistory(
    db,
    req.params.id,
    'deleted',
    `Vendor deleted: ${existing.name}`,
    auth?.userId,
    auth?.name,
    auth?.email
  )

  const result = await db.collection<VendorDoc>('crm_vendors').deleteOne({ _id } as any)
  if (!result.deletedCount) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  res.json({ data: { ok: true }, error: null })
})

// GET /api/crm/vendors/:id/history - Get vendor history
vendorsRouter.get('/:id/history', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const vendorId = req.params.id
    const history = await db
      .collection<VendorHistoryEntry>('vendor_history')
      .find({ vendorId })
      .sort({ createdAt: -1 })
      .toArray()
    res.json({ data: { history }, error: null })
  } catch (err) {
    console.error('Error fetching vendor history:', err)
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})
