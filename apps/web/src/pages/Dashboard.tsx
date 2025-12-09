import * as React from 'react'
import { CalendarDays, CheckCircle2, ListTodo, BarChart3, Sun, Moon, DollarSign, FileText, Ticket, Briefcase, TrendingUp } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { getInstalledApps } from '../lib/apps'
import { getMetricsSummary } from '../lib/api'
import { http } from '@/lib/http'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const { data: installed = [] } = useQuery({ queryKey: ['installedApps'], queryFn: async () => getInstalledApps() })
  const { data: metrics } = useQuery<{ data: { appointmentsToday: number; tasksDueToday: number; tasksCompletedToday: number } }>({ queryKey: ['metricsSummary'], queryFn: getMetricsSummary })
  const prefsQ = useQuery<{ data: { preferences: { theme?: 'light'|'dark'; layout?: 'default'|'compact' } } }>({
    queryKey: ['preferences','me'],
    queryFn: async () => (await http.get('/api/preferences/me')).data,
  })

  // Get current user email for filtering tickets
  const { data: meData } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await http.get('/auth/me')
      return res.data
    },
  })
  const userEmail = meData?.email || ''

  // Fetch CRM dashboard data
  const crmDashboardQ = useQuery({
    queryKey: ['crm-dashboard-summary', userEmail],
    enabled: !!userEmail,
    queryFn: async () => {
      const [invoicesRes, quotesRes, ticketsRes, dealsRes] = await Promise.all([
        http.get('/api/crm/invoices', { params: { limit: 1000 } }),
        http.get('/api/crm/quotes', { params: { limit: 1000 } }),
        http.get('/api/crm/support/tickets', { params: { limit: 1000 } }),
        http.get('/api/crm/deals', { params: { limit: 1000 } }),
      ])
      
      const invoices = invoicesRes.data.data.items || []
      const quotes = quotesRes.data.data.items || []
      const tickets = ticketsRes.data.data.items || []
      const deals = dealsRes.data.data.items || []
      
      const now = new Date()
      
      // Helper to extract email from "Name <email>" format
      const extractEmail = (field: string | null | undefined): string => {
        if (!field) return ''
        const match = field.match(/<(.+?)>/)
        return match ? match[1].trim() : field.trim()
      }
      
      // Filter tickets by assignee and owner
      const ticketsAssigned = tickets.filter((t: any) => {
        const assigneeEmail = extractEmail(t.assignee)
        return assigneeEmail.toLowerCase() === userEmail.toLowerCase()
      })
      
      const ticketsOwned = tickets.filter((t: any) => {
        const ownerEmail = extractEmail(t.owner)
        return ownerEmail.toLowerCase() === userEmail.toLowerCase()
      })
      
      return {
        invoices: {
          total: invoices.length,
          unpaid: invoices.filter((inv: any) => inv.status !== 'paid' && inv.status !== 'void').length,
          overdue: invoices.filter((inv: any) => 
            inv.status !== 'paid' && 
            inv.status !== 'void' && 
            inv.dueDate && 
            new Date(inv.dueDate) < now
          ).length,
        },
        quotes: {
          total: quotes.length,
          pending: quotes.filter((q: any) => q.status === 'sent' || q.status === 'viewed').length,
          draft: quotes.filter((q: any) => q.status === 'draft').length,
        },
        tickets: {
          total: tickets.length,
          open: tickets.filter((t: any) => t.status === 'open').length,
          inProgress: tickets.filter((t: any) => t.status === 'in_progress').length,
        },
        ticketsAssigned: {
          total: ticketsAssigned.length,
          open: ticketsAssigned.filter((t: any) => t.status === 'open' || t.status === 'in_progress').length,
        },
        ticketsOwned: {
          total: ticketsOwned.length,
          open: ticketsOwned.filter((t: any) => t.status === 'open' || t.status === 'in_progress').length,
        },
        deals: {
          total: deals.length,
          open: deals.filter((d: any) => d.stage !== 'won' && d.stage !== 'lost').length,
          value: deals
            .filter((d: any) => d.stage !== 'lost')
            .reduce((sum: number, d: any) => sum + (d.amount || 0), 0),
        },
      }
    },
  })
  const [themeState, setThemeState] = React.useState<'light'|'dark'>('dark')
  const [layoutState, setLayoutState] = React.useState<'default'|'compact'>('default')
  React.useEffect(() => {
    const t = (prefsQ.data?.data.preferences.theme ?? 'dark') as 'light'|'dark'
    const l = (prefsQ.data?.data.preferences.layout ?? 'default') as 'default'|'compact'
    setThemeState(t)
    setLayoutState(l)
  }, [prefsQ.data])

  const savePrefs = useMutation({
    mutationFn: async (payload: { theme?: 'light'|'dark'; layout?: 'default'|'compact' }) => (await http.put('/api/preferences/me', payload)).data,
    onMutate: (payload) => {
      // Optimistic update
      if (payload.theme) setThemeState(payload.theme)
      if (payload.layout) setLayoutState(payload.layout)
    },
  })

  React.useEffect(() => {
    const el = document.documentElement
    el.setAttribute('data-theme', themeState)
    el.setAttribute('data-layout', layoutState)
    // PreferencesProvider will handle the CSS variable updates
    el.style.setProperty('--dashboard-gap', layoutState === 'compact' ? '0.75rem' : '1.5rem')
  }, [themeState, layoutState])

  return (
    <div className="space-y-10">
      {/* Hero banner */}
      <div aria-label="Success Toolkit" className="rounded-2xl border border-[color:var(--color-border)] bg-[linear-gradient(180deg,_#1a2a4a,_#0f1e3a)] px-8 py-12 text-center shadow-[var(--shadow-2)]">
        <h1 className="text-3xl font-semibold tracking-tight">Success Toolkit</h1>
        <p className="mt-3 text-sm text-[color:var(--color-text-muted)]">Access your business applications and tools</p>
      </div>

      {/* Preferences quick toggles */}
      <div className="flex items-center justify-end gap-2">
        <button aria-label="Toggle theme" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)] inline-flex items-center gap-2" onClick={() => savePrefs.mutate({ theme: themeState === 'dark' ? 'light' : 'dark', layout: layoutState })}>
          {themeState === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {themeState === 'dark' ? 'Light' : 'Dark'} mode
        </button>
        <select aria-label="Layout" value={layoutState} onChange={(e) => savePrefs.mutate({ layout: e.target.value as any, theme: themeState })} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)]">
          <option value="default">Default layout</option>
          <option value="compact">Compact layout</option>
        </select>
      </div>

      {/* Overview KPIs */}
      <section aria-label="Overview metrics" className="space-y-6">
        <h2 className="text-xl font-semibold text-center">Today</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4" style={{ gap: 'var(--dashboard-gap, 1.5rem)' }}>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5">
            <div className="flex items-center gap-3 text-[color:var(--color-text-muted)]"><BarChart3 className="h-5 w-5" /> Installed apps</div>
            <div className="mt-2 text-3xl font-semibold">{installed.length}</div>
            <div className="mt-3 text-xs text-[color:var(--color-text-muted)]"><a className="underline" href="/workspace/me">Manage workspace</a></div>
          </div>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5">
            <div className="flex items-center gap-3 text-[color:var(--color-text-muted)]"><CalendarDays className="h-5 w-5" /> Appointments</div>
            <div className="mt-2 text-3xl font-semibold">{metrics?.data.appointmentsToday ?? 0}</div>
            <div className="mt-3 text-xs text-[color:var(--color-text-muted)]">Today</div>
          </div>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5">
            <div className="flex items-center gap-3 text-[color:var(--color-text-muted)]"><ListTodo className="h-5 w-5" /> Tasks due</div>
            <div className="mt-2 text-3xl font-semibold">{metrics?.data.tasksDueToday ?? 0}</div>
            <div className="mt-3 text-xs text-[color:var(--color-text-muted)]">Due today</div>
          </div>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5">
            <div className="flex items-center gap-3 text-[color:var(--color-text-muted)]"><CheckCircle2 className="h-5 w-5" /> Completed</div>
            <div className="mt-2 text-3xl font-semibold">{metrics?.data.tasksCompletedToday ?? 0}</div>
            <div className="mt-3 text-xs text-[color:var(--color-text-muted)]">Completed today</div>
          </div>
        </div>
      </section>

      {/* CRM Overview */}
      <section aria-label="CRM Overview" className="space-y-6">
        <h2 className="text-xl font-semibold text-center">CRM Overview</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-6" style={{ gap: 'var(--dashboard-gap, 1.5rem)' }}>
          {/* Invoices */}
          <Link to="/apps/crm/invoices" className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5 hover:bg-[color:var(--color-muted)] transition-colors">
            <div className="flex items-center gap-3 text-[color:var(--color-text-muted)]">
              <DollarSign className="h-5 w-5" /> 
              Invoices
            </div>
            <div className="mt-2 text-3xl font-semibold">{crmDashboardQ.data?.invoices.unpaid ?? '...'}</div>
            <div className="mt-1 text-sm text-yellow-500">
              {crmDashboardQ.data?.invoices.overdue ?? 0} overdue
            </div>
            <div className="mt-3 text-xs text-[color:var(--color-text-muted)]">
              {crmDashboardQ.data?.invoices.total ?? 0} total
            </div>
          </Link>

          {/* Quotes */}
          <Link to="/apps/crm/quotes" className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5 hover:bg-[color:var(--color-muted)] transition-colors">
            <div className="flex items-center gap-3 text-[color:var(--color-text-muted)]">
              <FileText className="h-5 w-5" /> 
              Quotes
            </div>
            <div className="mt-2 text-3xl font-semibold">{crmDashboardQ.data?.quotes.pending ?? '...'}</div>
            <div className="mt-1 text-sm text-blue-500">
              {crmDashboardQ.data?.quotes.draft ?? 0} drafts
            </div>
            <div className="mt-3 text-xs text-[color:var(--color-text-muted)]">
              {crmDashboardQ.data?.quotes.total ?? 0} total
            </div>
          </Link>

          {/* Tickets Assigned */}
          <Link to="/apps/crm/support/tickets" className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5 hover:bg-[color:var(--color-muted)] transition-colors">
            <div className="flex items-center gap-3 text-[color:var(--color-text-muted)]">
              <Ticket className="h-5 w-5" /> 
              Tickets Assigned
            </div>
            <div className="mt-2 text-3xl font-semibold">{crmDashboardQ.data?.ticketsAssigned.open ?? '...'}</div>
            <div className="mt-1 text-sm text-orange-500">
              Open/In Progress
            </div>
            <div className="mt-3 text-xs text-[color:var(--color-text-muted)]">
              {crmDashboardQ.data?.ticketsAssigned.total ?? 0} total assigned
            </div>
          </Link>

          {/* Tickets Owned */}
          <Link to="/apps/crm/support/tickets" className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5 hover:bg-[color:var(--color-muted)] transition-colors">
            <div className="flex items-center gap-3 text-[color:var(--color-text-muted)]">
              <Ticket className="h-5 w-5" /> 
              Tickets Owned
            </div>
            <div className="mt-2 text-3xl font-semibold">{crmDashboardQ.data?.ticketsOwned.open ?? '...'}</div>
            <div className="mt-1 text-sm text-purple-500">
              Open/In Progress
            </div>
            <div className="mt-3 text-xs text-[color:var(--color-text-muted)]">
              {crmDashboardQ.data?.ticketsOwned.total ?? 0} total owned
            </div>
          </Link>

          {/* Deals */}
          <Link to="/apps/crm/deals" className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5 hover:bg-[color:var(--color-muted)] transition-colors">
            <div className="flex items-center gap-3 text-[color:var(--color-text-muted)]">
              <Briefcase className="h-5 w-5" /> 
              Deals
            </div>
            <div className="mt-2 text-3xl font-semibold">{crmDashboardQ.data?.deals.open ?? '...'}</div>
            <div className="mt-1 text-sm text-green-500">
              ${((crmDashboardQ.data?.deals.value ?? 0) / 1000).toFixed(0)}K pipeline
            </div>
            <div className="mt-3 text-xs text-[color:var(--color-text-muted)]">
              {crmDashboardQ.data?.deals.total ?? 0} total
            </div>
          </Link>

          {/* Revenue Intelligence */}
          <Link to="/apps/crm/revenue-intelligence" className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5 hover:bg-[color:var(--color-muted)] transition-colors">
            <div className="flex items-center gap-3 text-[color:var(--color-text-muted)]">
              <TrendingUp className="h-5 w-5" /> 
              Revenue Intel
            </div>
            <div className="mt-2 text-3xl font-semibold">View</div>
            <div className="mt-1 text-sm text-purple-500">
              Forecasting & AI
            </div>
            <div className="mt-3 text-xs text-[color:var(--color-text-muted)]">
              Insights →
            </div>
          </Link>
        </div>
      </section>

      {/* Quick links */}
      <section aria-label="Quick links" className="grid gap-6 sm:grid-cols-2">
        <a href="/marketplace" className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 hover:bg-[color:var(--color-muted)]">
          <div className="font-semibold">Open Marketplace</div>
          <div className="mt-1 text-sm text-[color:var(--color-text-muted)]">Browse and install apps for your workspace.</div>
        </a>
        <a href="/workspace/me" className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 hover:bg-[color:var(--color-muted)]">
          <div className="font-semibold">Go to Workspace</div>
          <div className="mt-1 text-sm text-[color:var(--color-text-muted)]">Arrange your tiles and set defaults.</div>
        </a>
      </section>
    </div>
  )
}
