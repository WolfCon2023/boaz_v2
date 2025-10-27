import { NavLink } from 'react-router-dom'

const base = 'inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]'

export function CRMNav() {
  return (
    <div className="flex flex-wrap items-center gap-2 p-4">
      <NavLink to="/apps/crm" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>CRM Home</NavLink>
      <NavLink to="/apps/crm/contacts" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Contacts</NavLink>
      <NavLink to="/apps/crm/accounts" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Accounts</NavLink>
      <NavLink to="/apps/crm/quotes" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Quotes</NavLink>
      <NavLink to="/apps/crm/invoices" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Invoices</NavLink>
      <NavLink to="/apps/crm/outreach/templates" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Outreach Templates</NavLink>
      <NavLink to="/apps/crm/outreach/sequences" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Outreach Sequences</NavLink>
      <NavLink to="/apps/crm/outreach/events" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Outreach Events</NavLink>
      <NavLink to="/apps/crm/support/tickets" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Tickets</NavLink>
      <NavLink to="/apps/crm/support/kb" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Knowledge Base</NavLink>
      <NavLink to="/apps/crm/deals" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Deals</NavLink>
    </div>
  )
}


