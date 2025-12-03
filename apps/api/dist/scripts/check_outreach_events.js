import { getDb } from '../db.js';
async function checkOutreachEvents() {
    const db = await getDb();
    if (!db) {
        console.error('Database not available');
        process.exit(1);
    }
    console.log('Fetching last 10 outreach events...\n');
    const events = await db.collection('outreach_events')
        .find({})
        .sort({ at: -1 })
        .limit(10)
        .toArray();
    if (events.length === 0) {
        console.log('No outreach events found in the database.');
    }
    else {
        console.log(`Found ${events.length} recent events:\n`);
        events.forEach((e, i) => {
            console.log(`Event ${i + 1}:`);
            console.log(`  ID: ${e._id}`);
            console.log(`  Channel: ${e.channel}`);
            console.log(`  Event: ${e.event}`);
            console.log(`  Recipient: ${e.recipient || 'N/A'}`);
            console.log(`  Date: ${e.at}`);
            console.log(`  Variant: ${e.variant || 'N/A'}`);
            console.log('');
        });
    }
    // Check total count
    const total = await db.collection('outreach_events').countDocuments();
    console.log(`Total outreach events in database: ${total}`);
    // Check events by date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await db.collection('outreach_events').countDocuments({ at: { $gte: today } });
    console.log(`Events today: ${todayCount}`);
    const dec2 = new Date('2024-12-02T00:00:00Z');
    const dec3 = new Date('2024-12-03T00:00:00Z');
    const dec2Count = await db.collection('outreach_events').countDocuments({ at: { $gte: dec2, $lt: dec3 } });
    console.log(`Events on Dec 2, 2024: ${dec2Count}`);
    process.exit(0);
}
checkOutreachEvents().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
