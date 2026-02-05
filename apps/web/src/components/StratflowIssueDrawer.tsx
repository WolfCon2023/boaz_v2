import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'
import { Maximize2, Minimize2, PictureInPicture2, Pin, Star } from 'lucide-react'

export type StratflowIssueType = 'Epic' | 'Story' | 'Task' | 'Defect' | 'Spike' | 'Bug'
export type StratflowPriority = 'Highest' | 'High' | 'Medium' | 'Low' | 'Critical'

export type StratflowIssue = {
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
  phase?: string | null
  targetStartDate?: string | null
  targetEndDate?: string | null
  labels?: string[]
  components?: string[]
  links?: { type: 'blocks' | 'blocked_by' | 'relates_to'; issueId: string }[]
  reporterId?: string
  assigneeId?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

type UserInfo = {
  id: string
  email: string
  name?: string
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

type Comment = {
  _id: string
  issueId: string
  projectId: string
  authorId: string
  body: string
  createdAt: string
}

type ProjectMember = { id: string; email: string; name: string }
type ProjectMembersResponse = { data: { users: ProjectMember[] } }

type ProjectComponent = { _id: string; name: string }
type ProjectComponentsResponse = { data: { items: ProjectComponent[] } }

type TimeEntry = {
  _id: string
  projectId: string
  issueId: string
  userId: string
  minutes: number
  billable: boolean
  note?: string | null
  workDate?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

function normalizeIssueType(t: StratflowIssueType): 'Epic' | 'Story' | 'Task' | 'Defect' | 'Spike' {
  if (t === 'Bug') return 'Defect'
  return t
}

function normalizePriority(p: StratflowPriority): 'Highest' | 'High' | 'Medium' | 'Low' {
  if (p === 'Critical') return 'Highest'
  return p
}

export function StratflowIssueDrawer({
  issueId,
  projectId,
  onClose,
}: {
  issueId: string
  projectId: string
  onClose: () => void
}) {
  const toast = useToast()
  const qc = useQueryClient()

  type DrawerMode = 'drawer' | 'popout' | 'fullscreen'
  const [drawerMode, setDrawerMode] = React.useState<DrawerMode>(() => {
    try {
      const saved = localStorage.getItem('sfIssueFocusMode')
      if (saved === 'fullscreen' || saved === 'popout') return saved
      return 'drawer'
    } catch {
      return 'drawer'
    }
  })

  React.useEffect(() => {
    try {
      localStorage.setItem('sfIssueFocusMode', drawerMode)
    } catch {
      // ignore
    }
  }, [drawerMode])

  // Drag state for pop-out mode
  const [dragPos, setDragPos] = React.useState<{ x: number; y: number } | null>(null)
  const dragRef = React.useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const drawerBoxRef = React.useRef<HTMLDivElement>(null)

  // Reset drag position when leaving pop-out
  React.useEffect(() => {
    if (drawerMode !== 'popout') setDragPos(null)
  }, [drawerMode])

  // Initialise drag position on first pop-out render
  React.useEffect(() => {
    if (drawerMode === 'popout' && dragPos === null && drawerBoxRef.current) {
      const rect = drawerBoxRef.current.getBoundingClientRect()
      setDragPos({ x: rect.left, y: rect.top })
    }
  }, [drawerMode, dragPos])

  const handleDragStart = React.useCallback(
    (e: React.MouseEvent) => {
      if (drawerMode !== 'popout') return
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('a')) return

      e.preventDefault()
      const box = drawerBoxRef.current
      if (!box) return

      const rect = box.getBoundingClientRect()
      const currentX = dragPos?.x ?? rect.left
      const currentY = dragPos?.y ?? rect.top

      dragRef.current = { startX: e.clientX, startY: e.clientY, originX: currentX, originY: currentY }

      const handleMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        setDragPos({
          x: dragRef.current.originX + (ev.clientX - dragRef.current.startX),
          y: dragRef.current.originY + (ev.clientY - dragRef.current.startY),
        })
      }
      const handleUp = () => {
        dragRef.current = null
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [drawerMode, dragPos],
  )

  const meQ = useQuery<UserInfo>({
    queryKey: ['user', 'me'],
    queryFn: async () => (await http.get('/api/auth/me')).data,
    retry: false,
  })

  const issueQ = useQuery<{ data: StratflowIssue }>({
    queryKey: ['stratflow', 'issue', issueId],
    queryFn: async () => (await http.get(`/api/stratflow/issues/${issueId}`)).data,
    retry: false,
    enabled: Boolean(issueId),
  })

  const sprintsQ = useQuery<{ data: { items: Sprint[] } }>({
    queryKey: ['stratflow', 'sprints', projectId],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/sprints`)).data,
    retry: false,
    enabled: Boolean(projectId),
  })

  const membersQ = useQuery<ProjectMembersResponse>({
    queryKey: ['stratflow', 'project', projectId, 'members'],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/members`)).data,
    retry: false,
    enabled: Boolean(projectId),
  })

  const watchesQ = useQuery<{ data: { projectId: string; project: boolean; issueIds: string[] } }>({
    queryKey: ['stratflow', 'project', projectId, 'watches', 'me'],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/watches/me`)).data,
    retry: false,
    enabled: Boolean(projectId),
  })

  const componentsQ = useQuery<ProjectComponentsResponse>({
    queryKey: ['stratflow', 'project', projectId, 'components'],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/components`)).data,
    retry: false,
    enabled: Boolean(projectId),
  })

  const epicsQ = useQuery<{ data: { items: StratflowIssue[] } }>({
    queryKey: ['stratflow', 'epics', projectId],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/issues?type=Epic`)).data,
    retry: false,
    enabled: Boolean(projectId),
  })

  const commentsQ = useQuery<{ data: { items: Comment[] } }>({
    queryKey: ['stratflow', 'issue', issueId, 'comments'],
    queryFn: async () => (await http.get(`/api/stratflow/issues/${issueId}/comments`)).data,
    retry: false,
    enabled: Boolean(issueId),
  })

  const timeQ = useQuery<{ data: { items: TimeEntry[] } }>({
    queryKey: ['stratflow', 'issue', issueId, 'time'],
    queryFn: async () => (await http.get(`/api/stratflow/issues/${issueId}/time-entries`)).data,
    retry: false,
    enabled: Boolean(issueId),
  })

  const issue = issueQ.data?.data

  const boardId = issue?.boardId
  const columnsQ = useQuery<{ data: { board: any; columns: { _id: string; boardId: string; name: string; order: number; wipLimit?: number | null }[] } }>({
    queryKey: ['stratflow', 'board', boardId],
    queryFn: async () => (await http.get(`/api/stratflow/boards/${boardId}`)).data,
    retry: false,
    enabled: Boolean(boardId),
  })
  const columns = columnsQ.data?.data.columns ?? []

  const sprints = sprintsQ.data?.data.items ?? []
  const members = membersQ.data?.data.users ?? []
  const projectComponents = componentsQ.data?.data.items ?? []
  const epics = (epicsQ.data?.data.items ?? []).filter((e) => e._id !== issueId)
  const comments = commentsQ.data?.data.items ?? []
  const timeEntries = timeQ.data?.data.items ?? []
  const myUserId = meQ.data?.id || ''
  const watchingIssue = Boolean(issueId && (watchesQ.data?.data.issueIds ?? []).includes(issueId))
  const issueLinks = issue?.links ?? []
  const blockedBy = issueLinks.filter((l) => l.type === 'blocked_by')

  const projectIssuesQ = useQuery<{ data: { items: StratflowIssue[] } }>({
    queryKey: ['stratflow', 'projectIssues', projectId, 'linkSearch'],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/issues`)).data,
    retry: false,
    enabled: Boolean(projectId),
  })
  const projectIssues = projectIssuesQ.data?.data.items ?? []
  const issuesById = React.useMemo(() => {
    const m = new Map<string, StratflowIssue>()
    projectIssues.forEach((it) => m.set(it._id, it))
    return m
  }, [projectIssues])

  const [title, setTitle] = React.useState('')
  const [columnId, setColumnId] = React.useState<string>('')
  const [type, setType] = React.useState<'Epic' | 'Story' | 'Task' | 'Defect' | 'Spike'>('Task')
  const [priority, setPriority] = React.useState<'Highest' | 'High' | 'Medium' | 'Low'>('Medium')
  const [description, setDescription] = React.useState('')
  const [acceptanceCriteria, setAcceptanceCriteria] = React.useState('')
  const [storyPoints, setStoryPoints] = React.useState<string>('')
  const [sprintId, setSprintId] = React.useState<string>('') // '' means none
  const [epicId, setEpicId] = React.useState<string>('') // '' means none
  const [labelsText, setLabelsText] = React.useState<string>('')
  const [selectedComponents, setSelectedComponents] = React.useState<string[]>([])
  const [assigneeId, setAssigneeId] = React.useState<string>('')
  const [phase, setPhase] = React.useState<string>('')
  const [targetStartDate, setTargetStartDate] = React.useState<string>('')
  const [targetEndDate, setTargetEndDate] = React.useState<string>('')
  const [newComment, setNewComment] = React.useState<string>('')

  const [timeEditingId, setTimeEditingId] = React.useState<string>('')
  const [timeHours, setTimeHours] = React.useState<string>('') // hours, e.g. 1.5
  const [timeBillable, setTimeBillable] = React.useState<boolean>(false)
  const [timeWorkDate, setTimeWorkDate] = React.useState<string>(new Date().toISOString().slice(0, 10))
  const [timeNote, setTimeNote] = React.useState<string>('')

  const [linkType, setLinkType] = React.useState<'blocks' | 'blocked_by' | 'relates_to'>('relates_to')
  const [linkOtherId, setLinkOtherId] = React.useState<string>('')

  React.useEffect(() => {
    if (!issue) return
    setTitle(String(issue.title || ''))
    setColumnId(issue.columnId || '')
    setType(normalizeIssueType(issue.type))
    setPriority(normalizePriority(issue.priority))
    setDescription(String(issue.description || ''))
    setAcceptanceCriteria(String(issue.acceptanceCriteria || ''))
    setStoryPoints(issue.storyPoints == null ? '' : String(issue.storyPoints))
    setSprintId(issue.sprintId || '')
    setEpicId(issue.epicId || '')
    setLabelsText((issue.labels || []).join(', '))
    setSelectedComponents(issue.components || [])
    setAssigneeId(issue.assigneeId || '')
    setPhase(String(issue.phase || ''))
    setTargetStartDate(issue.targetStartDate ? String(issue.targetStartDate).slice(0, 10) : '')
    setTargetEndDate(issue.targetEndDate ? String(issue.targetEndDate).slice(0, 10) : '')
    setLinkOtherId('')
    setTimeEditingId('')
    setTimeHours('')
    setTimeBillable(false)
    setTimeWorkDate(new Date().toISOString().slice(0, 10))
    setTimeNote('')
  }, [issue, issueId])

  const save = useMutation({
    mutationFn: async () => {
      const points = storyPoints.trim()
      const parsedPoints = points === '' ? null : Number(points)
      if (points !== '' && !Number.isFinite(parsedPoints)) throw new Error('Story points must be a number.')

      const payload: Record<string, any> = {
        title: title.trim(),
        type,
        priority,
        description: description.trim() || null,
        acceptanceCriteria: acceptanceCriteria.trim() || null,
        storyPoints: parsedPoints,
        sprintId: sprintId || null,
        epicId: epicId || null,
        assigneeId: assigneeId || null,
        phase: phase.trim() || null,
        targetStartDate: targetStartDate ? new Date(targetStartDate).toISOString() : null,
        targetEndDate: targetEndDate ? new Date(targetEndDate).toISOString() : null,
        labels: labelsText
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        components: selectedComponents,
      }
      // Only include columnId when it actually changed to avoid unnecessary moves
      if (columnId && columnId !== issue?.columnId) {
        payload.columnId = columnId
      }
      return (await http.patch(`/api/stratflow/issues/${issueId}`, payload)).data
    },
    onSuccess: async () => {
      toast.showToast('Saved.', 'success')
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issue', issueId] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issues'] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'projectIssues', projectId] })
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error
      if (code === 'wip_limit_reached') toast.showToast('WIP limit reached for that column.', 'error')
      else if (code === 'missing_acceptance_criteria') toast.showToast('Stories require acceptance criteria to move to Done.', 'error')
      else if (code === 'missing_description') toast.showToast('Defects require a description to move to Done.', 'error')
      else toast.showToast(code || err?.message || 'Failed to save issue.', 'error')
    },
  })

  const toggleIssueWatch = useMutation({
    mutationFn: async () => {
      if (!issueId) throw new Error('No issue selected.')
      return (await http.post(`/api/stratflow/issues/${issueId}/watch`, { enabled: !watchingIssue })).data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stratflow', 'project', projectId, 'watches', 'me'] })
      toast.showToast(watchingIssue ? 'Stopped watching issue.' : 'Watching issue.', 'success')
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || err?.message || 'Failed to update watch.', 'error'),
  })

  const addComment = useMutation({
    mutationFn: async () => {
      const body = newComment.trim()
      if (!body) throw new Error('Enter a comment first.')
      return (await http.post(`/api/stratflow/issues/${issueId}/comments`, { body })).data
    },
    onSuccess: async () => {
      setNewComment('')
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issue', issueId, 'comments'] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || err?.message || 'Failed to add comment.', 'error'),
  })

  const addLink = useMutation({
    mutationFn: async () => {
      const otherIssueId = linkOtherId
      if (!otherIssueId) throw new Error('Pick an issue to link.')
      return (await http.post(`/api/stratflow/issues/${issueId}/links`, { type: linkType, otherIssueId })).data
    },
    onSuccess: async () => {
      setLinkOtherId('')
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issue', issueId] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issues'] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'projectIssues', projectId] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || err?.message || 'Failed to add link.', 'error'),
  })

  const removeLink = useMutation({
    mutationFn: async ({ type, otherIssueId }: { type: 'blocks' | 'blocked_by' | 'relates_to'; otherIssueId: string }) => {
      return (await http.post(`/api/stratflow/issues/${issueId}/links/remove`, { type, otherIssueId })).data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issue', issueId] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issues'] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'projectIssues', projectId] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || err?.message || 'Failed to remove link.', 'error'),
  })

  const unblockAll = useMutation({
    mutationFn: async () => {
      for (const l of blockedBy) {
        await http.post(`/api/stratflow/issues/${issueId}/links/remove`, { type: 'blocked_by', otherIssueId: String(l.issueId) })
      }
      return { ok: true }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issue', issueId] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issues'] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'projectIssues', projectId] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || err?.message || 'Failed to unblock.', 'error'),
  })

  const logTime = useMutation({
    mutationFn: async () => {
      const hours = Number(String(timeHours || '').trim())
      if (!Number.isFinite(hours) || hours <= 0) throw new Error('Enter hours (e.g., 1.5).')
      const minutes = Math.round(hours * 60)
      if (minutes <= 0) throw new Error('Time must be greater than 0.')
      if (!timeWorkDate) throw new Error('Pick a work date.')
      return (await http.post(`/api/stratflow/issues/${issueId}/time-entries`, { minutes, billable: timeBillable, workDate: timeWorkDate, note: timeNote.trim() || null })).data
    },
    onSuccess: async () => {
      toast.showToast('Time logged.', 'success')
      setTimeHours('')
      setTimeBillable(false)
      setTimeNote('')
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issue', issueId, 'time'] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'timeRollups', projectId] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || err?.message || 'Failed to log time.', 'error'),
  })

  const updateTime = useMutation({
    mutationFn: async () => {
      if (!timeEditingId) throw new Error('No time entry selected.')
      const hours = Number(String(timeHours || '').trim())
      if (!Number.isFinite(hours) || hours <= 0) throw new Error('Enter hours (e.g., 1.5).')
      const minutes = Math.round(hours * 60)
      if (!timeWorkDate) throw new Error('Pick a work date.')
      return (await http.patch(`/api/stratflow/time-entries/${timeEditingId}`, { minutes, billable: timeBillable, workDate: timeWorkDate, note: timeNote.trim() || null })).data
    },
    onSuccess: async () => {
      toast.showToast('Time updated.', 'success')
      setTimeEditingId('')
      setTimeHours('')
      setTimeBillable(false)
      setTimeNote('')
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issue', issueId, 'time'] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'timeRollups', projectId] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || err?.message || 'Failed to update time.', 'error'),
  })

  const deleteTime = useMutation({
    mutationFn: async (timeEntryId: string) => {
      return (await http.delete(`/api/stratflow/time-entries/${timeEntryId}`)).data
    },
    onSuccess: async () => {
      toast.showToast('Time entry deleted.', 'success')
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issue', issueId, 'time'] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'timeRollups', projectId] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || err?.message || 'Failed to delete time.', 'error'),
  })

  const timeTotals = React.useMemo(() => {
    const totalMinutes = timeEntries.reduce((a, b) => a + (Number(b.minutes) || 0), 0)
    const billableMinutes = timeEntries.reduce((a, b) => a + (b.billable ? Number(b.minutes) || 0 : 0), 0)
    return { totalMinutes, billableMinutes }
  }, [timeEntries])

  React.useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) => {
      const el = t as any
      if (!el) return false
      const tag = String(el.tagName || '').toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (Boolean(el.isContentEditable)) return true
      return false
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      // Full window toggle (avoid when typing)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'f' || e.key === 'F')) {
        if (isTypingTarget(e.target)) return
        e.preventDefault()
        setDrawerMode((m) => (m === 'fullscreen' ? 'drawer' : 'fullscreen'))
        return
      }

      // Save (Ctrl/Cmd+Enter)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (save.isPending) return
        if (!title.trim()) return
        e.preventDefault()
        save.mutate()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, save.isPending, title, setDrawerMode])

  const isPopout = drawerMode === 'popout'
  const isFullscreen = drawerMode === 'fullscreen'

  const popoutStyle: React.CSSProperties = isPopout
    ? {
        position: 'absolute',
        left: dragPos?.x ?? '50%',
        top: dragPos?.y ?? '5%',
        transform: dragPos ? undefined : 'translateX(-50%)',
        width: 'min(95vw, 48rem)',
        height: '85vh',
        minWidth: 360,
        minHeight: 260,
        maxWidth: 'calc(100vw - 1rem)',
        maxHeight: 'calc(100vh - 1rem)',
        resize: 'both' as const,
      }
    : {}

  return (
    <div
      className={`fixed inset-0 z-[2147483647] ${isPopout ? 'bg-black/25' : 'bg-black/40'}`}
      onClick={onClose}
    >
      <div
        ref={drawerBoxRef}
        className={[
          'flex flex-col border-[color:var(--color-border)] bg-[color:var(--color-panel)] shadow-2xl overflow-hidden',
          isFullscreen
            ? 'absolute inset-0 w-full border-l-0'
            : isPopout
              ? 'absolute rounded-2xl border'
              : 'absolute top-0 right-0 bottom-0 w-[min(95vw,34rem)] border-l',
        ].join(' ')}
        style={popoutStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex-shrink-0 flex items-start justify-between gap-3 border-b border-[color:var(--color-border)] px-4 py-3 ${isPopout ? 'cursor-move select-none' : ''}`}
          onMouseDown={handleDragStart}
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">Issue Focus</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-[color:var(--color-text-muted)]">Status:</span>
              {columns.length > 0 ? (
                <select
                  value={columnId}
                  onChange={(e) => setColumnId(e.target.value)}
                  className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-0.5 text-xs"
                >
                  {columns.map((col) => (
                    <option key={col._id} value={col._id}>
                      {col.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-[color:var(--color-text-muted)]">
                  {issue?.statusKey ? issue.statusKey.replaceAll('_', ' ') : '—'}
                </span>
              )}
            </div>
            <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">
              Shortcuts: <span className="font-medium">Esc</span> close · <span className="font-medium">F</span> full window ·{' '}
              <span className="font-medium">Ctrl/Cmd+Enter</span> save
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={toggleIssueWatch.isPending || !issueId}
              onClick={() => toggleIssueWatch.mutate()}
              className={[
                'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50',
                watchingIssue ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]' : 'border-[color:var(--color-border)]',
              ].join(' ')}
              title={watchingIssue ? 'You will receive notifications for updates on this issue.' : 'Watch this issue to receive notifications.'}
            >
              <Star className="h-4 w-4" />
              {watchingIssue ? 'Watching' : 'Watch'}
            </button>
            {/* Mode toggle buttons */}
            {drawerMode === 'drawer' && (
              <>
                <button
                  type="button"
                  onClick={() => setDrawerMode('popout')}
                  className="rounded-full border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors"
                  title="Pop out"
                >
                  <PictureInPicture2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerMode('fullscreen')}
                  className="rounded-full border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors"
                  title="Fullscreen"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {drawerMode === 'popout' && (
              <>
                <button
                  type="button"
                  onClick={() => setDrawerMode('drawer')}
                  className="rounded-full border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors"
                  title="Dock to side"
                >
                  <Pin className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerMode('fullscreen')}
                  className="rounded-full border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors"
                  title="Fullscreen"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {drawerMode === 'fullscreen' && (
              <button
                type="button"
                onClick={() => setDrawerMode('drawer')}
                className="rounded-full border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors"
                title="Exit fullscreen"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-[color:var(--color-muted)]" title="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {issueQ.isLoading ? (
            <div className="text-sm text-[color:var(--color-text-muted)]">Loading…</div>
          ) : !issue ? (
            <div className="text-sm text-[color:var(--color-text-muted)]">Issue not found.</div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Summary</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Issue type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                  >
                    <option value="Epic">Epic</option>
                    <option value="Story">Story</option>
                    <option value="Task">Task</option>
                    <option value="Defect">Defect</option>
                    <option value="Spike">Spike</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                  >
                    <option value="Highest">Highest</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Sprint</label>
                  <select
                    value={sprintId || ''}
                    onChange={(e) => setSprintId(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                  >
                    <option value="">No sprint</option>
                    {sprints
                      .slice()
                      .sort((a, b) => (a.state === b.state ? 0 : a.state === 'active' ? -1 : 1))
                      .map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.state === 'active' ? 'Active: ' : ''}{s.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Epic link</label>
                  <select
                    value={epicId || ''}
                    onChange={(e) => setEpicId(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                    disabled={type === 'Epic'}
                  >
                    <option value="">No epic</option>
                    {epics.map((e) => (
                      <option key={e._id} value={e._id}>
                        {e.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Story points</label>
                  <input
                    value={storyPoints}
                    onChange={(e) => setStoryPoints(e.target.value)}
                    inputMode="numeric"
                    className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                    placeholder="e.g., 3"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Assignee</label>
                  <select
                    value={assigneeId || ''}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                    title="Only project members can be assigned"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {(m.name || m.email) + (m.email ? ` (${m.email})` : '')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                  placeholder="As a [user], I want [goal], so that [benefit]."
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Acceptance criteria</label>
                <textarea
                  value={acceptanceCriteria}
                  onChange={(e) => setAcceptanceCriteria(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                  placeholder={'- Given …\n- When …\n- Then …'}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Labels</label>
                  <input
                    value={labelsText}
                    onChange={(e) => setLabelsText(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                    placeholder="security, backend, ui"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Components</label>
                  <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-2">
                    {!projectComponents.length ? (
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        No components defined for this project yet (an admin can add them in Admin Portal).
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {projectComponents.map((c) => {
                          const active = selectedComponents.includes(c.name)
                          return (
                            <button
                              key={c._id}
                              type="button"
                              onClick={() => {
                                setSelectedComponents((prev) => (prev.includes(c.name) ? prev.filter((x) => x !== c.name) : [...prev, c.name]))
                              }}
                              className={[
                                'rounded-full border px-2 py-1 text-xs',
                                active
                                  ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]'
                                  : 'border-[color:var(--color-border)] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]',
                              ].join(' ')}
                              title={active ? 'Remove component' : 'Add component'}
                            >
                              {c.name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]">Roadmap</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Phase</label>
                    <input
                      value={phase}
                      onChange={(e) => setPhase(e.target.value)}
                      className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                      placeholder="e.g., Discovery, Build, Launch"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Target dates</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={targetStartDate}
                        onChange={(e) => setTargetStartDate(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                        title="Target start"
                      />
                      <input
                        type="date"
                        value={targetEndDate}
                        onChange={(e) => setTargetEndDate(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                        title="Target end"
                      />
                    </div>
                    <div className="text-[10px] text-[color:var(--color-text-muted)]">
                      Tip: Use these on Epics to populate the Roadmap timeline.
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]">Dependencies</div>
                  <div className="text-[10px] text-[color:var(--color-text-muted)]">{issueLinks.length ? `${issueLinks.length}` : 'None'}</div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Link type</label>
                    <select
                      value={linkType}
                      onChange={(e) => setLinkType(e.target.value as any)}
                      className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                    >
                      <option value="relates_to">Relates to</option>
                      <option value="blocks">Blocks</option>
                      <option value="blocked_by">Blocked by</option>
                    </select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Issue</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={linkOtherId}
                        onChange={(e) => setLinkOtherId(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                      >
                        <option value="">Select issue…</option>
                        {projectIssues
                          .filter((it) => it._id !== issueId)
                          .slice()
                          .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
                          .slice(0, 500)
                          .map((it) => (
                            <option key={it._id} value={it._id}>
                              {it.type}: {it.title}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        disabled={addLink.isPending || !linkOtherId}
                        onClick={() => addLink.mutate()}
                        className="shrink-0 rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                        title="Add link"
                      >
                        {addLink.isPending ? 'Adding…' : 'Add'}
                      </button>
                    </div>
                    <div className="text-[10px] text-[color:var(--color-text-muted)]">
                      Tip: Mark an issue as <b>Blocked by</b> to make the “Blocked” badge appear on cards and enable blocked filtering later.
                    </div>
                  </div>
                </div>

                {issueLinks.length ? (
                  <div className="mt-3 space-y-2">
                    {blockedBy.length ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                        <div className="text-xs text-amber-900">
                          <span className="font-semibold">Blocked</span> by {blockedBy.length} issue(s).
                        </div>
                        <button
                          type="button"
                          disabled={unblockAll.isPending}
                          onClick={() => unblockAll.mutate()}
                          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                          title="Remove all Blocked by links"
                        >
                          {unblockAll.isPending ? 'Unblocking…' : 'Unblock'}
                        </button>
                      </div>
                    ) : null}
                    {issueLinks.map((l, idx) => {
                      const other = issuesById.get(String(l.issueId))
                      const label = other ? `${other.type}: ${other.title}` : `Issue ${String(l.issueId)}`
                      return (
                        <div key={`${l.type}-${String(l.issueId)}-${idx}`} className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--color-border)] px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-xs text-[color:var(--color-text-muted)]">{l.type.replaceAll('_', ' ')}</div>
                            <div className="mt-0.5 truncate text-sm">{label}</div>
                          </div>
                          <button
                            type="button"
                            disabled={removeLink.isPending}
                            onClick={() => removeLink.mutate({ type: l.type as any, otherIssueId: String(l.issueId) })}
                            className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                            title="Remove link"
                          >
                            Remove
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-[color:var(--color-border)]">
                <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
                  <div className="text-sm font-semibold">Time</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    {timeQ.isFetching
                      ? 'Refreshing…'
                      : `${Math.round((timeTotals.totalMinutes / 60) * 10) / 10}h (${Math.round((timeTotals.billableMinutes / 60) * 10) / 10}h billable)`}
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Work date</label>
                      <input
                        type="date"
                        value={timeWorkDate}
                        onChange={(e) => setTimeWorkDate(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Hours</label>
                      <input
                        value={timeHours}
                        onChange={(e) => setTimeHours(e.target.value)}
                        inputMode="decimal"
                        placeholder="e.g., 1.5"
                        className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                      />
                      <div className="text-[10px] text-[color:var(--color-text-muted)]">
                        Stored as minutes ({timeHours && Number.isFinite(Number(timeHours)) ? `${Math.round(Number(timeHours) * 60)}m` : '—'}).
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Billable</label>
                      <button
                        type="button"
                        onClick={() => setTimeBillable((v) => !v)}
                        className={[
                          'w-full rounded-lg border px-3 py-2 text-sm text-left',
                          timeBillable
                            ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]'
                            : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]',
                        ].join(' ')}
                        title="Toggle billable"
                      >
                        {timeBillable ? 'Yes (billable)' : 'No (non-billable)'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Note</label>
                    <input
                      value={timeNote}
                      onChange={(e) => setTimeNote(e.target.value)}
                      placeholder="What was done?"
                      className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      {timeEditingId ? 'Editing your time entry' : 'Log time against this issue'}
                    </div>
                    <div className="flex items-center gap-2">
                      {timeEditingId ? (
                        <button
                          type="button"
                          onClick={() => {
                            setTimeEditingId('')
                            setTimeHours('')
                            setTimeBillable(false)
                            setTimeNote('')
                            setTimeWorkDate(new Date().toISOString().slice(0, 10))
                          }}
                          className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                        >
                          Cancel
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={(timeEditingId ? updateTime.isPending : logTime.isPending) || !String(timeHours || '').trim()}
                        onClick={() => (timeEditingId ? updateTime.mutate() : logTime.mutate())}
                        className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                      >
                        {timeEditingId ? (updateTime.isPending ? 'Saving…' : 'Save edit') : logTime.isPending ? 'Logging…' : 'Log time'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[color:var(--color-border)] divide-y divide-[color:var(--color-border)]">
                    {timeEntries
                      .slice()
                      .sort((a, b) => String(b.workDate || '').localeCompare(String(a.workDate || '')))
                      .slice(0, 50)
                      .map((t) => {
                        const canEdit = myUserId && String(t.userId || '') === myUserId
                        const hours = Math.round(((Number(t.minutes) || 0) / 60) * 10) / 10
                        const date = t.workDate ? String(t.workDate).slice(0, 10) : ''
                        return (
                          <div key={t._id} className="px-3 py-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm">
                                  <span className="font-medium tabular-nums">{hours}h</span>{' '}
                                  {t.billable ? (
                                    <span className="ml-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-900">Billable</span>
                                  ) : (
                                    <span className="ml-1 rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                                      Non-billable
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 text-xs text-[color:var(--color-text-muted)]">
                                  {date || '—'} · {t.userId ? (members.find((m) => m.id === t.userId)?.name || members.find((m) => m.id === t.userId)?.email || t.userId) : '—'}
                                </div>
                                {t.note ? <div className="mt-1 text-sm break-words">{t.note}</div> : null}
                              </div>
                              <div className="flex items-center gap-2">
                                {canEdit ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTimeEditingId(t._id)
                                      setTimeHours(String(Math.round(((Number(t.minutes) || 0) / 60) * 10) / 10))
                                      setTimeBillable(Boolean(t.billable))
                                      setTimeWorkDate(t.workDate ? String(t.workDate).slice(0, 10) : new Date().toISOString().slice(0, 10))
                                      setTimeNote(String(t.note || ''))
                                    }}
                                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                                    title="Edit time entry"
                                  >
                                    Edit
                                  </button>
                                ) : null}
                                {canEdit ? (
                                  <button
                                    type="button"
                                    disabled={deleteTime.isPending}
                                    onClick={() => deleteTime.mutate(t._id)}
                                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                                    title="Delete time entry"
                                  >
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    {!timeEntries.length && !timeQ.isLoading ? (
                      <div className="px-3 py-4 text-sm text-[color:var(--color-text-muted)]">No time entries yet.</div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[color:var(--color-border)] pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={save.isPending || !title.trim()}
                  onClick={() => save.mutate()}
                  className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                >
                  {save.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>

              <div className="rounded-2xl border border-[color:var(--color-border)]">
                <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
                  <div className="text-sm font-semibold">Comments</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">{commentsQ.isFetching ? 'Refreshing…' : `${comments.length}`}</div>
                </div>
                <div className="divide-y divide-[color:var(--color-border)]">
                  {comments.map((c) => (
                    <div key={c._id} className="px-4 py-3">
                      <div className="text-xs text-[color:var(--color-text-muted)]">{new Date(c.createdAt).toLocaleString()}</div>
                      <div className="mt-1 text-sm whitespace-pre-wrap">{c.body}</div>
                    </div>
                  ))}
                  {!comments.length && !commentsQ.isLoading ? (
                    <div className="px-4 py-6 text-sm text-[color:var(--color-text-muted)]">No comments yet.</div>
                  ) : null}
                </div>
                <div className="border-t border-[color:var(--color-border)] p-3">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                    placeholder="Add a comment… (Tip: use @name or @email to mention a teammate)"
                  />
                  <div className="mt-2 flex items-center justify-end">
                    <button
                      type="button"
                      disabled={addComment.isPending || !newComment.trim()}
                      onClick={() => addComment.mutate()}
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                    >
                      {addComment.isPending ? 'Posting…' : 'Post comment'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

