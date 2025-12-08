/**
 * Migration Script: Add IT and IT Manager Roles
 *
 * Adds the new IT and IT Manager roles to existing databases
 * Safe to run multiple times - will skip if roles already exist
 *
 * Usage: npx tsx apps/api/src/scripts/add_it_roles.ts
 */
import { getDb } from '../db.js';
const IT_ROLE = {
    name: 'it',
    permissions: [
        'support.read',
        'support.write',
        'kb.read',
        'kb.write',
        'assets.read',
        'assets.write',
        'vendors.read',
        'vendors.write',
        'projects.read',
        'slas.read',
        'contacts.read',
        'accounts.read',
        'products.read',
    ],
};
const IT_MANAGER_ROLE = {
    name: 'it_manager',
    permissions: [
        'support.read',
        'support.write',
        'kb.read',
        'kb.write',
        'assets.read',
        'assets.write',
        'vendors.read',
        'vendors.write',
        'projects.read',
        'slas.read',
        'slas.write',
        'contacts.read',
        'accounts.read',
        'products.read',
        'users.read',
        'roles.read',
        'quotes.read',
        'quotes.approve',
        'invoices.read',
        'deals.read',
        'renewals.read',
    ],
};
async function addITRoles() {
    console.log('🔧 Adding IT and IT Manager roles...');
    const db = await getDb();
    if (!db) {
        console.error('❌ Database not available');
        process.exit(1);
    }
    try {
        // Check if IT role exists
        const itRoleExists = await db.collection('roles').findOne({ name: 'it' });
        if (itRoleExists) {
            console.log('ℹ️  IT role already exists, skipping...');
        }
        else {
            await db.collection('roles').insertOne(IT_ROLE);
            console.log('✅ IT role added successfully');
        }
        // Check if IT Manager role exists
        const itManagerRoleExists = await db.collection('roles').findOne({ name: 'it_manager' });
        if (itManagerRoleExists) {
            console.log('ℹ️  IT Manager role already exists, skipping...');
        }
        else {
            await db.collection('roles').insertOne(IT_MANAGER_ROLE);
            console.log('✅ IT Manager role added successfully');
        }
        console.log('\n📋 Current roles in database:');
        const allRoles = await db.collection('roles').find({}).toArray();
        allRoles.forEach((role) => {
            console.log(`   - ${role.name} (${role.permissions.length} permissions)`);
        });
        console.log('\n✅ Migration complete!');
    }
    catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
    finally {
        process.exit(0);
    }
}
addITRoles();
