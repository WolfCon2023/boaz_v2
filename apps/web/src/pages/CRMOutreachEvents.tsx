import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'

type EventItem = {
  _id: string
  templateId?: string | null
  sequenceId?: string | null
  recipient?: string | null
  channel: 'email' | 'sms'
  event: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'spam' | 'unsubscribed'
  variant?: string | null
  at: string
}

export default function CRMOutreachEvents() {
  const [q, setQ] = React.useState('')
  const [eventFilter, setEventFilter] = React.useState('')
  const [channel, setChannel] = React.useState('')
  const [sort, setSort] = React.useState<'at'>('at')
  const [dir, setDir] = React.useState<'asc'|'desc'>('desc')

  const { data, isFetching } = useQuery({
    queryKey: ['outreach-events', q, eventFilter, channel, sort, dir],
    queryFn: async () => {
      const res = await http.get('/api/crm/outreach/events', { params: { q, event: eventFilter, channel, sort, dir } })
      return res.data as { data: { items: EventItem[] } }
    },
  })
  const items = data?.data.items ?? []

  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(10)
  React.useEffect(() => { setPage(0) }, [q, eventFilter, channel, sort, dir, pageSize, isFetching])
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const pageItems = React.useMemo(() => items.slice(page * pageSize, page * pageSize + pageSize), [items, page, pageSize])

  return (
    <div className="space-y-4">
      <CRMNav />
      <h1 className="text-xl font-semibold">Outreach Events</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by recipient..." className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button type="button" onClick={() => setQ('')} disabled={!q} className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50">Clear</button>
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">All events</option>
            <option value="sent">sent</option>
            <option value="delivered">delivered</option>
            <option value="opened">opened</option>
            <option value="clicked">clicked</option>
            <option value="bounced">bounced</option>
            <option value="spam">spam</option>
            <option value="unsubscribed">unsubscribed</option>
          </select>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">All channels</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
          <select value={dir} onChange={(e) => setDir(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="desc">Newest</option>
            <option value="asc">Oldest</option>
          </select>
          {isFetching && <span className="text-xs text-[color:var(--color-text-muted)]">Loading...</span>}
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]"><tr>
            <th className="px-4 py-2">When</th>
            <th className="px-4 py-2">Recipient</th>
            <th className="px-4 py-2">Channel</th>
            <th className="px-4 py-2">Event</th>
            <th className="px-4 py-2">Variant</th>
            <th className="px-4 py-2">Template</th>
            <th className="px-4 py-2">Sequence</th>
          </tr></thead>
          <tbody>
            {pageItems.map((e) => (
              <tr key={e._id} className="border-t border-[color:var(--color-border)]">
                <td className="px-4 py-2">{e.at ? new Date(e.at).toLocaleString() : '-'}</td>
                <td className="px-4 py-2">{e.recipient ?? '-'}</td>
                <td className="px-4 py-2">{e.channel}</td>
                <td className="px-4 py-2">{e.event}</td>
                <td className="px-4 py-2">{e.variant ?? '-'}</td>
                <td className="px-4 py-2">{e.templateId ?? '-'}</td>
                <td className="px-4 py-2">{e.sequenceId ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between p-4 text-sm">
          <div className="flex items-center gap-2">
            <span>Rows: {items.length}</span>
            <label className="ml-4 flex items-center gap-1">Page size
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1">
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0}>Prev</button>
            <span>Page {page + 1} / {totalPages}</span>
            <button className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page + 1 >= totalPages}>Next</button>
          </div>
        </div>
      </div>
    </div>
  )
}


