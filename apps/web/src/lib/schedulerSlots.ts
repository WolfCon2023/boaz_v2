export type AvailabilityWeekly = Array<{ day: number; enabled: boolean; startMin: number; endMin: number }>

export type BookingType = {
  durationMinutes: number
  bufferBeforeMinutes?: number
  bufferAfterMinutes?: number
}

export type ExistingBlock = { startsAt: string; endsAt: string }

function getTimeZoneOffsetMinutes(timeZone: string, date: Date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = dtf.formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value
  const y = Number(get('year'))
  const m = Number(get('month'))
  const d = Number(get('day'))
  const hh = Number(get('hour'))
  const mm = Number(get('minute'))
  const ss = Number(get('second'))
  const asUtc = Date.UTC(y, m - 1, d, hh, mm, ss)
  return (asUtc - date.getTime()) / 60000
}

function zonedTimeToUtc(timeZone: string, y: number, m: number, d: number, hh: number, mm: number) {
  let utcGuess = Date.UTC(y, m - 1, d, hh, mm, 0)
  const off1 = getTimeZoneOffsetMinutes(timeZone, new Date(utcGuess))
  utcGuess = utcGuess - off1 * 60000
  const off2 = getTimeZoneOffsetMinutes(timeZone, new Date(utcGuess))
  utcGuess = utcGuess - (off2 - off1) * 60000
  return new Date(utcGuess)
}

function getZonedYmd(timeZone: string, date: Date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = dtf.formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value
  const y = Number(get('year'))
  const mo = Number(get('month'))
  const da = Number(get('day'))
  const hh = Number(get('hour'))
  const mi = Number(get('minute'))
  const wd = String(get('weekday') || '')
  const dayIndex =
    wd.startsWith('Sun') ? 0 : wd.startsWith('Mon') ? 1 : wd.startsWith('Tue') ? 2 : wd.startsWith('Wed') ? 3 : wd.startsWith('Thu') ? 4 : wd.startsWith('Fri') ? 5 : 6
  return { y, m: mo, d: da, hh, mm: mi, dayIndex }
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd
}

export function generateBookingSlots(opts: {
  timeZone: string
  weekly: AvailabilityWeekly
  type: BookingType
  existing: ExistingBlock[]
  windowFromIso: string
  windowToIso: string
  maxSlots?: number
  stepMinutes?: number
}) {
  const tz = opts.timeZone || 'UTC'
  const weekly = opts.weekly || []
  const duration = Number(opts.type?.durationMinutes || 30)
  const bufferBefore = Number(opts.type?.bufferBeforeMinutes || 0)
  const bufferAfter = Number(opts.type?.bufferAfterMinutes || 0)
  const existing = (opts.existing || [])
    .map((e) => ({ s: new Date(e.startsAt), e: new Date(e.endsAt) }))
    .filter((x) => Number.isFinite(x.s.getTime()) && Number.isFinite(x.e.getTime()))

  const now = new Date()
  const from = new Date(opts.windowFromIso)
  const to = new Date(opts.windowToIso)
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return []

  const out: Array<{ iso: string; label: string }> = []
  const step = Number(opts.stepMinutes || 15)
  const maxSlots = Number(opts.maxSlots || 48)

  // Probe up to 21 days (matches current public booking UX)
  for (let i = 0; i < 21; i++) {
    const dayProbe = new Date(from.getTime() + i * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000) // noon UTC
    const { y, m, d, dayIndex } = getZonedYmd(tz, dayProbe)
    const cfg = weekly.find((w) => Number(w.day) === dayIndex)
    if (!cfg || !cfg.enabled) continue

    for (let startMin = cfg.startMin; startMin + duration <= cfg.endMin; startMin += step) {
      const hh = Math.floor(startMin / 60)
      const mm = startMin % 60
      const startUtc = zonedTimeToUtc(tz, y, m, d, hh, mm)
      const endUtc = new Date(startUtc.getTime() + duration * 60000)
      const bufferedStart = new Date(startUtc.getTime() - bufferBefore * 60000)
      const bufferedEnd = new Date(endUtc.getTime() + bufferAfter * 60000)
      if (startUtc < now) continue
      if (startUtc < from || startUtc > to) continue
      const conflict = existing.some((ex) => overlaps(bufferedStart, bufferedEnd, ex.s, ex.e))
      if (conflict) continue

      const label = startUtc.toLocaleString('en-US', {
        timeZone: tz,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
      out.push({ iso: startUtc.toISOString(), label })
      if (out.length >= maxSlots) return out
    }
  }

  return out
}

