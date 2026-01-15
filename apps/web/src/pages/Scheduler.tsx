import * as React from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

type AppointmentType = {
  _id: string
  name: string
  slug: string
  durationMinutes: number
  locationType?: 'video' | 'phone' | 'in_person' | 'custom'
  locationDetails?: string | null
  bufferBeforeMinutes?: number
  bufferAfterMinutes?: number
  active: boolean
  createdAt?: string | null
  updatedAt?: string | null
}

type Availability = {
  timeZone: string
  weekly: Array<{ day: number; enabled: boolean; startMin: number; endMin: number }>
  updatedAt?: string | null
}

type Appointment = {
  _id: string
  appointmentTypeId: string
  appointmentTypeName?: string | null
  appointmentTypeSlug?: string | null
  status: 'booked' | 'cancelled'
  attendeeFirstName?: string | null
  attendeeLastName?: string | null
  attendeeName: string
  attendeeEmail: string
  attendeePhone?: string | null
  attendeeContactPreference?: 'email' | 'phone' | 'sms' | null
  scheduledByUserId?: string | null
  scheduledByName?: string | null
  scheduledByEmail?: string | null
  inviteEmailSentAt?: string | null
  reminderMinutesBefore?: number | null
  reminderEmailSentAt?: string | null
  startsAt: string
  endsAt: string
  timeZone: string
  source: 'public' | 'internal'
}

type SystemUser = { id: string; name?: string | null; email?: string | null }
type ContactSearchRow = { _id: string; name?: string; email?: string; mobilePhone?: string; officePhone?: string }

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function minsToHHMM(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${pad(h)}:${pad(m)}`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Scheduler() {
  const qc = useQueryClient()
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [tab, setTab] = React.useState<'types' | 'availability' | 'appointments'>('types')

  const typesQ = useQuery<{ data: { items: AppointmentType[] } }>({
    queryKey: ['scheduler', 'types'],
    queryFn: async () => (await http.get('/api/scheduler/appointment-types')).data,
  })

  const availabilityQ = useQuery<{ data: Availability }>({
    queryKey: ['scheduler', 'availability'],
    queryFn: async () => (await http.get('/api/scheduler/availability/me')).data,
  })

  const appointmentsQ = useQuery<{ data: { items: Appointment[] } }>({
    queryKey: ['scheduler', 'appointments'],
    queryFn: async () => {
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const to = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      return (await http.get('/api/scheduler/appointments', { params: { from, to } })).data
    },
    refetchInterval: 60_000,
  })

  // New appointment type form
  const [name, setName] = React.useState('15 min intro call')
  const [slug, setSlug] = React.useState('intro-call')
  const [durationMinutes, setDurationMinutes] = React.useState(15)
  const [locationType, setLocationType] = React.useState<'video' | 'phone' | 'in_person' | 'custom'>('video')
  const [locationDetails, setLocationDetails] = React.useState('')
  const [bufferBeforeMinutes, setBufferBeforeMinutes] = React.useState(0)
  const [bufferAfterMinutes, setBufferAfterMinutes] = React.useState(0)
  const [active, setActive] = React.useState(true)

  const createType = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: name.trim(),
        slug: slug.trim(),
        durationMinutes,
        locationType,
        locationDetails: locationDetails.trim() || null,
        bufferBeforeMinutes,
        bufferAfterMinutes,
        active,
      }
      const res = await http.post('/api/scheduler/appointment-types', payload)
      return res.data as { data: { _id: string }; error: any }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['scheduler', 'types'] })
      toast.showToast('Appointment type created.', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to create appointment type.'
      toast.showToast(msg, 'error')
    },
  })

  const deleteType = useMutation({
    mutationFn: async (id: string) => (await http.delete(`/api/scheduler/appointment-types/${encodeURIComponent(id)}`)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['scheduler', 'types'] })
      toast.showToast('Appointment type deleted.', 'success')
    },
    onError: () => toast.showToast('Failed to delete appointment type.', 'error'),
  })

  const saveAvailability = useMutation({
    mutationFn: async (payload: Availability) => (await http.put('/api/scheduler/availability/me', payload)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['scheduler', 'availability'] })
      toast.showToast('Availability saved.', 'success')
    },
    onError: () => toast.showToast('Failed to save availability.', 'error'),
  })

  const cancelAppointment = useMutation({
    mutationFn: async (id: string) => (await http.post(`/api/scheduler/appointments/${encodeURIComponent(id)}/cancel`)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['scheduler', 'appointments'] })
      toast.showToast('Appointment cancelled.', 'success')
    },
    onError: () => toast.showToast('Failed to cancel appointment.', 'error'),
  })

  const types = typesQ.data?.data.items ?? []
  const availability = availabilityQ.data?.data
  const appointments = appointmentsQ.data?.data.items ?? []

  const usersQ = useQuery<{ data: { items: SystemUser[] } }>({
    queryKey: ['scheduler', 'users'],
    queryFn: async () => (await http.get('/api/scheduler/users')).data,
    retry: false,
  })

  // Get user preferences for timezone
  const preferencesQ = useQuery<{ data: { preferences: { timezone?: string } } }>({
    queryKey: ['preferences', 'me'],
    queryFn: async () => (await http.get('/api/preferences/me')).data,
    retry: false,
  })
  const userTimezone = preferencesQ.data?.data?.preferences?.timezone || 'America/New_York'

  const [tzDraft, setTzDraft] = React.useState<string>(() => {
    try {
      return userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
    } catch {
      return 'America/New_York'
    }
  })
  
  // Update timezone draft when preferences load
  React.useEffect(() => {
    if (userTimezone && !availability?.timeZone) {
      setTzDraft(userTimezone)
    }
  }, [userTimezone, availability?.timeZone])
  const [weeklyDraft, setWeeklyDraft] = React.useState<Availability['weekly']>([])
  React.useEffect(() => {
    if (!availability) return
    setTzDraft(availability.timeZone || tzDraft)
    setWeeklyDraft(availability.weekly || [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilityQ.data?.data?.updatedAt])

  function copyLink(slugValue: string) {
    const url = `${window.location.origin}/schedule/${encodeURIComponent(slugValue)}`
    navigator.clipboard
      .writeText(url)
      .then(() => toast.showToast('Booking link copied.', 'success'))
      .catch(() => toast.showToast('Failed to copy link.', 'error'))
  }

  // Internal appointment form (staff scheduling)
  const [bookTypeId, setBookTypeId] = React.useState('')
  const [bookStartsAtLocal, setBookStartsAtLocal] = React.useState('')
  const [bookDate, setBookDate] = React.useState('')
  const [bookTime, setBookTime] = React.useState('')
  const [showDatePicker, setShowDatePicker] = React.useState(false)
  const [datePickerMonth, setDatePickerMonth] = React.useState(new Date())
  const datePickerRef = React.useRef<HTMLDivElement>(null)

  // Close date picker when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false)
      }
    }
    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDatePicker])

  // Sync date/time fields when bookStartsAtLocal changes externally (but not from our own updates)
  React.useEffect(() => {
    if (bookStartsAtLocal && (!bookDate || !bookTime)) {
      try {
        const date = new Date(bookStartsAtLocal)
        if (Number.isFinite(date.getTime())) {
          // Extract date in local timezone (YYYY-MM-DD)
          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const day = String(date.getDate()).padStart(2, '0')
          const dateStr = `${year}-${month}-${day}`
          
          // Extract time in local timezone (HH:MM)
          const hours = String(date.getHours()).padStart(2, '0')
          const minutes = String(date.getMinutes()).padStart(2, '0')
          const timeStr = `${hours}:${minutes}`
          
          setBookDate(dateStr)
          setBookTime(timeStr)
        }
      } catch {
        // Ignore parsing errors
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookStartsAtLocal])
  const [bookContactQuery, setBookContactQuery] = React.useState('')
  const [bookContactId, setBookContactId] = React.useState<string>('')
  const [bookFirstName, setBookFirstName] = React.useState('')
  const [bookLastName, setBookLastName] = React.useState('')
  const [bookEmail, setBookEmail] = React.useState('')
  const [bookPhone, setBookPhone] = React.useState('')
  const [bookPreference, setBookPreference] = React.useState<'email' | 'phone' | 'sms'>('email')
  const [bookNotes, setBookNotes] = React.useState('')
  const [bookScheduledByUserId, setBookScheduledByUserId] = React.useState<string>('')
  const [bookReminderMinutes, setBookReminderMinutes] = React.useState<number>(60)

  const contactSearchQ = useQuery<{ data: { items: ContactSearchRow[] } }>({
    queryKey: ['scheduler', 'contact-search', bookContactQuery],
    queryFn: async () => (await http.get('/api/crm/contacts', { params: { q: bookContactQuery.trim(), limit: 10 } })).data,
    enabled: bookContactQuery.trim().length >= 2,
    retry: false,
  })

  const createAppointment = useMutation({
    mutationFn: async () => {
      const startsAt = new Date(bookStartsAtLocal)
      if (!Number.isFinite(startsAt.getTime())) {
        throw new Error('invalid_startsAt')
      }
      const res = await http.post('/api/scheduler/appointments/book', {
        appointmentTypeId: bookTypeId,
        contactId: bookContactId || null,
        attendeeFirstName: bookFirstName.trim(),
        attendeeLastName: bookLastName.trim(),
        attendeeEmail: bookEmail.trim(),
        attendeePhone: bookPhone.trim() || null,
        attendeeContactPreference: bookPreference,
        scheduledByUserId: bookScheduledByUserId || null,
        notes: bookNotes.trim() || null,
        startsAt: startsAt.toISOString(),
        timeZone: tzDraft || 'UTC',
        reminderMinutesBefore: Number.isFinite(bookReminderMinutes) ? bookReminderMinutes : 60,
      })
      return res.data
    },
    onSuccess: async () => {
      toast.showToast('Appointment booked and invite sent.', 'success')
      setBookStartsAtLocal('')
      setBookDate('')
      setBookTime('')
      setBookContactQuery('')
      setBookContactId('')
      setBookFirstName('')
      setBookLastName('')
      setBookEmail('')
      setBookPhone('')
      setBookNotes('')
      await qc.invalidateQueries({ queryKey: ['scheduler', 'appointments'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to book appointment.'
      toast.showToast(msg, 'error')
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Scheduler</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Appointment types, availability, booking links — with CRM feedback (meetings show up as Tasks).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/apps/crm" className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">
            CRM Hub
          </Link>
          <Link to="/workspace/me" className="rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)]">
            Workspace
          </Link>
        </div>
      </div>

      <div className="inline-flex rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-1 text-sm">
        <button
          type="button"
          onClick={() => setTab('types')}
          className={`rounded-lg px-3 py-2 ${tab === 'types' ? 'bg-[color:var(--color-muted)] font-semibold' : ''}`}
        >
          Appointment types
        </button>
        <button
          type="button"
          onClick={() => setTab('availability')}
          className={`rounded-lg px-3 py-2 ${tab === 'availability' ? 'bg-[color:var(--color-muted)] font-semibold' : ''}`}
        >
          Availability
        </button>
        <button
          type="button"
          onClick={() => setTab('appointments')}
          className={`rounded-lg px-3 py-2 ${tab === 'appointments' ? 'bg-[color:var(--color-muted)] font-semibold' : ''}`}
        >
          Appointments
        </button>
      </div>

      {tab === 'types' && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 space-y-3">
            <div className="text-sm font-semibold">New appointment type</div>
            <div className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Slug</label>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                  placeholder="intro-call"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Duration (min)</label>
                <input
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value) || 15)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Location</label>
                <select
                  value={locationType}
                  onChange={(e) => setLocationType(e.target.value as any)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                >
                  <option value="video">Video</option>
                  <option value="phone">Phone</option>
                  <option value="in_person">In person</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="md:col-span-1">
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Active</label>
                <select
                  value={active ? '1' : '0'}
                  onChange={(e) => setActive(e.target.value === '1')}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                >
                  <option value="1">Yes</option>
                  <option value="0">No</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-3">
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Location details (optional)</label>
                <input
                  value={locationDetails}
                  onChange={(e) => setLocationDetails(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                  placeholder="Zoom link, address, instructions…"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Buffer before</label>
                <input
                  type="number"
                  value={bufferBeforeMinutes}
                  onChange={(e) => setBufferBeforeMinutes(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Buffer after</label>
                <input
                  type="number"
                  value={bufferAfterMinutes}
                  onChange={(e) => setBufferAfterMinutes(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!name.trim() || !slug.trim()) {
                      toast.showToast('Name and slug are required.', 'error')
                      return
                    }
                    createType.mutate()
                  }}
                  disabled={createType.isPending}
                  className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
            <div className="border-b border-[color:var(--color-border)] px-4 py-3 text-sm font-semibold">
              Appointment types ({typesQ.isLoading ? '…' : types.length})
            </div>
            <div className="divide-y divide-[color:var(--color-border)]">
              {types.map((t) => (
                <div key={t._id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{t.name}</span>
                      {!t.active && (
                        <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                          inactive
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      /schedule/{t.slug} • {t.durationMinutes} min • {t.locationType || 'video'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/schedule/${encodeURIComponent(t.slug)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
                    >
                      Open booking page
                    </a>
                    <button
                      type="button"
                      onClick={() => copyLink(t.slug)}
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
                    >
                      Copy link
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm('Delete this appointment type?', { confirmText: 'Delete', confirmColor: 'danger' })
                        if (!ok) return
                        deleteType.mutate(t._id)
                      }}
                      disabled={deleteType.isPending}
                      className="rounded-lg border border-red-400 px-3 py-2 text-xs text-red-500 hover:bg-red-950/40 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {!types.length && !typesQ.isLoading && (
                <div className="px-4 py-8 text-center text-xs text-[color:var(--color-text-muted)]">
                  No appointment types yet. Create one above to get started.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'availability' && (
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 space-y-3">
          <div className="text-sm font-semibold">Availability</div>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            This controls which time slots appear on your public booking pages. (Team scheduling, round‑robin, and calendar sync are coming next.)
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Time zone (IANA)</label>
              <input
                value={tzDraft}
                onChange={(e) => setTzDraft(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                placeholder="America/New_York"
              />
            </div>
            <div className="md:col-span-2 flex items-end justify-end">
              <button
                type="button"
                onClick={() => {
                  if (weeklyDraft.length !== 7) {
                    toast.showToast('Availability must include 7 days.', 'error')
                    return
                  }
                  saveAvailability.mutate({ timeZone: tzDraft.trim() || 'UTC', weekly: weeklyDraft })
                }}
                disabled={saveAvailability.isPending}
                className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
              >
                Save availability
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--color-text-muted)]">
                  <th className="py-2 pr-3">Day</th>
                  <th className="py-2 pr-3">Enabled</th>
                  <th className="py-2 pr-3">Start</th>
                  <th className="py-2 pr-3">End</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {(weeklyDraft.length ? weeklyDraft : availability?.weekly || []).map((d, idx) => (
                  <tr key={d.day} className="align-middle">
                    <td className="py-2 pr-3 font-medium">{DAYS[d.day] || `Day ${d.day}`}</td>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={d.enabled}
                        onChange={(e) => {
                          const next = [...(weeklyDraft.length ? weeklyDraft : availability?.weekly || [])]
                          next[idx] = { ...next[idx], enabled: e.target.checked }
                          setWeeklyDraft(next)
                        }}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="time"
                        value={minsToHHMM(d.startMin)}
                        onChange={(e) => {
                          const [hh, mm] = e.target.value.split(':').map((x) => Number(x))
                          const next = [...(weeklyDraft.length ? weeklyDraft : availability?.weekly || [])]
                          next[idx] = { ...next[idx], startMin: hh * 60 + mm }
                          setWeeklyDraft(next)
                        }}
                        className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="time"
                        value={minsToHHMM(d.endMin)}
                        onChange={(e) => {
                          const [hh, mm] = e.target.value.split(':').map((x) => Number(x))
                          const next = [...(weeklyDraft.length ? weeklyDraft : availability?.weekly || [])]
                          next[idx] = { ...next[idx], endMin: hh * 60 + mm }
                          setWeeklyDraft(next)
                        }}
                        className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'appointments' && (
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
            <div className="text-sm font-semibold">Appointments</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              {appointmentsQ.isFetching ? 'Refreshing…' : `${appointments.length} upcoming/recent`}
            </div>
          </div>

          <div className="border-b border-[color:var(--color-border)] px-4 py-3">
            <div className="text-sm font-semibold">Create appointment (internal)</div>
            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              Book on behalf of a client. Calendar app will provide a richer slot picker; this MVP uses a date/time input + server-side conflict checks.
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Customer search (CRM Contacts)</label>
                <input
                  value={bookContactQuery}
                  onChange={(e) => {
                    setBookContactQuery(e.target.value)
                    if (!e.target.value.trim()) setBookContactId('')
                  }}
                  placeholder="Search name or email…"
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                />
                {contactSearchQ.data?.data.items?.length ? (
                  <div className="mt-2 max-h-40 overflow-auto rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)]">
                    {contactSearchQ.data.data.items.map((c) => (
                      <button
                        key={c._id}
                        type="button"
                        onClick={() => {
                          setBookContactId(c._id)
                          setBookContactQuery(c.name || c.email || '')
                          const full = String(c.name || '').trim()
                          const parts = full.split(/\s+/).filter(Boolean)
                          if (parts.length >= 2) {
                            setBookFirstName(parts[0])
                            setBookLastName(parts.slice(1).join(' '))
                          } else if (parts.length === 1) {
                            setBookFirstName(parts[0])
                          }
                          if (c.email) setBookEmail(c.email)
                          const phone = c.mobilePhone || c.officePhone || ''
                          if (phone) setBookPhone(phone)
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-muted)] ${
                          bookContactId === c._id ? 'bg-[color:var(--color-muted)]' : ''
                        }`}
                      >
                        <div className="font-medium">{c.name || c.email || '(no name)'}</div>
                        <div className="text-xs text-[color:var(--color-text-muted)]">{c.email || ''}</div>
                      </button>
                    ))}
                  </div>
                ) : null}
                {bookContactId ? (
                  <div className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">Selected contact ID: {bookContactId}</div>
                ) : null}
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Appointment type</label>
                <select
                  value={bookTypeId}
                  onChange={(e) => setBookTypeId(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                >
                  <option value="">{typesQ.isLoading ? 'Loading…' : 'Select…'}</option>
                  {types.filter((t) => t.active).map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Start date & time</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative" ref={datePickerRef}>
                    <button
                      type="button"
                      onClick={() => setShowDatePicker(!showDatePicker)}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-[color:var(--color-muted)]"
                    >
                      <Calendar className="h-4 w-4 text-[color:var(--color-text-muted)]" />
                      <span>{bookDate ? new Date(bookDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select date'}</span>
                    </button>
                    {showDatePicker && (
                      <div className="absolute z-50 mt-1 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] shadow-lg p-4 w-[280px]">
                        <div className="flex items-center justify-between mb-3">
                          <button
                            type="button"
                            onClick={() => {
                              const prev = new Date(datePickerMonth)
                              prev.setMonth(prev.getMonth() - 1)
                              setDatePickerMonth(prev)
                            }}
                            className="p-1 rounded hover:bg-[color:var(--color-muted)]"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <div className="font-semibold text-sm">
                            {datePickerMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const next = new Date(datePickerMonth)
                              next.setMonth(next.getMonth() + 1)
                              setDatePickerMonth(next)
                            }}
                            className="p-1 rounded hover:bg-[color:var(--color-muted)]"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-7 gap-1 mb-2">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                            <div key={day} className="text-center text-xs font-medium text-[color:var(--color-text-muted)] py-1">
                              {day}
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {(() => {
                            const year = datePickerMonth.getFullYear()
                            const month = datePickerMonth.getMonth()
                            const firstDay = new Date(year, month, 1)
                            const startDate = new Date(firstDay)
                            startDate.setDate(startDate.getDate() - firstDay.getDay())
                            const today = new Date()
                            today.setHours(0, 0, 0, 0)
                            const days: React.ReactElement[] = []
                            for (let i = 0; i < 42; i++) {
                              const date = new Date(startDate)
                              date.setDate(startDate.getDate() + i)
                              const isCurrentMonth = date.getMonth() === month
                              const isToday = date.getTime() === today.getTime()
                              const isPast = date < today
                              const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                              const isSelected = bookDate === dateStr
                              days.push(
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => {
                                    if (!isPast) {
                                      setBookDate(dateStr)
                                      if (bookTime) {
                                        const combined = `${dateStr}T${bookTime}`
                                        setBookStartsAtLocal(combined)
                                      }
                                      setShowDatePicker(false)
                                    }
                                  }}
                                  disabled={isPast}
                                  className={`h-8 rounded text-xs ${
                                    isPast
                                      ? 'text-[color:var(--color-text-muted)] opacity-40 cursor-not-allowed'
                                      : isSelected
                                        ? 'bg-[color:var(--color-primary-600)] text-white font-semibold'
                                        : isToday
                                          ? 'bg-[color:var(--color-primary-soft)] text-[color:var(--color-primary)] font-semibold'
                                          : isCurrentMonth
                                            ? 'hover:bg-[color:var(--color-muted)]'
                                            : 'text-[color:var(--color-text-muted)] opacity-50'
                                  }`}
                                >
                                  {date.getDate()}
                                </button>
                              )
                            }
                            return days
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <select
                      value={bookTime}
                      onChange={(e) => {
                        setBookTime(e.target.value)
                        if (bookDate && e.target.value) {
                          const combined = `${bookDate}T${e.target.value}`
                          setBookStartsAtLocal(combined)
                        }
                      }}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                    >
                      <option value="">Select time</option>
                      {(() => {
                        const times: string[] = []
                        // Generate time slots from 8:00 AM to 8:00 PM in 15-minute intervals
                        for (let hour = 8; hour <= 20; hour++) {
                          for (let minute = 0; minute < 60; minute += 15) {
                            const h = hour.toString().padStart(2, '0')
                            const m = minute.toString().padStart(2, '0')
                            const time24 = `${h}:${m}`
                            times.push(time24)
                          }
                        }
                        return times.map((time24) => {
                          const [h, m] = time24.split(':')
                          const hour = parseInt(h, 10)
                          const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
                          const ampm = hour >= 12 ? 'PM' : 'AM'
                          const time12 = `${hour12}:${m} ${ampm}`
                          return (
                            <option key={time24} value={time24}>
                              {time12}
                            </option>
                          )
                        })
                      })()}
                    </select>
                  </div>
                </div>
                {bookStartsAtLocal && (
                  <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                    Selected: {new Date(bookStartsAtLocal).toLocaleString('en-US', {
                      timeZone: tzDraft || userTimezone,
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZoneName: 'short',
                    })}
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Reminder (min)</label>
                <input
                  type="number"
                  value={bookReminderMinutes}
                  onChange={(e) => setBookReminderMinutes(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Scheduled by</label>
                <select
                  value={bookScheduledByUserId}
                  onChange={(e) => setBookScheduledByUserId(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                >
                  <option value="">
                    {usersQ.isError ? 'No permission (uses current user)' : usersQ.isLoading ? 'Loading…' : 'Select (optional)…'}
                  </option>
                  {(usersQ.data?.data.items ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ? `${u.name} — ${u.email || ''}` : u.email || u.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-6">
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">First name</label>
                <input
                  value={bookFirstName}
                  onChange={(e) => setBookFirstName(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Last name</label>
                <input
                  value={bookLastName}
                  onChange={(e) => setBookLastName(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Email</label>
                <input
                  value={bookEmail}
                  onChange={(e) => setBookEmail(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Phone</label>
                <input
                  value={bookPhone}
                  onChange={(e) => setBookPhone(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Preference</label>
                <select
                  value={bookPreference}
                  onChange={(e) => setBookPreference(e.target.value as any)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-6">
              <div className="md:col-span-5">
                <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Notes</label>
                <input
                  value={bookNotes}
                  onChange={(e) => setBookNotes(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                  placeholder="Optional notes (will be added to the CRM meeting task)"
                />
              </div>
              <div className="flex items-end justify-end">
                <button
                  type="button"
                  disabled={
                    createAppointment.isPending ||
                    !bookTypeId ||
                    !bookStartsAtLocal ||
                    !bookFirstName.trim() ||
                    !bookLastName.trim() ||
                    !bookEmail.trim()
                  }
                  onClick={() => createAppointment.mutate()}
                  className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                >
                  Book &amp; send invite
                </button>
              </div>
            </div>
          </div>

          <div className="divide-y divide-[color:var(--color-border)]">
            {appointments.map((a) => (
              <div key={a._id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{a.attendeeName}</span>
                    <span className="text-xs text-[color:var(--color-text-muted)]">{a.attendeeEmail}</span>
                    {a.attendeePhone ? <span className="text-xs text-[color:var(--color-text-muted)]">{a.attendeePhone}</span> : null}
                    <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                      {a.status}
                    </span>
                    <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                      {a.source}
                    </span>
                    {a.attendeeContactPreference ? (
                      <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                        pref: {a.attendeeContactPreference}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    {new Date(a.startsAt).toLocaleString('en-US', {
                      timeZone: a.timeZone || userTimezone,
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZoneName: 'short',
                    })} → {new Date(a.endsAt).toLocaleString('en-US', {
                      timeZone: a.timeZone || userTimezone,
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZoneName: 'short',
                    })}
                  </div>
                  {a.scheduledByEmail ? (
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      Scheduled by: {a.scheduledByName ? `${a.scheduledByName} — ` : ''}
                      {a.scheduledByEmail}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {a.status === 'booked' && (
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm('Cancel this appointment?', { confirmText: 'Cancel appointment', confirmColor: 'danger' })
                        if (!ok) return
                        cancelAppointment.mutate(a._id)
                      }}
                      disabled={cancelAppointment.isPending}
                      className="rounded-lg border border-red-400 px-3 py-2 text-xs text-red-500 hover:bg-red-950/40 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                  <Link
                    to={`/apps/crm/tasks`}
                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
                  >
                    View Tasks
                  </Link>
                </div>
              </div>
            ))}
            {!appointments.length && !appointmentsQ.isLoading && (
              <div className="px-4 py-8 text-center text-xs text-[color:var(--color-text-muted)]">
                No appointments yet. Share a booking link from “Appointment types”.
              </div>
            )}
          </div>
        </section>
      )}

      {ConfirmDialog}
    </div>
  )
}


