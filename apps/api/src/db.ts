import { MongoClient, Db } from 'mongodb'
import { env } from './env'

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


