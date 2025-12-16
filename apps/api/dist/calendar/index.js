import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db.js';
import { requireAuth, requireApplication } from '../auth/rbac.js';
export const calendarRouter = Router();
calendarRouter.use(requireAuth);
calendarRouter.use(requireApplication('calendar'));
const rangeSchema = z.object({
    from: z.string().min(10),
    to: z.string().min(10),
});
// GET /api/calendar/events?from=ISO&to=ISO
// Returns a merged view of:
// - Scheduler appointments where the current user is the owner (host)
// - CRM tasks (meetings/calls/todos) owned by the current user
calendarRouter.get('/events', async (req, res) => {
    const parsed = rangeSchema.safeParse({ from: req.query.from, to: req.query.to });
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_range', details: parsed.error.flatten() });
    const from = new Date(parsed.data.from);
    const to = new Date(parsed.data.to);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
        return res.status(400).json({ data: null, error: 'invalid_range' });
    }
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const [appointments, tasks] = await Promise.all([
        db
            .collection('appointments')
            .find({
            ownerUserId: auth.userId,
            status: { $ne: 'cancelled' },
            startsAt: { $lt: to },
            endsAt: { $gt: from },
        })
            .sort({ startsAt: 1 })
            .toArray(),
        db
            .collection('crm_tasks')
            .find({
            ownerUserId: auth.userId,
            dueAt: { $gte: from, $lt: to },
            status: { $in: ['open', 'in_progress'] },
        })
            .sort({ dueAt: 1 })
            .limit(2000)
            .toArray(),
    ]);
    const events = [];
    for (const a of appointments) {
        events.push({
            kind: 'appointment',
            id: String(a._id),
            title: a.appointmentTypeName ? String(a.appointmentTypeName) : `Appointment: ${a.attendeeName || a.attendeeEmail || ''}`.trim(),
            startsAt: a.startsAt?.toISOString?.() ?? null,
            endsAt: a.endsAt?.toISOString?.() ?? null,
            timeZone: a.timeZone ?? 'UTC',
            attendee: {
                firstName: a.attendeeFirstName ?? null,
                lastName: a.attendeeLastName ?? null,
                name: a.attendeeName ?? null,
                email: a.attendeeEmail ?? null,
                phone: a.attendeePhone ?? null,
                contactPreference: a.attendeeContactPreference ?? null,
            },
            contactId: a.contactId ?? null,
            source: a.source ?? null,
            scheduledBy: a.scheduledByEmail ? { userId: a.scheduledByUserId ?? null, email: a.scheduledByEmail, name: a.scheduledByName ?? null } : null,
        });
    }
    for (const t of tasks) {
        const due = t.dueAt ? new Date(t.dueAt) : null;
        if (!due || !Number.isFinite(due.getTime()))
            continue;
        const end = new Date(due.getTime() + 30 * 60 * 1000);
        events.push({
            kind: 'task',
            id: String(t._id),
            title: String(t.subject || 'Task'),
            startsAt: due.toISOString(),
            endsAt: end.toISOString(),
            taskType: t.type ?? null,
            relatedType: t.relatedType ?? null,
            relatedId: t.relatedId ?? null,
        });
    }
    res.json({ data: { items: events }, error: null });
});
