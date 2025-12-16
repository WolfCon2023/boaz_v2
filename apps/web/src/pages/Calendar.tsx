import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'

type CalendarEvent =
  | {
      kind: 'appointment'
      id: string
      title: string
      startsAt: string
      endsAt: string
      timeZone?: string
      attendee?: { name?: string | null; email?: string | null }
      contactId?: string | null
      source?: string | null
    }
  | {
      kind: 'task'
      id: string
      title: string
      startsAt: string
      endsAt: string
      taskType?: string | null
      relatedType?: string | null
      relatedId?: string | null
    }

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export default function Calendar() {
  const [rangeDays, setRangeDays] = React.useState(14)
  const from = React.useMemo(() => startOfDay(new Date()), [])
  const to = React.useMemo(() => new Date(from.getTime() + rangeDays * 24 * 60 * 60 * 1000), [from, rangeDays])

  const eventsQ = useQuery({
    queryKey: ['calendar', 'events', from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const res = await http.get('/api/calendar/events', { params: { from: from.toISOString(), to: to.toISOString() } })
      return res.data as { data: { items: CalendarEvent[] } }
    },
    refetchInterval: 60_000,
  })

  const events = eventsQ.data?.data.items ?? []

  const grouped = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const key = startOfDay(new Date(e.startsAt)).toISOString().slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    for (const [k, v] of map.entries()) {
      v.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      map.set(k, v)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [events])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Calendar</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Unified view of Scheduler appointments + CRM tasks. (Week/month views + team calendars next.)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/apps/scheduler" className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">
            Scheduler
          </Link>
          <Link to="/apps/crm" className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">
            CRM Hub
          </Link>
          <Link to="/workspace/me" className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">
            Workspace
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs text-[color:var(--color-text-muted)]">Range</div>
        <select
          value={String(rangeDays)}
          onChange={(e) => setRangeDays(Number(e.target.value) || 14)}
          className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm"
        >
          <option value="7">Next 7 days</option>
          <option value="14">Next 14 days</option>
          <option value="30">Next 30 days</option>
        </select>
        <div className="ml-auto text-xs text-[color:var(--color-text-muted)]">{eventsQ.isFetching ? 'Refreshing…' : `${events.length} events`}</div>
      </div>

      <div className="space-y-4">
        {grouped.map(([day, items]) => (
          <section key={day} className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
            <div className="border-b border-[color:var(--color-border)] px-4 py-3 text-sm font-semibold">{new Date(day).toDateString()}</div>
            <div className="divide-y divide-[color:var(--color-border)]">
              {items.map((e) => (
                <div key={`${e.kind}-${e.id}`} className="px-4 py-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{e.title}</span>
                      <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                        {e.kind}
                      </span>
                    </div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {new Date(e.startsAt).toLocaleString()} → {new Date(e.endsAt).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.kind === 'appointment' && (
                      <a href={`/apps/scheduler`} className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]">
                        Open Scheduler
                      </a>
                    )}
                    {e.kind === 'task' && (
                      <a href={`/apps/crm/tasks`} className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]">
                        Open Tasks
                      </a>
                    )}
                    {e.kind === 'appointment' && (e as any).contactId ? (
                      <a
                        href={`/apps/crm/contacts?q=${encodeURIComponent(String((e as any).attendee?.email || ''))}`}
                        className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
                      >
                        View Contact
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
              {!items.length && <div className="px-4 py-6 text-xs text-[color:var(--color-text-muted)]">No events.</div>}
            </div>
          </section>
        ))}

        {!grouped.length && !eventsQ.isLoading && (
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-sm text-[color:var(--color-text-muted)]">
            No upcoming events found. Create an appointment type in Scheduler and share the booking link.
          </div>
        )}
      </div>
    </div>
  )
}


