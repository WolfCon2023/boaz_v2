import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

type Account = { _id: string; accountNumber?: number; name?: string; companyName?: string; primaryContactName?: string; primaryContactEmail?: string; primaryContactPhone?: string }

export default function CRMAccounts() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/crm/accounts')
      return res.json() as Promise<{ data: { items: Account[] } }>
    },
  })
  const create = useMutation({
    mutationFn: async (payload: { name: string; companyName?: string; primaryContactName?: string; primaryContactEmail?: string; primaryContactPhone?: string }) => {
      const res = await fetch('/api/crm/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })

  const items = data?.data.items ?? []
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/crm/accounts/${id}`, { method: 'DELETE' })
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Accounts</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <form className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); create.mutate({ name: String(fd.get('name')||''), companyName: String(fd.get('companyName')||'')|| undefined, primaryContactName: String(fd.get('primaryContactName')||'')|| undefined, primaryContactEmail: String(fd.get('primaryContactEmail')||'')|| undefined, primaryContactPhone: String(fd.get('primaryContactPhone')||'')|| undefined }); (e.currentTarget as HTMLFormElement).reset() }}>
          <input name="name" required placeholder="Account name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="companyName" placeholder="Company name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="primaryContactName" placeholder="Primary contact name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="primaryContactEmail" placeholder="Primary contact email" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <input name="primaryContactPhone" placeholder="Primary contact phone" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <button className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Add account</button>
        </form>
        <table className="w-full text-sm">
          <thead className="text-left text-[color:var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2">Account #</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Company</th>
              <th className="px-4 py-2">Primary contact</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a._id} className="border-t border-[color:var(--color-border)]">
                <td className="px-4 py-2">{a.accountNumber ?? '-'}</td>
                <td className="px-4 py-2">{a.name ?? '-'}</td>
                <td className="px-4 py-2">{a.companyName ?? '-'}</td>
                <td className="px-4 py-2">{a.primaryContactName ?? '-'}</td>
                <td className="px-4 py-2">{a.primaryContactEmail ?? '-'}</td>
                <td className="px-4 py-2">{a.primaryContactPhone ?? '-'}</td>
                <td className="px-4 py-2"><button className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]" onClick={() => remove.mutate(a._id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


