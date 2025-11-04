import { MongoClient } from 'mongodb'
import 'dotenv/config'

async function main() {
  const url = process.env.MONGO_URL
  if (!url) {
    console.error('MONGO_URL not set')
    process.exit(1)
  }
  const client = new MongoClient(url)
  await client.connect()
  const db = client.db()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  await db.collection('appointments').deleteMany({})
  await db.collection('tasks').deleteMany({})
  await db.collection('contacts').deleteMany({})
  // Delete seed accounts only (by name) to avoid sequence counter issues
  await db.collection('accounts').deleteMany({ name: { $in: ['Acme Corp', 'Globex', 'Initech'] } })
  await db.collection('deals').deleteMany({})
  await db.collection('activities').deleteMany({})

  await db.collection('appointments').insertMany([
    { title: 'Intro call', startsAt: new Date(today.getTime() + 60 * 60 * 1000) },
    { title: 'Demo', startsAt: new Date(today.getTime() + 3 * 60 * 60 * 1000) },
  ])

  await db.collection('tasks').insertMany([
    { title: 'Prepare proposal', dueAt: new Date(today.getTime() + 2 * 60 * 60 * 1000), status: 'todo' },
    { title: 'Send invoice', dueAt: new Date(today.getTime() + 4 * 60 * 60 * 1000), status: 'in_progress' },
    { title: 'Follow-up email', completedAt: new Date(today.getTime() + 30 * 60 * 1000), status: 'done' },
  ])

  await db.collection('contacts').insertMany([
    { name: 'Ada Lovelace', email: 'ada@example.com', company: 'Analytical Engines' },
    { name: 'Grace Hopper', email: 'grace@example.com', company: 'US Navy' },
    { name: 'Alan Turing', email: 'alan@example.com', company: 'Bletchley Park' },
    { name: 'Katherine Johnson', email: 'katherine@example.com', company: 'NASA' },
  ])

  // Accounts - check if seed accounts already exist, if not create them
  const existingAcme = await db.collection('accounts').findOne({ name: 'Acme Corp' })
  const existingGlobex = await db.collection('accounts').findOne({ name: 'Globex' })
  const existingInitech = await db.collection('accounts').findOne({ name: 'Initech' })
  
  let acmeId: any
  let globexId: any
  
  if (existingAcme && existingGlobex && existingInitech) {
    // All seed accounts exist, use their IDs
    acmeId = existingAcme._id
    globexId = existingGlobex._id
    console.log('Seed accounts already exist, using existing accounts')
  } else {
    // Create missing seed accounts
    try {
      const { getNextSequence } = await import('../src/db.js')
      
      // Find the highest existing account number to avoid conflicts
      const highestAccount = await db
        .collection('accounts')
        .find({ accountNumber: { $type: 'number' } })
        .project({ accountNumber: 1 })
        .sort({ accountNumber: -1 })
        .limit(1)
        .toArray()
      const highestNum = highestAccount.length > 0 ? Number((highestAccount[0] as any)?.accountNumber ?? 998800) : 998800
      
      const accountsToInsert: Array<{ name: string; domain: string; industry: string; accountNumber: number }> = []
      let nextNum = highestNum + 1
      
      if (!existingAcme) {
        // Try to get from sequence, but if it's lower than our calculated number, use calculated
        try {
          const seqNum = await getNextSequence('accountNumber')
          accountsToInsert.push({ name: 'Acme Corp', domain: 'acme.com', industry: 'Manufacturing', accountNumber: Math.max(seqNum, nextNum) })
          nextNum = Math.max(seqNum, nextNum) + 1
        } catch {
          accountsToInsert.push({ name: 'Acme Corp', domain: 'acme.com', industry: 'Manufacturing', accountNumber: nextNum++ })
        }
      }
      if (!existingGlobex) {
        try {
          const seqNum = await getNextSequence('accountNumber')
          accountsToInsert.push({ name: 'Globex', domain: 'globex.com', industry: 'Technology', accountNumber: Math.max(seqNum, nextNum) })
          nextNum = Math.max(seqNum, nextNum) + 1
        } catch {
          accountsToInsert.push({ name: 'Globex', domain: 'globex.com', industry: 'Technology', accountNumber: nextNum++ })
        }
      }
      if (!existingInitech) {
        try {
          const seqNum = await getNextSequence('accountNumber')
          accountsToInsert.push({ name: 'Initech', domain: 'initech.com', industry: 'Software', accountNumber: Math.max(seqNum, nextNum) })
          nextNum = Math.max(seqNum, nextNum) + 1
        } catch {
          accountsToInsert.push({ name: 'Initech', domain: 'initech.com', industry: 'Software', accountNumber: nextNum++ })
        }
      }
      
      if (accountsToInsert.length > 0) {
        const accounts = await db.collection('accounts').insertMany(accountsToInsert)
        console.log(`Created ${accountsToInsert.length} seed account(s)`)
      }
      
      // Get IDs (either from existing or newly inserted)
      const acme = existingAcme || await db.collection('accounts').findOne({ name: 'Acme Corp' })
      const globex = existingGlobex || await db.collection('accounts').findOne({ name: 'Globex' })
      acmeId = acme?._id
      globexId = globex?._id
    } catch (err) {
      console.error('Error creating seed accounts:', err)
      // Try to get existing accounts as fallback
      const acme = await db.collection('accounts').findOne({ name: 'Acme Corp' })
      const globex = await db.collection('accounts').findOne({ name: 'Globex' })
      acmeId = acme?._id
      globexId = globex?._id
      if (!acmeId || !globexId) {
        console.warn('Could not create or find seed accounts, some seed data may be incomplete')
      }
    }
  }

  // Deals
  await db.collection('deals').insertMany([
    { title: 'ACME ERP rollout', accountId: acmeId, amount: 125000, stage: 'negotiation', closeDate: new Date(Date.now() + 14*24*60*60*1000) },
    { title: 'Globex CRM expansion', accountId: globexId, amount: 78000, stage: 'proposal', closeDate: new Date(Date.now() + 30*24*60*60*1000) },
  ])

  // Quotes
  await db.collection('quotes').deleteMany({})
  await db.collection('quotes').insertMany([
    { title: 'ACME ERP Phase 1', accountId: acmeId, items: [], subtotal: 100000, tax: 7000, total: 107000, status: 'Draft', version: 1, createdAt: new Date(), updatedAt: new Date() },
    { title: 'Globex CRM Add-ons', accountId: globexId, items: [], subtotal: 60000, tax: 4200, total: 64200, status: 'Submitted for Review', version: 1, createdAt: new Date(), updatedAt: new Date() },
  ])

  // Activities
  await db.collection('activities').insertMany([
    { type: 'call', subject: 'Discovery call', accountId: acmeId, at: new Date() },
    { type: 'email', subject: 'Send proposal', accountId: globexId, at: new Date() },
  ])

  // Invoices
  await db.collection('invoices').deleteMany({})
  const now = new Date()
  await db.collection('invoices').insertMany([
    { title: 'ACME Invoice Jan', accountId: acmeId, items: [], subtotal: 1000, tax: 70, total: 1070, balance: 1070, currency: 'USD', status: 'open', dueDate: new Date(Date.now()+7*24*60*60*1000), issuedAt: now, paidAt: null, createdAt: now, updatedAt: now, payments: [], refunds: [] },
    { title: 'Globex Invoice Q1', accountId: globexId, items: [], subtotal: 15000, tax: 1050, total: 16050, balance: 16050, currency: 'USD', status: 'draft', dueDate: new Date(Date.now()+30*24*60*60*1000), issuedAt: now, paidAt: null, createdAt: now, updatedAt: now, payments: [], refunds: [] },
  ])

  // Outreach events sample
  await db.collection('outreach_events').deleteMany({})
  await db.collection('outreach_events').insertMany([
    { channel: 'email', event: 'sent', recipient: 'john@example.com', at: new Date() },
    { channel: 'email', event: 'opened', recipient: 'john@example.com', at: new Date() },
    { channel: 'sms', event: 'delivered', recipient: '+15555550123', at: new Date() },
  ])

  // Indexes - create only if they don't exist to avoid conflicts
  try {
    await db.collection('contacts').createIndexes([
      { key: { email: 1 }, unique: false },
      { key: { name: 1 } },
    ])
  } catch (err: any) {
    if (err.code !== 86) { // Ignore IndexKeySpecsConflict errors
      console.warn('Could not create contacts indexes:', err)
    }
  }
  try {
    await db.collection('accounts').createIndexes([
      { key: { name: 1 } },
      { key: { domain: 1 }, unique: false },
    ])
  } catch (err: any) {
    if (err.code !== 86) {
      console.warn('Could not create accounts indexes:', err)
    }
  }
  try {
    await db.collection('deals').createIndexes([
      { key: { stage: 1 } },
      { key: { accountId: 1 } },
      { key: { closeDate: -1 } },
    ])
  } catch (err: any) {
    if (err.code !== 86) {
      console.warn('Could not create deals indexes:', err)
    }
  }
  try {
    await db.collection('activities').createIndexes([
      { key: { accountId: 1 } },
      { key: { at: -1 } },
    ])
  } catch (err: any) {
    if (err.code !== 86) {
      console.warn('Could not create activities indexes:', err)
    }
  }

  // Products - seed only if collection is empty
  const productCount = await db.collection('products').countDocuments()
  let productIds: any[] = []
  console.log(`Products collection has ${productCount} items`)
  
  if (productCount === 0) {
    const now = new Date()
    await db.collection('products').insertMany([
      // Consulting Services
      {
        sku: 'SRV-CON-001',
        name: 'Strategic Planning Consultation',
        description: 'Comprehensive strategic planning session including business analysis, goal setting, and roadmap development.',
        type: 'service',
        basePrice: 2500.00,
        currency: 'USD',
        cost: 800.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Consulting',
        tags: ['strategy', 'planning', 'enterprise'],
        createdAt: now,
        updatedAt: now,
      },
      {
        sku: 'SRV-CON-002',
        name: 'Business Process Optimization',
        description: 'Analysis and optimization of existing business processes to improve efficiency and reduce costs.',
        type: 'service',
        basePrice: 3500.00,
        currency: 'USD',
        cost: 1200.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Consulting',
        tags: ['optimization', 'process', 'efficiency'],
        createdAt: now,
        updatedAt: now,
      },
      {
        sku: 'SRV-CON-003',
        name: 'Digital Transformation Assessment',
        description: 'Comprehensive assessment of current technology stack and recommendations for digital transformation.',
        type: 'service',
        basePrice: 5000.00,
        currency: 'USD',
        cost: 1800.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Consulting',
        tags: ['digital', 'transformation', 'technology'],
        createdAt: now,
        updatedAt: now,
      },
      // Software Products
      {
        sku: 'PROD-CRM-001',
        name: 'CRM Professional License',
        description: 'Full-featured CRM system license for professional use. Includes contacts, deals, and pipeline management.',
        type: 'product',
        basePrice: 99.00,
        currency: 'USD',
        cost: 25.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Software',
        tags: ['crm', 'software', 'subscription'],
        createdAt: now,
        updatedAt: now,
      },
      {
        sku: 'PROD-CRM-002',
        name: 'CRM Enterprise License',
        description: 'Enterprise CRM license with advanced features, custom integrations, and priority support.',
        type: 'product',
        basePrice: 299.00,
        currency: 'USD',
        cost: 75.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Software',
        tags: ['crm', 'enterprise', 'subscription'],
        createdAt: now,
        updatedAt: now,
      },
      {
        sku: 'PROD-ANALYTICS-001',
        name: 'Business Analytics Dashboard',
        description: 'Advanced analytics and reporting dashboard with real-time data visualization and insights.',
        type: 'product',
        basePrice: 199.00,
        currency: 'USD',
        cost: 50.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Software',
        tags: ['analytics', 'reporting', 'dashboard'],
        createdAt: now,
        updatedAt: now,
      },
      // Support Services
      {
        sku: 'SRV-SUP-001',
        name: 'Basic Support Plan',
        description: 'Basic support plan with email support, business hours coverage, and access to knowledge base.',
        type: 'service',
        basePrice: 199.00,
        currency: 'USD',
        cost: 100.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Support',
        tags: ['support', 'basic', 'monthly'],
        createdAt: now,
        updatedAt: now,
      },
      {
        sku: 'SRV-SUP-002',
        name: 'Premium Support Plan',
        description: 'Premium support plan with 24/7 phone and email support, priority ticket handling, and dedicated account manager.',
        type: 'service',
        basePrice: 499.00,
        currency: 'USD',
        cost: 250.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Support',
        tags: ['support', 'premium', 'monthly'],
        createdAt: now,
        updatedAt: now,
      },
      {
        sku: 'SRV-SUP-003',
        name: 'Enterprise Support Plan',
        description: 'Enterprise support plan with dedicated support team, SLA guarantees, on-site support, and custom training.',
        type: 'service',
        basePrice: 1299.00,
        currency: 'USD',
        cost: 650.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Support',
        tags: ['support', 'enterprise', 'monthly'],
        createdAt: now,
        updatedAt: now,
      },
      // Training Services
      {
        sku: 'SRV-TRN-001',
        name: 'User Training Workshop',
        description: 'On-site or virtual training workshop for end users. Includes materials and hands-on exercises.',
        type: 'service',
        basePrice: 1500.00,
        currency: 'USD',
        cost: 600.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Training',
        tags: ['training', 'workshop', 'users'],
        createdAt: now,
        updatedAt: now,
      },
      {
        sku: 'SRV-TRN-002',
        name: 'Administrator Training',
        description: 'Comprehensive training for system administrators. Covers configuration, customization, and maintenance.',
        type: 'service',
        basePrice: 2500.00,
        currency: 'USD',
        cost: 1000.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Training',
        tags: ['training', 'admin', 'technical'],
        createdAt: now,
        updatedAt: now,
      },
      {
        sku: 'SRV-TRN-003',
        name: 'Custom Training Program',
        description: 'Customized training program tailored to your organization\'s specific needs and workflows.',
        type: 'service',
        basePrice: 4500.00,
        currency: 'USD',
        cost: 1800.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Training',
        tags: ['training', 'custom', 'enterprise'],
        createdAt: now,
        updatedAt: now,
      },
      // Implementation Services
      {
        sku: 'SRV-IMP-001',
        name: 'Standard Implementation',
        description: 'Standard implementation service including setup, configuration, data migration, and go-live support.',
        type: 'service',
        basePrice: 7500.00,
        currency: 'USD',
        cost: 3000.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Implementation',
        tags: ['implementation', 'setup', 'migration'],
        createdAt: now,
        updatedAt: now,
      },
      {
        sku: 'SRV-IMP-002',
        name: 'Enterprise Implementation',
        description: 'Comprehensive enterprise implementation with custom integrations, advanced configuration, and dedicated project manager.',
        type: 'service',
        basePrice: 25000.00,
        currency: 'USD',
        cost: 10000.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Implementation',
        tags: ['implementation', 'enterprise', 'custom'],
        createdAt: now,
        updatedAt: now,
      },
      // Integration Services
      {
        sku: 'SRV-INT-001',
        name: 'API Integration Service',
        description: 'Custom API integration service to connect your systems with third-party applications.',
        type: 'service',
        basePrice: 3500.00,
        currency: 'USD',
        cost: 1400.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Integration',
        tags: ['integration', 'api', 'custom'],
        createdAt: now,
        updatedAt: now,
      },
      {
        sku: 'SRV-INT-002',
        name: 'Data Migration Service',
        description: 'Professional data migration service from legacy systems with data cleansing and validation.',
        type: 'service',
        basePrice: 5000.00,
        currency: 'USD',
        cost: 2000.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Integration',
        tags: ['migration', 'data', 'legacy'],
        createdAt: now,
        updatedAt: now,
      },
      // Custom Development
      {
        sku: 'SRV-DEV-001',
        name: 'Custom Development (Hourly)',
        description: 'Custom software development and customization services billed on an hourly basis.',
        type: 'service',
        basePrice: 150.00,
        currency: 'USD',
        cost: 75.00,
        taxRate: 8.5,
        isActive: true,
        category: 'Development',
        tags: ['development', 'custom', 'hourly'],
        createdAt: now,
        updatedAt: now,
      },
    ])
    const insertedCount = await db.collection('products').countDocuments()
    console.log(`Seeded ${insertedCount} products`)
  } else {
    console.log(`Products collection already has ${productCount} items, skipping seed`)
  }
  
  // Get product IDs for bundles
  const products = await db.collection('products').find({}).toArray()
  productIds = products.map(p => p._id)
  console.log(`Found ${productIds.length} products for bundles`)
  
  // Bundles - seed only if collection is empty
  const bundleCount = await db.collection('bundles').countDocuments()
  console.log(`Bundles collection has ${bundleCount} items`)
  if (bundleCount === 0 && productIds.length >= 3) {
    const now = new Date()
    // Find products by SKU for bundles
    const crmPro = products.find(p => p.sku === 'PROD-CRM-001')
    const crmEnt = products.find(p => p.sku === 'PROD-CRM-002')
    const supBasic = products.find(p => p.sku === 'SRV-SUP-001')
    const supPremium = products.find(p => p.sku === 'SRV-SUP-002')
    const trainUser = products.find(p => p.sku === 'SRV-TRN-001')
    const trainAdmin = products.find(p => p.sku === 'SRV-TRN-002')
    const implStandard = products.find(p => p.sku === 'SRV-IMP-001')
    
    console.log('Product lookups:', {
      crmPro: !!crmPro,
      crmEnt: !!crmEnt,
      supBasic: !!supBasic,
      supPremium: !!supPremium,
      trainUser: !!trainUser,
      trainAdmin: !!trainAdmin,
      implStandard: !!implStandard,
    })
    
    await db.collection('bundles').insertMany([
      {
        sku: 'BUNDLE-001',
        name: 'Complete CRM Package',
        description: 'Complete CRM solution including Professional License, Basic Support, and User Training Workshop.',
        items: [
          ...(crmPro ? [{ productId: crmPro._id, quantity: 1 }] : []),
          ...(supBasic ? [{ productId: supBasic._id, quantity: 1 }] : []),
          ...(trainUser ? [{ productId: trainUser._id, quantity: 1 }] : []),
        ],
        bundlePrice: 1997.00, // Discounted from ~$2198
        currency: 'USD',
        isActive: true,
        category: 'Software',
        tags: ['crm', 'bundle', 'starter'],
        createdAt: now,
        updatedAt: now,
      },
      {
        sku: 'BUNDLE-002',
        name: 'Enterprise Solution Bundle',
        description: 'Enterprise-grade solution including Enterprise CRM, Premium Support, Administrator Training, and Standard Implementation.',
        items: [
          ...(crmEnt ? [{ productId: crmEnt._id, quantity: 1 }] : []),
          ...(supPremium ? [{ productId: supPremium._id, quantity: 1 }] : []),
          ...(trainAdmin ? [{ productId: trainAdmin._id, quantity: 1 }] : []),
          ...(implStandard ? [{ productId: implStandard._id, quantity: 1 }] : []),
        ],
        bundlePrice: 34997.00, // Discounted from ~$38,499
        currency: 'USD',
        isActive: true,
        category: 'Software',
        tags: ['enterprise', 'bundle', 'comprehensive'],
        createdAt: now,
        updatedAt: now,
      },
      {
        sku: 'BUNDLE-003',
        name: 'Training & Support Bundle',
        description: 'Training and support package including User Training, Administrator Training, and Premium Support Plan.',
        items: [
          ...(trainUser ? [{ productId: trainUser._id, quantity: 1 }] : []),
          ...(trainAdmin ? [{ productId: trainAdmin._id, quantity: 1 }] : []),
          ...(supPremium ? [{ productId: supPremium._id, quantity: 1 }] : []),
        ],
        bundlePrice: 3997.00, // Discounted from ~$4,499
        currency: 'USD',
        isActive: true,
        category: 'Support',
        tags: ['training', 'support', 'bundle'],
        createdAt: now,
        updatedAt: now,
      },
    ])
    console.log('Seeded 3 bundles')
  } else {
    if (bundleCount > 0) {
      console.log(`Bundles collection already has ${bundleCount} items, skipping seed`)
    } else {
      console.log(`Not enough products (${productIds.length}) to create bundles, need at least 3`)
    }
  }
  
  // Get bundle IDs for discounts
  const bundles = await db.collection('bundles').find({}).toArray()
  const bundleIds = bundles.map(b => b._id)
  console.log(`Found ${bundleIds.length} bundles for discounts`)
  
  // Discounts - seed only if collection is empty
  const discountCount = await db.collection('discounts').countDocuments()
  console.log(`Discounts collection has ${discountCount} items`)
  if (discountCount === 0 && productIds.length > 0) {
    const now = new Date()
    const nextMonth = new Date(now)
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    const nextYear = new Date(now)
    nextYear.setFullYear(nextYear.getFullYear() + 1)
    
    await db.collection('discounts').insertMany([
      {
        code: 'WELCOME10',
        name: 'Welcome Discount',
        description: '10% off for new customers',
        type: 'percentage',
        value: 10,
        scope: 'global',
        minAmount: 100,
        maxDiscount: 1000,
        startDate: now,
        endDate: nextYear,
        isActive: true,
        usageLimit: 100,
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        code: 'BULK20',
        name: 'Bulk Purchase Discount',
        description: '20% off on orders over $5,000',
        type: 'percentage',
        value: 20,
        scope: 'global',
        minAmount: 5000,
        maxDiscount: 5000,
        startDate: now,
        endDate: nextYear,
        isActive: true,
        usageLimit: 50,
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        code: 'Q1SALE',
        name: 'Q1 Sale',
        description: '15% off all software products',
        type: 'percentage',
        value: 15,
        scope: 'product',
        productIds: products.filter(p => p.category === 'Software').map(p => p._id).slice(0, 3),
        startDate: now,
        endDate: nextMonth,
        isActive: true,
        usageLimit: 200,
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        code: 'SUPPORT50',
        name: 'Support Plan Discount',
        description: '$50 off support plans',
        type: 'fixed',
        value: 50,
        scope: 'product',
        productIds: products.filter(p => p.category === 'Support').map(p => p._id).slice(0, 3),
        minAmount: 199,
        startDate: now,
        endDate: nextYear,
        isActive: true,
        usageLimit: 100,
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        code: 'ENTERPRISE',
        name: 'Enterprise Account Discount',
        description: '10% discount for enterprise accounts',
        type: 'percentage',
        value: 10,
        scope: 'account',
        accountIds: acmeId && globexId ? [acmeId, globexId] : [],
        startDate: now,
        endDate: nextYear,
        isActive: true,
        usageLimit: null,
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        code: 'BUNDLE5',
        name: 'Bundle Discount',
        description: '5% off all bundles',
        type: 'percentage',
        value: 5,
        scope: 'bundle',
        bundleIds: bundleIds.slice(0, 3),
        startDate: now,
        endDate: nextYear,
        isActive: true,
        usageLimit: 50,
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    ])
    console.log('Seeded 6 discounts')
  } else {
    if (discountCount > 0) {
      console.log(`Discounts collection already has ${discountCount} items, skipping seed`)
    } else {
      console.log(`No products available (${productIds.length}) to create discounts`)
    }
  }
  
  // Custom Terms - seed only if collection is empty
  const termsCount = await db.collection('custom_terms').countDocuments()
  console.log(`Terms collection has ${termsCount} items`)
  if (termsCount === 0) {
    const now = new Date()
    await db.collection('custom_terms').insertMany([
      {
        name: 'Standard Terms and Conditions',
        description: 'Default terms for all quotes and invoices',
        content: `TERMS AND CONDITIONS

1. PAYMENT TERMS
   - Payment is due within 30 days of invoice date.
   - Late payments may incur a 1.5% monthly interest charge.
   - All prices are in USD unless otherwise specified.

2. DELIVERY AND PERFORMANCE
   - Services will be performed in accordance with the agreed scope of work.
   - Deliverables will be provided within the specified timeframe.
   - Client is responsible for providing necessary access and information.

3. WARRANTIES
   - Services are provided "as is" without warranties of any kind.
   - We warrant that services will be performed in a professional manner.

4. INTELLECTUAL PROPERTY
   - All work product remains the property of the service provider until full payment is received.
   - Upon payment, client receives a license to use the work product as specified.

5. LIMITATION OF LIABILITY
   - Our liability is limited to the amount paid for the specific service.
   - We are not liable for indirect, incidental, or consequential damages.

6. TERMINATION
   - Either party may terminate with 30 days written notice.
   - Payment for completed work is due upon termination.

7. GOVERNING LAW
   - These terms are governed by the laws of the State of North Carolina.
   - Disputes will be resolved through binding arbitration.`,
        isDefault: true,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: 'Enterprise Terms',
        description: 'Extended terms for enterprise accounts',
        content: `ENTERPRISE TERMS AND CONDITIONS

1. PAYMENT TERMS
   - Payment is due within 45 days of invoice date for enterprise accounts.
   - Net 45 terms available for qualified accounts.
   - Volume discounts apply for annual commitments.

2. SERVICE LEVEL AGREEMENTS
   - 99.9% uptime guarantee for software services.
   - 4-hour response time for critical support issues.
   - Dedicated account manager for enterprise clients.

3. CUSTOM WORK
   - Custom development work requires separate statement of work.
   - Intellectual property rights negotiable for custom work.
   - Change requests may incur additional charges.

4. SUPPORT AND MAINTENANCE
   - Included support hours as specified in agreement.
   - Extended support available for additional fees.
   - Regular maintenance windows scheduled with advance notice.

5. DATA AND SECURITY
   - Enterprise-grade security measures in place.
   - Data backup and disaster recovery procedures.
   - Compliance with industry standards (SOC 2, ISO 27001).

6. RENEWAL AND TERMINATION
   - Annual agreements auto-renew unless terminated 60 days prior.
   - Termination fees may apply for early termination.
   - Transition assistance available upon request.`,
        isDefault: false,
        accountIds: acmeId && globexId ? [acmeId, globexId] : [],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: 'Software License Terms',
        description: 'Terms specific to software license agreements',
        content: `SOFTWARE LICENSE AGREEMENT

1. LICENSE GRANT
   - License is non-exclusive and non-transferable.
   - License is valid for the subscription period specified.
   - Number of users/licenses as specified in agreement.

2. RESTRICTIONS
   - Software may not be reverse engineered, decompiled, or disassembled.
   - Software may not be redistributed or sublicensed.
   - Unauthorized use may result in immediate termination.

3. UPDATES AND MAINTENANCE
   - Updates and maintenance included during subscription period.
   - Major version upgrades may require separate agreement.
   - Support for previous versions limited to 12 months.

4. SUBSCRIPTION AND RENEWAL
   - Subscription fees are billed annually or monthly as agreed.
   - Auto-renewal unless cancelled 30 days before renewal date.
   - Price adjustments may apply upon renewal.

5. DATA OWNERSHIP
   - Customer owns all data entered into the system.
   - We provide data export capabilities.
   - Data retention policies as specified in agreement.

6. TERMINATION
   - Either party may terminate for material breach.
   - Upon termination, access to software will cease.
   - Data export available for 30 days post-termination.`,
        isDefault: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: 'Professional Services Terms',
        description: 'Terms for consulting and professional services',
        content: `PROFESSIONAL SERVICES AGREEMENT

1. SCOPE OF WORK
   - Services described in statement of work or proposal.
   - Changes to scope require written agreement and may affect pricing.
   - Client is responsible for timely feedback and approvals.

2. FEES AND EXPENSES
   - Fees as specified in proposal or statement of work.
   - Travel and expenses billed separately with prior approval.
   - Time and materials work billed at standard hourly rates.

3. DELIVERABLES
   - Deliverables specified in statement of work.
   - Client has 30 days to review and request revisions.
   - Final acceptance required for completion.

4. CONFIDENTIALITY
   - Both parties agree to maintain confidentiality.
   - Confidential information marked as such.
   - Obligations survive termination of agreement.

5. INTELLECTUAL PROPERTY
   - Work product licensed to client upon payment.
   - Pre-existing intellectual property retained by provider.
   - Client retains rights to their proprietary information.

6. WARRANTIES AND DISCLAIMERS
   - Services performed in professional manner.
   - No guarantees of specific results or outcomes.
   - Standard industry practices will be followed.

7. TERMINATION
   - Either party may terminate with 30 days notice.
   - Payment due for work completed through termination date.
   - Return of materials and confidential information required.`,
        isDefault: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ])
    const insertedCount = await db.collection('custom_terms').countDocuments()
    console.log(`Seeded ${insertedCount} custom terms`)
  } else {
    console.log(`Terms collection already has ${termsCount} items, skipping seed`)
  }

  console.log('Seeded sample data')
  await client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


