import { Router } from 'express'
import crypto from 'crypto'
import { ObjectId } from 'mongodb'
import { env } from '../env.js'
import { getDb } from '../db.js'

export const m365Router = Router()

// In-memory OAuth state store (use Redis in production)
const oauthStates = new Map<string, { userId: string; createdAt: Date; codeVerifier: string }>()

setInterval(() => {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000)
  for (const [k, v] of oauthStates.entries()) {
    if (v.createdAt < cutoff) oauthStates.delete(k)
  }
}, 60 * 60 * 1000)

function requireM365Configured() {
  if (!env.M365_CLIENT_ID || !env.M365_CLIENT_SECRET || !env.M365_REDIRECT_URI) {
    return false
  }
  return true
}

function b64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function codeChallengeFromVerifier(verifier: string) {
  return b64url(crypto.createHash('sha256').update(verifier).digest())
}

function normEmail(v: any) {
  return String(v || '').trim().toLowerCase()
}

async function upsertConnection(db: any, userId: string, patch: any) {
  const now = new Date()
  await db.collection('calendar_connections').updateOne(
    { userId, provider: 'm365' } as any,
    { $set: { ...patch, updatedAt: now }, $setOnInsert: { _id: new ObjectId(), userId, provider: 'm365', createdAt: now } } as any,
    { upsert: true },
  )
}

async function getConnection(db: any, userId: string) {
  return (await db.collection('calendar_connections').findOne({ userId, provider: 'm365' } as any)) as any
}

export async function getM365AccessToken(db: any, userId: string) {
  const conn = await getConnection(db, userId)
  if (!conn?.refreshToken) return { accessToken: null as string | null, conn: null as any }

  const now = Date.now()
  const expiresAt = conn.expiresAt ? new Date(conn.expiresAt).getTime() : 0
  const stillValid = conn.accessToken && expiresAt && expiresAt - now > 2 * 60 * 1000
  if (stillValid) return { accessToken: String(conn.accessToken), conn }

  // Refresh
  if (!requireM365Configured()) return { accessToken: null as string | null, conn }

  const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
  const body = new URLSearchParams({
    client_id: env.M365_CLIENT_ID!,
    client_secret: env.M365_CLIENT_SECRET!,
    grant_type: 'refresh_token',
    refresh_token: String(conn.refreshToken),
    redirect_uri: env.M365_REDIRECT_URI!,
    scope: String(conn.scope || ''),
  })

  const resp = await fetch(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
  const data = (await resp.json().catch(() => ({}))) as any
  if (!resp.ok || !data.access_token) {
    return { accessToken: null as string | null, conn }
  }

  const newExpiresAt = new Date(Date.now() + Number(data.expires_in || 3600) * 1000)
  await upsertConnection(db, userId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || conn.refreshToken,
    expiresAt: newExpiresAt,
    scope: data.scope || conn.scope,
    tokenType: data.token_type || conn.tokenType,
  })

  return { accessToken: String(data.access_token), conn: { ...conn, accessToken: data.access_token, expiresAt: newExpiresAt } }
}

async function graphGet(token: string, path: string) {
  const url = `https://graph.microsoft.com/v1.0${path.startsWith('/') ? path : `/${path}`}`
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = (await resp.json().catch(() => ({}))) as any
  return { ok: resp.ok, status: resp.status, data }
}

async function graphPost(token: string, path: string, payload: any) {
  const url = `https://graph.microsoft.com/v1.0${path.startsWith('/') ? path : `/${path}`}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await resp.json().catch(() => ({}))) as any
  return { ok: resp.ok, status: resp.status, data }
}

async function graphDelete(token: string, path: string) {
  const url = `https://graph.microsoft.com/v1.0${path.startsWith('/') ? path : `/${path}`}`
  const resp = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  return { ok: resp.ok, status: resp.status }
}

export async function m365CreateEventForAppointment(db: any, ownerUserId: string, appt: any) {
  const { accessToken } = await getM365AccessToken(db, ownerUserId)
  if (!accessToken) return { ok: false as const, reason: 'not_connected' as const }

  const subject = appt.appointmentTypeName
    ? String(appt.appointmentTypeName)
    : `Appointment: ${String(appt.attendeeName || appt.attendeeEmail || '').trim()}`

  const startIso = appt.startsAt instanceof Date ? appt.startsAt.toISOString() : String(appt.startsAt)
  const endIso = appt.endsAt instanceof Date ? appt.endsAt.toISOString() : String(appt.endsAt)

  const payload = {
    subject,
    body: {
      contentType: 'HTML',
      content: `<p>Booked via BOAZ Scheduler.</p><p><strong>Attendee</strong>: ${String(appt.attendeeName || '')} (${String(appt.attendeeEmail || '')})</p>`,
    },
    start: { dateTime: startIso, timeZone: 'UTC' },
    end: { dateTime: endIso, timeZone: 'UTC' },
    attendees: [
      {
        emailAddress: { address: String(appt.attendeeEmail || ''), name: String(appt.attendeeName || '') },
        type: 'required',
      },
    ],
    isOnlineMeeting: true,
  }

  const r = await graphPost(accessToken, '/me/events', payload)
  if (!r.ok || !r.data?.id) return { ok: false as const, reason: 'graph_error' as const, status: r.status }
  return { ok: true as const, eventId: String(r.data.id) }
}

export async function m365DeleteEvent(db: any, ownerUserId: string, eventId: string) {
  const { accessToken } = await getM365AccessToken(db, ownerUserId)
  if (!accessToken) return { ok: false as const, reason: 'not_connected' as const }
  const r = await graphDelete(accessToken, `/me/events/${encodeURIComponent(eventId)}`)
  return { ok: r.ok, status: r.status }
}

export async function m365HasConflict(db: any, ownerUserId: string, startIso: string, endIso: string) {
  const { accessToken } = await getM365AccessToken(db, ownerUserId)
  if (!accessToken) return { ok: true as const, conflict: false }

  const qs = new URLSearchParams({
    startDateTime: startIso,
    endDateTime: endIso,
    $select: 'start,end,showAs',
    $top: '50',
  })
  const r = await graphGet(accessToken, `/me/calendarView?${qs.toString()}`)
  if (!r.ok) return { ok: false as const, conflict: false }
  const items = Array.isArray(r.data?.value) ? r.data.value : []
  const conflict = items.some((e: any) => String(e?.showAs || '').toLowerCase() !== 'free')
  return { ok: true as const, conflict }
}

// GET /api/calendar/m365/status
m365Router.get('/status', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const auth = req.auth as { userId: string; email: string }
  const conn = await getConnection(db, auth.userId)
  res.json({
    data: {
      configured: requireM365Configured(),
      connected: !!conn?.refreshToken,
      email: conn?.accountEmail ?? null,
      expiresAt: conn?.expiresAt ?? null,
      scope: conn?.scope ?? null,
    },
    error: null,
  })
})

// POST /api/calendar/m365/disconnect
m365Router.post('/disconnect', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const auth = req.auth as { userId: string; email: string }
  await db.collection('calendar_connections').deleteOne({ userId: auth.userId, provider: 'm365' } as any)
  res.json({ data: { ok: true }, error: null })
})

// GET /api/calendar/m365/connect
// Returns an auth URL the frontend can redirect to.
m365Router.get('/connect', async (req: any, res) => {
  if (!requireM365Configured()) return res.status(400).json({ data: null, error: 'm365_not_configured' })

  const auth = req.auth as { userId: string; email: string }
  const state = crypto.randomBytes(24).toString('hex')
  const codeVerifier = b64url(crypto.randomBytes(32))
  const codeChallenge = codeChallengeFromVerifier(codeVerifier)
  oauthStates.set(state, { userId: auth.userId, createdAt: new Date(), codeVerifier })

  const scope = [
    'openid',
    'profile',
    'email',
    'offline_access',
    'User.Read',
    'Calendars.ReadWrite',
  ].join(' ')

  const authUrl =
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
    new URLSearchParams({
      client_id: env.M365_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: env.M365_REDIRECT_URI!,
      response_mode: 'query',
      scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    }).toString()

  res.json({ data: { url: authUrl }, error: null })
})

// GET /api/calendar/m365/callback?code=...&state=...
// Exchanges code for tokens, stores connection, then redirects back to web.
m365Router.get('/callback', async (req: any, res) => {
  if (!requireM365Configured()) return res.status(400).send('Microsoft 365 not configured')
  const code = String(req.query.code || '')
  const state = String(req.query.state || '')
  const stateData = oauthStates.get(state)
  if (!code || !state || !stateData) return res.status(400).send('Invalid OAuth state')
  oauthStates.delete(state)

  const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
  const scope = [
    'openid',
    'profile',
    'email',
    'offline_access',
    'User.Read',
    'Calendars.ReadWrite',
  ].join(' ')

  const body = new URLSearchParams({
    client_id: env.M365_CLIENT_ID!,
    client_secret: env.M365_CLIENT_SECRET!,
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.M365_REDIRECT_URI!,
    code_verifier: stateData.codeVerifier,
    scope,
  })

  const resp = await fetch(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
  const data = (await resp.json().catch(() => ({}))) as any
  if (!resp.ok || !data.access_token) {
    return res.status(400).send('Failed to connect Microsoft 365')
  }

  const db = await getDb()
  if (!db) return res.status(500).send('DB unavailable')

  const accessToken = String(data.access_token)
  const refreshToken = data.refresh_token ? String(data.refresh_token) : null
  const expiresAt = new Date(Date.now() + Number(data.expires_in || 3600) * 1000)

  // Fetch profile email
  let accountEmail: string | null = null
  let accountId: string | null = null
  try {
    const me = await graphGet(accessToken, '/me?$select=id,mail,userPrincipalName')
    if (me.ok) {
      accountId = me.data?.id ? String(me.data.id) : null
      accountEmail = normEmail(me.data?.mail || me.data?.userPrincipalName || '')
      if (!accountEmail) accountEmail = null
    }
  } catch {
    // ignore
  }

  await upsertConnection(db, stateData.userId, {
    accessToken,
    refreshToken,
    expiresAt,
    tokenType: data.token_type || 'Bearer',
    scope: data.scope || scope,
    accountEmail,
    accountId,
  })

  // Redirect back to the web app (use ORIGIN first entry)
  const origin = String(env.ORIGIN || '').split(',')[0].trim() || '/'
  res.redirect(`${origin.replace(/\/$/, '')}/apps/calendar?m365=connected`)
})


