import { MongoClient, Db, FindOneAndUpdateOptions } from 'mongodb'
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
  const counters = database.collection<{ _id: string; seq: number }>('counters')
  const result = await counters.findOneAndUpdate(
    { _id: key },
    { $setOnInsert: { seq: 998800 }, $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' } as FindOneAndUpdateOptions
  )
  const seq = (result as any)?.value?.seq
  return typeof seq === 'number' ? seq : 998801
}


