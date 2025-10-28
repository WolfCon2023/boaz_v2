import * as React from 'react'
import { Link } from 'react-router-dom'

export default function Helpdesk() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Helpdesk</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="text-sm text-[color:var(--color-text-muted)]">Internal support tool for customer service representatives.</div>
        <div className="mt-2 text-base font-semibold">Status: Coming Soon</div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link to="/apps/crm/support/tickets" className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Open CRM Tickets</Link>
          <Link to="/marketplace" className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">View in Marketplace</Link>
        </div>
      </div>
    </div>
  )
}


