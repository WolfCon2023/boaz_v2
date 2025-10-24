import { MongoClient, Db } from 'mongodb'
import { env } from './env.js'

let client: MongoClient | null = null
let db: Db | null = null

export async function getDb(): Promise<Db | null> {
  if (!env.MONGO_URL) return null
  if (db) return db
  client = new MongoClient(env.MONGO_URL)
  await client.connect()
  db = client.db()
  return db
}

export async function closeDb() {
  if (client) await client.close()
  client = null
  db = null
}

export async function getNextSequence(key: string): Promise<number> {
  const database = await getDb()
  if (!database) throw new Error('DB unavailable')
  const res = await database.collection('counters').findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  )
  // Initialize start if newly created
  if (res.value && typeof res.value.seq === 'number') {
    return res.value.seq as number
  }
  const doc = await database.collection('counters').findOneAndUpdate(
    { _id: key },
    { $setOnInsert: { seq: 998800 } },
    { upsert: true, returnDocument: 'after' }
  )
  const next = await database.collection('counters').findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { returnDocument: 'after' }
  )
  return (next.value?.seq as number) ?? 998801
}


