import type { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { getDb } from '../db.js'

type ApiKeyDoc = {
  _id: any
  name: string
  prefix: string
  hash: string
  scopes: string[]
  revokedAt?: Date | null
  lastUsedAt?: Date | null
}

function extractApiKey(req: Request): string | null {
  const header = (req.headers['x-boaz-api-key'] || req.headers['x-api-key']) as string | string[] | undefined
  const rawHeader = Array.isArray(header) ? header[0] : header
  if (rawHeader && typeof rawHeader === 'string') return rawHeader.trim()

  const auth = req.headers.authorization
  if (auth && auth.startsWith('Bearer ')) {
    const tok = auth.slice(7).trim()
    if (tok) return tok
  }
  return null
}

export function requireApiKey(options?: { scopes?: string[] }) {
  const requiredScopes = options?.scopes ?? []
  return async function (req: Request, res: Response, next: NextFunction) {
    const db = await getDb()
    if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

    const apiKey = extractApiKey(req)
    if (!apiKey) return res.status(401).json({ data: null, error: 'missing_api_key' })
    if (!apiKey.startsWith('boaz_sk_')) return res.status(401).json({ data: null, error: 'invalid_api_key' })

    const hash = crypto.createHash('sha256').update(apiKey).digest('hex')
    const doc = (await db.collection<ApiKeyDoc>('crm_api_keys').findOne({ hash } as any)) as ApiKeyDoc | null
    if (!doc || doc.revokedAt) return res.status(401).json({ data: null, error: 'invalid_api_key' })

    const scopes = Array.isArray(doc.scopes) ? doc.scopes : []
    const allowed = scopes.includes('*') || requiredScopes.every((s) => scopes.includes(s))
    if (!allowed) return res.status(403).json({ data: null, error: 'insufficient_scope' })

    // Best-effort last-used tracking (do not block request)
    db.collection('crm_api_keys').updateOne({ _id: (doc as any)._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {})

    ;(req as any).apiKey = { id: String((doc as any)._id), name: doc.name, prefix: doc.prefix, scopes }
    next()
  }
}


