import { Router } from 'express'
import { ObjectId, Sort, SortDirection } from 'mongodb'
import { getDb } from '../db.js'
import { requireAuth, requirePermission } from '../auth/rbac.js'

export const marketingUnsubscribeRouter = Router()

// GET /api/marketing/unsubscribe?e=email&c=campaignId (public endpoint)
marketingUnsubscribeRouter.get('/unsubscribe', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).send('db_unavailable')
  const email = String(req.query.e || '').toLowerCase().trim()
  const c = String(req.query.c || '')
  if (!email) return res.status(400).send('missing_email')
  const doc: any = { email, at: new Date() }
  if (ObjectId.isValid(c)) doc.campaignId = new ObjectId(c)
  await db.collection('marketing_unsubscribes').updateOne({ email }, { $set: doc }, { upsert: true })
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send('<!doctype html><html><body><div style="font-family:system-ui;padding:24px">You have been unsubscribed. You can close this page.</div></body></html>')
})

// GET /api/marketing/unsubscribes (list all unsubscribes - requires auth)
marketingUnsubscribeRouter.get('/unsubscribes', requireAuth, async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const q = String((req.query.q as string) ?? '').trim()
    const sortKeyRaw = (req.query.sort as string) ?? 'at'
    const dirParam = ((req.query.dir as string) ?? 'desc').toLowerCase()
    const dir: SortDirection = dirParam === 'asc' ? 1 : -1
    const allowed = new Set(['email', 'at', 'campaignId'])
    const sortField = allowed.has(sortKeyRaw) ? sortKeyRaw : 'at'
    const sort: Sort = { [sortField]: dir }
    
    const filter: Record<string, unknown> = {}
    if (q) {
      filter.$or = [
        { email: { $regex: q, $options: 'i' } },
      ]
    }
    
    const unsubscribes = await db.collection('marketing_unsubscribes')
      .find(filter)
      .sort(sort)
      .limit(1000)
      .toArray()
    
    // Get campaign names for unsubscribes with campaignId
    const campaignIds = unsubscribes
      .map((u: any) => u.campaignId)
      .filter((id: any) => id && ObjectId.isValid(id))
      .map((id: any) => new ObjectId(id))
    
    const campaigns = campaignIds.length > 0
      ? await db.collection('marketing_campaigns')
          .find({ _id: { $in: campaignIds } })
          .project({ _id: 1, name: 1 })
          .toArray()
      : []
    
    const campaignMap = new Map(campaigns.map((c: any) => [String(c._id), c.name]))
    
    // Get contact names for emails
    const emails = unsubscribes.map((u: any) => u.email)
    const contacts = emails.length > 0
      ? await db.collection('contacts')
          .find({ email: { $in: emails } })
          .project({ email: 1, name: 1 })
          .toArray()
      : []
    
    const contactMap = new Map(contacts.map((c: any) => [String(c.email).toLowerCase(), c.name]))
    
    const items = unsubscribes.map((u: any) => ({
      _id: String(u._id),
      email: u.email,
      name: contactMap.get(u.email?.toLowerCase()) || null,
      campaignId: u.campaignId ? String(u.campaignId) : null,
      campaignName: u.campaignId ? campaignMap.get(String(u.campaignId)) || null : null,
      at: u.at,
    }))
    
    res.json({ data: { items }, error: null })
  } catch (err: any) {
    console.error('Get unsubscribes error:', err)
    res.status(500).json({ data: null, error: err.message || 'failed_to_get_unsubscribes' })
  }
})

// DELETE /api/marketing/unsubscribes/:id (remove from DNC list - admin only)
marketingUnsubscribeRouter.delete('/unsubscribes/:id', requireAuth, requirePermission('*'), async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const unsubscribeId = new ObjectId(req.params.id)
    const unsubscribe = await db.collection('marketing_unsubscribes').findOne({ _id: unsubscribeId })
    
    if (!unsubscribe) {
      return res.status(404).json({ data: null, error: 'unsubscribe_not_found' })
    }
    
    await db.collection('marketing_unsubscribes').deleteOne({ _id: unsubscribeId })
    
    res.json({ data: { message: 'Subscriber removed from Do Not Contact list', email: (unsubscribe as any).email }, error: null })
  } catch (err: any) {
    console.error('Remove unsubscribe error:', err)
    res.status(500).json({ data: null, error: err.message || 'failed_to_remove_unsubscribe' })
  }
})


