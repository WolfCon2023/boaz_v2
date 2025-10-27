import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'

type Ticket = {
  _id: string
  ticketNumber?: number
  title?: string
  shortDescription?: string
  description?: string
  status?: 'open' | 'pending' | 'resolved' | 'closed'
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  accountId?: string | null
  contactId?: string | null
  assignee?: string | null
  slaDueAt?: string | null
  createdAt?: string
  updatedAt?: string
  comments?: { author?: string; body?: string; at?: string }[]
}

export default function SupportTickets() {
  const qc = useQueryClient()
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [priority, setPriority] = React.useState('')
  const [sort, setSort] = React.useState<'createdAt'|'updatedAt'|'ticketNumber'|'priority'|'status'>('createdAt')
  const [dir, setDir] = React.useState<'asc'|'desc'>('desc')
  const { data, isFetching } = useQuery({
    queryKey: ['support-tickets', q, status, priority, sort, dir],
    queryFn: async () => {
      const res = await http.get('/api/crm/support/tickets', { params: { q, status, priority, sort, dir } })
      return res.data as { data: { items: Ticket[] } }
    },
  })
  const items = data?.data.items ?? []

  const create = useMutation({
    mutationFn: async (payload: any) => { const res = await http.post('/api/crm/support/tickets', payload); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-tickets'] }),
  })
  const update = useMutation({
    mutationFn: async (payload: any) => { const { _id, ...rest } = payload; const res = await http.put(`/api/crm/support/tickets/${_id}`, rest); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-tickets'] }),
  })
  const addComment = useMutation({
    mutationFn: async (payload: { _id: string, body: string }) => { const res = await http.post(`/api/crm/support/tickets/${payload._id}/comments`, { body: payload.body }); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-tickets'] }),
  })

  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(10)
  React.useEffect(() => { setPage(0) }, [q, status, priority, sort, dir, pageSize])
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const pageItems = React.useMemo(() => items.slice(page * pageSize, page * pageSize + pageSize), [items, page, pageSize])

  const [editing, setEditing] = React.useState<Ticket | null>(null)
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => { if (!editing) return; const el = document.createElement('div'); el.setAttribute('data-overlay', 'ticket-editor'); Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' }); document.body.appendChild(el); setPortalEl(el); return () => { try { document.body.removeChild(el) } catch {}; setPortalEl(null) } }, [editing])

  // Inline SLA due date/time picker
  const [slaEditing, setSlaEditing] = React.useState<Ticket | null>(null)
  const [slaPortal, setSlaPortal] = React.useState<HTMLElement | null>(null)
  const [slaValue, setSlaValue] = React.useState('')
  React.useEffect(() => {
    if (!slaEditing) return
    const el = document.createElement('div')
    el.setAttribute('data-overlay', 'ticket-sla')
    Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' })
    document.body.appendChild(el)
    setSlaPortal(el)
    setSlaValue(slaEditing.slaDueAt ? slaEditing.slaDueAt.slice(0, 16) : '')
    return () => { try { document.body.removeChild(el) } catch {}; setSlaPortal(null) }
  }, [slaEditing])

  // Create-form SLA modal picker
  const [createSlaOpen, setCreateSlaOpen] = React.useState(false)
  const [createSlaPortal, setCreateSlaPortal] = React.useState<HTMLElement | null>(null)
  const [createSlaValue, setCreateSlaValue] = React.useState('')
  React.useEffect(() => {
    if (!createSlaOpen) return
    const el = document.createElement('div')
    el.setAttribute('data-overlay', 'ticket-sla-create')
    Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' })
    document.body.appendChild(el)
    setCreateSlaPortal(el)
    return () => { try { document.body.removeChild(el) } catch {}; setCreateSlaPortal(null) }
  }, [createSlaOpen])

  return (
    <div className="space-y-4">
      <CRMNav />
      <h1 className="text-xl font-semibold">Support Tickets</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tickets..." className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button type="button" onClick={() => setQ('')} disabled={!q} className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50">Clear</button>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">All status</option>
            <option value="open">open</option>
            <option value="pending">pending</option>
            <option value="resolved">resolved</option>
            <option value="closed">closed</option>
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">All priority</option>
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
            <option value="urgent">urgent</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="createdAt">Created</option>
            <option value="updatedAt">Updated</option>
            <option value="ticketNumber">Ticket #</option>
            <option value="priority">Priority</option>
            <option value="status">Status</option>
          </select>
          <select value={dir} onChange={(e) => setDir(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
          {isFetching && <span className="text-xs text-[color:var(--color-text-muted)]">Loading...</span>}
        </div>
        <form className="grid items-start gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const shortDescription = String(fd.get('shortDescription')||''); const description = String(fd.get('description')||''); const assignee = String(fd.get('assignee')||''); const status = String(fd.get('status')||'') || 'open'; const priority = String(fd.get('priority')||'') || 'normal'; const slaDueAt = createSlaValue || String(fd.get('slaDueAt')||'') || undefined; create.mutate({ shortDescription, description, assignee, status, priority, slaDueAt }); (e.currentTarget as HTMLFormElement).reset(); setCreateSlaValue('') }}>
          <input name="shortDescription" required placeholder="Short description" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <select name="status" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold"><option>open</option><option>pending</option><option>resolved</option><option>closed</option></select>
          <input name="assignee" placeholder="Assignee" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] text-[color:var(--color-text)] px-3 py-2 text-sm" />
          
          <select name="priority" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold"><option>normal</option><option>low</option><option>high</option><option>urgent</option></select>
          <div className="flex items-center gap-2">
            <input name="slaDueAt" type="hidden" value={createSlaValue} readOnly />
            <div className="text-sm text-[color:var(--color-text-muted)]">
              {createSlaValue ? new Date(createSlaValue).toLocaleString() : 'SLA due (optional)'}
            </div>
            <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setCreateSlaOpen(true)}>Set</button>
          </div>
          <textarea name="description" placeholder="Description" maxLength={2500} className="sm:col-span-2 h-32 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button className="inline-flex w-fit self-start justify-center rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Create ticket</button>
        </form>
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]"><tr>
            <th className="px-4 py-2">Ticket #</th>
            <th className="px-4 py-2">Short description</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Priority</th>
            <th className="px-4 py-2">SLA Due</th>
            <th className="px-4 py-2">Updated</th>
          </tr></thead>
          <tbody>
            {pageItems.map((t) => (
              <tr key={t._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)] cursor-pointer" onClick={() => setEditing(t)}>
                <td className="px-4 py-2">{t.ticketNumber ?? '-'}</td>
                <td className="px-4 py-2">{t.shortDescription ?? t.title ?? '-'}</td>
                <td className="px-4 py-2">{t.status ?? '-'}</td>
                <td className="px-4 py-2">{t.priority ?? '-'}</td>
                <td className="px-4 py-2 flex items-center gap-2">
                  <span>{t.slaDueAt ? new Date(t.slaDueAt).toLocaleString() : '-'}</span>
                  <button type="button" className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-xs hover:bg-[color:var(--color-muted)]" onClick={(e) => { e.stopPropagation(); setSlaEditing(t) }}>Set</button>
                </td>
                <td className="px-4 py-2">{t.updatedAt ? new Date(t.updatedAt).toLocaleString() : '-'}</td>
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

      {editing && portalEl && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,48rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Edit ticket</div>
              <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const payload: any = { _id: editing._id, shortDescription: String(fd.get('shortDescription')||'')||undefined, status: String(fd.get('status')||'')||undefined, priority: String(fd.get('priority')||'')||undefined, assignee: String(fd.get('assignee')||'')||undefined, description: String(fd.get('description')||'')||undefined }; const sla = String(fd.get('slaDueAt')||''); if (sla) payload.slaDueAt = sla; update.mutate(payload); setEditing(null) }}>
                <input name="shortDescription" defaultValue={editing.shortDescription ?? editing.title ?? ''} placeholder="Short description" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <select name="status" defaultValue={editing.status ?? 'open'} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold"><option>open</option><option>pending</option><option>resolved</option><option>closed</option></select>
                <select name="priority" defaultValue={editing.priority ?? 'normal'} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold"><option>low</option><option>normal</option><option>high</option><option>urgent</option></select>
                <input name="assignee" defaultValue={editing.assignee ?? ''} placeholder="Assignee" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] text-[color:var(--color-text)] px-3 py-2 text-sm" />
                <div className="flex items-center gap-2">
                  <input name="slaDueAt" type="datetime-local" defaultValue={editing.slaDueAt ? editing.slaDueAt.slice(0,16) : ''} className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                  <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">OK</button>
                </div>
                <textarea name="description" defaultValue={editing.description ?? ''} placeholder="Description" maxLength={2500} className="sm:col-span-2 h-40 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <div className="sm:col-span-2 mt-2">
                  <div className="mb-2 text-sm font-semibold">History</div>
                  <div className="space-y-2 max-h-48 overflow-auto rounded-lg border border-[color:var(--color-border)] p-2">
                    <div className="text-xs text-[color:var(--color-text-muted)]">Created: {editing.createdAt ? new Date(editing.createdAt).toLocaleString() : '-'}</div>
                    {(editing.comments ?? []).map((c, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="text-xs text-[color:var(--color-text-muted)]">{c.at ? new Date(c.at).toLocaleString() : ''} • {c.author || 'system'}</div>
                        <div>{c.body}</div>
                      </div>
                    ))}
                    {(!editing.comments || editing.comments.length === 0) && (
                      <div className="text-xs text-[color:var(--color-text-muted)]">No comments yet.</div>
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-semibold">Add comment</label>
                  <AddComment editing={editing} onAdded={(comment) => { setEditing((prev) => prev ? { ...prev, comments: [...(prev.comments ?? []), comment] } : prev) }} addComment={addComment} />
                </div>
                <div className="col-span-full mt-2 flex items-center justify-end gap-2">
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
                </div>
              </form>
            </div>
          </div>
        </div>, portalEl)}

      {slaEditing && slaPortal && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setSlaEditing(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,24rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Set SLA due date/time</div>
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <input type="datetime-local" value={slaValue} onChange={(e) => setSlaValue(e.target.value)} className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                  <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]" onClick={() => { if (slaEditing?._id) { update.mutate({ _id: slaEditing._id, slaDueAt: slaValue }); setSlaEditing(null) } }}>OK</button>
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setSlaEditing(null)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>, slaPortal)}

      {createSlaOpen && createSlaPortal && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setCreateSlaOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,24rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Set SLA due date/time</div>
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <input type="datetime-local" value={createSlaValue} onChange={(e) => setCreateSlaValue(e.target.value)} className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                  <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]" onClick={() => setCreateSlaOpen(false)}>OK</button>
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => { setCreateSlaValue(''); setCreateSlaOpen(false) }}>Clear</button>
                </div>
              </div>
            </div>
          </div>
        </div>, createSlaPortal)}
    </div>
  )
}

function AddComment({ editing, onAdded, addComment }: { editing: Ticket, onAdded: (c: { author?: string; body?: string; at?: string }) => void, addComment: { mutateAsync: (vars: { _id: string; body: string }) => Promise<any> } }) {
  const [value, setValue] = React.useState('')
  return (
    <div className="flex items-start gap-2">
      <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="Write a comment..." className="min-h-[72px] flex-1 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
      <div className="flex flex-col gap-2">
        <button type="button" disabled={!value.trim()} className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50" onClick={async () => {
          if (!value.trim()) return
          await addComment.mutateAsync({ _id: editing._id, body: value.trim() })
          const newComment = { author: 'you', body: value.trim(), at: new Date().toISOString() }
          onAdded(newComment)
          setValue('')
        }}>Add</button>
        <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setValue('')}>Clear</button>
      </div>
    </div>
  )
}


