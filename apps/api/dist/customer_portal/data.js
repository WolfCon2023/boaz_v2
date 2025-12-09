/**
 * External Customer Portal Data API
 *
 * Provides secure access to customer-specific data:
 * - Invoices (current and historical)
 * - Support tickets
 * - Contracts/quotes
 */
import { Router } from 'express';
import { getDb } from '../db.js';
import { ObjectId } from 'mongodb';
import { verifyCustomerToken } from './auth.js';
export const customerPortalDataRouter = Router();
// All routes require authentication
customerPortalDataRouter.use(verifyCustomerToken);
// GET /api/customer-portal/data/invoices - Get customer's invoices
customerPortalDataRouter.get('/invoices', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { accountId } = req.customerAuth;
        if (!accountId) {
            return res.json({ data: { items: [] }, error: null });
        }
        // Get all invoices for this account
        const invoices = await db.collection('invoices')
            .find({ accountId: new ObjectId(accountId) })
            .sort({ createdAt: -1 })
            .limit(100)
            .toArray();
        // Format invoices for customer view
        const formattedInvoices = invoices.map((invoice) => ({
            id: invoice._id.toHexString(),
            invoiceNumber: invoice.invoiceNumber,
            title: invoice.title || 'Untitled',
            total: invoice.total || 0,
            balance: invoice.balance || 0,
            status: invoice.status || 'draft',
            dueDate: invoice.dueDate,
            createdAt: invoice.createdAt,
            paidAt: invoice.paidAt,
            items: invoice.items || [],
            payments: invoice.payments || [],
            subscriptionActive: invoice.subscription?.active || false,
        }));
        res.json({ data: { items: formattedInvoices }, error: null });
    }
    catch (err) {
        console.error('Get customer invoices error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_invoices' });
    }
});
// GET /api/customer-portal/data/invoices/:id - Get specific invoice details
customerPortalDataRouter.get('/invoices/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { accountId } = req.customerAuth;
        const invoiceId = req.params.id;
        if (!ObjectId.isValid(invoiceId)) {
            return res.status(400).json({ data: null, error: 'invalid_id' });
        }
        // Get invoice and verify it belongs to this customer's account
        const invoice = await db.collection('invoices').findOne({
            _id: new ObjectId(invoiceId),
            accountId: new ObjectId(accountId)
        });
        if (!invoice) {
            return res.status(404).json({ data: null, error: 'invoice_not_found' });
        }
        // Get account info
        const account = await db.collection('accounts').findOne({ _id: new ObjectId(accountId) });
        // Format invoice with full details
        const formattedInvoice = {
            id: invoice._id.toHexString(),
            invoiceNumber: invoice.invoiceNumber,
            title: invoice.title || 'Untitled',
            total: invoice.total || 0,
            balance: invoice.balance || 0,
            status: invoice.status || 'draft',
            dueDate: invoice.dueDate,
            createdAt: invoice.createdAt,
            paidAt: invoice.paidAt,
            items: invoice.items || [],
            payments: invoice.payments || [],
            refunds: invoice.refunds || [],
            notes: invoice.notes,
            account: account ? {
                name: account.name || account.companyName,
                email: account.email || account.primaryContactEmail,
                phone: account.phone,
            } : null,
            subscription: invoice.subscription || null,
        };
        res.json({ data: formattedInvoice, error: null });
    }
    catch (err) {
        console.error('Get customer invoice detail error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_invoice' });
    }
});
// GET /api/customer-portal/data/tickets - Get customer's support tickets
customerPortalDataRouter.get('/tickets', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { accountId, email } = req.customerAuth;
        // Build query to find tickets by account or email
        const query = {};
        if (accountId) {
            query.accountId = new ObjectId(accountId);
        }
        else if (email) {
            // Also match by requester email if no account linked
            query.requesterEmail = email;
        }
        else {
            return res.json({ data: { items: [] }, error: null });
        }
        // Get tickets
        const tickets = await db.collection('support_tickets')
            .find(query)
            .sort({ createdAt: -1 })
            .limit(100)
            .toArray();
        // Format tickets for customer view
        const formattedTickets = tickets.map((ticket) => ({
            id: ticket._id.toHexString(),
            ticketNumber: ticket.ticketNumber,
            shortDescription: ticket.shortDescription,
            description: ticket.description,
            status: ticket.status || 'open',
            priority: ticket.priority || 'normal',
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt,
            slaDueAt: ticket.slaDueAt,
            comments: (ticket.comments || []).map((c) => ({
                author: c.author,
                body: c.body,
                at: c.at,
            })),
        }));
        res.json({ data: { items: formattedTickets }, error: null });
    }
    catch (err) {
        console.error('Get customer tickets error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_tickets' });
    }
});
// POST /api/customer-portal/data/tickets - Create new support ticket
customerPortalDataRouter.post('/tickets', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { accountId, email, customerId } = req.customerAuth;
        const { shortDescription, description, priority, requesterName, requesterPhone } = req.body;
        if (!shortDescription || !description || !requesterName || !requesterPhone) {
            return res.status(400).json({ data: null, error: 'missing_required_fields' });
        }
        // Get customer info
        const customer = await db.collection('customer_portal_users').findOne({
            _id: new ObjectId(customerId)
        });
        // Get next ticket number
        const lastTicket = await db.collection('support_tickets')
            .find({})
            .sort({ ticketNumber: -1 })
            .limit(1)
            .toArray();
        const ticketNumber = (lastTicket[0]?.ticketNumber || 0) + 1;
        // Calculate SLA due date based on priority
        const now = new Date();
        const slaHours = {
            critical: 4,
            high: 8,
            normal: 24,
            low: 48,
        };
        const slaDueAt = new Date(now.getTime() + (slaHours[priority || 'normal'] || 24) * 60 * 60 * 1000);
        // Create ticket
        const newTicket = {
            ticketNumber,
            shortDescription,
            description,
            status: 'open',
            priority: priority || 'normal',
            type: 'external',
            requesterName: requesterName || customer?.name || 'Customer',
            requesterEmail: email,
            requesterPhone: requesterPhone || null,
            accountId: accountId ? new ObjectId(accountId) : null,
            assigneeId: null,
            owner: null,
            ownerId: null,
            assignee: null,
            comments: [],
            tags: [],
            createdAt: now,
            updatedAt: now,
            slaDueAt,
            history: [{
                    action: 'created',
                    by: requesterName || customer?.name || email,
                    at: now,
                }],
        };
        const result = await db.collection('support_tickets').insertOne(newTicket);
        res.json({
            data: {
                ticketNumber,
                ticketId: result.insertedId.toHexString(),
                message: 'Ticket created successfully'
            },
            error: null
        });
    }
    catch (err) {
        console.error('Create customer ticket error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_create_ticket' });
    }
});
// POST /api/customer-portal/data/tickets/:id/comments - Add comment to ticket
customerPortalDataRouter.post('/tickets/:id/comments', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { accountId, email, customerId } = req.customerAuth;
        const ticketId = req.params.id;
        const { body } = req.body;
        if (!body || typeof body !== 'string') {
            return res.status(400).json({ data: null, error: 'invalid_comment' });
        }
        if (!ObjectId.isValid(ticketId)) {
            return res.status(400).json({ data: null, error: 'invalid_id' });
        }
        // Verify ticket belongs to this customer
        const ticket = await db.collection('support_tickets').findOne({
            _id: new ObjectId(ticketId),
            $or: accountId ? [
                { accountId: new ObjectId(accountId) },
                { requesterEmail: email }
            ] : [
                { requesterEmail: email }
            ]
        });
        if (!ticket) {
            return res.status(404).json({ data: null, error: 'ticket_not_found' });
        }
        // Get customer info
        const customer = await db.collection('customer_portal_users').findOne({
            _id: new ObjectId(customerId)
        });
        // Add comment
        const comment = {
            author: customer?.name || email,
            body,
            at: new Date(),
        };
        await db.collection('support_tickets').updateOne({ _id: new ObjectId(ticketId) }, {
            $push: { comments: comment },
            $set: { updatedAt: new Date() }
        });
        res.json({ data: { message: 'Comment added successfully', comment }, error: null });
    }
    catch (err) {
        console.error('Add ticket comment error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_add_comment' });
    }
});
// GET /api/customer-portal/data/quotes - Get customer's quotes/contracts
customerPortalDataRouter.get('/quotes', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { accountId } = req.customerAuth;
        if (!accountId) {
            return res.json({ data: { items: [] }, error: null });
        }
        // Get all quotes for this account
        const quotes = await db.collection('quotes')
            .find({ accountId: new ObjectId(accountId) })
            .sort({ createdAt: -1 })
            .limit(100)
            .toArray();
        // Format quotes for customer view
        const formattedQuotes = quotes.map((quote) => ({
            id: quote._id.toHexString(),
            quoteNumber: quote.quoteNumber,
            title: quote.title || 'Untitled',
            total: quote.total || 0,
            status: quote.status || 'draft',
            expiresAt: quote.expiresAt,
            signedAt: quote.signedAt,
            signedBy: quote.signedBy,
            createdAt: quote.createdAt,
            items: quote.items || [],
        }));
        res.json({ data: { items: formattedQuotes }, error: null });
    }
    catch (err) {
        console.error('Get customer quotes error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_quotes' });
    }
});
// GET /api/customer-portal/data/quotes/:id - Get specific quote details
customerPortalDataRouter.get('/quotes/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { accountId } = req.customerAuth;
        const quoteId = req.params.id;
        if (!ObjectId.isValid(quoteId)) {
            return res.status(400).json({ data: null, error: 'invalid_id' });
        }
        // Get quote and verify it belongs to this customer's account
        const quote = await db.collection('quotes').findOne({
            _id: new ObjectId(quoteId),
            accountId: new ObjectId(accountId)
        });
        if (!quote) {
            return res.status(404).json({ data: null, error: 'quote_not_found' });
        }
        // Get account info
        const account = await db.collection('accounts').findOne({ _id: new ObjectId(accountId) });
        // Format quote with full details
        const formattedQuote = {
            id: quote._id.toHexString(),
            quoteNumber: quote.quoteNumber,
            title: quote.title || 'Untitled',
            total: quote.total || 0,
            status: quote.status || 'draft',
            expiresAt: quote.expiresAt,
            signedAt: quote.signedAt,
            signedBy: quote.signedBy,
            createdAt: quote.createdAt,
            items: quote.items || [],
            notes: quote.notes,
            terms: quote.terms,
            account: account ? {
                name: account.name || account.companyName,
                email: account.email || account.primaryContactEmail,
                phone: account.phone,
            } : null,
        };
        res.json({ data: formattedQuote, error: null });
    }
    catch (err) {
        console.error('Get customer quote detail error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_quote' });
    }
});
// GET /api/customer-portal/data/dashboard - Get dashboard summary
customerPortalDataRouter.get('/dashboard', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { accountId, email, customerId } = req.customerAuth;
        console.log('[CustomerPortal] Dashboard request - accountId:', accountId, 'email:', email, 'customerId:', customerId);
        // Get invoice stats (requires account link)
        let invoiceStats = { total: 0, unpaid: 0, overdue: 0 };
        if (accountId) {
            console.log('[CustomerPortal] Querying invoices with accountId:', accountId, 'type:', typeof accountId);
            console.log('[CustomerPortal] accountId as ObjectId:', new ObjectId(accountId).toString());
            const invoices = await db.collection('invoices')
                .find({ accountId: new ObjectId(accountId) })
                .toArray();
            console.log('[CustomerPortal] Found', invoices.length, 'invoices for accountId:', accountId);
            if (invoices.length > 0) {
                console.log('[CustomerPortal] Sample invoice:', {
                    id: invoices[0]._id.toString(),
                    accountId: invoices[0].accountId?.toString(),
                    accountIdType: typeof invoices[0].accountId,
                    status: invoices[0].status,
                    total: invoices[0].total
                });
            }
            // Also try to see ALL invoices in the collection (for debugging)
            const allInvoices = await db.collection('invoices').find({}).limit(5).toArray();
            console.log('[CustomerPortal] Sample of ALL invoices in database (first 5):');
            allInvoices.forEach((inv) => {
                console.log('  -', {
                    id: inv._id.toString(),
                    accountId: inv.accountId?.toString(),
                    accountIdType: typeof inv.accountId,
                    status: inv.status
                });
            });
            const now = new Date();
            invoiceStats = {
                total: invoices.length,
                unpaid: invoices.filter((inv) => inv.status !== 'paid' && inv.status !== 'void').length,
                overdue: invoices.filter((inv) => inv.status !== 'paid' &&
                    inv.status !== 'void' &&
                    inv.dueDate &&
                    new Date(inv.dueDate) < now).length,
            };
        }
        else {
            console.log('[CustomerPortal] No accountId, skipping invoice stats');
        }
        // Get ticket stats (can use accountId OR email)
        const ticketQuery = {};
        if (accountId) {
            ticketQuery.accountId = new ObjectId(accountId);
        }
        else if (email) {
            ticketQuery.requesterEmail = email;
        }
        const tickets = await db.collection('support_tickets')
            .find(ticketQuery)
            .toArray();
        const ticketStats = {
            total: tickets.length,
            open: tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
        };
        // Get quote stats (requires account link)
        let quoteStats = { total: 0, pending: 0 };
        if (accountId) {
            console.log('[CustomerPortal] Querying quotes with accountId:', accountId, 'type:', typeof accountId);
            const quotes = await db.collection('quotes')
                .find({ accountId: new ObjectId(accountId) })
                .toArray();
            console.log('[CustomerPortal] Found', quotes.length, 'quotes for accountId:', accountId);
            if (quotes.length > 0) {
                console.log('[CustomerPortal] Sample quote:', {
                    id: quotes[0]._id.toString(),
                    accountId: quotes[0].accountId?.toString(),
                    accountIdType: typeof quotes[0].accountId,
                    status: quotes[0].status,
                    total: quotes[0].total
                });
            }
            // Also try to see ALL quotes in the collection (for debugging)
            const allQuotes = await db.collection('quotes').find({}).limit(5).toArray();
            console.log('[CustomerPortal] Sample of ALL quotes in database (first 5):');
            allQuotes.forEach((q) => {
                console.log('  -', {
                    id: q._id.toString(),
                    accountId: q.accountId?.toString(),
                    accountIdType: typeof q.accountId,
                    status: q.status
                });
            });
            quoteStats = {
                total: quotes.length,
                pending: quotes.filter((q) => q.status === 'sent' || q.status === 'viewed').length,
            };
        }
        else {
            console.log('[CustomerPortal] No accountId, skipping quote stats');
        }
        res.json({
            data: {
                invoices: invoiceStats,
                tickets: ticketStats,
                quotes: quoteStats,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Get customer dashboard error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_dashboard' });
    }
});
