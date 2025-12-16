import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { getPortalUrl } from '@/lib/urls'
import { useToast } from '@/components/Toast'
import { useAccessToken } from '@/components/Auth'

type LicenseAlertRow = {
  _id: string
  productStatus?: string
  renewalStatus: string
  expirationDate?: string | null
}

export default function CRMHub() {
  const toast = useToast()
  const token = useAccessToken()

  const { data: rolesData } = useQuery<{ roles: Array<{ name: string; permissions: string[] }>; isAdmin?: boolean }>({
    queryKey: ['user', 'roles'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me/roles')
      return res.data
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const isAdmin = rolesData?.roles?.some((r) => r.name === 'admin') || rolesData?.isAdmin || false

  const items: { label: string; desc: string; href: string }[] = [
    { label: 'Acceptance Queue', desc: 'View quotes accepted by signers', href: '/apps/crm/quotes/acceptance-queue' },
    { label: 'Accounts', desc: 'Companies and organizations', href: '/apps/crm/accounts' },
    {
      label: 'Approval Queue',
      desc: 'Review and approve quote requests',
      href: '/apps/crm/quotes/approval-queue',
    },
    {
      label: 'Assets / Installed Base',
      desc: 'Customer environments, installed products, and licenses',
      href: '/apps/crm/assets',
    },
    { label: 'Contacts', desc: 'People and relationships', href: '/apps/crm/contacts' },
    {
      label: 'Customer Success',
      desc: 'Health scores, risk, and success playbooks across accounts',
      href: '/apps/crm/success',
    },
    { label: 'Deal Approval Queue', desc: 'Review and approve deal requests', href: '/apps/crm/deals/approval-queue' },
    { label: 'Deals', desc: 'Pipeline and opportunities', href: '/apps/crm/deals' },
    { label: 'Documents', desc: 'File attachments, version control, and permissions', href: '/apps/crm/documents' },
    {
      label: 'Contracts & SLAs',
      desc: 'Customer contracts, entitlements, and SLA targets',
      href: '/apps/crm/slas',
    },
    { label: 'Invoices', desc: 'Billing, payments, and refunds', href: '/apps/crm/invoices' },
    { label: 'Knowledge Base', desc: 'Articles and self‑service help', href: '/apps/crm/support/kb' },
    { label: 'Marketing', desc: 'Campaigns, segments, analytics', href: '/apps/crm/marketing' },
    { label: 'Outreach', desc: 'Email/SMS templates, sequences, events', href: '/apps/crm/outreach/templates' },
    { label: 'Payment Portal', desc: 'Process online payments, record phone/mail payments, and view payment history', href: '/apps/crm/payments' },
    { label: 'Products', desc: 'Product catalog, bundles, discounts, and terms', href: '/apps/crm/products' },
    {
      label: 'Vendors',
      desc: 'Software, hardware, and service vendors tied to assets and contracts',
      href: '/apps/crm/vendors',
    },
    {
      label: 'Projects & Delivery',
      desc: 'Customer implementations, onboarding projects, and delivery work',
      href: '/apps/crm/projects',
    },
    { label: 'Quotes', desc: 'Quotes, proposals, and e-sign', href: '/apps/crm/quotes' },
    {
      label: 'Renewals & Subscriptions',
      desc: 'Renewal pipeline, health, churn risk, upsell, MRR/ARR',
      href: '/apps/crm/renewals',
    },
    {
      label: 'Revenue Intelligence',
      desc: 'AI-powered deal scoring, pipeline forecasting, and rep performance analytics',
      href: '/apps/crm/revenue-intelligence',
    },
    {
      label: 'Reporting',
      desc: 'Competitive-edge dashboards and exports across pipeline, service, and marketing',
      href: '/apps/crm/reporting',
    },
    {
      label: 'Integrations',
      desc: 'Webhooks and API keys to connect BOAZ with external systems',
      href: '/apps/crm/integrations',
    },
    {
      label: 'Scheduler',
      desc: 'Appointments, booking links, and CRM meeting tasks',
      href: '/apps/scheduler',
    },
    { label: 'Surveys & Feedback', desc: 'NPS/CSAT and post‑interaction surveys', href: '/apps/crm/surveys' },
    {
      label: 'Tasks & Activities',
      desc: 'Calls, meetings, and to‑dos tied to CRM records',
      href: '/apps/crm/tasks',
    },
    { label: 'Tickets', desc: 'Support tickets and SLAs', href: '/apps/crm/support/tickets' },
  ]

  const visibleItems = React.useMemo(() => {
    if (isAdmin) return items
    return items.filter((it) => it.label !== 'Integrations')
  }, [items, isAdmin])

  const assetsAlertsQ = useQuery({
    queryKey: ['assets-license-alerts-dashboard'],
    queryFn: async () => {
      const res = await http.get('/api/assets/license-report', {
        params: { windowDays: 90 },
      })
      return res.data as { data: { items: LicenseAlertRow[] } }
    },
  })

  const assetsAlertSummary = React.useMemo(() => {
    const items = assetsAlertsQ.data?.data.items ?? []
    const now = new Date()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

    let expiring30 = 0
    let expiring60 = 0
    let expiring90 = 0
    let expired = 0
    let needsUpgrade = 0
    let pendingRenewalProducts = 0

    for (const row of items) {
      if (row.productStatus === 'Needs Upgrade') needsUpgrade++
      if (row.productStatus === 'Pending Renewal') pendingRenewalProducts++

      if (!row.expirationDate) continue
      const d = new Date(row.expirationDate)
      if (!Number.isFinite(d.getTime())) continue
      if (d < now) {
        expired++
      } else if (d <= in30Days) {
        expiring30++
      } else if (d <= in60Days) {
        expiring60++
      } else if (d <= in90Days) {
        expiring90++
      }
    }

    return { expiring30, expiring60, expiring90, expired, needsUpgrade, pendingRenewalProducts }
  }, [assetsAlertsQ.data?.data.items])

  const accountsQ = useQuery({
    queryKey: ['hub-onboarding-accounts'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', {
        params: { limit: 200, sort: 'name', dir: 'asc' },
      })
      return res.data as { data: { items: Array<{ _id: string; accountNumber?: number; name?: string }> } }
    },
  })
  const accounts = accountsQ.data?.data.items ?? []
  const [onboardingAccountId, setOnboardingAccountId] = React.useState('')
  const [onboardingMode, setOnboardingMode] = React.useState<'existing' | 'new'>('existing')
  const [newAccountName, setNewAccountName] = React.useState('')
  const [newCompanyName, setNewCompanyName] = React.useState('')
  const [newPrimaryName, setNewPrimaryName] = React.useState('')
  const [newPrimaryEmail, setNewPrimaryEmail] = React.useState('')
  const [newPrimaryPhone, setNewPrimaryPhone] = React.useState('')

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">CRM Hub</h1>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map((it) => (
          <li key={it.label}>
            <a
              href={it.href}
              className="block h-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 hover:bg-[color:var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary)] focus:ring-offset-2 focus:ring-offset-[color:var(--color-bg)]"
            >
              <div className="text-base font-semibold leading-6">{it.label}</div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--color-text-muted)]">
                {it.desc}
              </div>
              {it.label === 'Assets / Installed Base' && (
                <div className="mt-3 space-y-1 text-[11px]">
                  {assetsAlertsQ.isLoading ? (
                    <div className="text-[color:var(--color-text-muted)]">Loading asset alerts…</div>
                  ) : (
                    <>
                      {assetsAlertSummary.expired === 0 &&
                      assetsAlertSummary.expiring30 === 0 &&
                      assetsAlertSummary.expiring60 === 0 &&
                      assetsAlertSummary.expiring90 === 0 &&
                      assetsAlertSummary.needsUpgrade === 0 &&
                      assetsAlertSummary.pendingRenewalProducts === 0 ? (
                        <div className="text-[color:var(--color-text-muted)]">
                          No major asset or renewal alerts in the next 90 days.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {assetsAlertSummary.expired > 0 && (
                            <span className="inline-flex items-center rounded-full border border-red-500/70 bg-red-500/15 px-2 py-0.5 text-[10px] text-red-200">
                              {assetsAlertSummary.expired} expired
                            </span>
                          )}
                          {assetsAlertSummary.expiring30 > 0 && (
                            <span className="inline-flex items-center rounded-full border border-amber-500/70 bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-100">
                              {assetsAlertSummary.expiring30} expiring ≤30d
                            </span>
                          )}
                          {assetsAlertSummary.expiring60 > 0 && (
                            <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100">
                              {assetsAlertSummary.expiring60} expiring ≤60d
                            </span>
                          )}
                          {assetsAlertSummary.expiring90 > 0 && (
                            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/5 px-2 py-0.5 text-[10px] text-amber-50">
                              {assetsAlertSummary.expiring90} expiring ≤90d
                            </span>
                          )}
                          {assetsAlertSummary.needsUpgrade > 0 && (
                            <span className="inline-flex items-center rounded-full border border-sky-500/60 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-100">
                              {assetsAlertSummary.needsUpgrade} need upgrade
                            </span>
                          )}
                          {assetsAlertSummary.pendingRenewalProducts > 0 && (
                            <span className="inline-flex items-center rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-100">
                              {assetsAlertSummary.pendingRenewalProducts} pending renewal
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </a>
          </li>
        ))}
        <li key="New customer onboarding">
          <div className="block h-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
            <div className="text-base font-semibold leading-6">New customer onboarding</div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--color-text-muted)]">
              Launch an onboarding project, contracts, and success monitoring for a specific account.
            </div>
            <div className="mt-3 flex flex-col gap-2 text-[11px] text-[color:var(--color-text-muted)]">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide">
                <button
                  type="button"
                  onClick={() => setOnboardingMode('existing')}
                  className={`rounded-full border px-2 py-0.5 ${
                    onboardingMode === 'existing'
                      ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary-soft)] text-[color:var(--color-text)]'
                      : 'border-[color:var(--color-border)] text-[color:var(--color-text-muted)]'
                  }`}
                >
                  Use existing account
                </button>
                <button
                  type="button"
                  onClick={() => setOnboardingMode('new')}
                  className={`rounded-full border px-2 py-0.5 ${
                    onboardingMode === 'new'
                      ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary-soft)] text-[color:var(--color-text)]'
                      : 'border-[color:var(--color-border)] text-[color:var(--color-text-muted)]'
                  }`}
                >
                  Create new account
                </button>
              </div>
              {onboardingMode === 'existing' ? (
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide">
                    Choose account
                  </label>
                  <select
                    value={onboardingAccountId}
                    onChange={(e) => setOnboardingAccountId(e.target.value)}
                    className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-[11px]"
                  >
                    <option value="">
                      {accountsQ.isLoading ? 'Loading accounts…' : 'Select account…'}
                    </option>
                    {accounts.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.accountNumber ? `#${a.accountNumber} – ` : ''}
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide">
                    New account details
                  </label>
                  <input
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="Account name *"
                    className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-[11px]"
                  />
                  <input
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="Company name (optional)"
                    className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-[11px]"
                  />
                  <input
                    value={newPrimaryName}
                    onChange={(e) => setNewPrimaryName(e.target.value)}
                    placeholder="Primary contact name (optional)"
                    className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-[11px]"
                  />
                  <input
                    value={newPrimaryEmail}
                    onChange={(e) => setNewPrimaryEmail(e.target.value)}
                    placeholder="Primary contact email (optional)"
                    className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-[11px]"
                  />
                  <input
                    value={newPrimaryPhone}
                    onChange={(e) => setNewPrimaryPhone(e.target.value)}
                    placeholder="Primary contact phone (optional)"
                    className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-[11px]"
                  />
                </div>
              )}
              <button
                type="button"
                disabled={
                  onboardingMode === 'existing'
                    ? !onboardingAccountId
                    : !newAccountName.trim()
                }
                onClick={async () => {
                  try {
                    if (onboardingMode === 'existing') {
                      if (!onboardingAccountId) return
                      window.location.href = `/apps/crm/accounts?openAccountId=${encodeURIComponent(
                        onboardingAccountId,
                      )}&onboarding=1`
                      return
                    }
                    // Create new account then jump into onboarding wizard
                    if (!newAccountName.trim()) {
                      toast.showToast('BOAZ says: Account name is required.', 'error')
                      return
                    }
                    const res = await http.post('/api/crm/accounts', {
                      name: newAccountName.trim(),
                      companyName: newCompanyName.trim() || undefined,
                      primaryContactName: newPrimaryName.trim() || undefined,
                      primaryContactEmail: newPrimaryEmail.trim() || undefined,
                      primaryContactPhone: newPrimaryPhone.trim() || undefined,
                    })
                    const acc = (res as any).data?.data ?? res.data?.data
                    const accountId = acc?._id
                    if (!accountId) {
                      toast.showToast('BOAZ says: Account was created but no ID was returned.', 'error')
                      return
                    }
                    toast.showToast('BOAZ says: Account created. Opening onboarding wizard…', 'success')
                    window.location.href = `/apps/crm/accounts?openAccountId=${encodeURIComponent(
                      accountId,
                    )}&onboarding=1`
                  } catch (err: any) {
                    const msg = err?.response?.data?.error || err?.message || 'Failed to start onboarding.'
                    toast.showToast(msg, 'error')
                  }
                }}
                className="mt-1 inline-flex items-center justify-center rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-xs font-medium hover:bg-[color:var(--color-muted)] disabled:opacity-50"
              >
                Start onboarding
              </button>
            </div>
          </div>
        </li>
        <li key="External Customer Portal">
          <div className="block h-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
            <div className="text-base font-semibold leading-6">
              External Customer Portal
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--color-text-muted)]">
              Share this link with customers to submit and view tickets.
            </div>
            <a
              href={getPortalUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
            >
              Open Customer Portal
            </a>
          </div>
        </li>
      </ul>
    </div>
  )
}


