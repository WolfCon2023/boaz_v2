import { MongoClient, Db, FindOneAndUpdateOptions } from 'mongodb'
import { env } from './env.js'

let client: MongoClient | null = null
let db: Db | null = null

export async function getDb(): Promise<Db | null> {
  if (!env.MONGO_URL) return null
  if (db) return db
  try {
    client = new MongoClient(env.MONGO_URL, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    })
    await client.connect()
    db = client.db()
    return db
  } catch (_e) {
    // Fail fast if Mongo is unreachable so routes can respond with 500 instead of hanging 1
    client = null
    db = null
    return null
  }
}

export async function closeDb() {
  if (client) await client.close()
  client = null
  db = null
}

export async function getNextSequence(key: string): Promise<number> {
  const database = await getDb()
  if (!database) throw new Error('DB unavailable')
  const counters = database.collection<{ _id: string; seq: number }>('counters')
  // Use aggregation pipeline update to avoid modifier conflicts on the same path
  const result = await counters.findOneAndUpdate(
    { _id: key },
    [
      {
        $set: {
          seq: { $add: [ { $ifNull: ['$seq', 998800] }, 1 ] }
        }
      }
    ] as any,
    { upsert: true, returnDocument: 'after' } as FindOneAndUpdateOptions
  )
  const seq = (result as any)?.value?.seq
  return typeof seq === 'number' ? seq : 998801
}


