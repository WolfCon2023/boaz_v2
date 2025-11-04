import { Router } from 'express'
import { ObjectId, Sort, SortDirection } from 'mongodb'
import { getDb } from '../db.js'

export type ProductType = 'product' | 'service' | 'bundle'
export type DiscountType = 'percentage' | 'fixed' | 'tiered'
export type DiscountScope = 'global' | 'product' | 'bundle' | 'account'

export type ProductDoc = {
  _id: ObjectId
  sku?: string
  name: string
  description?: string
  type: ProductType
  basePrice: number
  currency?: string
  cost?: number // Cost of goods sold
  taxRate?: number // Tax rate as percentage (e.g., 8.5 for 8.5%)
  isActive?: boolean
  category?: string
  tags?: string[]
  metadata?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

export type BundleDoc = {
  _id: ObjectId
  sku?: string
  name: string
  description?: string
  items: Array<{
    productId: ObjectId
    quantity: number
    priceOverride?: number // Override price for this bundle item
  }>
  bundlePrice: number // Total bundle price (may be discounted from sum of items)
  currency?: string
  isActive?: boolean
  category?: string
  tags?: string[]
  createdAt: Date
  updatedAt: Date
}

export type DiscountDoc = {
  _id: ObjectId
  code?: string // Discount code (e.g., "SUMMER2024")
  name: string
  description?: string
  type: DiscountType
  value: number // Percentage (0-100) or fixed amount
  scope: DiscountScope
  productIds?: ObjectId[] // For product or bundle scope
  bundleIds?: ObjectId[] // For bundle scope
  accountIds?: ObjectId[] // For account scope
  minQuantity?: number
  minAmount?: number // Minimum order amount
  maxDiscount?: number // Maximum discount amount (for percentage)
  startDate?: Date
  endDate?: Date
  isActive?: boolean
  usageLimit?: number // Maximum number of times discount can be used
  usageCount?: number // Current usage count
  createdAt: Date
  updatedAt: Date
}

export type CustomTermsDoc = {
  _id: ObjectId
  name: string
  description?: string
  content: string // Terms content (markdown or plain text)
  isDefault?: boolean // Default terms for new quotes/invoices
  accountIds?: ObjectId[] // Account-specific terms
  isActive?: boolean
  createdAt: Date
  updatedAt: Date
}

export const productsRouter = Router()

// ===== PRODUCTS =====

// GET /api/crm/products?q=&type=&category=&isActive=&sort=&dir=
productsRouter.get('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  
  const q = String((req.query.q as string) ?? '').trim()
  const type = req.query.type as ProductType | undefined
  const category = req.query.category as string | undefined
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined
  const sortKeyRaw = (req.query.sort as string) ?? 'updatedAt'
  const dirParam = ((req.query.dir as string) ?? 'desc').toLowerCase()
  const dir: SortDirection = dirParam === 'asc' ? 1 : -1
  const allowed = new Set(['name', 'sku', 'basePrice', 'createdAt', 'updatedAt'])
  const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'updatedAt'
  const sort: Sort = { [sortField]: dir }

  const filter: Record<string, unknown> = {}
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { sku: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ]
  }
  if (type) filter.type = type
  if (category) filter.category = category
  if (isActive !== undefined) filter.isActive = isActive

  const items = await db.collection<ProductDoc>('products').find(filter).sort(sort).limit(500).toArray()
  res.json({ data: { items }, error: null })
})

// POST /api/crm/products
productsRouter.post('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  const name = String(raw.name || '').trim()
  if (!name) return res.status(400).json({ data: null, error: 'name_required' })

  const now = new Date()
  const doc: Partial<ProductDoc> = {
    sku: String(raw.sku || '').trim() || undefined,
    name,
    description: String(raw.description || '').trim() || undefined,
    type: (raw.type as ProductType) || 'product',
    basePrice: Number(raw.basePrice) || 0,
    currency: String(raw.currency || 'USD').trim(),
    cost: raw.cost != null ? Number(raw.cost) : undefined,
    taxRate: raw.taxRate != null ? Number(raw.taxRate) : undefined,
    isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : true,
    category: String(raw.category || '').trim() || undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : undefined,
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined,
    createdAt: now,
    updatedAt: now,
  }

  const result = await db.collection<ProductDoc>('products').insertOne(doc as ProductDoc)
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})

// PUT /api/crm/products/:id
productsRouter.put('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const raw = req.body ?? {}
    const update: Partial<ProductDoc> = { updatedAt: new Date() }
    
    if (raw.name !== undefined) update.name = String(raw.name).trim()
    if (raw.sku !== undefined) update.sku = String(raw.sku).trim() || undefined
    if (raw.description !== undefined) update.description = String(raw.description).trim() || undefined
    if (raw.type !== undefined) update.type = raw.type as ProductType
    if (raw.basePrice !== undefined) update.basePrice = Number(raw.basePrice) || 0
    if (raw.currency !== undefined) update.currency = String(raw.currency).trim()
    if (raw.cost !== undefined) update.cost = raw.cost != null ? Number(raw.cost) : undefined
    if (raw.taxRate !== undefined) update.taxRate = raw.taxRate != null ? Number(raw.taxRate) : undefined
    if (raw.isActive !== undefined) update.isActive = Boolean(raw.isActive)
    if (raw.category !== undefined) update.category = String(raw.category).trim() || undefined
    if (raw.tags !== undefined) update.tags = Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : undefined
    if (raw.metadata !== undefined) update.metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined

    await db.collection<ProductDoc>('products').updateOne({ _id }, { $set: update })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// DELETE /api/crm/products/:id
productsRouter.delete('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    await db.collection<ProductDoc>('products').deleteOne({ _id })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// GET /api/crm/products/:id (must be after /bundles, /discounts, /terms routes)
productsRouter.get('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const product = await db.collection<ProductDoc>('products').findOne({ _id })
    if (!product) return res.status(404).json({ data: null, error: 'not_found' })
    res.json({ data: product, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// ===== BUNDLES =====

// GET /api/crm/bundles?q=&isActive=&sort=&dir=
productsRouter.get('/bundles', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  
  const q = String((req.query.q as string) ?? '').trim()
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined
  const sortKeyRaw = (req.query.sort as string) ?? 'updatedAt'
  const dirParam = ((req.query.dir as string) ?? 'desc').toLowerCase()
  const dir: SortDirection = dirParam === 'asc' ? 1 : -1
  const allowed = new Set(['name', 'sku', 'bundlePrice', 'createdAt', 'updatedAt'])
  const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'updatedAt'
  const sort: Sort = { [sortField]: dir }

  const filter: Record<string, unknown> = {}
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { sku: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ]
  }
  if (isActive !== undefined) filter.isActive = isActive

  const items = await db.collection<BundleDoc>('bundles').find(filter).sort(sort).limit(500).toArray()
  res.json({ data: { items }, error: null })
})

// GET /api/crm/bundles/:id
productsRouter.get('/bundles/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const bundle = await db.collection<BundleDoc>('bundles').findOne({ _id })
    if (!bundle) return res.status(404).json({ data: null, error: 'not_found' })
    res.json({ data: bundle, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// POST /api/crm/bundles
productsRouter.post('/bundles', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  const name = String(raw.name || '').trim()
  if (!name) return res.status(400).json({ data: null, error: 'name_required' })

  const items = Array.isArray(raw.items) ? raw.items.map((item: any) => ({
    productId: new ObjectId(item.productId),
    quantity: Number(item.quantity) || 1,
    priceOverride: item.priceOverride != null ? Number(item.priceOverride) : undefined,
  })) : []
  if (items.length === 0) return res.status(400).json({ data: null, error: 'items_required' })

  const now = new Date()
  const doc: Partial<BundleDoc> = {
    sku: String(raw.sku || '').trim() || undefined,
    name,
    description: String(raw.description || '').trim() || undefined,
    items,
    bundlePrice: Number(raw.bundlePrice) || 0,
    currency: String(raw.currency || 'USD').trim(),
    isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : true,
    category: String(raw.category || '').trim() || undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : undefined,
    createdAt: now,
    updatedAt: now,
  }

  const result = await db.collection<BundleDoc>('bundles').insertOne(doc as BundleDoc)
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})

// PUT /api/crm/bundles/:id
productsRouter.put('/bundles/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const raw = req.body ?? {}
    const update: Partial<BundleDoc> = { updatedAt: new Date() }
    
    if (raw.name !== undefined) update.name = String(raw.name).trim()
    if (raw.sku !== undefined) update.sku = String(raw.sku).trim() || undefined
    if (raw.description !== undefined) update.description = String(raw.description).trim() || undefined
    if (raw.items !== undefined) {
      update.items = Array.isArray(raw.items) ? raw.items.map((item: any) => ({
        productId: new ObjectId(item.productId),
        quantity: Number(item.quantity) || 1,
        priceOverride: item.priceOverride != null ? Number(item.priceOverride) : undefined,
      })) : []
    }
    if (raw.bundlePrice !== undefined) update.bundlePrice = Number(raw.bundlePrice) || 0
    if (raw.currency !== undefined) update.currency = String(raw.currency).trim()
    if (raw.isActive !== undefined) update.isActive = Boolean(raw.isActive)
    if (raw.category !== undefined) update.category = String(raw.category).trim() || undefined
    if (raw.tags !== undefined) update.tags = Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : undefined

    await db.collection<BundleDoc>('bundles').updateOne({ _id }, { $set: update })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// DELETE /api/crm/bundles/:id
productsRouter.delete('/bundles/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    await db.collection<BundleDoc>('bundles').deleteOne({ _id })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// ===== DISCOUNTS =====

// GET /api/crm/discounts?q=&type=&scope=&isActive=&sort=&dir=
productsRouter.get('/discounts', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  
  const q = String((req.query.q as string) ?? '').trim()
  const type = req.query.type as DiscountType | undefined
  const scope = req.query.scope as DiscountScope | undefined
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined
  const sortKeyRaw = (req.query.sort as string) ?? 'updatedAt'
  const dirParam = ((req.query.dir as string) ?? 'desc').toLowerCase()
  const dir: SortDirection = dirParam === 'asc' ? 1 : -1
  const allowed = new Set(['name', 'code', 'value', 'startDate', 'endDate', 'createdAt', 'updatedAt'])
  const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'updatedAt'
  const sort: Sort = { [sortField]: dir }

  const filter: Record<string, unknown> = {}
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { code: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ]
  }
  if (type) filter.type = type
  if (scope) filter.scope = scope
  if (isActive !== undefined) filter.isActive = isActive

  const items = await db.collection<DiscountDoc>('discounts').find(filter).sort(sort).limit(500).toArray()
  res.json({ data: { items }, error: null })
})

// GET /api/crm/discounts/:id
productsRouter.get('/discounts/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const discount = await db.collection<DiscountDoc>('discounts').findOne({ _id })
    if (!discount) return res.status(404).json({ data: null, error: 'not_found' })
    res.json({ data: discount, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// POST /api/crm/discounts
productsRouter.post('/discounts', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  const name = String(raw.name || '').trim()
  if (!name) return res.status(400).json({ data: null, error: 'name_required' })

  const now = new Date()
  const doc: Partial<DiscountDoc> = {
    code: String(raw.code || '').trim().toUpperCase() || undefined,
    name,
    description: String(raw.description || '').trim() || undefined,
    type: (raw.type as DiscountType) || 'percentage',
    value: Number(raw.value) || 0,
    scope: (raw.scope as DiscountScope) || 'global',
    productIds: Array.isArray(raw.productIds) ? raw.productIds.map((id: string) => new ObjectId(id)) : undefined,
    bundleIds: Array.isArray(raw.bundleIds) ? raw.bundleIds.map((id: string) => new ObjectId(id)) : undefined,
    accountIds: Array.isArray(raw.accountIds) ? raw.accountIds.map((id: string) => new ObjectId(id)) : undefined,
    minQuantity: raw.minQuantity != null ? Number(raw.minQuantity) : undefined,
    minAmount: raw.minAmount != null ? Number(raw.minAmount) : undefined,
    maxDiscount: raw.maxDiscount != null ? Number(raw.maxDiscount) : undefined,
    startDate: raw.startDate ? new Date(raw.startDate) : undefined,
    endDate: raw.endDate ? new Date(raw.endDate) : undefined,
    isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : true,
    usageLimit: raw.usageLimit != null ? Number(raw.usageLimit) : undefined,
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  }

  const result = await db.collection<DiscountDoc>('discounts').insertOne(doc as DiscountDoc)
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})

// PUT /api/crm/discounts/:id
productsRouter.put('/discounts/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const raw = req.body ?? {}
    const update: Partial<DiscountDoc> = { updatedAt: new Date() }
    
    if (raw.name !== undefined) update.name = String(raw.name).trim()
    if (raw.code !== undefined) update.code = String(raw.code).trim().toUpperCase() || undefined
    if (raw.description !== undefined) update.description = String(raw.description).trim() || undefined
    if (raw.type !== undefined) update.type = raw.type as DiscountType
    if (raw.value !== undefined) update.value = Number(raw.value) || 0
    if (raw.scope !== undefined) update.scope = raw.scope as DiscountScope
    if (raw.productIds !== undefined) update.productIds = Array.isArray(raw.productIds) ? raw.productIds.map((id: string) => new ObjectId(id)) : undefined
    if (raw.bundleIds !== undefined) update.bundleIds = Array.isArray(raw.bundleIds) ? raw.bundleIds.map((id: string) => new ObjectId(id)) : undefined
    if (raw.accountIds !== undefined) update.accountIds = Array.isArray(raw.accountIds) ? raw.accountIds.map((id: string) => new ObjectId(id)) : undefined
    if (raw.minQuantity !== undefined) update.minQuantity = raw.minQuantity != null ? Number(raw.minQuantity) : undefined
    if (raw.minAmount !== undefined) update.minAmount = raw.minAmount != null ? Number(raw.minAmount) : undefined
    if (raw.maxDiscount !== undefined) update.maxDiscount = raw.maxDiscount != null ? Number(raw.maxDiscount) : undefined
    if (raw.startDate !== undefined) update.startDate = raw.startDate ? new Date(raw.startDate) : undefined
    if (raw.endDate !== undefined) update.endDate = raw.endDate ? new Date(raw.endDate) : undefined
    if (raw.isActive !== undefined) update.isActive = Boolean(raw.isActive)
    if (raw.usageLimit !== undefined) update.usageLimit = raw.usageLimit != null ? Number(raw.usageLimit) : undefined

    await db.collection<DiscountDoc>('discounts').updateOne({ _id }, { $set: update })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// DELETE /api/crm/discounts/:id
productsRouter.delete('/discounts/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    await db.collection<DiscountDoc>('discounts').deleteOne({ _id })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// ===== CUSTOM TERMS =====

// GET /api/crm/terms?q=&isActive=&sort=&dir=
productsRouter.get('/terms', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  
  const q = String((req.query.q as string) ?? '').trim()
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined
  const sortKeyRaw = (req.query.sort as string) ?? 'updatedAt'
  const dirParam = ((req.query.dir as string) ?? 'desc').toLowerCase()
  const dir: SortDirection = dirParam === 'asc' ? 1 : -1
  const allowed = new Set(['name', 'isDefault', 'createdAt', 'updatedAt'])
  const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'updatedAt'
  const sort: Sort = { [sortField]: dir }

  const filter: Record<string, unknown> = {}
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { content: { $regex: q, $options: 'i' } },
    ]
  }
  if (isActive !== undefined) filter.isActive = isActive

  const items = await db.collection<CustomTermsDoc>('custom_terms').find(filter).sort(sort).limit(500).toArray()
  res.json({ data: { items }, error: null })
})

// GET /api/crm/terms/:id
productsRouter.get('/terms/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const terms = await db.collection<CustomTermsDoc>('custom_terms').findOne({ _id })
    if (!terms) return res.status(404).json({ data: null, error: 'not_found' })
    res.json({ data: terms, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// POST /api/crm/terms
productsRouter.post('/terms', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  const name = String(raw.name || '').trim()
  if (!name) return res.status(400).json({ data: null, error: 'name_required' })
  const content = String(raw.content || '').trim()
  if (!content) return res.status(400).json({ data: null, error: 'content_required' })

  // If setting as default, unset other defaults
  if (raw.isDefault) {
    await db.collection<CustomTermsDoc>('custom_terms').updateMany(
      { isDefault: true },
      { $set: { isDefault: false } }
    )
  }

  const now = new Date()
  const doc: Partial<CustomTermsDoc> = {
    name,
    description: String(raw.description || '').trim() || undefined,
    content,
    isDefault: Boolean(raw.isDefault),
    accountIds: Array.isArray(raw.accountIds) ? raw.accountIds.map((id: string) => new ObjectId(id)) : undefined,
    isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : true,
    createdAt: now,
    updatedAt: now,
  }

  const result = await db.collection<CustomTermsDoc>('custom_terms').insertOne(doc as CustomTermsDoc)
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})

// PUT /api/crm/terms/:id
productsRouter.put('/terms/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const raw = req.body ?? {}
    const update: Partial<CustomTermsDoc> = { updatedAt: new Date() }
    
    if (raw.name !== undefined) update.name = String(raw.name).trim()
    if (raw.description !== undefined) update.description = String(raw.description).trim() || undefined
    if (raw.content !== undefined) update.content = String(raw.content).trim()
    if (raw.isDefault !== undefined) {
      update.isDefault = Boolean(raw.isDefault)
      // If setting as default, unset other defaults
      if (update.isDefault) {
        await db.collection<CustomTermsDoc>('custom_terms').updateMany(
          { _id: { $ne: _id }, isDefault: true },
          { $set: { isDefault: false } }
        )
      }
    }
    if (raw.accountIds !== undefined) update.accountIds = Array.isArray(raw.accountIds) ? raw.accountIds.map((id: string) => new ObjectId(id)) : undefined
    if (raw.isActive !== undefined) update.isActive = Boolean(raw.isActive)

    await db.collection<CustomTermsDoc>('custom_terms').updateOne({ _id }, { $set: update })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// DELETE /api/crm/terms/:id
productsRouter.delete('/terms/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    await db.collection<CustomTermsDoc>('custom_terms').deleteOne({ _id })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

