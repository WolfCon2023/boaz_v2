import { Router } from 'express'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { getDb, getNextSequence } from '../db.js'
import { sendEmail } from '../alerts/mail.js'
import crypto from 'crypto'
import { requireAuth } from '../auth/rbac.js'

export const slasRouter = Router()

slasRouter.use(requireAuth)

// Contract lifecycle & types
export type SlaStatus =
  | 'draft'
  | 'in_review'
  | 'sent'
  | 'partially_signed'
  | 'active'
  | 'expired'
  | 'terminated'
  | 'archived'
  // Legacy / scheduling-style states kept for compatibility
  | 'scheduled'
  | 'cancelled'

export type SlaType =
  | 'msa'
  | 'sow'
  | 'subscription'
  | 'nda'
  | 'support'
  | 'project'
  | 'other'

export type SlaSeverityTarget = {
  key: string // e.g. P1, P2, Sev1
  label?: string
  responseTargetMinutes?: number | null
  resolutionTargetMinutes?: number | null
}

export type SlaProfile = {
  name: string
  description?: string
  severityTargets?: SlaSeverityTarget[]
}

export type SlaAttachment = {
  _id: ObjectId
  name: string
  url: string
  mimeType?: string
  sizeBytes?: number
  uploadedAt: Date
  isFinal?: boolean
  kind?: 'draft' | 'final' | 'upload'
}

export type SlaEmailSend = {
  to: string
  subject: string
  sentAt: Date
  sentByUserId?: ObjectId
  messageId?: string
  status?: string
}

export type SlaSignatureAuditEvent = {
  at: Date
  actor?: string
  actorId?: ObjectId
  event: string
  ip?: string
  userAgent?: string
  details?: string
}

export type SlaContractDoc = {
  _id: ObjectId
  accountId: ObjectId
  contractNumber: number | null
  name: string
  type: SlaType
  status: SlaStatus
  effectiveDate: Date | null
  startDate: Date | null
  endDate: Date | null
  autoRenew: boolean
  renewalDate: Date | null
  renewalTermMonths: number | null
  noticePeriodDays: number | null
  responseTargetMinutes: number | null
  resolutionTargetMinutes: number | null
  entitlements?: string
  notes?: string
  // Optional per-priority overrides (P1/P2, Sev1/Sev2, etc.)
  severityTargets?: SlaSeverityTarget[]
  // SLA profiles that can be linked to legal text
  slaProfiles?: SlaProfile[]

  // Party & ownership metadata
  customerLegalName?: string
  customerAddress?: string
  providerLegalName?: string
  providerAddress?: string
  counterpartyContactId?: ObjectId | null
  internalOwnerUserId?: ObjectId | null

  // Legal terms (summarised text)
  governingLaw?: string
  jurisdiction?: string
  paymentTerms?: string
  serviceScopeSummary?: string
  limitationOfLiability?: string
  indemnificationSummary?: string
  confidentialitySummary?: string
  dataProtectionSummary?: string
  ipOwnershipSummary?: string
  terminationConditions?: string
  changeOrderProcess?: string

  // Versioning / lifecycle
  version: number
  parentContractId?: ObjectId | null
  isAmendment: boolean
  amendmentNumber?: number | null
  executedDate: Date | null
  signedByCustomer?: string
  signedByProvider?: string
  signedAtCustomer: Date | null
  signedAtProvider: Date | null

  // Documents, email history, signatures
  attachments?: SlaAttachment[]
  emailSends?: SlaEmailSend[]
  signatureAudit?: SlaSignatureAuditEvent[]

  createdAt: Date
  updatedAt: Date
}

const severityTargetSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  responseTargetMinutes: z.number().int().positive().nullable().optional(),
  resolutionTargetMinutes: z.number().int().positive().nullable().optional(),
})

const slaProfileSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  severityTargets: z.array(severityTargetSchema).optional(),
})

const statusEnum = z.enum([
  'draft',
  'in_review',
  'sent',
  'partially_signed',
  'active',
  'expired',
  'terminated',
  'archived',
  'scheduled',
  'cancelled',
])

const typeEnum = z.enum(['msa', 'sow', 'subscription', 'nda', 'support', 'project', 'other'])

const createSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1),
  contractNumber: z.number().int().positive().optional(),
  type: typeEnum.default('support'),
  status: statusEnum.default('draft'),
  effectiveDate: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  autoRenew: z.boolean().optional(),
  renewalDate: z.string().optional(),
  renewalTermMonths: z.number().int().positive().optional(),
  noticePeriodDays: z.number().int().nonnegative().optional(),
  responseTargetMinutes: z.number().int().positive().optional(),
  resolutionTargetMinutes: z.number().int().positive().optional(),
  entitlements: z.string().optional(),
  notes: z.string().optional(),
  severityTargets: z.array(severityTargetSchema).optional(),
  slaProfiles: z.array(slaProfileSchema).optional(),

  // Parties & ownership
  customerLegalName: z.string().optional(),
  customerAddress: z.string().optional(),
  providerLegalName: z.string().optional(),
  providerAddress: z.string().optional(),
  counterpartyContactId: z.string().optional(),
  internalOwnerUserId: z.string().optional(),

  // Legal term summaries
  governingLaw: z.string().optional(),
  jurisdiction: z.string().optional(),
  paymentTerms: z.string().optional(),
  serviceScopeSummary: z.string().optional(),
  limitationOfLiability: z.string().optional(),
  indemnificationSummary: z.string().optional(),
  confidentialitySummary: z.string().optional(),
  dataProtectionSummary: z.string().optional(),
  ipOwnershipSummary: z.string().optional(),
  terminationConditions: z.string().optional(),
  changeOrderProcess: z.string().optional(),

  // Versioning / lifecycle metadata (can be provided explicitly, but usually inferred)
  version: z.number().int().positive().optional(),
  parentContractId: z.string().optional(),
  isAmendment: z.boolean().optional(),
  amendmentNumber: z.number().int().nonnegative().optional(),
  executedDate: z.string().optional(),
  signedByCustomer: z.string().optional(),
  signedByProvider: z.string().optional(),
  signedAtCustomer: z.string().optional(),
  signedAtProvider: z.string().optional(),
})

const updateSchema = createSchema.partial()

function parseDate(value?: string): Date | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map((v) => Number(v))
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    if (!Number.isFinite(dt.getTime())) return null
    return dt
  }
  const dt = new Date(value)
  if (!Number.isFinite(dt.getTime())) return null
  return dt
}

export function serialize(doc: SlaContractDoc) {
  return {
    ...doc,
    _id: String(doc._id),
    accountId: String(doc.accountId),
    parentContractId: doc.parentContractId ? String(doc.parentContractId) : null,
    counterpartyContactId: doc.counterpartyContactId ? String(doc.counterpartyContactId) : null,
    internalOwnerUserId: doc.internalOwnerUserId ? String(doc.internalOwnerUserId) : null,
    effectiveDate: doc.effectiveDate ? doc.effectiveDate.toISOString() : null,
    startDate: doc.startDate ? doc.startDate.toISOString() : null,
    endDate: doc.endDate ? doc.endDate.toISOString() : null,
    renewalDate: doc.renewalDate ? doc.renewalDate.toISOString() : null,
    executedDate: doc.executedDate ? doc.executedDate.toISOString() : null,
    signedAtCustomer: doc.signedAtCustomer ? doc.signedAtCustomer.toISOString() : null,
    signedAtProvider: doc.signedAtProvider ? doc.signedAtProvider.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

// Build a plain-object context for template rendering
function buildContractContext(doc: SlaContractDoc) {
  const ctx: any = {
    ...serialize(doc),
  }
  // Flatten some commonly-used aliases
  ctx.contractId = ctx._id
  ctx.accountId = ctx.accountId
  ctx.contractNumber = ctx.contractNumber
  ctx.status = ctx.status
  ctx.type = ctx.type
  return ctx
}

// Very small mustache-style renderer: {{ field }} supports dotted paths
function renderTemplateString(tpl: string, context: any): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key) => {
    const path = String(key).split('.')
    let value: any = context
    for (const part of path) {
      if (value == null) break
      value = value[part]
    }
    if (value == null) return ''
    return String(value)
  })
}

// GET /api/crm/slas?accountId=&status=&type=
slasRouter.get('/', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })

  const { accountId, status, type } = req.query as {
    accountId?: string
    status?: string
    type?: string
  }

  const filter: any = {}
  if (accountId && ObjectId.isValid(accountId)) {
    filter.accountId = new ObjectId(accountId)
  }
  if (status && (statusEnum.options as readonly string[]).includes(status)) {
    filter.status = status
  }
  if (type && (typeEnum.options as readonly string[]).includes(type)) {
    filter.type = type
  }

  const items = await db.collection<SlaContractDoc>('sla_contracts').find(filter).sort({ endDate: 1 }).limit(500).toArray()
  res.json({ data: { items: items.map(serialize) }, error: null })
})

// GET /api/crm/slas/:id
slasRouter.get('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { id } = req.params
  if (!ObjectId.isValid(id)) return res.status(400).json({ data: null, error: 'invalid_id' })

  const doc = await db.collection<SlaContractDoc>('sla_contracts').findOne({ _id: new ObjectId(id) })
  if (!doc) return res.status(404).json({ data: null, error: 'not_found' })

  res.json({ data: serialize(doc), error: null })
})

// POST /api/crm/slas
slasRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const body = parsed.data
  if (!ObjectId.isValid(body.accountId)) {
    return res.status(400).json({ data: null, error: 'invalid_accountId' })
  }

  const now = new Date()
  const contractNumber =
    typeof body.contractNumber === 'number' && body.contractNumber > 0
      ? body.contractNumber
      : await getNextSequence('contractNumber')

  const doc: SlaContractDoc = {
    _id: new ObjectId(),
    accountId: new ObjectId(body.accountId),
    contractNumber,
    name: body.name,
    type: body.type ?? 'support',
    status: body.status ?? 'draft',
    effectiveDate: parseDate(body.effectiveDate),
    startDate: parseDate(body.startDate),
    endDate: parseDate(body.endDate),
    autoRenew: body.autoRenew ?? false,
    renewalDate: parseDate(body.renewalDate),
    renewalTermMonths: body.renewalTermMonths ?? null,
    noticePeriodDays: body.noticePeriodDays ?? null,
    responseTargetMinutes: body.responseTargetMinutes ?? null,
    resolutionTargetMinutes: body.resolutionTargetMinutes ?? null,
    entitlements: body.entitlements,
    notes: body.notes,
    severityTargets: body.severityTargets,
    slaProfiles: body.slaProfiles,

    // Parties & ownership
    customerLegalName: body.customerLegalName,
    customerAddress: body.customerAddress,
    providerLegalName: body.providerLegalName,
    providerAddress: body.providerAddress,
    counterpartyContactId: body.counterpartyContactId && ObjectId.isValid(body.counterpartyContactId)
      ? new ObjectId(body.counterpartyContactId)
      : null,
    internalOwnerUserId: body.internalOwnerUserId && ObjectId.isValid(body.internalOwnerUserId)
      ? new ObjectId(body.internalOwnerUserId)
      : null,

    // Legal term summaries
    governingLaw: body.governingLaw,
    jurisdiction: body.jurisdiction,
    paymentTerms: body.paymentTerms,
    serviceScopeSummary: body.serviceScopeSummary,
    limitationOfLiability: body.limitationOfLiability,
    indemnificationSummary: body.indemnificationSummary,
    confidentialitySummary: body.confidentialitySummary,
    dataProtectionSummary: body.dataProtectionSummary,
    ipOwnershipSummary: body.ipOwnershipSummary,
    terminationConditions: body.terminationConditions,
    changeOrderProcess: body.changeOrderProcess,

    // Versioning / lifecycle
    version: body.version ?? 1,
    parentContractId:
      body.parentContractId && ObjectId.isValid(body.parentContractId)
        ? new ObjectId(body.parentContractId)
        : null,
    isAmendment: body.isAmendment ?? false,
    amendmentNumber: body.amendmentNumber ?? null,
    executedDate: parseDate(body.executedDate),
    signedByCustomer: body.signedByCustomer,
    signedByProvider: body.signedByProvider,
    signedAtCustomer: parseDate(body.signedAtCustomer),
    signedAtProvider: parseDate(body.signedAtProvider),

    // History placeholders
    attachments: [],
    emailSends: [],
    signatureAudit: [],

    createdAt: now,
    updatedAt: now,
  }

  await db.collection<SlaContractDoc>('sla_contracts').insertOne(doc)
  res.status(201).json({ data: serialize(doc), error: null })
})

// PUT /api/crm/slas/:id
slasRouter.put('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { id } = req.params
  if (!ObjectId.isValid(id)) return res.status(400).json({ data: null, error: 'invalid_id' })

  const body = parsed.data
  const update: Partial<SlaContractDoc> = {}

  if (body.accountId !== undefined) {
    if (!ObjectId.isValid(body.accountId)) {
      return res.status(400).json({ data: null, error: 'invalid_accountId' })
    }
    update.accountId = new ObjectId(body.accountId)
  }
  if (body.contractNumber !== undefined) update.contractNumber = body.contractNumber ?? null
  if (body.name !== undefined) update.name = body.name
  if (body.type !== undefined) update.type = body.type
  if (body.status !== undefined) update.status = body.status
  if (body.effectiveDate !== undefined) update.effectiveDate = parseDate(body.effectiveDate)
  if (body.startDate !== undefined) update.startDate = parseDate(body.startDate)
  if (body.endDate !== undefined) update.endDate = parseDate(body.endDate)
  if (body.autoRenew !== undefined) update.autoRenew = body.autoRenew
  if (body.renewalDate !== undefined) update.renewalDate = parseDate(body.renewalDate)
  if (body.renewalTermMonths !== undefined) update.renewalTermMonths = body.renewalTermMonths ?? null
  if (body.noticePeriodDays !== undefined) update.noticePeriodDays = body.noticePeriodDays ?? null
  if (body.responseTargetMinutes !== undefined) update.responseTargetMinutes = body.responseTargetMinutes ?? null
  if (body.resolutionTargetMinutes !== undefined) update.resolutionTargetMinutes = body.resolutionTargetMinutes ?? null
  if (body.entitlements !== undefined) update.entitlements = body.entitlements
  if (body.notes !== undefined) update.notes = body.notes
  if (body.severityTargets !== undefined) update.severityTargets = body.severityTargets
  if (body.slaProfiles !== undefined) update.slaProfiles = body.slaProfiles

  // Parties & ownership
  if (body.customerLegalName !== undefined) update.customerLegalName = body.customerLegalName
  if (body.customerAddress !== undefined) update.customerAddress = body.customerAddress
  if (body.providerLegalName !== undefined) update.providerLegalName = body.providerLegalName
  if (body.providerAddress !== undefined) update.providerAddress = body.providerAddress
  if (body.counterpartyContactId !== undefined) {
    update.counterpartyContactId =
      body.counterpartyContactId && ObjectId.isValid(body.counterpartyContactId)
        ? new ObjectId(body.counterpartyContactId)
        : null
  }
  if (body.internalOwnerUserId !== undefined) {
    update.internalOwnerUserId =
      body.internalOwnerUserId && ObjectId.isValid(body.internalOwnerUserId)
        ? new ObjectId(body.internalOwnerUserId)
        : null
  }

  // Legal term summaries
  if (body.governingLaw !== undefined) update.governingLaw = body.governingLaw
  if (body.jurisdiction !== undefined) update.jurisdiction = body.jurisdiction
  if (body.paymentTerms !== undefined) update.paymentTerms = body.paymentTerms
  if (body.serviceScopeSummary !== undefined) update.serviceScopeSummary = body.serviceScopeSummary
  if (body.limitationOfLiability !== undefined) update.limitationOfLiability = body.limitationOfLiability
  if (body.indemnificationSummary !== undefined) update.indemnificationSummary = body.indemnificationSummary
  if (body.confidentialitySummary !== undefined) update.confidentialitySummary = body.confidentialitySummary
  if (body.dataProtectionSummary !== undefined) update.dataProtectionSummary = body.dataProtectionSummary
  if (body.ipOwnershipSummary !== undefined) update.ipOwnershipSummary = body.ipOwnershipSummary
  if (body.terminationConditions !== undefined) update.terminationConditions = body.terminationConditions
  if (body.changeOrderProcess !== undefined) update.changeOrderProcess = body.changeOrderProcess

  // Versioning / lifecycle
  if (body.version !== undefined) update.version = body.version
  if (body.parentContractId !== undefined) {
    update.parentContractId =
      body.parentContractId && ObjectId.isValid(body.parentContractId)
        ? new ObjectId(body.parentContractId)
        : null
  }
  if (body.isAmendment !== undefined) update.isAmendment = body.isAmendment
  if (body.amendmentNumber !== undefined) update.amendmentNumber = body.amendmentNumber ?? null
  if (body.executedDate !== undefined) update.executedDate = parseDate(body.executedDate)
  if (body.signedByCustomer !== undefined) update.signedByCustomer = body.signedByCustomer
  if (body.signedByProvider !== undefined) update.signedByProvider = body.signedByProvider
  if (body.signedAtCustomer !== undefined) update.signedAtCustomer = parseDate(body.signedAtCustomer)
  if (body.signedAtProvider !== undefined) update.signedAtProvider = parseDate(body.signedAtProvider)

  update.updatedAt = new Date()

  const coll = db.collection<SlaContractDoc>('sla_contracts')
  const existing = await coll.findOne({ _id: new ObjectId(id) })
  if (!existing) return res.status(404).json({ data: null, error: 'not_found' })

  await coll.updateOne({ _id: existing._id }, { $set: update })
  const updated = await coll.findOne({ _id: existing._id })
  if (!updated) return res.status(500).json({ data: null, error: 'update_failed' })

  res.json({ data: serialize(updated), error: null })
})

// DELETE /api/crm/slas/:id
slasRouter.delete('/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { id } = req.params
  if (!ObjectId.isValid(id)) return res.status(400).json({ data: null, error: 'invalid_id' })

  const result = await db.collection<SlaContractDoc>('sla_contracts').deleteOne({ _id: new ObjectId(id) })
  if (!result.deletedCount) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  res.json({ data: { ok: true }, error: null })
})

// POST /api/crm/slas/:id/transition - change contract status with validation
const transitionSchema = z.object({
  status: statusEnum,
})

slasRouter.post('/:id/transition', async (req, res) => {
  const parsed = transitionSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { id } = req.params
  if (!ObjectId.isValid(id)) return res.status(400).json({ data: null, error: 'invalid_id' })

  const coll = db.collection<SlaContractDoc>('sla_contracts')
  const existing = await coll.findOne({ _id: new ObjectId(id) })
  if (!existing) return res.status(404).json({ data: null, error: 'not_found' })

  const nextStatus = parsed.data.status

  // Simple state machine – can be expanded with stricter rules later
  const update: Partial<SlaContractDoc> = {
    status: nextStatus,
    updatedAt: new Date(),
  }

  // If moving into an "active" style state and not yet executed, stamp executedDate
  if (nextStatus === 'active' && !existing.executedDate) {
    update.executedDate = new Date()
  }

  await coll.updateOne({ _id: existing._id }, { $set: update })
  const updated = await coll.findOne({ _id: existing._id })
  if (!updated) return res.status(500).json({ data: null, error: 'update_failed' })

  res.json({ data: serialize(updated), error: null })
})

// POST /api/crm/slas/:id/amend - create a new amendment / version derived from an existing contract
const amendSchema = updateSchema

slasRouter.post('/:id/amend', async (req, res) => {
  const parsed = amendSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { id } = req.params
  if (!ObjectId.isValid(id)) return res.status(400).json({ data: null, error: 'invalid_id' })

  const coll = db.collection<SlaContractDoc>('sla_contracts')
  const existing = await coll.findOne({ _id: new ObjectId(id) })
  if (!existing) return res.status(404).json({ data: null, error: 'not_found' })

  const body = parsed.data
  const now = new Date()

  const newId = new ObjectId()
  const contractNumber =
    typeof body.contractNumber === 'number' && body.contractNumber > 0
      ? body.contractNumber
      : existing.contractNumber ?? (await getNextSequence('contractNumber'))

  const baseVersion = existing.version ?? 1
  const amendmentNumber =
    typeof body.amendmentNumber === 'number' ? body.amendmentNumber : (existing.amendmentNumber ?? 0) + 1

  const derived: SlaContractDoc = {
    ...existing,
    _id: newId,
    contractNumber,
    status: 'draft',
    version: baseVersion + 1,
    parentContractId: existing.parentContractId ?? existing._id,
    isAmendment: true,
    amendmentNumber,
    executedDate: null,
    signedByCustomer: undefined,
    signedByProvider: undefined,
    signedAtCustomer: null,
    signedAtProvider: null,
    // Reset history for the new amendment
    attachments: [],
    emailSends: [],
    signatureAudit: [],
    createdAt: now,
    updatedAt: now,
  }

  // Apply any overrides from the body using the same mapping as update
  const patch: Partial<SlaContractDoc> = {}

  if (body.accountId !== undefined && ObjectId.isValid(body.accountId)) {
    patch.accountId = new ObjectId(body.accountId)
  }
  if (body.name !== undefined) patch.name = body.name
  if (body.type !== undefined) patch.type = body.type
  if (body.effectiveDate !== undefined) patch.effectiveDate = parseDate(body.effectiveDate)
  if (body.startDate !== undefined) patch.startDate = parseDate(body.startDate)
  if (body.endDate !== undefined) patch.endDate = parseDate(body.endDate)
  if (body.autoRenew !== undefined) patch.autoRenew = body.autoRenew
  if (body.renewalDate !== undefined) patch.renewalDate = parseDate(body.renewalDate)
  if (body.renewalTermMonths !== undefined) patch.renewalTermMonths = body.renewalTermMonths ?? null
  if (body.noticePeriodDays !== undefined) patch.noticePeriodDays = body.noticePeriodDays ?? null
  if (body.responseTargetMinutes !== undefined) patch.responseTargetMinutes = body.responseTargetMinutes ?? null
  if (body.resolutionTargetMinutes !== undefined) patch.resolutionTargetMinutes = body.resolutionTargetMinutes ?? null
  if (body.entitlements !== undefined) patch.entitlements = body.entitlements
  if (body.notes !== undefined) patch.notes = body.notes
  if (body.severityTargets !== undefined) patch.severityTargets = body.severityTargets
  if (body.slaProfiles !== undefined) patch.slaProfiles = body.slaProfiles

  if (body.customerLegalName !== undefined) patch.customerLegalName = body.customerLegalName
  if (body.customerAddress !== undefined) patch.customerAddress = body.customerAddress
  if (body.providerLegalName !== undefined) patch.providerLegalName = body.providerLegalName
  if (body.providerAddress !== undefined) patch.providerAddress = body.providerAddress
  if (body.counterpartyContactId !== undefined) {
    patch.counterpartyContactId =
      body.counterpartyContactId && ObjectId.isValid(body.counterpartyContactId)
        ? new ObjectId(body.counterpartyContactId)
        : null
  }
  if (body.internalOwnerUserId !== undefined) {
    patch.internalOwnerUserId =
      body.internalOwnerUserId && ObjectId.isValid(body.internalOwnerUserId)
        ? new ObjectId(body.internalOwnerUserId)
        : null
  }

  if (body.governingLaw !== undefined) patch.governingLaw = body.governingLaw
  if (body.jurisdiction !== undefined) patch.jurisdiction = body.jurisdiction
  if (body.paymentTerms !== undefined) patch.paymentTerms = body.paymentTerms
  if (body.serviceScopeSummary !== undefined) patch.serviceScopeSummary = body.serviceScopeSummary
  if (body.limitationOfLiability !== undefined) patch.limitationOfLiability = body.limitationOfLiability
  if (body.indemnificationSummary !== undefined) patch.indemnificationSummary = body.indemnificationSummary
  if (body.confidentialitySummary !== undefined) patch.confidentialitySummary = body.confidentialitySummary
  if (body.dataProtectionSummary !== undefined) patch.dataProtectionSummary = body.dataProtectionSummary
  if (body.ipOwnershipSummary !== undefined) patch.ipOwnershipSummary = body.ipOwnershipSummary
  if (body.terminationConditions !== undefined) patch.terminationConditions = body.terminationConditions
  if (body.changeOrderProcess !== undefined) patch.changeOrderProcess = body.changeOrderProcess

  const finalDoc: SlaContractDoc = { ...derived, ...patch }

  await coll.insertOne(finalDoc)

  res.status(201).json({ data: serialize(finalDoc), error: null })
})

// POST /api/crm/slas/:id/render - render a contract using a template or inline HTML
const renderSchema = z
  .object({
    templateId: z.string().optional(),
    html: z.string().optional(),
  })
  .refine((v) => !!v.templateId || !!v.html, {
    message: 'templateId_or_html_required',
    path: ['templateId'],
  })

slasRouter.post('/:id/render', async (req, res) => {
  const parsed = renderSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { id } = req.params
  if (!ObjectId.isValid(id)) return res.status(400).json({ data: null, error: 'invalid_id' })

  const coll = db.collection<SlaContractDoc>('sla_contracts')
  const doc = await coll.findOne({ _id: new ObjectId(id) })
  if (!doc) return res.status(404).json({ data: null, error: 'not_found' })

  const body = parsed.data
  let templateHtml = body.html || ''

  if (body.templateId) {
    const tplColl = db.collection<any>('contract_templates')
    const tpl = await tplColl.findOne({ _id: new ObjectId(body.templateId) })
    if (!tpl) return res.status(404).json({ data: null, error: 'template_not_found' })
    templateHtml = tpl.htmlBody || ''
  }

  const ctx = buildContractContext(doc)
  const rendered = renderTemplateString(templateHtml, ctx)

  res.json({ data: { html: rendered }, error: null })
})

// POST /api/crm/slas/:id/send - send contract email (HTML body)
const sendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  bodyHtml: z.string().optional(),
  templateId: z.string().optional(),
})

slasRouter.post('/:id/send', async (req, res) => {
  const parsed = sendSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { id } = req.params
  if (!ObjectId.isValid(id)) return res.status(400).json({ data: null, error: 'invalid_id' })

  const coll = db.collection<SlaContractDoc>('sla_contracts')
  const doc = await coll.findOne({ _id: new ObjectId(id) })
  if (!doc) return res.status(404).json({ data: null, error: 'not_found' })

  const body = parsed.data
  let html = body.bodyHtml || ''
  if (body.templateId) {
    const tplColl = db.collection<any>('contract_templates')
    const tpl = await tplColl.findOne({ _id: new ObjectId(body.templateId) })
    if (!tpl) return res.status(404).json({ data: null, error: 'template_not_found' })
    html = renderTemplateString(tpl.htmlBody || '', buildContractContext(doc))
  } else if (!html) {
    // Fallback minimal HTML summary
    const ctx = buildContractContext(doc)
    html = `<p>Contract ${ctx.contractNumber ?? ''} – ${ctx.name ?? ''}</p>`
  }

  const to = body.to
  const subject = body.subject

  await sendEmail({ to, subject, html })

  const user = (req as any).user
  const sentBy =
    user?.sub && ObjectId.isValid(user.sub)
      ? new ObjectId(user.sub)
      : undefined

  const emailEntry: SlaEmailSend = {
    to,
    subject,
    sentAt: new Date(),
    sentByUserId: sentBy,
    messageId: undefined,
    status: 'Sent',
  }

  await coll.updateOne(
    { _id: doc._id },
    {
      $set: { updatedAt: new Date() },
      $push: { emailSends: emailEntry },
    },
  )

  res.json({ data: { ok: true }, error: null })
})

// Internal helper to create signature invites; used from authenticated area
export async function createSignatureInvites({
  contractId,
  invites,
  createdByUserId,
}: {
  contractId: ObjectId
  invites: { role: 'customerSigner' | 'providerSigner'; email: string; name?: string; title?: string }[]
  createdByUserId?: ObjectId
}) {
  const db = await getDb()
  if (!db) throw new Error('db_unavailable')

  const coll = db.collection<any>('sla_signature_invites')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days

  const docs = invites.map((inv) => ({
    _id: new ObjectId(),
    contractId,
    role: inv.role,
    email: inv.email,
    name: inv.name,
    title: inv.title,
    token: crypto.randomBytes(24).toString('hex'),
    status: 'pending',
    createdAt: now,
    expiresAt,
    usedAt: null,
    createdByUserId,
  }))

  if (!docs.length) return []

  await coll.insertMany(docs)
  return docs
}


// GET /api/crm/slas/by-account?accountIds=id1,id2
slasRouter.get('/by-account', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const raw = String((req.query.accountIds as string) ?? '').trim()
  if (!raw) return res.json({ data: { items: [] }, error: null })

  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => ObjectId.isValid(s))
    .map((s) => new ObjectId(s))

  if (!ids.length) return res.json({ data: { items: [] }, error: null })

  const now = new Date()
  const soon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  const coll = db.collection<SlaContractDoc>('sla_contracts')
  const rows = await coll
    .aggregate<{
      _id: ObjectId
      activeCount: number
      expiringSoon: number
      bestResponse: number | null
      bestResolution: number | null
      nextExpiry: Date | null
    }>([
      {
        $match: {
          accountId: { $in: ids },
        },
      },
      {
        $group: {
          _id: '$accountId',
          activeCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0],
            },
          },
          expiringSoon: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$endDate', null] },
                    { $gte: ['$endDate', now] },
                    { $lte: ['$endDate', soon] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          bestResponse: { $min: '$responseTargetMinutes' },
          bestResolution: { $min: '$resolutionTargetMinutes' },
          nextExpiry: { $min: '$endDate' },
        },
      },
    ])
    .toArray()

  const items = rows.map((r) => ({
    accountId: String(r._id),
    activeCount: r.activeCount ?? 0,
    expiringSoon: r.expiringSoon ?? 0,
    bestResponse: r.bestResponse ?? null,
    bestResolution: r.bestResolution ?? null,
    nextExpiry: r.nextExpiry ?? null,
  }))

  res.json({ data: { items }, error: null })
})


