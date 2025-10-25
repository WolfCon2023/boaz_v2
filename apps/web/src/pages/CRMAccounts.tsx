import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'

type Account = { _id: string; accountNumber?: number; name?: string; companyName?: string; primaryContactName?: string; primaryContactEmail?: string; primaryContactPhone?: string }

export default function CRMAccounts() {
  const qc = useQueryClient()
  const [query, setQuery] = React.useState('')
  const [sort, setSort] = React.useState<'name'|'companyName'|'accountNumber'>('name')
  const [dir, setDir] = React.useState<'asc'|'desc'>('asc')
  const { data, isFetching } = useQuery({
    queryKey: ['accounts', query, sort, dir],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', { params: { q: query, sort, dir } })
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
  const visibleItems = React.useMemo(() => {
    const ql = query.trim().toLowerCase()
    let rows = items
    if (ql) {
      rows = rows.filter((a) =>
        [a.name, a.companyName, a.primaryContactName, a.primaryContactEmail, a.primaryContactPhone]
          .some((v) => (v ?? '').toString().toLowerCase().includes(ql))
      )
    }
    const dirMul = dir === 'desc' ? -1 : 1
    rows = [...rows].sort((a: any, b: any) => {
      const av = a[sort]
      const bv = b[sort]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dirMul
      return String(av).localeCompare(String(bv)) * dirMul
    })
    return rows
  }, [items, query, sort, dir])
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
      <CRMNav />
      <h1 className="text-xl font-semibold">Accounts</h1>
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search accounts..." className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]">
            <option value="name">Name</option>
            <option value="companyName">Company</option>
            <option value="accountNumber">Account #</option>
          </select>
          <select value={dir} onChange={(e) => setDir(e.target.value as any)} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-sm text-[color:var(--color-text)] font-semibold [&>option]:text-[color:var(--color-text)] [&>option]:bg-[color:var(--color-panel)]">
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
          {isFetching && <span className="text-xs text-[color:var(--color-text-muted)]">Loading...</span>}
        </div>
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
            {visibleItems.map((a) => (
              <tr key={a._id} className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)] cursor-pointer" onClick={() => setEditing(a)}>
                <td className="px-4 py-2">{a.accountNumber ?? '-'}</td>
                <td className="px-4 py-2">{a.name ?? '-'}</td>
                <td className="px-4 py-2">{a.companyName ?? '-'}</td>
                <td className="px-4 py-2">{a.primaryContactName ?? '-'}</td>
                <td className="px-4 py-2">{a.primaryContactEmail ?? '-'}</td>
                <td className="px-4 py-2">{a.primaryContactPhone ?? '-'}</td>
                <td className="px-4 py-2"><button className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]" onClick={(e) => { e.stopPropagation(); remove.mutate(a._id) }}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && portalEl && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,40rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Edit account</div>
              <form
                className="grid gap-2 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  update.mutate({
                    _id: editing._id,
                    name: String(fd.get('name')||'')||undefined,
                    companyName: String(fd.get('companyName')||'')||undefined,
                    primaryContactName: String(fd.get('primaryContactName')||'')||undefined,
                    primaryContactEmail: String(fd.get('primaryContactEmail')||'')||undefined,
                    primaryContactPhone: String(fd.get('primaryContactPhone')||'')||undefined,
                  })
                  setEditing(null)
                }}
              >
                <input name="name" defaultValue={editing.name ?? ''} placeholder="Account name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="companyName" defaultValue={editing.companyName ?? ''} placeholder="Company name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="primaryContactName" defaultValue={editing.primaryContactName ?? ''} placeholder="Primary contact name" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="primaryContactEmail" defaultValue={editing.primaryContactEmail ?? ''} placeholder="Primary contact email" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <input name="primaryContactPhone" defaultValue={editing.primaryContactPhone ?? ''} placeholder="Primary contact phone" className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm" />
                <div className="col-span-full mt-2 flex items-center justify-end gap-2">
                  <button type="button" className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]">Save</button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        portalEl
      )}
    </div>
  )
}


