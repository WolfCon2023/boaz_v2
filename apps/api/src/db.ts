import { MongoClient, Db, FindOneAndUpdateOptions } from 'mongodb'
import { env } from './env.js'

let client: MongoClient | null = null
let db: Db | null = null

export async function getDb(): Promise<Db | null> {
  if (!env.MONGO_URL) {
    console.error('MONGO_URL environment variable is not set')
    return null
  }
  if (db) {
    console.log('Using existing database connection')
    return db
  }
  
  console.log('Attempting to connect to MongoDB...')
  try {
    client = new MongoClient(env.MONGO_URL, {
      serverSelectionTimeoutMS: 10000, // Increased timeout for Railway
      connectTimeoutMS: 10000,
    })
    await client.connect()
    console.log('MongoDB client connected successfully')
    
    // Extract database name from URL if present, otherwise default to 'boaz_v2_dev'
    // Format: mongodb://host/dbname or mongodb+srv://host/dbname?options
    // MongoDB driver automatically uses the database name from the URL when calling db() with no args
    // But we'll extract it explicitly to ensure we're using the right database
    let dbName = 'boaz_v2_dev'
    try {
      const urlObj = new URL(env.MONGO_URL)
      const pathPart = urlObj.pathname.slice(1) // Remove leading slash
      const extractedName = pathPart.split('?')[0].split('/')[0] // Get first path segment, remove query params
      dbName = extractedName || 'boaz_v2_dev'
      console.log('Extracted database name from URL:', dbName)
    } catch (urlErr) {
      console.warn('Could not parse database name from URL, using default:', dbName)
      // If URL parsing fails, default to 'boaz_v2_dev'
      // Note: client.db() with no args uses database from connection string, or 'test' if not specified
    }
    
    db = client.db(dbName)
    console.log('Database instance created for:', db.databaseName)
    return db
  } catch (e: any) {
    console.error('MongoDB connection error:', e)
    console.error('MongoDB connection error message:', e.message)
    console.error('MongoDB connection error code:', e.code)
    // Fail fast if Mongo is unreachable so routes can respond with 500 instead of hanging
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


