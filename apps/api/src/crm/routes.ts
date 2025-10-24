import { Router } from 'express'
import { getDb } from '../db.js'
import { ObjectId } from 'mongodb'

export const crmRouter = Router()

// GET /api/crm/contacts?q=&cursor=&limit=
crmRouter.get('/contacts', async (req, res) => {
  try {
    const db = await getDb()
    if (!db) return res.json({ data: { items: [], nextCursor: null }, error: null })

    const { q, cursor } = req.query as { q?: string; cursor?: string }
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20)))

    const filter: Record<string, unknown> = {}
    if (q && q.trim()) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ]
    }
    if (cursor) {
      try {
        filter._id = { $gt: new ObjectId(cursor) }
      } catch {
        // ignore bad cursor
      }
    }

    const items = await db
      .collection('contacts')
      .find(filter)
      .project({ name: 1, email: 1, company: 1 })
      .sort({ _id: 1 })
      .limit(limit)
      .toArray()

    const nextCursor = items.length === limit ? String(items[items.length - 1]._id) : null
    res.json({ data: { items, nextCursor }, error: null })
  } catch (e) {
    res.status(500).json({ data: null, error: 'contacts_error' })
  }
})


