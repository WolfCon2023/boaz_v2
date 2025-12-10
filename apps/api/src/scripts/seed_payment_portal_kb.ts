/**
 * Seed Knowledge Base Article: Payment Portal & PCI Compliance
 * 
 * This script creates a comprehensive KB article about the Payment Portal,
 * payment methods, security measures, and PCI DSS compliance.
 */

import { getDb } from '../db.js'
import { ObjectId } from 'mongodb'

async function seedPaymentPortalKB() {
  const db = await getDb()
  if (!db) {
    console.error('❌ Database connection failed')
    process.exit(1)
  }

  console.log('🔐 Seeding Payment Portal & PCI Compliance KB Article...')

  const article = {
    _id: new ObjectId(),
    title: 'Payment Portal: Secure Payment Processing & PCI Compliance',
    slug: 'payment-portal-security-pci-compliance',
    content: `
# Payment Portal: Secure Payment Processing & PCI Compliance

## Overview

The BOAZ-OS Payment Portal is a secure, PCI DSS-compliant payment processing system that enables customers to make online payments and internal teams to record manual payments. This article explains how to use the portal, the security measures in place, and our commitment to PCI compliance.

---

## Table of Contents

1. [Payment Methods](#payment-methods)
2. [How to Make a Payment](#how-to-make-a-payment)
3. [Recording Manual Payments (Internal)](#recording-manual-payments)
4. [Security & PCI Compliance](#security-pci-compliance)
5. [Payment History & Tracking](#payment-history)
6. [FAQs](#faqs)

---

## Payment Methods {#payment-methods}

We support multiple secure payment methods to accommodate different preferences and business needs:

### Online Payment Methods

#### 1. Credit/Debit Card
- **Processing Time:** Instant
- **Fees:** 2.9% + $0.30 per transaction
- **Supported Cards:** Visa, Mastercard, American Express, Discover
- **Security:** PCI DSS Level 1 compliant via Stripe
- **How it works:** You'll be securely redirected to enter your card details. We never store your complete card information on our servers.

#### 2. PayPal
- **Processing Time:** Instant
- **Fees:** 3.49% + $0.49 per transaction
- **Security:** PayPal's industry-leading security
- **How it works:** Pay using your PayPal account balance, linked bank account, or saved payment methods.

### Offline Payment Methods

#### 3. ACH Bank Transfer
- **Processing Time:** 2-3 business days
- **Fees:** No fee
- **How it works:** Initiate a transfer from your bank's online portal using our provided banking details.

**Banking Details:**
- Bank Name: First Citizens Bank
- Routing Number: 053100300
- Account Number: [Contact us for full account number]
- Account Name: Wolf Consulting Group, LLC

**Important:** Include your invoice number in the transfer memo/reference field.

#### 4. Wire Transfer
- **Processing Time:** 1-5 business days (domestic/international)
- **Fees:** Your bank's wire fee may apply
- **How it works:** Initiate a wire transfer using our banking details.

**Wire Transfer Details:**
- Bank Name: First Citizens Bank
- SWIFT Code: FCBIUS33 (for international wires)
- Routing Number: 053100300
- Account Number: [Contact us for full account number]
- Account Name: Wolf Consulting Group, LLC

**Important:** Include your invoice number in the wire instructions.

#### 5. Check by Mail
- **Processing Time:** 7-10 business days
- **Fees:** No fee
- **How it works:** Mail a check to our address with invoice number in memo line.

**Mailing Address:**
Wolf Consulting Group, LLC
123 Main St, Suite 100
Raleigh, NC 27601
USA

**Important:** Write your invoice number on the check's memo line.

---

## How to Make a Payment {#how-to-make-a-payment}

### For Customers (Online Payments)

1. **Access the Portal**
   - Log in to the Customer Portal
   - Navigate to the Payment Portal

2. **Select Your Invoice**
   - Browse your outstanding invoices
   - Click on the invoice you wish to pay
   - The amount will auto-populate with the full balance

3. **Enter Payment Amount**
   - Adjust the amount if making a partial payment
   - Maximum amount is the invoice balance

4. **Choose Payment Method**
   - Select your preferred payment method
   - For credit card or PayPal, you'll proceed to a secure payment page
   - For offline methods (ACH, Wire, Check), view and follow the displayed instructions

5. **Complete Payment**
   - **Credit Card:** Enter your card details securely via Stripe
   - **PayPal:** Log in to your PayPal account to authorize
   - **Offline:** Follow the instructions and initiate payment through your bank or mail

6. **Confirmation**
   - You'll receive an email confirmation once payment is processed
   - For online payments, confirmation is instant
   - For offline payments, confirmation occurs when we receive and reconcile your payment

---

## Recording Manual Payments (Internal) {#recording-manual-payments}

*This section is for internal team members who process payments received via phone, mail, or in-person.*

### When to Use Manual Payment Recording

- Customer pays over the phone
- Check received by mail
- Cash payment (if enabled)
- Wire transfer confirmation received
- ACH transfer confirmation received

### How to Record a Manual Payment

1. **Access the "Record Payment" Tab**
   - Navigate to Payment Portal
   - Click the "Record Payment" tab

2. **Search for Invoice**
   - Enter invoice number or customer name
   - Select the correct invoice from search results

3. **Enter Payment Details**
   - **Amount:** Enter the payment amount received
   - **Method:** Select payment method (check, cash, wire, ACH, etc.)
   - **Reference:** Enter check number, wire confirmation, or transaction ID
   - **Date:** Select the date payment was received
   - **Notes:** Add any relevant notes about the payment

4. **Submit**
   - Click "Record Payment"
   - System will update the invoice balance
   - Customer will receive an email confirmation
   - Payment will appear in history with "Unreconciled" status

5. **Reconciliation**
   - Once payment clears your bank account, mark it as "Reconciled"
   - This helps with accounting and financial reporting

---

## Security & PCI Compliance {#security-pci-compliance}

### What is PCI DSS?

The Payment Card Industry Data Security Standard (PCI DSS) is a set of security standards designed to ensure that all companies that accept, process, store, or transmit credit card information maintain a secure environment.

### Our PCI Compliance Approach

#### Level 1 PCI DSS Compliance

We maintain **PCI DSS SAQ A** compliance by using hosted payment solutions:

1. **Tokenization**
   - Credit card data never touches our servers
   - Stripe securely tokenizes all card information
   - We only store non-sensitive payment tokens

2. **Secure Payment Forms**
   - Credit card forms are hosted and secured by Stripe
   - All payment data transmitted via TLS 1.2+ encryption
   - Forms are served from PCI-compliant domains

3. **No Sensitive Data Storage**
   - We NEVER store complete credit card numbers
   - We NEVER store CVV/CVC security codes
   - We NEVER store unencrypted cardholder data

#### Data Protection Measures

**Encryption in Transit:**
- All data transmitted using TLS 1.2 or higher
- HTTPS enforced for all payment pages
- End-to-end encryption for payment data

**Encryption at Rest:**
- Database encryption for all stored data
- Payment tokens encrypted using AES-256
- Secure key management practices

**Access Controls:**
- Role-based access control (RBAC)
- Multi-factor authentication (MFA) for admin access
- Audit logs for all payment activities
- Regular security audits and penetration testing

#### Third-Party Security

**Stripe (Credit Card Processing):**
- PCI DSS Level 1 Service Provider
- SOC 1 and SOC 2 Type II certified
- Handles billions in transactions annually
- Industry-leading fraud detection

**PayPal:**
- PCI DSS Level 1 compliant
- Advanced fraud protection
- Buyer and seller protection programs
- Industry-recognized security standards

### ACH & Wire Transfer Security

While ACH and wire transfers are not covered under PCI DSS (they don't involve payment cards), we follow NACHA guidelines and banking security standards:

- Bank account details are partially masked in the UI
- Full details only provided to authenticated users
- All bank information transmitted via encrypted channels
- Audit trails for all manual payment recordings

---

## Payment History & Tracking {#payment-history}

### Viewing Payment History

The Payment History tab provides a comprehensive view of all payments:

- **Date & Time:** When the payment was processed
- **Invoice Number:** Associated invoice
- **Amount:** Payment amount
- **Method:** How payment was made
- **Status:** Reconciled or Unreconciled
- **Reference:** Transaction ID, check number, etc.

### Payment Statuses

- **Reconciled:** Payment has cleared and been confirmed in bank account
- **Unreconciled:** Payment recorded but awaiting bank confirmation
- **Pending:** Online payment initiated but not yet completed
- **Failed:** Payment attempt failed (customer will be notified)
- **Refunded:** Payment was refunded to customer

### Filtering & Search

Use the filters to find specific payments:
- Search by invoice number, reference, or amount
- Filter by date range
- Filter by payment method
- Filter by reconciliation status

### Exporting Payment Data

Export payment history for accounting purposes:
- Download as CSV for Excel
- Download as PDF for records
- Includes all payment details and metadata

---

## FAQs {#faqs}

### General Questions

**Q: Is my payment information secure?**
A: Yes. We use industry-leading security measures and are PCI DSS compliant. Your credit card information never touches our servers—it's securely processed by Stripe, a Level 1 PCI DSS certified payment processor.

**Q: Why do credit card payments have fees?**
A: Payment processing fees are charged by credit card networks (Visa, Mastercard, etc.) and payment processors. These fees cover the cost of secure transaction processing, fraud protection, and regulatory compliance.

**Q: Can I make a partial payment?**
A: Yes. You can adjust the payment amount to any value up to the invoice balance. The remaining balance will stay on the invoice.

**Q: How long do payments take to process?**
A: 
- Credit card & PayPal: Instant
- ACH transfer: 2-3 business days
- Wire transfer: 1-5 business days
- Check: 7-10 business days

**Q: Will I receive a receipt?**
A: Yes. You'll receive an email confirmation immediately after payment is processed (for online methods) or when we receive and record your payment (for offline methods).

### Technical Questions

**Q: What browsers are supported?**
A: All modern browsers including Chrome, Firefox, Safari, Edge, and mobile browsers. Ensure JavaScript is enabled and cookies are accepted.

**Q: Why am I being redirected for credit card payments?**
A: For security and PCI compliance, credit card forms are hosted by Stripe (not on our servers). This protects your sensitive card data and reduces our PCI compliance scope.

**Q: Can I save my payment method?**
A: Not at this time. For security reasons, each payment requires re-entering payment information. This prevents unauthorized access to stored payment methods.

**Q: What if my payment fails?**
A: Common reasons for payment failures:
- Insufficient funds
- Card declined by bank
- Incorrect card details
- Card expired

If your payment fails, you'll receive an error message. Try again or contact your bank. You can also use an alternative payment method.

### Security Questions

**Q: How do you protect my data?**
A: We use multiple layers of security:
- TLS encryption for all data transmission
- PCI DSS compliance for card payments
- Tokenization of sensitive data
- Regular security audits
- Role-based access controls
- Audit logs for all activities

**Q: Do you store my credit card number?**
A: No. We never store complete credit card numbers, CVV codes, or sensitive card data. We only store secure tokens provided by Stripe.

**Q: What is tokenization?**
A: Tokenization replaces your actual card number with a unique, non-sensitive token. This token can be used for processing but is useless if intercepted by unauthorized parties.

**Q: How often do you audit security?**
A: We conduct:
- Quarterly PCI DSS self-assessments
- Annual third-party security audits
- Regular penetration testing
- Continuous monitoring for security threats

---

## Compliance Certifications

### PCI DSS Compliance

We maintain PCI DSS SAQ A compliance through:
- ✅ Use of validated payment solutions (Stripe, PayPal)
- ✅ Hosted payment pages
- ✅ No storage of sensitive authentication data
- ✅ Regular security assessments
- ✅ Network security and monitoring
- ✅ Employee training and awareness

### Additional Standards

- **NACHA Compliance:** For ACH transaction processing
- **SOC 2 Type II:** Security, availability, and confidentiality (in progress)
- **GDPR Compliance:** Data protection for EU customers
- **CCPA Compliance:** Privacy for California customers

---

## Support & Contact

### Need Help?

- **Customer Support:** support@wolfconsultingnc.com
- **Billing Questions:** billing@wolfconsultingnc.com
- **Phone:** (919) 555-1234
- **Hours:** Monday-Friday, 9 AM - 5 PM EST

### Report a Security Concern

If you notice any suspicious activity or potential security issues:
- **Email:** security@wolfconsultingnc.com
- **Emergency Phone:** (919) 555-SECURE

We take security seriously and investigate all reports promptly.

---

## Legal & Compliance

### Terms of Use

By using the Payment Portal, you agree to our:
- [Terms of Service](#)
- [Privacy Policy](#)
- [Payment Processing Agreement](#)

### Dispute Resolution

For payment disputes or chargebacks:
1. Contact our billing department first
2. Provide invoice number and payment details
3. We'll investigate and respond within 5 business days

### Regulatory Compliance

Our payment processing complies with:
- Payment Card Industry Data Security Standard (PCI DSS)
- NACHA Operating Rules (ACH)
- Federal Reserve Regulation E
- Truth in Lending Act
- Electronic Funds Transfer Act

---

**Last Updated:** December 2024  
**Document Version:** 1.0  
**Maintained by:** Wolf Consulting Group IT Security Team
`,
    category: 'Payments & Billing',
    tags: ['payment-portal', 'pci-compliance', 'security', 'credit-card', 'paypal', 'ach', 'wire-transfer', 'payments', 'billing'],
    status: 'published',
    featured: true,
    viewCount: 0,
    helpfulCount: 0,
    notHelpfulCount: 0,
    author: 'System',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    seoTitle: 'Payment Portal Security & PCI Compliance Guide',
    seoDescription: 'Complete guide to using the BOAZ-OS Payment Portal securely. Learn about payment methods, PCI DSS compliance, security measures, and best practices.',
  }

  // Check if article already exists
  const existing = await db.collection('kb_articles').findOne({ slug: article.slug })
  if (existing) {
    console.log('ℹ️  Article already exists, updating...')
    await db.collection('kb_articles').updateOne(
      { slug: article.slug },
      { $set: { ...article, _id: existing._id, createdAt: existing.createdAt } }
    )
  } else {
    console.log('✅ Creating new article...')
    await db.collection('kb_articles').insertOne(article)
  }

  console.log('✅ Payment Portal & PCI Compliance KB article seeded successfully!')
  process.exit(0)
}

seedPaymentPortalKB().catch((err) => {
  console.error('❌ Error seeding Payment Portal KB:', err)
  process.exit(1)
})

