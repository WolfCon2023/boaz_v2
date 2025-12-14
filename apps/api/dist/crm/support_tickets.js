import { Router } from 'express';
import { getDb, getNextSequence } from '../db.js';
import { ObjectId } from 'mongodb';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { sendAuthEmail } from '../auth/email.js';
import { env } from '../env.js';
import { generateEmailTemplate, formatEmailTimestamp } from '../lib/email-templates.js';
import { requireAuth } from '../auth/rbac.js';
export const supportTicketsRouter = Router();
// === Ticket Attachments (disk storage, similar to CRM documents) ===
const ticketUploadDir = env.UPLOAD_DIR
    ? path.join(env.UPLOAD_DIR, 'ticket_attachments')
    : path.join(process.cwd(), 'uploads', 'ticket_attachments');
function ensureTicketUploadDir() {
    if (fs.existsSync(ticketUploadDir))
        return;
    fs.mkdirSync(ticketUploadDir, { recursive: true });
}
const ticketAttachmentStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        try {
            // Lazily create the directory to avoid any startup-time filesystem stalls in some hosts.
            ensureTicketUploadDir();
            cb(null, ticketUploadDir);
        }
        catch (e) {
            cb(e, ticketUploadDir);
        }
    },
    filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const ts = Date.now();
        const ext = path.extname(safe);
        const name = path.basename(safe, ext);
        cb(null, `${ts}-${name}${ext}`);
    },
});
const uploadTicketAttachments = multer({
    storage: ticketAttachmentStorage,
    limits: { fileSize: 50 * 1024 * 1024, files: 10 }, // 50MB each, up to 10 files per request
    fileFilter: (_req, _file, cb) => cb(null, true),
});
// Helper to extract email from assignee string (format: "Name <email>" or just "email")
function extractAssigneeEmail(assignee) {
    if (!assignee || typeof assignee !== 'string')
        return null;
    const match = assignee.match(/<(.+?)>/);
    if (match)
        return match[1].trim();
    // If no angle brackets, assume it's just an email
    if (assignee.includes('@'))
        return assignee.trim();
    return null;
}
// Helper to send ticket notification email
async function sendTicketNotification(db, ticket, assigneeEmail) {
    try {
        const webUrl = env.ORIGIN.split(',')[0].trim(); // Use first origin if multiple
        const ticketUrl = `${webUrl}/apps/crm/support/tickets?ticket=${ticket._id?.toHexString()}`;
        // Get account and contact info if available
        let accountName = '';
        let contactName = '';
        if (ticket.accountId) {
            const account = await db.collection('accounts').findOne({ _id: ticket.accountId });
            if (account)
                accountName = account.name || '';
        }
        if (ticket.contactId) {
            const contact = await db.collection('contacts').findOne({ _id: ticket.contactId });
            if (contact)
                contactName = contact.name || contact.email || '';
        }
        // Build info box items
        const infoItems = [
            { label: 'Ticket Number', value: `#${ticket.ticketNumber || 'N/A'}` },
            { label: 'Subject', value: ticket.shortDescription },
        ];
        if (ticket.description) {
            infoItems.push({ label: 'Description', value: ticket.description });
        }
        const priorityBadge = (ticket.priority || 'normal').toUpperCase();
        infoItems.push({ label: 'Priority', value: priorityBadge });
        infoItems.push({ label: 'Status', value: (ticket.status || 'open').toUpperCase() });
        if (accountName) {
            infoItems.push({ label: 'Account', value: accountName });
        }
        if (contactName) {
            infoItems.push({ label: 'Contact', value: contactName });
        }
        if (ticket.requesterName || ticket.requesterEmail) {
            const requester = `${ticket.requesterName || ''} ${ticket.requesterEmail ? `<${ticket.requesterEmail}>` : ''}`.trim();
            infoItems.push({ label: 'Requester', value: requester });
        }
        if (ticket.slaDueAt) {
            infoItems.push({ label: 'SLA Due', value: formatEmailTimestamp(new Date(ticket.slaDueAt)) });
        }
        infoItems.push({ label: 'Created', value: formatEmailTimestamp(new Date(ticket.createdAt)) });
        // Generate email using unified template
        const { html, text } = generateEmailTemplate({
            header: {
                title: 'Support Ticket Assigned',
                subtitle: `Ticket #${ticket.ticketNumber || 'N/A'}`,
                icon: '🎟️',
            },
            content: {
                message: 'A new support ticket has been assigned to you. Please review the details below and take appropriate action.',
                infoBox: {
                    title: 'Ticket Details',
                    items: infoItems,
                },
                actionButton: {
                    text: 'View Ticket',
                    url: ticketUrl,
                },
                additionalInfo: 'This ticket has been assigned to you in the BOAZ-OS Help Desk. Click the button above to view full details and respond to the ticket.',
            },
        });
        await sendAuthEmail({
            to: assigneeEmail,
            subject: `🎟️ Support Ticket #${ticket.ticketNumber || 'N/A'} Assigned: ${ticket.shortDescription}`,
            html,
            text,
        });
        console.log(`✅ Ticket notification sent to ${assigneeEmail} for ticket #${ticket.ticketNumber}`);
    }
    catch (error) {
        console.error(`❌ Failed to send ticket notification to ${assigneeEmail}:`, error);
        // Don't throw - we don't want email failures to prevent ticket creation
    }
}
// POST /api/crm/support/tickets/:id/attachments (multipart/form-data with files[])
supportTicketsRouter.post('/tickets/:id/attachments', requireAuth, uploadTicketAttachments.array('files', 10), async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const ticket = await db.collection('support_tickets').findOne({ _id });
        if (!ticket)
            return res.status(404).json({ data: null, error: 'not_found' });
        const auth = req.auth;
        const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        const userName = user?.name || auth.email;
        const files = req.files ?? [];
        if (!files.length)
            return res.status(400).json({ data: null, error: 'missing_files' });
        const attachments = files.map((f) => ({
            _id: new ObjectId(),
            filename: f.filename,
            originalFilename: f.originalname,
            contentType: f.mimetype,
            size: f.size,
            path: f.path,
            uploadedAt: new Date(),
            uploadedByUserId: new ObjectId(auth.userId),
            uploadedByName: userName,
            uploadedByEmail: auth.email,
        }));
        await db.collection('support_tickets').updateOne({ _id }, {
            $push: { attachments: { $each: attachments } },
            $set: { updatedAt: new Date() },
        });
        res.json({
            data: {
                items: attachments.map((a) => ({
                    id: a._id.toHexString(),
                    name: a.originalFilename,
                    size: a.size,
                    contentType: a.contentType,
                    uploadedAt: a.uploadedAt,
                    uploadedByName: a.uploadedByName,
                    uploadedByEmail: a.uploadedByEmail,
                })),
            },
            error: null,
        });
    }
    catch (e) {
        console.error('Ticket attachment upload error:', e);
        res.status(400).json({ data: null, error: e?.message || 'upload_failed' });
    }
});
// GET /api/crm/support/tickets/:id/attachments/:attachmentId/download
supportTicketsRouter.get('/tickets/:id/attachments/:attachmentId/download', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const attId = new ObjectId(req.params.attachmentId);
        const ticket = await db.collection('support_tickets').findOne({ _id }, { projection: { attachments: 1 } });
        if (!ticket)
            return res.status(404).json({ data: null, error: 'not_found' });
        const att = (ticket.attachments ?? []).find((a) => String(a._id) === String(attId));
        if (!att)
            return res.status(404).json({ data: null, error: 'attachment_not_found' });
        if (!att.path || !fs.existsSync(att.path))
            return res.status(404).json({ data: null, error: 'file_missing' });
        res.setHeader('Content-Type', att.contentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${String(att.originalFilename || 'attachment').replace(/"/g, '')}"`);
        fs.createReadStream(att.path).pipe(res);
    }
    catch (e) {
        res.status(400).json({ data: null, error: e?.message || 'invalid_request' });
    }
});
// DELETE /api/crm/support/tickets/:id/attachments/:attachmentId
supportTicketsRouter.delete('/tickets/:id/attachments/:attachmentId', requireAuth, async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const attId = new ObjectId(req.params.attachmentId);
        const ticket = await db
            .collection('support_tickets')
            .findOne({ _id }, { projection: { attachments: 1 } });
        if (!ticket)
            return res.status(404).json({ data: null, error: 'not_found' });
        const att = (ticket.attachments ?? []).find((a) => String(a._id) === String(attId));
        if (!att)
            return res.status(404).json({ data: null, error: 'attachment_not_found' });
        await db.collection('support_tickets').updateOne({ _id }, {
            $pull: { attachments: { _id: attId } },
            $set: { updatedAt: new Date() },
        });
        // Best-effort disk cleanup; don't fail the request if the file is already missing.
        try {
            if (att.path && fs.existsSync(att.path))
                fs.unlinkSync(att.path);
        }
        catch (e) {
            console.warn('Failed to delete ticket attachment file:', e);
        }
        return res.json({ data: { ok: true }, error: null });
    }
    catch (e) {
        return res.status(400).json({ data: null, error: e?.message || 'invalid_request' });
    }
});
// GET /api/crm/support/tickets?q=&status=&priority=&accountId=&contactId=&sort=&dir=&breached=&dueWithin=
supportTicketsRouter.get('/tickets', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '');
    const statusesRaw = String(req.query.statuses ?? '');
    const priority = String(req.query.priority ?? '');
    const accountId = String(req.query.accountId ?? '');
    const contactId = String(req.query.contactId ?? '');
    const dir = (req.query.dir ?? 'desc').toLowerCase() === 'asc' ? 1 : -1;
    const sortKey = req.query.sort ?? 'createdAt';
    const sort = { [sortKey]: dir };
    const filter = {};
    if (q)
        filter.$or = [{ title: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }];
    if (statusesRaw) {
        const list = statusesRaw.split(',').map((s) => s.trim()).filter(Boolean);
        if (list.length > 0)
            filter.status = { $in: list };
    }
    else if (status)
        filter.status = status;
    if (priority)
        filter.priority = priority;
    if (ObjectId.isValid(accountId))
        filter.accountId = new ObjectId(accountId);
    if (ObjectId.isValid(contactId))
        filter.contactId = new ObjectId(contactId);
    const now = new Date();
    const breached = String(req.query.breached ?? '');
    const dueWithin = Number(req.query.dueWithin ?? '');
    if (breached === '1') {
        // Explicitly prefer breached filter when both are present
        filter.slaDueAt = { $ne: null, $lt: now };
    }
    else if (!isNaN(dueWithin) && dueWithin > 0) {
        const until = new Date(now.getTime() + dueWithin * 60 * 1000);
        filter.slaDueAt = { $ne: null, $gte: now, $lte: until };
    }
    const items = await db.collection('support_tickets').find(filter).sort(sort).limit(200).toArray();
    res.json({ data: { items }, error: null });
});
// GET /api/crm/support/tickets/by-account?accountIds=id1,id2
supportTicketsRouter.get('/tickets/by-account', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const rawIds = String(req.query.accountIds ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (!rawIds.length) {
        return res.json({ data: { items: [] }, error: null });
    }
    const idMap = new Map();
    for (const id of rawIds) {
        if (ObjectId.isValid(id)) {
            idMap.set(id, new ObjectId(id));
        }
    }
    if (!idMap.size) {
        return res.json({ data: { items: [] }, error: null });
    }
    const now = new Date();
    const coll = db.collection('support_tickets');
    const rows = await coll
        .aggregate([
        {
            $match: {
                accountId: { $in: Array.from(idMap.values()) },
                status: { $in: ['open', 'pending'] },
            },
        },
        {
            $group: {
                _id: '$accountId',
                open: { $sum: 1 },
                high: {
                    $sum: {
                        $cond: [
                            { $in: ['$priority', ['high', 'urgent', 'p1']] },
                            1,
                            0,
                        ],
                    },
                },
                breached: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ['$slaDueAt', null] },
                                    { $lt: ['$slaDueAt', now] },
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
    const items = rows
        .filter((r) => r._id)
        .map((r) => ({
        accountId: String(r._id),
        open: r.open ?? 0,
        high: r.high ?? 0,
        breached: r.breached ?? 0,
    }));
    return res.json({ data: { items }, error: null });
});
// GET /api/crm/support/tickets/metrics
supportTicketsRouter.get('/tickets/metrics', async (_req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { open: 0, breached: 0, dueNext60: 0 }, error: null });
    const now = new Date();
    const next60 = new Date(now.getTime() + 60 * 60 * 1000);
    const coll = db.collection('support_tickets');
    const [open, breached, dueNext60] = await Promise.all([
        coll.countDocuments({ status: { $in: ['open', 'pending'] } }),
        coll.countDocuments({ status: { $in: ['open', 'pending'] }, slaDueAt: { $ne: null, $lt: now } }),
        coll.countDocuments({ status: { $in: ['open', 'pending'] }, slaDueAt: { $gte: now, $lte: next60 } }),
    ]);
    res.json({ data: { open, breached, dueNext60 }, error: null });
});
// Alias: GET /api/crm/support/metrics (same payload)
supportTicketsRouter.get('/metrics', async (_req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { open: 0, breached: 0, dueNext60: 0 }, error: null });
    const now = new Date();
    const next60 = new Date(now.getTime() + 60 * 60 * 1000);
    const coll = db.collection('support_tickets');
    const [open, breached, dueNext60] = await Promise.all([
        coll.countDocuments({ status: { $in: ['open', 'pending'] } }),
        coll.countDocuments({ status: { $in: ['open', 'pending'] }, slaDueAt: { $ne: null, $lt: now } }),
        coll.countDocuments({ status: { $in: ['open', 'pending'] }, slaDueAt: { $gte: now, $lte: next60 } }),
    ]);
    res.json({ data: { open, breached, dueNext60 }, error: null });
});
// POST /api/crm/support/tickets
supportTicketsRouter.post('/tickets', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const raw = req.body ?? {};
        const shortDescription = typeof raw.shortDescription === 'string' && raw.shortDescription.trim()
            ? raw.shortDescription.trim()
            : (typeof raw.title === 'string' ? raw.title.trim() : '');
        if (!shortDescription)
            return res.status(400).json({ data: null, error: 'invalid_payload' });
        const descRaw = typeof raw.description === 'string' ? raw.description : '';
        const description = descRaw.length > 2500 ? descRaw.slice(0, 2500) : descRaw;
        const doc = {
            shortDescription,
            description,
            status: raw.status || 'open',
            priority: raw.priority || 'normal',
            accountId: ObjectId.isValid(raw.accountId) ? new ObjectId(raw.accountId) : null,
            contactId: ObjectId.isValid(raw.contactId) ? new ObjectId(raw.contactId) : null,
            assignee: raw.assignee || null,
            assigneeId: ObjectId.isValid(raw.assigneeId) ? new ObjectId(raw.assigneeId) : null,
            owner: raw.owner || null,
            ownerId: ObjectId.isValid(raw.ownerId) ? new ObjectId(raw.ownerId) : null,
            slaDueAt: raw.slaDueAt ? new Date(raw.slaDueAt) : null,
            comments: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            requesterName: typeof raw.requesterName === 'string' ? raw.requesterName : null,
            requesterEmail: typeof raw.requesterEmail === 'string' ? raw.requesterEmail : null,
            requesterPhone: typeof raw.requesterPhone === 'string' ? raw.requesterPhone : null,
            type: typeof raw.type === 'string' ? raw.type : 'internal',
        };
        try {
            doc.ticketNumber = await getNextSequence('ticketNumber');
        }
        catch { }
        if (doc.ticketNumber == null)
            doc.ticketNumber = 200001;
        const coll = db.collection('support_tickets');
        // Robust retry loop to avoid duplicate numbers under contention
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const result = await coll.insertOne(doc);
                doc._id = result.insertedId;
                // Send email notification to assignee if assigned
                if (doc.assignee) {
                    const assigneeEmail = extractAssigneeEmail(doc.assignee);
                    if (assigneeEmail) {
                        // Send email asynchronously (don't wait)
                        sendTicketNotification(db, doc, assigneeEmail).catch(err => {
                            console.error('Failed to send ticket notification:', err);
                        });
                    }
                }
                return res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null });
            }
            catch (errInsert) {
                if (errInsert && typeof errInsert === 'object' && 'code' in errInsert && errInsert.code === 11000) {
                    // Align counter and pick next number deterministically from current max
                    const maxDocs = await coll
                        .find({}, { projection: { ticketNumber: 1 } })
                        .sort({ ticketNumber: -1 })
                        .limit(1)
                        .toArray();
                    const maxNum = maxDocs[0]?.ticketNumber ?? 200000;
                    await db
                        .collection('counters')
                        .updateOne({ _id: 'ticketNumber' }, [{ $set: { seq: { $max: ['$seq', maxNum] } } }], { upsert: true });
                    // Set next candidate directly to max+1 to break tie immediately
                    doc.ticketNumber = (maxNum ?? 200000) + 1;
                    continue;
                }
                throw errInsert;
            }
        }
        return res.status(409).json({ data: null, error: 'duplicate_ticketNumber' });
    }
    catch (err) {
        console.error('create_ticket_error', err);
        if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
            return res.status(409).json({ data: null, error: 'duplicate_ticketNumber' });
        }
        const details = {};
        if (err && typeof err === 'object') {
            if ('message' in err && typeof err.message === 'string')
                details.message = err.message;
            if ('code' in err && typeof err.code !== 'undefined')
                details.code = err.code;
            if ('name' in err && typeof err.name === 'string')
                details.name = err.name;
            if ('errmsg' in err && typeof err.errmsg === 'string')
                details.errmsg = err.errmsg;
            if ('keyPattern' in err)
                details.keyPattern = err.keyPattern;
            if ('keyValue' in err)
                details.keyValue = err.keyValue;
        }
        return res.status(500).json({ data: null, error: 'insert_failed', details });
    }
});
// PUBLIC PORTAL
// POST /api/crm/support/portal/tickets { shortDescription, description, requesterName, requesterEmail, requesterPhone }
supportTicketsRouter.post('/portal/tickets', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const raw = req.body ?? {};
        const shortDescription = typeof raw.shortDescription === 'string' ? raw.shortDescription.trim() : '';
        const requesterName = typeof raw.requesterName === 'string' ? raw.requesterName.trim() : '';
        const requesterEmail = typeof raw.requesterEmail === 'string' ? raw.requesterEmail.trim() : '';
        const requesterPhone = typeof raw.requesterPhone === 'string' ? raw.requesterPhone.trim() : '';
        // Validate required fields
        // Support Portal UI only requires email + short description. Phone/name are optional.
        if (!shortDescription) {
            return res.status(400).json({ data: null, error: 'missing_shortDescription' });
        }
        if (!requesterEmail && !requesterPhone) {
            return res.status(400).json({ data: null, error: 'missing_contact' });
        }
        const description = typeof raw.description === 'string' ? raw.description.slice(0, 2500) : '';
        const doc = {
            shortDescription,
            description,
            status: 'open',
            priority: 'normal',
            accountId: null,
            contactId: null,
            assignee: null,
            assigneeId: null,
            owner: null,
            ownerId: null,
            slaDueAt: null,
            comments: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            requesterName: requesterName || requesterEmail || 'Customer',
            requesterEmail: requesterEmail || null,
            requesterPhone: requesterPhone || null,
            type: 'external',
        };
        try {
            doc.ticketNumber = await getNextSequence('ticketNumber');
        }
        catch { }
        if (doc.ticketNumber == null)
            doc.ticketNumber = 200001;
        const coll = db.collection('support_tickets');
        // Use the same robust retry logic as the internal ticket creation route
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const result = await coll.insertOne(doc);
                doc._id = result.insertedId;
                // Send email notification to assignee if assigned (for portal tickets too)
                if (doc.assignee) {
                    const assigneeEmail = extractAssigneeEmail(doc.assignee);
                    if (assigneeEmail) {
                        // Send email asynchronously (don't wait)
                        sendTicketNotification(db, doc, assigneeEmail).catch(err => {
                            console.error('Failed to send ticket notification:', err);
                        });
                    }
                }
                return res
                    .status(201)
                    .json({ data: { _id: result.insertedId, ticketNumber: doc.ticketNumber }, error: null });
            }
            catch (errInsert) {
                if (errInsert && typeof errInsert === 'object' && 'code' in errInsert && errInsert.code === 11000) {
                    // Duplicate ticketNumber – align counter with current max and try the next number
                    const maxDocs = await coll
                        .find({}, { projection: { ticketNumber: 1 } })
                        .sort({ ticketNumber: -1 })
                        .limit(1)
                        .toArray();
                    const maxNum = maxDocs[0]?.ticketNumber ?? 200000;
                    await db
                        .collection('counters')
                        .updateOne({ _id: 'ticketNumber' }, [{ $set: { seq: { $max: ['$seq', maxNum] } } }], { upsert: true });
                    doc.ticketNumber = (maxNum ?? 200000) + 1;
                    continue;
                }
                throw errInsert;
            }
        }
        return res.status(409).json({ data: null, error: 'duplicate_ticketNumber' });
    }
    catch (err) {
        console.error('portal_create_ticket_error', err);
        if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
            return res.status(409).json({ data: null, error: 'duplicate_ticketNumber' });
        }
        return res.status(500).json({ data: null, error: 'insert_failed' });
    }
});
// GET /api/crm/support/portal/tickets/:ticketNumber
supportTicketsRouter.get('/portal/tickets/:ticketNumber', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const num = Number(req.params.ticketNumber);
    if (!num)
        return res.status(400).json({ data: null, error: 'invalid_ticketNumber' });
    const item = await db.collection('support_tickets').findOne({ ticketNumber: num });
    if (!item)
        return res.status(404).json({ data: null, error: 'not_found' });
    res.json({ data: { item }, error: null });
});
// POST /api/crm/support/portal/tickets/:ticketNumber/comments { body, author }
supportTicketsRouter.post('/portal/tickets/:ticketNumber/comments', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const num = Number(req.params.ticketNumber);
    if (!num)
        return res.status(400).json({ data: null, error: 'invalid_ticketNumber' });
    const comment = { author: req.body?.author || 'customer', body: String(req.body?.body || ''), at: new Date() };
    await db.collection('support_tickets').updateOne({ ticketNumber: num }, { $push: { comments: comment }, $set: { updatedAt: new Date() } });
    res.json({ data: { ok: true }, error: null });
});
// PUT /api/crm/support/tickets/:id
supportTicketsRouter.put('/tickets/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        // Get current ticket to check if assignee is changing
        const currentTicket = await db.collection('support_tickets').findOne({ _id });
        if (!currentTicket) {
            return res.status(404).json({ data: null, error: 'ticket_not_found' });
        }
        const update = { updatedAt: new Date() };
        // Accept both 'shortDescription' and legacy 'title' for compatibility
        if (typeof (req.body ?? {}).shortDescription === 'string')
            update.shortDescription = req.body.shortDescription;
        else if (typeof (req.body ?? {}).title === 'string')
            update.shortDescription = req.body.title;
        for (const k of ['status', 'priority', 'assignee', 'owner'])
            if (typeof (req.body ?? {})[k] === 'string')
                update[k] = req.body[k];
        if (typeof (req.body ?? {}).description === 'string') {
            const d = String(req.body.description);
            update.description = d.length > 2500 ? d.slice(0, 2500) : d;
        }
        if (req.body?.slaDueAt)
            update.slaDueAt = new Date(req.body.slaDueAt);
        if (req.body?.accountId && ObjectId.isValid(req.body.accountId))
            update.accountId = new ObjectId(req.body.accountId);
        if (req.body?.contactId && ObjectId.isValid(req.body.contactId))
            update.contactId = new ObjectId(req.body.contactId);
        if (req.body?.assigneeId && ObjectId.isValid(req.body.assigneeId))
            update.assigneeId = new ObjectId(req.body.assigneeId);
        if (req.body?.ownerId && ObjectId.isValid(req.body.ownerId))
            update.ownerId = new ObjectId(req.body.ownerId);
        await db.collection('support_tickets').updateOne({ _id }, { $set: update });
        // Send email notification if assignee was added or changed
        if (update.assignee && update.assignee !== currentTicket.assignee) {
            const assigneeEmail = extractAssigneeEmail(update.assignee);
            if (assigneeEmail) {
                // Get updated ticket with all fields for email
                const updatedTicket = await db.collection('support_tickets').findOne({ _id });
                if (updatedTicket) {
                    // Send email asynchronously (don't wait)
                    sendTicketNotification(db, updatedTicket, assigneeEmail).catch(err => {
                        console.error('Failed to send ticket notification on update:', err);
                    });
                }
            }
        }
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// POST /api/crm/support/tickets/:id/comments { author, body }
supportTicketsRouter.post('/tickets/:id/comments', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const comment = { author: (req.body?.author || 'system'), body: String(req.body?.body || ''), at: new Date() };
        await db.collection('support_tickets').updateOne({ _id }, { $push: { comments: comment }, $set: { updatedAt: new Date() } });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// DELETE /api/crm/support/tickets/:id - Delete a ticket (admin only)
supportTicketsRouter.delete('/tickets/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const result = await db.collection('support_tickets').deleteOne({ _id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ data: null, error: 'ticket_not_found' });
        }
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// POST /api/crm/support/tickets/:id/notify-customer - Send update email to customer
supportTicketsRouter.post('/tickets/:id/notify-customer', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const { message, ccEmails } = req.body;
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ data: null, error: 'message_required' });
        }
        // Get ticket details
        const ticket = await db.collection('support_tickets').findOne({ _id });
        if (!ticket) {
            return res.status(404).json({ data: null, error: 'ticket_not_found' });
        }
        if (!ticket.requesterEmail) {
            return res.status(400).json({ data: null, error: 'no_requester_email' });
        }
        // Send email
        const webUrl = env.ORIGIN.split(',')[0].trim();
        const ticketUrl = `${webUrl}/customer/tickets`;
        const { html, text } = generateEmailTemplate({
            header: {
                title: 'Ticket Update',
                subtitle: `Ticket #${ticket.ticketNumber || 'N/A'}`,
                icon: '📬',
            },
            content: {
                greeting: `Hello ${ticket.requesterName || 'Customer'},`,
                message: message,
                infoBox: {
                    title: 'Ticket Details',
                    items: [
                        { label: 'Ticket Number', value: `#${ticket.ticketNumber || 'N/A'}` },
                        { label: 'Subject', value: ticket.shortDescription },
                        { label: 'Status', value: (ticket.status || 'open').toUpperCase() },
                        { label: 'Priority', value: (ticket.priority || 'normal').toUpperCase() },
                    ],
                },
                actionButton: {
                    text: 'View Ticket',
                    url: ticketUrl,
                },
                additionalInfo: 'You can view the full ticket details and add comments by logging into the customer portal.',
            },
        });
        // Prepare recipients
        const recipients = [ticket.requesterEmail];
        if (ccEmails && typeof ccEmails === 'string') {
            const ccList = ccEmails.split(',').map(e => e.trim()).filter(Boolean);
            recipients.push(...ccList);
        }
        // Send to all recipients
        for (const recipient of recipients) {
            await sendAuthEmail({
                to: recipient,
                subject: `📬 Ticket Update: #${ticket.ticketNumber || 'N/A'} - ${ticket.shortDescription}`,
                html,
                text,
            });
        }
        // Add a system comment to the ticket
        const comment = {
            author: 'system',
            body: `Update sent to customer (${recipients.join(', ')}): ${message}`,
            at: new Date(),
        };
        await db.collection('support_tickets').updateOne({ _id }, {
            $push: { comments: comment },
            $set: { updatedAt: new Date() },
        });
        console.log(`✅ Customer update sent for ticket #${ticket.ticketNumber} to ${recipients.join(', ')}`);
        res.json({ data: { ok: true, recipients }, error: null });
    }
    catch (err) {
        console.error('Send customer update error:', err);
        res.status(500).json({ data: null, error: err.message || 'send_failed' });
    }
});
