import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { getDb } from './db.js'
import { requireAuth } from './auth/rbac.js'

export const viewsRouter = Router()

// ── Saved Views (user-scoped) ───────────────────────────────────────────

// GET /api/views?viewKey=deals
viewsRouter.get('/views', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  const userId = (req as any).auth.userId as string
  const viewKey = String((req.query.viewKey as string) ?? '').trim()
  const filter: any = { userId }
  if (viewKey) filter.viewKey = viewKey
  const items = await db.collection('views').find(filter).sort({ createdAt: -1 }).toArray()
  res.json({ data: { items }, error: null })
})

// POST /api/views { viewKey, name, config }
viewsRouter.post('/views', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const userId = (req as any).auth.userId as string
  const { viewKey, name, config } = req.body ?? {}
  if (!viewKey || typeof viewKey !== 'string') return res.status(400).json({ data: null, error: 'invalid_viewKey' })
  if (!name || typeof name !== 'string') return res.status(400).json({ data: null, error: 'invalid_name' })
  const doc = { userId, viewKey: viewKey.trim(), name: name.trim(), config: config ?? {}, createdAt: new Date(), updatedAt: new Date() }
  const r = await db.collection('views').insertOne(doc)
  res.json({ data: { _id: r.insertedId, ...doc }, error: null })
})

// PUT /api/views/:id { name?, config? }
viewsRouter.put('/views/:id', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const userId = (req as any).auth.userId as string
  const id = String(req.params.id || '')
  if (!ObjectId.isValid(id)) return res.status(400).json({ data: null, error: 'invalid_id' })
  const { name, config } = req.body ?? {}
  const update: any = { updatedAt: new Date() }
  if (typeof name === 'string') update.name = name
  if (config !== undefined) update.config = config
  // Only allow updating own views
  await db.collection('views').updateOne({ _id: new ObjectId(id), userId }, { $set: update })
  const doc = await db.collection('views').findOne({ _id: new ObjectId(id), userId })
  res.json({ data: doc, error: null })
})

// DELETE /api/views/:id
viewsRouter.delete('/views/:id', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const userId = (req as any).auth.userId as string
  const id = String(req.params.id || '')
  if (!ObjectId.isValid(id)) return res.status(400).json({ data: null, error: 'invalid_id' })
  // Only allow deleting own views
  await db.collection('views').deleteOne({ _id: new ObjectId(id), userId })
  res.json({ data: { ok: true }, error: null })
})

// ── Column Preferences (user-scoped) ────────────────────────────────────

// GET /api/column-prefs?pageKey=contacts
viewsRouter.get('/column-prefs', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: null, error: null })
  const userId = (req as any).auth.userId as string
  const pageKey = String((req.query.pageKey as string) ?? '').trim()
  if (!pageKey) return res.status(400).json({ data: null, error: 'invalid_pageKey' })
  const doc = await db.collection('column_prefs').findOne({ userId, pageKey })
  res.json({ data: doc?.columns ?? null, error: null })
})

// PUT /api/column-prefs { pageKey, columns }
viewsRouter.put('/column-prefs', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const userId = (req as any).auth.userId as string
  const { pageKey, columns } = req.body ?? {}
  if (!pageKey || typeof pageKey !== 'string') return res.status(400).json({ data: null, error: 'invalid_pageKey' })
  if (!Array.isArray(columns)) return res.status(400).json({ data: null, error: 'invalid_columns' })
  await db.collection('column_prefs').updateOne(
    { userId, pageKey },
    { $set: { userId, pageKey, columns, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  )
  res.json({ data: { ok: true }, error: null })
})
