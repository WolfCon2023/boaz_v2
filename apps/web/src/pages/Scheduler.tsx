import * as React from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/ConfirmDialog'
import { KBHelpButton } from '@/components/KBHelpButton'
import { Modal } from '@/components/Modal'
import { Calendar, ChevronLeft, ChevronRight, Search, X, Edit, Trash2, Clock, User, Mail, Phone, CalendarDays, Grid3x3, List } from 'lucide-react'
import { generateBookingSlots } from '@/lib/schedulerSlots'

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
  schedulingMode?: 'single' | 'round_robin'
  teamUserIds?: string[]
  rrCursor?: number
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
  cancelReason?: string | null
  cancelledAt?: string | null
  cancelledByUserId?: string | null
  cancelEmailSentAt?: string | null
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
  const [tab, setTab] = React.useState<'types' | 'availability' | 'appointments' | 'calendar'>('types')
  const [calendarMonth, setCalendarMonth] = React.useState(new Date())
  const [calendarView, setCalendarView] = React.useState<'month' | 'week' | 'day'>('month')
  const [selectedAppointment, setSelectedAppointment] = React.useState<Appointment | null>(null)
  const [appointmentSearch, setAppointmentSearch] = React.useState('')
  const [cancelModalId, setCancelModalId] = React.useState<string | null>(null)
  const [cancelReasonDraft, setCancelReasonDraft] = React.useState('')
  const [cancelNotifyDraft, setCancelNotifyDraft] = React.useState(true)
  const helpSlug =
    tab === 'types'
      ? 'scheduler-appointment-types'
      : tab === 'availability'
        ? 'scheduler-availability'
        : tab === 'appointments'
          ? 'scheduler-appointments'
          : 'scheduler-calendar'

  const typesQ = useQuery<{ data: { items: AppointmentType[] } }>({
    queryKey: ['scheduler', 'types'],
    queryFn: async () => (await http.get('/api/scheduler/appointment-types')).data,
  })

  const types = typesQ.data?.data.items ?? []

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

  const [editingTypeId, setEditingTypeId] = React.useState<string | null>(null)
  const [editName, setEditName] = React.useState('')
  const [editSlug, setEditSlug] = React.useState('')
  const [editDurationMinutes, setEditDurationMinutes] = React.useState(15)
  const [editLocationType, setEditLocationType] = React.useState<'video' | 'phone' | 'in_person' | 'custom'>('video')
  const [editLocationDetails, setEditLocationDetails] = React.useState('')
  const [editBufferBeforeMinutes, setEditBufferBeforeMinutes] = React.useState(0)
  const [editBufferAfterMinutes, setEditBufferAfterMinutes] = React.useState(0)
  const [editActive, setEditActive] = React.useState(true)
  const [editSchedulingMode, setEditSchedulingMode] = React.useState<'single' | 'round_robin'>('single')
  const [editTeamUserIds, setEditTeamUserIds] = React.useState<string[]>([])

  const editingType = React.useMemo(() => types.find((t) => t._id === editingTypeId) || null, [types, editingTypeId])

  React.useEffect(() => {
    if (!editingType) return
    setEditName(editingType.name || '')
    setEditSlug(editingType.slug || '')
    setEditDurationMinutes(Number(editingType.durationMinutes || 15))
    setEditLocationType((editingType.locationType as any) || 'video')
    setEditLocationDetails(editingType.locationDetails || '')
    setEditBufferBeforeMinutes(Number(editingType.bufferBeforeMinutes || 0))
    setEditBufferAfterMinutes(Number(editingType.bufferAfterMinutes || 0))
    setEditActive(!!editingType.active)
    setEditSchedulingMode((editingType.schedulingMode as any) || 'single')
    setEditTeamUserIds(Array.isArray(editingType.teamUserIds) ? editingType.teamUserIds : [])
  }, [editingType])

  const updateType = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<AppointmentType> }) =>
      (await http.put(`/api/scheduler/appointment-types/${encodeURIComponent(args.id)}`, args.patch)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['scheduler', 'types'] })
      toast.showToast('Appointment type updated.', 'success')
      setEditingTypeId(null)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to update appointment type.'
      toast.showToast(msg, 'error')
    },
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
    mutationFn: async (args: { id: string; reason?: string | null; notifyAttendee?: boolean }) =>
      (await http.post(`/api/scheduler/appointments/${encodeURIComponent(args.id)}/cancel`, { reason: args.reason ?? null, notifyAttendee: !!args.notifyAttendee })).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['scheduler', 'appointments'] })
      toast.showToast('Appointment cancelled.', 'success')
    },
    onError: () => toast.showToast('Failed to cancel appointment.', 'error'),
  })

  const availability = availabilityQ.data?.data
  const allAppointments = appointmentsQ.data?.data.items ?? []
  
  // Filter appointments by search
  const appointments = React.useMemo(() => {
    if (!appointmentSearch.trim()) return allAppointments
    const search = appointmentSearch.toLowerCase()
    return allAppointments.filter(
      (apt) =>
        apt.attendeeName.toLowerCase().includes(search) ||
        apt.attendeeEmail.toLowerCase().includes(search) ||
        apt.appointmentTypeName?.toLowerCase().includes(search) ||
        apt.attendeePhone?.toLowerCase().includes(search)
    )
  }, [allAppointments, appointmentSearch])

  // Generate color for appointment type
  const getAppointmentTypeColor = React.useCallback((typeId: string) => {
    const typeIndex = types.findIndex((t) => t._id === typeId)
    const colors = [
      'bg-blue-600',
      'bg-purple-600',
      'bg-green-600',
      'bg-orange-600',
      'bg-pink-600',
      'bg-indigo-600',
      'bg-teal-600',
      'bg-red-600',
    ]
    return colors[typeIndex % colors.length] || 'bg-[color:var(--color-primary-600)]'
  }, [types])

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

  const m365StatusQ = useQuery({
    queryKey: ['calendar', 'm365', 'status'],
    queryFn: async () => (await http.get('/api/calendar/m365/status')).data as { data: { configured: boolean; connected: boolean; email?: string | null } },
    retry: false,
  })

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

  const effectiveWeekly = weeklyDraft.length ? weeklyDraft : availability?.weekly || []

  function setWeeklyPreset(preset: 'weekdays_9_5' | 'weekdays_8_8' | 'all_9_5' | 'clear') {
    const mk = (enabled: boolean, startMin: number, endMin: number) => ({ enabled, startMin, endMin })
    const next = [0, 1, 2, 3, 4, 5, 6].map((day) => {
      if (preset === 'clear') return { day, ...mk(false, 9 * 60, 17 * 60) }
      if (preset === 'all_9_5') return { day, ...mk(true, 9 * 60, 17 * 60) }
      if (preset === 'weekdays_8_8') return { day, ...mk(day >= 1 && day <= 5, 8 * 60, 20 * 60) }
      return { day, ...mk(day >= 1 && day <= 5, 9 * 60, 17 * 60) }
    })
    setWeeklyDraft(next)
  }

  function copyDayTo(target: 'weekdays' | 'all') {
    const src = effectiveWeekly.find((d) => d.day === 1) // Monday
    if (!src) return
    const next = [...effectiveWeekly]
    for (let i = 0; i < next.length; i++) {
      const day = next[i]!.day
      const ok = target === 'all' ? true : day >= 1 && day <= 5
      if (!ok) continue
      next[i] = { ...next[i]!, enabled: src.enabled, startMin: src.startMin, endMin: src.endMin }
    }
    setWeeklyDraft(next)
  }

  function copyLink(slugValue: string) {
    const url = `${window.location.origin}/schedule/${encodeURIComponent(slugValue)}`
    navigator.clipboard
      .writeText(url)
      .then(() => toast.showToast('Booking link copied.', 'success'))
      .catch(() => toast.showToast('Failed to copy link.', 'error'))
  }

  // Internal appointment form (staff scheduling)
  const [useSlotPicker, setUseSlotPicker] = React.useState(true)
  const [bookTypeId, setBookTypeId] = React.useState('')
  const [bookStartsAtLocal, setBookStartsAtLocal] = React.useState('')
  const [slotPickerOpen, setSlotPickerOpen] = React.useState(true)
  const [bookDate, setBookDate] = React.useState('')
  const [bookTime, setBookTime] = React.useState('')
  const [showDatePicker, setShowDatePicker] = React.useState(false)
  const [datePickerMonth, setDatePickerMonth] = React.useState(new Date())
  const datePickerRef = React.useRef<HTMLDivElement>(null)
  const bookTypeSelectRef = React.useRef<HTMLSelectElement>(null)

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

  // Slot picker UX: don't auto-open on clear; open is user-driven.

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

  const selectedType = React.useMemo(() => types.find((t) => t._id === bookTypeId) || null, [types, bookTypeId])

  const bookingLinkQ = useQuery<{
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
  }>({
    queryKey: ['scheduler', 'booking-link', selectedType?.slug || ''],
    queryFn: async () =>
      (await http.get(`/api/scheduler/public/booking-links/${encodeURIComponent(selectedType!.slug)}`, { params: { windowDays: 21 } })).data,
    enabled: useSlotPicker && !!selectedType?.slug,
    retry: false,
  })

  const slotOptions = React.useMemo(() => {
    const data = bookingLinkQ.data?.data
    if (!data) return []
    if (Array.isArray(data.slots) && data.slots.length) return data.slots
    return generateBookingSlots({
      timeZone: data.availability.timeZone || tzDraft || userTimezone || 'UTC',
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
  }, [bookingLinkQ.data?.data, tzDraft, userTimezone])

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
      setSlotPickerOpen(false)
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
      <Modal
        open={!!(editingTypeId && editingType)}
        onClose={() => setEditingTypeId(null)}
        title="Edit appointment type"
        subtitle="Changes apply immediately to the public booking page."
        width="56rem"
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Slug</label>
              <input
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Duration (min)</label>
              <input
                type="number"
                value={editDurationMinutes}
                onChange={(e) => setEditDurationMinutes(Number(e.target.value) || 15)}
                className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Active</label>
              <select
                value={editActive ? '1' : '0'}
                onChange={(e) => setEditActive(e.target.value === '1')}
                className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
              >
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Location</label>
              <select
                value={editLocationType}
                onChange={(e) => setEditLocationType(e.target.value as any)}
                className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
              >
                <option value="video">Video</option>
                <option value="phone">Phone</option>
                <option value="in_person">In person</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Location details (optional)</label>
              <input
                value={editLocationDetails}
                onChange={(e) => setEditLocationDetails(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
                placeholder="Zoom link, address, instructions…"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Buffer before (min)</label>
              <input
                type="number"
                value={editBufferBeforeMinutes}
                onChange={(e) => setEditBufferBeforeMinutes(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Buffer after (min)</label>
              <input
                type="number"
                value={editBufferAfterMinutes}
                onChange={(e) => setEditBufferAfterMinutes(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-transparent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Scheduling mode</label>
              <select
                value={editSchedulingMode}
                onChange={(e) => setEditSchedulingMode(e.target.value as any)}
                className="w-full rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm bg-[color:var(--color-panel)]"
              >
                <option value="single">Single host</option>
                <option value="round_robin">Round robin (team)</option>
              </select>
            </div>
          </div>

          {editSchedulingMode === 'round_robin' ? (
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4">
              <div className="text-xs text-[color:var(--color-text-muted)]">
                Add team members who can host this appointment type. You (the owner) are always included.
              </div>
              <div className="mt-3">
                {usersQ.isError ? (
                  <div className="text-xs text-[color:var(--color-text-muted)]">Team selection requires `users.read` permission.</div>
                ) : usersQ.isLoading ? (
                  <div className="text-xs text-[color:var(--color-text-muted)]">Loading users…</div>
                ) : (
                  <div className="max-h-48 overflow-auto space-y-2">
                    {(usersQ.data?.data.items ?? []).map((u) => {
                      const checked = editTeamUserIds.includes(u.id)
                      const label = u.name ? `${u.name} — ${u.email || ''}` : u.email || u.id
                      return (
                        <label key={u.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = new Set(editTeamUserIds)
                              if (e.target.checked) next.add(u.id)
                              else next.delete(u.id)
                              setEditTeamUserIds(Array.from(next))
                            }}
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[color:var(--color-border)]">
            <button
              type="button"
              onClick={() => setEditingTypeId(null)}
              className="px-4 py-2 text-sm rounded-lg border border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={updateType.isPending || !editName.trim() || !editSlug.trim()}
              onClick={() =>
                updateType.mutate({
                  id: editingTypeId!,
                  patch: {
                    name: editName.trim(),
                    slug: editSlug.trim(),
                    durationMinutes: editDurationMinutes,
                    locationType: editLocationType,
                    locationDetails: editLocationDetails.trim() || null,
                    bufferBeforeMinutes: editBufferBeforeMinutes,
                    bufferAfterMinutes: editBufferAfterMinutes,
                    active: editActive,
                    schedulingMode: editSchedulingMode,
                    teamUserIds: editSchedulingMode === 'round_robin' ? editTeamUserIds : [],
                  },
                })
              }
              className="px-4 py-2 text-sm rounded-lg border bg-[color:var(--color-primary-600)] text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
            >
              Save changes
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!cancelModalId}
        onClose={() => setCancelModalId(null)}
        title="Cancel appointment"
        subtitle="Optionally include a reason and email the attendee."
        width="36rem"
        showFullscreenToggle={false}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-muted)]">Reason (optional)</label>
            <textarea
              value={cancelReasonDraft}
              onChange={(e) => setCancelReasonDraft(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
              placeholder="e.g., Client requested reschedule"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cancelNotifyDraft} onChange={(e) => setCancelNotifyDraft(e.target.checked)} />
            Email attendee a cancellation notice
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCancelModalId(null)}
              className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
            >
              Keep appointment
            </button>
            <button
              type="button"
              disabled={cancelAppointment.isPending}
              onClick={() => {
                cancelAppointment.mutate(
                  { id: cancelModalId!, reason: cancelReasonDraft.trim() || null, notifyAttendee: cancelNotifyDraft },
                  {
                    onSuccess: () => {
                      setCancelModalId(null)
                      setCancelReasonDraft('')
                      setCancelNotifyDraft(true)
                      setSelectedAppointment((cur) => (cur && cur._id === cancelModalId ? null : cur))
                    },
                  },
                )
              }}
              className="rounded-lg border border-red-400 px-4 py-2 text-sm text-red-500 hover:bg-red-950/40 disabled:opacity-50"
            >
              Cancel appointment
            </button>
          </div>
        </div>
      </Modal>

      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Scheduler</h1>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            Appointment types, availability, booking links — with CRM feedback (meetings show up as Tasks).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <KBHelpButton href={`/apps/crm/support/kb/${helpSlug}`} ariaLabel="Open Scheduler help" title="Knowledge Base" />
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
        <button
          type="button"
          onClick={() => setTab('calendar')}
          className={`rounded-lg px-3 py-2 ${tab === 'calendar' ? 'bg-[color:var(--color-muted)] font-semibold' : ''}`}
        >
          Calendar
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
                      {t.schedulingMode === 'round_robin' && (
                        <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                          round robin{Array.isArray(t.teamUserIds) && t.teamUserIds.length ? ` (+${t.teamUserIds.length})` : ''}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      /schedule/{t.slug} • {t.durationMinutes} min • {t.locationType || 'video'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingTypeId(t._id)}
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
                      title="Edit"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Edit className="h-3.5 w-3.5" /> Edit
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateType.mutate({ id: t._id, patch: { active: !t.active } })}
                      disabled={updateType.isPending}
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                      title={t.active ? 'Disable booking page' : 'Enable booking page'}
                    >
                      {t.active ? 'Disable' : 'Enable'}
                    </button>
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
                        const ok = await confirm('Delete this appointment type? This is permanent. Prefer Disable if you want to keep history.', {
                          confirmText: 'Delete',
                          confirmColor: 'danger',
                        })
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
                  if (effectiveWeekly.length !== 7) {
                    toast.showToast('Availability must include 7 days.', 'error')
                    return
                  }
                  const bad = effectiveWeekly.find((d) => d.enabled && d.startMin >= d.endMin)
                  if (bad) {
                    toast.showToast(`Invalid hours on ${DAYS[bad.day] || 'a day'} (start must be before end).`, 'error')
                    return
                  }
                  saveAvailability.mutate({ timeZone: tzDraft.trim() || 'UTC', weekly: effectiveWeekly })
                }}
                disabled={saveAvailability.isPending}
                className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
              >
                Save availability
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setWeeklyPreset('weekdays_9_5')}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
            >
              Weekdays 9–5
            </button>
            <button
              type="button"
              onClick={() => setWeeklyPreset('weekdays_8_8')}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
            >
              Weekdays 8–8
            </button>
            <button
              type="button"
              onClick={() => setWeeklyPreset('all_9_5')}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
            >
              All days 9–5
            </button>
            <button
              type="button"
              onClick={() => copyDayTo('weekdays')}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
              title="Copies Monday settings to Mon–Fri"
            >
              Copy Mon → Weekdays
            </button>
            <button
              type="button"
              onClick={() => copyDayTo('all')}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
              title="Copies Monday settings to all days"
            >
              Copy Mon → All
            </button>
            <button
              type="button"
              onClick={() => setWeeklyPreset('clear')}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
            >
              Clear all
            </button>
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
                {effectiveWeekly.map((d, idx) => (
                  <tr key={d.day} className="align-middle">
                    <td className="py-2 pr-3 font-medium">{DAYS[d.day] || `Day ${d.day}`}</td>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={d.enabled}
                        onChange={(e) => {
                          const next = [...effectiveWeekly]
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
                          const next = [...effectiveWeekly]
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
                          const next = [...effectiveWeekly]
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
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--color-text-muted)]" />
                <input
                  type="text"
                  value={appointmentSearch}
                  onChange={(e) => setAppointmentSearch(e.target.value)}
                  placeholder="Search appointments..."
                  className="pl-8 pr-8 py-1.5 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] text-sm w-64"
                />
                {appointmentSearch && (
                  <button
                    type="button"
                    onClick={() => setAppointmentSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[color:var(--color-muted)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="text-xs text-[color:var(--color-text-muted)]">
                {appointmentsQ.isFetching ? 'Refreshing…' : `${appointments.length} ${appointmentSearch ? 'found' : 'upcoming/recent'}`}
              </div>
            </div>
          </div>

          <div className="border-b border-[color:var(--color-border)] px-4 py-3">
            <div className="text-sm font-semibold">Create appointment (internal)</div>
            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              Book on behalf of a client. Use the slot picker to select valid times from availability (recommended); manual date/time remains as a fallback.
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
                  ref={bookTypeSelectRef}
                  value={bookTypeId}
                  onChange={(e) => {
                    setBookTypeId(e.target.value)
                    setBookStartsAtLocal('')
                    setSlotPickerOpen(true)
                    setBookDate('')
                    setBookTime('')
                  }}
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
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-[color:var(--color-text-muted)]">Start time</label>
                  <label className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                    <input
                      type="checkbox"
                      checked={useSlotPicker}
                      onChange={(e) => {
                        setUseSlotPicker(e.target.checked)
                        setBookStartsAtLocal('')
                        setBookDate('')
                        setBookTime('')
                      }}
                    />
                    Pick from availability
                  </label>
                </div>

                {useSlotPicker ? (
                  <div className="mt-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-2">
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedType) {
                            toast.showToast('Select an appointment type first.', 'info')
                            bookTypeSelectRef.current?.focus()
                            return
                          }
                          if (bookingLinkQ.isError) {
                            bookingLinkQ.refetch()
                            setSlotPickerOpen(true)
                            return
                          }
                          // Allow opening even while loading; we'll show "Loading availability…" in the label.
                          setSlotPickerOpen((v) => !v)
                        }}
                        className={`w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-3 py-2 text-left text-sm flex items-center justify-between gap-2 hover:bg-[color:var(--color-muted)] ${
                          !selectedType ? 'opacity-80' : ''
                        } cursor-pointer`}
                        title={!selectedType ? 'Select an appointment type first' : undefined}
                      >
                        <span className={!selectedType ? 'text-[color:var(--color-text-muted)]' : bookStartsAtLocal ? 'font-semibold' : 'text-[color:var(--color-text-muted)]'}>
                          {!selectedType
                            ? 'Select an appointment type to see available slots.'
                            : bookingLinkQ.isLoading || bookingLinkQ.isFetching
                              ? 'Loading availability…'
                              : bookingLinkQ.isError
                                ? 'Unable to load availability (click to retry).'
                                : bookStartsAtLocal
                                  ? slotOptions.find((s) => s.iso === bookStartsAtLocal)?.label || 'Selected time'
                                  : 'Select a time…'}
                        </span>
                        {selectedType && !bookingLinkQ.isLoading && !bookingLinkQ.isFetching && !bookingLinkQ.isError ? (
                          <span className="text-xs text-[color:var(--color-text-muted)]">{slotPickerOpen ? 'Hide' : 'Show'}</span>
                        ) : null}
                      </button>

                      {bookStartsAtLocal ? (
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setBookStartsAtLocal('')
                              setSlotPickerOpen(true)
                            }}
                            className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                          >
                            Clear
                          </button>
                        </div>
                      ) : null}

                      {selectedType && !bookingLinkQ.isLoading && !bookingLinkQ.isError && slotPickerOpen ? (
                        slotOptions.length ? (
                          <div className="grid grid-cols-1 gap-1">
                            {slotOptions.map((s) => (
                              <button
                                key={s.iso}
                                type="button"
                                onClick={() => {
                                  setBookStartsAtLocal(s.iso)
                                  setSlotPickerOpen(false)
                                }}
                                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[color:var(--color-muted)]"
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="px-2 py-2 text-xs text-[color:var(--color-text-muted)]">No available slots in the next few weeks.</div>
                        )
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2">
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
                )}

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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedAppointment(a)}
                      className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)] flex items-center gap-1"
                    >
                      <Edit className="h-3 w-3" />
                      View Details
                    </button>
                    {a.status === 'booked' && (
                      <button
                        type="button"
                        onClick={async () => {
                          setCancelModalId(a._id)
                          setCancelReasonDraft('')
                          setCancelNotifyDraft(true)
                        }}
                        disabled={cancelAppointment.isPending}
                        className="rounded-lg border border-red-400 px-3 py-2 text-xs text-red-500 hover:bg-red-950/40 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        Cancel
                      </button>
                    )}
                  </div>
                  <Link
                    to={`/apps/crm/tasks`}
                    className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
                  >
                    View Tasks
                  </Link>
                </div>
              </div>
            ))}
            {appointmentsQ.isLoading && (
              <div className="px-4 py-8 text-center text-xs text-[color:var(--color-text-muted)]">
                Loading appointments...
              </div>
            )}
            {!appointments.length && !appointmentsQ.isLoading && (
              <div className="px-4 py-8 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-3 text-[color:var(--color-text-muted)] opacity-50" />
                <div className="text-sm font-semibold mb-1">No appointments found</div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {appointmentSearch ? 'Try a different search term.' : 'Share a booking link from "Appointment types" or create an appointment manually.'}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'calendar' && calendarView === 'month' && (
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="mb-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
            {m365StatusQ.data?.data?.configured && m365StatusQ.data?.data?.connected ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  External calendar conflict checks: <span className="font-semibold text-green-400">Enabled</span>
                  {m365StatusQ.data.data.email ? ` (${m365StatusQ.data.data.email})` : ''}
                </div>
                <Link
                  to="/apps/calendar"
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                >
                  Manage in Calendar
                </Link>
              </div>
            ) : m365StatusQ.data?.data?.configured ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  External calendar conflict checks: <span className="font-semibold text-[color:var(--color-text-muted)]">Disabled</span>
                </div>
                <Link
                  to="/apps/calendar"
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
                >
                  Connect calendar
                </Link>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold">Calendar View</div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-1">
                <button
                  type="button"
                  onClick={() => setCalendarView('month')}
                  className="px-3 py-1 text-xs rounded bg-[color:var(--color-muted)] font-semibold"
                >
                  <CalendarDays className="h-3 w-3 inline mr-1" />
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarView('week')}
                  className="px-3 py-1 text-xs rounded hover:bg-[color:var(--color-muted)]"
                >
                  <Grid3x3 className="h-3 w-3 inline mr-1" />
                  Week
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarView('day')}
                  className="px-3 py-1 text-xs rounded hover:bg-[color:var(--color-muted)]"
                >
                  <List className="h-3 w-3 inline mr-1" />
                  Day
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const prev = new Date(calendarMonth)
                    prev.setMonth(prev.getMonth() - 1)
                    setCalendarMonth(prev)
                  }}
                  className="p-1 rounded hover:bg-[color:var(--color-muted)]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="font-semibold text-sm min-w-[200px] text-center">
                  {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Date(calendarMonth)
                    next.setMonth(next.getMonth() + 1)
                    setCalendarMonth(next)
                  }}
                  className="p-1 rounded hover:bg-[color:var(--color-muted)]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date())}
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                >
                  Today
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px border border-[color:var(--color-border)] bg-[color:var(--color-border)]">
            {/* Day headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="bg-[color:var(--color-panel)] p-2 text-center text-xs font-semibold text-[color:var(--color-text-muted)]">
                {day}
              </div>
            ))}

            {/* Calendar days */}
            {(() => {
              const year = calendarMonth.getFullYear()
              const month = calendarMonth.getMonth()
              const firstDay = new Date(year, month, 1)
              const startDate = new Date(firstDay)
              startDate.setDate(startDate.getDate() - firstDay.getDay())
              const today = new Date()
              today.setHours(0, 0, 0, 0)
              const days: React.ReactElement[] = []

              // Group appointments by date
              const appointmentsByDate = new Map<string, Appointment[]>()
              for (const apt of appointments) {
                if (apt.status === 'cancelled') continue
                const aptDate = new Date(apt.startsAt)
                const dateKey = `${aptDate.getFullYear()}-${String(aptDate.getMonth() + 1).padStart(2, '0')}-${String(aptDate.getDate()).padStart(2, '0')}`
                if (!appointmentsByDate.has(dateKey)) {
                  appointmentsByDate.set(dateKey, [])
                }
                appointmentsByDate.get(dateKey)!.push(apt)
              }

              for (let i = 0; i < 42; i++) {
                const date = new Date(startDate)
                date.setDate(startDate.getDate() + i)
                const isCurrentMonth = date.getMonth() === month
                const isToday = date.getTime() === today.getTime()
                const isPast = date < today
                const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                const dayAppointments = appointmentsByDate.get(dateKey) || []

                days.push(
                  <div
                    key={i}
                    onClick={() => {
                      if (isCurrentMonth && !isPast) {
                        setTab('appointments')
                        // Pre-fill the create appointment form with this date
                        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                        setBookDate(dateStr)
                      }
                    }}
                    className={`min-h-[100px] bg-[color:var(--color-panel)] p-1 ${
                      !isCurrentMonth ? 'opacity-40' : ''
                    } ${isToday ? 'ring-2 ring-[color:var(--color-primary-600)]' : ''} ${
                      isCurrentMonth && !isPast ? 'cursor-pointer hover:bg-[color:var(--color-muted)] transition-colors' : ''
                    }`}
                  >
                    <div
                      className={`text-xs font-semibold mb-1 ${
                        isToday ? 'text-[color:var(--color-primary-600)]' : 'text-[color:var(--color-text-muted)]'
                      }`}
                    >
                      {date.getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayAppointments.slice(0, 3).map((apt) => {
                        const startTime = new Date(apt.startsAt)
                        const timeStr = startTime.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: apt.timeZone || userTimezone,
                        })
                        return (
                          <div
                            key={apt._id}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedAppointment(apt)
                            }}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${getAppointmentTypeColor(apt.appointmentTypeId)} text-white truncate cursor-pointer hover:opacity-80 transition-opacity shadow-sm`}
                            title={`${apt.appointmentTypeName || 'Appointment'}: ${apt.attendeeName} at ${timeStr}`}
                          >
                            <div className="font-semibold truncate">{timeStr}</div>
                            <div className="truncate">{apt.attendeeName}</div>
                          </div>
                        )
                      })}
                      {dayAppointments.length > 3 && (
                        <div className="text-[10px] text-[color:var(--color-text-muted)] px-1.5">
                          +{dayAppointments.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
              return days
            })()}
          </div>
        </section>
      )}

      {/* Week View */}
      {tab === 'calendar' && calendarView === 'week' && (
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold">Week View</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const prev = new Date(calendarMonth)
                  prev.setDate(prev.getDate() - 7)
                  setCalendarMonth(prev)
                }}
                className="p-1 rounded hover:bg-[color:var(--color-muted)]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="font-semibold text-sm min-w-[200px] text-center">
                {(() => {
                  const startOfWeek = new Date(calendarMonth)
                  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
                  const endOfWeek = new Date(startOfWeek)
                  endOfWeek.setDate(endOfWeek.getDate() + 6)
                  return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                })()}
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = new Date(calendarMonth)
                  next.setDate(next.getDate() + 7)
                  setCalendarMonth(next)
                }}
                className="p-1 rounded hover:bg-[color:var(--color-muted)]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date())}
                className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 text-xs hover:bg-[color:var(--color-muted)]"
              >
                Today
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px border border-[color:var(--color-border)] bg-[color:var(--color-border)]">
            {(() => {
              const startOfWeek = new Date(calendarMonth)
              startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
              startOfWeek.setHours(0, 0, 0, 0)
              const today = new Date()
              today.setHours(0, 0, 0, 0)
              const appointmentsByDate = new Map<string, Appointment[]>()
              
              for (const apt of appointments) {
                if (apt.status === 'cancelled') continue
                const aptDate = new Date(apt.startsAt)
                const dateKey = `${aptDate.getFullYear()}-${String(aptDate.getMonth() + 1).padStart(2, '0')}-${String(aptDate.getDate()).padStart(2, '0')}`
                if (!appointmentsByDate.has(dateKey)) {
                  appointmentsByDate.set(dateKey, [])
                }
                appointmentsByDate.get(dateKey)!.push(apt)
              }

              return Array.from({ length: 7 }).map((_, dayIndex) => {
                const date = new Date(startOfWeek)
                date.setDate(startOfWeek.getDate() + dayIndex)
                const isToday = date.getTime() === today.getTime()
                const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                const dayAppointments = appointmentsByDate.get(dateKey) || []
                dayAppointments.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

                return (
                  <div key={dayIndex} className={`bg-[color:var(--color-panel)] min-h-[400px] ${isToday ? 'ring-2 ring-[color:var(--color-primary-600)]' : ''}`}>
                    <div className={`p-2 border-b border-[color:var(--color-border)] ${isToday ? 'bg-[color:var(--color-primary-soft)]' : ''}`}>
                      <div className="text-xs font-semibold text-[color:var(--color-text-muted)]">
                        {DAYS[dayIndex]}
                      </div>
                      <div className={`text-lg font-semibold ${isToday ? 'text-[color:var(--color-primary-600)]' : ''}`}>
                        {date.getDate()}
                      </div>
                    </div>
                    <div className="p-2 space-y-1">
                      {dayAppointments.map((apt) => {
                        const startTime = new Date(apt.startsAt)
                        const endTime = new Date(apt.endsAt)
                        const timeStr = startTime.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: apt.timeZone || userTimezone,
                        })
                        const endTimeStr = endTime.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: apt.timeZone || userTimezone,
                        })
                        return (
                          <div
                            key={apt._id}
                            onClick={() => setSelectedAppointment(apt)}
                            className={`text-xs px-2 py-1.5 rounded ${getAppointmentTypeColor(apt.appointmentTypeId)} text-white cursor-pointer hover:opacity-80 transition-opacity`}
                          >
                            <div className="font-semibold">{timeStr} - {endTimeStr}</div>
                            <div className="text-[10px] opacity-90">{apt.attendeeName}</div>
                            <div className="text-[10px] opacity-75">{apt.appointmentTypeName || 'Appointment'}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </section>
      )}

      {/* Day View */}
      {tab === 'calendar' && calendarView === 'day' && (
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold">Day View</div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-1">
                <button
                  type="button"
                  onClick={() => setCalendarView('month')}
                  className="px-3 py-1 text-xs rounded hover:bg-[color:var(--color-muted)]"
                >
                  <CalendarDays className="h-3 w-3 inline mr-1" />
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarView('week')}
                  className="px-3 py-1 text-xs rounded hover:bg-[color:var(--color-muted)]"
                >
                  <Grid3x3 className="h-3 w-3 inline mr-1" />
                  Week
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarView('day')}
                  className="px-3 py-1 text-xs rounded bg-[color:var(--color-muted)] font-semibold"
                >
                  <List className="h-3 w-3 inline mr-1" />
                  Day
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const prev = new Date(calendarMonth)
                    prev.setDate(prev.getDate() - 1)
                    setCalendarMonth(prev)
                  }}
                  className="p-1 rounded hover:bg-[color:var(--color-muted)]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="font-semibold text-sm min-w-[200px] text-center">
                  {calendarMonth.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Date(calendarMonth)
                    next.setDate(next.getDate() + 1)
                    setCalendarMonth(next)
                  }}
                  className="p-1 rounded hover:bg-[color:var(--color-muted)]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarMonth(new Date())}
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                >
                  Today
                </button>
              </div>
            </div>
          </div>

          <div className="border border-[color:var(--color-border)] rounded-lg overflow-hidden">
            <div className="grid grid-cols-[80px_1fr]">
              {/* Hour labels */}
              <div className="border-r border-[color:var(--color-border)]">
                {Array.from({ length: 24 }).map((_, hour) => (
                  <div key={hour} className="h-16 bg-[color:var(--color-panel)] p-2 text-xs text-[color:var(--color-text-muted)] border-b border-[color:var(--color-border)]">
                    {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                  </div>
                ))}
              </div>
              {/* Appointments column */}
              <div className="bg-[color:var(--color-panel)] min-h-[600px] relative">
              {(() => {
                const dateKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(calendarMonth.getDate()).padStart(2, '0')}`
                const dayAppointments = appointments.filter((apt) => {
                  if (apt.status === 'cancelled') return false
                  const aptDate = new Date(apt.startsAt)
                  const aptDateKey = `${aptDate.getFullYear()}-${String(aptDate.getMonth() + 1).padStart(2, '0')}-${String(aptDate.getDate()).padStart(2, '0')}`
                  return aptDateKey === dateKey
                }).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

                return (
                  <div className="p-4 space-y-3">
                    {dayAppointments.length > 0 ? (
                      dayAppointments.map((apt) => {
                        const startTime = new Date(apt.startsAt)
                        const endTime = new Date(apt.endsAt)
                        return (
                          <div
                            key={apt._id}
                            onClick={() => setSelectedAppointment(apt)}
                            className={`rounded-lg p-3 ${getAppointmentTypeColor(apt.appointmentTypeId)} text-white cursor-pointer hover:opacity-90 hover:scale-[1.02] transition-all shadow-md`}
                          >
                            <div className="font-semibold text-sm">
                              {startTime.toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                timeZone: apt.timeZone || userTimezone,
                              })} - {endTime.toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                timeZone: apt.timeZone || userTimezone,
                              })}
                            </div>
                            <div className="text-sm font-medium mt-1">{apt.attendeeName}</div>
                            <div className="text-xs opacity-90 mt-1">{apt.appointmentTypeName || 'Appointment'}</div>
                            {apt.attendeeEmail && (
                              <div className="text-xs opacity-75 mt-1 flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {apt.attendeeEmail}
                              </div>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <div className="text-center text-sm text-[color:var(--color-text-muted)] py-8">
                        No appointments scheduled for this day
                      </div>
                    )}
                  </div>
                )
              })()}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Appointment Details Modal */}
      <Modal
        open={!!selectedAppointment}
        onClose={() => setSelectedAppointment(null)}
        title="Appointment Details"
        subtitle={selectedAppointment?.appointmentTypeName || 'Appointment'}
        width="56rem"
      >
        {selectedAppointment && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-1">Attendee</div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-[color:var(--color-text-muted)]" />
                  <span className="text-sm font-semibold">{selectedAppointment.attendeeName}</span>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-1">Status</div>
                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                  selectedAppointment.status === 'booked' 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {selectedAppointment.status}
                </span>
              </div>
              <div>
                <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-1">Email</div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[color:var(--color-text-muted)]" />
                  <span className="text-sm">{selectedAppointment.attendeeEmail}</span>
                </div>
              </div>
              {selectedAppointment.attendeePhone && (
                <div>
                  <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-1">Phone</div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-[color:var(--color-text-muted)]" />
                    <span className="text-sm">{selectedAppointment.attendeePhone}</span>
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-1">Start Time</div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[color:var(--color-text-muted)]" />
                  <span className="text-sm">
                    {new Date(selectedAppointment.startsAt).toLocaleString('en-US', {
                      timeZone: selectedAppointment.timeZone || userTimezone,
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZoneName: 'short',
                    })}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-1">End Time</div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[color:var(--color-text-muted)]" />
                  <span className="text-sm">
                    {new Date(selectedAppointment.endsAt).toLocaleString('en-US', {
                      timeZone: selectedAppointment.timeZone || userTimezone,
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZoneName: 'short',
                    })}
                  </span>
                </div>
              </div>
              {selectedAppointment.scheduledByEmail && (
                <div>
                  <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-1">Scheduled By</div>
                  <span className="text-sm">{selectedAppointment.scheduledByName || selectedAppointment.scheduledByEmail}</span>
                </div>
              )}
              <div>
                <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-1">Source</div>
                <span className="text-sm capitalize">{selectedAppointment.source}</span>
              </div>
            </div>
            {selectedAppointment.attendeeContactPreference && (
              <div>
                <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-1">Contact Preference</div>
                <span className="text-sm capitalize">{selectedAppointment.attendeeContactPreference}</span>
              </div>
            )}
            {selectedAppointment.status === 'cancelled' && selectedAppointment.cancelReason ? (
              <div>
                <div className="text-xs font-medium text-[color:var(--color-text-muted)] mb-1">Cancellation reason</div>
                <div className="text-sm">{selectedAppointment.cancelReason}</div>
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[color:var(--color-border)]">
              {selectedAppointment.status === 'booked' && (
                <button
                  type="button"
                  onClick={async () => {
                    setCancelModalId(selectedAppointment._id)
                    setCancelReasonDraft('')
                    setCancelNotifyDraft(true)
                  }}
                  disabled={cancelAppointment.isPending}
                  className="rounded-lg border border-red-400 px-4 py-2 text-sm text-red-500 hover:bg-red-950/40 disabled:opacity-50 flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Cancel Appointment
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {ConfirmDialog}
    </div>
  )
}


