import { MongoClient } from 'mongodb';
import { env } from './env.js';
let client = null;
let db = null;
export async function getDb() {
    if (!env.MONGO_URL)
        return null;
    if (db)
        return db;
    try {
        client = new MongoClient(env.MONGO_URL, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
        });
        await client.connect();
        db = client.db();
        return db;
    }
    catch (_e) {
        // Fail fast if Mongo is unreachable so routes can respond with 500 instead of hanging 1
        client = null;
        db = null;
        return null;
    }
}
export async function closeDb() {
    if (client)
        await client.close();
    client = null;
    db = null;
}
export async function getNextSequence(key) {
    const database = await getDb();
    if (!database)
        throw new Error('DB unavailable');
    const counters = database.collection('counters');
    // Use aggregation pipeline update to avoid modifier conflicts on the same path
    const result = await counters.findOneAndUpdate({ _id: key }, [
        {
            $set: {
                seq: { $add: [{ $ifNull: ['$seq', 998800] }, 1] }
            }
        }
    ], { upsert: true, returnDocument: 'after' });
    const seq = result?.value?.seq;
    return typeof seq === 'number' ? seq : 998801;
}
