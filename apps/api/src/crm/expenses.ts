/**
 * CRM Expenses Module
 * 
 * Manages business expenses with approval workflow and automatic posting
 * to Financial Intelligence when expenses are paid.
 * 
 * Workflow: Draft -> Pending Approval -> Approved -> Paid
 * 
 * When paid, creates journal entry:
 *   DR: Expense Account(s)
 *   CR: Cash/Bank Account
 */

import { Router } from 'express'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import multer, { FileFilterCallback } from 'multer'
import path from 'path'
import fs from 'fs'
import { getDb } from '../db.js'
import { requireAuth, requirePermission } from '../auth/rbac.js'
import { env } from '../env.js'

export const expensesRouter = Router()

// Setup upload directory for expense receipts
const uploadDir = env.UPLOAD_DIR 
  ? path.join(env.UPLOAD_DIR, 'expense_receipts') 
  : path.join(process.cwd(), 'uploads', 'expense_receipts')

try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }
} catch (err) {
  console.error('Failed to create expense receipts upload directory:', err)
}

// Configure multer for expense attachments
const expenseStorage = multer.diskStorage({
  destination: (_req: any, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => cb(null, uploadDir),
  filename: (_req: any, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, `expense-${uniqueSuffix}${path.extname(file.originalname)}`)
  },
})

const expenseFileFilter = (_req: any, file: Express.Multer.File, cb: FileFilterCallback) => {
  // Allow common receipt types: PDF, images
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only PDF, JPG, PNG, GIF, and WEBP are allowed.'))
  }
}

const uploadExpenseAttachment = multer({
  storage: expenseStorage,
  fileFilter: expenseFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
})

expensesRouter.use(requireAuth)

type ExpenseStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'paid' | 'void'

type ExpenseLine = {
  category: string
  accountNumber?: string // Maps to Chart of Accounts
  amount: number
  description?: string
  projectId?: string
}

// Approval history entry for audit trail
type ApprovalHistoryEntry = {
  action: 'submitted' | 'approved' | 'rejected' | 'withdrawn' | 'resubmitted'
  userId: string
  userEmail?: string
  userName?: string
  timestamp: Date
  notes?: string
  approverUserId?: string
}

// Attachment metadata
type AttachmentDoc = {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  uploadedByUserId: string
  uploadedByEmail?: string
  uploadedAt: Date
  url: string
}

type ExpenseDoc = {
  _id: ObjectId
  expenseNumber: number
  date: Date
  vendorId?: ObjectId
  vendorName?: string
  payee?: string // For non-vendor expenses
  description: string
  lines: ExpenseLine[]
  total: number
  paymentMethod?: string // Cash, Check, Credit Card, ACH, etc.
  referenceNumber?: string // Check number, transaction ID, etc.
  status: ExpenseStatus
  submittedBy?: string
  submittedByEmail?: string
  submittedByName?: string
  submittedAt?: Date
  approverUserId?: string // Selected manager to approve
  approverEmail?: string
  approverName?: string
  approvedBy?: string
  approvedByEmail?: string
  approvedByName?: string
  approvedAt?: Date
  rejectedBy?: string
  rejectedByEmail?: string
  rejectedByName?: string
  rejectedAt?: Date
  rejectionReason?: string
  paidBy?: string
  paidAt?: Date
  voidedBy?: string
  voidedAt?: Date
  voidReason?: string
  journalEntryId?: string // Link to Financial Intelligence
  attachments?: AttachmentDoc[]
  approvalHistory?: ApprovalHistoryEntry[]
  notes?: string
  createdBy: string
  createdByEmail?: string
  createdByName?: string
  createdAt: Date
  updatedAt: Date
}

// Expense approval request (for queue)
type ExpenseApprovalRequestDoc = {
  _id: ObjectId
  expenseId: ObjectId
  expenseNumber: number
  expenseDescription: string
  expenseTotal: number
  requesterId: string
  requesterEmail: string
  requesterName?: string
  approverUserId: string
  approverEmail: string
  approverName?: string
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: Date
  reviewedAt?: Date
  reviewedBy?: string
  reviewNotes?: string
  createdAt: Date
  updatedAt: Date
}

// Expense categories with default account mappings
const EXPENSE_CATEGORIES = [
  { category: 'Cost of Services', accountNumber: '5000' },
  { category: 'Contractor Costs', accountNumber: '5200' },
  { category: 'Hosting & Infrastructure', accountNumber: '5300' },
  { category: 'Third-Party Services', accountNumber: '5400' },
  { category: 'Salaries & Wages', accountNumber: '6000' },
  { category: 'Payroll Taxes', accountNumber: '6100' },
  { category: 'Employee Benefits', accountNumber: '6150' },
  { category: 'Rent', accountNumber: '6200' },
  { category: 'Utilities', accountNumber: '6250' },
  { category: 'Software Subscriptions', accountNumber: '6300' },
  { category: 'Marketing & Advertising', accountNumber: '6400' },
  { category: 'Professional Services', accountNumber: '6500' },
  { category: 'Travel & Entertainment', accountNumber: '6600' },
  { category: 'Insurance', accountNumber: '6700' },
  { category: 'Office Supplies', accountNumber: '6800' },
  { category: 'Bank Fees', accountNumber: '7100' },
  { category: 'Other Expense', accountNumber: '6900' },
]

const expenseLineSchema = z.object({
  category: z.string().trim().min(1),
  accountNumber: z.string().trim().optional(),
  amount: z.coerce.number().nonnegative(), // coerce handles string inputs, nonnegative allows 0
  description: z.string().trim().optional(),
  projectId: z.string().trim().optional(),
})

const createExpenseSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  vendorId: z.string().trim().optional(),
  vendorName: z.string().trim().optional(),
  payee: z.string().trim().optional(),
  description: z.string().trim().min(1),
  lines: z.array(expenseLineSchema).min(1),
  paymentMethod: z.string().trim().optional(),
  referenceNumber: z.string().trim().optional(),
  notes: z.string().trim().optional(),
})

const updateExpenseSchema = createExpenseSchema.partial()

async function getNextExpenseNumber(db: any): Promise<number> {
  const result = await db.collection('sequences').findOneAndUpdate(
    { _id: 'crm_expenses' } as any,
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after' }
  )
  if (!result || !(result as any).value) {
    await db.collection('sequences').updateOne(
      { _id: 'crm_expenses' } as any,
      { $set: { value: 1001 } },
      { upsert: true }
    )
    return 1001
  }
  return (result as any).value
}

function serializeExpense(doc: ExpenseDoc) {
  return {
    _id: doc._id.toHexString(),
    expenseNumber: doc.expenseNumber,
    date: doc.date instanceof Date ? doc.date.toISOString() : doc.date,
    vendorId: doc.vendorId?.toHexString(),
    vendorName: doc.vendorName,
    payee: doc.payee,
    description: doc.description,
    lines: doc.lines,
    total: doc.total,
    paymentMethod: doc.paymentMethod,
    referenceNumber: doc.referenceNumber,
    status: doc.status,
    submittedBy: doc.submittedBy,
    submittedByEmail: doc.submittedByEmail,
    submittedByName: doc.submittedByName,
    submittedAt: doc.submittedAt?.toISOString(),
    approverUserId: doc.approverUserId,
    approverEmail: doc.approverEmail,
    approverName: doc.approverName,
    approvedBy: doc.approvedBy,
    approvedByEmail: doc.approvedByEmail,
    approvedByName: doc.approvedByName,
    approvedAt: doc.approvedAt?.toISOString(),
    rejectedBy: doc.rejectedBy,
    rejectedByEmail: doc.rejectedByEmail,
    rejectedByName: doc.rejectedByName,
    rejectedAt: doc.rejectedAt?.toISOString(),
    rejectionReason: doc.rejectionReason,
    paidBy: doc.paidBy,
    paidAt: doc.paidAt?.toISOString(),
    voidedBy: doc.voidedBy,
    voidedAt: doc.voidedAt?.toISOString(),
    voidReason: doc.voidReason,
    journalEntryId: doc.journalEntryId,
    attachments: doc.attachments,
    approvalHistory: doc.approvalHistory?.map((h) => ({
      ...h,
      timestamp: h.timestamp instanceof Date ? h.timestamp.toISOString() : h.timestamp,
    })),
    notes: doc.notes,
    createdBy: doc.createdBy,
    createdByEmail: doc.createdByEmail,
    createdByName: doc.createdByName,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

// GET /api/crm/expenses - List expenses
expensesRouter.get('/', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [], total: 0 }, error: null })

  const q = String((req.query.q as string) ?? '').trim()
  const status = req.query.status as ExpenseStatus | undefined
  const vendorId = req.query.vendorId as string | undefined
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const skip = Number(req.query.skip) || 0
  const sort = (req.query.sort as string) || 'expenseNumber'
  const dir = req.query.dir === 'asc' ? 1 : -1

  const filter: Record<string, unknown> = {}
  
  if (q) {
    filter.$or = [
      { description: { $regex: q, $options: 'i' } },
      { vendorName: { $regex: q, $options: 'i' } },
      { payee: { $regex: q, $options: 'i' } },
      { referenceNumber: { $regex: q, $options: 'i' } },
    ]
    // Also search by expense number if numeric
    const num = parseInt(q, 10)
    if (!isNaN(num)) {
      (filter.$or as any[]).push({ expenseNumber: num })
    }
  }

  if (status) filter.status = status
  if (vendorId) {
    try {
      filter.vendorId = new ObjectId(vendorId)
    } catch {}
  }
  if (startDate || endDate) {
    filter.date = {}
    if (startDate) (filter.date as any).$gte = startDate
    if (endDate) (filter.date as any).$lte = endDate
  }

  const [items, total] = await Promise.all([
    db.collection<ExpenseDoc>('crm_expenses')
      .find(filter)
      .sort({ [sort]: dir })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection('crm_expenses').countDocuments(filter),
  ])

  res.json({ data: { items: items.map(serializeExpense), total }, error: null })
})

// GET /api/crm/expenses/categories - Get expense categories
expensesRouter.get('/categories', async (_req, res) => {
  res.json({ data: { categories: EXPENSE_CATEGORIES }, error: null })
})

// GET /api/crm/expenses/approvers - Get eligible expense approvers (managers)
expensesRouter.get('/approvers', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { approvers: [] }, error: null })

  try {
    // Find users with manager role
    const managerRole = await db.collection('roles').findOne({ name: 'manager' })
    if (!managerRole) {
      return res.json({ data: { approvers: [] }, error: null })
    }

    // Get user IDs with manager role
    const userRoles = await db.collection('user_roles')
      .find({ roleId: managerRole._id })
      .toArray()
    
    const managerUserIds = userRoles.map((ur: any) => ur.userId)

    // Get manager user details
    const managers = await db.collection('users')
      .find({
        $or: [
          { _id: { $in: managerUserIds.map((id: string) => {
            try { return new ObjectId(id) } catch { return null }
          }).filter(Boolean) } },
          // Also include admins
          { isAdmin: true },
        ],
      })
      .project({ _id: 1, name: 1, email: 1 })
      .toArray()

    const approvers = managers.map((m: any) => ({
      id: m._id.toHexString(),
      name: m.name || m.email,
      email: m.email,
    }))

    res.json({ data: { approvers }, error: null })
  } catch (err: any) {
    console.error('[expenses] GET /approvers error:', err)
    res.json({ data: { approvers: [] }, error: null })
  }
})

// GET /api/crm/expenses/approval-queue - Get expenses awaiting approval for current user
expensesRouter.get('/approval-queue', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth
  if (!auth?.userId) {
    return res.status(401).json({ data: null, error: 'unauthorized' })
  }

  // Check if user is manager or admin
  const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
  if (!user) {
    return res.status(404).json({ data: null, error: 'user_not_found' })
  }

  const managerRole = await db.collection('roles').findOne({ name: 'manager' })
  const hasManagerRole = managerRole && await db.collection('user_roles').findOne({
    userId: auth.userId,
    roleId: managerRole._id,
  })

  const isAdmin = (user as any).isAdmin === true
  if (!hasManagerRole && !isAdmin) {
    return res.status(403).json({ data: null, error: 'manager_access_required' })
  }

  const statusFilter = req.query.status as string | undefined

  // Build filter for approval queue
  const filter: Record<string, unknown> = {}
  
  if (isAdmin) {
    // Admins see all pending_approval expenses
    filter.status = statusFilter === 'all' ? { $in: ['pending_approval', 'approved', 'rejected'] } : 
                    statusFilter || 'pending_approval'
  } else {
    // Managers see only expenses assigned to them
    filter.approverUserId = auth.userId
    filter.status = statusFilter === 'all' ? { $in: ['pending_approval', 'approved', 'rejected'] } : 
                    statusFilter || 'pending_approval'
  }

  const items = await db.collection<ExpenseDoc>('crm_expenses')
    .find(filter)
    .sort({ submittedAt: -1 })
    .limit(200)
    .toArray()

  res.json({
    data: {
      items: items.map((doc) => ({
        _id: doc._id.toHexString(),
        expenseId: doc._id.toHexString(),
        expenseNumber: doc.expenseNumber,
        description: doc.description,
        total: doc.total,
        date: doc.date instanceof Date ? doc.date.toISOString() : doc.date,
        status: doc.status,
        vendorName: doc.vendorName,
        payee: doc.payee,
        requesterId: doc.submittedBy,
        requesterEmail: doc.submittedByEmail,
        requesterName: doc.submittedByName,
        approverUserId: doc.approverUserId,
        approverEmail: doc.approverEmail,
        approverName: doc.approverName,
        requestedAt: doc.submittedAt?.toISOString(),
        reviewedAt: doc.approvedAt?.toISOString() || doc.rejectedAt?.toISOString(),
        reviewedBy: doc.approvedBy || doc.rejectedBy,
        reviewNotes: doc.rejectionReason,
        lines: doc.lines,
      })),
    },
    error: null,
  })
})

// GET /api/crm/expenses/summary - Get expense summary stats
expensesRouter.get('/summary', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: null, error: 'db_unavailable' })

  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(new Date().getFullYear(), 0, 1)
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date()

  const pipeline = [
    { $match: { date: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        total: { $sum: '$total' },
      },
    },
  ]

  const results = await db.collection('crm_expenses').aggregate(pipeline).toArray()

  const summary: Record<string, { count: number; total: number }> = {
    draft: { count: 0, total: 0 },
    pending_approval: { count: 0, total: 0 },
    approved: { count: 0, total: 0 },
    rejected: { count: 0, total: 0 },
    paid: { count: 0, total: 0 },
    void: { count: 0, total: 0 },
  }

  for (const r of results) {
    if (summary[r._id]) {
      summary[r._id] = { count: r.count, total: Math.round(r.total * 100) / 100 }
    }
  }

  // Category breakdown for paid expenses
  const categoryPipeline = [
    { $match: { date: { $gte: startDate, $lte: endDate }, status: 'paid' } },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.category',
        total: { $sum: '$lines.amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]

  const categoryResults = await db.collection('crm_expenses').aggregate(categoryPipeline).toArray()

  res.json({
    data: {
      period: { startDate, endDate },
      byStatus: summary,
      byCategory: categoryResults.map((r: any) => ({
        category: r._id,
        total: Math.round(r.total * 100) / 100,
        count: r.count,
      })),
    },
    error: null,
  })
})

// GET /api/crm/expenses/attachments/:filename - Serve attachment file
// NOTE: This must be defined BEFORE /:id routes to prevent "attachments" matching as :id
expensesRouter.get('/attachments/:filename', async (req, res) => {
  const filename = req.params.filename

  // Security: only allow alphanumeric, dash, underscore, and extension
  if (!/^[\w-]+\.\w+$/.test(filename)) {
    return res.status(400).json({ data: null, error: 'invalid_filename' })
  }

  const filePath = path.resolve(uploadDir, filename)

  // Security: ensure resolved path is within upload directory
  const resolvedUploadDir = path.resolve(uploadDir)
  if (!filePath.startsWith(resolvedUploadDir)) {
    return res.status(403).json({ data: null, error: 'access_denied' })
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ data: null, error: 'file_not_found' })
  }

  res.sendFile(filePath)
})

// GET /api/crm/expenses/:id - Get single expense
expensesRouter.get('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  let id: ObjectId
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const expense = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  res.json({ data: serializeExpense(expense), error: null })
})

// POST /api/crm/expenses - Create expense
expensesRouter.post('/', async (req: any, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = req.auth
    if (!auth?.userId) {
      return res.status(401).json({ data: null, error: 'unauthorized' })
    }

    const parsed = createExpenseSchema.safeParse(req.body)
    if (!parsed.success) {
      console.error('[expenses] Validation error:', JSON.stringify(parsed.error.flatten()))
      return res.status(400).json({ data: null, error: parsed.error.flatten() })
    }

    const { date, vendorId, vendorName, payee, description, lines, paymentMethod, referenceNumber, notes } = parsed.data

    // Validate vendorId if provided
    let parsedVendorId: ObjectId | undefined
    if (vendorId) {
      try {
        parsedVendorId = new ObjectId(vendorId)
      } catch {
        return res.status(400).json({ data: null, error: 'invalid_vendor_id' })
      }
    }

    // Enrich lines with account numbers from categories
    const enrichedLines: ExpenseLine[] = lines.map((line) => {
      const categoryMatch = EXPENSE_CATEGORIES.find((c) => c.category === line.category)
      return {
        ...line,
        accountNumber: line.accountNumber || categoryMatch?.accountNumber || '6900',
      }
    })

    const total = enrichedLines.reduce((sum, line) => sum + line.amount, 0)
    const expenseNumber = await getNextExpenseNumber(db)
    const now = new Date()

    // Get creator details
    const creator = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    const creatorData = creator as any

    const doc: ExpenseDoc = {
      _id: new ObjectId(),
      expenseNumber,
      date: new Date(date),
      vendorId: parsedVendorId,
      vendorName: vendorName || undefined,
      payee: payee || undefined,
      description,
      lines: enrichedLines,
      total: Math.round(total * 100) / 100,
      paymentMethod: paymentMethod || undefined,
      referenceNumber: referenceNumber || undefined,
      status: 'draft',
      notes: notes || undefined,
      createdBy: auth.userId,
      createdByEmail: creatorData?.email,
      createdByName: creatorData?.name,
      createdAt: now,
      updatedAt: now,
    }

    await db.collection('crm_expenses').insertOne(doc as any)

    res.status(201).json({
      data: serializeExpense(doc),
      error: null,
    })
  } catch (err: any) {
    console.error('[expenses] POST error:', err)
    res.status(500).json({ data: null, error: err.message || 'create_expense_failed' })
  }
})

// PATCH /api/crm/expenses/:id - Update expense
expensesRouter.patch('/:id', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  let id: ObjectId
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const expense = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  // Can only edit draft or rejected expenses
  if (!['draft', 'rejected'].includes(expense.status)) {
    return res.status(400).json({ data: null, error: 'cannot_edit_submitted_expense' })
  }

  const parsed = updateExpenseSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() })
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() }

  if (parsed.data.date) updates.date = new Date(parsed.data.date)
  if (parsed.data.vendorId !== undefined) {
    updates.vendorId = parsed.data.vendorId ? new ObjectId(parsed.data.vendorId) : null
  }
  if (parsed.data.vendorName !== undefined) updates.vendorName = parsed.data.vendorName || null
  if (parsed.data.payee !== undefined) updates.payee = parsed.data.payee || null
  if (parsed.data.description) updates.description = parsed.data.description
  if (parsed.data.paymentMethod !== undefined) updates.paymentMethod = parsed.data.paymentMethod || null
  if (parsed.data.referenceNumber !== undefined) updates.referenceNumber = parsed.data.referenceNumber || null
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes || null

  if (parsed.data.lines) {
    const enrichedLines: ExpenseLine[] = parsed.data.lines.map((line) => {
      const categoryMatch = EXPENSE_CATEGORIES.find((c) => c.category === line.category)
      return {
        ...line,
        accountNumber: line.accountNumber || categoryMatch?.accountNumber || '6900',
      }
    })
    updates.lines = enrichedLines
    updates.total = Math.round(enrichedLines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100
  }

  // If editing a rejected expense, reset to draft
  if (expense.status === 'rejected') {
    updates.status = 'draft'
    updates.rejectedBy = null
    updates.rejectedAt = null
    updates.rejectionReason = null
  }

  await db.collection('crm_expenses').updateOne({ _id: id }, { $set: updates })

  const updated = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  res.json({ data: updated ? serializeExpense(updated) : null, error: null })
})

// POST /api/crm/expenses/:id/submit - Submit for approval
expensesRouter.post('/:id/submit', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth
  const approverUserId = String(req.body.approverUserId || '').trim()

  if (!approverUserId) {
    return res.status(400).json({ data: null, error: 'approver_required' })
  }

  let id: ObjectId
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const expense = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  if (expense.status !== 'draft') {
    return res.status(400).json({ data: null, error: 'can_only_submit_draft' })
  }

  // Get submitter details
  const submitter = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
  const submitterData = submitter as any

  // Validate and get approver details
  let approver: any
  try {
    approver = await db.collection('users').findOne({ _id: new ObjectId(approverUserId) })
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_approver_id' })
  }
  
  if (!approver) {
    return res.status(400).json({ data: null, error: 'approver_not_found' })
  }

  // Verify approver is a manager or admin
  const managerRole = await db.collection('roles').findOne({ name: 'manager' })
  const hasManagerRole = managerRole && await db.collection('user_roles').findOne({
    userId: approverUserId,
    roleId: managerRole._id,
  })
  const isApproverAdmin = approver.isAdmin === true

  if (!hasManagerRole && !isApproverAdmin) {
    return res.status(400).json({ data: null, error: 'approver_not_authorized' })
  }

  const now = new Date()
  
  // Create approval history entry
  const historyEntry: ApprovalHistoryEntry = {
    action: 'submitted',
    userId: auth.userId,
    userEmail: submitterData?.email,
    userName: submitterData?.name,
    timestamp: now,
    approverUserId,
  }

  await db.collection('crm_expenses').updateOne(
    { _id: id },
    {
      $set: {
        status: 'pending_approval',
        submittedBy: auth.userId,
        submittedByEmail: submitterData?.email,
        submittedByName: submitterData?.name,
        submittedAt: now,
        approverUserId,
        approverEmail: approver.email,
        approverName: approver.name,
        updatedAt: now,
      },
      $push: {
        approvalHistory: historyEntry,
      } as any,
    }
  )

  const updated = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  res.json({ data: updated ? serializeExpense(updated) : null, error: null })
})

// POST /api/crm/expenses/:id/approve - Approve expense (requires manager/admin)
expensesRouter.post('/:id/approve', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth
  const reviewNotes = String(req.body.reviewNotes || '').trim()

  let id: ObjectId
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const expense = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  if (expense.status !== 'pending_approval') {
    return res.status(400).json({ data: null, error: 'can_only_approve_pending' })
  }

  // Get approver details
  const approver = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
  const approverData = approver as any

  const now = new Date()

  // Create approval history entry
  const historyEntry: ApprovalHistoryEntry = {
    action: 'approved',
    userId: auth.userId,
    userEmail: approverData?.email,
    userName: approverData?.name,
    timestamp: now,
    notes: reviewNotes || undefined,
  }

  await db.collection('crm_expenses').updateOne(
    { _id: id },
    {
      $set: {
        status: 'approved',
        approvedBy: auth.userId,
        approvedByEmail: approverData?.email,
        approvedByName: approverData?.name,
        approvedAt: now,
        updatedAt: now,
      },
      $push: {
        approvalHistory: historyEntry,
      } as any,
    }
  )

  const updated = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  res.json({ data: updated ? serializeExpense(updated) : null, error: null })
})

// POST /api/crm/expenses/:id/reject - Reject expense (requires manager/admin)
expensesRouter.post('/:id/reject', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth
  const reason = String(req.body.reason || '').trim()

  let id: ObjectId
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const expense = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  if (expense.status !== 'pending_approval') {
    return res.status(400).json({ data: null, error: 'can_only_reject_pending' })
  }

  // Get rejecter details
  const rejecter = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
  const rejecterData = rejecter as any

  const now = new Date()

  // Create approval history entry
  const historyEntry: ApprovalHistoryEntry = {
    action: 'rejected',
    userId: auth.userId,
    userEmail: rejecterData?.email,
    userName: rejecterData?.name,
    timestamp: now,
    notes: reason || undefined,
  }

  await db.collection('crm_expenses').updateOne(
    { _id: id },
    {
      $set: {
        status: 'rejected',
        rejectedBy: auth.userId,
        rejectedByEmail: rejecterData?.email,
        rejectedByName: rejecterData?.name,
        rejectedAt: now,
        rejectionReason: reason || null,
        updatedAt: now,
      },
      $push: {
        approvalHistory: historyEntry,
      } as any,
    }
  )

  const updated = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  res.json({ data: updated ? serializeExpense(updated) : null, error: null })
})

// POST /api/crm/expenses/:id/pay - Mark as paid and create journal entry
expensesRouter.post('/:id/pay', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth
  let id: ObjectId
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const expense = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  if (expense.status !== 'approved') {
    return res.status(400).json({ data: null, error: 'can_only_pay_approved' })
  }

  // Create journal entry in Financial Intelligence
  // DR: Expense accounts, CR: Cash
  const entryDate = expense.date || new Date()
  const now = new Date()

  // Find open period
  const period = await db.collection('fi_periods').findOne({
    startDate: { $lte: entryDate },
    endDate: { $gte: entryDate },
    status: 'open',
  })

  let journalEntryId: string | null = null

  if (period) {
    // Get next journal entry number
    const jeSeq = await db.collection('fi_sequences').findOneAndUpdate(
      { _id: 'fi_journal_entries' } as any,
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: 'after' }
    )
    const entryNumber = (jeSeq as any)?.value || 10001

    // Build journal entry lines
    const jeLines: any[] = []

    // Debit expense accounts
    for (const line of expense.lines) {
      const account = await db.collection('fi_chart_of_accounts').findOne({
        accountNumber: line.accountNumber,
        isActive: true,
      })
      if (account) {
        jeLines.push({
          accountId: account._id,
          accountNumber: account.accountNumber,
          accountName: account.name,
          debit: line.amount,
          credit: 0,
          description: line.description || line.category,
          projectId: line.projectId,
        })
      }
    }

    // Credit cash account
    const cashAccount = await db.collection('fi_chart_of_accounts').findOne({
      accountNumber: '1010', // Checking Account
      isActive: true,
    })
    if (cashAccount) {
      jeLines.push({
        accountId: cashAccount._id,
        accountNumber: cashAccount.accountNumber,
        accountName: cashAccount.name,
        debit: 0,
        credit: expense.total,
        description: `Payment for expense #${expense.expenseNumber}`,
      })
    }

    if (jeLines.length > 1) {
      const journalEntry = {
        _id: new ObjectId(),
        entryNumber,
        date: entryDate,
        postingDate: now,
        periodId: period._id,
        description: `Expense #${expense.expenseNumber} - ${expense.description}`,
        sourceType: 'expense',
        sourceId: String(expense._id),
        lines: jeLines,
        status: 'posted',
        reversedEntryId: null,
        reversalOfEntryId: null,
        attachments: [],
        approvedBy: null,
        approvedAt: null,
        createdAt: now,
        createdBy: auth.userId,
        updatedAt: now,
        updatedBy: auth.userId,
        audit: [{
          action: 'auto_posted',
          userId: auth.userId,
          userEmail: auth.email || 'system@boazos.com',
          timestamp: now,
          changes: { expenseId: String(expense._id), expenseNumber: expense.expenseNumber },
        }],
      }

      await db.collection('fi_journal_entries').insertOne(journalEntry as any)
      journalEntryId = String(journalEntry._id)
    }
  }

  // Update expense as paid
  await db.collection('crm_expenses').updateOne(
    { _id: id },
    {
      $set: {
        status: 'paid',
        paidBy: auth.userId,
        paidAt: now,
        journalEntryId,
        updatedAt: now,
      },
    }
  )

  const updated = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  res.json({
    data: updated ? serializeExpense(updated) : null,
    journalEntryId,
    error: null,
  })
})

// POST /api/crm/expenses/:id/void - Void expense
expensesRouter.post('/:id/void', requirePermission('*'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth
  const reason = String(req.body.reason || '').trim()

  let id: ObjectId
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const expense = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  // Can't void paid expenses (would need to reverse journal entry)
  if (expense.status === 'paid') {
    return res.status(400).json({ data: null, error: 'cannot_void_paid_expense' })
  }

  const now = new Date()
  await db.collection('crm_expenses').updateOne(
    { _id: id },
    {
      $set: {
        status: 'void',
        voidedBy: auth.userId,
        voidedAt: now,
        voidReason: reason || null,
        updatedAt: now,
      },
    }
  )

  const updated = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  res.json({ data: updated ? serializeExpense(updated) : null, error: null })
})

// DELETE /api/crm/expenses/:id - Delete draft expense
expensesRouter.delete('/:id', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  let id: ObjectId
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const expense = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  // Can only delete draft expenses
  if (expense.status !== 'draft') {
    return res.status(400).json({ data: null, error: 'can_only_delete_draft' })
  }

  await db.collection('crm_expenses').deleteOne({ _id: id })
  res.json({ data: { deleted: true }, error: null })
})

// ============================================================================
// EXPENSE ATTACHMENTS (Receipts and Documents)
// ============================================================================

// POST /api/crm/expenses/:id/attachments - Upload attachment to expense
expensesRouter.post('/:id/attachments', uploadExpenseAttachment.single('file'), async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth
  if (!auth?.userId) {
    return res.status(401).json({ data: null, error: 'unauthorized' })
  }

  let id: ObjectId
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const expense = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  // Check if user can upload (owner or admin)
  const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
  const isAdmin = (user as any)?.isAdmin === true
  const isOwner = expense.createdBy === auth.userId || expense.submittedBy === auth.userId

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ data: null, error: 'not_authorized' })
  }

  const file = req.file
  if (!file) {
    return res.status(400).json({ data: null, error: 'no_file_provided' })
  }

  try {
    const now = new Date()
    const attachment: AttachmentDoc = {
      id: new ObjectId().toHexString(),
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      uploadedByUserId: auth.userId,
      uploadedByEmail: auth.email,
      uploadedAt: now,
      url: `/api/crm/expenses/attachments/${file.filename}`,
    }

    await db.collection('crm_expenses').updateOne(
      { _id: id },
      {
        $push: { attachments: attachment } as any,
        $set: { updatedAt: now },
      }
    )

    res.json({
      data: {
        attachment: {
          ...attachment,
          uploadedAt: attachment.uploadedAt.toISOString(),
        },
      },
      error: null,
    })
  } catch (err: any) {
    console.error('[expenses] Attachment upload error:', err)
    // Try to clean up uploaded file
    try {
      if (file.path) fs.unlinkSync(file.path)
    } catch {}
    res.status(500).json({ data: null, error: err.message || 'upload_failed' })
  }
})

// GET /api/crm/expenses/:id/attachments - List attachments for expense
expensesRouter.get('/:id/attachments', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  let id: ObjectId
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const expense = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  const attachments = (expense.attachments || []).map((a) => ({
    ...a,
    uploadedAt: a.uploadedAt instanceof Date ? a.uploadedAt.toISOString() : a.uploadedAt,
  }))

  res.json({ data: { attachments }, error: null })
})

// DELETE /api/crm/expenses/:id/attachments/:attachmentId - Delete attachment
expensesRouter.delete('/:id/attachments/:attachmentId', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth
  if (!auth?.userId) {
    return res.status(401).json({ data: null, error: 'unauthorized' })
  }

  let id: ObjectId
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const attachmentId = req.params.attachmentId

  const expense = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  // Check if user can delete (owner, uploader, or admin)
  const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
  const isAdmin = (user as any)?.isAdmin === true
  const isOwner = expense.createdBy === auth.userId
  const attachment = expense.attachments?.find((a) => a.id === attachmentId)

  if (!attachment) {
    return res.status(404).json({ data: null, error: 'attachment_not_found' })
  }

  const isUploader = attachment.uploadedByUserId === auth.userId

  if (!isAdmin && !isOwner && !isUploader) {
    return res.status(403).json({ data: null, error: 'not_authorized' })
  }

  // For paid expenses, only admin can delete attachments
  if (expense.status === 'paid' && !isAdmin) {
    return res.status(403).json({ data: null, error: 'cannot_modify_paid_expense' })
  }

  // Try to delete the physical file
  try {
    const filename = attachment.url.split('/').pop()
    if (filename) {
      const filePath = path.resolve(uploadDir, filename)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    }
  } catch (err) {
    console.error('[expenses] Failed to delete attachment file:', err)
    // Continue anyway - we'll remove from DB
  }

  const now = new Date()
  await db.collection('crm_expenses').updateOne(
    { _id: id },
    {
      $pull: { attachments: { id: attachmentId } } as any,
      $set: { updatedAt: now },
    }
  )

  res.json({ data: { deleted: true }, error: null })
})
