import { Router } from 'express'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { requireAuth } from '../auth/rbac.js'

export const vendorsRouter = Router()

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

  const result = await db.collection<VendorDoc>('crm_vendors').deleteOne({ _id } as any)
  if (!result.deletedCount) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  res.json({ data: { ok: true }, error: null })
})


