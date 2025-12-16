import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { requireApiKey } from '../auth/api_keys.js'

export const inboundIntegrationsRouter = Router()

// All inbound routes require an API key.
inboundIntegrationsRouter.use(requireApiKey({ scopes: ['integrations:write'] }))

function normEmail(v: any) {
  return String(v || '').trim().toLowerCase()
}
function normStr(v: any) {
  const s = String(v ?? '').trim()
  return s
}
function pickExternal(raw: any) {
  const externalSource = normStr(raw.externalSource || raw.source || raw.integrationSource)
  const externalId = normStr(raw.externalId || raw.id || raw.external_id)
  return { externalSource, externalId }
}

async function logInbound(db: any, req: any, payload: any, result: any) {
  try {
    await db.collection('integration_inbound_events').insertOne({
      _id: new ObjectId(),
      at: new Date(),
      path: req.originalUrl,
      method: req.method,
      apiKeyPrefix: req.apiKey?.prefix ?? null,
      apiKeyName: req.apiKey?.name ?? null,
      status: result?.status ?? null,
      payload: payload ?? null,
      result: result ?? null,
    })
  } catch {
    // ignore
  }
}

// POST /api/integrations/inbound/accounts (upsert)
inboundIntegrationsRouter.post('/accounts', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  try {
    const { externalSource, externalId } = pickExternal(raw)
    const name = normStr(raw.name || raw.accountName)
    if (!externalSource || !externalId || !name) {
      await logInbound(db, req, raw, { ok: false, status: 400, error: 'missing_required_fields' })
      return res.status(400).json({ data: null, error: 'missing_required_fields' })
    }

    const now = new Date()
    const update: any = {
      name,
      domain: raw.domain ? normStr(raw.domain) : undefined,
      industry: raw.industry ? normStr(raw.industry) : undefined,
      phone: raw.phone ? normStr(raw.phone) : undefined,
      email: raw.email ? normStr(raw.email) : undefined,
      externalSource,
      externalId,
      updatedAt: now,
    }
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k])

    const r = await db.collection('accounts').updateOne(
      { externalSource, externalId },
      { $set: update, $setOnInsert: { createdAt: now } },
      { upsert: true },
    )

    const id = r.upsertedId
      ? String((r.upsertedId as any)._id)
      : String((await db.collection('accounts').findOne({ externalSource, externalId }, { projection: { _id: 1 } as any }))?._id)
    await logInbound(db, req, raw, { ok: true, status: 200, kind: 'account', id })
    res.json({ data: { ok: true, id }, error: null })
  } catch (e: any) {
    await logInbound(db, req, raw, { ok: false, status: 500, error: String(e?.message || e || 'error') })
    res.status(500).json({ data: null, error: 'inbound_accounts_error' })
  }
})

// POST /api/integrations/inbound/contacts (upsert)
inboundIntegrationsRouter.post('/contacts', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  try {
    const { externalSource, externalId } = pickExternal(raw)
    const email = normEmail(raw.email)
    const name = normStr(raw.name || raw.fullName)
    if (!email && (!externalSource || !externalId)) {
      await logInbound(db, req, raw, { ok: false, status: 400, error: 'missing_identifier' })
      return res.status(400).json({ data: null, error: 'missing_identifier' })
    }

    const now = new Date()

    // Optional account link: accept accountExternalId+accountExternalSource
    let accountId: any = undefined
    const accSource = normStr(raw.accountExternalSource || externalSource)
    const accId = normStr(raw.accountExternalId)
    if (accSource && accId) {
      const acc = await db
        .collection('accounts')
        .findOne({ externalSource: accSource, externalId: accId }, { projection: { _id: 1 } as any })
      if (acc?._id) accountId = acc._id
    }

    const update: any = {
      name: name || undefined,
      email: email || undefined,
      company: raw.company ? normStr(raw.company) : undefined,
      mobilePhone: raw.mobilePhone ? normStr(raw.mobilePhone) : raw.phone ? normStr(raw.phone) : undefined,
      officePhone: raw.officePhone ? normStr(raw.officePhone) : undefined,
      accountId,
      externalSource: externalSource || undefined,
      externalId: externalId || undefined,
      updatedAt: now,
    }
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k])

    const filter = email ? { email } : { externalSource, externalId }
    const r = await db.collection('contacts').updateOne(filter, { $set: update, $setOnInsert: { createdAt: now } }, { upsert: true })

    const id = r.upsertedId
      ? String((r.upsertedId as any)._id)
      : String((await db.collection('contacts').findOne(filter, { projection: { _id: 1 } as any }))?._id)
    await logInbound(db, req, raw, { ok: true, status: 200, kind: 'contact', id })
    res.json({ data: { ok: true, id }, error: null })
  } catch (e: any) {
    await logInbound(db, req, raw, { ok: false, status: 500, error: String(e?.message || e || 'error') })
    res.status(500).json({ data: null, error: 'inbound_contacts_error' })
  }
})

// POST /api/integrations/inbound/deals (upsert)
inboundIntegrationsRouter.post('/deals', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  try {
    const { externalSource, externalId } = pickExternal(raw)
    const title = normStr(raw.title || raw.name)
    if (!externalSource || !externalId || !title) {
      await logInbound(db, req, raw, { ok: false, status: 400, error: 'missing_required_fields' })
      return res.status(400).json({ data: null, error: 'missing_required_fields' })
    }

    const now = new Date()
    let accountId: any = undefined
    const accSource = normStr(raw.accountExternalSource || externalSource)
    const accId = normStr(raw.accountExternalId)
    if (accSource && accId) {
      const acc = await db
        .collection('accounts')
        .findOne({ externalSource: accSource, externalId: accId }, { projection: { _id: 1 } as any })
      if (acc?._id) accountId = acc._id
    }

    const amount = raw.amount != null ? Number(raw.amount) : undefined
    const stage = raw.stage ? normStr(raw.stage) : undefined
    const closeDate = raw.closeDate ? new Date(`${normStr(raw.closeDate)}T12:00:00Z`) : undefined
    const forecastedCloseDate = raw.forecastedCloseDate ? new Date(`${normStr(raw.forecastedCloseDate)}T12:00:00Z`) : undefined

    const update: any = {
      title,
      amount: Number.isFinite(amount as any) ? amount : undefined,
      stage,
      accountId,
      closeDate: closeDate && Number.isFinite(closeDate.getTime()) ? closeDate : undefined,
      forecastedCloseDate: forecastedCloseDate && Number.isFinite(forecastedCloseDate.getTime()) ? forecastedCloseDate : undefined,
      externalSource,
      externalId,
      updatedAt: now,
      lastActivityAt: now,
    }
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k])

    const r = await db.collection('deals').updateOne(
      { externalSource, externalId },
      { $set: update, $setOnInsert: { createdAt: now, stageChangedAt: now } },
      { upsert: true },
    )

    const id = r.upsertedId
      ? String((r.upsertedId as any)._id)
      : String((await db.collection('deals').findOne({ externalSource, externalId }, { projection: { _id: 1 } as any }))?._id)
    await logInbound(db, req, raw, { ok: true, status: 200, kind: 'deal', id })
    res.json({ data: { ok: true, id }, error: null })
  } catch (e: any) {
    await logInbound(db, req, raw, { ok: false, status: 500, error: String(e?.message || e || 'error') })
    res.status(500).json({ data: null, error: 'inbound_deals_error' })
  }
})

// POST /api/integrations/inbound/tickets (upsert)
inboundIntegrationsRouter.post('/tickets', async (req: any, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  const raw = req.body ?? {}
  try {
    const { externalSource, externalId } = pickExternal(raw)
    const shortDescription = normStr(raw.shortDescription || raw.subject || raw.title)
    if (!externalSource || !externalId || !shortDescription) {
      await logInbound(db, req, raw, { ok: false, status: 400, error: 'missing_required_fields' })
      return res.status(400).json({ data: null, error: 'missing_required_fields' })
    }

    const now = new Date()
    let accountId: any = null
    const accSource = normStr(raw.accountExternalSource || externalSource)
    const accId = normStr(raw.accountExternalId)
    if (accSource && accId) {
      const acc = await db
        .collection('accounts')
        .findOne({ externalSource: accSource, externalId: accId }, { projection: { _id: 1 } as any })
      if (acc?._id) accountId = acc._id
    }

    const update: any = {
      shortDescription,
      description: raw.description ? normStr(raw.description).slice(0, 2500) : '',
      status: raw.status ? normStr(raw.status) : 'open',
      priority: raw.priority ? normStr(raw.priority) : 'normal',
      requesterName: raw.requesterName ? normStr(raw.requesterName) : null,
      requesterEmail: raw.requesterEmail ? normEmail(raw.requesterEmail) : null,
      requesterPhone: raw.requesterPhone ? normStr(raw.requesterPhone) : null,
      accountId,
      contactId: null,
      type: 'integration',
      externalSource,
      externalId,
      updatedAt: now,
    }
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k])

    const r = await db.collection('support_tickets').updateOne(
      { externalSource, externalId },
      { $set: update, $setOnInsert: { createdAt: now, comments: [] } },
      { upsert: true },
    )

    const id = r.upsertedId
      ? String((r.upsertedId as any)._id)
      : String((await db.collection('support_tickets').findOne({ externalSource, externalId }, { projection: { _id: 1 } as any }))?._id)
    await logInbound(db, req, raw, { ok: true, status: 200, kind: 'ticket', id })
    res.json({ data: { ok: true, id }, error: null })
  } catch (e: any) {
    await logInbound(db, req, raw, { ok: false, status: 500, error: String(e?.message || e || 'error') })
    res.status(500).json({ data: null, error: 'inbound_tickets_error' })
  }
})


