import { getDb } from '../db.js';
import { ObjectId } from 'mongodb';
export async function createSession(jti, userId, email, ipAddress, userAgent) {
    const db = await getDb();
    if (!db)
        throw new Error('Database unavailable');
    let objectId;
    try {
        objectId = new ObjectId(userId);
    }
    catch {
        throw new Error('Invalid user ID');
    }
    const now = new Date();
    await db.collection('sessions').insertOne({
        _id: new ObjectId(),
        jti,
        userId: objectId,
        email,
        ipAddress,
        userAgent,
        createdAt: now,
        lastUsedAt: now,
        revoked: false,
    });
}
export async function updateSessionLastUsed(jti) {
    const db = await getDb();
    if (!db)
        return;
    await db.collection('sessions').updateOne({ jti, revoked: { $ne: true } }, { $set: { lastUsedAt: new Date() } });
}
export async function revokeSession(jti, userId) {
    const db = await getDb();
    if (!db)
        return false;
    let objectId;
    try {
        objectId = new ObjectId(userId);
    }
    catch {
        return false;
    }
    const result = await db.collection('sessions').updateOne({ jti, userId: objectId, revoked: { $ne: true } }, { $set: { revoked: true } });
    return result.modifiedCount > 0;
}
export async function revokeAllUserSessions(userId, excludeJti) {
    const db = await getDb();
    if (!db)
        return 0;
    let objectId;
    try {
        objectId = new ObjectId(userId);
    }
    catch {
        return 0;
    }
    const query = { userId: objectId, revoked: { $ne: true } };
    if (excludeJti) {
        query.jti = { $ne: excludeJti };
    }
    const result = await db.collection('sessions').updateMany(query, { $set: { revoked: true } });
    return result.modifiedCount;
}
export async function getUserSessions(userId) {
    const db = await getDb();
    if (!db)
        return [];
    let objectId;
    try {
        objectId = new ObjectId(userId);
    }
    catch {
        return [];
    }
    const sessions = await db.collection('sessions')
        .find({ userId: objectId, revoked: { $ne: true } })
        .sort({ lastUsedAt: -1 })
        .toArray();
    return sessions.map(s => ({
        jti: s.jti,
        userId: s.userId.toString(),
        email: s.email,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        revoked: s.revoked,
    }));
}
export async function isSessionRevoked(jti) {
    const db = await getDb();
    if (!db)
        return true; // If DB unavailable, treat as revoked for security
    const session = await db.collection('sessions').findOne({ jti });
    return !!session?.revoked;
}
// Get all active sessions (admin only)
export async function getAllSessions(limit = 100) {
    const db = await getDb();
    if (!db)
        return [];
    const sessions = await db.collection('sessions')
        .find({ revoked: { $ne: true } })
        .sort({ lastUsedAt: -1 })
        .limit(limit)
        .toArray();
    return sessions.map(s => ({
        jti: s.jti,
        userId: s.userId.toString(),
        email: s.email,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        revoked: s.revoked,
    }));
}
// Get sessions for a specific user (admin only)
export async function getSessionsByUserId(userId) {
    const db = await getDb();
    if (!db)
        return [];
    let objectId;
    try {
        objectId = new ObjectId(userId);
    }
    catch {
        return [];
    }
    const sessions = await db.collection('sessions')
        .find({ userId: objectId })
        .sort({ lastUsedAt: -1 })
        .toArray();
    return sessions.map(s => ({
        jti: s.jti,
        userId: s.userId.toString(),
        email: s.email,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        revoked: s.revoked,
    }));
}
// Revoke session by JTI (admin only - no userId check)
export async function adminRevokeSession(jti) {
    const db = await getDb();
    if (!db)
        return false;
    const result = await db.collection('sessions').updateOne({ jti, revoked: { $ne: true } }, { $set: { revoked: true } });
    return result.modifiedCount > 0;
}
// Clean up old revoked sessions (older than 30 days)
export async function cleanupOldSessions() {
    const db = await getDb();
    if (!db)
        return;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    await db.collection('sessions').deleteMany({
        revoked: true,
        lastUsedAt: { $lt: thirtyDaysAgo },
    });
}
