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
  // Checkout/check-in fields
  checkedOutBy?: ObjectId
  checkedOutByName?: string
  checkedOutByEmail?: string
  checkedOutAt?: Date
}

// Types for document history
type DocumentHistoryEntry = {
  _id: ObjectId
  documentId: ObjectId
  eventType: 'created' | 'updated' | 'version_uploaded' | 'version_downloaded' | 'permission_added' | 'permission_updated' | 'permission_removed' | 'deleted' | 'field_changed' | 'checked_out' | 'checked_in'
  description: string
  userId?: string
  userName?: string
  userEmail?: string
  oldValue?: any
  newValue?: any
  metadata?: Record<string, any>
  createdAt: Date
}

// Helper function to add history entry
async function addDocumentHistory(
  db: any,
  documentId: ObjectId,
  eventType: DocumentHistoryEntry['eventType'],
  description: string,
  userId?: string,
  userName?: string,
  userEmail?: string,
  oldValue?: any,
  newValue?: any,
  metadata?: Record<string, any>
) {
  try {
    await db.collection('document_history').insertOne({
      _id: new ObjectId(),
      documentId,
      eventType,
      description,
      userId,
      userName,
      userEmail,
      oldValue,
      newValue,
      metadata,
      createdAt: new Date(),
    } as DocumentHistoryEntry)
  } catch (err) {
    console.error('Failed to add document history:', err)
    // Don't fail the main operation if history fails
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
        items: accessibleItems.map(d => {
          // Find user's permission for this document
          const userPerm = d.permissions.find(p => String(p.userId) === auth.userId)
          
          return {
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
            checkedOutBy: d.checkedOutBy ? String(d.checkedOutBy) : undefined,
            checkedOutByName: d.checkedOutByName,
            checkedOutByEmail: d.checkedOutByEmail,
            checkedOutAt: d.checkedOutAt,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
            // Include user's permission if they have one
            userPermission: userPerm ? {
              userId: String(userPerm.userId),
              permission: userPerm.permission,
            } : undefined,
          }
        }),
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

    // Add history entry for document creation
    await addDocumentHistory(
      db,
      document._id,
      'created',
      `Document "${name}" created`,
      auth.userId,
      (user as any)?.name,
      auth.email,
      undefined,
      undefined,
      { version: 1, filename: file.originalname }
    )

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

    // Convert ObjectIds to strings for frontend
    const response = {
      ...document,
      _id: String(document._id),
      ownerId: String(document.ownerId),
      checkedOutBy: document.checkedOutBy ? String(document.checkedOutBy) : undefined,
      versions: document.versions.map(v => ({
        ...v,
        _id: String(v._id),
        uploadedBy: String(v.uploadedBy),
      })),
      permissions: document.permissions.map(p => ({
        ...p,
        userId: String(p.userId),
        grantedBy: String(p.grantedBy),
      })),
      relatedTo: document.relatedTo ? {
        ...document.relatedTo,
        id: String(document.relatedTo.id),
      } : undefined,
    }

    res.json({ data: response, error: null })
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

    // Add history entry for version download
    await addDocumentHistory(
      db,
      _id,
      'version_downloaded',
      `Version ${version.version} downloaded: ${version.originalFilename}`,
      auth.userId,
      undefined,
      auth.email,
      undefined,
      undefined,
      { version: version.version, filename: version.originalFilename }
    )

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

    // Add history entry for download
    await addDocumentHistory(
      db,
      _id,
      'version_downloaded',
      `Latest version (v${latestVersion.version}) downloaded: ${latestVersion.originalFilename}`,
      auth.userId,
      undefined,
      auth.email,
      undefined,
      undefined,
      { version: latestVersion.version, filename: latestVersion.originalFilename }
    )

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

    // Check if document is checked out by someone else
    if (document.checkedOutBy && !document.checkedOutBy.equals(userId)) {
      try {
        if (file.path) fs.unlinkSync(file.path)
      } catch {}
      return res.status(400).json({ data: null, error: 'document_checked_out', details: { checkedOutBy: document.checkedOutByName || document.checkedOutByEmail } })
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

    // Add history entry for version upload
    await addDocumentHistory(
      db,
      _id,
      'version_uploaded',
      `Version ${newVersion.version} uploaded: ${newVersion.originalFilename}`,
      auth.userId,
      (user as any)?.name,
      auth.email,
      undefined,
      undefined,
      { version: newVersion.version, filename: newVersion.originalFilename, size: newVersion.size }
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

    // Check if document is checked out by someone else
    if (document.checkedOutBy && !document.checkedOutBy.equals(new ObjectId(auth.userId))) {
      return res.status(400).json({ data: null, error: 'document_checked_out', details: { checkedOutBy: document.checkedOutByName || document.checkedOutByEmail } })
    }

    // Check permission (owner or edit permission)
    if (String(document.ownerId) !== auth.userId && !(await hasPermission(db, document, auth.userId, 'edit'))) {
      return res.status(403).json({ data: null, error: 'access_denied' })
    }

    // Track field changes for history
    const changes: string[] = []
    const oldValues: Record<string, any> = {}
    const newValues: Record<string, any> = {}

    if (parsed.data.name !== undefined && parsed.data.name !== document.name) {
      changes.push('name')
      oldValues.name = document.name
      newValues.name = parsed.data.name
    }
    if (parsed.data.description !== undefined && parsed.data.description !== document.description) {
      changes.push('description')
      oldValues.description = document.description
      newValues.description = parsed.data.description
    }
    if (parsed.data.category !== undefined && parsed.data.category !== document.category) {
      changes.push('category')
      oldValues.category = document.category
      newValues.category = parsed.data.category
    }
    if (parsed.data.tags !== undefined && JSON.stringify(parsed.data.tags) !== JSON.stringify(document.tags)) {
      changes.push('tags')
      oldValues.tags = document.tags
      newValues.tags = parsed.data.tags
    }
    if (parsed.data.isPublic !== undefined && parsed.data.isPublic !== document.isPublic) {
      changes.push('isPublic')
      oldValues.isPublic = document.isPublic
      newValues.isPublic = parsed.data.isPublic
    }

    const update: any = { ...parsed.data, updatedAt: new Date() }
    await db.collection<Document>('documents').updateOne({ _id }, { $set: update })

    // Add history entry for update
    if (changes.length > 0) {
      const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
      await addDocumentHistory(
        db,
        _id,
        changes.length === 1 ? 'field_changed' : 'updated',
        changes.length === 1
          ? `${changes[0]} changed from "${oldValues[changes[0]]}" to "${newValues[changes[0]]}"`
          : `Document updated: ${changes.join(', ')}`,
        auth.userId,
        (user as any)?.name,
        auth.email,
        oldValues,
        newValues
      )
    }

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

    // Check if permission already exists
    const existingPermission = document.permissions.find(p => String(p.userId) === String(targetUserId))
    const isUpdate = !!existingPermission

    await db.collection<Document>('documents').updateOne(
      { _id },
      { $push: { permissions: permission } }
    )

    // Add history entry
    const user = await db.collection('users').findOne({ _id: userId })
    await addDocumentHistory(
      db,
      _id,
      isUpdate ? 'permission_updated' : 'permission_added',
      isUpdate
        ? `Permission updated for ${(targetUser as any)?.name || (targetUser as any)?.email}: ${existingPermission?.permission} → ${parsed.data.permission}`
        : `Permission granted to ${(targetUser as any)?.name || (targetUser as any)?.email}: ${parsed.data.permission}`,
      auth.userId,
      (user as any)?.name,
      auth.email,
      isUpdate ? existingPermission?.permission : undefined,
      parsed.data.permission,
      { targetUserId: String(targetUserId), targetUserName: (targetUser as any)?.name, targetUserEmail: (targetUser as any)?.email }
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

    const removedPermission = document.permissions.find(p => String(p.userId) === String(targetUserId))
    
    await db.collection<Document>('documents').updateOne(
      { _id },
      { $pull: { permissions: { userId: targetUserId } } }
    )

    // Add history entry
    if (removedPermission) {
      const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
      const targetUser = await db.collection('users').findOne({ _id: targetUserId })
      await addDocumentHistory(
        db,
        _id,
        'permission_removed',
        `Permission removed from ${(targetUser as any)?.name || (targetUser as any)?.email}: ${removedPermission.permission}`,
        auth.userId,
        (user as any)?.name,
        auth.email,
        removedPermission.permission,
        undefined,
        { targetUserId: String(targetUserId), targetUserName: (targetUser as any)?.name, targetUserEmail: (targetUser as any)?.email }
      )
    }

    res.json({ data: { ok: true }, error: null })
  } catch (e: any) {
    if (e.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: 'permission_remove_failed' })
  }
})

// POST /api/crm/documents/:id/checkout - Check out document
documentsRouter.post('/:id/checkout', requireAuth, async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = (req as any).auth as { userId: string; email: string }
    const userId = new ObjectId(auth.userId)
    const _id = new ObjectId(req.params.id)

    const document = await db.collection<Document>('documents').findOne({ _id })
    if (!document) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }

    // Check if already checked out by someone else
    if (document.checkedOutBy && !document.checkedOutBy.equals(userId)) {
      return res.status(400).json({ 
        data: null, 
        error: 'already_checked_out',
        details: { checkedOutBy: document.checkedOutByName || document.checkedOutByEmail }
      })
    }

    // Check permission - any user who can view the document can check it out
    if (!(await hasPermission(db, document, auth.userId, 'view'))) {
      return res.status(403).json({ data: null, error: 'access_denied' })
    }

    const user = await db.collection('users').findOne({ _id: userId })

    await db.collection<Document>('documents').updateOne(
      { _id },
      {
        $set: {
          checkedOutBy: userId,
          checkedOutByName: (user as any)?.name,
          checkedOutByEmail: auth.email,
          checkedOutAt: new Date(),
          updatedAt: new Date(),
        },
      }
    )

    // Add history entry
    await addDocumentHistory(
      db,
      _id,
      'checked_out',
      `Document checked out by ${(user as any)?.name || auth.email}`,
      auth.userId,
      (user as any)?.name,
      auth.email
    )

    res.json({ data: { ok: true }, error: null })
  } catch (e: any) {
    if (e.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: 'checkout_failed' })
  }
})

// POST /api/crm/documents/:id/checkin - Check in document
documentsRouter.post('/:id/checkin', requireAuth, async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = (req as any).auth as { userId: string; email: string }
    const userId = new ObjectId(auth.userId)
    const _id = new ObjectId(req.params.id)

    const document = await db.collection<Document>('documents').findOne({ _id })
    if (!document) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }

    // Check if checked out by this user (or allow owner/admin to force check-in)
    const isOwner = String(document.ownerId) === auth.userId
    const isAdmin = await (async () => {
      const { requirePermission } = await import('../auth/rbac.js')
      try {
        // Check if user has admin permission
        const joins = await db.collection('user_roles').find({ userId: auth.userId } as any).toArray()
        const roleIds = joins.map((j: any) => j.roleId)
        if (roleIds.length === 0) return false
        const roles = await db.collection('roles').find({ _id: { $in: roleIds } } as any).toArray()
        const allPerms = new Set<string>(roles.flatMap((r: any) => r.permissions || []))
        return allPerms.has('*')
      } catch {
        return false
      }
    })()

    if (!document.checkedOutBy) {
      return res.status(400).json({ data: null, error: 'not_checked_out' })
    }

    if (!document.checkedOutBy.equals(userId) && !isOwner && !isAdmin) {
      return res.status(403).json({ data: null, error: 'not_checked_out_by_you' })
    }

    const checkedOutByName = document.checkedOutByName || document.checkedOutByEmail
    const user = await db.collection('users').findOne({ _id: userId })

    await db.collection<Document>('documents').updateOne(
      { _id },
      {
        $unset: {
          checkedOutBy: '',
          checkedOutByName: '',
          checkedOutByEmail: '',
          checkedOutAt: '',
        },
        $set: {
          updatedAt: new Date(),
        },
      }
    )

    // Add history entry
    await addDocumentHistory(
      db,
      _id,
      'checked_in',
      `Document checked in by ${(user as any)?.name || auth.email}${!document.checkedOutBy.equals(userId) ? ` (was checked out by ${checkedOutByName})` : ''}`,
      auth.userId,
      (user as any)?.name,
      auth.email
    )

    res.json({ data: { ok: true }, error: null })
  } catch (e: any) {
    if (e.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: 'checkin_failed' })
  }
})

// POST /api/crm/documents/:id/request-deletion - Request document deletion via helpdesk ticket
documentsRouter.post('/:id/request-deletion', requireAuth, async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = (req as any).auth as { userId: string; email: string }
    const _id = new ObjectId(req.params.id)

    const document = await db.collection<Document>('documents').findOne({ _id })
    if (!document) {
      return res.status(404).json({ data: null, error: 'not_found' })
    }

    // Check if user has view permission
    if (!(await hasPermission(db, document, auth.userId, 'view'))) {
      return res.status(403).json({ data: null, error: 'access_denied' })
    }

    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    const userName = (user as any)?.name || auth.email

    // Create helpdesk ticket
    // Reuse the simpler sequence strategy from the customer portal tickets API
    // to avoid any issues with counter state while still keeping numbers monotonic.
    const lastTicket = await db.collection('support_tickets')
      .find({})
      .sort({ ticketNumber: -1 })
      .limit(1)
      .toArray()

    const ticketNumber = (lastTicket[0]?.ticketNumber || 200000) + 1

    const ticketDoc = {
      shortDescription: `Document Deletion Request: ${document.name}`,
      description: `Request to delete document "${document.name}" (ID: ${document._id})\n\nDocument Details:\n- Name: ${document.name}\n- Category: ${document.category || 'N/A'}\n- Owner: ${document.ownerName || document.ownerEmail}\n- Created: ${document.createdAt}\n- Versions: ${document.versions.length}\n\nRequested by: ${userName} (${auth.email})`,
      status: 'open',
      priority: 'normal',
      accountId: null,
      contactId: null,
      assignee: null,
      slaDueAt: null,
      comments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      requesterName: userName,
      requesterEmail: auth.email,
      ticketNumber,
    }

    await db.collection('support_tickets').insertOne(ticketDoc)

    res.json({ data: { ok: true, ticketNumber }, error: null })
  } catch (e: any) {
    console.error('Document deletion request error:', e)
    if (e?.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: 'deletion_request_failed' })
  }
})

// DELETE /api/crm/documents/:id - Delete document (admin only)
documentsRouter.delete('/:id', requireAuth, requirePermission('*'), async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const auth = (req as any).auth as { userId: string; email: string }
    const _id = new ObjectId(req.params.id)

    const document = await db.collection<Document>('documents').findOne({ _id })
    if (!document) {
      return res.status(404).json({ data: null, error: 'not_found' })
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

    // Add history entry before deletion
    const user = await db.collection('users').findOne({ _id: new ObjectId(auth.userId) })
    await addDocumentHistory(
      db,
      _id,
      'deleted',
      `Document "${document.name}" deleted`,
      auth.userId,
      (user as any)?.name,
      auth.email
    )

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

// GET /api/crm/documents/:id/history - Get document history
documentsRouter.get('/:id/history', requireAuth, async (req, res) => {
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

    // Get all history entries for this document, sorted by date (newest first)
    const historyEntries = await db.collection('document_history')
      .find({ documentId: _id })
      .sort({ createdAt: -1 })
      .toArray() as DocumentHistoryEntry[]

    res.json({
      data: {
        history: historyEntries,
        createdAt: document.createdAt,
        document: {
          _id: document._id,
          name: document.name,
          createdAt: document.createdAt,
        },
      },
      error: null,
    })
  } catch (e: any) {
    if (e.message?.includes('ObjectId')) {
      return res.status(400).json({ data: null, error: 'invalid_id' })
    }
    res.status(500).json({ data: null, error: 'history_fetch_failed' })
  }
})

