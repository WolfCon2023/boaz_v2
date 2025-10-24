import { useQuery } from '@tanstack/react-query'

type Deal = { _id: string; title?: string; amount?: number; stage?: string; closeDate?: string }

export default function CRMDeals() {
  const { data } = useQuery({
    queryKey: ['deals'],
    queryFn: async () => {
      const res = await fetch('/api/crm/deals')
      return res.json() as Promise<{ data: { items: Deal[] } }>
    },
  })

  const items = data?.data.items ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Deals</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2">Close date</th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d._id} className="border-t border-[color:var(--color-border)]">
                <td className="px-4 py-2">{d.title ?? '-'}</td>
                <td className="px-4 py-2">{typeof d.amount === 'number' ? `$${d.amount.toLocaleString()}` : '-'}</td>
                <td className="px-4 py-2">{d.stage ?? '-'}</td>
                <td className="px-4 py-2">{d.closeDate ? new Date(d.closeDate).toLocaleDateString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


