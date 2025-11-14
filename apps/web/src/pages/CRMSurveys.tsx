import * as React from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CRMNav } from '@/components/CRMNav'
import { formatDateTime } from '@/lib/dateFormat'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'

type SurveyProgram = {
  id: string
  name: string
  type: 'NPS' | 'CSAT' | 'Post‑interaction'
  channel: 'Email' | 'In‑app' | 'Link'
  status: 'Draft' | 'Active' | 'Paused'
  lastSentAt?: string
  responseRate?: number
}

export default function CRMSurveys() {
  const [typeFilter, setTypeFilter] = React.useState<'all' | 'NPS' | 'CSAT' | 'Post‑interaction'>('all')
  const [editing, setEditing] = React.useState<SurveyProgram | null>(null)
  const [showEditor, setShowEditor] = React.useState(false)
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)
  const toast = useToast()
  const queryClient = useQueryClient()

  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      setPortalEl(document.body)
    }
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['surveys-programs', typeFilter],
    queryFn: async () => {
      const params: any = {}
      if (typeFilter !== 'all') params.type = typeFilter
      const res = await http.get('/api/crm/surveys/programs', { params })
      const payload = res.data as {
        data: { items: Array<SurveyProgram & { _id?: string }> }
      }
      const items = payload.data.items.map((p) => ({
        ...p,
        id: (p as any)._id ?? p.id,
      }))
      return { items }
    },
  })

  const programs = data?.items ?? []
  const filteredPrograms = programs

  const saveProgram = useMutation({
    mutationFn: async (program: SurveyProgram) => {
      const body = {
        name: program.name,
        type: program.type,
        channel: program.channel,
        status: program.status,
      }

      if (program.id) {
        const res = await http.put(`/api/crm/surveys/programs/${program.id}`, body)
        return res.data
      }

      const res = await http.post('/api/crm/surveys/programs', body)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surveys-programs'] })
      toast.showToast('BOAZ says: Survey program saved.', 'success')
      setShowEditor(false)
      setEditing(null)
    },
    onError: (err: any) => {
      console.error('Save survey program error:', err)
      toast.showToast('BOAZ says: Failed to save survey program.', 'error')
    },
  })

  const openNewProgram = () => {
    setEditing({
      id: '',
      name: '',
      type: 'NPS',
      channel: 'Email',
      status: 'Draft',
    })
    setShowEditor(true)
  }

  const openEditProgram = (p: SurveyProgram) => {
    setEditing({ ...p })
    setShowEditor(true)
  }

  const closeEditor = () => {
    setShowEditor(false)
    setEditing(null)
  }

  const handleEditorChange = (field: keyof SurveyProgram, value: string) => {
    if (!editing) return
    setEditing({ ...editing, [field]: value } as SurveyProgram)
  }

  const handleSaveProgram = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return

    const trimmedName = editing.name.trim()
    if (!trimmedName) {
      // Simple guard; in future we can add nicer validation UI
      return
    }

    const withName: SurveyProgram = { ...editing, name: trimmedName }
    saveProgram.mutate(withName)
  }

  return (
    <div className="space-y-4">
      <CRMNav />
      <div className="px-4 pb-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Surveys &amp; Feedback</h1>
            <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
              Configure NPS and CSAT programs, and send post‑interaction surveys after tickets, demos, and other touchpoints.
            </p>
          </div>
          <a
            href="/apps/crm/surveys/help"
            className="inline-flex items-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]"
          >
            Learn about NPS, CSAT &amp; post‑interaction surveys
          </a>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-[color:var(--color-text)] font-medium">Filter by type:</span>
          <select
            className="rounded-md border border-[color:var(--color-border)] bg-white px-2 py-1 text-sm text-black font-semibold"
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as 'all' | 'NPS' | 'CSAT' | 'Post‑interaction')
            }
          >
            <option value="all">All</option>
            <option value="NPS">NPS</option>
            <option value="CSAT">CSAT</option>
            <option value="Post‑interaction">Post‑interaction</option>
          </select>
        </div>

        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-md font-semibold">Survey programs</h2>
            <button
              type="button"
              className="inline-flex items-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-700)]"
              onClick={openNewProgram}
            >
              New survey program
            </button>
          </div>

          {isLoading ? (
            <p className="text-sm text-[color:var(--color-text-muted)]">
              Loading survey programs…
            </p>
          ) : filteredPrograms.length === 0 ? (
            <p className="text-sm text-[color:var(--color-text-muted)]">
              No survey programs match this filter yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)]">
                    <th className="px-2 py-1">Name</th>
                    <th className="px-2 py-1">Type</th>
                    <th className="px-2 py-1">Channel</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Last Sent</th>
                    <th className="px-2 py-1">Response Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPrograms.map((p) => (
                    <tr
                      key={p.id}
                      className="cursor-pointer border-b border-[color:var(--color-border)] last:border-b-0 hover:bg-[color:var(--color-muted)]"
                      onClick={() => openEditProgram(p)}
                    >
                      <td className="px-2 py-1 font-medium">{p.name}</td>
                      <td className="px-2 py-1">{p.type}</td>
                      <td className="px-2 py-1">{p.channel}</td>
                      <td className="px-2 py-1">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            p.status === 'Active'
                              ? 'bg-green-100 text-green-800'
                              : p.status === 'Paused'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        {p.lastSentAt ? formatDateTime(p.lastSentAt) : '—'}
                      </td>
                      <td className="px-2 py-1">
                        {typeof p.responseRate === 'number' ? `${p.responseRate}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showEditor && editing && portalEl && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
          <div className="absolute inset-0 bg-black/60" onClick={closeEditor} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,40rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">
                    {editing.id ? 'Edit survey program' : 'New survey program'}
                  </h2>
                  <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                    Define the survey name, type, channel, and status. This is a UI prototype; data is not yet
                    saved to the server.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-full border border-[color:var(--color-border)] px-2 py-1 text-xs text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
                >
                  Close
                </button>
              </div>

              <form className="space-y-4" onSubmit={handleSaveProgram}>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">
                    Program name
                  </label>
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) => handleEditorChange('name', e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] px-3 py-2 text-sm text-[color:var(--color-text)] focus:border-[color:var(--color-primary-600)] focus:outline-none"
                    placeholder="e.g. Quarterly NPS – All Customers"
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--color-text)]">
                    Type
                  </label>
                    <select
                      value={editing.type}
                      onChange={(e) =>
                        handleEditorChange('type', e.target.value as SurveyProgram['type'])
                      }
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-black font-semibold"
                    >
                      <option value="NPS">NPS</option>
                      <option value="CSAT">CSAT</option>
                      <option value="Post‑interaction">Post‑interaction</option>
                    </select>
                  </div>

                  <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--color-text)]">
                    Channel
                  </label>
                    <select
                      value={editing.channel}
                      onChange={(e) =>
                        handleEditorChange('channel', e.target.value as SurveyProgram['channel'])
                      }
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-black font-semibold"
                    >
                      <option value="Email">Email</option>
                      <option value="In‑app">In‑app</option>
                      <option value="Link">Link</option>
                    </select>
                  </div>

                  <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--color-text)]">
                      Status
                  </label>
                    <select
                      value={editing.status}
                      onChange={(e) =>
                        handleEditorChange('status', e.target.value as SurveyProgram['status'])
                      }
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-black font-semibold"
                    >
                      <option value="Draft">Draft</option>
                      <option value="Active">Active</option>
                      <option value="Paused">Paused</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeEditor}
                    className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-700)]"
                  >
                    Save program
                  </button>
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


