import { Router } from 'express'
import multer, { FileFilterCallback } from 'multer'
import fs from 'fs'
import path from 'path'
import { getDb } from '../db.js'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { requireAuth, requirePermission } from '../auth/rbac.js'
import { env } from '../env.js'

export const documentsRouter = Router()

// Setup upload directory
const uploadDir = env.UPLOAD_DIR ? path.join(env.UPLOAD_DIR, 'documents') : path.join(process.cwd(), 'uploads', 'documents')
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }
} catch (err) {
  console.error('Failed to create documents upload directory:', err)
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (_req: any, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => cb(null, uploadDir),
  filename: (_req: any, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')
    const ts = Date.now()
    const ext = path.extname(safe)
    const name = path.basename(safe, ext)
    cb(null, `${ts}-${name}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (_req: any, file: Express.Multer.File, cb: FileFilterCallback) => {
    // Allow most file types for documents
    cb(null, true)
  },
})

// Types
type DocumentVersion = {
  _id: ObjectId
  version: number
  filename: string
  originalFilename: string
  contentType: string
  size: number
  path: string
  uploadedBy: ObjectId
  uploadedByName?: string
  uploadedByEmail?: string
  uploadedAt: Date
  description?: string
}

type DocumentPermission = {
  userId: ObjectId
  userName?: string
  userEmail?: string
  permission: 'view' | 'edit' | 'delete'
  grantedBy: ObjectId
  grantedAt: Date
}

type Document = {
  _id: ObjectId
  name: string
  description?: string
  category?: string
  tags?: string[]
  currentVersion: number
  versions: DocumentVersion[]
  permissions: DocumentPermission[]
  // Public access: if true, all authenticated users can view
  isPublic: boolean
  // Owner has full control
  ownerId: ObjectId
  ownerName?: string
  ownerEmail?: string
  createdAt: Date
  updatedAt: Date
  // Related entities (optional)
  relatedTo?: {
    type: 'account' | 'contact' | 'deal' | 'quote' | 'invoice'
    id: ObjectId
  }
}

// Helper function to check if user has permission
async function hasPermission(
  db: any,
  document: Document,
  userId: string,
  requiredPermission: 'view' | 'edit' | 'delete'
): Promise<boolean> {
  // Owner has all permissions
  if (String(document.ownerId) === userId) return true

  // Public documents: all authenticated users can view
  if (document.isPublic && requiredPermission === 'view') return true

  // Check explicit permissions
  const userPerm = document.permissions.find(p => String(p.userId) === userId)
  if (!userPerm) return false

  const permLevels = { view: 1, edit: 2, delete: 3 }
  return permLevels[userPerm.permission] >= permLevels[requiredPermission]
}

// GET /api/crm/documents - List documents
documentsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = (req as any).auth as { userId: string; email: string }
    const userId = new ObjectId(auth.userId)

    const { q, category, tag, relatedTo, relatedId, sort = 'updatedAt', dir = 'desc' } = req.query as {
      q?: string
      category?: string
      tag?: string
      relatedTo?: string
      relatedId?: string
      sort?: string
      dir?: 'asc' | 'desc'
    }

    const page = Math.max(0, Number(req.query.page ?? 0))
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 25)))

    // Build filter
    const filter: any = {
      $or: [
        { ownerId: userId },
        { isPublic: true },
        { 'permissions.userId': userId },
      ],
    }

    if (q && q.trim()) {
      filter.$and = filter.$and || []
      filter.$and.push({
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { ownerName: { $regex: q, $options: 'i' } },
          { ownerEmail: { $regex: q, $options: 'i' } },
        ],
      })
    }

    if (category) {
      filter.category = category
    }

    if (tag) {
      filter.tags = tag
    }

    if (relatedTo && relatedId) {
      try {
        filter['relatedTo.type'] = relatedTo
        filter['relatedTo.id'] = new ObjectId(relatedId)
      } catch {
        // Invalid ObjectId, ignore
      }
    }

    const sortObj: any = {}
    sortObj[sort] = dir === 'asc' ? 1 : -1

    const total = await db.collection<Document>('documents').countDocuments(filter)
    const items = await db
      .collection<Document>('documents')
      .find(filter)
      .sort(sortObj)
      .skip(page * limit)
      .limit(limit)
      .toArray()

    // Filter out documents user doesn't have view permission for
    const accessibleItems = []
    for (const doc of items) {
      if (await hasPermission(db, doc, auth.userId, 'view')) {
        accessibleItems.push(doc)
      }
    }

    res.json({
      data: {
        items: accessibleItems.map(d => ({
          _id: d._id,
          name: d.name,
          description: d.description,
          category: d.category,
          tags: d.tags,
          currentVersion: d.currentVersion,
          versionCount: d.versions.length,
          latestVersion: d.versions[d.versions.length - 1],
          ownerId: d.ownerId,
          ownerName: d.ownerName,
          ownerEmail: d.ownerEmail,
          isPublic: d.isPublic,
          relatedTo: d.relatedTo ? {
            type: d.relatedTo.type,
            id: String(d.relatedTo.id),
          } : undefined,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
        page,
        pageSize: limit,
        total,
      },
      error: null,
    })
  } catch (e: any) {
    console.error('Documents list error:', e)
    res.status(500).json({ data: null, error: 'list_failed' })
  }
})

// POST /api/crm/documents - Create new document (upload first version)
documentsRouter.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = (req as any).auth as { userId: string; email: string }
    const userId = new ObjectId(auth.userId)

    const file = (req as any).file as Express.Multer.File | undefined
    if (!file) {
      return res.status(400).json({ data: null, error: 'no_file' })
    }

    // Parse tags, isPublic, and relatedTo from FormData
    let body = { ...req.body }
    if (typeof body.tags === 'string') {
      try {
        body.tags = JSON.parse(body.tags)
      } catch {
        // If not JSON, treat as comma-separated
        body.tags = body.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      }
    }
    if (typeof body.isPublic === 'string') {
      body.isPublic = body.isPublic === 'true' || body.isPublic === 'on'
    }
    if (typeof body.relatedTo === 'string') {
      try {
        body.relatedTo = JSON.parse(body.relatedTo)
      } catch {
        // Invalid JSON, ignore
        body.relatedTo = undefined
      }
    }

    const schema = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      isPublic: z.boolean().optional(),
      relatedTo: z.object({
        type: z.enum(['account', 'contact', 'deal', 'quote', 'invoice']),
        id: z.string(),
      }).optional(),
    })

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      // Delete uploaded file if validation fails
      try {
        if (file.path) fs.unlinkSync(file.path)
      } catch {}
      return res.status(400).json({ data: null, error: 'invalid_payload' })
    }

    const { name, description, category, tags, isPublic, relatedTo } = parsed.data

    // Get user info
    const user = await db.collection('users').findOne({ _id: userId })

    // Create first version
    const version: DocumentVersion = {
      _id: new ObjectId(),
      version: 1,
      filename: file.filename,
      originalFilename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
      path: file.path,
      uploadedBy: userId,
      uploadedByName: (user as any)?.name,
      uploadedByEmail: auth.email,
      uploadedAt: new Date(),
    }

    // Create document
    const document: Document = {
      _id: new ObjectId(),
      name,
      description,
      category,
      tags: tags || [],
      currentVersion: 1,
      versions: [version],
      permissions: [],
      isPublic: isPublic || false,
      ownerId: userId,
      ownerName: (user as any)?.name,
      ownerEmail: auth.email,
      createdAt: new Date(),
      updatedAt: new Date(),
      relatedTo: relatedTo ? {
        type: relatedTo.type,
        id: new ObjectId(relatedTo.id),
      } : undefined,
    }

    await db.collection<Document>('documents').insertOne(document)

    res.status(201).json({
      data: {
        _id: document._id,
        name: document.name,
        description: document.description,
        category: document.category,
        tags: document.tags,
        currentVersion: document.currentVersion,
        latestVersion: version,
        ownerId: document.ownerId,
        ownerName: document.ownerName,
        ownerEmail: document.ownerEmail,
        isPublic: document.isPublic,
        relatedTo: document.relatedTo,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      },
      error: null,
    })
  } catch (e: any) {
    console.error('Document creation error:', e)
    // Try to clean up uploaded file
    const file = (req as any).file as Express.Multer.File | undefined
    if (file?.path) {
      try {
        fs.unlinkSync(file.path)
      } catch {}
    }
    res.status(500).json({ data: null, error: 'creation_failed' })
  }
})

// GET /api/crm/documents/:id - Get document details
documentsRouter.get('/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = (req as any).auth as { userId: string; email: string }
    const _id = new ObjectId(req.params.id)

    const document = await db.collection<Document>('documents').findOne({ _id })
    if (!document) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }

    // Check permission
    if (!(await hasPermission(db, document, auth.userId, 'view'))) {
      return res.status(403).json({ data: null, error: 'access_denied' })
    }

    res.json({ data: document, error: null })
  } catch (e: any) {
    if (e.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: 'fetch_failed' })
  }
})

// GET /api/crm/documents/:id/download/:versionId - Download specific version
documentsRouter.get('/:id/download/:versionId', requireAuth, async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = (req as any).auth as { userId: string; email: string }
    const _id = new ObjectId(req.params.id)
    const versionId = new ObjectId(req.params.versionId)

    const document = await db.collection<Document>('documents').findOne({ _id })
    if (!document) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }

    // Check permission
    if (!(await hasPermission(db, document, auth.userId, 'view'))) {
      return res.status(403).json({ data: null, error: 'access_denied' })
    }

    const version = document.versions.find(v => String(v._id) === String(versionId))
    if (!version) {
      return res.status(404).json({ data: null, error: 'version_not_found' })
    }

    if (!fs.existsSync(version.path)) {
      return res.status(404).json({ data: null, error: 'file_not_found' })
    }

    res.setHeader('Content-Type', version.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${version.originalFilename}"`)
    res.sendFile(path.resolve(version.path))
  } catch (e: any) {
    if (e.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: 'download_failed' })
  }
})

// GET /api/crm/documents/:id/download - Download latest version
documentsRouter.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = (req as any).auth as { userId: string; email: string }
    const _id = new ObjectId(req.params.id)

    const document = await db.collection<Document>('documents').findOne({ _id })
    if (!document) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }

    // Check permission
    if (!(await hasPermission(db, document, auth.userId, 'view'))) {
      return res.status(403).json({ data: null, error: 'access_denied' })
    }

    const latestVersion = document.versions[document.versions.length - 1]
    if (!latestVersion) {
      return res.status(404).json({ data: null, error: 'no_versions' })
    }

    if (!fs.existsSync(latestVersion.path)) {
      return res.status(404).json({ data: null, error: 'file_not_found' })
    }

    res.setHeader('Content-Type', latestVersion.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${latestVersion.originalFilename}"`)
    res.sendFile(path.resolve(latestVersion.path))
  } catch (e: any) {
    if (e.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: 'download_failed' })
  }
})

// POST /api/crm/documents/:id/versions - Upload new version
documentsRouter.post('/:id/versions', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = (req as any).auth as { userId: string; email: string }
    const userId = new ObjectId(auth.userId)
    const _id = new ObjectId(req.params.id)

    const file = (req as any).file as Express.Multer.File | undefined
    if (!file) {
      return res.status(400).json({ data: null, error: 'no_file' })
    }

    const schema = z.object({
      description: z.string().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      try {
        if (file.path) fs.unlinkSync(file.path)
      } catch {}
      return res.status(400).json({ data: null, error: 'invalid_payload' })
    }

    const document = await db.collection<Document>('documents').findOne({ _id })
    if (!document) {
      try {
        if (file.path) fs.unlinkSync(file.path)
      } catch {}
      return res.status(404).json({ data: null, error: 'not_found' })
    }

    // Check permission
    if (!(await hasPermission(db, document, auth.userId, 'edit'))) {
      try {
        if (file.path) fs.unlinkSync(file.path)
      } catch {}
      return res.status(403).json({ data: null, error: 'access_denied' })
    }

    const user = await db.collection('users').findOne({ _id: userId })

    // Create new version
    const newVersion: DocumentVersion = {
      _id: new ObjectId(),
      version: document.currentVersion + 1,
      filename: file.filename,
      originalFilename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
      path: file.path,
      uploadedBy: userId,
      uploadedByName: (user as any)?.name,
      uploadedByEmail: auth.email,
      uploadedAt: new Date(),
      description: parsed.data.description,
    }

    await db.collection<Document>('documents').updateOne(
      { _id },
      {
        $push: { versions: newVersion },
        $set: {
          currentVersion: newVersion.version,
          updatedAt: new Date(),
        },
      }
    )

    res.status(201).json({ data: { version: newVersion }, error: null })
  } catch (e: any) {
    console.error('Version upload error:', e)
    const file = (req as any).file as Express.Multer.File | undefined
    if (file?.path) {
      try {
        fs.unlinkSync(file.path)
      } catch {}
    }
    if (e.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: 'upload_failed' })
  }
})

// PUT /api/crm/documents/:id - Update document metadata
documentsRouter.put('/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = (req as any).auth as { userId: string; email: string }
    const _id = new ObjectId(req.params.id)

    const schema = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      isPublic: z.boolean().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ data: null, error: 'invalid_payload' })
    }

    const document = await db.collection<Document>('documents').findOne({ _id })
    if (!document) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }

    // Check permission (owner or edit permission)
    if (String(document.ownerId) !== auth.userId && !(await hasPermission(db, document, auth.userId, 'edit'))) {
      return res.status(403).json({ data: null, error: 'access_denied' })
    }

    const update: any = { ...parsed.data, updatedAt: new Date() }
    await db.collection<Document>('documents').updateOne({ _id }, { $set: update })

    res.json({ data: { ok: true }, error: null })
  } catch (e: any) {
    if (e.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: 'update_failed' })
  }
})

// POST /api/crm/documents/:id/permissions - Add/update permission
documentsRouter.post('/:id/permissions', requireAuth, async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = (req as any).auth as { userId: string; email: string }
    const userId = new ObjectId(auth.userId)
    const _id = new ObjectId(req.params.id)

    const schema = z.object({
      userId: z.string(),
      permission: z.enum(['view', 'edit', 'delete']),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ data: null, error: 'invalid_payload' })
    }

    const document = await db.collection<Document>('documents').findOne({ _id })
    if (!document) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }

    // Only owner can manage permissions
    if (String(document.ownerId) !== auth.userId) {
      return res.status(403).json({ data: null, error: 'access_denied' })
    }

    const targetUserId = new ObjectId(parsed.data.userId)
    const targetUser = await db.collection('users').findOne({ _id: targetUserId })
    if (!targetUser) {
      return res.status(404).json({ data: null, error: 'user_not_found' })
    }

    // Remove existing permission for this user
    await db.collection<Document>('documents').updateOne(
      { _id },
      { $pull: { permissions: { userId: targetUserId } } }
    )

    // Add new permission
    const permission: DocumentPermission = {
      userId: targetUserId,
      userName: (targetUser as any)?.name,
      userEmail: (targetUser as any)?.email,
      permission: parsed.data.permission,
      grantedBy: userId,
      grantedAt: new Date(),
    }

    await db.collection<Document>('documents').updateOne(
      { _id },
      { $push: { permissions: permission } }
    )

    res.json({ data: { permission }, error: null })
  } catch (e: any) {
    if (e.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: 'permission_update_failed' })
  }
})

// DELETE /api/crm/documents/:id/permissions/:userId - Remove permission
documentsRouter.delete('/:id/permissions/:userId', requireAuth, async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = (req as any).auth as { userId: string; email: string }
    const _id = new ObjectId(req.params.id)
    const targetUserId = new ObjectId(req.params.userId)

    const document = await db.collection<Document>('documents').findOne({ _id })
    if (!document) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }

    // Only owner can manage permissions
    if (String(document.ownerId) !== auth.userId) {
      return res.status(403).json({ data: null, error: 'access_denied' })
    }

    await db.collection<Document>('documents').updateOne(
      { _id },
      { $pull: { permissions: { userId: targetUserId } } }
    )

    res.json({ data: { ok: true }, error: null })
  } catch (e: any) {
    if (e.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: 'permission_remove_failed' })
  }
})

// DELETE /api/crm/documents/:id - Delete document
documentsRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = (req as any).auth as { userId: string; email: string }
    const _id = new ObjectId(req.params.id)

    const document = await db.collection<Document>('documents').findOne({ _id })
    if (!document) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }

    // Check permission (owner or delete permission)
    if (String(document.ownerId) !== auth.userId && !(await hasPermission(db, document, auth.userId, 'delete'))) {
      return res.status(403).json({ data: null, error: 'access_denied' })
    }

    // Delete all version files
    for (const version of document.versions) {
      try {
        if (fs.existsSync(version.path)) {
          fs.unlinkSync(version.path)
        }
      } catch (err) {
        console.error(`Failed to delete file ${version.path}:`, err)
      }
    }

    // Delete document record
    await db.collection<Document>('documents').deleteOne({ _id })

    res.json({ data: { ok: true }, error: null })
  } catch (e: any) {
    if (e.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: 'delete_failed' })
  }
})

