import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../db.js';
import { requireAuth, requireApplication, requirePermission } from '../auth/rbac.js';
import { dispatchCrmEvent } from '../crm/integrations_core.js';
import { sendAuthEmail } from '../auth/email.js';
import { m365CreateEventForAppointment, m365DeleteEvent, m365HasConflict } from '../calendar/m365.js';
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
function normEmail(v) {
    const s = String(v || '').trim().toLowerCase();
    return s;
}
async function ensureContactForAttendee(db, attendee) {
    try {
        const email = normEmail(attendee.email);
        if (!email)
            return { contactId: null };
        const rx = new RegExp(`^${escapeRegex(email)}$`, 'i');
        const existing = await db.collection('contacts').findOne({ email: rx });
        if (existing?._id)
            return { contactId: String(existing._id) };
        const fullName = `${String(attendee.firstName || '').trim()} ${String(attendee.lastName || '').trim()}`.trim() ||
            String(attendee.name || '').trim() ||
            email;
        const doc = {
            name: fullName,
            company: undefined,
            email,
            mobilePhone: undefined,
            officePhone: attendee.phone ? String(attendee.phone).trim() : undefined,
            isPrimary: false,
            primaryPhone: undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
            metadata: { source: 'scheduler' },
        };
        const ins = await db.collection('contacts').insertOne(doc);
        return { contactId: String(ins.insertedId) };
    }
    catch {
        return { contactId: null };
    }
}
function icsEscape(s) {
    return String(s || '')
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
}
function toIcsUtc(dt) {
    const d = new Date(dt);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${y}${m}${da}T${hh}${mm}${ss}Z`;
}
function buildIcsInvite(args) {
    const dtstamp = toIcsUtc(new Date());
    const dtstart = toIcsUtc(args.startsAt);
    const dtend = toIcsUtc(args.endsAt);
    const organizer = args.organizerEmail ? `ORGANIZER:MAILTO:${icsEscape(args.organizerEmail)}` : '';
    const desc = args.description ? `DESCRIPTION:${icsEscape(args.description)}` : '';
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//BOAZ//Scheduler//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        `UID:${icsEscape(args.uid)}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        `SUMMARY:${icsEscape(args.summary)}`,
        desc,
        organizer,
        `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:MAILTO:${icsEscape(args.attendeeEmail)}`,
        'END:VEVENT',
        'END:VCALENDAR',
        '',
    ]
        .filter(Boolean)
        .join('\r\n');
}
async function sendInviteEmails(db, appointment, type) {
    try {
        const attendeeEmail = normEmail(appointment.attendeeEmail);
        if (!attendeeEmail)
            return;
        // Respect preference if explicitly not email
        if (appointment.attendeeContactPreference && appointment.attendeeContactPreference !== 'email') {
            return;
        }
        let organizerEmail = null;
        try {
            if (appointment.ownerUserId && ObjectId.isValid(appointment.ownerUserId)) {
                const u = await db.collection('users').findOne({ _id: new ObjectId(appointment.ownerUserId) });
                organizerEmail = u?.email ? String(u.email) : null;
            }
        }
        catch {
            organizerEmail = null;
        }
        const summary = `${type.name}`;
        const description = [
            `Appointment: ${type.name}`,
            `Attendee: ${appointment.attendeeName} (${attendeeEmail})`,
            appointment.attendeePhone ? `Phone: ${appointment.attendeePhone}` : null,
            appointment.notes ? `Notes: ${appointment.notes}` : null,
        ]
            .filter(Boolean)
            .join('\n');
        const uid = `boaz_${String(appointment._id)}@scheduler`;
        const ics = buildIcsInvite({
            uid,
            summary,
            description,
            startsAt: appointment.startsAt,
            endsAt: appointment.endsAt,
            organizerEmail,
            attendeeEmail,
        });
        const subject = `Confirmed: ${type.name} — ${new Date(appointment.startsAt).toLocaleString()}`;
        const text = `Your appointment is confirmed.\n\n${description}\n\nThis message includes a calendar invite (.ics).`;
        const html = `<p><strong>Your appointment is confirmed.</strong></p><pre style="white-space:pre-wrap">${icsEscape(description)}</pre><p>This message includes a calendar invite (.ics).</p>`;
        await sendAuthEmail({
            to: attendeeEmail,
            subject,
            text,
            html,
            attachments: [{ filename: 'invite.ics', content: Buffer.from(ics, 'utf8'), contentType: 'text/calendar; charset=utf-8; method=REQUEST' }],
            checkPreferences: false,
        });
        // Also notify the organizer (host) if available and different from attendee
        if (organizerEmail && normEmail(organizerEmail) && normEmail(organizerEmail) !== attendeeEmail) {
            await sendAuthEmail({
                to: organizerEmail,
                subject: `Booked: ${type.name} — ${appointment.attendeeName}`,
                text: `A new appointment was booked.\n\n${description}`,
                html: `<p><strong>A new appointment was booked.</strong></p><pre style="white-space:pre-wrap">${icsEscape(description)}</pre>`,
                attachments: [{ filename: 'invite.ics', content: Buffer.from(ics, 'utf8'), contentType: 'text/calendar; charset=utf-8; method=REQUEST' }],
                checkPreferences: false,
            });
        }
    }
    catch {
        // best-effort
    }
}
async function createMeetingTaskFromAppointment(db, ownerUserId, appointment, type, contactId) {
    try {
        const newId = new ObjectId().toHexString();
        const subject = `${type.name}: ${appointment.attendeeName}`.slice(0, 180);
        const relatedType = contactId ? 'contact' : undefined;
        const relatedId = contactId ? String(contactId) : undefined;
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
// GET /api/scheduler/users (for Scheduled By dropdown)
// Requires users.read (staff/manager/admin in default roles)
internal.get('/users', requirePermission('users.read'), async (_req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const users = await db
        .collection('users')
        .find({})
        .project({ email: 1, name: 1 })
        .sort({ name: 1, email: 1 })
        .limit(500)
        .toArray();
    res.json({
        data: {
            items: users.map((u) => ({ id: String(u._id), name: u.name ?? null, email: u.email ?? null })),
        },
        error: null,
    });
});
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
                appointmentTypeName: d.appointmentTypeName ?? null,
                appointmentTypeSlug: d.appointmentTypeSlug ?? null,
                contactId: d.contactId ?? null,
                attendeeFirstName: d.attendeeFirstName ?? null,
                attendeeLastName: d.attendeeLastName ?? null,
                attendeeContactPreference: d.attendeeContactPreference ?? null,
                scheduledByUserId: d.scheduledByUserId ?? null,
                scheduledByName: d.scheduledByName ?? null,
                scheduledByEmail: d.scheduledByEmail ?? null,
                inviteEmailSentAt: d.inviteEmailSentAt?.toISOString?.() ?? null,
                reminderMinutesBefore: d.reminderMinutesBefore ?? null,
                reminderEmailSentAt: d.reminderEmailSentAt?.toISOString?.() ?? null,
                startsAt: d.startsAt?.toISOString?.() ?? null,
                endsAt: d.endsAt?.toISOString?.() ?? null,
                createdAt: d.createdAt?.toISOString?.() ?? null,
                updatedAt: d.updatedAt?.toISOString?.() ?? null,
            })),
        },
        error: null,
    });
});
const internalBookSchema = z.object({
    appointmentTypeId: z.string().min(6),
    contactId: z.string().optional().nullable(),
    attendeeFirstName: z.string().min(1).max(80),
    attendeeLastName: z.string().min(1).max(80),
    attendeeEmail: z.string().email().max(180),
    attendeePhone: z.string().max(40).optional().nullable(),
    attendeeContactPreference: z.enum(['email', 'phone', 'sms']).optional().nullable(),
    scheduledByUserId: z.string().optional().nullable(),
    notes: z.string().max(1500).optional().nullable(),
    startsAt: z.string().min(10),
    timeZone: z.string().min(1).max(64).optional(),
    reminderMinutesBefore: z.number().int().min(0).max(7 * 24 * 60).optional().nullable(),
});
// POST /api/scheduler/appointments/book (internal scheduling)
internal.post('/appointments/book', async (req, res) => {
    const parsed = internalBookSchema.safeParse(req.body ?? {});
    if (!parsed.success)
        return res.status(400).json({ data: null, error: 'invalid_payload', details: parsed.error.flatten() });
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const auth = req.auth;
    let typeId;
    try {
        typeId = new ObjectId(parsed.data.appointmentTypeId);
    }
    catch {
        return res.status(400).json({ data: null, error: 'invalid_appointmentTypeId' });
    }
    const type = (await db.collection('scheduler_appointment_types').findOne({ _id: typeId, ownerUserId: auth.userId, active: true }));
    if (!type)
        return res.status(404).json({ data: null, error: 'appointment_type_not_found' });
    // Reuse public booking logic by delegating to the same checks:
    const availability = await ensureDefaultAvailability(db, String(type.ownerUserId));
    const tz = availability.timeZone || parsed.data.timeZone || 'UTC';
    const startUtc = new Date(parsed.data.startsAt);
    if (!Number.isFinite(startUtc.getTime()))
        return res.status(400).json({ data: null, error: 'invalid_startsAt' });
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
    // Optional: Microsoft 365 busy-time conflict check (best-effort). If connected and busy, block booking.
    try {
        const ext = await m365HasConflict(db, String(type.ownerUserId), bufferedStart.toISOString(), bufferedEnd.toISOString());
        if (ext.ok && ext.conflict)
            return res.status(409).json({ data: null, error: 'external_calendar_busy' });
    }
    catch {
        // ignore
    }
    // Optional: Microsoft 365 busy-time conflict check (best-effort). If connected and busy, block booking.
    try {
        const ext = await m365HasConflict(db, String(type.ownerUserId), bufferedStart.toISOString(), bufferedEnd.toISOString());
        if (ext.ok && ext.conflict)
            return res.status(409).json({ data: null, error: 'external_calendar_busy' });
    }
    catch {
        // ignore
    }
    const attendeeEmail = normEmail(parsed.data.attendeeEmail);
    const attendeeFirstName = parsed.data.attendeeFirstName.trim();
    const attendeeLastName = parsed.data.attendeeLastName.trim();
    const attendeeName = `${attendeeFirstName} ${attendeeLastName}`.trim();
    const attendeePhone = parsed.data.attendeePhone ? parsed.data.attendeePhone.trim() : null;
    // Optional: user-selected CRM contact
    let contactId = null;
    if (parsed.data.contactId && ObjectId.isValid(parsed.data.contactId)) {
        try {
            const c = await db.collection('contacts').findOne({ _id: new ObjectId(parsed.data.contactId) });
            if (c?._id)
                contactId = String(c._id);
        }
        catch {
            contactId = null;
        }
    }
    if (!contactId) {
        const ensured = await ensureContactForAttendee(db, {
            firstName: attendeeFirstName,
            lastName: attendeeLastName,
            name: attendeeName,
            email: attendeeEmail,
            phone: attendeePhone,
        });
        contactId = ensured.contactId;
    }
    // Scheduled By: default to current user; allow override if provided and valid.
    let scheduledByUserId = auth.userId;
    let scheduledByName = null;
    let scheduledByEmail = auth.email ?? null;
    if (parsed.data.scheduledByUserId && ObjectId.isValid(parsed.data.scheduledByUserId)) {
        try {
            const u = await db.collection('users').findOne({ _id: new ObjectId(parsed.data.scheduledByUserId) });
            if (u?._id) {
                scheduledByUserId = String(u._id);
                scheduledByName = u.name ? String(u.name) : null;
                scheduledByEmail = u.email ? String(u.email) : null;
            }
        }
        catch {
            // ignore
        }
    }
    const doc = {
        _id: new ObjectId(),
        appointmentTypeId: type._id,
        appointmentTypeName: type.name ?? null,
        appointmentTypeSlug: type.slug ?? null,
        ownerUserId: String(type.ownerUserId),
        status: 'booked',
        contactId,
        attendeeFirstName,
        attendeeLastName,
        attendeeName,
        attendeeEmail,
        attendeePhone,
        attendeeContactPreference: parsed.data.attendeeContactPreference ?? 'email',
        scheduledByUserId,
        scheduledByName,
        scheduledByEmail,
        inviteEmailSentAt: null,
        reminderMinutesBefore: parsed.data.reminderMinutesBefore ?? 60,
        reminderEmailSentAt: null,
        m365EventId: null,
        notes: parsed.data.notes ? parsed.data.notes.trim() : null,
        startsAt: startUtc,
        endsAt: endUtc,
        timeZone: tz,
        source: 'internal',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    await db.collection('appointments').insertOne(doc);
    await createMeetingTaskFromAppointment(db, String(type.ownerUserId), doc, type, contactId);
    // Email + webhook events are best-effort
    sendInviteEmails(db, doc, type)
        .then(async () => {
        await db.collection('appointments').updateOne({ _id: doc._id }, { $set: { inviteEmailSentAt: new Date(), updatedAt: new Date() } });
    })
        .catch(() => null);
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
    }, { source: 'scheduler_internal_booking' }).catch(() => null);
    // Best-effort: create Outlook event for organizer if connected
    m365CreateEventForAppointment(db, String(type.ownerUserId), doc)
        .then(async (r) => {
        if (!r.ok)
            return;
        await db.collection('appointments').updateOne({ _id: doc._id }, { $set: { m365EventId: r.eventId, updatedAt: new Date() } });
    })
        .catch(() => null);
    res.status(201).json({ data: { _id: String(doc._id) }, error: null });
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
    // Best-effort: delete Outlook event if we created one
    if (appt.m365EventId) {
        m365DeleteEvent(db, auth.userId, String(appt.m365EventId)).catch(() => null);
    }
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
// GET /api/scheduler/appointments/by-contact/:contactId?from=ISO&to=ISO
// Used by CRM contact "dashboard" to show upcoming appointments.
internal.get('/appointments/by-contact/:contactId', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    const contactId = String(req.params.contactId || '').trim();
    if (!ObjectId.isValid(contactId))
        return res.status(400).json({ data: null, error: 'invalid_contactId' });
    const fromRaw = normStr(req.query.from);
    const toRaw = normStr(req.query.to);
    const from = fromRaw ? new Date(fromRaw) : new Date();
    const to = toRaw ? new Date(toRaw) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
        return res.status(400).json({ data: null, error: 'invalid_range' });
    }
    const items = await db
        .collection('appointments')
        .find({
        contactId: String(contactId),
        status: { $ne: 'cancelled' },
        startsAt: { $lt: to },
        endsAt: { $gt: from },
    })
        .sort({ startsAt: 1 })
        .limit(200)
        .toArray();
    res.json({
        data: {
            items: items.map((d) => ({
                ...d,
                _id: String(d._id),
                appointmentTypeId: String(d.appointmentTypeId),
                appointmentTypeName: d.appointmentTypeName ?? null,
                appointmentTypeSlug: d.appointmentTypeSlug ?? null,
                contactId: d.contactId ?? null,
                startsAt: d.startsAt?.toISOString?.() ?? null,
                endsAt: d.endsAt?.toISOString?.() ?? null,
                timeZone: d.timeZone ?? null,
                status: d.status ?? null,
                attendeeName: d.attendeeName ?? null,
                attendeeEmail: d.attendeeEmail ?? null,
                attendeePhone: d.attendeePhone ?? null,
            })),
        },
        error: null,
    });
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
    attendeeFirstName: z.string().min(1).max(80).optional(),
    attendeeLastName: z.string().min(1).max(80).optional(),
    attendeeName: z.string().min(1).max(120).optional(),
    attendeeEmail: z.string().email().max(180),
    attendeePhone: z.string().max(40).optional().nullable(),
    attendeeContactPreference: z.enum(['email', 'phone', 'sms']).optional().nullable(),
    notes: z.string().max(1500).optional().nullable(),
    startsAt: z.string().min(10),
    timeZone: z.string().min(1).max(64).optional(),
    reminderMinutesBefore: z.number().int().min(0).max(7 * 24 * 60).optional().nullable(),
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
        appointmentTypeName: type.name ?? null,
        appointmentTypeSlug: type.slug ?? null,
        ownerUserId: String(type.ownerUserId),
        status: 'booked',
        contactId: null,
        attendeeFirstName: parsed.data.attendeeFirstName ? parsed.data.attendeeFirstName.trim() : null,
        attendeeLastName: parsed.data.attendeeLastName ? parsed.data.attendeeLastName.trim() : null,
        attendeeName: (() => {
            const first = parsed.data.attendeeFirstName ? parsed.data.attendeeFirstName.trim() : '';
            const last = parsed.data.attendeeLastName ? parsed.data.attendeeLastName.trim() : '';
            const combined = `${first} ${last}`.trim();
            return combined || String(parsed.data.attendeeName || '').trim() || parsed.data.attendeeEmail.trim().toLowerCase();
        })(),
        attendeeEmail: parsed.data.attendeeEmail.trim().toLowerCase(),
        attendeePhone: parsed.data.attendeePhone ? parsed.data.attendeePhone.trim() : null,
        attendeeContactPreference: parsed.data.attendeeContactPreference ?? 'email',
        scheduledByUserId: null,
        scheduledByName: null,
        scheduledByEmail: null,
        inviteEmailSentAt: null,
        reminderMinutesBefore: parsed.data.reminderMinutesBefore ?? 60,
        reminderEmailSentAt: null,
        m365EventId: null,
        notes: parsed.data.notes ? parsed.data.notes.trim() : null,
        startsAt: startUtc,
        endsAt: endUtc,
        timeZone: tz,
        source: 'public',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const { contactId } = await ensureContactForAttendee(db, {
        firstName: doc.attendeeFirstName,
        lastName: doc.attendeeLastName,
        name: doc.attendeeName,
        email: doc.attendeeEmail,
        phone: doc.attendeePhone,
    });
    doc.contactId = contactId;
    await db.collection('appointments').insertOne(doc);
    await createMeetingTaskFromAppointment(db, String(type.ownerUserId), doc, type, contactId);
    sendInviteEmails(db, doc, type)
        .then(async () => {
        await db.collection('appointments').updateOne({ _id: doc._id }, { $set: { inviteEmailSentAt: new Date(), updatedAt: new Date() } });
    })
        .catch(() => null);
    // Best-effort: create Outlook event for organizer if connected
    m365CreateEventForAppointment(db, String(type.ownerUserId), doc)
        .then(async (r) => {
        if (!r.ok)
            return;
        await db.collection('appointments').updateOne({ _id: doc._id }, { $set: { m365EventId: r.eventId, updatedAt: new Date() } });
    })
        .catch(() => null);
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
