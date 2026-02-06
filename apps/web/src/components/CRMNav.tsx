import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { useAccessToken } from './Auth'

const base = 'inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]'

export function CRMNav() {
  const token = useAccessToken()
  
  // Check if user has manager role
  const { data: rolesData } = useQuery<{ roles: Array<{ name: string; permissions: string[] }>; isAdmin?: boolean }>({
    queryKey: ['user', 'roles'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me/roles')
      return res.data
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false, // Don't refetch on window focus to avoid 401 errors
    retry: false, // Don't retry on 401 errors
  })

  const isAdmin = rolesData?.roles?.some(r => r.name === 'admin') || rolesData?.isAdmin || false
  const isManager = rolesData?.roles?.some(r => r.name === 'manager') || isAdmin || false
  const isSeniorManager = rolesData?.roles?.some(r => r.name === 'senior_manager') || isAdmin || false
  const isFinanceManager = rolesData?.roles?.some(r => r.name === 'finance_manager') || isAdmin || false
  const canApproveExpenses = isManager || isSeniorManager || isFinanceManager

  return (
    <div className="flex flex-wrap items-center gap-2 p-4">
      <NavLink to="/apps/crm" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>CRM Hub</NavLink>
      <NavLink to="/apps/crm/accounts" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Accounts</NavLink>
      <NavLink to="/apps/crm/assets" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Assets / Installed Base</NavLink>
      <NavLink to="/apps/crm/contacts" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Contacts</NavLink>
      <NavLink to="/apps/crm/deals" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Deals</NavLink>
      <NavLink to="/apps/crm/documents" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Documents</NavLink>
      <NavLink to="/apps/crm/expenses" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Expenses</NavLink>
      <NavLink to="/apps/crm/invoices" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Invoices</NavLink>
      <NavLink to="/apps/crm/support/kb" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Knowledge Base</NavLink>
      <NavLink to="/apps/crm/marketing" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Marketing</NavLink>
      <NavLink to="/apps/crm/outreach/events" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Outreach Events</NavLink>
      <NavLink to="/apps/crm/outreach/sequences" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Outreach Sequences</NavLink>
      <NavLink to="/apps/crm/outreach/templates" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Outreach Templates</NavLink>
      <NavLink to="/apps/crm/payments" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Payment Portal</NavLink>
      <NavLink to="/apps/crm/products" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Products</NavLink>
      <NavLink to="/apps/crm/vendors" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Vendors</NavLink>
      <NavLink to="/apps/crm/projects" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Projects</NavLink>
      <NavLink to="/apps/crm/quotes" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Quotes</NavLink>
      <NavLink to="/apps/crm/renewals" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Renewals</NavLink>
      <NavLink to="/apps/crm/reporting" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Reporting</NavLink>
      <NavLink to="/apps/stratflow" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>StratFlow</NavLink>
      <NavLink to="/apps/cadex" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Cadex</NavLink>
      {isAdmin && (
        <NavLink to="/apps/crm/integrations" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Integrations</NavLink>
      )}
      <NavLink to="/apps/crm/slas" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Contracts &amp; SLAs</NavLink>
      <NavLink to="/apps/crm/success" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Customer Success</NavLink>
      <NavLink to="/apps/crm/surveys" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Surveys &amp; Feedback</NavLink>
      <NavLink to="/apps/crm/tasks" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Tasks &amp; Activities</NavLink>
      {isManager && (
        <>
          <NavLink to="/apps/crm/quotes/approval-queue" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Approval Queue</NavLink>
          <NavLink to="/apps/crm/deals/approval-queue" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Deal Approval Queue</NavLink>
          <NavLink to="/apps/crm/quotes/acceptance-queue" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Acceptance Queue</NavLink>
        </>
      )}
      {canApproveExpenses && (
        <NavLink to="/apps/crm/expenses/approval-queue" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Expense Approval Queue</NavLink>
      )}
      <NavLink to="/apps/crm/support/tickets" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Tickets</NavLink>
    </div>
  )
}


