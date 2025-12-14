import { getDb } from '../db.js';
const ARTICLE = {
    title: 'Using the Reporting app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:reporting', 'analytics', 'reporting', 'finance', 'executive-report'],
    category: 'Sales & Analytics',
    body: `
REPORTING – EXECUTIVE DASHBOARD + EXPORTS

Purpose
The Reporting app is a cross-module executive dashboard that ties together pipeline, support, marketing, renewals, and financial performance into one view. It is designed to answer:
- What revenue is likely to close soon?
- What cash is late or at risk?
- What renewals and churn risks are approaching?
- What support or delivery issues could block growth?
- What marketing engagement is driving pipeline?

Opening the app
- CRM Hub → Reporting
- Or use the CRM navigation bar → Reporting

Key concepts (financials)
- Accounts Receivable (AR): Money customers owe you on unpaid invoices.
- Overdue AR: The total unpaid invoice balance that is past its due date.
- Receivables Aging: AR grouped by how late invoices are (Current, 1–30, 31–60, 61–90, 90+).
- DSO (Days Sales Outstanding): A best‑effort estimate of how long it takes to collect revenue. Higher DSO usually means slower cash collection.
- Cash collected: Payments recorded on invoices during the selected date range.
- Refunds: Refunds recorded on invoices during the selected date range.
- Net cash: Cash collected minus refunds.

Using the dashboard
1) Choose a date range (top of page)
2) Review executive KPIs:
   - Open Pipeline (value + # of deals)
   - Closed Won
   - Support health (open tickets + SLA breaches)
   - Marketing engagement (opens/clicks/unsubs)
   - Receivables (AR), Overdue AR, DSO, Avg days-to-pay
   - Renewal Book (ARR/MRR) and Renewals Due
3) Use drilldowns:
   - Many KPI cards and breakdown chips link to the underlying CRM apps (Deals, Tickets, Invoices, Marketing) to act immediately.

Snapshots (trend tracking)
Reporting supports two snapshot types:
- Manual snapshots: Click “Save snapshot” to capture current KPIs.
- Scheduled daily snapshots: BOAZ-OS automatically records a daily snapshot (deduped by day).

Snapshot controls
- “Run daily snapshot now” forces today’s scheduled snapshot to be generated (safe to run multiple times).
- The snapshots table shows the snapshot type (manual vs scheduled) and day key.

Exports
Reporting supports multiple export formats:
- Export CSV: exports the current dashboard KPIs.
- Export Deals CSV / Reps CSV / At‑Risk CSV (Revenue Intelligence): exports the currently selected forecast view.
- Export Pack (JSON): downloads an “executive pack” containing the current overview + recent snapshots (good for BI tooling).
- Export Pack (CSV): a single CSV containing KPIs + key lists.

PDF Export (Executive Report)
Use “Export PDF” to generate a BOAZ-branded report designed for printing or saving as PDF.
The PDF includes:
- Executive KPI cards (pipeline, won, support, AR)
- Financial section: invoiced totals, cash collected, refunds, net cash
- Receivables: top overdue invoices
- Pipeline: top pipeline deals
- Renewals: due in range + high churn risk list
- Support: backlog and SLA-breached tickets

Troubleshooting
- “Preparing report…” in the PDF: wait until the report finishes loading, then print. The print button is disabled until ready.
- If you see “basic report (API not updated yet)”: your API was deployed without the latest detailed report endpoint. Redeploy the API.
- If a number looks wrong:
  - Check invoice due dates and balances (for AR/aging)
  - Check that payments/refunds are recorded on the invoice (for cash metrics)
  - Check forecast close dates on deals (for pipeline period matching)
`.trim(),
};
async function main() {
    const db = await getDb();
    if (!db) {
        console.error('Database not available');
        process.exit(1);
    }
    const collection = db.collection('kb_articles');
    const res = await collection.updateOne({ title: ARTICLE.title }, {
        $set: {
            title: ARTICLE.title,
            body: ARTICLE.body,
            tags: ARTICLE.tags,
            category: ARTICLE.category,
            updatedAt: new Date(),
        },
        $setOnInsert: {
            createdAt: new Date(),
            author: 'system',
            views: 0,
        },
    }, { upsert: true });
    console.log(res.upsertedCount ? `✅ Created KB article: ${ARTICLE.title}` : `✅ Updated KB article: ${ARTICLE.title}`);
}
main()
    .catch((err) => {
    console.error(err);
    process.exit(1);
})
    .finally(() => process.exit(0));
