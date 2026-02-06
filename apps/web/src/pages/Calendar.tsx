import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe, ChevronLeft, ChevronRight, CalendarDays, Grid3x3, List, Clock } from 'lucide-react'

type CalendarEvent =
  | {
      kind: 'appointment'
      id: string
      ownerUserId?: string | null
      ownerName?: string | null
      ownerEmail?: string | null
      orgVisible?: boolean
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
      ownerUserId?: string | null
      ownerName?: string | null
      ownerEmail?: string | null
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

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function eventColor(e: CalendarEvent) {
  return e.kind === 'appointment' ? 'bg-blue-600' : 'bg-emerald-600'
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Calendar() {
  const toast = useToast()
  const qc = useQueryClient()
  const [view, setView] = React.useState<'me' | 'org'>('me')
  const [displayMode, setDisplayMode] = React.useState<'calendar' | 'list'>('calendar')
  const [calendarView, setCalendarView] = React.useState<'month' | 'week' | 'day'>('month')
  const [calendarMonth, setCalendarMonth] = React.useState(new Date())
  const [selectedEvent, setSelectedEvent] = React.useState<CalendarEvent | null>(null)

  // Compute date range from calendar navigation for API fetches
  const { from, to } = React.useMemo(() => {
    if (displayMode === 'list') {
      // List mode: next 30 days
      const f = startOfDay(new Date())
      return { from: f, to: new Date(f.getTime() + 30 * 24 * 60 * 60 * 1000) }
    }
    if (calendarView === 'month') {
      const year = calendarMonth.getFullYear()
      const month = calendarMonth.getMonth()
      const first = new Date(year, month, 1)
      const startDate = new Date(first)
      startDate.setDate(startDate.getDate() - first.getDay())
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 42)
      return { from: startOfDay(startDate), to: endDate }
    }
    if (calendarView === 'week') {
      const startOfWeek = new Date(calendarMonth)
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
      startOfWeek.setHours(0, 0, 0, 0)
      const endOfWeek = new Date(startOfWeek)
      endOfWeek.setDate(endOfWeek.getDate() + 7)
      return { from: startOfWeek, to: endOfWeek }
    }
    // day
    const dayStart = startOfDay(new Date(calendarMonth))
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)
    return { from: dayStart, to: dayEnd }
  }, [displayMode, calendarView, calendarMonth])

  const m365StatusQ = useQuery({
    queryKey: ['calendar', 'm365', 'status'],
    queryFn: async () => (await http.get('/api/calendar/m365/status')).data as { data: { configured: boolean; connected: boolean; email?: string | null } },
    staleTime: 30_000,
    retry: false,
  })

  const connectM365 = useMutation({
    mutationFn: async () => (await http.get('/api/calendar/m365/connect')).data as { data: { url: string } },
    onSuccess: (r) => {
      const url = r?.data?.url
      if (!url) {
        toast.showToast('Microsoft 365 connect URL not returned.', 'error')
        return
      }
      window.location.href = url
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to start Microsoft 365 connect.', 'error'),
  })

  const disconnectM365 = useMutation({
    mutationFn: async () => (await http.post('/api/calendar/m365/disconnect')).data,
    onSuccess: async () => {
      toast.showToast('Microsoft 365 disconnected.', 'success')
      await qc.invalidateQueries({ queryKey: ['calendar', 'm365', 'status'] })
    },
    onError: () => toast.showToast('Failed to disconnect Microsoft 365.', 'error'),
  })

  const eventsQ = useQuery({
    queryKey: ['calendar', 'events', view, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const url = view === 'org' ? '/api/calendar/events/org' : '/api/calendar/events'
      const res = await http.get(url, { params: { from: from.toISOString(), to: to.toISOString() } })
      return res.data as { data: { items: CalendarEvent[] } }
    },
    refetchInterval: 60_000,
    retry: false,
  })

  const events = eventsQ.data?.data.items ?? []

  // Group events by date key for calendar grid views
  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const key = dateKey(new Date(e.startsAt))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    }
    return map
  }, [events])

  // Group for list view
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

  // ─── Render helpers ───

  function renderEventPill(e: CalendarEvent, compact = false) {
    const start = new Date(e.startsAt)
    const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const isOrg = view === 'org'
    return (
      <div
        key={`${e.kind}-${e.id}`}
        onClick={(ev) => {
          ev.stopPropagation()
          setSelectedEvent(e)
        }}
        className={`${compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1.5'} rounded ${eventColor(e)} text-white truncate cursor-pointer hover:opacity-80 transition-opacity shadow-sm`}
        title={`${e.title} at ${timeStr}`}
      >
        <div className="font-semibold truncate">{timeStr}</div>
        <div className="truncate">{e.title}</div>
        {isOrg && (e as any).ownerName && !compact && (
          <div className="truncate text-[10px] opacity-75">{(e as any).ownerName}</div>
        )}
        {isOrg && e.kind === 'appointment' && (e as any).orgVisible && (
          <span className="text-[9px] opacity-75">Shared</span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Calendar</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Unified view of Scheduler appointments + CRM tasks.
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

      {/* Microsoft 365 */}
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Microsoft 365 calendar sync</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              Connect Outlook to create events for Scheduler bookings and check for conflicts.
            </div>
          </div>
          <div className="flex items-center gap-2">
            {m365StatusQ.data?.data?.configured && m365StatusQ.data?.data?.connected ? (
              <>
                <span className="text-xs text-[color:var(--color-text-muted)]">
                  Connected{m365StatusQ.data?.data?.email ? `: ${m365StatusQ.data.data.email}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => disconnectM365.mutate()}
                  disabled={disconnectM365.isPending}
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                >
                  Disconnect
                </button>
              </>
            ) : m365StatusQ.data?.data?.configured ? (
              <button
                type="button"
                onClick={() => connectM365.mutate()}
                disabled={connectM365.isPending || m365StatusQ.isLoading}
                className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
              >
                Connect Microsoft 365
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Toolbar: My/Org toggle + Display mode + Calendar controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* My / Org toggle */}
        <div className="inline-flex rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-1 text-sm">
          <button
            type="button"
            onClick={() => setView('me')}
            className={`rounded-lg px-3 py-2 ${view === 'me' ? 'bg-[color:var(--color-muted)] font-semibold' : ''}`}
          >
            My calendar
          </button>
          <button
            type="button"
            onClick={() => setView('org')}
            className={`rounded-lg px-3 py-2 ${view === 'org' ? 'bg-[color:var(--color-muted)] font-semibold' : ''}`}
          >
            Org calendar
          </button>
        </div>

        {/* Calendar / List display toggle */}
        <div className="inline-flex rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-1 text-sm">
          <button
            type="button"
            onClick={() => setDisplayMode('calendar')}
            className={`rounded-lg px-3 py-2 flex items-center gap-1 ${displayMode === 'calendar' ? 'bg-[color:var(--color-muted)] font-semibold' : ''}`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Calendar
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode('list')}
            className={`rounded-lg px-3 py-2 flex items-center gap-1 ${displayMode === 'list' ? 'bg-[color:var(--color-muted)] font-semibold' : ''}`}
          >
            <List className="h-3.5 w-3.5" />
            List
          </button>
        </div>

        {view === 'org' && (
          <div className="text-xs text-[color:var(--color-text-muted)]">
            Shows shared appointments + your direct reports&apos; calendars.
          </div>
        )}

        <div className="ml-auto text-xs text-[color:var(--color-text-muted)]">{eventsQ.isFetching ? 'Refreshing...' : `${events.length} events`}</div>
      </div>

      {/* ────────── CALENDAR GRID MODE ────────── */}
      {displayMode === 'calendar' && (
        <>
          {/* Month View */}
          {calendarView === 'month' && (
            <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold">Calendar</div>
                <div className="flex items-center gap-2">
                  {/* View switcher */}
                  <div className="inline-flex rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-1">
                    <button type="button" onClick={() => setCalendarView('month')} className="px-3 py-1 text-xs rounded bg-[color:var(--color-muted)] font-semibold">
                      <CalendarDays className="h-3 w-3 inline mr-1" />Month
                    </button>
                    <button type="button" onClick={() => setCalendarView('week')} className="px-3 py-1 text-xs rounded hover:bg-[color:var(--color-muted)]">
                      <Grid3x3 className="h-3 w-3 inline mr-1" />Week
                    </button>
                    <button type="button" onClick={() => setCalendarView('day')} className="px-3 py-1 text-xs rounded hover:bg-[color:var(--color-muted)]">
                      <Clock className="h-3 w-3 inline mr-1" />Day
                    </button>
                  </div>
                  {/* Nav */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const prev = new Date(calendarMonth)
                        prev.setMonth(prev.getMonth() - 1)
                        setCalendarMonth(prev)
                      }}
                      className="p-1 rounded hover:bg-[color:var(--color-muted)]"
                    ><ChevronLeft className="h-4 w-4" /></button>
                    <div className="font-semibold text-sm min-w-[200px] text-center">
                      {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Date(calendarMonth)
                        next.setMonth(next.getMonth() + 1)
                        setCalendarMonth(next)
                      }}
                      className="p-1 rounded hover:bg-[color:var(--color-muted)]"
                    ><ChevronRight className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setCalendarMonth(new Date())} className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 text-xs hover:bg-[color:var(--color-muted)]">
                      Today
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-px border border-[color:var(--color-border)] bg-[color:var(--color-border)]">
                {DAYS.map((day) => (
                  <div key={day} className="bg-[color:var(--color-panel)] p-2 text-center text-xs font-semibold text-[color:var(--color-text-muted)]">
                    {day}
                  </div>
                ))}
                {(() => {
                  const year = calendarMonth.getFullYear()
                  const month = calendarMonth.getMonth()
                  const firstDay = new Date(year, month, 1)
                  const startDate = new Date(firstDay)
                  startDate.setDate(startDate.getDate() - firstDay.getDay())
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  const cells: React.ReactElement[] = []

                  for (let i = 0; i < 42; i++) {
                    const date = new Date(startDate)
                    date.setDate(startDate.getDate() + i)
                    const isCurrentMonth = date.getMonth() === month
                    const isToday = date.getTime() === today.getTime()
                    const dk = dateKey(date)
                    const dayEvents = eventsByDate.get(dk) || []

                    cells.push(
                      <div
                        key={i}
                        className={`min-h-[100px] bg-[color:var(--color-panel)] p-1 ${
                          !isCurrentMonth ? 'opacity-40' : ''
                        } ${isToday ? 'ring-2 ring-[color:var(--color-primary-600)]' : ''}`}
                      >
                        <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-[color:var(--color-primary-600)]' : 'text-[color:var(--color-text-muted)]'}`}>
                          {date.getDate()}
                        </div>
                        <div className="space-y-1">
                          {dayEvents.slice(0, 3).map((e) => renderEventPill(e, true))}
                          {dayEvents.length > 3 && (
                            <div className="text-[10px] text-[color:var(--color-text-muted)] px-1.5">+{dayEvents.length - 3} more</div>
                          )}
                        </div>
                      </div>
                    )
                  }
                  return cells
                })()}
              </div>
            </section>
          )}

          {/* Week View */}
          {calendarView === 'week' && (
            <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold">Week View</div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-1">
                    <button type="button" onClick={() => setCalendarView('month')} className="px-3 py-1 text-xs rounded hover:bg-[color:var(--color-muted)]">
                      <CalendarDays className="h-3 w-3 inline mr-1" />Month
                    </button>
                    <button type="button" onClick={() => setCalendarView('week')} className="px-3 py-1 text-xs rounded bg-[color:var(--color-muted)] font-semibold">
                      <Grid3x3 className="h-3 w-3 inline mr-1" />Week
                    </button>
                    <button type="button" onClick={() => setCalendarView('day')} className="px-3 py-1 text-xs rounded hover:bg-[color:var(--color-muted)]">
                      <Clock className="h-3 w-3 inline mr-1" />Day
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const prev = new Date(calendarMonth)
                      prev.setDate(prev.getDate() - 7)
                      setCalendarMonth(prev)
                    }}
                    className="p-1 rounded hover:bg-[color:var(--color-muted)]"
                  ><ChevronLeft className="h-4 w-4" /></button>
                  <div className="font-semibold text-sm min-w-[200px] text-center">
                    {(() => {
                      const sw = new Date(calendarMonth)
                      sw.setDate(sw.getDate() - sw.getDay())
                      const ew = new Date(sw)
                      ew.setDate(ew.getDate() + 6)
                      return `${sw.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${ew.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Date(calendarMonth)
                      next.setDate(next.getDate() + 7)
                      setCalendarMonth(next)
                    }}
                    className="p-1 rounded hover:bg-[color:var(--color-muted)]"
                  ><ChevronRight className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setCalendarMonth(new Date())} className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 text-xs hover:bg-[color:var(--color-muted)]">
                    Today
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-px border border-[color:var(--color-border)] bg-[color:var(--color-border)]">
                {(() => {
                  const startOfWeek = new Date(calendarMonth)
                  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
                  startOfWeek.setHours(0, 0, 0, 0)
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)

                  return Array.from({ length: 7 }).map((_, dayIndex) => {
                    const date = new Date(startOfWeek)
                    date.setDate(startOfWeek.getDate() + dayIndex)
                    const isToday = date.getTime() === today.getTime()
                    const dk = dateKey(date)
                    const dayEvents = (eventsByDate.get(dk) || []).slice().sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

                    return (
                      <div key={dayIndex} className={`bg-[color:var(--color-panel)] min-h-[400px] ${isToday ? 'ring-2 ring-[color:var(--color-primary-600)]' : ''}`}>
                        <div className={`p-2 border-b border-[color:var(--color-border)] ${isToday ? 'bg-[color:var(--color-primary-soft)]' : ''}`}>
                          <div className="text-xs font-semibold text-[color:var(--color-text-muted)]">{DAYS[dayIndex]}</div>
                          <div className={`text-lg font-semibold ${isToday ? 'text-[color:var(--color-primary-600)]' : ''}`}>{date.getDate()}</div>
                        </div>
                        <div className="p-2 space-y-1">
                          {dayEvents.map((e) => {
                            const start = new Date(e.startsAt)
                            const end = new Date(e.endsAt)
                            const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                            const endStr = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                            const isOrg = view === 'org'
                            return (
                              <div
                                key={`${e.kind}-${e.id}`}
                                onClick={() => setSelectedEvent(e)}
                                className={`text-xs px-2 py-1.5 rounded ${eventColor(e)} text-white cursor-pointer hover:opacity-80 transition-opacity`}
                              >
                                <div className="font-semibold">{timeStr} - {endStr}</div>
                                <div className="text-[10px] opacity-90">{e.title}</div>
                                {isOrg && (e as any).ownerName && <div className="text-[10px] opacity-75">{(e as any).ownerName}</div>}
                                {isOrg && e.kind === 'appointment' && (e as any).orgVisible && <span className="text-[9px] opacity-75">Shared</span>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </section>
          )}

          {/* Day View */}
          {calendarView === 'day' && (
            <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold">Day View</div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-1">
                    <button type="button" onClick={() => setCalendarView('month')} className="px-3 py-1 text-xs rounded hover:bg-[color:var(--color-muted)]">
                      <CalendarDays className="h-3 w-3 inline mr-1" />Month
                    </button>
                    <button type="button" onClick={() => setCalendarView('week')} className="px-3 py-1 text-xs rounded hover:bg-[color:var(--color-muted)]">
                      <Grid3x3 className="h-3 w-3 inline mr-1" />Week
                    </button>
                    <button type="button" onClick={() => setCalendarView('day')} className="px-3 py-1 text-xs rounded bg-[color:var(--color-muted)] font-semibold">
                      <Clock className="h-3 w-3 inline mr-1" />Day
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const prev = new Date(calendarMonth)
                      prev.setDate(prev.getDate() - 1)
                      setCalendarMonth(prev)
                    }}
                    className="p-1 rounded hover:bg-[color:var(--color-muted)]"
                  ><ChevronLeft className="h-4 w-4" /></button>
                  <div className="font-semibold text-sm min-w-[200px] text-center">
                    {calendarMonth.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Date(calendarMonth)
                      next.setDate(next.getDate() + 1)
                      setCalendarMonth(next)
                    }}
                    className="p-1 rounded hover:bg-[color:var(--color-muted)]"
                  ><ChevronRight className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setCalendarMonth(new Date())} className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 text-xs hover:bg-[color:var(--color-muted)]">
                    Today
                  </button>
                </div>
              </div>

              <div className="border border-[color:var(--color-border)] rounded-lg overflow-hidden">
                <div className="grid grid-cols-[80px_1fr]">
                  {/* Hour labels */}
                  <div className="border-r border-[color:var(--color-border)]">
                    {Array.from({ length: 24 }).map((_, hour) => (
                      <div key={hour} className="h-16 bg-[color:var(--color-panel)] p-2 text-xs text-[color:var(--color-text-muted)] border-b border-[color:var(--color-border)]">
                        {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                      </div>
                    ))}
                  </div>
                  {/* Events column */}
                  <div className="bg-[color:var(--color-panel)] min-h-[600px] relative">
                    {(() => {
                      const dk = dateKey(calendarMonth)
                      const dayEvents = events
                        .filter((e) => dateKey(new Date(e.startsAt)) === dk)
                        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

                      return (
                        <div className="p-4 space-y-3">
                          {dayEvents.length > 0 ? (
                            dayEvents.map((e) => {
                              const start = new Date(e.startsAt)
                              const end = new Date(e.endsAt)
                              const isOrg = view === 'org'
                              return (
                                <div
                                  key={`${e.kind}-${e.id}`}
                                  onClick={() => setSelectedEvent(e)}
                                  className={`rounded-lg p-3 ${eventColor(e)} text-white cursor-pointer hover:opacity-90 hover:scale-[1.02] transition-all shadow-md`}
                                >
                                  <div className="font-semibold text-sm">
                                    {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - {end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                  </div>
                                  <div className="text-sm font-medium mt-1">{e.title}</div>
                                  {e.kind === 'appointment' && (e as any).attendee?.email && (
                                    <div className="text-xs opacity-75 mt-1">{(e as any).attendee.email}</div>
                                  )}
                                  {isOrg && (e as any).ownerName && <div className="text-xs opacity-75 mt-1">{(e as any).ownerName}</div>}
                                  {isOrg && e.kind === 'appointment' && (e as any).orgVisible && (
                                    <span className="inline-flex items-center gap-1 text-[10px] opacity-80 mt-1"><Globe className="h-2.5 w-2.5" /> Shared</span>
                                  )}
                                </div>
                              )
                            })
                          ) : (
                            <div className="text-center text-sm text-[color:var(--color-text-muted)] py-8">
                              No events scheduled for this day.
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* ────────── LIST MODE ────────── */}
      {displayMode === 'list' && (
        <div className="space-y-4">
          {grouped.map(([day, items]) => (
            <section key={day} className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
              <div className="border-b border-[color:var(--color-border)] px-4 py-3 text-sm font-semibold">{new Date(day).toDateString()}</div>
              <div className="divide-y divide-[color:var(--color-border)]">
                {items.map((e) => (
                  <div
                    key={`${e.kind}-${e.id}`}
                    className="px-4 py-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between cursor-pointer hover:bg-[color:var(--color-muted)] transition-colors"
                    onClick={() => setSelectedEvent(e)}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{e.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] text-white ${eventColor(e)}`}>
                          {e.kind}
                        </span>
                        {view === 'org' && e.kind === 'appointment' && (e as any).orgVisible && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400">
                            <Globe className="h-2.5 w-2.5" />
                            Shared
                          </span>
                        )}
                        {view === 'org' && (e as any).ownerEmail ? (
                          <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                            {(e as any).ownerName ? `${(e as any).ownerName} — ` : ''}{(e as any).ownerEmail}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {new Date(e.startsAt).toLocaleString()} &rarr; {new Date(e.endsAt).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {e.kind === 'appointment' && (
                        <Link to="/apps/scheduler" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]">
                          Open Scheduler
                        </Link>
                      )}
                      {e.kind === 'task' && (
                        <Link to="/apps/crm/tasks" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]">
                          Open Tasks
                        </Link>
                      )}
                      {e.kind === 'appointment' && (e as any).contactId ? (
                        <Link
                          to={`/apps/crm/contacts?q=${encodeURIComponent(String((e as any).attendee?.email || ''))}`}
                          className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
                        >
                          View Contact
                        </Link>
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
      )}

      {/* ────────── Event Detail Popup ────────── */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedEvent(null)}>
          <div
            className="w-full max-w-lg rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-4">
              <h2 className="text-lg font-semibold">{selectedEvent.title}</h2>
              <button type="button" onClick={() => setSelectedEvent(null)} className="text-sm text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]">&times;</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs text-white ${eventColor(selectedEvent)}`}>{selectedEvent.kind}</span>
                {selectedEvent.kind === 'appointment' && (selectedEvent as any).orgVisible && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
                    <Globe className="h-3 w-3" /> Shared with org
                  </span>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-1">Time</div>
                <div className="text-sm">
                  {new Date(selectedEvent.startsAt).toLocaleString()} &rarr; {new Date(selectedEvent.endsAt).toLocaleTimeString()}
                </div>
              </div>
              {selectedEvent.kind === 'appointment' && (selectedEvent as any).attendee && (
                <div>
                  <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-1">Attendee</div>
                  <div className="text-sm">
                    {(selectedEvent as any).attendee.name && <span className="font-semibold">{(selectedEvent as any).attendee.name}</span>}
                    {(selectedEvent as any).attendee.email && <span className="text-[color:var(--color-text-muted)] ml-2">{(selectedEvent as any).attendee.email}</span>}
                  </div>
                </div>
              )}
              {(selectedEvent as any).ownerName && (
                <div>
                  <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-1">Owner</div>
                  <div className="text-sm">{(selectedEvent as any).ownerName} {(selectedEvent as any).ownerEmail ? `(${(selectedEvent as any).ownerEmail})` : ''}</div>
                </div>
              )}
              {selectedEvent.kind === 'task' && (
                <div>
                  <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-1">Task Type</div>
                  <div className="text-sm capitalize">{(selectedEvent as any).taskType || 'Task'}</div>
                </div>
              )}
              <div className="flex items-center gap-2 pt-2">
                {selectedEvent.kind === 'appointment' && (
                  <Link to="/apps/scheduler" className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]" onClick={() => setSelectedEvent(null)}>
                    Open in Scheduler
                  </Link>
                )}
                {selectedEvent.kind === 'task' && (
                  <Link to="/apps/crm/tasks" className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]" onClick={() => setSelectedEvent(null)}>
                    Open in Tasks
                  </Link>
                )}
                {selectedEvent.kind === 'appointment' && (selectedEvent as any).contactId && (
                  <Link
                    to={`/apps/crm/contacts?q=${encodeURIComponent(String((selectedEvent as any).attendee?.email || ''))}`}
                    className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                    onClick={() => setSelectedEvent(null)}
                  >
                    View Contact
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
