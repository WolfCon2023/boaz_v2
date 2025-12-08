# Data Seeding Guide

## ✅ **Problem Solved**

Running migration scripts locally was failing because:
1. `railway run` executes locally but loads Railway environment variables
2. The MongoDB URL (`mongodb.railway.internal`) is only accessible **within Railway's network**
3. Local machines cannot resolve `mongodb.railway.internal`

## 🎯 **Solution: Admin API Endpoints**

Instead of running scripts locally, we created **admin API endpoints** that run **on Railway** where MongoDB is accessible.

---

## 📋 **How to Use**

### **Step 1: Deploy** ✅ (Already Done)
The code has been pushed and Railway is deploying.

### **Step 2: Access the Admin Seeding Page**
1. Log in to BOAZ-OS as an **admin** user
2. Go to **Admin Portal** (`/admin`)
3. Click the **"Seed Data"** button in the header
4. You'll see the **Data Seeding Tools** page

### **Step 3: Seed IT Roles**
1. Click **"Seed IT Roles"** button
2. Wait for the success message
3. The system will show:
   - IT Role: created/skipped
   - IT Manager Role: created/skipped
   - Total roles in the system

### **Step 4: Seed KB Article**
1. Click **"Seed KB Article"** button
2. Wait for the success message
3. Click the link to view the article at `/apps/crm/support/kb/user-roles-permissions`

---

## 🔧 **What Was Created**

### Backend (`apps/api/src/admin/seed_data.ts`)
New admin router with three endpoints:
- `POST /api/admin/seed/it-roles` - Add IT and IT Manager roles
- `POST /api/admin/seed/roles-kb` - Create/update Roles & Permissions KB article
- `DELETE /api/admin/customer-portal-user/:email` - Remove problematic customer users

### Frontend (`apps/web/src/pages/AdminDataSeeding.tsx`)
New admin page with:
- One-click buttons to trigger seeding
- Real-time status indicators
- Success messages with details
- Safe to run multiple times (checks for existing data)

### Routes
- Added `/admin/seed-data` route
- Added "Seed Data" button in Admin Portal header

---

## 🛡️ **Security**

- All endpoints require authentication (`requireAuth`)
- All endpoints require admin permission (`requirePermission('*')`)
- Only admins can access the seeding tools

---

## ✨ **Benefits**

1. ✅ **No local environment setup needed**
2. ✅ **Runs on Railway where MongoDB is accessible**
3. ✅ **User-friendly UI with one-click buttons**
4. ✅ **Safe to run multiple times**
5. ✅ **Real-time feedback and success messages**
6. ✅ **No command line knowledge required**

---

## 📝 **Notes**

- The seeding operations are **idempotent** (safe to run multiple times)
- Existing data is not overwritten
- The system checks for existing roles/articles before inserting
- All operations run server-side on Railway

---

## 🎉 **Next Steps**

Once Railway finishes deploying:
1. Go to `/admin/seed-data`
2. Click "Seed IT Roles"
3. Click "Seed KB Article"
4. Verify in Admin Portal that IT and IT Manager roles appear in the role dropdown
5. Visit `/apps/crm/support/kb/user-roles-permissions` to see the KB article

**This approach eliminates all the local MongoDB connection issues!** 🚀

