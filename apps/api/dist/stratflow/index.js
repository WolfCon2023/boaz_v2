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
        await db.collection('sf_activity').createIndex({ projectId: 1, createdAt: -1 }).catch(() => { });
        await db.collection('sf_activity').createIndex({ issueId: 1, createdAt: -1 }).catch(() => { });
        await db.collection('sf_activity').createIndex({ sprintId: 1, createdAt: -1 }).catch(() => { });
        await db.collection('sf_time_entries').createIndex({ projectId: 1, workDate: -1, createdAt: -1 }).catch(() => { });
        await db.collection('sf_time_entries').createIndex({ issueId: 1, workDate: -1, createdAt: -1 }).catch(() => { });
        await db.collection('sf_time_entries').createIndex({ userId: 1, workDate: -1, createdAt: -1 }).catch(() => { });
        await db.collection('sf_watches').createIndex({ projectId: 1, userId: 1, issueId: 1 }, { unique: true }).catch(() => { });
        await db.collection('sf_notifications').createIndex({ projectId: 1, userId: 1, createdAt: -1 }).catch(() => { });
        await db.collection('sf_notifications').createIndex({ userId: 1, readAt: 1, createdAt: -1 }).catch(() => { });
        await db.collection('sf_automation_rules').createIndex({ projectId: 1, updatedAt: -1 }).catch(() => { });
    }
    catch {
        // noop
    }
}
function isIssueBlocked(issue) {
    const links = (issue?.links || []);
    return links.some((l) => String(l?.type || '') === 'blocked_by');
}
function canEditAutomation(project, authUserId) {
    return String(project?.ownerId || '') === String(authUserId || '');
}
async function applyAutomationForIssue(db, project, authUserId, trigger, issue) {
    const rules = await db
        .collection('sf_automation_rules')
        .find({ projectId: project._id, enabled: true, 'trigger.kind': trigger.kind })
        .sort({ updatedAt: -1 })
        .limit(200)
        .toArray();
    if (!rules.length)
        return { applied: 0 };
    let applied = 0;
    for (const r of rules) {
        const t = r.trigger || {};
        // Use string comparison to avoid type mismatches
        const ruleStatusKey = t.toStatusKey != null ? String(t.toStatusKey).toLowerCase() : null;
        const triggerStatusKey = trigger.toStatusKey != null ? String(trigger.toStatusKey).toLowerCase() : null;
        if (ruleStatusKey != null && ruleStatusKey !== triggerStatusKey)
            continue;
        const ruleLinkType = t.linkType != null ? String(t.linkType).toLowerCase() : null;
        const triggerLinkType = trigger.linkType != null ? String(trigger.linkType).toLowerCase() : null;
        if (ruleLinkType != null && ruleLinkType !== triggerLinkType)
            continue;
        const c = r.conditions || {};
        if (c.issueType != null && normIssueType(issue.type) !== c.issueType)
            continue;
        if (c.hasLabel) {
            const labels = Array.isArray(issue.labels) ? issue.labels.map((x) => String(x || '').trim()) : [];
            if (!labels.includes(String(c.hasLabel)))
                continue;
        }
        if (c.notHasLabel) {
            const labels = Array.isArray(issue.labels) ? issue.labels.map((x) => String(x || '').trim()) : [];
            if (labels.includes(String(c.notHasLabel)))
                continue;
        }
        if (c.isBlocked != null) {
            const blocked = isIssueBlocked(issue);
            if (Boolean(c.isBlocked) !== blocked)
                continue;
        }
        const addLabels = normStrArray((r.actions || {}).addLabels, 50);
        const removeLabels = normStrArray((r.actions || {}).removeLabels, 50);
        const updateDoc = { $set: { updatedAt: new Date() } };
        if (addLabels.length)
            updateDoc.$addToSet = { labels: { $each: addLabels } };
        if (removeLabels.length)
            updateDoc.$pull = { labels: { $in: removeLabels } };
        if (!addLabels.length && !removeLabels.length)
            continue;
        await db.collection('sf_issues').updateOne({ _id: issue._id }, updateDoc);
        applied++;
        await logActivity(db, {
            projectId: project._id,
            actorId: authUserId,
            kind: 'automation_applied',
            issueId: issue._id,
            meta: { ruleId: String(r._id), ruleName: String(r.name || ''), trigger },
            createdAt: new Date(),
        });
    }
    return { applied };
}
async function applyAutomationForSprintClose(db, project, authUserId, sprintId) {
    const rules = await db
        .collection('sf_automation_rules')
        .find({ projectId: project._id, enabled: true, 'trigger.kind': 'sprint_closed' })
        .sort({ updatedAt: -1 })
        .limit(200)
        .toArray();
    if (!rules.length)
        return { applied: 0 };
    // Find issues in this sprint that are NOT done
    const openIssues = await db
        .collection('sf_issues')
        .find({ projectId: project._id, sprintId, statusKey: { $ne: 'done' } })
        .toArray();
    if (!openIssues.length) {
        // No open issues to move
        let applied = 0;
        for (const r of rules) {
            if (!(r.actions || {}).moveOpenIssuesToBacklog)
                continue;
            applied++;
            await logActivity(db, {
                projectId: project._id,
                actorId: authUserId,
                kind: 'automation_applied',
                sprintId,
                meta: { ruleId: String(r._id), ruleName: String(r.name || ''), trigger: { kind: 'sprint_closed' }, modified: 0 },
                createdAt: new Date(),
            });
        }
        return { applied };
    }
    // Group issues by boardId, so we can move them to the first column of their respective board
    const issuesByBoard = new Map();
    for (const issue of openIssues) {
        const boardIdStr = String(issue.boardId || '');
        if (!issuesByBoard.has(boardIdStr))
            issuesByBoard.set(boardIdStr, []);
        issuesByBoard.get(boardIdStr).push(issue);
    }
    // For each board, find the first column (typically "To Do" or "Backlog") to move issues to
    const boardFirstColumn = new Map();
    for (const boardIdStr of issuesByBoard.keys()) {
        const bid = objIdOrNull(boardIdStr);
        if (!bid)
            continue;
        const firstCol = await db.collection('sf_columns').findOne({ boardId: bid }, { sort: { order: 1 } });
        if (firstCol) {
            const colName = String(firstCol.name || '');
            boardFirstColumn.set(boardIdStr, {
                columnId: firstCol._id,
                statusKey: statusKeyFromColumnName(colName),
            });
        }
    }
    let applied = 0;
    const now = new Date();
    for (const r of rules) {
        const acts = r.actions || {};
        if (!acts.moveOpenIssuesToBacklog)
            continue;
        let totalModified = 0;
        // Update issues per board - move to first column of that board and clear sprintId
        for (const [boardIdStr, issues] of issuesByBoard) {
            const firstCol = boardFirstColumn.get(boardIdStr);
            const updateFields = { sprintId: null, updatedAt: now };
            if (firstCol) {
                updateFields.columnId = firstCol.columnId;
                updateFields.statusKey = firstCol.statusKey;
            }
            const issueIds = issues.map((i) => i._id);
            const result = await db
                .collection('sf_issues')
                .updateMany({ _id: { $in: issueIds } }, { $set: updateFields });
            totalModified += result.modifiedCount || 0;
        }
        applied++;
        await logActivity(db, {
            projectId: project._id,
            actorId: authUserId,
            kind: 'automation_applied',
            sprintId,
            meta: {
                ruleId: String(r._id),
                ruleName: String(r.name || ''),
                trigger: { kind: 'sprint_closed' },
                modified: totalModified,
            },
            createdAt: now,
        });
    }
    return { applied };
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function candidateMentionHandlesForUser(u) {
    const out = new Set();
    const email = String(u.email || '').trim().toLowerCase();
    const name = String(u.name || '').trim().toLowerCase();
    if (email) {
        const local = email.split('@')[0] || '';
        if (local)
            out.add(local);
        out.add(email);
    }
    if (name) {
        name
            .split(/[\s._-]+/g)
            .map((p) => p.trim())
            .filter(Boolean)
            .forEach((p) => out.add(p));
        out.add(name);
    }
    return Array.from(out).filter((x) => x.length >= 2 && x.length <= 64);
}
function extractMentionedUserIds(body, users) {
    const text = String(body || '');
    if (!text.includes('@'))
        return [];
    const tokens = Array.from(text.matchAll(/(^|\s)@([a-zA-Z0-9._-]{2,64})/g)).map((m) => String(m[2] || '').toLowerCase());
    if (!tokens.length)
        return [];
    const uniqTokens = Array.from(new Set(tokens));
    const handleToUserId = new Map();
    for (const u of users) {
        for (const h of candidateMentionHandlesForUser(u)) {
            handleToUserId.set(h.toLowerCase(), u.id);
        }
    }
    const out = [];
    for (const t of uniqTokens) {
        // exact
        const exact = handleToUserId.get(t);
        if (exact) {
            out.push(exact);
            continue;
        }
        // prefix match against email localparts / name parts
        for (const [h, uid] of handleToUserId.entries()) {
            if (h.startsWith(t)) {
                out.push(uid);
                break;
            }
        }
    }
    return Array.from(new Set(out)).filter((id) => ObjectId.isValid(id));
}
async function notifyFromActivity(db, activity) {
    try {
        const projectId = activity.projectId;
        const issueId = activity.issueId ? activity.issueId : null;
        const sprintId = activity.sprintId ? activity.sprintId : null;
        const actorId = String(activity.actorId || '').trim();
        const meta = activity.meta || {};
        const watcherQuery = { projectId };
        if (issueId)
            watcherQuery.$or = [{ issueId: null }, { issueId }];
        else
            watcherQuery.issueId = null;
        const watchRows = (await db.collection('sf_watches').find(watcherQuery).project({ userId: 1 }).toArray());
        const watchUserIds = watchRows.map((r) => String(r.userId || '').trim()).filter(Boolean);
        const mentionUserIds = Array.isArray(meta.mentions)
            ? meta.mentions.map((x) => String(x || '').trim()).filter(Boolean)
            : [];
        const extraDirectUserIds = Array.isArray(meta.notifyUserIds)
            ? meta.notifyUserIds.map((x) => String(x || '').trim()).filter(Boolean)
            : [];
        const recipients = Array.from(new Set([...watchUserIds, ...mentionUserIds, ...extraDirectUserIds])).filter((uid) => uid && uid !== actorId);
        if (!recipients.length)
            return;
        const actor = ObjectId.isValid(actorId) ? await db.collection('users').findOne({ _id: new ObjectId(actorId) }) : null;
        const actorLabel = String(actor?.name || actor?.email || actorId || 'Someone');
        const issue = issueId ? await db.collection('sf_issues').findOne({ _id: issueId }) : null;
        const issueLabel = issue ? `${normIssueType(issue.type)}: ${String(issue.title || '').trim() || 'Untitled'}` : issueId ? `Issue ${String(issueId)}` : null;
        const sprint = sprintId ? await db.collection('sf_sprints').findOne({ _id: sprintId }) : null;
        const sprintLabel = sprint ? String(sprint.name || '').trim() : sprintId ? `Sprint ${String(sprintId)}` : null;
        const kindMap = {
            issue_created: 'issue_created',
            issue_moved: 'issue_moved',
            issue_updated: 'issue_updated',
            issue_commented: 'issue_commented',
            issue_link_added: 'issue_link_added',
            issue_link_removed: 'issue_link_removed',
            automation_applied: 'issue_updated',
            time_logged: 'time_logged',
            time_updated: 'time_updated',
            time_deleted: 'time_deleted',
            bulk_update: 'bulk_update',
            sprint_created: 'sprint_created',
            sprint_updated: 'sprint_updated',
            sprint_set_active: 'sprint_set_active',
            sprint_closed: 'sprint_closed',
        };
        const notifKind = kindMap[activity.kind] || 'issue_updated';
        let title = 'Update';
        let body = null;
        if (activity.kind === 'issue_commented') {
            title = issueLabel ? `Commented: ${issueLabel}` : 'New comment';
            body = meta.preview ? `${actorLabel}: ${String(meta.preview).trim()}` : `${actorLabel} commented.`;
        }
        else if (activity.kind === 'issue_moved') {
            title = issueLabel ? `Moved: ${issueLabel}` : 'Issue moved';
            const toName = meta.toColumnName ? String(meta.toColumnName) : '';
            body = toName ? `${actorLabel} moved this to “${toName}”.` : `${actorLabel} moved an issue.`;
        }
        else if (activity.kind === 'issue_created') {
            title = issueLabel ? `Created: ${issueLabel}` : 'New issue';
            body = `${actorLabel} created a new issue.`;
        }
        else if (activity.kind === 'issue_updated') {
            title = issueLabel ? `Updated: ${issueLabel}` : 'Issue updated';
            const fields = Array.isArray(meta.fields) ? meta.fields.join(', ') : '';
            body = fields ? `${actorLabel} updated: ${fields}.` : `${actorLabel} updated an issue.`;
        }
        else if (activity.kind === 'issue_link_added' || activity.kind === 'issue_link_removed') {
            title = issueLabel ? `Dependency updated: ${issueLabel}` : 'Dependency updated';
            body = `${actorLabel} updated dependencies.`;
        }
        else if (activity.kind === 'sprint_set_active' || activity.kind === 'sprint_updated' || activity.kind === 'sprint_created' || activity.kind === 'sprint_closed') {
            title = sprintLabel ? `Sprint: ${sprintLabel}` : 'Sprint update';
            body = `${actorLabel} updated sprint settings.`;
        }
        else if (activity.kind === 'bulk_update') {
            title = 'Bulk update';
            body = `${actorLabel} updated multiple issues.`;
        }
        else if (activity.kind.startsWith('time_')) {
            title = issueLabel ? `Time: ${issueLabel}` : 'Time update';
            body = `${actorLabel} updated time tracking.`;
        }
        const now = activity.createdAt || new Date();
        const docs = recipients.map((userId) => ({
            _id: new ObjectId(),
            projectId,
            userId,
            kind: notifKind,
            actorId: actorId || null,
            issueId: issueId || null,
            sprintId: sprintId || null,
            title,
            body,
            createdAt: now,
            readAt: null,
            meta: { activityKind: activity.kind, ...(meta || {}) },
        }));
        // If someone was mentioned, create a higher-signal "mentioned" notification too (in addition to watchers),
        // but only for those explicitly mentioned.
        const mentionedOnly = mentionUserIds.filter((uid) => uid && uid !== actorId);
        const mentionDocs = mentionedOnly.length
            ? mentionedOnly.map((userId) => ({
                _id: new ObjectId(),
                projectId,
                userId,
                kind: 'mentioned',
                actorId: actorId || null,
                issueId: issueId || null,
                sprintId: sprintId || null,
                title: issueLabel ? `You were mentioned: ${issueLabel}` : 'You were mentioned',
                body: meta.preview ? `${actorLabel}: ${String(meta.preview).trim()}` : `${actorLabel} mentioned you.`,
                createdAt: now,
                readAt: null,
                meta: { activityKind: activity.kind, ...(meta || {}) },
            }))
            : [];
        await db.collection('sf_notifications').insertMany([...docs, ...mentionDocs], { ordered: false }).catch(() => { });
    }
    catch {
        // best-effort
    }
}
async function logActivity(db, doc) {
    try {
        await db.collection('sf_activity').insertOne({ _id: new ObjectId(), ...doc });
        await notifyFromActivity(db, doc);
    }
    catch {
        // best effort
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
    return valid.map((id) => map.get(id)).filter((x) => Boolean(x));
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
        wipLimit: null,
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
function isValidUserId(userId) {
    return ObjectId.isValid(String(userId || '').trim());
}
function parseDateOnlyOrIsoToUtcMidnight(input) {
    const raw = String(input || '').trim();
    if (!raw)
        return null;
    // date-only
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const d0 = new Date(`${raw}T00:00:00.000Z`);
        return Number.isFinite(d0.getTime()) ? d0 : null;
    }
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime()))
        return null;
    const isoDay = d.toISOString().slice(0, 10);
    const d0 = new Date(`${isoDay}T00:00:00.000Z`);
    return Number.isFinite(d0.getTime()) ? d0 : null;
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
const columnUpdateSchema = z.object({
    wipLimit: z.number().min(0).max(999).nullable(),
});
// PATCH /api/stratflow/columns/:columnId
stratflowRouter.patch('/columns/:columnId', async (req, res) => {
    const parsed = columnUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const cid = objIdOrNull(String(req.params.columnId || ''));
    if (!cid)
        return res.status(400).json({ data: null, error: 'invalid_column_id' });
    const col = await db.collection('sf_columns').findOne({ _id: cid });
    if (!col)
        return res.status(404).json({ data: null, error: 'not_found' });
    const board = await db.collection('sf_boards').findOne({ _id: col.boardId });
    if (!board)
        return res.status(404).json({ data: null, error: 'board_not_found' });
    const project = await loadProjectForUser(db, board.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    await db
        .collection('sf_columns')
        .updateOne({ _id: cid }, { $set: { wipLimit: parsed.data.wipLimit, updatedAt: new Date() } });
    res.json({ data: { ok: true }, error: null });
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
    phase: z.string().max(80).optional().nullable(),
    targetStartDate: z.string().optional().nullable(),
    targetEndDate: z.string().optional().nullable(),
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
    // Enforce WIP limit for the destination column (if set)
    const wipLimit = typeof col.wipLimit === 'number' ? col.wipLimit : null;
    if (wipLimit != null) {
        const curCount = await db.collection('sf_issues').countDocuments({ boardId: bid, columnId: colId });
        if (curCount >= wipLimit)
            return res.status(400).json({ data: null, error: 'wip_limit_reached' });
    }
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
        phase: parsed.data.phase ? String(parsed.data.phase).trim() : null,
        targetStartDate: parsed.data.targetStartDate ? new Date(parsed.data.targetStartDate) : null,
        targetEndDate: parsed.data.targetEndDate ? new Date(parsed.data.targetEndDate) : null,
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
    await logActivity(db, {
        projectId: board.projectId,
        actorId: auth.userId,
        kind: 'issue_created',
        issueId: doc._id,
        meta: { boardId: String(bid), columnId: String(colId), type: doc.type, priority: doc.priority },
        createdAt: now,
    });
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
    capacityPoints: z.number().min(0).max(10000).optional().nullable(),
});
const sprintUpdateSchema = z.object({
    name: z.string().min(2).max(140).optional(),
    goal: z.string().max(2000).optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    capacityPoints: z.number().min(0).max(10000).optional().nullable(),
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
    // Enforce WIP limit for the destination column (if set)
    const wipLimit = typeof col.wipLimit === 'number' ? col.wipLimit : null;
    if (wipLimit != null && destItems.length >= wipLimit) {
        return res.status(400).json({ data: null, error: 'wip_limit_reached' });
    }
    // Governance: required fields to move to Done
    const nextStatusKey = statusKeyFromColumnName(String(col.name || ''));
    if (nextStatusKey === 'done') {
        const t = normIssueType(issue.type);
        if (t === 'Story' && !String(issue.acceptanceCriteria || '').trim()) {
            return res.status(400).json({ data: null, error: 'missing_acceptance_criteria' });
        }
        if (t === 'Defect' && !String(issue.description || '').trim()) {
            return res.status(400).json({ data: null, error: 'missing_description' });
        }
    }
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
            statusKey: nextStatusKey,
            updatedAt: now,
        },
    });
    // Re-read issue so automation can evaluate on the updated state.
    const nextIssue = await db.collection('sf_issues').findOne({ _id: iid });
    if (nextIssue) {
        await applyAutomationForIssue(db, project, auth.userId, { kind: 'issue_moved', toStatusKey: nextStatusKey }, nextIssue);
    }
    await logActivity(db, {
        projectId: board.projectId,
        actorId: auth.userId,
        kind: 'issue_moved',
        issueId: iid,
        meta: { toColumnId: String(toCol), toColumnName: String(col.name || ''), toIndex: parsed.data.toIndex },
        createdAt: now,
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
                capacityPoints: d.capacityPoints ?? null,
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
        capacityPoints: parsed.data.capacityPoints ?? null,
        state: 'planned',
        createdAt: now,
        updatedAt: now,
    };
    await db.collection('sf_sprints').insertOne(doc);
    await logActivity(db, { projectId: pid, actorId: auth.userId, kind: 'sprint_created', sprintId: doc._id, meta: { name: doc.name }, createdAt: now });
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
    if (parsed.data.capacityPoints !== undefined)
        update.capacityPoints = parsed.data.capacityPoints ?? null;
    if (parsed.data.state !== undefined)
        update.state = parsed.data.state;
    await db.collection('sf_sprints').updateOne({ _id: sid }, { $set: update });
    await logActivity(db, { projectId: sprint.projectId, actorId: auth.userId, kind: 'sprint_updated', sprintId: sid, meta: { fields: Object.keys(parsed.data || {}) }, createdAt: update.updatedAt });
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
    await logActivity(db, { projectId: sprint.projectId, actorId: auth.userId, kind: 'sprint_set_active', sprintId: sid, createdAt: now });
    res.json({ data: { ok: true }, error: null });
});
// POST /api/stratflow/sprints/:sprintId/close
stratflowRouter.post('/sprints/:sprintId/close', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const sid = objIdOrNull(String(req.params.sprintId || ''));
    if (!sid)
        return res.status(400).json({ data: null, error: 'invalid_sprint_id' });
    const force = Boolean((req.body ?? {}).force);
    const sprint = await db.collection('sf_sprints').findOne({ _id: sid });
    if (!sprint)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, sprint.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    // Governance: only owner can close
    if (String(project.ownerId) !== String(auth.userId))
        return res.status(403).json({ data: null, error: 'owner_only' });
    if (!force) {
        const openCount = await db.collection('sf_issues').countDocuments({ projectId: sprint.projectId, sprintId: sid, statusKey: { $ne: 'done' } });
        if (openCount > 0)
            return res.status(400).json({ data: null, error: 'sprint_has_open_work', openCount });
    }
    const now = new Date();
    await db.collection('sf_sprints').updateOne({ _id: sid }, { $set: { state: 'closed', updatedAt: now } });
    // Apply automation (e.g., move open issues back to backlog when a sprint closes)
    await applyAutomationForSprintClose(db, project, auth.userId, sid);
    await logActivity(db, { projectId: sprint.projectId, actorId: auth.userId, kind: 'sprint_closed', sprintId: sid, meta: { force }, createdAt: now });
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
    phase: z.string().max(80).optional().nullable(),
    targetStartDate: z.string().optional().nullable(),
    targetEndDate: z.string().optional().nullable(),
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
const issueLinkSchema = z.object({
    type: z.enum(['blocks', 'blocked_by', 'relates_to']),
    otherIssueId: z.string().min(6),
});
// POST /api/stratflow/issues/:issueId/links
stratflowRouter.post('/issues/:issueId/links', async (req, res) => {
    const parsed = issueLinkSchema.safeParse(req.body ?? {});
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
    const oid = objIdOrNull(String(parsed.data.otherIssueId || ''));
    if (!oid)
        return res.status(400).json({ data: null, error: 'invalid_other_issue_id' });
    if (String(iid) === String(oid))
        return res.status(400).json({ data: null, error: 'cannot_link_self' });
    const issue = await db.collection('sf_issues').findOne({ _id: iid });
    if (!issue)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, issue.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const other = await db.collection('sf_issues').findOne({ _id: oid, projectId: issue.projectId });
    if (!other)
        return res.status(400).json({ data: null, error: 'invalid_other_issue' });
    await db.collection('sf_issues').updateOne({ _id: iid }, { $addToSet: { links: { type: parsed.data.type, issueId: oid } }, $set: { updatedAt: new Date() } });
    const nextIssue = await db.collection('sf_issues').findOne({ _id: iid });
    if (nextIssue) {
        await applyAutomationForIssue(db, project, auth.userId, { kind: 'issue_link_added', linkType: parsed.data.type }, nextIssue);
    }
    await logActivity(db, {
        projectId: issue.projectId,
        actorId: auth.userId,
        kind: 'issue_link_added',
        issueId: iid,
        meta: { type: parsed.data.type, otherIssueId: String(oid) },
        createdAt: new Date(),
    });
    res.json({ data: { ok: true }, error: null });
});
// POST /api/stratflow/issues/:issueId/links/remove
stratflowRouter.post('/issues/:issueId/links/remove', async (req, res) => {
    const parsed = issueLinkSchema.safeParse(req.body ?? {});
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
    const oid = objIdOrNull(String(parsed.data.otherIssueId || ''));
    if (!oid)
        return res.status(400).json({ data: null, error: 'invalid_other_issue_id' });
    const issue = await db.collection('sf_issues').findOne({ _id: iid });
    if (!issue)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, issue.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    await db.collection('sf_issues').updateOne({ _id: iid }, { $pull: { links: { type: parsed.data.type, issueId: oid } }, $set: { updatedAt: new Date() } });
    const nextIssue = await db.collection('sf_issues').findOne({ _id: iid });
    if (nextIssue) {
        await applyAutomationForIssue(db, project, auth.userId, { kind: 'issue_link_removed', linkType: parsed.data.type }, nextIssue);
    }
    await logActivity(db, {
        projectId: issue.projectId,
        actorId: auth.userId,
        kind: 'issue_link_removed',
        issueId: iid,
        meta: { type: parsed.data.type, otherIssueId: String(oid) },
        createdAt: new Date(),
    });
    res.json({ data: { ok: true }, error: null });
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
    if (parsed.data.phase !== undefined)
        update.phase = parsed.data.phase ? String(parsed.data.phase).trim() : null;
    if (parsed.data.targetStartDate !== undefined)
        update.targetStartDate = parsed.data.targetStartDate ? new Date(parsed.data.targetStartDate) : null;
    if (parsed.data.targetEndDate !== undefined)
        update.targetEndDate = parsed.data.targetEndDate ? new Date(parsed.data.targetEndDate) : null;
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
    await logActivity(db, {
        projectId: issue.projectId,
        actorId: auth.userId,
        kind: 'issue_updated',
        issueId: iid,
        meta: { fields: Object.keys(parsed.data || {}) },
        createdAt: update.updatedAt,
    });
    res.json({ data: { ok: true }, error: null });
});
const bulkUpdateSchema = z.object({
    issueIds: z.array(z.string().min(6)).min(1).max(200),
    patch: z.object({
        assigneeId: z.string().min(6).nullable().optional(),
        sprintId: z.string().nullable().optional(), // null to clear
        addLabels: z.array(z.string()).optional(),
        removeLabels: z.array(z.string()).optional(),
        addComponents: z.array(z.string()).optional(),
        removeComponents: z.array(z.string()).optional(),
    }),
});
// POST /api/stratflow/issues/bulk-update
stratflowRouter.post('/issues/bulk-update', async (req, res) => {
    const parsed = bulkUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const ids = parsed.data.issueIds
        .map((x) => objIdOrNull(String(x)))
        .filter(Boolean);
    if (!ids.length)
        return res.status(400).json({ data: null, error: 'invalid_issue_ids' });
    const issues = await db.collection('sf_issues').find({ _id: { $in: ids } }).toArray();
    if (!issues.length)
        return res.status(404).json({ data: null, error: 'not_found' });
    const projectId = issues[0].projectId;
    if (!issues.every((it) => String(it.projectId) === String(projectId))) {
        return res.status(400).json({ data: null, error: 'mixed_projects' });
    }
    const project = await loadProjectForUser(db, projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    const now = new Date();
    const patch = parsed.data.patch;
    const update = { updatedAt: now };
    const addToSet = {};
    const pull = {};
    if (patch.assigneeId !== undefined) {
        const nextAssignee = patch.assigneeId ? String(patch.assigneeId).trim() : null;
        if (nextAssignee) {
            const allowed = projectMemberIds(project);
            if (!allowed.includes(nextAssignee))
                return res.status(400).json({ data: null, error: 'invalid_assignee' });
        }
        update.assigneeId = nextAssignee;
    }
    if (patch.sprintId !== undefined) {
        if (!patch.sprintId) {
            update.sprintId = null;
        }
        else {
            const sid = objIdOrNull(String(patch.sprintId));
            if (!sid)
                return res.status(400).json({ data: null, error: 'invalid_sprint' });
            const sp = await db.collection('sf_sprints').findOne({ _id: sid, projectId });
            if (!sp)
                return res.status(400).json({ data: null, error: 'invalid_sprint' });
            update.sprintId = sid;
        }
    }
    const addLabels = normStrArray(patch.addLabels, 50);
    const removeLabels = normStrArray(patch.removeLabels, 50);
    if (addLabels.length)
        addToSet.labels = { $each: addLabels };
    if (removeLabels.length)
        pull.labels = { $in: removeLabels };
    const addComponents = normStrArray(patch.addComponents, 50);
    const removeComponents = normStrArray(patch.removeComponents, 50);
    if (addComponents.length) {
        const ok = await validateComponentsExist(db, projectId, addComponents);
        if (!ok)
            return res.status(400).json({ data: null, error: 'invalid_components' });
        addToSet.components = { $each: addComponents };
    }
    if (removeComponents.length)
        pull.components = { $in: removeComponents };
    const updateDoc = { $set: update };
    if (Object.keys(addToSet).length)
        updateDoc.$addToSet = addToSet;
    if (Object.keys(pull).length)
        updateDoc.$pull = pull;
    const result = await db.collection('sf_issues').updateMany({ _id: { $in: ids } }, updateDoc);
    await logActivity(db, {
        projectId,
        actorId: auth.userId,
        kind: 'bulk_update',
        meta: { issueCount: ids.length, patch: Object.keys(patch || {}) },
        createdAt: now,
    });
    res.json({ data: { matched: result.matchedCount, modified: result.modifiedCount }, error: null });
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
    // Mentions are parsed against project member names/emails.
    const mentionUserIds = doc.body.includes('@') ? extractMentionedUserIds(doc.body, await loadUsersByIds(db, projectMemberIds(project))) : [];
    const preview = doc.body.length > 240 ? `${doc.body.slice(0, 240)}…` : doc.body;
    await logActivity(db, {
        projectId: issue.projectId,
        actorId: auth.userId,
        kind: 'issue_commented',
        issueId: iid,
        meta: { length: doc.body.length, preview, mentions: mentionUserIds },
        createdAt: now,
    });
    res.status(201).json({ data: { _id: String(doc._id) }, error: null });
});
const timeEntryCreateSchema = z.object({
    minutes: z.number().int().min(1).max(24 * 60),
    billable: z.boolean().optional(),
    note: z.string().max(2000).optional().nullable(),
    workDate: z.string().optional().nullable(), // YYYY-MM-DD or ISO
});
const timeEntryUpdateSchema = z.object({
    minutes: z.number().int().min(1).max(24 * 60).optional(),
    billable: z.boolean().optional(),
    note: z.string().max(2000).optional().nullable(),
    workDate: z.string().optional().nullable(),
});
// GET /api/stratflow/issues/:issueId/time-entries
stratflowRouter.get('/issues/:issueId/time-entries', async (req, res) => {
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
        .collection('sf_time_entries')
        .find({ issueId: iid })
        .sort({ workDate: -1, createdAt: -1 })
        .limit(2000)
        .toArray();
    res.json({
        data: {
            items: items.map((d) => ({
                ...d,
                _id: String(d._id),
                projectId: String(d.projectId),
                issueId: String(d.issueId),
                userId: String(d.userId || ''),
                minutes: Number(d.minutes || 0),
                billable: Boolean(d.billable),
                workDate: toIsoOrNull(d.workDate),
                createdAt: toIsoOrNull(d.createdAt),
                updatedAt: toIsoOrNull(d.updatedAt),
            })),
        },
        error: null,
    });
});
// POST /api/stratflow/issues/:issueId/time-entries
stratflowRouter.post('/issues/:issueId/time-entries', async (req, res) => {
    const parsed = timeEntryCreateSchema.safeParse(req.body ?? {});
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
    if (!isValidUserId(auth.userId))
        return res.status(400).json({ data: null, error: 'invalid_user_id' });
    const issue = await db.collection('sf_issues').findOne({ _id: iid });
    if (!issue)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, issue.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    // Governance: only project members can log time
    const allowed = projectMemberIds(project);
    if (!allowed.includes(String(auth.userId)))
        return res.status(403).json({ data: null, error: 'forbidden' });
    const now = new Date();
    const workDate = parseDateOnlyOrIsoToUtcMidnight(parsed.data.workDate) ?? parseDateOnlyOrIsoToUtcMidnight(now.toISOString());
    const doc = {
        _id: new ObjectId(),
        projectId: issue.projectId,
        issueId: iid,
        userId: String(auth.userId),
        minutes: parsed.data.minutes,
        billable: Boolean(parsed.data.billable),
        note: parsed.data.note ? String(parsed.data.note).trim() : null,
        workDate,
        createdAt: now,
        updatedAt: now,
    };
    await db.collection('sf_time_entries').insertOne(doc);
    await logActivity(db, {
        projectId: issue.projectId,
        actorId: auth.userId,
        kind: 'time_logged',
        issueId: iid,
        meta: { minutes: doc.minutes, billable: doc.billable, workDate: doc.workDate.toISOString().slice(0, 10) },
        createdAt: now,
    });
    res.status(201).json({ data: { _id: String(doc._id) }, error: null });
});
// PATCH /api/stratflow/time-entries/:timeEntryId
stratflowRouter.patch('/time-entries/:timeEntryId', async (req, res) => {
    const parsed = timeEntryUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const tid = objIdOrNull(String(req.params.timeEntryId || ''));
    if (!tid)
        return res.status(400).json({ data: null, error: 'invalid_time_entry_id' });
    const existing = await db.collection('sf_time_entries').findOne({ _id: tid });
    if (!existing)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, existing.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    // Governance: only author or project owner can edit
    if (String(existing.userId) !== String(auth.userId) && String(project.ownerId) !== String(auth.userId)) {
        return res.status(403).json({ data: null, error: 'forbidden' });
    }
    const update = { updatedAt: new Date() };
    if (parsed.data.minutes !== undefined)
        update.minutes = parsed.data.minutes;
    if (parsed.data.billable !== undefined)
        update.billable = Boolean(parsed.data.billable);
    if (parsed.data.note !== undefined)
        update.note = parsed.data.note ? String(parsed.data.note).trim() : null;
    if (parsed.data.workDate !== undefined) {
        update.workDate = parsed.data.workDate ? parseDateOnlyOrIsoToUtcMidnight(parsed.data.workDate) : null;
        if (!update.workDate)
            return res.status(400).json({ data: null, error: 'invalid_work_date' });
    }
    await db.collection('sf_time_entries').updateOne({ _id: tid }, { $set: update });
    await logActivity(db, {
        projectId: existing.projectId,
        actorId: auth.userId,
        kind: 'time_updated',
        issueId: existing.issueId,
        meta: { fields: Object.keys(parsed.data || {}) },
        createdAt: update.updatedAt,
    });
    res.json({ data: { ok: true }, error: null });
});
// DELETE /api/stratflow/time-entries/:timeEntryId
stratflowRouter.delete('/time-entries/:timeEntryId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const tid = objIdOrNull(String(req.params.timeEntryId || ''));
    if (!tid)
        return res.status(400).json({ data: null, error: 'invalid_time_entry_id' });
    const existing = await db.collection('sf_time_entries').findOne({ _id: tid });
    if (!existing)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, existing.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    // Governance: only author or project owner can delete
    if (String(existing.userId) !== String(auth.userId) && String(project.ownerId) !== String(auth.userId)) {
        return res.status(403).json({ data: null, error: 'forbidden' });
    }
    await db.collection('sf_time_entries').deleteOne({ _id: tid });
    await logActivity(db, {
        projectId: existing.projectId,
        actorId: auth.userId,
        kind: 'time_deleted',
        issueId: existing.issueId,
        meta: { minutes: Number(existing.minutes || 0), billable: Boolean(existing.billable), workDate: toIsoOrNull(existing.workDate) },
        createdAt: new Date(),
    });
    res.json({ data: { ok: true }, error: null });
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
// GET /api/stratflow/projects/:projectId/watches/me
stratflowRouter.get('/projects/:projectId/watches/me', async (req, res) => {
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
    const rows = await db.collection('sf_watches').find({ projectId: pid, userId: auth.userId }).toArray();
    const projectWatch = rows.some((r) => !r.issueId);
    const issueIds = rows.filter((r) => r.issueId).map((r) => String(r.issueId));
    res.json({ data: { projectId: String(pid), project: projectWatch, issueIds }, error: null });
});
const watchToggleSchema = z.object({ enabled: z.boolean().optional() });
// POST /api/stratflow/projects/:projectId/watch
stratflowRouter.post('/projects/:projectId/watch', async (req, res) => {
    const parsed = watchToggleSchema.safeParse(req.body ?? {});
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
    const enabled = parsed.data.enabled !== false;
    if (!enabled) {
        await db.collection('sf_watches').deleteOne({ projectId: pid, userId: auth.userId, issueId: null });
    }
    else {
        const now = new Date();
        await db.collection('sf_watches').updateOne({ projectId: pid, userId: auth.userId, issueId: null }, { $setOnInsert: { _id: new ObjectId(), projectId: pid, userId: auth.userId, issueId: null, createdAt: now } }, { upsert: true });
    }
    res.json({ data: { ok: true, enabled }, error: null });
});
// POST /api/stratflow/issues/:issueId/watch
stratflowRouter.post('/issues/:issueId/watch', async (req, res) => {
    const parsed = watchToggleSchema.safeParse(req.body ?? {});
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
    const enabled = parsed.data.enabled !== false;
    if (!enabled) {
        await db.collection('sf_watches').deleteOne({ projectId: issue.projectId, userId: auth.userId, issueId: iid });
    }
    else {
        const now = new Date();
        await db.collection('sf_watches').updateOne({ projectId: issue.projectId, userId: auth.userId, issueId: iid }, { $setOnInsert: { _id: new ObjectId(), projectId: issue.projectId, userId: auth.userId, issueId: iid, createdAt: now } }, { upsert: true });
    }
    res.json({ data: { ok: true, enabled }, error: null });
});
// GET /api/stratflow/projects/:projectId/notifications
stratflowRouter.get('/projects/:projectId/notifications', async (req, res) => {
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
    const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    const query = { projectId: pid, userId: auth.userId };
    if (unreadOnly)
        query.readAt = null;
    const items = await db.collection('sf_notifications').find(query).sort({ createdAt: -1 }).limit(limit).toArray();
    res.json({
        data: {
            projectId: String(pid),
            items: items.map((n) => ({
                _id: String(n._id),
                projectId: String(n.projectId),
                userId: String(n.userId),
                kind: String(n.kind || ''),
                actorId: n.actorId ? String(n.actorId) : null,
                issueId: n.issueId ? String(n.issueId) : null,
                sprintId: n.sprintId ? String(n.sprintId) : null,
                title: String(n.title || ''),
                body: n.body ? String(n.body) : null,
                createdAt: toIsoOrNull(n.createdAt),
                readAt: toIsoOrNull(n.readAt),
                meta: n.meta ?? null,
            })),
        },
        error: null,
    });
});
// POST /api/stratflow/notifications/:notificationId/read
stratflowRouter.post('/notifications/:notificationId/read', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const nid = objIdOrNull(String(req.params.notificationId || ''));
    if (!nid)
        return res.status(400).json({ data: null, error: 'invalid_notification_id' });
    const existing = await db.collection('sf_notifications').findOne({ _id: nid });
    if (!existing)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (String(existing.userId) !== String(auth.userId))
        return res.status(403).json({ data: null, error: 'forbidden' });
    const project = await loadProjectForUser(db, existing.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    await db.collection('sf_notifications').updateOne({ _id: nid }, { $set: { readAt: new Date() } });
    res.json({ data: { ok: true }, error: null });
});
// POST /api/stratflow/projects/:projectId/notifications/mark-all-read
stratflowRouter.post('/projects/:projectId/notifications/mark-all-read', async (req, res) => {
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
    const r = await db.collection('sf_notifications').updateMany({ projectId: pid, userId: auth.userId, readAt: null }, { $set: { readAt: now } });
    res.json({ data: { ok: true, modified: r.modifiedCount }, error: null });
});
const automationRuleCreateSchema = z.object({
    name: z.string().min(2).max(120),
    enabled: z.boolean().optional(),
    trigger: z.object({
        kind: z.enum(['issue_moved', 'issue_link_added', 'issue_link_removed', 'sprint_closed']),
        toStatusKey: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done']).optional().nullable(),
        linkType: z.enum(['blocks', 'blocked_by', 'relates_to']).optional().nullable(),
    }),
    conditions: z
        .object({
        issueType: z.enum(['Epic', 'Story', 'Task', 'Defect', 'Spike']).optional().nullable(),
        hasLabel: z.string().max(80).optional().nullable(),
        notHasLabel: z.string().max(80).optional().nullable(),
        isBlocked: z.boolean().optional().nullable(),
    })
        .optional()
        .nullable(),
    actions: z.object({
        addLabels: z.array(z.string()).optional(),
        removeLabels: z.array(z.string()).optional(),
        moveOpenIssuesToBacklog: z.boolean().optional(),
    }),
});
const automationRuleUpdateSchema = automationRuleCreateSchema.partial();
// GET /api/stratflow/projects/:projectId/automation-rules
stratflowRouter.get('/projects/:projectId/automation-rules', async (req, res) => {
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
    const items = await db.collection('sf_automation_rules').find({ projectId: pid }).sort({ updatedAt: -1 }).limit(200).toArray();
    res.json({
        data: {
            projectId: String(pid),
            items: items.map((r) => ({
                ...r,
                _id: String(r._id),
                projectId: String(r.projectId),
                createdAt: toIsoOrNull(r.createdAt),
                updatedAt: toIsoOrNull(r.updatedAt),
            })),
        },
        error: null,
    });
});
// POST /api/stratflow/projects/:projectId/automation-rules (owner-only)
stratflowRouter.post('/projects/:projectId/automation-rules', async (req, res) => {
    const parsed = automationRuleCreateSchema.safeParse(req.body ?? {});
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
    if (!canEditAutomation(project, auth.userId))
        return res.status(403).json({ data: null, error: 'owner_only' });
    const now = new Date();
    const doc = {
        _id: new ObjectId(),
        projectId: pid,
        name: parsed.data.name.trim(),
        enabled: parsed.data.enabled !== false,
        trigger: {
            kind: parsed.data.trigger.kind,
            toStatusKey: parsed.data.trigger.toStatusKey ?? null,
            linkType: parsed.data.trigger.linkType ?? null,
        },
        conditions: parsed.data.conditions ?? null,
        actions: {
            addLabels: normStrArray(parsed.data.actions.addLabels, 50),
            removeLabels: normStrArray(parsed.data.actions.removeLabels, 50),
            moveOpenIssuesToBacklog: Boolean(parsed.data.actions.moveOpenIssuesToBacklog),
        },
        createdAt: now,
        updatedAt: now,
    };
    await db.collection('sf_automation_rules').insertOne(doc);
    res.status(201).json({ data: { _id: String(doc._id) }, error: null });
});
// PATCH /api/stratflow/automation-rules/:ruleId (owner-only)
stratflowRouter.patch('/automation-rules/:ruleId', async (req, res) => {
    const parsed = automationRuleUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const rid = objIdOrNull(String(req.params.ruleId || ''));
    if (!rid)
        return res.status(400).json({ data: null, error: 'invalid_rule_id' });
    const existing = await db.collection('sf_automation_rules').findOne({ _id: rid });
    if (!existing)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, existing.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (!canEditAutomation(project, auth.userId))
        return res.status(403).json({ data: null, error: 'owner_only' });
    const update = { updatedAt: new Date() };
    if (parsed.data.name !== undefined)
        update.name = String(parsed.data.name).trim();
    if (parsed.data.enabled !== undefined)
        update.enabled = Boolean(parsed.data.enabled);
    if (parsed.data.trigger !== undefined)
        update.trigger = { ...(existing.trigger || {}), ...parsed.data.trigger };
    if (parsed.data.conditions !== undefined)
        update.conditions = parsed.data.conditions ?? null;
    if (parsed.data.actions !== undefined) {
        update.actions = {
            ...(existing.actions || {}),
            ...parsed.data.actions,
        };
        if (update.actions.addLabels !== undefined)
            update.actions.addLabels = normStrArray(update.actions.addLabels, 50);
        if (update.actions.removeLabels !== undefined)
            update.actions.removeLabels = normStrArray(update.actions.removeLabels, 50);
        if (update.actions.moveOpenIssuesToBacklog !== undefined)
            update.actions.moveOpenIssuesToBacklog = Boolean(update.actions.moveOpenIssuesToBacklog);
    }
    await db.collection('sf_automation_rules').updateOne({ _id: rid }, { $set: update });
    res.json({ data: { ok: true }, error: null });
});
// DELETE /api/stratflow/automation-rules/:ruleId (owner-only)
stratflowRouter.delete('/automation-rules/:ruleId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    await ensureStratflowIndexes(db);
    const auth = req.auth;
    const rid = objIdOrNull(String(req.params.ruleId || ''));
    if (!rid)
        return res.status(400).json({ data: null, error: 'invalid_rule_id' });
    const existing = await db.collection('sf_automation_rules').findOne({ _id: rid });
    if (!existing)
        return res.status(404).json({ data: null, error: 'not_found' });
    const project = await loadProjectForUser(db, existing.projectId, auth.userId);
    if (project === 'forbidden')
        return res.status(403).json({ data: null, error: 'forbidden' });
    if (!project)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (!canEditAutomation(project, auth.userId))
        return res.status(403).json({ data: null, error: 'owner_only' });
    await db.collection('sf_automation_rules').deleteOne({ _id: rid });
    res.json({ data: { ok: true }, error: null });
});
// GET /api/stratflow/projects/:projectId/time-rollups
stratflowRouter.get('/projects/:projectId/time-rollups', async (req, res) => {
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
    const from = parseDateOnlyOrIsoToUtcMidnight(req.query.from);
    const to = parseDateOnlyOrIsoToUtcMidnight(req.query.to);
    const match = { projectId: pid };
    if (from || to) {
        const range = {};
        if (from)
            range.$gte = from;
        if (to)
            range.$lt = new Date(to.getTime() + 24 * 60 * 60 * 1000);
        match.workDate = range;
    }
    const totalsRow = (await db
        .collection('sf_time_entries')
        .aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalMinutes: { $sum: { $ifNull: ['$minutes', 0] } },
                billableMinutes: { $sum: { $cond: [{ $eq: ['$billable', true] }, { $ifNull: ['$minutes', 0] }, 0] } },
                entryCount: { $sum: 1 },
            },
        },
    ])
        .toArray())[0] || { totalMinutes: 0, billableMinutes: 0, entryCount: 0 };
    const byUser = await db
        .collection('sf_time_entries')
        .aggregate([
        { $match: match },
        {
            $group: {
                _id: '$userId',
                totalMinutes: { $sum: { $ifNull: ['$minutes', 0] } },
                billableMinutes: { $sum: { $cond: [{ $eq: ['$billable', true] }, { $ifNull: ['$minutes', 0] }, 0] } },
                entryCount: { $sum: 1 },
            },
        },
        { $sort: { totalMinutes: -1 } },
        { $limit: 200 },
    ])
        .toArray();
    const byIssue = await db
        .collection('sf_time_entries')
        .aggregate([
        { $match: match },
        {
            $group: {
                _id: '$issueId',
                totalMinutes: { $sum: { $ifNull: ['$minutes', 0] } },
                billableMinutes: { $sum: { $cond: [{ $eq: ['$billable', true] }, { $ifNull: ['$minutes', 0] }, 0] } },
                entryCount: { $sum: 1 },
            },
        },
        { $sort: { totalMinutes: -1 } },
        { $limit: 200 },
    ])
        .toArray();
    res.json({
        data: {
            projectId: String(pid),
            from: from ? from.toISOString().slice(0, 10) : null,
            to: to ? to.toISOString().slice(0, 10) : null,
            totals: {
                totalMinutes: Number(totalsRow.totalMinutes || 0),
                billableMinutes: Number(totalsRow.billableMinutes || 0),
                nonBillableMinutes: Math.max(0, Number(totalsRow.totalMinutes || 0) - Number(totalsRow.billableMinutes || 0)),
                entryCount: Number(totalsRow.entryCount || 0),
            },
            byUser: byUser.map((r) => ({
                userId: String(r._id || ''),
                totalMinutes: Number(r.totalMinutes || 0),
                billableMinutes: Number(r.billableMinutes || 0),
                nonBillableMinutes: Math.max(0, Number(r.totalMinutes || 0) - Number(r.billableMinutes || 0)),
                entryCount: Number(r.entryCount || 0),
            })),
            byIssue: byIssue.map((r) => ({
                issueId: r._id ? String(r._id) : null,
                totalMinutes: Number(r.totalMinutes || 0),
                billableMinutes: Number(r.billableMinutes || 0),
                nonBillableMinutes: Math.max(0, Number(r.totalMinutes || 0) - Number(r.billableMinutes || 0)),
                entryCount: Number(r.entryCount || 0),
            })),
        },
        error: null,
    });
});
// GET /api/stratflow/projects/:projectId/time-entries (for CSV/export)
stratflowRouter.get('/projects/:projectId/time-entries', async (req, res) => {
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
    const from = parseDateOnlyOrIsoToUtcMidnight(req.query.from);
    const to = parseDateOnlyOrIsoToUtcMidnight(req.query.to);
    const issueIdQ = objIdOrNull(String(req.query.issueId || ''));
    const userIdQ = String(req.query.userId || '').trim();
    const billableQ = String(req.query.billable || '').trim();
    const match = { projectId: pid };
    if (issueIdQ)
        match.issueId = issueIdQ;
    if (userIdQ)
        match.userId = userIdQ;
    if (billableQ === 'true')
        match.billable = true;
    if (billableQ === 'false')
        match.billable = false;
    if (from || to) {
        const range = {};
        if (from)
            range.$gte = from;
        if (to)
            range.$lt = new Date(to.getTime() + 24 * 60 * 60 * 1000);
        match.workDate = range;
    }
    const items = await db
        .collection('sf_time_entries')
        .find(match)
        .sort({ workDate: -1, createdAt: -1 })
        .limit(5000)
        .toArray();
    const issueIds = Array.from(new Set(items.map((it) => it.issueId).filter(Boolean)));
    const userIds = Array.from(new Set(items.map((it) => String(it.userId || '')).filter((x) => ObjectId.isValid(x))));
    const issues = issueIds.length
        ? await db.collection('sf_issues').find({ _id: { $in: issueIds }, projectId: pid }).project({ _id: 1, title: 1, type: 1 }).toArray()
        : [];
    const issueMap = new Map(issues.map((i) => [String(i._id), { title: String(i.title || ''), type: String(i.type || '') }]));
    const users = userIds.length ? await loadUsersByIds(db, userIds) : [];
    const userMap = new Map(users.map((u) => [String(u.id), u]));
    res.json({
        data: {
            projectId: String(pid),
            items: items.map((d) => {
                const iid = d.issueId ? String(d.issueId) : '';
                const uid = String(d.userId || '');
                const i = iid ? issueMap.get(iid) : null;
                const u = uid ? userMap.get(uid) : null;
                return {
                    _id: String(d._id),
                    projectId: String(d.projectId),
                    issueId: iid,
                    userId: uid,
                    minutes: Number(d.minutes || 0),
                    billable: Boolean(d.billable),
                    note: d.note ? String(d.note) : null,
                    workDate: toIsoOrNull(d.workDate),
                    createdAt: toIsoOrNull(d.createdAt),
                    updatedAt: toIsoOrNull(d.updatedAt),
                    issueTitle: i ? i.title : null,
                    issueType: i ? i.type : null,
                    userEmail: u?.email || null,
                    userName: u?.name || null,
                };
            }),
        },
        error: null,
    });
});
// GET /api/stratflow/projects/:projectId/activity
stratflowRouter.get('/projects/:projectId/activity', async (req, res) => {
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
    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 500);
    const items = await db.collection('sf_activity').find({ projectId: pid }).sort({ createdAt: -1 }).limit(limit).toArray();
    res.json({
        data: {
            items: items.map((d) => ({
                ...d,
                _id: String(d._id),
                projectId: String(d.projectId),
                issueId: d.issueId ? String(d.issueId) : null,
                sprintId: d.sprintId ? String(d.sprintId) : null,
                createdAt: toIsoOrNull(d.createdAt),
            })),
        },
        error: null,
    });
});
// GET /api/stratflow/projects/:projectId/epic-rollups
stratflowRouter.get('/projects/:projectId/epic-rollups', async (req, res) => {
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
    const epicDocs = await db.collection('sf_issues').find({ projectId: pid, type: 'Epic' }).sort({ updatedAt: -1 }).limit(2000).toArray();
    const epicIds = epicDocs.map((e) => e._id);
    const rows = await db
        .collection('sf_issues')
        .aggregate([
        { $match: { projectId: pid, epicId: { $in: epicIds } } },
        {
            $group: {
                _id: '$epicId',
                totalIssues: { $sum: 1 },
                doneIssues: { $sum: { $cond: [{ $eq: ['$statusKey', 'done'] }, 1, 0] } },
                totalPoints: { $sum: { $ifNull: ['$storyPoints', 0] } },
                donePoints: { $sum: { $cond: [{ $eq: ['$statusKey', 'done'] }, { $ifNull: ['$storyPoints', 0] }, 0] } },
                blockedCount: {
                    $sum: {
                        $cond: [
                            {
                                $gt: [
                                    {
                                        $size: {
                                            $filter: { input: { $ifNull: ['$links', []] }, as: 'l', cond: { $eq: ['$$l.type', 'blocked_by'] } },
                                        },
                                    },
                                    0,
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
            },
        },
    ])
        .toArray();
    const byEpicId = new Map();
    rows.forEach((r) => byEpicId.set(String(r._id), r));
    res.json({
        data: {
            items: epicDocs.map((e) => {
                const roll = byEpicId.get(String(e._id)) || { totalIssues: 0, doneIssues: 0, totalPoints: 0, donePoints: 0, blockedCount: 0 };
                return {
                    epicId: String(e._id),
                    epicTitle: String(e.title || ''),
                    phase: e.phase ? String(e.phase) : null,
                    targetStartDate: toIsoOrNull(e.targetStartDate),
                    targetEndDate: toIsoOrNull(e.targetEndDate),
                    totalIssues: Number(roll.totalIssues || 0),
                    doneIssues: Number(roll.doneIssues || 0),
                    totalPoints: Number(roll.totalPoints || 0),
                    donePoints: Number(roll.donePoints || 0),
                    blockedCount: Number(roll.blockedCount || 0),
                };
            }),
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
    const timeEntries = await db.collection('sf_time_entries').deleteMany({ projectId });
    const watches = await db.collection('sf_watches').deleteMany({ projectId });
    const notifications = await db.collection('sf_notifications').deleteMany({ projectId });
    const activity = await db.collection('sf_activity').deleteMany({ projectId });
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
        timeEntries: timeEntries.deletedCount || 0,
        watches: watches.deletedCount || 0,
        notifications: notifications.deletedCount || 0,
        activity: activity.deletedCount || 0,
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
