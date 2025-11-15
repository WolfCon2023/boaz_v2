import { Router } from 'express'
import { getDb } from '../db.js'
import { ObjectId, SortDirection } from 'mongodb'
import { z } from 'zod'

export const surveysRouter = Router()

type SurveyProgramDoc = {
  _id?: ObjectId
  name: string
  type: 'NPS' | 'CSAT' | 'Post‑interaction'
  channel: 'Email' | 'In‑app' | 'Link'
  status: 'Draft' | 'Active' | 'Paused'
  description?: string
  createdAt: Date
  updatedAt: Date
  lastSentAt?: Date | null
  responseRate?: number | null
}

type SurveyResponseDoc = {
  _id?: ObjectId
  programId: ObjectId
  type: SurveyProgramDoc['type']
  channel: SurveyProgramDoc['channel']
  score: number
  comment?: string
  contactId?: ObjectId | null
  accountId?: ObjectId | null
  ticketId?: ObjectId | null
  outreachEnrollmentId?: ObjectId | null
  createdAt: Date
}

const surveyProgramSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['NPS', 'CSAT', 'Post‑interaction']),
  channel: z.enum(['Email', 'In‑app', 'Link']),
  status: z.enum(['Draft', 'Active', 'Paused']),
  description: z.string().max(2000).optional(),
})

const surveyResponseSchema = z.object({
  score: z.number().min(0).max(10),
  comment: z.string().max(4000).optional(),
  contactId: z.string().optional(),
  accountId: z.string().optional(),
  ticketId: z.string().optional(),
  outreachEnrollmentId: z.string().optional(),
})

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
      items: items.map((p) => ({
        ...p,
        _id: String(p._id),
      })),
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

  const doc: SurveyResponseDoc = {
    programId,
    type: program.type,
    channel: program.channel,
    score: parsed.data.score,
    comment: parsed.data.comment,
    contactId: toObjectId(parsed.data.contactId),
    accountId: toObjectId(parsed.data.accountId),
    ticketId: toObjectId(parsed.data.ticketId),
    outreachEnrollmentId: toObjectId(parsed.data.outreachEnrollmentId),
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


