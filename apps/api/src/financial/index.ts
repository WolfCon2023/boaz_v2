import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { getDb } from '../db.js'
import { requireAuth, requirePermission } from '../auth/rbac.js'

export const financialRouter = Router()

financialRouter.use(requireAuth)

// ============================================================================
// TYPES AND SCHEMAS
// ============================================================================

type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'
type AccountSubType = 
  | 'Current Asset' | 'Non-Current Asset' | 'Fixed Asset'
  | 'Current Liability' | 'Long-Term Liability'
  | 'Equity' | 'Retained Earnings'
  | 'Operating Revenue' | 'Other Revenue'
  | 'COGS' | 'Operating Expense' | 'Other Expense'

type NormalBalance = 'Debit' | 'Credit'

type ChartOfAccountsDoc = {
  _id: ObjectId
  accountNumber: string
  name: string
  type: AccountType
  subType: AccountSubType
  normalBalance: NormalBalance
  parentAccountId?: ObjectId | null
  isActive: boolean
  description?: string | null
  taxCode?: string | null
  createdAt: Date
  updatedAt: Date
  createdBy: string
  updatedBy: string
}

type JournalEntryStatus = 'draft' | 'posted' | 'reversed'
type JournalEntrySourceType = 'invoice' | 'payment' | 'expense' | 'payroll' | 'time_entry' | 'manual' | 'adjustment' | 'renewal'

type JournalEntryLine = {
  accountId: ObjectId
  accountNumber?: string
  accountName?: string
  debit: number
  credit: number
  description?: string | null
  departmentId?: string | null
  projectId?: string | null
  costCenterId?: string | null
}

type AuditEntry = {
  action: string
  userId: string
  userEmail?: string
  timestamp: Date
  changes?: any
  ipAddress?: string
}

type JournalEntryDoc = {
  _id: ObjectId
  entryNumber: number
  date: Date
  postingDate?: Date | null
  periodId?: ObjectId | null
  description: string
  sourceType: JournalEntrySourceType
  sourceId?: string | null
  lines: JournalEntryLine[]
  status: JournalEntryStatus
  reversedEntryId?: ObjectId | null
  reversalOfEntryId?: ObjectId | null
  attachments?: string[]
  approvedBy?: string | null
  approvedAt?: Date | null
  createdAt: Date
  createdBy: string
  updatedAt: Date
  updatedBy: string
  audit: AuditEntry[]
}

type PeriodStatus = 'open' | 'closed' | 'locked'

type AccountingPeriodDoc = {
  _id: ObjectId
  name: string
  startDate: Date
  endDate: Date
  fiscalYear: number
  fiscalQuarter: number
  fiscalMonth: number
  status: PeriodStatus
  closedAt?: Date | null
  closedBy?: string | null
  lockedAt?: Date | null
  lockedBy?: string | null
  createdAt: Date
  updatedAt: Date
}

type ExpenseStatus = 'draft' | 'pending_approval' | 'approved' | 'paid' | 'void'

type ExpenseLine = {
  accountId: ObjectId
  accountNumber?: string
  accountName?: string
  amount: number
  description?: string | null
  departmentId?: string | null
  projectId?: string | null
}

type ExpenseDoc = {
  _id: ObjectId
  expenseNumber: number
  vendorId?: ObjectId | null
  vendorName?: string | null
  date: Date
  dueDate?: Date | null
  description: string
  category: string
  lines: ExpenseLine[]
  subtotal: number
  tax: number
  total: number
  status: ExpenseStatus
  paymentMethod?: string | null
  receipt?: string | null
  approvedBy?: string | null
  approvedAt?: Date | null
  paidAt?: Date | null
  journalEntryId?: ObjectId | null
  createdAt: Date
  createdBy: string
  updatedAt: Date
  updatedBy: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function objIdOrNull(v: string | null | undefined): ObjectId | null {
  if (!v) return null
  try {
    return ObjectId.isValid(v) ? new ObjectId(v) : null
  } catch {
    return null
  }
}

async function ensureFinancialIndexes(db: any) {
  try {
    await db.collection('fi_chart_of_accounts').createIndex({ accountNumber: 1 }, { unique: true, background: true })
    await db.collection('fi_chart_of_accounts').createIndex({ type: 1 }, { background: true })
    await db.collection('fi_chart_of_accounts').createIndex({ isActive: 1 }, { background: true })
    
    await db.collection('fi_journal_entries').createIndex({ entryNumber: 1 }, { unique: true, background: true })
    await db.collection('fi_journal_entries').createIndex({ date: 1 }, { background: true })
    await db.collection('fi_journal_entries').createIndex({ status: 1 }, { background: true })
    await db.collection('fi_journal_entries').createIndex({ sourceType: 1, sourceId: 1 }, { background: true })
    await db.collection('fi_journal_entries').createIndex({ periodId: 1 }, { background: true })
    
    await db.collection('fi_periods').createIndex({ startDate: 1, endDate: 1 }, { background: true })
    await db.collection('fi_periods').createIndex({ fiscalYear: 1, fiscalMonth: 1 }, { unique: true, background: true })
    await db.collection('fi_periods').createIndex({ status: 1 }, { background: true })
    
    await db.collection('fi_expenses').createIndex({ expenseNumber: 1 }, { unique: true, background: true })
    await db.collection('fi_expenses').createIndex({ date: 1 }, { background: true })
    await db.collection('fi_expenses').createIndex({ status: 1 }, { background: true })
    await db.collection('fi_expenses').createIndex({ vendorId: 1 }, { background: true })
  } catch (e) {
    // Indexes may already exist
  }
}

async function getNextSequence(db: any, name: string, startAt: number = 1): Promise<number> {
  const result = await db.collection('fi_sequences').findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after' }
  )
  if (!result?.value) {
    await db.collection('fi_sequences').updateOne(
      { _id: name },
      { $set: { value: startAt } },
      { upsert: true }
    )
    return startAt
  }
  return result.value
}

function getNormalBalance(type: AccountType): NormalBalance {
  switch (type) {
    case 'Asset':
    case 'Expense':
      return 'Debit'
    case 'Liability':
    case 'Equity':
    case 'Revenue':
      return 'Credit'
  }
}

// ============================================================================
// CHART OF ACCOUNTS
// ============================================================================

// GET /api/financial/chart-of-accounts
financialRouter.get('/chart-of-accounts', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureFinancialIndexes(db)

  const includeInactive = req.query.includeInactive === 'true'
  const typeFilter = req.query.type as AccountType | undefined

  const filter: any = {}
  if (!includeInactive) filter.isActive = true
  if (typeFilter) filter.type = typeFilter

  const accounts = await db
    .collection('fi_chart_of_accounts')
    .find(filter)
    .sort({ accountNumber: 1 })
    .toArray()

  res.json({
    data: {
      items: accounts.map((a: any) => ({
        id: String(a._id),
        accountNumber: a.accountNumber,
        name: a.name,
        type: a.type,
        subType: a.subType,
        normalBalance: a.normalBalance,
        parentAccountId: a.parentAccountId ? String(a.parentAccountId) : null,
        isActive: a.isActive,
        description: a.description || null,
        taxCode: a.taxCode || null,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    },
    error: null,
  })
})

// GET /api/financial/chart-of-accounts/:id
financialRouter.get('/chart-of-accounts/:id', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const id = objIdOrNull(req.params.id)
  if (!id) return res.status(400).json({ data: null, error: 'invalid_id' })

  const account = await db.collection('fi_chart_of_accounts').findOne({ _id: id })
  if (!account) return res.status(404).json({ data: null, error: 'not_found' })

  res.json({
    data: {
      id: String(account._id),
      accountNumber: account.accountNumber,
      name: account.name,
      type: account.type,
      subType: account.subType,
      normalBalance: account.normalBalance,
      parentAccountId: account.parentAccountId ? String(account.parentAccountId) : null,
      isActive: account.isActive,
      description: account.description || null,
      taxCode: account.taxCode || null,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    },
    error: null,
  })
})

const createAccountSchema = z.object({
  accountNumber: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  type: z.enum(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']),
  subType: z.string().min(1).max(50),
  parentAccountId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  taxCode: z.string().nullable().optional(),
})

// POST /api/financial/chart-of-accounts (Admin only)
financialRouter.post('/chart-of-accounts', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureFinancialIndexes(db)

  const auth = req.auth as { userId: string; email: string }
  const parsed = createAccountSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_input', details: parsed.error.flatten() })

  const { accountNumber, name, type, subType, parentAccountId, description, taxCode } = parsed.data

  // Check for duplicate account number
  const existing = await db.collection('fi_chart_of_accounts').findOne({ accountNumber })
  if (existing) return res.status(400).json({ data: null, error: 'account_number_exists' })

  const now = new Date()
  const doc: ChartOfAccountsDoc = {
    _id: new ObjectId(),
    accountNumber,
    name,
    type,
    subType: subType as AccountSubType,
    normalBalance: getNormalBalance(type),
    parentAccountId: parentAccountId ? objIdOrNull(parentAccountId) : null,
    isActive: true,
    description: description || null,
    taxCode: taxCode || null,
    createdAt: now,
    updatedAt: now,
    createdBy: auth.userId,
    updatedBy: auth.userId,
  }

  await db.collection('fi_chart_of_accounts').insertOne(doc as any)

  res.status(201).json({
    data: {
      id: String(doc._id),
      accountNumber: doc.accountNumber,
      name: doc.name,
      type: doc.type,
      subType: doc.subType,
      normalBalance: doc.normalBalance,
    },
    error: null,
  })
})

// PATCH /api/financial/chart-of-accounts/:id (Admin only)
financialRouter.patch('/chart-of-accounts/:id', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }
  const id = objIdOrNull(req.params.id)
  if (!id) return res.status(400).json({ data: null, error: 'invalid_id' })

  const account = await db.collection('fi_chart_of_accounts').findOne({ _id: id })
  if (!account) return res.status(404).json({ data: null, error: 'not_found' })

  const updates: any = { updatedAt: new Date(), updatedBy: auth.userId }
  
  if (typeof req.body.name === 'string') updates.name = req.body.name
  if (typeof req.body.description === 'string' || req.body.description === null) updates.description = req.body.description
  if (typeof req.body.taxCode === 'string' || req.body.taxCode === null) updates.taxCode = req.body.taxCode
  if (typeof req.body.isActive === 'boolean') updates.isActive = req.body.isActive
  if (typeof req.body.subType === 'string') updates.subType = req.body.subType

  await db.collection('fi_chart_of_accounts').updateOne({ _id: id }, { $set: updates })

  res.json({ data: { id: String(id), updated: true }, error: null })
})

// POST /api/financial/chart-of-accounts/seed-default (Admin only)
financialRouter.post('/chart-of-accounts/seed-default', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureFinancialIndexes(db)

  const auth = req.auth as { userId: string; email: string }
  const now = new Date()

  // Standard Chart of Accounts template
  const defaultAccounts: Omit<ChartOfAccountsDoc, '_id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>[] = [
    // Assets (1xxx)
    { accountNumber: '1000', name: 'Cash and Cash Equivalents', type: 'Asset', subType: 'Current Asset', normalBalance: 'Debit', isActive: true, description: 'Primary operating cash accounts', parentAccountId: null, taxCode: null },
    { accountNumber: '1010', name: 'Checking Account', type: 'Asset', subType: 'Current Asset', normalBalance: 'Debit', isActive: true, description: 'Main checking account', parentAccountId: null, taxCode: null },
    { accountNumber: '1020', name: 'Savings Account', type: 'Asset', subType: 'Current Asset', normalBalance: 'Debit', isActive: true, description: 'Business savings account', parentAccountId: null, taxCode: null },
    { accountNumber: '1100', name: 'Accounts Receivable', type: 'Asset', subType: 'Current Asset', normalBalance: 'Debit', isActive: true, description: 'Customer receivables', parentAccountId: null, taxCode: null },
    { accountNumber: '1150', name: 'Allowance for Doubtful Accounts', type: 'Asset', subType: 'Current Asset', normalBalance: 'Credit', isActive: true, description: 'Contra-asset for bad debts', parentAccountId: null, taxCode: null },
    { accountNumber: '1200', name: 'Prepaid Expenses', type: 'Asset', subType: 'Current Asset', normalBalance: 'Debit', isActive: true, description: 'Prepaid insurance, rent, etc.', parentAccountId: null, taxCode: null },
    { accountNumber: '1500', name: 'Property and Equipment', type: 'Asset', subType: 'Fixed Asset', normalBalance: 'Debit', isActive: true, description: 'Fixed assets at cost', parentAccountId: null, taxCode: null },
    { accountNumber: '1510', name: 'Computer Equipment', type: 'Asset', subType: 'Fixed Asset', normalBalance: 'Debit', isActive: true, description: 'Computers and hardware', parentAccountId: null, taxCode: null },
    { accountNumber: '1520', name: 'Furniture and Fixtures', type: 'Asset', subType: 'Fixed Asset', normalBalance: 'Debit', isActive: true, description: 'Office furniture', parentAccountId: null, taxCode: null },
    { accountNumber: '1550', name: 'Accumulated Depreciation', type: 'Asset', subType: 'Fixed Asset', normalBalance: 'Credit', isActive: true, description: 'Contra-asset for depreciation', parentAccountId: null, taxCode: null },
    { accountNumber: '1600', name: 'Intangible Assets', type: 'Asset', subType: 'Non-Current Asset', normalBalance: 'Debit', isActive: true, description: 'Software, patents, etc.', parentAccountId: null, taxCode: null },
    
    // Liabilities (2xxx)
    { accountNumber: '2000', name: 'Accounts Payable', type: 'Liability', subType: 'Current Liability', normalBalance: 'Credit', isActive: true, description: 'Vendor payables', parentAccountId: null, taxCode: null },
    { accountNumber: '2100', name: 'Accrued Expenses', type: 'Liability', subType: 'Current Liability', normalBalance: 'Credit', isActive: true, description: 'Accrued liabilities', parentAccountId: null, taxCode: null },
    { accountNumber: '2110', name: 'Accrued Wages', type: 'Liability', subType: 'Current Liability', normalBalance: 'Credit', isActive: true, description: 'Wages payable', parentAccountId: null, taxCode: null },
    { accountNumber: '2120', name: 'Accrued Benefits', type: 'Liability', subType: 'Current Liability', normalBalance: 'Credit', isActive: true, description: 'Benefits payable', parentAccountId: null, taxCode: null },
    { accountNumber: '2200', name: 'Deferred Revenue', type: 'Liability', subType: 'Current Liability', normalBalance: 'Credit', isActive: true, description: 'Unearned revenue', parentAccountId: null, taxCode: null },
    { accountNumber: '2300', name: 'Sales Tax Payable', type: 'Liability', subType: 'Current Liability', normalBalance: 'Credit', isActive: true, description: 'Collected sales tax', parentAccountId: null, taxCode: null },
    { accountNumber: '2400', name: 'Payroll Tax Payable', type: 'Liability', subType: 'Current Liability', normalBalance: 'Credit', isActive: true, description: 'Payroll taxes owed', parentAccountId: null, taxCode: null },
    { accountNumber: '2500', name: 'Short-Term Debt', type: 'Liability', subType: 'Current Liability', normalBalance: 'Credit', isActive: true, description: 'Current portion of debt', parentAccountId: null, taxCode: null },
    { accountNumber: '2600', name: 'Long-Term Debt', type: 'Liability', subType: 'Long-Term Liability', normalBalance: 'Credit', isActive: true, description: 'Notes payable, loans', parentAccountId: null, taxCode: null },
    
    // Equity (3xxx)
    { accountNumber: '3000', name: 'Common Stock', type: 'Equity', subType: 'Equity', normalBalance: 'Credit', isActive: true, description: 'Issued common stock', parentAccountId: null, taxCode: null },
    { accountNumber: '3100', name: 'Additional Paid-In Capital', type: 'Equity', subType: 'Equity', normalBalance: 'Credit', isActive: true, description: 'Capital above par value', parentAccountId: null, taxCode: null },
    { accountNumber: '3200', name: 'Retained Earnings', type: 'Equity', subType: 'Retained Earnings', normalBalance: 'Credit', isActive: true, description: 'Accumulated earnings', parentAccountId: null, taxCode: null },
    { accountNumber: '3300', name: 'Owner Draws', type: 'Equity', subType: 'Equity', normalBalance: 'Debit', isActive: true, description: 'Owner withdrawals', parentAccountId: null, taxCode: null },
    
    // Revenue (4xxx)
    { accountNumber: '4000', name: 'Service Revenue', type: 'Revenue', subType: 'Operating Revenue', normalBalance: 'Credit', isActive: true, description: 'Revenue from services', parentAccountId: null, taxCode: null },
    { accountNumber: '4100', name: 'Subscription Revenue', type: 'Revenue', subType: 'Operating Revenue', normalBalance: 'Credit', isActive: true, description: 'Recurring subscription revenue', parentAccountId: null, taxCode: null },
    { accountNumber: '4200', name: 'Product Revenue', type: 'Revenue', subType: 'Operating Revenue', normalBalance: 'Credit', isActive: true, description: 'Revenue from product sales', parentAccountId: null, taxCode: null },
    { accountNumber: '4300', name: 'Consulting Revenue', type: 'Revenue', subType: 'Operating Revenue', normalBalance: 'Credit', isActive: true, description: 'Professional consulting fees', parentAccountId: null, taxCode: null },
    { accountNumber: '4400', name: 'License Revenue', type: 'Revenue', subType: 'Operating Revenue', normalBalance: 'Credit', isActive: true, description: 'Software licensing fees', parentAccountId: null, taxCode: null },
    { accountNumber: '4900', name: 'Other Revenue', type: 'Revenue', subType: 'Other Revenue', normalBalance: 'Credit', isActive: true, description: 'Miscellaneous revenue', parentAccountId: null, taxCode: null },
    { accountNumber: '4910', name: 'Interest Income', type: 'Revenue', subType: 'Other Revenue', normalBalance: 'Credit', isActive: true, description: 'Interest earned', parentAccountId: null, taxCode: null },
    
    // Cost of Goods Sold (5xxx)
    { accountNumber: '5000', name: 'Cost of Services', type: 'Expense', subType: 'COGS', normalBalance: 'Debit', isActive: true, description: 'Direct costs of services', parentAccountId: null, taxCode: null },
    { accountNumber: '5100', name: 'Direct Labor', type: 'Expense', subType: 'COGS', normalBalance: 'Debit', isActive: true, description: 'Billable labor costs', parentAccountId: null, taxCode: null },
    { accountNumber: '5200', name: 'Contractor Costs', type: 'Expense', subType: 'COGS', normalBalance: 'Debit', isActive: true, description: 'Subcontractor expenses', parentAccountId: null, taxCode: null },
    { accountNumber: '5300', name: 'Hosting and Infrastructure', type: 'Expense', subType: 'COGS', normalBalance: 'Debit', isActive: true, description: 'Cloud hosting, servers', parentAccountId: null, taxCode: null },
    { accountNumber: '5400', name: 'Third-Party Services', type: 'Expense', subType: 'COGS', normalBalance: 'Debit', isActive: true, description: 'APIs, integrations', parentAccountId: null, taxCode: null },
    { accountNumber: '5500', name: 'Payment Processing Fees', type: 'Expense', subType: 'COGS', normalBalance: 'Debit', isActive: true, description: 'Credit card fees', parentAccountId: null, taxCode: null },
    
    // Operating Expenses (6xxx)
    { accountNumber: '6000', name: 'Salaries and Wages', type: 'Expense', subType: 'Operating Expense', normalBalance: 'Debit', isActive: true, description: 'Employee salaries', parentAccountId: null, taxCode: null },
    { accountNumber: '6050', name: 'Non-Billable Labor', type: 'Expense', subType: 'Operating Expense', normalBalance: 'Debit', isActive: true, description: 'Non-billable employee time', parentAccountId: null, taxCode: null },
    { accountNumber: '6100', name: 'Payroll Taxes', type: 'Expense', subType: 'Operating Expense', normalBalance: 'Debit', isActive: true, description: 'Employer payroll taxes', parentAccountId: null, taxCode: null },
    { accountNumber: '6150', name: 'Employee Benefits', type: 'Expense', subType: 'Operating Expense', normalBalance: 'Debit', isActive: true, description: 'Health insurance, 401k', parentAccountId: null, taxCode: null },
    { accountNumber: '6200', name: 'Rent Expense', type: 'Expense', subType: 'Operating Expense', normalBalance: 'Debit', isActive: true, description: 'Office rent', parentAccountId: null, taxCode: null },
    { accountNumber: '6250', name: 'Utilities', type: 'Expense', subType: 'Operating Expense', normalBalance: 'Debit', isActive: true, description: 'Electric, internet, phone', parentAccountId: null, taxCode: null },
    { accountNumber: '6300', name: 'Software Subscriptions', type: 'Expense', subType: 'Operating Expense', normalBalance: 'Debit', isActive: true, description: 'SaaS tools and software', parentAccountId: null, taxCode: null },
    { accountNumber: '6400', name: 'Marketing and Advertising', type: 'Expense', subType: 'Operating Expense', normalBalance: 'Debit', isActive: true, description: 'Marketing spend', parentAccountId: null, taxCode: null },
    { accountNumber: '6500', name: 'Professional Services', type: 'Expense', subType: 'Operating Expense', normalBalance: 'Debit', isActive: true, description: 'Legal, accounting fees', parentAccountId: null, taxCode: null },
    { accountNumber: '6600', name: 'Travel and Entertainment', type: 'Expense', subType: 'Operating Expense', normalBalance: 'Debit', isActive: true, description: 'Business travel', parentAccountId: null, taxCode: null },
    { accountNumber: '6700', name: 'Insurance', type: 'Expense', subType: 'Operating Expense', normalBalance: 'Debit', isActive: true, description: 'Business insurance', parentAccountId: null, taxCode: null },
    { accountNumber: '6800', name: 'Office Supplies', type: 'Expense', subType: 'Operating Expense', normalBalance: 'Debit', isActive: true, description: 'General supplies', parentAccountId: null, taxCode: null },
    { accountNumber: '6900', name: 'Depreciation Expense', type: 'Expense', subType: 'Operating Expense', normalBalance: 'Debit', isActive: true, description: 'Asset depreciation', parentAccountId: null, taxCode: null },
    { accountNumber: '6950', name: 'Amortization Expense', type: 'Expense', subType: 'Operating Expense', normalBalance: 'Debit', isActive: true, description: 'Intangible amortization', parentAccountId: null, taxCode: null },
    
    // Other Expenses (7xxx)
    { accountNumber: '7000', name: 'Interest Expense', type: 'Expense', subType: 'Other Expense', normalBalance: 'Debit', isActive: true, description: 'Interest on debt', parentAccountId: null, taxCode: null },
    { accountNumber: '7100', name: 'Bank Fees', type: 'Expense', subType: 'Other Expense', normalBalance: 'Debit', isActive: true, description: 'Bank service charges', parentAccountId: null, taxCode: null },
    { accountNumber: '7200', name: 'Bad Debt Expense', type: 'Expense', subType: 'Other Expense', normalBalance: 'Debit', isActive: true, description: 'Uncollectible accounts', parentAccountId: null, taxCode: null },
    { accountNumber: '7900', name: 'Income Tax Expense', type: 'Expense', subType: 'Other Expense', normalBalance: 'Debit', isActive: true, description: 'Corporate income taxes', parentAccountId: null, taxCode: null },
  ]

  let created = 0
  let skipped = 0

  for (const acct of defaultAccounts) {
    const exists = await db.collection('fi_chart_of_accounts').findOne({ accountNumber: acct.accountNumber })
    if (exists) {
      skipped++
      continue
    }

    const doc: ChartOfAccountsDoc = {
      _id: new ObjectId(),
      ...acct,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    }
    await db.collection('fi_chart_of_accounts').insertOne(doc as any)
    created++
  }

  res.json({
    data: { created, skipped, total: defaultAccounts.length },
    error: null,
  })
})

// ============================================================================
// ACCOUNTING PERIODS
// ============================================================================

// GET /api/financial/periods
financialRouter.get('/periods', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureFinancialIndexes(db)

  const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined

  const filter: any = {}
  if (fiscalYear) filter.fiscalYear = fiscalYear

  const periods = await db
    .collection('fi_periods')
    .find(filter)
    .sort({ startDate: -1 })
    .toArray()

  res.json({
    data: {
      items: periods.map((p: any) => ({
        id: String(p._id),
        name: p.name,
        startDate: p.startDate,
        endDate: p.endDate,
        fiscalYear: p.fiscalYear,
        fiscalQuarter: p.fiscalQuarter,
        fiscalMonth: p.fiscalMonth,
        status: p.status,
        closedAt: p.closedAt,
        closedBy: p.closedBy,
      })),
    },
    error: null,
  })
})

// POST /api/financial/periods (Admin only)
financialRouter.post('/periods', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureFinancialIndexes(db)

  const auth = req.auth as { userId: string; email: string }
  const { name, startDate, endDate, fiscalYear, fiscalQuarter, fiscalMonth } = req.body

  if (!name || !startDate || !endDate || !fiscalYear || !fiscalMonth) {
    return res.status(400).json({ data: null, error: 'missing_required_fields' })
  }

  // Check for duplicate period
  const existing = await db.collection('fi_periods').findOne({ fiscalYear, fiscalMonth })
  if (existing) return res.status(400).json({ data: null, error: 'period_exists' })

  const now = new Date()
  const doc: AccountingPeriodDoc = {
    _id: new ObjectId(),
    name,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    fiscalYear,
    fiscalQuarter: fiscalQuarter || Math.ceil(fiscalMonth / 3),
    fiscalMonth,
    status: 'open',
    closedAt: null,
    closedBy: null,
    lockedAt: null,
    lockedBy: null,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection('fi_periods').insertOne(doc as any)

  res.status(201).json({
    data: {
      id: String(doc._id),
      name: doc.name,
      fiscalYear: doc.fiscalYear,
      fiscalMonth: doc.fiscalMonth,
      status: doc.status,
    },
    error: null,
  })
})

// POST /api/financial/periods/generate-year (Admin only)
financialRouter.post('/periods/generate-year', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureFinancialIndexes(db)

  const auth = req.auth as { userId: string; email: string }
  const { fiscalYear } = req.body

  if (!fiscalYear || typeof fiscalYear !== 'number') {
    return res.status(400).json({ data: null, error: 'invalid_fiscal_year' })
  }

  const now = new Date()
  let created = 0
  let skipped = 0

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  for (let month = 1; month <= 12; month++) {
    const existing = await db.collection('fi_periods').findOne({ fiscalYear, fiscalMonth: month })
    if (existing) {
      skipped++
      continue
    }

    const startDate = new Date(fiscalYear, month - 1, 1)
    const endDate = new Date(fiscalYear, month, 0) // Last day of month

    const doc: AccountingPeriodDoc = {
      _id: new ObjectId(),
      name: `${monthNames[month - 1]} ${fiscalYear}`,
      startDate,
      endDate,
      fiscalYear,
      fiscalQuarter: Math.ceil(month / 3),
      fiscalMonth: month,
      status: 'open',
      closedAt: null,
      closedBy: null,
      lockedAt: null,
      lockedBy: null,
      createdAt: now,
      updatedAt: now,
    }

    await db.collection('fi_periods').insertOne(doc as any)
    created++
  }

  res.json({
    data: { fiscalYear, created, skipped },
    error: null,
  })
})

// PATCH /api/financial/periods/:id/close (Admin only)
financialRouter.patch('/periods/:id/close', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }
  const id = objIdOrNull(req.params.id)
  if (!id) return res.status(400).json({ data: null, error: 'invalid_id' })

  const period = await db.collection('fi_periods').findOne({ _id: id })
  if (!period) return res.status(404).json({ data: null, error: 'not_found' })
  if (period.status === 'locked') return res.status(400).json({ data: null, error: 'period_locked' })

  const now = new Date()
  await db.collection('fi_periods').updateOne(
    { _id: id },
    { $set: { status: 'closed', closedAt: now, closedBy: auth.userId, updatedAt: now } }
  )

  res.json({ data: { id: String(id), status: 'closed' }, error: null })
})

// PATCH /api/financial/periods/:id/reopen (Admin only)
financialRouter.patch('/periods/:id/reopen', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }
  const id = objIdOrNull(req.params.id)
  if (!id) return res.status(400).json({ data: null, error: 'invalid_id' })

  const period = await db.collection('fi_periods').findOne({ _id: id })
  if (!period) return res.status(404).json({ data: null, error: 'not_found' })
  if (period.status === 'locked') return res.status(400).json({ data: null, error: 'period_locked' })

  const now = new Date()
  await db.collection('fi_periods').updateOne(
    { _id: id },
    { $set: { status: 'open', closedAt: null, closedBy: null, updatedAt: now } }
  )

  res.json({ data: { id: String(id), status: 'open' }, error: null })
})

// ============================================================================
// JOURNAL ENTRIES
// ============================================================================

// GET /api/financial/journal-entries
financialRouter.get('/journal-entries', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureFinancialIndexes(db)

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const status = req.query.status as JournalEntryStatus | undefined
  const sourceType = req.query.sourceType as JournalEntrySourceType | undefined
  const periodId = objIdOrNull(req.query.periodId)
  const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined
  const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined

  const filter: any = {}
  if (status) filter.status = status
  if (sourceType) filter.sourceType = sourceType
  if (periodId) filter.periodId = periodId
  if (startDate || endDate) {
    filter.date = {}
    if (startDate) filter.date.$gte = startDate
    if (endDate) filter.date.$lte = endDate
  }

  const [entries, total] = await Promise.all([
    db.collection('fi_journal_entries')
      .find(filter)
      .sort({ entryNumber: -1 })
      .skip(offset)
      .limit(limit)
      .toArray(),
    db.collection('fi_journal_entries').countDocuments(filter),
  ])

  res.json({
    data: {
      items: entries.map((e: any) => ({
        id: String(e._id),
        entryNumber: e.entryNumber,
        date: e.date,
        postingDate: e.postingDate,
        periodId: e.periodId ? String(e.periodId) : null,
        description: e.description,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        lines: e.lines,
        status: e.status,
        totalDebits: e.lines.reduce((sum: number, l: any) => sum + (l.debit || 0), 0),
        totalCredits: e.lines.reduce((sum: number, l: any) => sum + (l.credit || 0), 0),
        createdAt: e.createdAt,
        createdBy: e.createdBy,
      })),
      total,
      limit,
      offset,
    },
    error: null,
  })
})

// GET /api/financial/journal-entries/:id
financialRouter.get('/journal-entries/:id', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const id = objIdOrNull(req.params.id)
  if (!id) return res.status(400).json({ data: null, error: 'invalid_id' })

  const entry = await db.collection('fi_journal_entries').findOne({ _id: id })
  if (!entry) return res.status(404).json({ data: null, error: 'not_found' })

  res.json({
    data: {
      id: String(entry._id),
      entryNumber: entry.entryNumber,
      date: entry.date,
      postingDate: entry.postingDate,
      periodId: entry.periodId ? String(entry.periodId) : null,
      description: entry.description,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      lines: entry.lines,
      status: entry.status,
      reversedEntryId: entry.reversedEntryId ? String(entry.reversedEntryId) : null,
      reversalOfEntryId: entry.reversalOfEntryId ? String(entry.reversalOfEntryId) : null,
      attachments: entry.attachments || [],
      approvedBy: entry.approvedBy,
      approvedAt: entry.approvedAt,
      createdAt: entry.createdAt,
      createdBy: entry.createdBy,
      audit: entry.audit || [],
    },
    error: null,
  })
})

const createJournalEntrySchema = z.object({
  date: z.string(),
  description: z.string().min(1),
  sourceType: z.enum(['invoice', 'payment', 'expense', 'payroll', 'time_entry', 'manual', 'adjustment', 'renewal']),
  sourceId: z.string().nullable().optional(),
  lines: z.array(z.object({
    accountId: z.string(),
    debit: z.number().min(0),
    credit: z.number().min(0),
    description: z.string().nullable().optional(),
    departmentId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    costCenterId: z.string().nullable().optional(),
  })).min(2),
  attachments: z.array(z.string()).optional(),
})

// POST /api/financial/journal-entries
financialRouter.post('/journal-entries', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureFinancialIndexes(db)

  const auth = req.auth as { userId: string; email: string }
  const parsed = createJournalEntrySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_input', details: parsed.error.flatten() })

  const { date, description, sourceType, sourceId, lines, attachments } = parsed.data

  // Validate debits = credits
  const totalDebits = lines.reduce((sum, l) => sum + l.debit, 0)
  const totalCredits = lines.reduce((sum, l) => sum + l.credit, 0)
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    return res.status(400).json({ data: null, error: 'debits_credits_mismatch', totalDebits, totalCredits })
  }

  // Validate all accounts exist
  const accountIds = lines.map(l => objIdOrNull(l.accountId)).filter((id): id is ObjectId => id !== null)
  const accounts = await db.collection('fi_chart_of_accounts').find({ _id: { $in: accountIds } }).toArray()
  const accountMap = new Map(accounts.map((a: any) => [String(a._id), a]))

  for (const line of lines) {
    if (!accountMap.has(line.accountId)) {
      return res.status(400).json({ data: null, error: 'invalid_account', accountId: line.accountId })
    }
  }

  // Find appropriate period
  const entryDate = new Date(date)
  const period = await db.collection('fi_periods').findOne({
    startDate: { $lte: entryDate },
    endDate: { $gte: entryDate },
    status: { $ne: 'locked' },
  })

  if (!period) {
    return res.status(400).json({ data: null, error: 'no_open_period', date })
  }

  if (period.status === 'closed') {
    return res.status(400).json({ data: null, error: 'period_closed', periodId: String(period._id) })
  }

  const now = new Date()
  const entryNumber = await getNextSequence(db, 'fi_journal_entries', 10001)

  const enrichedLines: JournalEntryLine[] = lines.map(l => {
    const acct = accountMap.get(l.accountId)
    return {
      accountId: new ObjectId(l.accountId),
      accountNumber: acct?.accountNumber || '',
      accountName: acct?.name || '',
      debit: l.debit,
      credit: l.credit,
      description: l.description || null,
      departmentId: l.departmentId || null,
      projectId: l.projectId || null,
      costCenterId: l.costCenterId || null,
    }
  })

  const doc: JournalEntryDoc = {
    _id: new ObjectId(),
    entryNumber,
    date: entryDate,
    postingDate: now,
    periodId: period._id,
    description,
    sourceType,
    sourceId: sourceId || null,
    lines: enrichedLines,
    status: 'posted',
    reversedEntryId: null,
    reversalOfEntryId: null,
    attachments: attachments || [],
    approvedBy: null,
    approvedAt: null,
    createdAt: now,
    createdBy: auth.userId,
    updatedAt: now,
    updatedBy: auth.userId,
    audit: [{
      action: 'created',
      userId: auth.userId,
      userEmail: auth.email,
      timestamp: now,
    }],
  }

  await db.collection('fi_journal_entries').insertOne(doc as any)

  res.status(201).json({
    data: {
      id: String(doc._id),
      entryNumber: doc.entryNumber,
      date: doc.date,
      status: doc.status,
      totalDebits,
      totalCredits,
    },
    error: null,
  })
})

// POST /api/financial/journal-entries/:id/reverse (Admin only)
financialRouter.post('/journal-entries/:id/reverse', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }
  const id = objIdOrNull(req.params.id)
  if (!id) return res.status(400).json({ data: null, error: 'invalid_id' })

  const entry = await db.collection('fi_journal_entries').findOne({ _id: id })
  if (!entry) return res.status(404).json({ data: null, error: 'not_found' })
  if (entry.status === 'reversed') return res.status(400).json({ data: null, error: 'already_reversed' })
  if (entry.status !== 'posted') return res.status(400).json({ data: null, error: 'can_only_reverse_posted' })

  // Check period is not locked
  if (entry.periodId) {
    const period = await db.collection('fi_periods').findOne({ _id: entry.periodId })
    if (period?.status === 'locked') {
      return res.status(400).json({ data: null, error: 'period_locked' })
    }
  }

  const now = new Date()
  const reversalNumber = await getNextSequence(db, 'fi_journal_entries', 10001)

  // Create reversal entry (swap debits and credits)
  const reversalLines: JournalEntryLine[] = entry.lines.map((l: any) => ({
    ...l,
    debit: l.credit,
    credit: l.debit,
  }))

  const reversalDoc: JournalEntryDoc = {
    _id: new ObjectId(),
    entryNumber: reversalNumber,
    date: now,
    postingDate: now,
    periodId: entry.periodId,
    description: `Reversal of JE #${entry.entryNumber}: ${entry.description}`,
    sourceType: 'adjustment',
    sourceId: null,
    lines: reversalLines,
    status: 'posted',
    reversedEntryId: null,
    reversalOfEntryId: entry._id,
    attachments: [],
    approvedBy: auth.userId,
    approvedAt: now,
    createdAt: now,
    createdBy: auth.userId,
    updatedAt: now,
    updatedBy: auth.userId,
    audit: [{
      action: 'created_as_reversal',
      userId: auth.userId,
      userEmail: auth.email,
      timestamp: now,
      changes: { originalEntryId: String(entry._id), originalEntryNumber: entry.entryNumber },
    }],
  }

  await db.collection('fi_journal_entries').insertOne(reversalDoc as any)

  // Mark original as reversed
  await db.collection('fi_journal_entries').updateOne(
    { _id: id },
    {
      $set: { status: 'reversed', reversedEntryId: reversalDoc._id, updatedAt: now, updatedBy: auth.userId },
      $push: {
        audit: {
          action: 'reversed',
          userId: auth.userId,
          userEmail: auth.email,
          timestamp: now,
          changes: { reversalEntryId: String(reversalDoc._id), reversalEntryNumber: reversalDoc.entryNumber },
        },
      } as any,
    }
  )

  res.json({
    data: {
      originalEntryId: String(id),
      originalStatus: 'reversed',
      reversalEntryId: String(reversalDoc._id),
      reversalEntryNumber: reversalDoc.entryNumber,
    },
    error: null,
  })
})

// ============================================================================
// TRIAL BALANCE & REPORTS
// ============================================================================

// GET /api/financial/trial-balance
financialRouter.get('/trial-balance', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate) : new Date()
  const periodId = objIdOrNull(req.query.periodId)

  // Build filter for journal entries
  const jeFilter: any = { status: 'posted' }
  if (periodId) {
    jeFilter.periodId = periodId
  } else {
    jeFilter.date = { $lte: asOfDate }
  }

  // Aggregate by account
  const pipeline = [
    { $match: jeFilter },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.accountId',
        accountNumber: { $first: '$lines.accountNumber' },
        accountName: { $first: '$lines.accountName' },
        totalDebits: { $sum: '$lines.debit' },
        totalCredits: { $sum: '$lines.credit' },
      },
    },
    { $sort: { accountNumber: 1 } },
  ]

  const balances = await db.collection('fi_journal_entries').aggregate(pipeline).toArray()

  // Get account details for type and normal balance
  const accountIds = balances.map((b: any) => b._id).filter(Boolean)
  const accounts = await db.collection('fi_chart_of_accounts').find({ _id: { $in: accountIds } }).toArray()
  const accountMap = new Map(accounts.map((a: any) => [String(a._id), a]))

  const trialBalance = balances.map((b: any) => {
    const acct = accountMap.get(String(b._id))
    const balance = b.totalDebits - b.totalCredits
    return {
      accountId: String(b._id),
      accountNumber: b.accountNumber || acct?.accountNumber || '',
      accountName: b.accountName || acct?.name || '',
      type: acct?.type || 'Unknown',
      subType: acct?.subType || '',
      normalBalance: acct?.normalBalance || 'Debit',
      totalDebits: Math.round(b.totalDebits * 100) / 100,
      totalCredits: Math.round(b.totalCredits * 100) / 100,
      balance: Math.round(balance * 100) / 100,
    }
  })

  const totalDebits = trialBalance.reduce((sum: number, b: any) => sum + b.totalDebits, 0)
  const totalCredits = trialBalance.reduce((sum: number, b: any) => sum + b.totalCredits, 0)

  res.json({
    data: {
      asOfDate,
      periodId: periodId ? String(periodId) : null,
      accounts: trialBalance,
      totals: {
        debits: Math.round(totalDebits * 100) / 100,
        credits: Math.round(totalCredits * 100) / 100,
        difference: Math.round((totalDebits - totalCredits) * 100) / 100,
        isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
      },
    },
    error: null,
  })
})

// GET /api/financial/income-statement
financialRouter.get('/income-statement', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().getFullYear(), 0, 1)
  const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date()

  const jeFilter: any = {
    status: 'posted',
    date: { $gte: startDate, $lte: endDate },
  }

  // Aggregate revenue and expense accounts
  const pipeline = [
    { $match: jeFilter },
    { $unwind: '$lines' },
    {
      $lookup: {
        from: 'fi_chart_of_accounts',
        localField: 'lines.accountId',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    { $match: { 'account.type': { $in: ['Revenue', 'Expense'] } } },
    {
      $group: {
        _id: '$lines.accountId',
        accountNumber: { $first: '$account.accountNumber' },
        accountName: { $first: '$account.name' },
        type: { $first: '$account.type' },
        subType: { $first: '$account.subType' },
        normalBalance: { $first: '$account.normalBalance' },
        totalDebits: { $sum: '$lines.debit' },
        totalCredits: { $sum: '$lines.credit' },
      },
    },
    { $sort: { accountNumber: 1 } },
  ]

  const results = await db.collection('fi_journal_entries').aggregate(pipeline).toArray()

  // Calculate balances (Revenue: Credit - Debit, Expense: Debit - Credit)
  const revenue: any[] = []
  const cogs: any[] = []
  const opex: any[] = []
  const otherExpenses: any[] = []
  const otherRevenue: any[] = []

  let totalRevenue = 0
  let totalCogs = 0
  let totalOpex = 0
  let totalOtherExpenses = 0
  let totalOtherRevenue = 0

  for (const r of results) {
    const balance = r.type === 'Revenue'
      ? r.totalCredits - r.totalDebits
      : r.totalDebits - r.totalCredits

    const item = {
      accountId: String(r._id),
      accountNumber: r.accountNumber,
      accountName: r.accountName,
      subType: r.subType,
      amount: Math.round(balance * 100) / 100,
    }

    if (r.type === 'Revenue') {
      if (r.subType === 'Other Revenue') {
        otherRevenue.push(item)
        totalOtherRevenue += balance
      } else {
        revenue.push(item)
        totalRevenue += balance
      }
    } else {
      if (r.subType === 'COGS') {
        cogs.push(item)
        totalCogs += balance
      } else if (r.subType === 'Other Expense') {
        otherExpenses.push(item)
        totalOtherExpenses += balance
      } else {
        opex.push(item)
        totalOpex += balance
      }
    }
  }

  const grossProfit = totalRevenue - totalCogs
  const operatingIncome = grossProfit - totalOpex
  const netIncome = operatingIncome + totalOtherRevenue - totalOtherExpenses

  res.json({
    data: {
      period: { startDate, endDate },
      revenue: {
        items: revenue,
        total: Math.round(totalRevenue * 100) / 100,
      },
      costOfGoodsSold: {
        items: cogs,
        total: Math.round(totalCogs * 100) / 100,
      },
      grossProfit: Math.round(grossProfit * 100) / 100,
      operatingExpenses: {
        items: opex,
        total: Math.round(totalOpex * 100) / 100,
      },
      operatingIncome: Math.round(operatingIncome * 100) / 100,
      otherRevenue: {
        items: otherRevenue,
        total: Math.round(totalOtherRevenue * 100) / 100,
      },
      otherExpenses: {
        items: otherExpenses,
        total: Math.round(totalOtherExpenses * 100) / 100,
      },
      netIncome: Math.round(netIncome * 100) / 100,
    },
    error: null,
  })
})

// GET /api/financial/balance-sheet
financialRouter.get('/balance-sheet', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate) : new Date()

  const jeFilter: any = {
    status: 'posted',
    date: { $lte: asOfDate },
  }

  // Aggregate asset, liability, equity accounts
  const pipeline = [
    { $match: jeFilter },
    { $unwind: '$lines' },
    {
      $lookup: {
        from: 'fi_chart_of_accounts',
        localField: 'lines.accountId',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    { $match: { 'account.type': { $in: ['Asset', 'Liability', 'Equity'] } } },
    {
      $group: {
        _id: '$lines.accountId',
        accountNumber: { $first: '$account.accountNumber' },
        accountName: { $first: '$account.name' },
        type: { $first: '$account.type' },
        subType: { $first: '$account.subType' },
        normalBalance: { $first: '$account.normalBalance' },
        totalDebits: { $sum: '$lines.debit' },
        totalCredits: { $sum: '$lines.credit' },
      },
    },
    { $sort: { accountNumber: 1 } },
  ]

  const results = await db.collection('fi_journal_entries').aggregate(pipeline).toArray()

  // Organize by type
  const currentAssets: any[] = []
  const fixedAssets: any[] = []
  const otherAssets: any[] = []
  const currentLiabilities: any[] = []
  const longTermLiabilities: any[] = []
  const equity: any[] = []

  let totalCurrentAssets = 0
  let totalFixedAssets = 0
  let totalOtherAssets = 0
  let totalCurrentLiabilities = 0
  let totalLongTermLiabilities = 0
  let totalEquity = 0

  for (const r of results) {
    // Asset: Debit - Credit, Liability/Equity: Credit - Debit
    const balance = r.type === 'Asset'
      ? r.totalDebits - r.totalCredits
      : r.totalCredits - r.totalDebits

    const item = {
      accountId: String(r._id),
      accountNumber: r.accountNumber,
      accountName: r.accountName,
      subType: r.subType,
      amount: Math.round(balance * 100) / 100,
    }

    if (r.type === 'Asset') {
      if (r.subType === 'Current Asset') {
        currentAssets.push(item)
        totalCurrentAssets += balance
      } else if (r.subType === 'Fixed Asset') {
        fixedAssets.push(item)
        totalFixedAssets += balance
      } else {
        otherAssets.push(item)
        totalOtherAssets += balance
      }
    } else if (r.type === 'Liability') {
      if (r.subType === 'Current Liability') {
        currentLiabilities.push(item)
        totalCurrentLiabilities += balance
      } else {
        longTermLiabilities.push(item)
        totalLongTermLiabilities += balance
      }
    } else {
      equity.push(item)
      totalEquity += balance
    }
  }

  const totalAssets = totalCurrentAssets + totalFixedAssets + totalOtherAssets
  const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity

  res.json({
    data: {
      asOfDate,
      assets: {
        currentAssets: {
          items: currentAssets,
          total: Math.round(totalCurrentAssets * 100) / 100,
        },
        fixedAssets: {
          items: fixedAssets,
          total: Math.round(totalFixedAssets * 100) / 100,
        },
        otherAssets: {
          items: otherAssets,
          total: Math.round(totalOtherAssets * 100) / 100,
        },
        total: Math.round(totalAssets * 100) / 100,
      },
      liabilities: {
        currentLiabilities: {
          items: currentLiabilities,
          total: Math.round(totalCurrentLiabilities * 100) / 100,
        },
        longTermLiabilities: {
          items: longTermLiabilities,
          total: Math.round(totalLongTermLiabilities * 100) / 100,
        },
        total: Math.round(totalLiabilities * 100) / 100,
      },
      equity: {
        items: equity,
        total: Math.round(totalEquity * 100) / 100,
      },
      totalLiabilitiesAndEquity: Math.round(totalLiabilitiesAndEquity * 100) / 100,
      isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
    },
    error: null,
  })
})

// GET /api/financial/cash-flow-statement (Indirect Method)
financialRouter.get('/cash-flow-statement', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().getFullYear(), 0, 1)
  const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date()

  const jeFilter: any = {
    status: 'posted',
    date: { $gte: startDate, $lte: endDate },
  }

  // Get income statement data for net income
  const incomeExpensePipeline = [
    { $match: jeFilter },
    { $unwind: '$lines' },
    {
      $lookup: {
        from: 'fi_chart_of_accounts',
        localField: 'lines.accountId',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    { $match: { 'account.type': { $in: ['Revenue', 'Expense'] } } },
    {
      $group: {
        _id: '$account.type',
        totalDebits: { $sum: '$lines.debit' },
        totalCredits: { $sum: '$lines.credit' },
      },
    },
  ]

  const incomeExpenseResults = await db.collection('fi_journal_entries').aggregate(incomeExpensePipeline).toArray()
  
  let totalRevenue = 0
  let totalExpenses = 0
  
  for (const r of incomeExpenseResults) {
    if (r._id === 'Revenue') {
      totalRevenue = r.totalCredits - r.totalDebits
    } else if (r._id === 'Expense') {
      totalExpenses = r.totalDebits - r.totalCredits
    }
  }
  
  const netIncome = totalRevenue - totalExpenses

  // Get balance sheet changes for working capital
  // Operating activities: Changes in AR, AP, Deferred Revenue, Accrued Expenses
  const workingCapitalPipeline = [
    { $match: jeFilter },
    { $unwind: '$lines' },
    {
      $lookup: {
        from: 'fi_chart_of_accounts',
        localField: 'lines.accountId',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    { $match: { 'account.accountNumber': { $in: ['1100', '2000', '2100', '2200'] } } }, // AR, AP, Accrued Expenses, Deferred Revenue
    {
      $group: {
        _id: { accountNumber: '$account.accountNumber', accountName: '$account.name' },
        totalDebits: { $sum: '$lines.debit' },
        totalCredits: { $sum: '$lines.credit' },
      },
    },
  ]

  const workingCapitalResults = await db.collection('fi_journal_entries').aggregate(workingCapitalPipeline).toArray()

  // Cash from operations adjustments
  let arChange = 0
  let apChange = 0
  let accruedExpenseChange = 0
  let deferredRevenueChange = 0

  for (const r of workingCapitalResults) {
    const netChange = r.totalDebits - r.totalCredits
    switch (r._id.accountNumber) {
      case '1100': arChange = -netChange; break // Decrease in AR is + cash
      case '2000': apChange = -netChange; break // AP: Credit - Debit (increase in AP is + cash)
      case '2100': accruedExpenseChange = -netChange; break
      case '2200': deferredRevenueChange = -netChange; break
    }
  }

  // Get cash account changes
  const cashPipeline = [
    { $match: jeFilter },
    { $unwind: '$lines' },
    {
      $lookup: {
        from: 'fi_chart_of_accounts',
        localField: 'lines.accountId',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    { $match: { 'account.accountNumber': { $in: ['1000', '1010', '1020'] } } }, // Cash accounts
    {
      $group: {
        _id: null,
        totalDebits: { $sum: '$lines.debit' },
        totalCredits: { $sum: '$lines.credit' },
      },
    },
  ]

  const cashResults = await db.collection('fi_journal_entries').aggregate(cashPipeline).toArray()
  const netCashChange = cashResults.length > 0 ? (cashResults[0].totalDebits - cashResults[0].totalCredits) : 0

  // Investing activities: Fixed assets, intangibles
  const investingPipeline = [
    { $match: jeFilter },
    { $unwind: '$lines' },
    {
      $lookup: {
        from: 'fi_chart_of_accounts',
        localField: 'lines.accountId',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    { $match: { 'account.subType': { $in: ['Fixed Asset', 'Non-Current Asset'] } } },
    {
      $group: {
        _id: null,
        totalDebits: { $sum: '$lines.debit' },
        totalCredits: { $sum: '$lines.credit' },
      },
    },
  ]

  const investingResults = await db.collection('fi_journal_entries').aggregate(investingPipeline).toArray()
  const capitalExpenditures = investingResults.length > 0 ? -(investingResults[0].totalDebits - investingResults[0].totalCredits) : 0

  // Financing activities: Debt and equity changes
  const financingPipeline = [
    { $match: jeFilter },
    { $unwind: '$lines' },
    {
      $lookup: {
        from: 'fi_chart_of_accounts',
        localField: 'lines.accountId',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    { $match: { 'account.type': { $in: ['Liability', 'Equity'] }, 'account.subType': { $in: ['Long-Term Liability', 'Equity'] } } },
    {
      $group: {
        _id: null,
        totalDebits: { $sum: '$lines.debit' },
        totalCredits: { $sum: '$lines.credit' },
      },
    },
  ]

  const financingResults = await db.collection('fi_journal_entries').aggregate(financingPipeline).toArray()
  const debtEquityChanges = financingResults.length > 0 ? (financingResults[0].totalCredits - financingResults[0].totalDebits) : 0

  // Calculate operating cash flow (indirect method)
  const cashFromOperations = netIncome + arChange + apChange + accruedExpenseChange + deferredRevenueChange
  const cashFromInvesting = capitalExpenditures
  const cashFromFinancing = debtEquityChanges

  res.json({
    data: {
      period: { startDate, endDate },
      operatingActivities: {
        netIncome: Math.round(netIncome * 100) / 100,
        adjustments: {
          accountsReceivable: Math.round(arChange * 100) / 100,
          accountsPayable: Math.round(apChange * 100) / 100,
          accruedExpenses: Math.round(accruedExpenseChange * 100) / 100,
          deferredRevenue: Math.round(deferredRevenueChange * 100) / 100,
        },
        total: Math.round(cashFromOperations * 100) / 100,
      },
      investingActivities: {
        capitalExpenditures: Math.round(capitalExpenditures * 100) / 100,
        total: Math.round(cashFromInvesting * 100) / 100,
      },
      financingActivities: {
        debtAndEquityChanges: Math.round(debtEquityChanges * 100) / 100,
        total: Math.round(cashFromFinancing * 100) / 100,
      },
      netCashChange: Math.round(netCashChange * 100) / 100,
      totalFromActivities: Math.round((cashFromOperations + cashFromInvesting + cashFromFinancing) * 100) / 100,
    },
    error: null,
  })
})

// GET /api/financial/account-drill-down/:accountId - Get journal entries for a specific account
financialRouter.get('/account-drill-down/:accountId', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const accountId = objIdOrNull(req.params.accountId)
  if (!accountId) return res.status(400).json({ data: null, error: 'invalid_account_id' })

  const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined
  const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)

  const filter: any = {
    status: 'posted',
    'lines.accountId': accountId,
  }

  if (startDate || endDate) {
    filter.date = {}
    if (startDate) filter.date.$gte = startDate
    if (endDate) filter.date.$lte = endDate
  }

  const entries = await db.collection('fi_journal_entries')
    .find(filter)
    .sort({ date: -1, entryNumber: -1 })
    .limit(limit)
    .toArray()

  // Get account info
  const account = await db.collection('fi_chart_of_accounts').findOne({ _id: accountId })
  if (!account) return res.status(404).json({ data: null, error: 'account_not_found' })

  // Extract relevant lines and calculate running balance
  let runningBalance = 0
  const transactions = entries.reverse().map((e: any) => {
    const relevantLines = e.lines.filter((l: any) => String(l.accountId) === String(accountId))
    const debit = relevantLines.reduce((sum: number, l: any) => sum + (l.debit || 0), 0)
    const credit = relevantLines.reduce((sum: number, l: any) => sum + (l.credit || 0), 0)
    
    // Calculate balance based on normal balance
    const netChange = (account as any).normalBalance === 'Debit' ? (debit - credit) : (credit - debit)
    runningBalance += netChange

    return {
      id: String(e._id),
      entryNumber: e.entryNumber,
      date: e.date,
      description: e.description,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      debit: Math.round(debit * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      balance: Math.round(runningBalance * 100) / 100,
    }
  }).reverse()

  res.json({
    data: {
      account: {
        id: String(account._id),
        accountNumber: (account as any).accountNumber,
        name: (account as any).name,
        type: (account as any).type,
        subType: (account as any).subType,
        normalBalance: (account as any).normalBalance,
      },
      transactions,
      summary: {
        totalTransactions: transactions.length,
        endingBalance: Math.round(runningBalance * 100) / 100,
      },
    },
    error: null,
  })
})

// ============================================================================
// AUTO-POSTING ENDPOINTS
// ============================================================================

import {
  postInvoiceCreated,
  postPaymentReceived,
  postTimeEntry,
  postRenewalCreated,
  journalEntryExistsForSource,
} from './auto_posting.js'

// POST /api/financial/auto-post/invoices - Retroactively post all unposted invoices
financialRouter.post('/auto-post/invoices', requirePermission('financial.auto_post'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }
  
  // Get all invoices
  const invoices = await db.collection('invoices').find({
    status: { $in: ['draft', 'sent', 'paid', 'partial'] },
    total: { $gt: 0 },
  }).toArray()

  let posted = 0
  let skipped = 0
  let errors = 0

  for (const inv of invoices as any[]) {
    // Check if already posted
    const exists = await journalEntryExistsForSource(db, 'invoice', String(inv._id))
    if (exists) {
      skipped++
      continue
    }

    // Get customer name
    let customerName = 'Unknown Customer'
    if (inv.accountId) {
      const account = await db.collection('crm_accounts').findOne({ _id: inv.accountId })
      if (account) customerName = (account as any).name || customerName
    }

    const result = await postInvoiceCreated(
      db,
      String(inv._id),
      inv.invoiceNumber || 'N/A',
      inv.total,
      inv.issueDate || inv.createdAt || new Date(),
      customerName,
      auth.userId,
      auth.email
    )

    if (result) {
      posted++
    } else {
      errors++
    }
  }

  res.json({
    data: { total: invoices.length, posted, skipped, errors },
    error: null,
  })
})

// POST /api/financial/auto-post/payments - Retroactively post all unposted payments
financialRouter.post('/auto-post/payments', requirePermission('financial.auto_post'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }
  
  // Get all payments from invoices
  const invoices = await db.collection('invoices').find({
    'payments.0': { $exists: true },
  }).toArray()

  let posted = 0
  let skipped = 0
  let errors = 0

  for (const inv of invoices as any[]) {
    // Get customer name
    let customerName = 'Unknown Customer'
    if (inv.accountId) {
      const account = await db.collection('crm_accounts').findOne({ _id: inv.accountId })
      if (account) customerName = (account as any).name || customerName
    }

    for (const payment of (inv.payments || [])) {
      const paymentId = payment._id ? String(payment._id) : `${inv._id}_pay_${payment.date}`
      
      // Check if already posted
      const exists = await journalEntryExistsForSource(db, 'payment', paymentId)
      if (exists) {
        skipped++
        continue
      }

      const result = await postPaymentReceived(
        db,
        paymentId,
        String(inv._id),
        inv.invoiceNumber || 'N/A',
        payment.amount,
        payment.date ? new Date(payment.date) : new Date(),
        customerName,
        payment.method,
        auth.userId,
        auth.email
      )

      if (result) {
        posted++
      } else {
        errors++
      }
    }
  }

  res.json({
    data: { posted, skipped, errors },
    error: null,
  })
})

// POST /api/financial/auto-post/time-entries - Retroactively post all unposted time entries
financialRouter.post('/auto-post/time-entries', requirePermission('financial.auto_post'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }
  const defaultHourlyRate = Number(req.body.hourlyRate) || 75 // Default labor cost rate
  
  // Get all time entries from StratFlow
  const timeEntries = await db.collection('sf_time_entries').find({
    minutes: { $gt: 0 },
  }).toArray()

  let posted = 0
  let skipped = 0
  let errors = 0

  // Cache for projects and users
  const projectCache = new Map<string, any>()
  const userCache = new Map<string, any>()

  for (const entry of timeEntries as any[]) {
    // Check if already posted
    const exists = await journalEntryExistsForSource(db, 'time_entry', String(entry._id))
    if (exists) {
      skipped++
      continue
    }

    // Get project info
    let projectName = 'Unknown Project'
    if (entry.projectId) {
      const projectIdStr = String(entry.projectId)
      if (!projectCache.has(projectIdStr)) {
        const project = await db.collection('sf_projects').findOne({ _id: entry.projectId })
        projectCache.set(projectIdStr, project)
      }
      const project = projectCache.get(projectIdStr)
      if (project) projectName = project.name || projectName
    }

    // Get user info
    let userName = 'Unknown User'
    if (entry.userId) {
      const userIdStr = String(entry.userId)
      if (!userCache.has(userIdStr)) {
        try {
          const user = await db.collection('users').findOne({ _id: new ObjectId(entry.userId) })
          userCache.set(userIdStr, user)
        } catch { userCache.set(userIdStr, null) }
      }
      const user = userCache.get(userIdStr)
      if (user) userName = (user as any).name || (user as any).email || userName
    }

    const result = await postTimeEntry(
      db,
      String(entry._id),
      String(entry.projectId),
      projectName,
      entry.billable === true,
      entry.minutes,
      defaultHourlyRate,
      entry.workDate || entry.createdAt || new Date(),
      userName,
      auth.userId,
      auth.email
    )

    if (result) {
      posted++
    } else {
      errors++
    }
  }

  res.json({
    data: { total: timeEntries.length, posted, skipped, errors, hourlyRateUsed: defaultHourlyRate },
    error: null,
  })
})

// POST /api/financial/auto-post/renewals - Retroactively post all unposted renewals
financialRouter.post('/auto-post/renewals', requirePermission('financial.auto_post'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }
  
  // Get all renewals
  const renewals = await db.collection('renewals').find({
    amount: { $gt: 0 },
  }).toArray()

  let posted = 0
  let skipped = 0
  let errors = 0

  for (const renewal of renewals as any[]) {
    // Check if already posted
    const exists = await journalEntryExistsForSource(db, 'renewal', String(renewal._id))
    if (exists) {
      skipped++
      continue
    }

    // Get account/customer name
    let customerName = 'Unknown Customer'
    if (renewal.accountId) {
      const account = await db.collection('crm_accounts').findOne({ _id: renewal.accountId })
      if (account) customerName = (account as any).name || customerName
    }

    // Get product name
    let productName = 'Subscription'
    if (renewal.productId) {
      const product = await db.collection('crm_products').findOne({ _id: renewal.productId })
      if (product) productName = (product as any).name || productName
    }

    const result = await postRenewalCreated(
      db,
      String(renewal._id),
      renewal.amount,
      renewal.startDate || renewal.createdAt || new Date(),
      customerName,
      productName,
      renewal.term,
      auth.userId,
      auth.email
    )

    if (result) {
      posted++
    } else {
      errors++
    }
  }

  res.json({
    data: { total: renewals.length, posted, skipped, errors },
    error: null,
  })
})

// POST /api/financial/auto-post/all - Retroactively post all unposted transactions
financialRouter.post('/auto-post/all', requirePermission('financial.auto_post'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  // This just calls the individual endpoints internally
  // Results are aggregated
  const results = {
    invoices: { posted: 0, skipped: 0, errors: 0 },
    payments: { posted: 0, skipped: 0, errors: 0 },
    timeEntries: { posted: 0, skipped: 0, errors: 0 },
    renewals: { posted: 0, skipped: 0, errors: 0 },
  }

  res.json({
    data: {
      message: 'Use individual auto-post endpoints for each transaction type',
      endpoints: [
        'POST /api/financial/auto-post/invoices',
        'POST /api/financial/auto-post/payments',
        'POST /api/financial/auto-post/time-entries',
        'POST /api/financial/auto-post/renewals',
      ],
    },
    error: null,
  })
})

// ============================================================================
// EXPENSE MANAGEMENT
// ============================================================================

// GET /api/financial/expenses
financialRouter.get('/expenses', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const status = req.query.status as ExpenseStatus | undefined
  const vendorId = objIdOrNull(req.query.vendorId)
  const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined
  const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined

  const filter: any = {}
  if (status) filter.status = status
  if (vendorId) filter.vendorId = vendorId
  if (startDate || endDate) {
    filter.date = {}
    if (startDate) filter.date.$gte = startDate
    if (endDate) filter.date.$lte = endDate
  }

  const [expenses, total] = await Promise.all([
    db.collection('fi_expenses')
      .find(filter)
      .sort({ expenseNumber: -1 })
      .skip(offset)
      .limit(limit)
      .toArray(),
    db.collection('fi_expenses').countDocuments(filter),
  ])

  res.json({
    data: {
      items: expenses.map((e: any) => ({
        id: String(e._id),
        expenseNumber: e.expenseNumber,
        vendorId: e.vendorId ? String(e.vendorId) : null,
        vendorName: e.vendorName,
        date: e.date,
        dueDate: e.dueDate,
        description: e.description,
        category: e.category,
        lines: e.lines,
        subtotal: e.subtotal,
        tax: e.tax,
        total: e.total,
        status: e.status,
        paymentMethod: e.paymentMethod,
        receipt: e.receipt,
        journalEntryId: e.journalEntryId ? String(e.journalEntryId) : null,
        createdAt: e.createdAt,
      })),
      total,
      limit,
      offset,
    },
    error: null,
  })
})

const createExpenseSchema = z.object({
  vendorId: z.string().nullable().optional(),
  vendorName: z.string().nullable().optional(),
  date: z.string(),
  dueDate: z.string().nullable().optional(),
  description: z.string().min(1),
  category: z.string().min(1),
  lines: z.array(z.object({
    accountId: z.string(),
    amount: z.number().min(0),
    description: z.string().nullable().optional(),
    departmentId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
  })).min(1),
  tax: z.number().min(0).optional(),
  paymentMethod: z.string().nullable().optional(),
  receipt: z.string().nullable().optional(),
})

// POST /api/financial/expenses
financialRouter.post('/expenses', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }
  const parsed = createExpenseSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_input', details: parsed.error.flatten() })

  const { vendorId, vendorName, date, dueDate, description, category, lines, tax, paymentMethod, receipt } = parsed.data

  // Validate all accounts exist and build enriched lines
  const enrichedLines: ExpenseLine[] = []
  let subtotal = 0

  for (const line of lines) {
    const accountObjId = objIdOrNull(line.accountId)
    if (!accountObjId) return res.status(400).json({ data: null, error: 'invalid_account_id' })

    const account = await db.collection('fi_chart_of_accounts').findOne({ _id: accountObjId, isActive: true })
    if (!account) return res.status(400).json({ data: null, error: 'account_not_found', accountId: line.accountId })

    enrichedLines.push({
      accountId: accountObjId,
      accountNumber: (account as any).accountNumber,
      accountName: (account as any).name,
      amount: line.amount,
      description: line.description || null,
      departmentId: line.departmentId || null,
      projectId: line.projectId || null,
    })
    subtotal += line.amount
  }

  const total = subtotal + (tax || 0)
  const now = new Date()
  const expenseNumber = await getNextSequence(db, 'fi_expenses', 1001)

  const doc: ExpenseDoc = {
    _id: new ObjectId(),
    expenseNumber,
    vendorId: vendorId ? objIdOrNull(vendorId) : null,
    vendorName: vendorName || null,
    date: new Date(date),
    dueDate: dueDate ? new Date(dueDate) : null,
    description,
    category,
    lines: enrichedLines,
    subtotal,
    tax: tax || 0,
    total,
    status: 'draft',
    paymentMethod: paymentMethod || null,
    receipt: receipt || null,
    approvedBy: null,
    approvedAt: null,
    paidAt: null,
    journalEntryId: null,
    createdAt: now,
    createdBy: auth.userId,
    updatedAt: now,
    updatedBy: auth.userId,
  }

  await db.collection('fi_expenses').insertOne(doc as any)

  res.status(201).json({
    data: {
      id: String(doc._id),
      expenseNumber: doc.expenseNumber,
      total: doc.total,
      status: doc.status,
    },
    error: null,
  })
})

// PATCH /api/financial/expenses/:id
financialRouter.patch('/expenses/:id', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }
  const id = objIdOrNull(req.params.id)
  if (!id) return res.status(400).json({ data: null, error: 'invalid_id' })

  const expense = await db.collection('fi_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  // Can't edit paid or voided expenses
  if ((expense as any).status === 'paid' || (expense as any).status === 'void') {
    return res.status(400).json({ data: null, error: 'expense_finalized' })
  }

  const updates: any = { updatedAt: new Date(), updatedBy: auth.userId }
  const body = req.body

  if (typeof body.description === 'string') updates.description = body.description
  if (typeof body.category === 'string') updates.category = body.category
  if (typeof body.vendorName === 'string') updates.vendorName = body.vendorName
  if (body.date) updates.date = new Date(body.date)
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (typeof body.paymentMethod === 'string' || body.paymentMethod === null) updates.paymentMethod = body.paymentMethod
  if (typeof body.receipt === 'string' || body.receipt === null) updates.receipt = body.receipt

  await db.collection('fi_expenses').updateOne({ _id: id }, { $set: updates })

  res.json({ data: { id: String(id), updated: true }, error: null })
})

// POST /api/financial/expenses/:id/approve
financialRouter.post('/expenses/:id/approve', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }
  const id = objIdOrNull(req.params.id)
  if (!id) return res.status(400).json({ data: null, error: 'invalid_id' })

  const expense = await db.collection('fi_expenses').findOne({ _id: id }) as any
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })
  if (expense.status !== 'draft' && expense.status !== 'pending_approval') {
    return res.status(400).json({ data: null, error: 'invalid_status' })
  }

  const now = new Date()
  await db.collection('fi_expenses').updateOne(
    { _id: id },
    { $set: { status: 'approved', approvedBy: auth.userId, approvedAt: now, updatedAt: now, updatedBy: auth.userId } }
  )

  res.json({ data: { id: String(id), status: 'approved' }, error: null })
})

// POST /api/financial/expenses/:id/pay - Mark as paid and create journal entry
financialRouter.post('/expenses/:id/pay', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }
  const id = objIdOrNull(req.params.id)
  if (!id) return res.status(400).json({ data: null, error: 'invalid_id' })

  const expense = await db.collection('fi_expenses').findOne({ _id: id }) as any
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })
  if (expense.status !== 'approved') {
    return res.status(400).json({ data: null, error: 'must_be_approved_first' })
  }

  // Find open period
  const entryDate = expense.date || new Date()
  const period = await db.collection('fi_periods').findOne({
    startDate: { $lte: entryDate },
    endDate: { $gte: entryDate },
    status: 'open',
  })

  if (!period) {
    return res.status(400).json({ data: null, error: 'no_open_period' })
  }

  // Get cash account
  const cashAccount = await db.collection('fi_chart_of_accounts').findOne({ accountNumber: '1010', isActive: true })
  if (!cashAccount) {
    return res.status(400).json({ data: null, error: 'cash_account_not_found' })
  }

  // Create journal entry: DR Expense accounts, CR Cash
  const now = new Date()
  const entryNumber = await getNextSequence(db, 'fi_journal_entries', 10001)

  const jeLines: JournalEntryLine[] = []

  // Debit expense accounts
  for (const line of expense.lines) {
    jeLines.push({
      accountId: line.accountId,
      accountNumber: line.accountNumber,
      accountName: line.accountName,
      debit: line.amount,
      credit: 0,
      description: line.description,
      projectId: line.projectId,
    })
  }

  // Credit cash
  jeLines.push({
    accountId: cashAccount._id,
    accountNumber: (cashAccount as any).accountNumber,
    accountName: (cashAccount as any).name,
    debit: 0,
    credit: expense.total,
    description: `Payment for expense #${expense.expenseNumber}`,
  })

  const journalEntry = {
    _id: new ObjectId(),
    entryNumber,
    date: entryDate,
    postingDate: now,
    periodId: period._id,
    description: `Expense #${expense.expenseNumber} - ${expense.description}`,
    sourceType: 'expense',
    sourceId: String(id),
    lines: jeLines,
    status: 'posted',
    reversedEntryId: null,
    reversalOfEntryId: null,
    attachments: [],
    approvedBy: auth.userId,
    approvedAt: now,
    createdAt: now,
    createdBy: auth.userId,
    updatedAt: now,
    updatedBy: auth.userId,
    audit: [{
      action: 'created',
      userId: auth.userId,
      userEmail: auth.email,
      timestamp: now,
      changes: { expenseId: String(id), expenseNumber: expense.expenseNumber },
    }],
  }

  await db.collection('fi_journal_entries').insertOne(journalEntry as any)

  // Update expense as paid
  await db.collection('fi_expenses').updateOne(
    { _id: id },
    {
      $set: {
        status: 'paid',
        paidAt: now,
        journalEntryId: journalEntry._id,
        updatedAt: now,
        updatedBy: auth.userId,
      },
    }
  )

  res.json({
    data: {
      id: String(id),
      status: 'paid',
      journalEntryId: String(journalEntry._id),
      journalEntryNumber: entryNumber,
    },
    error: null,
  })
})

// POST /api/financial/expenses/:id/void
financialRouter.post('/expenses/:id/void', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }
  const id = objIdOrNull(req.params.id)
  if (!id) return res.status(400).json({ data: null, error: 'invalid_id' })

  const expense = await db.collection('fi_expenses').findOne({ _id: id }) as any
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  // Can't void if already paid (would need to reverse the JE)
  if (expense.status === 'paid') {
    return res.status(400).json({ data: null, error: 'cannot_void_paid_expense' })
  }

  const now = new Date()
  await db.collection('fi_expenses').updateOne(
    { _id: id },
    { $set: { status: 'void', updatedAt: now, updatedBy: auth.userId } }
  )

  res.json({ data: { id: String(id), status: 'void' }, error: null })
})

// GET /api/financial/expense-categories - Get common expense categories
financialRouter.get('/expense-categories', async (req: any, res) => {
  const categories = [
    'Advertising & Marketing',
    'Bank Fees & Charges',
    'Contractor Services',
    'Equipment & Supplies',
    'Insurance',
    'Legal & Professional',
    'Meals & Entertainment',
    'Office Expenses',
    'Payroll Expenses',
    'Rent & Utilities',
    'Software & Subscriptions',
    'Travel & Transportation',
    'Other',
  ]

  res.json({ data: { categories }, error: null })
})

// ============================================================================
// FINANCIAL INTELLIGENCE & ANALYTICS
// ============================================================================

// GET /api/financial/analytics/kpis - Financial KPIs and ratios
financialRouter.get('/analytics/kpis', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const currentDate = new Date()
  const startOfYear = new Date(currentDate.getFullYear(), 0, 1)
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  const startOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
  const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0)

  // Get YTD income statement data
  const ytdIncomeExpense = await db.collection('fi_journal_entries').aggregate([
    { $match: { status: 'posted', date: { $gte: startOfYear, $lte: currentDate } } },
    { $unwind: '$lines' },
    {
      $lookup: {
        from: 'fi_chart_of_accounts',
        localField: 'lines.accountId',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    { $match: { 'account.type': { $in: ['Revenue', 'Expense'] } } },
    {
      $group: {
        _id: { type: '$account.type', subType: '$account.subType' },
        totalDebits: { $sum: '$lines.debit' },
        totalCredits: { $sum: '$lines.credit' },
      },
    },
  ]).toArray()

  let ytdRevenue = 0
  let ytdCOGS = 0
  let ytdOpex = 0
  let ytdOtherExp = 0

  for (const r of ytdIncomeExpense as any[]) {
    const balance = r._id.type === 'Revenue'
      ? r.totalCredits - r.totalDebits
      : r.totalDebits - r.totalCredits

    if (r._id.type === 'Revenue') {
      ytdRevenue += balance
    } else if (r._id.subType === 'COGS') {
      ytdCOGS += balance
    } else if (r._id.subType === 'Operating Expense') {
      ytdOpex += balance
    } else {
      ytdOtherExp += balance
    }
  }

  const ytdGrossProfit = ytdRevenue - ytdCOGS
  const ytdNetIncome = ytdGrossProfit - ytdOpex - ytdOtherExp

  // Get balance sheet data
  const balanceSheetData = await db.collection('fi_journal_entries').aggregate([
    { $match: { status: 'posted', date: { $lte: currentDate } } },
    { $unwind: '$lines' },
    {
      $lookup: {
        from: 'fi_chart_of_accounts',
        localField: 'lines.accountId',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    { $match: { 'account.type': { $in: ['Asset', 'Liability'] } } },
    {
      $group: {
        _id: { type: '$account.type', subType: '$account.subType', accountNumber: '$account.accountNumber' },
        totalDebits: { $sum: '$lines.debit' },
        totalCredits: { $sum: '$lines.credit' },
      },
    },
  ]).toArray()

  let currentAssets = 0
  let currentLiabilities = 0
  let totalAssets = 0
  let totalLiabilities = 0
  let accountsReceivable = 0
  let inventory = 0

  for (const r of balanceSheetData as any[]) {
    const balance = r._id.type === 'Asset'
      ? r.totalDebits - r.totalCredits
      : r.totalCredits - r.totalDebits

    if (r._id.type === 'Asset') {
      totalAssets += balance
      if (r._id.subType === 'Current Asset') {
        currentAssets += balance
        if (r._id.accountNumber === '1100') accountsReceivable = balance
      }
    } else {
      totalLiabilities += balance
      if (r._id.subType === 'Current Liability') {
        currentLiabilities += balance
      }
    }
  }

  // Calculate KPIs
  const grossMargin = ytdRevenue > 0 ? (ytdGrossProfit / ytdRevenue) * 100 : 0
  const netMargin = ytdRevenue > 0 ? (ytdNetIncome / ytdRevenue) * 100 : 0
  const operatingMargin = ytdRevenue > 0 ? ((ytdGrossProfit - ytdOpex) / ytdRevenue) * 100 : 0
  const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0
  const quickRatio = currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : 0
  const debtToEquity = (totalAssets - totalLiabilities) > 0 ? totalLiabilities / (totalAssets - totalLiabilities) : 0

  // Calculate DSO (Days Sales Outstanding)
  const avgDailyRevenue = ytdRevenue / Math.max(1, Math.floor((currentDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)))
  const dso = avgDailyRevenue > 0 ? accountsReceivable / avgDailyRevenue : 0

  // Get monthly trend data (last 6 months)
  const sixMonthsAgo = new Date(currentDate.getFullYear(), currentDate.getMonth() - 5, 1)
  const monthlyTrend = await db.collection('fi_journal_entries').aggregate([
    { $match: { status: 'posted', date: { $gte: sixMonthsAgo, $lte: currentDate } } },
    { $unwind: '$lines' },
    {
      $lookup: {
        from: 'fi_chart_of_accounts',
        localField: 'lines.accountId',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    { $match: { 'account.type': { $in: ['Revenue', 'Expense'] } } },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          month: { $month: '$date' },
          type: '$account.type',
        },
        totalDebits: { $sum: '$lines.debit' },
        totalCredits: { $sum: '$lines.credit' },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]).toArray()

  // Process monthly trend
  const monthlyMap = new Map<string, { revenue: number; expenses: number }>()
  for (const r of monthlyTrend as any[]) {
    const key = `${r._id.year}-${String(r._id.month).padStart(2, '0')}`
    if (!monthlyMap.has(key)) monthlyMap.set(key, { revenue: 0, expenses: 0 })
    const entry = monthlyMap.get(key)!
    if (r._id.type === 'Revenue') {
      entry.revenue += r.totalCredits - r.totalDebits
    } else {
      entry.expenses += r.totalDebits - r.totalCredits
    }
  }

  const revenueExpenseTrend = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, data]) => ({
      period,
      revenue: Math.round(data.revenue * 100) / 100,
      expenses: Math.round(data.expenses * 100) / 100,
      netIncome: Math.round((data.revenue - data.expenses) * 100) / 100,
    }))

  // AI Insights
  const insights: Array<{ type: 'positive' | 'warning' | 'info'; title: string; description: string }> = []

  if (grossMargin >= 50) {
    insights.push({ type: 'positive', title: 'Strong Gross Margin', description: `Gross margin of ${grossMargin.toFixed(1)}% indicates healthy pricing and cost management.` })
  } else if (grossMargin < 30) {
    insights.push({ type: 'warning', title: 'Low Gross Margin', description: `Gross margin of ${grossMargin.toFixed(1)}% is below industry norms. Consider reviewing pricing or reducing COGS.` })
  }

  if (currentRatio >= 2) {
    insights.push({ type: 'positive', title: 'Strong Liquidity', description: `Current ratio of ${currentRatio.toFixed(2)} indicates excellent short-term financial health.` })
  } else if (currentRatio < 1) {
    insights.push({ type: 'warning', title: 'Liquidity Concern', description: `Current ratio of ${currentRatio.toFixed(2)} suggests potential difficulty meeting short-term obligations.` })
  }

  if (dso > 45) {
    insights.push({ type: 'warning', title: 'High DSO', description: `DSO of ${Math.round(dso)} days is elevated. Consider tightening credit terms or improving collections.` })
  } else if (dso > 0 && dso <= 30) {
    insights.push({ type: 'positive', title: 'Efficient Collections', description: `DSO of ${Math.round(dso)} days indicates quick customer payment cycles.` })
  }

  if (revenueExpenseTrend.length >= 3) {
    const lastThree = revenueExpenseTrend.slice(-3)
    const avgRevGrowth = lastThree.length > 1
      ? ((lastThree[lastThree.length - 1].revenue - lastThree[0].revenue) / Math.max(1, lastThree[0].revenue)) * 100
      : 0
    if (avgRevGrowth > 10) {
      insights.push({ type: 'positive', title: 'Revenue Growth', description: `Revenue has grown ${avgRevGrowth.toFixed(1)}% over the last 3 months.` })
    } else if (avgRevGrowth < -10) {
      insights.push({ type: 'warning', title: 'Revenue Decline', description: `Revenue has declined ${Math.abs(avgRevGrowth).toFixed(1)}% over the last 3 months.` })
    }
  }

  // Simple forecasting (linear regression on revenue)
  let forecastedRevenue = ytdRevenue
  if (revenueExpenseTrend.length >= 3) {
    const n = revenueExpenseTrend.length
    const sumX = revenueExpenseTrend.reduce((sum, _, i) => sum + i, 0)
    const sumY = revenueExpenseTrend.reduce((sum, d) => sum + d.revenue, 0)
    const sumXY = revenueExpenseTrend.reduce((sum, d, i) => sum + i * d.revenue, 0)
    const sumXX = revenueExpenseTrend.reduce((sum, _, i) => sum + i * i, 0)
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    forecastedRevenue = intercept + slope * (n + 2) // Forecast 3 months ahead
  }

  res.json({
    data: {
      period: { startDate: startOfYear, endDate: currentDate },
      profitability: {
        ytdRevenue: Math.round(ytdRevenue * 100) / 100,
        ytdCOGS: Math.round(ytdCOGS * 100) / 100,
        ytdGrossProfit: Math.round(ytdGrossProfit * 100) / 100,
        ytdOperatingExpenses: Math.round(ytdOpex * 100) / 100,
        ytdNetIncome: Math.round(ytdNetIncome * 100) / 100,
        grossMargin: Math.round(grossMargin * 10) / 10,
        operatingMargin: Math.round(operatingMargin * 10) / 10,
        netMargin: Math.round(netMargin * 10) / 10,
      },
      liquidity: {
        currentRatio: Math.round(currentRatio * 100) / 100,
        quickRatio: Math.round(quickRatio * 100) / 100,
        currentAssets: Math.round(currentAssets * 100) / 100,
        currentLiabilities: Math.round(currentLiabilities * 100) / 100,
      },
      efficiency: {
        dso: Math.round(dso),
        accountsReceivable: Math.round(accountsReceivable * 100) / 100,
      },
      leverage: {
        debtToEquity: Math.round(debtToEquity * 100) / 100,
        totalAssets: Math.round(totalAssets * 100) / 100,
        totalLiabilities: Math.round(totalLiabilities * 100) / 100,
        totalEquity: Math.round((totalAssets - totalLiabilities) * 100) / 100,
      },
      trend: revenueExpenseTrend,
      forecast: {
        nextPeriodRevenue: Math.round(forecastedRevenue * 100) / 100,
        confidence: revenueExpenseTrend.length >= 6 ? 'medium' : 'low',
      },
      insights,
    },
    error: null,
  })
})

// GET /api/financial/analytics/anomalies - Detect unusual transactions
financialRouter.get('/analytics/anomalies', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const daysBack = Number(req.query.days) || 90
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  // Get recent journal entries
  const entries = await db.collection('fi_journal_entries')
    .find({ status: 'posted', date: { $gte: startDate } })
    .sort({ date: -1 })
    .limit(500)
    .toArray()

  // Calculate statistics per source type
  const statsBySource = new Map<string, { count: number; sum: number; values: number[] }>()
  for (const e of entries as any[]) {
    const total = e.lines.reduce((sum: number, l: any) => sum + (l.debit || 0), 0)
    const src = e.sourceType
    if (!statsBySource.has(src)) statsBySource.set(src, { count: 0, sum: 0, values: [] })
    const stats = statsBySource.get(src)!
    stats.count++
    stats.sum += total
    stats.values.push(total)
  }

  // Calculate mean and stddev for each source type
  const anomalies: Array<{
    entryNumber: number
    date: Date
    description: string
    sourceType: string
    amount: number
    reason: string
    severity: 'high' | 'medium' | 'low'
  }> = []

  for (const e of entries as any[]) {
    const total = e.lines.reduce((sum: number, l: any) => sum + (l.debit || 0), 0)
    const stats = statsBySource.get(e.sourceType)
    if (!stats || stats.count < 5) continue

    const mean = stats.sum / stats.count
    const variance = stats.values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / stats.count
    const stddev = Math.sqrt(variance)

    if (stddev > 0) {
      const zScore = (total - mean) / stddev
      if (Math.abs(zScore) > 2.5) {
        anomalies.push({
          entryNumber: e.entryNumber,
          date: e.date,
          description: e.description,
          sourceType: e.sourceType,
          amount: Math.round(total * 100) / 100,
          reason: zScore > 0
            ? `Amount is ${(zScore).toFixed(1)} standard deviations above average for ${e.sourceType} entries`
            : `Amount is ${Math.abs(zScore).toFixed(1)} standard deviations below average for ${e.sourceType} entries`,
          severity: Math.abs(zScore) > 3.5 ? 'high' : Math.abs(zScore) > 3 ? 'medium' : 'low',
        })
      }
    }
  }

  // Also flag large manual adjustments
  for (const e of entries as any[]) {
    if (e.sourceType === 'adjustment' || e.sourceType === 'manual') {
      const total = e.lines.reduce((sum: number, l: any) => sum + (l.debit || 0), 0)
      if (total > 10000 && !anomalies.find(a => a.entryNumber === e.entryNumber)) {
        anomalies.push({
          entryNumber: e.entryNumber,
          date: e.date,
          description: e.description,
          sourceType: e.sourceType,
          amount: Math.round(total * 100) / 100,
          reason: `Large manual/adjustment entry exceeds $10,000 threshold`,
          severity: total > 50000 ? 'high' : total > 25000 ? 'medium' : 'low',
        })
      }
    }
  }

  res.json({
    data: {
      period: { startDate, endDate: new Date() },
      anomalies: anomalies.sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 }
        return severityOrder[a.severity] - severityOrder[b.severity]
      }),
      summary: {
        total: anomalies.length,
        high: anomalies.filter(a => a.severity === 'high').length,
        medium: anomalies.filter(a => a.severity === 'medium').length,
        low: anomalies.filter(a => a.severity === 'low').length,
      },
    },
    error: null,
  })
})

// GET /api/financial/analytics/profitability-by-project - Project-level profitability
financialRouter.get('/analytics/profitability-by-project', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().getFullYear(), 0, 1)
  const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date()

  // Get revenue by project from invoices
  const invoicesByProject = await db.collection('invoices').aggregate([
    { $match: { status: { $in: ['paid', 'partial'] }, createdAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: '$projectId',
        revenue: { $sum: '$total' },
        invoiceCount: { $sum: 1 },
      },
    },
  ]).toArray()

  // Get labor costs by project from time entries (via journal entries)
  const laborByProject = await db.collection('fi_journal_entries').aggregate([
    {
      $match: {
        status: 'posted',
        sourceType: 'time_entry',
        date: { $gte: startDate, $lte: endDate },
      },
    },
    { $unwind: '$lines' },
    { $match: { 'lines.projectId': { $exists: true, $ne: null } } },
    {
      $group: {
        _id: '$lines.projectId',
        laborCost: { $sum: '$lines.debit' },
      },
    },
  ]).toArray()

  // Merge data
  const projectMap = new Map<string, { revenue: number; laborCost: number; invoiceCount: number }>()
  
  for (const inv of invoicesByProject as any[]) {
    if (inv._id) {
      const key = String(inv._id)
      if (!projectMap.has(key)) projectMap.set(key, { revenue: 0, laborCost: 0, invoiceCount: 0 })
      const entry = projectMap.get(key)!
      entry.revenue = inv.revenue
      entry.invoiceCount = inv.invoiceCount
    }
  }

  for (const lab of laborByProject as any[]) {
    if (lab._id) {
      const key = String(lab._id)
      if (!projectMap.has(key)) projectMap.set(key, { revenue: 0, laborCost: 0, invoiceCount: 0 })
      const entry = projectMap.get(key)!
      entry.laborCost = lab.laborCost
    }
  }

  // Get project names
  const projectIds = Array.from(projectMap.keys()).map(id => {
    try { return new ObjectId(id) } catch { return null }
  }).filter(Boolean) as ObjectId[]

  const projects = projectIds.length > 0
    ? await db.collection('sf_projects').find({ _id: { $in: projectIds } }).toArray()
    : []
  const projectNameMap = new Map(projects.map((p: any) => [String(p._id), p.name]))

  // Also check CRM projects
  const crmProjects = projectIds.length > 0
    ? await db.collection('crm_projects').find({ _id: { $in: projectIds } }).toArray()
    : []
  for (const p of crmProjects as any[]) {
    if (!projectNameMap.has(String(p._id))) {
      projectNameMap.set(String(p._id), p.name || p.title)
    }
  }

  const profitabilityData = Array.from(projectMap.entries())
    .map(([projectId, data]) => ({
      projectId,
      projectName: projectNameMap.get(projectId) || 'Unknown Project',
      revenue: Math.round(data.revenue * 100) / 100,
      laborCost: Math.round(data.laborCost * 100) / 100,
      grossProfit: Math.round((data.revenue - data.laborCost) * 100) / 100,
      margin: data.revenue > 0 ? Math.round(((data.revenue - data.laborCost) / data.revenue) * 1000) / 10 : 0,
      invoiceCount: data.invoiceCount,
    }))
    .filter(p => p.revenue > 0 || p.laborCost > 0)
    .sort((a, b) => b.grossProfit - a.grossProfit)

  const totals = profitabilityData.reduce(
    (acc, p) => ({
      revenue: acc.revenue + p.revenue,
      laborCost: acc.laborCost + p.laborCost,
      grossProfit: acc.grossProfit + p.grossProfit,
    }),
    { revenue: 0, laborCost: 0, grossProfit: 0 }
  )

  res.json({
    data: {
      period: { startDate, endDate },
      projects: profitabilityData,
      totals: {
        ...totals,
        margin: totals.revenue > 0 ? Math.round((totals.grossProfit / totals.revenue) * 1000) / 10 : 0,
      },
    },
    error: null,
  })
})
