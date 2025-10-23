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

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  await db.collection('appointments').deleteMany({})
  await db.collection('tasks').deleteMany({})

  await db.collection('appointments').insertMany([
    { title: 'Intro call', startsAt: new Date(today.getTime() + 60 * 60 * 1000) },
    { title: 'Demo', startsAt: new Date(today.getTime() + 3 * 60 * 60 * 1000) },
  ])

  await db.collection('tasks').insertMany([
    { title: 'Prepare proposal', dueAt: new Date(today.getTime() + 2 * 60 * 60 * 1000), status: 'todo' },
    { title: 'Send invoice', dueAt: new Date(today.getTime() + 4 * 60 * 60 * 1000), status: 'in_progress' },
    { title: 'Follow-up email', completedAt: new Date(today.getTime() + 30 * 60 * 1000), status: 'done' },
  ])

  console.log('Seeded sample data')
  await client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


