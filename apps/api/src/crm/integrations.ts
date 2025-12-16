import { Router } from 'express'
import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import { getDb } from '../db.js'
import { requireAuth, requirePermission } from '../auth/rbac.js'
import { dispatchCrmEvent } from './integrations_core.js'

export const integrationsRouter = Router()

// Treat integrations as admin configuration for now.
integrationsRouter.use(requireAuth)
integrationsRouter.use(requirePermission('*'))

type WebhookDoc = {
  _id: ObjectId
  kind: 'webhook'
  name: string
  url: string
  secret?: string | null
  events: string[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  lastDeliveryAt?: Date | null
  lastDeliveryOk?: boolean | null
  lastDeliveryStatus?: number | null
  lastDeliveryError?: string | null
}

type ApiKeyDoc = {
  _id: ObjectId
  name: string
  prefix: string
  hash: string
  scopes: string[]
  createdAt: Date
  createdByEmail?: string | null
  revokedAt?: Date | null
  lastUsedAt?: Date | null
}

function normalizeUrl(raw: string) {
  const s = String(raw || '').trim()
  return s
}

function safeEvents(raw: any): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .slice(0, 50)
}

function makeApiKey() {
  // Returned value: boaz_sk_<base64url>
  const bytes = crypto.randomBytes(32)
  const token = bytes.toString('base64url')
  const full = `boaz_sk_${token}`
  const hash = crypto.createHash('sha256').update(full).digest('hex')
  const prefix = full.slice(0, 12) // boaz_sk_xxxx...
  return { full, hash, prefix }
}

export const SUPPORTED_CRM_EVENTS = [
  'support.ticket.created',
  'support.ticket.updated',
  'crm.invoice.paid',
  'scheduler.appointment.booked',
  'scheduler.appointment.cancelled',
  'test.ping',
] as const

// GET /api/crm/integrations/events
integrationsRouter.get('/events', (_req, res) => {
  res.json({ data: { events: SUPPORTED_CRM_EVENTS }, error: null })
})

// === Webhooks ===

// GET /api/crm/integrations/webhooks
integrationsRouter.get('/webhooks', async (_req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const hooks = await db
    .collection<WebhookDoc>('crm_integrations')
    .find({ kind: 'webhook' } as any)
    .sort({ createdAt: -1 } as any)
    .toArray()
  const safe = hooks.map((h: any) => ({
    ...h,
    secret: h.secret ? '********' : null,
  }))
  res.json({ data: { items: safe }, error: null })
})

// POST /api/crm/integrations/webhooks
integrationsRouter.post('/webhooks', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const url = typeof raw.url === 'string' ? normalizeUrl(raw.url) : ''
  if (!name || !url) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const events = safeEvents(raw.events)
  const isActive = raw.isActive === false ? false : true
  const secret = typeof raw.secret === 'string' && raw.secret.trim() ? raw.secret.trim() : null
  const now = new Date()
  const doc: WebhookDoc = {
    _id: new ObjectId(),
    kind: 'webhook',
    name,
    url,
    secret,
    events: events.length ? events : ['*'],
    isActive,
    createdAt: now,
    updatedAt: now,
    lastDeliveryAt: null,
    lastDeliveryOk: null,
    lastDeliveryStatus: null,
    lastDeliveryError: null,
  }
  await db.collection<WebhookDoc>('crm_integrations').insertOne(doc as any)
  res.status(201).json({ data: { ...doc, secret: doc.secret ? '********' : null }, error: null })
})

// PUT /api/crm/integrations/webhooks/:id
integrationsRouter.put('/webhooks/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ data: null, error: 'invalid_id' })
  const _id = new ObjectId(req.params.id)
  const raw = req.body ?? {}
  const update: any = { updatedAt: new Date() }
  if (typeof raw.name === 'string') update.name = raw.name.trim()
  if (typeof raw.url === 'string') update.url = normalizeUrl(raw.url)
  if (raw.isActive === false || raw.isActive === true) update.isActive = raw.isActive
  if (raw.events != null) update.events = safeEvents(raw.events).length ? safeEvents(raw.events) : ['*']
  if (raw.secret != null) update.secret = typeof raw.secret === 'string' && raw.secret.trim() ? raw.secret.trim() : null
  await db.collection<WebhookDoc>('crm_integrations').updateOne({ _id }, { $set: update })
  const saved = await db.collection<WebhookDoc>('crm_integrations').findOne({ _id })
  if (!saved) return res.status(404).json({ data: null, error: 'not_found' })
  res.json({ data: { ...saved, secret: (saved as any).secret ? '********' : null }, error: null })
})

// DELETE /api/crm/integrations/webhooks/:id
integrationsRouter.delete('/webhooks/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ data: null, error: 'invalid_id' })
  const _id = new ObjectId(req.params.id)
  await db.collection<WebhookDoc>('crm_integrations').deleteOne({ _id })
  res.json({ data: { ok: true }, error: null })
})

// POST /api/crm/integrations/webhooks/:id/test
integrationsRouter.post('/webhooks/:id/test', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ data: null, error: 'invalid_id' })
  const _id = new ObjectId(req.params.id)

  const auth = (req as any).auth as { userId: string; email: string } | undefined
  const payload = {
    message: 'Hello from BOAZ Integrations',
    requestedBy: auth?.email || null,
  }

  // fire-and-forget, but we still respond ok once scheduled
  dispatchCrmEvent(db, 'test.ping', payload, { onlyWebhookId: _id, source: 'manual_test' }).catch((e) =>
    console.warn('webhook test failed:', e),
  )

  res.json({ data: { ok: true }, error: null })
})

// === API Keys ===

// GET /api/crm/integrations/api-keys
integrationsRouter.get('/api-keys', async (_req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const keys = await db
    .collection<ApiKeyDoc>('crm_api_keys')
    .find({ revokedAt: null } as any)
    .sort({ createdAt: -1 } as any)
    .toArray()
  const safe = keys.map((k: any) => ({
    _id: k._id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes ?? [],
    createdAt: k.createdAt,
    createdByEmail: k.createdByEmail ?? null,
    lastUsedAt: k.lastUsedAt ?? null,
    revokedAt: k.revokedAt ?? null,
  }))
  res.json({ data: { items: safe }, error: null })
})

// POST /api/crm/integrations/api-keys
integrationsRouter.post('/api-keys', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return res.status(400).json({ data: null, error: 'invalid_payload' })
  const scopes = safeEvents(raw.scopes) // re-use sanitizer (string array)
  const { full, hash, prefix } = makeApiKey()
  const now = new Date()
  const auth = (req as any).auth as { email: string } | undefined
  const doc: ApiKeyDoc = {
    _id: new ObjectId(),
    name,
    prefix,
    hash,
    scopes: scopes.length ? scopes : ['*'],
    createdAt: now,
    createdByEmail: auth?.email ?? null,
    revokedAt: null,
    lastUsedAt: null,
  }
  await db.collection<ApiKeyDoc>('crm_api_keys').insertOne(doc as any)
  res.status(201).json({
    data: {
      _id: doc._id,
      name: doc.name,
      prefix: doc.prefix,
      scopes: doc.scopes,
      createdAt: doc.createdAt,
      createdByEmail: doc.createdByEmail,
      apiKey: full, // only returned once
    },
    error: null,
  })
})

// DELETE /api/crm/integrations/api-keys/:id (revoke)
integrationsRouter.delete('/api-keys/:id', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ data: null, error: 'invalid_id' })
  const _id = new ObjectId(req.params.id)
  await db.collection<ApiKeyDoc>('crm_api_keys').updateOne({ _id }, { $set: { revokedAt: new Date() } })
  res.json({ data: { ok: true }, error: null })
})


