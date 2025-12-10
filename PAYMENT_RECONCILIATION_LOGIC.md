# Payment Reconciliation Logic

## Overview

The Payment Portal tracks two types of payment statuses to ensure financial accuracy and proper accounting:

1. **Pending Reconciliation** (Unreconciled)
2. **Reconciled**

## What is Payment Reconciliation?

**Reconciliation** is the process of verifying that a recorded payment has been confirmed in your actual bank account, payment processor, or accounting system. It's a critical step in financial management to ensure:

- Checks have actually cleared
- Cash has been deposited
- Electronic payments have been completed
- No fraudulent or failed transactions were recorded

## Payment Statuses Explained

### Pending Reconciliation

A payment is marked as **"Pending Reconciliation"** when:

- **Manual Entry**: A staff member recorded a payment through the "Record Payment" tab (check, cash, phone payment)
- **Awaiting Confirmation**: The payment has been logged in the system but hasn't been verified against actual funds received
- **Not Yet Cleared**: For checks, this means the check hasn't cleared the bank yet
- **Not Yet Deposited**: For cash, this means the cash hasn't been taken to the bank and deposited

**Examples:**
- A customer mails you a check for $500. You record it immediately as "Payment Received" but mark it as unreconciled until the check clears your bank (usually 1-3 business days).
- A customer pays $200 cash at your office. You record the payment but mark it as unreconciled until you make the bank deposit.
- A customer pays over the phone with a credit card. You record the payment but mark it as unreconciled until you see the funds in your merchant account.

### Reconciled

A payment is marked as **"Reconciled"** when:

- **Verified in Bank**: You've confirmed the payment appears in your bank statement or merchant account
- **Funds Received**: The actual money has been received and deposited
- **Accounting Match**: The payment matches your accounting records (QuickBooks, Xero, etc.)
- **Webhook Confirmed**: For online payments (Stripe, PayPal), the payment processor webhook has confirmed successful payment

**Examples:**
- The $500 check cleared your bank, and you see it on your bank statement
- The $200 cash was deposited, and you have a deposit receipt
- The phone payment appears in your Stripe dashboard as "Paid"
- An online payment was automatically confirmed via Stripe webhook

## Why This Matters

### Financial Accuracy
- Prevents recording payments that never actually arrive (bounced checks, failed transactions)
- Ensures your invoices reflect actual funds received, not just promised

### Cash Flow Management
- Helps you understand what money you've actually received vs. what's still pending
- Critical for accurate cash flow forecasting

### Audit Trail
- Creates a clear record of when payments were recorded vs. when they were confirmed
- Important for tax purposes, audits, and financial reporting

### Fraud Prevention
- Identifies discrepancies between recorded and actual payments
- Helps catch errors or fraudulent transactions early

## Reconciliation Workflow

### Step 1: Record Payment (Unreconciled)
When a payment is received, a staff member:
1. Goes to **Payment Portal → Record Payment**
2. Selects the invoice
3. Enters payment details (amount, method, reference number)
4. Saves the payment
   - ✅ Invoice balance is updated immediately
   - ⚠️ Payment status: **"Pending Reconciliation"**

### Step 2: Verify Payment
Daily or weekly, your accounting team:
1. Checks bank statements
2. Reviews payment processor reports (Stripe, PayPal)
3. Matches recorded payments with actual deposits

### Step 3: Mark as Reconciled
Once verified, the payment is marked as **"Reconciled"**:
- This confirms the money was actually received
- The payment is now part of your verified financial records

### Step 4: Handle Discrepancies
If a payment doesn't reconcile:
- **Bounced check**: Reverse the payment, add fee, contact customer
- **Failed transaction**: Remove the payment record, follow up with customer
- **Wrong amount**: Adjust the payment record and invoice balance

## Automatic Reconciliation

### Online Payments (Credit Card, PayPal)
These payments can be **automatically reconciled** via webhooks:

1. Customer makes payment through secure checkout
2. Stripe/PayPal processes the payment
3. Webhook notification is sent to your system
4. System automatically marks payment as **"Reconciled"**
5. Confirmation email sent to customer and accounting team

This eliminates manual reconciliation for online payments!

### Manual Payments (Check, Cash, Wire)
These always require manual reconciliation because:
- Checks can bounce
- Cash must be physically deposited
- Wire transfers can fail or be delayed

## Using the Payment History Filter

### View All Payments
```
Status: "All Payments"
```
Shows every payment, regardless of reconciliation status.

### View Only Verified Payments
```
Status: "Reconciled"
```
Shows only payments that have been confirmed and verified. Use this for:
- Financial reports
- Tax preparation
- Verified revenue calculations

### View Pending Payments
```
Status: "Pending Reconciliation"
```
Shows payments awaiting verification. Use this for:
- Daily reconciliation tasks
- Follow-up on checks that should have cleared
- Identifying payments that need attention

## Best Practices

### 1. Daily Reconciliation
- Review "Pending Reconciliation" payments daily
- Mark payments as reconciled as soon as they clear
- Don't let unreconciled payments accumulate

### 2. Reference Numbers
Always include clear reference numbers:
- Check number (e.g., "CHECK-1234")
- Transaction ID (e.g., "pi_3Abc123...")
- Wire confirmation (e.g., "WIRE-REF-456")

### 3. Regular Bank Statement Matching
- At least weekly, match Payment History with bank statements
- Use date filters to focus on specific time periods
- Export to CSV for detailed reconciliation in Excel/accounting software

### 4. Follow Up on Pending
If a payment has been "Pending Reconciliation" for too long:
- **Checks**: Contact customer after 7 days if not cleared
- **Cash**: Should be deposited within 1-2 business days
- **Electronic**: Should reconcile within 24-48 hours

### 5. Document Discrepancies
If payments don't reconcile:
- Add notes explaining why
- Document any follow-up actions taken
- Keep records for audit purposes

## Technical Details

### Database Schema
```typescript
{
  _id: ObjectId,
  invoiceId: string,
  invoiceNumber: number,
  amount: number,
  method: 'check' | 'cash' | 'credit_card' | 'ach' | 'wire' | 'paypal',
  paidAt: Date,
  reference: string,
  notes: string,
  processedBy: string,
  reconciled: boolean,  // ← Reconciliation flag
  stripePaymentIntentId?: string,
  paypalTransactionId?: string,
  reconciledAt?: Date,  // When it was reconciled
  reconciledBy?: string // Who reconciled it
}
```

### API Filtering
```javascript
// Get all pending reconciliation payments
GET /api/payments/history?filter=unreconciled

// Get all reconciled payments
GET /api/payments/history?filter=reconciled

// Get all payments in date range
GET /api/payments/history?dateFrom=2024-01-01&dateTo=2024-12-31
```

## Future Enhancements

### Planned Features
1. **One-Click Reconciliation**: Mark multiple payments as reconciled at once
2. **Bank Feed Integration**: Automatically match bank transactions with recorded payments
3. **Reconciliation Reports**: Generate monthly reconciliation reports
4. **Notification Alerts**: Alert accounting team of payments pending reconciliation for >3 days
5. **Audit Log**: Track who reconciled each payment and when

### QuickBooks Integration
- Sync reconciled payments to QuickBooks automatically
- Two-way sync: reconciliation status updates in both systems
- Automatic journal entry creation for reconciled payments

## Summary

**Pending Reconciliation** = "We recorded this payment, but it hasn't been verified yet"

**Reconciled** = "We verified this payment cleared and the funds are in our account"

Always reconcile payments promptly to maintain accurate financial records and catch issues early!

---

**Need Help?**
- Contact your accounting team for reconciliation procedures
- See Payment Portal documentation for technical details
- Review your organization's finance policies for specific reconciliation timelines

