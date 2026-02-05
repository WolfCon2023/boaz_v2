import { Router } from 'express'
import { z } from 'zod'
import { ObjectId, Db } from 'mongodb'
import { getDb } from './db.js'
import { requireAuth } from './auth/rbac.js'

export const assetsRouter = Router()

type AssetHistoryEntry = {
  _id: ObjectId
  entityType: 'environment' | 'product' | 'license'
  entityId: string
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

// Helper function to add asset history entry
async function addAssetHistory(
  db: Db,
  entityType: AssetHistoryEntry['entityType'],
  entityId: string,
  eventType: AssetHistoryEntry['eventType'],
  description: string,
  userId?: string,
  userName?: string,
  userEmail?: string,
  oldValue?: any,
  newValue?: any,
  metadata?: Record<string, any>
) {
  try {
    await db.collection('asset_history').insertOne({
      _id: new ObjectId(),
      entityType,
      entityId,
      eventType,
      description,
      userId,
      userName,
      userEmail,
      oldValue,
      newValue,
      metadata,
      createdAt: new Date(),
    } as AssetHistoryEntry)
  } catch (err) {
    console.error('Failed to add asset history:', err)
    // Don't fail the main operation if history fails
  }
}

assetsRouter.use(requireAuth)

type EnvironmentStatus = 'Active' | 'Inactive' | 'Planned' | 'Retired'
type EnvironmentType =
  | 'Production'
  | 'UAT'
  | 'Dev'
  | 'Sandbox'
  | 'Retail Store'
  | 'Satellite Office'
  | 'Cloud Tenant'

type ProductStatus = 'Active' | 'Needs Upgrade' | 'Pending Renewal' | 'Retired'
type ProductType = 'Software' | 'Hardware' | 'Cloud Service' | 'Integration' | 'Subscription'
type SupportLevel = 'Basic' | 'Standard' | 'Premium'
type ProductUsageType = 'Customer' | 'Internal'

type LicenseType = 'Seat-based' | 'Device-based' | 'Perpetual' | 'Subscription'
type RenewalStatus = 'Active' | 'Expired' | 'Pending Renewal'

type EnvironmentDoc = {
  _id: string
  customerId: string
  name: string
  environmentType: EnvironmentType
  location?: string
  status: EnvironmentStatus
  notes?: string
  createdAt: Date
  updatedAt: Date
}

type InstalledProductDoc = {
  _id: string
  customerId: string
  environmentId: string
  usageType?: ProductUsageType
  linkedAccountId?: string
  catalogProductId?: string
  productName: string
  productType: ProductType
  vendor?: string | null
  version?: string | null
  serialNumber?: string | null
  configuration?: any
  deploymentDate?: Date | null
  status: ProductStatus
  supportLevel?: SupportLevel
  createdAt: Date
  updatedAt: Date
}

type LicenseDoc = {
  _id: string
  productId: string
  licenseType: LicenseType
  licenseKey?: string
  licenseIdentifier?: string
  licenseCount: number
  seatsAssigned: number
  expirationDate?: Date | null
  renewalStatus: RenewalStatus
  cost?: number
  assignedUsers?: string[]
  createdAt: Date
  updatedAt: Date
}

const environmentSchema = z.object({
  customerId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  environmentType: z.enum([
    'Production',
    'UAT',
    'Dev',
    'Sandbox',
    'Retail Store',
    'Satellite Office',
    'Cloud Tenant',
  ]),
  location: z.string().trim().optional(),
  status: z.enum(['Active', 'Inactive', 'Planned', 'Retired']).default('Active'),
  notes: z.string().optional(),
})

const environmentUpdateSchema = environmentSchema.partial()

const installedProductSchema = z.object({
  customerId: z.string().trim().min(1),
  environmentId: z.string().trim().min(1),
  usageType: z.enum(['Customer', 'Internal']).default('Customer'),
  linkedAccountId: z.string().trim().optional(),
  catalogProductId: z.string().trim().optional(),
  productName: z.string().trim().min(1),
  productType: z.enum(['Software', 'Hardware', 'Cloud Service', 'Integration', 'Subscription']),
  vendor: z.string().trim().optional().nullable(),
  version: z.string().trim().optional().nullable(),
  serialNumber: z.string().trim().optional().nullable(),
  configuration: z.any().optional(),
  // Accept any string here (ISO or YYYY-MM-DD). We will parse and validate manually.
  deploymentDate: z.string().trim().optional().nullable(),
  status: z.enum(['Active', 'Needs Upgrade', 'Pending Renewal', 'Retired']).default('Active'),
  supportLevel: z.enum(['Basic', 'Standard', 'Premium']).optional(),
})

const installedProductUpdateSchema = installedProductSchema.partial()

const licenseSchema = z.object({
  productId: z.string().trim().min(1),
  licenseType: z.enum(['Seat-based', 'Device-based', 'Perpetual', 'Subscription']),
  licenseKey: z.string().trim().optional(),
  licenseIdentifier: z.string().trim().optional(),
  licenseCount: z.number().int().min(1),
  seatsAssigned: z.number().int().min(0).optional().default(0),
  // Accept any string here and parse manually to avoid timezone issues.
  expirationDate: z.string().trim().optional(),
  renewalStatus: z.enum(['Active', 'Expired', 'Pending Renewal']).default('Active'),
  cost: z.number().nonnegative().optional(),
  assignedUsers: z.array(z.string().trim()).optional(),
})

const licenseUpdateSchema = licenseSchema.partial()

function parseDeploymentDate(value?: string | null): Date | null {
  if (!value) return null
  const v = String(value).trim()
  if (!v) return null

  // Handle YYYY-MM-DD as a date-only value, anchored at midday UTC to avoid timezone shifts
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map((s) => Number(s))
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    if (!Number.isFinite(dt.getTime())) return null
    return dt
  }

  const dt = new Date(v)
  if (!Number.isFinite(dt.getTime())) return null
  return dt
}

function parseLicenseExpirationDate(value?: string | null): Date | null {
  if (!value) return null
  const v = String(value).trim()
  if (!v) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map((s) => Number(s))
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    if (!Number.isFinite(dt.getTime())) return null
    return dt
  }

  const dt = new Date(v)
  if (!Number.isFinite(dt.getTime())) return null
  return dt
}

function formatDateOnly(dt: Date | null | undefined): string | null {
  if (!dt) return null
  const d = dt instanceof Date ? dt : new Date(dt)
  if (!Number.isFinite(d.getTime())) return null
  // Use UTC to avoid timezone shifts - format as YYYY-MM-DD
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function serializeEnvironment(doc: EnvironmentDoc) {
  return {
    ...doc,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

function serializeProduct(doc: InstalledProductDoc) {
  return {
    ...doc,
    deploymentDate: doc.deploymentDate ? doc.deploymentDate.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

function serializeLicense(doc: LicenseDoc) {
  return {
    ...doc,
    expirationDate: doc.expirationDate ? doc.expirationDate.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

// Customers (read-only proxy from CRM accounts)
assetsRouter.get('/customers', async (_req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const items = await db
    .collection('accounts')
    .find({}, { projection: { _id: 1, name: 1, companyName: 1, accountNumber: 1 } })
    .sort({ name: 1 })
    .limit(500)
    .toArray()

  res.json({
    data: {
      items: items.map((a: any) => ({
        id: String(a._id),
        name: a.name ?? a.companyName ?? 'Account',
        accountNumber: a.accountNumber,
      })),
    },
    error: null,
  })
})

// Environments
assetsRouter.post('/environments', async (req, res) => {
  const parsed = environmentSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const now = new Date()
  const _id = new ObjectId().toHexString()
  const doc: EnvironmentDoc = {
    _id,
    customerId: parsed.data.customerId,
    name: parsed.data.name,
    environmentType: parsed.data.environmentType,
    location: parsed.data.location,
    status: parsed.data.status ?? 'Active',
    notes: parsed.data.notes,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection<EnvironmentDoc>('assets_environments').insertOne(doc as any)

  // Add history entry for creation
  const auth = (req as any).auth as { userId: string; email: string; name?: string } | undefined
  await addAssetHistory(
    db,
    'environment',
    _id,
    'created',
    `Environment created: ${doc.name}`,
    auth?.userId,
    auth?.name,
    auth?.email
  )

  res.status(201).json({ data: serializeEnvironment(doc), error: null })
})

assetsRouter.get('/environments/:customerId', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const customerId = String(req.params.customerId)
  const items = await db
    .collection<EnvironmentDoc>('assets_environments')
    .find({ customerId })
    .sort({ name: 1 })
    .toArray()

  res.json({ data: { items: items.map(serializeEnvironment) }, error: null })
})

assetsRouter.put('/environments/:environmentId', async (req, res) => {
  const parsed = environmentUpdateSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const id = String(req.params.environmentId)
  const update: Partial<EnvironmentDoc> = { ...parsed.data, updatedAt: new Date() }

  const coll = db.collection<EnvironmentDoc>('assets_environments')
  const existing = await coll.findOne({ _id: id } as any)
  if (!existing) return res.status(404).json({ data: null, error: 'not_found' })

  await coll.updateOne({ _id: id } as any, { $set: update } as any)
  const updated = await coll.findOne({ _id: id } as any)

  // Add history for status change or other updates
  const auth = (req as any).auth as { userId: string; email: string; name?: string } | undefined
  if (parsed.data.status && parsed.data.status !== existing.status) {
    await addAssetHistory(
      db,
      'environment',
      id,
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
      await addAssetHistory(
        db,
        'environment',
        id,
        'field_changed',
        `Environment updated: ${existing.name}`,
        auth?.userId,
        auth?.name,
        auth?.email,
        undefined,
        undefined,
        { changedFields }
      )
    }
  }

  res.json({ data: serializeEnvironment(updated as EnvironmentDoc), error: null })
})

assetsRouter.delete('/environments/:environmentId', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const id = String(req.params.environmentId)
  
  // Get environment before deletion for history
  const existing = await db.collection<EnvironmentDoc>('assets_environments').findOne({ _id: id } as any)
  if (!existing) return res.status(404).json({ data: null, error: 'not_found' })

  // Add history before deletion
  const auth = (req as any).auth as { userId: string; email: string; name?: string } | undefined
  await addAssetHistory(
    db,
    'environment',
    id,
    'deleted',
    `Environment deleted: ${existing.name}`,
    auth?.userId,
    auth?.name,
    auth?.email
  )

  const result = await db.collection<EnvironmentDoc>('assets_environments').deleteOne({ _id: id } as any)
  if (!result.deletedCount) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  res.json({ data: { ok: true }, error: null })
})

// Installed products
assetsRouter.post('/products', async (req, res) => {
  const parsed = installedProductSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const now = new Date()
  const _id = new ObjectId().toHexString()
  const deploymentDate = parseDeploymentDate(parsed.data.deploymentDate)

  const doc: InstalledProductDoc = {
    _id,
    customerId: parsed.data.customerId,
    environmentId: parsed.data.environmentId,
    usageType: parsed.data.usageType ?? 'Customer',
    linkedAccountId: parsed.data.linkedAccountId,
    catalogProductId: parsed.data.catalogProductId,
    productName: parsed.data.productName,
    productType: parsed.data.productType,
    vendor: parsed.data.vendor,
    version: parsed.data.version,
    serialNumber: parsed.data.serialNumber,
    configuration: parsed.data.configuration,
    deploymentDate,
    status: parsed.data.status ?? 'Active',
    supportLevel: parsed.data.supportLevel,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection<InstalledProductDoc>('assets_products').insertOne(doc as any)

  // Add history entry for creation
  const auth = (req as any).auth as { userId: string; email: string; name?: string } | undefined
  await addAssetHistory(
    db,
    'product',
    _id,
    'created',
    `Product created: ${doc.productName}`,
    auth?.userId,
    auth?.name,
    auth?.email
  )

  res.status(201).json({ data: serializeProduct(doc), error: null })
})

assetsRouter.get('/products/:customerId', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const customerId = String(req.params.customerId)
  const filter: any = { customerId }

  if (typeof req.query.environmentId === 'string' && req.query.environmentId) {
    filter.environmentId = req.query.environmentId
  }
  if (typeof req.query.status === 'string' && req.query.status) {
    filter.status = req.query.status
  }
  if (typeof req.query.productType === 'string' && req.query.productType) {
    filter.productType = req.query.productType
  }

  const items = await db
    .collection<InstalledProductDoc>('assets_products')
    .find(filter)
    .sort({ productName: 1 })
    .toArray()

  res.json({ data: { items: items.map(serializeProduct) }, error: null })
})

assetsRouter.get('/products/environment/:environmentId', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const environmentId = String(req.params.environmentId)
  const items = await db
    .collection<InstalledProductDoc>('assets_products')
    .find({ environmentId })
    .sort({ productName: 1 })
    .toArray()

  res.json({ data: { items: items.map(serializeProduct) }, error: null })
})

assetsRouter.put('/products/:productId', async (req, res) => {
  const parsed = installedProductUpdateSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const id = String(req.params.productId)
  const update: Partial<InstalledProductDoc> = { updatedAt: new Date() }

  if (parsed.data.customerId !== undefined) update.customerId = parsed.data.customerId
  if (parsed.data.environmentId !== undefined) update.environmentId = parsed.data.environmentId
   if (parsed.data.usageType !== undefined) update.usageType = parsed.data.usageType
   if (parsed.data.linkedAccountId !== undefined) update.linkedAccountId = parsed.data.linkedAccountId
  if (parsed.data.catalogProductId !== undefined) update.catalogProductId = parsed.data.catalogProductId
  if (parsed.data.productName !== undefined) update.productName = parsed.data.productName
  if (parsed.data.productType !== undefined) update.productType = parsed.data.productType
  if (parsed.data.vendor !== undefined) update.vendor = parsed.data.vendor
  if (parsed.data.version !== undefined) update.version = parsed.data.version
  if (parsed.data.serialNumber !== undefined) update.serialNumber = parsed.data.serialNumber
  if (parsed.data.configuration !== undefined) update.configuration = parsed.data.configuration
  if (parsed.data.status !== undefined) update.status = parsed.data.status
  if (parsed.data.supportLevel !== undefined) update.supportLevel = parsed.data.supportLevel
  if (parsed.data.deploymentDate !== undefined) {
    update.deploymentDate = parseDeploymentDate(parsed.data.deploymentDate)
  }

  const coll = db.collection<InstalledProductDoc>('assets_products')
  const existing = await coll.findOne({ _id: id } as any)
  if (!existing) return res.status(404).json({ data: null, error: 'not_found' })

  await coll.updateOne({ _id: id } as any, { $set: update } as any)
  const updated = await coll.findOne({ _id: id } as any)

  // Add history for status change or other updates
  const auth = (req as any).auth as { userId: string; email: string; name?: string } | undefined
  if (parsed.data.status && parsed.data.status !== existing.status) {
    await addAssetHistory(
      db,
      'product',
      id,
      'status_changed',
      `Status changed from "${existing.status}" to "${parsed.data.status}"`,
      auth?.userId,
      auth?.name,
      auth?.email,
      existing.status,
      parsed.data.status
    )
  } else {
    const changedFields = Object.keys(update).filter(k => k !== 'status' && k !== 'updatedAt')
    if (changedFields.length > 0) {
      await addAssetHistory(
        db,
        'product',
        id,
        'field_changed',
        `Product updated: ${existing.productName}`,
        auth?.userId,
        auth?.name,
        auth?.email,
        undefined,
        undefined,
        { changedFields }
      )
    }
  }

  res.json({ data: serializeProduct(updated as InstalledProductDoc), error: null })
})

assetsRouter.delete('/products/:productId', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const id = String(req.params.productId)
  
  // Get product before deletion for history
  const existing = await db.collection<InstalledProductDoc>('assets_products').findOne({ _id: id } as any)
  if (!existing) return res.status(404).json({ data: null, error: 'not_found' })

  // Add history before deletion
  const auth = (req as any).auth as { userId: string; email: string; name?: string } | undefined
  await addAssetHistory(
    db,
    'product',
    id,
    'deleted',
    `Product deleted: ${existing.productName}`,
    auth?.userId,
    auth?.name,
    auth?.email
  )

  const result = await db.collection<InstalledProductDoc>('assets_products').deleteOne({ _id: id } as any)
  if (!result.deletedCount) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  res.json({ data: { ok: true }, error: null })
})

// Licenses
assetsRouter.post('/licenses', async (req, res) => {
  const parsed = licenseSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const now = new Date()
  const _id = new ObjectId().toHexString()

  const expirationDate = parseLicenseExpirationDate(parsed.data.expirationDate)

  if (parsed.data.seatsAssigned && parsed.data.seatsAssigned > parsed.data.licenseCount) {
    return res.status(400).json({ data: null, error: 'seats_exceed_license_count' })
  }

  const doc: LicenseDoc = {
    _id,
    productId: parsed.data.productId,
    licenseType: parsed.data.licenseType,
    licenseKey: parsed.data.licenseKey,
    licenseIdentifier: parsed.data.licenseIdentifier,
    licenseCount: parsed.data.licenseCount,
    seatsAssigned: parsed.data.seatsAssigned ?? 0,
    expirationDate,
    renewalStatus: parsed.data.renewalStatus ?? 'Active',
    cost: parsed.data.cost,
    assignedUsers: parsed.data.assignedUsers,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection<LicenseDoc>('assets_licenses').insertOne(doc as any)

  // Add history entry for creation
  const auth = (req as any).auth as { userId: string; email: string; name?: string } | undefined
  await addAssetHistory(
    db,
    'license',
    _id,
    'created',
    `License created: ${doc.licenseType} (${doc.licenseCount} licenses)`,
    auth?.userId,
    auth?.name,
    auth?.email
  )

  res.status(201).json({ data: serializeLicense(doc), error: null })
})

assetsRouter.get('/licenses/product/:productId', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const productId = String(req.params.productId)
  const items = await db
    .collection<LicenseDoc>('assets_licenses')
    .find({ productId })
    .sort({ expirationDate: 1 })
    .toArray()

  res.json({ data: { items: items.map(serializeLicense) }, error: null })
})

assetsRouter.put('/licenses/:licenseId', async (req, res) => {
  const parsed = licenseUpdateSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const id = String(req.params.licenseId)
  const update: Partial<LicenseDoc> = { updatedAt: new Date() }

  if (parsed.data.productId !== undefined) update.productId = parsed.data.productId
  if (parsed.data.licenseType !== undefined) update.licenseType = parsed.data.licenseType
  if (parsed.data.licenseKey !== undefined) update.licenseKey = parsed.data.licenseKey
  if (parsed.data.licenseIdentifier !== undefined) update.licenseIdentifier = parsed.data.licenseIdentifier
  if (parsed.data.licenseCount !== undefined) update.licenseCount = parsed.data.licenseCount
  if (parsed.data.seatsAssigned !== undefined) update.seatsAssigned = parsed.data.seatsAssigned
  if (parsed.data.expirationDate !== undefined) {
    update.expirationDate = parseLicenseExpirationDate(parsed.data.expirationDate)
  }
  if (parsed.data.renewalStatus !== undefined) update.renewalStatus = parsed.data.renewalStatus
  if (parsed.data.cost !== undefined) update.cost = parsed.data.cost
  if (parsed.data.assignedUsers !== undefined) update.assignedUsers = parsed.data.assignedUsers

  const coll = db.collection<LicenseDoc>('assets_licenses')
  const existing = await coll.findOne({ _id: id } as any)
  if (!existing) return res.status(404).json({ data: null, error: 'not_found' })

  const nextSeats =
    update.seatsAssigned !== undefined ? update.seatsAssigned : existing.seatsAssigned ?? 0
  const nextCount = update.licenseCount !== undefined ? update.licenseCount : existing.licenseCount ?? 0
  if (nextSeats > nextCount && nextCount > 0) {
    return res.status(400).json({ data: null, error: 'seats_exceed_license_count' })
  }

  await coll.updateOne({ _id: id } as any, { $set: update } as any)
  const updated = await coll.findOne({ _id: id } as any)

  // Add history for renewal status change or other updates
  const auth = (req as any).auth as { userId: string; email: string; name?: string } | undefined
  if (parsed.data.renewalStatus && parsed.data.renewalStatus !== existing.renewalStatus) {
    await addAssetHistory(
      db,
      'license',
      id,
      'status_changed',
      `Renewal status changed from "${existing.renewalStatus}" to "${parsed.data.renewalStatus}"`,
      auth?.userId,
      auth?.name,
      auth?.email,
      existing.renewalStatus,
      parsed.data.renewalStatus
    )
  } else {
    const changedFields = Object.keys(update).filter(k => k !== 'renewalStatus' && k !== 'updatedAt')
    if (changedFields.length > 0) {
      await addAssetHistory(
        db,
        'license',
        id,
        'field_changed',
        `License updated: ${existing.licenseType}`,
        auth?.userId,
        auth?.name,
        auth?.email,
        undefined,
        undefined,
        { changedFields }
      )
    }
  }

  res.json({ data: serializeLicense(updated as LicenseDoc), error: null })
})

assetsRouter.delete('/licenses/:licenseId', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const id = String(req.params.licenseId)
  
  // Get license before deletion for history
  const existing = await db.collection<LicenseDoc>('assets_licenses').findOne({ _id: id } as any)
  if (!existing) return res.status(404).json({ data: null, error: 'not_found' })

  // Add history before deletion
  const auth = (req as any).auth as { userId: string; email: string; name?: string } | undefined
  await addAssetHistory(
    db,
    'license',
    id,
    'deleted',
    `License deleted: ${existing.licenseType}`,
    auth?.userId,
    auth?.name,
    auth?.email
  )

  const result = await db.collection<LicenseDoc>('assets_licenses').deleteOne({ _id: id } as any)
  if (!result.deletedCount) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  res.json({ data: { ok: true }, error: null })
})

// Summary per customer
assetsRouter.get('/summary/:customerId', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const customerId = String(req.params.customerId)
  const now = new Date()
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  const envColl = db.collection<EnvironmentDoc>('assets_environments')
  const prodColl = db.collection<InstalledProductDoc>('assets_products')
  const licColl = db.collection<LicenseDoc>('assets_licenses')

  const [environments, products] = await Promise.all([
    envColl.find({ customerId }).toArray(),
    prodColl.find({ customerId }).toArray(),
  ])

  const productIds = products.map((p) => p._id)

  const licenses = productIds.length
    ? await licColl.find({ productId: { $in: productIds } as any }).toArray()
    : []

  const upcomingRenewals = licenses.filter(
    (l) => l.expirationDate && l.expirationDate >= now && l.expirationDate <= in90Days,
  )

  const licenseAllocation = productIds.map((pid) => {
    const productLicenses = licenses.filter((l) => l.productId === pid)
    const total = productLicenses.reduce((sum, l) => sum + (l.licenseCount || 0), 0)
    const assigned = productLicenses.reduce((sum, l) => sum + (l.seatsAssigned || 0), 0)
    return {
      productId: pid,
      licenseCount: total,
      seatsAssigned: assigned,
      overAllocated: assigned > total && total > 0,
    }
  })

  const productHealth = {
    Active: products.filter((p) => p.status === 'Active').length,
    NeedsUpgrade: products.filter((p) => p.status === 'Needs Upgrade').length,
    PendingRenewal: products.filter((p) => p.status === 'Pending Renewal').length,
    Retired: products.filter((p) => p.status === 'Retired').length,
  }

  res.json({
    data: {
      totalEnvironments: environments.length,
      totalProducts: products.length,
      upcomingRenewals: upcomingRenewals.map(serializeLicense),
      licenseAllocation,
      productHealth,
    },
    error: null,
  })
})

// License report across customers with optional filters
assetsRouter.get('/license-report', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const licMatch: any = {}

  const licenseStatus = typeof req.query.licenseStatus === 'string' ? req.query.licenseStatus.trim() : ''
  if (licenseStatus && ['Active', 'Expired', 'Pending Renewal'].includes(licenseStatus)) {
    licMatch.renewalStatus = licenseStatus
  }

  const windowDays = Number(req.query.windowDays ?? 0)
  if (Number.isFinite(windowDays) && windowDays > 0) {
    const now = new Date()
    const end = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000)
    licMatch.expirationDate = { $gte: now, $lte: end }
  }

  const productMatch: any = {}
  const customerId = typeof req.query.customerId === 'string' ? req.query.customerId.trim() : ''
  if (customerId) productMatch.customerId = customerId

  const environmentId = typeof req.query.environmentId === 'string' ? req.query.environmentId.trim() : ''
  if (environmentId) productMatch.environmentId = environmentId

  const vendor = typeof req.query.vendor === 'string' ? req.query.vendor.trim() : ''
  if (vendor) productMatch.vendor = { $regex: vendor, $options: 'i' }

  const productStatus = typeof req.query.productStatus === 'string' ? req.query.productStatus.trim() : ''
  if (productStatus && ['Active', 'Needs Upgrade', 'Pending Renewal', 'Retired'].includes(productStatus)) {
    productMatch.status = productStatus
  }

  const productType = typeof req.query.productType === 'string' ? req.query.productType.trim() : ''
  if (productType && ['Software', 'Hardware', 'Cloud Service', 'Integration', 'Subscription'].includes(productType)) {
    productMatch.productType = productType
  }

  const pipeline: any[] = [
    { $match: licMatch },
    {
      $lookup: {
        from: 'assets_products',
        localField: 'productId',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
  ]

  if (Object.keys(productMatch).length) {
    pipeline.push({ $match: { 'product.customerId': productMatch.customerId ?? { $exists: true }, ...Object.fromEntries(
      Object.entries(productMatch)
        .filter(([k]) => k !== 'customerId')
        .map(([k, v]) => [`product.${k}`, v])
    ) } })
  }

  pipeline.push(
    {
      $lookup: {
        from: 'assets_environments',
        localField: 'product.environmentId',
        foreignField: '_id',
        as: 'env',
      },
    },
    { $unwind: { path: '$env', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        productId: '$product._id',
        customerId: '$product.customerId',
        environmentId: '$product.environmentId',
        environmentName: '$env.name',
        environmentType: '$env.environmentType',
        productName: '$product.productName',
        productType: '$product.productType',
        vendor: '$product.vendor',
        productStatus: '$product.status',
        supportLevel: '$product.supportLevel',
        licenseType: '$licenseType',
        licenseIdentifier: '$licenseIdentifier',
        licenseKey: '$licenseKey',
        licenseCount: '$licenseCount',
        seatsAssigned: '$seatsAssigned',
        expirationDate: '$expirationDate',
        renewalStatus: '$renewalStatus',
        cost: '$cost',
      },
    },
  )

  const rows = await db.collection<LicenseDoc>('assets_licenses').aggregate(pipeline).toArray()

  // Format dates as YYYY-MM-DD strings to avoid timezone shifts
  const formattedRows = rows.map((r: any) => ({
    ...r,
    expirationDate: formatDateOnly(r.expirationDate),
  }))

  res.json({ data: { items: formattedRows }, error: null })
})

// Installed products report across customers with optional filters
assetsRouter.get('/product-report', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const productMatch: any = {}

  const customerId = typeof req.query.customerId === 'string' ? req.query.customerId.trim() : ''
  if (customerId) productMatch.customerId = customerId

  const environmentId = typeof req.query.environmentId === 'string' ? req.query.environmentId.trim() : ''
  if (environmentId) productMatch.environmentId = environmentId

  const vendor = typeof req.query.vendor === 'string' ? req.query.vendor.trim() : ''
  if (vendor) productMatch.vendor = { $regex: vendor, $options: 'i' }

  const productStatus = typeof req.query.productStatus === 'string' ? req.query.productStatus.trim() : ''
  if (productStatus && ['Active', 'Needs Upgrade', 'Pending Renewal', 'Retired'].includes(productStatus)) {
    productMatch.status = productStatus
  }

  const productType = typeof req.query.productType === 'string' ? req.query.productType.trim() : ''
  if (productType && ['Software', 'Hardware', 'Cloud Service', 'Integration', 'Subscription'].includes(productType)) {
    productMatch.productType = productType
  }

  const windowDays = Number(req.query.windowDays ?? 0)
  const now = new Date()
  const end =
    Number.isFinite(windowDays) && windowDays > 0
      ? new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000)
      : null

  const pipeline: any[] = [
    { $match: productMatch },
    {
      $lookup: {
        from: 'assets_environments',
        localField: 'environmentId',
        foreignField: '_id',
        as: 'env',
      },
    },
    { $unwind: { path: '$env', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'assets_licenses',
        localField: '_id',
        foreignField: 'productId',
        as: 'licenses',
      },
    },
    {
      $addFields: {
        totalLicenseCount: { $sum: '$licenses.licenseCount' },
        totalSeatsAssigned: { $sum: '$licenses.seatsAssigned' },
        activeLicenses: {
          $size: {
            $filter: {
              input: '$licenses',
              as: 'lic',
              cond: { $eq: ['$$lic.renewalStatus', 'Active'] },
            },
          },
        },
        pendingLicenses: {
          $size: {
            $filter: {
              input: '$licenses',
              as: 'lic',
              cond: { $eq: ['$$lic.renewalStatus', 'Pending Renewal'] },
            },
          },
        },
        expiredLicenses: {
          $size: {
            $filter: {
              input: '$licenses',
              as: 'lic',
              cond: { $eq: ['$$lic.renewalStatus', 'Expired'] },
            },
          },
        },
        nextExpirationDate: {
          $min: '$licenses.expirationDate',
        },
      },
    },
  ]

  if (end) {
    pipeline.push({
      $match: {
        nextExpirationDate: { $ne: null, $gte: now, $lte: end },
      },
    })
  }

  pipeline.push({
    $project: {
      _id: 1,
      customerId: 1,
      environmentId: 1,
      environmentName: '$env.name',
      environmentType: '$env.environmentType',
      productName: '$productName',
      productType: '$productType',
      vendor: '$vendor',
      status: '$status',
      supportLevel: '$supportLevel',
      deploymentDate: '$deploymentDate',
      totalLicenseCount: 1,
      totalSeatsAssigned: 1,
      activeLicenses: 1,
      pendingLicenses: 1,
      expiredLicenses: 1,
      nextExpirationDate: 1,
    },
  })

  const rows = await db.collection<InstalledProductDoc>('assets_products').aggregate(pipeline).toArray()

  // Format dates as YYYY-MM-DD strings to avoid timezone shifts
  const formattedRows = rows.map((r: any) => ({
    ...r,
    deploymentDate: formatDateOnly(r.deploymentDate),
    nextExpirationDate: formatDateOnly(r.nextExpirationDate),
  }))

  res.json({ data: { items: formattedRows }, error: null })
})

// GET /api/assets/history/:entityType/:entityId - Get history for an asset entity
assetsRouter.get('/history/:entityType/:entityId', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  const entityType = req.params.entityType as 'environment' | 'product' | 'license'
  const entityId = req.params.entityId
  
  if (!['environment', 'product', 'license'].includes(entityType)) {
    return res.status(400).json({ data: null, error: 'invalid_entity_type' })
  }
  
  try {
    const history = await db
      .collection<AssetHistoryEntry>('asset_history')
      .find({ entityType, entityId })
      .sort({ createdAt: -1 })
      .toArray()
    res.json({ data: { history }, error: null })
  } catch (err) {
    console.error('Error fetching asset history:', err)
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})
