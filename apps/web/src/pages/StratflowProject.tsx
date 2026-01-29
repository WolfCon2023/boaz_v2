import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { DndContext, type DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'
import { CRMNav } from '@/components/CRMNav'
import { Activity, BarChart3, Bell, CalendarDays, ListChecks, Plus, Presentation, Star, Trello, Zap } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { StratflowIssueDrawer, type StratflowIssueType, type StratflowPriority } from '@/components/StratflowIssueDrawer'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { KBHelpButton } from '@/components/KBHelpButton'

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
  wipLimit?: number | null
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
  phase?: string | null
  targetStartDate?: string | null
  targetEndDate?: string | null
  links?: IssueLink[]
  labels?: string[]
  components?: string[]
  order: number
  assigneeId?: string | null
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
  capacityPoints?: number | null
  state: 'planned' | 'active' | 'closed'
}

type Project = {
  _id: string
  name: string
  key: string
  type: 'SCRUM' | 'KANBAN' | 'TRADITIONAL' | 'HYBRID'
  status: 'Active' | 'On Hold' | 'Completed' | 'Archived'
}

type ViewMode = 'board' | 'list' | 'sprint' | 'timeline' | 'reports' | 'activity' | 'automation'

type UserInfo = {
  id: string
  email: string
  name?: string
}

type ProjectMember = { id: string; email: string; name: string }
type ProjectMembersResponse = { data: { ownerId?: string; teamIds?: string[]; users: ProjectMember[] } }

type WatchesMeResponse = { data: { projectId: string; project: boolean; issueIds: string[] } }

type NotificationItem = {
  _id: string
  projectId: string
  userId: string
  kind: string
  actorId?: string | null
  issueId?: string | null
  sprintId?: string | null
  title: string
  body?: string | null
  createdAt?: string | null
  readAt?: string | null
  meta?: any
}
type NotificationsResponse = { data: { projectId: string; items: NotificationItem[] } }

type AutomationRule = {
  _id: string
  projectId: string
  name: string
  enabled: boolean
  trigger: { kind: 'issue_moved' | 'issue_link_added' | 'issue_link_removed' | 'sprint_closed'; toStatusKey?: string | null; linkType?: string | null }
  conditions?: { issueType?: string | null; hasLabel?: string | null; notHasLabel?: string | null; isBlocked?: boolean | null } | null
  actions: { addLabels?: string[]; removeLabels?: string[]; moveOpenIssuesToBacklog?: boolean }
  createdAt?: string | null
  updatedAt?: string | null
}
type AutomationRulesResponse = { data: { projectId: string; items: AutomationRule[] } }

type IssueLinkType = 'blocks' | 'blocked_by' | 'relates_to'
type IssueLink = { type: IssueLinkType; issueId: string }

type ActivityItem = {
  _id: string
  projectId: string
  actorId: string
  kind: string
  issueId?: string | null
  sprintId?: string | null
  meta?: any
  createdAt?: string | null
}

type EpicRollup = {
  epicId: string
  epicTitle: string
  phase?: string | null
  targetStartDate?: string | null
  targetEndDate?: string | null
  totalIssues: number
  doneIssues: number
  totalPoints: number
  donePoints: number
  blockedCount: number
}

type TimeRollups = {
  projectId: string
  from?: string | null
  to?: string | null
  totals: {
    totalMinutes: number
    billableMinutes: number
    nonBillableMinutes: number
    entryCount: number
  }
  byUser: Array<{
    userId: string
    totalMinutes: number
    billableMinutes: number
    nonBillableMinutes: number
    entryCount: number
  }>
  byIssue: Array<{
    issueId: string | null
    totalMinutes: number
    billableMinutes: number
    nonBillableMinutes: number
    entryCount: number
  }>
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

function normView(v: string | null): ViewMode {
  const x = String(v || '').toLowerCase()
  if (x === 'list' || x === 'sprint' || x === 'timeline' || x === 'reports' || x === 'activity' || x === 'automation') return x as any
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

function initialsFromName(name: string) {
  const n = String(name || '').trim()
  if (!n) return '?'
  const parts = n.split(/\s+/).filter(Boolean)
  const letters = (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
  return letters.toUpperCase() || n.slice(0, 2).toUpperCase()
}

function isBlocked(issue: { links?: IssueLink[] } | null | undefined) {
  return Boolean(issue?.links?.some((l) => l.type === 'blocked_by'))
}

function downloadCsv(filename: string, rows: Array<Record<string, any>>) {
  const keySet = new Set<string>()
  for (const r of rows) {
    for (const k of Object.keys(r || {})) keySet.add(k)
  }
  const headers = Array.from(keySet)
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function IssueCard({
  issue,
  onOpen,
  assigneeLabel,
  assigneeInitials,
}: {
  issue: Issue
  onOpen: (id: string) => void
  assigneeLabel?: string | null
  assigneeInitials?: string | null
}) {
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
        <div className="flex items-center gap-2">
          {issue.links?.some((l) => l.type === 'blocked_by') ? (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">Blocked</span>
          ) : null}
          <div className="text-[10px] text-[color:var(--color-text-muted)]">{issue.type}</div>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
          {issue.priority}
        </span>
        {issue.assigneeId ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="h-6 w-6 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-muted)] text-[10px] font-semibold flex items-center justify-center">
                {assigneeInitials || 'U'}
              </div>
            </TooltipTrigger>
            <TooltipContent>{assigneeLabel || 'Assigned'}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-[10px] text-[color:var(--color-text-muted)]">Unassigned</span>
        )}
      </div>
    </div>
  )
}

function ColumnLane({
  column,
  issues,
  onAdd,
  onOpen,
  memberLabelForUserId,
}: {
  column: Column
  issues: Issue[]
  onAdd: (columnId: string, title: string, type: Exclude<StratflowIssueType, 'Bug'>) => void
  onOpen: (id: string) => void
  memberLabelForUserId?: (userId: string) => { label: string; initials: string } | null
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
              <IssueCard
                key={issue._id}
                issue={issue}
                onOpen={onOpen}
                assigneeLabel={issue.assigneeId ? memberLabelForUserId?.(issue.assigneeId)?.label : null}
                assigneeInitials={issue.assigneeId ? memberLabelForUserId?.(issue.assigneeId)?.initials : null}
              />
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
  const focusedIssueId = sp.get('issue') || null
  const [exportingTime, setExportingTime] = React.useState(false)
  const [assignedToMeOnly, setAssignedToMeOnly] = React.useState(false)
  const [blockedOnly, setBlockedOnly] = React.useState(false)
  const [listType, setListType] = React.useState<string>('all')
  const [listPreset, setListPreset] = React.useState<string>('') // id or built-in
  const [listEpicId, setListEpicId] = React.useState<string>('all')
  const [saveFilterOpen, setSaveFilterOpen] = React.useState(false)
  const [saveFilterName, setSaveFilterName] = React.useState('')
  const savedFiltersKey = `sfSavedFilters:${projectId || ''}`
  const [savedFilters, setSavedFilters] = React.useState<Array<{ id: string; name: string; state: any }>>([])

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(savedFiltersKey)
      const parsed = raw ? JSON.parse(raw) : []
      setSavedFilters(Array.isArray(parsed) ? parsed : [])
    } catch {
      setSavedFilters([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedFiltersKey])

  const openIssueFocus = React.useCallback(
    (issueId: string) => {
      const next = new URLSearchParams(sp)
      next.set('issue', issueId)
      setSp(next)
    },
    [sp, setSp],
  )

  const closeIssueFocus = React.useCallback(() => {
    const next = new URLSearchParams(sp)
    next.delete('issue')
    setSp(next)
  }, [sp, setSp])

  const meQ = useQuery<UserInfo>({
    queryKey: ['user', 'me'],
    queryFn: async () => (await http.get('/api/auth/me')).data,
    retry: false,
  })

  const membersQ = useQuery<ProjectMembersResponse>({
    queryKey: ['stratflow', 'project', projectId, 'members'],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/members`)).data,
    retry: false,
    enabled: Boolean(projectId),
  })
  const memberMap = React.useMemo(() => {
    const m = new Map<string, ProjectMember>()
    for (const u of membersQ.data?.data.users ?? []) m.set(u.id, u)
    return m
  }, [membersQ.data])
  const memberLabelForUserId = React.useCallback(
    (userId: string) => {
      const u = memberMap.get(userId)
      const label = u ? `${u.name || u.email}${u.email ? ` (${u.email})` : ''}` : userId
      const init = initialsFromName(u?.name || u?.email || userId)
      return { label, initials: init }
    },
    [memberMap],
  )
  const isOwner = Boolean(meQ.data?.id && membersQ.data?.data.ownerId && meQ.data?.id === membersQ.data?.data.ownerId)

  const watchesQ = useQuery<WatchesMeResponse>({
    queryKey: ['stratflow', 'project', projectId, 'watches', 'me'],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/watches/me`)).data,
    retry: false,
    enabled: Boolean(projectId),
  })
  const isWatchingProject = Boolean(watchesQ.data?.data.project)

  const [notifOpen, setNotifOpen] = React.useState(false)
  const notificationsQ = useQuery<NotificationsResponse>({
    queryKey: ['stratflow', 'project', projectId, 'notifications'],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/notifications`, { params: { limit: 50 } })).data,
    retry: false,
    enabled: Boolean(projectId),
    refetchInterval: 15000,
  })
  const notifications = notificationsQ.data?.data.items ?? []
  const unreadCount = notifications.reduce((n, x) => n + (x.readAt ? 0 : 1), 0)

  const toggleProjectWatch = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('No project selected.')
      return (await http.post(`/api/stratflow/projects/${projectId}/watch`, { enabled: !isWatchingProject })).data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stratflow', 'project', projectId, 'watches', 'me'] })
      toast.showToast(isWatchingProject ? 'Stopped watching project.' : 'Watching project.', 'success')
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || err?.message || 'Failed to update watch.', 'error'),
  })

  const markNotifRead = useMutation({
    mutationFn: async (notificationId: string) => (await http.post(`/api/stratflow/notifications/${notificationId}/read`)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stratflow', 'project', projectId, 'notifications'] })
    },
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('No project selected.')
      return (await http.post(`/api/stratflow/projects/${projectId}/notifications/mark-all-read`)).data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stratflow', 'project', projectId, 'notifications'] })
      toast.showToast('Marked all notifications as read.', 'success')
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || err?.message || 'Failed to mark all read.', 'error'),
  })

  const rulesQ = useQuery<AutomationRulesResponse>({
    queryKey: ['stratflow', 'project', projectId, 'automationRules'],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/automation-rules`)).data,
    retry: false,
    enabled: Boolean(projectId) && view === 'automation',
  })
  const rules = rulesQ.data?.data.items ?? []

  const [ruleModalOpen, setRuleModalOpen] = React.useState(false)
  const [ruleForm, setRuleForm] = React.useState({
    name: '',
    enabled: true,
    triggerKind: 'issue_moved' as AutomationRule['trigger']['kind'],
    toStatusKey: 'done' as string,
    linkType: 'blocked_by' as string,
    issueType: '' as string,
    isBlocked: '' as '' | 'true' | 'false',
    addLabels: '' as string,
    removeLabels: '' as string,
    moveOpenIssuesToBacklog: true,
  })

  const createRule = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('No project selected.')
      const payload: any = {
        name: ruleForm.name.trim(),
        enabled: Boolean(ruleForm.enabled),
        trigger: {
          kind: ruleForm.triggerKind,
          toStatusKey: ruleForm.triggerKind === 'issue_moved' ? (ruleForm.toStatusKey || null) : null,
          linkType: ruleForm.triggerKind.startsWith('issue_link_') ? (ruleForm.linkType || null) : null,
        },
        conditions: {
          issueType: ruleForm.issueType ? ruleForm.issueType : null,
          isBlocked: ruleForm.isBlocked === '' ? null : ruleForm.isBlocked === 'true',
        },
        actions: {
          addLabels: ruleForm.addLabels
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
          removeLabels: ruleForm.removeLabels
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
          moveOpenIssuesToBacklog: Boolean(ruleForm.moveOpenIssuesToBacklog),
        },
      }
      if (ruleForm.triggerKind === 'sprint_closed') {
        payload.actions = { moveOpenIssuesToBacklog: Boolean(ruleForm.moveOpenIssuesToBacklog) }
        payload.conditions = null
      }
      return (await http.post(`/api/stratflow/projects/${projectId}/automation-rules`, payload)).data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stratflow', 'project', projectId, 'automationRules'] })
      setRuleModalOpen(false)
      setRuleForm((p) => ({ ...p, name: '' }))
      toast.showToast('Automation rule created.', 'success')
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error
      if (code === 'owner_only') toast.showToast('Only the project owner can manage automation rules.', 'error')
      else toast.showToast(code || err?.message || 'Failed to create rule.', 'error')
    },
  })

  const toggleRule = useMutation({
    mutationFn: async (r: AutomationRule) => (await http.patch(`/api/stratflow/automation-rules/${r._id}`, { enabled: !r.enabled })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stratflow', 'project', projectId, 'automationRules'] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || err?.message || 'Failed to update rule.', 'error'),
  })

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => (await http.delete(`/api/stratflow/automation-rules/${ruleId}`)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stratflow', 'project', projectId, 'automationRules'] })
      toast.showToast('Rule deleted.', 'success')
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || err?.message || 'Failed to delete rule.', 'error'),
  })

  const createPresetRule = useMutation({
    mutationFn: async (payload: any) => {
      if (!projectId) throw new Error('No project selected.')
      return (await http.post(`/api/stratflow/projects/${projectId}/automation-rules`, payload)).data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stratflow', 'project', projectId, 'automationRules'] })
      toast.showToast('Automation rule created.', 'success')
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error
      if (code === 'owner_only') toast.showToast('Only the project owner can manage automation rules.', 'error')
      else toast.showToast(code || err?.message || 'Failed to create rule.', 'error')
    },
  })

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

  const visibleByColumn = React.useMemo(() => {
    const uid = meQ.data?.id || ''
    if (!assignedToMeOnly && !blockedOnly) return localByColumn
    const next: Record<string, Issue[]> = {}
    for (const k of Object.keys(localByColumn)) {
      let arr = localByColumn[k] || []
      if (assignedToMeOnly && uid) arr = arr.filter((i) => String(i.assigneeId || '') === uid)
      if (blockedOnly) arr = arr.filter((i) => isBlocked(i))
      next[k] = arr
    }
    return next
  }, [localByColumn, assignedToMeOnly, meQ.data?.id, blockedOnly])

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

  const [selectedSprintId, setSelectedSprintId] = React.useState<string>('')
  React.useEffect(() => {
    const next = activeSprint?._id || sprints[0]?._id || ''
    setSelectedSprintId((prev) => (prev ? prev : next))
  }, [activeSprint?._id, sprints])

  const selectedSprint = sprints.find((s) => s._id === selectedSprintId) ?? null

  const selectedSprintIssuesQ = useQuery<{ data: { items: Issue[] } }>({
    queryKey: ['stratflow', 'projectIssues', projectId, 'sprint', selectedSprintId],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/issues?sprintId=${encodeURIComponent(String(selectedSprintId || ''))}`)).data,
    retry: false,
    enabled: Boolean(projectId) && Boolean(selectedSprintId) && view === 'sprint',
  })

  const [sprintForm, setSprintForm] = React.useState<{
    name: string
    goal: string
    startDate: string
    endDate: string
    capacityPoints: string
  }>({ name: '', goal: '', startDate: '', endDate: '', capacityPoints: '' })

  React.useEffect(() => {
    if (!selectedSprint) return
    const sd = selectedSprint.startDate ? String(selectedSprint.startDate).slice(0, 10) : ''
    const ed = selectedSprint.endDate ? String(selectedSprint.endDate).slice(0, 10) : ''
    setSprintForm({
      name: selectedSprint.name || '',
      goal: String(selectedSprint.goal || ''),
      startDate: sd,
      endDate: ed,
      capacityPoints: selectedSprint.capacityPoints == null ? '' : String(selectedSprint.capacityPoints),
    })
  }, [selectedSprintId])

  const updateSprint = useMutation({
    mutationFn: async () => {
      if (!selectedSprintId) throw new Error('No sprint selected')
      const cap = sprintForm.capacityPoints.trim()
      const capNum = cap === '' ? null : Number(cap)
      if (cap !== '' && !Number.isFinite(capNum)) throw new Error('Capacity must be a number')
      const payload: any = {
        name: sprintForm.name.trim(),
        goal: sprintForm.goal.trim() || null,
        startDate: sprintForm.startDate ? new Date(sprintForm.startDate).toISOString() : null,
        endDate: sprintForm.endDate ? new Date(sprintForm.endDate).toISOString() : null,
        capacityPoints: capNum,
      }
      return (await http.patch(`/api/stratflow/sprints/${selectedSprintId}`, payload)).data
    },
    onSuccess: async () => {
      toast.showToast('Sprint updated.', 'success')
      await qc.invalidateQueries({ queryKey: ['stratflow', 'sprints', projectId] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'projectIssues', projectId, 'sprint', selectedSprintId] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || err?.message || 'Failed to update sprint.', 'error'),
  })

  const closeSprint = useMutation({
    mutationFn: async ({ sprintId, force }: { sprintId: string; force: boolean }) => {
      return (await http.post(`/api/stratflow/sprints/${sprintId}/close`, { force })).data
    },
    onSuccess: async () => {
      toast.showToast('Sprint closed.', 'success')
      await qc.invalidateQueries({ queryKey: ['stratflow', 'sprints', projectId] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'projectIssues', projectId] })
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error
      if (code === 'owner_only') toast.showToast('Only the project owner can close sprints.', 'error')
      else if (code === 'sprint_has_open_work') toast.showToast('Sprint has open work. Move remaining issues to Done or force-close.', 'error')
      else toast.showToast(code || err?.message || 'Failed to close sprint.', 'error')
    },
  })

  const activityQ = useQuery<{ data: { items: ActivityItem[] } }>({
    queryKey: ['stratflow', 'activity', projectId],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/activity?limit=200`)).data,
    retry: false,
    enabled: Boolean(projectId) && view === 'activity',
  })

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

  const epicsForRoadmapQ = useQuery<{ data: { items: Issue[] } }>({
    queryKey: ['stratflow', 'roadmap', projectId, 'epics'],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/issues?type=Epic`)).data,
    retry: false,
    enabled: Boolean(projectId) && (view === 'timeline' || view === 'list'),
  })

  const epicRollupsQ = useQuery<{ data: { items: EpicRollup[] } }>({
    queryKey: ['stratflow', 'roadmap', projectId, 'epicRollups'],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/epic-rollups`)).data,
    retry: false,
    enabled: Boolean(projectId) && view === 'timeline',
  })

  const timeRollupsQ = useQuery<{ data: TimeRollups }>({
    queryKey: ['stratflow', 'timeRollups', projectId],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/time-rollups`)).data,
    retry: false,
    enabled: Boolean(projectId) && view === 'reports',
  })

  const [roadmapZoom, setRoadmapZoom] = React.useState<'month' | 'quarter'>('month')

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
    onError: (err: any) => {
      const code = err?.response?.data?.error
      if (code === 'wip_limit_reached') return toast.showToast('WIP limit reached for that column.', 'error')
      return toast.showToast(code || 'Failed to create issue.', 'error')
    },
  })

  const moveIssue = useMutation({
    mutationFn: async (payload: { issueId: string; toColumnId: string; toIndex: number }) => {
      return (await http.patch(`/api/stratflow/issues/${payload.issueId}/move`, { toColumnId: payload.toColumnId, toIndex: payload.toIndex })).data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issues', boardId] })
    },
    onError: async (err: any) => {
      const code = err?.response?.data?.error
      if (code === 'wip_limit_reached') toast.showToast('WIP limit reached for that column.', 'error')
      else toast.showToast(code || 'Failed to move issue.', 'error')
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
    const uid = meQ.data?.id || ''
    const dueSoonCutoff = new Date(Date.now() + 14 * 24 * 3600 * 1000)
    return loadedIssues
      .filter((it) => (colId === 'all' ? true : it.columnId === colId))
      .filter((it) => (!assignedToMeOnly || !uid ? true : String(it.assigneeId || '') === uid))
      .filter((it) => (!blockedOnly ? true : isBlocked(it)))
      .filter((it) => (listType === 'all' ? true : String(it.type || '') === listType))
      .filter((it) => (listEpicId === 'all' ? true : String((it as any).epicId || '') === String(listEpicId)))
      .filter((it) => {
        if (listPreset !== 'due-soon') return true
        const d = parseIsoDate((it as any).targetEndDate)
        if (!d) return false
        return d.getTime() <= dueSoonCutoff.getTime()
      })
      .filter((it) => {
        if (listPreset !== 'hot-defects') return true
        const isDefect = String(it.type || '') === 'Defect'
        const pr = String(it.priority || '')
        return isDefect && (pr === 'Highest' || pr === 'High')
      })
      .filter((it) => {
        if (listPreset !== 'blocked') return true
        return isBlocked(it)
      })
      .filter((it) => (!q ? true : String(it.title || '').toLowerCase().includes(q)))
      .slice()
      .sort((a, b) => {
        const ca = columnNameById[a.columnId] || ''
        const cb = columnNameById[b.columnId] || ''
        if (ca !== cb) return ca.localeCompare(cb)
        return (a.order || 0) - (b.order || 0)
      })
  }, [loadedIssues, listQ, listColumnId, columnNameById, assignedToMeOnly, meQ.data?.id, listType, listPreset, blockedOnly, listEpicId])

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [boardId, view, listQ, listColumnId, assignedToMeOnly, listType, listPreset])

  const [bulkAction, setBulkAction] = React.useState<'setAssignee' | 'setSprint' | 'addLabels' | 'removeLabels' | 'addComponents' | 'removeComponents'>('setAssignee')
  const [bulkAssignee, setBulkAssignee] = React.useState<string>('')
  const [bulkSprint, setBulkSprint] = React.useState<string>('')
  const [bulkLabels, setBulkLabels] = React.useState<string>('')
  const [bulkComponents, setBulkComponents] = React.useState<string[]>([])

  const componentsQ = useQuery<{ data: { items: Array<{ _id: string; name: string }> } }>({
    queryKey: ['stratflow', 'project', projectId, 'components'],
    queryFn: async () => (await http.get(`/api/stratflow/projects/${projectId}/components`)).data,
    retry: false,
    enabled: Boolean(projectId),
  })
  const projectComponents = componentsQ.data?.data.items ?? []

  const bulkUpdate = useMutation({
    mutationFn: async () => {
      const issueIds = Array.from(selectedIds)
      const patch: any = {}
      if (bulkAction === 'setAssignee') patch.assigneeId = bulkAssignee ? bulkAssignee : null
      if (bulkAction === 'setSprint') patch.sprintId = bulkSprint ? bulkSprint : null
      if (bulkAction === 'addLabels') patch.addLabels = bulkLabels.split(',').map((x) => x.trim()).filter(Boolean)
      if (bulkAction === 'removeLabels') patch.removeLabels = bulkLabels.split(',').map((x) => x.trim()).filter(Boolean)
      if (bulkAction === 'addComponents') patch.addComponents = bulkComponents
      if (bulkAction === 'removeComponents') patch.removeComponents = bulkComponents
      return (await http.post('/api/stratflow/issues/bulk-update', { issueIds, patch })).data
    },
    onSuccess: async () => {
      toast.showToast('Bulk update applied.', 'success')
      setSelectedIds(new Set())
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issues', boardId] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'projectIssues', projectId] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Bulk update failed.', 'error'),
  })

  const [wipEdits, setWipEdits] = React.useState<Record<string, string>>({})
  React.useEffect(() => {
    if (view !== 'reports') return
    const next: Record<string, string> = {}
    for (const c of columns) {
      next[c._id] = c.wipLimit == null ? '' : String(c.wipLimit)
    }
    setWipEdits(next)
  }, [view, columns])

  const updateWipLimit = useMutation({
    mutationFn: async (payload: { columnId: string; wipLimit: number | null }) => {
      return (await http.patch(`/api/stratflow/columns/${payload.columnId}`, { wipLimit: payload.wipLimit })).data
    },
    onSuccess: async () => {
      toast.showToast('WIP limit saved.', 'success')
      await qc.invalidateQueries({ queryKey: ['stratflow', 'board', boardId] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to update WIP limit.', 'error'),
  })

  function setView(next: ViewMode) {
    const sp2 = new URLSearchParams(sp)
    sp2.set('view', next)
    setSp(sp2, { replace: true })
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <CRMNav />

        <div className="relative flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            className="relative inline-flex items-center gap-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
            {unreadCount > 0 ? (
              <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-[color:var(--color-primary-600)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </button>
          <KBHelpButton
            href={`/apps/crm/support/kb/${encodeURIComponent(view === 'reports' ? 'stratflow-reports' : view === 'sprint' ? 'stratflow-sprints' : 'stratflow-guide')}`}
            title="StratFlow Knowledge Base"
            ariaLabel="Open StratFlow Knowledge Base for this view"
          />

          {notifOpen ? (
            <>
              <div className="fixed inset-0 z-[2147483000]" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-12 z-[2147483001] w-[min(92vw,28rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] shadow-2xl">
                <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
                  <div className="text-sm font-semibold">Notifications</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={markAllRead.isPending || unreadCount === 0}
                      onClick={() => markAllRead.mutate()}
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                    >
                      Mark all read
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto divide-y divide-[color:var(--color-border)]">
                  {notifications.length ? (
                    notifications.slice(0, 50).map((n) => {
                      const unread = !n.readAt
                      const when = n.createdAt ? new Date(n.createdAt).toLocaleString() : ''
                      return (
                        <button
                          key={n._id}
                          type="button"
                          onClick={async () => {
                            if (unread) await markNotifRead.mutateAsync(n._id)
                            if (n.issueId) openIssueFocus(n.issueId)
                            setNotifOpen(false)
                          }}
                          className={[
                            'w-full text-left px-4 py-3 hover:bg-[color:var(--color-muted)]',
                            unread ? 'bg-[color:var(--color-muted)]' : '',
                          ].join(' ')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{n.title}</div>
                              {n.body ? <div className="mt-1 text-xs text-[color:var(--color-text-muted)] whitespace-pre-wrap">{n.body}</div> : null}
                              {when ? <div className="mt-2 text-[10px] text-[color:var(--color-text-muted)]">{when}</div> : null}
                            </div>
                            {unread ? (
                              <span className="mt-1 inline-flex h-2 w-2 shrink-0 rounded-full bg-[color:var(--color-primary-600)]" />
                            ) : null}
                          </div>
                        </button>
                      )
                    })
                  ) : (
                    <div className="px-4 py-6 text-sm text-[color:var(--color-text-muted)]">No notifications yet.</div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {saveFilterOpen ? (
          <div className="fixed inset-0 z-[2147483647] bg-black/40" onClick={() => setSaveFilterOpen(false)}>
            <div
              className="mx-auto mt-24 w-[min(92vw,28rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-semibold">Save filter</div>
              <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">Save the current List filters for quick reuse.</div>
              <div className="mt-4 space-y-2">
                <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Name</label>
                <input
                  value={saveFilterName}
                  onChange={(e) => setSaveFilterName(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                  placeholder="e.g., My triage"
                />
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                  onClick={() => setSaveFilterOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                  disabled={!saveFilterName.trim()}
                  onClick={() => {
                    const id = `f_${Date.now()}`
                    const state = { assignedToMeOnly, blockedOnly, listQ, listColumnId, listType, listEpicId }
                    const next = [...savedFilters, { id, name: saveFilterName.trim(), state }]
                    setSavedFilters(next)
                    try {
                      localStorage.setItem(savedFiltersKey, JSON.stringify(next))
                    } catch {
                      // ignore
                    }
                    setSaveFilterName('')
                    setSaveFilterOpen(false)
                    toast.showToast('Filter saved.', 'success')
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {ruleModalOpen ? (
          <div className="fixed inset-0 z-[2147483647] bg-black/40" onClick={() => setRuleModalOpen(false)}>
            <div
              className="mx-auto mt-20 w-[min(92vw,44rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">New automation rule</div>
                  <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                    Automation runs on the server and is logged in Activity when applied.
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                  onClick={() => setRuleModalOpen(false)}
                >
                  Close
                </button>
              </div>

              {!isOwner ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Only the <b>project owner</b> can create or edit automation rules.
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Name</label>
                  <input
                    value={ruleForm.name}
                    onChange={(e) => setRuleForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                    placeholder="e.g., Mark blocked issues"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Trigger</label>
                  <select
                    value={ruleForm.triggerKind}
                    onChange={(e) => setRuleForm((p) => ({ ...p, triggerKind: e.target.value as any }))}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
                  >
                    <option value="issue_moved">Issue moved</option>
                    <option value="issue_link_added">Dependency added</option>
                    <option value="issue_link_removed">Dependency removed</option>
                    <option value="sprint_closed">Sprint closed</option>
                  </select>
                </div>

                {ruleForm.triggerKind === 'issue_moved' ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">To status</label>
                    <select
                      value={ruleForm.toStatusKey}
                      onChange={(e) => setRuleForm((p) => ({ ...p, toStatusKey: e.target.value }))}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
                    >
                      <option value="backlog">Backlog</option>
                      <option value="todo">To do</option>
                      <option value="in_progress">In progress</option>
                      <option value="in_review">In review</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                ) : null}

                {ruleForm.triggerKind === 'issue_link_added' || ruleForm.triggerKind === 'issue_link_removed' ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Link type</label>
                    <select
                      value={ruleForm.linkType}
                      onChange={(e) => setRuleForm((p) => ({ ...p, linkType: e.target.value }))}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
                    >
                      <option value="blocked_by">Blocked by</option>
                      <option value="blocks">Blocks</option>
                      <option value="relates_to">Relates to</option>
                    </select>
                  </div>
                ) : null}

                {ruleForm.triggerKind !== 'sprint_closed' ? (
                  <>
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Issue type (optional)</label>
                      <select
                        value={ruleForm.issueType}
                        onChange={(e) => setRuleForm((p) => ({ ...p, issueType: e.target.value }))}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
                      >
                        <option value="">Any</option>
                        <option value="Epic">Epic</option>
                        <option value="Story">Story</option>
                        <option value="Task">Task</option>
                        <option value="Defect">Defect</option>
                        <option value="Spike">Spike</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Blocked? (optional)</label>
                      <select
                        value={ruleForm.isBlocked}
                        onChange={(e) => setRuleForm((p) => ({ ...p, isBlocked: e.target.value as any }))}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
                      >
                        <option value="">Any</option>
                        <option value="true">Only blocked</option>
                        <option value="false">Only not-blocked</option>
                      </select>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Add labels</label>
                      <input
                        value={ruleForm.addLabels}
                        onChange={(e) => setRuleForm((p) => ({ ...p, addLabels: e.target.value }))}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                        placeholder="e.g., blocked, needs-review"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Remove labels</label>
                      <input
                        value={ruleForm.removeLabels}
                        onChange={(e) => setRuleForm((p) => ({ ...p, removeLabels: e.target.value }))}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                        placeholder="e.g., blocked"
                      />
                    </div>
                  </>
                ) : (
                  <div className="sm:col-span-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ruleForm.moveOpenIssuesToBacklog}
                        onChange={(e) => setRuleForm((p) => ({ ...p, moveOpenIssuesToBacklog: e.target.checked }))}
                      />
                      Move open sprint issues back to backlog when sprint closes
                    </label>
                    <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                      This runs after the sprint is closed. It only moves issues that are not Done.
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                  onClick={() => setRuleModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!isOwner || createRule.isPending || !ruleForm.name.trim()}
                  className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                  onClick={() => createRule.mutate()}
                >
                  {createRule.isPending ? 'Creating…' : 'Create rule'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

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
          <button
            type="button"
            disabled={toggleProjectWatch.isPending || !projectId}
            onClick={() => toggleProjectWatch.mutate()}
            className={[
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
              isWatchingProject ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]' : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]',
            ].join(' ')}
            title={isWatchingProject ? 'You will receive notifications for updates in this project.' : 'Watch this project to receive notifications.'}
          >
            <Star className="h-4 w-4" />
            {isWatchingProject ? 'Watching' : 'Watch project'}
          </button>
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
            onClick={() => setView('automation')}
            className={[
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
              view === 'automation'
                ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]'
                : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]',
            ].join(' ')}
          >
            <Zap className="h-4 w-4" />
            Automation
          </button>
          <button
            type="button"
            onClick={() => setView('activity')}
            className={[
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm',
              view === 'activity'
                ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]'
                : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]',
            ].join(' ')}
          >
            <Activity className="h-4 w-4" />
            Activity
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
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)] select-none">
            <input
              type="checkbox"
              checked={assignedToMeOnly}
              onChange={(e) => setAssignedToMeOnly(e.target.checked)}
              className="h-4 w-4 rounded border-[color:var(--color-border)] text-[color:var(--color-primary-600)] focus:ring-[color:var(--color-primary-600)]"
              disabled={!meQ.data?.id}
            />
            Assigned to me
          </label>
          <label className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)] select-none">
            <input
              type="checkbox"
              checked={blockedOnly}
              onChange={(e) => setBlockedOnly(e.target.checked)}
              className="h-4 w-4 rounded border-[color:var(--color-border)] text-amber-600 focus:ring-amber-600"
            />
            Blocked
          </label>
          <div className="text-xs text-[color:var(--color-text-muted)]">{issuesQ.isFetching || boardQ.isFetching ? 'Syncing…' : 'Synced'}</div>
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
                          issues={visibleByColumn[col._id] ?? []}
                          onAdd={onAdd}
                          onOpen={(id) => openIssueFocus(id)}
                          memberLabelForUserId={memberLabelForUserId}
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
                  <select
                    value={listPreset || ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setListPreset(v)
                      if (v === '') return
                      if (v === 'my-work') {
                        setAssignedToMeOnly(true)
                        setBlockedOnly(false)
                        setListEpicId('all')
                      } else if (v === 'hot-defects') {
                        setListType('Defect')
                        setBlockedOnly(false)
                        setListEpicId('all')
                      } else if (v === 'due-soon') {
                        // uses targetEndDate window filter
                        setBlockedOnly(false)
                        setListEpicId('all')
                      } else if (v === 'blocked') {
                        setBlockedOnly(true)
                      } else {
                        const found = savedFilters.find((x) => x.id === v)
                        if (found?.state) {
                          setAssignedToMeOnly(Boolean(found.state.assignedToMeOnly))
                          setListQ(String(found.state.listQ || ''))
                          setListColumnId(String(found.state.listColumnId || 'all'))
                          setListType(String(found.state.listType || 'all'))
                          setBlockedOnly(Boolean(found.state.blockedOnly))
                          setListEpicId(String(found.state.listEpicId || 'all'))
                        }
                      }
                    }}
                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                    title="Saved filters"
                  >
                    <option value="">Saved filters</option>
                    <option value="my-work">My work</option>
                    <option value="hot-defects">Hot defects</option>
                    <option value="due-soon">Due soon</option>
                    <option value="blocked">Blocked</option>
                    {savedFilters.length ? (
                      <optgroup label="Custom">
                        {savedFilters.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                  <button
                    type="button"
                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                    onClick={() => setSaveFilterOpen(true)}
                    title="Save current filters"
                  >
                    Save filter
                  </button>
                  <input
                    value={listQ}
                    onChange={(e) => setListQ(e.target.value)}
                    placeholder="Search title…"
                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                  />
                  <select
                    value={listType}
                    onChange={(e) => setListType(e.target.value)}
                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                    title="Type"
                  >
                    <option value="all">All types</option>
                    <option value="Story">Story</option>
                    <option value="Task">Task</option>
                    <option value="Defect">Defect</option>
                    <option value="Epic">Epic</option>
                    <option value="Spike">Spike</option>
                  </select>
                  <select
                    value={listEpicId}
                    onChange={(e) => setListEpicId(e.target.value)}
                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                    title="Epic"
                    disabled={!(epicsForRoadmapQ.data?.data.items ?? []).length}
                  >
                    <option value="all">All epics</option>
                    {(epicsForRoadmapQ.data?.data.items ?? [])
                      .filter((e) => String(e.type || '') === 'Epic')
                      .slice()
                      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
                      .map((e) => (
                        <option key={e._id} value={e._id}>
                          {e.title}
                        </option>
                      ))}
                  </select>
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
                  <button
                    type="button"
                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                    onClick={() => {
                      downloadCsv(
                        `stratflow-issues-${project?.key || projectId || 'project'}.csv`,
                        filteredListIssues.map((it) => ({
                          id: it._id,
                          title: it.title,
                          type: it.type,
                          priority: it.priority,
                          statusKey: it.statusKey || '',
                          assignee: it.assigneeId ? memberLabelForUserId(it.assigneeId).label : '',
                          sprintId: it.sprintId || '',
                          epicId: it.epicId || '',
                          phase: (it as any).phase || '',
                          targetStartDate: (it as any).targetStartDate || '',
                          targetEndDate: (it as any).targetEndDate || '',
                          labels: (it.labels || []).join('|'),
                          components: (it.components || []).join('|'),
                          column: columnNameById[it.columnId] || '',
                          createdAt: it.createdAt || '',
                          updatedAt: it.updatedAt || '',
                        })),
                      )
                    }}
                    title="Export the current list to CSV"
                  >
                    Export CSV
                  </button>
                </div>
              </div>

              {selectedIds.size > 0 ? (
                <div className="border-b border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm">
                      <span className="font-semibold">{selectedIds.size}</span> selected
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={bulkAction}
                        onChange={(e) => setBulkAction(e.target.value as any)}
                        className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                      >
                        <option value="setAssignee">Set assignee</option>
                        <option value="setSprint">Set sprint</option>
                        <option value="addLabels">Add labels</option>
                        <option value="removeLabels">Remove labels</option>
                        <option value="addComponents">Add components</option>
                        <option value="removeComponents">Remove components</option>
                      </select>

                      {bulkAction === 'setAssignee' ? (
                        <select
                          value={bulkAssignee}
                          onChange={(e) => setBulkAssignee(e.target.value)}
                          className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                        >
                          <option value="">Unassigned</option>
                          {(membersQ.data?.data.users ?? []).map((m) => (
                            <option key={m.id} value={m.id}>
                              {(m.name || m.email) + (m.email ? ` (${m.email})` : '')}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      {bulkAction === 'setSprint' ? (
                        <select
                          value={bulkSprint}
                          onChange={(e) => setBulkSprint(e.target.value)}
                          className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                        >
                          <option value="">No sprint</option>
                          {sprints.map((s) => (
                            <option key={s._id} value={s._id}>
                              {s.state === 'active' ? 'Active: ' : ''}{s.name}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      {bulkAction === 'addLabels' || bulkAction === 'removeLabels' ? (
                        <input
                          value={bulkLabels}
                          onChange={(e) => setBulkLabels(e.target.value)}
                          className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                          placeholder="labels, comma-separated"
                        />
                      ) : null}

                      {bulkAction === 'addComponents' || bulkAction === 'removeComponents' ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {projectComponents.map((c) => {
                            const active = bulkComponents.includes(c.name)
                            return (
                              <button
                                key={c._id}
                                type="button"
                                onClick={() => setBulkComponents((p) => (p.includes(c.name) ? p.filter((x) => x !== c.name) : [...p, c.name]))}
                                className={[
                                  'rounded-full border px-2 py-1 text-xs',
                                  active
                                    ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-muted)]'
                                    : 'border-[color:var(--color-border)] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)]',
                                ].join(' ')}
                              >
                                {c.name}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        disabled={bulkUpdate.isPending}
                        onClick={() => bulkUpdate.mutate()}
                        className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                      >
                        {bulkUpdate.isPending ? 'Applying…' : 'Apply'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-[color:var(--color-text-muted)]">
                    <tr className="border-b border-[color:var(--color-border)]">
                      <th className="px-4 py-2 text-left font-medium">
                        <input
                          type="checkbox"
                          checked={filteredListIssues.length > 0 && filteredListIssues.every((i) => selectedIds.has(i._id))}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds(new Set(filteredListIssues.map((i) => i._id)))
                            else setSelectedIds(new Set())
                          }}
                          className="h-4 w-4 rounded border-[color:var(--color-border)] text-[color:var(--color-primary-600)] focus:ring-[color:var(--color-primary-600)]"
                          aria-label="Select all"
                        />
                      </th>
                      <th className="px-4 py-2 text-left font-medium">Title</th>
                      <th className="px-4 py-2 text-left font-medium">Type</th>
                      <th className="px-4 py-2 text-left font-medium">Priority</th>
                      <th className="px-4 py-2 text-left font-medium">Assignee</th>
                      <th className="px-4 py-2 text-left font-medium">Column</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-border)]">
                    {filteredListIssues.map((it) => (
                      <tr
                        key={it._id}
                        className="hover:bg-[color:var(--color-muted)]"
                        onClick={() => openIssueFocus(it._id)}
                        title="Open Issue Focus"
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(it._id)}
                            onChange={(e) => {
                              const next = new Set(selectedIds)
                              if (e.target.checked) next.add(it._id)
                              else next.delete(it._id)
                              setSelectedIds(next)
                            }}
                            className="h-4 w-4 rounded border-[color:var(--color-border)] text-[color:var(--color-primary-600)] focus:ring-[color:var(--color-primary-600)]"
                            aria-label="Select row"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{it.title}</div>
                        </td>
                        <td className="px-4 py-3 text-[color:var(--color-text-muted)]">{it.type}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                            {it.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[color:var(--color-text-muted)]">
                          {it.assigneeId ? memberLabelForUserId(it.assigneeId).label : '—'}
                        </td>
                        <td className="px-4 py-3 text-[color:var(--color-text-muted)]">{columnNameById[it.columnId] || '—'}</td>
                      </tr>
                    ))}
                    {!filteredListIssues.length && !issuesQ.isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-[color:var(--color-text-muted)]">
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
                <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] lg:col-span-2">
                  <div className="flex flex-col gap-3 border-b border-[color:var(--color-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold">Sprint details</div>
                      <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                        Edit dates, goal, and capacity. Only project members can edit.
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={selectedSprintId || ''}
                        onChange={(e) => setSelectedSprintId(e.target.value)}
                        className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                      >
                        {sprints.map((s) => (
                          <option key={s._id} value={s._id}>
                            {s.state === 'active' ? 'Active: ' : ''}{s.name}
                          </option>
                        ))}
                      </select>
                      {selectedSprint && selectedSprint.state !== 'closed' ? (
                        <button
                          type="button"
                          className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                          disabled={closeSprint.isPending || !selectedSprintId}
                          onClick={() => closeSprint.mutate({ sprintId: selectedSprintId, force: false })}
                          title="Close sprint (owner only)"
                        >
                          {closeSprint.isPending ? 'Closing…' : 'Close sprint'}
                        </button>
                      ) : null}
                      {selectedSprint && selectedSprint.state !== 'closed' ? (
                        <button
                          type="button"
                          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                          disabled={closeSprint.isPending || !selectedSprintId}
                          onClick={() => closeSprint.mutate({ sprintId: selectedSprintId, force: true })}
                          title="Force close sprint even with open work (owner only)"
                        >
                          Force close
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                        disabled={updateSprint.isPending || !selectedSprintId || !sprintForm.name.trim()}
                        onClick={() => updateSprint.mutate()}
                      >
                        {updateSprint.isPending ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>

                  {selectedSprint ? (
                    <div className="grid gap-4 p-4 lg:grid-cols-3">
                      <div className="lg:col-span-2 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <div className="text-xs font-medium text-[color:var(--color-text-muted)]">Name</div>
                            <input
                              value={sprintForm.name}
                              onChange={(e) => setSprintForm((p) => ({ ...p, name: e.target.value }))}
                              className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                              placeholder="Sprint name"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <div className="text-xs font-medium text-[color:var(--color-text-muted)]">Capacity (points)</div>
                            <input
                              value={sprintForm.capacityPoints}
                              onChange={(e) => setSprintForm((p) => ({ ...p, capacityPoints: e.target.value }))}
                              className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                              placeholder="e.g., 30"
                              inputMode="numeric"
                            />
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <div className="text-xs font-medium text-[color:var(--color-text-muted)]">Start date</div>
                            <input
                              type="date"
                              value={sprintForm.startDate}
                              onChange={(e) => setSprintForm((p) => ({ ...p, startDate: e.target.value }))}
                              className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <div className="text-xs font-medium text-[color:var(--color-text-muted)]">End date</div>
                            <input
                              type="date"
                              value={sprintForm.endDate}
                              onChange={(e) => setSprintForm((p) => ({ ...p, endDate: e.target.value }))}
                              className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-[color:var(--color-text-muted)]">Goal</div>
                          <textarea
                            value={sprintForm.goal}
                            onChange={(e) => setSprintForm((p) => ({ ...p, goal: e.target.value }))}
                            className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-sm min-h-[6rem]"
                            placeholder="Sprint goal (optional)"
                          />
                        </div>
                      </div>

                      {(() => {
                        const issues = (selectedSprintIssuesQ.data?.data.items ?? [])
                          .filter((i) => i.type !== 'Epic')
                          .filter((i) => (!blockedOnly ? true : isBlocked(i)))
                          .filter((i) => (!assignedToMeOnly || !meQ.data?.id ? true : String(i.assigneeId || '') === meQ.data.id))
                        const planned = issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0)
                        const done = issues.filter((i) => i.statusKey === 'done').reduce((sum, i) => sum + (i.storyPoints || 0), 0)
                        const cap = selectedSprint.capacityPoints ?? null
                        const pct = planned > 0 ? Math.round((done / planned) * 100) : 0
                        const capPct = cap && cap > 0 ? Math.round((planned / cap) * 100) : null
                        return (
                          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                            <div className="text-sm font-semibold">Sprint progress</div>
                            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                              {selectedSprintIssuesQ.isFetching ? 'Loading…' : `${issues.length} issue(s) (excluding Epics)`}
                            </div>
                            <div className="mt-4 space-y-3">
                              <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] h-3 overflow-hidden">
                                <div className="h-full bg-[color:var(--color-primary-600)]" style={{ width: `${pct}%` }} />
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <div className="text-[color:var(--color-text-muted)]">Done</div>
                                <div className="font-medium tabular-nums">{done} / {planned} pts</div>
                              </div>
                              {cap != null ? (
                                <div className="flex items-center justify-between text-sm">
                                  <div className="text-[color:var(--color-text-muted)]">Capacity</div>
                                  <div className="font-medium tabular-nums">
                                    {planned} / {cap} pts {capPct != null ? `(${capPct}%)` : ''}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-xs text-[color:var(--color-text-muted)]">Set capacity to track utilization.</div>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <div className="p-4 text-sm text-[color:var(--color-text-muted)]">No sprints yet. Create one to edit details.</div>
                  )}
                </div>

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
                      .filter((i) => (!assignedToMeOnly || !meQ.data?.id ? true : String(i.assigneeId || '') === meQ.data.id))
                      .filter((i) => (!blockedOnly ? true : isBlocked(i)))
                      .slice(0, 250)
                      .map((i) => (
                        <div key={i._id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <button type="button" className="text-left flex-1" onClick={() => openIssueFocus(i._id)}>
                            <div className="text-sm font-medium">{i.title}</div>
                            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                              {i.type}
                              {i.assigneeId ? ` · ${memberLabelForUserId(i.assigneeId).label}` : ''}
                            </div>
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
                      .filter((i) => (!assignedToMeOnly || !meQ.data?.id ? true : String(i.assigneeId || '') === meQ.data.id))
                      .filter((i) => (!blockedOnly ? true : isBlocked(i)))
                      .slice(0, 250)
                      .map((i) => (
                        <div key={i._id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <button type="button" className="text-left flex-1" onClick={() => openIssueFocus(i._id)}>
                            <div className="text-sm font-medium">{i.title}</div>
                            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                              {i.type}
                              {i.assigneeId ? ` · ${memberLabelForUserId(i.assigneeId).label}` : ''}
                            </div>
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
                      Epic Roadmap · Sprint Timeline · Milestones (when available)
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-[color:var(--color-text-muted)]">Roadmap zoom</div>
                    <div className="inline-flex rounded-xl border border-[color:var(--color-border)] overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setRoadmapZoom('month')}
                        className={[
                          'px-3 py-2 text-xs',
                          roadmapZoom === 'month' ? 'bg-[color:var(--color-muted)]' : 'hover:bg-[color:var(--color-muted)]',
                        ].join(' ')}
                      >
                        Month
                      </button>
                      <button
                        type="button"
                        onClick={() => setRoadmapZoom('quarter')}
                        className={[
                          'px-3 py-2 text-xs border-l border-[color:var(--color-border)]',
                          roadmapZoom === 'quarter' ? 'bg-[color:var(--color-muted)]' : 'hover:bg-[color:var(--color-muted)]',
                        ].join(' ')}
                      >
                        Quarter
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {(() => {
                const epics = (epicsForRoadmapQ.data?.data.items ?? []).filter((e) => e.type === 'Epic')
                const rollups = epicRollupsQ.data?.data.items ?? []
                const rollupByEpicId = new Map<string, EpicRollup>()
                rollups.forEach((r) => rollupByEpicId.set(r.epicId, r))
                const withDates = epics
                  .map((e) => {
                    const start = parseIsoDate(e.targetStartDate) ?? parseIsoDate(e.targetEndDate)
                    const end = parseIsoDate(e.targetEndDate) ?? parseIsoDate(e.targetStartDate)
                    return { e, start, end }
                  })
                  .filter((x) => x.start && x.end) as Array<{ e: Issue; start: Date; end: Date }>
                if (!withDates.length) return null

                const minStart = withDates.reduce((m, x) => (x.start.getTime() < m.getTime() ? x.start : m), withDates[0].start)
                const maxEnd = withDates.reduce((m, x) => (x.end.getTime() > m.getTime() ? x.end : m), withDates[0].end)
                const spanDays = Math.max(1, daysBetween(minStart, maxEnd))

                const segs: Array<{ label: string; start: Date }> = []
                const d0 = new Date(minStart.getFullYear(), minStart.getMonth(), 1)
                const d1 = new Date(maxEnd.getFullYear(), maxEnd.getMonth(), 1)
                if (roadmapZoom === 'month') {
                  const cur = new Date(d0)
                  while (cur.getTime() <= d1.getTime()) {
                    const label = cur.toLocaleString(undefined, { month: 'short', year: 'numeric' })
                    segs.push({ label, start: new Date(cur) })
                    cur.setMonth(cur.getMonth() + 1)
                  }
                } else {
                  const qStart = (dt: Date) => new Date(dt.getFullYear(), Math.floor(dt.getMonth() / 3) * 3, 1)
                  const cur = qStart(d0)
                  const endQ = qStart(d1)
                  while (cur.getTime() <= endQ.getTime()) {
                    const q = Math.floor(cur.getMonth() / 3) + 1
                    segs.push({ label: `Q${q} ${cur.getFullYear()}`, start: new Date(cur) })
                    cur.setMonth(cur.getMonth() + 3)
                  }
                }
                const segW = roadmapZoom === 'month' ? 120 : 200
                const totalW = Math.max(1, segs.length * segW)

                const byPhase: Record<string, Array<{ e: Issue; start: Date; end: Date }>> = {}
                for (const x of withDates) {
                  const key = (x.e.phase || '').trim() || 'Unphased'
                  if (!byPhase[key]) byPhase[key] = []
                  byPhase[key].push(x)
                }
                const phaseKeys = Object.keys(byPhase).sort((a, b) => a.localeCompare(b))
                for (const k of phaseKeys) {
                  byPhase[k].sort((a, b) => a.start.getTime() - b.start.getTime())
                }

                return (
                  <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
                    <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold">Epic roadmap</div>
                        <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                          {withDates.length} epic(s) with target dates · grouped by phase
                        </div>
                      </div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {epicsForRoadmapQ.isFetching || epicRollupsQ.isFetching ? 'Loading…' : 'Ready'}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <div className="min-w-max p-4" style={{ width: totalW + 220 }}>
                        <div className="grid gap-2">
                          <div className="flex items-center gap-3">
                            <div className="w-52 text-xs text-[color:var(--color-text-muted)]"> </div>
                            <div className="flex" style={{ width: totalW }}>
                              {segs.map((s, idx) => (
                                <div
                                  key={idx}
                                  className="border-l border-[color:var(--color-border)] px-2 text-[10px] text-[color:var(--color-text-muted)]"
                                  style={{ width: segW }}
                                >
                                  {s.label}
                                </div>
                              ))}
                            </div>
                          </div>

                          {phaseKeys.map((phase) => (
                            <div key={phase} className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
                              <div className="border-b border-[color:var(--color-border)] px-3 py-2 text-xs font-semibold">
                                {phase}
                              </div>
                              <div className="p-3 space-y-2">
                                {byPhase[phase].map(({ e, start, end }) => {
                                  const left = (daysBetween(minStart, start) / spanDays) * totalW
                                  const width = Math.max(10, (daysBetween(start, end) / spanDays) * totalW)
                                  const r = rollupByEpicId.get(e._id) || null
                                  const pct = r && r.totalPoints > 0 ? Math.round((r.donePoints / r.totalPoints) * 100) : r && r.totalIssues > 0 ? Math.round((r.doneIssues / r.totalIssues) * 100) : 0
                                  return (
                                    <div key={e._id} className="flex items-center gap-3">
                                      <button
                                        type="button"
                                        className="w-52 text-left"
                                        onClick={() => openIssueFocus(e._id)}
                                        title="Open Epic"
                                      >
                                        <div className="text-sm font-medium truncate">{e.title}</div>
                                        <div className="text-[10px] text-[color:var(--color-text-muted)]">
                                          {start.toLocaleDateString()} → {end.toLocaleDateString()}
                                        </div>
                                        {r ? (
                                          <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">
                                            {pct}% · {r.donePoints}/{r.totalPoints} pts · {r.blockedCount ? `${r.blockedCount} blocked` : 'no blocks'}
                                          </div>
                                        ) : null}
                                        {r?.blockedCount ? (
                                          <button
                                            type="button"
                                            className="mt-1 text-[10px] text-amber-700 hover:underline"
                                            onClick={(ev) => {
                                              ev.preventDefault()
                                              ev.stopPropagation()
                                              setView('list')
                                              setListPreset('blocked')
                                              setBlockedOnly(true)
                                              setAssignedToMeOnly(false)
                                              setListQ('')
                                              setListColumnId('all')
                                              setListType('all')
                                              setListEpicId(e._id)
                                            }}
                                            title="Show blocked issues for this epic"
                                          >
                                            View blocked items →
                                          </button>
                                        ) : null}
                                      </button>
                                      <div className="relative h-8 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] overflow-hidden" style={{ width: totalW }}>
                                        <div
                                          className="absolute top-1/2 h-4 -translate-y-1/2 rounded-lg bg-[color:var(--color-primary-600)]"
                                          style={{ left, width }}
                                          title={e.title}
                                        />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}

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
                                    onClick={() => openIssueFocus(i._id)}
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
                const blocked = loadedIssues.filter((i) => isBlocked(i))
                const blockedCount = blocked.length

                const now = new Date()
                const openAges = loadedIssues
                  .filter((i) => i.statusKey !== 'done')
                  .map((i) => parseIsoDate(i.createdAt))
                  .filter(Boolean)
                  .map((d) => daysBetween(d as Date, now))
                const avgOpenAge = openAges.length ? Math.round((openAges.reduce((a, b) => a + b, 0) / openAges.length) * 10) / 10 : null

                const blockedAges = blocked
                  .map((i) => parseIsoDate(i.updatedAt) ?? parseIsoDate(i.createdAt))
                  .filter(Boolean)
                  .map((d) => daysBetween(d as Date, now))
                const oldestBlockedAge = blockedAges.length ? Math.round(Math.max(...blockedAges) * 10) / 10 : null

                const timeTotals = timeRollupsQ.data?.data?.totals ?? null
                const timeTotalHours = timeTotals ? Math.round(((timeTotals.totalMinutes || 0) / 60) * 10) / 10 : null
                const timeBillableHours = timeTotals ? Math.round(((timeTotals.billableMinutes || 0) / 60) * 10) / 10 : null
                const timeNonBillableHours = timeTotals ? Math.round(((timeTotals.nonBillableMinutes || 0) / 60) * 10) / 10 : null

                const doneWithDates = loadedIssues
                  .filter((i) => i.statusKey === 'done')
                  .map((i) => ({ created: parseIsoDate(i.createdAt), doneAt: parseIsoDate(i.updatedAt) }))
                  .filter((x) => x.created && x.doneAt) as Array<{ created: Date; doneAt: Date }>
                const cycleDays = doneWithDates.map((x) => Math.max(0, daysBetween(x.created, x.doneAt)))
                const avgCycle = cycleDays.length ? Math.round((cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length) * 10) / 10 : null
                const p50Cycle = cycleDays.length
                  ? (() => {
                      const s = cycleDays.slice().sort((a, b) => a - b)
                      return Math.round(s[Math.floor(s.length / 2)] * 10) / 10
                    })()
                  : null

                const doneIssuesWithUpdatedAt = loadedIssues
                  .filter((i) => i.statusKey === 'done')
                  .map((i) => parseIsoDate(i.updatedAt))
                  .filter(Boolean) as Date[]
                const throughput = (days: number) => {
                  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000)
                  return doneIssuesWithUpdatedAt.filter((d) => d.getTime() >= cutoff.getTime()).length
                }

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
                          <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                            Reports v2: real counts + throughput + approximate cycle time + WIP limits.
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                            onClick={() => {
                              downloadCsv(
                                `stratflow-reports-${project?.key || projectId || 'project'}.csv`,
                                [
                                  { metric: 'total', value: total },
                                  { metric: 'done', value: done },
                                  { metric: 'pctDone', value: pctDone },
                                  { metric: 'wip', value: wip },
                                  { metric: 'backlog', value: backlog },
                                  { metric: 'avgOpenAgeDays', value: avgOpenAge ?? '' },
                                  { metric: 'throughput7d', value: throughput(7) },
                                  { metric: 'throughput14d', value: throughput(14) },
                                  { metric: 'throughput30d', value: throughput(30) },
                                  { metric: 'avgCycleDaysApprox', value: avgCycle ?? '' },
                                  { metric: 'medianCycleDaysApprox', value: p50Cycle ?? '' },
                                  { metric: 'blockedCount', value: blockedCount },
                                  { metric: 'oldestBlockedAgeDays', value: oldestBlockedAge ?? '' },
                                  { metric: 'timeTotalHours', value: timeTotalHours ?? '' },
                                  { metric: 'timeBillableHours', value: timeBillableHours ?? '' },
                                  { metric: 'timeNonBillableHours', value: timeNonBillableHours ?? '' },
                                  { metric: 'timeEntryCount', value: timeTotals?.entryCount ?? '' },
                                ],
                              )
                            }}
                          >
                            Export CSV
                          </button>
                          <button
                            type="button"
                            disabled={exportingTime}
                            className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                            onClick={async () => {
                              try {
                                setExportingTime(true)
                                if (!projectId) throw new Error('No project selected.')
                                const resp = await http.get(`/api/stratflow/projects/${projectId}/time-entries`)
                                const items = resp?.data?.data?.items ?? []
                                downloadCsv(
                                  `stratflow-time-${project?.key || projectId || 'project'}.csv`,
                                  (items as any[]).map((t) => ({
                                    id: t._id,
                                    workDate: (t.workDate || '').slice(0, 10),
                                    hours: Math.round(((Number(t.minutes || 0) / 60) * 10)) / 10,
                                    minutes: Number(t.minutes || 0),
                                    billable: Boolean(t.billable),
                                    user: t.userName || t.userEmail || t.userId || '',
                                    issueType: t.issueType || '',
                                    issueTitle: t.issueTitle || '',
                                    issueId: t.issueId || '',
                                    note: t.note || '',
                                    createdAt: t.createdAt || '',
                                  })),
                                )
                                toast.showToast('Exported time CSV.', 'success')
                              } catch (err: any) {
                                toast.showToast(err?.response?.data?.error || err?.message || 'Failed to export time CSV.', 'error')
                              } finally {
                                setExportingTime(false)
                              }
                            }}
                            title="Export time entries to CSV"
                          >
                            {exportingTime ? 'Exporting…' : 'Export time CSV'}
                          </button>
                          <div className="text-xs text-[color:var(--color-text-muted)]">{issuesQ.isFetching ? 'Syncing…' : 'Live'}</div>
                        </div>
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
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                          <div className="text-xs text-amber-900">Blocked</div>
                          <div className="mt-1 text-2xl font-semibold text-amber-950">{blockedCount}</div>
                          <div className="mt-1 text-xs text-amber-900">
                            Oldest blocked: {oldestBlockedAge == null ? '—' : `${oldestBlockedAge}d`}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                          <div className="text-xs text-[color:var(--color-text-muted)]">Time logged</div>
                          <div className="mt-1 text-2xl font-semibold">{timeTotalHours == null ? '—' : `${timeTotalHours}h`}</div>
                          <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                            Entries: {timeTotals?.entryCount ?? (timeRollupsQ.isLoading ? '…' : '—')}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                          <div className="text-xs text-emerald-900">Billable time</div>
                          <div className="mt-1 text-2xl font-semibold text-emerald-950">{timeBillableHours == null ? '—' : `${timeBillableHours}h`}</div>
                          <div className="mt-1 text-xs text-emerald-900">
                            Non-billable: {timeNonBillableHours == null ? '—' : `${timeNonBillableHours}h`}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                          <div className="text-xs text-[color:var(--color-text-muted)]">Throughput</div>
                          <div className="mt-2 space-y-1 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-[color:var(--color-text-muted)]">Last 7d</span>
                              <span className="font-medium tabular-nums">{throughput(7)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[color:var(--color-text-muted)]">Last 14d</span>
                              <span className="font-medium tabular-nums">{throughput(14)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[color:var(--color-text-muted)]">Last 30d</span>
                              <span className="font-medium tabular-nums">{throughput(30)}</span>
                            </div>
                          </div>
                          <div className="mt-2 text-[10px] text-[color:var(--color-text-muted)]">Based on issues in Done with recent updates.</div>
                        </div>
                        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                          <div className="text-xs text-[color:var(--color-text-muted)]">Cycle time (approx)</div>
                          <div className="mt-1 text-2xl font-semibold">{avgCycle == null ? '—' : `${avgCycle}d`}</div>
                          <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                            Median: {p50Cycle == null ? '—' : `${p50Cycle}d`}
                          </div>
                          <div className="mt-2 text-[10px] text-[color:var(--color-text-muted)]">
                            Approximation: createdAt → updatedAt when status is Done.
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                          <div className="text-xs text-[color:var(--color-text-muted)]">Work health</div>
                          <div className="mt-2 text-sm text-[color:var(--color-text-muted)]">
                            {blockedCount > 0
                              ? `${blockedCount} blocked item(s) need attention.`
                              : wip > Math.max(10, backlog)
                              ? 'High WIP relative to backlog.'
                              : 'WIP looks reasonable.'}
                          </div>
                          <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">Next: true cycle time via status transition timestamps.</div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold">Time by person</div>
                            <div className="text-xs text-[color:var(--color-text-muted)]">{timeRollupsQ.isFetching ? 'Loading…' : 'Live'}</div>
                          </div>
                          <div className="mt-3 space-y-2">
                            {(timeRollupsQ.data?.data?.byUser ?? []).slice(0, 10).map((r) => {
                              const label = memberLabelForUserId(String(r.userId || '')).label
                              const h = Math.round(((Number(r.totalMinutes || 0) / 60) * 10)) / 10
                              const bh = Math.round(((Number(r.billableMinutes || 0) / 60) * 10)) / 10
                              return (
                                <div key={r.userId} className="flex items-center justify-between gap-3 text-sm">
                                  <div className="min-w-0 truncate text-[color:var(--color-text-muted)]">{label}</div>
                                  <div className="shrink-0 font-medium tabular-nums">
                                    {h}h <span className="text-[10px] text-[color:var(--color-text-muted)]">({bh}h billable)</span>
                                  </div>
                                </div>
                              )
                            })}
                            {!timeRollupsQ.isLoading && !(timeRollupsQ.data?.data?.byUser ?? []).length ? (
                              <div className="text-sm text-[color:var(--color-text-muted)]">No time entries yet.</div>
                            ) : null}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold">Top issues (time)</div>
                            <div className="text-xs text-[color:var(--color-text-muted)]">Top 10</div>
                          </div>
                          <div className="mt-3 space-y-2">
                            {(timeRollupsQ.data?.data?.byIssue ?? []).slice(0, 10).map((r, idx) => {
                              const iid = String(r.issueId || '')
                              const title = loadedIssues.find((i) => i._id === iid)?.title || iid || '—'
                              const h = Math.round(((Number(r.totalMinutes || 0) / 60) * 10)) / 10
                              return (
                                <div key={`${iid || 'null'}-${idx}`} className="flex items-center justify-between gap-3 text-sm">
                                  <div className="min-w-0 truncate text-[color:var(--color-text-muted)]">{title}</div>
                                  <div className="shrink-0 font-medium tabular-nums">{h}h</div>
                                </div>
                              )
                            })}
                            {!timeRollupsQ.isLoading && !(timeRollupsQ.data?.data?.byIssue ?? []).length ? (
                              <div className="text-sm text-[color:var(--color-text-muted)]">No time entries yet.</div>
                            ) : null}
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

                    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">WIP limits</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">Set per column (0–999)</div>
                      </div>
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-xs text-[color:var(--color-text-muted)]">
                            <tr className="border-b border-[color:var(--color-border)]">
                              <th className="px-3 py-2 text-left font-medium">Column</th>
                              <th className="px-3 py-2 text-left font-medium">Count</th>
                              <th className="px-3 py-2 text-left font-medium">Limit</th>
                              <th className="px-3 py-2 text-left font-medium">Status</th>
                              <th className="px-3 py-2"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[color:var(--color-border)]">
                            {columns
                              .slice()
                              .sort((a, b) => (a.order || 0) - (b.order || 0))
                              .map((col) => {
                                const count = loadedIssues.filter((i) => i.columnId === col._id).length
                                const raw = wipEdits[col._id] ?? ''
                                const limit = raw.trim() === '' ? null : Number(raw)
                                const invalid = raw.trim() !== '' && !Number.isFinite(limit)
                                const over = col.wipLimit != null && count > (col.wipLimit || 0)
                                return (
                                  <tr key={col._id}>
                                    <td className="px-3 py-2 font-medium">{col.name}</td>
                                    <td className="px-3 py-2 tabular-nums">{count}</td>
                                    <td className="px-3 py-2">
                                      <input
                                        value={raw}
                                        onChange={(e) => setWipEdits((p) => ({ ...p, [col._id]: e.target.value }))}
                                        className="w-24 rounded-lg border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-sm"
                                        placeholder="—"
                                        inputMode="numeric"
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-xs">
                                      {invalid ? (
                                        <span className="text-red-600">Invalid</span>
                                      ) : over ? (
                                        <span className="text-amber-700">Over limit</span>
                                      ) : (
                                        <span className="text-[color:var(--color-text-muted)]">OK</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      <button
                                        type="button"
                                        className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                                        disabled={updateWipLimit.isPending || invalid}
                                        onClick={() => {
                                          const nextLimit = raw.trim() === '' ? null : Number(raw)
                                          updateWipLimit.mutate({ columnId: col._id, wipLimit: Number.isFinite(nextLimit as any) ? (nextLimit as any) : null })
                                        }}
                                      >
                                        Save
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 text-[10px] text-[color:var(--color-text-muted)]">
                        Next: highlight over-limit columns directly on the board and optionally block new work.
                      </div>
                    </div>
                  </>
                )
              })()}
            </section>
          )}

          {view === 'automation' && (
            <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
              <div className="flex flex-col gap-3 border-b border-[color:var(--color-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold">Automation</div>
                  <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                    Server-side rules that reduce manual work (labeling, sprint cleanup) and keep flow consistent.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!isOwner}
                    onClick={() => setRuleModalOpen(true)}
                    className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                    title={!isOwner ? 'Only the project owner can create rules.' : 'Create a new automation rule'}
                  >
                    New rule
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]">Quick add</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!isOwner || createPresetRule.isPending}
                      onClick={() =>
                        createPresetRule.mutate({
                          name: 'Auto-label blocked issues',
                          enabled: true,
                          trigger: { kind: 'issue_link_added', linkType: 'blocked_by' },
                          conditions: { isBlocked: true },
                          actions: { addLabels: ['blocked'] },
                        })
                      }
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                    >
                      Blocked → add label
                    </button>
                    <button
                      type="button"
                      disabled={!isOwner || createPresetRule.isPending}
                      onClick={() =>
                        createPresetRule.mutate({
                          name: 'Auto-label Done items',
                          enabled: true,
                          trigger: { kind: 'issue_moved', toStatusKey: 'done' },
                          actions: { addLabels: ['done'] },
                        })
                      }
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                    >
                      Done → add label
                    </button>
                    <button
                      type="button"
                      disabled={!isOwner || createPresetRule.isPending}
                      onClick={() =>
                        createPresetRule.mutate({
                          name: 'On sprint close: move open issues to backlog',
                          enabled: true,
                          trigger: { kind: 'sprint_closed' },
                          actions: { moveOpenIssuesToBacklog: true },
                        })
                      }
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                    >
                      Close sprint → backlog
                    </button>
                  </div>
                  {!isOwner ? <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">Only the project owner can add rules.</div> : null}
                </div>

                <div className="rounded-xl border border-[color:var(--color-border)]">
                  <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
                    <div className="text-sm font-semibold">Rules</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">{rulesQ.isFetching ? 'Loading…' : `${rules.length}`}</div>
                  </div>
                  <div className="divide-y divide-[color:var(--color-border)]">
                    {rules.map((r) => (
                      <div key={r._id} className="px-4 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium truncate">{r.name}</div>
                              {r.enabled ? (
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-900">Enabled</span>
                              ) : (
                                <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                                  Disabled
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                              Trigger: {String(r.trigger?.kind || '').replaceAll('_', ' ')}
                              {r.trigger?.toStatusKey ? ` → ${r.trigger.toStatusKey}` : ''}
                              {r.trigger?.linkType ? ` (${r.trigger.linkType})` : ''}
                            </div>
                            {r.actions?.addLabels?.length || r.actions?.removeLabels?.length || r.actions?.moveOpenIssuesToBacklog ? (
                              <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
                                {r.actions?.addLabels?.length ? <span>Add labels: {r.actions.addLabels.join(', ')}. </span> : null}
                                {r.actions?.removeLabels?.length ? <span>Remove labels: {r.actions.removeLabels.join(', ')}. </span> : null}
                                {r.actions?.moveOpenIssuesToBacklog ? <span>Move open sprint issues to backlog on sprint close.</span> : null}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!isOwner || toggleRule.isPending}
                              onClick={() => toggleRule.mutate(r)}
                              className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                            >
                              {r.enabled ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              type="button"
                              disabled={!isOwner || deleteRule.isPending}
                              onClick={() => {
                                if (!confirm('Delete this automation rule?')) return
                                deleteRule.mutate(r._id)
                              }}
                              className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {!rulesQ.isLoading && rules.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-[color:var(--color-text-muted)]">No automation rules yet.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          )}

          {view === 'activity' && (
            <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
              <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">Activity feed</div>
                  <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">Recent changes across issues and sprints.</div>
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)]">{activityQ.isFetching ? 'Loading…' : 'Live'}</div>
              </div>
              <div className="divide-y divide-[color:var(--color-border)]">
                {(activityQ.data?.data.items ?? []).map((a) => (
                  <div key={a._id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm">
                          <span className="font-medium">{a.kind.replaceAll('_', ' ')}</span>
                          {a.issueId ? (
                            <button
                              type="button"
                              className="ml-2 text-sm text-[color:var(--color-primary-600)] hover:underline"
                              onClick={() => openIssueFocus(String(a.issueId))}
                            >
                              Open issue
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                          {a.createdAt ? new Date(String(a.createdAt)).toLocaleString() : '—'} · Actor: {a.actorId}
                        </div>
                        {a.meta ? (
                          <div className="mt-1 text-[10px] text-[color:var(--color-text-muted)] break-words">
                            {JSON.stringify(a.meta)}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        {a.sprintId ? <span>Sprint</span> : a.issueId ? <span>Issue</span> : <span>Project</span>}
                      </div>
                    </div>
                  </div>
                ))}
                {!activityQ.isLoading && !(activityQ.data?.data.items ?? []).length ? (
                  <div className="px-4 py-8 text-center text-sm text-[color:var(--color-text-muted)]">No activity yet.</div>
                ) : null}
              </div>
            </section>
          )}
        </>
      )}

      {focusedIssueId ? (
        <StratflowIssueDrawer issueId={focusedIssueId} projectId={String(projectId || '')} onClose={closeIssueFocus} />
      ) : null}
      </div>
    </TooltipProvider>
  )
}

