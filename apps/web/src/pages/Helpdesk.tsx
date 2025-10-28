import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { getPortalUrl } from '@/lib/urls'

export default function Helpdesk() {
  const metrics = useQuery({
    queryKey: ['helpdesk-metrics'],
    queryFn: async () => { const r = await http.get('/api/crm/support/tickets/metrics'); return r.data as { data: { open: number; breached: number; dueNext60: number } } },
    refetchInterval: 60000,
  })

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
        <MetricCard title="Open" value={metrics.data?.data.open ?? 0} />
        <MetricCard title="Breached SLA" value={metrics.data?.data.breached ?? 0} accent="red" />
        <MetricCard title="Due next 60m" value={metrics.data?.data.dueNext60 ?? 0} accent="yellow" />
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

function MetricCard({ title, value, accent }: { title: string; value: number; accent?: 'red' | 'yellow' }) {
  const accentClass = accent === 'red' ? 'text-red-400' : accent === 'yellow' ? 'text-yellow-300' : ''
  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
      <div className="text-xs text-[color:var(--color-text-muted)]">{title}</div>
      <div className={`text-2xl font-semibold ${accentClass}`}>{value}</div>
    </div>
  )
}


