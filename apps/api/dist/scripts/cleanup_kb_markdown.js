import { getDb } from '../db.js';
async function main() {
    const db = await getDb();
    if (!db) {
        console.error('Database not available');
        process.exit(1);
    }
    const coll = db.collection('kb_articles');
    const cursor = coll.find({}, { projection: { body: 1 } });
    let updated = 0;
    // eslint-disable-next-line no-constant-condition
    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        if (!doc || typeof doc.body !== 'string')
            continue;
        const cleanBody = doc.body.replace(/[#*]/g, '');
        if (cleanBody === doc.body)
            continue;
        await coll.updateOne({ _id: doc._id }, { $set: { body: cleanBody } });
        updated += 1;
    }
    console.log(`KB cleanup complete. Updated ${updated} article(s).`);
}
main()
    .catch((err) => {
    console.error(err);
    process.exit(1);
})
    .finally(() => process.exit(0));
