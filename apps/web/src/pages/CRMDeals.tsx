import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'

type Deal = { _id: string; title?: string; amount?: number; stage?: string; closeDate?: string }

export default function CRMDeals() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['deals'],
    queryFn: async () => {
      const res = await http.get('/api/crm/deals')
      return res.data as { data: { items: Deal[] } }
    },
  })
  const create = useMutation({
    mutationFn: async (payload: { title: string; accountId: string; amount?: number; stage?: string; closeDate?: string }) => {
      const res = await http.post('/api/crm/deals', payload)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  })

  const items = data?.data.items ?? []

  return (
    <div className="space-y-4">
      <CRMNav />
      <h1 className="text-xl font-semibold">Deals</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <form className="flex flex-wrap gap-2 p-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); create.mutate({ title: String(fd.get('title')||''), accountId: String(fd.get('accountId')||''), amount: fd.get('amount') ? Number(fd.get('amount')) : undefined, stage: String(fd.get('stage')||'')|| undefined, closeDate: String(fd.get('closeDate')||'')|| undefined }); (e.currentTarget as HTMLFormElement).reset() }}>
          <input name="title" required placeholder="Title" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="accountId" required placeholder="Account ID" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="amount" type="number" step="1" placeholder="Amount" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="stage" placeholder="Stage" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="closeDate" type="date" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Add deal</button>
        </form>
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


