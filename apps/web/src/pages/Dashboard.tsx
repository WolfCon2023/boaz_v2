import { CalendarDays, CheckCircle2, ListTodo, BarChart3 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getInstalledApps } from '../lib/apps'
import { getMetricsSummary } from '../lib/api'

export default function Dashboard() {
  const { data: installed = [] } = useQuery({ queryKey: ['installedApps'], queryFn: async () => getInstalledApps() })
  const { data: metrics } = useQuery<{ data: { appointmentsToday: number; tasksDueToday: number; tasksCompletedToday: number } }>({ queryKey: ['metricsSummary'], queryFn: getMetricsSummary })

  return (
    <div className="space-y-10">
      {/* Hero banner */}
      <div aria-label="Success Toolkit" className="rounded-2xl border border-[color:var(--color-border)] bg-[linear-gradient(180deg,_#1a2a4a,_#0f1e3a)] px-8 py-12 text-center shadow-[var(--shadow-2)]">
        <h1 className="text-3xl font-semibold tracking-tight">Success Toolkit</h1>
        <p className="mt-3 text-sm text-[color:var(--color-text-muted)]">Access your business applications and tools</p>
      </div>

      {/* Overview KPIs (placeholder metrics until API wiring) */}
      <section aria-label="Overview metrics" className="space-y-6">
        <h2 className="text-xl font-semibold text-center">Today</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
