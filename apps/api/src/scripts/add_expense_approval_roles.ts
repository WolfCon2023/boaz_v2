/**
 * Migration Script: Add Senior Manager and Finance Manager Roles
 * 
 * Adds the new expense approval roles to existing databases
 * Safe to run multiple times - will skip if roles already exist
 * 
 * Usage: npx tsx apps/api/src/scripts/add_expense_approval_roles.ts
 */

import { getDb } from '../db.js'

const SENIOR_MANAGER_ROLE = {
  name: 'senior_manager',
  permissions: [
    'users.read',
    'users.write',
    'roles.read',
    'expenses.approve_level1',
    'expenses.approve_level2',
  ],
}

const FINANCE_MANAGER_ROLE = {
  name: 'finance_manager',
  permissions: [
    'users.read',
    'users.write',
    'roles.read',
    'expenses.approve_level1',
    'expenses.approve_level2',
    'expenses.approve_level3',
    'expenses.final_approve',
  ],
}

async function addExpenseApprovalRoles() {
  console.log('🔧 Adding Senior Manager and Finance Manager roles...')

  const db = await getDb()
  if (!db) {
    console.error('❌ Database not available')
    process.exit(1)
  }

  try {
    // Check if Senior Manager role exists
    const seniorManagerExists = await db.collection('roles').findOne({ name: 'senior_manager' })
    if (seniorManagerExists) {
      console.log('ℹ️  Senior Manager role already exists, skipping...')
    } else {
      await db.collection('roles').insertOne(SENIOR_MANAGER_ROLE as any)
      console.log('✅ Senior Manager role added successfully')
    }

    // Check if Finance Manager role exists
    const financeManagerExists = await db.collection('roles').findOne({ name: 'finance_manager' })
    if (financeManagerExists) {
      console.log('ℹ️  Finance Manager role already exists, skipping...')
    } else {
      await db.collection('roles').insertOne(FINANCE_MANAGER_ROLE as any)
      console.log('✅ Finance Manager role added successfully')
    }

    console.log('\n📋 Current roles in database:')
    const allRoles = await db.collection('roles').find({}).toArray()
    allRoles.forEach((role: any) => {
      console.log(`   - ${role.name} (${role.permissions.length} permissions)`)
    })

    console.log('\n✅ Migration complete!')
  } catch (err) {
    console.error('❌ Error:', err)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

addExpenseApprovalRoles()
