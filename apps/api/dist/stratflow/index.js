import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../db.js';
import { requireAuth, requireApplication, requirePermission } from '../auth/rbac.js';
export const stratflowRouter = Router();
stratflowRouter.use(requireAuth);
stratflowRouter.use(requireApplication('stratflow'));
function normStr(v) {
    return typeof v === 'string' ? v.trim() : '';
}
function normStrArray(input, max) {
    const arr = Array.isArray(input) ? input : [];
    const cleaned = arr
        .map((x) => normStr(x))
        .filter(Boolean)
        .map((x) => x.slice(0, 80));
    return Array.from(new Set(cleaned)).slice(0, max);
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
function objIdOrNull(id) {
    try {
        if (!ObjectId.isValid(id))
            return null;
        return new ObjectId(id);
    }
    catch {
        return null;
    }
}
function normIssueType(input) {
    const raw = String(input || '').trim();
    if (!raw)
        return 'Task';
    // Back-compat: Bug -> Defect
    if (raw === 'Bug')
        return 'Defect';
    if (raw === 'Epic' || raw === 'Story' || raw === 'Task' || raw === 'Defect' || raw === 'Spike')
        return raw;
    return 'Task';
}
function normPriority(input) {
    const raw = String(input || '').trim();
    if (!raw)
        return 'Medium';
    // Back-compat: Critical -> Highest
    if (raw === 'Critical')
        return 'Highest';
    if (raw === 'Highest' || raw === 'High' || raw === 'Medium' || raw === 'Low')
        return raw;
    // Back-compat: old enum values
    if (raw === 'High')
        return 'High';
    if (raw === 'Medium')
        return 'Medium';
    if (raw === 'Low')
        return 'Low';
    return 'Medium';
}
function statusKeyFromColumnName(name) {
    const n = String(name || '').trim().toLowerCase();
    if (n.includes('backlog'))
        return 'backlog';
    if (n.includes('review'))
        return 'in_review';
    if (n.includes('doing') || n.includes('progress') || n.includes('in progress'))
        return 'in_progress';
    if (n.includes('done') || n.includes('complete'))
        return 'done';
    if (n.includes('to do') || n === 'todo' || n.includes('not started'))
        return 'todo';
    return 'todo';
}
async function ensureStratflowIndexes(db) {
    // Best-effort; ignore errors
    try {
        await db.collection('sf_issues').createIndex({ projectId: 1 }).catch(() => { });
        await db.collection('sf_issues').createIndex({ boardId: 1, columnId: 1, order: 1 }).catch(() => { });
        await db.collection('sf_issues').createIndex({ sprintId: 1 }).catch(() => { });
        await db.collection('sf_issues').createIndex({ epicId: 1 }).catch(() => { });
        await db.collection('sf_sprints').createIndex({ projectId: 1, state: 1 }).catch(() => { });
        await db.collection('sf_issue_comments').createIndex({ issueId: 1, createdAt: 1 }).catch(() => { });
        await db.collection('sf_components').createIndex({ projectId: 1, nameLower: 1 }, { unique: true }).catch(() => { });
    }
    catch {
        // noop
    }
}
function projectMemberIds(project) {
    const ids = [];
    if (project?.ownerId)
        ids.push(String(project.ownerId));
    if (Array.isArray(project?.teamIds)) {
        for (const x of project.teamIds) {
            const s = String(x || '').trim();
            if (s)
                ids.push(s);
        }
    }
    return Array.from(new Set(ids));
}
async function loadUsersByIds(db, userIds) {
    const valid = userIds.filter((id) => ObjectId.isValid(id));
    const oids = valid.map((id) => new ObjectId(id));
    const users = await db.collection('users').find({ _id: { $in: oids } }).project({ _id: 1, email: 1, name: 1 }).toArray();
    const map = new Map(users.map((u) => [String(u._id), { id: String(u._id), email: u.email || '', name: u.name || '' }]));
    return valid.map((id) => map.get(id)).filter(Boolean);
}
async function validateComponentsExist(db, projectId, components) {
    const names = Array.from(new Set((components || []).map((x) => String(x || '').trim()).filter(Boolean)));
    if (!names.length)
        return true;
    const lowers = names.map((n) => n.toLowerCase());
    const rows = await db.collection('sf_components').find({ projectId, nameLower: { $in: lowers } }).project({ nameLower: 1 }).toArray();
    const ok = new Set(rows.map((r) => String(r.nameLower)));
    return lowers.every((l) => ok.has(l));
}
function canAccessProject(authUserId, project) {
    if (project.ownerId === authUserId)
        return true;
    return Array.isArray(project.teamIds) && project.teamIds.includes(authUserId);
}
async function loadProjectForUser(db, projectId, authUserId) {
    const project = await db.collection('sf_projects').findOne({ _id: projectId });
    if (!project)
        return null;
    if (!canAccessProject(authUserId, project))
        return 'forbidden';
    return project;
}
async function createTemplateForProject(db, projectId, type, now) {
    const boards = [];
    const mkBoard = (name, kind) => ({
        _id: new ObjectId(),
        projectId,
        name,
        kind,
        createdAt: now,
        updatedAt: now,
    });
    const mkColumns = (boardId, names) => names.map((name, idx) => ({
        _id: new ObjectId(),
        boardId,
        name,
        order: (idx + 1) * 1000,
        createdAt: now,
        updatedAt: now,
    }));
    if (type === 'SCRUM') {
        const backlog = mkBoard('Backlog', 'BACKLOG');
        const backlogCols = mkColumns(backlog._id, ['Backlog']);
        boards.push({ board: backlog, columns: backlogCols });
        const sprint = mkBoard('Sprint Board', 'KANBAN');
        const sprintCols = mkColumns(sprint._id, ['To Do', 'In Progress', 'In Review', 'Done']);
        boards.push({ board: sprint, columns: sprintCols });
    }
    else if (type === 'TRADITIONAL') {
        const board = mkBoard('Milestones', 'MILESTONES');
        const cols = mkColumns(board._id, ['Not Started', 'In Progress', 'Blocked', 'Complete']);
        boards.push({ board, columns: cols });
    }
    else if (type === 'HYBRID') {
        const board = mkBoard('Board', 'KANBAN');
        const cols = mkColumns(board._id, ['To Do', 'In Progress', 'In Review', 'Done']);
        boards.push({ board, columns: cols });
        const backlog = mkBoard('Backlog', 'BACKLOG');
        const backlogCols = mkColumns(backlog._id, ['Backlog']);
        boards.push({ board: backlog, columns: backlogCols });
    }
    else {
        // KANBAN
        const board = mkBoard('Board', 'KANBAN');
        const cols = mkColumns(board._id, ['To Do', 'In Progress', 'In Review', 'Done']);
        boards.push({ board, columns: cols });
    }
    if (!boards.length)
        return { defaultBoardId: null };
    await db.collection('sf_boards').insertMany(boards.map((b) => b.board));
    await db.collection('sf_columns').insertMany(boards.flatMap((b) => b.columns));
    // Default board: prefer a KANBAN board if present, else first board
    const defaultBoard = boards.find((b) => b.board.kind === 'KANBAN')?.board ?? boards[0].board;
    return { defaultBoardId: String(defaultBoard._id) };
}
function toIsoOrNull(d) {
    return d?.toISOString?.() ?? null;
}
// GET /api/stratflow/projects
stratflowRouter.get('/projects', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const items = await db
        .collection('sf_projects')
        .find({ $or: [{ ownerId: auth.userId }, { teamIds: auth.userId }] })
        .sort({ updatedAt: -1 })
        .limit(200)
        .toArray();
    res.json({
        data: {
            items: items.map((d) => ({
                ...d,
                _id: String(d._id),
                startDate: toIsoOrNull(d.startDate),
                targetEndDate: toIsoOrNull(d.targetEndDate),
                createdAt: toIsoOrNull(d.createdAt),
                updatedAt: toIsoOrNull(d.updatedAt),
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
    // Create default workflow/board setup based on template type
    const tpl = await createTemplateForProject(db, doc._id, doc.type, now);
    res.status(201).json({ data: { _id: String(doc._id), defaultBoardId: tpl.defaultBoardId }, error: null });
});
// GET /api/stratflow/projects/:projectId
stratflowRouter.get('/projects/:projectId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const pid = objIdOrNull(String(req.params.projectId || ''));
    if (!pid)
        return res.status(400).json({ data: null, error: 'invalid_project_id' });
    const project = await loadProjectForUser(db, pid, auth.userId);
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    res.json({
        data: {
            ...project,
            _id: String(project._id),
            startDate: toIsoOrNull(project.startDate),
            targetEndDate: toIsoOrNull(project.targetEndDate),
            createdAt: toIsoOrNull(project.createdAt),
            updatedAt: toIsoOrNull(project.updatedAt),
        },
        error: null,
    });
});
// GET /api/stratflow/projects/:projectId/boards
stratflowRouter.get('/projects/:projectId/boards', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const pid = objIdOrNull(String(req.params.projectId || ''));
    if (!pid)
        return res.status(400).json({ data: null, error: 'invalid_project_id' });
    const project = await loadProjectForUser(db, pid, auth.userId);
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    const boards = await db.collection('sf_boards').find({ projectId: pid }).sort({ createdAt: 1 }).toArray();
    res.json({
        data: {
            items: boards.map((b) => ({
                ...b,
                _id: String(b._id),
                projectId: String(b.projectId),
                createdAt: toIsoOrNull(b.createdAt),
                updatedAt: toIsoOrNull(b.updatedAt),
            })),
        },
        error: null,
    });
});
// GET /api/stratflow/boards/:boardId
stratflowRouter.get('/boards/:boardId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const bid = objIdOrNull(String(req.params.boardId || ''));
    if (!bid)
        return res.status(400).json({ data: null, error: 'invalid_board_id' });
    const board = await db.collection('sf_boards').findOne({ _id: bid });
    if (!board)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, board.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const cols = await db.collection('sf_columns').find({ boardId: bid }).sort({ order: 1 }).toArray();
    res.json({
        data: {
            board: {
                ...board,
                _id: String(board._id),
                projectId: String(board.projectId),
                createdAt: toIsoOrNull(board.createdAt),
                updatedAt: toIsoOrNull(board.updatedAt),
            },
            columns: cols.map((c) => ({
                ...c,
                _id: String(c._id),
                boardId: String(c.boardId),
                createdAt: toIsoOrNull(c.createdAt),
                updatedAt: toIsoOrNull(c.updatedAt),
            })),
        },
        error: null,
    });
});
// GET /api/stratflow/boards/:boardId/issues
stratflowRouter.get('/boards/:boardId/issues', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const bid = objIdOrNull(String(req.params.boardId || ''));
    if (!bid)
        return res.status(400).json({ data: null, error: 'invalid_board_id' });
    const board = await db.collection('sf_boards').findOne({ _id: bid });
    if (!board)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, board.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const items = await db
        .collection('sf_issues')
        .find({ boardId: bid })
        .sort({ columnId: 1, order: 1 })
        .limit(2000)
        .toArray();
    res.json({
        data: {
            items: items.map((d) => ({
                ...d,
                _id: String(d._id),
                projectId: String(d.projectId),
                boardId: String(d.boardId),
                columnId: String(d.columnId),
                sprintId: d.sprintId ? String(d.sprintId) : null,
                epicId: d.epicId ? String(d.epicId) : null,
                // normalize back-compat values without rewriting DB
                type: normIssueType(d.type),
                priority: normPriority(d.priority),
                createdAt: toIsoOrNull(d.createdAt),
                updatedAt: toIsoOrNull(d.updatedAt),
            })),
        },
        error: null,
    });
});
const issueCreateSchema = z.object({
    title: z.string().min(1).max(280),
    columnId: z.string().min(6),
    description: z.string().max(4000).optional().nullable(),
    type: z.string().optional(),
    priority: z.string().optional(),
    assigneeId: z.string().optional().nullable(),
    acceptanceCriteria: z.string().max(8000).optional().nullable(),
    storyPoints: z.number().min(0).max(200).optional().nullable(),
    sprintId: z.string().optional().nullable(),
    epicId: z.string().optional().nullable(),
    labels: z.array(z.string()).optional(),
    components: z.array(z.string()).optional(),
});
// POST /api/stratflow/boards/:boardId/issues
stratflowRouter.post('/boards/:boardId/issues', async (req, res) => {
    const parsed = issueCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const bid = objIdOrNull(String(req.params.boardId || ''));
    if (!bid)
        return res.status(400).json({ data: null, error: 'invalid_board_id' });
    const board = await db.collection('sf_boards').findOne({ _id: bid });
    if (!board)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, board.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const colId = objIdOrNull(parsed.data.columnId);
    if (!colId)
        return res.status(400).json({ data: null, error: 'invalid_column_id' });
    const col = await db.collection('sf_columns').findOne({ _id: colId, boardId: bid });
    if (!col)
        return res.status(404).json({ data: null, error: 'column_not_found' });
    const now = new Date();
    const last = await db
        .collection('sf_issues')
        .find({ boardId: bid, columnId: colId })
        .sort({ order: -1 })
        .limit(1)
        .toArray();
    const lastOrder = last?.[0]?.order ?? 0;
    const doc = {
        _id: new ObjectId(),
        projectId: board.projectId,
        boardId: bid,
        columnId: colId,
        title: parsed.data.title.trim(),
        description: parsed.data.description ? String(parsed.data.description).trim() : null,
        type: normIssueType(parsed.data.type),
        statusKey: statusKeyFromColumnName(String(col.name || '')),
        priority: normPriority(parsed.data.priority),
        acceptanceCriteria: parsed.data.acceptanceCriteria ? String(parsed.data.acceptanceCriteria).trim() : null,
        storyPoints: parsed.data.storyPoints ?? null,
        sprintId: parsed.data.sprintId ? objIdOrNull(parsed.data.sprintId) : null,
        epicId: parsed.data.epicId ? objIdOrNull(parsed.data.epicId) : null,
        labels: normStrArray(parsed.data.labels, 50),
        components: normStrArray(parsed.data.components, 50),
        links: [],
        attachments: [],
        order: (Number(lastOrder) || 0) + 1000,
        reporterId: auth.userId,
        assigneeId: parsed.data.assigneeId ? String(parsed.data.assigneeId).trim() : null,
        createdAt: now,
        updatedAt: now,
    };
    if (doc.assigneeId) {
        const allowed = projectMemberIds(project);
        if (!allowed.includes(doc.assigneeId))
            return res.status(400).json({ data: null, error: 'invalid_assignee' });
    }
    // Validate references are within project scope (best-effort)
    if (doc.sprintId) {
        const sp = await db.collection('sf_sprints').findOne({ _id: doc.sprintId, projectId: board.projectId });
        if (!sp)
            return res.status(400).json({ data: null, error: 'invalid_sprint' });
    }
    if (doc.epicId) {
        const epic = await db.collection('sf_issues').findOne({ _id: doc.epicId, projectId: board.projectId });
        if (!epic || normIssueType(epic.type) !== 'Epic')
            return res.status(400).json({ data: null, error: 'invalid_epic' });
    }
    if (doc.components?.length) {
        const ok = await validateComponentsExist(db, board.projectId, doc.components);
        if (!ok)
            return res.status(400).json({ data: null, error: 'invalid_components' });
    }
    await db.collection('sf_issues').insertOne(doc);
    res.status(201).json({ data: { _id: String(doc._id) }, error: null });
});
const issueMoveSchema = z.object({
    toColumnId: z.string().min(6),
    toIndex: z.number().int().min(0).max(100000),
});
const sprintCreateSchema = z.object({
    name: z.string().min(2).max(140),
    goal: z.string().max(2000).optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
});
const sprintUpdateSchema = z.object({
    name: z.string().min(2).max(140).optional(),
    goal: z.string().max(2000).optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    state: z.enum(['planned', 'active', 'closed']).optional(),
});
async function reindexColumnIssues(db, boardId, columnId, now) {
    const all = await db.collection('sf_issues').find({ boardId, columnId }).sort({ order: 1 }).toArray();
    const bulk = db.collection('sf_issues').initializeUnorderedBulkOp();
    all.forEach((it, idx) => {
        bulk.find({ _id: it._id }).updateOne({ $set: { order: (idx + 1) * 1000, updatedAt: now } });
    });
    if (all.length)
        await bulk.execute();
    return all.length;
}
async function computeOrderForMove(db, boardId, columnId, toIndex, now) {
    const items = await db.collection('sf_issues').find({ boardId, columnId }).sort({ order: 1 }).toArray();
    const before = items[toIndex - 1]?.order ?? null;
    const after = items[toIndex]?.order ?? null;
    if (before == null && after == null)
        return 1000;
    if (before == null && after != null)
        return Number(after) - 1000;
    if (before != null && after == null)
        return Number(before) + 1000;
    const b = Number(before);
    const a = Number(after);
    if (Number.isFinite(b) && Number.isFinite(a) && a - b > 1)
        return (a + b) / 2;
    await reindexColumnIssues(db, boardId, columnId, now);
    const items2 = await db.collection('sf_issues').find({ boardId, columnId }).sort({ order: 1 }).toArray();
    const before2 = items2[toIndex - 1]?.order ?? null;
    const after2 = items2[toIndex]?.order ?? null;
    if (before2 == null && after2 == null)
        return 1000;
    if (before2 == null && after2 != null)
        return Number(after2) - 1000;
    if (before2 != null && after2 == null)
        return Number(before2) + 1000;
    return (Number(before2) + Number(after2)) / 2;
}
// PATCH /api/stratflow/issues/:issueId/move
stratflowRouter.patch('/issues/:issueId/move', async (req, res) => {
    const parsed = issueMoveSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const iid = objIdOrNull(String(req.params.issueId || ''));
    if (!iid)
        return res.status(400).json({ data: null, error: 'invalid_issue_id' });
    const issue = await db.collection('sf_issues').findOne({ _id: iid });
    if (!issue)
        return res.status(404).json({ data: null, error: 'not_found' });
    const board = await db.collection('sf_boards').findOne({ _id: issue.boardId });
    if (!board)
        return res.status(404).json({ data: null, error: 'board_not_found' });
    const project = await loadProjectForUser(db, board.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const toCol = objIdOrNull(parsed.data.toColumnId);
    if (!toCol)
        return res.status(400).json({ data: null, error: 'invalid_column_id' });
    const col = await db.collection('sf_columns').findOne({ _id: toCol, boardId: issue.boardId });
    if (!col)
        return res.status(404).json({ data: null, error: 'column_not_found' });
    const now = new Date();
    // if moving across columns, compute order in dest column (excluding the moving issue)
    // easiest: temporarily remove issue from dest query by excluding _id
    const destItems = await db
        .collection('sf_issues')
        .find({ boardId: issue.boardId, columnId: toCol, _id: { $ne: iid } })
        .sort({ order: 1 })
        .toArray();
    const before = destItems[parsed.data.toIndex - 1]?.order ?? null;
    const after = destItems[parsed.data.toIndex]?.order ?? null;
    let newOrder;
    if (before == null && after == null)
        newOrder = 1000;
    else if (before == null && after != null)
        newOrder = Number(after) - 1000;
    else if (before != null && after == null)
        newOrder = Number(before) + 1000;
    else {
        const b = Number(before);
        const a = Number(after);
        newOrder = a - b > 1 ? (a + b) / 2 : NaN;
        if (!Number.isFinite(newOrder)) {
            // Reindex dest column then recompute
            await reindexColumnIssues(db, issue.boardId, toCol, now);
            const destItems2 = await db
                .collection('sf_issues')
                .find({ boardId: issue.boardId, columnId: toCol, _id: { $ne: iid } })
                .sort({ order: 1 })
                .toArray();
            const before2 = destItems2[parsed.data.toIndex - 1]?.order ?? null;
            const after2 = destItems2[parsed.data.toIndex]?.order ?? null;
            if (before2 == null && after2 == null)
                newOrder = 1000;
            else if (before2 == null && after2 != null)
                newOrder = Number(after2) - 1000;
            else if (before2 != null && after2 == null)
                newOrder = Number(before2) + 1000;
            else
                newOrder = (Number(before2) + Number(after2)) / 2;
        }
    }
    await db.collection('sf_issues').updateOne({ _id: iid }, {
        $set: {
            columnId: toCol,
            order: newOrder,
            statusKey: statusKeyFromColumnName(String(col.name || '')),
            updatedAt: now,
        },
    });
    res.json({ data: { ok: true }, error: null });
});
// GET /api/stratflow/projects/:projectId/sprints
stratflowRouter.get('/projects/:projectId/sprints', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const pid = objIdOrNull(String(req.params.projectId || ''));
    if (!pid)
        return res.status(400).json({ data: null, error: 'invalid_project_id' });
    const project = await loadProjectForUser(db, pid, auth.userId);
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    const items = await db.collection('sf_sprints').find({ projectId: pid }).sort({ createdAt: -1 }).toArray();
    res.json({
        data: {
            items: items.map((d) => ({
                ...d,
                _id: String(d._id),
                projectId: String(d.projectId),
                startDate: toIsoOrNull(d.startDate),
                endDate: toIsoOrNull(d.endDate),
                createdAt: toIsoOrNull(d.createdAt),
                updatedAt: toIsoOrNull(d.updatedAt),
            })),
        },
        error: null,
    });
});
// POST /api/stratflow/projects/:projectId/sprints
stratflowRouter.post('/projects/:projectId/sprints', async (req, res) => {
    const parsed = sprintCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const pid = objIdOrNull(String(req.params.projectId || ''));
    if (!pid)
        return res.status(400).json({ data: null, error: 'invalid_project_id' });
    const project = await loadProjectForUser(db, pid, auth.userId);
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    const now = new Date();
    const doc = {
        _id: new ObjectId(),
        projectId: pid,
        name: parsed.data.name.trim(),
        goal: parsed.data.goal ? String(parsed.data.goal).trim() : null,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        state: 'planned',
        createdAt: now,
        updatedAt: now,
    };
    await db.collection('sf_sprints').insertOne(doc);
    res.status(201).json({ data: { _id: String(doc._id) }, error: null });
});
// PATCH /api/stratflow/sprints/:sprintId
stratflowRouter.patch('/sprints/:sprintId', async (req, res) => {
    const parsed = sprintUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const sid = objIdOrNull(String(req.params.sprintId || ''));
    if (!sid)
        return res.status(400).json({ data: null, error: 'invalid_sprint_id' });
    const sprint = await db.collection('sf_sprints').findOne({ _id: sid });
    if (!sprint)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, sprint.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const update = { updatedAt: new Date() };
    if (parsed.data.name !== undefined)
        update.name = parsed.data.name.trim();
    if (parsed.data.goal !== undefined)
        update.goal = parsed.data.goal ? String(parsed.data.goal).trim() : null;
    if (parsed.data.startDate !== undefined)
        update.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
    if (parsed.data.endDate !== undefined)
        update.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;
    if (parsed.data.state !== undefined)
        update.state = parsed.data.state;
    await db.collection('sf_sprints').updateOne({ _id: sid }, { $set: update });
    res.json({ data: { ok: true }, error: null });
});
// POST /api/stratflow/sprints/:sprintId/set-active
stratflowRouter.post('/sprints/:sprintId/set-active', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const sid = objIdOrNull(String(req.params.sprintId || ''));
    if (!sid)
        return res.status(400).json({ data: null, error: 'invalid_sprint_id' });
    const sprint = await db.collection('sf_sprints').findOne({ _id: sid });
    if (!sprint)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, sprint.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const now = new Date();
    // Enforce only one active sprint per project
    await db.collection('sf_sprints').updateMany({ projectId: sprint.projectId, state: 'active' }, { $set: { state: 'planned', updatedAt: now } });
    await db.collection('sf_sprints').updateOne({ _id: sid }, { $set: { state: 'active', updatedAt: now } });
    res.json({ data: { ok: true }, error: null });
});
const issueUpdateSchema = z.object({
    title: z.string().min(1).max(280).optional(),
    description: z.string().max(4000).optional().nullable(),
    type: z.string().optional(),
    priority: z.string().optional(),
    acceptanceCriteria: z.string().max(8000).optional().nullable(),
    storyPoints: z.number().min(0).max(200).optional().nullable(),
    assigneeId: z.string().optional().nullable(),
    sprintId: z.string().optional().nullable(),
    epicId: z.string().optional().nullable(),
    labels: z.array(z.string()).optional(),
    components: z.array(z.string()).optional(),
});
// GET /api/stratflow/issues/:issueId
stratflowRouter.get('/issues/:issueId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const iid = objIdOrNull(String(req.params.issueId || ''));
    if (!iid)
        return res.status(400).json({ data: null, error: 'invalid_issue_id' });
    const issue = await db.collection('sf_issues').findOne({ _id: iid });
    if (!issue)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, issue.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    res.json({
        data: {
            ...issue,
            _id: String(issue._id),
            projectId: String(issue.projectId),
            boardId: String(issue.boardId),
            columnId: String(issue.columnId),
            sprintId: issue.sprintId ? String(issue.sprintId) : null,
            epicId: issue.epicId ? String(issue.epicId) : null,
            type: normIssueType(issue.type),
            priority: normPriority(issue.priority),
            createdAt: toIsoOrNull(issue.createdAt),
            updatedAt: toIsoOrNull(issue.updatedAt),
        },
        error: null,
    });
});
// PATCH /api/stratflow/issues/:issueId
stratflowRouter.patch('/issues/:issueId', async (req, res) => {
    const parsed = issueUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const iid = objIdOrNull(String(req.params.issueId || ''));
    if (!iid)
        return res.status(400).json({ data: null, error: 'invalid_issue_id' });
    const issue = await db.collection('sf_issues').findOne({ _id: iid });
    if (!issue)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, issue.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const update = { updatedAt: new Date() };
    if (parsed.data.title !== undefined)
        update.title = parsed.data.title.trim();
    if (parsed.data.description !== undefined)
        update.description = parsed.data.description ? String(parsed.data.description).trim() : null;
    if (parsed.data.type !== undefined)
        update.type = normIssueType(parsed.data.type);
    if (parsed.data.priority !== undefined)
        update.priority = normPriority(parsed.data.priority);
    if (parsed.data.acceptanceCriteria !== undefined)
        update.acceptanceCriteria = parsed.data.acceptanceCriteria ? String(parsed.data.acceptanceCriteria).trim() : null;
    if (parsed.data.storyPoints !== undefined)
        update.storyPoints = parsed.data.storyPoints ?? null;
    if (parsed.data.assigneeId !== undefined) {
        const nextAssignee = parsed.data.assigneeId ? String(parsed.data.assigneeId).trim() : null;
        if (nextAssignee) {
            const allowed = projectMemberIds(project);
            if (!allowed.includes(nextAssignee))
                return res.status(400).json({ data: null, error: 'invalid_assignee' });
        }
        update.assigneeId = nextAssignee;
    }
    if (parsed.data.labels !== undefined)
        update.labels = normStrArray(parsed.data.labels, 50);
    if (parsed.data.components !== undefined) {
        const next = normStrArray(parsed.data.components, 50);
        const ok = await validateComponentsExist(db, issue.projectId, next);
        if (!ok)
            return res.status(400).json({ data: null, error: 'invalid_components' });
        update.components = next;
    }
    if (parsed.data.sprintId !== undefined) {
        if (!parsed.data.sprintId)
            update.sprintId = null;
        else {
            const sid = objIdOrNull(parsed.data.sprintId);
            if (!sid)
                return res.status(400).json({ data: null, error: 'invalid_sprint' });
            const sp = await db.collection('sf_sprints').findOne({ _id: sid, projectId: issue.projectId });
            if (!sp)
                return res.status(400).json({ data: null, error: 'invalid_sprint' });
            update.sprintId = sid;
        }
    }
    if (parsed.data.epicId !== undefined) {
        if (!parsed.data.epicId)
            update.epicId = null;
        else {
            const eid = objIdOrNull(parsed.data.epicId);
            if (!eid)
                return res.status(400).json({ data: null, error: 'invalid_epic' });
            const epic = await db.collection('sf_issues').findOne({ _id: eid, projectId: issue.projectId });
            if (!epic || normIssueType(epic.type) !== 'Epic')
                return res.status(400).json({ data: null, error: 'invalid_epic' });
            update.epicId = eid;
        }
    }
    await db.collection('sf_issues').updateOne({ _id: iid }, { $set: update });
    res.json({ data: { ok: true }, error: null });
});
// GET /api/stratflow/projects/:projectId/issues
stratflowRouter.get('/projects/:projectId/issues', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const pid = objIdOrNull(String(req.params.projectId || ''));
    if (!pid)
        return res.status(400).json({ data: null, error: 'invalid_project_id' });
    const project = await loadProjectForUser(db, pid, auth.userId);
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    const q = String(req.query.q || '').trim().toLowerCase();
    const typeQ = String(req.query.type || '').trim();
    const sprintIdQ = String(req.query.sprintId || '').trim();
    const epicIdQ = String(req.query.epicId || '').trim();
    const statusQ = String(req.query.statusKey || '').trim();
    const query = { projectId: pid };
    if (typeQ)
        query.type = normIssueType(typeQ);
    if (statusQ)
        query.statusKey = statusQ;
    if (sprintIdQ) {
        if (sprintIdQ === 'null')
            query.sprintId = null;
        else {
            const sid = objIdOrNull(sprintIdQ);
            if (!sid)
                return res.status(400).json({ data: null, error: 'invalid_sprint' });
            query.sprintId = sid;
        }
    }
    if (epicIdQ) {
        const eid = objIdOrNull(epicIdQ);
        if (!eid)
            return res.status(400).json({ data: null, error: 'invalid_epic' });
        query.epicId = eid;
    }
    // MVP text search: title substring (case-insensitive)
    if (q)
        query.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const items = await db.collection('sf_issues').find(query).sort({ updatedAt: -1 }).limit(2000).toArray();
    res.json({
        data: {
            items: items.map((d) => ({
                ...d,
                _id: String(d._id),
                projectId: String(d.projectId),
                boardId: String(d.boardId),
                columnId: String(d.columnId),
                sprintId: d.sprintId ? String(d.sprintId) : null,
                epicId: d.epicId ? String(d.epicId) : null,
                type: normIssueType(d.type),
                priority: normPriority(d.priority),
                createdAt: toIsoOrNull(d.createdAt),
                updatedAt: toIsoOrNull(d.updatedAt),
            })),
        },
        error: null,
    });
});
const issueCommentCreateSchema = z.object({
    body: z.string().min(1).max(8000),
});
// GET /api/stratflow/issues/:issueId/comments
stratflowRouter.get('/issues/:issueId/comments', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const iid = objIdOrNull(String(req.params.issueId || ''));
    if (!iid)
        return res.status(400).json({ data: null, error: 'invalid_issue_id' });
    const issue = await db.collection('sf_issues').findOne({ _id: iid });
    if (!issue)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, issue.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const items = await db
        .collection('sf_issue_comments')
        .find({ issueId: iid })
        .sort({ createdAt: 1 })
        .limit(2000)
        .toArray();
    res.json({
        data: {
            items: items.map((d) => ({
                ...d,
                _id: String(d._id),
                projectId: String(d.projectId),
                issueId: String(d.issueId),
                createdAt: toIsoOrNull(d.createdAt),
            })),
        },
        error: null,
    });
});
// POST /api/stratflow/issues/:issueId/comments
stratflowRouter.post('/issues/:issueId/comments', async (req, res) => {
    const parsed = issueCommentCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const iid = objIdOrNull(String(req.params.issueId || ''));
    if (!iid)
        return res.status(400).json({ data: null, error: 'invalid_issue_id' });
    const issue = await db.collection('sf_issues').findOne({ _id: iid });
    if (!issue)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, issue.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const now = new Date();
    const doc = {
        _id: new ObjectId(),
        projectId: issue.projectId,
        issueId: iid,
        authorId: auth.userId,
        body: parsed.data.body.trim(),
        createdAt: now,
    };
    await db.collection('sf_issue_comments').insertOne(doc);
    res.status(201).json({ data: { _id: String(doc._id) }, error: null });
});
// GET /api/stratflow/projects/:projectId/members (project members + owner; used for assignees)
stratflowRouter.get('/projects/:projectId/members', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const pid = objIdOrNull(String(req.params.projectId || ''));
    if (!pid)
        return res.status(400).json({ data: null, error: 'invalid_project_id' });
    const project = await loadProjectForUser(db, pid, auth.userId);
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    const ids = projectMemberIds(project);
    const users = await loadUsersByIds(db, ids);
    res.json({
        data: {
            projectId: String(pid),
            ownerId: String(project.ownerId),
            teamIds: Array.isArray(project.teamIds) ? project.teamIds : [],
            users,
        },
        error: null,
    });
});
// GET /api/stratflow/projects/:projectId/components (members can read components)
stratflowRouter.get('/projects/:projectId/components', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const pid = objIdOrNull(String(req.params.projectId || ''));
    if (!pid)
        return res.status(400).json({ data: null, error: 'invalid_project_id' });
    const project = await loadProjectForUser(db, pid, auth.userId);
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    const items = await db.collection('sf_components').find({ projectId: pid }).sort({ nameLower: 1 }).toArray();
    res.json({
        data: {
            items: items.map((d) => ({
                _id: String(d._id),
                projectId: String(d.projectId),
                name: d.name,
                createdAt: toIsoOrNull(d.createdAt),
                updatedAt: toIsoOrNull(d.updatedAt),
            })),
        },
        error: null,
    });
});
// Admin endpoints (require global admin permission)
const stratflowAdminRouter = Router();
stratflowAdminRouter.use(requirePermission('*'));
stratflowRouter.use('/admin', stratflowAdminRouter);
// GET /api/stratflow/admin/projects
stratflowAdminRouter.get('/projects', async (_req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const items = await db.collection('sf_projects').find({}).sort({ updatedAt: -1 }).limit(500).toArray();
    const ownerIds = Array.from(new Set(items.map((p) => String(p.ownerId || '')).filter((x) => ObjectId.isValid(x))));
    const owners = await loadUsersByIds(db, ownerIds);
    const ownerMap = new Map(owners.map((o) => [o.id, o]));
    res.json({
        data: {
            items: items.map((p) => ({
                ...p,
                _id: String(p._id),
                createdAt: toIsoOrNull(p.createdAt),
                updatedAt: toIsoOrNull(p.updatedAt),
                startDate: toIsoOrNull(p.startDate),
                targetEndDate: toIsoOrNull(p.targetEndDate),
                owner: ownerMap.get(String(p.ownerId || '')) || null,
            })),
        },
        error: null,
    });
});
async function deleteProjectCascade(db, projectId) {
    const boards = await db.collection('sf_boards').find({ projectId }).project({ _id: 1 }).toArray();
    const boardIds = boards.map((b) => b._id);
    const now = new Date();
    // delete children first
    const issues = await db.collection('sf_issues').deleteMany({ projectId });
    const comments = await db.collection('sf_issue_comments').deleteMany({ projectId });
    const sprints = await db.collection('sf_sprints').deleteMany({ projectId });
    const components = await db.collection('sf_components').deleteMany({ projectId });
    const columns = boardIds.length ? await db.collection('sf_columns').deleteMany({ boardId: { $in: boardIds } }) : { deletedCount: 0 };
    const boardsDel = await db.collection('sf_boards').deleteMany({ projectId });
    const projectDel = await db.collection('sf_projects').deleteOne({ _id: projectId });
    return {
        deletedAt: now.toISOString(),
        project: projectDel.deletedCount || 0,
        boards: boardsDel.deletedCount || 0,
        columns: columns.deletedCount || 0,
        issues: issues.deletedCount || 0,
        comments: comments.deletedCount || 0,
        sprints: sprints.deletedCount || 0,
        components: components.deletedCount || 0,
    };
}
// DELETE /api/stratflow/admin/projects/:projectId
stratflowAdminRouter.delete('/projects/:projectId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const pid = objIdOrNull(String(req.params.projectId || ''));
    if (!pid)
        return res.status(400).json({ data: null, error: 'invalid_project_id' });
    const existing = await db.collection('sf_projects').findOne({ _id: pid });
    if (!existing)
        return res.status(404).json({ data: null, error: 'not_found' });
    const result = await deleteProjectCascade(db, pid);
    res.json({ data: result, error: null });
});
// GET /api/stratflow/admin/projects/:projectId/members
stratflowAdminRouter.get('/projects/:projectId/members', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const pid = objIdOrNull(String(req.params.projectId || ''));
    if (!pid)
        return res.status(400).json({ data: null, error: 'invalid_project_id' });
    const project = await db.collection('sf_projects').findOne({ _id: pid });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const ids = projectMemberIds(project);
    const users = await loadUsersByIds(db, ids);
    res.json({ data: { projectId: String(pid), ownerId: String(project.ownerId), teamIds: project.teamIds || [], users }, error: null });
});
const adminMemberAddSchema = z.object({ userId: z.string().min(6) });
// POST /api/stratflow/admin/projects/:projectId/members
stratflowAdminRouter.post('/projects/:projectId/members', async (req, res) => {
    const parsed = adminMemberAddSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const pid = objIdOrNull(String(req.params.projectId || ''));
    if (!pid)
        return res.status(400).json({ data: null, error: 'invalid_project_id' });
    const project = await db.collection('sf_projects').findOne({ _id: pid });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const uid = String(parsed.data.userId).trim();
    if (!ObjectId.isValid(uid))
        return res.status(400).json({ data: null, error: 'invalid_user_id' });
    const user = await db.collection('users').findOne({ _id: new ObjectId(uid) });
    if (!user)
        return res.status(404).json({ data: null, error: 'user_not_found' });
    if (String(project.ownerId) === uid)
        return res.json({ data: { ok: true }, error: null });
    await db.collection('sf_projects').updateOne({ _id: pid }, { $addToSet: { teamIds: uid }, $set: { updatedAt: new Date() } });
    res.json({ data: { ok: true }, error: null });
});
// DELETE /api/stratflow/admin/projects/:projectId/members/:userId
stratflowAdminRouter.delete('/projects/:projectId/members/:userId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const pid = objIdOrNull(String(req.params.projectId || ''));
    if (!pid)
        return res.status(400).json({ data: null, error: 'invalid_project_id' });
    const uid = String(req.params.userId || '').trim();
    if (!ObjectId.isValid(uid))
        return res.status(400).json({ data: null, error: 'invalid_user_id' });
    const project = await db.collection('sf_projects').findOne({ _id: pid });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (String(project.ownerId) === uid)
        return res.status(400).json({ data: null, error: 'cannot_remove_owner' });
    await db.collection('sf_projects').updateOne({ _id: pid }, { $pull: { teamIds: uid }, $set: { updatedAt: new Date() } });
    // Best-effort: clear assignees who are no longer in team
    try {
        await db.collection('sf_issues').updateMany({ projectId: pid, assigneeId: uid }, { $set: { assigneeId: null, updatedAt: new Date() } });
    }
    catch {
        // noop
    }
    res.json({ data: { ok: true }, error: null });
});
const componentCreateSchema = z.object({ name: z.string().min(2).max(80) });
// GET /api/stratflow/admin/projects/:projectId/components
stratflowAdminRouter.get('/projects/:projectId/components', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const pid = objIdOrNull(String(req.params.projectId || ''));
    if (!pid)
        return res.status(400).json({ data: null, error: 'invalid_project_id' });
    const project = await db.collection('sf_projects').findOne({ _id: pid });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const items = await db.collection('sf_components').find({ projectId: pid }).sort({ nameLower: 1 }).toArray();
    res.json({ data: { items: items.map((d) => ({ _id: String(d._id), name: d.name, createdAt: toIsoOrNull(d.createdAt), updatedAt: toIsoOrNull(d.updatedAt) })) }, error: null });
});
// POST /api/stratflow/admin/projects/:projectId/components
stratflowAdminRouter.post('/projects/:projectId/components', async (req, res) => {
    const parsed = componentCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const pid = objIdOrNull(String(req.params.projectId || ''));
    if (!pid)
        return res.status(400).json({ data: null, error: 'invalid_project_id' });
    const project = await db.collection('sf_projects').findOne({ _id: pid });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const now = new Date();
    const name = parsed.data.name.trim();
    const doc = { _id: new ObjectId(), projectId: pid, name, nameLower: name.toLowerCase(), createdAt: now, updatedAt: now };
    try {
        await db.collection('sf_components').insertOne(doc);
    }
    catch {
        return res.status(409).json({ data: null, error: 'component_exists' });
    }
    res.status(201).json({ data: { _id: String(doc._id) }, error: null });
});
// DELETE /api/stratflow/admin/projects/:projectId/components/:componentId
stratflowAdminRouter.delete('/projects/:projectId/components/:componentId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const pid = objIdOrNull(String(req.params.projectId || ''));
    if (!pid)
        return res.status(400).json({ data: null, error: 'invalid_project_id' });
    const cid = objIdOrNull(String(req.params.componentId || ''));
    if (!cid)
        return res.status(400).json({ data: null, error: 'invalid_component_id' });
    const row = await db.collection('sf_components').findOne({ _id: cid, projectId: pid });
    if (!row)
        return res.status(404).json({ data: null, error: 'not_found' });
    await db.collection('sf_components').deleteOne({ _id: cid });
    // Best-effort: strip this component from issues in the project
    try {
        await db.collection('sf_issues').updateMany({ projectId: pid, components: row.name }, { $pull: { components: row.name }, $set: { updatedAt: new Date() } });
    }
    catch {
        // noop
    }
    res.json({ data: { ok: true }, error: null });
});
