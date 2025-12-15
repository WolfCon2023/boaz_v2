import crypto from 'crypto'

export type CrmEventEnvelope = {
  type: string
  occurredAt: string
  deliveryId: string
  data: any
}

type WebhookDoc = {
  _id: any
  name: string
  url: string
  secret?: string | null
  events?: string[]
  isActive?: boolean
}

function randomId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(10).toString('hex')}`
}

function safeJsonStringify(value: any) {
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return JSON.stringify({ error: 'failed_to_serialize' })
  }
}

function computeSignature(secret: string, timestamp: string, body: string) {
  // Signature scheme: v1=<hex(hmac_sha256(secret, `${timestamp}.${body}`))>
  const mac = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return `v1=${mac}`
}

export async function dispatchCrmEvent(
  db: any,
  eventType: string,
  data: any,
  opts?: { onlyWebhookId?: any; source?: string },
) {
  const now = new Date()
  const timestamp = String(Math.floor(now.getTime() / 1000))

  const activeFilter: any = { kind: 'webhook', isActive: { $ne: false } }
  if (opts?.onlyWebhookId) activeFilter._id = opts.onlyWebhookId

  // db is typed as `any` in this codebase, so avoid generic type parameters (TS2347).
  const hooks = (await db.collection('crm_integrations').find(activeFilter).toArray()) as WebhookDoc[]
  if (!hooks.length) return

  for (const hook of hooks) {
    const allowed = Array.isArray(hook.events) && hook.events.length ? hook.events : ['*']
    if (!allowed.includes('*') && !allowed.includes(eventType)) continue

    const deliveryId = randomId('wh')
    const envelope: CrmEventEnvelope = {
      type: eventType,
      occurredAt: now.toISOString(),
      deliveryId,
      data,
    }
    const body = safeJsonStringify(envelope)

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-boaz-event': eventType,
      'x-boaz-delivery': deliveryId,
      'x-boaz-timestamp': timestamp,
    }
    if (hook.secret) headers['x-boaz-signature'] = computeSignature(String(hook.secret), timestamp, body)

    const started = Date.now()
    let ok = false
    let status: number | null = null
    let respText: string | null = null
    let errMsg: string | null = null

    try {
      const ctrl = new AbortController()
      const timeout = setTimeout(() => ctrl.abort(), 10_000)
      try {
        const resp = await fetch(String(hook.url), {
          method: 'POST',
          headers,
          body,
          signal: ctrl.signal,
        })
        status = resp.status
        respText = await resp.text().catch(() => null)
        ok = resp.ok
      } finally {
        clearTimeout(timeout)
      }
    } catch (e: any) {
      errMsg = e?.name === 'AbortError' ? 'timeout' : (e?.message || 'fetch_failed')
    }

    const durationMs = Date.now() - started

    try {
      await db.collection('crm_webhook_deliveries').insertOne({
        _id: deliveryId,
        webhookId: hook._id,
        webhookName: hook.name,
        url: hook.url,
        eventType,
        source: opts?.source || null,
        ok,
        status,
        durationMs,
        responseText: respText ? String(respText).slice(0, 2000) : null,
        error: errMsg,
        createdAt: new Date(),
      })

      await db.collection('crm_integrations').updateOne(
        { _id: hook._id },
        {
          $set: {
            lastDeliveryAt: new Date(),
            lastDeliveryOk: ok,
            lastDeliveryStatus: status,
            lastDeliveryError: errMsg,
            updatedAt: new Date(),
          },
        },
      )
    } catch (err) {
      // don't throw; event dispatch should never break core flows
      console.warn('Failed to record webhook delivery:', err)
    }
  }
}


