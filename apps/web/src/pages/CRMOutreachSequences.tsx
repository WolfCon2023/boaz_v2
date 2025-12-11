import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'
import { CRMHelpButton } from '@/components/CRMHelpButton'

type Sequence = { _id: string; name?: string; steps?: Array<{ dayOffset: number; channel: 'email'|'sms'; templateId?: string }>; abGroup?: 'A'|'B'|null }

export default function CRMOutreachSequences() {
  const qc = useQueryClient()
  const [q, setQ] = React.useState('')
  const [sort, setSort] = React.useState<'updatedAt'|'name'>('updatedAt')
  const [dir, setDir] = React.useState<'asc'|'desc'>('desc')
  const [showAnalytics, setShowAnalytics] = React.useState(false)
  const { data, isFetching } = useQuery({
    queryKey: ['outreach-sequences', q, sort, dir],
    queryFn: async () => {
      const res = await http.get('/api/crm/outreach/sequences', { params: { q, sort, dir } })
      return res.data as { data: { items: Sequence[] } }
    },
  })
  const items = data?.data.items ?? []

  const eventsQ = useQuery({
    queryKey: ['outreach-events', 'analytics'],
    enabled: showAnalytics,
    queryFn: async () => {
      const res = await http.get('/api/crm/outreach/events', { params: { sort: 'at', dir: 'desc' } })
      return res.data as { data: { items: Array<{ sequenceId?: string|null; event: string }> } }
    },
    refetchInterval: showAnalytics ? 60000 : false,
  })
  const analyticsBySeq = React.useMemo(() => {
    const map = new Map<string, { sent: number; opened: number; clicked: number }>()
    const evts = eventsQ.data?.data.items ?? []
    for (const e of evts) {
      const key = String(e.sequenceId ?? '')
      if (!key) continue
      const cur = map.get(key) || { sent: 0, opened: 0, clicked: 0 }
      if (e.event === 'sent' || e.event === 'delivered') cur.sent += 1
      if (e.event === 'opened') cur.opened += 1
      if (e.event === 'clicked') cur.clicked += 1
      map.set(key, cur)
    }
    return map
  }, [eventsQ.data])

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
  const [createError, setCreateError] = React.useState<string | null>(null)
  const [editError, setEditError] = React.useState<string | null>(null)
  const [editName, setEditName] = React.useState('')
  const [editAB, setEditAB] = React.useState('')
  const [editSteps, setEditSteps] = React.useState('[]')
  // Help accordion removed in favor of KB; no local help state needed.

  React.useEffect(() => {
    if (!editing) return
    setEditName(editing.name ?? '')
    setEditAB(editing.abGroup ?? '')
    try { setEditSteps(JSON.stringify(editing.steps ?? [], null, 0)) } catch { setEditSteps('[]') }
  }, [editing])

  const visible = React.useMemo(() => {
    const ql = q.trim().toLowerCase()
    let rows = items
    if (ql) rows = rows.filter((s) => (s.name ?? '').toLowerCase().includes(ql))
    return rows
  }, [items, q])

  return (
    <div className="space-y-4">
      <CRMNav />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Outreach Sequences</h1>
        <CRMHelpButton tag="crm:outreach-sequences" />
      </div>
      {/* Help accordion removed; see KB link above for guidance. */}
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
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showAnalytics} onChange={(e) => setShowAnalytics(e.target.checked)} /> Show analytics</label>
          </div>
        </div>
        <form className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); setCreateError(null); const fd = new FormData(e.currentTarget); const name = String(fd.get('name')||''); const abGroup = String(fd.get('abGroup')||'') || undefined; const stepsRaw = String(fd.get('steps')||'').trim(); let steps: any[] = []; if (stepsRaw) { try { steps = JSON.parse(stepsRaw) } catch { setCreateError('Invalid JSON for Steps. Please ensure it is a valid JSON array.'); return } } create.mutate({ name, abGroup, steps }); (e.currentTarget as HTMLFormElement).reset() }}>
          <input name="name" required placeholder="Sequence name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <select name="abGroup" className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="">A/B Group (optional)</option>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
          <textarea name="steps" placeholder='Steps JSON (e.g., [{"dayOffset":0,"channel":"email"}])' className="sm:col-span-2 h-28 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"></textarea>
          <button className="ml-auto rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">
            Add sequence
          </button>
          {createError && <div className="sm:col-span-2 text-xs text-red-500">{createError}</div>}
        </form>
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]"><tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Steps</th>
            <th className="px-4 py-2">A/B</th>
            {showAnalytics && (<>
              <th className="px-4 py-2">Sent</th>
              <th className="px-4 py-2">Opened</th>
              <th className="px-4 py-2">Clicked</th>
              <th className="px-4 py-2">Open rate</th>
              <th className="px-4 py-2">Click rate</th>
            </>)}
            <th className="px-4 py-2">Actions</th>
          </tr></thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]">
                <td className="px-4 py-2">{s.name ?? '-'}</td>
                <td className="px-4 py-2">{Array.isArray(s.steps) ? `${s.steps.length} step(s)` : '-'}</td>
                <td className="px-4 py-2">{s.abGroup ?? '-'}</td>
                {showAnalytics && (() => { const a = analyticsBySeq.get(String(s._id)) || { sent: 0, opened: 0, clicked: 0 }; const openRate = a.sent ? Math.round((a.opened / a.sent) * 100) : 0; const clickRate = a.sent ? Math.round((a.clicked / a.sent) * 100) : 0; return (
                  <>
                    <td className="px-4 py-2">{a.sent}</td>
                    <td className="px-4 py-2">{a.opened}</td>
                    <td className="px-4 py-2">{a.clicked}</td>
                    <td className="px-4 py-2">{openRate}%</td>
                    <td className="px-4 py-2">{clickRate}%</td>
                  </>
                ) })()}
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
              <form className="grid gap-2 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); setEditError(null); const payload: any = { _id: editing._id, name: editName || undefined, abGroup: editAB ? editAB : null }; const stepsRaw = editSteps.trim(); if (stepsRaw) { try { payload.steps = JSON.parse(stepsRaw) } catch { setEditError('Invalid JSON for Steps. Please ensure it is a valid JSON array.'); return } } try { await update.mutateAsync(payload); setEditing(null) } catch { setEditError('Save failed. Please try again.'); } }}>
                <input name="name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Sequence name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <select name="abGroup" value={editAB} onChange={(e) => setEditAB(e.target.value)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)] font-semibold">
                  <option value="">(none)</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                </select>
                <textarea name="steps" value={editSteps} onChange={(e) => setEditSteps(e.target.value)} placeholder='Steps JSON' className="sm:col-span-2 h-40 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"></textarea>
                {editError && <div className="sm:col-span-2 text-xs text-red-500">{editError}</div>}
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


