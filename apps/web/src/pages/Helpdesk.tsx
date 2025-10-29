import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { getPortalUrl } from '@/lib/urls'

export default function Helpdesk() {
  // Fetch tickets and compute metrics in the same way as the Tickets page for parity
  const { data: ticketsData, isFetching } = useQuery({
    queryKey: ['helpdesk-tickets'],
    queryFn: async () => { const r = await http.get('/api/crm/support/tickets'); return r.data as { data: { items: any[] } } },
    refetchInterval: 60000,
  })
  const items = ticketsData?.data.items ?? []
  const [nowTs, setNowTs] = React.useState(() => Date.now())
  React.useEffect(() => { const id = setInterval(() => setNowTs(Date.now()), 60_000); return () => clearInterval(id) }, [])
  const computed = React.useMemo(() => {
    const isOpen = (s?: string) => s === 'open' || s === 'pending'
    const open = items.filter((t) => isOpen(t.status)).length
    const breached = items.filter((t) => isOpen(t.status) && t.slaDueAt && new Date(t.slaDueAt).getTime() < nowTs).length
    const until = nowTs + 60 * 60 * 1000
    const dueNext60 = items.filter((t) => isOpen(t.status) && t.slaDueAt)
      .filter((t) => { const d = new Date(t.slaDueAt as string).getTime(); return d >= nowTs && d <= until }).length
    return { open, breached, dueNext60 }
  }, [items, nowTs])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Helpdesk</h1>
        <div className="flex items-center gap-2">
          <Link to="/workspace/me" className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Back to Workspace</Link>
          <a href={getPortalUrl()} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Open Customer Portal</a>
          <Link to="/apps/crm/support/tickets" className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Agent Tickets</Link>
          <Link to="/apps/crm/support/kb" className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Knowledge Base</Link>
        </div>
      </div>

      {/* At-a-glance metrics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuickLinkCard title="Open" value={computed.open} to="/apps/crm/support/tickets?statuses=open,pending&sort=createdAt&dir=desc" />
        <QuickLinkCard title="Breached SLA" value={computed.breached} to="/apps/crm/support/tickets?statuses=open,pending&breached=1&sort=slaDueAt&dir=asc" accent="red" />
        <QuickLinkCard title="Due next 60m" value={computed.dueNext60} to="/apps/crm/support/tickets?statuses=open,pending&dueWithin=60&sort=slaDueAt&dir=asc" accent="yellow" />
      </div>

      {/* Quick actions */}
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
        <div className="mb-2 text-base font-semibold">Quick actions</div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/apps/crm/support/tickets" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">View all tickets</Link>
          <a href={getPortalUrl()} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Open customer portal</a>
          <Link to="/apps/crm/support/kb" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Manage knowledge base</Link>
          <Link to="/marketplace" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Helpdesk add‑ons</Link>
        </div>
      </div>

      {/* Upcoming modules */}
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="text-base font-semibold">Roadmap</div>
        <ul className="mt-2 list-disc pl-5 text-sm text-[color:var(--color-text-muted)]">
          <li>Queues and assignment (round‑robin, load‑balanced)</li>
          <li>SLAs and escalations with email/Slack alerts</li>
          <li>Macros and canned responses</li>
          <li>Customer satisfaction (CSAT) surveys</li>
          <li>Analytics dashboard</li>
        </ul>
      </div>
    </div>
  )
}

function QuickLinkCard({ title, value, to, accent }: { title: string; value: number; to: string; accent?: 'red' | 'yellow' }) {
  const accentClass = accent === 'red' ? 'text-red-400' : accent === 'yellow' ? 'text-yellow-300' : ''
  return (
    <Link to={to} className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 hover:bg-[color:var(--color-muted)]">
      <div className="text-xs text-[color:var(--color-text-muted)]">{title}</div>
      <div className={`text-2xl font-semibold ${accentClass}`}>{value}</div>
    </Link>
  )
}


