/**
 * Payment Provider Configuration
 *
 * Defines all supported payment methods and their integration details
 */
/**
 * Default Payment Options Configuration
 */
export const PAYMENT_OPTIONS = {
    credit_card: {
        method: 'credit_card',
        provider: 'stripe',
        enabled: true,
        displayName: 'Credit or Debit Card',
        description: 'Pay securely with Visa, Mastercard, American Express, or Discover',
        icon: '💳',
        instructions: 'Click the "Pay Now" button to complete your payment securely through our payment processor.',
        processingFee: '2.9% + $0.30',
        estimatedTime: 'Instant',
        requiresSetup: false,
    },
    ach_transfer: {
        method: 'ach_transfer',
        provider: 'manual',
        enabled: true,
        displayName: 'ACH Bank Transfer',
        description: 'Direct bank transfer via ACH (US only)',
        icon: '🏦',
        instructions: `Please initiate an ACH transfer to:
    
**Bank Name:** First Citizens Bank
**Routing Number:** 053100300
**Account Number:** 1234567890
**Account Name:** Wolf Consulting Group, LLC
**Reference:** Your Invoice Number

*Please allow 2-3 business days for processing.*`,
        processingFee: 'No fee',
        estimatedTime: '2-3 business days',
        requiresSetup: false,
    },
    wire_transfer: {
        method: 'wire_transfer',
        provider: 'manual',
        enabled: true,
        displayName: 'Wire Transfer',
        description: 'International and domestic wire transfers',
        icon: '🌐',
        instructions: `Please send a wire transfer to:

**Bank Name:** First Citizens Bank
**Bank Address:** 123 Main Street, Charlotte, NC 28202
**SWIFT/BIC Code:** FCBIUS33
**Routing Number:** 053100300
**Account Number:** 1234567890
**Account Name:** Wolf Consulting Group, LLC
**Reference:** Your Invoice Number

*Wire transfers typically process within 1-2 business days. International wires may take 3-5 business days.*`,
        processingFee: 'Bank fees may apply',
        estimatedTime: '1-5 business days',
        requiresSetup: false,
    },
    paypal: {
        method: 'paypal',
        provider: 'paypal',
        enabled: true,
        displayName: 'PayPal',
        description: 'Pay with your PayPal account or PayPal Credit',
        icon: '🅿️',
        instructions: 'Click the "Pay with PayPal" button to complete your payment securely through PayPal.',
        processingFee: '3.49% + $0.49',
        estimatedTime: 'Instant',
        requiresSetup: false,
    },
    check: {
        method: 'check',
        provider: 'manual',
        enabled: true,
        displayName: 'Check',
        description: 'Mail a check or money order',
        icon: '✅',
        instructions: `Please make checks payable to:

**Wolf Consulting Group, LLC**
**2114 Willowcrest Drive**
**Waxhaw, NC 28173**

Please include your invoice number on the check memo line.

*Checks typically take 7-10 business days to process.*`,
        processingFee: 'No fee',
        estimatedTime: '7-10 business days',
        requiresSetup: false,
    },
    cash: {
        method: 'cash',
        provider: 'manual',
        enabled: false, // Typically disabled by default
        displayName: 'Cash',
        description: 'Pay in person with cash',
        icon: '💵',
        instructions: 'Cash payments can be made in person at our office during business hours (Mon-Fri, 9AM-5PM EST). Please bring your invoice and request a receipt.',
        processingFee: 'No fee',
        estimatedTime: 'Instant',
        requiresSetup: false,
    },
};
/**
 * Generate Payment Link for Stripe
 *
 * In production, you would integrate with Stripe Payment Links API
 * https://docs.stripe.com/payment-links
 */
export function generateStripePaymentLink(invoiceId, amount, invoiceNumber, description) {
    // In production, create a Stripe Payment Link via their API
    // For now, return a placeholder URL
    // Example Stripe Payment Link creation:
    // const paymentLink = await stripe.paymentLinks.create({
    //   line_items: [{
    //     price_data: {
    //       currency: 'usd',
    //       product_data: {
    //         name: `Invoice ${invoiceNumber}`,
    //         description: description,
    //       },
    //       unit_amount: amount * 100, // Stripe uses cents
    //     },
    //     quantity: 1,
    //   }],
    //   metadata: {
    //     invoice_id: invoiceId,
    //     invoice_number: invoiceNumber,
    //   },
    //   after_completion: {
    //     type: 'redirect',
    //     redirect: {
    //       url: `${baseUrl}/apps/crm/invoices/${invoiceId}/payment-success`,
    //     },
    //   },
    // })
    // Placeholder URL - replace with actual Stripe integration
    return `https://buy.stripe.com/test_placeholder?client_reference_id=${invoiceId}`;
}
/**
 * Generate PayPal Payment Link
 *
 * In production, you would integrate with PayPal Payment Links API
 * https://developer.paypal.com/docs/checkout/
 */
export function generatePayPalPaymentLink(invoiceId, amount, invoiceNumber, description, recipientEmail) {
    // In production, create a PayPal payment link via their API
    // For now, return a PayPal.me link format
    // Example: https://www.paypal.com/paypalme/wolfconsultinggroup/100.00
    const formattedAmount = amount.toFixed(2);
    const reference = invoiceNumber || invoiceId;
    // Placeholder - replace with your actual PayPal.me username or API integration
    return `https://www.paypal.com/paypalme/wolfconsultinggroup/${formattedAmount}?note=Invoice%20${reference}`;
}
/**
 * Get enabled payment options for an invoice
 */
export function getEnabledPaymentOptions() {
    return Object.values(PAYMENT_OPTIONS).filter(option => option.enabled);
}
/**
 * Get payment option by method
 */
export function getPaymentOption(method) {
    return PAYMENT_OPTIONS[method];
}
/**
 * Generate all payment links for an invoice
 */
export function generatePaymentLinks(invoiceId, amount, invoiceNumber, description, recipientEmail) {
    const links = [];
    // Stripe Credit Card Payment
    if (PAYMENT_OPTIONS.credit_card.enabled) {
        links.push({
            provider: 'stripe',
            url: generateStripePaymentLink(invoiceId, amount, invoiceNumber, description),
            buttonText: '💳 Pay with Card',
            description: 'Secure payment via Stripe',
        });
    }
    // PayPal Payment
    if (PAYMENT_OPTIONS.paypal.enabled) {
        links.push({
            provider: 'paypal',
            url: generatePayPalPaymentLink(invoiceId, amount, invoiceNumber, description, recipientEmail),
            buttonText: '🅿️ Pay with PayPal',
            description: 'Pay with PayPal or PayPal Credit',
        });
    }
    return links;
}
/**
 * Format payment instructions for email
 */
export function formatPaymentInstructions(method, invoiceNumber) {
    const option = getPaymentOption(method);
    if (!option)
        return '';
    let instructions = option.instructions;
    // Replace placeholders
    if (invoiceNumber) {
        instructions = instructions.replace(/Your Invoice Number/g, `Invoice #${invoiceNumber}`);
    }
    return instructions;
}
/**
 * Default payment portal configuration
 * In production, load from environment variables
 */
export const PAYMENT_PORTAL_CONFIG = {
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_...',
    paypalClientId: process.env.PAYPAL_CLIENT_ID || 'your-paypal-client-id',
    bankAccountDetails: {
        bankName: 'First Citizens Bank',
        routingNumber: '053100300',
        accountNumber: '****7890', // Masked for security
        accountName: 'Wolf Consulting Group, LLC',
        swiftCode: 'FCBIUS33',
        bankAddress: '123 Main Street, Charlotte, NC 28202',
    },
    mailingAddress: {
        name: 'Wolf Consulting Group, LLC',
        address: '2114 Willowcrest Drive',
        city: 'Waxhaw',
        state: 'NC',
        zip: '28173',
        country: 'USA',
    },
    supportEmail: 'contactwcg@wolfconsultingnc.com',
    supportPhone: '(704) 555-1234',
};
