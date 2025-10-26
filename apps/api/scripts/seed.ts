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
  await db.collection('contacts').deleteMany({})
  await db.collection('accounts').deleteMany({})
  await db.collection('deals').deleteMany({})
  await db.collection('activities').deleteMany({})

  await db.collection('appointments').insertMany([
    { title: 'Intro call', startsAt: new Date(today.getTime() + 60 * 60 * 1000) },
    { title: 'Demo', startsAt: new Date(today.getTime() + 3 * 60 * 60 * 1000) },
  ])

  await db.collection('tasks').insertMany([
    { title: 'Prepare proposal', dueAt: new Date(today.getTime() + 2 * 60 * 60 * 1000), status: 'todo' },
    { title: 'Send invoice', dueAt: new Date(today.getTime() + 4 * 60 * 60 * 1000), status: 'in_progress' },
    { title: 'Follow-up email', completedAt: new Date(today.getTime() + 30 * 60 * 1000), status: 'done' },
  ])

  await db.collection('contacts').insertMany([
    { name: 'Ada Lovelace', email: 'ada@example.com', company: 'Analytical Engines' },
    { name: 'Grace Hopper', email: 'grace@example.com', company: 'US Navy' },
    { name: 'Alan Turing', email: 'alan@example.com', company: 'Bletchley Park' },
    { name: 'Katherine Johnson', email: 'katherine@example.com', company: 'NASA' },
  ])

  // Accounts
  const accounts = await db.collection('accounts').insertMany([
    { name: 'Acme Corp', domain: 'acme.com', industry: 'Manufacturing' },
    { name: 'Globex', domain: 'globex.com', industry: 'Technology' },
    { name: 'Initech', domain: 'initech.com', industry: 'Software' },
  ])

  const acmeId = accounts.insertedIds['0']
  const globexId = accounts.insertedIds['1']

  // Deals
  await db.collection('deals').insertMany([
    { title: 'ACME ERP rollout', accountId: acmeId, amount: 125000, stage: 'negotiation', closeDate: new Date(Date.now() + 14*24*60*60*1000) },
    { title: 'Globex CRM expansion', accountId: globexId, amount: 78000, stage: 'proposal', closeDate: new Date(Date.now() + 30*24*60*60*1000) },
  ])

  // Quotes
  await db.collection('quotes').deleteMany({})
  await db.collection('quotes').insertMany([
    { title: 'ACME ERP Phase 1', accountId: acmeId, items: [], subtotal: 100000, tax: 7000, total: 107000, status: 'Draft', version: 1, createdAt: new Date(), updatedAt: new Date() },
    { title: 'Globex CRM Add-ons', accountId: globexId, items: [], subtotal: 60000, tax: 4200, total: 64200, status: 'Submitted for Review', version: 1, createdAt: new Date(), updatedAt: new Date() },
  ])

  // Activities
  await db.collection('activities').insertMany([
    { type: 'call', subject: 'Discovery call', accountId: acmeId, at: new Date() },
    { type: 'email', subject: 'Send proposal', accountId: globexId, at: new Date() },
  ])

  // Indexes
  await db.collection('contacts').createIndexes([
    { key: { email: 1 }, unique: false },
    { key: { name: 1 } },
  ])
  await db.collection('accounts').createIndexes([
    { key: { name: 1 } },
    { key: { domain: 1 }, unique: false },
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

  console.log('Seeded sample data')
  await client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


