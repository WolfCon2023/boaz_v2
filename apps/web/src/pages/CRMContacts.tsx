import { useInfiniteQuery } from '@tanstack/react-query'

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


