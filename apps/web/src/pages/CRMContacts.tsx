import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'

type Contact = { _id: string; name?: string; email?: string; company?: string }

async function fetchContacts({ pageParam, queryKey }: { pageParam?: string; queryKey: any[] }) {
  const [_key, q] = queryKey as [string, string]
  const url = new URL('/api/crm/contacts', window.location.origin)
  if (q) url.searchParams.set('q', q)
  if (pageParam) url.searchParams.set('cursor', pageParam)
  const res = await fetch(url.toString())
  return res.json() as Promise<{ data: { items: Contact[]; nextCursor: string | null } }>
}

export default function CRMContacts() {
  const qc = useQueryClient()
  const create = useMutation({
    mutationFn: async (payload: { name: string; email?: string; company?: string }) => {
      const res = await fetch('/api/crm/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
  const q = ''
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['contacts', q],
    queryFn: fetchContacts,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.data.nextCursor ?? undefined,
  })

  const items = data?.pages.flatMap((p) => p.data.items) ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Contacts</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <form className="flex flex-wrap gap-2 p-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); create.mutate({ name: String(fd.get('name')||''), email: String(fd.get('email')||'' )|| undefined, company: String(fd.get('company')||'')|| undefined }); (e.currentTarget as HTMLFormElement).reset() }}>
          <input name="name" required placeholder="Name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="email" placeholder="Email" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="company" placeholder="Company" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Add contact</button>
        </form>
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Company</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c._id} className="border-t border-[color:var(--color-border)]">
                <td className="px-4 py-2">{c.name ?? '-'}</td>
                <td className="px-4 py-2">{c.email ?? '-'}</td>
                <td className="px-4 py-2">{c.company ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-4">
          {hasNextPage && (
            <button className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}


