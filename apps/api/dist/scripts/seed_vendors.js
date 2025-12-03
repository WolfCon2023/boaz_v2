import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
async function main() {
    const db = await getDb();
    if (!db) {
        console.error('No DB connection; aborting vendors seed.');
        return;
    }
    const now = new Date();
    const vendors = [
        {
            _id: new ObjectId(),
            name: 'Wolf Consulting Group, LLC',
            legalName: 'Wolf Consulting Group, LLC',
            website: 'https://www.wolfconsultingnc.com',
            supportEmail: 'support@wolfconsultingnc.com',
            supportPhone: '',
            addressLine1: '',
            addressLine2: '',
            city: 'Raleigh',
            state: 'NC',
            postalCode: '',
            country: 'United States',
            status: 'Active',
            categories: ['Consulting', 'Back Office Applications ZoneOS'],
            notes: 'Publisher of BOAZ-OS and internal applications.',
            createdAt: now,
            updatedAt: now,
        },
        {
            _id: new ObjectId(),
            name: 'Microsoft',
            legalName: 'Microsoft Corporation',
            website: 'https://www.microsoft.com',
            supportEmail: '',
            supportPhone: '',
            addressLine1: '',
            addressLine2: '',
            city: 'Redmond',
            state: 'WA',
            postalCode: '',
            country: 'United States',
            status: 'Active',
            categories: ['Productivity', 'Cloud', 'Infrastructure'],
            notes: 'Microsoft 365, Azure, and related services.',
            createdAt: now,
            updatedAt: now,
        },
        {
            _id: new ObjectId(),
            name: 'Fortinet',
            legalName: 'Fortinet, Inc.',
            website: 'https://www.fortinet.com',
            supportEmail: '',
            supportPhone: '',
            addressLine1: '',
            addressLine2: '',
            city: 'Sunnyvale',
            state: 'CA',
            postalCode: '',
            country: 'United States',
            status: 'Active',
            categories: ['Security', 'Network'],
            notes: 'Next generation firewalls and security appliances.',
            createdAt: now,
            updatedAt: now,
        },
        {
            _id: new ObjectId(),
            name: 'Twilio',
            legalName: 'Twilio Inc.',
            website: 'https://www.twilio.com',
            supportEmail: '',
            supportPhone: '',
            addressLine1: '',
            addressLine2: '',
            city: 'San Francisco',
            state: 'CA',
            postalCode: '',
            country: 'United States',
            status: 'Active',
            categories: ['Telephony', 'Messaging'],
            notes: 'SMS, voice, and communications APIs.',
            createdAt: now,
            updatedAt: now,
        },
        {
            _id: new ObjectId(),
            name: 'Salesforce',
            legalName: 'Salesforce, Inc.',
            website: 'https://www.salesforce.com',
            supportEmail: '',
            supportPhone: '',
            addressLine1: '',
            addressLine2: '',
            city: 'San Francisco',
            state: 'CA',
            postalCode: '',
            country: 'United States',
            status: 'Active',
            categories: ['CRM', 'Cloud'],
            notes: 'CRM and customer platform provider.',
            createdAt: now,
            updatedAt: now,
        },
    ];
    // Check which vendors already exist by name
    const existingVendors = await db.collection('crm_vendors').find({}).toArray();
    const existingNames = new Set(existingVendors.map((v) => v.name));
    // Filter to only vendors that don't exist yet
    const vendorsToInsert = vendors.filter((v) => !existingNames.has(v.name));
    if (vendorsToInsert.length === 0) {
        console.log('All sample vendors already exist. No new vendors to insert.');
        return;
    }
    await db.collection('crm_vendors').insertMany(vendorsToInsert);
    console.log(`Inserted ${vendorsToInsert.length} new vendor(s) into crm_vendors.`);
    console.log(`Skipped ${vendors.length - vendorsToInsert.length} vendor(s) that already exist.`);
}
main().catch((err) => {
    console.error('Error seeding vendors:', err);
});
