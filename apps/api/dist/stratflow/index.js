import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../db.js';
import { requireAuth, requireApplication } from '../auth/rbac.js';
export const stratflowRouter = Router();
stratflowRouter.use(requireAuth);
stratflowRouter.use(requireApplication('stratflow'));
function normStr(v) {
    return typeof v === 'string' ? v.trim() : '';
}
function keyify(input) {
    return input
        .toUpperCase()
        .trim()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 12);
}
const projectCreateSchema = z.object({
    name: z.string().min(2).max(140),
    key: z.string().min(2).max(12),
    description: z.string().max(4000).optional().nullable(),
    type: z.enum(['SCRUM', 'KANBAN', 'TRADITIONAL', 'HYBRID']),
    status: z.enum(['Active', 'On Hold', 'Completed', 'Archived']).optional(),
    teamIds: z.array(z.string().min(6)).max(50).optional(),
    clientId: z.string().optional().nullable(),
    startDate: z.string().optional().nullable(),
    targetEndDate: z.string().optional().nullable(),
});
// GET /api/stratflow/projects
stratflowRouter.get('/projects', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const items = await db
        .collection('sf_projects')
        .find({ ownerId: auth.userId })
        .sort({ updatedAt: -1 })
        .limit(200)
        .toArray();
    res.json({
        data: {
            items: items.map((d) => ({
                ...d,
                _id: String(d._id),
                startDate: d.startDate?.toISOString?.() ?? null,
                targetEndDate: d.targetEndDate?.toISOString?.() ?? null,
                createdAt: d.createdAt?.toISOString?.() ?? null,
                updatedAt: d.updatedAt?.toISOString?.() ?? null,
            })),
        },
        error: null,
    });
});
// POST /api/stratflow/projects
stratflowRouter.post('/projects', async (req, res) => {
    const parsed = projectCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const now = new Date();
    const key = keyify(parsed.data.key);
    if (!key)
        return res.status(400).json({ data: null, error: 'invalid_key' });
    const existing = await db.collection('sf_projects').findOne({ ownerId: auth.userId, key });
    if (existing)
        return res.status(409).json({ data: null, error: 'key_taken' });
    const teamIds = Array.from(new Set((parsed.data.teamIds || [])
        .map((x) => normStr(x))
        .filter((x) => ObjectId.isValid(x)))).slice(0, 50);
    const doc = {
        _id: new ObjectId(),
        name: parsed.data.name.trim(),
        key,
        description: parsed.data.description ? String(parsed.data.description).trim() : null,
        type: parsed.data.type,
        status: parsed.data.status ?? 'Active',
        ownerId: auth.userId,
        teamIds,
        clientId: parsed.data.clientId ? String(parsed.data.clientId).trim() : null,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
        targetEndDate: parsed.data.targetEndDate ? new Date(parsed.data.targetEndDate) : null,
        createdAt: now,
        updatedAt: now,
    };
    await db.collection('sf_projects').insertOne(doc);
    res.status(201).json({ data: { _id: String(doc._id) }, error: null });
});
