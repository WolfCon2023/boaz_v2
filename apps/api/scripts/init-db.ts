import { MongoClient } from 'mongodb'
import 'dotenv/config'

async function main() {
  const url = process.env.MONGO_URL
  if (!url) {
    console.error('MONGO_URL not set')
    process.exit(1)
  }
  const client = new MongoClient(url)
  await client.connect()
  const db = client.db()

  // Create collections if missing
  const collections = await db.listCollections().toArray()
  const have = new Set(collections.map((c) => c.name))
  const ensure = async (name: string) => {
    if (!have.has(name)) await db.createCollection(name)
  }

  await ensure('contacts')
  await ensure('accounts')
  await ensure('deals')
  await ensure('activities')
  await ensure('appointments')
  await ensure('tasks')

  // Indexes (idempotent)
  await db.collection('contacts').createIndexes([
    { key: { email: 1 } },
    { key: { name: 1 } },
  ])
  await db.collection('accounts').createIndexes([
    { key: { name: 1 } },
    { key: { domain: 1 } },
  ])
  await db.collection('deals').createIndexes([
    { key: { stage: 1 } },
    { key: { accountId: 1 } },
    { key: { closeDate: -1 } },
  ])
  await db.collection('activities').createIndexes([
    { key: { accountId: 1 } },
    { key: { at: -1 } },
  ])
  await db.collection('appointments').createIndex({ startsAt: 1 })
  await db.collection('tasks').createIndexes([
    { key: { dueAt: 1 } },
    { key: { completedAt: 1 } },
    { key: { status: 1 } },
  ])

  console.log('Database initialized')
  await client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


