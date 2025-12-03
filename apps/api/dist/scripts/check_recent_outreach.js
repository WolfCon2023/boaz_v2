import { getDb } from '../db.js';
async function checkRecentOutreach() {
    const db = await getDb();
    if (!db) {
        console.error('Database not available');
        process.exit(1);
    }
    console.log('Checking outreach events from the last 24 hours...\n');
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    const recentEvents = await db.collection('outreach_events')
        .find({ at: { $gte: yesterday } })
        .sort({ at: -1 })
        .toArray();
    console.log(`Found ${recentEvents.length} events in the last 24 hours:\n`);
    if (recentEvents.length === 0) {
        console.log('No events found in the last 24 hours.');
    }
    else {
        recentEvents.forEach((e, i) => {
            console.log(`Event ${i + 1}:`);
            console.log(`  ID: ${e._id}`);
            console.log(`  Channel: ${e.channel}`);
            console.log(`  Event: ${e.event}`);
            console.log(`  Recipient: ${e.recipient || 'N/A'}`);
            console.log(`  Date/Time: ${e.at.toLocaleString('en-US', {
                timeZone: 'America/New_York',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            })}`);
            console.log(`  Template ID: ${e.templateId || 'N/A'}`);
            console.log(`  Sequence ID: ${e.sequenceId || 'N/A'}`);
            console.log(`  Variant: ${e.variant || 'N/A'}`);
            console.log('');
        });
    }
    // Also check the last 5 events regardless of time
    console.log('\n--- Last 5 events overall ---\n');
    const last5 = await db.collection('outreach_events')
        .find({})
        .sort({ at: -1 })
        .limit(5)
        .toArray();
    last5.forEach((e, i) => {
        console.log(`${i + 1}. ${e.at.toLocaleString('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        })} - ${e.event} to ${e.recipient}`);
    });
    process.exit(0);
}
checkRecentOutreach().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
