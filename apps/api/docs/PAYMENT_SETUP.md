# Payment Options Setup Guide

This guide explains how to configure payment options for your BOAZ-OS invoices.

## Overview

BOAZ-OS supports multiple industry-standard payment methods:
- **Credit/Debit Cards** (via Stripe)
- **ACH Bank Transfer** 
- **Wire Transfer** (Domestic & International)
- **PayPal**
- **Check**
- **Cash** (optional)

## Quick Start

Payment options are automatically included in invoice emails and the invoice print/view page. The system uses default configuration values that you should customize for your business.

## Configuration Files

### 1. Payment Providers Configuration
**File:** `apps/api/src/lib/payment-providers.ts`

This file contains all payment method definitions and configuration.

### 2. Environment Variables
Add these to your Railway deployment (or `.env` file for local development):

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key

# PayPal Configuration
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
```

## Customizing Payment Options

### Update Bank Account Details

Edit `apps/api/src/lib/payment-providers.ts` and update the `PAYMENT_PORTAL_CONFIG` object:

```typescript
export const PAYMENT_PORTAL_CONFIG: PaymentPortalConfig = {
  bankAccountDetails: {
    bankName: 'Your Bank Name',
    routingNumber: 'YOUR_ROUTING_NUMBER',
    accountNumber: '****LAST4', // Masked for security
    accountName: 'Your Company Name',
    swiftCode: 'YOUR_SWIFT_CODE', // For international wires
    bankAddress: 'Bank address here',
  },
  mailingAddress: {
    name: 'Your Company Name',
    address: 'Your street address',
    city: 'Your City',
    state: 'ST',
    zip: '12345',
    country: 'USA',
  },
  supportEmail: 'billing@yourcompany.com',
  supportPhone: '(555) 555-5555',
}
```

### Enable/Disable Payment Methods

To enable or disable specific payment methods, edit the `PAYMENT_OPTIONS` object:

```typescript
export const PAYMENT_OPTIONS: Record<PaymentMethod, PaymentOption> = {
  credit_card: {
    // ...
    enabled: true, // Set to false to disable
  },
  // ... other methods
}
```

## Stripe Integration

### 1. Create a Stripe Account
- Sign up at https://stripe.com
- Complete verification
- Get your API keys from the Dashboard

### 2. Set Up Payment Links
Stripe Payment Links allow customers to pay invoices with a secure URL.

**Automatic Setup (Recommended):**
The system automatically generates Stripe Payment Links when sending invoice emails.

**Manual Implementation:**
To integrate Stripe Payment Links API:

```typescript
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Create payment link
const paymentLink = await stripe.paymentLinks.create({
  line_items: [{
    price_data: {
      currency: 'usd',
      product_data: {
        name: `Invoice #${invoiceNumber}`,
        description: description,
      },
      unit_amount: amount * 100, // Stripe uses cents
    },
    quantity: 1,
  }],
  metadata: {
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
  },
  after_completion: {
    type: 'redirect',
    redirect: {
      url: `${baseUrl}/apps/crm/invoices/${invoiceId}/payment-success`,
    },
  },
})
```

### 3. Test Mode
Stripe provides test mode for development:
- Test Card: `4242 4242 4242 4242`
- Any future expiration date
- Any 3-digit CVC

### 4. Webhooks (Optional)
Set up webhooks to automatically update invoice status when payments are received:

**Webhook URL:** `https://your-domain.com/api/webhooks/stripe`

**Events to subscribe to:**
- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

## PayPal Integration

### 1. Create a PayPal Business Account
- Sign up at https://www.paypal.com/business
- Complete business verification
- Get your API credentials

### 2. Set Up PayPal.me (Quick Setup)
The simplest way to accept PayPal payments:

1. Create your PayPal.me link at https://www.paypal.me
2. Update the link in `generatePayPalPaymentLink()` function:

```typescript
return `https://www.paypal.com/paypalme/YOUR_USERNAME/${formattedAmount}`
```

### 3. PayPal API Integration (Advanced)
For full PayPal integration with automatic payment tracking:

```typescript
import paypal from '@paypal/checkout-server-sdk'

const environment = new paypal.core.LiveEnvironment(
  process.env.PAYPAL_CLIENT_ID!,
  process.env.PAYPAL_CLIENT_SECRET!
)
const client = new paypal.core.PayPalHttpClient(environment)
```

## ACH & Wire Transfer Setup

No API integration needed! Simply update your bank details in the configuration:

1. Contact your bank to get:
   - Routing Number
   - Account Number (display last 4 digits only)
   - SWIFT/BIC Code (for international transfers)
   - Bank address

2. Update the configuration as shown above

3. Instructions are automatically included in invoice emails and print views

## Security Best Practices

1. **Never hardcode credentials** in source code
2. **Use environment variables** for all API keys
3. **Mask account numbers** - show only last 4 digits
4. **Use HTTPS** for all payment pages
5. **Enable PCI compliance** if handling card data directly
6. **Set up fraud detection** in Stripe Dashboard
7. **Implement webhook signatures** to verify authenticity

## Testing

### Test Invoice Email
1. Create a test invoice
2. Send to your email
3. Verify all payment options display correctly
4. Test payment links (use test mode)

### Test Invoice Print View
1. Navigate to an invoice
2. Click "Print Invoice"
3. Verify payment options print correctly
4. Check that sensitive info is masked appropriately

## Customizing Email Templates

Invoice emails include payment options automatically. To customize:

**File:** `apps/api/src/crm/invoices.ts`

Look for the payment options HTML generation around line 855.

## Troubleshooting

### Payment links not working
- Verify Stripe API keys are set correctly
- Check that environment variables are loaded
- Ensure URLs don't have trailing slashes

### Bank details not showing
- Check `PAYMENT_PORTAL_CONFIG` is properly configured
- Verify payment method is enabled
- Clear cache and restart API server

### Emails not including payment options
- Verify `generatePaymentLinks()` is being called
- Check that `customHtml` is supported in email template
- Review email logs for errors

## Going Live Checklist

- [ ] Update all placeholder bank account numbers
- [ ] Replace test Stripe keys with live keys
- [ ] Update PayPal.me link or API credentials
- [ ] Test all payment methods with real (small) amounts
- [ ] Set up Stripe webhooks for automatic updates
- [ ] Configure email sending service (SendGrid)
- [ ] Update company contact information
- [ ] Review and customize payment instructions
- [ ] Test invoice email delivery
- [ ] Verify mobile-friendly display
- [ ] Set up payment reconciliation process

## Additional Resources

- [Stripe Documentation](https://stripe.com/docs)
- [PayPal Developer Docs](https://developer.paypal.com/docs/)
- [ACH Network Rules](https://www.nacha.org/)
- [PCI Compliance Guide](https://www.pcisecuritystandards.org/)

## Support

For questions about payment integration:
- Email: support@boaz-os.com
- Documentation: https://docs.boaz-os.com
- GitHub Issues: https://github.com/your-repo/boaz-os/issues

---

**Last Updated:** December 2024  
**Version:** 2.0

