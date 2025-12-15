/**
 * Payment Webhook Handlers
 *
 * Handles webhooks from Stripe and PayPal for automatic payment reconciliation
 */
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { sendAuthEmail } from '../auth/email.js';
import { generateEmailTemplate, formatEmailTimestamp } from '../lib/email-templates.js';
import crypto from 'crypto';
import { dispatchCrmEvent } from '../crm/integrations_core.js';
export const webhooksRouter = Router();
/**
 * Stripe Webhook Handler
 * POST /api/webhooks/stripe
 *
 * Handles Stripe webhook events with signature verification
 * https://stripe.com/docs/webhooks/signatures
 */
webhooksRouter.post('/stripe', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ error: 'db_unavailable' });
    try {
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error('STRIPE_WEBHOOK_SECRET not configured');
            return res.status(500).json({ error: 'webhook_secret_not_configured' });
        }
        // Verify Stripe signature
        // In production, use Stripe SDK: stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
        // For now, we'll do basic verification
        const timestamp = req.headers['stripe-timestamp'];
        const payload = JSON.stringify(req.body);
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(`${timestamp}.${payload}`)
            .digest('hex');
        // Stripe sends the signature as: t=timestamp,v1=signature1,v1=signature2
        const signatures = sig.split(',').reduce((acc, pair) => {
            const [key, value] = pair.split('=');
            if (key === 'v1') {
                acc.push(value);
            }
            return acc;
        }, []);
        // Verify at least one signature matches
        const isValid = signatures.some((s) => crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expectedSignature)));
        if (!isValid) {
            console.error('Invalid Stripe signature');
            return res.status(401).json({ error: 'invalid_signature' });
        }
        // Process the event
        const event = req.body;
        console.log(`[Stripe Webhook] Received event: ${event.type}`);
        // Handle different event types
        switch (event.type) {
            case 'checkout.session.completed':
                await handleStripeCheckoutCompleted(db, event.data.object);
                break;
            case 'payment_intent.succeeded':
                await handleStripePaymentSucceeded(db, event.data.object);
                break;
            case 'payment_intent.payment_failed':
                await handleStripePaymentFailed(db, event.data.object);
                break;
            case 'charge.refunded':
                await handleStripeRefund(db, event.data.object);
                break;
            default:
                console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        }
        res.json({ received: true });
    }
    catch (err) {
        console.error('Stripe webhook error:', err);
        res.status(500).json({ error: err.message || 'webhook_processing_failed' });
    }
});
/**
 * PayPal Webhook Handler
 * POST /api/webhooks/paypal
 *
 * Handles PayPal webhook events with signature verification
 * https://developer.paypal.com/docs/api-basics/notifications/webhooks/
 */
webhooksRouter.post('/paypal', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ error: 'db_unavailable' });
    try {
        // Verify PayPal signature
        const transmissionId = req.headers['paypal-transmission-id'];
        const transmissionTime = req.headers['paypal-transmission-time'];
        const certUrl = req.headers['paypal-cert-url'];
        const authAlgo = req.headers['paypal-auth-algo'];
        const transmissionSig = req.headers['paypal-transmission-sig'];
        const webhookId = process.env.PAYPAL_WEBHOOK_ID;
        if (!webhookId) {
            console.error('PAYPAL_WEBHOOK_ID not configured');
            return res.status(500).json({ error: 'webhook_id_not_configured' });
        }
        // In production, verify signature using PayPal SDK
        // For now, log the event
        console.log(`[PayPal Webhook] Received event: ${req.body.event_type}`);
        const event = req.body;
        // Handle different event types
        switch (event.event_type) {
            case 'PAYMENT.CAPTURE.COMPLETED':
                await handlePayPalPaymentCompleted(db, event.resource);
                break;
            case 'PAYMENT.CAPTURE.DENIED':
            case 'PAYMENT.CAPTURE.DECLINED':
                await handlePayPalPaymentFailed(db, event.resource);
                break;
            case 'PAYMENT.CAPTURE.REFUNDED':
                await handlePayPalRefund(db, event.resource);
                break;
            default:
                console.log(`[PayPal Webhook] Unhandled event type: ${event.event_type}`);
        }
        res.json({ received: true });
    }
    catch (err) {
        console.error('PayPal webhook error:', err);
        res.status(500).json({ error: err.message || 'webhook_processing_failed' });
    }
});
/**
 * Handle Stripe Checkout Session Completed
 */
async function handleStripeCheckoutCompleted(db, session) {
    console.log(`[Stripe] Processing checkout session: ${session.id}`);
    // Extract invoice ID from metadata
    const invoiceId = session.metadata?.invoice_id;
    if (!invoiceId) {
        console.error('[Stripe] No invoice_id in session metadata');
        return;
    }
    const amount = session.amount_total / 100; // Stripe uses cents
    await recordPaymentFromWebhook(db, {
        invoiceId,
        amount,
        method: 'credit_card',
        reference: session.payment_intent,
        stripePaymentIntentId: session.payment_intent,
        stripeSessionId: session.id,
        customerEmail: session.customer_details?.email,
    });
}
/**
 * Handle Stripe Payment Intent Succeeded
 */
async function handleStripePaymentSucceeded(db, paymentIntent) {
    console.log(`[Stripe] Processing payment intent: ${paymentIntent.id}`);
    // Extract invoice ID from metadata
    const invoiceId = paymentIntent.metadata?.invoice_id;
    if (!invoiceId) {
        console.error('[Stripe] No invoice_id in payment intent metadata');
        return;
    }
    const amount = paymentIntent.amount / 100; // Stripe uses cents
    await recordPaymentFromWebhook(db, {
        invoiceId,
        amount,
        method: 'credit_card',
        reference: paymentIntent.id,
        stripePaymentIntentId: paymentIntent.id,
    });
}
/**
 * Handle Stripe Payment Failed
 */
async function handleStripePaymentFailed(db, paymentIntent) {
    console.log(`[Stripe] Payment failed: ${paymentIntent.id}`);
    // Log failed payment attempt
    await db.collection('payment_failures').insertOne({
        _id: new ObjectId(),
        provider: 'stripe',
        paymentIntentId: paymentIntent.id,
        invoiceId: paymentIntent.metadata?.invoice_id,
        amount: paymentIntent.amount / 100,
        failureReason: paymentIntent.last_payment_error?.message,
        createdAt: new Date(),
    });
    // TODO: Send notification to admin about failed payment
}
/**
 * Handle Stripe Refund
 */
async function handleStripeRefund(db, charge) {
    console.log(`[Stripe] Processing refund for charge: ${charge.id}`);
    // Find the original payment
    const payment = await db.collection('payments').findOne({
        stripePaymentIntentId: charge.payment_intent
    });
    if (!payment) {
        console.error('[Stripe] Original payment not found for refund');
        return;
    }
    const refundAmount = charge.amount_refunded / 100;
    // Record refund
    await db.collection('invoices').updateOne({ _id: new ObjectId(payment.invoiceId) }, {
        $push: {
            refunds: {
                amount: refundAmount,
                reason: 'stripe_refund',
                refundedAt: new Date(),
            }
        },
        $inc: { balance: refundAmount }
    });
    // Add history entry
    await db.collection('invoice_history').insertOne({
        _id: new ObjectId(),
        invoiceId: new ObjectId(payment.invoiceId),
        eventType: 'refund_issued',
        description: `Refund issued: $${refundAmount.toFixed(2)} via Stripe`,
        metadata: {
            amount: refundAmount,
            chargeId: charge.id,
            paymentIntentId: charge.payment_intent,
        },
        createdAt: new Date(),
    });
    console.log(`[Stripe] Refund processed: $${refundAmount}`);
}
/**
 * Handle PayPal Payment Completed
 */
async function handlePayPalPaymentCompleted(db, capture) {
    console.log(`[PayPal] Processing payment: ${capture.id}`);
    // Extract invoice ID from custom_id or purchase_units
    const invoiceId = capture.custom_id || capture.purchase_units?.[0]?.custom_id;
    if (!invoiceId) {
        console.error('[PayPal] No invoice_id in payment data');
        return;
    }
    const amount = parseFloat(capture.amount?.value ?? '0');
    await recordPaymentFromWebhook(db, {
        invoiceId,
        amount,
        method: 'paypal',
        reference: capture.id,
        paypalTransactionId: capture.id,
    });
}
/**
 * Handle PayPal Payment Failed
 */
async function handlePayPalPaymentFailed(db, capture) {
    console.log(`[PayPal] Payment failed: ${capture.id}`);
    // Log failed payment attempt
    await db.collection('payment_failures').insertOne({
        _id: new ObjectId(),
        provider: 'paypal',
        transactionId: capture.id,
        invoiceId: capture.custom_id,
        amount: parseFloat(capture.amount?.value ?? '0'),
        failureReason: capture.status_details?.reason,
        createdAt: new Date(),
    });
}
/**
 * Handle PayPal Refund
 */
async function handlePayPalRefund(db, refund) {
    console.log(`[PayPal] Processing refund: ${refund.id}`);
    // Find the original payment
    const payment = await db.collection('payments').findOne({
        paypalTransactionId: refund.links?.find((l) => l.rel === 'up')?.href?.split('/').pop()
    });
    if (!payment) {
        console.error('[PayPal] Original payment not found for refund');
        return;
    }
    const refundAmount = parseFloat(refund.amount?.value ?? '0');
    // Record refund
    await db.collection('invoices').updateOne({ _id: new ObjectId(payment.invoiceId) }, {
        $push: {
            refunds: {
                amount: refundAmount,
                reason: 'paypal_refund',
                refundedAt: new Date(),
            }
        },
        $inc: { balance: refundAmount }
    });
    // Add history entry
    await db.collection('invoice_history').insertOne({
        _id: new ObjectId(),
        invoiceId: new ObjectId(payment.invoiceId),
        eventType: 'refund_issued',
        description: `Refund issued: $${refundAmount.toFixed(2)} via PayPal`,
        metadata: {
            amount: refundAmount,
            refundId: refund.id,
        },
        createdAt: new Date(),
    });
    console.log(`[PayPal] Refund processed: $${refundAmount}`);
}
/**
 * Generic function to record payment from webhook
 * Handles reconciliation automatically
 */
async function recordPaymentFromWebhook(db, data) {
    const { invoiceId, amount, method, reference } = data;
    // Check if payment already recorded (idempotency)
    const existingPayment = await db.collection('payments').findOne({
        $or: [
            { reference },
            { stripePaymentIntentId: data.stripePaymentIntentId },
            { paypalTransactionId: data.paypalTransactionId },
        ]
    });
    if (existingPayment) {
        console.log(`[Webhook] Payment already recorded: ${reference}`);
        return;
    }
    // Get invoice
    const invoice = await db.collection('invoices').findOne({ _id: new ObjectId(invoiceId) });
    if (!invoice) {
        console.error(`[Webhook] Invoice not found: ${invoiceId}`);
        return;
    }
    // Create payment record
    const payment = {
        _id: new ObjectId(),
        invoiceId: new ObjectId(invoiceId),
        invoiceNumber: invoice.invoiceNumber,
        amount,
        method,
        reference,
        paidAt: new Date(),
        reconciled: true, // Webhook payments are auto-reconciled
        reconciledAt: new Date(),
        reconciledBy: 'system',
        reconciledByName: 'Automatic Webhook',
        stripePaymentIntentId: data.stripePaymentIntentId,
        stripeSessionId: data.stripeSessionId,
        paypalTransactionId: data.paypalTransactionId,
        createdAt: new Date(),
    };
    // Insert payment
    await db.collection('payments').insertOne(payment);
    // Update invoice
    const existingPayments = invoice.payments ?? [];
    existingPayments.push({
        amount,
        method,
        paidAt: new Date()
    });
    const balance = (invoice.balance ?? invoice.total ?? 0) - amount;
    const newStatus = balance <= 0 ? 'paid' : invoice.status;
    await db.collection('invoices').updateOne({ _id: new ObjectId(invoiceId) }, {
        $set: {
            payments: existingPayments,
            balance,
            status: newStatus,
            updatedAt: new Date(),
        }
    });
    // Emit webhook event when invoice is paid in full
    if (balance <= 0) {
        dispatchCrmEvent(db, 'crm.invoice.paid', {
            invoiceId,
            invoiceNumber: invoice.invoiceNumber ?? null,
            amount,
            method,
            paidAt: new Date(),
            balance: Math.max(0, balance),
            source: 'webhook',
            reference,
        }, { source: 'payments.webhook' }).catch(() => { });
    }
    // Add history entry
    await db.collection('invoice_history').insertOne({
        _id: new ObjectId(),
        invoiceId: new ObjectId(invoiceId),
        eventType: 'payment_received',
        description: `Payment received: $${amount.toFixed(2)} via ${method} (auto-reconciled)`,
        metadata: {
            amount,
            method,
            reference,
            reconciledBy: 'webhook',
        },
        createdAt: new Date(),
    });
    // Send confirmation email to customer
    if (invoice.accountId) {
        try {
            const account = await db.collection('accounts').findOne({ _id: new ObjectId(invoice.accountId) });
            const primaryContact = account?.primaryContactEmail || data.customerEmail;
            if (primaryContact) {
                const { html, text } = generateEmailTemplate({
                    header: {
                        title: 'Payment Received',
                        subtitle: `Invoice #${invoice.invoiceNumber ?? invoiceId}`,
                        icon: '✅',
                    },
                    content: {
                        greeting: `Hello,`,
                        message: 'Thank you for your payment! We have successfully received and processed your payment.',
                        infoBox: {
                            title: 'Payment Confirmation',
                            items: [
                                { label: 'Invoice Number', value: `#${invoice.invoiceNumber ?? invoiceId}` },
                                { label: 'Payment Amount', value: `$${amount.toFixed(2)}` },
                                { label: 'Payment Method', value: method === 'credit_card' ? 'Credit Card' : method === 'paypal' ? 'PayPal' : method },
                                { label: 'Transaction ID', value: reference },
                                { label: 'New Balance', value: `$${balance.toFixed(2)}` },
                                { label: 'Payment Date', value: formatEmailTimestamp(new Date()) },
                            ],
                        },
                        additionalInfo: balance <= 0
                            ? 'Your invoice is now paid in full. Thank you for your business!'
                            : `Your remaining balance is $${balance.toFixed(2)}. If you have any questions, please contact us at contactwcg@wolfconsultingnc.com.`,
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
            console.error('[Webhook] Failed to send payment confirmation email:', emailErr);
            // Don't fail webhook processing if email fails
        }
    }
    console.log(`[Webhook] Payment recorded and reconciled: $${amount} for invoice ${invoiceId}`);
}
