import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'

type Vendor = {
  _id: string
  name: string
  legalName?: string
  website?: string
  supportEmail?: string
  supportPhone?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  status: 'Active' | 'Inactive'
  categories?: string[]
  notes?: string
  createdAt?: string
  updatedAt?: string
}

export default function CRMVendors() {
  const qc = useQueryClient()
  const toast = useToast()
  const [q, setQ] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'Active' | 'Inactive'>('all')
  const [editing, setEditing] = React.useState<Vendor | null>(null)

  const { data, isFetching } = useQuery({
    queryKey: ['vendors', q, statusFilter],
    queryFn: async () => {
      const params: any = {}
      if (q.trim()) params.q = q.trim()
      if (statusFilter !== 'all') params.status = statusFilter
      const res = await http.get('/api/crm/vendors', { params })
      return res.data as { data: { items: Vendor[] } }
    },
  })
  const vendors = data?.data.items ?? []

  const saveVendor = useMutation({
    mutationFn: async (payload: Partial<Vendor>) => {
      if (editing && editing._id) {
        const res = await http.put(`/api/crm/vendors/${editing._id}`, payload)
        return res.data
      }
      const res = await http.post('/api/crm/vendors', payload)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      setEditing(null)
      toast.showToast('Vendor saved.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to save vendor.'
      toast.showToast(msg, 'error')
    },
  })

  const deleteVendor = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/crm/vendors/${id}`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] })
      toast.showToast('Vendor deleted.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to delete vendor.'
      toast.showToast(msg, 'error')
    },
  })

  return (
    <div className="space-y-6">
      <CRMNav />

      <header className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Vendors</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Track software, hardware, and service vendors for installed products and contracts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search vendors..."
            className="w-40 rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1.5 text-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
          >
            <option value="all">All</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <button
            type="button"
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[color:var(--color-primary-700)]"
            onClick={() =>
              setEditing({
                _id: '',
                name: '',
                status: 'Active',
              })
            }
          >
            Add vendor
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
        <div className="mb-3 flex items-center justify-between gap-2 text-xs text-[color:var(--color-text-muted)]">
          <span>Vendor catalog</span>
          {isFetching && <span>Loading…</span>}
        </div>
        {vendors.length === 0 ? (
          <div className="text-xs text-[color:var(--color-text-muted)]">
            No vendors yet. Use Add vendor to create your first entry.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-1 text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-[color:var(--color-text-muted)]">
                  <th className="px-2 py-1 text-left">Name</th>
                  <th className="px-2 py-1 text-left">Website</th>
                  <th className="px-2 py-1 text-left">Support</th>
                  <th className="px-2 py-1 text-left">Status</th>
                  <th className="px-2 py-1 text-left">Categories</th>
                  <th className="px-2 py-1 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr
                    key={v._id}
                    className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)]"
                  >
                    <td className="px-2 py-1 align-top">
                      <div className="font-medium text-[color:var(--color-text)]">{v.name}</div>
                      {v.legalName && (
                        <div className="text-[10px] text-[color:var(--color-text-muted)]">
                          {v.legalName}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1 align-top">
                      {v.website ? (
                        <a
                          href={v.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[color:var(--color-primary-600)] hover:underline"
                        >
                          {v.website}
                        </a>
                      ) : (
                        <span className="text-[color:var(--color-text-muted)]">-</span>
                      )}
                    </td>
                    <td className="px-2 py-1 align-top">
                      <div className="space-y-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                        {v.supportEmail && <div>{v.supportEmail}</div>}
                        {v.supportPhone && <div>{v.supportPhone}</div>}
                      </div>
                    </td>
                    <td className="px-2 py-1 align-top">
                      <span
                        className={
                          v.status === 'Active'
                            ? 'rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-100'
                            : 'rounded-full bg-[color:var(--color-muted)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]'
                        }
                      >
                        {v.status}
                      </span>
                    </td>
                    <td className="px-2 py-1 align-top">
                      {v.categories && v.categories.length ? (
                        <div className="flex flex-wrap gap-1">
                          {v.categories.map((c) => (
                            <span
                              key={c}
                              className="rounded-full bg-[color:var(--color-muted)] px-2 py-0.5 text-[10px]"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-[color:var(--color-text-muted)]">-</span>
                      )}
                    </td>
                    <td className="px-2 py-1 align-top">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] hover:bg-[color:var(--color-muted)]"
                          onClick={() => setEditing(v)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-danger)] hover:bg-[color:var(--color-muted)]"
                          onClick={() => {
                            if (!window.confirm('Delete this vendor?')) return
                            deleteVendor.mutate(v._id)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <div className="fixed inset-0 z-[2147483647]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,40rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 text-xs shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">
                    {editing._id ? 'Edit vendor' : 'Add vendor'}
                  </div>
                  <div className="text-[11px] text-[color:var(--color-text-muted)]">
                    Maintain a single source of truth for vendor metadata and support details.
                  </div>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    Legal name (optional)
                  </label>
                  <input
                    type="text"
                    value={editing.legalName ?? ''}
                    onChange={(e) => setEditing({ ...editing, legalName: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    Website
                  </label>
                  <input
                    type="text"
                    value={editing.website ?? ''}
                    onChange={(e) => setEditing({ ...editing, website: e.target.value })}
                    placeholder="https://example.com"
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    Status
                  </label>
                  <select
                    value={editing.status}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        status: e.target.value as 'Active' | 'Inactive',
                      })
                    }
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    Support email
                  </label>
                  <input
                    type="email"
                    value={editing.supportEmail ?? ''}
                    onChange={(e) => setEditing({ ...editing, supportEmail: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    Support phone
                  </label>
                  <input
                    type="text"
                    value={editing.supportPhone ?? ''}
                    onChange={(e) => setEditing({ ...editing, supportPhone: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    Categories, comma separated (for example CRM, Telephony, Infrastructure)
                  </label>
                  <input
                    type="text"
                    value={(editing.categories ?? []).join(', ')}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        categories: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  />
                </div>
                <div className="md:col-span-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                      Address line 1
                    </label>
                    <input
                      type="text"
                      value={editing.addressLine1 ?? ''}
                      onChange={(e) => setEditing({ ...editing, addressLine1: e.target.value })}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                      Address line 2
                    </label>
                    <input
                      type="text"
                      value={editing.addressLine2 ?? ''}
                      onChange={(e) => setEditing({ ...editing, addressLine2: e.target.value })}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                      City
                    </label>
                    <input
                      type="text"
                      value={editing.city ?? ''}
                      onChange={(e) => setEditing({ ...editing, city: e.target.value })}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                      State or region
                    </label>
                    <input
                      type="text"
                      value={editing.state ?? ''}
                      onChange={(e) => setEditing({ ...editing, state: e.target.value })}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                      Postal code
                    </label>
                    <input
                      type="text"
                      value={editing.postalCode ?? ''}
                      onChange={(e) => setEditing({ ...editing, postalCode: e.target.value })}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                      Country
                    </label>
                    <input
                      type="text"
                      value={editing.country ?? ''}
                      onChange={(e) => setEditing({ ...editing, country: e.target.value })}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-[11px] text-[color:var(--color-text-muted)]">
                    Notes
                  </label>
                  <textarea
                    rows={3}
                    value={editing.notes ?? ''}
                    onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-1.5 text-[11px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saveVendor.isPending || !editing.name.trim()}
                  className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                  onClick={() => {
                    const payload: any = {
                      name: editing.name.trim(),
                      legalName: editing.legalName?.trim() || undefined,
                      website: editing.website?.trim() || undefined,
                      supportEmail: editing.supportEmail?.trim() || undefined,
                      supportPhone: editing.supportPhone?.trim() || undefined,
                      addressLine1: editing.addressLine1?.trim() || undefined,
                      addressLine2: editing.addressLine2?.trim() || undefined,
                      city: editing.city?.trim() || undefined,
                      state: editing.state?.trim() || undefined,
                      postalCode: editing.postalCode?.trim() || undefined,
                      country: editing.country?.trim() || undefined,
                      status: editing.status,
                      categories: (editing.categories ?? []).filter(Boolean),
                      notes: editing.notes ?? undefined,
                    }
                    saveVendor.mutate(payload)
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


