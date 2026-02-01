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
import { ObjectId } from 'mongodb';
// Standard account numbers (matching the seeded Chart of Accounts)
const ACCOUNTS = {
    CASH: '1010', // Checking Account (Cash)
    ACCOUNTS_RECEIVABLE: '1100', // Accounts Receivable
    DEFERRED_REVENUE: '2200', // Deferred Revenue
    ACCRUED_WAGES: '2110', // Accrued Wages
    SERVICE_REVENUE: '4000', // Service Revenue
    SUBSCRIPTION_REVENUE: '4100', // Subscription Revenue
    DIRECT_LABOR: '5100', // Direct Labor (COGS - billable)
    NON_BILLABLE_LABOR: '6050', // Non-Billable Labor (OPEX)
};
async function getAccountByNumber(db, accountNumber) {
    const account = await db.collection('fi_chart_of_accounts').findOne({ accountNumber, isActive: true });
    if (!account)
        return null;
    return { _id: account._id, accountNumber: account.accountNumber, name: account.name };
}
async function getNextSequence(db, name, startAt = 10001) {
    const result = await db.collection('fi_sequences').findOneAndUpdate({ _id: name }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after' });
    if (!result || !result.value) {
        await db.collection('fi_sequences').updateOne({ _id: name }, { $set: { value: startAt } }, { upsert: true });
        return startAt;
    }
    return result.value;
}
async function findOpenPeriod(db, date) {
    const period = await db.collection('fi_periods').findOne({
        startDate: { $lte: date },
        endDate: { $gte: date },
        status: 'open',
    });
    return period?._id || null;
}
/**
 * Creates a journal entry in the General Ledger
 * Returns the created entry ID or null if failed
 */
export async function createJournalEntry(params) {
    const { db, date, description, sourceType, sourceId, lines, userId, userEmail } = params;
    try {
        // Validate all accounts exist and build enriched lines
        const enrichedLines = [];
        let totalDebits = 0;
        let totalCredits = 0;
        for (const line of lines) {
            const account = await getAccountByNumber(db, line.accountNumber);
            if (!account) {
                console.warn(`Auto-posting: Account ${line.accountNumber} not found, skipping journal entry for ${sourceType}:${sourceId}`);
                return null;
            }
            enrichedLines.push({
                accountId: account._id,
                accountNumber: account.accountNumber,
                accountName: account.name,
                debit: line.debit,
                credit: line.credit,
                description: line.description,
                projectId: line.projectId,
            });
            totalDebits += line.debit;
            totalCredits += line.credit;
        }
        // Validate debits = credits
        if (Math.abs(totalDebits - totalCredits) > 0.01) {
            console.error(`Auto-posting: Debits (${totalDebits}) != Credits (${totalCredits}) for ${sourceType}:${sourceId}`);
            return null;
        }
        // Find appropriate period
        const periodId = await findOpenPeriod(db, date);
        if (!periodId) {
            console.warn(`Auto-posting: No open period found for date ${date.toISOString()}, skipping journal entry for ${sourceType}:${sourceId}`);
            return null;
        }
        // Get next entry number
        const entryNumber = await getNextSequence(db, 'fi_journal_entries', 10001);
        const now = new Date();
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
        };
        await db.collection('fi_journal_entries').insertOne(entry);
        console.log(`Auto-posting: Created JE-${entryNumber} for ${sourceType}:${sourceId}`);
        return String(entry._id);
    }
    catch (error) {
        console.error(`Auto-posting error for ${sourceType}:${sourceId}:`, error);
        return null;
    }
}
/**
 * Auto-post journal entry for invoice creation
 * DR: Accounts Receivable
 * CR: Service Revenue
 */
export async function postInvoiceCreated(db, invoiceId, invoiceNumber, amount, date, customerName, userId, userEmail) {
    if (amount <= 0)
        return null;
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
    });
}
/**
 * Auto-post journal entry for payment received
 * DR: Cash
 * CR: Accounts Receivable
 */
export async function postPaymentReceived(db, paymentId, invoiceId, invoiceNumber, amount, date, customerName, paymentMethod, userId, userEmail) {
    if (amount <= 0)
        return null;
    const methodNote = paymentMethod ? ` via ${paymentMethod}` : '';
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
    });
}
/**
 * Auto-post journal entry for refund issued
 * DR: Service Revenue
 * CR: Cash
 */
export async function postRefundIssued(db, refundId, invoiceId, invoiceNumber, amount, date, customerName, reason, userId, userEmail) {
    if (amount <= 0)
        return null;
    const reasonNote = reason ? ` - ${reason}` : '';
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
    });
}
/**
 * Auto-post journal entry for time entry logged
 * Billable: DR Direct Labor (COGS), CR Accrued Wages
 * Non-Billable: DR Non-Billable Labor (OPEX), CR Accrued Wages
 *
 * @param hourlyRate - The cost rate for the labor (employee/contractor rate, not billing rate)
 */
export async function postTimeEntry(db, timeEntryId, projectId, projectName, isBillable, minutes, hourlyRate, date, userName, userId, userEmail) {
    const hours = minutes / 60;
    const amount = Math.round(hours * hourlyRate * 100) / 100;
    if (amount <= 0)
        return null;
    const laborAccount = isBillable ? ACCOUNTS.DIRECT_LABOR : ACCOUNTS.NON_BILLABLE_LABOR;
    const laborType = isBillable ? 'billable' : 'non-billable';
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
    });
}
/**
 * Auto-post journal entry for subscription/renewal
 * Initial: DR Accounts Receivable, CR Deferred Revenue
 */
export async function postRenewalCreated(db, renewalId, amount, date, customerName, productName, term, userId, userEmail) {
    if (amount <= 0)
        return null;
    const termNote = term ? ` (${term})` : '';
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
    });
}
/**
 * Auto-post journal entry for monthly subscription revenue recognition
 * DR: Deferred Revenue, CR: Subscription Revenue
 */
export async function postSubscriptionRevenueRecognition(db, renewalId, amount, date, customerName, productName, periodName, userId, userEmail) {
    if (amount <= 0)
        return null;
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
    });
}
/**
 * Check if a journal entry already exists for a source document
 * Prevents duplicate posting
 */
export async function journalEntryExistsForSource(db, sourceType, sourceId) {
    const existing = await db.collection('fi_journal_entries').findOne({
        sourceType,
        sourceId,
        status: { $ne: 'reversed' },
    });
    return !!existing;
}
/**
 * Get all journal entries for a source document
 */
export async function getJournalEntriesForSource(db, sourceType, sourceId) {
    return db.collection('fi_journal_entries')
        .find({ sourceType, sourceId })
        .sort({ entryNumber: 1 })
        .toArray();
}
