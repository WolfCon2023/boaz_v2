import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'

type Contact = { _id: string; name?: string; email?: string; company?: string; mobilePhone?: string; officePhone?: string; isPrimary?: boolean; primaryPhone?: 'mobile' | 'office' }

async function fetchContacts({ pageParam, queryKey }: { pageParam?: string; queryKey: any[] }) {
  const [_key, q, page] = queryKey as [string, string, number]
  const params: any = { q }
  if (pageParam !== undefined) params.cursor = pageParam
  else params.page = page
  const res = await http.get('/api/crm/contacts', { params })
  return res.data as { data: { items: Contact[]; nextCursor?: string | null; page?: number; pageSize?: number; total?: number } }
}

export default function CRMContacts() {
  const qc = useQueryClient()
  const [q, setQ] = React.useState('')
  const [sort, setSort] = React.useState<'name'|'email'|'company'>('name')
  const [dir, setDir] = React.useState<'asc'|'desc'>('asc')
  const [page, setPage] = React.useState(0)
  const create = useMutation({
    mutationFn: async (payload: { name: string; email?: string; company?: string; mobilePhone?: string; officePhone?: string; isPrimary?: boolean; primaryPhone?: 'mobile' | 'office' }) => {
      const res = await http.post('/api/crm/contacts', payload)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
  const { data, refetch, isFetching } = useInfiniteQuery({
    queryKey: ['contacts', q, page],
    queryFn: fetchContacts,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data.nextCursor ?? undefined,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/crm/contacts/${id}`)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })

  const update = useMutation({
    mutationFn: async (payload: Partial<Contact> & { _id: string }) => {
      const { _id, ...rest } = payload
      const res = await http.put(`/api/crm/contacts/${_id}`, rest)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })

  const [editing, setEditing] = React.useState<Contact | null>(null)
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => {
    if (!editing) return
    const el = document.createElement('div')
    el.setAttribute('data-overlay', 'contact-editor')
    Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' })
    document.body.appendChild(el)
    setPortalEl(el)
    return () => {
      try { document.body.removeChild(el) } catch {}
      setPortalEl(null)
    }
  }, [editing])

  const items = data?.pages.flatMap((p) => p.data.items) ?? []
  const total = data?.pages[0]?.data.total
  const pageSize = data?.pages[0]?.data.pageSize ?? 25
  const totalPages = total ? Math.ceil(total / pageSize) : 0

  const visibleItems = React.useMemo(() => {
    const ql = q.trim().toLowerCase()
    let rows = items
    if (ql) {
      rows = rows.filter((c) =>
        [c.name, c.email, c.company, c.mobilePhone, c.officePhone]
          .some((v) => (v ?? '').toString().toLowerCase().includes(ql))
      )
    }
    const dirMul = dir === 'desc' ? -1 : 1
    rows = [...rows].sort((a: any, b: any) => {
      const av = a[sort]
      const bv = b[sort]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return String(av).localeCompare(String(bv)) * dirMul
    })
    return rows
  }, [items, q, sort, dir])

  // Outreach: sequences list for enroll action
  const seqs = useQuery({
    queryKey: ['outreach-sequences-pick'],
    queryFn: async () => {
      const res = await http.get('/api/crm/outreach/sequences', { params: { sort: 'name', dir: 'asc' } })
      return res.data as { data: { items: Array<{ _id: string; name?: string }> } }
    },
  })
  const enrollmentsQ = useQuery({
    queryKey: ['outreach-enrollments', editing?._id],
    enabled: Boolean(editing?._id),
    queryFn: async () => {
      const res = await http.get('/api/crm/outreach/enroll', { params: { contactId: editing?._id, includeCompleted: false } })
      return res.data as { data: { items: Array<{ _id: string; sequenceId: string; startedAt: string; lastStepIndex?: number; completedAt?: string | null }> } }
    },
  })

  // Refs for outreach action inputs to avoid nested forms
  const seqSelectRef = React.useRef<HTMLSelectElement | null>(null)
  const oneOffTextRef = React.useRef<HTMLInputElement | null>(null)
  const seqNameById = React.useMemo(() => {
    const list = seqs.data?.data.items ?? []
    return new Map(list.map((s) => [s._id, s.name ?? 'Sequence']))
  }, [seqs.data])

  return (
    <div className="space-y-4">
      <CRMNav />
      <h1 className="text-xl font-semibold">Contacts</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <form className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); create.mutate({ name: String(fd.get('name')||''), email: String(fd.get('email')||'' )|| undefined, company: String(fd.get('company')||'')|| undefined, mobilePhone: String(fd.get('mobilePhone')||'')|| undefined, officePhone: String(fd.get('officePhone')||'')|| undefined, isPrimary: fd.get('isPrimary') === 'on', primaryPhone: (fd.get('primaryPhone') as 'mobile'|'office'|null) || undefined }); (e.currentTarget as HTMLFormElement).reset() }}>
          <input name="name" required placeholder="Name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="email" placeholder="Email" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="company" placeholder="Company" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="mobilePhone" placeholder="Mobile phone" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="officePhone" placeholder="Office phone" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPrimary" /> Primary contact</label>
            <label className="flex items-center gap-2 text-sm">
              Primary phone:
              <select
                name="primaryPhone"
                className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]"
              >
                <option value="">Select</option>
                <option value="mobile">Mobile</option>
                <option value="office">Office</option>
              </select>
            </label>
          </div>
          <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Add contact</button>
        </form>
        <div className="flex items-center justify-between px-4 gap-2">
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); refetch() }} placeholder="Search contacts..." className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]"
            >
              <option value="name">Name</option>
              <option value="email">Email</option>
              <option value="company">Company</option>
            </select>
            <select
              value={dir}
              onChange={(e) => setDir(e.target.value as any)}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]"
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
          </div>
          <button
            className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 text-sm hover:bg-[color:var(--color-muted)]"
            onClick={async () => {
              const headers = ['Name','Email','Company','Mobile','Office','Primary','Primary phone','Enrollments (active)','Enrollments (history)']
              // Fetch enrollments (includeCompleted) for each contact in parallel
              const enrollmentData = await Promise.all(items.map(async (c) => {
                try {
                  const res = await http.get('/api/crm/outreach/enroll', { params: { contactId: c._id, includeCompleted: true } })
                  const ens = (res.data?.data?.items ?? []) as Array<{ sequenceId: string; completedAt?: string|null }>
                  const actives = ens.filter((e) => !e.completedAt).map((en) => seqNameById.get(en.sequenceId) ?? en.sequenceId).join('|')
                  const history = ens.filter((e) => !!e.completedAt).map((en) => seqNameById.get(en.sequenceId) ?? en.sequenceId).join('|')
                  return { actives, history }
                } catch {
                  return { actives: '', history: '' }
                }
              }))
              const rows = items.map((c, i) => [
                c.name ?? '',
                c.email ?? '',
                c.company ?? '',
                c.mobilePhone ?? '',
                c.officePhone ?? '',
                c.isPrimary ? 'Yes' : 'No',
                c.primaryPhone ?? '',
                enrollmentData[i]?.actives ?? '',
                enrollmentData[i]?.history ?? '',
              ])
              const csv = [
                headers.join(','),
                ...rows.map((r) => r.map((x) => '"'+String(x).replaceAll('"','""')+'"').join(',')),
              ].join('\n')
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'contacts.csv'
              a.click()
              URL.revokeObjectURL(url)
            }}
          >Export CSV</button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Company</th>
              <th className="px-4 py-2">Mobile</th>
              <th className="px-4 py-2">Office</th>
              <th className="px-4 py-2">Primary</th>
              <th className="px-4 py-2">Primary phone</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((c) => (
              <tr key={c._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)] cursor-pointer" onClick={() => setEditing(c)}>
                <td className="px-4 py-2">{c.name ?? '-'}</td>
                <td className="px-4 py-2">{c.email ?? '-'}</td>
                <td className="px-4 py-2">{c.company ?? '-'}</td>
                <td className="px-4 py-2">{c.mobilePhone ?? '-'}</td>
                <td className="px-4 py-2">{c.officePhone ?? '-'}</td>
                <td className="px-4 py-2">{c.isPrimary ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2">{c.primaryPhone ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between p-4 text-sm">
          <div>
            {typeof total === 'number' ? `Total: ${total}` : ''}
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]" onClick={() => { setPage((p) => Math.max(0, p - 1)); refetch() }} disabled={isFetching || page <= 0}>
              Prev
            </button>
            <span>Page {page + 1}{totalPages ? ` / ${totalPages}` : ''}</span>
            <button className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]" onClick={() => { setPage((p) => p + 1); refetch() }} disabled={isFetching || (totalPages ? page + 1 >= totalPages : false)}>
              Next
            </button>
          </div>
        </div>
      </div>
      {editing && portalEl && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,40rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
            <div className="mb-3 text-base font-semibold">Edit contact</div>
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                update.mutate({
                  _id: editing._id,
                  name: String(fd.get('name') || '') || undefined,
                  email: String(fd.get('email') || '') || undefined,
                  company: String(fd.get('company') || '') || undefined,
                  mobilePhone: String(fd.get('mobilePhone') || '') || undefined,
                  officePhone: String(fd.get('officePhone') || '') || undefined,
                  isPrimary: fd.get('isPrimary') === 'on',
                  primaryPhone: (fd.get('primaryPhone') as 'mobile' | 'office' | null) || undefined,
                })
                setEditing(null)
              }}
            >
              <input name="name" defaultValue={editing.name ?? ''} placeholder="Name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
              <input name="email" defaultValue={editing.email ?? ''} placeholder="Email" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
              <input name="company" defaultValue={editing.company ?? ''} placeholder="Company" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
              <input name="mobilePhone" defaultValue={editing.mobilePhone ?? ''} placeholder="Mobile phone" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
              <input name="officePhone" defaultValue={editing.officePhone ?? ''} placeholder="Office phone" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isPrimary" defaultChecked={Boolean(editing.isPrimary)} /> Primary contact
              </label>
              <label className="flex items-center gap-2 text-sm">
                Primary phone:
                <select
                  name="primaryPhone"
                  defaultValue={editing.primaryPhone ?? ''}
                  className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]"
                >
                  <option value="">Select</option>
                  <option value="mobile">Mobile</option>
                  <option value="office">Office</option>
                </select>
              </label>

              <div className="col-span-full mt-4 rounded-xl border border-[color:var(--color-border)] p-3">
                <div className="mb-2 text-sm font-semibold">Outreach actions</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-xs">Enroll in sequence</label>
                    <select ref={seqSelectRef} className="mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                      {(seqs.data?.data.items ?? []).map((s) => (<option key={s._id} value={s._id}>{s.name ?? 'Sequence'}</option>))}
                    </select>
                    <button type="button" className="mt-2 rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]" onClick={() => { const sequenceId = seqSelectRef.current?.value || ''; if (sequenceId) { http.post('/api/crm/outreach/enroll', { contactId: editing._id, sequenceId }).then(() => alert('Enrolled')) } }}>
                      Enroll
                    </button>
                  </div>
                  <div>
                    <label className="text-xs">Send one‑off email</label>
                    <input ref={oneOffTextRef} placeholder="Body" className="mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-2 text-sm" />
                    <button type="button" className="mt-2 rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]" onClick={() => { const to = editing.email || ''; const text = oneOffTextRef.current?.value || ''; if (to && text) { http.post('/api/crm/outreach/send/email', { to, subject: 'Message', text }).then(() => alert('Sent')) } }}>
                      Send
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-xs">
                  <div className="mb-1 font-semibold">Current enrollments</div>
                  <ul className="list-disc pl-5">
                    {(enrollmentsQ.data?.data.items ?? []).map((en) => {
                      const label = seqNameById.get(en.sequenceId) ?? en.sequenceId
                      return (
                        <li key={en._id} className="flex items-center gap-2">Seq: {label} • Started: {new Date(en.startedAt).toLocaleDateString()} • Step: {(en.lastStepIndex ?? -1) + 1} {en.completedAt ? '• Completed' : ''}
                          {!en.completedAt && (
                            <button type="button" className="ml-2 rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[11px] hover:bg-[color:var(--color-muted)]" onClick={() => { http.post(`/api/crm/outreach/enroll/${en._id}/unenroll`).then(() => enrollmentsQ.refetch()) }}>Unenroll</button>
                          )}
                        </li>
                      )
                    })}
                    {((enrollmentsQ.data?.data.items ?? []).length === 0) && <li>None</li>}
                  </ul>
                  {(enrollmentsQ.data?.data.items ?? []).some((en) => !en.completedAt) && (
                    <button type="button" className="mt-2 rounded border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-muted)]" onClick={() => { http.post('/api/crm/outreach/enroll/bulk/unenroll', { contactId: editing._id }).then(() => enrollmentsQ.refetch()) }}>Unenroll all</button>
                  )}
                </div>
              </div>

              <div className="col-span-full mt-2 flex items-center justify-end gap-2">
                <button type="button" className="mr-auto rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm text-red-600 hover:bg-[color:var(--color-muted)]" onClick={() => { if (editing?._id) remove.mutate(editing._id); setEditing(null) }}>Delete</button>
                <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
              </div>
            </form>
            </div>
          </div>
        </div>,
        portalEl
      )}
    </div>
  )
}


