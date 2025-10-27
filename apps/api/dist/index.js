import express from 'express';
import cors from 'cors';
import { env } from './env.js';
// Local health response to avoid depending on workspace packages during deployment
const createHealthResponse = (service = 'api') => ({ ok: true, service, timestamp: Date.now() });
import { authRouter } from './auth/routes.js';
import { crmRouter } from './crm/routes.js';
import { accountsRouter } from './crm/accounts.js';
import { dealsRouter } from './crm/deals.js';
import { quotesRouter } from './crm/quotes.js';
import { invoicesRouter } from './crm/invoices.js';
import { outreachTemplatesRouter } from './crm/outreach_templates.js';
import { outreachSequencesRouter } from './crm/outreach_sequences.js';
import { outreachEventsRouter } from './crm/outreach_events.js';
import { outreachSendRouter } from './crm/outreach_send.js';
import { outreachEnrollmentsRouter } from './crm/outreach_enrollments.js';
import { outreachSchedulerRouter } from './crm/outreach_scheduler.js';
import { supportTicketsRouter } from './crm/support_tickets.js';
import { kbRouter } from './crm/kb.js';
import { getDb } from './db.js';
const app = express();
const normalize = (s) => s.trim().replace(/\/$/, '').toLowerCase();
const allowedOriginsRaw = env.ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
const allowedOrigins = allowedOriginsRaw.map(normalize);
const isAllowed = (origin) => {
    const o = normalize(origin);
    // Wildcard
    if (allowedOrigins.includes('*'))
        return true;
    // Exact match
    if (allowedOrigins.includes(o))
        return true;
    // Suffix match for any entry beginning with '.' (e.g., '.up.railway.app')
    for (const entry of allowedOrigins) {
        if (entry.startsWith('.') && o.endsWith(entry))
            return true;
    }
    // Always allow Railway preview domains as a convenience
    if (o.endsWith('.up.railway.app'))
        return true;
    return false;
};
const corsMiddleware = cors({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        return callback(null, isAllowed(origin));
    },
    credentials: true,
});
app.use(corsMiddleware);
app.options('*', corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/auth', authRouter);
app.use('/api/crm', crmRouter);
app.use('/api/crm/accounts', accountsRouter);
app.use('/api/crm/deals', dealsRouter);
app.use('/api/crm/quotes', quotesRouter);
app.use('/api/crm/invoices', invoicesRouter);
app.use('/api/crm/outreach/templates', outreachTemplatesRouter);
app.use('/api/crm/outreach/sequences', outreachSequencesRouter);
app.use('/api/crm/outreach/events', outreachEventsRouter);
app.use('/api/crm/outreach/send', outreachSendRouter);
app.use('/api/crm/outreach/enroll', outreachEnrollmentsRouter);
app.use('/api/crm/outreach/scheduler', outreachSchedulerRouter);
app.use('/api/crm/support', supportTicketsRouter);
app.use('/api/crm/support', kbRouter);
app.get('/health', (_req, res) => {
    res.json(createHealthResponse('api'));
});
// Simple metrics placeholder; replace with real queries when DB is connected
app.get('/api/metrics/summary', async (_req, res) => {
    try {
        const db = await getDb();
        if (!db) {
            return res.json({ data: { appointmentsToday: 0, tasksDueToday: 0, tasksCompletedToday: 0 }, error: null });
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const appointmentsToday = await db.collection('appointments').countDocuments({ startsAt: { $gte: today, $lt: tomorrow } });
        const tasksDueToday = await db.collection('tasks').countDocuments({ dueAt: { $gte: today, $lt: tomorrow }, status: { $ne: 'done' } });
        const tasksCompletedToday = await db.collection('tasks').countDocuments({ status: 'done', completedAt: { $gte: today, $lt: tomorrow } });
        res.json({ data: { appointmentsToday, tasksDueToday, tasksCompletedToday }, error: null });
    }
    catch (e) {
        res.status(500).json({ data: null, error: 'metrics_error' });
    }
});
app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${env.PORT}`);
});
// Global error handler to ensure CORS headers are present on errors
// Must be registered after routes
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error('Unhandled error:', err);
    if (res.headersSent)
        return;
    res.status(500).json({ data: null, error: 'internal_error' });
});
