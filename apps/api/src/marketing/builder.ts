import { Router } from 'express'
import mjml2html from 'mjml'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { sendEmail } from '../alerts/mail.js'

export const marketingBuilderRouter = Router()

/**
 * Replace {{unsubscribeUrl}} placeholder with actual URL for test emails
 */
function injectUnsubscribeForTest(html: string, campaignId: ObjectId, testEmail: string, baseUrl: string): string {
  // Use the API's own URL (baseUrl from request) for unsubscribe links - NOT env.ORIGIN which is the frontend
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '')
  const unsubscribeUrl = `${normalizedBaseUrl}/api/marketing/unsubscribe?e=${encodeURIComponent(testEmail)}&c=${campaignId.toHexString()}`
  
  // Replace all variants of the placeholder
  let result = html
  if (result.includes('{{unsubscribeUrl}}')) {
    result = result.replaceAll('{{unsubscribeUrl}}', unsubscribeUrl)
  }
  if (result.includes('{{unsubscribeurl}}')) {
    result = result.replaceAll('{{unsubscribeurl}}', unsubscribeUrl)
  }
  
  // Handle HTML-encoded curly braces (&#123; and &#125;)
  const htmlEncodedRegex = /&#123;&#123;unsubscribeurl&#125;&#125;/gi
  result = result.replace(htmlEncodedRegex, unsubscribeUrl)
  
  // Handle URL-encoded curly braces (%7B and %7D)
  const urlEncodedRegex = /%7B%7Bunsubscribeurl%7D%7D/gi
  result = result.replace(urlEncodedRegex, unsubscribeUrl)
  
  // Case-insensitive fallback for bare token
  result = result.replace(/\{\{unsubscribeurl\}\}/gi, unsubscribeUrl)
  
  return result
}

function applyFontFamilyToHtml(html: string, fontFamily?: string | null) {
  const ff = String(fontFamily || '').trim()
  if (!ff) return html
  if (!/^[a-zA-Z0-9\s,"'\-]+$/.test(ff)) return html

  const css = `body, table, td, p, a, div, span { font-family: ${ff} !important; }`
  const styleTag = `<style>${css}</style>`

  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => m + styleTag)
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => m + `<head>${styleTag}</head>`)
  }
  return `<html><head>${styleTag}</head><body>${html}</body></html>`
}

// POST /api/marketing/mjml/preview { mjml }
marketingBuilderRouter.post('/mjml/preview', async (req, res) => {
  const source = String((req.body?.mjml as string) || '')
  if (!source.trim()) {
    return res.json({ data: { html: '', errors: ['missing_mjml'] }, error: null })
  }
  try {
    const { html, errors } = mjml2html(source, { keepComments: false, validationLevel: 'soft' })
    return res.json({ data: { html, errors: errors || [] }, error: null })
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : 'mjml_render_failed'
    return res.json({ data: { html: '', errors: [msg] }, error: null })
  }
})

// POST /api/marketing/campaigns/:id/test-send { to, subject?, mjml?, html? }
marketingBuilderRouter.post('/campaigns/:id/test-send', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  let _id: ObjectId
  try {
    _id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ data: null, error: 'invalid_id' })
  }
  const campaign = await db.collection('marketing_campaigns').findOne({ _id }) as any
  if (!campaign) return res.status(404).json({ data: null, error: 'campaign_not_found' })
  const to = String(req.body?.to || '')
  if (!to) return res.status(400).json({ data: null, error: 'missing_to' })
  const subject = String(req.body?.subject || campaign.subject || campaign.name || 'Test Email')
  let html = String(req.body?.html || '')
  const mjml = String(req.body?.mjml || '')
  if (!html && mjml) {
    try { html = mjml2html(mjml, { validationLevel: 'soft' }).html } catch {}
  }
  if (!html) {
    if (campaign?.mjml) {
      try { html = mjml2html(String(campaign.mjml), { validationLevel: 'soft' }).html } catch {}
    }
  }
  if (!html) html = String(campaign.html || '')
  if (!html) return res.status(400).json({ data: null, error: 'no_html' })

  // Apply font override (request takes precedence over campaign default)
  const fontFamily = (req.body && 'fontFamily' in req.body) ? (req.body as any).fontFamily : (campaign as any).fontFamily
  html = applyFontFamilyToHtml(html, fontFamily)

  // Replace unsubscribe placeholder with actual URL for test emails
  const baseUrl = `${req.protocol}://${req.get('host')}`
  html = injectUnsubscribeForTest(html, _id, to, baseUrl)

  try {
    await sendEmail({ to, subject, html })
    return res.status(200).json({ data: { ok: true }, error: null })
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : 'send_failed'
    return res.status(400).json({ data: null, error: msg })
  }
})


