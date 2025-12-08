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
import { supportAlertsRouter } from './crm/support_alerts.js';
import { productsRouter } from './crm/products.js';
import { termsReviewRouter } from './crm/terms_review.js';
import { documentsRouter } from './crm/documents.js';
import { marketingSegmentsRouter } from './marketing/segments.js';
import { marketingCampaignsRouter } from './marketing/campaigns.js';
import { marketingTrackingRouter } from './marketing/tracking.js';
import { marketingBuilderRouter } from './marketing/builder.js';
import { marketingTemplatesRouter } from './marketing/templates.js';
import { marketingSendRouter } from './marketing/send.js';
import { marketingUnsubscribeRouter } from './marketing/unsubscribe.js';
import { marketingImagesRouter } from './marketing/images.js';
import { socialAccountsRouter } from './marketing/social_accounts.js';
import { socialPostsRouter } from './marketing/social_posts.js';
import { socialOAuthRouter } from './marketing/social_oauth.js';
import { socialPublishRouter } from './marketing/social_publish.js';
import { surveysRouter } from './crm/surveys.js';
import { renewalsRouter } from './crm/renewals.js';
import { viewsRouter } from './views.js';
import { tasksRouter } from './crm/tasks.js';
import { getDb } from './db.js';
import { rolesRouter } from './auth/roles_routes.js';
import { preferencesRouter } from './auth/preferences.js';
import { assetsRouter } from './assets.js';
import { slasRouter } from './crm/slas.js';
import { contractTemplatesRouter } from './crm/contract_templates.js';
import { contractsPublicRouter } from './crm/contracts_public.js';
import { projectsRouter } from './crm/projects.js';
import { customerPortalAuthRouter } from './customer_portal/auth.js';
import { customerPortalDataRouter } from './customer_portal/data.js';
import { adminCustomerPortalUsersRouter } from './admin/customer_portal_users.js';
import { adminSeedDataRouter } from './admin/seed_data.js';
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
import cookieParser from 'cookie-parser';
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/crm', crmRouter);
// Public quote routes (no auth required) - must be before /api/crm/quotes
app.use('/api/quotes', quotesRouter);
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
app.use('/api/crm/support', supportAlertsRouter);
app.use('/api/crm/surveys', surveysRouter);
app.use('/api/crm/renewals', renewalsRouter);
// Add logging middleware before products router
app.use('/api/crm/products', (req, res, next) => {
    console.log('🚀 REQUEST TO /api/crm/products:', req.method, req.path, req.originalUrl);
    next();
});
app.use('/api/crm/products', productsRouter);
app.use('/api/crm/documents', documentsRouter);
app.use('/api/crm/tasks', tasksRouter);
app.use('/api/terms', termsReviewRouter);
app.use('/api/marketing', marketingSegmentsRouter);
app.use('/api/marketing', marketingCampaignsRouter);
app.use('/api/marketing', marketingTrackingRouter);
app.use('/api/marketing', marketingBuilderRouter);
app.use('/api/marketing', marketingTemplatesRouter);
app.use('/api/marketing', marketingSendRouter);
app.use('/api/marketing', marketingUnsubscribeRouter);
app.use('/api/marketing', marketingImagesRouter);
app.use('/api/marketing/social', socialAccountsRouter);
app.use('/api/marketing/social', socialPostsRouter);
app.use('/api/marketing/social/oauth', socialOAuthRouter);
app.use('/api/marketing/social', socialPublishRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/crm/slas', slasRouter);
app.use('/api/crm/contract-templates', contractTemplatesRouter);
app.use('/api/public/contracts', contractsPublicRouter);
app.use('/api/crm/projects', projectsRouter);
app.use('/api', rolesRouter);
app.use('/api', preferencesRouter);
app.use('/api', viewsRouter);
// Customer Portal (external customer access)
app.use('/api/customer-portal/auth', customerPortalAuthRouter);
app.use('/api/customer-portal/data', customerPortalDataRouter);
// Admin: Customer Portal User Management
app.use('/api/admin/customer-portal-users', adminCustomerPortalUsersRouter);
// Admin: Seed Data Endpoints
app.use('/api/admin/seed', adminSeedDataRouter);
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
        const tasksDueToday = await db.collection('crm_tasks').countDocuments({
            dueAt: { $gte: today, $lt: tomorrow },
            status: { $in: ['open', 'in_progress'] },
        });
        const tasksCompletedToday = await db.collection('crm_tasks').countDocuments({
            status: 'completed',
            completedAt: { $gte: today, $lt: tomorrow },
        });
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
