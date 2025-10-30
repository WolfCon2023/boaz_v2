import { getDb } from '../db.js';
import { ObjectId } from 'mongodb';
import { verifyAny } from './jwt.js';
// Initial matrix used if roles collection is empty
export const DEFAULT_ROLES = [
    { name: 'admin', permissions: ['*'] },
    { name: 'manager', permissions: ['users.read', 'users.write', 'roles.read'] },
    { name: 'staff', permissions: ['users.read'] },
    { name: 'customer', permissions: [] },
];
export async function ensureDefaultRoles() {
    const db = await getDb();
    if (!db)
        return;
    const count = await db.collection('roles').countDocuments();
    if (count === 0) {
        await db.collection('roles').insertMany(DEFAULT_ROLES.map((r) => ({ _id: new ObjectId(), name: r.name, permissions: r.permissions })));
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
