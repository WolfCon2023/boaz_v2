/**
 * CRM Expenses Module
 *
 * Manages business expenses with approval workflow and automatic posting
 * to Financial Intelligence when expenses are paid.
 *
 * Workflow: Draft -> Pending Approval -> Approved -> Paid
 *
 * When paid, creates journal entry:
 *   DR: Expense Account(s)
 *   CR: Cash/Bank Account
 */
import { Router } from 'express';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth, requirePermission } from '../auth/rbac.js';
export const expensesRouter = Router();
expensesRouter.use(requireAuth);
// Expense categories with default account mappings
const EXPENSE_CATEGORIES = [
    { category: 'Cost of Services', accountNumber: '5000' },
    { category: 'Contractor Costs', accountNumber: '5200' },
    { category: 'Hosting & Infrastructure', accountNumber: '5300' },
    { category: 'Third-Party Services', accountNumber: '5400' },
    { category: 'Salaries & Wages', accountNumber: '6000' },
    { category: 'Payroll Taxes', accountNumber: '6100' },
    { category: 'Employee Benefits', accountNumber: '6150' },
    { category: 'Rent', accountNumber: '6200' },
    { category: 'Utilities', accountNumber: '6250' },
    { category: 'Software Subscriptions', accountNumber: '6300' },
    { category: 'Marketing & Advertising', accountNumber: '6400' },
    { category: 'Professional Services', accountNumber: '6500' },
    { category: 'Travel & Entertainment', accountNumber: '6600' },
    { category: 'Insurance', accountNumber: '6700' },
    { category: 'Office Supplies', accountNumber: '6800' },
    { category: 'Bank Fees', accountNumber: '7100' },
    { category: 'Other Expense', accountNumber: '6900' },
];
const expenseLineSchema = z.object({
    category: z.string().trim().min(1),
    accountNumber: z.string().trim().optional(),
    amount: z.number().positive(),
    description: z.string().trim().optional(),
    projectId: z.string().trim().optional(),
});
const createExpenseSchema = z.object({
    date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    vendorId: z.string().trim().optional(),
    vendorName: z.string().trim().optional(),
    payee: z.string().trim().optional(),
    description: z.string().trim().min(1),
    lines: z.array(expenseLineSchema).min(1),
    paymentMethod: z.string().trim().optional(),
    referenceNumber: z.string().trim().optional(),
    notes: z.string().trim().optional(),
});
const updateExpenseSchema = createExpenseSchema.partial();
async function getNextExpenseNumber(db) {
    const result = await db.collection('sequences').findOneAndUpdate({ _id: 'crm_expenses' }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after' });
    if (!result || !result.value) {
        await db.collection('sequences').updateOne({ _id: 'crm_expenses' }, { $set: { value: 1001 } }, { upsert: true });
        return 1001;
    }
    return result.value;
}
function serializeExpense(doc) {
    return {
        _id: doc._id.toHexString(),
        expenseNumber: doc.expenseNumber,
        date: doc.date instanceof Date ? doc.date.toISOString() : doc.date,
        vendorId: doc.vendorId?.toHexString(),
        vendorName: doc.vendorName,
        payee: doc.payee,
        description: doc.description,
        lines: doc.lines,
        total: doc.total,
        paymentMethod: doc.paymentMethod,
        referenceNumber: doc.referenceNumber,
        status: doc.status,
        submittedBy: doc.submittedBy,
        submittedAt: doc.submittedAt?.toISOString(),
        approvedBy: doc.approvedBy,
        approvedAt: doc.approvedAt?.toISOString(),
        rejectedBy: doc.rejectedBy,
        rejectedAt: doc.rejectedAt?.toISOString(),
        rejectionReason: doc.rejectionReason,
        paidBy: doc.paidBy,
        paidAt: doc.paidAt?.toISOString(),
        voidedBy: doc.voidedBy,
        voidedAt: doc.voidedAt?.toISOString(),
        voidReason: doc.voidReason,
        journalEntryId: doc.journalEntryId,
        attachments: doc.attachments,
        notes: doc.notes,
        createdBy: doc.createdBy,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
    };
}
// GET /api/crm/expenses - List expenses
expensesRouter.get('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: { items: [], total: 0 }, error: null });
    const q = String(req.query.q ?? '').trim();
    const status = req.query.status;
    const vendorId = req.query.vendorId;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const skip = Number(req.query.skip) || 0;
    const sort = req.query.sort || 'expenseNumber';
    const dir = req.query.dir === 'asc' ? 1 : -1;
    const filter = {};
    if (q) {
        filter.$or = [
            { description: { $regex: q, $options: 'i' } },
            { vendorName: { $regex: q, $options: 'i' } },
            { payee: { $regex: q, $options: 'i' } },
            { referenceNumber: { $regex: q, $options: 'i' } },
        ];
        // Also search by expense number if numeric
        const num = parseInt(q, 10);
        if (!isNaN(num)) {
            filter.$or.push({ expenseNumber: num });
        }
    }
    if (status)
        filter.status = status;
    if (vendorId) {
        try {
            filter.vendorId = new ObjectId(vendorId);
        }
        catch { }
    }
    if (startDate || endDate) {
        filter.date = {};
        if (startDate)
            filter.date.$gte = startDate;
        if (endDate)
            filter.date.$lte = endDate;
    }
    const [items, total] = await Promise.all([
        db.collection('crm_expenses')
            .find(filter)
            .sort({ [sort]: dir })
            .skip(skip)
            .limit(limit)
            .toArray(),
        db.collection('crm_expenses').countDocuments(filter),
    ]);
    res.json({ data: { items: items.map(serializeExpense), total }, error: null });
});
// GET /api/crm/expenses/categories - Get expense categories
expensesRouter.get('/categories', async (_req, res) => {
    res.json({ data: { categories: EXPENSE_CATEGORIES }, error: null });
});
// GET /api/crm/expenses/summary - Get expense summary stats
expensesRouter.get('/summary', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.json({ data: null, error: 'db_unavailable' });
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const pipeline = [
        { $match: { date: { $gte: startDate, $lte: endDate } } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                total: { $sum: '$total' },
            },
        },
    ];
    const results = await db.collection('crm_expenses').aggregate(pipeline).toArray();
    const summary = {
        draft: { count: 0, total: 0 },
        pending_approval: { count: 0, total: 0 },
        approved: { count: 0, total: 0 },
        rejected: { count: 0, total: 0 },
        paid: { count: 0, total: 0 },
        void: { count: 0, total: 0 },
    };
    for (const r of results) {
        if (summary[r._id]) {
            summary[r._id] = { count: r.count, total: Math.round(r.total * 100) / 100 };
        }
    }
    // Category breakdown for paid expenses
    const categoryPipeline = [
        { $match: { date: { $gte: startDate, $lte: endDate }, status: 'paid' } },
        { $unwind: '$lines' },
        {
            $group: {
                _id: '$lines.category',
                total: { $sum: '$lines.amount' },
                count: { $sum: 1 },
            },
        },
        { $sort: { total: -1 } },
    ];
    const categoryResults = await db.collection('crm_expenses').aggregate(categoryPipeline).toArray();
    res.json({
        data: {
            period: { startDate, endDate },
            byStatus: summary,
            byCategory: categoryResults.map((r) => ({
                category: r._id,
                total: Math.round(r.total * 100) / 100,
                count: r.count,
            })),
        },
        error: null,
    });
});
// GET /api/crm/expenses/:id - Get single expense
expensesRouter.get('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    let id;
    try {
        id = new ObjectId(req.params.id);
    }
    catch {
        return res.status(400).json({ data: null, error: 'invalid_id' });
    }
    const expense = await db.collection('crm_expenses').findOne({ _id: id });
    if (!expense)
        return res.status(404).json({ data: null, error: 'not_found' });
    res.json({ data: serializeExpense(expense), error: null });
});
// POST /api/crm/expenses - Create expense
expensesRouter.post('/', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const parsed = createExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: parsed.error.flatten() });
    }
    const { date, vendorId, vendorName, payee, description, lines, paymentMethod, referenceNumber, notes } = parsed.data;
    // Enrich lines with account numbers from categories
    const enrichedLines = lines.map((line) => {
        const categoryMatch = EXPENSE_CATEGORIES.find((c) => c.category === line.category);
        return {
            ...line,
            accountNumber: line.accountNumber || categoryMatch?.accountNumber || '6900',
        };
    });
    const total = enrichedLines.reduce((sum, line) => sum + line.amount, 0);
    const expenseNumber = await getNextExpenseNumber(db);
    const now = new Date();
    const doc = {
        _id: new ObjectId(),
        expenseNumber,
        date: new Date(date),
        vendorId: vendorId ? new ObjectId(vendorId) : undefined,
        vendorName: vendorName || undefined,
        payee: payee || undefined,
        description,
        lines: enrichedLines,
        total: Math.round(total * 100) / 100,
        paymentMethod: paymentMethod || undefined,
        referenceNumber: referenceNumber || undefined,
        status: 'draft',
        notes: notes || undefined,
        createdBy: auth.userId,
        createdAt: now,
        updatedAt: now,
    };
    await db.collection('crm_expenses').insertOne(doc);
    res.status(201).json({
        data: serializeExpense(doc),
        error: null,
    });
});
// PATCH /api/crm/expenses/:id - Update expense
expensesRouter.patch('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    let id;
    try {
        id = new ObjectId(req.params.id);
    }
    catch {
        return res.status(400).json({ data: null, error: 'invalid_id' });
    }
    const expense = await db.collection('crm_expenses').findOne({ _id: id });
    if (!expense)
        return res.status(404).json({ data: null, error: 'not_found' });
    // Can only edit draft or rejected expenses
    if (!['draft', 'rejected'].includes(expense.status)) {
        return res.status(400).json({ data: null, error: 'cannot_edit_submitted_expense' });
    }
    const parsed = updateExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ data: null, error: parsed.error.flatten() });
    }
    const updates = { updatedAt: new Date() };
    if (parsed.data.date)
        updates.date = new Date(parsed.data.date);
    if (parsed.data.vendorId !== undefined) {
        updates.vendorId = parsed.data.vendorId ? new ObjectId(parsed.data.vendorId) : null;
    }
    if (parsed.data.vendorName !== undefined)
        updates.vendorName = parsed.data.vendorName || null;
    if (parsed.data.payee !== undefined)
        updates.payee = parsed.data.payee || null;
    if (parsed.data.description)
        updates.description = parsed.data.description;
    if (parsed.data.paymentMethod !== undefined)
        updates.paymentMethod = parsed.data.paymentMethod || null;
    if (parsed.data.referenceNumber !== undefined)
        updates.referenceNumber = parsed.data.referenceNumber || null;
    if (parsed.data.notes !== undefined)
        updates.notes = parsed.data.notes || null;
    if (parsed.data.lines) {
        const enrichedLines = parsed.data.lines.map((line) => {
            const categoryMatch = EXPENSE_CATEGORIES.find((c) => c.category === line.category);
            return {
                ...line,
                accountNumber: line.accountNumber || categoryMatch?.accountNumber || '6900',
            };
        });
        updates.lines = enrichedLines;
        updates.total = Math.round(enrichedLines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
    }
    // If editing a rejected expense, reset to draft
    if (expense.status === 'rejected') {
        updates.status = 'draft';
        updates.rejectedBy = null;
        updates.rejectedAt = null;
        updates.rejectionReason = null;
    }
    await db.collection('crm_expenses').updateOne({ _id: id }, { $set: updates });
    const updated = await db.collection('crm_expenses').findOne({ _id: id });
    res.json({ data: updated ? serializeExpense(updated) : null, error: null });
});
// POST /api/crm/expenses/:id/submit - Submit for approval
expensesRouter.post('/:id/submit', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    let id;
    try {
        id = new ObjectId(req.params.id);
    }
    catch {
        return res.status(400).json({ data: null, error: 'invalid_id' });
    }
    const expense = await db.collection('crm_expenses').findOne({ _id: id });
    if (!expense)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (expense.status !== 'draft') {
        return res.status(400).json({ data: null, error: 'can_only_submit_draft' });
    }
    const now = new Date();
    await db.collection('crm_expenses').updateOne({ _id: id }, {
        $set: {
            status: 'pending_approval',
            submittedBy: auth.userId,
            submittedAt: now,
            updatedAt: now,
        },
    });
    const updated = await db.collection('crm_expenses').findOne({ _id: id });
    res.json({ data: updated ? serializeExpense(updated) : null, error: null });
});
// POST /api/crm/expenses/:id/approve - Approve expense (requires manager/admin)
expensesRouter.post('/:id/approve', requirePermission('*'), async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    let id;
    try {
        id = new ObjectId(req.params.id);
    }
    catch {
        return res.status(400).json({ data: null, error: 'invalid_id' });
    }
    const expense = await db.collection('crm_expenses').findOne({ _id: id });
    if (!expense)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (expense.status !== 'pending_approval') {
        return res.status(400).json({ data: null, error: 'can_only_approve_pending' });
    }
    const now = new Date();
    await db.collection('crm_expenses').updateOne({ _id: id }, {
        $set: {
            status: 'approved',
            approvedBy: auth.userId,
            approvedAt: now,
            updatedAt: now,
        },
    });
    const updated = await db.collection('crm_expenses').findOne({ _id: id });
    res.json({ data: updated ? serializeExpense(updated) : null, error: null });
});
// POST /api/crm/expenses/:id/reject - Reject expense (requires manager/admin)
expensesRouter.post('/:id/reject', requirePermission('*'), async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const reason = String(req.body.reason || '').trim();
    let id;
    try {
        id = new ObjectId(req.params.id);
    }
    catch {
        return res.status(400).json({ data: null, error: 'invalid_id' });
    }
    const expense = await db.collection('crm_expenses').findOne({ _id: id });
    if (!expense)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (expense.status !== 'pending_approval') {
        return res.status(400).json({ data: null, error: 'can_only_reject_pending' });
    }
    const now = new Date();
    await db.collection('crm_expenses').updateOne({ _id: id }, {
        $set: {
            status: 'rejected',
            rejectedBy: auth.userId,
            rejectedAt: now,
            rejectionReason: reason || null,
            updatedAt: now,
        },
    });
    const updated = await db.collection('crm_expenses').findOne({ _id: id });
    res.json({ data: updated ? serializeExpense(updated) : null, error: null });
});
// POST /api/crm/expenses/:id/pay - Mark as paid and create journal entry
expensesRouter.post('/:id/pay', requirePermission('*'), async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    let id;
    try {
        id = new ObjectId(req.params.id);
    }
    catch {
        return res.status(400).json({ data: null, error: 'invalid_id' });
    }
    const expense = await db.collection('crm_expenses').findOne({ _id: id });
    if (!expense)
        return res.status(404).json({ data: null, error: 'not_found' });
    if (expense.status !== 'approved') {
        return res.status(400).json({ data: null, error: 'can_only_pay_approved' });
    }
    // Create journal entry in Financial Intelligence
    // DR: Expense accounts, CR: Cash
    const entryDate = expense.date || new Date();
    const now = new Date();
    // Find open period
    const period = await db.collection('fi_periods').findOne({
        startDate: { $lte: entryDate },
        endDate: { $gte: entryDate },
        status: 'open',
    });
    let journalEntryId = null;
    if (period) {
        // Get next journal entry number
        const jeSeq = await db.collection('fi_sequences').findOneAndUpdate({ _id: 'fi_journal_entries' }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after' });
        const entryNumber = jeSeq?.value || 10001;
        // Build journal entry lines
        const jeLines = [];
        // Debit expense accounts
        for (const line of expense.lines) {
            const account = await db.collection('fi_chart_of_accounts').findOne({
                accountNumber: line.accountNumber,
                isActive: true,
            });
            if (account) {
                jeLines.push({
                    accountId: account._id,
                    accountNumber: account.accountNumber,
                    accountName: account.name,
                    debit: line.amount,
                    credit: 0,
                    description: line.description || line.category,
                    projectId: line.projectId,
                });
            }
        }
        // Credit cash account
        const cashAccount = await db.collection('fi_chart_of_accounts').findOne({
            accountNumber: '1010', // Checking Account
            isActive: true,
        });
        if (cashAccount) {
            jeLines.push({
                accountId: cashAccount._id,
                accountNumber: cashAccount.accountNumber,
                accountName: cashAccount.name,
                debit: 0,
                credit: expense.total,
                description: `Payment for expense #${expense.expenseNumber}`,
            });
        }
        if (jeLines.length > 1) {
            const journalEntry = {
                _id: new ObjectId(),
                entryNumber,
                date: entryDate,
                postingDate: now,
                periodId: period._id,
                description: `Expense #${expense.expenseNumber} - ${expense.description}`,
                sourceType: 'expense',
                sourceId: String(expense._id),
                lines: jeLines,
                status: 'posted',
                reversedEntryId: null,
                reversalOfEntryId: null,
                attachments: [],
                approvedBy: null,
                approvedAt: null,
                createdAt: now,
                createdBy: auth.userId,
                updatedAt: now,
                updatedBy: auth.userId,
                audit: [{
                        action: 'auto_posted',
                        userId: auth.userId,
                        userEmail: auth.email || 'system@boazos.com',
                        timestamp: now,
                        changes: { expenseId: String(expense._id), expenseNumber: expense.expenseNumber },
                    }],
            };
            await db.collection('fi_journal_entries').insertOne(journalEntry);
            journalEntryId = String(journalEntry._id);
        }
    }
    // Update expense as paid
    await db.collection('crm_expenses').updateOne({ _id: id }, {
        $set: {
            status: 'paid',
            paidBy: auth.userId,
            paidAt: now,
            journalEntryId,
            updatedAt: now,
        },
    });
    const updated = await db.collection('crm_expenses').findOne({ _id: id });
    res.json({
        data: updated ? serializeExpense(updated) : null,
        journalEntryId,
        error: null,
    });
});
// POST /api/crm/expenses/:id/void - Void expense
expensesRouter.post('/:id/void', requirePermission('*'), async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const reason = String(req.body.reason || '').trim();
    let id;
    try {
        id = new ObjectId(req.params.id);
    }
    catch {
        return res.status(400).json({ data: null, error: 'invalid_id' });
    }
    const expense = await db.collection('crm_expenses').findOne({ _id: id });
    if (!expense)
        return res.status(404).json({ data: null, error: 'not_found' });
    // Can't void paid expenses (would need to reverse journal entry)
    if (expense.status === 'paid') {
        return res.status(400).json({ data: null, error: 'cannot_void_paid_expense' });
    }
    const now = new Date();
    await db.collection('crm_expenses').updateOne({ _id: id }, {
        $set: {
            status: 'void',
            voidedBy: auth.userId,
            voidedAt: now,
            voidReason: reason || null,
            updatedAt: now,
        },
    });
    const updated = await db.collection('crm_expenses').findOne({ _id: id });
    res.json({ data: updated ? serializeExpense(updated) : null, error: null });
});
// DELETE /api/crm/expenses/:id - Delete draft expense
expensesRouter.delete('/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    let id;
    try {
        id = new ObjectId(req.params.id);
    }
    catch {
        return res.status(400).json({ data: null, error: 'invalid_id' });
    }
    const expense = await db.collection('crm_expenses').findOne({ _id: id });
    if (!expense)
        return res.status(404).json({ data: null, error: 'not_found' });
    // Can only delete draft expenses
    if (expense.status !== 'draft') {
        return res.status(400).json({ data: null, error: 'can_only_delete_draft' });
    }
    await db.collection('crm_expenses').deleteOne({ _id: id });
    res.json({ data: { deleted: true }, error: null });
});
