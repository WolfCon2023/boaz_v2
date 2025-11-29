import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import mjml2html from 'mjml'
import { sendEmail } from '../alerts/mail.js'
import crypto from 'crypto'
import { env } from '../env.js'

export const marketingSendRouter = Router()

function buildFilterFromRules(rules: any[]): any {
  const ands: any[] = []
  for (const r of rules || []) {
    const field = typeof r?.field === 'string' ? r.field : ''
    const operator = typeof r?.operator === 'string' ? r.operator : 'contains'
    const value = typeof r?.value === 'string' ? r.value : ''
    if (!field || !value) continue
    if (operator === 'equals') ands.push({ [field]: value })
    else if (operator === 'startsWith') ands.push({ [field]: { $regex: `^${value}`, $options: 'i' } })
    else ands.push({ [field]: { $regex: value, $options: 'i' } })
  }
  return ands.length ? { $and: ands } : {}
}

function injectUnsubscribe(html: string, unsubscribeUrl: string): string {
  // Support both {{unsubscribeUrl}} and {{unsubscribeurl}} (case-insensitive)
  if (html.includes('{{unsubscribeUrl}}')) {
    return html.replaceAll('{{unsubscribeUrl}}', unsubscribeUrl)
  }
  if (html.includes('{{unsubscribeurl}}')) {
    return html.replaceAll('{{unsubscribeurl}}', unsubscribeUrl)
  }

  // Also handle older patterns like "http://{{unsubscribeurl}}/" or "https://{{unsubscribeurl}}"
  const fullRegex = /https?:\/\/\{\{unsubscribeurl\}\}\/?/gi
  if (fullRegex.test(html)) {
    return html.replace(fullRegex, unsubscribeUrl)
  }

  // Case-insensitive replacement as fallback for bare token
  const regex = /\{\{unsubscribeurl\}\}/gi
  if (regex.test(html)) {
    return html.replace(regex, unsubscribeUrl)
  }
  // If no placeholder found, append footer
  const footer = `<p style="font-size:12px;color:#64748b">You received this email because you subscribed. <a href="${unsubscribeUrl}">Unsubscribe</a></p>`
  return html + footer
}

function injectSurveyUrl(html: string, surveyUrl?: string | null): string {
  if (!surveyUrl) return html
  let out = html

  // Replace bare placeholders first
  if (out.includes('{{surveyUrl}}')) {
    out = out.replaceAll('{{surveyUrl}}', surveyUrl)
  }
  if (out.includes('{{surveyurl}}')) {
    out = out.replaceAll('{{surveyurl}}', surveyUrl)
  }

  // Also handle older patterns like "http://{{surveyurl}}/" or "https://{{surveyurl}}"
  const fullRegex = /https?:\/\/\{\{surveyurl\}\}\/?/gi
  if (fullRegex.test(out)) {
    out = out.replace(fullRegex, surveyUrl)
  }

  return out
}

function injectPixel(html: string, pixelUrl: string): string {
  const img = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`
  if (/(<\/body>)/i.test(html)) return html.replace(/<\/body>/i, img + '</body>')
  return html + img
}

// POST /api/marketing/campaigns/:id/send { dryRun?: boolean }
marketingSendRouter.post('/campaigns/:id/send', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  try {
    const _id = new ObjectId(req.params.id)
    const campaign = await db.collection('marketing_campaigns').findOne({ _id }) as any
    if (!campaign) return res.status(404).json({ data: null, error: 'campaign_not_found' })
    if (!campaign.segmentId) return res.status(400).json({ data: null, error: 'missing_segment' })
    const segment = await db.collection('marketing_segments').findOne({ _id: campaign.segmentId }) as any
    if (!segment) return res.status(404).json({ data: null, error: 'segment_not_found' })
    let html: string = String(campaign.html || '')
    const mjml = String(campaign.mjml || '')
    if (!html && mjml) {
      try { html = mjml2html(mjml, { validationLevel: 'soft' }).html } catch {}
    }
    if (!html) return res.status(400).json({ data: null, error: 'missing_html' })

    const base = `${req.protocol}://${req.get('host')}`
    const filter = buildFilterFromRules(Array.isArray(segment.rules) ? segment.rules : [])
    const recipients = await db
      .collection('contacts')
      .find(filter, { projection: { email: 1, name: 1 } as any })
      .limit(5000)
      .toArray()
    const directEmails: string[] = Array.isArray(segment?.emails) ? segment.emails : []
    const emailSet = new Set<string>()
    const finalList: { email: string; name?: string }[] = []
    for (const r of recipients) {
      const email = String(r.email || '').trim().toLowerCase()
      if (!email || emailSet.has(email)) continue
      emailSet.add(email)
      finalList.push({ email, name: r.name })
    }
    for (const e of directEmails) {
      const email = String(e || '').trim().toLowerCase()
      if (!email || emailSet.has(email)) continue
      emailSet.add(email)
      finalList.push({ email })
    }
    const unsubbed = await db.collection('marketing_unsubscribes').find({}).toArray()
    const unsubSet = new Set(unsubbed.map((u: any) => String(u.email).toLowerCase()))
    const dryRun = !!req.body?.dryRun

    let total = 0
    let skipped = 0
    let sent = 0
    let errors = 0
    for (const r of finalList) {
      const email = String(r.email || '').trim()
      if (!email) continue
      total++
      if (unsubSet.has(email.toLowerCase())) { skipped++; continue }
      const unsubscribeUrl = `${base}/api/marketing/unsubscribe?e=${encodeURIComponent(email)}&c=${_id.toHexString()}`
      const pixelUrl = `${base}/api/marketing/pixel.gif?c=${_id.toHexString()}&e=${encodeURIComponent(email)}`

      let surveyUrl: string | undefined
      if (campaign.surveyProgramId) {
        const token = crypto.randomBytes(24).toString('hex')
        await db.collection('survey_links').insertOne({
          token,
          programId: campaign.surveyProgramId,
          contactId: null,
          campaignId: _id,
          email,
          createdAt: new Date(),
        })
        const origin = (env.ORIGIN || '').split(',')[0]?.trim() || base
        const normalizedOrigin = origin.replace(/\/$/, '')
        surveyUrl = `${normalizedOrigin}/surveys/respond/${token}`
      }

      let personalized = html
      personalized = injectSurveyUrl(personalized, surveyUrl)
      personalized = injectUnsubscribe(personalized, unsubscribeUrl)
      personalized = injectPixel(personalized, pixelUrl)
      if (dryRun) continue
      try {
        await sendEmail({ to: email, subject: String(campaign.subject || campaign.name || ''), html: personalized })
        await db.collection('marketing_events').insertOne({ event: 'sent', campaignId: _id, recipient: email, at: new Date() })
        sent++
      } catch {
        errors++
      }
    }
    res.json({ data: { total, skipped, sent, errors }, error: null })
  } catch {
    res.status(400).json({ data: null, error: 'invalid_id' })
  }
})


