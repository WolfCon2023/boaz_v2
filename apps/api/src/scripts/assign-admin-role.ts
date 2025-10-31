#!/usr/bin/env ts-node
/**
 * Script to assign admin role to a user
 * Usage: 
 *   ts-node apps/api/src/scripts/assign-admin-role.ts <userEmail>
 *   OR
 *   ts-node apps/api/src/scripts/assign-admin-role.ts <userId>
 */

import { getDb } from '../db.js'
import { ObjectId } from 'mongodb'

async function assignAdminRole(userIdentifier: string) {
  const db = await getDb()
  if (!db) {
    console.error('❌ Database connection failed')
    process.exit(1)
  }

  try {
    // Try to find user by email first, then by ID
    let user: any = null
    let userId: string = ''

    // Try as ObjectId (user ID)
    try {
      const userIdObj = new ObjectId(userIdentifier)
      user = await db.collection('users').findOne({ _id: userIdObj })
      if (user) {
        userId = user._id.toString()
      }
    } catch {
      // Not a valid ObjectId, try as email
    }

    // If not found by ID, try by email
    if (!user) {
      user = await db.collection('users').findOne({ email: userIdentifier.toLowerCase() })
      if (user) {
        userId = user._id.toString()
      }
    }

    if (!user) {
      console.error(`❌ User not found: ${userIdentifier}`)
      process.exit(1)
    }

    console.log(`✅ Found user: ${user.email} (ID: ${userId})`)

    // Find admin role
    const adminRole = await db.collection('roles').findOne({ name: 'admin' })
    if (!adminRole) {
      console.error('❌ Admin role not found. Run ensureDefaultRoles first.')
      process.exit(1)
    }

    const roleId = adminRole._id.toString()
    console.log(`✅ Found admin role (ID: ${roleId})`)

    // Check if user already has admin role
    const existing = await db.collection('user_roles').findOne({ 
      userId: userId, 
      roleId: adminRole._id 
    })

    if (existing) {
      console.log('ℹ️  User already has admin role assigned.')
      process.exit(0)
    }

    // Assign admin role
    await db.collection('user_roles').insertOne({
      _id: new ObjectId(),
      userId: userId, // Store as string (matches JWT sub claim)
      roleId: adminRole._id, // Store as ObjectId
      createdAt: new Date()
    })

    console.log('✅ Admin role assigned successfully!')
    console.log(`   User: ${user.email}`)
    console.log(`   User ID: ${userId}`)
    console.log(`   Role ID: ${roleId}`)
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    console.error(error)
    process.exit(1)
  } finally {
    // Close connection if needed
    process.exit(0)
  }
}

// Get user identifier from command line
const userIdentifier = process.argv[2]

if (!userIdentifier) {
  console.error('Usage: ts-node assign-admin-role.ts <userEmail|userId>')
  console.error('Example: ts-node assign-admin-role.ts admin@example.com')
  console.error('Example: ts-node assign-admin-role.ts 507f1f77bcf86cd799439011')
  process.exit(1)
}

assignAdminRole(userIdentifier)

