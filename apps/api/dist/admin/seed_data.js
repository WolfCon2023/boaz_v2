/**
 * Admin API: Seed Data Endpoints
 *
 * Allows admins to trigger data seeding via API calls
 * Runs on Railway where MongoDB is accessible
 */
import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth, requirePermission } from '../auth/rbac.js';
export const adminSeedDataRouter = Router();
// All routes require admin permission
adminSeedDataRouter.use(requireAuth);
adminSeedDataRouter.use(requirePermission('*'));
// POST /api/admin/seed/it-roles - Add IT and IT Manager roles
adminSeedDataRouter.post('/it-roles', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const IT_ROLE = {
            name: 'it',
            permissions: [
                'support.read', 'support.write', 'kb.read', 'kb.write',
                'assets.read', 'assets.write', 'vendors.read', 'vendors.write',
                'projects.read', 'slas.read', 'contacts.read', 'accounts.read', 'products.read',
            ],
        };
        const IT_MANAGER_ROLE = {
            name: 'it_manager',
            permissions: [
                'support.read', 'support.write', 'kb.read', 'kb.write',
                'assets.read', 'assets.write', 'vendors.read', 'vendors.write',
                'projects.read', 'slas.read', 'slas.write', 'contacts.read',
                'accounts.read', 'products.read', 'users.read', 'roles.read',
                'quotes.read', 'quotes.approve', 'invoices.read', 'deals.read', 'renewals.read',
            ],
        };
        const results = { it: 'skipped', it_manager: 'skipped' };
        // Check if IT role exists
        const itRoleExists = await db.collection('roles').findOne({ name: 'it' });
        if (!itRoleExists) {
            await db.collection('roles').insertOne(IT_ROLE);
            results.it = 'created';
        }
        // Check if IT Manager role exists
        const itManagerRoleExists = await db.collection('roles').findOne({ name: 'it_manager' });
        if (!itManagerRoleExists) {
            await db.collection('roles').insertOne(IT_MANAGER_ROLE);
            results.it_manager = 'created';
        }
        // Get all roles
        const allRoles = await db.collection('roles').find({}).toArray();
        res.json({
            data: {
                message: 'IT roles seeded successfully',
                results,
                totalRoles: allRoles.length,
                roles: allRoles.map((r) => ({ name: r.name, permissions: r.permissions.length })),
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed IT roles error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_roles' });
    }
});
// POST /api/admin/seed/roles-kb - Add Roles & Permissions KB article
adminSeedDataRouter.post('/roles-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
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

---

## ❓ **Common Questions**

### **Can a user have multiple roles?**
Yes! Users can be assigned multiple roles. Their permissions are combined (union of all role permissions).

### **What happens if a user has no role?**
They can login but will have no access to any applications or data (except their own profile).

### **What's the difference between IT and IT Manager?**
IT handles day-to-day support and asset management. IT Manager adds oversight, approvals, and team management capabilities.

---

**Last Updated:** December 2024  
**Version:** 2.0
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        // Check if article already exists
        const existingArticle = await db.collection('kb_articles').findOne({ slug: 'user-roles-permissions' });
        const result = existingArticle ? 'updated' : 'created';
        if (existingArticle) {
            await db.collection('kb_articles').updateOne({ slug: 'user-roles-permissions' }, { $set: { ...ROLES_KB_ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(ROLES_KB_ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: ROLES_KB_ARTICLE.title,
                slug: ROLES_KB_ARTICLE.slug,
                url: `/apps/crm/support/kb/${ROLES_KB_ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed roles KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// DELETE /api/admin/customer-portal-users/:email - Remove customer by email
adminSeedDataRouter.delete('/customer-portal-user/:email', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const email = req.params.email.toLowerCase();
        const user = await db.collection('customer_portal_users').findOne({ email });
        if (!user) {
            return res.status(404).json({ data: null, error: 'user_not_found' });
        }
        const userInfo = {
            id: user._id.toHexString(),
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified || false,
            createdAt: user.createdAt,
        };
        await db.collection('customer_portal_users').deleteOne({ _id: user._id });
        res.json({
            data: {
                message: 'User deleted successfully',
                deletedUser: userInfo,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Delete customer portal user error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_delete_user' });
    }
});
