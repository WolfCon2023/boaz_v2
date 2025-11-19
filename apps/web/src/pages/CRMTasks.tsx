import * as React from 'react'
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'

type TaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'
type TaskType = 'call' | 'meeting' | 'todo'
type TaskPriority = 'low' | 'normal' | 'high'
type TaskRelatedType = 'contact' | 'account' | 'deal' | 'invoice' | 'quote'

type Task = {
  _id: string
  type: TaskType
  subject: string
  description?: string
  status: TaskStatus
  priority?: TaskPriority
  dueAt?: string | null
  completedAt?: string | null
  ownerUserId?: string
  ownerName?: string
  ownerEmail?: string
  relatedType?: TaskRelatedType
  relatedId?: string
}

type TasksResponse = {
  data: {
    items: Task[]
    total: number
    page: number
    limit: number
  }
}

export default function CRMTasks() {
  const qc = useQueryClient()
  const toast = useToast()

  const [status, setStatus] = React.useState<'all' | TaskStatus>('open')
  const [type, setType] = React.useState<'all' | TaskType>('all')
  const [priorityFilter, setPriorityFilter] = React.useState<'all' | TaskPriority>('all')
  const [mine, setMine] = React.useState<'mine' | 'all'>('mine')
  const [q, setQ] = React.useState('')
  const [sort, setSort] = React.useState<'dueAt' | 'createdAt' | 'priority' | 'status'>('dueAt')
  const [dir, setDir] = React.useState<'asc' | 'desc'>('asc')
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(20)

  const [newType, setNewType] = React.useState<TaskType>('todo')
  const [newPriority, setNewPriority] = React.useState<TaskPriority>('normal')
  const [newSubject, setNewSubject] = React.useState('')
  const [newDescription, setNewDescription] = React.useState('')
  const [newDueAt, setNewDueAt] = React.useState('')
  const [newRelatedType, setNewRelatedType] = React.useState<'' | TaskRelatedType>('')
  const [newRelatedId, setNewRelatedId] = React.useState('')

  const [editingTask, setEditingTask] = React.useState<Task | null>(null)
  const [editType, setEditType] = React.useState<TaskType>('todo')
  const [editStatus, setEditStatus] = React.useState<TaskStatus>('open')
  const [editPriority, setEditPriority] = React.useState<TaskPriority>('normal')
  const [editSubject, setEditSubject] = React.useState('')
  const [editDescription, setEditDescription] = React.useState('')
  const [editDueAt, setEditDueAt] = React.useState('')
  const [editRelatedType, setEditRelatedType] = React.useState<'' | TaskRelatedType>('')
  const [editRelatedId, setEditRelatedId] = React.useState('')

  const { data, isFetching } = useQuery<TasksResponse>({
    queryKey: ['tasks', status, type, priorityFilter, mine, q, sort, dir, page, pageSize],
    queryFn: async () => {
      const params: any = {
        page,
        limit: pageSize,
      }
      if (status !== 'all') params.status = status
      if (type !== 'all') params.type = type
      if (mine === 'mine') params.mine = '1'
      if (priorityFilter !== 'all') params.priority = priorityFilter
      if (q.trim()) params.q = q.trim()
      params.sort = sort
      params.dir = dir
      const res = await http.get('/api/crm/tasks', { params })
      return res.data as TasksResponse
    },
    placeholderData: keepPreviousData,
  })

  const tasks = data?.data.items ?? []
  const total = data?.data.total ?? 0
  const totalPages = total ? Math.ceil(total / pageSize) : 0

  const createTask = useMutation({
    mutationFn: async () => {
      const payload: any = {
        type: newType,
        subject: newSubject.trim(),
        description: newDescription.trim() || undefined,
        status: 'open' as TaskStatus,
        priority: newPriority,
      }
      if (newDueAt) {
        // newDueAt is in local datetime input format; convert to ISO
        const d = new Date(newDueAt)
        if (!Number.isNaN(d.getTime())) {
          payload.dueAt = d.toISOString()
        }
      }
      if (newRelatedType && newRelatedId.trim()) {
        payload.relatedType = newRelatedType
        payload.relatedId = newRelatedId.trim()
      }
      const res = await http.post('/api/crm/tasks', payload)
      return res.data as { data: Task }
    },
    onSuccess: () => {
      setNewSubject('')
      setNewDescription('')
      setNewDueAt('')
      setNewPriority('normal')
      setNewRelatedType('')
      setNewRelatedId('')
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.showToast('Task created.', 'success')
    },
    onError: () => {
      toast.showToast('Failed to create task.', 'error')
    },
  })

  const updateTask = useMutation({
    mutationFn: async (payload: { id: string; body: any }) => {
      const { id, body } = payload
      const res = await http.put(`/api/crm/tasks/${id}`, body)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setEditingTask(null)
      toast.showToast('Task updated.', 'success')
    },
    onError: () => {
      toast.showToast('Failed to update task.', 'error')
    },
  })

  function startEdit(task: Task) {
    setEditingTask(task)
    setEditType(task.type)
    setEditStatus(task.status)
    setEditPriority(task.priority ?? 'normal')
    setEditSubject(task.subject ?? '')
    setEditDescription(task.description ?? '')
    setEditDueAt(task.dueAt ? task.dueAt.slice(0, 16) : '')
    setEditRelatedType((task.relatedType ?? '') as any)
    setEditRelatedId(task.relatedId ?? '')
  }

  function cancelEdit() {
    setEditingTask(null)
  }

  function saveEdit() {
    if (!editingTask) return
    if (!editSubject.trim()) {
      toast.showToast('Short description is required.', 'error')
      return
    }
    const body: any = {
      type: editType,
      subject: editSubject.trim(),
      description: editDescription.trim() || undefined,
      status: editStatus,
      priority: editPriority,
    }
    if (editDueAt) {
      const d = new Date(editDueAt)
      if (!Number.isNaN(d.getTime())) {
        body.dueAt = d.toISOString()
      }
    } else {
      body.dueAt = null
    }
    if (editRelatedType && editRelatedId.trim()) {
      body.relatedType = editRelatedType
      body.relatedId = editRelatedId.trim()
    } else {
      body.relatedType = null
      body.relatedId = null
    }
    updateTask.mutate({ id: editingTask._id, body })
  }
  const completeTask = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.post(`/api/crm/tasks/${id}/complete`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.showToast('Task marked as completed.', 'success')
    },
  })

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/crm/tasks/${id}`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.showToast('Task deleted.', 'success')
    },
  })

  return (
    <div className="space-y-6">
      <CRMNav />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tasks &amp; Activities</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Track calls, meetings, and to‑dos tied to your CRM records.
          </p>
        </div>
      </header>

      {/* Filters */}
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Owner</label>
            <div className="inline-flex rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-0.5 text-xs">
              <button
                type="button"
                className={`px-3 py-1 rounded-md ${mine === 'mine' ? 'bg-[color:var(--color-muted)]' : ''}`}
                onClick={() => {
                  setMine('mine')
                  setPage(0)
                }}
              >
                My tasks
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded-md ${mine === 'all' ? 'bg-[color:var(--color-muted)]' : ''}`}
                onClick={() => {
                  setMine('all')
                  setPage(0)
                }}
              >
                All
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Status</label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as any)
                setPage(0)
              }}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="all">All statuses</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Type</label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as any)
                setPage(0)
              }}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
            >
              <option value="all">All types</option>
              <option value="call">Call</option>
              <option value="meeting">Meeting</option>
              <option value="todo">To‑do</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Priority</label>
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value as any)
                setPage(0)
              }}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
            >
              <option value="all">All priorities</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Page size</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) || 20)
                setPage(0)
              }}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-border)] pt-3">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(0)
            }}
            placeholder="Search tasks (short description or description)…"
            className="min-w-[180px] flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
          />
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as any)
              setPage(0)
            }}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-xs text-[color:var(--color-text)]"
          >
            <option value="dueAt">Sort by due date</option>
            <option value="createdAt">Sort by created date</option>
            <option value="priority">Sort by priority</option>
            <option value="status">Sort by status</option>
          </select>
          <select
            value={dir}
            onChange={(e) => {
              setDir(e.target.value as any)
              setPage(0)
            }}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-xs text-[color:var(--color-text)]"
          >
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setStatus('open')
              setType('all')
              setPriorityFilter('all')
              setMine('mine')
              setQ('')
              setSort('dueAt')
              setDir('asc')
              setPage(0)
            }}
            className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
          >
            Reset filters
          </button>
        </div>
      </section>

      {/* New task */}
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 space-y-3">
        <h2 className="text-sm font-semibold">New task</h2>
        <div className="grid gap-3 md:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Type</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as TaskType)}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm text-[color:var(--color-text)]"
            >
              <option value="todo">To‑do</option>
              <option value="call">Call</option>
              <option value="meeting">Meeting</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Short description</label>
            <input
              type="text"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
              placeholder="Follow-up call, onboarding meeting, etc."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Priority</label>
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm text-[color:var(--color-text)]"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Due date/time</label>
            <input
              type="datetime-local"
              value={newDueAt}
              onChange={(e) => setNewDueAt(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Related to</label>
            <div className="flex gap-2">
              <select
                value={newRelatedType}
                onChange={(e) => setNewRelatedType(e.target.value as any)}
                className="w-28 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-xs text-[color:var(--color-text)]"
              >
                <option value="">None</option>
                <option value="contact">Contact</option>
                <option value="account">Account</option>
                <option value="deal">Deal</option>
                <option value="quote">Quote</option>
                <option value="invoice">Invoice</option>
              </select>
              <input
                type="text"
                value={newRelatedId}
                onChange={(e) => setNewRelatedId(e.target.value)}
                className="w-28 md:w-40 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                placeholder="Record ID"
              />
            </div>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Description</label>
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
            placeholder="Call agenda, meeting notes, next steps…"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              if (!newSubject.trim()) {
                toast.showToast('Subject is required.', 'error')
                return
              }
              createTask.mutate()
            }}
            disabled={createTask.isPending}
            className="inline-flex items-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-700)] px-4 py-2 text-xs font-medium text-white hover:bg-[color:var(--color-primary-600)] disabled:opacity-50"
          >
            Add task
          </button>
        </div>
      </section>

      {/* Task list */}
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3 text-xs text-[color:var(--color-text-muted)]">
          <div>{isFetching ? 'Loading tasks…' : `${total} task${total === 1 ? '' : 's'}`}</div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded border border-[color:var(--color-border)] px-2 py-1 disabled:opacity-50"
              >
                Prev
              </button>
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => (page + 1 >= totalPages ? p : p + 1))}
                className="rounded border border-[color:var(--color-border)] px-2 py-1 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>

        <div className="divide-y divide-[color:var(--color-border)]">
          {tasks.map((t: Task) => {
            const isOverdue =
              t.dueAt && t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.dueAt) < new Date()
            return (
              <>
                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" key={t._id}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-[color:var(--color-muted)] px-2 py-0.5 text-[10px] uppercase tracking-wide">
                        {t.type}
                      </span>
                      <span className="text-sm font-medium">{t.subject}</span>
                    </div>
                    {t.description ? (
                      <div className="text-xs text-[color:var(--color-text-muted)] whitespace-normal">
                        <span className="font-semibold">Description:</span> {t.description}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-3 text-[11px] text-[color:var(--color-text-muted)]">
                      {t.dueAt && (
                        <span className={isOverdue ? 'text-[color:var(--color-danger)] font-semibold' : ''}>
                          Due {formatDateTime(t.dueAt)}
                        </span>
                      )}
                      {t.status && <span>Status: {t.status.replace('_', ' ')}</span>}
                      <span>Priority: {t.priority ?? 'normal'}</span>
                      {t.completedAt && <span>Completed {formatDate(t.completedAt)}</span>}
                      {t.relatedType && t.relatedId && (
                        <span>
                          Related {t.relatedType}: <span className="font-mono text-[10px]">{t.relatedId}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {t.status !== 'completed' && t.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => completeTask.mutate(t._id)}
                        disabled={completeTask.isPending}
                        className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                      >
                        Mark done
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(t)}
                      className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-1.5 text-xs text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTask.mutate(t._id)}
                      disabled={deleteTask.isPending}
                      className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-1.5 text-xs text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {editingTask && editingTask._id === t._id && (
                <div className="mt-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 text-xs space-y-3">
                  <div className="grid gap-3 md:grid-cols-5">
                    <div>
                      <label className="mb-1 block font-medium text-[color:var(--color-text-muted)]">Type</label>
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value as TaskType)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs text-[color:var(--color-text)]"
                      >
                        <option value="todo">To‑do</option>
                        <option value="call">Call</option>
                        <option value="meeting">Meeting</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block font-medium text-[color:var(--color-text-muted)]">Short description</label>
                      <input
                        type="text"
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-medium text-[color:var(--color-text-muted)]">Status</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs text-[color:var(--color-text)]"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block font-medium text-[color:var(--color-text-muted)]">Priority</label>
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs text-[color:var(--color-text)]"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block font-medium text-[color:var(--color-text-muted)]">Due date/time</label>
                      <input
                        type="datetime-local"
                        value={editDueAt}
                        onChange={(e) => setEditDueAt(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block font-medium text-[color:var(--color-text-muted)]">Description</label>
                      <textarea
                        rows={2}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-[color:var(--color-text-muted)]">Related to</label>
                    <div className="flex gap-2">
                      <select
                        value={editRelatedType}
                        onChange={(e) => setEditRelatedType(e.target.value as any)}
                        className="w-28 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs text-[color:var(--color-text)]"
                      >
                        <option value="">None</option>
                        <option value="contact">Contact</option>
                        <option value="account">Account</option>
                        <option value="deal">Deal</option>
                        <option value="quote">Quote</option>
                        <option value="invoice">Invoice</option>
                      </select>
                      <input
                        type="text"
                        value={editRelatedId}
                        onChange={(e) => setEditRelatedId(e.target.value)}
                        className="w-28 md:w-40 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-xs"
                        placeholder="Record ID"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-1.5 text-xs text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={updateTask.isPending}
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-700)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-600)] disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
                )}
              </>
            )
          })}

          {!tasks.length && !isFetching && (
            <div className="px-4 py-8 text-center text-xs text-[color:var(--color-text-muted)]">
              No tasks found. Create a task above to get started.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}


