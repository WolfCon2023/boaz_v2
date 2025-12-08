# 🚀 Post-Deployment Tasks

After deploying to Railway, run these scripts to complete the setup:

## 1️⃣ Add IT Roles to Database

```bash
npx tsx apps/api/src/scripts/add_it_roles.ts
```

**What it does:**
- Adds `it` role with support, assets, vendors, KB permissions
- Adds `it_manager` role with IT permissions + approvals + oversight
- Safe to run multiple times (skips if roles exist)

**Expected output:**
```
✅ IT role added successfully
✅ IT Manager role added successfully
📋 Current roles in database:
   - admin (1 permissions)
   - manager (3 permissions)
   - staff (1 permissions)
   - customer (0 permissions)
   - it (13 permissions)
   - it_manager (21 permissions)
```

---

## 2️⃣ Add Roles & Permissions KB Article

```bash
npx tsx apps/api/src/scripts/seed_roles_kb.ts
```

**What it does:**
- Creates comprehensive KB article explaining all roles
- Includes permission matrix and best practices
- Updates if article already exists

**Expected output:**
```
✅ Article created successfully
📋 Article Details:
   - Title: User Roles & Permissions Guide
   - Category: Administration
   - Slug: user-roles-permissions
```

**Access at:** `/apps/crm/support/kb/user-roles-permissions`

---

## 3️⃣ (Optional) Remove Problematic Customer Portal User

If you have a customer portal user that needs to be removed:

```bash
npx tsx apps/api/src/scripts/cleanup_customer_portal_user.ts <email@example.com>
```

**What it does:**
- Finds user by email
- Displays user details
- Deletes user from database

---

## ✅ Verification Checklist

After running scripts:

### **Check Roles:**
1. Go to Admin Portal
2. Click "Users" tab
3. Try to edit a user's role
4. Verify "IT" and "IT Manager" appear in dropdown

### **Check KB Article:**
1. Go to Admin Portal
2. Click "Roles Guide" button (top right)
3. Verify article displays correctly
4. Or navigate to: `/apps/crm/support/kb/user-roles-permissions`

### **Check Customer Portal:**
1. Go to Admin Portal
2. Click "Customer Portal Users" button
3. Verify page loads correctly
4. Try creating a test customer user

---

## 🎯 What Changed

### **Roles Added:**
- ✅ `it` - Technical support and asset management
- ✅ `it_manager` - IT oversight with approvals

### **Roles Preserved:**
- ✅ `admin` - Full system access (unchanged)
- ✅ `manager` - User management (unchanged)
- ✅ `staff` - Basic access (unchanged)
- ✅ `customer` - Legacy/unused (unchanged)

### **New Features:**
- ✅ Comprehensive Roles & Permissions KB article
- ✅ "Roles Guide" link in Admin Portal
- ✅ Customer Portal Users management page
- ✅ Cleanup script for customer portal users

---

## 📞 Support

If you encounter any issues:
1. Check Railway logs for errors
2. Verify MONGO_URL environment variable is set
3. Ensure database connection is working
4. Contact system administrator

---

**Last Updated:** December 2024

