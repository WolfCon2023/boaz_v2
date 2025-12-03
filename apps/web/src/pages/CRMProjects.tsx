import * as React from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'
import { formatDate } from '@/lib/dateFormat'
import { RelatedTasks } from '@/components/RelatedTasks'

type Project = {
  _id: string
  name: string
  description?: string
  status: 'not_started' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled'
  type?: 'implementation' | 'onboarding' | 'change_request' | 'internal'
  accountId?: string
  dealId?: string
  ownerUserId?: string
  ownerName?: string
  ownerEmail?: string
  startDate?: string | null
  targetEndDate?: string | null
  actualEndDate?: string | null
  health?: 'on_track' | 'at_risk' | 'off_track'
  progressPercent?: number | null
}

type AccountPick = { _id: string; accountNumber?: number; name?: string }
type DealPick = { _id: string; dealNumber?: number; title?: string }

export default function CRMProjects() {
  const qc = useQueryClient()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState<string>('')
  const [type, setType] = React.useState<string>('')
  const [health, setHealth] = React.useState<string>('')
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(10)
  const [sort, setSort] = React.useState<'targetEndDate' | 'startDate' | 'createdAt' | 'status' | 'health'>(
    'targetEndDate',
  )
  const [dir, setDir] = React.useState<'asc' | 'desc'>('asc')

  const [editing, setEditing] = React.useState<Project | null>(null)
  const [editName, setEditName] = React.useState('')
  const [editDescription, setEditDescription] = React.useState('')
  const [editStatus, setEditStatus] = React.useState<Project['status']>('not_started')
  const [editType, setEditType] = React.useState<Project['type']>('implementation')
  const [editHealth, setEditHealth] = React.useState<Project['health']>('on_track')
  const [editProgress, setEditProgress] = React.useState<string>('0')
  const [editAccountId, setEditAccountId] = React.useState<string>('')
  const [editDealId, setEditDealId] = React.useState<string>('')
  const [editStartDate, setEditStartDate] = React.useState<string>('')
  const [editTargetEndDate, setEditTargetEndDate] = React.useState<string>('')
  const [editActualEndDate, setEditActualEndDate] = React.useState<string>('')

  // Initialize from URL
  const initialized = React.useRef(false)
  React.useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const get = (key: string) => searchParams.get(key) || ''
    const getNum = (key: string, fallback: number) => {
      const v = searchParams.get(key)
      const n = v != null ? Number(v) : NaN
      return Number.isFinite(n) && n >= 0 ? n : fallback
    }
    const q0 = get('q')
    const status0 = get('status')
    const type0 = get('type')
    const health0 = get('health')
    const sort0 = (get('sort') as any) || 'targetEndDate'
    const dir0 = (get('dir') as any) || 'asc'
    const page0 = getNum('page', 0)
    const limit0 = getNum('limit', 10)
    if (q0) setQ(q0)
    if (status0) setStatus(status0)
    if (type0) setType(type0)
    if (health0) setHealth(health0)
    setSort(sort0)
    setDir(dir0)
    setPage(page0)
    setPageSize(limit0)
  }, [searchParams])

  React.useEffect(() => {
    const params: Record<string, string> = {}
    if (q) params.q = q
    if (status) params.status = status
    if (type) params.type = type
    if (health) params.health = health
    if (sort) params.sort = sort
    if (dir) params.dir = dir
    if (page) params.page = String(page)
    if (pageSize !== 10) params.limit = String(pageSize)
    setSearchParams(params, { replace: true })
  }, [q, status, type, health, sort, dir, page, pageSize, setSearchParams])

  const projectsQ = useQuery<{ data: { items: Project[]; total: number; page: number; limit: number } }>({
    queryKey: ['projects', q, status, type, health, sort, dir, page, pageSize],
    queryFn: async () => {
      const res = await http.get('/api/crm/projects', {
        params: {
          q: q || undefined,
          status: status || undefined,
          type: type || undefined,
          health: health || undefined,
          sort,
          dir,
          page,
          limit: pageSize,
        },
      })
      return res.data as { data: { items: Project[]; total: number; page: number; limit: number } }
    },
    placeholderData: keepPreviousData,
  })

  const accountsQ = useQuery({
    queryKey: ['accounts-pick'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', {
        params: { limit: 1000, sort: 'name', dir: 'asc' },
      })
      return res.data as { data: { items: AccountPick[] } }
    },
  })
  const dealsQ = useQuery({
    queryKey: ['deals-pick'],
    queryFn: async () => {
      const res = await http.get('/api/crm/deals', {
        params: { limit: 1000, sort: 'closeDate', dir: 'desc' },
      })
      return res.data as { data: { items: DealPick[]; total: number } }
    },
  })

  const accounts = accountsQ.data?.data.items ?? []
  const deals = dealsQ.data?.data.items ?? []
  const accountById = React.useMemo(() => new Map(accounts.map((a) => [a._id, a])), [accounts])
  const dealById = React.useMemo(() => new Map(deals.map((d) => [d._id, d])), [deals])

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<Project>) => {
      const res = await http.post('/api/crm/projects', payload)
      return res.data as { data: Project }
    },
    onSuccess: () => {
      toast.showToast('Project created', 'success')
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['account-projects'] })
      qc.invalidateQueries({ queryKey: ['accounts-projects-summary'] })
    },
    onError: () => {
      toast.showToast('Failed to create project', 'error')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; data: Partial<Project> }) => {
      const res = await http.put(`/api/crm/projects/${payload.id}`, payload.data)
      return res.data as { data: Project }
    },
    onSuccess: () => {
      toast.showToast('Project updated', 'success')
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['account-projects'] })
      qc.invalidateQueries({ queryKey: ['accounts-projects-summary'] })
    },
    onError: () => {
      toast.showToast('Failed to update project', 'error')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/crm/projects/${id}`)
      return res.data as { data: { ok: boolean } }
    },
    onSuccess: () => {
      toast.showToast('Project deleted', 'success')
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['account-projects'] })
      qc.invalidateQueries({ queryKey: ['accounts-projects-summary'] })
    },
    onError: () => {
      toast.showToast('Failed to delete project', 'error')
    },
  })

  function openEdit(p: Project | null) {
    if (!p) {
      setEditing({
        _id: '',
        name: '',
        description: '',
        status: 'not_started',
        type: 'implementation',
        health: 'on_track',
        progressPercent: 0,
      })
      setEditName('')
      setEditDescription('')
      setEditStatus('not_started')
      setEditType('implementation')
      setEditHealth('on_track')
      setEditProgress('0')
      setEditAccountId('')
      setEditDealId('')
      setEditStartDate('')
      setEditTargetEndDate('')
      setEditActualEndDate('')
    } else {
      setEditing(p)
      setEditName(p.name)
      setEditDescription(p.description ?? '')
      setEditStatus(p.status)
      setEditType(p.type ?? 'implementation')
      setEditHealth(p.health ?? 'on_track')
      setEditProgress(p.progressPercent != null ? String(p.progressPercent) : '0')
      setEditAccountId(p.accountId ?? '')
      setEditDealId(p.dealId ?? '')
      setEditStartDate(p.startDate ? p.startDate.slice(0, 10) : '')
      setEditTargetEndDate(p.targetEndDate ? p.targetEndDate.slice(0, 10) : '')
      setEditActualEndDate(p.actualEndDate ? p.actualEndDate.slice(0, 10) : '')
    }
  }

  function closeEdit() {
    setEditing(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const progressNum = Number(editProgress || '0')
    const payload: Partial<Project> = {
      name: editName.trim(),
      description: editDescription.trim() || undefined,
      status: editStatus,
      type: editType,
      health: editHealth,
      progressPercent: Number.isFinite(progressNum) ? progressNum : 0,
      accountId: editAccountId || undefined,
      dealId: editDealId || undefined,
      startDate: editStartDate || undefined,
      targetEndDate: editTargetEndDate || undefined,
      actualEndDate: editActualEndDate || undefined,
    }
    if (!payload.name) {
      toast.showToast('Name is required', 'error')
      return
    }
    if (!editing || !editing._id) {
      await createMutation.mutateAsync(payload)
    } else {
      await updateMutation.mutateAsync({ id: editing._id, data: payload })
    }
    // Ensure table reflects latest data from the server
    try {
      await projectsQ.refetch()
    } catch {
      // ignore refetch errors; query will refresh on next invalidate or navigation
    }
    closeEdit()
  }

  const total = projectsQ.data?.data.total ?? 0
  const items = projectsQ.data?.data.items ?? []
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <CRMNav />
      <div className="flex items-center justify-between gap-2 px-4">
        <div>
          <h1 className="text-lg font-semibold">Projects &amp; Delivery</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Track implementations, onboarding projects, and delivery work tied to accounts and deals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              window.location.href = '/apps/crm/projects/report'
            }}
            className="inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
          >
            Report
          </button>
          <button
            type="button"
            onClick={() => openEdit(null)}
            className="inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
          >
            New project
          </button>
          <a
            href="/apps/crm/support/kb?tag=crm:projects"
            className="inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
          >
            Help
          </a>
        </div>
      </div>

      <div className="space-y-2 px-4">
        <div className="flex flex-wrap gap-2">
          <input
            className="min-w-[200px] flex-1 rounded-xl border border-[color:var(--color-border)] px-2 py-1 text-sm"
            placeholder="Search projects…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(0)
            }}
          />
          <select
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)]"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(0)
            }}
          >
            <option value="">Status (all)</option>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)]"
            value={type}
            onChange={(e) => {
              setType(e.target.value)
              setPage(0)
            }}
          >
            <option value="">Type (all)</option>
            <option value="implementation">Implementation</option>
            <option value="onboarding">Onboarding</option>
            <option value="change_request">Change request</option>
            <option value="internal">Internal</option>
          </select>
          <select
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)]"
            value={health}
            onChange={(e) => {
              setHealth(e.target.value)
              setPage(0)
            }}
          >
            <option value="">Health (all)</option>
            <option value="on_track">On track</option>
            <option value="at_risk">At risk</option>
            <option value="off_track">Off track</option>
          </select>
          <select
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)]"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as any)
              setPage(0)
            }}
          >
            <option value="targetEndDate">Sort by target end</option>
            <option value="startDate">Sort by start</option>
            <option value="createdAt">Sort by created</option>
            <option value="status">Sort by status</option>
            <option value="health">Sort by health</option>
          </select>
          <select
            className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)]"
            value={dir}
            onChange={(e) => {
              setDir(e.target.value as any)
              setPage(0)
            }}
          >
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </div>
      </div>

      <div className="px-4">
        <div className="overflow-x-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-muted)] text-xs text-[color:var(--color-text-muted)]">
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-left">Deal</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Health</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Progress %</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Start date</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Target end</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Owner</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-xs text-[color:var(--color-text-muted)]">
                    No projects found. Try adjusting filters or create a new project.
                  </td>
                </tr>
              )}
              {items.map((p) => {
                const account = p.accountId ? accountById.get(p.accountId) : undefined
                const deal = p.dealId ? dealById.get(p.dealId) : undefined
                let healthChipClass =
                  'inline-flex rounded-full px-2 py-0.5 text-[11px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-muted)]'
                if (p.health === 'on_track') {
                  healthChipClass =
                    'inline-flex rounded-full px-2 py-0.5 text-[11px] border border-emerald-500/60 bg-emerald-500/10 text-emerald-100'
                } else if (p.health === 'at_risk') {
                  healthChipClass =
                    'inline-flex rounded-full px-2 py-0.5 text-[11px] border border-amber-500/70 bg-amber-500/15 text-amber-100'
                } else if (p.health === 'off_track') {
                  healthChipClass =
                    'inline-flex rounded-full px-2 py-0.5 text-[11px] border border-red-500/70 bg-red-500/15 text-red-100'
                }
                return (
                  <tr key={p._id} className="border-b border-[color:var(--color-border-soft)] hover:bg-[color:var(--color-muted)]">
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium">{p.name}</div>
                      {p.description && (
                        <div className="mt-0.5 line-clamp-2 text-xs text-[color:var(--color-text-muted)]">
                          {p.description}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      {p.type === 'implementation'
                        ? 'Implementation'
                        : p.type === 'onboarding'
                        ? 'Onboarding'
                        : p.type === 'change_request'
                        ? 'Change request'
                        : p.type === 'internal'
                        ? 'Internal'
                        : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      {account
                        ? `${account.accountNumber ? `#${account.accountNumber} – ` : ''}${account.name ?? ''}`
                        : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      {deal ? `${deal.dealNumber ? `#${deal.dealNumber} – ` : ''}${deal.title ?? ''}` : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-xs capitalize">{p.status.replace('_', ' ')}</td>
                    <td className="px-3 py-2 align-top text-xs">
                      {p.health && (
                        <span className={healthChipClass}>
                          {p.health === 'on_track'
                            ? 'On track'
                            : p.health === 'at_risk'
                            ? 'At risk'
                            : p.health === 'off_track'
                            ? 'Off track'
                            : p.health}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      {p.progressPercent != null ? `${p.progressPercent.toFixed?.(0) ?? p.progressPercent}%` : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-xs whitespace-nowrap">
                      {p.startDate ? formatDate(p.startDate) : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-xs whitespace-nowrap">
                      {p.targetEndDate ? formatDate(p.targetEndDate) : ''}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      {p.ownerName || p.ownerEmail || ''}
                    </td>
                    <td className="px-3 py-2 align-top text-right text-xs">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-2 py-1 text-[11px] text-white hover:bg-[color:var(--color-primary-700)]"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm('Delete this project?')) return
                            await deleteMutation.mutateAsync(p._id)
                          }}
                          className="rounded-lg border border-red-500/60 px-2 py-1 text-[11px] text-red-200 hover:bg-red-500/15"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="mt-2 flex items-center justify-between text-xs text-[color:var(--color-text-muted)]">
            <div>
              Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total} projects
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 disabled:opacity-50"
              >
                Prev
              </button>
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 disabled:opacity-50"
              >
                Next
              </button>
              <select
                className="rounded-lg border border-[color:var(--color-border)] px-2 py-1"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(0)
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[2147483647]">
          <div className="absolute inset-0 bg-black/60" onClick={closeEdit} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,48rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">
                  {editing._id ? 'Edit project' : 'New project'}
                </h2>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-full border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                >
                  Close
                </button>
              </div>
              <form onSubmit={handleSave} className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Name</label>
                    <input
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-muted)]"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Type</label>
                  <select
                    className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)]"
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as any)}
                    >
                      <option value="implementation">Implementation</option>
                      <option value="onboarding">Onboarding</option>
                      <option value="change_request">Change request</option>
                      <option value="internal">Internal</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Status</label>
                  <select
                    className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)]"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as any)}
                    >
                      <option value="not_started">Not started</option>
                      <option value="in_progress">In progress</option>
                      <option value="on_hold">On hold</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Health</label>
                  <select
                    className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)]"
                      value={editHealth}
                      onChange={(e) => setEditHealth(e.target.value as any)}
                    >
                      <option value="on_track">On track</option>
                      <option value="at_risk">At risk</option>
                      <option value="off_track">Off track</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Account</label>
                    <select
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)]"
                      value={editAccountId}
                      onChange={(e) => setEditAccountId(e.target.value)}
                    >
                      <option value="">(none)</option>
                      {accounts.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.accountNumber ? `#${a.accountNumber} – ` : ''}
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Deal</label>
                    <select
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)]"
                      value={editDealId}
                      onChange={(e) => setEditDealId(e.target.value)}
                    >
                      <option value="">(none)</option>
                      {deals.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.dealNumber ? `#${d.dealNumber} – ` : ''}
                          {d.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Start date</label>
                    <input
                      type="date"
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-muted)]"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Target end date</label>
                    <input
                      type="date"
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-muted)]"
                      value={editTargetEndDate}
                      onChange={(e) => setEditTargetEndDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Actual end date</label>
                    <input
                      type="date"
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-muted)]"
                      value={editActualEndDate}
                      onChange={(e) => setEditActualEndDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium">Progress %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-muted)]"
                      value={editProgress}
                      onChange={(e) => setEditProgress(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Description</label>
                  <textarea
                    className="min-h-[80px] w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-muted)]"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-[color:var(--color-text-muted)]">
                    Projects can be linked to Accounts, Deals, Tasks, and Documents elsewhere in the CRM.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={closeEdit}
                      className="rounded-xl border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-xl bg-[color:var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-soft)]"
                    >
                      Save project
                    </button>
                  </div>
                </div>
              </form>
              {editing?._id && (
                <div className="mt-4 border-t border-[color:var(--color-border)] pt-3">
                  <RelatedTasks relatedType="project" relatedId={editing._id} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


