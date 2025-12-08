/**
 * Cleanup Script: Remove Problematic Customer Portal User
 * 
 * Use this to remove a customer portal user by email
 * 
 * Usage:
 *   MONGO_URL="mongodb+srv://..." npx tsx apps/api/src/scripts/cleanup_customer_portal_user.ts <email>
 */

import { MongoClient } from 'mongodb'

async function getDb() {
  const mongoUrl = process.env.MONGO_URL
  if (!mongoUrl) {
    console.error('❌ MONGO_URL environment variable is not set')
    console.log('\nUsage:')
    console.log('  MONGO_URL="mongodb+srv://your-connection-string" npx tsx apps/api/src/scripts/cleanup_customer_portal_user.ts <email>')
    return null
  }
  
  try {
    const client = new MongoClient(mongoUrl)
    await client.connect()
    return client.db()
  } catch (err) {
    console.error('❌ Failed to connect to database:', err)
    return null
  }
}

async function removeCustomerPortalUser(email: string) {
  console.log(`🔧 Attempting to remove customer portal user: ${email}`)
  
  const db = await getDb()
  if (!db) {
    console.error('❌ Database not available')
    process.exit(1)
  }

  try {
    const user = await db.collection('customer_portal_users').findOne({ email: email.toLowerCase() })
    
    if (!user) {
      console.log('ℹ️  User not found in customer_portal_users collection')
      return
    }

    console.log('📋 User found:')
    console.log(`   - ID: ${user._id.toHexString()}`)
    console.log(`   - Email: ${user.email}`)
    console.log(`   - Name: ${user.name}`)
    console.log(`   - Email Verified: ${user.emailVerified || false}`)
    console.log(`   - Created: ${user.createdAt}`)
    
    const result = await db.collection('customer_portal_users').deleteOne({ _id: user._id })
    
    if (result.deletedCount > 0) {
      console.log('✅ User removed successfully')
    } else {
      console.log('❌ Failed to remove user')
    }
  } catch (err) {
    console.error('❌ Error:', err)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

// Get email from command line argument
const email = process.argv[2]

if (!email) {
  console.error('❌ Please provide an email address')
  console.log('Usage: npx tsx apps/api/src/scripts/cleanup_customer_portal_user.ts <email>')
  process.exit(1)
}

removeCustomerPortalUser(email)

