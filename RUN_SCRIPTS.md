# 🚀 Running Migration Scripts

## Simple Usage (Like Before!)

Just run the scripts directly - they'll use your Railway MongoDB connection from environment variables:

```bash
# Add IT roles
npx tsx apps/api/src/scripts/add_it_roles.ts

# Add KB article
npx tsx apps/api/src/scripts/seed_roles_kb.ts

# (Optional) Remove problematic customer user
npx tsx apps/api/src/scripts/cleanup_customer_portal_user.ts user@example.com
```

---

## 📋 Expected Output

### **IT Roles Script:**
```
🔧 Adding IT and IT Manager roles...
✅ IT role added successfully
✅ IT Manager role added successfully

📋 Current roles in database:
   - admin (1 permissions)
   - manager (3 permissions)  
   - staff (1 permissions)
   - customer (0 permissions)
   - it (13 permissions)
   - it_manager (21 permissions)
✅ Migration complete!
```

### **KB Article Script:**
```
📚 Seeding Roles & Permissions KB article...
✅ Article created successfully
📋 Article Details:
   - Title: User Roles & Permissions Guide
   - Category: Administration
   - Slug: user-roles-permissions
✅ KB article seeded successfully!
🔗 Access at: /apps/crm/support/kb/user-roles-permissions
```

---

## ⚙️ How It Works

The scripts automatically:
1. Load environment variables from your Railway setup
2. Connect to MongoDB using the MONGO_URL
3. Run the migration
4. Exit cleanly

---

## ✅ Verification After Running

### **1. Check Roles in Admin Portal:**
- Login to your app
- Go to Admin Portal → Users tab
- Try to edit a user's role
- Confirm "IT" and "IT Manager" appear in dropdown

### **2. Check KB Article:**
- Go to Admin Portal
- Click "Roles Guide" button (top right)
- Or navigate to: `/apps/crm/support/kb/user-roles-permissions`
- Verify article displays correctly

### **3. Check Customer Portal:**
- Go to Admin Portal
- Click "Customer Portal Users" button
- Verify page loads
- Try creating a test customer user

---

## 🆘 Troubleshooting

### **"MONGO_URL environment variable is not set"**
Your Railway environment variables aren't being loaded. Make sure you're running from the project directory.

### **"Failed to connect to database"**
Check that your MongoDB connection is working and Railway is accessible.

### **"Role already exists, skipping..."**
This is normal! The scripts are safe to run multiple times. The role is already in your database.

---

**Last Updated:** December 2024
