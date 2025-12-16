import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../db.js';
import { requireAuth, requireApplication } from '../auth/rbac.js';
import { dispatchCrmEvent } from '../crm/integrations_core.js';
export const schedulerRouter = Router();
function normStr(v) {
    return typeof v === 'string' ? v.trim() : '';
}
function safeMin(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}
function slugify(input) {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 64);
}
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function getTimeZoneOffsetMinutes(timeZone, date) {
    // Compute offset (in minutes) of a given IANA timeZone at a given instant.
    // Technique: format the instant in that TZ, reconstruct an equivalent UTC time, and diff.
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    const parts = dtf.formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const y = Number(get('year'));
    const m = Number(get('month'));
    const d = Number(get('day'));
    const hh = Number(get('hour'));
    const mm = Number(get('minute'));
    const ss = Number(get('second'));
    const asUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
    return (asUtc - date.getTime()) / 60000;
}
function zonedTimeToUtc(timeZone, y, m, d, hh, mm) {
    // Convert local TZ components -> UTC Date (best-effort across DST) using 2-pass offset adjustment.
    let utcGuess = Date.UTC(y, m - 1, d, hh, mm, 0);
    let off1 = getTimeZoneOffsetMinutes(timeZone, new Date(utcGuess));
    utcGuess = utcGuess - off1 * 60000;
    let off2 = getTimeZoneOffsetMinutes(timeZone, new Date(utcGuess));
    utcGuess = utcGuess - (off2 - off1) * 60000;
    return new Date(utcGuess);
}
function getZonedYmd(timeZone, date) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const parts = dtf.formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const y = Number(get('year'));
    const mo = Number(get('month'));
    const da = Number(get('day'));
    const hh = Number(get('hour'));
    const mi = Number(get('minute'));
    const wd = String(get('weekday') || '');
    const dayIndex = wd.startsWith('Sun') ? 0 : wd.startsWith('Mon') ? 1 : wd.startsWith('Tue') ? 2 : wd.startsWith('Wed') ? 3 : wd.startsWith('Thu') ? 4 : wd.startsWith('Fri') ? 5 : 6;
    return { y, m: mo, d: da, hh, mm: mi, dayIndex };
}
async function ensureDefaultAvailability(db, ownerUserId) {
    // db is typed as `any` in this codebase, so avoid generic type parameters (TS2347).
    const coll = db.collection('scheduler_availability');
    const existing = (await coll.findOne({ ownerUserId }));
    if (existing)
        return existing;
    const now = new Date();
    const doc = {
        _id: new ObjectId(),
        ownerUserId,
        timeZone: 'UTC',
        weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
            day,
            enabled: day >= 1 && day <= 5, // Mon-Fri
            startMin: 9 * 60,
            endMin: 17 * 60,
        })),
        createdAt: now,
        updatedAt: now,
    };
    await coll.insertOne(doc);
    return doc;
}
function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
}
async function createMeetingTaskFromAppointment(db, ownerUserId, appointment, type) {
    try {
        const newId = new ObjectId().toHexString();
        const subject = `${type.name}: ${appointment.attendeeName}`.slice(0, 180);
        // Best-effort: link meeting to a CRM contact by attendee email.
        let relatedType;
        let relatedId;
        try {
            const email = String(appointment.attendeeEmail || '').trim().toLowerCase();
            if (email) {
                const rx = new RegExp(`^${escapeRegex(email)}$`, 'i');
                const existing = await db.collection('contacts').findOne({ email: rx });
                if (existing?._id) {
                    relatedType = 'contact';
                    relatedId = String(existing._id);
                }
                else {
                    const doc = {
                        name: appointment.attendeeName,
                        email,
                        officePhone: appointment.attendeePhone ?? undefined,
                        mobilePhone: undefined,
                        company: undefined,
                        isPrimary: false,
                        primaryPhone: undefined,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        metadata: { source: 'scheduler' },
                    };
                    const ins = await db.collection('contacts').insertOne(doc);
                    relatedType = 'contact';
                    relatedId = String(ins.insertedId);
                }
            }
        }
        catch {
            // best-effort
        }
        await db.collection('crm_tasks').insertOne({
            _id: newId,
            type: 'meeting',
            subject,
            description: appointment.notes ?? undefined,
            status: 'open',
            priority: 'normal',
            dueAt: appointment.startsAt,
            completedAt: null,
            ownerUserId,
            ownerName: undefined,
            ownerEmail: undefined,
            relatedType,
            relatedId,
            createdAt: new Date(),
            updatedAt: new Date(),
            metadata: {
                source: 'scheduler',
                appointmentId: String(appointment._id),
                appointmentTypeId: String(type._id),
                attendeeEmail: appointment.attendeeEmail,
                attendeeName: appointment.attendeeName,
                relatedType: relatedType ?? null,
                relatedId: relatedId ?? null,
            },
        });
    }
    catch {
        // best-effort
    }
}
const internal = Router();
internal.use(requireAuth);
internal.use(requireApplication('scheduler'));
// GET /api/scheduler/appointment-types
internal.get('/appointment-types', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const items = await db
        .collection('scheduler_appointment_types')
        .find({ ownerUserId: auth.userId })
        .sort({ updatedAt: -1 })
        .toArray();
    res.json({
        data: {
            items: items.map((d) => ({
                ...d,
                _id: String(d._id),
                createdAt: d.createdAt?.toISOString?.() ?? null,
                updatedAt: d.updatedAt?.toISOString?.() ?? null,
            })),
        },
        error: null,
    });
});
const appointmentTypeSchema = z.object({
    name: z.string().min(1).max(120),
    slug: z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    durationMinutes: z.number().int().min(5).max(480),
    locationType: z.enum(['video', 'phone', 'in_person', 'custom']).optional(),
    locationDetails: z.string().max(400).optional().nullable(),
    bufferBeforeMinutes: z.number().int().min(0).max(120).optional(),
    bufferAfterMinutes: z.number().int().min(0).max(120).optional(),
    active: z.boolean().default(true),
});
// POST /api/scheduler/appointment-types
internal.post('/appointment-types', async (req, res) => {
    const parsed = appointmentTypeSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const now = new Date();
    const slug = slugify(parsed.data.slug);
    if (!slug)
        return res.status(400).json({ data: null, error: 'invalid_slug' });
    // ensure unique per owner
    const existing = await db.collection('scheduler_appointment_types').findOne({ ownerUserId: auth.userId, slug });
    if (existing)
        return res.status(409).json({ data: null, error: 'slug_taken' });
    const doc = {
        _id: new ObjectId(),
        ownerUserId: auth.userId,
        name: parsed.data.name.trim(),
        slug,
        durationMinutes: parsed.data.durationMinutes,
        locationType: parsed.data.locationType ?? 'video',
        locationDetails: parsed.data.locationDetails ?? null,
        bufferBeforeMinutes: parsed.data.bufferBeforeMinutes ?? 0,
        bufferAfterMinutes: parsed.data.bufferAfterMinutes ?? 0,
        active: parsed.data.active ?? true,
        createdAt: now,
        updatedAt: now,
    };
    await db.collection('scheduler_appointment_types').insertOne(doc);
    res.status(201).json({ data: { _id: String(doc._id) }, error: null });
});
// PUT /api/scheduler/appointment-types/:id
internal.put('/appointment-types/:id', async (req, res) => {
    const parsed = appointmentTypeSchema.partial().safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    let _id;
    try {
        _id = new ObjectId(req.params.id);
    }
    catch {
        return res.status(400).json({ data: null, error: 'invalid_id' });
    }
    const update = { updatedAt: new Date() };
    if (parsed.data.name !== undefined)
        update.name = parsed.data.name.trim();
    if (parsed.data.slug !== undefined)
        update.slug = slugify(parsed.data.slug);
    if (parsed.data.durationMinutes !== undefined)
        update.durationMinutes = parsed.data.durationMinutes;
    if (parsed.data.locationType !== undefined)
        update.locationType = parsed.data.locationType;
    if (parsed.data.locationDetails !== undefined)
        update.locationDetails = parsed.data.locationDetails ?? null;
    if (parsed.data.bufferBeforeMinutes !== undefined)
        update.bufferBeforeMinutes = parsed.data.bufferBeforeMinutes;
    if (parsed.data.bufferAfterMinutes !== undefined)
        update.bufferAfterMinutes = parsed.data.bufferAfterMinutes;
    if (parsed.data.active !== undefined)
        update.active = parsed.data.active;
    if (update.slug) {
        const clash = await db
            .collection('scheduler_appointment_types')
            .findOne({ ownerUserId: auth.userId, slug: update.slug, _id: { $ne: _id } });
        if (clash)
            return res.status(409).json({ data: null, error: 'slug_taken' });
    }
    const r = await db.collection('scheduler_appointment_types').updateOne({ _id, ownerUserId: auth.userId }, { $set: update });
    if (!r.matchedCount)
        return res.status(404).json({ data: null, error: 'not_found' });
    res.json({ data: { ok: true }, error: null });
});
// DELETE /api/scheduler/appointment-types/:id
internal.delete('/appointment-types/:id', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    let _id;
    try {
        _id = new ObjectId(req.params.id);
    }
    catch {
        return res.status(400).json({ data: null, error: 'invalid_id' });
    }
    const r = await db.collection('scheduler_appointment_types').deleteOne({ _id, ownerUserId: auth.userId });
    if (!r.deletedCount)
        return res.status(404).json({ data: null, error: 'not_found' });
    res.json({ data: { ok: true }, error: null });
});
// GET /api/scheduler/availability/me
internal.get('/availability/me', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const doc = await ensureDefaultAvailability(db, auth.userId);
    res.json({
        data: {
            timeZone: doc.timeZone,
            weekly: doc.weekly,
            updatedAt: doc.updatedAt?.toISOString?.() ?? null,
        },
        error: null,
    });
});
const availabilitySchema = z.object({
    timeZone: z.string().min(1).max(64),
    weekly: z
        .array(z.object({
        day: z.number().int().min(0).max(6),
        enabled: z.boolean(),
        startMin: z.number().int().min(0).max(24 * 60),
        endMin: z.number().int().min(0).max(24 * 60),
    }))
        .min(7)
        .max(7),
});
// PUT /api/scheduler/availability/me
internal.put('/availability/me', async (req, res) => {
    const parsed = availabilitySchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const now = new Date();
    const weekly = parsed.data.weekly
        .map((d) => ({
        day: d.day,
        enabled: d.enabled,
        startMin: clamp(d.startMin, 0, 24 * 60),
        endMin: clamp(d.endMin, 0, 24 * 60),
    }))
        .sort((a, b) => a.day - b.day);
    await db.collection('scheduler_availability').updateOne({ ownerUserId: auth.userId }, {
        $set: {
            timeZone: parsed.data.timeZone,
            weekly,
            updatedAt: now,
        },
        $setOnInsert: { _id: new ObjectId(), ownerUserId: auth.userId, createdAt: now },
    }, { upsert: true });
    res.json({ data: { ok: true }, error: null });
});
// GET /api/scheduler/appointments?from=ISO&to=ISO
internal.get('/appointments', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    const fromRaw = normStr(req.query.from);
    const toRaw = normStr(req.query.to);
    const from = fromRaw ? new Date(fromRaw) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = toRaw ? new Date(toRaw) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
        return res.status(400).json({ data: null, error: 'invalid_range' });
    }
    const items = await db
        .collection('appointments')
        .find({ ownerUserId: auth.userId, startsAt: { $gte: from, $lt: to } })
        .sort({ startsAt: 1 })
        .toArray();
    res.json({
        data: {
            items: items.map((d) => ({
                ...d,
                _id: String(d._id),
                appointmentTypeId: String(d.appointmentTypeId),
                startsAt: d.startsAt?.toISOString?.() ?? null,
                endsAt: d.endsAt?.toISOString?.() ?? null,
                createdAt: d.createdAt?.toISOString?.() ?? null,
                updatedAt: d.updatedAt?.toISOString?.() ?? null,
            })),
        },
        error: null,
    });
});
// POST /api/scheduler/appointments/:id/cancel
internal.post('/appointments/:id/cancel', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    let _id;
    try {
        _id = new ObjectId(req.params.id);
    }
    catch {
        return res.status(400).json({ data: null, error: 'invalid_id' });
    }
    const appt = (await db.collection('appointments').findOne({ _id, ownerUserId: auth.userId }));
    if (!appt)
        return res.status(404).json({ data: null, error: 'not_found' });
    const r = await db.collection('appointments').updateOne({ _id, ownerUserId: auth.userId }, { $set: { status: 'cancelled', updatedAt: new Date() } });
    if (!r.matchedCount)
        return res.status(404).json({ data: null, error: 'not_found' });
    // Best-effort: cancel matching CRM task(s) created from this appointment.
    db.collection('crm_tasks')
        .updateMany({ 'metadata.source': 'scheduler', 'metadata.appointmentId': String(_id) }, { $set: { status: 'cancelled', updatedAt: new Date() } })
        .catch(() => null);
    // Best-effort: webhook event
    dispatchCrmEvent(db, 'scheduler.appointment.cancelled', {
        appointmentId: String(_id),
        ownerUserId: auth.userId,
        attendeeEmail: appt.attendeeEmail ?? null,
        attendeeName: appt.attendeeName ?? null,
        startsAt: appt.startsAt?.toISOString?.() ?? null,
        endsAt: appt.endsAt?.toISOString?.() ?? null,
    }, { source: 'scheduler_cancel' }).catch(() => null);
    res.json({ data: { ok: true }, error: null });
});
const publicRouter = Router();
// GET /api/scheduler/public/booking-links/:slug
publicRouter.get('/booking-links/:slug', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const slug = slugify(String(req.params.slug || ''));
    if (!slug)
        return res.status(400).json({ data: null, error: 'invalid_slug' });
    const type = (await db.collection('scheduler_appointment_types').findOne({ slug, active: true }));
    if (!type)
        return res.status(404).json({ data: null, error: 'not_found' });
    const availability = await ensureDefaultAvailability(db, String(type.ownerUserId));
    const now = new Date();
    const windowDays = clamp(safeMin(req.query.windowDays, 14), 1, 60);
    const to = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const existing = await db
        .collection('appointments')
        .find({ ownerUserId: String(type.ownerUserId), status: 'booked', startsAt: { $gte: now, $lt: to } })
        .project({ startsAt: 1, endsAt: 1 })
        .toArray();
    res.json({
        data: {
            type: {
                _id: String(type._id),
                name: type.name,
                slug: type.slug,
                durationMinutes: type.durationMinutes,
                locationType: type.locationType ?? 'video',
                locationDetails: type.locationDetails ?? null,
                bufferBeforeMinutes: type.bufferBeforeMinutes ?? 0,
                bufferAfterMinutes: type.bufferAfterMinutes ?? 0,
            },
            availability: {
                timeZone: availability.timeZone,
                weekly: availability.weekly,
            },
            existing: existing.map((e) => ({
                startsAt: e.startsAt?.toISOString?.() ?? null,
                endsAt: e.endsAt?.toISOString?.() ?? null,
            })),
            window: { from: now.toISOString(), to: to.toISOString() },
        },
        error: null,
    });
});
const bookSchema = z.object({
    attendeeName: z.string().min(1).max(120),
    attendeeEmail: z.string().email().max(180),
    attendeePhone: z.string().max(40).optional().nullable(),
    notes: z.string().max(1500).optional().nullable(),
    startsAt: z.string().min(10),
    timeZone: z.string().min(1).max(64).optional(),
});
// POST /api/scheduler/public/book/:slug
publicRouter.post('/book/:slug', async (req, res) => {
    const parsed = bookSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const slug = slugify(String(req.params.slug || ''));
    if (!slug)
        return res.status(400).json({ data: null, error: 'invalid_slug' });
    const type = (await db.collection('scheduler_appointment_types').findOne({ slug, active: true }));
    if (!type)
        return res.status(404).json({ data: null, error: 'not_found' });
    const availability = await ensureDefaultAvailability(db, String(type.ownerUserId));
    const tz = availability.timeZone || parsed.data.timeZone || 'UTC';
    const startUtc = new Date(parsed.data.startsAt);
    if (!Number.isFinite(startUtc.getTime()))
        return res.status(400).json({ data: null, error: 'invalid_startsAt' });
    // Validate slot: within next 60 days, within availability window, and no conflicts (including buffers).
    const now = new Date();
    const max = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    if (startUtc < now || startUtc > max)
        return res.status(400).json({ data: null, error: 'startsAt_out_of_range' });
    const dur = Number(type.durationMinutes ?? 30);
    const bufferBefore = Number(type.bufferBeforeMinutes ?? 0);
    const bufferAfter = Number(type.bufferAfterMinutes ?? 0);
    const endUtc = new Date(startUtc.getTime() + dur * 60000);
    const bufferedStart = new Date(startUtc.getTime() - bufferBefore * 60000);
    const bufferedEnd = new Date(endUtc.getTime() + bufferAfter * 60000);
    const zoned = getZonedYmd(tz, startUtc);
    const dayCfg = (availability.weekly || []).find((d) => Number(d.day) === zoned.dayIndex);
    if (!dayCfg || !dayCfg.enabled)
        return res.status(400).json({ data: null, error: 'outside_availability' });
    const startMin = zoned.hh * 60 + zoned.mm;
    if (startMin < dayCfg.startMin || startMin + dur > dayCfg.endMin) {
        return res.status(400).json({ data: null, error: 'outside_availability' });
    }
    // Recompute UTC from zoned wall-clock to ensure we aren't accepting mismatched TZ inputs
    const startUtcRoundTrip = zonedTimeToUtc(tz, zoned.y, zoned.m, zoned.d, zoned.hh, zoned.mm);
    if (Math.abs(startUtcRoundTrip.getTime() - startUtc.getTime()) > 2 * 60 * 1000) {
        return res.status(400).json({ data: null, error: 'timezone_mismatch' });
    }
    const conflicts = await db
        .collection('appointments')
        .find({
        ownerUserId: String(type.ownerUserId),
        status: 'booked',
        startsAt: { $lt: bufferedEnd },
        endsAt: { $gt: bufferedStart },
    })
        .limit(1)
        .toArray();
    if (conflicts.length)
        return res.status(409).json({ data: null, error: 'slot_taken' });
    const doc = {
        _id: new ObjectId(),
        appointmentTypeId: type._id,
        ownerUserId: String(type.ownerUserId),
        status: 'booked',
        attendeeName: parsed.data.attendeeName.trim(),
        attendeeEmail: parsed.data.attendeeEmail.trim().toLowerCase(),
        attendeePhone: parsed.data.attendeePhone ? parsed.data.attendeePhone.trim() : null,
        notes: parsed.data.notes ? parsed.data.notes.trim() : null,
        startsAt: startUtc,
        endsAt: endUtc,
        timeZone: tz,
        source: 'public',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    await db.collection('appointments').insertOne(doc);
    await createMeetingTaskFromAppointment(db, String(type.ownerUserId), doc, type);
    // Best-effort: webhook event
    dispatchCrmEvent(db, 'scheduler.appointment.booked', {
        appointmentId: String(doc._id),
        appointmentTypeId: String(type._id),
        appointmentTypeSlug: type.slug,
        appointmentTypeName: type.name,
        ownerUserId: String(type.ownerUserId),
        attendeeEmail: doc.attendeeEmail,
        attendeeName: doc.attendeeName,
        attendeePhone: doc.attendeePhone ?? null,
        startsAt: doc.startsAt.toISOString(),
        endsAt: doc.endsAt.toISOString(),
        timeZone: doc.timeZone,
        source: doc.source,
    }, { source: 'scheduler_public_booking' }).catch(() => null);
    res.status(201).json({ data: { _id: String(doc._id) }, error: null });
});
schedulerRouter.use('/', internal);
schedulerRouter.use('/public', publicRouter);
