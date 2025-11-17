import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { sendAuthEmail } from '../auth/email.js';
import { env } from '../env.js';
import { requireAuth } from '../auth/rbac.js';
// Helper function to add product history entry
async function addProductHistory(db, productId, eventType, description, userId, userName, userEmail, oldValue, newValue, metadata) {
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
        });
    }
    catch (err) {
        console.error('Failed to add product history:', err);
        // Don't fail the main operation if history fails
    }
}
async function addBundleHistory(db, bundleId, eventType, description, userId, userName, userEmail, oldValue, newValue, metadata) {
    try {
        await db.collection('bundle_history').insertOne({
            _id: new ObjectId(),
            bundleId,
            eventType,
            description,
            userId,
            userName,
            userEmail,
            oldValue,
            newValue,
            metadata,
            createdAt: new Date(),
        });
    }
    catch (err) {
        console.error('Failed to add bundle history:', err);
    }
}
async function addDiscountHistory(db, discountId, eventType, description, userId, userName, userEmail, oldValue, newValue, metadata) {
    try {
        await db.collection('discount_history').insertOne({
            _id: new ObjectId(),
            discountId,
            eventType,
            description,
            userId,
            userName,
            userEmail,
            oldValue,
            newValue,
            metadata,
            createdAt: new Date(),
        });
    }
    catch (err) {
        console.error('Failed to add discount history:', err);
    }
}
async function addTermsHistory(db, termsId, eventType, description, userId, userName, userEmail, oldValue, newValue, metadata) {
    try {
        await db.collection('terms_history').insertOne({
            _id: new ObjectId(),
            termsId,
            eventType,
            description,
            userId,
            userName,
            userEmail,
            oldValue,
            newValue,
            metadata,
            createdAt: new Date(),
        });
    }
    catch (err) {
        console.error('Failed to add terms history:', err);
    }
}
export const productsRouter = Router();
// Debug middleware to log all requests to products router
productsRouter.use((req, res, next) => {
    console.log('🔍 PRODUCTS ROUTER - ALL REQUESTS:', req.method, req.path, 'Full URL:', req.url, 'Original URL:', req.originalUrl);
    if (req.path.includes('review-requests') || req.originalUrl?.includes('review-requests')) {
        console.log('🔍🔍🔍 REVIEW-REQUESTS REQUEST DETECTED:', req.method, req.path, req.originalUrl);
    }
    next();
});
// ===== PRODUCTS =====
// GET /api/crm/products?q=&type=&category=&isActive=&sort=&dir=
productsRouter.get('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const q = String(req.query.q ?? '').trim();
    const type = req.query.type;
    const category = req.query.category;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
    const sortKeyRaw = req.query.sort ?? 'updatedAt';
    const dirParam = (req.query.dir ?? 'desc').toLowerCase();
    const dir = dirParam === 'asc' ? 1 : -1;
    const allowed = new Set(['name', 'sku', 'type', 'basePrice', 'cost', 'category', 'isActive', 'createdAt', 'updatedAt']);
    const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'updatedAt';
    const sort = { [sortField]: dir };
    const filter = {};
    if (q) {
        filter.$or = [
            { name: { $regex: q, $options: 'i' } },
            { sku: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
        ];
    }
    if (type)
        filter.type = type;
    if (category)
        filter.category = category;
    if (isActive !== undefined)
        filter.isActive = isActive;
    const items = await db.collection('products').find(filter).sort(sort).limit(500).toArray();
    res.json({ data: { items }, error: null });
});
// POST /api/crm/products
productsRouter.post('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const raw = req.body ?? {};
    const name = String(raw.name || '').trim();
    if (!name)
        return res.status(400).json({ data: null, error: 'name_required' });
    const now = new Date();
    const doc = {
        sku: String(raw.sku || '').trim() || undefined,
        name,
        description: String(raw.description || '').trim() || undefined,
        type: raw.type || 'product',
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
    };
    const result = await db.collection('products').insertOne(doc);
    // Add history entry for creation
    const auth = req.auth;
    if (auth) {
        const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        await addProductHistory(db, result.insertedId, 'created', `Product created: ${name}`, auth.userId, user?.name, auth.email);
    }
    else {
        await addProductHistory(db, result.insertedId, 'created', `Product created: ${name}`);
    }
    res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null });
});
// PUT /api/crm/products/:id
productsRouter.put('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        // Get current product for comparison
        const currentProduct = await db.collection('products').findOne({ _id });
        if (!currentProduct) {
            return res.status(404).json({ data: null, error: 'not_found' });
        }
        const raw = req.body ?? {};
        const update = { updatedAt: new Date() };
        const auth = req.auth;
        let user = null;
        if (auth) {
            user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        }
        // Track field changes
        const fieldsToTrack = ['name', 'sku', 'description', 'type', 'basePrice', 'currency', 'cost', 'taxRate', 'isActive', 'category'];
        let hasChanges = false;
        for (const field of fieldsToTrack) {
            if (raw[field] !== undefined) {
                const newValue = field === 'basePrice' || field === 'cost' || field === 'taxRate' ? (raw[field] != null ? Number(raw[field]) : undefined) :
                    field === 'isActive' ? Boolean(raw[field]) :
                        field === 'type' ? raw[field] :
                            String(raw[field]).trim() || undefined;
                const oldValue = currentProduct[field];
                if (newValue !== oldValue) {
                    hasChanges = true;
                    const fieldName = field === 'basePrice' ? 'Base price' : field === 'isActive' ? 'Active status' : field.charAt(0).toUpperCase() + field.slice(1);
                    await addProductHistory(db, _id, 'field_changed', `${fieldName} changed from "${oldValue ?? 'empty'}" to "${newValue ?? 'empty'}"`, auth?.userId, user?.name, auth?.email, oldValue, newValue);
                }
                if (field === 'name')
                    update.name = String(raw.name).trim();
                else if (field === 'sku')
                    update.sku = String(raw.sku).trim() || undefined;
                else if (field === 'description')
                    update.description = String(raw.description).trim() || undefined;
                else if (field === 'type')
                    update.type = raw.type;
                else if (field === 'basePrice')
                    update.basePrice = Number(raw.basePrice) || 0;
                else if (field === 'currency')
                    update.currency = String(raw.currency).trim();
                else if (field === 'cost')
                    update.cost = raw.cost != null ? Number(raw.cost) : undefined;
                else if (field === 'taxRate')
                    update.taxRate = raw.taxRate != null ? Number(raw.taxRate) : undefined;
                else if (field === 'isActive')
                    update.isActive = Boolean(raw.isActive);
                else if (field === 'category')
                    update.category = String(raw.category).trim() || undefined;
            }
        }
        if (raw.tags !== undefined)
            update.tags = Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : undefined;
        if (raw.metadata !== undefined)
            update.metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined;
        await db.collection('products').updateOne({ _id }, { $set: update });
        // Add general update entry if no specific changes were tracked
        if (!hasChanges) {
            await addProductHistory(db, _id, 'updated', 'Product updated', auth?.userId, user?.name, auth?.email);
        }
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// GET /api/crm/products/:id/history
productsRouter.get('/:id/history', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const p = await db.collection('products').findOne({ _id });
        if (!p)
            return res.status(404).json({ data: null, error: 'not_found' });
        // Get all history entries for this product, sorted by date (newest first)
        const historyEntries = await db.collection('product_history')
            .find({ productId: _id })
            .sort({ createdAt: -1 })
            .toArray();
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
        });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// DELETE /api/crm/products/:id
productsRouter.delete('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        await db.collection('products').deleteOne({ _id });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// ===== BUNDLES =====
// GET /api/crm/bundles?q=&isActive=&sort=&dir=
productsRouter.get('/bundles', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const q = String(req.query.q ?? '').trim();
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
    const sortKeyRaw = req.query.sort ?? 'updatedAt';
    const dirParam = (req.query.dir ?? 'desc').toLowerCase();
    const dir = dirParam === 'asc' ? 1 : -1;
    const allowed = new Set(['name', 'sku', 'bundlePrice', 'isActive', 'createdAt', 'updatedAt']);
    const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'updatedAt';
    const sort = { [sortField]: dir };
    const filter = {};
    if (q) {
        filter.$or = [
            { name: { $regex: q, $options: 'i' } },
            { sku: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
        ];
    }
    if (isActive !== undefined)
        filter.isActive = isActive;
    const items = await db.collection('bundles').find(filter).sort(sort).limit(500).toArray();
    res.json({ data: { items }, error: null });
});
// GET /api/crm/bundles/:id
productsRouter.get('/bundles/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const bundle = await db.collection('bundles').findOne({ _id });
        if (!bundle)
            return res.status(404).json({ data: null, error: 'not_found' });
        res.json({ data: bundle, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// GET /api/crm/bundles/:id/history
productsRouter.get('/bundles/:id/history', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const bundle = await db.collection('bundles').findOne({ _id });
        if (!bundle)
            return res.status(404).json({ data: null, error: 'not_found' });
        const historyEntries = await db
            .collection('bundle_history')
            .find({ bundleId: _id })
            .sort({ createdAt: -1 })
            .toArray();
        res.json({
            data: {
                history: historyEntries,
                bundle: {
                    name: bundle.name,
                    sku: bundle.sku,
                    bundlePrice: bundle.bundlePrice,
                    createdAt: bundle.createdAt || _id.getTimestamp(),
                    updatedAt: bundle.updatedAt,
                },
            },
            error: null,
        });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// POST /api/crm/bundles
productsRouter.post('/bundles', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const raw = req.body ?? {};
    const name = String(raw.name || '').trim();
    if (!name)
        return res.status(400).json({ data: null, error: 'name_required' });
    const items = Array.isArray(raw.items) ? raw.items.map((item) => ({
        productId: new ObjectId(item.productId),
        quantity: Number(item.quantity) || 1,
        priceOverride: item.priceOverride != null ? Number(item.priceOverride) : undefined,
    })) : [];
    if (items.length === 0)
        return res.status(400).json({ data: null, error: 'items_required' });
    const now = new Date();
    const doc = {
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
    };
    const result = await db.collection('bundles').insertOne(doc);
    // Add history entry for creation
    const auth = req.auth;
    if (auth) {
        const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        await addBundleHistory(db, result.insertedId, 'created', `Bundle created: ${name}`, auth.userId, user?.name, auth.email);
    }
    else {
        await addBundleHistory(db, result.insertedId, 'created', `Bundle created: ${name}`);
    }
    res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null });
});
// PUT /api/crm/bundles/:id
productsRouter.put('/bundles/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const currentBundle = await db.collection('bundles').findOne({ _id });
        if (!currentBundle) {
            return res.status(404).json({ data: null, error: 'not_found' });
        }
        const raw = req.body ?? {};
        const update = { updatedAt: new Date() };
        const auth = req.auth;
        let user = null;
        if (auth) {
            user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        }
        const fieldsToTrack = ['name', 'sku', 'description', 'bundlePrice', 'currency', 'isActive', 'category'];
        let hasChanges = false;
        for (const field of fieldsToTrack) {
            if (raw[field] !== undefined) {
                const newValue = field === 'bundlePrice' ? (raw[field] != null ? Number(raw[field]) : undefined) :
                    field === 'isActive' ? Boolean(raw[field]) :
                        String(raw[field]).trim() || undefined;
                const oldValue = currentBundle[field];
                if (newValue !== oldValue) {
                    hasChanges = true;
                    const fieldName = field === 'bundlePrice'
                        ? 'Bundle price'
                        : field === 'isActive'
                            ? 'Active status'
                            : field.charAt(0).toUpperCase() + field.slice(1);
                    await addBundleHistory(db, _id, 'field_changed', `${fieldName} changed from "${oldValue ?? 'empty'}" to "${newValue ?? 'empty'}"`, auth?.userId, user?.name, auth?.email, oldValue, newValue);
                }
                if (field === 'name')
                    update.name = String(raw.name).trim();
                else if (field === 'sku')
                    update.sku = String(raw.sku).trim() || undefined;
                else if (field === 'description')
                    update.description = String(raw.description).trim() || undefined;
                else if (field === 'bundlePrice')
                    update.bundlePrice = Number(raw.bundlePrice) || 0;
                else if (field === 'currency')
                    update.currency = String(raw.currency).trim();
                else if (field === 'isActive')
                    update.isActive = Boolean(raw.isActive);
                else if (field === 'category')
                    update.category = String(raw.category).trim() || undefined;
            }
        }
        if (raw.tags !== undefined)
            update.tags = Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : undefined;
        await db.collection('bundles').updateOne({ _id }, { $set: update });
        if (!hasChanges) {
            await addBundleHistory(db, _id, 'updated', 'Bundle updated', auth?.userId, user?.name, auth?.email);
        }
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// DELETE /api/crm/bundles/:id
productsRouter.delete('/bundles/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        await db.collection('bundles').deleteOne({ _id });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// ===== DISCOUNTS =====
// GET /api/crm/discounts?q=&type=&scope=&isActive=&sort=&dir=
productsRouter.get('/discounts', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const q = String(req.query.q ?? '').trim();
    const type = req.query.type;
    const scope = req.query.scope;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
    const sortKeyRaw = req.query.sort ?? 'updatedAt';
    const dirParam = (req.query.dir ?? 'desc').toLowerCase();
    const dir = dirParam === 'asc' ? 1 : -1;
    const allowed = new Set(['name', 'code', 'type', 'value', 'scope', 'isActive', 'startDate', 'endDate', 'createdAt', 'updatedAt']);
    const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'updatedAt';
    const sort = { [sortField]: dir };
    const filter = {};
    if (q) {
        filter.$or = [
            { name: { $regex: q, $options: 'i' } },
            { code: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
        ];
    }
    if (type)
        filter.type = type;
    if (scope)
        filter.scope = scope;
    if (isActive !== undefined)
        filter.isActive = isActive;
    const items = await db.collection('discounts').find(filter).sort(sort).limit(500).toArray();
    res.json({ data: { items }, error: null });
});
// GET /api/crm/discounts/:id
productsRouter.get('/discounts/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const discount = await db.collection('discounts').findOne({ _id });
        if (!discount)
            return res.status(404).json({ data: null, error: 'not_found' });
        res.json({ data: discount, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// GET /api/crm/discounts/:id/history
productsRouter.get('/discounts/:id/history', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const discount = await db.collection('discounts').findOne({ _id });
        if (!discount)
            return res.status(404).json({ data: null, error: 'not_found' });
        const historyEntries = await db
            .collection('discount_history')
            .find({ discountId: _id })
            .sort({ createdAt: -1 })
            .toArray();
        res.json({
            data: {
                history: historyEntries,
                discount: {
                    name: discount.name,
                    code: discount.code,
                    type: discount.type,
                    value: discount.value,
                    createdAt: discount.createdAt || _id.getTimestamp(),
                    updatedAt: discount.updatedAt,
                },
            },
            error: null,
        });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// POST /api/crm/discounts
productsRouter.post('/discounts', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const raw = req.body ?? {};
    const name = String(raw.name || '').trim();
    if (!name)
        return res.status(400).json({ data: null, error: 'name_required' });
    const now = new Date();
    const doc = {
        code: String(raw.code || '').trim().toUpperCase() || undefined,
        name,
        description: String(raw.description || '').trim() || undefined,
        type: raw.type || 'percentage',
        value: Number(raw.value) || 0,
        scope: raw.scope || 'global',
        productIds: Array.isArray(raw.productIds) ? raw.productIds.map((id) => new ObjectId(id)) : undefined,
        bundleIds: Array.isArray(raw.bundleIds) ? raw.bundleIds.map((id) => new ObjectId(id)) : undefined,
        accountIds: Array.isArray(raw.accountIds) ? raw.accountIds.map((id) => new ObjectId(id)) : undefined,
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
    };
    const result = await db.collection('discounts').insertOne(doc);
    // Add history entry for creation
    const auth = req.auth;
    if (auth) {
        const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        await addDiscountHistory(db, result.insertedId, 'created', `Discount created: ${name}`, auth.userId, user?.name, auth.email);
    }
    else {
        await addDiscountHistory(db, result.insertedId, 'created', `Discount created: ${name}`);
    }
    res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null });
});
// PUT /api/crm/discounts/:id
productsRouter.put('/discounts/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const current = await db.collection('discounts').findOne({ _id });
        if (!current) {
            return res.status(404).json({ data: null, error: 'not_found' });
        }
        const raw = req.body ?? {};
        const update = { updatedAt: new Date() };
        const auth = req.auth;
        let user = null;
        if (auth) {
            user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        }
        const fieldsToTrack = [
            'name',
            'code',
            'description',
            'type',
            'value',
            'scope',
            'minQuantity',
            'minAmount',
            'maxDiscount',
            'startDate',
            'endDate',
            'isActive',
            'usageLimit',
        ];
        let hasChanges = false;
        for (const field of fieldsToTrack) {
            if (raw[field] !== undefined) {
                let newValue;
                if (field === 'value' || field === 'minQuantity' || field === 'minAmount' || field === 'maxDiscount' || field === 'usageLimit') {
                    newValue = raw[field] != null ? Number(raw[field]) : undefined;
                }
                else if (field === 'isActive') {
                    newValue = Boolean(raw[field]);
                }
                else if (field === 'startDate' || field === 'endDate') {
                    newValue = raw[field] ? new Date(raw[field]) : undefined;
                }
                else {
                    newValue = String(raw[field]).trim() || undefined;
                }
                const oldValue = current[field];
                if (String(newValue) !== String(oldValue)) {
                    hasChanges = true;
                    const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
                    await addDiscountHistory(db, _id, 'field_changed', `${fieldName} changed from "${oldValue ?? 'empty'}" to "${newValue ?? 'empty'}"`, auth?.userId, user?.name, auth?.email, oldValue, newValue);
                }
                if (field === 'name')
                    update.name = String(raw.name).trim();
                else if (field === 'code')
                    update.code = String(raw.code).trim().toUpperCase() || undefined;
                else if (field === 'description')
                    update.description = String(raw.description).trim() || undefined;
                else if (field === 'type')
                    update.type = raw.type;
                else if (field === 'value')
                    update.value = Number(raw.value) || 0;
                else if (field === 'scope')
                    update.scope = raw.scope;
                else if (field === 'minQuantity')
                    update.minQuantity = raw.minQuantity != null ? Number(raw.minQuantity) : undefined;
                else if (field === 'minAmount')
                    update.minAmount = raw.minAmount != null ? Number(raw.minAmount) : undefined;
                else if (field === 'maxDiscount')
                    update.maxDiscount = raw.maxDiscount != null ? Number(raw.maxDiscount) : undefined;
                else if (field === 'startDate')
                    update.startDate = raw.startDate ? new Date(raw.startDate) : undefined;
                else if (field === 'endDate')
                    update.endDate = raw.endDate ? new Date(raw.endDate) : undefined;
                else if (field === 'isActive')
                    update.isActive = Boolean(raw.isActive);
                else if (field === 'usageLimit')
                    update.usageLimit = raw.usageLimit != null ? Number(raw.usageLimit) : undefined;
            }
        }
        if (raw.productIds !== undefined)
            update.productIds = Array.isArray(raw.productIds) ? raw.productIds.map((id) => new ObjectId(id)) : undefined;
        if (raw.bundleIds !== undefined)
            update.bundleIds = Array.isArray(raw.bundleIds) ? raw.bundleIds.map((id) => new ObjectId(id)) : undefined;
        if (raw.accountIds !== undefined)
            update.accountIds = Array.isArray(raw.accountIds) ? raw.accountIds.map((id) => new ObjectId(id)) : undefined;
        await db.collection('discounts').updateOne({ _id }, { $set: update });
        if (!hasChanges) {
            await addDiscountHistory(db, _id, 'updated', 'Discount updated', auth?.userId, user?.name, auth?.email);
        }
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// DELETE /api/crm/discounts/:id
productsRouter.delete('/discounts/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        await db.collection('discounts').deleteOne({ _id });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// ===== CUSTOM TERMS =====
// GET /api/crm/terms?q=&isActive=&sort=&dir=
productsRouter.get('/terms', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const q = String(req.query.q ?? '').trim();
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
    const sortKeyRaw = req.query.sort ?? 'updatedAt';
    const dirParam = (req.query.dir ?? 'desc').toLowerCase();
    const dir = dirParam === 'asc' ? 1 : -1;
    const allowed = new Set(['name', 'isDefault', 'isActive', 'createdAt', 'updatedAt']);
    const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'updatedAt';
    const sort = { [sortField]: dir };
    const filter = {};
    if (q) {
        filter.$or = [
            { name: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
            { content: { $regex: q, $options: 'i' } },
        ];
    }
    if (isActive !== undefined)
        filter.isActive = isActive;
    const items = await db.collection('custom_terms').find(filter).sort(sort).limit(500).toArray();
    res.json({ data: { items }, error: null });
});
// GET /api/crm/terms/ledger (ledger - all review requests for custom terms)
// NOTE: Using a distinct path (/terms/ledger) to avoid any route ambiguity with /terms/:id
productsRouter.get('/terms/ledger', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db) {
        console.error('Database unavailable');
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    }
    try {
        const q = String(req.query.q ?? '').trim();
        const status = req.query.status;
        const sortKeyRaw = req.query.sort ?? 'sentAt';
        const dirParam = (req.query.dir ?? 'desc').toLowerCase();
        const dir = dirParam === 'asc' ? 1 : -1;
        const allowed = new Set(['sentAt', 'viewedAt', 'respondedAt', 'status', 'recipientEmail', 'termsName']);
        const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'sentAt';
        const sort = { [sortField]: dir };
        const filter = {};
        if (q) {
            filter.$or = [
                { recipientEmail: { $regex: q, $options: 'i' } },
                { recipientName: { $regex: q, $options: 'i' } },
                { termsName: { $regex: q, $options: 'i' } },
                { senderName: { $regex: q, $options: 'i' } },
                { senderEmail: { $regex: q, $options: 'i' } },
            ];
        }
        if (status)
            filter.status = status;
        const requests = await db.collection('terms_review_requests')
            .find(filter)
            .sort(sort)
            .limit(500)
            .toArray();
        res.json({ data: { items: requests }, error: null });
    }
    catch (err) {
        console.error('Get review requests ledger error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_review_requests_ledger' });
    }
});
// GET /api/crm/terms/:id/history
productsRouter.get('/terms/:id([0-9a-fA-F]{24})/history', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const terms = await db.collection('custom_terms').findOne({ _id });
        if (!terms)
            return res.status(404).json({ data: null, error: 'not_found' });
        const historyEntries = await db
            .collection('terms_history')
            .find({ termsId: _id })
            .sort({ createdAt: -1 })
            .toArray();
        res.json({
            data: {
                history: historyEntries,
                terms: {
                    name: terms.name,
                    isDefault: terms.isDefault,
                    isActive: terms.isActive,
                    createdAt: terms.createdAt || _id.getTimestamp(),
                    updatedAt: terms.updatedAt,
                },
            },
            error: null,
        });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// GET /api/crm/terms/:id
// IMPORTANT: This route must be defined AFTER /terms/review-requests to avoid route conflicts
// Using a regex pattern to only match valid ObjectId hex strings (24 hex characters)
// This regex ensures "review-requests" will NOT match this route
productsRouter.get('/terms/:id([0-9a-fA-F]{24})', async (req, res) => {
    console.log('⚠️⚠️⚠️ HIT /terms/:id route - this should NOT match review-requests! PATH:', req.path, 'ID:', req.params.id, 'URL:', req.url);
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    // Double-check: if id is "review-requests", this is a route matching bug
    if (req.params.id === 'review-requests') {
        console.error('🚨🚨🚨 CRITICAL BUG: /terms/:id matched "review-requests" despite regex pattern!');
        return res.status(404).json({ data: null, error: 'route_not_found' });
    }
    try {
        const _id = new ObjectId(req.params.id);
        const terms = await db.collection('custom_terms').findOne({ _id });
        if (!terms)
            return res.status(404).json({ data: null, error: 'not_found' });
        res.json({ data: terms, error: null });
    }
    catch (err) {
        console.error('ObjectId conversion error:', err, 'ID:', req.params.id);
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// POST /api/crm/terms
productsRouter.post('/terms', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const raw = req.body ?? {};
    const name = String(raw.name || '').trim();
    if (!name)
        return res.status(400).json({ data: null, error: 'name_required' });
    const content = String(raw.content || '').trim();
    if (!content)
        return res.status(400).json({ data: null, error: 'content_required' });
    // If setting as default, unset other defaults
    if (raw.isDefault) {
        await db.collection('custom_terms').updateMany({ isDefault: true }, { $set: { isDefault: false } });
    }
    const now = new Date();
    const doc = {
        name,
        description: String(raw.description || '').trim() || undefined,
        content,
        isDefault: Boolean(raw.isDefault),
        accountIds: Array.isArray(raw.accountIds) ? raw.accountIds.map((id) => new ObjectId(id)) : undefined,
        isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : true,
        createdAt: now,
        updatedAt: now,
    };
    const result = await db.collection('custom_terms').insertOne(doc);
    // Add history entry for creation
    const auth = req.auth;
    if (auth) {
        const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        await addTermsHistory(db, result.insertedId, 'created', `Terms created: ${name}`, auth.userId, user?.name, auth.email);
    }
    else {
        await addTermsHistory(db, result.insertedId, 'created', `Terms created: ${name}`);
    }
    res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null });
});
// PUT /api/crm/terms/:id
// Using regex pattern to only match valid ObjectId hex strings
productsRouter.put('/terms/:id([0-9a-fA-F]{24})', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const current = await db.collection('custom_terms').findOne({ _id });
        if (!current) {
            return res.status(404).json({ data: null, error: 'not_found' });
        }
        const raw = req.body ?? {};
        const update = { updatedAt: new Date() };
        const auth = req.auth;
        let user = null;
        if (auth) {
            user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        }
        const fieldsToTrack = ['name', 'description', 'content', 'isDefault', 'isActive'];
        let hasChanges = false;
        for (const field of fieldsToTrack) {
            if (raw[field] !== undefined) {
                let newValue;
                if (field === 'isDefault' || field === 'isActive') {
                    newValue = Boolean(raw[field]);
                }
                else {
                    newValue = String(raw[field]).trim() || undefined;
                }
                const oldValue = current[field];
                if (String(newValue) !== String(oldValue)) {
                    hasChanges = true;
                    const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
                    await addTermsHistory(db, _id, 'field_changed', `${fieldName} changed from "${oldValue ?? 'empty'}" to "${newValue ?? 'empty'}"`, auth?.userId, user?.name, auth?.email, oldValue, newValue);
                }
                if (field === 'name')
                    update.name = String(raw.name).trim();
                else if (field === 'description')
                    update.description = String(raw.description).trim() || undefined;
                else if (field === 'content')
                    update.content = String(raw.content).trim();
                else if (field === 'isDefault')
                    update.isDefault = Boolean(raw.isDefault);
                else if (field === 'isActive')
                    update.isActive = Boolean(raw.isActive);
            }
        }
        if (update.isDefault) {
            await db.collection('custom_terms').updateMany({ _id: { $ne: _id }, isDefault: true }, { $set: { isDefault: false } });
        }
        if (raw.accountIds !== undefined) {
            update.accountIds = Array.isArray(raw.accountIds)
                ? raw.accountIds.map((id) => new ObjectId(id))
                : undefined;
        }
        await db.collection('custom_terms').updateOne({ _id }, { $set: update });
        if (!hasChanges) {
            await addTermsHistory(db, _id, 'updated', 'Terms updated', auth?.userId, user?.name, auth?.email);
        }
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// DELETE /api/crm/terms/:id
// Using regex pattern to only match valid ObjectId hex strings
productsRouter.delete('/terms/:id([0-9a-fA-F]{24})', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        await db.collection('custom_terms').deleteOne({ _id });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// ===== TERMS REVIEW REQUESTS =====
// TermsReviewRequestDoc type defined at end of file for reuse
// POST /api/crm/terms/:id/send-for-review
// Using regex pattern to only match valid ObjectId hex strings
productsRouter.post('/terms/:id([0-9a-fA-F]{24})/send-for-review', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const auth = req.auth;
        const termsId = new ObjectId(req.params.id);
        const { accountId, contactId, recipientEmail, recipientName, customMessage } = req.body || {};
        if (!recipientEmail || typeof recipientEmail !== 'string') {
            return res.status(400).json({ data: null, error: 'recipient_email_required' });
        }
        // Get terms
        const terms = await db.collection('custom_terms').findOne({ _id: termsId });
        if (!terms) {
            return res.status(404).json({ data: null, error: 'terms_not_found' });
        }
        // Get sender info
        const sender = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        if (!sender) {
            return res.status(404).json({ data: null, error: 'sender_not_found' });
        }
        const senderData = sender;
        // Validate account/contact if provided
        if (accountId && !ObjectId.isValid(accountId)) {
            return res.status(400).json({ data: null, error: 'invalid_account_id' });
        }
        if (contactId && !ObjectId.isValid(contactId)) {
            return res.status(400).json({ data: null, error: 'invalid_contact_id' });
        }
        // Generate unique review token
        const reviewToken = Buffer.from(`${termsId.toString()}-${Date.now()}-${Math.random()}`).toString('base64url');
        // Create review request
        const now = new Date();
        const reviewRequest = {
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
        };
        await db.collection('terms_review_requests').insertOne(reviewRequest);
        // Send email with review link
        const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173';
        const reviewUrl = `${baseUrl}/terms/review/${reviewToken}`;
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
            });
        }
        catch (emailErr) {
            console.error('Failed to send terms review email:', emailErr);
            // Don't fail the request if email fails
        }
        res.json({ data: { reviewRequestId: reviewRequest._id, reviewToken, message: 'Terms review request sent' }, error: null });
    }
    catch (err) {
        console.error('Send terms for review error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_send_terms_review' });
    }
});
// GET /api/crm/terms/:id/review-requests (review requests for a specific terms document)
// Using regex pattern to only match valid ObjectId hex strings
productsRouter.get('/terms/:id([0-9a-fA-F]{24})/review-requests', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const termsId = new ObjectId(req.params.id);
        const requests = await db.collection('terms_review_requests')
            .find({ termsId })
            .sort({ sentAt: -1 })
            .limit(100)
            .toArray();
        res.json({ data: { items: requests }, error: null });
    }
    catch (err) {
        console.error('Get review requests error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_review_requests' });
    }
});
// Public review routes are registered in index.ts at /api/terms/review/*
// GET /api/crm/products/:id (must be LAST - after /bundles, /discounts, /terms routes)
productsRouter.get('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const product = await db.collection('products').findOne({ _id });
        if (!product)
            return res.status(404).json({ data: null, error: 'not_found' });
        res.json({ data: product, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
