import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { getPortalUrl } from '@/lib/urls'

type LicenseAlertRow = {
  _id: string
  productStatus?: string
  renewalStatus: string
  expirationDate?: string | null
}

export default function CRMHub() {
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
    { label: 'Products', desc: 'Product catalog, bundles, discounts, and terms', href: '/apps/crm/products' },
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
    { label: 'Surveys & Feedback', desc: 'NPS/CSAT and post‑interaction surveys', href: '/apps/crm/surveys' },
    {
      label: 'Tasks & Activities',
      desc: 'Calls, meetings, and to‑dos tied to CRM records',
      href: '/apps/crm/tasks',
    },
    { label: 'Tickets', desc: 'Support tickets and SLAs', href: '/apps/crm/support/tickets' },
  ]

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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">CRM Hub</h1>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
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


