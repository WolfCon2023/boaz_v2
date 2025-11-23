#!/usr/bin/env ts-node
/**
 * Simple helper script to create a new CRM contact directly in MongoDB.
 *
 * Usage (from repo root):
 *   cd apps/api
 *   npx ts-node src/scripts/create_contact.ts "Full Name" --email someone@example.com --company "Acme Corp" --mobile "555-123-4567"
 *
 * Only the name is required; all other fields are optional.
 */
import { getDb } from '../db.js';
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: ts-node src/scripts/create_contact.ts "Full Name" [--email addr] [--company name] [--mobile num] [--office num] [--primary mobile|office]');
        process.exit(1);
    }
    const name = args[0];
    if (!name || !name.trim()) {
        console.error('Contact name is required.');
        process.exit(1);
    }
    // Very small flag parser
    let email;
    let company;
    let mobilePhone;
    let officePhone;
    let primaryPhone;
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        if (arg === '--email' && next) {
            email = next;
            i++;
        }
        else if (arg === '--company' && next) {
            company = next;
            i++;
        }
        else if (arg === '--mobile' && next) {
            mobilePhone = next;
            i++;
        }
        else if (arg === '--office' && next) {
            officePhone = next;
            i++;
        }
        else if (arg === '--primary' && next && (next === 'mobile' || next === 'office')) {
            primaryPhone = next;
            i++;
        }
    }
    const db = await getDb();
    if (!db) {
        console.error('❌ Database connection failed (check MONGO_URL / env).');
        process.exit(1);
    }
    const doc = {
        name: name.trim(),
        company: company ?? undefined,
        email: email ?? undefined,
        mobilePhone: mobilePhone ?? undefined,
        officePhone: officePhone ?? undefined,
        isPrimary: false,
        primaryPhone: primaryPhone ?? undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const result = await db.collection('contacts').insertOne(doc);
    console.log('✅ Created contact:');
    console.log({
        _id: result.insertedId.toString(),
        ...doc,
    });
    process.exit(0);
}
main().catch((err) => {
    console.error('❌ Error creating contact:', err);
    process.exit(1);
});
