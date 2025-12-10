/**
 * Payment Portal API Routes
 *
 * Handles payment processing, recording, and history
 */
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth } from '../auth/rbac.js';
import { sendAuthEmail } from '../auth/email.js';
import { generateEmailTemplate, formatEmailTimestamp } from '../lib/email-templates.js';
import { env } from '../env.js';
import Stripe from 'stripe';
export const paymentPortalRouter = Router();
// All routes require authentication
paymentPortalRouter.use(requireAuth);
// POST /api/payments/record - Record a manual payment (phone/mail/cash)
paymentPortalRouter.post('/record', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const auth = req.auth;
        const { invoiceId, invoiceNumber, amount, method, reference, notes, paidAt } = req.body;
        // Validate required fields
        if (!invoiceId || !amount || !method || !reference) {
            return res.status(400).json({
                data: null,
                error: 'missing_required_fields',
                details: 'invoiceId, amount, method, and reference are required'
            });
        }
        // Validate amount
        const paymentAmount = parseFloat(amount);
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            return res.status(400).json({
                data: null,
                error: 'invalid_amount',
                details: 'Amount must be a positive number'
            });
        }
        // Get invoice
        const invoice = await db.collection('invoices').findOne({ _id: new ObjectId(invoiceId) });
        if (!invoice) {
            return res.status(404).json({ data: null, error: 'invoice_not_found' });
        }
        // Check if payment exceeds balance
        const balance = invoice.balance ?? invoice.total ?? 0;
        if (paymentAmount > balance) {
            return res.status(400).json({
                data: null,
                error: 'payment_exceeds_balance',
                details: `Payment amount ($${paymentAmount}) exceeds invoice balance ($${balance})`
            });
        }
        // Create payment record
        const payment = {
            _id: new ObjectId(),
            invoiceId: new ObjectId(invoiceId),
            invoiceNumber: invoiceNumber ?? invoice.invoiceNumber,
            amount: paymentAmount,
            method,
            reference,
            notes,
            paidAt: paidAt ? new Date(paidAt) : new Date(),
            processedBy: auth.userId,
            processedByName: auth.name ?? auth.email,
            processedByEmail: auth.email,
            reconciled: false, // Manual payments need reconciliation
            createdAt: new Date(),
        };
        // Insert payment into payments collection
        await db.collection('payments').insertOne(payment);
        // Update invoice with payment
        const existingPayments = invoice.payments ?? [];
        existingPayments.push({
            amount: paymentAmount,
            method,
            paidAt: payment.paidAt
        });
        const newBalance = balance - paymentAmount;
        const newStatus = newBalance <= 0 ? 'paid' : invoice.status;
        await db.collection('invoices').updateOne({ _id: new ObjectId(invoiceId) }, {
            $set: {
                payments: existingPayments,
                balance: newBalance,
                status: newStatus,
                updatedAt: new Date(),
            }
        });
        // Add history entry
        await db.collection('invoice_history').insertOne({
            _id: new ObjectId(),
            invoiceId: new ObjectId(invoiceId),
            eventType: 'payment_received',
            description: `Manual payment recorded: $${paymentAmount.toFixed(2)} via ${method}`,
            userId: auth.userId,
            userName: auth.name,
            userEmail: auth.email,
            metadata: {
                amount: paymentAmount,
                method,
                reference,
                notes,
                paidAt: payment.paidAt,
                processedBy: auth.email
            },
            createdAt: new Date(),
        });
        // Send confirmation email to customer if we have their email
        if (invoice.accountId) {
            try {
                const account = await db.collection('accounts').findOne({ _id: new ObjectId(invoice.accountId) });
                const primaryContact = account?.primaryContactEmail;
                if (primaryContact) {
                    const { html, text } = generateEmailTemplate({
                        header: {
                            title: 'Payment Received',
                            subtitle: `Invoice #${invoice.invoiceNumber ?? invoiceId}`,
                            icon: '✅',
                        },
                        content: {
                            greeting: `Hello,`,
                            message: 'Thank you for your payment. We have successfully recorded your payment and updated your invoice balance.',
                            infoBox: {
                                title: 'Payment Details',
                                items: [
                                    { label: 'Invoice Number', value: `#${invoice.invoiceNumber ?? invoiceId}` },
                                    { label: 'Payment Amount', value: `$${paymentAmount.toFixed(2)}` },
                                    { label: 'Payment Method', value: method },
                                    { label: 'Reference', value: reference },
                                    { label: 'New Balance', value: `$${newBalance.toFixed(2)}` },
                                    { label: 'Payment Date', value: formatEmailTimestamp(payment.paidAt) },
                                ],
                            },
                            additionalInfo: 'If you have any questions about this payment or your invoice, please contact us at contactwcg@wolfconsultingnc.com.',
                        },
                    });
                    await sendAuthEmail({
                        to: primaryContact,
                        subject: `✅ Payment Received - Invoice #${invoice.invoiceNumber ?? invoiceId}`,
                        html,
                        text,
                        checkPreferences: false,
                    });
                }
            }
            catch (emailErr) {
                console.error('Failed to send payment confirmation email:', emailErr);
                // Don't fail the request if email fails
            }
        }
        res.json({
            data: {
                payment,
                newBalance,
                message: 'Payment recorded successfully'
            },
            error: null
        });
    }
    catch (err) {
        console.error('Record payment error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_record_payment' });
    }
});
// GET /api/payments/history - Get payment history with filtering
paymentPortalRouter.get('/history', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { search, filter, dateFrom, dateTo, limit = 100, offset = 0 } = req.query;
        // Build query
        const query = {};
        // Search by invoice number or reference
        if (search && typeof search === 'string') {
            query.$or = [
                { invoiceNumber: { $regex: search, $options: 'i' } },
                { reference: { $regex: search, $options: 'i' } },
            ];
        }
        // Filter by reconciliation status
        if (filter === 'reconciled') {
            query.reconciled = true;
        }
        else if (filter === 'unreconciled') {
            query.reconciled = { $ne: true };
        }
        // Filter by date range
        if (dateFrom || dateTo) {
            query.paidAt = {};
            if (dateFrom) {
                query.paidAt.$gte = new Date(dateFrom);
            }
            if (dateTo) {
                query.paidAt.$lte = new Date(dateTo);
            }
        }
        // Get payments
        const payments = await db.collection('payments')
            .find(query)
            .sort({ paidAt: -1 })
            .skip(Number(offset))
            .limit(Number(limit))
            .toArray();
        // Get total count
        const total = await db.collection('payments').countDocuments(query);
        res.json({
            data: payments,
            total,
            error: null
        });
    }
    catch (err) {
        console.error('Get payment history error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_payment_history' });
    }
});
// POST /api/payments/reconcile/:id - Mark a payment as reconciled
paymentPortalRouter.post('/reconcile/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const auth = req.auth;
        const paymentId = new ObjectId(req.params.id);
        const result = await db.collection('payments').updateOne({ _id: paymentId }, {
            $set: {
                reconciled: true,
                reconciledAt: new Date(),
                reconciledBy: auth.userId,
                reconciledByName: auth.name ?? auth.email,
                reconciledByEmail: auth.email,
            }
        });
        if (result.matchedCount === 0) {
            return res.status(404).json({ data: null, error: 'payment_not_found' });
        }
        res.json({
            data: { message: 'Payment marked as reconciled' },
            error: null
        });
    }
    catch (err) {
        console.error('Reconcile payment error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_reconcile_payment' });
    }
});
// GET /api/payments/stats - Get payment statistics
paymentPortalRouter.get('/stats', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        // Total payments in last 30 days
        const recentPayments = await db.collection('payments')
            .find({ paidAt: { $gte: thirtyDaysAgo } })
            .toArray();
        const totalAmount = recentPayments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
        const totalCount = recentPayments.length;
        // Unreconciled payments
        const unreconciledCount = await db.collection('payments')
            .countDocuments({ reconciled: { $ne: true } });
        // Payment methods breakdown
        const methodBreakdown = await db.collection('payments').aggregate([
            { $match: { paidAt: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: '$method',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' }
                }
            }
        ]).toArray();
        res.json({
            data: {
                last30Days: {
                    totalAmount,
                    totalCount,
                },
                unreconciledCount,
                methodBreakdown,
            },
            error: null
        });
    }
    catch (err) {
        console.error('Get payment stats error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_get_payment_stats' });
    }
});
// POST /api/payments/create-checkout-session - Create Stripe or PayPal checkout session
paymentPortalRouter.post('/create-checkout-session', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const { invoiceId, amount, method, customerInfo } = req.body;
        if (!invoiceId || !amount || !method) {
            return res.status(400).json({
                data: null,
                error: 'missing_required_fields',
                details: 'invoiceId, amount, and method are required'
            });
        }
        const invoiceObjectId = new ObjectId(invoiceId);
        const invoice = await db.collection('invoices').findOne({ _id: invoiceObjectId });
        if (!invoice) {
            return res.status(404).json({ data: null, error: 'invoice_not_found' });
        }
        const paymentAmount = parseFloat(amount);
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            return res.status(400).json({ data: null, error: 'invalid_amount' });
        }
        if (method === 'stripe') {
            // Initialize Stripe
            const stripe = new Stripe(env.STRIPE_SECRET_KEY || '', {
                apiVersion: '2025-02-24.acacia',
            });
            const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173';
            // Create Stripe Checkout Session
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: `Invoice #${invoice.invoiceNumber || invoice._id.toHexString().slice(-6)}`,
                                description: invoice.title || 'Invoice Payment',
                            },
                            unit_amount: Math.round(paymentAmount * 100), // Stripe expects cents
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${baseUrl}/customer/payments?cancelled=true`,
                customer_email: customerInfo?.email,
                metadata: {
                    invoiceId: invoiceId,
                    invoiceNumber: String(invoice.invoiceNumber || ''),
                },
                billing_address_collection: 'required',
                phone_number_collection: {
                    enabled: true,
                },
            });
            res.json({
                data: {
                    url: session.url,
                    sessionId: session.id
                },
                error: null
            });
        }
        else if (method === 'paypal') {
            // For PayPal, you would create a PayPal order here
            // For now, return a placeholder
            const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173';
            res.json({
                data: {
                    url: `${baseUrl}/paypal-checkout?invoice=${invoiceId}&amount=${paymentAmount}`,
                    orderId: 'paypal_order_placeholder'
                },
                error: null
            });
        }
        else {
            res.status(400).json({ data: null, error: 'invalid_payment_method' });
        }
    }
    catch (err) {
        console.error('Create checkout session error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_create_checkout_session' });
    }
});
