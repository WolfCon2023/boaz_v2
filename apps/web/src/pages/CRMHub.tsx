export default function CRMHub() {
  const items: { label: string; desc: string; href: string }[] = [
    { label: 'Contacts', desc: 'People and relationships', href: '/apps/crm/contacts' },
    { label: 'Accounts', desc: 'Companies and organizations', href: '/apps/crm/accounts' },
    { label: 'Deals', desc: 'Pipeline and opportunities', href: '/apps/crm/deals' },
    { label: 'Quotes', desc: 'Quotes, proposals, and e-sign', href: '/apps/crm/quotes' },
    { label: 'Invoices', desc: 'Billing, payments, and refunds', href: '/apps/crm/invoices' },
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
    </div>
  )
}


