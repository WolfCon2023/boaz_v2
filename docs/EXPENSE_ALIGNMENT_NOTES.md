# BOAZ CRM Expenses & Financial Intelligence Alignment

## Overview

This document describes the expense data flow between CRM Expenses and Financial Intelligence,
explains the perceived "mismatch" in Revenue & Expense Trends, and defines the unified calculation logic.

## Current Architecture

### Data Collections

| Collection | Purpose | Used By |
|-----------|---------|---------|
| `crm_expenses` | CRM expense records with approval workflow | CRM Expenses page |
| `fi_journal_entries` | Double-entry accounting journal entries | Financial Intelligence trends |
| `fi_chart_of_accounts` | Chart of accounts for expense categorization | Both systems |

### CRM Expenses Workflow

```
Draft → Pending Approval → Approved → Paid → (Journal Entry Created)
                        ↓
                    Rejected → (Edit & Resubmit)
```

- **Draft**: Initial state, fully editable
- **Pending Approval**: Submitted for review, locked
- **Approved**: Ready to be paid
- **Rejected**: Returned for revision, can be edited
- **Paid**: Final state, creates journal entry in Financial Intelligence
- **Void**: Cancelled (cannot be paid)

### Financial Intelligence Trend Calculation

Location: `apps/api/src/financial/index.ts` (lines 2421-2470)

```typescript
// Revenue & Expense Trend aggregation
db.collection('fi_journal_entries').aggregate([
  { $match: { status: 'posted', date: { $gte: sixMonthsAgo, $lte: currentDate } } },
  { $unwind: '$lines' },
  { $lookup: { from: 'fi_chart_of_accounts', ... } },
  { $match: { 'account.type': { $in: ['Revenue', 'Expense'] } } },
  { $group: { _id: { year, month, type }, totalDebits, totalCredits } },
])
```

**Key filters:**
- `status: 'posted'` - Only posted journal entries
- `date` field from journal entries
- Account type: 'Revenue' or 'Expense'

**Calculation:**
- Revenue = `totalCredits - totalDebits` (for Revenue accounts)
- Expenses = `totalDebits - totalCredits` (for Expense accounts)

## Root Cause of "Mismatch"

### Why Numbers Differ

| View | Data Source | Status Filter | Shows |
|------|-------------|---------------|-------|
| CRM Expenses Summary | `crm_expenses` | All statuses | Draft, Pending, Approved, Rejected, Paid, Void |
| FI Revenue & Expense Trend | `fi_journal_entries` | `status: 'posted'` | Only Paid expenses (posted as JE) |

**The "mismatch" is intentional and correct:**

1. CRM Summary shows all expenses in the pipeline (including unpaid)
2. FI Trends show only **recognized** expenses (paid and posted to GL)
3. GAAP/accrual accounting requires expenses to be "recognized" before appearing in financial reports

### Example

- CRM shows $50,000 in "Approved" expenses waiting to be paid
- FI Trend shows only $30,000 in expenses for the month
- The $20,000 difference is approved but not yet paid/recognized

This is **not a bug** - it's proper accounting behavior.

## Unified Definition (for future configurable views)

### Default Definition (Financial Reporting)

For financial trends and reports, use these defaults:

| Field | Definition |
|-------|------------|
| **Expense Amount** | `expense.total` (sum of line amounts) |
| **Date for Trends** | `expense.date` (expense occurrence date, not createdAt) |
| **Status Inclusion** | Only `'paid'` status (expenses that created journal entries) |
| **Tenant Scoping** | Filter by `tenantId` when multi-tenant |
| **Currency** | Single currency per tenant (USD default) |

### Alternative Definition (Pipeline View)

For operational dashboards showing expense pipeline:

| Field | Definition |
|-------|------------|
| **Status Inclusion** | `'approved'` + `'paid'` (committed expenses) |
| **Optional** | Include `'pending_approval'` for full pipeline visibility |

## Implementation Notes

### When CRM Expense Becomes a Journal Entry

File: `apps/api/src/crm/expenses.ts` (lines 559-694)

When an expense is marked as "Paid":
1. Find open accounting period
2. Create journal entry with:
   - DR: Expense account(s) from line items
   - CR: Cash/Bank account (1010)
3. Set `journalEntryId` on expense record
4. Set `status: 'posted'` on journal entry

### Recommended Improvements

1. **Add expense date validation**: Ensure `expense.date` falls within open period
2. **Add approval history**: Track who approved/rejected and when
3. **Add approver selection**: Let submitter choose which manager approves
4. **Add attachments**: Receipt/document upload support

## File References

| Component | File Path |
|-----------|-----------|
| CRM Expenses API | `apps/api/src/crm/expenses.ts` |
| CRM Expenses UI | `apps/web/src/pages/CRMExpenses.tsx` |
| FI Analytics API | `apps/api/src/financial/index.ts` (lines 2303-2556) |
| FI Dashboard UI | `apps/web/src/pages/FinancialIntelligence.tsx` |
| Deal Approval Queue | `apps/web/src/pages/CRMDealApprovalQueue.tsx` |
| Deal Approval API | `apps/api/src/crm/deals.ts` (lines 446-590) |

## Schema Reference

### CRM Expense Document

```typescript
type ExpenseDoc = {
  _id: ObjectId
  expenseNumber: number
  date: Date                    // Expense occurrence date (use for trends)
  vendorId?: ObjectId
  vendorName?: string
  payee?: string
  description: string
  lines: ExpenseLine[]
  total: number                 // Sum of line amounts
  paymentMethod?: string
  referenceNumber?: string
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'paid' | 'void'
  submittedBy?: string
  submittedAt?: Date
  approvedBy?: string           // User who approved
  approvedAt?: Date
  approverUserId?: string       // NEW: Selected approver (manager)
  rejectedBy?: string
  rejectedAt?: Date
  rejectionReason?: string
  paidBy?: string
  paidAt?: Date
  voidedBy?: string
  voidedAt?: Date
  voidReason?: string
  journalEntryId?: string       // Links to fi_journal_entries when paid
  attachments?: Attachment[]    // NEW: Receipt/document attachments
  approvalHistory?: ApprovalHistoryEntry[]  // NEW: Approval audit trail
  notes?: string
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

type Attachment = {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  uploadedByUserId: string
  uploadedAt: Date
  url: string
}

type ApprovalHistoryEntry = {
  action: 'submitted' | 'approved' | 'rejected' | 'withdrawn'
  userId: string
  userEmail?: string
  userName?: string
  timestamp: Date
  notes?: string
}
```

---

*Last updated: 2026-02-04*
*Author: BOAZ Development Team*
