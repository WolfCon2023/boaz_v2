import { getDb } from '../db.js';
import { ObjectId } from 'mongodb';
import { verifyAny } from './jwt.js';
// Initial matrix used if roles collection is empty
export const DEFAULT_ROLES = [
    { name: 'admin', permissions: ['*'] },
    { name: 'manager', permissions: ['users.read', 'users.write', 'roles.read'] },
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
];
export async function ensureDefaultRoles() {
    const db = await getDb();
    if (!db)
        return;
    const count = await db.collection('roles').countDocuments();
    if (count === 0) {
        await db.collection('roles').insertMany(DEFAULT_ROLES.map((r) => ({ _id: new ObjectId(), name: r.name, permissions: r.permissions })));
    }
    // Ensure indexes for user_roles collection (for performance)
    try {
        await db.collection('user_roles').createIndex({ userId: 1 }).catch(() => {
            // Index might already exist
        });
        await db.collection('user_roles').createIndex({ roleId: 1 }).catch(() => {
            // Index might already exist
        });
        await db.collection('user_roles').createIndex({ userId: 1, roleId: 1 }, { unique: true }).catch(() => {
            // Index might already exist - ensures one role assignment per user
        });
    }
    catch (err) {
        console.warn('Warning: Could not ensure user_roles indexes:', err);
    }
    // Ensure index for roles collection
    try {
        await db.collection('roles').createIndex({ name: 1 }, { unique: true }).catch(() => {
            // Index might already exist
        });
    }
    catch (err) {
        console.warn('Warning: Could not ensure roles index:', err);
    }
}
export function requireAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer '))
        return res.status(401).json({ error: 'Unauthorized' });
    const token = auth.slice(7);
    const payload = verifyAny(token);
    if (!payload)
        return res.status(401).json({ error: 'Unauthorized' });
    req.auth = { userId: payload.sub, email: payload.email };
    next();
}
export function requirePermission(permission) {
    return async function (req, res, next) {
        const auth = req.auth;
        if (!auth)
            return res.status(401).json({ error: 'Unauthorized' });
        const db = await getDb();
        if (!db)
            return res.status(500).json({ error: 'db_unavailable' });
        // load user's roles
        const joins = await db.collection('user_roles').find({ userId: auth.userId }).toArray();
        const roleIds = joins.map((j) => j.roleId);
        if (roleIds.length === 0)
            return res.status(403).json({ error: 'forbidden' });
        const roles = await db.collection('roles').find({ _id: { $in: roleIds } }).toArray();
        const allPerms = new Set(roles.flatMap((r) => r.permissions || []));
        if (allPerms.has('*') || allPerms.has(permission))
            return next();
        return res.status(403).json({ error: 'forbidden' });
    };
}
export function requireApplication(appKey) {
    return async function (req, res, next) {
        const auth = req.auth;
        if (!auth)
            return res.status(401).json({ error: 'Unauthorized' });
        // Import here to avoid circular dependency
        const { hasApplicationAccess } = await import('./store.js');
        const hasAccess = await hasApplicationAccess(auth.userId, appKey);
        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied: Application access required' });
        }
        next();
    };
}
