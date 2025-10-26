import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'

type Sequence = { _id: string; name?: string; steps?: Array<{ dayOffset: number; channel: 'email'|'sms'; templateId?: string }>; abGroup?: 'A'|'B'|null }

export default function CRMOutreachSequences() {
  const qc = useQueryClient()
  const [q, setQ] = React.useState('')
  const [sort, setSort] = React.useState<'updatedAt'|'name'>('updatedAt')
  const [dir, setDir] = React.useState<'asc'|'desc'>('desc')
  const { data, isFetching } = useQuery({
    queryKey: ['outreach-sequences', q, sort, dir],
    queryFn: async () => {
      const res = await http.get('/api/crm/outreach/sequences', { params: { q, sort, dir } })
      return res.data as { data: { items: Sequence[] } }
    },
  })
  const items = data?.data.items ?? []

  const create = useMutation({
    mutationFn: async (payload: any) => { const res = await http.post('/api/crm/outreach/sequences', payload); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outreach-sequences'] }),
  })
  const update = useMutation({
    mutationFn: async (payload: any) => { const { _id, ...rest } = payload; const res = await http.put(`/api/crm/outreach/sequences/${_id}`, rest); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outreach-sequences'] }),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => { const res = await http.delete(`/api/crm/outreach/sequences/${id}`); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outreach-sequences'] }),
  })

  const [editing, setEditing] = React.useState<Sequence | null>(null)
  const [showDef, setShowDef] = React.useState(true)
  const [showGuide, setShowGuide] = React.useState(true)

  const visible = React.useMemo(() => {
    const ql = q.trim().toLowerCase()
    let rows = items
    if (ql) rows = rows.filter((s) => (s.name ?? '').toLowerCase().includes(ql))
    return rows
  }, [items, q])

  return (
    <div className="space-y-4">
      <CRMNav />
      <h1 className="text-xl font-semibold">Outreach Sequences</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] text-sm">
        <button type="button" onClick={() => setShowDef((v) => !v)} aria-expanded={showDef} className="w-full px-4 py-3 font-semibold hover:bg-[color:var(--color-muted)] flex items-center justify-between">
          <span>What is a Sequence?</span>
          <span aria-hidden="true">{showDef ? '▾' : '▸'}</span>
        </button>
        {showDef && (
          <div className="px-4 pb-4">
            A sequence is a scheduled series of outreach steps (Email or SMS) that run over time. Each step specifies when to send and which channel/template to use, enabling multi-touch campaigns.
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] text-sm">
        <button type="button" onClick={() => setShowGuide((v) => !v)} aria-expanded={showGuide} className="w-full px-4 py-3 font-semibold hover:bg-[color:var(--color-muted)] flex items-center justify-between">
          <span>How sequences work</span>
          <span aria-hidden="true">{showGuide ? '▾' : '▸'}</span>
        </button>
        {showGuide && (
          <div className="px-4 pb-4">
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="font-semibold">Name</span>: internal sequence name.</li>
              <li><span className="font-semibold">A/B Group</span>: optional grouping to compare full sequence variants (A vs B).</li>
              <li><span className="font-semibold">Steps</span>: JSON array of steps. Each step has <span className="font-semibold">dayOffset</span> (0 = send now, 1 = 1 day later, etc.), <span className="font-semibold">channel</span> (email or sms), and optional <span className="font-semibold">templateId</span>.</li>
            </ul>
            <div className="mt-2 text-[color:var(--color-text-muted)]">Example: [{'{'}"dayOffset":0,"channel":"email"{'}'},{'{'}"dayOffset":2,"channel":"sms"{'}'}]</div>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sequences..." className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button type="button" onClick={() => setQ('')} disabled={!q} className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50">Clear</button>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="updatedAt">Updated</option>
            <option value="name">Name</option>
          </select>
          <select value={dir} onChange={(e) => setDir(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
          {isFetching && <span className="text-xs text-[color:var(--color-text-muted)]">Loading...</span>}
        </div>
        <form className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const name = String(fd.get('name')||''); const abGroup = String(fd.get('abGroup')||'') || undefined; const stepsRaw = String(fd.get('steps')||'').trim(); const steps = stepsRaw ? JSON.parse(stepsRaw) : []; create.mutate({ name, abGroup, steps }); (e.currentTarget as HTMLFormElement).reset() }}>
          <input name="name" required placeholder="Sequence name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <select name="abGroup" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">A/B Group (optional)</option>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
          <textarea name="steps" placeholder='Steps JSON (e.g., [{"dayOffset":0,"channel":"email"}])' className="sm:col-span-2 h-28 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"></textarea>
          <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Add sequence</button>
        </form>
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]"><tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Steps</th>
            <th className="px-4 py-2">A/B</th>
            <th className="px-4 py-2">Actions</th>
          </tr></thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                <td className="px-4 py-2">{s.name ?? '-'}</td>
                <td className="px-4 py-2">{Array.isArray(s.steps) ? `${s.steps.length} step(s)` : '-'}</td>
                <td className="px-4 py-2">{s.abGroup ?? '-'}</td>
                <td className="px-4 py-2 flex gap-2">
                  <button className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(s)}>Edit</button>
                  <button className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]" onClick={() => remove.mutate(s._id)}>Delete</button>
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
              <div className="mb-3 text-base font-semibold">Edit sequence</div>
              <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const payload: any = { _id: editing._id, name: String(fd.get('name')||'')||undefined, abGroup: String(fd.get('abGroup')||'')||undefined }; const stepsRaw = String(fd.get('steps')||'').trim(); if (stepsRaw) payload.steps = JSON.parse(stepsRaw); update.mutate(payload); setEditing(null) }}>
                <input name="name" defaultValue={editing.name ?? ''} placeholder="Sequence name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <select name="abGroup" defaultValue={editing.abGroup ?? ''} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                  <option value="">(none)</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                </select>
                <textarea name="steps" defaultValue={JSON.stringify(editing.steps ?? [], null, 0)} placeholder='Steps JSON' className="sm:col-span-2 h-40 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"></textarea>
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


