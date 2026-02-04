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
  { name: 'manager', permissions: ['users.read', 'users.write', 'roles.read', 'expenses.approve_level1'] },
  { 
    name: 'senior_manager', 
    permissions: [
      'users.read', 
      'users.write', 
      'roles.read', 
      'expenses.approve_level1',
      'expenses.approve_level2',
    ] 
  },
  { 
    name: 'finance_manager', 
    permissions: [
      'users.read', 
      'users.write', 
      'roles.read', 
      'expenses.approve_level1',
      'expenses.approve_level2',
      'expenses.approve_level3',
      'expenses.final_approve',
    ] 
  },
  { name: 'staff', permissions: ['users.read'] },
  { name: 'customer', permissions: [] },
  { 
    name: 'it', 
    permissions: [
      'support.read',
      'support.write',
      'kb.read',
      'kb.write',
      'assets.read',
      'assets.write',
      'vendors.read',
      'vendors.write',
      'projects.read',
      'slas.read',
      'contacts.read',
      'accounts.read',
      'products.read',
    ] 
  },
  { 
    name: 'it_manager', 
    permissions: [
      'support.read',
      'support.write',
      'kb.read',
      'kb.write',
      'assets.read',
      'assets.write',
      'vendors.read',
      'vendors.write',
      'projects.read',
      'slas.read',
      'slas.write',
      'contacts.read',
      'accounts.read',
      'products.read',
      'users.read',
      'roles.read',
      'quotes.read',
      'quotes.approve',
      'invoices.read',
      'deals.read',
      'renewals.read',
    ] 
  },
]

export async function ensureDefaultRoles() {
  try {
    const db = await getDb()
    if (!db) {
      console.log('[rbac] ensureDefaultRoles: No database connection')
      return
    }
    
    console.log('[rbac] ensureDefaultRoles: Checking roles...')
    console.log('[rbac] DEFAULT_ROLES contains:', DEFAULT_ROLES.map(r => r.name).join(', '))
    
    const count = await db.collection<RoleDoc>('roles').countDocuments()
    console.log('[rbac] Current role count in database:', count)
    
    if (count === 0) {
      // No roles exist - seed all default roles
      await db.collection<RoleDoc>('roles').insertMany(DEFAULT_ROLES.map((r) => ({ _id: new ObjectId(), name: r.name, permissions: r.permissions } as any)))
      console.log('[rbac] Seeded default roles:', DEFAULT_ROLES.map(r => r.name).join(', '))
    } else {
      // Roles exist - check for any missing default roles and add them
      const existingRoles = await db.collection<RoleDoc>('roles').find({}).toArray()
      const existingRoleNames = new Set(existingRoles.map(r => r.name))
      
      console.log('[rbac] Existing roles in database:', Array.from(existingRoleNames).join(', '))
      
      const missingRoles = DEFAULT_ROLES.filter(r => !existingRoleNames.has(r.name))
      
      console.log('[rbac] Missing roles to add:', missingRoles.length > 0 ? missingRoles.map(r => r.name).join(', ') : 'none')
      
      if (missingRoles.length > 0) {
        const result = await db.collection<RoleDoc>('roles').insertMany(
          missingRoles.map((r) => ({ _id: new ObjectId(), name: r.name, permissions: r.permissions } as any))
        )
        console.log('[rbac] Added missing roles:', missingRoles.map(r => r.name).join(', '), '- Insert result:', result.insertedCount, 'inserted')
      }
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
  } catch (err) {
    console.error('[rbac] ensureDefaultRoles ERROR:', err)
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


