import { getDb } from '../db.js';
import { computeReportingOverview, getRange } from '../crm/reporting_core.js';
function isoDateUTC(d) {
    // YYYY-MM-DD (UTC)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}
async function ensureDailySnapshot() {
    const db = await getDb();
    if (!db)
        return;
    const now = new Date();
    const dayKey = isoDateUTC(now);
    const scheduleKey = `daily:${dayKey}`;
    // Rolling last 30 days ending today (inclusive)
    const endDate = dayKey;
    const startDt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    startDt.setUTCDate(startDt.getUTCDate() - 29);
    const startDate = startDt.toISOString().slice(0, 10);
    const { start, endExclusive } = getRange(startDate, endDate);
    const overview = await computeReportingOverview({ db, start, endExclusive });
    const doc = {
        _id: scheduleKey, // string _id => atomic dedupe
        createdAt: new Date(),
        createdByUserId: null,
        kind: 'scheduled',
        scheduleKey,
        range: { startDate: overview.range.startDate, endDate: overview.range.endDate },
        kpis: overview.kpis,
    };
    // Upsert by _id (atomic dedupe even across instances)
    await db.collection('reporting_snapshots').updateOne({ _id: scheduleKey }, { $setOnInsert: doc }, { upsert: true });
}
export function startReportingSnapshotsJob() {
    // Allow disabling in some environments.
    if (String(process.env.REPORTING_SNAPSHOTS_DISABLED || '').toLowerCase() === 'true')
        return;
    // Run shortly after boot, then every 15 minutes.
    const run = () => {
        ensureDailySnapshot().catch((e) => console.error('[reporting_snapshots_job] failed:', e));
    };
    setTimeout(run, 5_000);
    setInterval(run, 15 * 60 * 1000);
}
