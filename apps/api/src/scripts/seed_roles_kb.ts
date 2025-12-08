/**
 * Seed Knowledge Base: Roles & Permissions Guide
 * 
 * Creates a comprehensive KB article explaining all system roles
 * 
 * Usage:
 *   npx tsx apps/api/src/scripts/seed_roles_kb.ts
 *   Or with connection string:
 *   MONGO_URL="mongodb+srv://..." npx tsx apps/api/src/scripts/seed_roles_kb.ts
 */

import { MongoClient } from 'mongodb'

async function getDb() {
  const mongoUrl = process.env.MONGO_URL
  if (!mongoUrl) {
    console.error('❌ MONGO_URL environment variable is not set')
    console.log('\nUsage:')
    console.log('  MONGO_URL="mongodb+srv://your-connection-string" npx tsx apps/api/src/scripts/seed_roles_kb.ts')
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

const ROLES_KB_ARTICLE = {
  title: 'User Roles & Permissions Guide',
  category: 'Administration',
  slug: 'user-roles-permissions',
  tags: ['admin', 'roles', 'permissions', 'security', 'access control'],
  body: `# User Roles & Permissions Guide

This guide explains all user roles in BOAZ-OS and their permissions.

---

## 🛡️ **Role Overview**

BOAZ-OS uses a role-based access control (RBAC) system. Each user can be assigned one or more roles that determine what they can access and do within the system.

---

## 👥 **Internal User Roles**

### **1. Admin** 🔑
**Full System Access**

**Permissions:** All permissions (*)

**What they can do:**
- ✅ Everything - complete system control
- ✅ Manage users and roles
- ✅ Access all applications
- ✅ Approve all requests
- ✅ System configuration
- ✅ View all data across all modules

**Best for:** System administrators, business owners, IT directors

---

### **2. Manager** 👔
**Team & User Management**

**Permissions:**
- users.read
- users.write
- roles.read

**What they can do:**
- ✅ View and manage users
- ✅ Assign roles to team members
- ✅ View role definitions
- ✅ Access granted applications

**What they cannot do:**
- ❌ Create or modify roles
- ❌ Access financial data (unless granted separately)
- ❌ System configuration

**Best for:** Department managers, team leads, HR managers

---

### **3. IT** 🔧
**Technical Support & Asset Management**

**Permissions:**
- support.read, support.write
- kb.read, kb.write
- assets.read, assets.write
- vendors.read, vendors.write
- projects.read
- slas.read
- contacts.read
- accounts.read
- products.read

**What they can do:**
- ✅ Handle support tickets
- ✅ Manage knowledge base
- ✅ Track and manage assets/installed base
- ✅ Manage vendor relationships
- ✅ View projects, contacts, and accounts (read-only)
- ✅ View SLAs and products

**What they cannot do:**
- ❌ Approve quotes or deals
- ❌ Manage users
- ❌ Access financial data
- ❌ Send marketing campaigns

**Best for:** IT support specialists, help desk agents, systems administrators

---

### **4. IT Manager** 💼
**IT Oversight & Technical Approvals**

**Permissions:**
- All IT permissions, PLUS:
- slas.write
- users.read
- roles.read
- quotes.read, quotes.approve
- invoices.read
- deals.read
- renewals.read

**What they can do:**
- ✅ Everything IT can do
- ✅ Manage SLAs
- ✅ View and manage IT team members
- ✅ Approve IT-related quotes (equipment, software, services)
- ✅ View deals, invoices, and renewals for planning
- ✅ Access to broader business context

**What they cannot do:**
- ❌ Modify user permissions
- ❌ Create or edit deals/invoices
- ❌ Access marketing campaigns

**Best for:** IT managers, IT directors, technical leads

---

### **5. Staff** 📋
**Basic User Access**

**Permissions:**
- users.read

**What they can do:**
- ✅ View user directory
- ✅ Access granted applications

**What they cannot do:**
- ❌ Modify any data
- ❌ Access sensitive information

**Best for:** General employees, contractors with limited access

---

### **6. Customer** 🌐
**External Customer Portal Access**

**Permissions:** None (separate authentication system)

**Note:** This role is legacy and unused. External customers use the **Customer Portal** system with separate authentication.

**Customer Portal users can:**
- ✅ View their invoices
- ✅ Create and view support tickets
- ✅ View contracts/quotes
- ✅ Add comments to tickets

**Managed in:** Admin Portal → Customer Portal Users

---

## 🔐 **Permission Types**

### **Read Permissions**
- View data in specific modules
- Examples: \`support.read\`, \`contacts.read\`

### **Write Permissions**
- Create and edit data in specific modules
- Examples: \`support.write\`, \`assets.write\`

### **Approve Permissions**
- Approve requests (quotes, deals, etc.)
- Examples: \`quotes.approve\`, \`deals.approve\`

### **Wildcard Permission**
- \`*\` grants all permissions (admin only)

---

## 📊 **Role Comparison Matrix**

| Feature | Admin | Manager | IT | IT Manager | Staff |
|---------|:-----:|:-------:|:--:|:----------:|:-----:|
| **User Management** | ✅ Full | ✅ Full | ❌ | 👁️ Read | 👁️ Read |
| **Support Tickets** | ✅ | ❌ | ✅ Full | ✅ Full | ❌ |
| **Assets & Vendors** | ✅ | ❌ | ✅ Full | ✅ Full | ❌ |
| **Knowledge Base** | ✅ | ❌ | ✅ Full | ✅ Full | ❌ |
| **Approve Quotes** | ✅ All | ❌ | ❌ | ✅ IT Only | ❌ |
| **SLA Management** | ✅ | ❌ | 👁️ Read | ✅ Full | ❌ |
| **View Deals** | ✅ | 👁️ Read* | ❌ | 👁️ Read | ❌ |
| **Projects** | ✅ | 👁️ Read* | 👁️ Read | 👁️ Read | ❌ |
| **System Config** | ✅ | ❌ | ❌ | ❌ | ❌ |

*If application access granted

---

## 🔧 **Managing Roles**

### **Assigning Roles to Users**
1. Go to **Admin Portal**
2. Click **Users** tab
3. Find the user
4. Click **Edit Role**
5. Select appropriate role(s)
6. Save

### **Creating Custom Roles**
Admins can create custom roles with specific permission sets:
1. Go to **Admin Portal**
2. Contact your system administrator
3. Custom roles can be defined in the system

---

## 🚨 **Best Practices**

### **Least Privilege Principle**
- ✅ Assign the minimum permissions needed
- ✅ Review role assignments quarterly
- ✅ Remove access when no longer needed

### **Separation of Duties**
- ✅ Don't assign conflicting roles to the same user
- ✅ Financial approval should be separate from creation
- ✅ IT should not approve their own purchases (use IT Manager)

### **Regular Audits**
- ✅ Review active sessions (Admin Portal → Sessions)
- ✅ Check last login times
- ✅ Revoke unused accounts
- ✅ Monitor approval activities

---

## ❓ **Common Questions**

### **Can a user have multiple roles?**
Yes! Users can be assigned multiple roles. Their permissions are combined (union of all role permissions).

### **What happens if a user has no role?**
They can login but will have no access to any applications or data (except their own profile).

### **How do I request access to a specific application?**
Submit an application access request through **Admin Portal → Access Management**.

### **Can roles be customized?**
Yes, administrators with \`roles.write\` permission can create and modify roles.

### **What's the difference between IT and IT Manager?**
IT handles day-to-day support and asset management. IT Manager adds oversight, approvals, and team management capabilities.

---

## 📞 **Need Help?**

- **Role Questions:** Contact your system administrator
- **Access Issues:** Submit a ticket to Help Desk
- **Custom Role Requests:** Contact IT Management

---

**Last Updated:** December 2024  
**Version:** 2.0
`,
  status: 'published',
  createdAt: new Date(),
  updatedAt: new Date(),
  author: 'System',
  views: 0,
}

async function seedRolesKB() {
  console.log('📚 Seeding Roles & Permissions KB article...')

  const db = await getDb()
  if (!db) {
    console.error('❌ Database not available')
    process.exit(1)
  }

  try {
    // Check if article already exists
    const existingArticle = await db.collection('kb_articles').findOne({ slug: 'user-roles-permissions' })
    
    if (existingArticle) {
      console.log('ℹ️  Article already exists, updating...')
      await db.collection('kb_articles').updateOne(
        { slug: 'user-roles-permissions' },
        { $set: { ...ROLES_KB_ARTICLE, updatedAt: new Date() } }
      )
      console.log('✅ Article updated successfully')
    } else {
      await db.collection('kb_articles').insertOne(ROLES_KB_ARTICLE as any)
      console.log('✅ Article created successfully')
    }

    console.log('\n📋 Article Details:')
    console.log(`   - Title: ${ROLES_KB_ARTICLE.title}`)
    console.log(`   - Category: ${ROLES_KB_ARTICLE.category}`)
    console.log(`   - Slug: ${ROLES_KB_ARTICLE.slug}`)
    console.log(`   - Tags: ${ROLES_KB_ARTICLE.tags.join(', ')}`)

    console.log('\n✅ KB article seeded successfully!')
    console.log('🔗 Access at: /apps/crm/support/kb/user-roles-permissions')
  } catch (err) {
    console.error('❌ Error:', err)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

seedRolesKB()

