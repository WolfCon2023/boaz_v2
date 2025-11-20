import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'

async function main() {
  const db = await getDb()
  if (!db) {
    console.error('No DB connection; aborting assets seed.')
    return
  }

  const account = await db.collection('accounts').findOne({}, { projection: { _id: 1, name: 1, accountNumber: 1 } })
  if (!account) {
    console.error('No accounts found. Create at least one CRM account before seeding assets.')
    return
  }

  const customerId = String(account._id)
  console.log('Seeding Assets / Installed Base for account:', customerId, account.name ?? '(no name)')

  const now = new Date()

  // Create sample environments
  const envProdId = new ObjectId().toHexString()
  const envUatId = new ObjectId().toHexString()
  const envStoreId = new ObjectId().toHexString()

  const environments = [
    {
      _id: envProdId,
      customerId,
      name: 'Production Tenant',
      environmentType: 'Production',
      location: 'Azure – East US',
      status: 'Active',
      notes: 'Primary production tenant for this customer.',
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: envUatId,
      customerId,
      name: 'UAT Tenant',
      environmentType: 'UAT',
      location: 'Azure – East US',
      status: 'Active',
      notes: 'Used for user acceptance testing prior to go‑live.',
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: envStoreId,
      customerId,
      name: 'Store #101 – POS',
      environmentType: 'Retail Store',
      location: 'Store #101 – Charlotte, NC',
      status: 'Active',
      notes: 'Local POS terminals and Wi‑Fi infrastructure.',
      createdAt: now,
      updatedAt: now,
    },
  ]

  await db.collection('assets_environments').insertMany(environments as any[])
  console.log(`Inserted ${environments.length} environments.`)

  // Create sample installed products
  const products = [
    {
      _id: new ObjectId().toHexString(),
      customerId,
      environmentId: envProdId,
      productName: 'Microsoft 365 E5',
      productType: 'Cloud Service',
      vendor: 'Microsoft',
      version: 'E5',
      serialNumber: null,
      configuration: {
        tenantDomain: 'example.onmicrosoft.com',
        licenses: 250,
      },
      deploymentDate: now,
      status: 'Active',
      supportLevel: 'Premium',
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: new ObjectId().toHexString(),
      customerId,
      environmentId: envProdId,
      productName: 'Fortinet Next‑Gen Firewall Cluster',
      productType: 'Hardware',
      vendor: 'Fortinet',
      version: '7.x',
      serialNumber: 'FGT-ABC123456',
      configuration: {
        haMode: 'Active/Passive',
        vpnTunnels: 12,
      },
      deploymentDate: now,
      status: 'Active',
      supportLevel: 'Standard',
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: new ObjectId().toHexString(),
      customerId,
      environmentId: envUatId,
      productName: 'Line‑of‑Business App – UAT',
      productType: 'Software',
      vendor: 'Wolf Consulting Group',
      version: '2.3.0‑rc1',
      serialNumber: null,
      configuration: {
        dbServer: 'sql-uat.internal',
        features: ['Reporting', 'AP Automation'],
      },
      deploymentDate: now,
      status: 'Needs Upgrade',
      supportLevel: 'Standard',
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: new ObjectId().toHexString(),
      customerId,
      environmentId: envStoreId,
      productName: 'Retail POS Bundle',
      productType: 'Subscription',
      vendor: 'Wolf Consulting Group',
      version: '1.8',
      serialNumber: null,
      configuration: {
        terminals: 4,
        peripherals: ['Receipt printer', 'Barcode scanner'],
      },
      deploymentDate: now,
      status: 'Pending Renewal',
      supportLevel: 'Premium',
      createdAt: now,
      updatedAt: now,
    },
  ]

  await db.collection('assets_products').insertMany(products as any[])
  console.log(`Inserted ${products.length} installed products.`)

  console.log('Assets / Installed Base seed complete.')
}

main().catch((err) => {
  console.error('Error seeding assets:', err)
})


