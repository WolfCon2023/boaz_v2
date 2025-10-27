import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'

type Article = { _id: string; title?: string; body?: string; tags?: string[]; updatedAt?: string }

export default function KnowledgeBase() {
  const qc = useQueryClient()
  const [q, setQ] = React.useState('')
  const [tag, setTag] = React.useState('')
  const [dir, setDir] = React.useState<'asc'|'desc'>('desc')
  const { data, isFetching } = useQuery({
    queryKey: ['kb', q, tag, dir],
    queryFn: async () => { const res = await http.get('/api/crm/support/kb', { params: { q, tag, sort: 'updatedAt', dir } }); return res.data as { data: { items: Article[] } } },
  })
  const items = data?.data.items ?? []

  const create = useMutation({
    mutationFn: async (payload: any) => { const res = await http.post('/api/crm/support/kb', payload); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb'] }),
  })
  const update = useMutation({
    mutationFn: async (payload: any) => { const { _id, ...rest } = payload; const res = await http.put(`/api/crm/support/kb/${_id}`, rest); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb'] }),
  })
  const remove = useMutation({
    mutationFn: async (_id: string) => { const res = await http.delete(`/api/crm/support/kb/${_id}`); return res.data },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb'] }),
  })

  // Pagination (client-side)
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(10)
  React.useEffect(() => { setPage(0) }, [q, tag, dir, pageSize])
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const pageItems = React.useMemo(() => items.slice(page * pageSize, page * pageSize + pageSize), [items, page, pageSize])

  // Derived tags list for chips
  const allTags = React.useMemo(() => Array.from(new Set(items.flatMap(a => a.tags ?? []))).sort(), [items])

  const [editing, setEditing] = React.useState<Article | null>(null)

  return (
    <div className="space-y-4">
      <CRMNav />
      <h1 className="text-xl font-semibold">Knowledge Base</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search articles..." className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button type="button" onClick={() => setQ('')} disabled={!q} className="rounded-lg border border-[color:var(--color-border)] px-2 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50">Clear</button>
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Filter by tag" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <div className="flex flex-wrap items-center gap-1">
            {allTags.map((t) => (
              <button key={t} type="button" onClick={() => setTag(tag === t ? '' : t)} className={`rounded-full border px-2 py-1 text-xs ${tag === t ? 'bg-[color:var(--color-primary-600)] text-white border-[color:var(--color-primary-600)]' : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]'}`}>{t}</button>
            ))}
          </div>
          <select value={dir} onChange={(e) => setDir(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold">
            <option value="desc">Newest</option>
            <option value="asc">Oldest</option>
          </select>
          {isFetching && <span className="text-xs text-[color:var(--color-text-muted)]">Loading...</span>}
        </div>
        <form className="grid gap-2 p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const title = String(fd.get('title')||''); const body = String(fd.get('body')||''); const tags = String(fd.get('tags')||'').split(',').map(s => s.trim()).filter(Boolean); if (!title || !body) return; create.mutate({ title, body, tags }); (e.currentTarget as HTMLFormElement).reset() }}>
          <input name="title" required placeholder="Title" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="tags" placeholder="Tags (comma-separated)" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <textarea name="body" required placeholder="Body" className="sm:col-span-2 h-32 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"></textarea>
          <div className="flex items-center gap-2">
            <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Add article</button>
            <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={(e) => { (e.currentTarget.closest('form') as HTMLFormElement | null)?.reset() }}>Clear</button>
          </div>
        </form>
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]"><tr>
            <th className="px-4 py-2">Title</th>
            <th className="px-4 py-2">Tags</th>
            <th className="px-4 py-2">Updated</th>
          </tr></thead>
          <tbody>
            {(pageItems ?? []).map((a) => (
              <tr key={a._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)] cursor-pointer" onClick={() => setEditing(a)}>
                <td className="px-4 py-2">{a.title ?? '-'}</td>
                <td className="px-4 py-2">{(a.tags ?? []).join(', ')}</td>
                <td className="px-4 py-2">{a.updatedAt ? new Date(a.updatedAt).toLocaleString() : '-'}</td>
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

      {editing && (
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,48rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Edit article</div>
              <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const payload: any = { _id: editing._id, title: String(fd.get('title')||'')||undefined, body: String(fd.get('body')||'')||undefined, tags: String(fd.get('tags')||'').split(',').map(s=>s.trim()).filter(Boolean) }; update.mutate(payload); setEditing(null) }}>
                <input name="title" defaultValue={editing.title ?? ''} placeholder="Title" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="tags" defaultValue={(editing.tags ?? []).join(', ')} placeholder="Tags" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <textarea name="body" defaultValue={editing.body ?? ''} placeholder="Body" className="sm:col-span-2 h-40 rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"></textarea>
                <div className="col-span-full mt-2 flex items-center justify-between gap-2">
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm text-[color:var(--color-danger-600)] hover:bg-[color:var(--color-muted)]" onClick={async () => { if (!editing?._id) return; if (!confirm('Delete this article?')) return; await remove.mutateAsync(editing._id); setEditing(null) }}>Delete</button>
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                    <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


