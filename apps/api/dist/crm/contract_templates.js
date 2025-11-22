import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/rbac.js';
export const contractTemplatesRouter = Router();
contractTemplatesRouter.use(requireAuth);
const createTemplateSchema = z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    htmlBody: z.string().min(1),
});
const updateTemplateSchema = createTemplateSchema.partial();
function serializeTemplate(doc) {
    return {
        ...doc,
        _id: String(doc._id),
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
    };
}
// GET /api/crm/contract-templates?q=
contractTemplatesRouter.get('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const q = String(req.query.q ?? '').trim();
    const filter = {};
    if (q) {
        filter.$or = [
            { name: { $regex: q, $options: 'i' } },
            { key: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
        ];
    }
    const items = await db
        .collection('contract_templates')
        .find(filter)
        .sort({ updatedAt: -1 })
        .limit(200)
        .toArray();
    res.json({ data: { items: items.map(serializeTemplate) }, error: null });
});
// GET /api/crm/contract-templates/:id
contractTemplatesRouter.get('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const { id } = req.params;
    if (!ObjectId.isValid(id))
        return res.status(400).json({ data: null, error: 'invalid_id' });
    const doc = await db
        .collection('contract_templates')
        .findOne({ _id: new ObjectId(id) });
    if (!doc)
        return res.status(404).json({ data: null, error: 'not_found' });
    res.json({ data: serializeTemplate(doc), error: null });
});
// POST /api/crm/contract-templates
contractTemplatesRouter.post('/', async (req, res) => {
    const parsed = createTemplateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const body = parsed.data;
    const now = new Date();
    const existing = await db.collection('contract_templates').findOne({ key: body.key });
    if (existing) {
        return res.status(409).json({ data: null, error: 'duplicate_key' });
    }
    const doc = {
        _id: new ObjectId(),
        key: body.key,
        name: body.name,
        description: body.description,
        htmlBody: body.htmlBody,
        createdAt: now,
        updatedAt: now,
    };
    await db.collection('contract_templates').insertOne(doc);
    res.status(201).json({ data: serializeTemplate(doc), error: null });
});
// PUT /api/crm/contract-templates/:id
contractTemplatesRouter.put('/:id', async (req, res) => {
    const parsed = updateTemplateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const { id } = req.params;
    if (!ObjectId.isValid(id))
        return res.status(400).json({ data: null, error: 'invalid_id' });
    const body = parsed.data;
    const update = {};
    if (body.key !== undefined)
        update.key = body.key;
    if (body.name !== undefined)
        update.name = body.name;
    if (body.description !== undefined)
        update.description = body.description;
    if (body.htmlBody !== undefined)
        update.htmlBody = body.htmlBody;
    update.updatedAt = new Date();
    const coll = db.collection('contract_templates');
    const existing = await coll.findOne({ _id: new ObjectId(id) });
    if (!existing)
        return res.status(404).json({ data: null, error: 'not_found' });
    await coll.updateOne({ _id: existing._id }, { $set: update });
    const updated = await coll.findOne({ _id: existing._id });
    if (!updated)
        return res.status(500).json({ data: null, error: 'update_failed' });
    res.json({ data: serializeTemplate(updated), error: null });
});
// DELETE /api/crm/contract-templates/:id
contractTemplatesRouter.delete('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const { id } = req.params;
    if (!ObjectId.isValid(id))
        return res.status(400).json({ data: null, error: 'invalid_id' });
    const result = await db
        .collection('contract_templates')
        .deleteOne({ _id: new ObjectId(id) });
    if (!result.deletedCount) {
        return res.status(404).json({ data: null, error: 'not_found' });
    }
    res.json({ data: { ok: true }, error: null });
});
