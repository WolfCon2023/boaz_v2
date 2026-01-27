import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { DndContext, type DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'
import { CRMNav } from '@/components/CRMNav'
import { BarChart3, CalendarDays, ListChecks, Plus, Presentation, Trello } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { StratflowIssueDrawer, type StratflowIssueType, type StratflowPriority } from '@/components/StratflowIssueDrawer'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type Board = {
  _id: string
  projectId: string
  name: string
  kind: 'KANBAN' | 'BACKLOG' | 'MILESTONES'
}

type Column = {
  _id: string
  boardId: string
  name: string
  order: number
}

type Issue = {
  _id: string
  projectId: string
  boardId: string
  columnId: string
  title: string
  description?: string | null
  type: StratflowIssueType
  priority: StratflowPriority
  statusKey?: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | null
  acceptanceCriteria?: string | null
  storyPoints?: number | null
  sprintId?: string | null
  epicId?: string | null
  labels?: string[]
  components?: string[]
  order: number
  createdAt?: string | null
  updatedAt?: string | null
}

type Sprint = {
  _id: string
  projectId: string
  name: string
  goal?: string | null
  startDate?: string | null
  endDate?: string | null
  state: 'planned' | 'active' | 'closed'
}

type Project = {
  _id: string
  name: string
  key: string
  type: 'SCRUM' | 'KANBAN' | 'TRADITIONAL' | 'HYBRID'
  status: 'Active' | 'On Hold' | 'Completed' | 'Archived'
}

type ViewMode = 'board' | 'list' | 'sprint' | 'timeline' | 'reports'

function groupIssuesByColumn(issues: Issue[]) {
  const m: Record<string, Issue[]> = {}
  for (const it of issues) {
    if (!m[it.columnId]) m[it.columnId] = []
    m[it.columnId].push(it)
  }
  for (const k of Object.keys(m)) {
    m[k].sort((a, b) => (a.order || 0) - (b.order || 0))
  }
  return m
}

function findIssueColumnId(map: Record<string, Issue[]>, issueId: string) {
  for (const colId of Object.keys(map)) {
    if (map[colId].some((i) => i._id === issueId)) return colId
  }
  return null
}

function normView(v: string | null): ViewMode {
  const x = String(v || '').toLowerCase()
  if (x === 'list' || x === 'sprint' || x === 'timeline' || x === 'reports') return x
  return 'board'
}

function parseIsoDate(s?: string | null): Date | null {
  if (!s) return null
  const d = new Date(String(s))
  return Number.isFinite(d.getTime()) ? d : null
}

function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime()
  return ms / (1000 * 60 * 60 * 24)
}

function IssueCard({ issue, onOpen }: { issue: Issue; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue._id,
    data: { type: 'issue', columnId: issue.columnId },
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(issue._id)}
      className={[
        'rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm shadow-sm cursor-pointer',
        isDragging ? 'opacity-70' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium">{issue.title}</div>
        <div className="text-[10px] text-[color:var(--color-text-muted)]">{issue.type}</div>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
          {issue.priority}
        </span>
      </div>
    </div>
  )
}

function ColumnLane({
  column,
  issues,
  onAdd,
  onOpen,
}: {
  column: Column
  issues: Issue[]
  onAdd: (columnId: string, title: string, type: Exclude<StratflowIssueType, 'Bug'>) => void
  onOpen: (id: string) => void
}) {
  const toast = useToast()
  const [draft, setDraft] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<Exclude<StratflowIssueType, 'Bug'> | ''>('')

  const normType = (t: StratflowIssueType) => (t === 'Bug' ? 'Defect' : t)
  const visibleIssues = typeFilter ? issues.filter((i) => normType(i.type) === typeFilter) : issues

  const droppableId = `column:${column._id}`
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, data: { type: 'column', columnId: column._id } })

  const issueIds = visibleIssues.map((i) => i._id)
  return (
    <div
      ref={setNodeRef}
      className={[
        'flex w-[18rem] shrink-0 flex-col rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]',
        isOver ? 'ring-2 ring-[color:var(--color-primary-600)]' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--color-border)] px-3 py-2">
        <div className="text-sm font-semibold">{column.name}</div>
        <div className="text-xs text-[color:var(--color-text-muted)]">
          {visibleIssues.length}
          {typeFilter ? `/${issues.length}` : ''}
        </div>
      </div>

      <div className="p-2">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setTypeFilter('')}
                className={[
                  'rounded-full border px-2 py-0.5 text-[10px]',
                  typeFilter === ''
                    ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]'
                    : 'border-[color:var(--color-border)] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]',
                ].join(' ')}
              >
                All
              </button>
            </TooltipTrigger>
            <TooltipContent>Show all issue types</TooltipContent>
          </Tooltip>
          {(['Story', 'Task', 'Defect', 'Epic'] as Array<Exclude<StratflowIssueType, 'Bug'>>).map((t) => {
            const active = typeFilter === t
            return (
              <Tooltip key={t}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setTypeFilter((prev) => (prev === t ? '' : t))}
                    className={[
                      'rounded-full border px-2 py-0.5 text-[10px]',
                      active
                        ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]'
                        : 'border-[color:var(--color-border)] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]',
                    ].join(' ')}
                  >
                    {t}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Filter by {t}</TooltipContent>
              </Tooltip>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an issue…"
            className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs bg-transparent"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const t = draft.trim()
                if (!t) return
                const newType: Exclude<StratflowIssueType, 'Bug'> = typeFilter || 'Task'
                onAdd(column._id, t, newType)
                setDraft('')
              }
            }}
          />
          <button
            type="button"
            className="rounded-lg border border-[color:var(--color-border)] p-2 hover:bg-[color:var(--color-muted)]"
            onClick={() => {
              const t = draft.trim()
              if (!t) {
                toast.showToast('Enter a title first.', 'info')
                return
              }
              const newType: Exclude<StratflowIssueType, 'Bug'> = typeFilter || 'Task'
              onAdd(column._id, t, newType)
              setDraft('')
            }}
            aria-label="Add issue"
            title="Add issue"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 px-2 pb-2">
        <SortableContext items={issueIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {visibleIssues.map((issue) => (
              <IssueCard key={issue._id} issue={issue} onOpen={onOpen} />
            ))}
            {!visibleIssues.length ? (
              <div className="px-2 py-6 text-center text-xs text-[color:var(--color-text-muted)]">
                {typeFilter ? 'No matches' : 'Drop here'}
              </div>
            ) : null}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

export default function StratflowProject() {
  const { projectId } = useParams()
  const [sp, setSp] = useSearchParams()
  const qc = useQueryClient()
  const toast = useToast()
  const view = normView(sp.get('view'))
  const [focusedIssueId, setFocusedIssueId] = React.useState<string | null>(null)

  const projectQ = useQuery<{ data: Project }>({
    queryKey: ['stratflow', 'project', projectId],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}`)).data,
    retry: false,
    enabled: Boolean(projectId),
  })

  const boardsQ = useQuery<{ data: { items: Board[] } }>({
    queryKey: ['stratflow', 'boards', projectId],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/boards`)).data,
    retry: false,
    enabled: Boolean(projectId),
  })

  const boards = boardsQ.data?.data.items ?? []
  const boardFromUrl = sp.get('board')
  const defaultBoardId =
    (boardFromUrl && boards.some((b) => b._id === boardFromUrl) ? boardFromUrl : null) ??
    boards.find((b) => b.kind === 'KANBAN')?._id ??
    boards[0]?._id ??
    null

  React.useEffect(() => {
    if (!defaultBoardId) return
    if (sp.get('board') !== defaultBoardId) {
      const next = new URLSearchParams(sp)
      next.set('board', defaultBoardId)
      setSp(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultBoardId])

  const boardId = defaultBoardId

  const boardQ = useQuery<{ data: { board: Board; columns: Column[] } }>({
    queryKey: ['stratflow', 'board', boardId],
    queryFn: async () => (await http.get(`/api/stratflow/boards/${boardId}`)).data,
    retry: false,
    enabled: Boolean(boardId),
  })

  const issuesQ = useQuery<{ data: { items: Issue[] } }>({
    queryKey: ['stratflow', 'issues', boardId],
    queryFn: async () => (await http.get(`/api/stratflow/boards/${boardId}/issues`)).data,
    retry: false,
    enabled: Boolean(boardId),
  })

  const columns = boardQ.data?.data.columns ?? []
  const loadedIssues = issuesQ.data?.data.items ?? []
  const columnNameById = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of columns) m[c._id] = c.name
    return m
  }, [columns])

  const [localByColumn, setLocalByColumn] = React.useState<Record<string, Issue[]>>({})
  React.useEffect(() => {
    setLocalByColumn(groupIssuesByColumn(loadedIssues))
  }, [boardId, issuesQ.data])

  const [listQ, setListQ] = React.useState('')
  const [listColumnId, setListColumnId] = React.useState<string>('all')

  const sprintsQ = useQuery<{ data: { items: Sprint[] } }>({
    queryKey: ['stratflow', 'sprints', projectId],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/sprints`)).data,
    retry: false,
    enabled: Boolean(projectId),
  })
  const sprints = sprintsQ.data?.data.items ?? []
  const activeSprint = sprints.find((s) => s.state === 'active') ?? null

  const milestoneBoardId = boards.find((b) => b.kind === 'MILESTONES')?._id ?? null
  const milestoneBoardQ = useQuery<{ data: { board: Board; columns: Column[] } }>({
    queryKey: ['stratflow', 'board', milestoneBoardId],
    queryFn: async () => (await http.get(`/api/stratflow/boards/${milestoneBoardId}`)).data,
    retry: false,
    enabled: Boolean(milestoneBoardId) && view === 'timeline',
  })
  const milestoneIssuesQ = useQuery<{ data: { items: Issue[] } }>({
    queryKey: ['stratflow', 'issues', milestoneBoardId],
    queryFn: async () => (await http.get(`/api/stratflow/boards/${milestoneBoardId}/issues`)).data,
    retry: false,
    enabled: Boolean(milestoneBoardId) && view === 'timeline',
  })

  const backlogIssuesQ = useQuery<{ data: { items: Issue[] } }>({
    queryKey: ['stratflow', 'projectIssues', projectId, 'backlog'],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/issues?sprintId=null`)).data,
    retry: false,
    enabled: Boolean(projectId) && view === 'sprint',
  })
  const activeSprintIssuesQ = useQuery<{ data: { items: Issue[] } }>({
    queryKey: ['stratflow', 'projectIssues', projectId, 'activeSprint', activeSprint?._id],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/issues?sprintId=${encodeURIComponent(String(activeSprint?._id || ''))}`)).data,
    retry: false,
    enabled: Boolean(projectId) && Boolean(activeSprint?._id) && view === 'sprint',
  })

  const createSprint = useMutation({
    mutationFn: async (payload: { name: string; goal?: string | null; startDate?: string | null; endDate?: string | null }) => {
      return (await http.post(`/api/stratflow/projects/${projectId}/sprints`, payload)).data
    },
    onSuccess: async () => {
      toast.showToast('Sprint created.', 'success')
      await qc.invalidateQueries({ queryKey: ['stratflow', 'sprints', projectId] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to create sprint.', 'error'),
  })

  const setActiveSprint = useMutation({
    mutationFn: async (sprintId: string) => (await http.post(`/api/stratflow/sprints/${sprintId}/set-active`, {})).data,
    onSuccess: async () => {
      toast.showToast('Active sprint set.', 'success')
      await qc.invalidateQueries({ queryKey: ['stratflow', 'sprints', projectId] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to set active sprint.', 'error'),
  })

  const assignToSprint = useMutation({
    mutationFn: async (payload: { issueId: string; sprintId: string | null }) => {
      return (await http.patch(`/api/stratflow/issues/${payload.issueId}`, { sprintId: payload.sprintId })).data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stratflow', 'projectIssues', projectId, 'backlog'] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'projectIssues', projectId, 'activeSprint', activeSprint?._id] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issues', boardId] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to update sprint assignment.', 'error'),
  })

  const createIssue = useMutation({
    mutationFn: async (payload: { columnId: string; title: string; type: Exclude<StratflowIssueType, 'Bug'> }) => {
      return (await http.post(`/api/stratflow/boards/${boardId}/issues`, { columnId: payload.columnId, title: payload.title, type: payload.type })).data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issues', boardId] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to create issue.', 'error'),
  })

  const moveIssue = useMutation({
    mutationFn: async (payload: { issueId: string; toColumnId: string; toIndex: number }) => {
      return (await http.patch(`/api/stratflow/issues/${payload.issueId}/move`, { toColumnId: payload.toColumnId, toIndex: payload.toIndex })).data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issues', boardId] })
    },
    onError: async (err: any) => {
      toast.showToast(err?.response?.data?.error || 'Failed to move issue.', 'error')
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issues', boardId] })
    },
  })

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  function onAdd(columnId: string, title: string, type: Exclude<StratflowIssueType, 'Bug'>) {
    if (!boardId) return
    createIssue.mutate({ columnId, title, type })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (!activeId) return

    const srcColumnId = (active.data.current as any)?.columnId || findIssueColumnId(localByColumn, activeId)
    if (!srcColumnId) return

    let destColumnId: string | null = null
    let destIndex: number | null = null

    if (overId.startsWith('column:')) {
      destColumnId = overId.slice('column:'.length)
      const arr = localByColumn[destColumnId] ?? []
      destIndex = arr.length
    } else {
      destColumnId = findIssueColumnId(localByColumn, overId)
      if (!destColumnId) return
      const arr = localByColumn[destColumnId] ?? []
      destIndex = Math.max(0, arr.findIndex((i) => i._id === overId))
      if (destIndex < 0) destIndex = arr.length
    }

    if (!destColumnId || destIndex == null) return

    if (srcColumnId === destColumnId) {
      const arr = localByColumn[srcColumnId] ?? []
      const oldIndex = arr.findIndex((i) => i._id === activeId)
      if (oldIndex < 0) return
      const next = arrayMove(arr, oldIndex, destIndex)
      setLocalByColumn((prev) => ({ ...prev, [srcColumnId]: next }))
      moveIssue.mutate({ issueId: activeId, toColumnId: destColumnId, toIndex: destIndex })
      return
    }

    // cross-column
    const srcArr = (localByColumn[srcColumnId] ?? []).filter((i) => i._id !== activeId)
    const moving = (localByColumn[srcColumnId] ?? []).find((i) => i._id === activeId)
    if (!moving) return
    const destArr = [...(localByColumn[destColumnId] ?? [])]
    const insertAt = Math.max(0, Math.min(destArr.length, destIndex))
    destArr.splice(insertAt, 0, { ...moving, columnId: destColumnId })
    setLocalByColumn((prev) => ({ ...prev, [srcColumnId]: srcArr, [destColumnId]: destArr }))
    moveIssue.mutate({ issueId: activeId, toColumnId: destColumnId, toIndex: insertAt })
  }

  const project = projectQ.data?.data
  const currentBoard = boards.find((b) => b._id === boardId) ?? null
  const filteredListIssues = React.useMemo(() => {
    const q = listQ.trim().toLowerCase()
    const colId = listColumnId
    return loadedIssues
      .filter((it) => (colId === 'all' ? true : it.columnId === colId))
      .filter((it) => (!q ? true : String(it.title || '').toLowerCase().includes(q)))
      .slice()
      .sort((a, b) => {
        const ca = columnNameById[a.columnId] || ''
        const cb = columnNameById[b.columnId] || ''
        if (ca !== cb) return ca.localeCompare(cb)
        return (a.order || 0) - (b.order || 0)
      })
  }, [loadedIssues, listQ, listColumnId, columnNameById])

  function setView(next: ViewMode) {
    const sp2 = new URLSearchParams(sp)
    sp2.set('view', next)
    setSp(sp2, { replace: true })
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <CRMNav />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{project?.name || 'StratFlow'}</h1>
            {project?.key ? (
              <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                {project.key}
              </span>
            ) : null}
          </div>
          <div className="text-xs text-[color:var(--color-text-muted)]">
            Flow Hub · {project?.type || '—'} · {boardsQ.isFetching || projectQ.isFetching ? 'Refreshing…' : 'Ready'}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/apps/stratflow" className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">
            All projects
          </Link>
          <div className="flex items-center gap-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2">
            <div className="text-xs text-[color:var(--color-text-muted)]">Board</div>
            <select
              value={boardId ?? ''}
              onChange={(e) => {
                const next = e.target.value
                const sp2 = new URLSearchParams(sp)
                sp2.set('board', next)
                setSp(sp2)
              }}
              className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-sm bg-[color:var(--color-panel)]"
            >
              {boards.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setView('board')}
            className={[
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
              view === 'board' ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]' : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]',
            ].join(' ')}
          >
            <Trello className="h-4 w-4" />
            Board
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={[
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
              view === 'list' ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]' : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]',
            ].join(' ')}
          >
            <ListChecks className="h-4 w-4" />
            List
          </button>
          <button
            type="button"
            onClick={() => setView('timeline')}
            className={[
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
              view === 'timeline' ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]' : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]',
            ].join(' ')}
          >
            <Presentation className="h-4 w-4" />
            Timeline
          </button>
          <button
            type="button"
            onClick={() => setView('reports')}
            className={[
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
              view === 'reports' ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]' : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]',
            ].join(' ')}
          >
            <BarChart3 className="h-4 w-4" />
            Reports
          </button>
          <button
            type="button"
            onClick={() => setView('sprint')}
            className={[
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
              view === 'sprint' ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]' : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]',
            ].join(' ')}
          >
            <CalendarDays className="h-4 w-4" />
            Sprint
          </button>
        </div>
        <div className="text-xs text-[color:var(--color-text-muted)]">
          {issuesQ.isFetching || boardQ.isFetching ? 'Syncing…' : 'Synced'}
        </div>
      </div>

      {!boardId ? (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-sm text-[color:var(--color-text-muted)]">
          No boards yet for this project.
        </div>
      ) : (
        <>
          {view === 'board' && (
            <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
              <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
                <div className="text-sm font-semibold">{currentBoard?.name || 'Board'}</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {issuesQ.isFetching || boardQ.isFetching ? 'Loading…' : `${loadedIssues.length} issues`}
                </div>
              </div>

              <div className="overflow-x-auto p-3">
                <DndContext sensors={sensors} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
                  <div className="flex gap-3">
                    {columns
                      .slice()
                      .sort((a, b) => (a.order || 0) - (b.order || 0))
                      .map((col) => (
                        <ColumnLane
                          key={col._id}
                          column={col}
                          issues={localByColumn[col._id] ?? []}
                          onAdd={onAdd}
                          onOpen={(id) => setFocusedIssueId(id)}
                        />
                      ))}
                  </div>
                </DndContext>
              </div>
            </section>
          )}

          {view === 'list' && (
            <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
              <div className="flex flex-col gap-3 border-b border-[color:var(--color-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-semibold">Issues</div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={listQ}
                    onChange={(e) => setListQ(e.target.value)}
                    placeholder="Search title…"
                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                  />
                  <select
                    value={listColumnId}
                    onChange={(e) => setListColumnId(e.target.value)}
                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                  >
                    <option value="all">All columns</option>
                    {columns
                      .slice()
                      .sort((a, b) => (a.order || 0) - (b.order || 0))
                      .map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-[color:var(--color-text-muted)]">
                    <tr className="border-b border-[color:var(--color-border)]">
                      <th className="px-4 py-2 text-left font-medium">Title</th>
                      <th className="px-4 py-2 text-left font-medium">Type</th>
                      <th className="px-4 py-2 text-left font-medium">Priority</th>
                      <th className="px-4 py-2 text-left font-medium">Column</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-border)]">
                    {filteredListIssues.map((it) => (
                      <tr
                        key={it._id}
                        className="hover:bg-[color:var(--color-muted)] cursor-pointer"
                        onClick={() => setFocusedIssueId(it._id)}
                        title="Open Issue Focus"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium">{it.title}</div>
                        </td>
                        <td className="px-4 py-3 text-[color:var(--color-text-muted)]">{it.type}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                            {it.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[color:var(--color-text-muted)]">{columnNameById[it.columnId] || '—'}</td>
                      </tr>
                    ))}
                    {!filteredListIssues.length && !issuesQ.isLoading ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-[color:var(--color-text-muted)]">
                          No issues match your filters.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {view === 'sprint' && (
            <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
              <div className="flex flex-col gap-3 border-b border-[color:var(--color-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold">Sprint Planning</div>
                  <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                    {activeSprint ? `Active: ${activeSprint.name}` : 'No active sprint yet.'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                    onClick={() => {
                      const name = `Sprint ${sprints.length + 1}`
                      createSprint.mutate({ name, goal: null, startDate: null, endDate: null })
                    }}
                    disabled={createSprint.isPending}
                  >
                    {createSprint.isPending ? 'Creating…' : 'New sprint'}
                  </button>
                  <select
                    value={activeSprint?._id || ''}
                    onChange={(e) => {
                      const sid = e.target.value
                      if (!sid) return
                      setActiveSprint.mutate(sid)
                    }}
                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                    title="Set active sprint"
                  >
                    <option value="" disabled>
                      Set active…
                    </option>
                    {sprints.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.state === 'active' ? 'Active: ' : ''}{s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 p-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
                  <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
                    <div className="text-sm font-semibold">Backlog</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {backlogIssuesQ.isFetching ? 'Loading…' : `${(backlogIssuesQ.data?.data.items ?? []).length}`}
                    </div>
                  </div>
                  <div className="divide-y divide-[color:var(--color-border)]">
                    {(backlogIssuesQ.data?.data.items ?? [])
                      .filter((i) => i.type !== 'Epic')
                      .slice(0, 250)
                      .map((i) => (
                        <div key={i._id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <button type="button" className="text-left flex-1" onClick={() => setFocusedIssueId(i._id)}>
                            <div className="text-sm font-medium">{i.title}</div>
                            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">{i.type}</div>
                          </button>
                          <button
                            type="button"
                            disabled={!activeSprint?._id || assignToSprint.isPending}
                            onClick={() => {
                              if (!activeSprint?._id) return
                              assignToSprint.mutate({ issueId: i._id, sprintId: activeSprint._id })
                            }}
                            className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                            title={!activeSprint?._id ? 'Set an active sprint first' : 'Assign to active sprint'}
                          >
                            Add →
                          </button>
                        </div>
                      ))}
                    {!backlogIssuesQ.isLoading && !(backlogIssuesQ.data?.data.items ?? []).length ? (
                      <div className="px-4 py-8 text-center text-sm text-[color:var(--color-text-muted)]">Backlog is empty.</div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
                  <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
                    <div className="text-sm font-semibold">Active sprint</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {activeSprintIssuesQ.isFetching ? 'Loading…' : `${(activeSprintIssuesQ.data?.data.items ?? []).length}`}
                    </div>
                  </div>
                  <div className="divide-y divide-[color:var(--color-border)]">
                    {(activeSprintIssuesQ.data?.data.items ?? [])
                      .filter((i) => i.type !== 'Epic')
                      .slice(0, 250)
                      .map((i) => (
                        <div key={i._id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <button type="button" className="text-left flex-1" onClick={() => setFocusedIssueId(i._id)}>
                            <div className="text-sm font-medium">{i.title}</div>
                            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">{i.type}</div>
                          </button>
                          <button
                            type="button"
                            disabled={assignToSprint.isPending}
                            onClick={() => assignToSprint.mutate({ issueId: i._id, sprintId: null })}
                            className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                            title="Move back to backlog"
                          >
                            ← Remove
                          </button>
                        </div>
                      ))}
                    {!activeSprint ? (
                      <div className="px-4 py-8 text-center text-sm text-[color:var(--color-text-muted)]">
                        No active sprint. Create one and set it active.
                      </div>
                    ) : !activeSprintIssuesQ.isLoading && !(activeSprintIssuesQ.data?.data.items ?? []).length ? (
                      <div className="px-4 py-8 text-center text-sm text-[color:var(--color-text-muted)]">No issues in the active sprint yet.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          )}

          {view === 'timeline' && (
            <section className="space-y-4">
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold">Timeline</div>
                    <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                      MVP: shows sprint timelines when dates exist, plus Traditional milestone boards when present.
                    </div>
                  </div>
                </div>
              </div>

              {(() => {
                const datedSprints = sprints
                  .map((s) => ({ s, start: parseIsoDate(s.startDate), end: parseIsoDate(s.endDate) }))
                  .filter((x) => x.start && x.end) as Array<{ s: Sprint; start: Date; end: Date }>
                const sorted = datedSprints.slice().sort((a, b) => a.start.getTime() - b.start.getTime())
                if (!sorted.length) return null
                const minStart = sorted[0].start
                const maxEnd = sorted.reduce((m, x) => (x.end.getTime() > m.getTime() ? x.end : m), sorted[0].end)
                const spanDays = Math.max(1, daysBetween(minStart, maxEnd))

                return (
                  <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">Sprint timeline</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">{sorted.length} sprint(s) with dates</div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {sorted.map(({ s, start, end }) => {
                        const left = (daysBetween(minStart, start) / spanDays) * 100
                        const width = Math.max(2, (daysBetween(start, end) / spanDays) * 100)
                        return (
                          <div key={s._id} className="grid grid-cols-[10rem_1fr] items-center gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{s.name}</div>
                              <div className="text-xs text-[color:var(--color-text-muted)]">
                                {start.toLocaleDateString()} → {end.toLocaleDateString()}
                              </div>
                            </div>
                            <div className="h-8 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] relative overflow-hidden">
                              <div
                                className={[
                                  'absolute top-1/2 h-4 -translate-y-1/2 rounded-lg',
                                  s.state === 'active'
                                    ? 'bg-[color:var(--color-primary-600)]'
                                    : s.state === 'closed'
                                    ? 'bg-green-600'
                                    : 'bg-[color:var(--color-panel)]',
                                ].join(' ')}
                                style={{ left: `${left}%`, width: `${width}%` }}
                                title={s.state}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {milestoneBoardId ? (
                <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
                  <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
                    <div className="text-sm font-semibold">Milestones</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {milestoneIssuesQ.isFetching || milestoneBoardQ.isFetching
                        ? 'Loading…'
                        : `${(milestoneIssuesQ.data?.data.items ?? []).length} milestone(s)`}
                    </div>
                  </div>
                  <div className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-4">
                    {(milestoneBoardQ.data?.data.columns ?? [])
                      .slice()
                      .sort((a, b) => (a.order || 0) - (b.order || 0))
                      .map((c) => {
                        const issues = (milestoneIssuesQ.data?.data.items ?? []).filter((i) => i.columnId === c._id)
                        return (
                          <div key={c._id} className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
                            <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-3 py-2">
                              <div className="text-sm font-semibold">{c.name}</div>
                              <div className="text-xs text-[color:var(--color-text-muted)]">{issues.length}</div>
                            </div>
                            <div className="divide-y divide-[color:var(--color-border)]">
                              {issues
                                .slice()
                                .sort((a, b) => (a.order || 0) - (b.order || 0))
                                .slice(0, 50)
                                .map((i) => (
                                  <button
                                    key={i._id}
                                    type="button"
                                    className="w-full text-left px-3 py-2 hover:bg-[color:var(--color-muted)]"
                                    onClick={() => setFocusedIssueId(i._id)}
                                  >
                                    <div className="text-sm font-medium">{i.title}</div>
                                    <div className="mt-0.5 text-[10px] text-[color:var(--color-text-muted)]">{i.type}</div>
                                  </button>
                                ))}
                              {!issues.length && !(milestoneIssuesQ.isLoading || milestoneBoardQ.isLoading) ? (
                                <div className="px-3 py-4 text-xs text-[color:var(--color-text-muted)]">No milestones.</div>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              ) : null}

              {!milestoneBoardId && !sprints.some((s) => parseIsoDate(s.startDate) && parseIsoDate(s.endDate)) ? (
                <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-sm text-[color:var(--color-text-muted)]">
                  No dated sprints or milestone board found yet. Add sprint dates (start/end) or use a Traditional template to get Milestones.
                </div>
              ) : null}
            </section>
          )}

          {view === 'reports' && (
            <section className="space-y-4">
              {(() => {
                const total = loadedIssues.length
                const done = loadedIssues.filter((i) => i.statusKey === 'done').length
                const backlog = loadedIssues.filter((i) => i.statusKey === 'backlog').length
                const wip = loadedIssues.filter((i) => i.statusKey === 'todo' || i.statusKey === 'in_progress' || i.statusKey === 'in_review').length
                const pctDone = total ? Math.round((done / total) * 100) : 0

                const now = new Date()
                const openAges = loadedIssues
                  .filter((i) => i.statusKey !== 'done')
                  .map((i) => parseIsoDate(i.createdAt))
                  .filter(Boolean)
                  .map((d) => daysBetween(d as Date, now))
                const avgOpenAge = openAges.length ? Math.round((openAges.reduce((a, b) => a + b, 0) / openAges.length) * 10) / 10 : null

                const colCounts = columns
                  .slice()
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map((c) => ({ id: c._id, name: c.name, count: loadedIssues.filter((i) => i.columnId === c._id).length }))
                const maxCol = Math.max(1, ...colCounts.map((c) => c.count))

                return (
                  <>
                    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold">Reports</div>
                          <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">MVP: real counts + simple health signals from current issue state.</div>
                        </div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">{issuesQ.isFetching ? 'Syncing…' : 'Live'}</div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                          <div className="text-xs text-[color:var(--color-text-muted)]">Total issues</div>
                          <div className="mt-1 text-2xl font-semibold">{total}</div>
                        </div>
                        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                          <div className="text-xs text-[color:var(--color-text-muted)]">Done</div>
                          <div className="mt-1 text-2xl font-semibold">{done}</div>
                          <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">{pctDone}% complete</div>
                        </div>
                        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                          <div className="text-xs text-[color:var(--color-text-muted)]">WIP</div>
                          <div className="mt-1 text-2xl font-semibold">{wip}</div>
                          <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">To Do / In Progress / In Review</div>
                        </div>
                        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                          <div className="text-xs text-[color:var(--color-text-muted)]">Backlog</div>
                          <div className="mt-1 text-2xl font-semibold">{backlog}</div>
                          <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                            Avg open age: {avgOpenAge == null ? '—' : `${avgOpenAge}d`}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">WIP by column</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">{currentBoard?.name || 'Board'}</div>
                      </div>
                      <div className="mt-4 space-y-2">
                        {colCounts.map((c) => (
                          <div key={c.id} className="grid grid-cols-[10rem_1fr_auto] items-center gap-3">
                            <div className="text-sm text-[color:var(--color-text-muted)] truncate">{c.name}</div>
                            <div className="h-3 rounded-full bg-[color:var(--color-muted)] overflow-hidden border border-[color:var(--color-border)]">
                              <div className="h-full bg-[color:var(--color-primary-600)]" style={{ width: `${(c.count / maxCol) * 100}%` }} />
                            </div>
                            <div className="text-sm font-medium tabular-nums">{c.count}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )
              })()}
            </section>
          )}
        </>
      )}

      {focusedIssueId ? (
        <StratflowIssueDrawer issueId={focusedIssueId} projectId={String(projectId || '')} onClose={() => setFocusedIssueId(null)} />
      ) : null}
      </div>
    </TooltipProvider>
  )
}

