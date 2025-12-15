import { getDb } from '../db.js'
import { upsertDailyRevenueIntelligenceSnapshot } from '../crm/revenue_intelligence.js'

export function startRevenueIntelligenceSnapshotsJob() {
  if (String(process.env.REVENUE_INTELLIGENCE_SNAPSHOTS_DISABLED || '').toLowerCase() === 'true') return

  const run = async () => {
    try {
      const db = await getDb()
      if (!db) return
      await upsertDailyRevenueIntelligenceSnapshot(db)
    } catch (e) {
      console.error('[revenue_intelligence_snapshots_job] failed:', e)
    }
  }

  setTimeout(() => void run(), 7_000)
  setInterval(() => void run(), 15 * 60 * 1000)
}


