import { Router } from 'express'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { getDb, getNextSequence } from '../db.js'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { sendEmail } from '../alerts/mail.js'
import crypto from 'crypto'
import { env } from '../env.js'
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
  // Commercial / financial
  billingFrequency?: string
  currency?: string
  baseAmountCents?: number | null
  invoiceDueDays?: number | null
  // SLO / SLA rollups
  uptimeTargetPercent?: number | null
  supportHours?: string
  slaExclusionsSummary?: string
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
  customerExecSponsor?: string
  customerTechContact?: string
  providerLegalName?: string
  providerAddress?: string
  providerAccountManager?: string
  providerCsm?: string
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
  // Compliance / data protection
  dataClassification?: string
  hasDataProcessingAddendum?: boolean

  // Change control & negotiations
  changeControlRequiredFor?: string
  negotiationStatus?: string
  redlineSummary?: string

  // Audit, rights, and restrictions
  auditRightsSummary?: string
  usageRestrictionsSummary?: string
  subprocessorUseSummary?: string

  // Renewals & commercial levers
  autoIncreasePercentOnRenewal?: number | null
  earlyTerminationFeeModel?: string
  upsellCrossSellRights?: string

  // Linkage to other records
  primaryQuoteId?: ObjectId | null
  primaryDealId?: ObjectId | null
  coveredAssetTags?: string[]
  coveredServiceTags?: string[]
  successPlaybookConstraints?: string

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
  billingFrequency: z.string().optional(),
  currency: z.string().optional(),
  baseAmountCents: z.number().int().nonnegative().optional(),
  invoiceDueDays: z.number().int().nonnegative().optional(),
  uptimeTargetPercent: z.number().min(0).max(100).optional(),
  supportHours: z.string().optional(),
  slaExclusionsSummary: z.string().optional(),
  responseTargetMinutes: z.number().int().positive().optional(),
  resolutionTargetMinutes: z.number().int().positive().optional(),
  entitlements: z.string().optional(),
  notes: z.string().optional(),
  severityTargets: z.array(severityTargetSchema).optional(),
  slaProfiles: z.array(slaProfileSchema).optional(),

  // Parties & ownership
  customerLegalName: z.string().optional(),
  customerAddress: z.string().optional(),
  customerExecSponsor: z.string().optional(),
  customerTechContact: z.string().optional(),
  providerLegalName: z.string().optional(),
  providerAddress: z.string().optional(),
  providerAccountManager: z.string().optional(),
  providerCsm: z.string().optional(),
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
  dataClassification: z.string().optional(),
  hasDataProcessingAddendum: z.boolean().optional(),

  // Change control & negotiations
  changeControlRequiredFor: z.string().optional(),
  negotiationStatus: z.string().optional(),
  redlineSummary: z.string().optional(),

  // Audit / rights
  auditRightsSummary: z.string().optional(),
  usageRestrictionsSummary: z.string().optional(),
  subprocessorUseSummary: z.string().optional(),

  // Renewals / commercial levers
  autoIncreasePercentOnRenewal: z.number().min(0).max(100).optional(),
  earlyTerminationFeeModel: z.string().optional(),
  upsellCrossSellRights: z.string().optional(),

  // Links to CRM artifacts and assets
  primaryQuoteId: z.string().optional(),
  primaryDealId: z.string().optional(),
  coveredAssetTags: z.array(z.string()).optional(),
  coveredServiceTags: z.array(z.string()).optional(),
  successPlaybookConstraints: z.string().optional(),

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
    primaryQuoteId: doc.primaryQuoteId ? String(doc.primaryQuoteId) : null,
    primaryDealId: doc.primaryDealId ? String(doc.primaryDealId) : null,
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

// Helper to express SLA minutes as a compact human label, e.g. "4h", "1d 4h"
function minutesToHumanLabel(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return ''
  const total = Math.floor(minutes)
  const minutesPerDay = 60 * 24
  const days = Math.floor(total / minutesPerDay)
  const hours = Math.floor((total % minutesPerDay) / 60)
  const mins = total % 60
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  if (mins) parts.push(`${mins}m`)
  return parts.join(' ')
}

// Build a plain-object context for template rendering
export function buildContractContext(doc: SlaContractDoc) {
  const base = serialize(doc)
  const ctx: any = {
    ...base,
  }
  // Flatten some commonly-used aliases
  ctx.contractId = ctx._id
  ctx.accountId = ctx.accountId
  ctx.contractNumber = ctx.contractNumber
  ctx.status = ctx.status
  ctx.type = ctx.type

  // Commercial formatting
  const amountCents = typeof doc.baseAmountCents === 'number' ? doc.baseAmountCents : null
  if (amountCents != null) {
    const amount = amountCents / 100
    ctx.baseAmountFormatted = `${doc.currency || 'USD'} ${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  } else {
    ctx.baseAmountFormatted = ''
  }

  // Renewal & notice summary
  const renewalBits: string[] = []
  if (doc.autoRenew) renewalBits.push('Auto‑renew: enabled')
  if (doc.renewalTermMonths != null) renewalBits.push(`Term: ${doc.renewalTermMonths} month(s)`)
  if (doc.noticePeriodDays != null) renewalBits.push(`Notice: ${doc.noticePeriodDays} days`)
  if (doc.autoIncreasePercentOnRenewal != null) {
    renewalBits.push(`Auto increase: ${doc.autoIncreasePercentOnRenewal}%`)
  }
  if (doc.earlyTerminationFeeModel) renewalBits.push(`Early termination: ${doc.earlyTerminationFeeModel}`)
  ctx.renewalSummary = renewalBits.join(' · ')

  // Severity/SLA summary
  if (Array.isArray(doc.severityTargets) && doc.severityTargets.length) {
    ctx.severitySummary = doc.severityTargets
      .map((s) => {
        const label = s.label || s.key
        const resp = minutesToHumanLabel(s.responseTargetMinutes ?? null)
        const res = minutesToHumanLabel(s.resolutionTargetMinutes ?? null)
        const bits: string[] = []
        if (resp) bits.push(`resp ${resp}`)
        if (res) bits.push(`res ${res}`)
        const suffix = bits.length ? ` (${bits.join(' / ')})` : ''
        return `${label}${suffix}`
      })
      .join(' • ')
  } else {
    ctx.severitySummary = ''
  }

  // Linked assets / services
  ctx.coveredAssetsSummary = Array.isArray(doc.coveredAssetTags) ? doc.coveredAssetTags.join(', ') : ''
  ctx.coveredServicesSummary = Array.isArray(doc.coveredServiceTags) ? doc.coveredServiceTags.join(', ') : ''

  return ctx
}

// Very small mustache-style renderer: {{ field }} supports dotted paths
export function renderTemplateString(tpl: string, context: any): string {
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

// Build the signed HTML snapshot for a contract
export function buildSignedHtml(contract: SlaContractDoc): string {
  const ctx = buildContractContext(contract)
  return renderTemplateString(
    `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Signed contract {{contractNumber}} – {{name}}</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#0b1020; color:#f9fafb; padding:24px; }
      .card { max-width:720px; margin:0 auto; background:#020617; border-radius:16px; padding:24px; border:1px solid #1f2937; }
      h1 { font-size:20px; margin:0 0 4px 0; }
      h2 { font-size:14px; text-transform:uppercase; letter-spacing:0.08em; color:#9ca3af; margin:20px 0 6px; }
      h3 { font-size:13px; margin:10px 0 4px; color:#e5e7eb; }
      p, li { font-size:13px; line-height:1.6; color:#d1d5db; }
      table { width:100%; border-collapse:collapse; margin-top:4px; font-size:12px; }
      th, td { padding:6px 8px; border-bottom:1px solid #1f2937; text-align:left; vertical-align:top; }
      th { color:#9ca3af; font-weight:500; }
      .grid-2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px 24px; margin-top:6px; }
      .pill { display:inline-block; padding:2px 8px; border-radius:999px; border:1px solid #1f2937; background:#020617; font-size:11px; color:#e5e7eb; margin-right:6px; margin-top:4px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Signed contract {{contractNumber}} – {{name}}</h1>
      <p>Type: {{type}} · Status: {{status}}</p>
      <h2>Parties</h2>
      <p>
        <strong>Customer:</strong> {{customerLegalName}}<br/>
        <strong>Provider:</strong> {{providerLegalName}}
      </p>
      <h2>Term</h2>
      <table>
        <tr><th>Effective date</th><td>{{effectiveDate}}</td></tr>
        <tr><th>Service term</th><td>{{startDate}} – {{endDate}}</td></tr>
        <tr><th>Renewal date</th><td>{{renewalDate}}</td></tr>
      </table>
      <div class="grid-2">
        <div>
          <h3>Commercial &amp; billing</h3>
          <table>
            <tr><th>Billing frequency</th><td>{{billingFrequency}}</td></tr>
            <tr><th>Base amount</th><td>{{baseAmountFormatted}}</td></tr>
            <tr><th>Currency</th><td>{{currency}}</td></tr>
            <tr><th>Invoice due</th><td>{{invoiceDueDays}} days</td></tr>
            <tr><th>Renewal</th><td>{{renewalSummary}}</td></tr>
            <tr><th>Upsell / cross‑sell</th><td>{{upsellCrossSellRights}}</td></tr>
          </table>
        </div>
        <div>
          <h3>Governance &amp; change control</h3>
          <table>
            <tr><th>Customer exec sponsor</th><td>{{customerExecSponsor}}</td></tr>
            <tr><th>Customer tech contact</th><td>{{customerTechContact}}</td></tr>
            <tr><th>Provider account manager</th><td>{{providerAccountManager}}</td></tr>
            <tr><th>Provider CSM</th><td>{{providerCsm}}</td></tr>
            <tr><th>Governing law</th><td>{{governingLaw}}</td></tr>
            <tr><th>Jurisdiction</th><td>{{jurisdiction}}</td></tr>
            <tr><th>Change control required for</th><td>{{changeControlRequiredFor}}</td></tr>
            <tr><th>Negotiation status</th><td>{{negotiationStatus}}</td></tr>
            <tr><th>Redline summary</th><td>{{redlineSummary}}</td></tr>
          </table>
        </div>
      </div>
      <h2>Signatures</h2>
      <table>
        <tr>
          <th>Customer signer</th>
          <td>{{signedByCustomer}} {{signedAtCustomer}}</td>
        </tr>
        <tr>
          <th>Provider signer</th>
          <td>{{signedByProvider}} {{signedAtProvider}}</td>
        </tr>
        <tr>
          <th>Executed date</th>
          <td>{{executedDate}}</td>
        </tr>
      </table>
      <h2>Service scope &amp; SLAs</h2>
      <div class="grid-2">
        <div>
          <h3>Scope &amp; entitlements</h3>
          <p>{{serviceScopeSummary}}</p>
          <p><strong>Entitlements:</strong> {{entitlements}}</p>
          <p><strong>Notes:</strong> {{notes}}</p>
        </div>
        <div>
          <h3>SLA metrics</h3>
          <table>
            <tr><th>Uptime target</th><td>{{uptimeTargetPercent}}%</td></tr>
            <tr><th>Support hours</th><td>{{supportHours}}</td></tr>
            <tr><th>Default response target</th><td>{{responseTargetMinutes}} minutes</td></tr>
            <tr><th>Default resolution target</th><td>{{resolutionTargetMinutes}} minutes</td></tr>
            <tr><th>SLA exclusions</th><td>{{slaExclusionsSummary}}</td></tr>
          </table>
          <p><strong>Per‑priority targets:</strong> {{severitySummary}}</p>
        </div>
      </div>
      <h2>Legal &amp; risk</h2>
      <div class="grid-2">
        <div>
          <h3>Key legal terms</h3>
          <p><strong>Limitation of liability:</strong> {{limitationOfLiability}}</p>
          <p><strong>Indemnification:</strong> {{indemnificationSummary}}</p>
          <p><strong>Confidentiality:</strong> {{confidentialitySummary}}</p>
          <p><strong>IP ownership:</strong> {{ipOwnershipSummary}}</p>
          <p><strong>Termination:</strong> {{terminationConditions}}</p>
          <p><strong>Change orders:</strong> {{changeOrderProcess}}</p>
        </div>
        <div>
          <h3>Compliance &amp; data protection</h3>
          <p><strong>Data classification:</strong> {{dataClassification}}</p>
          <p><strong>DPA in place:</strong> {{hasDataProcessingAddendum}}</p>
          <p><strong>Audit rights:</strong> {{auditRightsSummary}}</p>
          <p><strong>Usage restrictions:</strong> {{usageRestrictionsSummary}}</p>
          <p><strong>Subprocessor use:</strong> {{subprocessorUseSummary}}</p>
          <p><strong>Data protection summary:</strong> {{dataProtectionSummary}}</p>
        </div>
      </div>
      <h2>Covered scope &amp; links</h2>
      <p>
        <span class="pill">Primary quote: {{primaryQuoteId}}</span>
        <span class="pill">Primary deal: {{primaryDealId}}</span>
      </p>
      <p>
        <strong>Covered assets:</strong> {{coveredAssetsSummary}}<br/>
        <strong>Covered services:</strong> {{coveredServicesSummary}}<br/>
        <strong>Success playbook constraints:</strong> {{successPlaybookConstraints}}
      </p>
    </div>
  </body>
</html>`,
    ctx,
  )
}

// pdf-lib with standard fonts only supports WinAnsi; normalise unsupported chars (e.g. Unicode dashes)
function sanitizeForPdf(text: string): string {
  if (!text) return ''
  // Replace various dash-like Unicode characters with a plain ASCII hyphen
  return text.replace(/[\u2010-\u2015\u2212]/g, '-')
}

// Build a simple PDF representation of the signed contract using pdf-lib
export async function buildSignedPdf(contract: SlaContractDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage()
  const { width, height } = page.getSize()
  const margin = 50
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const lineHeight = 14

  let y = height - margin

  function drawText(text: string, options?: { bold?: boolean }) {
    const safe = sanitizeForPdf(text)
    const lines = safe.split(/\r?\n/)
    for (const line of lines) {
      if (y < margin) {
        y = height - margin
        doc.addPage()
      }
      page.drawText(line, {
        x: margin,
        y,
        size: 11,
        font: options?.bold ? fontBold : font,
      })
      y -= lineHeight
    }
  }

  const ctx = buildContractContext(contract) as any

  drawText(`Signed contract ${ctx.contractNumber ?? ''} – ${ctx.name ?? ''}`, { bold: true })
  drawText(`Type: ${ctx.type ?? ''}    Status: ${ctx.status ?? ''}`)
  y -= lineHeight

  drawText('Parties', { bold: true })
  drawText(`Customer: ${ctx.customerLegalName ?? ''}`)
  drawText(`Provider: ${ctx.providerLegalName ?? ''}`)
  y -= lineHeight

  drawText('Term', { bold: true })
  drawText(`Effective date: ${ctx.effectiveDate ?? ''}`)
  drawText(`Service term: ${ctx.startDate ?? ''} – ${ctx.endDate ?? ''}`)
  drawText(`Renewal date: ${ctx.renewalDate ?? ''}`)
  y -= lineHeight

  drawText('Signatures', { bold: true })
  drawText(`Customer signer: ${ctx.signedByCustomer ?? ''} ${ctx.signedAtCustomer ?? ''}`)
  drawText(`Provider signer: ${ctx.signedByProvider ?? ''} ${ctx.signedAtProvider ?? ''}`)
  drawText(`Executed date: ${ctx.executedDate ?? ''}`)
  y -= lineHeight

  if (ctx.serviceScopeSummary || ctx.paymentTerms) {
    drawText('Commercial & scope', { bold: true })
    if (ctx.serviceScopeSummary) drawText(`Service scope: ${ctx.serviceScopeSummary}`)
    if (ctx.paymentTerms) drawText(`Payment terms: ${ctx.paymentTerms}`)
    y -= lineHeight
  }

  if (
    ctx.limitationOfLiability ||
    ctx.indemnificationSummary ||
    ctx.confidentialitySummary ||
    ctx.dataProtectionSummary ||
    ctx.ipOwnershipSummary ||
    ctx.terminationConditions ||
    ctx.changeOrderProcess
  ) {
    drawText('Key legal terms', { bold: true })
    if (ctx.limitationOfLiability) drawText(`Limitation of liability: ${ctx.limitationOfLiability}`)
    if (ctx.indemnificationSummary) drawText(`Indemnification: ${ctx.indemnificationSummary}`)
    if (ctx.confidentialitySummary) drawText(`Confidentiality: ${ctx.confidentialitySummary}`)
    if (ctx.dataProtectionSummary) drawText(`Data protection: ${ctx.dataProtectionSummary}`)
    if (ctx.ipOwnershipSummary) drawText(`IP ownership: ${ctx.ipOwnershipSummary}`)
    if (ctx.terminationConditions) drawText(`Termination: ${ctx.terminationConditions}`)
    if (ctx.changeOrderProcess) drawText(`Change orders: ${ctx.changeOrderProcess}`)
    y -= lineHeight
  }

  if (ctx.slaExclusionsSummary || ctx.uptimeTargetPercent || ctx.supportHours) {
    drawText('SLA / SLO', { bold: true })
    if (ctx.uptimeTargetPercent) drawText(`Uptime target: ${ctx.uptimeTargetPercent}%`)
    if (ctx.supportHours) drawText(`Support hours: ${ctx.supportHours}`)
    if (ctx.slaExclusionsSummary) drawText(`SLA exclusions: ${ctx.slaExclusionsSummary}`)
    y -= lineHeight
  }

  if (ctx.dataClassification || ctx.hasDataProcessingAddendum) {
    drawText('Compliance', { bold: true })
    if (ctx.dataClassification) drawText(`Data classification: ${ctx.dataClassification}`)
    if (ctx.hasDataProcessingAddendum) drawText(`Data Processing Addendum: in place`)
    y -= lineHeight
  }

  if (
    ctx.billingFrequency ||
    ctx.baseAmountFormatted ||
    ctx.invoiceDueDays ||
    ctx.renewalSummary ||
    ctx.upsellCrossSellRights
  ) {
    drawText('Commercial & billing', { bold: true })
    if (ctx.billingFrequency) drawText(`Billing frequency: ${ctx.billingFrequency}`)
    if (ctx.baseAmountFormatted) drawText(`Base amount: ${ctx.baseAmountFormatted}`)
    if (ctx.invoiceDueDays) drawText(`Invoice due: ${ctx.invoiceDueDays} days`)
    if (ctx.renewalSummary) drawText(`Renewal: ${ctx.renewalSummary}`)
    if (ctx.upsellCrossSellRights) drawText(`Upsell / cross‑sell: ${ctx.upsellCrossSellRights}`)
    y -= lineHeight
  }

  if (
    ctx.customerExecSponsor ||
    ctx.customerTechContact ||
    ctx.providerAccountManager ||
    ctx.providerCsm ||
    ctx.changeControlRequiredFor ||
    ctx.negotiationStatus ||
    ctx.redlineSummary
  ) {
    drawText('Governance & change control', { bold: true })
    if (ctx.customerExecSponsor) drawText(`Customer exec sponsor: ${ctx.customerExecSponsor}`)
    if (ctx.customerTechContact) drawText(`Customer tech contact: ${ctx.customerTechContact}`)
    if (ctx.providerAccountManager) drawText(`Provider account manager: ${ctx.providerAccountManager}`)
    if (ctx.providerCsm) drawText(`Provider CSM: ${ctx.providerCsm}`)
    if (ctx.changeControlRequiredFor) drawText(`Change control required for: ${ctx.changeControlRequiredFor}`)
    if (ctx.negotiationStatus) drawText(`Negotiation status: ${ctx.negotiationStatus}`)
    if (ctx.redlineSummary) drawText(`Redline summary: ${ctx.redlineSummary}`)
    y -= lineHeight
  }

  if (ctx.coveredAssetsSummary || ctx.coveredServicesSummary || ctx.successPlaybookConstraints) {
    drawText('Covered scope & links', { bold: true })
    if (ctx.coveredAssetsSummary) drawText(`Covered assets: ${ctx.coveredAssetsSummary}`)
    if (ctx.coveredServicesSummary) drawText(`Covered services: ${ctx.coveredServicesSummary}`)
    if (ctx.successPlaybookConstraints) drawText(`Success playbook constraints: ${ctx.successPlaybookConstraints}`)
    y -= lineHeight
  }

  if (ctx.notes) {
    drawText('Notes', { bold: true })
    drawText(ctx.notes)
    y -= lineHeight
  }

  const pdfBytes = await doc.save()
  return pdfBytes
}

// Generate a final signed HTML snapshot, attach it to the contract, and email copies
export async function finalizeExecutedContract(contractId: ObjectId) {
  const db = await getDb()
  if (!db) return

  const coll = db.collection<SlaContractDoc>('sla_contracts')
  let contract = await coll.findOne({ _id: contractId })
  if (!contract) return

  const now = new Date()

  // Ensure provider signature is populated before generating the final documents
  if (!contract.signedByProvider) {
    const providerName = contract.providerLegalName || 'Wolf Consulting Group, LLC'
    await coll.updateOne(
      { _id: contract._id },
      {
        $set: {
          signedByProvider: providerName,
          signedAtProvider: now,
          updatedAt: now,
        },
        $push: {
          signatureAudit: {
            at: now,
            event: 'provider_auto_signed',
            details: `Provider signature auto-applied as ${providerName}`,
          },
        },
      },
    )
    contract = await coll.findOne({ _id: contract._id })
    if (!contract) return
  }

  const signedHtml = buildSignedHtml(contract)
  const signedPdf = await buildSignedPdf(contract)

  // Store HTML as data URL attachment
  const htmlDataUrl = 'data:text/html;base64,' + Buffer.from(signedHtml, 'utf8').toString('base64')

  const htmlAttachment: SlaAttachment = {
    _id: new ObjectId(),
    name: `Contract-${contract.contractNumber ?? ''}-signed.html`,
    url: htmlDataUrl,
    mimeType: 'text/html',
    sizeBytes: Buffer.byteLength(signedHtml, 'utf8'),
    uploadedAt: now,
    isFinal: true,
    kind: 'final',
  }

  // Store PDF as data URL attachment
  const pdfBase64 = Buffer.from(signedPdf).toString('base64')
  const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`

  const pdfAttachment: SlaAttachment = {
    _id: new ObjectId(),
    name: `Contract-${contract.contractNumber ?? ''}-signed.pdf`,
    url: pdfDataUrl,
    mimeType: 'application/pdf',
    sizeBytes: signedPdf.byteLength,
    uploadedAt: now,
    isFinal: true,
    kind: 'final',
  }

  await coll.updateOne(
    { _id: contract._id },
    {
      $set: { updatedAt: now },
      $push: { attachments: { $each: [htmlAttachment, pdfAttachment] } as any },
    },
  )

  // Email signed HTML copy to all signed invitees
  const invitesColl = db.collection<any>('sla_signature_invites')
  const signedInvites = await invitesColl
    .find({ contractId, status: 'signed' })
    .project({ email: 1 })
    .toArray()

  const subject = `Signed contract ${contract.contractNumber ?? ''} – ${contract.name}`

  for (const inv of signedInvites) {
    const email = inv.email as string | undefined
    if (!email) continue
    try {
      // Send PDF as primary content with HTML as fallback
      await sendEmail({
        to: email,
        subject,
        html: signedHtml,
        attachments: [
          {
            filename: `Contract-${contract.contractNumber ?? ''}-signed.pdf`,
            content: Buffer.from(signedPdf),
            contentType: 'application/pdf',
          },
        ],
      } as any)
      const emailEntry: SlaEmailSend = {
        to: email,
        subject,
        sentAt: new Date(),
        sentByUserId: undefined,
        messageId: undefined,
        status: 'Sent',
      }
      await coll.updateOne(
        { _id: contract._id },
        {
          $push: { emailSends: emailEntry },
        },
      )
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to email signed contract copy to', email, err)
    }
  }
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

// GET /api/crm/slas/:id/attachments/:attachmentId - serve stored attachment (including inline HTML finals)
slasRouter.get('/:id/attachments/:attachmentId', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { id, attachmentId } = req.params
  if (!ObjectId.isValid(id) || !ObjectId.isValid(attachmentId)) {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const coll = db.collection<SlaContractDoc>('sla_contracts')
  const contract = await coll.findOne({ _id: new ObjectId(id) })
  if (!contract || !Array.isArray((contract as any).attachments)) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  const attId = new ObjectId(attachmentId)
  const att = (contract as any).attachments.find(
    (a: any) => a && a._id && String(a._id) === String(attId),
  ) as SlaAttachment | undefined

  if (!att || !att.url) {
    return res.status(404).json({ data: null, error: 'attachment_not_found' })
  }

  const url = att.url

  // If this is a data: URL (how final HTML copies are stored), decode and stream it
  if (url.startsWith('data:')) {
    try {
      const firstComma = url.indexOf(',')
      if (firstComma === -1) throw new Error('malformed_data_url')

      const meta = url.substring(5, firstComma) // strip "data:"
      const dataPart = url.substring(firstComma + 1)

      const isBase64 = meta.includes(';base64')
      const mimeType = meta.split(';')[0] || 'application/octet-stream'

      const buf = isBase64 ? Buffer.from(dataPart, 'base64') : Buffer.from(decodeURIComponent(dataPart), 'utf8')

      res.setHeader('Content-Type', mimeType || 'application/octet-stream')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      return res.send(buf)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to decode data URL attachment', err)
      return res.status(500).json({ data: null, error: 'attachment_decode_failed' })
    }
  }

  // For any non data: URLs, just redirect the browser
  return res.redirect(url)
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
    billingFrequency: body.billingFrequency,
    currency: body.currency,
    baseAmountCents: body.baseAmountCents ?? null,
    invoiceDueDays: body.invoiceDueDays ?? null,
    uptimeTargetPercent: body.uptimeTargetPercent ?? null,
    supportHours: body.supportHours,
    slaExclusionsSummary: body.slaExclusionsSummary,
    responseTargetMinutes: body.responseTargetMinutes ?? null,
    resolutionTargetMinutes: body.resolutionTargetMinutes ?? null,
    entitlements: body.entitlements,
    notes: body.notes,
    severityTargets: body.severityTargets,
    slaProfiles: body.slaProfiles,

    // Parties & ownership
    customerLegalName: body.customerLegalName,
    customerAddress: body.customerAddress,
    customerExecSponsor: body.customerExecSponsor,
    customerTechContact: body.customerTechContact,
    providerLegalName: body.providerLegalName,
    providerAddress: body.providerAddress,
    providerAccountManager: body.providerAccountManager,
    providerCsm: body.providerCsm,
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
    dataClassification: body.dataClassification,
    hasDataProcessingAddendum: body.hasDataProcessingAddendum ?? false,

    // Change control & negotiations
    changeControlRequiredFor: body.changeControlRequiredFor,
    negotiationStatus: body.negotiationStatus,
    redlineSummary: body.redlineSummary,

    // Audit / rights
    auditRightsSummary: body.auditRightsSummary,
    usageRestrictionsSummary: body.usageRestrictionsSummary,
    subprocessorUseSummary: body.subprocessorUseSummary,

    // Renewals / levers
    autoIncreasePercentOnRenewal: body.autoIncreasePercentOnRenewal ?? null,
    earlyTerminationFeeModel: body.earlyTerminationFeeModel,
    upsellCrossSellRights: body.upsellCrossSellRights,

    // Links
    primaryQuoteId:
      body.primaryQuoteId && ObjectId.isValid(body.primaryQuoteId)
        ? new ObjectId(body.primaryQuoteId)
        : null,
    primaryDealId:
      body.primaryDealId && ObjectId.isValid(body.primaryDealId)
        ? new ObjectId(body.primaryDealId)
        : null,
    coveredAssetTags: body.coveredAssetTags ?? [],
    coveredServiceTags: body.coveredServiceTags ?? [],
    successPlaybookConstraints: body.successPlaybookConstraints,

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
  if (body.billingFrequency !== undefined) update.billingFrequency = body.billingFrequency
  if (body.currency !== undefined) update.currency = body.currency
  if (body.baseAmountCents !== undefined) update.baseAmountCents = body.baseAmountCents ?? null
  if (body.invoiceDueDays !== undefined) update.invoiceDueDays = body.invoiceDueDays ?? null
  if (body.uptimeTargetPercent !== undefined) update.uptimeTargetPercent = body.uptimeTargetPercent ?? null
  if (body.supportHours !== undefined) update.supportHours = body.supportHours
  if (body.slaExclusionsSummary !== undefined) update.slaExclusionsSummary = body.slaExclusionsSummary
  if (body.responseTargetMinutes !== undefined) update.responseTargetMinutes = body.responseTargetMinutes ?? null
  if (body.resolutionTargetMinutes !== undefined) update.resolutionTargetMinutes = body.resolutionTargetMinutes ?? null
  if (body.entitlements !== undefined) update.entitlements = body.entitlements
  if (body.notes !== undefined) update.notes = body.notes
  if (body.severityTargets !== undefined) update.severityTargets = body.severityTargets
  if (body.slaProfiles !== undefined) update.slaProfiles = body.slaProfiles

  // Parties & ownership
  if (body.customerLegalName !== undefined) update.customerLegalName = body.customerLegalName
  if (body.customerAddress !== undefined) update.customerAddress = body.customerAddress
  if (body.customerExecSponsor !== undefined) update.customerExecSponsor = body.customerExecSponsor
  if (body.customerTechContact !== undefined) update.customerTechContact = body.customerTechContact
  if (body.providerLegalName !== undefined) update.providerLegalName = body.providerLegalName
  if (body.providerAddress !== undefined) update.providerAddress = body.providerAddress
  if (body.providerAccountManager !== undefined) update.providerAccountManager = body.providerAccountManager
  if (body.providerCsm !== undefined) update.providerCsm = body.providerCsm
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
  if (body.dataClassification !== undefined) update.dataClassification = body.dataClassification
  if (body.hasDataProcessingAddendum !== undefined) update.hasDataProcessingAddendum = body.hasDataProcessingAddendum

  // Change control & negotiations
  if (body.changeControlRequiredFor !== undefined) update.changeControlRequiredFor = body.changeControlRequiredFor
  if (body.negotiationStatus !== undefined) update.negotiationStatus = body.negotiationStatus
  if (body.redlineSummary !== undefined) update.redlineSummary = body.redlineSummary

  // Audit / rights
  if (body.auditRightsSummary !== undefined) update.auditRightsSummary = body.auditRightsSummary
  if (body.usageRestrictionsSummary !== undefined) update.usageRestrictionsSummary = body.usageRestrictionsSummary
  if (body.subprocessorUseSummary !== undefined) update.subprocessorUseSummary = body.subprocessorUseSummary

  // Renewals / levers
  if (body.autoIncreasePercentOnRenewal !== undefined) {
    update.autoIncreasePercentOnRenewal = body.autoIncreasePercentOnRenewal ?? null
  }
  if (body.earlyTerminationFeeModel !== undefined) update.earlyTerminationFeeModel = body.earlyTerminationFeeModel
  if (body.upsellCrossSellRights !== undefined) update.upsellCrossSellRights = body.upsellCrossSellRights

  // Links
  if (body.primaryQuoteId !== undefined) {
    update.primaryQuoteId =
      body.primaryQuoteId && ObjectId.isValid(body.primaryQuoteId)
        ? new ObjectId(body.primaryQuoteId)
        : null
  }
  if (body.primaryDealId !== undefined) {
    update.primaryDealId =
      body.primaryDealId && ObjectId.isValid(body.primaryDealId)
        ? new ObjectId(body.primaryDealId)
        : null
  }
  if (body.coveredAssetTags !== undefined) update.coveredAssetTags = body.coveredAssetTags ?? []
  if (body.coveredServiceTags !== undefined) update.coveredServiceTags = body.coveredServiceTags ?? []
  if (body.successPlaybookConstraints !== undefined) {
    update.successPlaybookConstraints = body.successPlaybookConstraints
  }

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
    // Fallback HTML summary with key contract details
    const ctx = buildContractContext(doc)
    const parts: string[] = []
    if (ctx.effectiveDate) parts.push(`Effective: ${new Date(ctx.effectiveDate).toLocaleDateString()}`)
    if (ctx.startDate || ctx.endDate) {
      const start = ctx.startDate ? new Date(ctx.startDate).toLocaleDateString() : 'N/A'
      const end = ctx.endDate ? new Date(ctx.endDate).toLocaleDateString() : 'N/A'
      parts.push(`Term: ${start} – ${end}`)
    }
    if (ctx.renewalDate) {
      parts.push(`Renewal date: ${new Date(ctx.renewalDate).toLocaleDateString()}`)
    }
    if (ctx.responseTargetMinutes || ctx.resolutionTargetMinutes) {
      const resp = ctx.responseTargetMinutes ? `${ctx.responseTargetMinutes} min response` : ''
      const res = ctx.resolutionTargetMinutes ? `${ctx.resolutionTargetMinutes} min resolution` : ''
      parts.push(`SLA: ${[resp, res].filter(Boolean).join(' · ')}`)
    }
    const meta = parts.length ? `<p>${parts.join(' · ')}</p>` : ''
    html = `
      <p><strong>Contract ${ctx.contractNumber ?? ''} – ${ctx.name ?? ''}</strong></p>
      <p>Type: ${ctx.type ?? ''} · Status: ${ctx.status ?? ''}</p>
      ${meta}
      <p>Customer: ${ctx.customerLegalName ?? ''}</p>
      <p>Provider: ${ctx.providerLegalName ?? ''}</p>
      <p>You are receiving this email from BOAZ-OS because this contract is being reviewed or executed.</p>
    `
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
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days for link

  // OTP expiry is shorter-lived than the invite link itself
  const otpExpiryMinutes = 15
  const otpExpiresAt = new Date(now.getTime() + otpExpiryMinutes * 60 * 1000)

  const docs: any[] = []
  const augmented: any[] = []

  for (const inv of invites) {
    // Short-lived signing username for this invite
    const loginId = `C-${crypto.randomBytes(4).toString('hex')}`

    // 6-digit numeric OTP
    const otpCode = crypto.randomInt(100000, 1000000).toString()
    const otpHash = crypto.createHash('sha256').update(otpCode).digest('hex')

    const baseDoc = {
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
      // OTP metadata
      otpHash,
      otpExpiresAt,
      otpVerifiedAt: null,
      lastOtpSentAt: now,
      loginId,
    }

    docs.push(baseDoc)
    augmented.push({ ...baseDoc, otpCode })
  }

  if (!docs.length) return []

  await coll.insertMany(docs)
  // Return documents augmented with plaintext otpCode for email purposes (not stored separately)
  return augmented
}


// POST /api/crm/slas/:id/signature-invites - create signer invites and email links
const signatureInvitesSchema = z.object({
  invites: z
    .array(
      z.object({
        role: z.enum(['customerSigner', 'providerSigner']),
        email: z.string().email(),
        name: z.string().optional(),
        title: z.string().optional(),
      }),
    )
    .min(1),
  emailSubject: z.string().min(1),
  emailBodyTemplateId: z.string().optional(),
})

slasRouter.post('/:id/signature-invites', async (req, res) => {
  const parsed = signatureInvitesSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { id } = req.params
  if (!ObjectId.isValid(id)) return res.status(400).json({ data: null, error: 'invalid_id' })

  const coll = db.collection<SlaContractDoc>('sla_contracts')
  const contract = await coll.findOne({ _id: new ObjectId(id) })
  if (!contract) return res.status(404).json({ data: null, error: 'not_found' })

  const body = parsed.data
  const user = (req as any).user
  const creatorId =
    user?.sub && ObjectId.isValid(user.sub)
      ? new ObjectId(user.sub)
      : undefined

  const created = await createSignatureInvites({
    contractId: contract._id,
    invites: body.invites,
    createdByUserId: creatorId,
  })

  if (!created.length) {
    return res.json({ data: { invites: [] }, error: null })
  }

  // Build base URL from env.ORIGIN (same pattern as quotes/deals public links)
  const baseUrl = env.ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173'

  const ctxBase = buildContractContext(contract)

  // Optional email body template for invites
  let emailTplHtml: string | null = null
  if (body.emailBodyTemplateId) {
    const tplColl = db.collection<any>('contract_templates')
    const tpl = await tplColl.findOne({ _id: new ObjectId(body.emailBodyTemplateId) })
    if (!tpl) {
      return res.status(404).json({ data: null, error: 'email_template_not_found' })
    }
    emailTplHtml = tpl.htmlBody || ''
  }

  const invitesWithUrls: {
    role: 'customerSigner' | 'providerSigner'
    email: string
    name?: string
    title?: string
    url: string
  }[] = []

  // We know createSignatureInvites returns augmented docs that include otpCode
  const createdInvites: any[] = created as any[]

  // Collect email log entries for username, OTP, and link emails
  const emailLogs: SlaEmailSend[] = []

  // Keep OTP expiry consistent with helper
  const otpExpiryMinutes = 15

  for (const inv of createdInvites) {
    const url = `${baseUrl}/contracts/sign/${inv.token}`
    invitesWithUrls.push({
      role: inv.role,
      email: inv.email,
      name: inv.name,
      title: inv.title,
      url,
    })

    const ctx = {
      ...ctxBase,
      signUrl: url,
      signerEmail: inv.email,
      signerRole: inv.role,
      signerName: inv.name ?? '',
    }

    // 1) Username email (ephemeral signing username, no contract details)
    const usernameHtml = `
<!DOCTYPE html>
<html>
  <body style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#020617;color:#e5e7eb;padding:24px;">
    <div style="max-width:480px;margin:0 auto;background:#020617;border-radius:16px;border:1px solid #1f2937;padding:20px;">
      <div style="font-size:12px;color:#60a5fa;margin-bottom:4px;">BOAZ says</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:8px;">Your temporary contract signing username</div>
      <p style="font-size:13px;line-height:1.5;">
        Use the username below together with the one‑time code we will send in a separate email. Both are required to
        unlock the contract details before you sign.
      </p>
      <div style="margin:12px 0;padding:10px 14px;border-radius:999px;border:1px dashed #4b5563;font-size:16px;text-align:center;background:#020617;">
        <span style="font-family:'SF Mono',ui-monospace,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;color:#f9fafb;">${inv.loginId}</span>
      </div>
      <p style="font-size:12px;color:#9ca3af;margin-top:8px;">
        This username is only for this contract and may expire. Keep it private and do not forward this email.
      </p>
    </div>
  </body>
</html>
`

    {
      const subject = 'Your BOAZ‑OS contract signing username'
      await sendEmail({
        to: inv.email,
        subject,
        html: renderTemplateString(usernameHtml, ctx),
      })
      emailLogs.push({
        to: inv.email,
        subject,
        sentAt: new Date(),
        sentByUserId: creatorId,
        messageId: undefined,
        status: 'Sent',
      })
    }

    // 2) OTP email with one-time code (no contract details)
    if (inv.otpCode) {
      const otpHtml = `
<!DOCTYPE html>
<html>
  <body style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#020617;color:#e5e7eb;padding:24px;">
    <div style="max-width:480px;margin:0 auto;background:#020617;border-radius:16px;border:1px solid #1f2937;padding:20px;">
      <div style="font-size:12px;color:#60a5fa;margin-bottom:4px;">BOAZ says</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:8px;">Your one‑time security code for contract {{contractNumber}}</div>
      <p style="font-size:13px;line-height:1.5;">
        Use the code below together with your BOAZ‑OS signing username to unlock the contract details before signing.
        For your security, this code will expire in ${otpExpiryMinutes} minutes.
      </p>
      <div style="margin:12px 0;padding:10px 14px;border-radius:999px;border:1px dashed #4b5563;font-size:18px;letter-spacing:0.3em;text-align:center;background:#020617;">
        <span style="font-family:'SF Mono',ui-monospace,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;color:#f9fafb;">${inv.otpCode}</span>
      </div>
      <p style="font-size:12px;color:#9ca3af;margin-top:8px;">
        Do not share this code. BOAZ‑OS will never ask you to reply with this code.
      </p>
    </div>
  </body>
</html>
`
      {
        const subject = `Your BOAZ‑OS contract security code`
        await sendEmail({
          to: inv.email,
          subject,
          html: renderTemplateString(otpHtml, ctx),
        })
        emailLogs.push({
          to: inv.email,
          subject,
          sentAt: new Date(),
          sentByUserId: creatorId,
          messageId: undefined,
          status: 'Sent',
        })
      }
    }

    // 3) Link email – generic, no contract details in body
    const linkHtml = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>BOAZ‑OS contract ready for review</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#020617; color:#f9fafb; padding:24px; }
      .card { max-width:640px; margin:0 auto; background:#020617; border-radius:16px; padding:24px; border:1px solid #1f2937; box-shadow:0 18px 45px rgba(15,23,42,0.7); }
      .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:12px; background:#111827; border:1px solid #1f2937; color:#e5e7eb; }
      h1 { font-size:18px; margin:8px 0; }
      p { font-size:13px; line-height:1.6; color:#d1d5db; }
      a.button { display:inline-block; margin-top:16px; padding:10px 18px; background:#2563eb; color:#ffffff; text-decoration:none; border-radius:999px; font-size:13px; }
      .footer { margin-top:24px; font-size:11px; color:#6b7280; border-top:1px solid #1f2937; padding-top:12px; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">BOAZ‑OS Contract</div>
      <h1>Agreement ready for review and digital signature</h1>
      <p>
        A contract has been prepared for you in BOAZ‑OS. To protect confidentiality, the contract details are not shown
        in this email.
      </p>
      <p>
        Step 1: Use the signing username we emailed you.<br/>
        Step 2: Use the one‑time security code we emailed you.<br/>
        Step 3: Click the button below and enter both to view and sign the agreement.
      </p>
      <p>
        <a class="button" href="{{signUrl}}">Open BOAZ‑OS contract signing page</a>
      </p>
      <div class="footer">
        This link is unique to you. If you were not expecting this contract, please contact the sender or your account
        representative and do not forward this email.
      </div>
    </div>
  </body>
</html>
`

    const linkHtmlRendered =
      emailTplHtml != null ? renderTemplateString(emailTplHtml, ctx) : renderTemplateString(linkHtml, ctx)

    {
      const subject = body.emailSubject
      await sendEmail({
        to: inv.email,
        subject,
        html: linkHtmlRendered,
      })
      emailLogs.push({
        to: inv.email,
        subject,
        sentAt: new Date(),
        sentByUserId: creatorId,
        messageId: undefined,
        status: 'Sent',
      })
    }
  }

  // Log audit and append email history on the contract
  const update: any = {
    $set: { updatedAt: new Date() },
    $push: {
      signatureAudit: {
        at: new Date(),
        actorId: creatorId,
        event: 'signature_invites_sent',
        details: `Invites sent to ${body.invites.map((i) => i.email).join(', ')}`,
      },
    },
  }

  if (emailLogs.length) {
    update.$push.emailSends = { $each: emailLogs }
  }

  await coll.updateOne({ _id: contract._id }, update)

  res.json({ data: { invites: invitesWithUrls }, error: null })
})

// POST /api/crm/slas/:id/send-signed - manually email a signed copy to a recipient
const sendSignedSchema = z.object({
  to: z.string().email(),
  subject: z.string().optional(),
})

slasRouter.post('/:id/send-signed', async (req, res) => {
  const parsed = sendSignedSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const { id } = req.params
  if (!ObjectId.isValid(id)) return res.status(400).json({ data: null, error: 'invalid_id' })

  const coll = db.collection<SlaContractDoc>('sla_contracts')
  const contract = await coll.findOne({ _id: new ObjectId(id) })
  if (!contract) return res.status(404).json({ data: null, error: 'not_found' })

  const body = parsed.data

  // Ensure a finalized attachment exists (and email to signers) before manual send
  try {
    await finalizeExecutedContract(contract._id)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to finalize contract before manual send-signed', err)
  }

  const refreshed = await coll.findOne({ _id: contract._id })
  const effectiveContract = refreshed ?? contract

  const signedHtml = buildSignedHtml(effectiveContract)

  const subject =
    body.subject && body.subject.trim().length > 0
      ? body.subject.trim()
      : `Signed contract ${effectiveContract.contractNumber ?? ''} – ${effectiveContract.name}`.trim()

  await sendEmail({
    to: body.to,
    subject,
    html: signedHtml,
  })

  const emailEntry: SlaEmailSend = {
    to: body.to,
    subject,
    sentAt: new Date(),
    sentByUserId: undefined,
    messageId: undefined,
    status: 'Sent',
  }

  await coll.updateOne(
    { _id: effectiveContract._id },
    {
      $set: { updatedAt: new Date() },
      $push: { emailSends: emailEntry },
    },
  )

  res.json({ data: { ok: true }, error: null })
})


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


