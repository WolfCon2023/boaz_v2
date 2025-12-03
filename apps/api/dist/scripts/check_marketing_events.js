import { getDb } from '../db.js';
async function checkMarketingEvents() {
    const db = await getDb();
    if (!db) {
        console.error('Database not available');
        process.exit(1);
    }
    console.log('Checking marketing events...\n');
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    // Check recent marketing events
    const recentEvents = await db.collection('marketing_events')
        .find({ at: { $gte: yesterday } })
        .sort({ at: -1 })
        .toArray();
    console.log(`Found ${recentEvents.length} marketing events in the last 24 hours:\n`);
    if (recentEvents.length === 0) {
        console.log('No marketing events found in the last 24 hours.');
    }
    else {
        const eventCounts = new Map();
        recentEvents.forEach((e) => {
            const type = e.event || 'unknown';
            eventCounts.set(type, (eventCounts.get(type) || 0) + 1);
        });
        console.log('Event counts by type:');
        eventCounts.forEach((count, type) => {
            console.log(`  ${type}: ${count}`);
        });
        console.log('\nLast 10 events:');
        recentEvents.slice(0, 10).forEach((e, i) => {
            console.log(`${i + 1}. ${e.at.toLocaleString('en-US', {
                timeZone: 'America/New_York',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            })} - ${e.event} ${e.recipient ? `to ${e.recipient}` : ''} ${e.campaignId ? `(Campaign: ${e.campaignId})` : ''}`);
        });
    }
    // Check total counts
    const total = await db.collection('marketing_events').countDocuments();
    console.log(`\nTotal marketing events in database: ${total}`);
    // Check by event type
    const bySentCount = await db.collection('marketing_events').countDocuments({ event: 'sent' });
    const byOpenCount = await db.collection('marketing_events').countDocuments({ event: 'open' });
    const byClickCount = await db.collection('marketing_events').countDocuments({ event: 'click' });
    console.log(`\nBreakdown:`);
    console.log(`  Sent: ${bySentCount}`);
    console.log(`  Opens: ${byOpenCount}`);
    console.log(`  Clicks: ${byClickCount}`);
    process.exit(0);
}
checkMarketingEvents().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
