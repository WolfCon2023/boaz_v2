import { Router } from 'express';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { getDb } from './db.js';
import { requireAuth } from './auth/rbac.js';
export const assetsRouter = Router();
assetsRouter.use(requireAuth);
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
});
const environmentUpdateSchema = environmentSchema.partial();
const installedProductSchema = z.object({
    customerId: z.string().trim().min(1),
    environmentId: z.string().trim().min(1),
    productName: z.string().trim().min(1),
    productType: z.enum(['Software', 'Hardware', 'Cloud Service', 'Integration', 'Subscription']),
    vendor: z.string().trim().optional(),
    version: z.string().trim().optional(),
    serialNumber: z.string().trim().optional(),
    configuration: z.any().optional(),
    deploymentDate: z.string().datetime().optional(), // ISO string
    status: z.enum(['Active', 'Needs Upgrade', 'Pending Renewal', 'Retired']).default('Active'),
    supportLevel: z.enum(['Basic', 'Standard', 'Premium']).optional(),
});
const installedProductUpdateSchema = installedProductSchema.partial();
const licenseSchema = z.object({
    productId: z.string().trim().min(1),
    licenseType: z.enum(['Seat-based', 'Device-based', 'Perpetual', 'Subscription']),
    licenseKey: z.string().trim().optional(),
    licenseIdentifier: z.string().trim().optional(),
    licenseCount: z.number().int().min(1),
    seatsAssigned: z.number().int().min(0).optional().default(0),
    expirationDate: z.string().datetime().optional(), // ISO
    renewalStatus: z.enum(['Active', 'Expired', 'Pending Renewal']).default('Active'),
    cost: z.number().nonnegative().optional(),
    assignedUsers: z.array(z.string().trim()).optional(),
});
const licenseUpdateSchema = licenseSchema.partial();
function serializeEnvironment(doc) {
    return {
        ...doc,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
    };
}
function serializeProduct(doc) {
    return {
        ...doc,
        deploymentDate: doc.deploymentDate ? doc.deploymentDate.toISOString() : null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
    };
}
function serializeLicense(doc) {
    return {
        ...doc,
        expirationDate: doc.expirationDate ? doc.expirationDate.toISOString() : null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
    };
}
// Customers (read-only proxy from CRM accounts)
assetsRouter.get('/customers', async (_req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const items = await db
        .collection('accounts')
        .find({}, { projection: { _id: 1, name: 1, companyName: 1, accountNumber: 1 } })
        .sort({ name: 1 })
        .limit(500)
        .toArray();
    res.json({
        data: {
            items: items.map((a) => ({
                id: String(a._id),
                name: a.name ?? a.companyName ?? 'Account',
                accountNumber: a.accountNumber,
            })),
        },
        error: null,
    });
});
// Environments
assetsRouter.post('/environments', async (req, res) => {
    const parsed = environmentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const now = new Date();
    const _id = new ObjectId().toHexString();
    const doc = {
        _id,
        customerId: parsed.data.customerId,
        name: parsed.data.name,
        environmentType: parsed.data.environmentType,
        location: parsed.data.location,
        status: parsed.data.status ?? 'Active',
        notes: parsed.data.notes,
        createdAt: now,
        updatedAt: now,
    };
    await db.collection('assets_environments').insertOne(doc);
    res.status(201).json({ data: serializeEnvironment(doc), error: null });
});
assetsRouter.get('/environments/:customerId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const customerId = String(req.params.customerId);
    const items = await db
        .collection('assets_environments')
        .find({ customerId })
        .sort({ name: 1 })
        .toArray();
    res.json({ data: { items: items.map(serializeEnvironment) }, error: null });
});
assetsRouter.put('/environments/:environmentId', async (req, res) => {
    const parsed = environmentUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const id = String(req.params.environmentId);
    const update = { ...parsed.data, updatedAt: new Date() };
    const coll = db.collection('assets_environments');
    const existing = await coll.findOne({ _id: id });
    if (!existing)
        return res.status(404).json({ data: null, error: 'not_found' });
    await coll.updateOne({ _id: id }, { $set: update });
    const updated = await coll.findOne({ _id: id });
    res.json({ data: serializeEnvironment(updated), error: null });
});
assetsRouter.delete('/environments/:environmentId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const id = String(req.params.environmentId);
    const result = await db.collection('assets_environments').deleteOne({ _id: id });
    if (!result.deletedCount) {
        return res.status(404).json({ data: null, error: 'not_found' });
    }
    res.json({ data: { ok: true }, error: null });
});
// Installed products
assetsRouter.post('/products', async (req, res) => {
    const parsed = installedProductSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const now = new Date();
    const _id = new ObjectId().toHexString();
    const deploymentDate = parsed.data.deploymentDate ? new Date(parsed.data.deploymentDate) : null;
    const doc = {
        _id,
        customerId: parsed.data.customerId,
        environmentId: parsed.data.environmentId,
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
    };
    await db.collection('assets_products').insertOne(doc);
    res.status(201).json({ data: serializeProduct(doc), error: null });
});
assetsRouter.get('/products/:customerId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const customerId = String(req.params.customerId);
    const filter = { customerId };
    if (typeof req.query.environmentId === 'string' && req.query.environmentId) {
        filter.environmentId = req.query.environmentId;
    }
    if (typeof req.query.status === 'string' && req.query.status) {
        filter.status = req.query.status;
    }
    if (typeof req.query.productType === 'string' && req.query.productType) {
        filter.productType = req.query.productType;
    }
    const items = await db
        .collection('assets_products')
        .find(filter)
        .sort({ productName: 1 })
        .toArray();
    res.json({ data: { items: items.map(serializeProduct) }, error: null });
});
assetsRouter.get('/products/environment/:environmentId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const environmentId = String(req.params.environmentId);
    const items = await db
        .collection('assets_products')
        .find({ environmentId })
        .sort({ productName: 1 })
        .toArray();
    res.json({ data: { items: items.map(serializeProduct) }, error: null });
});
assetsRouter.put('/products/:productId', async (req, res) => {
    const parsed = installedProductUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const id = String(req.params.productId);
    const update = { updatedAt: new Date() };
    if (parsed.data.customerId !== undefined)
        update.customerId = parsed.data.customerId;
    if (parsed.data.environmentId !== undefined)
        update.environmentId = parsed.data.environmentId;
    if (parsed.data.productName !== undefined)
        update.productName = parsed.data.productName;
    if (parsed.data.productType !== undefined)
        update.productType = parsed.data.productType;
    if (parsed.data.vendor !== undefined)
        update.vendor = parsed.data.vendor;
    if (parsed.data.version !== undefined)
        update.version = parsed.data.version;
    if (parsed.data.serialNumber !== undefined)
        update.serialNumber = parsed.data.serialNumber;
    if (parsed.data.configuration !== undefined)
        update.configuration = parsed.data.configuration;
    if (parsed.data.status !== undefined)
        update.status = parsed.data.status;
    if (parsed.data.supportLevel !== undefined)
        update.supportLevel = parsed.data.supportLevel;
    if (parsed.data.deploymentDate !== undefined) {
        update.deploymentDate = parsed.data.deploymentDate ? new Date(parsed.data.deploymentDate) : null;
    }
    const coll = db.collection('assets_products');
    const existing = await coll.findOne({ _id: id });
    if (!existing)
        return res.status(404).json({ data: null, error: 'not_found' });
    await coll.updateOne({ _id: id }, { $set: update });
    const updated = await coll.findOne({ _id: id });
    res.json({ data: serializeProduct(updated), error: null });
});
assetsRouter.delete('/products/:productId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const id = String(req.params.productId);
    const result = await db.collection('assets_products').deleteOne({ _id: id });
    if (!result.deletedCount) {
        return res.status(404).json({ data: null, error: 'not_found' });
    }
    res.json({ data: { ok: true }, error: null });
});
// Licenses
assetsRouter.post('/licenses', async (req, res) => {
    const parsed = licenseSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const now = new Date();
    const _id = new ObjectId().toHexString();
    const expirationDate = parsed.data.expirationDate ? new Date(parsed.data.expirationDate) : null;
    if (parsed.data.seatsAssigned && parsed.data.seatsAssigned > parsed.data.licenseCount) {
        return res.status(400).json({ data: null, error: 'seats_exceed_license_count' });
    }
    const doc = {
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
    };
    await db.collection('assets_licenses').insertOne(doc);
    res.status(201).json({ data: serializeLicense(doc), error: null });
});
assetsRouter.get('/licenses/product/:productId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const productId = String(req.params.productId);
    const items = await db
        .collection('assets_licenses')
        .find({ productId })
        .sort({ expirationDate: 1 })
        .toArray();
    res.json({ data: { items: items.map(serializeLicense) }, error: null });
});
assetsRouter.put('/licenses/:licenseId', async (req, res) => {
    const parsed = licenseUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const id = String(req.params.licenseId);
    const update = { updatedAt: new Date() };
    if (parsed.data.productId !== undefined)
        update.productId = parsed.data.productId;
    if (parsed.data.licenseType !== undefined)
        update.licenseType = parsed.data.licenseType;
    if (parsed.data.licenseKey !== undefined)
        update.licenseKey = parsed.data.licenseKey;
    if (parsed.data.licenseIdentifier !== undefined)
        update.licenseIdentifier = parsed.data.licenseIdentifier;
    if (parsed.data.licenseCount !== undefined)
        update.licenseCount = parsed.data.licenseCount;
    if (parsed.data.seatsAssigned !== undefined)
        update.seatsAssigned = parsed.data.seatsAssigned;
    if (parsed.data.expirationDate !== undefined) {
        update.expirationDate = parsed.data.expirationDate ? new Date(parsed.data.expirationDate) : null;
    }
    if (parsed.data.renewalStatus !== undefined)
        update.renewalStatus = parsed.data.renewalStatus;
    if (parsed.data.cost !== undefined)
        update.cost = parsed.data.cost;
    if (parsed.data.assignedUsers !== undefined)
        update.assignedUsers = parsed.data.assignedUsers;
    const coll = db.collection('assets_licenses');
    const existing = await coll.findOne({ _id: id });
    if (!existing)
        return res.status(404).json({ data: null, error: 'not_found' });
    const nextSeats = update.seatsAssigned !== undefined ? update.seatsAssigned : existing.seatsAssigned ?? 0;
    const nextCount = update.licenseCount !== undefined ? update.licenseCount : existing.licenseCount ?? 0;
    if (nextSeats > nextCount && nextCount > 0) {
        return res.status(400).json({ data: null, error: 'seats_exceed_license_count' });
    }
    await coll.updateOne({ _id: id }, { $set: update });
    const updated = await coll.findOne({ _id: id });
    res.json({ data: serializeLicense(updated), error: null });
});
assetsRouter.delete('/licenses/:licenseId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const id = String(req.params.licenseId);
    const result = await db.collection('assets_licenses').deleteOne({ _id: id });
    if (!result.deletedCount) {
        return res.status(404).json({ data: null, error: 'not_found' });
    }
    res.json({ data: { ok: true }, error: null });
});
// Summary per customer
assetsRouter.get('/summary/:customerId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const customerId = String(req.params.customerId);
    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const envColl = db.collection('assets_environments');
    const prodColl = db.collection('assets_products');
    const licColl = db.collection('assets_licenses');
    const [environments, products] = await Promise.all([
        envColl.find({ customerId }).toArray(),
        prodColl.find({ customerId }).toArray(),
    ]);
    const productIds = products.map((p) => p._id);
    const licenses = productIds.length
        ? await licColl.find({ productId: { $in: productIds } }).toArray()
        : [];
    const upcomingRenewals = licenses.filter((l) => l.expirationDate && l.expirationDate >= now && l.expirationDate <= in90Days);
    const licenseAllocation = productIds.map((pid) => {
        const productLicenses = licenses.filter((l) => l.productId === pid);
        const total = productLicenses.reduce((sum, l) => sum + (l.licenseCount || 0), 0);
        const assigned = productLicenses.reduce((sum, l) => sum + (l.seatsAssigned || 0), 0);
        return {
            productId: pid,
            licenseCount: total,
            seatsAssigned: assigned,
            overAllocated: assigned > total && total > 0,
        };
    });
    const productHealth = {
        Active: products.filter((p) => p.status === 'Active').length,
        NeedsUpgrade: products.filter((p) => p.status === 'Needs Upgrade').length,
        PendingRenewal: products.filter((p) => p.status === 'Pending Renewal').length,
        Retired: products.filter((p) => p.status === 'Retired').length,
    };
    res.json({
        data: {
            totalEnvironments: environments.length,
            totalProducts: products.length,
            upcomingRenewals: upcomingRenewals.map(serializeLicense),
            licenseAllocation,
            productHealth,
        },
        error: null,
    });
});
