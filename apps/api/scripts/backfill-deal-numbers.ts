import { MongoClient } from 'mongodb'
import 'dotenv/config'

async function main() {
  const url = process.env.MONGO_URL
  if (!url) throw new Error('MONGO_URL not set')
  const client = new MongoClient(url)
  await client.connect()
  const db = client.db()

  // Ensure counter exists and is aligned with current max
  const maxDoc = await db
    .collection('deals')
    .find({ dealNumber: { $type: 'number' } })
    .project({ dealNumber: 1 })
    .sort({ dealNumber: -1 })
    .limit(1)
    .next()
  const currentMax = typeof maxDoc?.dealNumber === 'number' ? maxDoc.dealNumber : 100000

  const counters = db.collection<{ _id: string; seq: number }>('counters')
  const c = await counters.findOneAndUpdate(
    { _id: 'dealNumber' },
    { $setOnInsert: { seq: currentMax } },
    { upsert: true, returnDocument: 'after' }
  )
  let seq = (c as any)?.value?.seq ?? currentMax

  // Backfill deals without dealNumber
  const cursor = db
    .collection('deals')
    .find({ $or: [{ dealNumber: { $exists: false } }, { dealNumber: null }] })
    .sort({ _id: 1 })

  let count = 0
  while (await cursor.hasNext()) {
    const d = await cursor.next()
    if (!d) break
    seq += 1
    await db.collection('deals').updateOne({ _id: d._id }, { $set: { dealNumber: seq } })
    count += 1
  }

  console.log(`Backfilled ${count} deals. Last dealNumber: ${seq}`)
  await client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


