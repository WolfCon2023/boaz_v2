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
    
    // Extract database name from URL if present, otherwise default to 'boaz_v2_dev'
    // Format: mongodb://host/dbname or mongodb+srv://host/dbname?options
    // MongoDB driver automatically uses the database name from the URL when calling db() with no args
    // But we'll extract it explicitly to ensure we're using the right database
    try {
      const urlObj = new URL(env.MONGO_URL)
      const pathPart = urlObj.pathname.slice(1) // Remove leading slash
      const dbName = pathPart.split('?')[0].split('/')[0] // Get first path segment, remove query params
      // Use database name from URL if present, otherwise default to 'boaz_v2_dev'
      db = client.db(dbName || 'boaz_v2_dev')
    } catch {
      // If URL parsing fails, default to 'boaz_v2_dev'
      // Note: client.db() with no args uses database from connection string, or 'test' if not specified
      db = client.db('boaz_v2_dev')
    }
    
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


