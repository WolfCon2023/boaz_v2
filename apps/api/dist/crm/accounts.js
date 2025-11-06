import { Router } from 'express';
import { getDb } from '../db.js';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
export const accountsRouter = Router();
// Helper function to add history entry
async function addAccountHistory(db, accountId, eventType, description, userId, userName, userEmail, oldValue, newValue, metadata) {
    try {
        await db.collection('account_history').insertOne({
            _id: new ObjectId(),
            accountId,
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
        console.error('Failed to add account history:', err);
        // Don't fail the main operation if history fails
    }
}
accountsRouter.get('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 50)));
    const q = String(req.query.q ?? '').trim();
    const sortKey = req.query.sort ?? 'name';
    const dir = (req.query.dir ?? 'asc').toLowerCase() === 'desc' ? -1 : 1;
    const allowedSort = {
        name: dir,
        companyName: dir,
        accountNumber: dir,
    };
    const sort = allowedSort[sortKey] ? { [sortKey]: allowedSort[sortKey] } : { name: 1 };
    const filter = q
        ? { $or: [{ name: { $regex: q, $options: 'i' } }, { companyName: { $regex: q, $options: 'i' } }] }
        : {};
    const items = await db.collection('accounts').find(filter).sort(sort).limit(limit).toArray();
    res.json({ data: { items }, error: null });
});
// DELETE /api/crm/accounts/:id
accountsRouter.delete('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { ObjectId } = await import('mongodb');
        const _id = new ObjectId(req.params.id);
        await db.collection('accounts').deleteOne({ _id });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
accountsRouter.post('/', async (req, res) => {
    const opt = (schema) => z.preprocess((v) => {
        if (typeof v === 'string') {
            const t = v.trim();
            return t === '' ? undefined : t;
        }
        return v;
    }, schema.optional());
    const schema = z.object({
        name: z.string().trim().min(1),
        companyName: opt(z.string()),
        primaryContactName: opt(z.string()),
        primaryContactEmail: opt(z.string().email()),
        primaryContactPhone: opt(z.string()),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    }
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    // Generate accountNumber starting at 998801
    // Retry logic to handle race conditions and duplicate key errors
    let accountNumber;
    let result;
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
        try {
            // Try to get next sequence (only on first attempt)
            if (accountNumber === undefined) {
                try {
                    const { getNextSequence } = await import('../db.js');
                    accountNumber = await getNextSequence('accountNumber');
                }
                catch { }
                // Fallback if counter not initialized
                if (accountNumber === undefined) {
                    try {
                        const last = await db
                            .collection('accounts')
                            .find({ accountNumber: { $type: 'number' } })
                            .project({ accountNumber: 1 })
                            .sort({ accountNumber: -1 })
                            .limit(1)
                            .toArray();
                        accountNumber = Number(last[0]?.accountNumber ?? 998800) + 1;
                    }
                    catch {
                        accountNumber = 998801;
                    }
                }
            }
            else {
                // If previous attempt failed, increment and try next number
                accountNumber++;
            }
            const doc = { ...parsed.data, accountNumber };
            result = await db.collection('accounts').insertOne(doc);
            break; // Success, exit loop
        }
        catch (err) {
            // Check if it's a duplicate key error
            if (err.code === 11000 && err.keyPattern?.accountNumber) {
                attempts++;
                if (attempts >= maxAttempts) {
                    return res.status(500).json({ data: null, error: 'failed_to_generate_account_number' });
                }
                // Continue loop to retry with incremented number
                continue;
            }
            // Other errors, rethrow
            throw err;
        }
    }
    if (!result || accountNumber === undefined) {
        return res.status(500).json({ data: null, error: 'failed_to_create_account' });
    }
    // Add history entry for creation
    const auth = req.auth;
    if (auth) {
        const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        await addAccountHistory(db, result.insertedId, 'created', `Account created: ${parsed.data.name}${parsed.data.companyName ? ` (${parsed.data.companyName})` : ''}`, auth.userId, user?.name, auth.email);
    }
    else {
        await addAccountHistory(db, result.insertedId, 'created', `Account created: ${parsed.data.name}${parsed.data.companyName ? ` (${parsed.data.companyName})` : ''}`);
    }
    const finalDoc = { ...parsed.data, accountNumber };
    res.status(201).json({ data: { _id: result.insertedId, ...finalDoc }, error: null });
});
// PUT /api/crm/accounts/:id
accountsRouter.put('/:id', async (req, res) => {
    const schema = z.object({
        name: z.string().min(1).optional(),
        companyName: z.string().optional(),
        primaryContactName: z.string().optional(),
        primaryContactEmail: z.string().email().optional(),
        primaryContactPhone: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload' });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        // Get current account for comparison
        const currentAccount = await db.collection('accounts').findOne({ _id });
        if (!currentAccount) {
            return res.status(404).json({ data: null, error: 'not_found' });
        }
        const update = parsed.data;
        const auth = req.auth;
        let user = null;
        if (auth) {
            user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        }
        // Track field changes
        const fieldsToTrack = ['name', 'companyName', 'primaryContactName', 'primaryContactEmail', 'primaryContactPhone'];
        let hasChanges = false;
        for (const field of fieldsToTrack) {
            if (update[field] !== undefined && update[field] !== currentAccount[field]) {
                hasChanges = true;
                const fieldName = field === 'companyName' ? 'Company name' : field === 'primaryContactName' ? 'Primary contact name' : field === 'primaryContactEmail' ? 'Primary contact email' : field === 'primaryContactPhone' ? 'Primary contact phone' : 'Name';
                await addAccountHistory(db, _id, 'field_changed', `${fieldName} changed from "${currentAccount[field] ?? 'empty'}" to "${update[field] ?? 'empty'}"`, auth?.userId, user?.name, auth?.email, currentAccount[field], update[field]);
            }
        }
        await db.collection('accounts').updateOne({ _id }, { $set: update });
        // Add general update entry if no specific changes were tracked
        if (!hasChanges) {
            await addAccountHistory(db, _id, 'updated', 'Account updated', auth?.userId, user?.name, auth?.email);
        }
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// GET /api/crm/accounts/:id/history
accountsRouter.get('/:id/history', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const account = await db.collection('accounts').findOne({ _id });
        if (!account)
            return res.status(404).json({ data: null, error: 'not_found' });
        const createdAt = _id.getTimestamp();
        // Get all history entries for this account, sorted by date (newest first)
        const historyEntries = await db.collection('account_history')
            .find({ accountId: _id })
            .sort({ createdAt: -1 })
            .toArray();
        // Related records (deals, quotes, invoices, activities)
        const deals = await db.collection('deals').find({ accountId: _id }).project({ title: 1, amount: 1, stage: 1, dealNumber: 1, closeDate: 1 }).sort({ _id: -1 }).limit(200).toArray();
        const quotes = await db.collection('quotes').find({ accountId: _id }).project({ title: 1, status: 1, quoteNumber: 1, total: 1, updatedAt: 1, createdAt: 1 }).sort({ updatedAt: -1 }).limit(200).toArray();
        const invoices = await db.collection('invoices').find({ accountId: _id }).project({ title: 1, invoiceNumber: 1, total: 1, status: 1, issuedAt: 1, dueDate: 1, updatedAt: 1 }).sort({ updatedAt: -1 }).limit(200).toArray();
        const activities = await db.collection('activities').find({ accountId: _id }).project({ type: 1, subject: 1, at: 1 }).sort({ at: -1 }).limit(200).toArray();
        res.json({
            data: {
                history: historyEntries,
                createdAt,
                deals,
                quotes,
                invoices,
                activities,
                account: {
                    name: account.name,
                    companyName: account.companyName,
                    accountNumber: account.accountNumber,
                    createdAt,
                }
            },
            error: null
        });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
