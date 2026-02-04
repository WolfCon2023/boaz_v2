/**
 * CRM Expenses Module
 * 
 * Manages business expenses with multi-level approval workflow and automatic posting
 * to Financial Intelligence when expenses are paid.
 * 
 * Approval Workflow:
 *   Draft -> Pending Manager Approval -> Pending Senior Manager Approval -> 
 *   Pending Finance Approval -> Approved -> Paid
 * 
 * Approval Levels:
 *   Level 1: Manager (first approver)
 *   Level 2: Senior Manager (second approver)
 *   Level 3: Finance Manager (final approver)
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

// Approval level constants
const APPROVAL_LEVELS = {
  MANAGER: 1,
  SENIOR_MANAGER: 2,
  FINANCE_MANAGER: 3,
} as const

// Map role names to approval levels
const ROLE_TO_APPROVAL_LEVEL: Record<string, number> = {
  'manager': APPROVAL_LEVELS.MANAGER,
  'senior_manager': APPROVAL_LEVELS.SENIOR_MANAGER,
  'finance_manager': APPROVAL_LEVELS.FINANCE_MANAGER,
}

// Status values for multi-level approval workflow
type ExpenseStatus = 
  | 'draft' 
  | 'pending_manager_approval'      // Level 1: Awaiting manager approval
  | 'pending_senior_approval'       // Level 2: Awaiting senior manager approval
  | 'pending_finance_approval'      // Level 3: Awaiting finance manager approval
  | 'pending_approval'              // Legacy: kept for backward compatibility
  | 'approved'                      // Fully approved by all levels
  | 'rejected' 
  | 'paid' 
  | 'void'

type ExpenseLine = {
  category: string
  accountNumber?: string // Maps to Chart of Accounts
  amount: number
  description?: string
  projectId?: string
}

// Approval history entry for audit trail
type ApprovalHistoryEntry = {
  action: 'submitted' | 'approved' | 'rejected' | 'withdrawn' | 'resubmitted' | 'level_approved' | 'edited' | 'attachment_added' | 'attachment_removed' | 'created' | 'paid' | 'voided'
  userId: string
  userEmail?: string
  userName?: string
  timestamp: Date
  notes?: string
  approverUserId?: string
  approvalLevel?: number  // 1=manager, 2=senior_manager, 3=finance_manager
  roleName?: string       // Role name of approver
  changedFields?: string[] // Fields that were changed (for edits)
  previousStatus?: string  // Status before the change
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
  
  // Current approval level tracking
  currentApprovalLevel?: number // 1=manager, 2=senior_manager, 3=finance_manager
  
  // Submission info
  submittedBy?: string
  submittedByEmail?: string
  submittedByName?: string
  submittedAt?: Date
  
  // Level 1: Manager approval
  managerApproverUserId?: string
  managerApproverEmail?: string
  managerApproverName?: string
  managerApprovedBy?: string
  managerApprovedByEmail?: string
  managerApprovedByName?: string
  managerApprovedAt?: Date
  
  // Level 2: Senior Manager approval
  seniorManagerApproverUserId?: string
  seniorManagerApproverEmail?: string
  seniorManagerApproverName?: string
  seniorManagerApprovedBy?: string
  seniorManagerApprovedByEmail?: string
  seniorManagerApprovedByName?: string
  seniorManagerApprovedAt?: Date
  
  // Level 3: Finance Manager approval (final)
  financeManagerApproverUserId?: string
  financeManagerApproverEmail?: string
  financeManagerApproverName?: string
  financeManagerApprovedBy?: string
  financeManagerApprovedByEmail?: string
  financeManagerApprovedByName?: string
  financeManagerApprovedAt?: Date
  
  // Legacy fields (kept for backward compatibility)
  approverUserId?: string // Selected manager to approve (legacy)
  approverEmail?: string
  approverName?: string
  approvedBy?: string
  approvedByEmail?: string
  approvedByName?: string
  approvedAt?: Date // Final approval timestamp
  
  // Rejection info
  rejectedBy?: string
  rejectedByEmail?: string
  rejectedByName?: string
  rejectedAt?: Date
  rejectionReason?: string
  rejectedAtLevel?: number // Which approval level rejected
  
  // Payment info
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
    currentApprovalLevel: doc.currentApprovalLevel,
    
    // Submission info
    submittedBy: doc.submittedBy,
    submittedByEmail: doc.submittedByEmail,
    submittedByName: doc.submittedByName,
    submittedAt: doc.submittedAt?.toISOString(),
    
    // Level 1: Manager approval
    managerApproverUserId: doc.managerApproverUserId,
    managerApproverEmail: doc.managerApproverEmail,
    managerApproverName: doc.managerApproverName,
    managerApprovedBy: doc.managerApprovedBy,
    managerApprovedByEmail: doc.managerApprovedByEmail,
    managerApprovedByName: doc.managerApprovedByName,
    managerApprovedAt: doc.managerApprovedAt?.toISOString(),
    
    // Level 2: Senior Manager approval
    seniorManagerApproverUserId: doc.seniorManagerApproverUserId,
    seniorManagerApproverEmail: doc.seniorManagerApproverEmail,
    seniorManagerApproverName: doc.seniorManagerApproverName,
    seniorManagerApprovedBy: doc.seniorManagerApprovedBy,
    seniorManagerApprovedByEmail: doc.seniorManagerApprovedByEmail,
    seniorManagerApprovedByName: doc.seniorManagerApprovedByName,
    seniorManagerApprovedAt: doc.seniorManagerApprovedAt?.toISOString(),
    
    // Level 3: Finance Manager approval (final)
    financeManagerApproverUserId: doc.financeManagerApproverUserId,
    financeManagerApproverEmail: doc.financeManagerApproverEmail,
    financeManagerApproverName: doc.financeManagerApproverName,
    financeManagerApprovedBy: doc.financeManagerApprovedBy,
    financeManagerApprovedByEmail: doc.financeManagerApprovedByEmail,
    financeManagerApprovedByName: doc.financeManagerApprovedByName,
    financeManagerApprovedAt: doc.financeManagerApprovedAt?.toISOString(),
    
    // Legacy fields (for backward compatibility)
    approverUserId: doc.approverUserId,
    approverEmail: doc.approverEmail,
    approverName: doc.approverName,
    approvedBy: doc.approvedBy,
    approvedByEmail: doc.approvedByEmail,
    approvedByName: doc.approvedByName,
    approvedAt: doc.approvedAt?.toISOString(),
    
    // Rejection info
    rejectedBy: doc.rejectedBy,
    rejectedByEmail: doc.rejectedByEmail,
    rejectedByName: doc.rejectedByName,
    rejectedAt: doc.rejectedAt?.toISOString(),
    rejectionReason: doc.rejectionReason,
    rejectedAtLevel: doc.rejectedAtLevel,
    
    // Payment info
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

  // Get current user ID and roles for visibility filtering
  // Note: requireAuth middleware sets req.auth.userId, not req.user.id
  const userId = req.auth?.userId
  
  // Determine user roles and admin status
  let userRoleNames: string[] = []
  let hasAdminPermission = false
  
  if (userId) {
    // Fetch user document to check isAdmin flag
    let userIsAdmin = false
    try {
      const user = await db.collection('users').findOne({ _id: new ObjectId(userId) })
      userIsAdmin = (user as any)?.isAdmin === true
    } catch {
      // Invalid userId format
    }
    
    const [userRoles, allRoles] = await Promise.all([
      db.collection('user_roles').find({ userId }).toArray(),
      db.collection('roles').find({}).toArray(),
    ])
    const roleIdToName = new Map(allRoles.map((r: any) => [r._id.toString(), r.name]))
    const roleIdToPermissions = new Map(allRoles.map((r: any) => [r._id.toString(), r.permissions || []]))
    
    for (const ur of userRoles) {
      const roleName = roleIdToName.get(ur.roleId.toString())
      if (roleName) userRoleNames.push(roleName)
      
      // Check if this role has admin permissions
      const perms = roleIdToPermissions.get(ur.roleId.toString()) || []
      if (perms.includes('*')) hasAdminPermission = true
    }
    
    // Also consider isAdmin flag from user document
    if (userIsAdmin) hasAdminPermission = true
  }

  const isFinanceManager = userRoleNames.includes('finance_manager')
  const isSeniorManager = userRoleNames.includes('senior_manager')
  const isManager = userRoleNames.includes('manager')
  
  // Log for debugging (can be removed later)
  console.log('[Expenses] User visibility check:', { 
    userId, 
    hasAdminPermission, 
    userRoleNames, 
    isFinanceManager, 
    isSeniorManager, 
    isManager 
  })

  // Build visibility filter based on role
  // Finance Managers, Admins, and users with admin permissions can see all expenses
  // Managers/Senior Managers can see: own expenses + expenses they approve + expenses from direct reports + legacy expenses (no createdBy)
  // Staff (everyone else) can only see their own expenses
  const filter: Record<string, unknown> = {}

  // Admins, Finance Managers, and users with admin permissions see all expenses
  const canSeeAll = hasAdminPermission || isFinanceManager
  
  if (!canSeeAll && userId) {
    if (isManager || isSeniorManager) {
      // Get users who report to this manager
      const directReports = await db.collection('users')
        .find({ reportsTo: userId })
        .project({ _id: 1 })
        .toArray()
      const directReportIds = directReports.map((u: any) => u._id.toString())

      // Manager/Senior Manager visibility: own expenses, expenses they approve, direct reports' expenses, legacy expenses
      const orConditions: any[] = [
        { createdBy: userId }, // Their own expenses
        { createdBy: { $exists: false } }, // Legacy expenses without createdBy
        { createdBy: null }, // Legacy expenses with null createdBy
        { createdBy: '' }, // Legacy expenses with empty createdBy
        { managerApproverId: userId }, // Expenses where they are manager approver
        { seniorManagerApproverId: userId }, // Expenses where they are senior manager approver
        { submittedBy: userId }, // Expenses submitted by them (legacy field)
      ]
      
      if (directReportIds.length > 0) {
        orConditions.push({ createdBy: { $in: directReportIds } }) // Direct reports' expenses
      }

      filter.$or = orConditions
    } else if (userId) {
      // Staff: only their own expenses OR legacy expenses they submitted
      // Also include legacy expenses without createdBy field for backwards compatibility
      filter.$or = [
        { createdBy: userId },
        { submittedBy: userId }, // Legacy field
        { createdBy: { $exists: false } }, // Legacy expenses
        { createdBy: null },
        { createdBy: '' },
      ]
    }
  }
  // If canSeeAll is true OR userId is not set, no visibility filter is applied (see all expenses)
  
  if (q) {
    const searchOr = [
      { description: { $regex: q, $options: 'i' } },
      { vendorName: { $regex: q, $options: 'i' } },
      { payee: { $regex: q, $options: 'i' } },
      { referenceNumber: { $regex: q, $options: 'i' } },
    ]
    // Also search by expense number if numeric
    const num = parseInt(q, 10)
    if (!isNaN(num)) {
      searchOr.push({ expenseNumber: num } as any)
    }
    
    // Combine with existing filter using $and
    if (filter.$or) {
      // We have both visibility and search filters
      const visibilityCondition = { $or: filter.$or }
      delete filter.$or
      filter.$and = [visibilityCondition, { $or: searchOr }]
    } else {
      filter.$or = searchOr
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

// GET /api/crm/expenses/approvers - Get eligible expense approvers by level
// Returns users grouped by approval level: managers, senior_managers, finance_managers
expensesRouter.get('/approvers', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { managers: [], seniorManagers: [], financeManagers: [], approvers: [] }, error: null })

  try {
    // Find all approval roles
    const [managerRole, seniorManagerRole, financeManagerRole] = await Promise.all([
      db.collection('roles').findOne({ name: 'manager' }),
      db.collection('roles').findOne({ name: 'senior_manager' }),
      db.collection('roles').findOne({ name: 'finance_manager' }),
    ])

    // Get user IDs for each role
    const roleIds = [managerRole?._id, seniorManagerRole?._id, financeManagerRole?._id].filter(Boolean)
    const allUserRoles = await db.collection('user_roles')
      .find({ roleId: { $in: roleIds } })
      .toArray()

    // Group user IDs by role
    const managerUserIds = new Set<string>()
    const seniorManagerUserIds = new Set<string>()
    const financeManagerUserIds = new Set<string>()

    for (const ur of allUserRoles) {
      const roleIdStr = ur.roleId.toString()
      if (managerRole && roleIdStr === managerRole._id.toString()) {
        managerUserIds.add(ur.userId)
      }
      if (seniorManagerRole && roleIdStr === seniorManagerRole._id.toString()) {
        seniorManagerUserIds.add(ur.userId)
      }
      if (financeManagerRole && roleIdStr === financeManagerRole._id.toString()) {
        financeManagerUserIds.add(ur.userId)
      }
    }

    // Get all unique user IDs
    const allUserIds = new Set([...managerUserIds, ...seniorManagerUserIds, ...financeManagerUserIds])
    
    // Get user details
    const userObjectIds = [...allUserIds].map((id: string) => {
      try { return new ObjectId(id) } catch { return null }
    }).filter(Boolean) as ObjectId[]

    // Also get admins (they can approve at any level)
    const users = await db.collection('users')
      .find({
        $or: [
          { _id: { $in: userObjectIds } },
          { isAdmin: true },
        ],
      })
      .project({ _id: 1, name: 1, email: 1, isAdmin: 1 })
      .toArray()

    // Build user map for quick lookup
    const userMap = new Map(users.map((u: any) => [u._id.toHexString(), u]))

    // Format approver response
    const formatApprover = (u: any) => ({
      id: u._id.toHexString(),
      name: u.name || u.email,
      email: u.email,
    })

    // Build lists by level (admins appear in all levels)
    const admins = users.filter((u: any) => u.isAdmin)
    
    const managers = [
      ...Array.from(managerUserIds).map(id => userMap.get(id)).filter(Boolean),
      ...admins.filter((a: any) => !managerUserIds.has(a._id.toHexString())),
    ].map(formatApprover)

    const seniorManagers = [
      ...Array.from(seniorManagerUserIds).map(id => userMap.get(id)).filter(Boolean),
      ...admins.filter((a: any) => !seniorManagerUserIds.has(a._id.toHexString())),
    ].map(formatApprover)

    const financeManagers = [
      ...Array.from(financeManagerUserIds).map(id => userMap.get(id)).filter(Boolean),
      ...admins.filter((a: any) => !financeManagerUserIds.has(a._id.toHexString())),
    ].map(formatApprover)

    // Legacy: flat list of all approvers (for backward compatibility)
    const approvers = users.map(formatApprover)

    res.json({ 
      data: { 
        managers,
        seniorManagers,
        financeManagers,
        approvers, // Legacy flat list
      }, 
      error: null 
    })
  } catch (err: any) {
    console.error('[expenses] GET /approvers error:', err)
    res.json({ data: { managers: [], seniorManagers: [], financeManagers: [], approvers: [] }, error: null })
  }
})

// GET /api/crm/expenses/approval-queue - Get expenses awaiting approval for current user
// Supports multi-level approval: manager -> senior_manager -> finance_manager
expensesRouter.get('/approval-queue', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth
  if (!auth?.userId) {
    return res.status(401).json({ data: null, error: 'unauthorized' })
  }

  // Get user and their roles
  const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
  if (!user) {
    return res.status(404).json({ data: null, error: 'user_not_found' })
  }

  const isAdmin = (user as any).isAdmin === true

  // Get all approval roles
  const [managerRole, seniorManagerRole, financeManagerRole] = await Promise.all([
    db.collection('roles').findOne({ name: 'manager' }),
    db.collection('roles').findOne({ name: 'senior_manager' }),
    db.collection('roles').findOne({ name: 'finance_manager' }),
  ])

  // Check which roles the user has
  const userRoleAssignments = await db.collection('user_roles')
    .find({ userId: auth.userId })
    .toArray()
  
  const userRoleIds = new Set(userRoleAssignments.map((ur: any) => ur.roleId.toString()))

  const hasManagerRole = managerRole && userRoleIds.has(managerRole._id.toString())
  const hasSeniorManagerRole = seniorManagerRole && userRoleIds.has(seniorManagerRole._id.toString())
  const hasFinanceManagerRole = financeManagerRole && userRoleIds.has(financeManagerRole._id.toString())

  // Must have at least one approval role or be admin
  if (!isAdmin && !hasManagerRole && !hasSeniorManagerRole && !hasFinanceManagerRole) {
    return res.status(403).json({ data: null, error: 'approval_role_required' })
  }

  const statusFilter = req.query.status as string | undefined

  // Build filter for approval queue based on user's role level
  // Each role level sees expenses at their approval stage that are assigned to them
  const filter: Record<string, unknown> = {}
  
  const allPendingStatuses = ['pending_manager_approval', 'pending_senior_approval', 'pending_finance_approval', 'pending_approval']
  const allStatuses = [...allPendingStatuses, 'approved', 'rejected']

  if (isAdmin) {
    // Admins see all expenses awaiting approval at any level
    if (statusFilter === 'all') {
      filter.status = { $in: allStatuses }
    } else if (statusFilter) {
      filter.status = statusFilter
    } else {
      filter.status = { $in: allPendingStatuses }
    }
  } else {
    // Build OR conditions for each role the user has
    const orConditions: any[] = []

    if (hasManagerRole) {
      // Manager sees Level 1 approvals assigned to them
      orConditions.push({
        status: 'pending_manager_approval',
        managerApproverUserId: auth.userId,
      })
      // Also check legacy field for backward compatibility
      orConditions.push({
        status: 'pending_approval',
        approverUserId: auth.userId,
      })
    }

    if (hasSeniorManagerRole) {
      // Senior Manager sees Level 2 approvals assigned to them
      orConditions.push({
        status: 'pending_senior_approval',
        seniorManagerApproverUserId: auth.userId,
      })
    }

    if (hasFinanceManagerRole) {
      // Finance Manager sees Level 3 approvals assigned to them
      orConditions.push({
        status: 'pending_finance_approval',
        financeManagerApproverUserId: auth.userId,
      })
    }

    if (orConditions.length === 0) {
      // No matching conditions - return empty
      return res.json({ data: { items: [], userRoles: [] }, error: null })
    }

    // If status filter is "all", also include approved/rejected that were assigned to this user
    if (statusFilter === 'all') {
      // Add approved/rejected expenses that this user was an approver for
      orConditions.push({
        status: { $in: ['approved', 'rejected'] },
        $or: [
          { managerApprovedBy: auth.userId },
          { seniorManagerApprovedBy: auth.userId },
          { financeManagerApprovedBy: auth.userId },
          { approvedBy: auth.userId },
          { rejectedBy: auth.userId },
        ],
      })
    }

    filter.$or = orConditions
  }

  const items = await db.collection<ExpenseDoc>('crm_expenses')
    .find(filter)
    .sort({ submittedAt: -1 })
    .limit(200)
    .toArray()

  // Return user's role info for frontend display
  const userRoles = []
  if (hasManagerRole) userRoles.push('manager')
  if (hasSeniorManagerRole) userRoles.push('senior_manager')
  if (hasFinanceManagerRole) userRoles.push('finance_manager')
  if (isAdmin) userRoles.push('admin')

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
        currentApprovalLevel: doc.currentApprovalLevel,
        vendorName: doc.vendorName,
        payee: doc.payee,
        
        // Submitter info
        requesterId: doc.submittedBy,
        requesterEmail: doc.submittedByEmail,
        requesterName: doc.submittedByName,
        requestedAt: doc.submittedAt?.toISOString(),
        
        // Level 1: Manager approver
        managerApproverUserId: doc.managerApproverUserId,
        managerApproverEmail: doc.managerApproverEmail,
        managerApproverName: doc.managerApproverName,
        managerApprovedAt: doc.managerApprovedAt?.toISOString(),
        
        // Level 2: Senior Manager approver
        seniorManagerApproverUserId: doc.seniorManagerApproverUserId,
        seniorManagerApproverEmail: doc.seniorManagerApproverEmail,
        seniorManagerApproverName: doc.seniorManagerApproverName,
        seniorManagerApprovedAt: doc.seniorManagerApprovedAt?.toISOString(),
        
        // Level 3: Finance Manager approver
        financeManagerApproverUserId: doc.financeManagerApproverUserId,
        financeManagerApproverEmail: doc.financeManagerApproverEmail,
        financeManagerApproverName: doc.financeManagerApproverName,
        financeManagerApprovedAt: doc.financeManagerApprovedAt?.toISOString(),
        
        // Legacy fields
        approverUserId: doc.approverUserId,
        approverEmail: doc.approverEmail,
        approverName: doc.approverName,
        
        // Final status
        reviewedAt: doc.approvedAt?.toISOString() || doc.rejectedAt?.toISOString(),
        reviewedBy: doc.approvedBy || doc.rejectedBy,
        reviewNotes: doc.rejectionReason,
        rejectedAtLevel: doc.rejectedAtLevel,
        
        lines: doc.lines,
        approvalHistory: doc.approvalHistory?.map((h) => ({
          ...h,
          timestamp: h.timestamp instanceof Date ? h.timestamp.toISOString() : h.timestamp,
        })),
      })),
      userRoles,
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
  try {
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

    // Log for debugging
    console.log('[expenses] Serving attachment:', { filename, filePath, uploadDir, exists: fs.existsSync(filePath) })

    if (!fs.existsSync(filePath)) {
      // File not found - likely due to ephemeral storage on cloud platforms
      return res.status(404).json({ 
        data: null, 
        error: 'file_not_found',
        message: 'Attachment file not found. Files may be lost after server restart on cloud platforms with ephemeral storage.'
      })
    }

    res.sendFile(filePath)
  } catch (err: any) {
    console.error('[expenses] Error serving attachment:', err)
    res.status(500).json({ data: null, error: err.message || 'Failed to serve attachment' })
  }
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

    // Create initial history entry for audit trail
    const createdHistoryEntry: ApprovalHistoryEntry = {
      action: 'created',
      userId: auth.userId,
      userEmail: creatorData?.email,
      userName: creatorData?.name,
      timestamp: now,
      notes: `Created expense #${expenseNumber} for $${(Math.round(total * 100) / 100).toFixed(2)}`,
    }

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
      approvalHistory: [createdHistoryEntry],
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
// Only draft or rejected expenses can be edited - changes are tracked in audit history
expensesRouter.patch('/:id', async (req: any, res) => {
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

  // Can only edit draft or rejected expenses
  if (!['draft', 'rejected'].includes(expense.status)) {
    return res.status(400).json({ data: null, error: 'cannot_edit_submitted_expense' })
  }

  const parsed = updateExpenseSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() })
  }

  const now = new Date()
  const updates: Record<string, unknown> = { updatedAt: now }
  const changedFields: string[] = []

  // Track what fields are changing for audit history
  if (parsed.data.date) {
    const newDate = new Date(parsed.data.date)
    if (expense.date?.toISOString() !== newDate.toISOString()) {
      updates.date = newDate
      changedFields.push('date')
    }
  }
  if (parsed.data.vendorId !== undefined) {
    const newVendorId = parsed.data.vendorId ? new ObjectId(parsed.data.vendorId) : null
    if (expense.vendorId?.toString() !== newVendorId?.toString()) {
      updates.vendorId = newVendorId
      changedFields.push('vendorId')
    }
  }
  if (parsed.data.vendorName !== undefined && expense.vendorName !== (parsed.data.vendorName || null)) {
    updates.vendorName = parsed.data.vendorName || null
    changedFields.push('vendorName')
  }
  if (parsed.data.payee !== undefined && expense.payee !== (parsed.data.payee || null)) {
    updates.payee = parsed.data.payee || null
    changedFields.push('payee')
  }
  if (parsed.data.description && expense.description !== parsed.data.description) {
    updates.description = parsed.data.description
    changedFields.push('description')
  }
  if (parsed.data.paymentMethod !== undefined && expense.paymentMethod !== (parsed.data.paymentMethod || null)) {
    updates.paymentMethod = parsed.data.paymentMethod || null
    changedFields.push('paymentMethod')
  }
  if (parsed.data.referenceNumber !== undefined && expense.referenceNumber !== (parsed.data.referenceNumber || null)) {
    updates.referenceNumber = parsed.data.referenceNumber || null
    changedFields.push('referenceNumber')
  }
  if (parsed.data.notes !== undefined && expense.notes !== (parsed.data.notes || null)) {
    updates.notes = parsed.data.notes || null
    changedFields.push('notes')
  }

  if (parsed.data.lines) {
    const enrichedLines: ExpenseLine[] = parsed.data.lines.map((line) => {
      const categoryMatch = EXPENSE_CATEGORIES.find((c) => c.category === line.category)
      return {
        ...line,
        accountNumber: line.accountNumber || categoryMatch?.accountNumber || '6900',
      }
    })
    updates.lines = enrichedLines
    const newTotal = Math.round(enrichedLines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100
    if (expense.total !== newTotal) {
      updates.total = newTotal
      changedFields.push('total')
    }
    changedFields.push('lines')
  }

  // If editing a rejected expense, optionally reset to draft
  const previousStatus = expense.status
  if (expense.status === 'rejected' && changedFields.length > 0) {
    updates.status = 'draft'
    updates.rejectedBy = null
    updates.rejectedAt = null
    updates.rejectionReason = null
    changedFields.push('status (reset from rejected to draft)')
  }

  // Get editor info
  let editorData: any = null
  if (auth?.userId) {
    try {
      editorData = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    } catch {}
  }

  // Create audit history entry if there were actual changes
  if (changedFields.length > 0) {
    const historyEntry: ApprovalHistoryEntry = {
      action: 'edited',
      userId: auth?.userId || 'unknown',
      userEmail: editorData?.email || auth?.email,
      userName: editorData?.name,
      timestamp: now,
      notes: `Modified fields: ${changedFields.join(', ')}`,
      changedFields,
      previousStatus,
    }

    await db.collection('crm_expenses').updateOne(
      { _id: id },
      {
        $set: updates,
        $push: { approvalHistory: historyEntry } as any,
      }
    )
  } else {
    // No actual changes, just update timestamp
    await db.collection('crm_expenses').updateOne({ _id: id }, { $set: updates })
  }

  const updated = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  res.json({ data: updated ? serializeExpense(updated) : null, error: null })
})

// POST /api/crm/expenses/:id/submit - Submit for multi-level approval
// Requires: managerApproverUserId, seniorManagerApproverUserId, financeManagerApproverUserId
expensesRouter.post('/:id/submit', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth
  
  // Get approvers for all three levels
  const managerApproverUserId = String(req.body.managerApproverUserId || req.body.approverUserId || '').trim()
  const seniorManagerApproverUserId = String(req.body.seniorManagerApproverUserId || '').trim()
  const financeManagerApproverUserId = String(req.body.financeManagerApproverUserId || '').trim()

  // All three approvers are required
  if (!managerApproverUserId) {
    return res.status(400).json({ data: null, error: 'manager_approver_required' })
  }
  if (!seniorManagerApproverUserId) {
    return res.status(400).json({ data: null, error: 'senior_manager_approver_required' })
  }
  if (!financeManagerApproverUserId) {
    return res.status(400).json({ data: null, error: 'finance_manager_approver_required' })
  }

  let id: ObjectId
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const expense = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  if (expense.status !== 'draft' && expense.status !== 'rejected') {
    return res.status(400).json({ data: null, error: 'can_only_submit_draft_or_rejected' })
  }

  // Get submitter details
  const submitter = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
  const submitterData = submitter as any

  // Validate all three approvers exist and have correct roles
  const [managerRole, seniorManagerRole, financeManagerRole] = await Promise.all([
    db.collection('roles').findOne({ name: 'manager' }),
    db.collection('roles').findOne({ name: 'senior_manager' }),
    db.collection('roles').findOne({ name: 'finance_manager' }),
  ])

  // Helper to validate approver
  const validateApprover = async (userId: string, roleName: string, role: any) => {
    let user: any
    try {
      user = await db.collection('users').findOne({ _id: new ObjectId(userId) })
    } catch {
      return { valid: false, error: `invalid_${roleName}_approver_id` }
    }
    if (!user) {
      return { valid: false, error: `${roleName}_approver_not_found` }
    }
    
    // Check if admin (admins can approve at any level)
    if (user.isAdmin === true) {
      return { valid: true, user }
    }
    
    // Check if has the correct role
    if (role) {
      const hasRole = await db.collection('user_roles').findOne({
        userId,
        roleId: role._id,
      })
      if (hasRole) {
        return { valid: true, user }
      }
    }
    
    return { valid: false, error: `${roleName}_approver_not_authorized` }
  }

  // Validate manager approver
  const managerValidation = await validateApprover(managerApproverUserId, 'manager', managerRole)
  if (!managerValidation.valid) {
    return res.status(400).json({ data: null, error: managerValidation.error })
  }
  const managerApprover = managerValidation.user

  // Validate senior manager approver
  const seniorValidation = await validateApprover(seniorManagerApproverUserId, 'senior_manager', seniorManagerRole)
  if (!seniorValidation.valid) {
    return res.status(400).json({ data: null, error: seniorValidation.error })
  }
  const seniorManagerApprover = seniorValidation.user

  // Validate finance manager approver
  const financeValidation = await validateApprover(financeManagerApproverUserId, 'finance_manager', financeManagerRole)
  if (!financeValidation.valid) {
    return res.status(400).json({ data: null, error: financeValidation.error })
  }
  const financeManagerApprover = financeValidation.user

  const now = new Date()
  const isResubmit = expense.status === 'rejected'
  
  // Create approval history entry
  const historyEntry: ApprovalHistoryEntry = {
    action: isResubmit ? 'resubmitted' : 'submitted',
    userId: auth.userId,
    userEmail: submitterData?.email,
    userName: submitterData?.name,
    timestamp: now,
    notes: `Submitted for approval chain: ${managerApprover.name || managerApprover.email} → ${seniorManagerApprover.name || seniorManagerApprover.email} → ${financeManagerApprover.name || financeManagerApprover.email}`,
  }

  await db.collection('crm_expenses').updateOne(
    { _id: id },
    {
      $set: {
        status: 'pending_manager_approval',
        currentApprovalLevel: APPROVAL_LEVELS.MANAGER,
        submittedBy: auth.userId,
        submittedByEmail: submitterData?.email,
        submittedByName: submitterData?.name,
        submittedAt: now,
        
        // Level 1: Manager
        managerApproverUserId,
        managerApproverEmail: managerApprover.email,
        managerApproverName: managerApprover.name,
        
        // Level 2: Senior Manager
        seniorManagerApproverUserId,
        seniorManagerApproverEmail: seniorManagerApprover.email,
        seniorManagerApproverName: seniorManagerApprover.name,
        
        // Level 3: Finance Manager
        financeManagerApproverUserId,
        financeManagerApproverEmail: financeManagerApprover.email,
        financeManagerApproverName: financeManagerApprover.name,
        
        // Legacy field (for backward compatibility)
        approverUserId: managerApproverUserId,
        approverEmail: managerApprover.email,
        approverName: managerApprover.name,
        
        // Clear rejection info if resubmitting
        ...(isResubmit ? {
          rejectedBy: null,
          rejectedByEmail: null,
          rejectedByName: null,
          rejectedAt: null,
          rejectionReason: null,
          rejectedAtLevel: null,
        } : {}),
        
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

// POST /api/crm/expenses/:id/approve - Approve expense at current level
// Multi-level approval: manager -> senior_manager -> finance_manager
expensesRouter.post('/:id/approve', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth
  if (!auth?.userId) {
    return res.status(401).json({ data: null, error: 'unauthorized' })
  }
  
  const reviewNotes = String(req.body.reviewNotes || '').trim()

  let id: ObjectId
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const expense = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  // Determine valid pending statuses
  const validPendingStatuses = [
    'pending_manager_approval',
    'pending_senior_approval', 
    'pending_finance_approval',
    'pending_approval', // Legacy
  ]

  if (!validPendingStatuses.includes(expense.status)) {
    return res.status(400).json({ data: null, error: 'can_only_approve_pending' })
  }

  // Get approver details
  const approver = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
  if (!approver) {
    return res.status(404).json({ data: null, error: 'user_not_found' })
  }
  const approverData = approver as any
  const isAdmin = approverData.isAdmin === true

  // Determine current approval level and verify the user is the assigned approver
  let currentLevel = expense.currentApprovalLevel || APPROVAL_LEVELS.MANAGER
  let canApprove = false
  let levelName = ''

  // Map status to level for legacy expenses
  if (expense.status === 'pending_approval') {
    currentLevel = APPROVAL_LEVELS.MANAGER
  } else if (expense.status === 'pending_manager_approval') {
    currentLevel = APPROVAL_LEVELS.MANAGER
  } else if (expense.status === 'pending_senior_approval') {
    currentLevel = APPROVAL_LEVELS.SENIOR_MANAGER
  } else if (expense.status === 'pending_finance_approval') {
    currentLevel = APPROVAL_LEVELS.FINANCE_MANAGER
  }

  // Check if user is assigned approver for this level or is admin
  if (isAdmin) {
    canApprove = true
    levelName = currentLevel === APPROVAL_LEVELS.MANAGER ? 'Manager' :
                currentLevel === APPROVAL_LEVELS.SENIOR_MANAGER ? 'Senior Manager' :
                'Finance Manager'
  } else if (currentLevel === APPROVAL_LEVELS.MANAGER) {
    canApprove = expense.managerApproverUserId === auth.userId || 
                 expense.approverUserId === auth.userId // Legacy field
    levelName = 'Manager'
  } else if (currentLevel === APPROVAL_LEVELS.SENIOR_MANAGER) {
    canApprove = expense.seniorManagerApproverUserId === auth.userId
    levelName = 'Senior Manager'
  } else if (currentLevel === APPROVAL_LEVELS.FINANCE_MANAGER) {
    canApprove = expense.financeManagerApproverUserId === auth.userId
    levelName = 'Finance Manager'
  }

  if (!canApprove) {
    return res.status(403).json({ data: null, error: 'not_assigned_approver' })
  }

  const now = new Date()

  // Create approval history entry
  const historyEntry: ApprovalHistoryEntry = {
    action: 'level_approved',
    userId: auth.userId,
    userEmail: approverData?.email,
    userName: approverData?.name,
    timestamp: now,
    notes: reviewNotes || undefined,
    approvalLevel: currentLevel,
    roleName: levelName,
  }

  // Determine next status and level
  let nextStatus: ExpenseStatus
  let nextLevel: number | null = null
  let finalApproval = false

  if (currentLevel === APPROVAL_LEVELS.MANAGER) {
    nextStatus = 'pending_senior_approval'
    nextLevel = APPROVAL_LEVELS.SENIOR_MANAGER
  } else if (currentLevel === APPROVAL_LEVELS.SENIOR_MANAGER) {
    nextStatus = 'pending_finance_approval'
    nextLevel = APPROVAL_LEVELS.FINANCE_MANAGER
  } else {
    // Finance Manager approval = final
    nextStatus = 'approved'
    finalApproval = true
  }

  // Build update object
  const updateFields: Record<string, any> = {
    status: nextStatus,
    updatedAt: now,
  }

  if (nextLevel !== null) {
    updateFields.currentApprovalLevel = nextLevel
  }

  // Set level-specific approval fields
  if (currentLevel === APPROVAL_LEVELS.MANAGER) {
    updateFields.managerApprovedBy = auth.userId
    updateFields.managerApprovedByEmail = approverData?.email
    updateFields.managerApprovedByName = approverData?.name
    updateFields.managerApprovedAt = now
  } else if (currentLevel === APPROVAL_LEVELS.SENIOR_MANAGER) {
    updateFields.seniorManagerApprovedBy = auth.userId
    updateFields.seniorManagerApprovedByEmail = approverData?.email
    updateFields.seniorManagerApprovedByName = approverData?.name
    updateFields.seniorManagerApprovedAt = now
  } else if (currentLevel === APPROVAL_LEVELS.FINANCE_MANAGER) {
    updateFields.financeManagerApprovedBy = auth.userId
    updateFields.financeManagerApprovedByEmail = approverData?.email
    updateFields.financeManagerApprovedByName = approverData?.name
    updateFields.financeManagerApprovedAt = now
    // Also set legacy final approval fields
    updateFields.approvedBy = auth.userId
    updateFields.approvedByEmail = approverData?.email
    updateFields.approvedByName = approverData?.name
    updateFields.approvedAt = now
  }

  await db.collection('crm_expenses').updateOne(
    { _id: id },
    {
      $set: updateFields,
      $push: {
        approvalHistory: historyEntry,
      } as any,
    }
  )

  const updated = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  res.json({ 
    data: updated ? serializeExpense(updated) : null, 
    message: finalApproval ? 'Expense fully approved' : `${levelName} approval complete. Pending next level.`,
    error: null 
  })
})

// POST /api/crm/expenses/:id/reject - Reject expense at any approval level
// Any assigned approver at their level can reject
expensesRouter.post('/:id/reject', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth
  if (!auth?.userId) {
    return res.status(401).json({ data: null, error: 'unauthorized' })
  }
  
  const reason = String(req.body.reason || '').trim()

  let id: ObjectId
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const expense = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  if (!expense) return res.status(404).json({ data: null, error: 'not_found' })

  // Determine valid pending statuses
  const validPendingStatuses = [
    'pending_manager_approval',
    'pending_senior_approval', 
    'pending_finance_approval',
    'pending_approval', // Legacy
  ]

  if (!validPendingStatuses.includes(expense.status)) {
    return res.status(400).json({ data: null, error: 'can_only_reject_pending' })
  }

  // Get rejecter details
  const rejecter = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
  if (!rejecter) {
    return res.status(404).json({ data: null, error: 'user_not_found' })
  }
  const rejecterData = rejecter as any
  const isAdmin = rejecterData.isAdmin === true

  // Determine current approval level
  let currentLevel = expense.currentApprovalLevel || APPROVAL_LEVELS.MANAGER
  let canReject = false
  let levelName = ''

  // Map status to level for legacy expenses
  if (expense.status === 'pending_approval') {
    currentLevel = APPROVAL_LEVELS.MANAGER
  } else if (expense.status === 'pending_manager_approval') {
    currentLevel = APPROVAL_LEVELS.MANAGER
  } else if (expense.status === 'pending_senior_approval') {
    currentLevel = APPROVAL_LEVELS.SENIOR_MANAGER
  } else if (expense.status === 'pending_finance_approval') {
    currentLevel = APPROVAL_LEVELS.FINANCE_MANAGER
  }

  // Check if user is assigned approver for this level or is admin
  if (isAdmin) {
    canReject = true
    levelName = currentLevel === APPROVAL_LEVELS.MANAGER ? 'Manager' :
                currentLevel === APPROVAL_LEVELS.SENIOR_MANAGER ? 'Senior Manager' :
                'Finance Manager'
  } else if (currentLevel === APPROVAL_LEVELS.MANAGER) {
    canReject = expense.managerApproverUserId === auth.userId || 
                expense.approverUserId === auth.userId // Legacy field
    levelName = 'Manager'
  } else if (currentLevel === APPROVAL_LEVELS.SENIOR_MANAGER) {
    canReject = expense.seniorManagerApproverUserId === auth.userId
    levelName = 'Senior Manager'
  } else if (currentLevel === APPROVAL_LEVELS.FINANCE_MANAGER) {
    canReject = expense.financeManagerApproverUserId === auth.userId
    levelName = 'Finance Manager'
  }

  if (!canReject) {
    return res.status(403).json({ data: null, error: 'not_assigned_approver' })
  }

  const now = new Date()

  // Create approval history entry
  const historyEntry: ApprovalHistoryEntry = {
    action: 'rejected',
    userId: auth.userId,
    userEmail: rejecterData?.email,
    userName: rejecterData?.name,
    timestamp: now,
    notes: reason || undefined,
    approvalLevel: currentLevel,
    roleName: levelName,
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
        rejectedAtLevel: currentLevel,
        updatedAt: now,
      },
      $push: {
        approvalHistory: historyEntry,
      } as any,
    }
  )

  const updated = await db.collection<ExpenseDoc>('crm_expenses').findOne({ _id: id })
  res.json({ 
    data: updated ? serializeExpense(updated) : null, 
    message: `Expense rejected at ${levelName} level`,
    error: null 
  })
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

    // Add to history
    const historyEntry: ApprovalHistoryEntry = {
      action: 'attachment_added' as any,
      userId: auth.userId,
      userEmail: auth.email,
      timestamp: now,
      notes: `Added attachment: ${file.originalname}`,
    }

    await db.collection('crm_expenses').updateOne(
      { _id: id },
      {
        $push: { 
          attachments: attachment,
          approvalHistory: historyEntry,
        } as any,
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
  
  // Add to history
  const historyEntry: ApprovalHistoryEntry = {
    action: 'attachment_removed' as any,
    userId: auth.userId,
    userEmail: auth.email,
    timestamp: now,
    notes: `Removed attachment: ${attachment.fileName}`,
  }

  await db.collection('crm_expenses').updateOne(
    { _id: id },
    {
      $pull: { attachments: { id: attachmentId } } as any,
      $push: { approvalHistory: historyEntry } as any,
      $set: { updatedAt: now },
    }
  )

  res.json({ data: { deleted: true }, error: null })
})
