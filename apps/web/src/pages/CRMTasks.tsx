import * as React from 'react'
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CRMNav } from '@/components/CRMNav'
import { http } from '@/lib/http'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'

type TaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'
type TaskType = 'call' | 'meeting' | 'todo' | 'email' | 'note'
type TaskPriority = 'low' | 'normal' | 'high'
type TaskRelatedType = 'contact' | 'account' | 'deal' | 'invoice' | 'quote' | 'project'

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
  createdAt?: string
  updatedAt?: string
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
  const [searchParams] = useSearchParams()

  const [viewMode, setViewMode] = React.useState<'list' | 'board'>('list')
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
  const [newStatus, setNewStatus] = React.useState<TaskStatus>('open')
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
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  const { data, isFetching } = useQuery<TasksResponse>({
    queryKey: ['tasks', status, type, priorityFilter, mine, q, sort, dir, page, pageSize, viewMode],
    queryFn: async () => {
      const params: any = {
        page,
        limit: pageSize,
      }
      // For Kanban board we want to see all statuses; for list view we respect the status filter
      if (viewMode === 'list' && status !== 'all') params.status = status
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

  // Fetch related entities for name lookups
  const { data: contactsData } = useQuery({
    queryKey: ['contacts-all-tasks'],
    queryFn: async () => {
      const res = await http.get('/api/crm/contacts', { params: { limit: 1000 } })
      return res.data as { data: { items: Array<{ _id: string; name?: string; email?: string }> } }
    },
  })

  const { data: accountsData } = useQuery({
    queryKey: ['accounts-all-tasks'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', { params: { limit: 1000 } })
      return res.data as { data: { items: Array<{ _id: string; name?: string; accountNumber?: number }> } }
    },
  })

  const { data: dealsData } = useQuery({
    queryKey: ['deals-all-tasks'],
    queryFn: async () => {
      const res = await http.get('/api/crm/deals', { params: { limit: 1000 } })
      return res.data as { data: { items: Array<{ _id: string; title?: string; dealNumber?: number }> } }
    },
  })

  const { data: invoicesData } = useQuery({
    queryKey: ['invoices-all-tasks'],
    queryFn: async () => {
      const res = await http.get('/api/crm/invoices', { params: { limit: 1000 } })
      return res.data as { data: { items: Array<{ _id: string; invoiceNumber?: string }> } }
    },
  })

  const { data: quotesData } = useQuery({
    queryKey: ['quotes-all-tasks'],
    queryFn: async () => {
      const res = await http.get('/api/crm/quotes', { params: { limit: 1000 } })
      return res.data as { data: { items: Array<{ _id: string; quoteNumber?: string }> } }
    },
  })

  const { data: projectsData } = useQuery({
    queryKey: ['projects-all-tasks'],
    queryFn: async () => {
      const res = await http.get('/api/crm/projects', { params: { limit: 1000 } })
      return res.data as { data: { items: Array<{ _id: string; name?: string }> } }
    },
  })

  // Create lookup maps for related entities
  const contactById = React.useMemo(() => {
    const map = new Map<string, { name?: string; email?: string }>()
    contactsData?.data.items.forEach((c) => map.set(c._id, c))
    return map
  }, [contactsData])

  const accountById = React.useMemo(() => {
    const map = new Map<string, { name?: string; accountNumber?: number }>()
    accountsData?.data.items.forEach((a) => map.set(a._id, a))
    return map
  }, [accountsData])

  const dealById = React.useMemo(() => {
    const map = new Map<string, { title?: string; dealNumber?: number }>()
    dealsData?.data.items.forEach((d) => map.set(d._id, d))
    return map
  }, [dealsData])

  const invoiceById = React.useMemo(() => {
    const map = new Map<string, { invoiceNumber?: string }>()
    invoicesData?.data.items.forEach((i) => map.set(i._id, i))
    return map
  }, [invoicesData])

  const quoteById = React.useMemo(() => {
    const map = new Map<string, { quoteNumber?: string }>()
    quotesData?.data.items.forEach((q) => map.set(q._id, q))
    return map
  }, [quotesData])

  const projectById = React.useMemo(() => {
    const map = new Map<string, { name?: string }>()
    projectsData?.data.items.forEach((p) => map.set(p._id, p))
    return map
  }, [projectsData])

  // Helper function to get related entity name
  const getRelatedEntityName = (task: Task): string => {
    if (!task.relatedType || !task.relatedId) return ''
    
    switch (task.relatedType) {
      case 'contact':
        const contact = contactById.get(task.relatedId)
        return contact?.name || contact?.email || task.relatedId
      case 'account':
        const account = accountById.get(task.relatedId)
        return account ? `${account.accountNumber ? `#${account.accountNumber} – ` : ''}${account.name || ''}` : task.relatedId
      case 'deal':
        const deal = dealById.get(task.relatedId)
        return deal ? `${deal.dealNumber ? `#${deal.dealNumber} – ` : ''}${deal.title || ''}` : task.relatedId
      case 'invoice':
        const invoice = invoiceById.get(task.relatedId)
        return invoice?.invoiceNumber || task.relatedId
      case 'quote':
        const quote = quoteById.get(task.relatedId)
        return quote?.quoteNumber || task.relatedId
      case 'project':
        const project = projectById.get(task.relatedId)
        return project?.name || task.relatedId
      default:
        return task.relatedId
    }
  }

  // If navigated with ?task=<id> (from Contacts/Accounts/Deals related tasks), auto-open that task
  React.useEffect(() => {
    const taskId = searchParams.get('task')
    if (!taskId) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await http.get(`/api/crm/tasks/${encodeURIComponent(taskId)}`)
        const task = res.data?.data as Task | null
        if (!cancelled && task && task._id) {
          startEdit(task)
        }
      } catch {
        if (!cancelled) {
          toast.showToast('Unable to open task from link.', 'error')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchParams])

  const tasks = data?.data.items ?? []
  const total = data?.data.total ?? 0
  const totalPages = total ? Math.ceil(total / pageSize) : 0
  const anySelected = selectedIds.size > 0

  const createTask = useMutation({
    mutationFn: async () => {
      const payload: any = {
        type: newType,
        subject: newSubject.trim(),
        description: newDescription.trim() || undefined,
        status: newStatus,
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
      setNewStatus('open')
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

    // Pre-fill due date/time so the existing value shows up in the datetime-local control
    if (task.dueAt) {
      let value = ''
      // If it's an ISO-like value, slice to the yyyy-MM-ddTHH:mm format expected by datetime-local
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(task.dueAt)) {
        value = task.dueAt.slice(0, 16)
      } else {
        const d = new Date(task.dueAt)
        if (!Number.isNaN(d.getTime())) {
          const pad = (n: number) => String(n).padStart(2, '0')
          const year = d.getFullYear()
          const month = pad(d.getMonth() + 1)
          const day = pad(d.getDate())
          const hours = pad(d.getHours())
          const minutes = pad(d.getMinutes())
          value = `${year}-${month}-${day}T${hours}:${minutes}`
        }
      }
      setEditDueAt(value)
    } else {
      setEditDueAt('')
    }

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
      setEditingTask(null)
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

  async function bulkComplete() {
    if (!anySelected) return
    const ids = Array.from(selectedIds)
    await Promise.allSettled(ids.map((id) => http.post(`/api/crm/tasks/${id}/complete`)))
    setSelectedIds(new Set())
    qc.invalidateQueries({ queryKey: ['tasks'] })
    toast.showToast('Selected tasks marked as completed.', 'success')
  }

  async function bulkDelete() {
    if (!anySelected) return
    if (!window.confirm(`Delete ${selectedIds.size} task(s)? This cannot be undone.`)) return
    const ids = Array.from(selectedIds)
    await Promise.allSettled(ids.map((id) => http.delete(`/api/crm/tasks/${id}`)))
    setSelectedIds(new Set())
    qc.invalidateQueries({ queryKey: ['tasks'] })
    toast.showToast('Selected tasks deleted.', 'success')
  }

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
        <div className="flex items-center gap-2 px-0.5">
          <a
            href="/apps/crm/support/kb?tag=crm:tasks"
            className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-[11px] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]"
          >
            <span className="text-xs">Help</span>
            <span className="text-[10px]">?</span>
          </a>
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
              <option value="email">Email</option>
              <option value="note">Note</option>
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
        <div className="grid gap-3 md:grid-cols-7">
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
              <option value="email">Email</option>
              <option value="note">Note</option>
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
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Status</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm text-[color:var(--color-text)]"
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
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
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Related to</label>
            <div className="flex gap-2">
              <select
                value={newRelatedType}
                onChange={(e) => {
                  setNewRelatedType(e.target.value as any)
                  setNewRelatedId('') // Clear the ID when type changes
                }}
                className="w-28 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-xs text-[color:var(--color-text)]"
              >
                <option value="">None</option>
                <option value="contact">Contact</option>
                <option value="account">Account</option>
                <option value="deal">Deal</option>
                <option value="quote">Quote</option>
                <option value="invoice">Invoice</option>
                <option value="project">Project</option>
              </select>
              {newRelatedType === 'contact' && (
                <select
                  value={newRelatedId}
                  onChange={(e) => setNewRelatedId(e.target.value)}
                  className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-sm text-[color:var(--color-text)]"
                >
                  <option value="">Select contact...</option>
                  {(contactsData?.data.items ?? []).map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name || c.email || c._id}
                    </option>
                  ))}
                </select>
              )}
              {newRelatedType === 'account' && (
                <select
                  value={newRelatedId}
                  onChange={(e) => setNewRelatedId(e.target.value)}
                  className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-sm text-[color:var(--color-text)]"
                >
                  <option value="">Select account...</option>
                  {(accountsData?.data.items ?? []).map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.accountNumber ? `#${a.accountNumber} – ` : ''}{a.name || a._id}
                    </option>
                  ))}
                </select>
              )}
              {newRelatedType === 'deal' && (
                <select
                  value={newRelatedId}
                  onChange={(e) => setNewRelatedId(e.target.value)}
                  className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-sm text-[color:var(--color-text)]"
                >
                  <option value="">Select deal...</option>
                  {(dealsData?.data.items ?? []).map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.dealNumber ? `#${d.dealNumber} – ` : ''}{d.title || d._id}
                    </option>
                  ))}
                </select>
              )}
              {newRelatedType === 'invoice' && (
                <select
                  value={newRelatedId}
                  onChange={(e) => setNewRelatedId(e.target.value)}
                  className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-sm text-[color:var(--color-text)]"
                >
                  <option value="">Select invoice...</option>
                  {(invoicesData?.data.items ?? []).map((i) => (
                    <option key={i._id} value={i._id}>
                      {i.invoiceNumber || i._id}
                    </option>
                  ))}
                </select>
              )}
              {newRelatedType === 'quote' && (
                <select
                  value={newRelatedId}
                  onChange={(e) => setNewRelatedId(e.target.value)}
                  className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-sm text-[color:var(--color-text)]"
                >
                  <option value="">Select quote...</option>
                  {(quotesData?.data.items ?? []).map((q) => (
                    <option key={q._id} value={q._id}>
                      {q.quoteNumber || q._id}
                    </option>
                  ))}
                </select>
              )}
              {newRelatedType === 'project' && (
                <select
                  value={newRelatedId}
                  onChange={(e) => setNewRelatedId(e.target.value)}
                  className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-sm text-[color:var(--color-text)]"
                >
                  <option value="">Select project...</option>
                  {(projectsData?.data.items ?? []).map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name || p._id}
                    </option>
                  ))}
                </select>
              )}
            </div>
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
                toast.showToast('Short description is required.', 'error')
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

      {/* Task list / board */}
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--color-border)] px-4 py-3 text-xs text-[color:var(--color-text-muted)]">
          <div>{isFetching ? 'Loading tasks…' : `${total} task${total === 1 ? '' : 's'}`}</div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-0.5 text-[10px]">
              <button
                type="button"
                className={`px-2 py-1 rounded-md ${viewMode === 'list' ? 'bg-[color:var(--color-muted)] font-semibold' : ''}`}
                onClick={() => setViewMode('list')}
              >
                List
              </button>
              <button
                type="button"
                className={`px-2 py-1 rounded-md ${viewMode === 'board' ? 'bg-[color:var(--color-muted)] font-semibold' : ''}`}
                onClick={() => setViewMode('board')}
              >
                Board
              </button>
            </div>
            {anySelected && (
              <div className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] px-2 py-1">
                <span>{selectedIds.size} selected</span>
                <button
                  type="button"
                  onClick={bulkComplete}
                  className="rounded border border-[color:var(--color-border)] px-2 py-1 text-[10px] hover:bg-[color:var(--color-muted)]"
                >
                  Mark done
                </button>
                <button
                  type="button"
                  onClick={bulkDelete}
                  className="rounded border border-red-400 px-2 py-1 text-[10px] text-red-500 hover:bg-red-950/40"
                >
                  Delete
                </button>
              </div>
            )}
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
        </div>

        {viewMode === 'list' ? (
          <div className="divide-y divide-[color:var(--color-border)]">
            {tasks.map((t: Task) => {
              const isOverdue =
                t.dueAt && t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.dueAt) < new Date()
              return (
                <div
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between cursor-pointer"
                  key={t._id}
                  onDoubleClick={() => startEdit(t)}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-3 w-3"
                      checked={selectedIds.has(t._id)}
                      onChange={(e) => {
                        const next = new Set(selectedIds)
                        if (e.target.checked) next.add(t._id)
                        else next.delete(t._id)
                        setSelectedIds(next)
                      }}
                    />
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
                        {t.createdAt && <span>Created {formatDateTime(t.createdAt)}</span>}
                        {t.status && <span>Status: {t.status.replace('_', ' ')}</span>}
                        <span>Priority: {t.priority ?? 'normal'}</span>
                        {t.ownerName || t.ownerEmail ? (
                          <span>
                            Owner{' '}
                            <span className="font-semibold">
                              {t.ownerName || t.ownerEmail}
                            </span>
                          </span>
                        ) : null}
                        {t.completedAt && <span>Completed {formatDate(t.completedAt)}</span>}
                        {t.relatedType && t.relatedId && (
                          <span>
                            Related {t.relatedType}: <span className="text-[10px]">{getRelatedEntityName(t)}</span>
                          </span>
                        )}
                      </div>
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
              )
            })}

            {!tasks.length && !isFetching && (
              <div className="px-4 py-8 text-center text-xs text-[color:var(--color-text-muted)]">
                No tasks found. Create a task above to get started.
              </div>
            )}
          </div>
        ) : (
          <div className="px-3 pb-4 pt-2 text-[11px]">
            <div className="mb-2 text-[color:var(--color-text-muted)]">
              Drag cards between columns to change status. Overdue tasks are highlighted in red.
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {(['open', 'in_progress', 'completed', 'cancelled'] as TaskStatus[]).map((columnStatus) => (
                <div
                  key={columnStatus}
                  className="flex min-h-[120px] flex-col rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData('text/plain')
                    if (!id) return
                    updateTask.mutate({ id, body: { status: columnStatus } })
                  }}
                >
                  <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide">
                    <span>
                      {columnStatus === 'open'
                        ? 'Open'
                        : columnStatus === 'in_progress'
                        ? 'In progress'
                        : columnStatus === 'completed'
                        ? 'Completed'
                        : 'Cancelled'}
                    </span>
                    <span className="text-[color:var(--color-text-muted)]">
                      {tasks.filter((t) => t.status === columnStatus).length}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-2">
                    {tasks
                      .filter((t) => t.status === columnStatus)
                      .map((t) => {
                        const isOverdue =
                          t.dueAt &&
                          t.status !== 'completed' &&
                          t.status !== 'cancelled' &&
                          new Date(t.dueAt) < new Date()
                        return (
                          <button
                            key={t._id}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', t._id)
                            }}
                            onDoubleClick={() => startEdit(t)}
                            className="flex flex-col gap-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-2 text-left text-[11px] hover:border-[color:var(--color-primary-500)] hover:bg-[color:var(--color-muted)]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center rounded-full bg-[color:var(--color-muted)] px-2 py-0.5 text-[9px] uppercase tracking-wide">
                                {t.type}
                              </span>
                              <span className="text-[10px] text-[color:var(--color-text-muted)]">
                                {t.priority === 'high'
                                  ? 'High priority'
                                  : t.priority === 'low'
                                  ? 'Low priority'
                                  : 'Normal priority'}
                              </span>
                            </div>
                            <div className="text-xs font-medium">{t.subject}</div>
                            {t.description && (
                              <div className="line-clamp-2 text-[11px] text-[color:var(--color-text-muted)]">
                                {t.description}
                              </div>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[color:var(--color-text-muted)]">
                              {t.dueAt && (
                                <span className={isOverdue ? 'text-[color:var(--color-danger)] font-semibold' : ''}>
                                  Due {formatDateTime(t.dueAt)}
                                </span>
                              )}
                              {t.relatedType && t.relatedId && (
                                <span>
                                  {t.relatedType}:{' '}
                                  <span className="text-[9px]">{getRelatedEntityName(t)}</span>
                                </span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    {tasks.filter((t) => t.status === columnStatus).length === 0 && (
                      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[color:var(--color-border)] bg-transparent px-2 py-4 text-center text-[10px] text-[color:var(--color-text-muted)]">
                        No tasks in this column.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {editingTask && (
        <div className="fixed inset-0 z-[2147483647]">
          <div className="absolute inset-0 bg-black/60" onClick={cancelEdit} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(90vw,32rem)] max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-2xl">
              <div className="mb-3 text-base font-semibold">Edit task</div>
              <div className="mb-4 text-[11px] text-[color:var(--color-text-muted)] space-y-1">
                <div><span className="font-semibold">ID:</span> <span className="font-mono text-[10px]">{editingTask._id}</span></div>
                {editingTask.createdAt && <div><span className="font-semibold">Created:</span> {formatDateTime(editingTask.createdAt)}</div>}
                {editingTask.updatedAt && <div><span className="font-semibold">Last updated:</span> {formatDateTime(editingTask.updatedAt)}</div>}
              </div>
              <div className="grid gap-3 md:grid-cols-2 mb-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Type</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as TaskType)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm text-[color:var(--color-text)]"
                  >
                    <option value="todo">To‑do</option>
                    <option value="call">Call</option>
                    <option value="meeting">Meeting</option>
                    <option value="email">Email</option>
                    <option value="note">Note</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm text-[color:var(--color-text)]"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Priority</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
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
                    value={editDueAt}
                    onChange={(e) => setEditDueAt(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Short description</label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                />
              </div>
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Description</label>
                <textarea
                  rows={4}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                />
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Related to</label>
                <div className="flex gap-2">
                  <select
                    value={editRelatedType}
                    onChange={(e) => {
                      setEditRelatedType(e.target.value as any)
                      setEditRelatedId('') // Clear the ID when type changes
                    }}
                    className="w-28 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-xs text-[color:var(--color-text)]"
                  >
                    <option value="">None</option>
                    <option value="contact">Contact</option>
                    <option value="account">Account</option>
                    <option value="deal">Deal</option>
                    <option value="quote">Quote</option>
                    <option value="invoice">Invoice</option>
                    <option value="project">Project</option>
                  </select>
                  {editRelatedType === 'contact' && (
                    <select
                      value={editRelatedId}
                      onChange={(e) => setEditRelatedId(e.target.value)}
                      className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-sm text-[color:var(--color-text)]"
                    >
                      <option value="">Select contact...</option>
                      {(contactsData?.data.items ?? []).map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name || c.email || c._id}
                        </option>
                      ))}
                    </select>
                  )}
                  {editRelatedType === 'account' && (
                    <select
                      value={editRelatedId}
                      onChange={(e) => setEditRelatedId(e.target.value)}
                      className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-sm text-[color:var(--color-text)]"
                    >
                      <option value="">Select account...</option>
                      {(accountsData?.data.items ?? []).map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.accountNumber ? `#${a.accountNumber} – ` : ''}{a.name || a._id}
                        </option>
                      ))}
                    </select>
                  )}
                  {editRelatedType === 'deal' && (
                    <select
                      value={editRelatedId}
                      onChange={(e) => setEditRelatedId(e.target.value)}
                      className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-sm text-[color:var(--color-text)]"
                    >
                      <option value="">Select deal...</option>
                      {(dealsData?.data.items ?? []).map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.dealNumber ? `#${d.dealNumber} – ` : ''}{d.title || d._id}
                        </option>
                      ))}
                    </select>
                  )}
                  {editRelatedType === 'invoice' && (
                    <select
                      value={editRelatedId}
                      onChange={(e) => setEditRelatedId(e.target.value)}
                      className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-sm text-[color:var(--color-text)]"
                    >
                      <option value="">Select invoice...</option>
                      {(invoicesData?.data.items ?? []).map((i) => (
                        <option key={i._id} value={i._id}>
                          {i.invoiceNumber || i._id}
                        </option>
                      ))}
                    </select>
                  )}
                  {editRelatedType === 'quote' && (
                    <select
                      value={editRelatedId}
                      onChange={(e) => setEditRelatedId(e.target.value)}
                      className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-sm text-[color:var(--color-text)]"
                    >
                      <option value="">Select quote...</option>
                      {(quotesData?.data.items ?? []).map((q) => (
                        <option key={q._id} value={q._id}>
                          {q.quoteNumber || q._id}
                        </option>
                      ))}
                    </select>
                  )}
                  {editRelatedType === 'project' && (
                    <select
                      value={editRelatedId}
                      onChange={(e) => setEditRelatedId(e.target.value)}
                      className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-2 text-sm text-[color:var(--color-text)]"
                    >
                      <option value="">Select project...</option>
                      {(projectsData?.data.items ?? []).map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name || p._id}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center gap-2">
                <div className="flex gap-2">
                  {editingTask.status !== 'completed' && editingTask.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => completeTask.mutate(editingTask._id)}
                      disabled={completeTask.isPending}
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                    >
                      Mark done
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm('Delete this task? This cannot be undone.')) return
                      deleteTask.mutate(editingTask._id)
                      setEditingTask(null)
                    }}
                    disabled={deleteTask.isPending}
                    className="rounded-lg border border-red-400 bg-transparent px-3 py-1.5 text-xs text-red-500 hover:bg-red-950/40"
                  >
                    Delete
                  </button>
                </div>
                <div className="flex gap-2">
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


