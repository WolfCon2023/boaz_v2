import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { DndContext, type DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'
import { CRMNav } from '@/components/CRMNav'
import { Plus } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'

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
  type: 'Epic' | 'Story' | 'Task' | 'Bug' | 'Spike'
  priority: 'Low' | 'Medium' | 'High' | 'Critical'
  order: number
}

type Project = {
  _id: string
  name: string
  key: string
  type: 'SCRUM' | 'KANBAN' | 'TRADITIONAL' | 'HYBRID'
  status: 'Active' | 'On Hold' | 'Completed' | 'Archived'
}

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

function IssueCard({ issue }: { issue: Issue }) {
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
      className={[
        'rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm shadow-sm',
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
}: {
  column: Column
  issues: Issue[]
  onAdd: (columnId: string, title: string) => void
}) {
  const toast = useToast()
  const [draft, setDraft] = React.useState('')

  const droppableId = `column:${column._id}`
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, data: { type: 'column', columnId: column._id } })

  const issueIds = issues.map((i) => i._id)
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
        <div className="text-xs text-[color:var(--color-text-muted)]">{issues.length}</div>
      </div>

      <div className="p-2">
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
                onAdd(column._id, t)
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
              onAdd(column._id, t)
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
            {issues.map((issue) => (
              <IssueCard key={issue._id} issue={issue} />
            ))}
            {!issues.length ? <div className="px-2 py-6 text-center text-xs text-[color:var(--color-text-muted)]">Drop here</div> : null}
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

  const [localByColumn, setLocalByColumn] = React.useState<Record<string, Issue[]>>({})
  React.useEffect(() => {
    setLocalByColumn(groupIssuesByColumn(loadedIssues))
  }, [boardId, issuesQ.data])

  const createIssue = useMutation({
    mutationFn: async (payload: { columnId: string; title: string }) => {
      return (await http.post(`/api/stratflow/boards/${boardId}/issues`, { columnId: payload.columnId, title: payload.title })).data
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

  function onAdd(columnId: string, title: string) {
    if (!boardId) return
    createIssue.mutate({ columnId, title })
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

  return (
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

      {!boardId ? (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-sm text-[color:var(--color-text-muted)]">
          No boards yet for this project.
        </div>
      ) : (
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
                    <ColumnLane key={col._id} column={col} issues={localByColumn[col._id] ?? []} onAdd={onAdd} />
                  ))}
              </div>
            </DndContext>
          </div>
        </section>
      )}
    </div>
  )
}

