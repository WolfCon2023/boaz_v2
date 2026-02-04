/**
 * Auto-Posting Module for Financial Intelligence
 * 
 * This module provides functions to automatically create journal entries
 * from business transactions (invoices, payments, time entries, renewals).
 * 
 * GAAP-compliant double-entry accounting:
 * - Invoice Created: DR Accounts Receivable, CR Revenue
 * - Payment Received: DR Cash, CR Accounts Receivable
 * - Refund Issued: DR Revenue, CR Cash
 * - Time Entry (Billable): DR Direct Labor (COGS), CR Accrued Wages
 * - Time Entry (Non-Billable): DR Non-Billable Labor (OPEX), CR Accrued Wages
 * - Renewal: DR Accounts Receivable, CR Deferred Revenue
 */

import { ObjectId, Db } from 'mongodb'

// Standard account numbers (matching the seeded Chart of Accounts)
const ACCOUNTS = {
  CASH: '1010',                    // Checking Account (Cash)
  ACCOUNTS_RECEIVABLE: '1100',     // Accounts Receivable
  DEFERRED_REVENUE: '2200',        // Deferred Revenue
  ACCRUED_WAGES: '2110',           // Accrued Wages
  SERVICE_REVENUE: '4000',         // Service Revenue
  SUBSCRIPTION_REVENUE: '4100',    // Subscription Revenue
  DIRECT_LABOR: '5100',            // Direct Labor (COGS - billable)
  NON_BILLABLE_LABOR: '6050',      // Non-Billable Labor (OPEX)
}

interface JournalEntryLine {
  accountId: ObjectId
  accountNumber: string
  accountName: string
  debit: number
  credit: number
  description?: string
  projectId?: string
}

interface CreateJournalEntryParams {
  db: Db
  date: Date
  description: string
  sourceType: 'invoice' | 'invoice_adjustment' | 'payment' | 'expense' | 'payroll' | 'time_entry' | 'manual' | 'adjustment' | 'renewal'
  sourceId: string
  lines: Array<{
    accountNumber: string
    debit: number
    credit: number
    description?: string
    projectId?: string
  }>
  userId?: string
  userEmail?: string
}

async function getAccountByNumber(db: Db, accountNumber: string): Promise<{ _id: ObjectId; accountNumber: string; name: string } | null> {
  const account = await db.collection('fi_chart_of_accounts').findOne({ accountNumber, isActive: true })
  if (!account) return null
  return { _id: account._id, accountNumber: account.accountNumber, name: account.name }
}

async function getNextSequence(db: Db, name: string, startAt: number = 10001): Promise<number> {
  const result = await db.collection('fi_sequences').findOneAndUpdate(
    { _id: name } as any,
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after' }
  )
  if (!result || !(result as any).value) {
    await db.collection('fi_sequences').updateOne(
      { _id: name } as any,
      { $set: { value: startAt } },
      { upsert: true }
    )
    return startAt
  }
  return (result as any).value
}

async function findOpenPeriod(db: Db, date: Date): Promise<ObjectId | null> {
  const period = await db.collection('fi_periods').findOne({
    startDate: { $lte: date },
    endDate: { $gte: date },
    status: 'open',
  })
  return period?._id || null
}

/**
 * Creates a journal entry in the General Ledger
 * Returns the created entry ID or null if failed
 */
export async function createJournalEntry(params: CreateJournalEntryParams): Promise<string | null> {
  const { db, date, description, sourceType, sourceId, lines, userId, userEmail } = params

  try {
    // Validate all accounts exist and build enriched lines
    const enrichedLines: JournalEntryLine[] = []
    let totalDebits = 0
    let totalCredits = 0

    for (const line of lines) {
      const account = await getAccountByNumber(db, line.accountNumber)
      if (!account) {
        console.warn(`Auto-posting: Account ${line.accountNumber} not found, skipping journal entry for ${sourceType}:${sourceId}`)
        return null
      }
      enrichedLines.push({
        accountId: account._id,
        accountNumber: account.accountNumber,
        accountName: account.name,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
        projectId: line.projectId,
      })
      totalDebits += line.debit
      totalCredits += line.credit
    }

    // Validate debits = credits
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      console.error(`Auto-posting: Debits (${totalDebits}) != Credits (${totalCredits}) for ${sourceType}:${sourceId}`)
      return null
    }

    // Find appropriate period
    const periodId = await findOpenPeriod(db, date)
    if (!periodId) {
      console.warn(`Auto-posting: No open period found for date ${date.toISOString()}, skipping journal entry for ${sourceType}:${sourceId}`)
      return null
    }

    // Get next entry number
    const entryNumber = await getNextSequence(db, 'fi_journal_entries', 10001)

    const now = new Date()
    const entry = {
      _id: new ObjectId(),
      entryNumber,
      date,
      postingDate: now,
      periodId,
      description,
      sourceType,
      sourceId,
      lines: enrichedLines,
      status: 'posted',
      reversedEntryId: null,
      reversalOfEntryId: null,
      attachments: [],
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      createdBy: userId || 'system',
      updatedAt: now,
      updatedBy: userId || 'system',
      audit: [{
        action: 'auto_posted',
        userId: userId || 'system',
        userEmail: userEmail || 'system@boazos.com',
        timestamp: now,
        changes: { sourceType, sourceId },
      }],
    }

    await db.collection('fi_journal_entries').insertOne(entry as any)
    console.log(`Auto-posting: Created JE-${entryNumber} for ${sourceType}:${sourceId}`)
    return String(entry._id)
  } catch (error) {
    console.error(`Auto-posting error for ${sourceType}:${sourceId}:`, error)
    return null
  }
}

/**
 * Auto-post journal entry for invoice creation
 * DR: Accounts Receivable
 * CR: Service Revenue
 */
export async function postInvoiceCreated(
  db: Db,
  invoiceId: string,
  invoiceNumber: number | string,
  amount: number,
  date: Date,
  customerName: string,
  userId?: string,
  userEmail?: string
): Promise<string | null> {
  if (amount <= 0) return null

  return createJournalEntry({
    db,
    date,
    description: `Invoice #${invoiceNumber} - ${customerName}`,
    sourceType: 'invoice',
    sourceId: invoiceId,
    lines: [
      { accountNumber: ACCOUNTS.ACCOUNTS_RECEIVABLE, debit: amount, credit: 0, description: `Invoice #${invoiceNumber}` },
      { accountNumber: ACCOUNTS.SERVICE_REVENUE, debit: 0, credit: amount, description: `Invoice #${invoiceNumber}` },
    ],
    userId,
    userEmail,
  })
}

/**
 * Auto-post journal entry for invoice adjustment (increase or decrease)
 * If amount > 0 (increase): DR Accounts Receivable, CR Revenue
 * If amount < 0 (decrease): DR Revenue, CR Accounts Receivable
 */
export async function postInvoiceAdjustment(
  db: Db,
  invoiceId: string,
  invoiceNumber: number | string,
  adjustmentAmount: number,
  date: Date,
  customerName: string,
  userId?: string,
  userEmail?: string
): Promise<string | null> {
  if (adjustmentAmount === 0) return null

  const absAmount = Math.abs(adjustmentAmount)
  const isIncrease = adjustmentAmount > 0
  const adjustmentType = isIncrease ? 'increase' : 'decrease'

  return createJournalEntry({
    db,
    date,
    description: `Invoice #${invoiceNumber} adjustment (${adjustmentType}) - ${customerName}`,
    sourceType: 'invoice_adjustment',
    sourceId: `${invoiceId}_adj_${date.getTime()}`,
    lines: isIncrease
      ? [
          { accountNumber: ACCOUNTS.ACCOUNTS_RECEIVABLE, debit: absAmount, credit: 0, description: `Invoice #${invoiceNumber} adjustment` },
          { accountNumber: ACCOUNTS.SERVICE_REVENUE, debit: 0, credit: absAmount, description: `Invoice #${invoiceNumber} adjustment` },
        ]
      : [
          { accountNumber: ACCOUNTS.SERVICE_REVENUE, debit: absAmount, credit: 0, description: `Invoice #${invoiceNumber} adjustment` },
          { accountNumber: ACCOUNTS.ACCOUNTS_RECEIVABLE, debit: 0, credit: absAmount, description: `Invoice #${invoiceNumber} adjustment` },
        ],
    userId,
    userEmail,
  })
}

/**
 * Auto-post journal entry for payment received
 * DR: Cash
 * CR: Accounts Receivable
 */
export async function postPaymentReceived(
  db: Db,
  paymentId: string,
  invoiceId: string,
  invoiceNumber: number | string,
  amount: number,
  date: Date,
  customerName: string,
  paymentMethod?: string,
  userId?: string,
  userEmail?: string
): Promise<string | null> {
  if (amount <= 0) return null

  const methodNote = paymentMethod ? ` via ${paymentMethod}` : ''
  return createJournalEntry({
    db,
    date,
    description: `Payment for Invoice #${invoiceNumber} - ${customerName}${methodNote}`,
    sourceType: 'payment',
    sourceId: paymentId,
    lines: [
      { accountNumber: ACCOUNTS.CASH, debit: amount, credit: 0, description: `Payment for Invoice #${invoiceNumber}` },
      { accountNumber: ACCOUNTS.ACCOUNTS_RECEIVABLE, debit: 0, credit: amount, description: `Payment for Invoice #${invoiceNumber}` },
    ],
    userId,
    userEmail,
  })
}

/**
 * Auto-post journal entry for refund issued
 * DR: Service Revenue
 * CR: Cash
 */
export async function postRefundIssued(
  db: Db,
  refundId: string,
  invoiceId: string,
  invoiceNumber: number | string,
  amount: number,
  date: Date,
  customerName: string,
  reason?: string,
  userId?: string,
  userEmail?: string
): Promise<string | null> {
  if (amount <= 0) return null

  const reasonNote = reason ? ` - ${reason}` : ''
  return createJournalEntry({
    db,
    date,
    description: `Refund for Invoice #${invoiceNumber} - ${customerName}${reasonNote}`,
    sourceType: 'payment',
    sourceId: refundId,
    lines: [
      { accountNumber: ACCOUNTS.SERVICE_REVENUE, debit: amount, credit: 0, description: `Refund for Invoice #${invoiceNumber}` },
      { accountNumber: ACCOUNTS.CASH, debit: 0, credit: amount, description: `Refund for Invoice #${invoiceNumber}` },
    ],
    userId,
    userEmail,
  })
}

/**
 * Auto-post journal entry for time entry logged
 * Billable: DR Direct Labor (COGS), CR Accrued Wages
 * Non-Billable: DR Non-Billable Labor (OPEX), CR Accrued Wages
 * 
 * @param hourlyRate - The cost rate for the labor (employee/contractor rate, not billing rate)
 */
export async function postTimeEntry(
  db: Db,
  timeEntryId: string,
  projectId: string,
  projectName: string,
  isBillable: boolean,
  minutes: number,
  hourlyRate: number,
  date: Date,
  userName: string,
  userId?: string,
  userEmail?: string
): Promise<string | null> {
  const hours = minutes / 60
  const amount = Math.round(hours * hourlyRate * 100) / 100

  if (amount <= 0) return null

  const laborAccount = isBillable ? ACCOUNTS.DIRECT_LABOR : ACCOUNTS.NON_BILLABLE_LABOR
  const laborType = isBillable ? 'billable' : 'non-billable'

  return createJournalEntry({
    db,
    date,
    description: `${userName} - ${hours.toFixed(2)}h ${laborType} time on ${projectName}`,
    sourceType: 'time_entry',
    sourceId: timeEntryId,
    lines: [
      { accountNumber: laborAccount, debit: amount, credit: 0, description: `${laborType} labor`, projectId },
      { accountNumber: ACCOUNTS.ACCRUED_WAGES, debit: 0, credit: amount, description: `Accrued wages - ${userName}`, projectId },
    ],
    userId,
    userEmail,
  })
}

/**
 * Auto-post journal entry for subscription/renewal
 * Initial: DR Accounts Receivable, CR Deferred Revenue
 */
export async function postRenewalCreated(
  db: Db,
  renewalId: string,
  amount: number,
  date: Date,
  customerName: string,
  productName: string,
  term?: string,
  userId?: string,
  userEmail?: string
): Promise<string | null> {
  if (amount <= 0) return null

  const termNote = term ? ` (${term})` : ''
  return createJournalEntry({
    db,
    date,
    description: `Renewal - ${productName} for ${customerName}${termNote}`,
    sourceType: 'renewal',
    sourceId: renewalId,
    lines: [
      { accountNumber: ACCOUNTS.ACCOUNTS_RECEIVABLE, debit: amount, credit: 0, description: `Renewal - ${productName}` },
      { accountNumber: ACCOUNTS.DEFERRED_REVENUE, debit: 0, credit: amount, description: `Deferred revenue - ${productName}` },
    ],
    userId,
    userEmail,
  })
}

/**
 * Auto-post journal entry for monthly subscription revenue recognition
 * DR: Deferred Revenue, CR: Subscription Revenue
 */
export async function postSubscriptionRevenueRecognition(
  db: Db,
  renewalId: string,
  amount: number,
  date: Date,
  customerName: string,
  productName: string,
  periodName: string,
  userId?: string,
  userEmail?: string
): Promise<string | null> {
  if (amount <= 0) return null

  return createJournalEntry({
    db,
    date,
    description: `Revenue recognition - ${productName} for ${customerName} (${periodName})`,
    sourceType: 'renewal',
    sourceId: `${renewalId}_rev_${periodName.replace(/\s/g, '_')}`,
    lines: [
      { accountNumber: ACCOUNTS.DEFERRED_REVENUE, debit: amount, credit: 0, description: `Rev rec - ${periodName}` },
      { accountNumber: ACCOUNTS.SUBSCRIPTION_REVENUE, debit: 0, credit: amount, description: `Subscription revenue - ${periodName}` },
    ],
    userId,
    userEmail,
  })
}

/**
 * Check if a journal entry already exists for a source document
 * Prevents duplicate posting
 */
export async function journalEntryExistsForSource(
  db: Db,
  sourceType: string,
  sourceId: string
): Promise<boolean> {
  const existing = await db.collection('fi_journal_entries').findOne({
    sourceType,
    sourceId,
    status: { $ne: 'reversed' },
  })
  return !!existing
}

/**
 * Get all journal entries for a source document
 */
export async function getJournalEntriesForSource(
  db: Db,
  sourceType: string,
  sourceId: string
): Promise<any[]> {
  return db.collection('fi_journal_entries')
    .find({ sourceType, sourceId })
    .sort({ entryNumber: 1 })
    .toArray()
}
