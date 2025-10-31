import { Router } from 'express'
import { z } from 'zod'
import { getDb } from '../db.js'
import { requireAuth } from './rbac.js'

export const preferencesRouter = Router()

const PrefsSchema = z.object({
  theme: z.enum(['light','dark']).optional(),
  layout: z.enum(['default','compact']).optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  dateFormat: z.enum(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']).optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
  emailNotifications: z.boolean().optional(),
})

preferencesRouter.get('/preferences/me', requireAuth, async (req, res) => {
  const db = await getDb(); if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const userId = (req as any).auth.userId as string
  const doc = await db.collection('preferences').findOne({ userId })
  res.json({ data: { preferences: doc?.data ?? {} }, error: null })
})

preferencesRouter.put('/preferences/me', requireAuth, async (req, res) => {
  const parsed = PrefsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const db = await getDb(); if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const userId = (req as any).auth.userId as string
  const update = { $set: { userId, data: parsed.data, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }
  await db.collection('preferences').updateOne({ userId }, update, { upsert: true } as any)
  res.json({ data: { ok: true }, error: null })
})


