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

const surveyProgramSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['NPS', 'CSAT', 'Post‑interaction']),
  channel: z.enum(['Email', 'In‑app', 'Link']),
  status: z.enum(['Draft', 'Active', 'Paused']),
  description: z.string().max(2000).optional(),
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

  const result = await db
    .collection<SurveyProgramDoc>('survey_programs')
    .findOneAndUpdate({ _id }, { $set: update }, { returnDocument: 'after' })

  if (!result.value) {
    return res.status(404).json({ data: null, error: 'not_found' })
  }

  res.json({
    data: {
      ...result.value,
      _id: String(result.value._id),
    },
    error: null,
  })
})


