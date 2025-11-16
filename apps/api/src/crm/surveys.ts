import { Router } from 'express'
import { getDb } from '../db.js'
import { ObjectId, SortDirection } from 'mongodb'
import { z } from 'zod'

export const surveysRouter = Router()

type SurveyQuestionDoc = {
  id: string
  label: string
  required?: boolean
  order?: number
}

type SurveyProgramDoc = {
  _id?: ObjectId
  name: string
  type: 'NPS' | 'CSAT' | 'Post‑interaction'
  channel: 'Email' | 'In‑app' | 'Link'
  status: 'Draft' | 'Active' | 'Paused'
  description?: string
  // Legacy single-question fields (still populated from the first question for compatibility)
  questionText?: string
  scaleHelpText?: string
  // New multi-question support
  questions?: SurveyQuestionDoc[]
  createdAt: Date
  updatedAt: Date
  lastSentAt?: Date | null
  responseRate?: number | null
}

type SurveyAnswerDoc = {
  questionId: string
  label?: string
  score: number
}

type SurveyResponseDoc = {
  _id?: ObjectId
  programId: ObjectId
  type: SurveyProgramDoc['type']
  channel: SurveyProgramDoc['channel']
  // Overall score for this response (average of answers when multi‑question)
  score: number
  // Optional per‑question answers for multi‑question surveys
  answers?: SurveyAnswerDoc[]
  comment?: string
  contactId?: ObjectId | null
  accountId?: ObjectId | null
  ticketId?: ObjectId | null
  outreachEnrollmentId?: ObjectId | null
  createdAt: Date
}

const surveyQuestionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().optional(),
  order: z.number().int().nonnegative().optional(),
})

const surveyProgramSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['NPS', 'CSAT', 'Post‑interaction']),
  channel: z.enum(['Email', 'In‑app', 'Link']),
  status: z.enum(['Draft', 'Active', 'Paused']),
  description: z.string().max(2000).optional(),
  questionText: z.string().max(500).optional(),
  scaleHelpText: z.string().max(500).optional(),
  questions: z.array(surveyQuestionSchema).optional(),
})

const surveyAnswerSchema = z.object({
  questionId: z.string().min(1),
  score: z.number().min(0).max(10),
})

const surveyResponseSchema = z
  .object({
    score: z.number().min(0).max(10).optional(),
    answers: z.array(surveyAnswerSchema).optional(),
    comment: z.string().max(4000).optional(),
    contactId: z.string().optional(),
    accountId: z.string().optional(),
    ticketId: z.string().optional(),
    outreachEnrollmentId: z.string().optional(),
  })
  .refine(
    (v) => typeof v.score === 'number' || (v.answers && v.answers.length > 0),
    { message: 'score_or_answers_required' },
  )

// GET /api/crm/surveys/programs?type=&status=&q=&sort=&dir=
surveysRouter.get('/programs', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })

  const type = String((req.query.type as string) ?? '').trim()
  const status = String((req.query.status as string) ?? '').trim()
  const q = String((req.query.q as string) ?? '').trim()
  const sortKeyRaw = (req.query.sort as string) ?? 'createdAt'
  const dirParam = ((req.query.dir as string) ?? 'desc').toLowerCase()
  const dir: SortDirection = dirParam === 'asc' ? 1 : -1

  const allowedSort = new Set(['createdAt', 'updatedAt', 'name', 'lastSentAt'])
  const sortField = allowedSort.has(sortKeyRaw) ? sortKeyRaw : 'createdAt'

  const filter: Record<string, unknown> = {}
  if (type) filter.type = type
  if (status) filter.status = status
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ]
  }

  const items = await db
    .collection<SurveyProgramDoc>('survey_programs')
    .find(filter)
    .sort({ [sortField]: dir })
    .limit(500)
    .toArray()

  res.json({
    data: {
      items: items.map((p) => {
        // Ensure questions are always present in the payload so the UI can re‑hydrate
        let questions = p.questions ?? []
        if ((!questions || questions.length === 0) && p.questionText) {
          questions = [
            {
              id: 'q1',
              label: p.questionText,
              required: true,
              order: 0,
            },
          ]
        }

        return {
          ...p,
          questions,
          _id: String(p._id),
        }
      }),
    },
    error: null,
  })
})

// POST /api/crm/surveys/programs/:id/responses
surveysRouter.post('/programs/:id/responses', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  let programId: ObjectId
  try {
    programId = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const parsed = surveyResponseSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload' })
  }

  const program = await db.collection<SurveyProgramDoc>('survey_programs').findOne({ _id: programId })
  if (!program) {
    return res.status(404).json({ data: null, error: 'program_not_found' })
  }

  const now = new Date()

  const toObjectId = (v?: string) => {
    if (!v) return null
    try {
      return new ObjectId(v)
    } catch {
      return null
    }
  }

  const body = parsed.data
  const answers: SurveyAnswerDoc[] | undefined = body.answers?.map((a) => ({
    questionId: a.questionId,
    score: a.score,
  }))

  let overallScore: number
  if (answers && answers.length > 0) {
    const sum = answers.reduce((acc, a) => acc + a.score, 0)
    overallScore = sum / answers.length
  } else {
    // Fallback to single score payloads (existing integrations)
    overallScore = body.score as number
  }

  const doc: SurveyResponseDoc = {
    programId,
    type: program.type,
    channel: program.channel,
    score: overallScore,
    answers,
    comment: body.comment,
    contactId: toObjectId(body.contactId),
    accountId: toObjectId(body.accountId),
    ticketId: toObjectId(body.ticketId),
    outreachEnrollmentId: toObjectId(body.outreachEnrollmentId),
    createdAt: now,
  }

  await db.collection<SurveyResponseDoc>('survey_responses').insertOne(doc)

  // If this response is tied to a support ticket, append a system comment so the
  // ticket history clearly shows that a survey response was logged.
  if (doc.ticketId) {
    try {
      const comment = {
        author: 'system',
        body: `Survey response logged for "${program.name}" (type: ${program.type}) with score ${doc.score}${
          doc.comment ? ` – ${doc.comment}` : ''
        }`,
        at: now,
      }
      await db
        .collection('support_tickets')
        .updateOne(
          { _id: doc.ticketId },
          {
            $push: { comments: comment as any },
            $set: { updatedAt: now },
          } as any,
        )
    } catch (e) {
      console.error('Failed to append survey comment to ticket history:', e)
      // Do not fail the main response insert just because comment logging failed
    }
  }

  res.status(201).json({ data: { ok: true }, error: null })
})

// GET /api/crm/surveys/tickets/:ticketId/responses - latest responses for a ticket
surveysRouter.get('/tickets/:ticketId/responses', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  let ticketId: ObjectId
  try {
    ticketId = new ObjectId(req.params.ticketId)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_ticket_id' })
  }

  try {
    const responses = await db
      .collection<SurveyResponseDoc>('survey_responses')
      .find({ ticketId })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray()

    if (responses.length === 0) {
      return res.json({ data: { items: [] }, error: null })
    }

    const programIds = Array.from(
      new Set<string>(responses.map((r) => String(r.programId))),
    ).map((id) => new ObjectId(id))

    const programs = await db
      .collection<SurveyProgramDoc>('survey_programs')
      .find({ _id: { $in: programIds } })
      .project({ name: 1, type: 1 })
      .toArray()

    const programMap = new Map<string, { name: string; type: SurveyProgramDoc['type'] }>(
      programs.map((p: any) => [String(p._id), { name: p.name, type: p.type }]),
    )

    // Keep only the latest response per program
    const latestByProgram = new Map<string, SurveyResponseDoc>()
    for (const r of responses) {
      const key = String(r.programId)
      if (!latestByProgram.has(key)) {
        latestByProgram.set(key, r)
      }
    }

    const items = Array.from(latestByProgram.entries()).map(([programIdStr, r]) => {
      const meta = programMap.get(programIdStr)
      return {
        _id: String(r._id),
        programId: programIdStr,
        programName: meta?.name ?? programIdStr,
        programType: meta?.type ?? r.type,
        score: r.score,
        comment: r.comment ?? null,
        createdAt: r.createdAt,
      }
    })

    res.json({ data: { items }, error: null })
  } catch (err: any) {
    console.error('Get ticket survey responses error:', err)
    res
      .status(500)
      .json({ data: null, error: err.message || 'failed_to_get_ticket_responses' })
  }
})

// GET /api/crm/surveys/programs/:id/summary
surveysRouter.get('/programs/:id/summary', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  let programId: ObjectId
  try {
    programId = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const program = await db.collection<SurveyProgramDoc>('survey_programs').findOne({ _id: programId })
  if (!program) {
    return res.status(404).json({ data: null, error: 'program_not_found' })
  }

  const responses = await db
    .collection<SurveyResponseDoc>('survey_responses')
    .find({ programId })
    .sort({ createdAt: -1 })
    .limit(1000)
    .toArray()

  const total = responses.length

  let summary: any = {
    totalResponses: total,
  }

  if (total === 0) {
    return res.json({ data: summary, error: null })
  }

  if (program.type === 'NPS') {
    let detractors = 0
    let passives = 0
    let promoters = 0

    for (const r of responses) {
      if (r.score <= 6) detractors++
      else if (r.score <= 8) passives++
      else promoters++
    }

    const detPct = (detractors / total) * 100
    const promPct = (promoters / total) * 100

    summary = {
      ...summary,
      detractors,
      passives,
      promoters,
      detractorsPct: detPct,
      passivesPct: (passives / total) * 100,
      promotersPct: promPct,
      nps: Math.round(promPct - detPct),
    }
  } else {
    const sum = responses.reduce((acc, r) => acc + r.score, 0)
    const avg = sum / total

    const buckets: Record<string, number> = {}
    for (const r of responses) {
      const key = String(r.score)
      buckets[key] = (buckets[key] ?? 0) + 1
    }

    summary = {
      ...summary,
      averageScore: avg,
      distribution: buckets,
    }
  }

  // Per-question averages for multi-question surveys
  const questionMeta = new Map<string, string>()
  for (const q of program.questions ?? []) {
    questionMeta.set(q.id, q.label)
  }

  const perQuestion = new Map<string, { total: number; count: number }>()
  for (const r of responses) {
    if (!r.answers) continue
    for (const a of r.answers) {
      const key = a.questionId
      const agg = perQuestion.get(key) ?? { total: 0, count: 0 }
      agg.total += a.score
      agg.count += 1
      perQuestion.set(key, agg)
    }
  }

  if (perQuestion.size > 0) {
    summary.questions = Array.from(perQuestion.entries()).map(([questionId, agg]) => ({
      questionId,
      label: questionMeta.get(questionId) ?? questionId,
      averageScore: agg.total / agg.count,
      responses: agg.count,
    }))
  }

  res.json({ data: summary, error: null })
})
// POST /api/crm/surveys/programs
surveysRouter.post('/programs', async (req, res) => {
  const parsed = surveyProgramSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload' })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const now = new Date()
  const doc: SurveyProgramDoc = {
    ...parsed.data,
    createdAt: now,
    updatedAt: now,
    lastSentAt: null,
    responseRate: null,
  }

  const result = await db.collection<SurveyProgramDoc>('survey_programs').insertOne(doc)

  res.status(201).json({
    data: {
      ...doc,
      _id: String(result.insertedId),
    },
    error: null,
  })
})

// PUT /api/crm/surveys/programs/:id
surveysRouter.put('/programs/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  let _id: ObjectId
  try {
    _id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  const parsed = surveyProgramSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: 'invalid_payload' })
  }

  const update: Partial<SurveyProgramDoc> = {
    ...parsed.data,
    updatedAt: new Date(),
  }

  const coll = db.collection<SurveyProgramDoc>('survey_programs')

  const existing = await coll.findOne({ _id })
  if (!existing) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  await coll.updateOne({ _id }, { $set: update })

  const updated: SurveyProgramDoc = {
    ...existing,
    ...update,
    _id,
  }

  res.json({
    data: {
      ...updated,
      _id: String(updated._id),
    },
    error: null,
  })
})

// DELETE /api/crm/surveys/programs/:id
surveysRouter.delete('/programs/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  let _id: ObjectId
  try {
    _id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }

  try {
    const result = await db.collection<SurveyProgramDoc>('survey_programs').deleteOne({ _id })

    // Also remove any responses tied to this program to avoid orphaned data
    await db.collection<SurveyResponseDoc>('survey_responses').deleteMany({ programId: _id })

    if (result.deletedCount === 0) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }

    return res.json({ data: { ok: true }, error: null })
  } catch (err: any) {
    console.error('Delete survey program error:', err)
    return res.status(500).json({ data: null, error: err.message || 'failed_to_delete_program' })
  }
})


