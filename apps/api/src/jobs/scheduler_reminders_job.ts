import { getDb } from '../db.js'
import { ObjectId } from 'mongodb'
import { sendAuthEmail } from '../auth/email.js'

let started = false

function normEmail(v: any) {
  return String(v || '').trim().toLowerCase()
}

export function startSchedulerRemindersJob() {
  if (started) return
  started = true

  // Run every minute. Best-effort, never throw.
  setInterval(async () => {
    try {
      const db = await getDb()
      if (!db) return

      const now = new Date()
      const lookahead = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const candidates = await db
        .collection('appointments')
        .find({
          status: 'booked',
          reminderEmailSentAt: null,
          reminderMinutesBefore: { $ne: null },
          startsAt: { $gte: now, $lte: lookahead },
        } as any)
        .sort({ startsAt: 1 } as any)
        .limit(200)
        .toArray()

      for (const a of candidates as any[]) {
        const attendeeEmail = normEmail(a.attendeeEmail)
        if (!attendeeEmail) continue
        if (a.attendeeContactPreference && a.attendeeContactPreference !== 'email') continue

        const startsAt = a.startsAt ? new Date(a.startsAt) : null
        if (!startsAt || !Number.isFinite(startsAt.getTime())) continue

        const mins = Number(a.reminderMinutesBefore ?? 60)
        if (!Number.isFinite(mins) || mins < 0) continue

        const sendAt = new Date(startsAt.getTime() - mins * 60 * 1000)
        // Send if we're within a 2-minute window after the target time.
        if (now < sendAt) continue
        if (now.getTime() - sendAt.getTime() > 2 * 60 * 1000) continue

        // Load appointment type name if possible
        let typeName = a.appointmentTypeName || 'Appointment'
        try {
          if (a.appointmentTypeId && ObjectId.isValid(String(a.appointmentTypeId))) {
            const t = await db.collection('scheduler_appointment_types').findOne({ _id: new ObjectId(String(a.appointmentTypeId)) } as any)
            if (t?.name) typeName = String(t.name)
          }
        } catch {
          // ignore
        }

        const subject = `Reminder: ${typeName} — ${startsAt.toLocaleString()}`
        const text = `Reminder: you have an upcoming appointment.\n\n${typeName}\nWhen: ${startsAt.toLocaleString()}\nAttendee: ${a.attendeeName || attendeeEmail}\n`
        const html = `<p><strong>Reminder: upcoming appointment</strong></p><p>${typeName}<br/>When: ${startsAt.toLocaleString()}<br/>Attendee: ${a.attendeeName || attendeeEmail}</p>`

        await sendAuthEmail({ to: attendeeEmail, subject, text, html, checkPreferences: false })

        await db.collection('appointments').updateOne(
          { _id: a._id } as any,
          { $set: { reminderEmailSentAt: new Date(), updatedAt: new Date() } } as any,
        )
      }
    } catch {
      // never throw
    }
  }, 60_000)
}


