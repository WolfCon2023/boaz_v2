import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { getDb } from '../db.js'
import { requireAuth, requireApplication } from '../auth/rbac.js'
import { m365Router } from './m365.js'

export const calendarRouter = Router()

calendarRouter.use(requireAuth)
calendarRouter.use(requireApplication('calendar'))
calendarRouter.use('/m365', m365Router)

const rangeSchema = z.object({
  from: z.string().min(10),
  to: z.string().min(10),
})

// GET /api/calendar/events?from=ISO&to=ISO
// Returns a merged view of:
// - Scheduler appointments where the current user is the owner (host)
// - CRM tasks (meetings/calls/todos) owned by the current user
calendarRouter.get('/events', async (req: any, res) => {
  const parsed = rangeSchema.safeParse({ from: req.query.from, to: req.query.to })
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_range', details: parsed.error.flatten() })

  const from = new Date(parsed.data.from)
  const to = new Date(parsed.data.to)
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
    return res.status(400).json({ data: null, error: 'invalid_range' })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }

  const [appointments, tasks] = await Promise.all([
    db
      .collection('appointments')
      .find({
        ownerUserId: auth.userId,
        status: { $ne: 'cancelled' },
        startsAt: { $lt: to },
        endsAt: { $gt: from },
      } as any)
      .sort({ startsAt: 1 } as any)
      .toArray(),
    db
      .collection('crm_tasks')
      .find({
        ownerUserId: auth.userId,
        dueAt: { $gte: from, $lt: to },
        status: { $in: ['open', 'in_progress'] },
      } as any)
      .sort({ dueAt: 1 } as any)
      .limit(2000)
      .toArray(),
  ])

  const events: any[] = []

  for (const a of appointments as any[]) {
    events.push({
      kind: 'appointment',
      id: String(a._id),
      title: a.appointmentTypeName ? String(a.appointmentTypeName) : `Appointment: ${a.attendeeName || a.attendeeEmail || ''}`.trim(),
      startsAt: a.startsAt?.toISOString?.() ?? null,
      endsAt: a.endsAt?.toISOString?.() ?? null,
      timeZone: a.timeZone ?? 'UTC',
      orgVisible: a.orgVisible === true,
      locationType: a.locationType ?? 'video',
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
    })
  }

  for (const t of tasks as any[]) {
    const due = t.dueAt ? new Date(t.dueAt) : null
    if (!due || !Number.isFinite(due.getTime())) continue
    const end = new Date(due.getTime() + 30 * 60 * 1000)
    events.push({
      kind: 'task',
      id: String(t._id),
      title: String(t.subject || 'Task'),
      startsAt: due.toISOString(),
      endsAt: end.toISOString(),
      taskType: t.type ?? null,
      relatedType: t.relatedType ?? null,
      relatedId: t.relatedId ?? null,
    })
  }

  res.json({ data: { items: events }, error: null })
})

// GET /api/calendar/events/org?from=ISO&to=ISO
// Org calendar visible to all authenticated users.
// Shows:
//   - Appointments marked orgVisible: true (from anyone)
//   - The current user's own appointments (always)
//   - For managers/admins: all appointments from their direct reports (reportsTo)
calendarRouter.get('/events/org', async (req: any, res) => {
  const parsed = rangeSchema.safeParse({ from: req.query.from, to: req.query.to })
  if (!parsed.success) return res.status(400).json({ data: null, error: 'invalid_range', details: parsed.error.flatten() })

  const from = new Date(parsed.data.from)
  const to = new Date(parsed.data.to)
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
    return res.status(400).json({ data: null, error: 'invalid_range' })
  }

  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })

  const auth = req.auth as { userId: string; email: string }

  // Find direct reports (users whose reportsTo matches the current user)
  const directReports = await db
    .collection('users')
    .find({ reportsTo: auth.userId } as any)
    .project({ _id: 1 } as any)
    .toArray()
  const directReportIds = directReports.map((u: any) => String(u._id))

  // Build the set of userIds whose ALL appointments are visible to this user
  const fullAccessUserIds = [auth.userId, ...directReportIds]

  // Query appointments: orgVisible=true OR owned by fullAccessUserIds
  const appointmentFilter: any = {
    status: { $ne: 'cancelled' },
    startsAt: { $lt: to },
    endsAt: { $gt: from },
    $or: [
      { orgVisible: true },
      { ownerUserId: { $in: fullAccessUserIds } },
    ],
  }

  // Query tasks: only for self + direct reports (tasks don't have orgVisible)
  const taskFilter: any = {
    ownerUserId: { $in: fullAccessUserIds },
    dueAt: { $gte: from, $lt: to },
    status: { $in: ['open', 'in_progress'] },
    type: { $in: ['meeting', 'call'] },
  }

  const [appointments, tasks] = await Promise.all([
    db
      .collection('appointments')
      .find(appointmentFilter)
      .sort({ startsAt: 1 } as any)
      .limit(5000)
      .toArray(),
    db
      .collection('crm_tasks')
      .find(taskFilter)
      .sort({ dueAt: 1 } as any)
      .limit(5000)
      .toArray(),
  ])

  const userIds = Array.from(
    new Set(
      [
        ...appointments.map((a: any) => String(a.ownerUserId || '')).filter(Boolean),
        ...tasks.map((t: any) => String(t.ownerUserId || '')).filter(Boolean),
      ],
    ),
  )

  const userMap = new Map<string, { name: string | null; email: string | null }>()
  if (userIds.length) {
    const docs = await db
      .collection('users')
      .find({ _id: { $in: userIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)) } } as any)
      .project({ name: 1, email: 1 } as any)
      .toArray()
    for (const u of docs as any[]) {
      userMap.set(String(u._id), { name: u.name ? String(u.name) : null, email: u.email ? String(u.email) : null })
    }
  }

  const events: any[] = []

  for (const a of appointments as any[]) {
    const ownerUserId = String(a.ownerUserId || '')
    const owner = ownerUserId ? userMap.get(ownerUserId) : undefined
    events.push({
      kind: 'appointment',
      id: String(a._id),
      ownerUserId: ownerUserId || null,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      orgVisible: a.orgVisible === true,
      locationType: a.locationType ?? 'video',
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
    })
  }

  for (const t of tasks as any[]) {
    const due = t.dueAt ? new Date(t.dueAt) : null
    if (!due || !Number.isFinite(due.getTime())) continue
    const end = new Date(due.getTime() + 30 * 60 * 1000)
    const ownerUserId = t.ownerUserId ? String(t.ownerUserId) : null
    const owner = ownerUserId ? userMap.get(ownerUserId) : undefined
    events.push({
      kind: 'task',
      id: String(t._id),
      ownerUserId,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? (t.ownerEmail ?? null),
      title: String(t.subject || 'Task'),
      startsAt: due.toISOString(),
      endsAt: end.toISOString(),
      taskType: t.type ?? null,
      relatedType: t.relatedType ?? null,
      relatedId: t.relatedId ?? null,
    })
  }

  events.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

  res.json({ data: { items: events }, error: null })
})


