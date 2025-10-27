import { Router } from 'express'
import multer, { FileFilterCallback } from 'multer'
import fs from 'fs'
import path from 'path'
import { getDb } from '../db.js'
import { ObjectId, Sort } from 'mongodb'
import { env } from '../env.js'

export const kbRouter = Router()
const uploadDir = env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

// Multer storage to Railway volume
const storage = multer.diskStorage({
  destination: (_req: any, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => cb(null, uploadDir),
  filename: (_req: any, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')
    const ts = Date.now()
    cb(null, `${ts}-${safe}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req: any, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/png',
      'image/jpeg',
    ]
    if (allowed.includes(file.mimetype)) return cb(null, true)
    return cb(new Error('unsupported_file_type'))
  },
})

// Types for strong updates
type KbAttachment = { _id: ObjectId | string; filename: string; contentType?: string; size?: number; path?: string; storage?: 'volume' | 'gridfs' | 's3' }
type KbArticle = { _id?: ObjectId; title: string; body: string; tags?: string[]; category?: string; attachments?: KbAttachment[]; createdAt?: Date; updatedAt?: Date; author?: any }

// GET /api/crm/support/kb?q=&tag=&category=&sort=&dir=
kbRouter.get('/kb', async (req, res) => {
  const db = await getDb()
  if (!db) return res.json({ data: { items: [] }, error: null })
  const q = String((req.query.q as string) ?? '').trim()
  const tag = String((req.query.tag as string) ?? '')
  const category = String((req.query.category as string) ?? '')
  const dir = ((req.query.dir as string) ?? 'desc').toLowerCase() === 'asc' ? 1 : -1
  const sortKey = (req.query.sort as string) ?? 'updatedAt'
  const sort: Sort = { [sortKey]: dir as 1 | -1 }
  const filter: any = {}
  if (q) filter.$or = [{ title: { $regex: q, $options: 'i' } }, { body: { $regex: q, $options: 'i' } }]
  if (tag) filter.tags = tag
  if (category) filter.category = category
  const items = await db.collection('kb_articles').find(filter).sort(sort).limit(200).toArray()
  res.json({ data: { items }, error: null })
})

// GET /api/crm/support/kb/:id
kbRouter.get('/kb/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const item = await db.collection('kb_articles').findOne({ _id })
    if (!item) return res.status(404).json({ data: null, error: 'not_found' })
    res.json({ data: { item }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// POST /api/crm/support/kb
kbRouter.post('/kb', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const body = typeof raw.body === 'string' ? raw.body : ''
  const tags = Array.isArray(raw.tags) ? raw.tags : []
  if (!title || !body) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const category = typeof raw.category === 'string' ? raw.category : 'Knowledge Sharing'
  const doc = { title, body, tags, category, createdAt: new Date(), updatedAt: new Date(), author: raw.author || 'system' }
  const r = await db.collection('kb_articles').insertOne(doc)
  res.status(201).json({ data: { _id: r.insertedId, ...doc }, error: null })
})

// PUT /api/crm/support/kb/:id
kbRouter.put('/kb/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const update: any = { updatedAt: new Date() }
    if (typeof req.body?.title === 'string') update.title = req.body.title
    if (typeof req.body?.body === 'string') update.body = req.body.body
    if (Array.isArray(req.body?.tags)) update.tags = req.body.tags
    if (typeof req.body?.category === 'string') update.category = req.body.category
    await db.collection('kb_articles').updateOne({ _id }, { $set: update })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// DELETE /api/crm/support/kb/:id
kbRouter.delete('/kb/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    await db.collection('kb_articles').deleteOne({ _id })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// POST /api/crm/support/kb/:id/attachments
kbRouter.post('/kb/:id/attachments', upload.single('file'), async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const file = (req as any).file as Express.Multer.File | undefined
    if (!file) return res.status(400).json({ data: null, error: 'no_file' })
    const att: KbAttachment = {
      _id: new ObjectId(),
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
      path: file.path,
      storage: 'volume' as const,
    }
    const coll = db.collection<KbArticle>('kb_articles')
    await coll.updateOne({ _id }, { $push: { attachments: att }, $set: { updatedAt: new Date() } })
    res.status(201).json({ data: { attachment: att }, error: null })
  } catch (e: any) {
    res.status(400).json({ data: null, error: 'upload_failed' })
  }
})

// GET /api/crm/support/kb/:id/attachments/:attId
kbRouter.get('/kb/:id/attachments/:attId', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const attId = req.params.attId
    const art = await db.collection('kb_articles').findOne({ _id }, { projection: { attachments: 1 } }) as any
    const att = (art?.attachments || []).find((a: any) => String(a._id) === attId)
    if (!att) return res.status(404).json({ data: null, error: 'not_found' })
    const filePath = att.path || path.join(uploadDir, att.filename)
    if (!fs.existsSync(filePath)) return res.status(404).json({ data: null, error: 'file_missing' })
    res.setHeader('Content-Type', att.contentType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `inline; filename="${att.filename}"`)
    fs.createReadStream(filePath).pipe(res)
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})

// DELETE /api/crm/support/kb/:id/attachments/:attId
kbRouter.delete('/kb/:id/attachments/:attId', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const attId = req.params.attId
    const coll = db.collection<KbArticle>('kb_articles')
    const art = await coll.findOne({ _id }, { projection: { attachments: 1 } as any })
    const att = (art?.attachments || []).find((a: any) => String(a._id) === attId)
    if (att?.path && fs.existsSync(att.path)) {
      try { fs.unlinkSync(att.path) } catch {}
    }
    const pullId: any = att?. _id ?? attId
    await coll.updateOne({ _id }, { $pull: { attachments: { _id: pullId } } as any, $set: { updatedAt: new Date() } as any })
    res.json({ data: { ok: true }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})


