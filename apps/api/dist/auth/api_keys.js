import crypto from 'crypto';
import { getDb } from '../db.js';
function extractApiKey(req) {
    const header = (req.headers['x-boaz-api-key'] || req.headers['x-api-key']);
    const rawHeader = Array.isArray(header) ? header[0] : header;
    if (rawHeader && typeof rawHeader === 'string')
        return rawHeader.trim();
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
        const tok = auth.slice(7).trim();
        if (tok)
            return tok;
    }
    return null;
}
export function requireApiKey(options) {
    const requiredScopes = options?.scopes ?? [];
    return async function (req, res, next) {
        const db = await getDb();
        if (!db)
            return res.status(500).json({ data: null, error: 'db_unavailable' });
        const apiKey = extractApiKey(req);
        if (!apiKey)
            return res.status(401).json({ data: null, error: 'missing_api_key' });
        if (!apiKey.startsWith('boaz_sk_'))
            return res.status(401).json({ data: null, error: 'invalid_api_key' });
        const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
        const doc = (await db.collection('crm_api_keys').findOne({ hash }));
        if (!doc || doc.revokedAt)
            return res.status(401).json({ data: null, error: 'invalid_api_key' });
        const scopes = Array.isArray(doc.scopes) ? doc.scopes : [];
        const allowed = scopes.includes('*') || requiredScopes.every((s) => scopes.includes(s));
        if (!allowed)
            return res.status(403).json({ data: null, error: 'insufficient_scope' });
        // Best-effort last-used tracking (do not block request)
        db.collection('crm_api_keys').updateOne({ _id: doc._id }, { $set: { lastUsedAt: new Date() } }).catch(() => { });
        req.apiKey = { id: String(doc._id), name: doc.name, prefix: doc.prefix, scopes };
        next();
    };
}
