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
  await ensure('quotes')
  await ensure('invoices')
  await ensure('outreach_templates')
  await ensure('outreach_sequences')
  await ensure('outreach_events')
  await ensure('outreach_enrollments')
  await ensure('support_tickets')
  await ensure('kb_articles')
  await ensure('activities')
  await ensure('appointments')
  await ensure('tasks')
  await ensure('users')
  await ensure('roles')
  await ensure('user_roles')

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
  await db.collection('quotes').createIndexes([
    { key: { quoteNumber: 1 }, name: 'quoteNumber_1' },
    { key: { accountId: 1 } },
    { key: { updatedAt: -1 } },
    { key: { status: 1 } },
  ])
  await db.collection('invoices').createIndexes([
    { key: { invoiceNumber: 1 }, name: 'invoiceNumber_1' },
    { key: { accountId: 1 } },
    { key: { updatedAt: -1 } },
    { key: { status: 1 } },
    { key: { dueDate: 1 } },
  ])
  await db.collection('outreach_templates').createIndexes([
    { key: { updatedAt: -1 } },
    { key: { name: 1 } },
    { key: { channel: 1 } },
  ])
  await db.collection('outreach_sequences').createIndexes([
    { key: { updatedAt: -1 } },
    { key: { name: 1 } },
  ])
  await db.collection('outreach_events').createIndexes([
    { key: { at: -1 }, name: 'at_-1' },
    { key: { event: 1 }, name: 'event_1' },
    { key: { channel: 1 }, name: 'channel_1' },
  ])
  await db.collection('outreach_enrollments').createIndexes([
    { key: { contactId: 1 }, name: 'contactId_1' },
    { key: { sequenceId: 1 }, name: 'sequenceId_1' },
    { key: { startedAt: -1 }, name: 'startedAt_-1' },
    { key: { completedAt: 1 }, name: 'completedAt_1' },
  ])
  await db.collection('support_tickets').createIndexes([
    { key: { ticketNumber: 1 }, name: 'ticketNumber_1' },
    { key: { status: 1 }, name: 'status_1' },
    { key: { priority: 1 }, name: 'priority_1' },
    { key: { accountId: 1 }, name: 'accountId_1' },
    { key: { contactId: 1 }, name: 'contactId_1' },
    { key: { createdAt: -1 }, name: 'createdAt_-1' },
  ])
  await db.collection('kb_articles').createIndexes([
    { key: { updatedAt: -1 }, name: 'updatedAt_-1' },
    { key: { title: 1 }, name: 'title_1' },
    { key: { tags: 1 }, name: 'tags_1' },
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
  await db.collection('users').createIndexes([
    { key: { email: 1 }, unique: true },
  ])

  // Initialize counters for quote numbers (idempotent)
  await db.collection('counters').updateOne(
    { _id: 'quoteNumber' },
    { $setOnInsert: { seq: 500000 } },
    { upsert: true }
  )
  await db.collection('counters').updateOne(
    { _id: 'invoiceNumber' },
    { $setOnInsert: { seq: 700000 } },
    { upsert: true }
  )
  await db.collection('counters').updateOne(
    { _id: 'ticketNumber' },
    { $setOnInsert: { seq: 200000 } },
    { upsert: true }
  )

  console.log('Database initialized')
  await client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


