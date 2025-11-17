import { getPortalUrl } from '@/lib/urls'

export default function CRMHub() {
  const items: { label: string; desc: string; href: string }[] = [
    { label: 'Contacts', desc: 'People and relationships', href: '/apps/crm/contacts' },
    { label: 'Accounts', desc: 'Companies and organizations', href: '/apps/crm/accounts' },
    { label: 'Deals', desc: 'Pipeline and opportunities', href: '/apps/crm/deals' },
    { label: 'Products', desc: 'Product catalog, bundles, discounts, and terms', href: '/apps/crm/products' },
    { label: 'Quotes', desc: 'Quotes, proposals, and e-sign', href: '/apps/crm/quotes' },
    { label: 'Approval Queue', desc: 'Review and approve quote requests', href: '/apps/crm/quotes/approval-queue' },
    { label: 'Deal Approval Queue', desc: 'Review and approve deal requests', href: '/apps/crm/deals/approval-queue' },
    { label: 'Acceptance Queue', desc: 'View quotes accepted by signers', href: '/apps/crm/quotes/acceptance-queue' },
    { label: 'Invoices', desc: 'Billing, payments, and refunds', href: '/apps/crm/invoices' },
    { label: 'Outreach', desc: 'Email/SMS templates, sequences, events', href: '/apps/crm/outreach/templates' },
             { label: 'Marketing', desc: 'Campaigns, segments, analytics', href: '/apps/crm/marketing' },
    { label: 'Surveys & Feedback', desc: 'NPS/CSAT and post‑interaction surveys', href: '/apps/crm/surveys' },
    { label: 'Tickets', desc: 'Support tickets and SLAs', href: '/apps/crm/support/tickets' },
    { label: 'Knowledge Base', desc: 'Articles and self‑service help', href: '/apps/crm/support/kb' },
    { label: 'Documents', desc: 'File attachments, version control, and permissions', href: '/apps/crm/documents' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">CRM</h1>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <li key={it.label}>
            <a href={it.href} className="block h-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 hover:bg-[color:var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary)] focus:ring-offset-2 focus:ring-offset-[color:var(--color-bg)]">
              <div className="text-base font-semibold leading-6">{it.label}</div>
              <div className="text-xs text-[color:var(--color-text-muted)] mt-1 leading-5">{it.desc}</div>
            </a>
          </li>
        ))}
      </ul>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="text-base font-semibold">External Customer Portal</div>
        <div className="text-xs text-[color:var(--color-text-muted)] mt-1">Share this link with customers to submit and view tickets.</div>
        <a href={getPortalUrl()} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Open Customer Portal</a>
      </div>
    </div>
  )
}


