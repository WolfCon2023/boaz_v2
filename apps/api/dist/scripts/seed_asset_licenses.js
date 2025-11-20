import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
async function main() {
    const db = await getDb();
    if (!db) {
        console.error('No DB connection; aborting asset license seed.');
        return;
    }
    const account = await db.collection('accounts').findOne({}, { projection: { _id: 1, name: 1, accountNumber: 1 } });
    if (!account) {
        console.error('No accounts found. Create at least one CRM account before seeding licenses.');
        return;
    }
    const customerId = String(account._id);
    console.log('Seeding asset licenses for account:', customerId, account.name ?? '(no name)');
    const products = await db
        .collection('assets_products')
        .find({ customerId })
        .project({ _id: 1, productName: 1 })
        .toArray();
    if (!products.length) {
        console.error('No installed products found for this account. Run seed_assets.ts first.');
        return;
    }
    const byName = new Map();
    for (const p of products) {
        byName.set(p.productName, p._id);
    }
    const docs = [];
    const now = new Date();
    const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const in45 = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
    const m365Id = byName.get('Microsoft 365 E5');
    if (m365Id) {
        const existing = await db.collection('assets_licenses').countDocuments({ productId: m365Id });
        if (!existing) {
            docs.push({
                _id: new ObjectId().toHexString(),
                productId: m365Id,
                licenseType: 'Subscription',
                licenseIdentifier: 'M365-E5-ACME',
                licenseKey: undefined,
                licenseCount: 250,
                seatsAssigned: 230,
                expirationDate: in90,
                renewalStatus: 'Active',
                cost: 7500,
                assignedUsers: [],
                createdAt: now,
                updatedAt: now,
            });
        }
    }
    const fwId = byName.get('Fortinet Next‑Gen Firewall Cluster');
    if (fwId) {
        const existing = await db.collection('assets_licenses').countDocuments({ productId: fwId });
        if (!existing) {
            docs.push({
                _id: new ObjectId().toHexString(),
                productId: fwId,
                licenseType: 'Perpetual',
                licenseIdentifier: 'FGT-HA-2NODE',
                licenseKey: 'FGT-ABC1-DEF2-GHI3-JKL4',
                licenseCount: 2,
                seatsAssigned: 2,
                expirationDate: null,
                renewalStatus: 'Active',
                cost: 12000,
                assignedUsers: [],
                createdAt: now,
                updatedAt: now,
            });
        }
    }
    const lobId = byName.get('Line‑of‑Business App – UAT');
    if (lobId) {
        const existing = await db.collection('assets_licenses').countDocuments({ productId: lobId });
        if (!existing) {
            docs.push({
                _id: new ObjectId().toHexString(),
                productId: lobId,
                licenseType: 'Seat-based',
                licenseIdentifier: 'LOB-UAT-50',
                licenseKey: undefined,
                licenseCount: 50,
                seatsAssigned: 30,
                expirationDate: in45,
                renewalStatus: 'Pending Renewal',
                cost: 2500,
                assignedUsers: [],
                createdAt: now,
                updatedAt: now,
            });
        }
    }
    const posId = byName.get('Retail POS Bundle');
    if (posId) {
        const existing = await db.collection('assets_licenses').countDocuments({ productId: posId });
        if (!existing) {
            docs.push({
                _id: new ObjectId().toHexString(),
                productId: posId,
                licenseType: 'Device-based',
                licenseIdentifier: 'POS-STORE-101',
                licenseKey: undefined,
                licenseCount: 4,
                seatsAssigned: 4,
                expirationDate: in90,
                renewalStatus: 'Pending Renewal',
                cost: 1800,
                assignedUsers: [],
                createdAt: now,
                updatedAt: now,
            });
        }
    }
    if (!docs.length) {
        console.log('No new licenses to insert (they may already exist).');
        return;
    }
    await db.collection('assets_licenses').insertMany(docs);
    console.log(`Inserted ${docs.length} asset license(s).`);
}
main().catch((err) => {
    console.error('Error seeding asset licenses:', err);
});
