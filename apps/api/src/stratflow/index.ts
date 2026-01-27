import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { getDb } from '../db.js'
import { requireAuth, requireApplication } from '../auth/rbac.js'

export const stratflowRouter = Router()

stratflowRouter.use(requireAuth)
stratflowRouter.use(requireApplication('stratflow'))

type ProjectType = 'SCRUM' | 'KANBAN' | 'TRADITIONAL' | 'HYBRID'
type ProjectStatus = 'Active' | 'On Hold' | 'Completed' | 'Archived'

type ProjectDoc = {
  _id: ObjectId
  name: string
  key: string
  description?: string | null
  type: ProjectType
  status: ProjectStatus
  ownerId: string
  teamIds: string[]
  clientId?: string | null
  startDate?: Date | null
  targetEndDate?: Date | null
  createdAt: Date
  updatedAt: Date
}

type BoardKind = 'KANBAN' | 'BACKLOG' | 'MILESTONES'

type BoardDoc = {
  _id: ObjectId
  projectId: ObjectId
  name: string
  kind: BoardKind
  createdAt: Date
  updatedAt: Date
}

type ColumnDoc = {
  _id: ObjectId
  boardId: ObjectId
  name: string
  order: number
  createdAt: Date
  updatedAt: Date
}

type IssueType = 'Epic' | 'Story' | 'Task' | 'Defect' | 'Spike'
type IssueStatusKey = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done'
type IssuePriority = 'Highest' | 'High' | 'Medium' | 'Low'

type IssueLinkType = 'blocks' | 'blocked_by' | 'relates_to'
type IssueLink = { type: IssueLinkType; issueId: ObjectId }
type IssueAttachment = { name: string; url?: string | null; documentId?: string | null; createdAt: Date }

type IssueDoc = {
  _id: ObjectId
  projectId: ObjectId
  boardId: ObjectId
  columnId: ObjectId
  title: string
  description?: string | null
  type: IssueType
  statusKey?: IssueStatusKey | null
  priority: IssuePriority
  acceptanceCriteria?: string | null
  storyPoints?: number | null
  sprintId?: ObjectId | null
  epicId?: ObjectId | null
  labels?: string[]
  components?: string[]
  links?: IssueLink[]
  attachments?: IssueAttachment[]
  order: number
  reporterId: string
  assigneeId?: string | null
  createdAt: Date
  updatedAt: Date
}

type SprintState = 'planned' | 'active' | 'closed'
type SprintDoc = {
  _id: ObjectId
  projectId: ObjectId
  name: string
  goal?: string | null
  startDate?: Date | null
  endDate?: Date | null
  state: SprintState
  createdAt: Date
  updatedAt: Date
}

type IssueCommentDoc = {
  _id: ObjectId
  projectId: ObjectId
  issueId: ObjectId
  authorId: string
  body: string
  createdAt: Date
}

function normStr(v: any) {
  return typeof v === 'string' ? v.trim() : ''
}

function normStrArray(input: any, max: number) {
  const arr = Array.isArray(input) ? input : []
  const cleaned = arr
    .map((x) => normStr(x))
    .filter(Boolean)
    .map((x) => x.slice(0, 80))
  return Array.from(new Set(cleaned)).slice(0, max)
}

function keyify(input: string) {
  return input
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 12)
}

const projectCreateSchema = z.object({
  name: z.string().min(2).max(140),
  key: z.string().min(2).max(12),
  description: z.string().max(4000).optional().nullable(),
  type: z.enum(['SCRUM', 'KANBAN', 'TRADITIONAL', 'HYBRID']),
  status: z.enum(['Active', 'On Hold', 'Completed', 'Archived']).optional(),
  teamIds: z.array(z.string().min(6)).max(50).optional(),
  clientId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  targetEndDate: z.string().optional().nullable(),
})

function objIdOrNull(id: string) {
  try {
    if (!ObjectId.isValid(id)) return null
    return new ObjectId(id)
  } catch {
    return null
  }
}

function normIssueType(input: any): IssueType {
  const raw = String(input || '').trim()
  if (!raw) return 'Task'
  // Back-compat: Bug -> Defect
  if (raw === 'Bug') return 'Defect'
  if (raw === 'Epic' || raw === 'Story' || raw === 'Task' || raw === 'Defect' || raw === 'Spike') return raw
  return 'Task'
}

function normPriority(input: any): IssuePriority {
  const raw = String(input || '').trim()
  if (!raw) return 'Medium'
  // Back-compat: Critical -> Highest
  if (raw === 'Critical') return 'Highest'
  if (raw === 'Highest' || raw === 'High' || raw === 'Medium' || raw === 'Low') return raw
  // Back-compat: old enum values
  if (raw === 'High') return 'High'
  if (raw === 'Medium') return 'Medium'
  if (raw === 'Low') return 'Low'
  return 'Medium'
}

function statusKeyFromColumnName(name: string): IssueStatusKey {
  const n = String(name || '').trim().toLowerCase()
  if (n.includes('backlog')) return 'backlog'
  if (n.includes('review')) return 'in_review'
  if (n.includes('doing') || n.includes('progress') || n.includes('in progress')) return 'in_progress'
  if (n.includes('done') || n.includes('complete')) return 'done'
  if (n.includes('to do') || n === 'todo' || n.includes('not started')) return 'todo'
  return 'todo'
}

async function ensureStratflowIndexes(db: any) {
  // Best-effort; ignore errors
  try {
    await db.collection('sf_issues').createIndex({ projectId: 1 }).catch(() => {})
    await db.collection('sf_issues').createIndex({ boardId: 1, columnId: 1, order: 1 }).catch(() => {})
    await db.collection('sf_issues').createIndex({ sprintId: 1 }).catch(() => {})
    await db.collection('sf_issues').createIndex({ epicId: 1 }).catch(() => {})
    await db.collection('sf_sprints').createIndex({ projectId: 1, state: 1 }).catch(() => {})
    await db.collection('sf_issue_comments').createIndex({ issueId: 1, createdAt: 1 }).catch(() => {})
  } catch {
    // noop
  }
}

function canAccessProject(authUserId: string, project: Pick<ProjectDoc, 'ownerId' | 'teamIds'>) {
  if (project.ownerId === authUserId) return true
  return Array.isArray(project.teamIds) && project.teamIds.includes(authUserId)
}

async function loadProjectForUser(db: any, projectId: ObjectId, authUserId: string) {
  const project = await db.collection('sf_projects').findOne({ _id: projectId } as any)
  if (!project) return null
  if (!canAccessProject(authUserId, project)) return 'forbidden' as const
  return project
}

async function createTemplateForProject(db: any, projectId: ObjectId, type: ProjectType, now: Date) {
  const boards: Array<{ board: BoardDoc; columns: ColumnDoc[] }> = []

  const mkBoard = (name: string, kind: BoardKind) => ({
    _id: new ObjectId(),
    projectId,
    name,
    kind,
    createdAt: now,
    updatedAt: now,
  } satisfies BoardDoc)

  const mkColumns = (boardId: ObjectId, names: string[]) =>
    names.map(
      (name, idx) =>
        ({
          _id: new ObjectId(),
          boardId,
          name,
          order: (idx + 1) * 1000,
          createdAt: now,
          updatedAt: now,
        }) satisfies ColumnDoc,
    )

  if (type === 'SCRUM') {
    const backlog = mkBoard('Backlog', 'BACKLOG')
    const backlogCols = mkColumns(backlog._id, ['Backlog'])
    boards.push({ board: backlog, columns: backlogCols })

    const sprint = mkBoard('Sprint Board', 'KANBAN')
    const sprintCols = mkColumns(sprint._id, ['To Do', 'In Progress', 'In Review', 'Done'])
    boards.push({ board: sprint, columns: sprintCols })
  } else if (type === 'TRADITIONAL') {
    const board = mkBoard('Milestones', 'MILESTONES')
    const cols = mkColumns(board._id, ['Not Started', 'In Progress', 'Blocked', 'Complete'])
    boards.push({ board, columns: cols })
  } else if (type === 'HYBRID') {
    const board = mkBoard('Board', 'KANBAN')
    const cols = mkColumns(board._id, ['To Do', 'In Progress', 'In Review', 'Done'])
    boards.push({ board, columns: cols })

    const backlog = mkBoard('Backlog', 'BACKLOG')
    const backlogCols = mkColumns(backlog._id, ['Backlog'])
    boards.push({ board: backlog, columns: backlogCols })
  } else {
    // KANBAN
    const board = mkBoard('Board', 'KANBAN')
    const cols = mkColumns(board._id, ['To Do', 'In Progress', 'In Review', 'Done'])
    boards.push({ board, columns: cols })
  }

  if (!boards.length) return { defaultBoardId: null as string | null }

  await db.collection('sf_boards').insertMany(boards.map((b) => b.board) as any)
  await db.collection('sf_columns').insertMany(boards.flatMap((b) => b.columns) as any)

  // Default board: prefer a KANBAN board if present, else first board
  const defaultBoard = boards.find((b) => b.board.kind === 'KANBAN')?.board ?? boards[0].board
  return { defaultBoardId: String(defaultBoard._id) }
}

function toIsoOrNull(d: any) {
  return d?.toISOString?.() ?? null
}

// GET /api/stratflow/projects
stratflowRouter.get('/projects', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const auth = req.auth as { userId: string; email: string }

  const items = await db
    .collection('sf_projects')
    .find({ $or: [{ ownerId: auth.userId }, { teamIds: auth.userId }] } as any)
    .sort({ updatedAt: -1 } as any)
    .limit(200)
    .toArray()

  res.json({
    data: {
      items: items.map((d: any) => ({
        ...d,
        _id: String(d._id),
        startDate: toIsoOrNull(d.startDate),
        targetEndDate: toIsoOrNull(d.targetEndDate),
        createdAt: toIsoOrNull(d.createdAt),
        updatedAt: toIsoOrNull(d.updatedAt),
      })),
    },
    error: null,
  })
})

// POST /api/stratflow/projects
stratflowRouter.post('/projects', async (req: any, res) => {
  const parsed = projectCreateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const auth = req.auth as { userId: string; email: string }

  const now = new Date()
  const key = keyify(parsed.data.key)
  if (!key) return res.status(400).json({ data: null, error: 'invalid_key' })

  const existing = await db.collection('sf_projects').findOne({ ownerId: auth.userId, key } as any)
  if (existing) return res.status(409).json({ data: null, error: 'key_taken' })

  const teamIds = Array.from(
    new Set(
      (parsed.data.teamIds || [])
        .map((x) => normStr(x))
        .filter((x) => ObjectId.isValid(x)),
    ),
  ).slice(0, 50)

  const doc: ProjectDoc = {
    _id: new ObjectId(),
    name: parsed.data.name.trim(),
    key,
    description: parsed.data.description ? String(parsed.data.description).trim() : null,
    type: parsed.data.type,
    status: parsed.data.status ?? 'Active',
    ownerId: auth.userId,
    teamIds,
    clientId: parsed.data.clientId ? String(parsed.data.clientId).trim() : null,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
    targetEndDate: parsed.data.targetEndDate ? new Date(parsed.data.targetEndDate) : null,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection('sf_projects').insertOne(doc as any)

  // Create default workflow/board setup based on template type
  const tpl = await createTemplateForProject(db, doc._id, doc.type, now)

  res.status(201).json({ data: { _id: String(doc._id), defaultBoardId: tpl.defaultBoardId }, error: null })
})

// GET /api/stratflow/projects/:projectId
stratflowRouter.get('/projects/:projectId', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const auth = req.auth as { userId: string; email: string }
  const pid = objIdOrNull(String(req.params.projectId || ''))
  if (!pid) return res.status(400).json({ data: null, error: 'invalid_project_id' })

  const project = await loadProjectForUser(db, pid, auth.userId)
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })

  res.json({
    data: {
      ...project,
      _id: String(project._id),
      startDate: toIsoOrNull(project.startDate),
      targetEndDate: toIsoOrNull(project.targetEndDate),
      createdAt: toIsoOrNull(project.createdAt),
      updatedAt: toIsoOrNull(project.updatedAt),
    },
    error: null,
  })
})

// GET /api/stratflow/projects/:projectId/boards
stratflowRouter.get('/projects/:projectId/boards', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const auth = req.auth as { userId: string; email: string }
  const pid = objIdOrNull(String(req.params.projectId || ''))
  if (!pid) return res.status(400).json({ data: null, error: 'invalid_project_id' })

  const project = await loadProjectForUser(db, pid, auth.userId)
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })

  const boards = await db.collection('sf_boards').find({ projectId: pid } as any).sort({ createdAt: 1 } as any).toArray()
  res.json({
    data: {
      items: boards.map((b: any) => ({
        ...b,
        _id: String(b._id),
        projectId: String(b.projectId),
        createdAt: toIsoOrNull(b.createdAt),
        updatedAt: toIsoOrNull(b.updatedAt),
      })),
    },
    error: null,
  })
})

// GET /api/stratflow/boards/:boardId
stratflowRouter.get('/boards/:boardId', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const auth = req.auth as { userId: string; email: string }
  const bid = objIdOrNull(String(req.params.boardId || ''))
  if (!bid) return res.status(400).json({ data: null, error: 'invalid_board_id' })

  const board = await db.collection('sf_boards').findOne({ _id: bid } as any)
  if (!board) return res.status(404).json({ data: null, error: 'not_found' })
  const project = await loadProjectForUser(db, board.projectId as any, auth.userId)
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })

  const cols = await db.collection('sf_columns').find({ boardId: bid } as any).sort({ order: 1 } as any).toArray()
  res.json({
    data: {
      board: {
        ...board,
        _id: String(board._id),
        projectId: String(board.projectId),
        createdAt: toIsoOrNull(board.createdAt),
        updatedAt: toIsoOrNull(board.updatedAt),
      },
      columns: cols.map((c: any) => ({
        ...c,
        _id: String(c._id),
        boardId: String(c.boardId),
        createdAt: toIsoOrNull(c.createdAt),
        updatedAt: toIsoOrNull(c.updatedAt),
      })),
    },
    error: null,
  })
})

// GET /api/stratflow/boards/:boardId/issues
stratflowRouter.get('/boards/:boardId/issues', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureStratflowIndexes(db)
  const auth = req.auth as { userId: string; email: string }
  const bid = objIdOrNull(String(req.params.boardId || ''))
  if (!bid) return res.status(400).json({ data: null, error: 'invalid_board_id' })

  const board = await db.collection('sf_boards').findOne({ _id: bid } as any)
  if (!board) return res.status(404).json({ data: null, error: 'not_found' })
  const project = await loadProjectForUser(db, board.projectId as any, auth.userId)
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })

  const items = await db
    .collection('sf_issues')
    .find({ boardId: bid } as any)
    .sort({ columnId: 1, order: 1 } as any)
    .limit(2000)
    .toArray()

  res.json({
    data: {
      items: items.map((d: any) => ({
        ...d,
        _id: String(d._id),
        projectId: String(d.projectId),
        boardId: String(d.boardId),
        columnId: String(d.columnId),
        sprintId: d.sprintId ? String(d.sprintId) : null,
        epicId: d.epicId ? String(d.epicId) : null,
        // normalize back-compat values without rewriting DB
        type: normIssueType(d.type),
        priority: normPriority(d.priority),
        createdAt: toIsoOrNull(d.createdAt),
        updatedAt: toIsoOrNull(d.updatedAt),
      })),
    },
    error: null,
  })
})

const issueCreateSchema = z.object({
  title: z.string().min(1).max(280),
  columnId: z.string().min(6),
  description: z.string().max(4000).optional().nullable(),
  type: z.string().optional(),
  priority: z.string().optional(),
  assigneeId: z.string().optional().nullable(),
  acceptanceCriteria: z.string().max(8000).optional().nullable(),
  storyPoints: z.number().min(0).max(200).optional().nullable(),
  sprintId: z.string().optional().nullable(),
  epicId: z.string().optional().nullable(),
  labels: z.array(z.string()).optional(),
  components: z.array(z.string()).optional(),
})

// POST /api/stratflow/boards/:boardId/issues
stratflowRouter.post('/boards/:boardId/issues', async (req: any, res) => {
  const parsed = issueCreateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureStratflowIndexes(db)
  const auth = req.auth as { userId: string; email: string }
  const bid = objIdOrNull(String(req.params.boardId || ''))
  if (!bid) return res.status(400).json({ data: null, error: 'invalid_board_id' })

  const board = await db.collection('sf_boards').findOne({ _id: bid } as any)
  if (!board) return res.status(404).json({ data: null, error: 'not_found' })
  const project = await loadProjectForUser(db, board.projectId as any, auth.userId)
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })

  const colId = objIdOrNull(parsed.data.columnId)
  if (!colId) return res.status(400).json({ data: null, error: 'invalid_column_id' })
  const col = await db.collection('sf_columns').findOne({ _id: colId, boardId: bid } as any)
  if (!col) return res.status(404).json({ data: null, error: 'column_not_found' })

  const now = new Date()
  const last = await db
    .collection('sf_issues')
    .find({ boardId: bid, columnId: colId } as any)
    .sort({ order: -1 } as any)
    .limit(1)
    .toArray()
  const lastOrder = last?.[0]?.order ?? 0

  const doc: IssueDoc = {
    _id: new ObjectId(),
    projectId: board.projectId,
    boardId: bid,
    columnId: colId,
    title: parsed.data.title.trim(),
    description: parsed.data.description ? String(parsed.data.description).trim() : null,
    type: normIssueType(parsed.data.type),
    statusKey: statusKeyFromColumnName(String(col.name || '')),
    priority: normPriority(parsed.data.priority),
    acceptanceCriteria: parsed.data.acceptanceCriteria ? String(parsed.data.acceptanceCriteria).trim() : null,
    storyPoints: parsed.data.storyPoints ?? null,
    sprintId: parsed.data.sprintId ? objIdOrNull(parsed.data.sprintId) : null,
    epicId: parsed.data.epicId ? objIdOrNull(parsed.data.epicId) : null,
    labels: normStrArray(parsed.data.labels, 50),
    components: normStrArray(parsed.data.components, 50),
    links: [],
    attachments: [],
    order: (Number(lastOrder) || 0) + 1000,
    reporterId: auth.userId,
    assigneeId: parsed.data.assigneeId ? String(parsed.data.assigneeId).trim() : null,
    createdAt: now,
    updatedAt: now,
  }

  // Validate references are within project scope (best-effort)
  if (doc.sprintId) {
    const sp = await db.collection('sf_sprints').findOne({ _id: doc.sprintId, projectId: board.projectId } as any)
    if (!sp) return res.status(400).json({ data: null, error: 'invalid_sprint' })
  }
  if (doc.epicId) {
    const epic = await db.collection('sf_issues').findOne({ _id: doc.epicId, projectId: board.projectId } as any)
    if (!epic) return res.status(400).json({ data: null, error: 'invalid_epic' })
  }

  await db.collection('sf_issues').insertOne(doc as any)
  res.status(201).json({ data: { _id: String(doc._id) }, error: null })
})

const issueMoveSchema = z.object({
  toColumnId: z.string().min(6),
  toIndex: z.number().int().min(0).max(100000),
})

const sprintCreateSchema = z.object({
  name: z.string().min(2).max(140),
  goal: z.string().max(2000).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
})

const sprintUpdateSchema = z.object({
  name: z.string().min(2).max(140).optional(),
  goal: z.string().max(2000).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  state: z.enum(['planned', 'active', 'closed']).optional(),
})

async function reindexColumnIssues(db: any, boardId: ObjectId, columnId: ObjectId, now: Date) {
  const all = await db.collection('sf_issues').find({ boardId, columnId } as any).sort({ order: 1 } as any).toArray()
  const bulk = db.collection('sf_issues').initializeUnorderedBulkOp()
  all.forEach((it: any, idx: number) => {
    bulk.find({ _id: it._id }).updateOne({ $set: { order: (idx + 1) * 1000, updatedAt: now } })
  })
  if (all.length) await bulk.execute()
  return all.length
}

async function computeOrderForMove(db: any, boardId: ObjectId, columnId: ObjectId, toIndex: number, now: Date) {
  const items = await db.collection('sf_issues').find({ boardId, columnId } as any).sort({ order: 1 } as any).toArray()
  const before = items[toIndex - 1]?.order ?? null
  const after = items[toIndex]?.order ?? null
  if (before == null && after == null) return 1000
  if (before == null && after != null) return Number(after) - 1000
  if (before != null && after == null) return Number(before) + 1000
  const b = Number(before)
  const a = Number(after)
  if (Number.isFinite(b) && Number.isFinite(a) && a - b > 1) return (a + b) / 2

  await reindexColumnIssues(db, boardId, columnId, now)
  const items2 = await db.collection('sf_issues').find({ boardId, columnId } as any).sort({ order: 1 } as any).toArray()
  const before2 = items2[toIndex - 1]?.order ?? null
  const after2 = items2[toIndex]?.order ?? null
  if (before2 == null && after2 == null) return 1000
  if (before2 == null && after2 != null) return Number(after2) - 1000
  if (before2 != null && after2 == null) return Number(before2) + 1000
  return (Number(before2) + Number(after2)) / 2
}

// PATCH /api/stratflow/issues/:issueId/move
stratflowRouter.patch('/issues/:issueId/move', async (req: any, res) => {
  const parsed = issueMoveSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureStratflowIndexes(db)
  const auth = req.auth as { userId: string; email: string }
  const iid = objIdOrNull(String(req.params.issueId || ''))
  if (!iid) return res.status(400).json({ data: null, error: 'invalid_issue_id' })

  const issue = await db.collection('sf_issues').findOne({ _id: iid } as any)
  if (!issue) return res.status(404).json({ data: null, error: 'not_found' })
  const board = await db.collection('sf_boards').findOne({ _id: issue.boardId } as any)
  if (!board) return res.status(404).json({ data: null, error: 'board_not_found' })
  const project = await loadProjectForUser(db, board.projectId as any, auth.userId)
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })

  const toCol = objIdOrNull(parsed.data.toColumnId)
  if (!toCol) return res.status(400).json({ data: null, error: 'invalid_column_id' })
  const col = await db.collection('sf_columns').findOne({ _id: toCol, boardId: issue.boardId } as any)
  if (!col) return res.status(404).json({ data: null, error: 'column_not_found' })

  const now = new Date()
  // if moving across columns, compute order in dest column (excluding the moving issue)
  // easiest: temporarily remove issue from dest query by excluding _id
  const destItems = await db
    .collection('sf_issues')
    .find({ boardId: issue.boardId, columnId: toCol, _id: { $ne: iid } } as any)
    .sort({ order: 1 } as any)
    .toArray()
  const before = destItems[parsed.data.toIndex - 1]?.order ?? null
  const after = destItems[parsed.data.toIndex]?.order ?? null

  let newOrder: number
  if (before == null && after == null) newOrder = 1000
  else if (before == null && after != null) newOrder = Number(after) - 1000
  else if (before != null && after == null) newOrder = Number(before) + 1000
  else {
    const b = Number(before)
    const a = Number(after)
    newOrder = a - b > 1 ? (a + b) / 2 : NaN
    if (!Number.isFinite(newOrder)) {
      // Reindex dest column then recompute
      await reindexColumnIssues(db, issue.boardId, toCol, now)
      const destItems2 = await db
        .collection('sf_issues')
        .find({ boardId: issue.boardId, columnId: toCol, _id: { $ne: iid } } as any)
        .sort({ order: 1 } as any)
        .toArray()
      const before2 = destItems2[parsed.data.toIndex - 1]?.order ?? null
      const after2 = destItems2[parsed.data.toIndex]?.order ?? null
      if (before2 == null && after2 == null) newOrder = 1000
      else if (before2 == null && after2 != null) newOrder = Number(after2) - 1000
      else if (before2 != null && after2 == null) newOrder = Number(before2) + 1000
      else newOrder = (Number(before2) + Number(after2)) / 2
    }
  }

  await db.collection('sf_issues').updateOne(
    { _id: iid } as any,
    {
      $set: {
        columnId: toCol,
        order: newOrder,
        statusKey: statusKeyFromColumnName(String(col.name || '')),
        updatedAt: now,
      },
    } as any,
  )

  res.json({ data: { ok: true }, error: null })
})

// GET /api/stratflow/projects/:projectId/sprints
stratflowRouter.get('/projects/:projectId/sprints', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureStratflowIndexes(db)
  const auth = req.auth as { userId: string; email: string }
  const pid = objIdOrNull(String(req.params.projectId || ''))
  if (!pid) return res.status(400).json({ data: null, error: 'invalid_project_id' })

  const project = await loadProjectForUser(db, pid, auth.userId)
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })

  const items = await db.collection('sf_sprints').find({ projectId: pid } as any).sort({ createdAt: -1 } as any).toArray()
  res.json({
    data: {
      items: items.map((d: any) => ({
        ...d,
        _id: String(d._id),
        projectId: String(d.projectId),
        startDate: toIsoOrNull(d.startDate),
        endDate: toIsoOrNull(d.endDate),
        createdAt: toIsoOrNull(d.createdAt),
        updatedAt: toIsoOrNull(d.updatedAt),
      })),
    },
    error: null,
  })
})

// POST /api/stratflow/projects/:projectId/sprints
stratflowRouter.post('/projects/:projectId/sprints', async (req: any, res) => {
  const parsed = sprintCreateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureStratflowIndexes(db)
  const auth = req.auth as { userId: string; email: string }
  const pid = objIdOrNull(String(req.params.projectId || ''))
  if (!pid) return res.status(400).json({ data: null, error: 'invalid_project_id' })

  const project = await loadProjectForUser(db, pid, auth.userId)
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })

  const now = new Date()
  const doc: SprintDoc = {
    _id: new ObjectId(),
    projectId: pid,
    name: parsed.data.name.trim(),
    goal: parsed.data.goal ? String(parsed.data.goal).trim() : null,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
    endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
    state: 'planned',
    createdAt: now,
    updatedAt: now,
  }

  await db.collection('sf_sprints').insertOne(doc as any)
  res.status(201).json({ data: { _id: String(doc._id) }, error: null })
})

// PATCH /api/stratflow/sprints/:sprintId
stratflowRouter.patch('/sprints/:sprintId', async (req: any, res) => {
  const parsed = sprintUpdateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureStratflowIndexes(db)
  const auth = req.auth as { userId: string; email: string }
  const sid = objIdOrNull(String(req.params.sprintId || ''))
  if (!sid) return res.status(400).json({ data: null, error: 'invalid_sprint_id' })

  const sprint = await db.collection('sf_sprints').findOne({ _id: sid } as any)
  if (!sprint) return res.status(404).json({ data: null, error: 'not_found' })
  const project = await loadProjectForUser(db, sprint.projectId as any, auth.userId)
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })

  const update: any = { updatedAt: new Date() }
  if (parsed.data.name !== undefined) update.name = parsed.data.name.trim()
  if (parsed.data.goal !== undefined) update.goal = parsed.data.goal ? String(parsed.data.goal).trim() : null
  if (parsed.data.startDate !== undefined) update.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null
  if (parsed.data.endDate !== undefined) update.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null
  if (parsed.data.state !== undefined) update.state = parsed.data.state

  await db.collection('sf_sprints').updateOne({ _id: sid } as any, { $set: update } as any)
  res.json({ data: { ok: true }, error: null })
})

// POST /api/stratflow/sprints/:sprintId/set-active
stratflowRouter.post('/sprints/:sprintId/set-active', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureStratflowIndexes(db)
  const auth = req.auth as { userId: string; email: string }
  const sid = objIdOrNull(String(req.params.sprintId || ''))
  if (!sid) return res.status(400).json({ data: null, error: 'invalid_sprint_id' })

  const sprint = await db.collection('sf_sprints').findOne({ _id: sid } as any)
  if (!sprint) return res.status(404).json({ data: null, error: 'not_found' })
  const project = await loadProjectForUser(db, sprint.projectId as any, auth.userId)
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })

  const now = new Date()
  // Enforce only one active sprint per project
  await db.collection('sf_sprints').updateMany({ projectId: sprint.projectId, state: 'active' } as any, { $set: { state: 'planned', updatedAt: now } } as any)
  await db.collection('sf_sprints').updateOne({ _id: sid } as any, { $set: { state: 'active', updatedAt: now } } as any)
  res.json({ data: { ok: true }, error: null })
})

const issueUpdateSchema = z.object({
  title: z.string().min(1).max(280).optional(),
  description: z.string().max(4000).optional().nullable(),
  type: z.string().optional(),
  priority: z.string().optional(),
  acceptanceCriteria: z.string().max(8000).optional().nullable(),
  storyPoints: z.number().min(0).max(200).optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  sprintId: z.string().optional().nullable(),
  epicId: z.string().optional().nullable(),
  labels: z.array(z.string()).optional(),
  components: z.array(z.string()).optional(),
})

// GET /api/stratflow/issues/:issueId
stratflowRouter.get('/issues/:issueId', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureStratflowIndexes(db)
  const auth = req.auth as { userId: string; email: string }
  const iid = objIdOrNull(String(req.params.issueId || ''))
  if (!iid) return res.status(400).json({ data: null, error: 'invalid_issue_id' })

  const issue = await db.collection('sf_issues').findOne({ _id: iid } as any)
  if (!issue) return res.status(404).json({ data: null, error: 'not_found' })

  const project = await loadProjectForUser(db, issue.projectId as any, auth.userId)
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })

  res.json({
    data: {
      ...issue,
      _id: String(issue._id),
      projectId: String(issue.projectId),
      boardId: String(issue.boardId),
      columnId: String(issue.columnId),
      sprintId: issue.sprintId ? String(issue.sprintId) : null,
      epicId: issue.epicId ? String(issue.epicId) : null,
      type: normIssueType(issue.type),
      priority: normPriority(issue.priority),
      createdAt: toIsoOrNull(issue.createdAt),
      updatedAt: toIsoOrNull(issue.updatedAt),
    },
    error: null,
  })
})

// PATCH /api/stratflow/issues/:issueId
stratflowRouter.patch('/issues/:issueId', async (req: any, res) => {
  const parsed = issueUpdateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureStratflowIndexes(db)
  const auth = req.auth as { userId: string; email: string }
  const iid = objIdOrNull(String(req.params.issueId || ''))
  if (!iid) return res.status(400).json({ data: null, error: 'invalid_issue_id' })

  const issue = await db.collection('sf_issues').findOne({ _id: iid } as any)
  if (!issue) return res.status(404).json({ data: null, error: 'not_found' })
  const project = await loadProjectForUser(db, issue.projectId as any, auth.userId)
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })

  const update: any = { updatedAt: new Date() }
  if (parsed.data.title !== undefined) update.title = parsed.data.title.trim()
  if (parsed.data.description !== undefined) update.description = parsed.data.description ? String(parsed.data.description).trim() : null
  if (parsed.data.type !== undefined) update.type = normIssueType(parsed.data.type)
  if (parsed.data.priority !== undefined) update.priority = normPriority(parsed.data.priority)
  if (parsed.data.acceptanceCriteria !== undefined) update.acceptanceCriteria = parsed.data.acceptanceCriteria ? String(parsed.data.acceptanceCriteria).trim() : null
  if (parsed.data.storyPoints !== undefined) update.storyPoints = parsed.data.storyPoints ?? null
  if (parsed.data.assigneeId !== undefined) update.assigneeId = parsed.data.assigneeId ? String(parsed.data.assigneeId).trim() : null
  if (parsed.data.labels !== undefined) update.labels = normStrArray(parsed.data.labels, 50)
  if (parsed.data.components !== undefined) update.components = normStrArray(parsed.data.components, 50)

  if (parsed.data.sprintId !== undefined) {
    if (!parsed.data.sprintId) update.sprintId = null
    else {
      const sid = objIdOrNull(parsed.data.sprintId)
      if (!sid) return res.status(400).json({ data: null, error: 'invalid_sprint' })
      const sp = await db.collection('sf_sprints').findOne({ _id: sid, projectId: issue.projectId } as any)
      if (!sp) return res.status(400).json({ data: null, error: 'invalid_sprint' })
      update.sprintId = sid
    }
  }

  if (parsed.data.epicId !== undefined) {
    if (!parsed.data.epicId) update.epicId = null
    else {
      const eid = objIdOrNull(parsed.data.epicId)
      if (!eid) return res.status(400).json({ data: null, error: 'invalid_epic' })
      const epic = await db.collection('sf_issues').findOne({ _id: eid, projectId: issue.projectId } as any)
      if (!epic) return res.status(400).json({ data: null, error: 'invalid_epic' })
      update.epicId = eid
    }
  }

  await db.collection('sf_issues').updateOne({ _id: iid } as any, { $set: update } as any)
  res.json({ data: { ok: true }, error: null })
})

// GET /api/stratflow/projects/:projectId/issues
stratflowRouter.get('/projects/:projectId/issues', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureStratflowIndexes(db)
  const auth = req.auth as { userId: string; email: string }
  const pid = objIdOrNull(String(req.params.projectId || ''))
  if (!pid) return res.status(400).json({ data: null, error: 'invalid_project_id' })

  const project = await loadProjectForUser(db, pid, auth.userId)
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })

  const q = String(req.query.q || '').trim().toLowerCase()
  const typeQ = String(req.query.type || '').trim()
  const sprintIdQ = String(req.query.sprintId || '').trim()
  const epicIdQ = String(req.query.epicId || '').trim()
  const statusQ = String(req.query.statusKey || '').trim()

  const query: any = { projectId: pid }
  if (typeQ) query.type = normIssueType(typeQ)
  if (statusQ) query.statusKey = statusQ
  if (sprintIdQ) {
    if (sprintIdQ === 'null') query.sprintId = null
    else {
      const sid = objIdOrNull(sprintIdQ)
      if (!sid) return res.status(400).json({ data: null, error: 'invalid_sprint' })
      query.sprintId = sid
    }
  }
  if (epicIdQ) {
    const eid = objIdOrNull(epicIdQ)
    if (!eid) return res.status(400).json({ data: null, error: 'invalid_epic' })
    query.epicId = eid
  }

  // MVP text search: title substring (case-insensitive)
  if (q) query.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }

  const items = await db.collection('sf_issues').find(query).sort({ updatedAt: -1 } as any).limit(2000).toArray()
  res.json({
    data: {
      items: items.map((d: any) => ({
        ...d,
        _id: String(d._id),
        projectId: String(d.projectId),
        boardId: String(d.boardId),
        columnId: String(d.columnId),
        sprintId: d.sprintId ? String(d.sprintId) : null,
        epicId: d.epicId ? String(d.epicId) : null,
        type: normIssueType(d.type),
        priority: normPriority(d.priority),
        createdAt: toIsoOrNull(d.createdAt),
        updatedAt: toIsoOrNull(d.updatedAt),
      })),
    },
    error: null,
  })
})

const issueCommentCreateSchema = z.object({
  body: z.string().min(1).max(8000),
})

// GET /api/stratflow/issues/:issueId/comments
stratflowRouter.get('/issues/:issueId/comments', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureStratflowIndexes(db)
  const auth = req.auth as { userId: string; email: string }
  const iid = objIdOrNull(String(req.params.issueId || ''))
  if (!iid) return res.status(400).json({ data: null, error: 'invalid_issue_id' })

  const issue = await db.collection('sf_issues').findOne({ _id: iid } as any)
  if (!issue) return res.status(404).json({ data: null, error: 'not_found' })
  const project = await loadProjectForUser(db, issue.projectId as any, auth.userId)
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })

  const items = await db
    .collection('sf_issue_comments')
    .find({ issueId: iid } as any)
    .sort({ createdAt: 1 } as any)
    .limit(2000)
    .toArray()

  res.json({
    data: {
      items: items.map((d: any) => ({
        ...d,
        _id: String(d._id),
        projectId: String(d.projectId),
        issueId: String(d.issueId),
        createdAt: toIsoOrNull(d.createdAt),
      })),
    },
    error: null,
  })
})

// POST /api/stratflow/issues/:issueId/comments
stratflowRouter.post('/issues/:issueId/comments', async (req: any, res) => {
  const parsed = issueCommentCreateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() })
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  await ensureStratflowIndexes(db)
  const auth = req.auth as { userId: string; email: string }
  const iid = objIdOrNull(String(req.params.issueId || ''))
  if (!iid) return res.status(400).json({ data: null, error: 'invalid_issue_id' })

  const issue = await db.collection('sf_issues').findOne({ _id: iid } as any)
  if (!issue) return res.status(404).json({ data: null, error: 'not_found' })
  const project = await loadProjectForUser(db, issue.projectId as any, auth.userId)
  if (project === 'forbidden') return res.status(403).json({ data: null, error: 'forbidden' })
  if (!project) return res.status(404).json({ data: null, error: 'not_found' })

  const now = new Date()
  const doc: IssueCommentDoc = {
    _id: new ObjectId(),
    projectId: issue.projectId,
    issueId: iid,
    authorId: auth.userId,
    body: parsed.data.body.trim(),
    createdAt: now,
  }

  await db.collection('sf_issue_comments').insertOne(doc as any)
  res.status(201).json({ data: { _id: String(doc._id) }, error: null })
})

