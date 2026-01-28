import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'

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

  const issue = issueQ.data?.data
  const sprints = sprintsQ.data?.data.items ?? []
  const members = membersQ.data?.data.users ?? []
  const projectComponents = componentsQ.data?.data.items ?? []
  const epics = (epicsQ.data?.data.items ?? []).filter((e) => e._id !== issueId)
  const comments = commentsQ.data?.data.items ?? []
  const issueLinks = issue?.links ?? []

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

  const [linkType, setLinkType] = React.useState<'blocks' | 'blocked_by' | 'relates_to'>('relates_to')
  const [linkOtherId, setLinkOtherId] = React.useState<string>('')

  React.useEffect(() => {
    if (!issue) return
    setTitle(String(issue.title || ''))
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
  }, [issue, issueId])

  const save = useMutation({
    mutationFn: async () => {
      const points = storyPoints.trim()
      const parsedPoints = points === '' ? null : Number(points)
      if (points !== '' && !Number.isFinite(parsedPoints)) throw new Error('Story points must be a number.')

      const payload = {
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
      return (await http.patch(`/api/stratflow/issues/${issueId}`, payload)).data
    },
    onSuccess: async () => {
      toast.showToast('Saved.', 'success')
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issue', issueId] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'issues'] })
      await qc.invalidateQueries({ queryKey: ['stratflow', 'projectIssues', projectId] })
    },
    onError: (err: any) => {
      toast.showToast(err?.response?.data?.error || err?.message || 'Failed to save issue.', 'error')
    },
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

  return (
    <div className="fixed inset-0 z-[2147483647] bg-black/40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-[min(95vw,34rem)] border-l border-[color:var(--color-border)] bg-[color:var(--color-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--color-border)] px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">Issue Focus</div>
            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              {issue?.statusKey ? `Status: ${issue.statusKey.replaceAll('_', ' ')}` : 'Status: —'}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-[color:var(--color-muted)]">
            ✕
          </button>
        </div>

        <div className="h-[calc(100%-3.25rem)] overflow-y-auto px-4 py-4 space-y-4">
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
                    placeholder="Add a comment…"
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

