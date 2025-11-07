import { getDb } from '../db.js'
import { ObjectId } from 'mongodb'

export type SessionInfo = {
  jti: string
  userId: string
  email: string
  ipAddress?: string
  userAgent?: string
  createdAt: Date
  lastUsedAt: Date
  revoked?: boolean
}

type SessionDoc = {
  _id: ObjectId
  jti: string
  userId: ObjectId
  email: string
  ipAddress?: string
  userAgent?: string
  createdAt: Date
  lastUsedAt: Date
  revoked?: boolean
}

export async function createSession(
  jti: string,
  userId: string,
  email: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const db = await getDb()
  if (!db) throw new Error('Database unavailable')

  let objectId: ObjectId
  try {
    objectId = new ObjectId(userId)
  } catch {
    throw new Error('Invalid user ID')
  }

  const now = new Date()
  await db.collection<SessionDoc>('sessions').insertOne({
    _id: new ObjectId(),
    jti,
    userId: objectId,
    email,
    ipAddress,
    userAgent,
    createdAt: now,
    lastUsedAt: now,
    revoked: false,
  })
}

export async function updateSessionLastUsed(jti: string): Promise<void> {
  const db = await getDb()
  if (!db) return

  await db.collection<SessionDoc>('sessions').updateOne(
    { jti, revoked: { $ne: true } },
    { $set: { lastUsedAt: new Date() } }
  )
}

export async function revokeSession(jti: string, userId: string): Promise<boolean> {
  const db = await getDb()
  if (!db) return false

  let objectId: ObjectId
  try {
    objectId = new ObjectId(userId)
  } catch {
    return false
  }

  const result = await db.collection<SessionDoc>('sessions').updateOne(
    { jti, userId: objectId, revoked: { $ne: true } },
    { $set: { revoked: true } }
  )

  return result.modifiedCount > 0
}

export async function revokeAllUserSessions(userId: string, excludeJti?: string): Promise<number> {
  const db = await getDb()
  if (!db) return 0

  let objectId: ObjectId
  try {
    objectId = new ObjectId(userId)
  } catch {
    return 0
  }

  const query: any = { userId: objectId, revoked: { $ne: true } }
  if (excludeJti) {
    query.jti = { $ne: excludeJti }
  }

  const result = await db.collection<SessionDoc>('sessions').updateMany(
    query,
    { $set: { revoked: true } }
  )

  return result.modifiedCount
}

export async function getUserSessions(userId: string): Promise<SessionInfo[]> {
  const db = await getDb()
  if (!db) return []

  let objectId: ObjectId
  try {
    objectId = new ObjectId(userId)
  } catch {
    return []
  }

  const sessions = await db.collection<SessionDoc>('sessions')
    .find({ userId: objectId, revoked: { $ne: true } })
    .sort({ lastUsedAt: -1 })
    .toArray()

  return sessions.map(s => ({
    jti: s.jti,
    userId: s.userId.toString(),
    email: s.email,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    revoked: s.revoked,
  }))
}

export async function isSessionRevoked(jti: string): Promise<boolean> {
  const db = await getDb()
  if (!db) return true // If DB unavailable, treat as revoked for security

  const session = await db.collection<SessionDoc>('sessions').findOne({ jti })
  return !!session?.revoked
}

// Get all active sessions (admin only)
export async function getAllSessions(limit: number = 100): Promise<SessionInfo[]> {
  const db = await getDb()
  if (!db) return []

  const sessions = await db.collection<SessionDoc>('sessions')
    .find({ revoked: { $ne: true } })
    .sort({ lastUsedAt: -1 })
    .limit(limit)
    .toArray()

  return sessions.map(s => ({
    jti: s.jti,
    userId: s.userId.toString(),
    email: s.email,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    revoked: s.revoked,
  }))
}

// Get sessions for a specific user (admin only)
export async function getSessionsByUserId(userId: string): Promise<SessionInfo[]> {
  const db = await getDb()
  if (!db) return []

  let objectId: ObjectId
  try {
    objectId = new ObjectId(userId)
  } catch {
    return []
  }

  const sessions = await db.collection<SessionDoc>('sessions')
    .find({ userId: objectId })
    .sort({ lastUsedAt: -1 })
    .toArray()

  return sessions.map(s => ({
    jti: s.jti,
    userId: s.userId.toString(),
    email: s.email,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    revoked: s.revoked,
  }))
}

// Revoke session by JTI (admin only - no userId check)
export async function adminRevokeSession(jti: string): Promise<boolean> {
  const db = await getDb()
  if (!db) return false

  const result = await db.collection<SessionDoc>('sessions').updateOne(
    { jti, revoked: { $ne: true } },
    { $set: { revoked: true } }
  )

  return result.modifiedCount > 0
}

// Bulk revoke sessions by JTI array (admin only)
export async function adminBulkRevokeSessions(jtis: string[]): Promise<number> {
  const db = await getDb()
  if (!db) return 0

  if (jtis.length === 0) return 0

  const result = await db.collection<SessionDoc>('sessions').updateMany(
    { jti: { $in: jtis }, revoked: { $ne: true } },
    { $set: { revoked: true } }
  )

  return result.modifiedCount
}

// Revoke all active sessions (admin only)
// Optionally exclude a specific JTI (e.g., the current admin's session)
export async function adminRevokeAllSessions(excludeJti?: string): Promise<number> {
  const db = await getDb()
  if (!db) return 0

  const query: any = { revoked: { $ne: true } }
  if (excludeJti) {
    query.jti = { $ne: excludeJti }
  }

  const result = await db.collection<SessionDoc>('sessions').updateMany(
    query,
    { $set: { revoked: true } }
  )

  return result.modifiedCount
}

// Clean up old revoked sessions (older than 30 days)
export async function cleanupOldSessions(): Promise<void> {
  const db = await getDb()
  if (!db) return

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  await db.collection<SessionDoc>('sessions').deleteMany({
    revoked: true,
    lastUsedAt: { $lt: thirtyDaysAgo },
  })
}

