import * as React from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'
import { generateBookingSlots } from '@/lib/schedulerSlots'

type PublicBookingData = {
  data: {
    type: {
      _id: string
      name: string
      slug: string
      durationMinutes: number
      locationType: string
      locationDetails?: string | null
      bufferBeforeMinutes?: number
      bufferAfterMinutes?: number
    }
    availability: { timeZone: string; weekly: Array<{ day: number; enabled: boolean; startMin: number; endMin: number }> }
    existing: Array<{ startsAt: string; endsAt: string }>
    slots?: Array<{ iso: string; label: string }>
    window: { from: string; to: string }
  }
  error: any
}

export default function SchedulerPublicBooking() {
  const { slug = '' } = useParams()
  const toast = useToast()

  const q = useQuery<PublicBookingData>({
    queryKey: ['scheduler-public', slug],
    queryFn: async () => (await http.get(`/api/scheduler/public/booking-links/${encodeURIComponent(slug)}`)).data,
    enabled: !!slug,
    retry: false,
  })

  const [selectedIso, setSelectedIso] = React.useState('')
  const [attendeeFirstName, setAttendeeFirstName] = React.useState('')
  const [attendeeLastName, setAttendeeLastName] = React.useState('')
  const [attendeeEmail, setAttendeeEmail] = React.useState('')
  const [attendeePhone, setAttendeePhone] = React.useState('')
  const [contactPreference, setContactPreference] = React.useState<'email' | 'phone' | 'sms'>('email')
  const [notes, setNotes] = React.useState('')

  const book = useMutation({
    mutationFn: async () => {
      const data = q.data?.data
      if (!data) throw new Error('missing_booking_link')
      const tz = data.availability.timeZone || 'UTC'
      const res = await http.post(`/api/scheduler/public/book/${encodeURIComponent(data.type.slug)}`, {
        attendeeFirstName: attendeeFirstName.trim(),
        attendeeLastName: attendeeLastName.trim(),
        attendeeEmail: attendeeEmail.trim(),
        attendeePhone: attendeePhone.trim() || null,
        attendeeContactPreference: contactPreference,
        notes: notes.trim() || null,
        startsAt: selectedIso,
        timeZone: tz,
      })
      return res.data
    },
    onSuccess: () => {
      const data = q.data?.data
      if (data) {
        const selectedDate = new Date(selectedIso)
        const tz = data.availability.timeZone || 'UTC'
        const formattedDate = selectedDate.toLocaleString('en-US', {
          timeZone: tz,
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        })
        toast.showToast(`Appointment confirmed for ${formattedDate}! Check your email for the calendar invite.`, 'success')
      } else {
        toast.showToast('Appointment confirmed! Check your email for the calendar invite.', 'success')
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Booking failed.'
      toast.showToast(msg, 'error')
    },
  })

  const slots = React.useMemo(() => {
    const data = q.data?.data
    if (!data) return []
    if (Array.isArray(data.slots) && data.slots.length) return data.slots
    return generateBookingSlots({
      timeZone: data.availability.timeZone || 'UTC',
      weekly: data.availability.weekly || [],
      type: {
        durationMinutes: Number(data.type.durationMinutes || 30),
        bufferBeforeMinutes: Number(data.type.bufferBeforeMinutes || 0),
        bufferAfterMinutes: Number(data.type.bufferAfterMinutes || 0),
      },
      existing: data.existing || [],
      windowFromIso: data.window.from,
      windowToIso: data.window.to,
      maxSlots: 24,
      stepMinutes: 15,
    })
  }, [q.data?.data])

  if (q.isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-sm text-[color:var(--color-text-muted)]">Loading booking page…</div>
      </div>
    )
  }

  if (!q.data?.data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-center">
          <div className="text-base font-semibold">Booking page not found</div>
          <div className="mt-2 text-sm text-[color:var(--color-text-muted)]">The link may be invalid or disabled.</div>
        </div>
      </div>
    )
  }

  const data = q.data.data
  const tz = data.availability.timeZone || 'UTC'

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-[min(92vw,52rem)] grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
          <div className="text-xl font-semibold">{data.type.name}</div>
          <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
            {data.type.durationMinutes} min • {String(data.type.locationType || 'video')} • Timezone: {tz}
          </div>
          {data.type.locationDetails ? (
            <div className="mt-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 text-sm">
              <div className="text-xs font-semibold text-[color:var(--color-text-muted)]">Location details</div>
              <div className="mt-1">{data.type.locationDetails}</div>
            </div>
          ) : null}

          <div className="mt-4 text-xs text-[color:var(--color-text-muted)]">
            Powered by BOAZ Scheduler. (Calendar integrations + email confirmations are coming next.)
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 space-y-4">
          <div>
            <div className="text-sm font-semibold">Pick a time</div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {slots.length ? (
                slots.map((s) => (
                  <button
                    key={s.iso}
                    type="button"
                    onClick={() => setSelectedIso(s.iso)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm hover:bg-[color:var(--color-muted)] ${
                      selectedIso === s.iso ? 'border-[color:var(--color-primary)] bg-[color:var(--color-primary-soft)]' : 'border-[color:var(--color-border)]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 text-sm text-[color:var(--color-text-muted)]">
                  No available times in the next two weeks.
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[color:var(--color-border)] pt-4 space-y-3">
            <div className="text-sm font-semibold">Your details</div>
            <div className="grid gap-2">
              <input
                value={attendeeFirstName}
                onChange={(e) => setAttendeeFirstName(e.target.value)}
                placeholder="First name"
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
              />
              <input
                value={attendeeLastName}
                onChange={(e) => setAttendeeLastName(e.target.value)}
                placeholder="Last name"
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
              />
              <input
                value={attendeeEmail}
                onChange={(e) => setAttendeeEmail(e.target.value)}
                placeholder="Your email"
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
              />
              <input
                value={attendeePhone}
                onChange={(e) => setAttendeePhone(e.target.value)}
                placeholder="Phone (optional)"
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
              />
              <select
                value={contactPreference}
                onChange={(e) => setContactPreference(e.target.value as any)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
              >
                <option value="email">Contact preference: Email</option>
                <option value="phone">Contact preference: Phone</option>
                <option value="sms">Contact preference: SMS</option>
              </select>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={3}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
              />
            </div>

            <button
              type="button"
              disabled={!selectedIso || !attendeeFirstName.trim() || !attendeeLastName.trim() || !attendeeEmail.trim() || book.isPending}
              onClick={() => {
                if (!selectedIso) return
                if (!attendeeFirstName.trim() || !attendeeLastName.trim() || !attendeeEmail.trim()) {
                  toast.showToast('First name, last name, and email are required.', 'error')
                  return
                }
                book.mutate()
              }}
              className="w-full rounded-xl bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
            >
              Book appointment
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


