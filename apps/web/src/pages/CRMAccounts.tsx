import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { http } from '@/lib/http'

type Account = { _id: string; accountNumber?: number; name?: string; companyName?: string; primaryContactName?: string; primaryContactEmail?: string; primaryContactPhone?: string }

export default function CRMAccounts() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts')
      return res.data as { data: { items: Account[] } }
    },
  })
  const create = useMutation({
    mutationFn: async (payload: { name: string; companyName?: string; primaryContactName?: string; primaryContactEmail?: string; primaryContactPhone?: string }) => {
      const res = await http.post('/api/crm/accounts', payload)
      return res.data as { data: Account }
    },
    onSuccess: (created) => {
      qc.setQueryData(['accounts'], (prev: any) => {
        if (!prev?.data?.items) return { data: { items: [created.data] } }
        return { data: { items: [created.data, ...prev.data.items] } }
      })
    },
  })

  const items = data?.data.items ?? []
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/crm/accounts/${id}`)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })

  const update = useMutation({
    mutationFn: async (payload: Partial<Account> & { _id: string }) => {
      const { _id, ...rest } = payload
      const res = await http.put(`/api/crm/accounts/${_id}`, rest)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })

  const [editing, setEditing] = React.useState<Account | null>(null)
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => {
    if (!editing) return
    const el = document.createElement('div')
    el.setAttribute('data-overlay', 'account-editor')
    Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '2147483647' })
    document.body.appendChild(el)
    setPortalEl(el)
    return () => {
      try { document.body.removeChild(el) } catch {}
      setPortalEl(null)
    }
  }, [editing])

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
              <tr key={a._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)] cursor-pointer" onClick={() => setEditing(a)}>
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
      {editing && portalEl && (
        portalEl.appendChild(document.createElement('div')),
        portalEl.lastChild && (
          (portalEl.lastChild as HTMLElement).outerHTML = `
            <div style="position:fixed;inset:0;z-index:2147483647">
              <div style="position:absolute;inset:0;background:rgba(0,0,0,.6)"></div>
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px">
                <div class="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl w-[min(90vw,40rem)]">
                  <div class="mb-3 text-base font-semibold">Edit account</div>
                  <form id="account-edit-form" class="grid gap-2 sm:grid-cols-2">
                    <input name="name" placeholder="Account name" class="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" value="${editing.name ?? ''}">
                    <input name="companyName" placeholder="Company name" class="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" value="${editing.companyName ?? ''}">
                    <input name="primaryContactName" placeholder="Primary contact name" class="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" value="${editing.primaryContactName ?? ''}">
                    <input name="primaryContactEmail" placeholder="Primary contact email" class="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" value="${editing.primaryContactEmail ?? ''}">
                    <input name="primaryContactPhone" placeholder="Primary contact phone" class="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" value="${editing.primaryContactPhone ?? ''}">
                    <div class="col-span-full mt-2 flex items-center justify-end gap-2">
                      <button type="button" id="account-edit-cancel" class="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">Cancel</button>
                      <button type="submit" class="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          `,
          (document.getElementById('account-edit-form') as HTMLFormElement | null)?.addEventListener('submit', (ev) => {
            ev.preventDefault()
            const fd = new FormData(ev.currentTarget as HTMLFormElement)
            update.mutate({
              _id: editing._id,
              name: String(fd.get('name')||'')||undefined,
              companyName: String(fd.get('companyName')||'')||undefined,
              primaryContactName: String(fd.get('primaryContactName')||'')||undefined,
              primaryContactEmail: String(fd.get('primaryContactEmail')||'')||undefined,
              primaryContactPhone: String(fd.get('primaryContactPhone')||'')||undefined,
            })
            setEditing(null)
          }),
          document.getElementById('account-edit-cancel')?.addEventListener('click', () => setEditing(null))
        )
      )}
    </div>
  )
}


