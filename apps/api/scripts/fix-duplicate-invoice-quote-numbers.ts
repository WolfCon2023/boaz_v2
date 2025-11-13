import { MongoClient, ObjectId } from 'mongodb'
import 'dotenv/config'

/**
 * Migration script to fix duplicate invoice and quote numbers
 * 
 * This script:
 * 1. Finds all invoices with duplicate invoiceNumbers
 * 2. Reassigns them sequential numbers starting from the highest existing invoice number + 1
 * 3. Does the same for quotes
 * 4. Updates the sequence counters to match the new highest numbers
 * 
 * Run with: npm run fix:invoice-quote-numbers
 */

async function main() {
  const url = process.env.MONGO_URL
  if (!url) {
    console.error('MONGO_URL not set')
    process.exit(1)
  }

  const client = new MongoClient(url)
  try {
    await client.connect()
    const db = client.db()

    console.log('Starting migration to fix duplicate invoice and quote numbers...\n')

    // ===== FIX INVOICES =====
    console.log('=== FIXING INVOICE NUMBERS ===')
    
    // Get all invoices with invoiceNumber
    const invoices = await db.collection('invoices')
      .find({ invoiceNumber: { $type: 'number' } })
      .sort({ createdAt: 1 }) // Sort by creation date to maintain order
      .toArray()

    console.log(`Found ${invoices.length} invoices with invoice numbers`)

    // Find duplicates
    const invoiceNumberCounts = new Map<number, number>()
    invoices.forEach((inv: any) => {
      const num = inv.invoiceNumber
      invoiceNumberCounts.set(num, (invoiceNumberCounts.get(num) || 0) + 1)
    })

    const duplicateInvoiceNumbers = Array.from(invoiceNumberCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([num, _]) => num)

    if (duplicateInvoiceNumbers.length === 0) {
      console.log('No duplicate invoice numbers found ✓')
    } else {
      console.log(`Found ${duplicateInvoiceNumbers.length} duplicate invoice number(s): ${duplicateInvoiceNumbers.join(', ')}`)

      // Get the highest invoice number
      const highestInvoice = await db.collection('invoices')
        .find({ invoiceNumber: { $type: 'number' } })
        .sort({ invoiceNumber: -1 })
        .limit(1)
        .toArray()

      let nextInvoiceNumber = highestInvoice.length > 0 
        ? (highestInvoice[0] as any).invoiceNumber + 1
        : 700001

      console.log(`Starting reassignment from invoice number: ${nextInvoiceNumber}`)

      // Reassign duplicate invoice numbers
      // Group invoices by invoiceNumber to find duplicates
      const invoicesByNumber = new Map<number, any[]>()
      invoices.forEach((inv: any) => {
        if (duplicateInvoiceNumbers.includes(inv.invoiceNumber)) {
          if (!invoicesByNumber.has(inv.invoiceNumber)) {
            invoicesByNumber.set(inv.invoiceNumber, [])
          }
          invoicesByNumber.get(inv.invoiceNumber)!.push(inv)
        }
      })

      let fixedCount = 0
      for (const [num, invs] of invoicesByNumber.entries()) {
        // Sort by creation date - keep the first one, reassign the rest
        invs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        
        // Keep the first occurrence, reassign the rest
        for (let i = 1; i < invs.length; i++) {
          const inv = invs[i]
          await db.collection('invoices').updateOne(
            { _id: inv._id },
            { $set: { invoiceNumber: nextInvoiceNumber } }
          )

          console.log(`  Fixed invoice ${inv._id}: ${num} → ${nextInvoiceNumber}`)
          nextInvoiceNumber++
          fixedCount++
        }
      }

      console.log(`Fixed ${fixedCount} duplicate invoice number(s) ✓`)

      // Update sequence counter to match the new highest number
      const newHighestInvoice = await db.collection('invoices')
        .find({ invoiceNumber: { $type: 'number' } })
        .sort({ invoiceNumber: -1 })
        .limit(1)
        .toArray()

      if (newHighestInvoice.length > 0) {
        const newHighest = (newHighestInvoice[0] as any).invoiceNumber
        await db.collection('counters').updateOne(
          { _id: 'invoiceNumber' },
          { $set: { seq: newHighest } },
          { upsert: true }
        )
        console.log(`Updated invoiceNumber sequence counter to ${newHighest} ✓`)
      }
    }

    // ===== FIX QUOTES =====
    console.log('\n=== FIXING QUOTE NUMBERS ===')
    
    // Get all quotes with quoteNumber
    const quotes = await db.collection('quotes')
      .find({ quoteNumber: { $type: 'number' } })
      .sort({ createdAt: 1 }) // Sort by creation date to maintain order
      .toArray()

    console.log(`Found ${quotes.length} quotes with quote numbers`)

    // Find duplicates
    const quoteNumberCounts = new Map<number, number>()
    quotes.forEach((q: any) => {
      const num = q.quoteNumber
      quoteNumberCounts.set(num, (quoteNumberCounts.get(num) || 0) + 1)
    })

    const duplicateQuoteNumbers = Array.from(quoteNumberCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([num, _]) => num)

    if (duplicateQuoteNumbers.length === 0) {
      console.log('No duplicate quote numbers found ✓')
    } else {
      console.log(`Found ${duplicateQuoteNumbers.length} duplicate quote number(s): ${duplicateQuoteNumbers.join(', ')}`)

      // Get the highest quote number
      const highestQuote = await db.collection('quotes')
        .find({ quoteNumber: { $type: 'number' } })
        .sort({ quoteNumber: -1 })
        .limit(1)
        .toArray()

      let nextQuoteNumber = highestQuote.length > 0 
        ? (highestQuote[0] as any).quoteNumber + 1
        : 500001

      console.log(`Starting reassignment from quote number: ${nextQuoteNumber}`)

      // Reassign duplicate quote numbers
      // Group quotes by quoteNumber to find duplicates
      const quotesByNumber = new Map<number, any[]>()
      quotes.forEach((q: any) => {
        if (duplicateQuoteNumbers.includes(q.quoteNumber)) {
          if (!quotesByNumber.has(q.quoteNumber)) {
            quotesByNumber.set(q.quoteNumber, [])
          }
          quotesByNumber.get(q.quoteNumber)!.push(q)
        }
      })

      let fixedCount = 0
      for (const [num, qs] of quotesByNumber.entries()) {
        // Sort by creation date - keep the first one, reassign the rest
        qs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        
        // Keep the first occurrence, reassign the rest
        for (let i = 1; i < qs.length; i++) {
          const q = qs[i]
          await db.collection('quotes').updateOne(
            { _id: q._id },
            { $set: { quoteNumber: nextQuoteNumber } }
          )

          console.log(`  Fixed quote ${q._id}: ${num} → ${nextQuoteNumber}`)
          nextQuoteNumber++
          fixedCount++
        }
      }

      console.log(`Fixed ${fixedCount} duplicate quote number(s) ✓`)

      // Update sequence counter to match the new highest number
      const newHighestQuote = await db.collection('quotes')
        .find({ quoteNumber: { $type: 'number' } })
        .sort({ quoteNumber: -1 })
        .limit(1)
        .toArray()

      if (newHighestQuote.length > 0) {
        const newHighest = (newHighestQuote[0] as any).quoteNumber
        await db.collection('counters').updateOne(
          { _id: 'quoteNumber' },
          { $set: { seq: newHighest } },
          { upsert: true }
        )
        console.log(`Updated quoteNumber sequence counter to ${newHighest} ✓`)
      }
    }

    console.log('\n✅ Migration completed successfully!')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

main()

