import { Router } from 'express';
import { z } from 'zod';
import { createUser, getUserByEmail, verifyCredentials } from './store.js';
import { verifyToken, signAccessToken, signRefreshToken, verifyAny } from './jwt.js';
import { randomUUID } from 'node:crypto';
const cookieOpts = {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/auth',
};
const activeRefresh = new Map();
const credentialsSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});
const registerSchema = credentialsSchema.extend({ name: z.string().min(1).optional() });
export const authRouter = Router();
authRouter.post('/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'Invalid payload' });
    const { email, password, name } = parsed.data;
    if (getUserByEmail(email))
        return res.status(409).json({ error: 'Email already registered' });
    const user = await createUser(email, password, name);
    const access = signAccessToken({ sub: user.id, email: user.email });
    const jti = randomUUID();
    const refresh = signRefreshToken({ sub: user.id, email: user.email, jti });
    activeRefresh.set(jti, { userId: user.id, email: user.email });
    res.cookie('refresh_token', refresh, { ...cookieOpts, maxAge: 7 * 24 * 3600 * 1000 });
    const body = { token: access, user };
    res.status(201).json(body);
});
authRouter.post('/login', async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'Invalid credentials' });
    const user = await verifyCredentials(parsed.data.email, parsed.data.password);
    if (!user)
        return res.status(401).json({ error: 'Invalid credentials' });
    const access = signAccessToken({ sub: user.id, email: user.email });
    const jti = randomUUID();
    const refresh = signRefreshToken({ sub: user.id, email: user.email, jti });
    activeRefresh.set(jti, { userId: user.id, email: user.email });
    res.cookie('refresh_token', refresh, { ...cookieOpts, maxAge: 7 * 24 * 3600 * 1000 });
    const body = { token: access, user };
    res.json(body);
});
authRouter.get('/me', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer '))
        return res.status(401).json({ error: 'Unauthorized' });
    const token = auth.slice(7);
    const payload = verifyToken(token);
    if (!payload)
        return res.status(401).json({ error: 'Unauthorized' });
    const user = getUserByEmail(payload.email);
    if (!user)
        return res.status(401).json({ error: 'Unauthorized' });
    res.json({ user });
});
authRouter.post('/refresh', (req, res) => {
    const rt = req.cookies?.refresh_token || req.body?.refresh_token;
    if (!rt)
        return res.status(401).json({ error: 'Unauthorized' });
    const payload = verifyAny(rt);
    if (!payload?.jti)
        return res.status(401).json({ error: 'Unauthorized' });
    const meta = activeRefresh.get(payload.jti);
    if (!meta || meta.revoked)
        return res.status(401).json({ error: 'Unauthorized' });
    // rotate
    meta.revoked = true;
    const jti = randomUUID();
    activeRefresh.set(jti, { userId: payload.sub, email: payload.email });
    const refresh = signRefreshToken({ sub: payload.sub, email: payload.email, jti });
    const access = signAccessToken({ sub: payload.sub, email: payload.email });
    res.cookie('refresh_token', refresh, { ...cookieOpts, maxAge: 7 * 24 * 3600 * 1000 });
    res.json({ token: access });
});
authRouter.post('/logout', (req, res) => {
    const rt = req.cookies?.refresh_token || req.body?.refresh_token;
    if (rt) {
        const payload = verifyAny(rt);
        if (payload?.jti) {
            const meta = activeRefresh.get(payload.jti);
            if (meta)
                meta.revoked = true;
        }
    }
    res.clearCookie('refresh_token', { ...cookieOpts, maxAge: 0 });
    res.json({ ok: true });
});
