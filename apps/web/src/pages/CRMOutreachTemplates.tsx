import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'
import { CRMHelpButton } from '@/components/CRMHelpButton'
import { Modal } from '@/components/Modal'

type Template = { _id: string; name?: string; channel?: 'email'|'sms'; subject?: string; body?: string; variant?: string | null }

export default function CRMOutreachTemplates() {
  const qc = useQueryClient()
  const [q, setQ] = React.useState('')
  const [sort, setSort] = React.useState<'updatedAt'|'name'|'channel'>('updatedAt')
  const [dir, setDir] = React.useState<'asc'|'desc'>('desc')
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Outreach Templates</h1>
        <CRMHelpButton tag="crm:outreach-templates" />
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
          <button className="ml-auto rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">
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

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit template"
        width="48rem"
      >
        {editing && (
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
        )}
      </Modal>
    </div>
  )
}


