import { Router } from 'express'
import { z } from 'zod'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { ensureDefaultRoles, requireAuth, requirePermission } from './rbac.js'

export const rolesRouter = Router()

rolesRouter.use(async (_req, _res, next) => { await ensureDefaultRoles(); next() })

// GET /api/roles
rolesRouter.get('/roles', requireAuth, requirePermission('roles.read'), async (_req, res) => {
  const db = await getDb(); if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const items = await db.collection('roles').find({}).sort({ name: 1 }).toArray()
  res.json({ data: { items }, error: null })
})

// POST /api/roles { name, permissions }
rolesRouter.post('/roles', requireAuth, requirePermission('roles.write'), async (req, res) => {
  const schema = z.object({ name: z.string().min(1), permissions: z.array(z.string()).default([]) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const db = await getDb(); if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const exists = await db.collection('roles').findOne({ name: parsed.data.name })
  if (exists) return res.status(409).json({ data: null, error: 'role_exists' })
  const r = await db.collection('roles').insertOne({ name: parsed.data.name, permissions: parsed.data.permissions })
  res.status(201).json({ data: { _id: r.insertedId }, error: null })
})

// PATCH /api/roles/:id { name?, permissions? }
rolesRouter.patch('/roles/:id', requireAuth, requirePermission('roles.write'), async (req, res) => {
  const db = await getDb(); if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  let _id: ObjectId
  try { _id = new ObjectId(String(req.params.id)) } catch { return res.status(400).json({ data: null, error: 'invalid_id' }) }
  const schema = z.object({ name: z.string().min(1).optional(), permissions: z.array(z.string()).optional() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_payload' })
  await db.collection('roles').updateOne({ _id }, { $set: parsed.data })
  res.json({ data: { ok: true }, error: null })
})

// POST /api/roles/:id/assign/:userId
rolesRouter.post('/roles/:id/assign/:userId', requireAuth, requirePermission('roles.assign'), async (req, res) => {
  const db = await getDb(); if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  let roleId: ObjectId
  const userId = String(req.params.userId)
  try { 
    roleId = new ObjectId(String(req.params.id)) 
  } catch { 
    return res.status(400).json({ data: null, error: 'invalid_id' }) 
  }
  
  // Validate that user exists
  let userIdObj: ObjectId
  try {
    userIdObj = new ObjectId(userId)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_user_id' })
  }
  
  const user = await db.collection('users').findOne({ _id: userIdObj })
  if (!user) {
    return res.status(404).json({ data: null, error: 'user_not_found' })
  }
  
  // Validate that role exists
  const role = await db.collection('roles').findOne({ _id: roleId })
  if (!role) return res.status(404).json({ data: null, error: 'role_not_found' })
  
  // Check if assignment already exists (unique index will also prevent duplicates)
  const exists = await db.collection('user_roles').findOne({ userId, roleId })
  if (exists) return res.json({ data: { ok: true, message: 'Role already assigned' }, error: null })
  
  // Assign role with timestamp
  await db.collection('user_roles').insertOne({ 
    _id: new ObjectId(),
    userId, 
    roleId,
    createdAt: new Date()
  })
  res.json({ data: { ok: true }, error: null })
})


