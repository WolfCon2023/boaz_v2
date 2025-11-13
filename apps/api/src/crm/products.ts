import { Router } from 'express'
import { ObjectId, Sort, SortDirection } from 'mongodb'
import { getDb } from '../db.js'
import { sendAuthEmail } from '../auth/email.js'
import { env } from '../env.js'
import { requireAuth } from '../auth/rbac.js'

export type ProductType = 'product' | 'service' | 'bundle'

// Types for product history
type ProductHistoryEntry = {
  _id: ObjectId
  productId: ObjectId
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
async function addProductHistory(
  db: any,
  productId: ObjectId,
  eventType: ProductHistoryEntry['eventType'],
  description: string,
  userId?: string,
  userName?: string,
  userEmail?: string,
  oldValue?: any,
  newValue?: any,
  metadata?: Record<string, any>
) {
  try {
    await db.collection('product_history').insertOne({
      _id: new ObjectId(),
      productId,
      eventType,
      description,
      userId,
      userName,
      userEmail,
      oldValue,
      newValue,
      metadata,
      createdAt: new Date(),
    } as ProductHistoryEntry)
  } catch (err) {
    console.error('Failed to add product history:', err)
    // Don't fail the main operation if history fails
  }
}
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

// Debug middleware to log all requests to products router
productsRouter.use((req, res, next) => {
  if (req.path.includes('review-requests')) {
    console.log('🔍 PRODUCTS ROUTER - Request:', req.method, req.path, 'Full URL:', req.url)
  }
  next()
})

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
  const allowed = new Set(['name', 'sku', 'type', 'basePrice', 'cost', 'category', 'isActive', 'createdAt', 'updatedAt'])
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
  
  // Add history entry for creation
  const auth = (req as any).auth as { userId: string; email: string } | undefined
  if (auth) {
    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    await addProductHistory(
      db,
      result.insertedId,
      'created',
      `Product created: ${name}`,
      auth.userId,
      (user as any)?.name,
      auth.email
    )
  } else {
    await addProductHistory(
      db,
      result.insertedId,
      'created',
      `Product created: ${name}`
    )
  }
  
  res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null })
})

// PUT /api/crm/products/:id
productsRouter.put('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    
    // Get current product for comparison
    const currentProduct = await db.collection<ProductDoc>('products').findOne({ _id })
    if (!currentProduct) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }
    
    const raw = req.body ?? {}
    const update: Partial<ProductDoc> = { updatedAt: new Date() }
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    let user: any = null
    if (auth) {
      user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    }
    
    // Track field changes
    const fieldsToTrack = ['name', 'sku', 'description', 'type', 'basePrice', 'currency', 'cost', 'taxRate', 'isActive', 'category']
    let hasChanges = false
    
    for (const field of fieldsToTrack) {
      if (raw[field] !== undefined) {
        const newValue = field === 'basePrice' || field === 'cost' || field === 'taxRate' ? (raw[field] != null ? Number(raw[field]) : undefined) :
                        field === 'isActive' ? Boolean(raw[field]) :
                        field === 'type' ? raw[field] :
                        String(raw[field]).trim() || undefined
        const oldValue = (currentProduct as any)[field]
        
        if (newValue !== oldValue) {
          hasChanges = true
          const fieldName = field === 'basePrice' ? 'Base price' : field === 'isActive' ? 'Active status' : field.charAt(0).toUpperCase() + field.slice(1)
          await addProductHistory(
            db,
            _id,
            'field_changed',
            `${fieldName} changed from "${oldValue ?? 'empty'}" to "${newValue ?? 'empty'}"`,
            auth?.userId,
            user?.name,
            auth?.email,
            oldValue,
            newValue
          )
        }
        
        if (field === 'name') update.name = String(raw.name).trim()
        else if (field === 'sku') update.sku = String(raw.sku).trim() || undefined
        else if (field === 'description') update.description = String(raw.description).trim() || undefined
        else if (field === 'type') update.type = raw.type as ProductType
        else if (field === 'basePrice') update.basePrice = Number(raw.basePrice) || 0
        else if (field === 'currency') update.currency = String(raw.currency).trim()
        else if (field === 'cost') update.cost = raw.cost != null ? Number(raw.cost) : undefined
        else if (field === 'taxRate') update.taxRate = raw.taxRate != null ? Number(raw.taxRate) : undefined
        else if (field === 'isActive') update.isActive = Boolean(raw.isActive)
        else if (field === 'category') update.category = String(raw.category).trim() || undefined
      }
    }
    
    if (raw.tags !== undefined) update.tags = Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : undefined
    if (raw.metadata !== undefined) update.metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined

    await db.collection<ProductDoc>('products').updateOne({ _id }, { $set: update })
    
    // Add general update entry if no specific changes were tracked
    if (!hasChanges) {
      await addProductHistory(
        db,
        _id,
        'updated',
        'Product updated',
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

// GET /api/crm/products/:id/history
productsRouter.get('/:id/history', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const p = await db.collection<ProductDoc>('products').findOne({ _id })
    if (!p) return res.status(404).json({ data: null, error: 'not_found' })
    
    // Get all history entries for this product, sorted by date (newest first)
    const historyEntries = await db.collection('product_history')
      .find({ productId: _id })
      .sort({ createdAt: -1 })
      .toArray() as ProductHistoryEntry[]
    
    res.json({ 
      data: { 
        history: historyEntries,
        product: { 
          name: p.name, 
          sku: p.sku, 
          basePrice: p.basePrice, 
          cost: p.cost,
          createdAt: p.createdAt || _id.getTimestamp(),
          updatedAt: p.updatedAt 
        } 
      }, 
      error: null 
    })
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
  const allowed = new Set(['name', 'sku', 'bundlePrice', 'isActive', 'createdAt', 'updatedAt'])
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
  const allowed = new Set(['name', 'code', 'type', 'value', 'scope', 'isActive', 'startDate', 'endDate', 'createdAt', 'updatedAt'])
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
  const allowed = new Set(['name', 'isDefault', 'isActive', 'createdAt', 'updatedAt'])
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

// GET /api/crm/terms/review-requests (ledger - all review requests)
// CRITICAL: This route MUST be defined BEFORE /terms/:id to avoid route conflicts
// Express matches routes in registration order, so this specific route must come first
productsRouter.get('/terms/review-requests', requireAuth, async (req, res) => {
  console.log('✓✓✓✓✓ HIT /terms/review-requests route handler - PATH:', req.path, 'URL:', req.url) // Debug log
  const db = await getDb()
  if (!db) {
    console.error('Database unavailable')
    return res.status(500).json({ data: null, error: 'db_unavailable' })
  }
  
  try {
    const q = String((req.query.q as string) ?? '').trim()
    const status = req.query.status as 'pending' | 'viewed' | 'approved' | 'rejected' | undefined
    const sortKeyRaw = (req.query.sort as string) ?? 'sentAt'
    const dirParam = ((req.query.dir as string) ?? 'desc').toLowerCase()
    const dir: SortDirection = dirParam === 'asc' ? 1 : -1
    const allowed = new Set(['sentAt', 'viewedAt', 'respondedAt', 'status', 'recipientEmail', 'termsName'])
    const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'sentAt'
    const sort: Sort = { [sortField]: dir }
    
    const filter: Record<string, unknown> = {}
    if (q) {
      filter.$or = [
        { recipientEmail: { $regex: q, $options: 'i' } },
        { recipientName: { $regex: q, $options: 'i' } },
        { termsName: { $regex: q, $options: 'i' } },
        { senderName: { $regex: q, $options: 'i' } },
        { senderEmail: { $regex: q, $options: 'i' } },
      ]
    }
    if (status) filter.status = status
    
    const requests = await db.collection('terms_review_requests')
      .find(filter)
      .sort(sort)
      .limit(500)
      .toArray()
    
    res.json({ data: { items: requests }, error: null })
  } catch (err: any) {
    console.error('Get review requests ledger error:', err)
    res.status(500).json({ data: null, error: err.message || 'failed_to_get_review_requests_ledger' })
  }
})

// GET /api/crm/terms/:id
// IMPORTANT: This route must be defined AFTER /terms/review-requests to avoid route conflicts
// Using a regex pattern to only match valid ObjectId hex strings (24 hex characters)
// This regex ensures "review-requests" will NOT match this route
productsRouter.get('/terms/:id([0-9a-fA-F]{24})', async (req, res) => {
  console.log('⚠️⚠️⚠️ HIT /terms/:id route - this should NOT match review-requests! PATH:', req.path, 'ID:', req.params.id)
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
// Using regex pattern to only match valid ObjectId hex strings
productsRouter.put('/terms/:id([0-9a-fA-F]{24})', async (req, res) => {
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
// Using regex pattern to only match valid ObjectId hex strings
productsRouter.delete('/terms/:id([0-9a-fA-F]{24})', async (req, res) => {
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

// ===== TERMS REVIEW REQUESTS =====

// TermsReviewRequestDoc type defined at end of file for reuse

// POST /api/crm/terms/:id/send-for-review
// Using regex pattern to only match valid ObjectId hex strings
productsRouter.post('/terms/:id([0-9a-fA-F]{24})/send-for-review', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const auth = (req as any).auth as { userId: string; email: string }
    const termsId = new ObjectId(req.params.id)
    const { accountId, contactId, recipientEmail, recipientName, customMessage } = req.body || {}
    
    if (!recipientEmail || typeof recipientEmail !== 'string') {
      return res.status(400).json({ data: null, error: 'recipient_email_required' })
    }
    
    // Get terms
    const terms = await db.collection<CustomTermsDoc>('custom_terms').findOne({ _id: termsId })
    if (!terms) {
      return res.status(404).json({ data: null, error: 'terms_not_found' })
    }
    
    // Get sender info
    const sender = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    if (!sender) {
      return res.status(404).json({ data: null, error: 'sender_not_found' })
    }
    const senderData = sender as any
    
    // Validate account/contact if provided
    if (accountId && !ObjectId.isValid(accountId)) {
      return res.status(400).json({ data: null, error: 'invalid_account_id' })
    }
    if (contactId && !ObjectId.isValid(contactId)) {
      return res.status(400).json({ data: null, error: 'invalid_contact_id' })
    }
    
    // Generate unique review token
    const reviewToken = Buffer.from(`${termsId.toString()}-${Date.now()}-${Math.random()}`).toString('base64url')
    
    // Create review request
    const now = new Date()
    const reviewRequest: TermsReviewRequestDoc = {
      _id: new ObjectId(),
      termsId,
      termsName: terms.name,
      accountId: accountId ? new ObjectId(accountId) : undefined,
      contactId: contactId ? new ObjectId(contactId) : undefined,
      recipientEmail: recipientEmail.toLowerCase().trim(),
      recipientName: recipientName?.trim() || undefined,
      senderId: auth.userId,
      senderEmail: senderData.email,
      senderName: senderData.name,
      status: 'pending',
      customMessage: customMessage?.trim() || undefined,
      reviewToken,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    }
    
    await db.collection('terms_review_requests').insertOne(reviewRequest)
    
    // Send email with review link
    const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'
    const reviewUrl = `${baseUrl}/terms/review/${reviewToken}`
    
    try {
      await sendAuthEmail({
        to: recipientEmail,
        subject: `Terms & Conditions Review Request: ${terms.name}`,
        checkPreferences: false,
        html: `
          <h2>Terms & Conditions Review Request</h2>
          <p>${senderData.name || senderData.email} has requested that you review and accept the following terms and conditions:</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3>${terms.name}</h3>
            ${terms.description ? `<p><em>${terms.description}</em></p>` : ''}
            ${customMessage ? `<p><strong>Message from sender:</strong> ${customMessage}</p>` : ''}
          </div>
          <p><a href="${reviewUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Review & Accept Terms</a></p>
          <p>Or copy and paste this URL into your browser:</p>
          <p><code style="background: #f5f5f5; padding: 5px; border-radius: 3px;">${reviewUrl}</code></p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">This link will allow you to review the full terms and conditions and provide your acceptance or feedback.</p>
        `,
        text: `
Terms & Conditions Review Request

${senderData.name || senderData.email} has requested that you review and accept the following terms and conditions:

${terms.name}
${terms.description ? `\n${terms.description}` : ''}
${customMessage ? `\nMessage from sender: ${customMessage}` : ''}

Review & Accept Terms: ${reviewUrl}

This link will allow you to review the full terms and conditions and provide your acceptance or feedback.
        `,
      })
    } catch (emailErr) {
      console.error('Failed to send terms review email:', emailErr)
      // Don't fail the request if email fails
    }
    
    res.json({ data: { reviewRequestId: reviewRequest._id, reviewToken, message: 'Terms review request sent' }, error: null })
  } catch (err: any) {
    console.error('Send terms for review error:', err)
    res.status(500).json({ data: null, error: err.message || 'failed_to_send_terms_review' })
  }
})

// GET /api/crm/terms/:id/review-requests (review requests for a specific terms document)
// Using regex pattern to only match valid ObjectId hex strings
productsRouter.get('/terms/:id([0-9a-fA-F]{24})/review-requests', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const termsId = new ObjectId(req.params.id)
    const requests = await db.collection('terms_review_requests')
      .find({ termsId })
      .sort({ sentAt: -1 })
      .limit(100)
      .toArray()
    
    res.json({ data: { items: requests }, error: null })
  } catch (err: any) {
    console.error('Get review requests error:', err)
    res.status(500).json({ data: null, error: err.message || 'failed_to_get_review_requests' })
  }
})

// Types exported for use in other modules
export type TermsReviewRequestDoc = {
  _id: ObjectId
  termsId: ObjectId
  termsName: string
  accountId?: ObjectId
  contactId?: ObjectId
  recipientEmail: string
  recipientName?: string
  senderId?: string
  senderEmail?: string
  senderName?: string
  status: 'pending' | 'viewed' | 'approved' | 'rejected'
  customMessage?: string
  reviewToken: string
  sentAt: Date
  viewedAt?: Date
  respondedAt?: Date
  responseNotes?: string
  createdAt: Date
  updatedAt: Date
}

// Public review routes are registered in index.ts at /api/terms/review/*

// GET /api/crm/products/:id (must be LAST - after /bundles, /discounts, /terms routes)
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

