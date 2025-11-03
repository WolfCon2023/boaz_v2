import type { Request, Response, NextFunction } from 'express'
import { getDb } from '../db.js'
import { ObjectId } from 'mongodb'
import { verifyAny } from './jwt.js'

export type RoleDoc = { _id: ObjectId; name: string; permissions: string[] }
// Join table: Links users to roles (many-to-many relationship)
// userId is stored as string to match JWT sub claim (string representation of ObjectId)
// createdAt tracks when the role was assigned
export type UserRoleDoc = { _id: ObjectId; userId: string; roleId: ObjectId; createdAt?: Date }

// Initial matrix used if roles collection is empty
export const DEFAULT_ROLES: Array<{ name: string; permissions: string[] }> = [
  { name: 'admin', permissions: ['*'] },
  { name: 'manager', permissions: ['users.read', 'users.write', 'roles.read'] },
  { name: 'staff', permissions: ['users.read'] },
  { name: 'customer', permissions: [] },
]

export async function ensureDefaultRoles() {
  const db = await getDb()
  if (!db) return
  const count = await db.collection<RoleDoc>('roles').countDocuments()
  if (count === 0) {
    await db.collection<RoleDoc>('roles').insertMany(DEFAULT_ROLES.map((r) => ({ _id: new ObjectId(), name: r.name, permissions: r.permissions } as any)))
  }
  
  // Ensure indexes for user_roles collection (for performance)
  try {
    await db.collection<UserRoleDoc>('user_roles').createIndex({ userId: 1 }).catch(() => {
      // Index might already exist
    })
    await db.collection<UserRoleDoc>('user_roles').createIndex({ roleId: 1 }).catch(() => {
      // Index might already exist
    })
    await db.collection<UserRoleDoc>('user_roles').createIndex({ userId: 1, roleId: 1 }, { unique: true }).catch(() => {
      // Index might already exist - ensures one role assignment per user
    })
  } catch (err) {
    console.warn('Warning: Could not ensure user_roles indexes:', err)
  }
  
  // Ensure index for roles collection
  try {
    await db.collection<RoleDoc>('roles').createIndex({ name: 1 }, { unique: true }).catch(() => {
      // Index might already exist
    })
  } catch (err) {
    console.warn('Warning: Could not ensure roles index:', err)
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  const token = auth.slice(7)
  const payload = verifyAny<{ sub: string; email: string }>(token)
  if (!payload) return res.status(401).json({ error: 'Unauthorized' })
  ;(req as any).auth = { userId: payload.sub, email: payload.email }
  next()
}

export function requirePermission(permission: string) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    if (!auth) return res.status(401).json({ error: 'Unauthorized' })
    const db = await getDb()
    if (!db) return res.status(500).json({ error: 'db_unavailable' })
    // load user's roles
    const joins = await db.collection<UserRoleDoc>('user_roles').find({ userId: auth.userId } as any).toArray()
    const roleIds = joins.map((j) => j.roleId)
    if (roleIds.length === 0) return res.status(403).json({ error: 'forbidden' })
    const roles = await db.collection<RoleDoc>('roles').find({ _id: { $in: roleIds } } as any).toArray()
    const allPerms = new Set<string>(roles.flatMap((r) => r.permissions || []))
    if (allPerms.has('*') || allPerms.has(permission)) return next()
    return res.status(403).json({ error: 'forbidden' })
  }
}

export function requireApplication(appKey: string) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const auth = (req as any).auth as { userId: string; email: string } | undefined
    if (!auth) return res.status(401).json({ error: 'Unauthorized' })
    
    // Import here to avoid circular dependency
    const { hasApplicationAccess } = await import('./store.js')
    const hasAccess = await hasApplicationAccess(auth.userId, appKey)
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied: Application access required' })
    }
    
    next()
  }
}


