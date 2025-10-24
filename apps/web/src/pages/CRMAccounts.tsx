import { useQuery } from '@tanstack/react-query'

type Account = { _id: string; name?: string; domain?: string; industry?: string }

export default function CRMAccounts() {
  const { data } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/crm/accounts')
      return res.json() as Promise<{ data: { items: Account[] } }>
    },
  })

  const items = data?.data.items ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Accounts</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Domain</th>
              <th className="px-4 py-2">Industry</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a._id} className="border-t border-[color:var(--color-border)]">
                <td className="px-4 py-2">{a.name ?? '-'}</td>
                <td className="px-4 py-2">{a.domain ?? '-'}</td>
                <td className="px-4 py-2">{a.industry ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


