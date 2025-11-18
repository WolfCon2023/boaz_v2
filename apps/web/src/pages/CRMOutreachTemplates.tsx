import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'

type Template = { _id: string; name?: string; channel?: 'email'|'sms'; subject?: string; body?: string; variant?: string | null }

export default function CRMOutreachTemplates() {
  const qc = useQueryClient()
  const [q, setQ] = React.useState('')
  const [sort, setSort] = React.useState<'updatedAt'|'name'|'channel'>('updatedAt')
  const [dir, setDir] = React.useState<'asc'|'desc'>('desc')
  const [showDef, setShowDef] = React.useState(true)
  const [showGuide, setShowGuide] = React.useState(true)
  const { data, isFetching } = useQuery({
    queryKey: ['outreach-templates', q, sort, dir],
    queryFn: async () => {
      const res = await http.get('/api/crm/outreach/templates', { params: { q, sort, dir } })
      return res.data as { data: { items: Template[] } }
    },
  })
  const items = data?.data.items ?? []

  const create = useMutation({
    mutationFn: async (payload: any) => { const res = await http.post('/api/crm/outreach/templates', payload); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outreach-templates'] }),
  })
  const update = useMutation({
    mutationFn: async (payload: any) => { const { _id, ...rest } = payload; const res = await http.put(`/api/crm/outreach/templates/${_id}`, rest); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outreach-templates'] }),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => { const res = await http.delete(`/api/crm/outreach/templates/${id}`); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outreach-templates'] }),
  })

  const [editing, setEditing] = React.useState<Template | null>(null)

  const visible = React.useMemo(() => {
    const ql = q.trim().toLowerCase()
    let rows = items
    if (ql) rows = rows.filter((t) => [t.name, t.channel, t.subject, t.body].some((v) => (v ?? '').toString().toLowerCase().includes(ql)))
    return rows
  }, [items, q])

  return (
    <div className="space-y-4">
      <CRMNav />
      <h1 className="text-xl font-semibold">Outreach Templates</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] text-sm">
        <button type="button" onClick={() => setShowDef((v) => !v)} aria-expanded={showDef} className="w-full px-4 py-3 font-semibold hover:bg-[color:var(--color-muted)] flex items-center justify-between">
          <span>What is a Template?</span>
          <span aria-hidden="true">{showDef ? '▾' : '▸'}</span>
        </button>
        {showDef && (
          <div className="px-4 pb-4">
            A template is a reusable message for Email or SMS. It defines the subject (email only) and body you send to contacts. Use templates to standardize outreach and to run A/B tests via the optional Variant tag.
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] text-sm">
        <button type="button" onClick={() => setShowGuide((v) => !v)} aria-expanded={showGuide} className="w-full px-4 py-3 font-semibold hover:bg-[color:var(--color-muted)] flex items-center justify-between">
          <span>How templates work</span>
          <span aria-hidden="true">{showGuide ? '▾' : '▸'}</span>
        </button>
        {showGuide && (
          <div className="px-4 pb-4">
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="font-semibold">Name</span>: internal name shown in the app.</li>
              <li><span className="font-semibold">Channel</span>: choose <span className="font-semibold">Email</span> or <span className="font-semibold">SMS</span>.</li>
              <li><span className="font-semibold">Subject</span>: email only; leave blank for SMS.</li>
              <li><span className="font-semibold">Body</span>: message content (supports plain text).</li>
              <li><span className="font-semibold">Variant</span>: optional A/B tag like "A" or "B" for experiments. Create multiple templates with the same name but different variants to split traffic and compare performance.</li>
            </ul>
            <div className="mt-2 text-[color:var(--color-text-muted)]">Tip: record the variant in deliveries/events so you can report open/click/reply rates per variant.</div>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates..." className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button type="button" onClick={() => setQ('')} disabled={!q} className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50">Clear</button>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="updatedAt">Updated</option>
            <option value="name">Name</option>
            <option value="channel">Channel</option>
          </select>
          <select value={dir} onChange={(e) => setDir(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
          {isFetching && <span className="text-xs text-[color:var(--color-text-muted)]">Loading...</span>}
        </div>
        <form className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const name = String(fd.get('name')||''); const channel = (String(fd.get('channel')||'email') as 'email'|'sms'); const subject = String(fd.get('subject')||''); const body = String(fd.get('body')||''); const variant = String(fd.get('variant')||'') || undefined; create.mutate({ name, channel, subject: channel==='email'?subject:undefined, body, variant }); (e.currentTarget as HTMLFormElement).reset() }}>
          <input name="name" required placeholder="Template name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <select name="channel" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
          <input name="subject" placeholder="Subject (email only)" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="variant" placeholder="Variant (A/B) e.g., A" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <textarea name="body" required placeholder="Body" className="sm:col-span-2 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"></textarea>
          <button className="inline-flex w-auto items-center justify-center rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-primary-700)]">
            Add template
          </button>
        </form>
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]"><tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Channel</th>
            <th className="px-4 py-2">Subject</th>
            <th className="px-4 py-2">Variant</th>
            <th className="px-4 py-2">Actions</th>
          </tr></thead>
          <tbody>
            {visible.map((t) => (
              <tr key={t._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                <td className="px-4 py-2">{t.name ?? '-'}</td>
                <td className="px-4 py-2">{t.channel ?? '-'}</td>
                <td className="px-4 py-2">{t.subject ?? '-'}</td>
                <td className="px-4 py-2">{t.variant ?? '-'}</td>
                <td className="px-4 py-2 flex gap-2">
                  <button className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(t)}>Edit</button>
                  <button className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]" onClick={() => remove.mutate(t._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,48rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Edit template</div>
              <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); update.mutate({ _id: editing._id, name: String(fd.get('name')||'')||undefined, channel: String(fd.get('channel')||'')||undefined, subject: String(fd.get('subject')||'')||undefined, variant: (String(fd.get('variant')||'')||null), body: String(fd.get('body')||'')||undefined }); setEditing(null) }}>
                <input name="name" defaultValue={editing.name ?? ''} placeholder="Template name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <select name="channel" defaultValue={editing.channel ?? 'email'} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
                <input name="subject" defaultValue={editing.subject ?? ''} placeholder="Subject" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="variant" defaultValue={editing.variant ?? ''} placeholder="Variant (A/B)" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <textarea name="body" defaultValue={editing.body ?? ''} placeholder="Body" className="sm:col-span-2 h-40 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"></textarea>
                <div className="col-span-full mt-2 flex items-center justify-end gap-2">
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


