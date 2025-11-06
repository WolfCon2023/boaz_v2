import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
// Helper function to add history entry
async function addInvoiceHistory(db, invoiceId, eventType, description, userId, userName, userEmail, oldValue, newValue, metadata) {
    try {
        await db.collection('invoice_history').insertOne({
            _id: new ObjectId(),
            invoiceId,
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
        console.error('Failed to add invoice history:', err);
        // Don't fail the main operation if history fails
    }
}
export const invoicesRouter = Router();
// GET /api/crm/invoices/:id
invoicesRouter.get('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const inv = await db.collection('invoices').findOne({ _id });
        if (!inv)
            return res.status(404).json({ data: null, error: 'not_found' });
        res.json({ data: inv, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// GET /api/crm/invoices/:id/history
invoicesRouter.get('/:id/history', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const inv = await db.collection('invoices').findOne({ _id });
        if (!inv)
            return res.status(404).json({ data: null, error: 'not_found' });
        // Get all history entries for this invoice, sorted by date (newest first)
        const historyEntries = await db.collection('invoice_history')
            .find({ invoiceId: _id })
            .sort({ createdAt: -1 })
            .toArray();
        // Also include payments and refunds as history entries if not already in history
        const payments = inv.payments ?? [];
        const refunds = inv.refunds ?? [];
        // Add payment events to history if not already tracked
        for (const payment of payments) {
            const exists = historyEntries.some(h => h.eventType === 'payment_received' &&
                h.metadata?.paidAt?.toString() === payment.paidAt?.toString() &&
                h.metadata?.amount === payment.amount);
            if (!exists) {
                historyEntries.push({
                    _id: new ObjectId(),
                    invoiceId: _id,
                    eventType: 'payment_received',
                    description: `Payment received: $${payment.amount.toFixed(2)} via ${payment.method}`,
                    createdAt: payment.paidAt instanceof Date ? payment.paidAt : new Date(payment.paidAt),
                    metadata: payment,
                });
            }
        }
        // Add refund events to history if not already tracked
        for (const refund of refunds) {
            const exists = historyEntries.some(h => h.eventType === 'refund_issued' &&
                h.metadata?.refundedAt?.toString() === refund.refundedAt?.toString() &&
                h.metadata?.amount === refund.amount);
            if (!exists) {
                historyEntries.push({
                    _id: new ObjectId(),
                    invoiceId: _id,
                    eventType: 'refund_issued',
                    description: `Refund issued: $${refund.amount.toFixed(2)}${refund.reason !== 'refund' ? ` (${refund.reason})` : ''}`,
                    createdAt: refund.refundedAt instanceof Date ? refund.refundedAt : new Date(refund.refundedAt),
                    metadata: refund,
                });
            }
        }
        // Sort all entries by date (newest first)
        historyEntries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        res.json({
            data: {
                history: historyEntries,
                payments,
                refunds,
                invoice: {
                    title: inv.title,
                    total: inv.total,
                    status: inv.status,
                    invoiceNumber: inv.invoiceNumber,
                    createdAt: inv.createdAt || _id.getTimestamp(),
                    issuedAt: inv.issuedAt,
                    dueDate: inv.dueDate,
                    updatedAt: inv.updatedAt
                }
            },
            error: null
        });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// DELETE /api/crm/invoices/:id
invoicesRouter.delete('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        await db.collection('invoices').deleteOne({ _id });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// GET /api/crm/invoices?q=&sort=&dir=
invoicesRouter.get('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [] }, error: null });
    const q = String(req.query.q ?? '').trim();
    const sortKeyRaw = req.query.sort ?? 'updatedAt';
    const dirParam = (req.query.dir ?? 'desc').toLowerCase();
    const dir = dirParam === 'asc' ? 1 : -1;
    const allowed = new Set(['updatedAt', 'createdAt', 'invoiceNumber', 'total', 'status', 'dueDate']);
    const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'updatedAt';
    const sort = { [sortField]: dir };
    const filter = q
        ? { $or: [
                { title: { $regex: q, $options: 'i' } },
                { status: { $regex: q, $options: 'i' } },
            ] }
        : {};
    const items = await db.collection('invoices').find(filter).sort(sort).limit(200).toArray();
    res.json({ data: { items }, error: null });
});
// POST /api/crm/invoices
invoicesRouter.post('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const raw = req.body ?? {};
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title)
        return res.status(400).json({ data: null, error: 'invalid_payload' });
    let accountId = null;
    if (typeof raw.accountId === 'string' && ObjectId.isValid(raw.accountId))
        accountId = new ObjectId(raw.accountId);
    else if (typeof raw.accountNumber === 'number') {
        const acc = await db.collection('accounts').findOne({ accountNumber: raw.accountNumber });
        if (!acc?._id)
            return res.status(400).json({ data: null, error: 'account_not_found' });
        accountId = acc._id;
    }
    else
        return res.status(400).json({ data: null, error: 'missing_account' });
    const now = new Date();
    const subtotal = Number(raw.subtotal) || 0;
    const tax = Number(raw.tax) || 0;
    const total = Number(raw.total) || subtotal + tax;
    const currency = raw.currency || 'USD';
    const status = raw.status || 'draft'; // draft, open, paid, void, uncollectible
    const dueDate = raw.dueDate ? new Date(raw.dueDate) : null;
    const issuedAt = raw.issuedAt ? new Date(raw.issuedAt) : now;
    const doc = {
        title,
        accountId,
        items: Array.isArray(raw.items) ? raw.items : [],
        subtotal,
        tax,
        total,
        balance: total,
        currency,
        status,
        dueDate,
        issuedAt,
        paidAt: null,
        createdAt: now,
        updatedAt: now,
        payments: [],
        refunds: [],
        // optional: subscriptionId, dunningState, etc.
    };
    // Auto-increment invoiceNumber with fallback
    try {
        const { getNextSequence } = await import('../db.js');
        doc.invoiceNumber = await getNextSequence('invoiceNumber');
    }
    catch { }
    if (doc.invoiceNumber == null) {
        try {
            const last = await db.collection('invoices').find({ invoiceNumber: { $type: 'number' } }).project({ invoiceNumber: 1 }).sort({ invoiceNumber: -1 }).limit(1).toArray();
            doc.invoiceNumber = Number(last[0]?.invoiceNumber ?? 700000) + 1;
        }
        catch {
            doc.invoiceNumber = 700001;
        }
    }
    const result = await db.collection('invoices').insertOne(doc);
    // Add history entry for creation
    const auth = req.auth;
    if (auth) {
        const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        await addInvoiceHistory(db, result.insertedId, 'created', `Invoice created: ${title}`, auth.userId, user?.name, auth.email);
    }
    else {
        await addInvoiceHistory(db, result.insertedId, 'created', `Invoice created: ${title}`);
    }
    res.status(201).json({ data: { _id: result.insertedId, ...doc }, error: null });
});
// PUT /api/crm/invoices/:id
invoicesRouter.put('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        // Get current invoice for comparison
        const currentInvoice = await db.collection('invoices').findOne({ _id });
        if (!currentInvoice) {
            return res.status(404).json({ data: null, error: 'not_found' });
        }
        const raw = req.body ?? {};
        const update = { updatedAt: new Date() };
        const auth = req.auth;
        let user = null;
        if (auth) {
            user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        }
        // Track status changes
        if (typeof raw.status === 'string' && raw.status !== currentInvoice.status) {
            update.status = raw.status;
            await addInvoiceHistory(db, _id, 'status_changed', `Status changed from "${currentInvoice.status}" to "${raw.status}"`, auth?.userId, user?.name, auth?.email, currentInvoice.status, raw.status);
        }
        // Track title changes
        if (typeof raw.title === 'string') {
            const newTitle = raw.title.trim();
            if (newTitle !== currentInvoice.title) {
                update.title = newTitle;
                await addInvoiceHistory(db, _id, 'field_changed', `Title changed from "${currentInvoice.title}" to "${newTitle}"`, auth?.userId, user?.name, auth?.email, currentInvoice.title, newTitle);
            }
        }
        // Track dueDate changes
        if (raw.dueDate != null) {
            const newDueDate = raw.dueDate ? new Date(raw.dueDate) : null;
            const oldDueDate = currentInvoice.dueDate;
            if (newDueDate?.toString() !== oldDueDate?.toString()) {
                update.dueDate = newDueDate;
                await addInvoiceHistory(db, _id, 'field_changed', `Due date changed${oldDueDate ? ` from ${new Date(oldDueDate).toLocaleDateString()}` : ''} to ${newDueDate ? new Date(newDueDate).toLocaleDateString() : 'removed'}`, auth?.userId, user?.name, auth?.email);
            }
        }
        if (raw.issuedAt != null)
            update.issuedAt = raw.issuedAt ? new Date(raw.issuedAt) : null;
        // Track total/items changes
        if (Array.isArray(raw.items)) {
            const oldTotal = currentInvoice.total ?? 0;
            update.items = raw.items;
            update.subtotal = Number(raw.subtotal) || 0;
            update.tax = Number(raw.tax) || 0;
            update.total = Number(raw.total) || (update.subtotal + update.tax);
            // Adjust balance if payments exist: balance = total - sum(payments) + sum(refunds)
            const inv = await db.collection('invoices').findOne({ _id }, { projection: { payments: 1, refunds: 1 } });
            const paid = (inv?.payments ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
            const refunded = (inv?.refunds ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
            update.balance = Math.max(0, update.total - paid + refunded);
            if (update.total !== oldTotal) {
                await addInvoiceHistory(db, _id, 'total_changed', `Total changed from $${oldTotal.toFixed(2)} to $${update.total.toFixed(2)}`, auth?.userId, user?.name, auth?.email, oldTotal, update.total);
            }
        }
        if (raw.accountId && ObjectId.isValid(raw.accountId))
            update.accountId = new ObjectId(raw.accountId);
        await db.collection('invoices').updateOne({ _id }, { $set: update });
        // Add general update entry if no specific changes were tracked
        if (!update.status && !update.title && raw.dueDate === undefined && !Array.isArray(raw.items)) {
            await addInvoiceHistory(db, _id, 'updated', 'Invoice updated', auth?.userId, user?.name, auth?.email);
        }
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// POST /api/crm/invoices/:id/payments { amount, method, paidAt }
invoicesRouter.post('/:id/payments', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const amount = Number(req.body?.amount) || 0;
        if (!(amount > 0))
            return res.status(400).json({ data: null, error: 'invalid_amount' });
        const method = String(req.body?.method || 'card');
        const paidAt = req.body?.paidAt ? new Date(req.body.paidAt) : new Date();
        const inv = await db.collection('invoices').findOne({ _id }, { projection: { total: 1, balance: 1, payments: 1 } });
        if (!inv)
            return res.status(404).json({ data: null, error: 'not_found' });
        const oldBalance = Number(inv.balance ?? inv.total ?? 0);
        const newBalance = Math.max(0, oldBalance - amount);
        const fields = {
            updatedAt: new Date(),
            balance: newBalance,
        };
        if (newBalance === 0)
            fields.paidAt = paidAt;
        const auth = req.auth;
        let user = null;
        if (auth) {
            user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        }
        await db.collection('invoices').updateOne({ _id }, { $push: { payments: { amount, method, paidAt } }, $set: fields });
        // Add history entry for payment
        await addInvoiceHistory(db, _id, 'payment_received', `Payment received: $${amount.toFixed(2)} via ${method}. Balance: $${oldBalance.toFixed(2)} → $${newBalance.toFixed(2)}`, auth?.userId, user?.name, auth?.email, oldBalance, newBalance, { amount, method, paidAt });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// POST /api/crm/invoices/:id/refunds { amount, reason, refundedAt }
invoicesRouter.post('/:id/refunds', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const amount = Number(req.body?.amount) || 0;
        if (!(amount > 0))
            return res.status(400).json({ data: null, error: 'invalid_amount' });
        const reason = String(req.body?.reason || 'refund');
        const refundedAt = req.body?.refundedAt ? new Date(req.body.refundedAt) : new Date();
        const inv = await db.collection('invoices').findOne({ _id }, { projection: { balance: 1 } });
        if (!inv)
            return res.status(404).json({ data: null, error: 'not_found' });
        // Refunds increase balance (merchant owes customer) — we keep balance non-negative for simplicity
        const oldBalance = Number(inv.balance ?? 0);
        const newBalance = oldBalance + amount;
        const auth = req.auth;
        let user = null;
        if (auth) {
            user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        }
        await db.collection('invoices').updateOne({ _id }, { $push: { refunds: { amount, reason, refundedAt } }, $set: { updatedAt: new Date(), balance: newBalance } });
        // Add history entry for refund
        await addInvoiceHistory(db, _id, 'refund_issued', `Refund issued: $${amount.toFixed(2)}${reason !== 'refund' ? ` (${reason})` : ''}. Balance: $${oldBalance.toFixed(2)} → $${newBalance.toFixed(2)}`, auth?.userId, user?.name, auth?.email, oldBalance, newBalance, { amount, reason, refundedAt });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// POST /api/crm/invoices/:id/subscribe { interval, startAt }
invoicesRouter.post('/:id/subscribe', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const interval = String(req.body?.interval || 'monthly');
        const startAt = req.body?.startAt ? new Date(req.body.startAt) : new Date();
        const next = new Date(startAt);
        if (interval === 'monthly')
            next.setMonth(next.getMonth() + 1);
        else
            next.setFullYear(next.getFullYear() + 1);
        const auth = req.auth;
        let user = null;
        if (auth) {
            user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        }
        await db.collection('invoices').updateOne({ _id }, { $set: { updatedAt: new Date(), subscription: { interval, active: true, startedAt: startAt, nextInvoiceAt: next } } });
        // Add history entry
        await addInvoiceHistory(db, _id, 'subscription_started', `Subscription started: ${interval} billing`, auth?.userId, user?.name, auth?.email, null, { interval, startAt, nextInvoiceAt: next });
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// POST /api/crm/invoices/:id/cancel-subscription
invoicesRouter.post('/:id/cancel-subscription', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const auth = req.auth;
        let user = null;
        if (auth) {
            user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        }
        await db.collection('invoices').updateOne({ _id }, { $set: { updatedAt: new Date(), 'subscription.active': false, 'subscription.canceledAt': new Date() } });
        // Add history entry
        await addInvoiceHistory(db, _id, 'subscription_canceled', 'Subscription canceled', auth?.userId, user?.name, auth?.email);
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
// POST /api/crm/invoices/:id/dunning { state }
invoicesRouter.post('/:id/dunning', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const _id = new ObjectId(req.params.id);
        const state = String(req.body?.state || 'none');
        const currentInvoice = await db.collection('invoices').findOne({ _id });
        const oldState = currentInvoice?.dunningState || 'none';
        const auth = req.auth;
        let user = null;
        if (auth) {
            user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) });
        }
        await db.collection('invoices').updateOne({ _id }, { $set: { updatedAt: new Date(), dunningState: state, lastDunningAt: new Date() } });
        // Add history entry
        if (state !== oldState) {
            await addInvoiceHistory(db, _id, 'dunning_state_changed', `Dunning state changed from "${oldState}" to "${state}"`, auth?.userId, user?.name, auth?.email, oldState, state);
        }
        res.json({ data: { ok: true }, error: null });
    }
    catch {
        res.status(400).json({ data: null, error: 'invalid_id' });
    }
});
