import { NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { useAccessToken } from './Auth'

const base = 'inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]'

export function CRMNav() {
  const token = useAccessToken()
  const location = useLocation()
  
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

  const isManager = rolesData?.roles?.some(r => r.name === 'manager') || rolesData?.isAdmin || false

  const kbTag = (() => {
    const p = location.pathname
    if (!p.startsWith('/apps/crm')) return null
    if (p.startsWith('/apps/crm/support/kb')) return null
    // Normalize to a stable first segment after /apps/crm
    const rest = p.replace('/apps/crm', '')
    const segs = rest.split('/').filter(Boolean)
    const first = segs[0] || ''
    const second = segs[1] || ''

    if (first === '') return 'crm'
    if (first === 'support' && second === 'tickets') return 'crm:tickets'
    if (first === 'outreach' && second === 'events') return 'crm:outreach'
    if (first === 'outreach' && second === 'sequences') return 'crm:outreach-sequences'
    if (first === 'outreach' && second === 'templates') return 'crm:outreach-templates'

    const map: Record<string, string> = {
      accounts: 'crm:accounts',
      assets: 'crm:assets',
      contacts: 'crm:contacts',
      deals: 'crm:deals',
      documents: 'crm:documents',
      invoices: 'crm:invoices',
      marketing: 'crm:marketing',
      payments: 'crm:payments',
      products: 'crm:products',
      projects: 'crm:projects',
      quotes: 'crm:quotes',
      renewals: 'crm:renewals',
      'revenue-intelligence': 'crm:revenue-intelligence',
      slas: 'crm:slas',
      success: 'crm:success',
      surveys: 'crm:surveys',
      tasks: 'crm:tasks',
      vendors: 'crm:vendors',
    }
    return map[first] || 'crm'
  })()

  const kbHref = kbTag ? `/apps/crm/support/kb?tag=${encodeURIComponent(kbTag)}` : null

  return (
    <div className="flex flex-wrap items-center gap-2 p-4">
      <NavLink to="/apps/crm" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>CRM Hub</NavLink>
      <NavLink to="/apps/crm/accounts" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Accounts</NavLink>
      <NavLink to="/apps/crm/assets" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Assets / Installed Base</NavLink>
      <NavLink to="/apps/crm/contacts" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Contacts</NavLink>
      <NavLink to="/apps/crm/deals" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Deals</NavLink>
      <NavLink to="/apps/crm/documents" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Documents</NavLink>
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
      <NavLink to="/apps/crm/revenue-intelligence" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Revenue Intelligence</NavLink>
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
      <NavLink to="/apps/crm/support/tickets" className={({ isActive }) => `${base} ${isActive ? 'bg-[color:var(--color-muted)]' : ''}`}>Tickets</NavLink>
      {kbHref && (
        <a
          href={kbHref}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-2 rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
          aria-label="Open Knowledge Base for this page"
          title="Knowledge Base"
        >
          <span className="text-[color:var(--color-primary-600)] font-semibold">?</span>
          <span className="hidden sm:inline">KB</span>
        </a>
      )}
    </div>
  )
}


