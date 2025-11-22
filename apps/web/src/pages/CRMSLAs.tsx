import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'
import { formatDate } from '@/lib/dateFormat'

type AccountPick = { _id: string; accountNumber?: number; name?: string }
type QuotePick = { _id: string; quoteNumber?: number; title?: string; accountId?: string }
type DealPick = { _id: string; dealNumber?: number; title?: string; accountId?: string }

type SlaSeverityTarget = {
  key: string
  label?: string
  responseTargetMinutes?: number | null
  resolutionTargetMinutes?: number | null
}

type SlaEmailSend = {
  to: string
  subject: string
  sentAt: string
  status?: string
}

type SlaContract = {
  _id: string
  accountId: string
  contractNumber?: number | null
  name: string
  type: 'msa' | 'sow' | 'subscription' | 'nda' | 'support' | 'project' | 'other'
  status:
    | 'draft'
    | 'in_review'
    | 'sent'
    | 'partially_signed'
    | 'active'
    | 'expired'
    | 'terminated'
    | 'archived'
    | 'scheduled'
    | 'cancelled'
  startDate?: string | null
  endDate?: string | null
  autoRenew: boolean
  renewalDate?: string | null
  billingFrequency?: string | null
  currency?: string | null
  baseAmountCents?: number | null
  invoiceDueDays?: number | null
  uptimeTargetPercent?: number | null
  supportHours?: string | null
  slaExclusionsSummary?: string | null
  responseTargetMinutes?: number | null
  resolutionTargetMinutes?: number | null
  entitlements?: string
  notes?: string
  severityTargets?: SlaSeverityTarget[]
  customerLegalName?: string | null
  customerAddress?: string | null
  customerExecSponsor?: string | null
  customerTechContact?: string | null
  providerLegalName?: string | null
  providerAddress?: string | null
  providerAccountManager?: string | null
  providerCsm?: string | null
  governingLaw?: string | null
  jurisdiction?: string | null
  paymentTerms?: string | null
  serviceScopeSummary?: string | null
  terminationConditions?: string | null
  changeOrderProcess?: string | null
  dataClassification?: string | null
  hasDataProcessingAddendum?: boolean | null
  changeControlRequiredFor?: string | null
  negotiationStatus?: string | null
  redlineSummary?: string | null
  auditRightsSummary?: string | null
  usageRestrictionsSummary?: string | null
  subprocessorUseSummary?: string | null
  autoIncreasePercentOnRenewal?: number | null
  earlyTerminationFeeModel?: string | null
  upsellCrossSellRights?: string | null
  primaryQuoteId?: string | null
  primaryDealId?: string | null
  coveredAssetTags?: string[] | null
  coveredServiceTags?: string[] | null
  successPlaybookConstraints?: string | null
  signedByCustomer?: string | null
  signedByProvider?: string | null
  signedAtCustomer?: string | null
  signedAtProvider?: string | null
  executedDate?: string | null
  emailSends?: SlaEmailSend[]
}

type SeverityRow = {
  key: string
  label: string
  responseDays: string
  responseHours: string
  resolutionDays: string
  resolutionHours: string
}

const severityTemplate: { key: string; label: string }[] = [
  { key: 'P1', label: 'P1 – Critical / Sev 1' },
  { key: 'P2', label: 'P2 – High / Sev 2' },
  { key: 'P3', label: 'P3 – Medium / Sev 3' },
  { key: 'P4', label: 'P4 – Low / Sev 4' },
]

function minutesToParts(total?: number | null): { days: string; hours: string } {
  if (total == null || isNaN(total)) return { days: '', hours: '' }
  const d = Math.floor(total / (60 * 24))
  const h = Math.floor((total % (60 * 24)) / 60)
  return {
    days: d ? String(d) : '',
    hours: h ? String(h) : '',
  }
}

function partsToMinutes(days: string, hours: string): number | undefined {
  const d = days ? Number(days) : 0
  const h = hours ? Number(hours) : 0
  if (!d && !h) return undefined
  return d * 24 * 60 + h * 60
}

function formatTargetLabel(total?: number | null): string {
  if (total == null || isNaN(total)) return ''
  const mins = total
  const d = Math.floor(mins / (60 * 24))
  const h = Math.floor((mins % (60 * 24)) / 60)
  const m = mins % 60
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (!d && !h && m) parts.push(`${m}m`)
  if (!parts.length) return '0m'
  return parts.join(' ')
}

export default function CRMSLAs() {
  const toast = useToast()
  const qc = useQueryClient()

  const [accountFilter, setAccountFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<
    'all' | SlaContract['status']
  >('all')
  const [typeFilter, setTypeFilter] = React.useState<'all' | 'support' | 'subscription' | 'project' | 'other'>('all')

  const [editing, setEditing] = React.useState<SlaContract | null>(null)
  const [editName, setEditName] = React.useState('')
  const [editType, setEditType] = React.useState<SlaContract['type']>('support')
  const [editStatus, setEditStatus] = React.useState<SlaContract['status']>('active')
  const [editAccountId, setEditAccountId] = React.useState('')
  const [editEffectiveDate, setEditEffectiveDate] = React.useState('')
  const [editStartDate, setEditStartDate] = React.useState('')
  const [editEndDate, setEditEndDate] = React.useState('')
  const [editAutoRenew, setEditAutoRenew] = React.useState(false)
  const [editRenewalDate, setEditRenewalDate] = React.useState('')
  const [editBillingFrequency, setEditBillingFrequency] = React.useState('')
  const [editCurrency, setEditCurrency] = React.useState('')
  const [editBaseAmount, setEditBaseAmount] = React.useState('')
  const [editInvoiceDueDays, setEditInvoiceDueDays] = React.useState('')
  const [editUptimeTarget, setEditUptimeTarget] = React.useState('')
  const [editSupportHours, setEditSupportHours] = React.useState('')
  const [editSlaExclusions, setEditSlaExclusions] = React.useState('')
  const [editDataClassification, setEditDataClassification] = React.useState('')
  const [editHasDpa, setEditHasDpa] = React.useState(false)
  const [editResponseDays, setEditResponseDays] = React.useState('')
  const [editResponseHours, setEditResponseHours] = React.useState('')
  const [editResolutionDays, setEditResolutionDays] = React.useState('')
  const [editResolutionHours, setEditResolutionHours] = React.useState('')
  const [editEntitlements, setEditEntitlements] = React.useState('')
  const [editNotes, setEditNotes] = React.useState('')
  const [editCustomerLegalName, setEditCustomerLegalName] = React.useState('')
  const [editCustomerAddress, setEditCustomerAddress] = React.useState('')
  const [editProviderLegalName, setEditProviderLegalName] = React.useState('')
  const [editProviderAddress, setEditProviderAddress] = React.useState('')
  const [editGoverningLaw, setEditGoverningLaw] = React.useState('')
  const [editJurisdiction, setEditJurisdiction] = React.useState('')
  const [editPaymentTerms, setEditPaymentTerms] = React.useState('')
  const [editServiceScope, setEditServiceScope] = React.useState('')
  const [editTerminationConditions, setEditTerminationConditions] = React.useState('')
  const [editChangeOrderProcess, setEditChangeOrderProcess] = React.useState('')
  const [editChangeControlRequiredFor, setEditChangeControlRequiredFor] = React.useState('')
  const [editNegotiationStatus, setEditNegotiationStatus] = React.useState('')
  const [editRedlineSummary, setEditRedlineSummary] = React.useState('')
  const [editAuditRightsSummary, setEditAuditRightsSummary] = React.useState('')
  const [editUsageRestrictionsSummary, setEditUsageRestrictionsSummary] = React.useState('')
  const [editSubprocessorUseSummary, setEditSubprocessorUseSummary] = React.useState('')
  const [editAutoIncreasePercent, setEditAutoIncreasePercent] = React.useState('')
  const [editEarlyTerminationFeeModel, setEditEarlyTerminationFeeModel] = React.useState('')
  const [editUpsellCrossSellRights, setEditUpsellCrossSellRights] = React.useState('')
  const [editPrimaryQuoteId, setEditPrimaryQuoteId] = React.useState('')
  const [editPrimaryDealId, setEditPrimaryDealId] = React.useState('')
  const [editCoveredAssetTags, setEditCoveredAssetTags] = React.useState('')
  const [editCoveredServiceTags, setEditCoveredServiceTags] = React.useState('')
  const [editSuccessPlaybookConstraints, setEditSuccessPlaybookConstraints] = React.useState('')
  const [severityRows, setSeverityRows] = React.useState<SeverityRow[]>(
    severityTemplate.map((tpl) => ({
      key: tpl.key,
      label: tpl.label,
      responseDays: '',
      responseHours: '',
      resolutionDays: '',
      resolutionHours: '',
    })),
  )

  const accountsQ = useQuery({
    queryKey: ['accounts-pick'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', { params: { limit: 1000, sort: 'name', dir: 'asc' } })
      return res.data as { data: { items: AccountPick[] } }
    },
  })
  const accounts = accountsQ.data?.data.items ?? []
  const accountLabelById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const a of accounts) {
      const label = a.accountNumber ? `#${a.accountNumber} – ${a.name}` : a.name ?? ''
      map.set(a._id, label)
    }
    return map
  }, [accounts])

  // Quotes and deals for primary linkage dropdowns
  const quotesQ = useQuery<{ data: { items: QuotePick[] } }>({
    queryKey: ['quotes-for-slas'],
    queryFn: async () => {
      const res = await http.get('/api/crm/quotes', {
        params: { sort: 'updatedAt', dir: 'desc' },
      })
      return res.data as { data: { items: QuotePick[] } }
    },
  })
  const allQuotes: QuotePick[] = quotesQ.data?.data.items ?? []

  const dealsQ = useQuery<{ data: { items: DealPick[]; total: number } }>({
    queryKey: ['deals-for-slas'],
    queryFn: async () => {
      const res = await http.get('/api/crm/deals', {
        params: { limit: 200, sort: 'closeDate', dir: 'desc' },
      })
      return res.data as { data: { items: DealPick[]; total: number } }
    },
  })
  const allDeals: DealPick[] = dealsQ.data?.data.items ?? []

  const quotesForAccount = React.useMemo(() => {
    if (!editAccountId) return allQuotes
    return allQuotes.filter((q) => q.accountId === editAccountId)
  }, [allQuotes, editAccountId])

  const dealsForAccount = React.useMemo(() => {
    if (!editAccountId) return allDeals
    return allDeals.filter((d) => d.accountId === editAccountId)
  }, [allDeals, editAccountId])

  const slasQ = useQuery<{ data: { items: SlaContract[] } }>({
    queryKey: ['slas', accountFilter, statusFilter, typeFilter],
    queryFn: async () => {
      const params: any = {}
      if (accountFilter) params.accountId = accountFilter
      if (statusFilter !== 'all') params.status = statusFilter
      if (typeFilter !== 'all') params.type = typeFilter
      const res = await http.get('/api/crm/slas', { params })
      return res.data as { data: { items: SlaContract[] } }
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<SlaContract>) => {
      const res = await http.post('/api/crm/slas', payload)
      return res.data as { data: SlaContract }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slas'] })
      toast.showToast('SLA/contract created.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to create SLA.'
      toast.showToast(msg, 'error')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; data: Partial<SlaContract> }) => {
      const res = await http.put(`/api/crm/slas/${payload.id}`, payload.data)
      return res.data as { data: SlaContract }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slas'] })
      toast.showToast('SLA/contract updated.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to update SLA.'
      toast.showToast(msg, 'error')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/crm/slas/${id}`)
      return res.data as { data: { ok: boolean } }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slas'] })
      toast.showToast('SLA/contract deleted.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to delete SLA.'
      toast.showToast(msg, 'error')
    },
  })

  const sendEmailMutation = useMutation({
    mutationFn: async (payload: { id: string; to: string; subject: string }) => {
      const res = await http.post(`/api/crm/slas/${payload.id}/send`, {
        to: payload.to,
        subject: payload.subject,
      })
      return res.data as { data: { ok: boolean } }
    },
    onSuccess: () => {
      toast.showToast('Contract email sent.', 'success')
      qc.invalidateQueries({ queryKey: ['slas'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to send contract email.'
      toast.showToast(msg, 'error')
    },
  })

  function openNew() {
    setEditing({
      _id: '',
      accountId: '',
      name: '',
      type: 'support',
      status: 'active',
      startDate: null,
      endDate: null,
      autoRenew: false,
      renewalDate: null,
      responseTargetMinutes: null,
      resolutionTargetMinutes: null,
      entitlements: '',
      notes: '',
    })
    setEditAccountId(accountFilter || '')
    setEditName('')
    setEditType('support')
    setEditStatus('active')
    setEditCustomerLegalName('')
    setEditCustomerAddress('')
    setEditProviderLegalName('')
    setEditProviderAddress('')
    setEditEffectiveDate('')
    setEditStartDate('')
    setEditEndDate('')
    setEditAutoRenew(false)
    setEditRenewalDate('')
    setEditBillingFrequency('')
    setEditCurrency('')
    setEditBaseAmount('')
    setEditInvoiceDueDays('')
    setEditUptimeTarget('')
    setEditSupportHours('')
    setEditSlaExclusions('')
    setEditDataClassification('')
    setEditHasDpa(false)
    setEditResponseDays('')
    setEditResponseHours('')
    setEditResolutionDays('')
    setEditResolutionHours('')
    setEditEntitlements('')
    setEditNotes('')
    setEditGoverningLaw('')
    setEditJurisdiction('')
    setEditPaymentTerms('')
    setEditServiceScope('')
    setEditTerminationConditions('')
    setEditChangeOrderProcess('')
    setSeverityRows(
      severityTemplate.map((tpl) => ({
        key: tpl.key,
        label: tpl.label,
        responseDays: '',
        responseHours: '',
        resolutionDays: '',
        resolutionHours: '',
      })),
    )
  }

  function openEdit(s: SlaContract) {
    setEditing(s)
    setEditAccountId(s.accountId)
    setEditName(s.name)
    setEditType(s.type)
    setEditStatus(s.status)
    setEditCustomerLegalName(s.customerLegalName ?? '')
    setEditCustomerAddress(s.customerAddress ?? '')
    setEditProviderLegalName(s.providerLegalName ?? '')
    setEditProviderAddress(s.providerAddress ?? '')
    setEditEffectiveDate(s.effectiveDate ? s.effectiveDate.slice(0, 10) : '')
    setEditStartDate(s.startDate ? s.startDate.slice(0, 10) : '')
    setEditEndDate(s.endDate ? s.endDate.slice(0, 10) : '')
    setEditAutoRenew(Boolean(s.autoRenew))
    setEditRenewalDate(s.renewalDate ? s.renewalDate.slice(0, 10) : '')
    setEditBillingFrequency(s.billingFrequency ?? '')
    setEditCurrency(s.currency ?? '')
    setEditBaseAmount(s.baseAmountCents != null ? String(s.baseAmountCents / 100) : '')
    setEditInvoiceDueDays(s.invoiceDueDays != null ? String(s.invoiceDueDays) : '')
    setEditUptimeTarget(s.uptimeTargetPercent != null ? String(s.uptimeTargetPercent) : '')
    setEditSupportHours(s.supportHours ?? '')
    setEditSlaExclusions(s.slaExclusionsSummary ?? '')
    setEditDataClassification(s.dataClassification ?? '')
    setEditHasDpa(Boolean(s.hasDataProcessingAddendum))
    const respParts = minutesToParts(s.responseTargetMinutes ?? null)
    setEditResponseDays(respParts.days)
    setEditResponseHours(respParts.hours)
    const resParts = minutesToParts(s.resolutionTargetMinutes ?? null)
    setEditResolutionDays(resParts.days)
    setEditResolutionHours(resParts.hours)
    const byKey = new Map<string, SlaSeverityTarget>()
    ;(s.severityTargets ?? []).forEach((t) => {
      if (t.key) byKey.set(t.key, t)
    })
    setSeverityRows(
      severityTemplate.map((tpl) => {
        const existing = byKey.get(tpl.key)
        const resp = minutesToParts(existing?.responseTargetMinutes ?? null)
        const res = minutesToParts(existing?.resolutionTargetMinutes ?? null)
        return {
          key: tpl.key,
          label: tpl.label,
          responseDays: resp.days,
          responseHours: resp.hours,
          resolutionDays: res.days,
          resolutionHours: res.hours,
        }
      }),
    )
    setEditEntitlements(s.entitlements ?? '')
    setEditNotes(s.notes ?? '')
    setEditGoverningLaw(s.governingLaw ?? '')
    setEditJurisdiction(s.jurisdiction ?? '')
    setEditPaymentTerms(s.paymentTerms ?? '')
    setEditServiceScope(s.serviceScopeSummary ?? '')
    setEditTerminationConditions(s.terminationConditions ?? '')
    setEditChangeOrderProcess(s.changeOrderProcess ?? '')
    setEditChangeControlRequiredFor(s.changeControlRequiredFor ?? '')
    setEditNegotiationStatus(s.negotiationStatus ?? '')
    setEditRedlineSummary(s.redlineSummary ?? '')
    setEditAuditRightsSummary(s.auditRightsSummary ?? '')
    setEditUsageRestrictionsSummary(s.usageRestrictionsSummary ?? '')
    setEditSubprocessorUseSummary(s.subprocessorUseSummary ?? '')
    setEditAutoIncreasePercent(
      s.autoIncreasePercentOnRenewal != null ? String(s.autoIncreasePercentOnRenewal) : '',
    )
    setEditEarlyTerminationFeeModel(s.earlyTerminationFeeModel ?? '')
    setEditUpsellCrossSellRights(s.upsellCrossSellRights ?? '')
    setEditPrimaryQuoteId(s.primaryQuoteId ?? '')
    setEditPrimaryDealId(s.primaryDealId ?? '')
    setEditCoveredAssetTags((s.coveredAssetTags ?? []).join(', '))
    setEditCoveredServiceTags((s.coveredServiceTags ?? []).join(', '))
    setEditSuccessPlaybookConstraints(s.successPlaybookConstraints ?? '')
  }

  function closeModal() {
    setEditing(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editAccountId) {
      toast.showToast('Account is required.', 'error')
      return
    }
    if (!editName.trim()) {
      toast.showToast('Name is required.', 'error')
      return
    }
    const responseMinutes = partsToMinutes(editResponseDays, editResponseHours)
    const resolutionMinutes = partsToMinutes(editResolutionDays, editResolutionHours)

    const severityTargets = severityRows
      .map((row) => {
        const resp = partsToMinutes(row.responseDays, row.responseHours)
        const res = partsToMinutes(row.resolutionDays, row.resolutionHours)
        if (resp == null && res == null) return null
        return {
          key: row.key,
          label: row.label,
          responseTargetMinutes: resp,
          resolutionTargetMinutes: res,
        } as SlaSeverityTarget
      })
      .filter((x): x is SlaSeverityTarget => Boolean(x))

    const payload: Partial<SlaContract> = {
      accountId: editAccountId,
      name: editName.trim(),
      type: editType,
      status: editStatus,
      effectiveDate: editEffectiveDate || undefined,
      startDate: editStartDate || undefined,
      endDate: editEndDate || undefined,
      autoRenew: editAutoRenew,
      renewalDate: editRenewalDate || undefined,
      billingFrequency: editBillingFrequency.trim() || undefined,
      currency: editCurrency.trim() || undefined,
      baseAmountCents: editBaseAmount ? Math.round(Number(editBaseAmount) * 100) : undefined,
      invoiceDueDays: editInvoiceDueDays ? Number(editInvoiceDueDays) : undefined,
      uptimeTargetPercent: editUptimeTarget ? Number(editUptimeTarget) : undefined,
      supportHours: editSupportHours.trim() || undefined,
      slaExclusionsSummary: editSlaExclusions.trim() || undefined,
      dataClassification: editDataClassification.trim() || undefined,
      hasDataProcessingAddendum: editHasDpa || undefined,
      responseTargetMinutes: responseMinutes,
      resolutionTargetMinutes: resolutionMinutes,
      entitlements: editEntitlements.trim() || undefined,
      notes: editNotes.trim() || undefined,
      customerLegalName: editCustomerLegalName.trim() || undefined,
      customerAddress: editCustomerAddress.trim() || undefined,
      providerLegalName: editProviderLegalName.trim() || undefined,
      providerAddress: editProviderAddress.trim() || undefined,
      governingLaw: editGoverningLaw.trim() || undefined,
      jurisdiction: editJurisdiction.trim() || undefined,
      paymentTerms: editPaymentTerms.trim() || undefined,
      serviceScopeSummary: editServiceScope.trim() || undefined,
      terminationConditions: editTerminationConditions.trim() || undefined,
      changeOrderProcess: editChangeOrderProcess.trim() || undefined,
      changeControlRequiredFor: editChangeControlRequiredFor.trim() || undefined,
      negotiationStatus: editNegotiationStatus.trim() || undefined,
      redlineSummary: editRedlineSummary.trim() || undefined,
      auditRightsSummary: editAuditRightsSummary.trim() || undefined,
      usageRestrictionsSummary: editUsageRestrictionsSummary.trim() || undefined,
      subprocessorUseSummary: editSubprocessorUseSummary.trim() || undefined,
      autoIncreasePercentOnRenewal: editAutoIncreasePercent
        ? Number(editAutoIncreasePercent)
        : undefined,
      earlyTerminationFeeModel: editEarlyTerminationFeeModel.trim() || undefined,
      upsellCrossSellRights: editUpsellCrossSellRights.trim() || undefined,
      primaryQuoteId: editPrimaryQuoteId.trim() || undefined,
      primaryDealId: editPrimaryDealId.trim() || undefined,
      coveredAssetTags: editCoveredAssetTags
        ? editCoveredAssetTags.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      coveredServiceTags: editCoveredServiceTags
        ? editCoveredServiceTags.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      successPlaybookConstraints: editSuccessPlaybookConstraints.trim() || undefined,
      severityTargets: severityTargets.length ? severityTargets : undefined,
    }
    try {
      if (!editing || !editing._id) {
        await createMutation.mutateAsync(payload)
      } else {
        await updateMutation.mutateAsync({ id: editing._id, data: payload })
      }
      closeModal()
    } catch {
      // handled in mutation
    }
  }

  const rows = slasQ.data?.data.items ?? []

  return (
    <div className="space-y-4">
      <CRMNav />
      <header className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contracts &amp; SLAs</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Track customer contracts, SLAs, and response/resolution targets tied to Accounts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
          >
            New SLA / contract
          </button>
        </div>
      </header>

      <section className="px-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="min-w-[200px] rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
          >
            <option value="">Accounts (all)</option>
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.accountNumber ? `#${a.accountNumber} – ` : ''}
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
          >
            <option value="all">Status (all)</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
          >
            <option value="all">Type (all)</option>
            <option value="support">Support</option>
            <option value="subscription">Subscription</option>
            <option value="project">Project</option>
            <option value="other">Other</option>
          </select>
        </div>
      </section>

      <section className="px-4">
        <div className="overflow-x-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[color:var(--color-muted)] text-xs text-[color:var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Start</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">End</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Response target</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Resolution target</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-6 text-center text-xs text-[color:var(--color-text-muted)]"
                  >
                    No contracts / SLAs match the current filters.
                  </td>
                </tr>
              )}
              {rows.map((s) => {
                const accountLabel = accountLabelById.get(s.accountId) ?? s.accountId
                return (
                  <tr key={s._id} className="border-t border-[color:var(--color-border-soft)]">
                    <td className="px-3 py-2 align-top text-xs">{accountLabel}</td>
                    <td className="px-3 py-2 align-top text-xs">{s.name}</td>
                    <td className="px-3 py-2 align-top text-xs capitalize">{s.type}</td>
                    <td className="px-3 py-2 align-top text-xs capitalize">{s.status}</td>
                    <td className="px-3 py-2 align-top text-xs whitespace-nowrap">
                      {s.startDate ? formatDate(s.startDate) : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-xs whitespace-nowrap">
                      {s.endDate ? formatDate(s.endDate) : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-xs whitespace-nowrap">
                      {s.responseTargetMinutes != null ? formatTargetLabel(s.responseTargetMinutes) : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-xs whitespace-nowrap">
                      {s.resolutionTargetMinutes != null ? formatTargetLabel(s.resolutionTargetMinutes) : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-right text-xs">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]"
                          onClick={() => openEdit(s)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]"
                          onClick={async () => {
                            const to = window.prompt('BOAZ says: Who should receive this contract email? (enter email address)')
                            if (!to) return
                            const subjectPrompt = window.prompt(
                              'BOAZ says: What subject should we use for this contract email?',
                              `Contract ${s.contractNumber ?? ''} – ${s.name}`
                            )
                            const subject = subjectPrompt || `Contract ${s.contractNumber ?? ''} – ${s.name}`
                            try {
                              await sendEmailMutation.mutateAsync({ id: s._id, to, subject })
                            } catch {
                              // handled by mutation
                            }
                          }}
                        >
                          Email
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-500/60 px-2 py-1 text-red-200 hover:bg-red-500/15"
                          onClick={async () => {
                            if (!window.confirm('Delete this SLA / contract?')) return
                            await deleteMutation.mutateAsync(s._id)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <div className="fixed inset-0 z-[2147483647]">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,48rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <h2 className="text-base font-semibold">
                    {editing._id ? 'Edit contract / SLA' : 'New contract / SLA'}
                  </h2>
                  {editing.contractNumber != null && (
                    <div className="text-[11px] text-[color:var(--color-text-muted)]">
                      Contract #{editing.contractNumber} · Status: {editing.status}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-full border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                >
                  Close
                </button>
              </div>
              <form onSubmit={handleSave} className="space-y-3 text-sm">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Account</label>
                    <select
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editAccountId}
                      onChange={(e) => setEditAccountId(e.target.value)}
                    >
                      <option value="">Select account…</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.accountNumber ? `#${a.accountNumber} – ` : ''}
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Customer legal name</label>
                    <input
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editCustomerLegalName}
                      onChange={(e) => setEditCustomerLegalName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Customer address</label>
                    <textarea
                      className="min-h-[40px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editCustomerAddress}
                      onChange={(e) => setEditCustomerAddress(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Provider legal name</label>
                    <input
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editProviderLegalName}
                      onChange={(e) => setEditProviderLegalName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Provider address</label>
                    <textarea
                      className="min-h-[40px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editProviderAddress}
                      onChange={(e) => setEditProviderAddress(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Name</label>
                    <input
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Type</label>
                    <select
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as any)}
                    >
                      <option value="support">Support</option>
                      <option value="subscription">Subscription</option>
                      <option value="project">Project</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Status</label>
                    <select
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as any)}
                    >
                      <option value="active">Active</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="expired">Expired</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Effective date</label>
                    <input
                      type="date"
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editEffectiveDate}
                      onChange={(e) => setEditEffectiveDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Start date</label>
                    <input
                      type="date"
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">End date</label>
                    <input
                      type="date"
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Auto-renew</label>
                    <div className="flex items-center gap-2">
                      <input
                        id="sla-auto-renew"
                        type="checkbox"
                        checked={editAutoRenew}
                        onChange={(e) => setEditAutoRenew(e.target.checked)}
                      />
                      <label htmlFor="sla-auto-renew" className="text-xs">
                        Automatically renew on renewal date
                      </label>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Renewal date</label>
                    <input
                      type="date"
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                      value={editRenewalDate}
                      onChange={(e) => setEditRenewalDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Default response target</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        placeholder="Days"
                        value={editResponseDays}
                        onChange={(e) => setEditResponseDays(e.target.value)}
                      />
                      <input
                        type="number"
                        min={0}
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        placeholder="Hours"
                        value={editResponseHours}
                        onChange={(e) => setEditResponseHours(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Default resolution target</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        placeholder="Days"
                        value={editResolutionDays}
                        onChange={(e) => setEditResolutionDays(e.target.value)}
                      />
                      <input
                        type="number"
                        min={0}
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        placeholder="Hours"
                        value={editResolutionHours}
                        onChange={(e) => setEditResolutionHours(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-medium">Per-priority targets (optional)</label>
                    <span className="text-[10px] text-[color:var(--color-text-muted)]">
                      Override by severity (P1/P2/P3/P4) where needed.
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-bg)]">
                    <table className="min-w-full text-[11px]">
                      <thead className="bg-[color:var(--color-muted)] text-[10px] text-[color:var(--color-text-muted)]">
                        <tr>
                          <th className="px-2 py-1 text-left">Priority</th>
                          <th className="px-2 py-1 text-left whitespace-nowrap">Response (d / h)</th>
                          <th className="px-2 py-1 text-left whitespace-nowrap">Resolution (d / h)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {severityRows.map((row, idx) => (
                          <tr key={row.key} className="border-t border-[color:var(--color-border-soft)]">
                            <td className="px-2 py-1 align-top">{row.label}</td>
                            <td className="px-2 py-1 align-top">
                              <div className="flex gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  className="w-16 rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-1 py-0.5 text-[11px]"
                                  placeholder="d"
                                  value={row.responseDays}
                                  onChange={(e) => {
                                    const next = [...severityRows]
                                    next[idx] = { ...next[idx], responseDays: e.target.value }
                                    setSeverityRows(next)
                                  }}
                                />
                                <input
                                  type="number"
                                  min={0}
                                  className="w-16 rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-1 py-0.5 text-[11px]"
                                  placeholder="h"
                                  value={row.responseHours}
                                  onChange={(e) => {
                                    const next = [...severityRows]
                                    next[idx] = { ...next[idx], responseHours: e.target.value }
                                    setSeverityRows(next)
                                  }}
                                />
                              </div>
                            </td>
                            <td className="px-2 py-1 align-top">
                              <div className="flex gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  className="w-16 rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-1 py-0.5 text-[11px]"
                                  placeholder="d"
                                  value={row.resolutionDays}
                                  onChange={(e) => {
                                    const next = [...severityRows]
                                    next[idx] = { ...next[idx], resolutionDays: e.target.value }
                                    setSeverityRows(next)
                                  }}
                                />
                                <input
                                  type="number"
                                  min={0}
                                  className="w-16 rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-1 py-0.5 text-[11px]"
                                  placeholder="h"
                                  value={row.resolutionHours}
                                  onChange={(e) => {
                                    const next = [...severityRows]
                                    next[idx] = { ...next[idx], resolutionHours: e.target.value }
                                    setSeverityRows(next)
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Entitlements</label>
                  <textarea
                    className="min-h-[60px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                    value={editEntitlements}
                    onChange={(e) => setEditEntitlements(e.target.value)}
                    placeholder="Included services, hours, channels, or product entitlements."
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Notes</label>
                  <textarea
                    className="min-h-[60px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Additional context, special terms, or internal comments."
                  />
                </div>

                <div className="space-y-3 rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-bg-elevated)] p-3">
                  <div className="text-xs font-semibold">Legal terms &amp; specs</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Governing law</label>
                      <input
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editGoverningLaw}
                        onChange={(e) => setEditGoverningLaw(e.target.value)}
                        placeholder="e.g., State of North Carolina"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Jurisdiction</label>
                      <input
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editJurisdiction}
                        onChange={(e) => setEditJurisdiction(e.target.value)}
                        placeholder="e.g., Wake County, NC"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Payment terms</label>
                      <input
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editPaymentTerms}
                        onChange={(e) => setEditPaymentTerms(e.target.value)}
                        placeholder="e.g., Net 30"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Service scope summary</label>
                      <textarea
                        className="min-h-[60px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editServiceScope}
                        onChange={(e) => setEditServiceScope(e.target.value)}
                        placeholder="Summary of services covered"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Termination conditions</label>
                      <textarea
                        className="min-h-[60px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editTerminationConditions}
                        onChange={(e) => setEditTerminationConditions(e.target.value)}
                        placeholder="Conditions for contract termination"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Change order process</label>
                      <textarea
                        className="min-h-[60px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editChangeOrderProcess}
                        onChange={(e) => setEditChangeOrderProcess(e.target.value)}
                        placeholder="Process for change orders"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Change control required for</label>
                      <input
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editChangeControlRequiredFor}
                        onChange={(e) => setEditChangeControlRequiredFor(e.target.value)}
                        placeholder="e.g., Changes > $10k"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Negotiation status</label>
                      <input
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editNegotiationStatus}
                        onChange={(e) => setEditNegotiationStatus(e.target.value)}
                        placeholder="e.g., In negotiation, Finalized"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="block text-xs font-medium">Redline summary</label>
                      <textarea
                        className="min-h-[60px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editRedlineSummary}
                        onChange={(e) => setEditRedlineSummary(e.target.value)}
                        placeholder="Summary of redline changes"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-bg-elevated)] p-3">
                  <div className="text-xs font-semibold">Commercial &amp; renewal levers</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Billing frequency</label>
                      <input
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editBillingFrequency}
                        onChange={(e) => setEditBillingFrequency(e.target.value)}
                        placeholder="e.g., Monthly, Quarterly, Annually"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Currency</label>
                      <input
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editCurrency}
                        onChange={(e) => setEditCurrency(e.target.value)}
                        placeholder="e.g., USD"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Base amount</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editBaseAmount}
                        onChange={(e) => setEditBaseAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Invoice due (days)</label>
                      <input
                        type="number"
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editInvoiceDueDays}
                        onChange={(e) => setEditInvoiceDueDays(e.target.value)}
                        placeholder="e.g., 30"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Auto increase on renewal (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editAutoIncreasePercent}
                        onChange={(e) => setEditAutoIncreasePercent(e.target.value)}
                        placeholder="e.g., 3.0"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Early termination fee model</label>
                      <input
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editEarlyTerminationFeeModel}
                        onChange={(e) => setEditEarlyTerminationFeeModel(e.target.value)}
                        placeholder="e.g., 50% of remaining value"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="block text-xs font-medium">Upsell / cross-sell rights</label>
                      <textarea
                        className="min-h-[60px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editUpsellCrossSellRights}
                        onChange={(e) => setEditUpsellCrossSellRights(e.target.value)}
                        placeholder="Rights and restrictions for upsell/cross-sell"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-bg-elevated)] p-3">
                  <div className="text-xs font-semibold">Audit, rights &amp; compliance</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Uptime target (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={100}
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editUptimeTarget}
                        onChange={(e) => setEditUptimeTarget(e.target.value)}
                        placeholder="e.g., 99.9"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Support hours</label>
                      <input
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editSupportHours}
                        onChange={(e) => setEditSupportHours(e.target.value)}
                        placeholder="e.g., 24/7, Business hours"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="block text-xs font-medium">SLA exclusions summary</label>
                      <textarea
                        className="min-h-[60px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editSlaExclusions}
                        onChange={(e) => setEditSlaExclusions(e.target.value)}
                        placeholder="Summary of SLA exclusions"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Data classification</label>
                      <input
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editDataClassification}
                        onChange={(e) => setEditDataClassification(e.target.value)}
                        placeholder="e.g., Public, Internal, Confidential"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">DPA in place?</label>
                      <div className="flex items-center gap-2">
                        <input
                          id="sla-has-dpa"
                          type="checkbox"
                          checked={editHasDpa}
                          onChange={(e) => setEditHasDpa(e.target.checked)}
                        />
                        <label htmlFor="sla-has-dpa" className="text-xs">
                          Data Processing Addendum attached
                        </label>
                      </div>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="block text-xs font-medium">Audit rights summary</label>
                      <textarea
                        className="min-h-[60px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editAuditRightsSummary}
                        onChange={(e) => setEditAuditRightsSummary(e.target.value)}
                        placeholder="Summary of audit rights"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="block text-xs font-medium">Usage restrictions summary</label>
                      <textarea
                        className="min-h-[60px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editUsageRestrictionsSummary}
                        onChange={(e) => setEditUsageRestrictionsSummary(e.target.value)}
                        placeholder="Summary of usage restrictions"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="block text-xs font-medium">Subprocessor use summary</label>
                      <textarea
                        className="min-h-[60px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editSubprocessorUseSummary}
                        onChange={(e) => setEditSubprocessorUseSummary(e.target.value)}
                        placeholder="Summary of subprocessor usage"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-bg-elevated)] p-3">
                  <div className="text-xs font-semibold">Links &amp; playbooks</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Primary quote</label>
                      <select
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editPrimaryQuoteId}
                        onChange={(e) => setEditPrimaryQuoteId(e.target.value)}
                      >
                        <option value="">No primary quote</option>
                        {quotesForAccount.map((q) => (
                          <option key={q._id} value={q._id}>
                            {q.quoteNumber ? `#${q.quoteNumber} – ` : ''}
                            {q.title || '(untitled)'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Primary deal</label>
                      <select
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editPrimaryDealId}
                        onChange={(e) => setEditPrimaryDealId(e.target.value)}
                      >
                        <option value="">No primary deal</option>
                        {dealsForAccount.map((d) => (
                          <option key={d._id} value={d._id}>
                            {d.dealNumber ? `#${d.dealNumber} – ` : ''}
                            {d.title || '(untitled)'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Covered asset tags</label>
                      <input
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editCoveredAssetTags}
                        onChange={(e) => setEditCoveredAssetTags(e.target.value)}
                        placeholder="Comma-separated tags"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium">Covered service tags</label>
                      <input
                        className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editCoveredServiceTags}
                        onChange={(e) => setEditCoveredServiceTags(e.target.value)}
                        placeholder="Comma-separated tags"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="block text-xs font-medium">Success playbook constraints</label>
                      <textarea
                        className="min-h-[60px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
                        value={editSuccessPlaybookConstraints}
                        onChange={(e) => setEditSuccessPlaybookConstraints(e.target.value)}
                        placeholder="Constraints for success playbooks"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-bg-elevated)] p-3 text-[11px]">
                  <div className="font-semibold">Signatures &amp; history</div>
                  {editing._id ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-0.5">
                        <div>
                          <span className="text-[color:var(--color-text-muted)]">Customer:</span>{' '}
                          {editing.signedByCustomer || editing.customerLegalName || '-'}
                          {editing.signedAtCustomer && (
                            <span className="text-[color:var(--color-text-muted)]">
                              {' '}
                              · {formatDate(editing.signedAtCustomer)}
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="text-[color:var(--color-text-muted)]">Provider:</span>{' '}
                          {editing.signedByProvider || editing.providerLegalName || '-'}
                          {editing.signedAtProvider && (
                            <span className="text-[color:var(--color-text-muted)]">
                              {' '}
                              · {formatDate(editing.signedAtProvider)}
                            </span>
                          )}
                        </div>
                        {editing.executedDate && (
                          <div>
                            <span className="text-[color:var(--color-text-muted)]">Executed:</span>{' '}
                            {formatDate(editing.executedDate)}
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-[color:var(--color-text-muted)]">Emails sent:</div>
                        {(editing.emailSends ?? []).length === 0 && (
                          <div className="text-[color:var(--color-text-muted)]">
                            No contract emails sent yet.
                          </div>
                        )}
                        {(editing.emailSends ?? []).map((e, i) => (
                          <div key={`${e.sentAt}-${i}`} className="flex items-center justify-between gap-2">
                            <div className="truncate">
                              <span className="font-medium">{e.subject}</span>{' '}
                              <span className="text-[color:var(--color-text-muted)]">→ {e.to}</span>
                            </div>
                            <span className="whitespace-nowrap text-[color:var(--color-text-muted)]">
                              {formatDate(e.sentAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[color:var(--color-text-muted)]">
                      Save the contract to start tracking signatures and email history.
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-[color:var(--color-text-muted)]">
                  <div>
                    Link SLAs to Accounts to guide support priorities and renewal conversations.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="rounded-xl border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-xl bg-[color:var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-soft)]"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


